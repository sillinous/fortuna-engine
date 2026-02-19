import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { TrendLine, Milestone, StrategyEffect, Projection } from '../engine/history-engine'
import {
  TrendingUp, TrendingDown, Minus, Camera, Clock, Zap,
  Target, ArrowRight, BarChart3, Activity, ChevronDown, ChevronUp,
} from 'lucide-react'

// ===================================================================
//  SPARKLINE SVG
// ===================================================================

function Sparkline({ points, color, height = 40, width = 180 }: {
  points: { value: number }[]
  color: string
  height?: number
  width?: number
}) {
  if (points.length < 2) return null
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pathPoints = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })

  const areaPath = `M0,${height} L${pathPoints.join(' L')} L${width},${height} Z`
  const linePath = `M${pathPoints.join(' L')}`

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color.replace(/[^a-z]/g, '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Current value dot */}
      {values.length > 0 && (
        <circle
          cx={width}
          cy={height - ((values[values.length - 1] - min) / range) * (height - 4) - 2}
          r="3"
          fill={color}
        />
      )}
    </svg>
  )
}

// ===================================================================
//  FORMAT HELPERS
// ===================================================================

function fmt(value: number, unit: string): string {
  if (unit === '$') return '$' + Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (unit === '%') return value.toFixed(1) + '%'
  if (unit === '#') return Math.round(value).toString()
  return value.toFixed(0) + ' ' + unit
}

function fmtChange(value: number, unit: string): string {
  const sign = value >= 0 ? '+' : ''
  if (unit === '$') return sign + '$' + Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (unit === '%') return sign + value.toFixed(1) + 'pp'
  return sign + value.toFixed(0)
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ===================================================================
//  MAIN VIEW
// ===================================================================

export function FinancialHistory() {
  const { history, trends, strategyEffects, projections, milestones, takeManualSnapshot } = useFortuna()
  const [activeTab, setActiveTab] = useState<'trends' | 'timeline' | 'effectiveness' | 'projections'>('trends')
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null)
  const [snapshotNote, setSnapshotNote] = useState('')
  const [showSnapshotInput, setShowSnapshotInput] = useState(false)

  const snapshotCount = history.snapshots.length
  const hasEnoughData = snapshotCount >= 2

  // Styles
  const card: React.CSSProperties = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 14, padding: 24,
  }
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: active ? 'var(--accent-gold-dim)' : 'transparent',
    color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
    cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13,
    fontWeight: active ? 600 : 400, transition: 'all 0.2s',
  })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 6 }}>
            Financial History
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {snapshotCount} snapshot{snapshotCount !== 1 ? 's' : ''} recorded
            {history.lastAutoSnapshot && ` · Last: ${relativeTime(history.lastAutoSnapshot)}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {showSnapshotInput ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Snapshot note (optional)"
                value={snapshotNote}
                onChange={e => setSnapshotNote(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
                  background: 'var(--bg-surface)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)', fontSize: 13, width: 200,
                }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    takeManualSnapshot(snapshotNote || undefined)
                    setSnapshotNote('')
                    setShowSnapshotInput(false)
                  }
                }}
              />
              <button
                onClick={() => {
                  takeManualSnapshot(snapshotNote || undefined)
                  setSnapshotNote('')
                  setShowSnapshotInput(false)
                }}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none',
                  background: 'var(--accent-emerald)', color: '#0c0e12',
                  cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSnapshotInput(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--accent-gold)33',
                background: 'var(--accent-gold-dim)', color: 'var(--accent-gold)',
                cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500,
              }}
            >
              <Camera size={14} /> Take Snapshot
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!hasEnoughData && (
        <div style={{
          ...card,
          textAlign: 'center', padding: 48,
          background: 'var(--bg-primary)', border: '1px dashed var(--border-subtle)',
        }}>
          <Activity size={32} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 8 }}>
            Building Your Financial History
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
            {snapshotCount === 0
              ? 'Fortuna automatically records snapshots when your financial data changes. Your first snapshot will be recorded shortly. You can also take manual snapshots anytime.'
              : 'One more snapshot needed to start showing trends. Continue using Fortuna — snapshots are taken automatically on data changes and monthly.'
            }
          </div>
        </div>
      )}

      {/* Tabs */}
      {hasEnoughData && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
            <button style={tabBtn(activeTab === 'trends')} onClick={() => setActiveTab('trends')}>
              <TrendingUp size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
              Trends
            </button>
            <button style={tabBtn(activeTab === 'timeline')} onClick={() => setActiveTab('timeline')}>
              <Clock size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
              Timeline
            </button>
            <button style={tabBtn(activeTab === 'effectiveness')} onClick={() => setActiveTab('effectiveness')}>
              <Target size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
              Strategy Impact
            </button>
            {projections.length > 0 && (
              <button style={tabBtn(activeTab === 'projections')} onClick={() => setActiveTab('projections')}>
                <ArrowRight size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
                Projections
              </button>
            )}
          </div>

          {/* TRENDS TAB */}
          {activeTab === 'trends' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {trends.map(trend => (
                <TrendCard key={trend.metric} trend={trend} />
              ))}
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {milestones.map((ms, i) => (
                <MilestoneRow
                  key={ms.timestamp + i}
                  milestone={ms}
                  isExpanded={expandedMilestone === ms.timestamp + i}
                  onToggle={() => setExpandedMilestone(
                    expandedMilestone === ms.timestamp + i ? null : ms.timestamp + i
                  )}
                  isLast={i === milestones.length - 1}
                />
              ))}
              {milestones.length === 0 && (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No timeline events yet.
                </div>
              )}
            </div>
          )}

          {/* STRATEGY EFFECTIVENESS TAB */}
          {activeTab === 'effectiveness' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {strategyEffects.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 40 }}>
                  <Zap size={24} color="var(--text-muted)" style={{ marginBottom: 12 }} />
                  <div>No implemented strategies with before/after data yet.</div>
                  <div style={{ marginTop: 4 }}>Implement strategies and take snapshots to track their effectiveness.</div>
                </div>
              ) : (
                strategyEffects.map((effect, i) => (
                  <EffectivenessCard key={i} effect={effect} />
                ))
              )}
            </div>
          )}

          {/* PROJECTIONS TAB */}
          {activeTab === 'projections' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                padding: '10px 16px', borderRadius: 10,
                background: 'var(--accent-blue-dim)', border: '1px solid var(--accent-blue)22',
                fontSize: 12, color: 'var(--accent-blue)', lineHeight: 1.5,
              }}>
                Projections are based on linear regression of your snapshot history. Confidence increases with more data points.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {projections.map(proj => (
                  <ProjectionCard key={proj.metric} projection={proj} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ===================================================================
//  TREND CARD
// ===================================================================

function TrendCard({ trend }: { trend: TrendLine }) {
  const dirIcon = trend.direction === 'up'
    ? <TrendingUp size={14} />
    : trend.direction === 'down'
      ? <TrendingDown size={14} />
      : <Minus size={14} />

  const dirColor = trend.isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)'
  const neutralColor = trend.direction === 'flat' ? 'var(--text-muted)' : dirColor

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {trend.label}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 12, fontWeight: 600, color: neutralColor,
        }}>
          {dirIcon}
          {fmtChange(trend.change, trend.unit)}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600,
        color: 'var(--text-primary)', marginBottom: 12,
      }}>
        {fmt(trend.current, trend.unit)}
      </div>
      <Sparkline points={trend.points} color={neutralColor} />
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        {Math.abs(trend.changePct).toFixed(1)}% {trend.direction === 'up' ? 'increase' : trend.direction === 'down' ? 'decrease' : 'change'}
        {' · '}{trend.points.length} data points
      </div>
    </div>
  )
}

// ===================================================================
//  MILESTONE ROW
// ===================================================================

function MilestoneRow({ milestone, isExpanded, onToggle, isLast }: {
  milestone: Milestone
  isExpanded: boolean
  onToggle: () => void
  isLast: boolean
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', gap: 16, padding: '14px 16px',
        background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
        border: isExpanded ? '1px solid var(--border-subtle)' : '1px solid transparent',
        borderRadius: 10, cursor: 'pointer',
        textAlign: 'left', width: '100%',
        fontFamily: 'var(--font-body)',
        transition: 'all 0.2s',
      }}
    >
      {/* Timeline dot + connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 32 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 14,
          background: milestone.color + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}>
          {milestone.icon}
        </div>
        {!isLast && (
          <div style={{ width: 2, flex: 1, background: 'var(--border-subtle)', marginTop: 4, minHeight: 12 }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
            {milestone.title}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            {new Date(milestone.timestamp).toLocaleDateString()}
          </span>
        </div>
        {isExpanded && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
            {milestone.description}
          </div>
        )}
      </div>
    </button>
  )
}

// ===================================================================
//  EFFECTIVENESS CARD
// ===================================================================

function EffectivenessCard({ effect }: { effect: StrategyEffect }) {
  const verdictColor = {
    positive: 'var(--accent-emerald)',
    negative: 'var(--accent-red)',
    neutral: 'var(--accent-gold)',
    insufficient_data: 'var(--text-muted)',
  }[effect.verdict]

  const verdictLabel = {
    positive: 'Positive Impact',
    negative: 'Needs Review',
    neutral: 'Neutral',
    insufficient_data: 'Awaiting Data',
  }[effect.verdict]

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
            {effect.strategyTitle}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Implemented {new Date(effect.implementedDate).toLocaleDateString()}
          </div>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 6,
          background: verdictColor + '18', color: verdictColor,
          fontSize: 11, fontWeight: 600,
        }}>
          {verdictLabel}
        </span>
      </div>

      {effect.verdict !== 'insufficient_data' && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <MetricPill label="Tax Burden" value={effect.taxBurdenChange} unit="$" positiveDir="down" />
          <MetricPill label="Health Score" value={effect.healthScoreChange} unit="pts" positiveDir="up" />
          <MetricPill label="Eff. Rate" value={effect.effectiveRateChange} unit="pp" positiveDir="down" />
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {effect.summary}
      </div>
    </div>
  )
}

function MetricPill({ label, value, unit, positiveDir }: {
  label: string; value: number; unit: string; positiveDir: 'up' | 'down'
}) {
  const isPositive = (value > 0 && positiveDir === 'up') || (value < 0 && positiveDir === 'down')
  const color = Math.abs(value) < 0.5 ? 'var(--text-muted)' : isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)'
  const sign = value >= 0 ? '+' : ''
  const display = unit === '$'
    ? sign + '$' + Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : sign + value.toFixed(1) + unit

  return (
    <div style={{
      padding: '6px 10px', borderRadius: 8,
      background: 'var(--bg-primary)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color }}>{display}</div>
    </div>
  )
}

// ===================================================================
//  PROJECTION CARD
// ===================================================================

function ProjectionCard({ projection }: { projection: Projection }) {
  const confColor = {
    high: 'var(--accent-emerald)',
    medium: 'var(--accent-gold)',
    low: 'var(--text-muted)',
  }[projection.confidence]

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {projection.label}
        </span>
        <span style={{ fontSize: 10, color: confColor, fontWeight: 600, textTransform: 'uppercase' }}>
          {projection.confidence} confidence
        </span>
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600,
        color: 'var(--text-primary)', marginBottom: 16,
      }}>
        {fmt(projection.current, projection.unit)}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>now</span>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { label: '3 mo', value: projection.projected3Month },
          { label: '6 mo', value: projection.projected6Month },
          { label: '12 mo', value: projection.projected12Month },
        ].map(p => {
          const diff = p.value - projection.current
          const color = Math.abs(diff) < 1 ? 'var(--text-muted)' : diff > 0 ? 'var(--accent-emerald)' : 'var(--accent-red)'
          return (
            <div key={p.label} style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color }}>
                {fmt(p.value, projection.unit)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
