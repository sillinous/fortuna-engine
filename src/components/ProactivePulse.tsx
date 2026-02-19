/**
 * Fortuna Engine — Proactive Pulse
 *
 * Dashboard-embedded intelligence feed. Surfaces the Financial Pulse,
 * upcoming deadlines, and top alerts directly on the main screen so
 * the user gets value the moment they open the app.
 *
 * This is the "thing that brings them back."
 */

import { useMemo, useState, useCallback } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  generateProactiveAlerts, getFinancialPulse, getQuarterContext,
  type ProactiveAlert, type AlertSeverity,
} from '../engine/proactive-intelligence'
import {
  AlertTriangle, TrendingUp, Info, Clock, ChevronRight,
  X, Bell, CalendarClock, DollarSign, Sparkles, Eye,
} from 'lucide-react'
import type { ViewKey } from '../App'

// ─── Storage helpers ──────────────────────────────────────────────────

const DISMISSED_KEY = 'fortuna:dismissed-alerts'

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

// ─── Severity config ──────────────────────────────────────────────────

const SEV: Record<AlertSeverity, { color: string; bg: string; icon: JSX.Element; label: string }> = {
  urgent:      { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icon: <AlertTriangle size={14} />, label: 'URGENT' },
  warning:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: <AlertTriangle size={14} />, label: 'WARNING' },
  opportunity: { color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: <TrendingUp size={14} />,    label: 'OPPORTUNITY' },
  info:        { color: '#6b7280', bg: 'rgba(107,114,128,0.06)',icon: <Info size={14} />,           label: 'INFO' },
}

const MAX_VISIBLE = 3

// ─── Component ────────────────────────────────────────────────────────

export function ProactivePulse({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state } = useFortuna()
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed)
  const [expanded, setExpanded] = useState(false)

  const alerts = useMemo(() => generateProactiveAlerts(state), [state])
  const pulse  = useMemo(() => getFinancialPulse(state), [state])
  const ctx    = getQuarterContext()

  const visible = alerts.filter(a => !dismissed.has(a.id))
  const shown   = expanded ? visible : visible.slice(0, MAX_VISIBLE)
  const hasMore = visible.length > MAX_VISIBLE

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }, [])

  // Nothing to show = nothing to render
  if (visible.length === 0 && !pulse.nextDeadline) return null

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Pulse Header ─────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 12,
      }}>
        <Bell size={16} style={{ color: pulse.urgentCount > 0 ? '#ef4444' : 'var(--accent-gold)' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {pulse.headline}
        </span>
        <button
          onClick={() => onNavigate('alerts')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: 'var(--accent-gold)', background: 'none',
            border: 'none', cursor: 'pointer', fontWeight: 500,
          }}
        >
          View all <ChevronRight size={12} />
        </button>
      </div>

      {/* ── Quick stats row ──────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 8, marginBottom: 12,
      }}>
        {/* Next deadline */}
        {pulse.nextDeadline && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            background: pulse.nextDeadline.daysUntil <= 14
              ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)',
            border: `1px solid ${pulse.nextDeadline.daysUntil <= 14 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)'}`,
          }}>
            <CalendarClock size={14} style={{
              color: pulse.nextDeadline.daysUntil <= 14 ? '#ef4444' : '#f59e0b',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Next Deadline
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pulse.nextDeadline.name}
              </div>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: pulse.nextDeadline.daysUntil <= 14 ? '#ef4444' : '#f59e0b',
            }}>
              {pulse.nextDeadline.daysUntil}d
            </div>
          </div>
        )}

        {/* Savings available */}
        {pulse.estimatedSavingsAvailable > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.12)',
          }}>
            <DollarSign size={14} style={{ color: '#10b981' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Savings Available
              </div>
              <div style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>
                ${Math.round(pulse.estimatedSavingsAvailable).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: 0 }}
            >
              <Eye size={14} />
            </button>
          </div>
        )}

        {/* Quarter context */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(99,102,241,0.05)',
          border: '1px solid rgba(99,102,241,0.1)',
        }}>
          <Sparkles size={14} style={{ color: '#818cf8' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Q{ctx.quarter} Progress
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {ctx.daysLeftInQuarter}d left • Year {Math.round(ctx.yearProgress * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* ── Alert cards ──────────────────────────────────────── */}
      {shown.map(alert => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onDismiss={() => dismiss(alert.id)}
          onAction={alert.actionView ? () => onNavigate(alert.actionView as ViewKey) : undefined}
        />
      ))}

      {/* ── Show more / less ─────────────────────────────────── */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '6px 0', marginTop: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--text-muted)',
          }}
        >
          {expanded
            ? 'Show fewer'
            : `${visible.length - MAX_VISIBLE} more alert${visible.length - MAX_VISIBLE > 1 ? 's' : ''}`
          }
        </button>
      )}
    </div>
  )
}

// ─── Single Alert Card ────────────────────────────────────────────────

function AlertCard({ alert, onDismiss, onAction }: {
  alert: ProactiveAlert
  onDismiss: () => void
  onAction?: () => void
}) {
  const sev = SEV[alert.severity]

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', marginBottom: 6, borderRadius: 10,
      background: sev.bg, border: `1px solid ${sev.color}18`,
      transition: 'all 0.15s',
    }}>
      {/* Icon */}
      <div style={{ color: sev.color, marginTop: 1, flexShrink: 0 }}>
        {sev.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            color: sev.color, textTransform: 'uppercase',
          }}>
            {sev.label}
          </span>
          {alert.daysUntilDeadline != null && alert.daysUntilDeadline <= 30 && (
            <span style={{
              fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 3,
              color: alert.daysUntilDeadline <= 7 ? '#ef4444' : '#f59e0b',
            }}>
              <Clock size={9} /> {alert.daysUntilDeadline}d
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {alert.title}
        </div>
        {alert.impactLabel && (
          <div style={{ fontSize: 11, color: sev.color, fontWeight: 500 }}>
            {alert.impactLabel}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {onAction && (
          <button
            onClick={onAction}
            style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
              background: `${sev.color}18`, color: sev.color,
              border: `1px solid ${sev.color}28`, cursor: 'pointer',
            }}
          >
            {alert.action || 'View'}
          </button>
        )}
        <button
          onClick={onDismiss}
          style={{
            padding: 2, background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.5,
          }}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
