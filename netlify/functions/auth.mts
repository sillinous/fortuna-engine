/**
 * Fortuna Engine — Auth API (Netlify Serverless Function)
 * 
 * Replaces PHP auth.php with Netlify Functions + Blobs.
 * Endpoints (via ?action= query param):
 *   POST register — create account
 *   POST login    — authenticate
 *   POST logout   — invalidate refresh token
 *   POST refresh  — get new access token
 *   GET  me       — get profile
 *   PUT  update   — update profile
 *   GET  health   — health check
 */

import type { Context, Config } from "@netlify/functions"
import { getStore } from "@netlify/blobs"
import { signJWT, verifyJWT, hashPassword, verifyPassword, type JWTPayload } from "./_shared/jwt.mts"

// ---- Types ----

interface User {
  id: string
  email: string
  display_name: string | null
  password_hash: string
  created_at: string
  updated_at: string
}

interface Session {
  user_id: string
  refresh_token: string
  created_at: string
  expires_at: string
}

// ---- Helpers ----

function getSecret(): string {
  return Netlify.env.get("JWT_SECRET") || "fortuna-dev-secret-change-me"
}

function json(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function error(message: string, status = 400, code?: string): Response {
  return json({ error: true, message, code }, status)
}

function generateId(): string {
  return crypto.randomUUID()
}

async function extractUser(req: Request): Promise<JWTPayload | null> {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return verifyJWT(auth.slice(7), getSecret())
}

async function generateTokens(user: User) {
  const secret = getSecret()
  const access_token = await signJWT(
    { sub: user.id, email: user.email, type: "access" },
    secret,
    3600 // 1 hour
  )
  const refresh_token = await signJWT(
    { sub: user.id, email: user.email, type: "refresh" },
    secret,
    2592000 // 30 days
  )

  // Store refresh token
  const sessions = getStore("fortuna-sessions")
  const session: Session = {
    user_id: user.id,
    refresh_token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 2592000 * 1000).toISOString(),
  }
  await sessions.setJSON(`session:${user.id}:${generateId().slice(0, 8)}`, session)

  return {
    access_token,
    refresh_token,
    expires_in: 3600,
    token_type: "Bearer",
  }
}

function sanitizeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    created_at: user.created_at,
  }
}

// ---- Route Handlers ----

async function handleRegister(req: Request): Promise<Response> {
  const { email, password, display_name } = await req.json()

  if (!email || !password) {
    return error("Email and password are required")
  }
  if (password.length < 8) {
    return error("Password must be at least 8 characters")
  }

  const users = getStore("fortuna-users")
  const emailKey = `email:${email.toLowerCase()}`

  // Check if email exists
  const existing = await users.get(emailKey)
  if (existing) {
    return error("An account with this email already exists", 409, "EMAIL_EXISTS")
  }

  // Create user
  const user: User = {
    id: generateId(),
    email: email.toLowerCase(),
    display_name: display_name || null,
    password_hash: await hashPassword(password),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  // Store user by ID and email lookup
  await users.setJSON(`user:${user.id}`, user)
  await users.set(emailKey, user.id)

  const tokens = await generateTokens(user)

  return json({
    success: true,
    user: sanitizeUser(user),
    tokens,
  }, 201)
}

async function handleLogin(req: Request): Promise<Response> {
  const { email, password } = await req.json()

  if (!email || !password) {
    return error("Email and password are required")
  }

  const users = getStore("fortuna-users")
  const emailKey = `email:${email.toLowerCase()}`

  // Look up user by email
  const userId = await users.get(emailKey)
  if (!userId) {
    return error("Invalid email or password", 401, "INVALID_CREDENTIALS")
  }

  const user = await users.get(`user:${userId}`, { type: "json" }) as User | null
  if (!user) {
    return error("Invalid email or password", 401, "INVALID_CREDENTIALS")
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    return error("Invalid email or password", 401, "INVALID_CREDENTIALS")
  }

  const tokens = await generateTokens(user)

  return json({
    success: true,
    user: sanitizeUser(user),
    tokens,
  })
}

async function handleLogout(req: Request): Promise<Response> {
  const payload = await extractUser(req)
  if (!payload) {
    return json({ success: true }) // Logout is always "successful"
  }

  // Clean up sessions for this user
  const sessions = getStore("fortuna-sessions")
  const { blobs } = await sessions.list({ prefix: `session:${payload.sub}:` })
  for (const blob of blobs) {
    await sessions.delete(blob.key)
  }

  return json({ success: true })
}

async function handleRefresh(req: Request): Promise<Response> {
  const { refresh_token } = await req.json()
  if (!refresh_token) {
    return error("Refresh token required", 401)
  }

  const payload = await verifyJWT(refresh_token, getSecret())
  if (!payload || payload.type !== "refresh") {
    return error("Invalid or expired refresh token", 401, "TOKEN_EXPIRED")
  }

  const users = getStore("fortuna-users")
  const user = await users.get(`user:${payload.sub}`, { type: "json" }) as User | null
  if (!user) {
    return error("User not found", 401)
  }

  // Generate new access token only
  const secret = getSecret()
  const access_token = await signJWT(
    { sub: user.id, email: user.email, type: "access" },
    secret,
    3600
  )

  return json({
    success: true,
    access_token,
    expires_in: 3600,
    token_type: "Bearer",
  })
}

async function handleMe(req: Request): Promise<Response> {
  const payload = await extractUser(req)
  if (!payload) {
    return error("Not authenticated", 401, "AUTH_REQUIRED")
  }

  const users = getStore("fortuna-users")
  const user = await users.get(`user:${payload.sub}`, { type: "json" }) as User | null
  if (!user) {
    return error("User not found", 404)
  }

  // Get state metadata
  const stateStore = getStore("fortuna-state")
  const stateMeta = await stateStore.getMetadata(`state:${user.id}`)

  return json({
    user: sanitizeUser(user),
    state_meta: stateMeta?.metadata || { state_version: 0, last_synced_at: null },
  })
}

async function handleUpdate(req: Request): Promise<Response> {
  const payload = await extractUser(req)
  if (!payload) {
    return error("Not authenticated", 401, "AUTH_REQUIRED")
  }

  const updates = await req.json()
  const users = getStore("fortuna-users")
  const user = await users.get(`user:${payload.sub}`, { type: "json" }) as User | null
  if (!user) {
    return error("User not found", 404)
  }

  // Apply updates
  if (updates.display_name !== undefined) {
    user.display_name = updates.display_name
  }
  if (updates.new_password) {
    if (!updates.current_password) {
      return error("Current password required to change password")
    }
    const valid = await verifyPassword(updates.current_password, user.password_hash)
    if (!valid) {
      return error("Current password is incorrect", 401)
    }
    user.password_hash = await hashPassword(updates.new_password)
  }

  user.updated_at = new Date().toISOString()
  await users.setJSON(`user:${user.id}`, user)

  return json({ success: true, user: sanitizeUser(user) })
}

// ---- Main Handler ----

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const action = url.searchParams.get("action") || ""

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 })
  }

  // Health check
  if (action === "health") {
    return json({ status: "ok", service: "auth", version: "2.0.0-netlify" })
  }

  try {
    switch (action) {
      case "register":
        return await handleRegister(req)
      case "login":
        return await handleLogin(req)
      case "logout":
        return await handleLogout(req)
      case "refresh":
        return await handleRefresh(req)
      case "me":
        return await handleMe(req)
      case "update":
        return await handleUpdate(req)
      default:
        return error(`Unknown action: ${action}`, 400)
    }
  } catch (e) {
    console.error("[Auth]", e)
    return error("Internal server error", 500)
  }
}

export const config: Config = {
  path: "/api/auth.php",
}
