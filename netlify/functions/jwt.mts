/**
 * Fortuna Engine — JWT Utilities (Web Crypto API)
 * Lightweight JWT sign/verify using HMAC-SHA256
 */

const encoder = new TextEncoder()

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export interface JWTPayload {
  sub: string        // user ID
  email: string
  iss?: string
  iat?: number
  exp?: number
  type?: 'access' | 'refresh'
}

export async function signJWT(
  payload: JWTPayload,
  secret: string,
  expiresIn: number = 3600
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iss: 'fortuna-engine',
    iat: now,
    exp: now + expiresIn,
  }

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)))
  const signingInput = `${header}.${body}`

  const key = await getKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput))

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [header, body, sig] = parts
    const signingInput = `${header}.${body}`

    const key = await getKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(sig),
      encoder.encode(signingInput)
    )
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as JWTPayload

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) return null

    return payload
  } catch {
    return null
  }
}

/**
 * Hash a password using PBKDF2 (Web Crypto)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  )
  // Store as salt:hash (both hex)
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('')
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${saltHex}:${hashHex}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(':')
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const hash = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      256
    )
    const computed = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
    return computed === hashHex
  } catch {
    return false
  }
}
