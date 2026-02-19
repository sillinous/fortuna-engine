/**
 * Fortuna Engine - API Cache Layer
 * In-memory + localStorage cache with TTL, rate limiting, and retry logic.
 * Prevents redundant API calls and provides graceful degradation.
 *
 * @module api-cache
 */

// ─── Cache Entry ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // milliseconds
  source: string
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitState {
  requests: number[]
}

// ─── API Cache ────────────────────────────────────────────────────────────

class APICache {
  private memoryCache = new Map<string, CacheEntry<unknown>>()
  private rateLimits = new Map<string, RateLimitState>()
  private rateLimitConfigs = new Map<string, RateLimitConfig>()

  constructor() {
    // Default rate limits per API provider
    this.rateLimitConfigs.set('bls', { maxRequests: 20, windowMs: 60_000 })
    this.rateLimitConfigs.set('fred', { maxRequests: 100, windowMs: 60_000 })
    this.rateLimitConfigs.set('treasury', { maxRequests: 50, windowMs: 60_000 })
    this.rateLimitConfigs.set('exchange', { maxRequests: 30, windowMs: 60_000 })
    this.rateLimitConfigs.set('alphavantage', { maxRequests: 5, windowMs: 60_000 }) // Free tier: 5/min
    this.rateLimitConfigs.set('sec', { maxRequests: 10, windowMs: 60_000 })
  }

  /** Get cached data, returning null if expired or missing */
  get<T>(key: string): T | null {
    // Check memory first
    const memEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined
    if (memEntry && Date.now() - memEntry.timestamp < memEntry.ttl) {
      return memEntry.data
    }

    // Check localStorage
    try {
      const stored = localStorage.getItem(`fortuna_api_${key}`)
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored)
        if (Date.now() - entry.timestamp < entry.ttl) {
          // Promote to memory cache
          this.memoryCache.set(key, entry)
          return entry.data
        }
        // Expired — remove
        localStorage.removeItem(`fortuna_api_${key}`)
      }
    } catch { /* localStorage unavailable */ }

    return null
  }

  /** Store data with TTL */
  set<T>(key: string, data: T, ttlMs: number, source: string): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
      source,
    }

    this.memoryCache.set(key, entry as CacheEntry<unknown>)

    try {
      localStorage.setItem(`fortuna_api_${key}`, JSON.stringify(entry))
    } catch { /* localStorage full or unavailable */ }
  }

  /** Check if a request is allowed under rate limits */
  canRequest(provider: string): boolean {
    const config = this.rateLimitConfigs.get(provider)
    if (!config) return true

    const state = this.rateLimits.get(provider) || { requests: [] }
    const now = Date.now()
    // Remove old requests outside window
    state.requests = state.requests.filter(t => now - t < config.windowMs)
    this.rateLimits.set(provider, state)

    return state.requests.length < config.maxRequests
  }

  /** Record a request for rate limiting */
  recordRequest(provider: string): void {
    const state = this.rateLimits.get(provider) || { requests: [] }
    state.requests.push(Date.now())
    this.rateLimits.set(provider, state)
  }

  /** Clear all caches */
  clear(): void {
    this.memoryCache.clear()
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('fortuna_api_'))
      keys.forEach(k => localStorage.removeItem(k))
    } catch { /* */ }
  }

  /** Get cache stats */
  getStats(): { memoryEntries: number; providers: string[] } {
    return {
      memoryEntries: this.memoryCache.size,
      providers: Array.from(this.rateLimitConfigs.keys()),
    }
  }
}

export const apiCache = new APICache()

// ─── Fetch with retry + cache ─────────────────────────────────────────────

export interface FetchOptions {
  cacheKey: string
  cacheTTL: number // milliseconds
  provider: string
  retries?: number
  timeout?: number // milliseconds
  headers?: Record<string, string>
}

/**
 * Cached fetch with rate limiting, retry, and timeout.
 * Returns cached data if available, otherwise fetches and caches.
 */
export async function cachedFetch<T>(url: string, options: FetchOptions): Promise<T | null> {
  // Check cache first
  const cached = apiCache.get<T>(options.cacheKey)
  if (cached !== null) return cached

  // Check rate limit
  if (!apiCache.canRequest(options.provider)) {
    console.warn(`[API] Rate limit reached for ${options.provider}`)
    return null
  }

  const retries = options.retries ?? 2
  const timeout = options.timeout ?? 10_000

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      apiCache.recordRequest(options.provider)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: options.headers || {},
      })
      clearTimeout(timer)

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited by server — back off
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
          continue
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json() as T
      apiCache.set(options.cacheKey, data, options.cacheTTL, options.provider)
      return data
    } catch (err) {
      if (attempt === retries) {
        console.error(`[API] ${options.provider} failed after ${retries + 1} attempts:`, err)
        return null
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }

  return null
}

/** Fetch CSV data (for FRED CSV endpoints) */
export async function cachedFetchCSV(url: string, options: FetchOptions): Promise<string[][] | null> {
  const cached = apiCache.get<string[][]>(options.cacheKey)
  if (cached !== null) return cached

  if (!apiCache.canRequest(options.provider)) return null

  try {
    apiCache.recordRequest(options.provider)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeout ?? 10_000)

    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (!response.ok) return null

    const text = await response.text()
    const rows = text.trim().split('\n').map(line => line.split(','))
    apiCache.set(options.cacheKey, rows, options.cacheTTL, options.provider)
    return rows
  } catch {
    return null
  }
}

// TTL constants
export const TTL = {
  MINUTES_5: 5 * 60_000,
  MINUTES_30: 30 * 60_000,
  HOUR_1: 60 * 60_000,
  HOURS_6: 6 * 60 * 60_000,
  HOURS_12: 12 * 60 * 60_000,
  DAY_1: 24 * 60 * 60_000,
  WEEK_1: 7 * 24 * 60 * 60_000,
}
