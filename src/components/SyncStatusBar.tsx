/**
 * Fortuna Engine — Sync Status Indicator
 * 
 * Shows cloud sync status in the sidebar. Clickable to force sync or view details.
 */

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const STATUS_CONFIG = {
  idle: { icon: '☁️', label: 'Cloud', color: '#6b7280' },
  syncing: { icon: '🔄', label: 'Syncing...', color: '#fbbf24' },
  synced: { icon: '✓', label: 'Synced', color: '#22c55e' },
  error: { icon: '⚠', label: 'Sync Error', color: '#ef4444' },
  offline: { icon: '○', label: 'Offline', color: '#6b7280' },
  conflict: { icon: '⚡', label: 'Conflict', color: '#f97316' },
}

export function SyncStatusBar() {
  const { user, isLoggedIn, isOfflineMode, syncStatus, lastSyncedAt, cloudVersion, logout, connectAccount } = useAuth()
  const [showDetails, setShowDetails] = useState(false)

  // Offline mode — show "Connect Account" prompt
  if (!isLoggedIn && isOfflineMode) {
    return (
      <button
        onClick={connectAccount}
        title="Sign in to enable cloud sync and collaboration"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          padding: '0.5rem 0.75rem',
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.2)',
          borderRadius: '8px',
          color: '#fbbf24',
          fontSize: '0.75rem',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <span>🔑</span>
        <span style={{ flex: 1, textAlign: 'left' }}>Connect Account</span>
        <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>Local only</span>
      </button>
    )
  }

  if (!isLoggedIn) return null

  const config = STATUS_CONFIG[syncStatus]
  
  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never'
    const d = new Date(iso)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000
    
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          padding: '0.5rem 0.75rem',
          background: 'rgba(31, 41, 55, 0.5)',
          border: '1px solid rgba(75, 85, 99, 0.3)',
          borderRadius: '8px',
          color: config.color,
          fontSize: '0.75rem',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <span style={{ 
          fontSize: syncStatus === 'syncing' ? '0.7rem' : '0.75rem',
          animation: syncStatus === 'syncing' ? 'spin 1s linear infinite' : 'none',
        }}>
          {config.icon}
        </span>
        <span style={{ flex: 1, textAlign: 'left', color: '#d1d5db' }}>
          {user?.display_name || user?.email?.split('@')[0] || 'Account'}
        </span>
        <span style={{ fontSize: '0.65rem' }}>{config.label}</span>
      </button>

      {showDetails && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          marginBottom: '0.5rem',
          background: '#1f2937',
          border: '1px solid rgba(75, 85, 99, 0.5)',
          borderRadius: '8px',
          padding: '0.75rem',
          fontSize: '0.75rem',
          color: '#9ca3af',
          zIndex: 50,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ marginBottom: '0.5rem', color: '#f3f4f6', fontWeight: 500 }}>
            {user?.email}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span>Status:</span>
            <span style={{ color: config.color }}>{config.label}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span>Last sync:</span>
            <span>{formatTime(lastSyncedAt)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span>Cloud version:</span>
            <span>v{cloudVersion}</span>
          </div>
          <button
            onClick={() => { logout(); setShowDetails(false) }}
            style={{
              width: '100%',
              padding: '0.4rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              color: '#fca5a5',
              fontSize: '0.7rem',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
