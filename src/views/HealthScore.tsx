import { useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateHealthReport, type HealthDimension, type HealthGrade } from '../engine/health-score'
import { Activity, TrendingUp, AlertCircle, CheckCircle, Zap, ArrowRight } from 'lucide-react'
import type { ViewKey } from '../App'

function gradeColor(grade: HealthGrade): string {
  if (grade.startsWith('A')) return '#10b981'
  if (grade.startsWith('B')) return '#3b82f6'
  if (grade.startsWith('C')) return '#f59e0b'
  if (grade.startsWith('D')) return '#ef4444'
  return '#dc2626'
}

function ScoreRing({ score, grade, size = 160 }: { score: number; grade: HealthGrade; size?: number }) {
  const color = gradeColor(grade)
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--bg-primary)" strokeWidth={8}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.28, fontWeight: 700, color }}>
          {grade}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: size * 0.12, color: 'var(--text-muted)' }}>
          {score}/100
        </div>
      </div>
    </div>
  )
}

function RadarChart({ dimensions }: { dimensions: HealthDimension[] }) {
  const size = 240
  const center = size / 2
  const maxRadius = size * 0.38
  const n = dimensions.length
  const angleStep = (2 * Math.PI) / n

  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2
    const r = (value / 100) * maxRadius
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) }
  }

  const gridLevels = [25, 50, 75, 100]
  const dataPoints = dimensions.map((d, i) => getPoint(i, d.score))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map(level => {
        const points = dimensions.map((_, i) => getPoint(i, level))
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
        return <path key={level} d={path} fill="none" stroke="var(--border-subtle)" strokeWidth={0.5} />
      })}

      {/* Axes */}
      {dimensions.map((_, i) => {
        const p = getPoint(i, 100)
        return <line key={i} x1={center} y1={center} x2={p.x} y2={p.y} stroke="var(--border-subtle)" strokeWidth={0.5} />
      })}

      {/* Data area */}
      <path d={dataPath} fill="rgba(212,175,55,0.12)" stroke="var(--accent-gold)" strokeWidth={2} />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={dimensions[i].color} stroke="var(--bg-elevated)" strokeWidth={2} />
      ))}

      {/* Labels */}
      {dimensions.map((d, i) => {
        const labelRadius = maxRadius + 28
        const angle = angleStep * i - Math.PI / 2
        const lx = center + labelRadius * Math.cos(angle)
        const ly = center + labelRadius * Math.sin(angle)
        return (
          <text
            key={i} x={lx} y={ly}
            textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            {d.icon} {d.name.split(' ')[0]}
          </text>
        )
      })}
    </svg>
  )
}

export function HealthScore({ onNavigate }: { onNavigate?: (view: ViewKey) => void }) {
  const { state } = useFortuna()
  const report = useMemo(() => generateHealthReport(state), [state])

  const viewMapping: Record<string, ViewKey> = {
    'tax_efficiency': 'tax',
    'entity_structure': 'optimizer' as ViewKey,
    'audit_readiness': 'audit',
    'diversification': 'revenue',
    'retirement': 'tax',
    'cashflow': 'cashflow',
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Activity size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            Financial Health Score
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Composite assessment across six key financial dimensions
        </p>
      </div>

      {/* Score + Radar */}
      <div style={{
        display: 'flex', gap: 32, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
        padding: 32, background: 'var(--bg-elevated)', borderRadius: 20,
        border: '1px solid var(--border-subtle)', marginBottom: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <ScoreRing score={report.overallScore} grade={report.overallGrade} size={180} />
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            {report.strengthsSummary}
          </div>
        </div>

        <RadarChart dimensions={report.dimensions} />
      </div>

      {/* Quick Actions */}
      {(report.quickWins.length > 0 || report.riskFlags.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {report.quickWins.length > 0 && (
            <div style={{
              padding: 20, background: 'rgba(16,185,129,0.06)', borderRadius: 14,
              border: '1px solid rgba(16,185,129,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Zap size={16} style={{ color: '#10b981' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Quick Wins</div>
              </div>
              {report.quickWins.map((w, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, paddingLeft: 24 }}>
                  • {w}
                </div>
              ))}
            </div>
          )}

          {report.riskFlags.length > 0 && (
            <div style={{
              padding: 20, background: 'rgba(239,68,68,0.06)', borderRadius: 14,
              border: '1px solid rgba(239,68,68,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertCircle size={16} style={{ color: '#ef4444' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Risk Flags</div>
              </div>
              {report.riskFlags.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, paddingLeft: 24 }}>
                  ⚠ {f}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dimension Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {report.dimensions.map(dim => (
          <div key={dim.id} style={{
            padding: 20, background: 'var(--bg-elevated)', borderRadius: 14,
            border: '1px solid var(--border-subtle)',
            borderLeft: `4px solid ${dim.color}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{dim.icon}</span> {dim.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{dim.status}</div>
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: dim.color,
              }}>
                {dim.grade}
              </div>
            </div>

            {/* Score bar */}
            <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3, marginBottom: 10 }}>
              <div style={{
                height: '100%', width: `${dim.score}%`, background: dim.color,
                borderRadius: 3, transition: 'width 0.8s ease',
              }} />
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              {dim.detail}
            </div>

            {dim.recommendations.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                {dim.recommendations.slice(0, 2).map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 6, fontSize: 11, color: dim.color,
                    marginBottom: 4, fontWeight: 500,
                  }}>
                    <ArrowRight size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {r}
                  </div>
                ))}
              </div>
            )}

            {viewMapping[dim.id] && onNavigate && (
              <button
                onClick={() => onNavigate(viewMapping[dim.id])}
                style={{
                  marginTop: 8, padding: '5px 12px', borderRadius: 6,
                  border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
                  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, fontWeight: 500,
                }}
              >
                Explore →
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Top Priority */}
      <div style={{
        marginTop: 24, padding: 20, background: 'var(--accent-gold-dim)', borderRadius: 14,
        border: '1px solid rgba(212,175,55,0.2)', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <TrendingUp size={20} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-gold)', marginBottom: 2 }}>
            #1 Priority Action
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {report.topPriority}
          </div>
        </div>
      </div>
    </div>
  )
}
