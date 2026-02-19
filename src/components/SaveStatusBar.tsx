/**
 * Fortuna Engine — Save Status Bar
 *
 * Persistent indicator showing:
 *   • Auto-save status (saved / saving / error)
 *   • Storage quota usage
 *   • Data health score (errors/warnings from validation)
 *   • Emergency export button
 *   • Backup count
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { validateFullState } from '../engine/input-validation'
import { checkStorageQuota, listBackups, downloadEmergencyExport } from '../engine/data-safety'
import { Download, Shield, HardDrive, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'

type SaveState = 'saved' | 'saving' | 'error' | 'idle'

export function SaveStatusBar() {
  const { state } = useFortuna()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showDetails, setShowDetails] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  // Track state changes → show "saving..." then "saved"
  useEffect(() => {
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('saved'), 1200)
    return () => clearTimeout(saveTimer.current)
  }, [state])

  // Listen for save events
  useEffect(() => {
    const handler = () => setSaveState('saved')
    const errorHandler = () => setSaveState('error')
    window.addEventListener('fortuna:state-saved', handler)
    window.addEventListener('fortuna:save-error', errorHandler)
    return () => {
      window.removeEventListener('fortuna:state-saved', handler)
      window.removeEventListener('fortuna:save-error', errorHandler)
    }
  }, [])

  const validation = validateFullState(state)
  const quota = checkStorageQuota()
  const backups = listBackups()

  const healthIcon = validation.errorCount > 0 ? <XCircle size={12} /> :
    validation.warningCount > 0 ? <AlertTriangle size={12} /> :
    <CheckCircle2 size={12} />

  const healthColor = validation.errorCount > 0 ? '#ef4444' :
    validation.warningCount > 0 ? '#f59e0b' : '#22c55e'

  const saveIcon = saveState === 'saving' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> :
    saveState === 'error' ? <XCircle size={12} /> :
    <CheckCircle2 size={12} />

  const saveColor = saveState === 'error' ? '#ef4444' : saveState === 'saving' ? 'var(--text-muted)' : '#22c55e'
  const saveLabel = saveState === 'saving' ? 'Saving...' :
    saveState === 'error' ? 'Save error' : 'Saved'

  const handleEmergencyExport = useCallback(() => {
    downloadEmergencyExport()
  }, [])

  return (
    <>
      {/* Spin animation for loader */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 28, display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 16,
          background: 'var(--bg-secondary, #0f1219)',
          borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--text-muted, #6b7280)',
          zIndex: 50,
          userSelect: 'none',
        }}
      >
        {/* Save status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: saveColor }}>
          {saveIcon}
          <span>{saveLabel}</span>
        </div>

        <div style={{ width: 1, height: 14, background: 'var(--border-subtle, rgba(255,255,255,0.06))' }} />

        {/* Data health */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, color: healthColor, cursor: 'pointer' }}
          onClick={() => setShowDetails(prev => !prev)}
          title="Data health — click for details"
        >
          {healthIcon}
          <span>
            {validation.errorCount > 0 ? `${validation.errorCount} error${validation.errorCount !== 1 ? 's' : ''}` :
             validation.warningCount > 0 ? `${validation.warningCount} warning${validation.warningCount !== 1 ? 's' : ''}` :
             'Healthy'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'var(--border-subtle, rgba(255,255,255,0.06))' }} />

        {/* Storage */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: quota.isWarning ? '#f59e0b' : 'var(--text-muted)' }}>
          <HardDrive size={11} />
          <span>{quota.usedMB} / {quota.estimatedLimitMB}MB</span>
          {quota.isWarning && <span style={{ color: '#f59e0b' }}>⚠</span>}
        </div>

        <div style={{ width: 1, height: 14, background: 'var(--border-subtle, rgba(255,255,255,0.06))' }} />

        {/* Backups */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Shield size={11} />
          <span>{backups.length} backup{backups.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Emergency export */}
        <button
          onClick={handleEmergencyExport}
          title="Emergency data export"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            padding: '2px 6px', borderRadius: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-gold, #f59e0b)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #6b7280)')}
        >
          <Download size={11} />
          <span>Export</span>
        </button>
      </div>

      {/* Details panel */}
      {showDetails && (
        <div
          style={{
            position: 'fixed', bottom: 28, right: 16,
            width: 360, maxHeight: 320, overflow: 'auto',
            background: 'var(--bg-card, #141822)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            borderRadius: '10px 10px 0 0',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
            padding: 16, zIndex: 51,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>Data Health</h4>
            <button
              onClick={() => setShowDetails(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 0 }}
            >×</button>
          </div>

          {validation.issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#22c55e' }}>
              <CheckCircle2 size={28} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 12 }}>All data checks passed</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {validation.issues.slice(0, 20).map((issue, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px', borderRadius: 6, fontSize: 11, lineHeight: 1.4,
                    background: issue.severity === 'error' ? 'rgba(239,68,68,0.08)' :
                      issue.severity === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
                    border: `1px solid ${issue.severity === 'error' ? 'rgba(239,68,68,0.15)' :
                      issue.severity === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}`,
                  }}
                >
                  <div style={{
                    color: issue.severity === 'error' ? '#ef4444' :
                      issue.severity === 'warning' ? '#f59e0b' : '#3b82f6',
                    fontWeight: 500, marginBottom: 2,
                    textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em',
                  }}>
                    {issue.severity}
                  </div>
                  <div style={{ color: 'var(--text-secondary, #cbd5e1)' }}>{issue.message}</div>
                  {issue.suggestion && (
                    <div style={{ color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>💡 {issue.suggestion}</div>
                  )}
                  {issue.irsRef && (
                    <div style={{ color: 'var(--text-muted)', marginTop: 2, fontSize: 10 }}>📎 {issue.irsRef}</div>
                  )}
                </div>
              ))}
              {validation.issues.length > 20 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>
                  ...and {validation.issues.length - 20} more
                </div>
              )}
            </div>
          )}

          {/* Storage breakdown */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Storage Breakdown</div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${Math.min(quota.usagePct, 100)}%`,
                background: quota.isCritical ? '#ef4444' : quota.isWarning ? '#f59e0b' : 'var(--accent-gold, #f59e0b)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            {quota.breakdown.slice(0, 5).map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', padding: '1px 0' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{item.key}</span>
                <span>{item.sizeKB} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
