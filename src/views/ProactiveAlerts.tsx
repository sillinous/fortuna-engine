import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateProactiveAlerts, getFinancialPulse, getQuarterContext, type ProactiveAlert, type AlertSeverity } from '../engine/proactive-intelligence'
import { Bell, AlertTriangle, Zap, Info, Clock, ChevronDown, ChevronUp, ExternalLink, X, TrendingUp } from 'lucide-react'
import type { ViewKey } from '../App'

const severityConfig: Record<AlertSeverity, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  urgent: { label: 'URGENT', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', icon: <AlertTriangle size={16} /> },
  warning: { label: 'WARNING', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: <AlertTriangle size={16} /> },
  opportunity: { label: 'OPPORTUNITY', color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: <TrendingUp size={16} /> },
  info: { label: 'INFO', color: '#6b7280', bg: 'rgba(107,114,128,0.06)', icon: <Info size={16} /> },
}

export function ProactiveAlerts({ onNavigate }: { onNavigate?: (view: ViewKey) => void }) {
  const { state } = useFortuna()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<AlertSeverity | 'all'>('all')
  
  const alerts = useMemo(() => generateProactiveAlerts(state), [state])
  const pulse = useMemo(() => getFinancialPulse(state), [state])
  const ctx = getQuarterContext()
  
  const visibleAlerts = alerts.filter(a => !dismissedIds.has(a.id) && (filter === 'all' || a.severity === filter))
  const urgentCount = alerts.filter(a => a.severity === 'urgent').length
  const warningCount = alerts.filter(a => a.severity === 'warning').length
  const oppCount = alerts.filter(a => a.severity === 'opportunity').length
  
  const dismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]))
  }
  
  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Bell size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            Intelligence Feed
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Proactive monitoring • Time-sensitive alerts • Optimization opportunities
        </p>
      </div>
      
      {/* Financial Pulse */}
      <div style={{
        padding: 24, background: 'var(--bg-elevated)', borderRadius: 16,
        border: '1px solid var(--border-subtle)', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Financial Pulse
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: urgentCount > 0 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
              {pulse.headline}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {pulse.subheadline}
            </div>
          </div>
          
          {pulse.nextDeadline && (
            <div style={{
              textAlign: 'right', padding: '10px 16px', background: 'var(--bg-primary)',
              borderRadius: 10, border: '1px solid var(--border-subtle)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Next Deadline
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: pulse.nextDeadline.daysUntil <= 14 ? 'var(--accent-red)' : 'var(--accent-gold)' }}>
                {pulse.nextDeadline.daysUntil}d
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {pulse.nextDeadline.name}
              </div>
            </div>
          )}
        </div>
        
        {/* Quarter context bar */}
        <div style={{
          marginTop: 16, padding: '10px 14px', background: 'var(--bg-primary)', borderRadius: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          <span>{pulse.quarterSummary}</span>
          {pulse.estimatedSavingsAvailable > 0 && (
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
              ${Math.round(pulse.estimatedSavingsAvailable).toLocaleString()} savings potential
            </span>
          )}
        </div>
      </div>
      
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'all', label: `All (${alerts.length})` },
          { key: 'urgent', label: `Urgent (${urgentCount})` },
          { key: 'warning', label: `Warning (${warningCount})` },
          { key: 'opportunity', label: `Opportunity (${oppCount})` },
          { key: 'info', label: 'Info' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: filter === tab.key ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
              color: filter === tab.key ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Alerts List */}
      {visibleAlerts.length === 0 ? (
        <div style={{
          padding: 48, textAlign: 'center', background: 'var(--bg-elevated)',
          borderRadius: 16, border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {filter !== 'all' ? 'No alerts in this category' : 'No active alerts'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {filter !== 'all' ? 'Try viewing all alerts' : 'Your financial position is being monitored'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleAlerts.map(alert => {
            const config = severityConfig[alert.severity]
            const isExpanded = expandedId === alert.id
            
            return (
              <div key={alert.id} style={{
                background: config.bg,
                border: `1px solid ${config.color}22`,
                borderRadius: 14,
                borderLeft: `4px solid ${config.color}`,
                overflow: 'hidden',
              }}>
                {/* Alert header */}
                <div style={{
                  padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer',
                }} onClick={() => setExpandedId(isExpanded ? null : alert.id)}>
                  <div style={{ color: config.color, marginTop: 2, flexShrink: 0 }}>
                    {config.icon}
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                        padding: '2px 8px', borderRadius: 4,
                        color: config.color, background: `${config.color}15`,
                      }}>
                        {config.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {alert.category}
                      </span>
                      {alert.daysUntilDeadline !== undefined && (
                        <span style={{ fontSize: 11, color: config.color, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {alert.daysUntilDeadline}d
                        </span>
                      )}
                    </div>
                    
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {alert.message}
                    </div>
                    
                    {alert.impactLabel && (
                      <div style={{
                        marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 6,
                        background: 'var(--bg-elevated)', fontSize: 12, fontFamily: 'var(--font-mono)',
                        fontWeight: 600, color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}>
                        <Zap size={12} style={{ color: config.color }} />
                        {alert.impactLabel}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(alert.id) }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                      }}
                    >
                      <X size={14} />
                    </button>
                    <span style={{ color: 'var(--text-muted)', padding: 4 }}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>
                
                {/* Expanded reasoning */}
                {isExpanded && (
                  <div style={{
                    padding: '0 20px 16px 50px', borderTop: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                        Analysis
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {alert.reasoning}
                      </div>
                    </div>
                    
                    {(alert.action || alert.actionView) && onNavigate && (
                      <button
                        onClick={() => alert.actionView && onNavigate(alert.actionView as ViewKey)}
                        style={{
                          marginTop: 12, padding: '8px 16px', borderRadius: 8,
                          border: `1px solid ${config.color}30`, background: `${config.color}10`,
                          color: config.color, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        {alert.action || 'Take Action'} <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
