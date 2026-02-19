import { useState, useEffect } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import type { DigestItem, SessionDigest } from '../engine/session-digest'
import {
  ChevronRight, X, ArrowUpRight, ArrowDownRight,
  Sparkles, TrendingUp, AlertTriangle, Target, Trophy,
  Zap, Clock,
} from 'lucide-react'

interface SessionDigestBarProps {
  digest: SessionDigest
  onNavigate: (view: ViewKey) => void
  onDismiss: () => void
}

const typeIcons: Record<string, React.ReactNode> = {
  positive: <TrendingUp size={14} />,
  negative: <AlertTriangle size={14} />,
  action: <Target size={14} />,
  milestone: <Trophy size={14} />,
  neutral: <Zap size={14} />,
}

const typeColors: Record<string, string> = {
  positive: 'var(--accent-emerald)',
  negative: 'var(--accent-red)',
  action: 'var(--accent-gold)',
  milestone: 'var(--accent-purple)',
  neutral: 'var(--text-secondary)',
}

export function SessionDigestBar({ digest, onNavigate, onDismiss }: SessionDigestBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [revealed, setRevealed] = useState(0)

  // Stagger reveal animation
  useEffect(() => {
    if (expanded && revealed < digest.items.length) {
      const timer = setTimeout(() => setRevealed(r => r + 1), 120)
      return () => clearTimeout(timer)
    }
  }, [expanded, revealed, digest.items.length])

  if (digest.items.length === 0) return null

  const topItems = digest.items.slice(0, 2)
  const hasMore = digest.items.length > 2

  return (
    <div style={{
      marginBottom: 20,
      borderRadius: 14,
      border: '1px solid var(--border-glow)',
      background: 'linear-gradient(135deg, rgba(212,168,67,0.06), rgba(52,211,153,0.03))',
      overflow: 'hidden',
      animation: 'digestSlideIn 0.5s var(--ease-out)',
    }}>
      {/* Header bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px',
          cursor: 'pointer',
        }}
        onClick={() => { setExpanded(!expanded); if (!expanded) setRevealed(0) }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 12px rgba(212,168,67,0.2)',
        }}>
          <Sparkles size={16} color="#0c0e12" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Session Intelligence
            </span>
            <span style={{
              padding: '2px 8px', borderRadius: 6,
              background: 'var(--accent-gold-dim)', color: 'var(--accent-gold)',
              fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
            }}>
              {digest.items.length} update{digest.items.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} /> {digest.timeSinceLastSession} since last visit
            </span>
          </div>

          {/* Preview of top items when collapsed */}
          {!expanded && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {topItems.map((item, i) => (
                <span key={item.id}>
                  {i > 0 && <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>}
                  <span style={{ color: typeColors[item.type] }}>{item.icon}</span>
                  {' '}{item.title}
                </span>
              ))}
              {hasMore && <span style={{ color: 'var(--text-muted)' }}> · +{digest.items.length - 2} more</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChevronRight
            size={16}
            color="var(--text-muted)"
            style={{
              transition: 'transform 0.3s var(--ease-out)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          />
          <button
            onClick={e => { e.stopPropagation(); onDismiss() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, borderRadius: 6,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: '0 18px 16px',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {digest.items.map((item, i) => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 0',
                borderBottom: i < digest.items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                opacity: i < revealed ? 1 : 0,
                transform: i < revealed ? 'translateX(0)' : 'translateX(-12px)',
                transition: 'opacity 0.3s ease-out, transform 0.3s var(--ease-out)',
              }}
            >
              {/* Type indicator */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: `${typeColors[item.type]}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: typeColors[item.type],
                marginTop: 1,
              }}>
                {typeIcons[item.type]}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {item.icon} {item.title}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {item.detail}
                </div>

                {/* Metric badge */}
                {item.metric && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    marginTop: 8, padding: '4px 10px', borderRadius: 6,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    fontSize: 11, fontFamily: 'var(--font-mono)',
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>{item.metric.label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.metric.value}</span>
                    {item.metric.change && (
                      <span style={{
                        color: item.metric.change.startsWith('-')
                          ? (item.type === 'positive' ? 'var(--accent-emerald)' : 'var(--accent-red)')
                          : (item.type === 'positive' ? 'var(--accent-emerald)' : 'var(--accent-red)'),
                        fontWeight: 600,
                      }}>
                        {item.metric.change}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action button */}
              {item.actionView && (
                <button
                  onClick={() => onNavigate(item.actionView as ViewKey)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'none', border: '1px solid var(--border-subtle)',
                    borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                    fontSize: 11, color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-gold)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                >
                  {item.actionLabel} <ChevronRight size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
