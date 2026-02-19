import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateTimeline, groupByQuarter, type TimelineAction } from '../engine/execution-timeline'
import {
  Calendar, Clock, AlertTriangle, CheckCircle2, ChevronDown,
  FileText, DollarSign, Building2, Shield, PiggyBank, Eye, Zap
} from 'lucide-react'

const statusColors: Record<string, { bg: string; color: string; label: string }> = {
  overdue: { bg: 'var(--accent-red-dim)', color: 'var(--accent-red)', label: 'Overdue' },
  urgent: { bg: 'rgba(251,191,36,0.12)', color: 'var(--accent-amber)', label: 'Urgent' },
  upcoming: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', label: 'Upcoming' },
  completed: { bg: 'var(--accent-emerald-dim)', color: 'var(--accent-emerald)', label: 'Completed' },
}

const catIcons: Record<string, React.ReactNode> = {
  tax: <DollarSign size={15} />,
  entity: <Building2 size={15} />,
  compliance: <FileText size={15} />,
  retirement: <PiggyBank size={15} />,
  deduction: <Eye size={15} />,
  risk: <Shield size={15} />,
  revenue: <Zap size={15} />,
}

export function ExecutionTimeline() {
  const { state } = useFortuna()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  const actions = useMemo(() => generateTimeline(state), [state])
  const quarters = useMemo(() => groupByQuarter(actions), [actions])

  const hasData = state.incomeStreams.length > 0

  const toggleComplete = (id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const urgentCount = actions.filter(a => a.status === 'urgent' || a.status === 'overdue').length
  const totalImpact = actions.reduce((s, a) => s + a.estimatedImpact, 0)

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Calendar size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Execution Timeline</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add your financial data to generate a personalized execution plan with real deadlines.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title">Execution Timeline</h1>
          <span className="pill gold"><Calendar size={11} /> Deadline-Aware</span>
        </div>
        <p className="section-subtitle">Sequenced action plan with real IRS deadlines — strategies don't matter if you miss the filing window</p>
      </div>

      {/* Summary */}
      <div className="grid-4 stagger" style={{ marginBottom: 28 }}>
        <div className="metric-card" style={{ borderColor: urgentCount > 0 ? 'rgba(251,191,36,0.2)' : 'var(--border-subtle)' }}>
          <span className="metric-label">Urgent Actions</span>
          <div className="metric-value" style={{ color: urgentCount > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>{urgentCount}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{urgentCount > 0 ? 'Require immediate attention' : 'All clear'}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Actions</span>
          <div className="metric-value">{actions.length}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{completedIds.size} completed</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Combined Impact</span>
          <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>${totalImpact.toLocaleString()}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Annual savings/optimization</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Quarters Covered</span>
          <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{quarters.length}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{quarters[0]?.quarter} → {quarters[quarters.length - 1]?.quarter}</span>
        </div>
      </div>

      {/* Quarter blocks */}
      {quarters.map((quarter, qi) => (
        <div key={quarter.quarter} style={{ marginBottom: 32 }}>
          {/* Quarter header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: qi === 0 ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
              border: `1px solid ${qi === 0 ? 'rgba(212,168,67,0.2)' : 'var(--border-subtle)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
              color: qi === 0 ? 'var(--accent-gold)' : 'var(--text-secondary)',
            }}>
              {quarter.quarter.replace(' 20', "'").replace('Q', 'Q')}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{quarter.quarter}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {quarter.actions.length} action{quarter.actions.length !== 1 ? 's' : ''}
                {quarter.totalImpact > 0 && <span> · <span style={{ color: 'var(--accent-emerald)' }}>${quarter.totalImpact.toLocaleString()} impact</span></span>}
              </div>
            </div>
            {/* Timeline line */}
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 24 }}>
            {quarter.actions.map(action => {
              const isCompleted = completedIds.has(action.id)
              const isExpanded = expanded === action.id
              const sc = isCompleted ? statusColors.completed : statusColors[action.status]

              return (
                <div key={action.id} className="card" style={{
                  opacity: isCompleted ? 0.6 : 1,
                  borderColor: action.status === 'urgent' && !isCompleted ? 'rgba(251,191,36,0.2)' : action.status === 'overdue' && !isCompleted ? 'rgba(239,107,107,0.2)' : 'var(--border-subtle)',
                }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute', left: -36, top: 22,
                    width: 12, height: 12, borderRadius: '50%',
                    background: isCompleted ? 'var(--accent-emerald)' : sc.bg,
                    border: `2px solid ${isCompleted ? 'var(--accent-emerald)' : sc.color}`,
                  }} />

                  <div onClick={() => setExpanded(isExpanded ? null : action.id)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Checkbox */}
                    <button onClick={e => { e.stopPropagation(); toggleComplete(action.id) }}
                      style={{
                        width: 24, height: 24, borderRadius: 6,
                        border: `2px solid ${isCompleted ? 'var(--accent-emerald)' : 'var(--border-medium)'}`,
                        background: isCompleted ? 'var(--accent-emerald)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0,
                      }}>
                      {isCompleted && <CheckCircle2 size={14} color="#0c0e12" />}
                    </button>

                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: sc.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: sc.color, flexShrink: 0,
                    }}>
                      {catIcons[action.category] || <Calendar size={15} />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, textDecoration: isCompleted ? 'line-through' : 'none' }}>{action.title}</span>
                        <span className="pill" style={{ background: sc.bg, color: sc.color, borderColor: 'transparent', fontSize: 10 }}>{isCompleted ? 'Done' : sc.label}</span>
                        {action.irsForm && <span className="pill gold" style={{ fontSize: 10 }}>{action.irsForm}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        {action.deadlineLabel}
                        {action.daysUntilDeadline > 0 && !isCompleted && <span> · {action.daysUntilDeadline} days remaining</span>}
                        {action.daysUntilDeadline < 0 && !isCompleted && <span style={{ color: 'var(--accent-red)' }}> · {Math.abs(action.daysUntilDeadline)} days overdue</span>}
                      </div>
                    </div>

                    {/* Impact */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: action.estimatedImpact > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                        {action.impactLabel}
                      </div>
                    </div>

                    <ChevronDown size={14} color="var(--text-muted)" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : '', flexShrink: 0 }} />
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 20px 20px 74px', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>{action.description}</p>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Steps</div>
                      {action.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                          }}>{i + 1}</div>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
