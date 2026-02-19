import { useMemo, useState } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { getTaxDeadlines, getQuarterContext, type TaxDeadline } from '../engine/proactive-intelligence'
import { Calendar, Clock, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'

export function TaxCalendar() {
  const { state } = useFortuna()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  
  const now = new Date()
  const ctx = getQuarterContext(now)
  const year = now.getFullYear()

  // Cross-reference estimated payments from metamodel
  const estPayments = state.estimatedPayments || []
  
  const deadlines = useMemo(() => {
    const current = getTaxDeadlines(state, year)
    const next = getTaxDeadlines(state, year + 1)
    // Enrich payment deadlines with actual paid amounts from estimatedPayments[]
    const enriched = [...current, ...next].map(d => {
      if (d.category === 'payment' && d.date) {
        const match = estPayments.find(ep =>
          ep.dueDate === d.date || (ep.quarter && d.title?.toLowerCase().includes(`q${ep.quarter}`))
        )
        if (match) {
          const paid = match.paidAmount || 0
          const owed = match.amount || 0
          const status = paid >= owed ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
          return {
            ...d,
            description: `${d.description} | ${status === 'paid' ? 'PAID' : status === 'partial' ? `PARTIAL: $${paid.toLocaleString()} of $${owed.toLocaleString()}` : `DUE: $${owed.toLocaleString()}`}`,
            _paymentStatus: status,
          }
        }
      }
      return { ...d, _paymentStatus: undefined as string | undefined }
    })
    return enriched.sort((a, b) => a.date.localeCompare(b.date))
  }, [state, year, estPayments])
  
  const upcoming = deadlines.filter(d => {
    const dd = new Date(d.date)
    const diff = Math.ceil((dd.getTime() - now.getTime()) / 86400000)
    return diff >= -7 // include recent past (1 week)
  })
  
  const past = deadlines.filter(d => {
    const dd = new Date(d.date)
    return dd < now && Math.ceil((now.getTime() - dd.getTime()) / 86400000) > 7
  })
  
  const getDaysUntil = (dateStr: string) => {
    const d = new Date(dateStr)
    return Math.ceil((d.getTime() - now.getTime()) / 86400000)
  }
  
  const getUrgencyColor = (days: number) => {
    if (days < 0) return 'var(--text-muted)'
    if (days <= 7) return 'var(--accent-red)'
    if (days <= 30) return 'var(--accent-gold)'
    if (days <= 90) return 'var(--accent-blue, #60a5fa)'
    return 'var(--accent-emerald)'
  }
  
  const getUrgencyBg = (days: number) => {
    if (days < 0) return 'rgba(255,255,255,0.02)'
    if (days <= 7) return 'rgba(239,68,68,0.08)'
    if (days <= 30) return 'rgba(212,168,67,0.08)'
    return 'rgba(255,255,255,0.03)'
  }
  
  const categoryIcons: Record<string, string> = {
    filing: '📋', payment: '💰', election: '📝', extension: '⏳', contribution: '🏦',
  }
  
  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Calendar size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            Tax Calendar
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          {ctx.quarterSummary || `Q${ctx.quarter} • ${ctx.daysLeftInYear} days left in ${year}`}
        </p>
      </div>
      
      {/* Quarter Progress */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32,
      }}>
        {[1, 2, 3, 4].map(q => {
          const isActive = q === ctx.quarter
          return (
            <div key={q} style={{
              padding: 16,
              background: isActive ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
              border: `1px solid ${isActive ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
              borderRadius: 12,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
                Q{q}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][q - 1]}
              </div>
              {isActive && (
                <div style={{ fontSize: 11, color: 'var(--accent-gold)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                  {ctx.daysLeftInQuarter}d left
                </div>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Upcoming Deadlines */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} style={{ color: 'var(--accent-gold)' }} />
          Upcoming Deadlines
        </div>
        
        {upcoming.length === 0 ? (
          <div style={{ padding: 24, background: 'var(--bg-elevated)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
            No upcoming deadlines found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(deadline => {
              const days = getDaysUntil(deadline.date)
              const urgencyColor = getUrgencyColor(days)
              const isExpanded = expandedId === deadline.id
              const isPast = days < 0
              
              return (
                <div key={deadline.id} style={{
                  background: getUrgencyBg(days),
                  border: `1px solid ${isPast ? 'var(--border-subtle)' : urgencyColor}22`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  opacity: isPast ? 0.6 : 1,
                }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : deadline.id)}
                    style={{
                      width: '100%', border: 'none', background: 'transparent', cursor: 'pointer',
                      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left',
                    }}
                  >
                    {/* Category icon */}
                    <span style={{ fontSize: 20 }}>{categoryIcons[deadline.category] || '📅'}</span>
                    
                    {/* Main content */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {deadline.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {deadline.description}
                      </div>
                    </div>
                    
                    {/* Date & countdown */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                        {new Date(deadline.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: urgencyColor, marginTop: 2,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {isPast ? `${Math.abs(days)}d ago` : days === 0 ? 'TODAY' : `${days}d`}
                      </div>
                    </div>
                    
                    {/* Expand toggle */}
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </button>
                  
                  {/* Expanded action items */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 20px 16px 56px',
                      borderTop: '1px solid var(--border-subtle)',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Action Items
                      </div>
                      {deadline.actionItems.map((item, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', fontSize: 13, color: 'var(--text-secondary)',
                        }}>
                          <span style={{ width: 14, height: 14, border: '1.5px solid var(--border-subtle)', borderRadius: 3, flexShrink: 0, marginTop: 2 }} />
                          {item}
                        </div>
                      ))}
                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                          background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)',
                        }}>
                          {deadline.category}
                        </span>
                        {deadline.appliesTo.filter(a => a !== 'all').map(a => (
                          <span key={a} style={{
                            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                            background: 'var(--accent-gold-dim)', color: 'var(--accent-gold)',
                          }}>
                            {a.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Past deadlines toggle */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(!showPast)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', marginBottom: 12,
            }}
          >
            {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {past.length} past deadline{past.length > 1 ? 's' : ''}
          </button>
          
          {showPast && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.5 }}>
              {past.map(d => (
                <div key={d.id} style={{
                  padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{d.name}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
