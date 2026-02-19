import { useState, useEffect, useRef } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { Storage, type FortunaExport } from '../engine/storage'
import {
  Download, Upload, Trash2, HardDrive, Shield,
  CheckCircle, AlertTriangle, XCircle, RefreshCw, Copy, Info,
} from 'lucide-react'

export function DataManager() {
  const { state, setState, storageBackend } = useFortuna()
  const [storageSize, setStorageSize] = useState('...')
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importStatus, setImportStatus] = useState<{ state: 'idle' | 'success' | 'error' | 'confirm'; message?: string }>({ state: 'idle' })
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Storage.estimateSize().then(s => setStorageSize(s.formatted))
  }, [state])

  // ---- Export ----
  const handleExport = async () => {
    try {
      const data = await Storage.exportAll()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `fortuna-backup-${dateStr}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportStatus('success')
      setTimeout(() => setExportStatus('idle'), 3000)
    } catch {
      setExportStatus('error')
      setTimeout(() => setExportStatus('idle'), 3000)
    }
  }

  // ---- Copy to clipboard ----
  const handleCopyExport = async () => {
    try {
      const data = await Storage.exportAll()
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      setExportStatus('success')
      setTimeout(() => setExportStatus('idle'), 3000)
    } catch {
      setExportStatus('error')
      setTimeout(() => setExportStatus('idle'), 3000)
    }
  }

  // ---- Import ----
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const validation = Storage.validateExport(text)
      if (!validation.valid || !validation.data) {
        setImportStatus({ state: 'error', message: validation.error || 'Invalid file' })
        setTimeout(() => setImportStatus({ state: 'idle' }), 5000)
        return
      }
      // Show confirmation with summary
      const d = validation.data
      const summary = `${d.state.profile.name || 'Unnamed'} | ${d.state.incomeStreams.length} streams | ${d.state.expenses.length} expenses | v${d._version} from ${new Date(d._exportedAt).toLocaleDateString()}`
      setImportStatus({ state: 'confirm', message: summary })

      // Store the data temporarily for confirm
      ;(window as any).__fortuna_pending_import = validation.data
    } catch {
      setImportStatus({ state: 'error', message: 'Could not read file' })
      setTimeout(() => setImportStatus({ state: 'idle' }), 5000)
    }
    // Reset file input
    e.target.value = ''
  }

  const confirmImport = async () => {
    const data = (window as any).__fortuna_pending_import as FortunaExport
    if (!data) return

    const result = await Storage.importAll(data)
    delete (window as any).__fortuna_pending_import

    if (result.success) {
      setImportStatus({ state: 'success', message: 'Data restored successfully. Reloading...' })
      setTimeout(() => window.location.reload(), 1500)
    } else {
      setImportStatus({ state: 'error', message: result.error })
      setTimeout(() => setImportStatus({ state: 'idle' }), 5000)
    }
  }

  const cancelImport = () => {
    delete (window as any).__fortuna_pending_import
    setImportStatus({ state: 'idle' })
  }

  // ---- Reset ----
  const handleReset = async () => {
    if (!resetConfirm) {
      setResetConfirm(true)
      return
    }
    await Storage.clearAll()
    setResetDone(true)
    setResetConfirm(false)
    setTimeout(() => window.location.reload(), 1500)
  }

  // ---- Styles ----
  const card: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
    padding: 24,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 4,
  }
  const sectionDesc: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginBottom: 16,
  }
  const btn = (color: string, bg: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 18px',
    borderRadius: 10,
    border: '1px solid ' + color + '33',
    background: bg,
    color,
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.2s',
  })
  const badge = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 500,
  })

  const backendLabel = storageBackend === 'localStorage' ? 'Browser Storage (localStorage)'
    : storageBackend === 'windowStorage' ? 'Artifact Storage (window.storage)'
    : 'No persistent storage available'
  const backendColor = storageBackend === 'localStorage' ? 'var(--accent-emerald)'
    : storageBackend === 'windowStorage' ? 'var(--accent-gold)'
    : 'var(--accent-red)'

  return (
    <div style={{ padding: '32px 40px', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 6 }}>
          Data Manager
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Backup, restore, and manage your Fortuna financial data. Your data persists automatically
          between sessions — use this page to create portable backups or transfer data between devices.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Storage Status */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <HardDrive size={18} color="var(--accent-gold)" />
            <span style={sectionTitle}>Storage Status</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={badge(backendColor + '18', backendColor)}>
              {storageBackend !== 'none' ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {backendLabel}
            </div>
            <div style={badge('var(--bg-primary)', 'var(--text-secondary)')}>
              <HardDrive size={14} />
              {storageSize} used
            </div>
            <div style={badge('var(--bg-primary)', 'var(--text-secondary)')}>
              <Shield size={14} />
              Schema v{Storage.schemaVersion}
            </div>
            <div style={badge('var(--bg-primary)', 'var(--text-secondary)')}>
              <Info size={14} />
              App v{Storage.appVersion}
            </div>
          </div>
          {state.onboardingComplete && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Profile:</strong> {state.profile.name || 'Unnamed'} &nbsp;·&nbsp;
              <strong style={{ color: 'var(--text-secondary)' }}>Streams:</strong> {state.incomeStreams.length} &nbsp;·&nbsp;
              <strong style={{ color: 'var(--text-secondary)' }}>Expenses:</strong> {state.expenses.length} &nbsp;·&nbsp;
              <strong style={{ color: 'var(--text-secondary)' }}>Entities:</strong> {state.entities.length} &nbsp;·&nbsp;
              <strong style={{ color: 'var(--text-secondary)' }}>Deductions:</strong> {state.deductions.length} &nbsp;·&nbsp;
              <strong style={{ color: 'var(--text-secondary)' }}>Last saved:</strong> {new Date(state.lastUpdated).toLocaleString()}
            </div>
          )}
        </div>

        {/* Export */}
        <div style={card}>
          <div style={sectionTitle}>
            <Download size={15} style={{ display: 'inline', verticalAlign: -2, marginRight: 8 }} />
            Export Backup
          </div>
          <div style={sectionDesc}>
            Download a complete snapshot of your financial data, advisor history, and preferences.
            This file can be imported on any device or after a fresh install.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn('var(--accent-emerald)', 'var(--accent-emerald)18')} onClick={handleExport}>
              <Download size={15} /> Download .json
            </button>
            <button style={btn('var(--accent-blue)', 'var(--accent-blue)18')} onClick={handleCopyExport}>
              <Copy size={15} /> Copy to clipboard
            </button>
            {exportStatus === 'success' && (
              <span style={badge('var(--accent-emerald)18', 'var(--accent-emerald)')}>
                <CheckCircle size={14} /> Exported
              </span>
            )}
            {exportStatus === 'error' && (
              <span style={badge('var(--accent-red)18', 'var(--accent-red)')}>
                <XCircle size={14} /> Export failed
              </span>
            )}
          </div>
        </div>

        {/* Import */}
        <div style={card}>
          <div style={sectionTitle}>
            <Upload size={15} style={{ display: 'inline', verticalAlign: -2, marginRight: 8 }} />
            Import / Restore
          </div>
          <div style={sectionDesc}>
            Restore from a Fortuna backup file. Older export versions are automatically migrated
            to the current schema. This will <strong>replace</strong> all current data.
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />

          {importStatus.state === 'idle' && (
            <button style={btn('var(--accent-gold)', 'var(--accent-gold)18')} onClick={handleImportClick}>
              <Upload size={15} /> Select backup file...
            </button>
          )}

          {importStatus.state === 'confirm' && (
            <div style={{ padding: 16, background: 'var(--accent-gold)10', border: '1px solid var(--accent-gold)33', borderRadius: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--accent-gold)', fontWeight: 600, marginBottom: 6 }}>
                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
                Confirm Restore
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                This will replace all current data with: <strong>{importStatus.message}</strong>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={btn('var(--accent-gold)', 'var(--accent-gold)22')} onClick={confirmImport}>
                  <RefreshCw size={14} /> Yes, restore
                </button>
                <button style={btn('var(--text-muted)', 'transparent')} onClick={cancelImport}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {importStatus.state === 'success' && (
            <div style={badge('var(--accent-emerald)18', 'var(--accent-emerald)')}>
              <CheckCircle size={14} /> {importStatus.message}
            </div>
          )}

          {importStatus.state === 'error' && (
            <div style={badge('var(--accent-red)18', 'var(--accent-red)')}>
              <XCircle size={14} /> {importStatus.message}
            </div>
          )}
        </div>

        {/* Persistence Info */}
        <div style={{ ...card, background: 'var(--bg-primary)', border: '1px dashed var(--border-subtle)' }}>
          <div style={sectionTitle}>
            <Shield size={15} style={{ display: 'inline', verticalAlign: -2, marginRight: 8 }} />
            How Persistence Works
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <p style={{ margin: '0 0 8px' }}>
              Fortuna automatically saves your data to <strong style={{ color: 'var(--text-secondary)' }}>browser localStorage</strong> after every change.
              Your data stays even after closing the tab, restarting the browser, or updating to a new build.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Schema migrations</strong> run automatically when a new build introduces data structure changes —
              your existing data is preserved and upgraded seamlessly.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--accent-gold)' }}>Recommendation:</strong> Export a backup periodically or before clearing browser data.
              Fortuna data is local to this browser — it does not sync across devices without export/import.
            </p>
          </div>
        </div>

        {/* Danger Zone */}
        <div style={{ ...card, borderColor: 'var(--accent-red)33' }}>
          <div style={{ ...sectionTitle, color: 'var(--accent-red)' }}>
            <Trash2 size={15} style={{ display: 'inline', verticalAlign: -2, marginRight: 8 }} />
            Danger Zone
          </div>
          <div style={sectionDesc}>
            Permanently delete all Fortuna data from this browser. This cannot be undone
            unless you have an exported backup.
          </div>

          {resetDone ? (
            <div style={badge('var(--accent-red)18', 'var(--accent-red)')}>
              <Trash2 size={14} /> Data cleared. Reloading...
            </div>
          ) : resetConfirm ? (
            <div style={{ padding: 16, background: 'var(--accent-red)10', border: '1px solid var(--accent-red)33', borderRadius: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 600, marginBottom: 8 }}>
                Are you absolutely sure?
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                All financial data, strategies, preferences, and advisor history will be permanently deleted.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  style={{ ...btn('white', 'var(--accent-red)'), border: 'none' }}
                  onClick={handleReset}
                >
                  <Trash2 size={14} /> Delete everything
                </button>
                <button style={btn('var(--text-muted)', 'transparent')} onClick={() => setResetConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button style={btn('var(--accent-red)', 'transparent')} onClick={handleReset}>
              <Trash2 size={15} /> Reset all data...
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
