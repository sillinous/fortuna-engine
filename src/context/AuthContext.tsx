/**
 * Fortuna Engine — Auth Context
 * 
 * Wraps the app with authentication state management.
 * Handles login/register/logout, token refresh, and sync triggers.
 * Works alongside FortunaProvider — auth wraps fortuna.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import {
  AuthAPI,
  StateAPI,
  type AuthUser,
  getStoredUser,
  isAuthenticated,
  hasRefreshToken,
  clearAuthData,
  getAPIBaseUrl,
  setAPIBaseUrl,
  testAPIConnection,
  type APIError,
} from '../engine/api-client'
import { Storage, type FortunaState } from '../engine/storage'

// ============================================
//  TYPES
// ============================================

export type AuthMode = 'login' | 'register'
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'conflict'

interface AuthContextType {
  // Auth state
  user: AuthUser | null
  isLoggedIn: boolean
  isLoading: boolean
  authError: string | null
  
  // Auth actions
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, displayName?: string) => Promise<boolean>
  logout: () => Promise<void>
  updateProfile: (updates: { display_name?: string; email?: string; current_password?: string; new_password?: string }) => Promise<boolean>
  
  // Sync state
  syncStatus: SyncStatus
  lastSyncedAt: string | null
  cloudVersion: number
  
  // Sync actions
  syncToCloud: (state: FortunaState) => Promise<void>
  syncFromCloud: () => Promise<FortunaState | null>
  forceSync: (state: FortunaState) => Promise<void>
  
  // API config
  apiBaseUrl: string
  setApiUrl: (url: string) => Promise<boolean>
  isApiConfigured: boolean
  
  // Mode (allows using app without account)
  isOfflineMode: boolean
  enableOfflineMode: () => void
  connectAccount: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

// ============================================
//  PROVIDER
// ============================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [cloudVersion, setCloudVersion] = useState(0)
  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const [apiBaseUrl, setApiBaseUrlState] = useState(getAPIBaseUrl())
  const [isApiConfigured, setIsApiConfigured] = useState(false)
  
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- Initialize auth state ----
  useEffect(() => {
    async function init() {
      // Auto-detect API URL and test connection
      const url = getAPIBaseUrl()
      if (url) {
        const test = await testAPIConnection(url)
        if (test.connected) {
          setIsApiConfigured(true)
          setApiBaseUrlState(url)
          // Persist the auto-detected URL so ai-providers can find it
          setAPIBaseUrl(url)
        }
      }
      
      // Check for existing session
      const storedUser = getStoredUser()
      if (storedUser && (isAuthenticated() || hasRefreshToken())) {
        setUser(storedUser)
        
        // Verify session is still valid
        try {
          const profile = await AuthAPI.getProfile()
          setUser(profile.user)
          if (profile.state_meta) {
            setCloudVersion(profile.state_meta.state_version || 0)
            setLastSyncedAt(profile.state_meta.last_synced_at || null)
          }
          setSyncStatus('synced')
        } catch {
          // Token might be expired — don't logout yet, refresh will handle it
          setSyncStatus('offline')
        }
      } else {
        // Check if user was in offline mode
        const offlineFlag = localStorage.getItem('fortuna:offline-mode')
        if (offlineFlag === 'true') {
          setIsOfflineMode(true)
        }
      }
      
      setIsLoading(false)
    }
    init()
  }, [])

  // ---- Auth Actions ----

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setAuthError(null)
    try {
      const result = await AuthAPI.login(email, password)
      setUser(result.user)
      setIsOfflineMode(false)
      localStorage.removeItem('fortuna:offline-mode')
      
      // Trigger initial sync
      try {
        const localState = await Storage.getFullState()
        const mergeResult = await StateAPI.merge(
          localState,
          localState.lastUpdated
        )
        setCloudVersion(mergeResult.version)
        setSyncStatus('synced')
        setLastSyncedAt(new Date().toISOString())
        
        // If remote had newer data, update local
        if (mergeResult.resolution !== 'local_wins' && mergeResult.state) {
          await Storage.saveFullState(mergeResult.state)
          // Signal that state should be reloaded
          window.dispatchEvent(new CustomEvent('fortuna:state-updated', { detail: mergeResult.state }))
        }
      } catch (e) {
        console.warn('[Auth] Initial sync failed, continuing offline', e)
        setSyncStatus('offline')
      }
      
      return true
    } catch (e) {
      const err = e as APIError
      if (err.code === 'BACKEND_UNAVAILABLE') {
        setAuthError('No backend server connected. Click "Continue Without Account" below to use Fortuna in local-only mode.')
      } else {
        setAuthError(err.message || 'Login failed')
      }
      return false
    }
  }, [])

  const register = useCallback(async (email: string, password: string, displayName?: string): Promise<boolean> => {
    setAuthError(null)
    try {
      const result = await AuthAPI.register(email, password, displayName)
      setUser(result.user)
      setIsOfflineMode(false)
      localStorage.removeItem('fortuna:offline-mode')
      
      // Upload existing local state to cloud
      try {
        const localState = await Storage.getFullState()
        if (localState.onboardingComplete) {
          const saveResult = await StateAPI.save(localState, undefined, true)
          setCloudVersion(saveResult.version)
          setSyncStatus('synced')
          setLastSyncedAt(saveResult.synced_at)
        }
      } catch {
        setSyncStatus('offline')
      }
      
      return true
    } catch (e) {
      const err = e as APIError
      if (err.code === 'BACKEND_UNAVAILABLE') {
        setAuthError('No backend server connected. Click "Continue Without Account" below to use Fortuna in local-only mode.')
      } else {
        setAuthError(err.message || 'Registration failed')
      }
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await AuthAPI.logout()
    } catch {
      // Clear local regardless
    }
    setUser(null)
    setIsOfflineMode(false)
    setSyncStatus('idle')
    setCloudVersion(0)
    setLastSyncedAt(null)
    localStorage.removeItem('fortuna:offline-mode')
    clearAuthData()
  }, [])

  const updateProfile = useCallback(async (updates: any): Promise<boolean> => {
    try {
      await AuthAPI.updateProfile(updates)
      // Refresh user data
      const profile = await AuthAPI.getProfile()
      setUser(profile.user)
      return true
    } catch (e) {
      setAuthError((e as APIError).message)
      return false
    }
  }, [])

  // ---- Sync Actions ----

  const syncToCloud = useCallback(async (state: FortunaState) => {
    if (!user) return
    
    setSyncStatus('syncing')
    try {
      const result = await StateAPI.save(state, cloudVersion)
      if (!result.skipped) {
        setCloudVersion(result.version)
      }
      setLastSyncedAt(result.synced_at)
      setSyncStatus('synced')
    } catch (e) {
      const apiError = e as APIError
      if (apiError.code === 'STATE_CONFLICT') {
        setSyncStatus('conflict')
      } else {
        setSyncStatus('error')
      }
      console.warn('[Sync] Save failed:', apiError.message)
    }
  }, [user, cloudVersion])

  const syncFromCloud = useCallback(async (): Promise<FortunaState | null> => {
    if (!user) return null
    
    setSyncStatus('syncing')
    try {
      const result = await StateAPI.load()
      if (result.state) {
        setCloudVersion(result.version)
        setLastSyncedAt(result.last_synced_at)
        setSyncStatus('synced')
        return result.state as FortunaState
      }
      setSyncStatus('synced')
      return null
    } catch {
      setSyncStatus('error')
      return null
    }
  }, [user])

  const forceSync = useCallback(async (state: FortunaState) => {
    if (!user) return
    
    setSyncStatus('syncing')
    try {
      const result = await StateAPI.save(state, undefined, true)
      setCloudVersion(result.version)
      setLastSyncedAt(result.synced_at)
      setSyncStatus('synced')
    } catch {
      setSyncStatus('error')
    }
  }, [user])

  // ---- API Config ----

  const setApiUrl = useCallback(async (url: string): Promise<boolean> => {
    const test = await testAPIConnection(url)
    if (test.connected) {
      setAPIBaseUrl(url)
      setApiBaseUrlState(url)
      setIsApiConfigured(true)
      return true
    }
    return false
  }, [])

  // ---- Offline Mode ----

  const enableOfflineMode = useCallback(() => {
    setIsOfflineMode(true)
    localStorage.setItem('fortuna:offline-mode', 'true')
  }, [])

  // Exit offline mode → return to auth screen (no network calls)
  const connectAccount = useCallback(() => {
    setIsOfflineMode(false)
    setUser(null)
    localStorage.removeItem('fortuna:offline-mode')
  }, [])

  // ---- Auto-sync (debounced, when logged in) ----
  // This is called from useFortuna when state changes
  useEffect(() => {
    // Listen for state save events
    const handler = (e: Event) => {
      if (!user) return
      const state = (e as CustomEvent).detail as FortunaState
      if (!state) return
      
      if (syncTimer.current) clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(() => {
        syncToCloud(state)
      }, 5000) // 5 second debounce for cloud sync
    }
    
    window.addEventListener('fortuna:state-saved', handler)
    return () => {
      window.removeEventListener('fortuna:state-saved', handler)
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [user, syncToCloud])

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      isLoading,
      authError,
      login,
      register,
      logout,
      updateProfile,
      syncStatus,
      lastSyncedAt,
      cloudVersion,
      syncToCloud,
      syncFromCloud,
      forceSync,
      apiBaseUrl,
      setApiUrl,
      isApiConfigured,
      isOfflineMode,
      enableOfflineMode,
      connectAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
