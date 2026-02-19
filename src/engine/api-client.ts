/**
 * Fortuna Engine — API Client
 * 
 * HTTP wrapper for the PHP backend with automatic token refresh,
 * retry logic, and error normalization.
 */

// ============================================
//  CONFIGURATION
// ============================================

const API_CONFIG_KEY = 'fortuna:api-config'

interface APIConfig {
  baseUrl: string  // e.g. "https://yourdomain.com/api"
}

function getAPIConfig(): APIConfig {
  try {
    const raw = localStorage.getItem(API_CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.baseUrl && parsed.baseUrl !== '/api') return parsed
    }
  } catch {}
  // Auto-detect: same origin + /api
  return { baseUrl: `${window.location.origin}/api` }
}

export function setAPIBaseUrl(url: string): void {
  localStorage.setItem(API_CONFIG_KEY, JSON.stringify({ baseUrl: url.replace(/\/$/, '') }))
}

export function getAPIBaseUrl(): string {
  return getAPIConfig().baseUrl
}

// ============================================
//  TOKEN MANAGEMENT
// ============================================

const TOKEN_KEYS = {
  ACCESS: 'fortuna:access-token',
  REFRESH: 'fortuna:refresh-token',
  USER: 'fortuna:user',
} as const

export interface AuthUser {
  uuid: string
  email: string
  display_name: string | null
  created_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export function getStoredTokens(): { access: string | null; refresh: string | null } {
  return {
    access: localStorage.getItem(TOKEN_KEYS.ACCESS),
    refresh: localStorage.getItem(TOKEN_KEYS.REFRESH),
  }
}

export function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_KEYS.ACCESS, tokens.access_token)
  localStorage.setItem(TOKEN_KEYS.REFRESH, tokens.refresh_token)
}

export function storeUser(user: AuthUser): void {
  localStorage.setItem(TOKEN_KEYS.USER, JSON.stringify(user))
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS.USER)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearAuthData(): void {
  localStorage.removeItem(TOKEN_KEYS.ACCESS)
  localStorage.removeItem(TOKEN_KEYS.REFRESH)
  localStorage.removeItem(TOKEN_KEYS.USER)
}

// ============================================
//  API ERROR CLASS
// ============================================

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'APIError'
  }
}

// ============================================
//  CORE HTTP METHODS
// ============================================

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

async function refreshAccessToken(): Promise<string | null> {
  const { refresh } = getStoredTokens()
  if (!refresh) return null

  try {
    const config = getAPIConfig()
    const res = await fetch(`${config.baseUrl}/auth.php?action=refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    })

    if (!res.ok) {
      clearAuthData()
      return null
    }

    const data = await res.json()
    if (data.success && data.tokens) {
      storeTokens(data.tokens)
      return data.tokens.access_token
    }
    
    clearAuthData()
    return null
  } catch {
    return null
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const { access } = getStoredTokens()
  if (!access) return null

  // Quick JWT expiry check (decode payload without verification)
  try {
    const payload = JSON.parse(atob(access.split('.')[1]))
    const expiresAt = payload.exp * 1000
    const bufferMs = 60_000 // Refresh 1 min before expiry
    
    if (Date.now() < expiresAt - bufferMs) {
      return access // Still valid
    }
  } catch {
    // Can't parse - try refresh
  }

  // Token expired or about to expire - refresh it
  if (isRefreshing) {
    // Wait for ongoing refresh
    return new Promise(resolve => {
      refreshQueue.push(resolve)
    })
  }

  isRefreshing = true
  const newToken = await refreshAccessToken()
  isRefreshing = false

  // Resolve queued requests
  refreshQueue.forEach(resolve => resolve(newToken || ''))
  refreshQueue = []

  return newToken
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  auth?: boolean
  retries?: number
}

async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, auth = true, retries = 1 } = options
  const config = getAPIConfig()
  const url = `${config.baseUrl}/${endpoint}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = await getValidAccessToken()
    if (!token) {
      throw new APIError('Not authenticated', 401, 'AUTH_REQUIRED')
    }
    headers['Authorization'] = `Bearer ${token}`
  }

  const fetchOptions: RequestInit = { method, headers }
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body)
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, fetchOptions)
      
      // Handle 401 - try token refresh once
      if (res.status === 401 && auth && attempt === 0) {
        const newToken = await refreshAccessToken()
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`
          continue // Retry with new token
        }
        throw new APIError('Session expired. Please log in again.', 401, 'TOKEN_EXPIRED')
      }

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new APIError(
          data.message || `Request failed (${res.status})`,
          res.status,
          data.code
        )
      }

      return data as T
    } catch (e) {
      if (e instanceof APIError) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
      
      // Only retry on network errors
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw new APIError(
    lastError?.message || 'Network error - check your connection',
    0,
    'NETWORK_ERROR'
  )
}

// ============================================
//  AUTH API
// ============================================

export const AuthAPI = {
  async register(email: string, password: string, displayName?: string) {
    const data = await apiRequest<{
      success: boolean
      user: AuthUser
      tokens: AuthTokens
    }>('auth.php?action=register', {
      method: 'POST',
      body: { email, password, display_name: displayName },
      auth: false,
    })
    storeTokens(data.tokens)
    storeUser(data.user)
    return data
  },

  async login(email: string, password: string) {
    const data = await apiRequest<{
      success: boolean
      user: AuthUser
      tokens: AuthTokens
    }>('auth.php?action=login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    storeTokens(data.tokens)
    storeUser(data.user)
    return data
  },

  async logout(allDevices = false) {
    const { refresh } = getStoredTokens()
    try {
      await apiRequest('auth.php?action=logout', {
        method: 'POST',
        body: { refresh_token: refresh, all_devices: allDevices },
      })
    } catch {
      // Logout locally even if API fails
    }
    clearAuthData()
  },

  async getProfile() {
    return apiRequest<{ user: AuthUser; state_meta: any }>('auth.php?action=me')
  },

  async updateProfile(updates: { display_name?: string; email?: string; current_password?: string; new_password?: string }) {
    return apiRequest('auth.php?action=update', {
      method: 'PUT',
      body: updates,
    })
  },
}

// ============================================
//  STATE SYNC API
// ============================================

export const StateAPI = {
  async load() {
    return apiRequest<{
      state: any
      version: number
      checksum: string | null
      last_synced_at: string | null
      is_new?: boolean
    }>('state.php')
  },

  async save(state: any, expectedVersion?: number, force = false) {
    return apiRequest<{
      version: number
      checksum: string
      synced_at: string
      skipped?: boolean
    }>('state.php', {
      method: 'POST',
      body: { state, expected_version: expectedVersion, force },
    })
  },

  async getMeta() {
    return apiRequest<{
      version: number
      checksum: string | null
      last_synced_at: string | null
    }>('state.php?action=meta')
  },

  async merge(localState: any, localTimestamp?: string) {
    return apiRequest<{
      resolution: 'local_wins' | 'remote_wins' | 'merged'
      state: any
      version: number
      message: string
    }>('state.php?action=merge', {
      method: 'POST',
      body: { local_state: localState, local_timestamp: localTimestamp },
    })
  },

  async listSnapshots() {
    return apiRequest<{
      snapshots: Array<{
        id: number
        state_version: number
        snapshot_reason: string
        created_at: string
      }>
    }>('state.php?action=snapshots')
  },

  async createSnapshot(reason = 'manual') {
    return apiRequest('state.php?action=snapshot', {
      method: 'POST',
      body: { reason },
    })
  },

  async restoreSnapshot(id: number) {
    return apiRequest<{
      state: any
      restored_from_version: number
    }>(`state.php?action=restore&id=${id}`)
  },
}

// ============================================
//  CONNECTION TEST
// ============================================

export async function testAPIConnection(baseUrl?: string): Promise<{
  connected: boolean
  latency: number
  error?: string
}> {
  const url = (baseUrl || getAPIConfig().baseUrl).replace(/\/$/, '')
  const start = performance.now()
  
  try {
    const res = await fetch(`${url}/auth.php?action=me`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    const latency = Math.round(performance.now() - start)
    
    // We expect 401 (no token) — that proves the API is alive
    if (res.status === 401 || res.status === 200) {
      return { connected: true, latency }
    }
    
    return { connected: false, latency, error: `Unexpected status: ${res.status}` }
  } catch (e) {
    const latency = Math.round(performance.now() - start)
    return { connected: false, latency, error: e instanceof Error ? e.message : 'Connection failed' }
  }
}

// ============================================
//  CHECK AUTH STATE
// ============================================

export function isAuthenticated(): boolean {
  const { access } = getStoredTokens()
  if (!access) return false
  
  try {
    const payload = JSON.parse(atob(access.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export function hasRefreshToken(): boolean {
  return !!getStoredTokens().refresh
}
