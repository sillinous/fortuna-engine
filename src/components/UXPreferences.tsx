/**
 * FORTUNA ENGINE — UX Preferences Panel (Phase 2 UX Fix)
 *
 * Floating settings gear that opens a quick preferences panel.
 * Toggle: Friendly/Technical labels, Simple/Standard/Expert nav,
 * and other UX preferences without leaving the current view.
 */

import { useState } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { Settings, X, MessageCircle, Code2, ChevronDown } from 'lucide-react'

export function UXPreferencesToggle() {
  const [open, setOpen] = useState(false)
  const { uxPrefs, updateUXPrefs } = useFortuna()
  const isFriendly = uxPrefs.friendlyLabels !== false

  return (
    <>
      {/* Floating gear button — desktop only */}
      <button
        onClick={() => setOpen(!open)}
        className="hide-mobile hide-print"
        aria-label="UX Preferences"
        aria-expanded={open}
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 90,
          width: 40, height: 40, borderRadius: 12,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-muted)',
          transition: 'all 0.2s',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--accent-gold)'
          e.currentTarget.style.borderColor = 'var(--accent-gold)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'var(--text-muted)'
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
        }}
      >
        <Settings size={18} />
      </button>

      {/* Preferences panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 64, right: 16, zIndex: 91,
          width: 280, borderRadius: 14,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          animation: 'fadeInDown 0.2s ease-out',
          overflow: 'hidden',
        }}
        className="hide-print"
        >
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              Display Preferences
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2,
            }} aria-label="Close preferences">
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Label mode toggle */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Language Style
              </div>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 3 }}>
                <button
                  onClick={() => updateUXPrefs({ friendlyLabels: true })}
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none',
                    background: isFriendly ? 'var(--accent-gold-dim)' : 'transparent',
                    color: isFriendly ? 'var(--accent-gold)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all 0.2s',
                  }}
                >
                  <MessageCircle size={13} />
                  Friendly
                </button>
                <button
                  onClick={() => updateUXPrefs({ friendlyLabels: false })}
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 6, border: 'none',
                    background: !isFriendly ? 'var(--accent-gold-dim)' : 'transparent',
                    color: !isFriendly ? 'var(--accent-gold)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    transition: 'all 0.2s',
                  }}
                >
                  <Code2 size={13} />
                  Technical
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                {isFriendly
                  ? '"Find Deductions" • "Paycheck Planner" • "Send to Accountant"'
                  : '"Deduction Discovery Engine" • "Paycheck Simulator" • "CPA Export Package"'}
              </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div style={{
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--text-secondary)' }}>Keyboard Shortcuts</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Search</span>
                <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3 }}>⌘K</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span>Undo</span>
                <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3 }}>⌘Z</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span>Redo</span>
                <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3 }}>⇧⌘Z</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
