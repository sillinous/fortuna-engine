/**
 * Fortuna Engine — State Sync API (Netlify Serverless Function)
 * 
 * Replaces PHP state.php with Netlify Functions + Blobs.
 * Endpoints (via ?action= query param):
 *   POST save  — save full state
 *   GET  load  — load state
 *   POST merge — merge local/remote state
 *   GET  health — health check
 */

import type { Context, Config } from "@netlify/functions"
import { getStore } from "@netlify/blobs"
import { verifyJWT, type JWTPayload } from "./_shared/jwt.mts"

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

async function extractUser(req: Request): Promise<JWTPayload | null> {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  return verifyJWT(auth.slice(7), getSecret())
}

// ---- Route Handlers ----

async function handleSave(req: Request): Promise<Response> {
  const payload = await extractUser(req)
  if (!payload) {
    return error("Not authenticated", 401, "AUTH_REQUIRED")
  }

  const body = await req.json()
  const { state, version, force } = body

  if (!state) {
    return error("State is required")
  }

  // Check size (5MB limit)
  const stateStr = JSON.stringify(state)
  if (stateStr.length > 5 * 1024 * 1024) {
    return error("State exceeds 5MB limit", 413)
  }

  const stateStore = getStore("fortuna-state", { consistency: "strong" })
  const key = `state:${payload.sub}`

  // Check version conflict (unless force)
  if (!force && version !== undefined) {
    const existing = await stateStore.getMetadata(key)
    if (existing?.metadata) {
      const remoteVersion = (existing.metadata as any).version || 0
      if (remoteVersion > version) {
        return error("Version conflict — remote is newer", 409, "VERSION_CONFLICT")
      }
    }
  }

  const newVersion = (version || 0) + 1
  const syncedAt = new Date().toISOString()

  // Save state with metadata
  await stateStore.set(key, stateStr, {
    metadata: {
      version: newVersion,
      last_synced_at: syncedAt,
      state_size: stateStr.length,
      user_id: payload.sub,
    },
  })

  // Save snapshot (keep last 20)
  const snapshotKey = `snapshot:${payload.sub}:${Date.now()}`
  await stateStore.set(snapshotKey, stateStr, {
    metadata: { version: newVersion, created_at: syncedAt },
  })

  // Clean old snapshots (keep last 20)
  try {
    const { blobs } = await stateStore.list({ prefix: `snapshot:${payload.sub}:` })
    if (blobs.length > 20) {
      const toDelete = blobs
        .sort((a, b) => a.key.localeCompare(b.key))
        .slice(0, blobs.length - 20)
      for (const blob of toDelete) {
        await stateStore.delete(blob.key)
      }
    }
  } catch {
    // Non-critical — ignore snapshot cleanup errors
  }

  return json({
    success: true,
    version: newVersion,
    synced_at: syncedAt,
  })
}

async function handleLoad(req: Request): Promise<Response> {
  const payload = await extractUser(req)
  if (!payload) {
    return error("Not authenticated", 401, "AUTH_REQUIRED")
  }

  const stateStore = getStore("fortuna-state", { consistency: "strong" })
  const key = `state:${payload.sub}`

  const result = await stateStore.getWithMetadata(key)
  if (!result) {
    return json({
      success: true,
      state: null,
      version: 0,
      message: "No saved state found",
    })
  }

  let state
  try {
    state = typeof result.data === "string" ? JSON.parse(result.data) : result.data
  } catch {
    return error("Corrupted state data", 500)
  }

  const meta = result.metadata as any

  return json({
    success: true,
    state,
    version: meta?.version || 0,
    last_synced_at: meta?.last_synced_at || null,
  })
}

async function handleMerge(req: Request): Promise<Response> {
  const payload = await extractUser(req)
  if (!payload) {
    return error("Not authenticated", 401, "AUTH_REQUIRED")
  }

  const body = await req.json()
  const { state: localState, last_synced } = body

  if (!localState) {
    return error("Local state is required")
  }

  const stateStore = getStore("fortuna-state", { consistency: "strong" })
  const key = `state:${payload.sub}`

  const remote = await stateStore.getWithMetadata(key)

  // No remote state — local wins
  if (!remote) {
    const stateStr = JSON.stringify(localState)
    const newVersion = 1
    const syncedAt = new Date().toISOString()

    await stateStore.set(key, stateStr, {
      metadata: {
        version: newVersion,
        last_synced_at: syncedAt,
        state_size: stateStr.length,
        user_id: payload.sub,
      },
    })

    return json({
      success: true,
      resolution: "local_wins",
      version: newVersion,
      state: null, // No need to send back — local already has it
      synced_at: syncedAt,
    })
  }

  const remoteMeta = remote.metadata as any
  const remoteVersion = remoteMeta?.version || 0
  const remoteSyncedAt = remoteMeta?.last_synced_at

  let remoteState
  try {
    remoteState = typeof remote.data === "string" ? JSON.parse(remote.data) : remote.data
  } catch {
    // Corrupted remote — local wins
    const stateStr = JSON.stringify(localState)
    const newVersion = remoteVersion + 1
    const syncedAt = new Date().toISOString()
    await stateStore.set(key, stateStr, {
      metadata: { version: newVersion, last_synced_at: syncedAt, state_size: stateStr.length, user_id: payload.sub },
    })
    return json({ success: true, resolution: "local_wins", version: newVersion, state: null, synced_at: syncedAt })
  }

  // Determine winner by lastUpdated timestamp
  const localUpdated = localState.lastUpdated || "1970-01-01"
  const remoteUpdated = remoteState.lastUpdated || "1970-01-01"

  if (localUpdated >= remoteUpdated) {
    // Local wins
    const stateStr = JSON.stringify(localState)
    const newVersion = remoteVersion + 1
    const syncedAt = new Date().toISOString()
    await stateStore.set(key, stateStr, {
      metadata: { version: newVersion, last_synced_at: syncedAt, state_size: stateStr.length, user_id: payload.sub },
    })
    return json({ success: true, resolution: "local_wins", version: newVersion, state: null, synced_at: syncedAt })
  } else {
    // Remote wins — send it back
    return json({
      success: true,
      resolution: "remote_wins",
      version: remoteVersion,
      state: remoteState,
      synced_at: remoteSyncedAt,
    })
  }
}

// ---- Main Handler ----

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const action = url.searchParams.get("action") || ""

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 })
  }

  if (action === "health") {
    return json({ status: "ok", service: "state", version: "2.0.0-netlify" })
  }

  try {
    switch (action) {
      case "save":
        return await handleSave(req)
      case "load":
        return await handleLoad(req)
      case "merge":
        return await handleMerge(req)
      default:
        return error(`Unknown action: ${action}`, 400)
    }
  } catch (e) {
    console.error("[State]", e)
    return error("Internal server error", 500)
  }
}

export const config: Config = {
  path: "/api/state.php",
}
