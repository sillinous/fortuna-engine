/**
 * Fortuna Engine — Auth Screen
 * 
 * Beautiful login/register gateway with API configuration
 * and offline mode fallback.
 */

import { useState, useEffect, useRef } from 'react'
import { useAuth, type AuthMode } from '../context/AuthContext'
import { testAPIConnection } from '../engine/api-client'

export function AuthScreen() {
  const {
    login, register, authError, isApiConfigured,
    apiBaseUrl, setApiUrl, enableOfflineMode,
  } = useAuth()
  
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  
  // API Setup - only if auto-detection failed
  const [showApiSetup, setShowApiSetup] = useState(false)
  const [apiUrl, setApiUrlInput] = useState(apiBaseUrl || '')
  const [apiTesting, setApiTesting] = useState(false)
  const [apiResult, setApiResult] = useState<{ connected: boolean; latency?: number; error?: string } | null>(null)

  // If API not configured after auto-detect, show manual setup
  useEffect(() => {
    if (!isApiConfigured) setShowApiSetup(true)
    else setShowApiSetup(false)
  }, [isApiConfigured])
  
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showApiSetup && emailRef.current) {
      emailRef.current.focus()
    }
  }, [showApiSetup])

  // ---- API Setup ----

  const handleTestAPI = async () => {
    if (!apiUrl.trim()) return
    setApiTesting(true)
    setApiResult(null)
    
    const result = await testAPIConnection(apiUrl.trim())
    setApiResult(result)
    setApiTesting(false)
  }

  const handleSaveAPI = async () => {
    if (!apiUrl.trim()) return
    const ok = await setApiUrl(apiUrl.trim())
    if (ok) {
      setShowApiSetup(false)
    } else {
      setApiResult({ connected: false, error: 'Could not connect to API' })
    }
  }

  // ---- Auth Submit ----

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    
    if (!email.trim() || !password.trim()) {
      setLocalError('Please fill in all fields')
      return
    }
    
    if (mode === 'register') {
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters')
        return
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match')
        return
      }
    }
    
    setIsSubmitting(true)
    
    const success = mode === 'login'
      ? await login(email, password)
      : await register(email, password, displayName || undefined)
    
    setIsSubmitting(false)
    
    if (!success) {
      // Error will be in authError from context
    }
  }

  const error = localError || authError

  // ---- Styles ----

  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0f172a 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '1rem',
    } as React.CSSProperties,
    card: {
      width: '100%',
      maxWidth: '420px',
      background: 'rgba(17, 24, 39, 0.8)',
      border: '1px solid rgba(251, 191, 36, 0.15)',
      borderRadius: '16px',
      padding: '2.5rem 2rem',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
    } as React.CSSProperties,
    logo: {
      textAlign: 'center' as const,
      marginBottom: '2rem',
    },
    logoIcon: {
      fontSize: '2.5rem',
      marginBottom: '0.5rem',
    },
    logoText: {
      fontSize: '1.5rem',
      fontWeight: 700,
      color: '#fbbf24',
      letterSpacing: '-0.02em',
    },
    logoSub: {
      fontSize: '0.8rem',
      color: '#9ca3af',
      marginTop: '0.25rem',
    },
    label: {
      display: 'block',
      fontSize: '0.8rem',
      fontWeight: 500,
      color: '#d1d5db',
      marginBottom: '0.4rem',
    },
    input: {
      width: '100%',
      padding: '0.7rem 0.9rem',
      background: 'rgba(31, 41, 55, 0.8)',
      border: '1px solid rgba(75, 85, 99, 0.5)',
      borderRadius: '8px',
      color: '#f3f4f6',
      fontSize: '0.9rem',
      outline: 'none',
      transition: 'border-color 0.2s',
      boxSizing: 'border-box' as const,
    } as React.CSSProperties,
    inputFocus: {
      borderColor: '#fbbf24',
    },
    fieldGroup: {
      marginBottom: '1rem',
    },
    button: {
      width: '100%',
      padding: '0.75rem',
      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
      border: 'none',
      borderRadius: '8px',
      color: '#0a0e1a',
      fontSize: '0.95rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
      marginTop: '0.5rem',
    } as React.CSSProperties,
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    secondaryButton: {
      width: '100%',
      padding: '0.6rem',
      background: 'transparent',
      border: '1px solid rgba(75, 85, 99, 0.5)',
      borderRadius: '8px',
      color: '#9ca3af',
      fontSize: '0.85rem',
      cursor: 'pointer',
      transition: 'all 0.2s',
      marginTop: '0.75rem',
    } as React.CSSProperties,
    toggleRow: {
      textAlign: 'center' as const,
      marginTop: '1.5rem',
      fontSize: '0.85rem',
      color: '#9ca3af',
    },
    toggleLink: {
      color: '#fbbf24',
      cursor: 'pointer',
      fontWeight: 500,
      background: 'none',
      border: 'none',
      fontSize: '0.85rem',
      textDecoration: 'underline',
    } as React.CSSProperties,
    error: {
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: '8px',
      padding: '0.6rem 0.8rem',
      marginBottom: '1rem',
      fontSize: '0.8rem',
      color: '#fca5a5',
    },
    success: {
      background: 'rgba(34, 197, 94, 0.1)',
      border: '1px solid rgba(34, 197, 94, 0.3)',
      borderRadius: '8px',
      padding: '0.6rem 0.8rem',
      marginBottom: '1rem',
      fontSize: '0.8rem',
      color: '#86efac',
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      margin: '1.5rem 0',
      fontSize: '0.75rem',
      color: '#6b7280',
    },
    dividerLine: {
      flex: 1,
      height: '1px',
      background: 'rgba(75, 85, 99, 0.4)',
    },
    apiRow: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '0.75rem',
    },
    apiTestButton: {
      padding: '0.7rem 1rem',
      background: 'rgba(251, 191, 36, 0.15)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '8px',
      color: '#fbbf24',
      fontSize: '0.8rem',
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
  }

  // ---- API Setup Screen ----

  if (showApiSetup && !isApiConfigured) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>⚡</div>
            <div style={styles.logoText}>FORTUNA ENGINE</div>
            <div style={styles.logoSub}>Connect Your Backend</div>
          </div>

          <p style={{ color: '#9ca3af', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
            Enter your Fortuna API URL. This is where you uploaded the <code style={{ color: '#fbbf24' }}>/api/</code> files on your hosting.
          </p>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>API Base URL</label>
            <div style={styles.apiRow}>
              <input
                type="url"
                placeholder="https://yourdomain.com/api"
                value={apiUrl}
                onChange={e => setApiUrlInput(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                onClick={handleTestAPI}
                disabled={apiTesting || !apiUrl.trim()}
                style={{ ...styles.apiTestButton, ...(apiTesting ? styles.buttonDisabled : {}) }}
              >
                {apiTesting ? '...' : 'Test'}
              </button>
            </div>
          </div>

          {apiResult && (
            <div style={apiResult.connected ? styles.success : styles.error}>
              {apiResult.connected 
                ? `✓ Connected! (${apiResult.latency}ms latency)`
                : `✗ ${apiResult.error || 'Connection failed'}`
              }
            </div>
          )}

          <button
            onClick={handleSaveAPI}
            disabled={!apiResult?.connected}
            style={{ ...styles.button, ...(apiResult?.connected ? {} : styles.buttonDisabled) }}
          >
            Save & Continue
          </button>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span>or</span>
            <div style={styles.dividerLine} />
          </div>

          <button
            onClick={enableOfflineMode}
            style={styles.secondaryButton}
          >
            Continue Without Account (Local Only)
          </button>

          <p style={{ color: '#6b7280', fontSize: '0.7rem', textAlign: 'center', marginTop: '1rem' }}>
            Offline mode stores data in your browser only. You can connect an account later.
          </p>
        </div>
      </div>
    )
  }

  // ---- Login / Register Screen ----

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>⚡</div>
          <div style={styles.logoText}>FORTUNA ENGINE</div>
          <div style={styles.logoSub}>
            {mode === 'login' ? 'Welcome Back' : 'Create Your Account'}
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Display Name (optional)</label>
              <input
                type="text"
                placeholder="How should we address you?"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                style={styles.input}
                autoComplete="name"
              />
            </div>
          )}

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email</label>
            <input
              ref={emailRef}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {mode === 'register' && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ ...styles.button, ...(isSubmitting ? styles.buttonDisabled : {}) }}
          >
            {isSubmitting
              ? (mode === 'login' ? 'Signing In...' : 'Creating Account...')
              : (mode === 'login' ? 'Sign In' : 'Create Account')
            }
          </button>
        </form>

        <div style={styles.toggleRow}>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button style={styles.toggleLink} onClick={() => { setMode('register'); setLocalError(null) }}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button style={styles.toggleLink} onClick={() => { setMode('login'); setLocalError(null) }}>
                Sign in
              </button>
            </>
          )}
        </div>

        <div style={styles.divider}>
          <div style={styles.dividerLine} />
          <span>or</span>
          <div style={styles.dividerLine} />
        </div>

        <button
          onClick={enableOfflineMode}
          style={styles.secondaryButton}
        >
          Continue Without Account
        </button>

        {isApiConfigured && (
          <button
            onClick={() => setShowApiSetup(true)}
            style={{ ...styles.secondaryButton, marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}
          >
            ⚙ Change API URL
          </button>
        )}
      </div>
    </div>
  )
}
