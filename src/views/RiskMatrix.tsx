import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { analyzeAuditRisk } from '../engine/audit-risk'
import {
  Shield, AlertTriangle, CheckCircle2, TrendingDown, Eye, Lock, Umbrella,
  FileWarning, ChevronDown, ChevronRight, Activity, Target, Zap
} from 'lucide-react'

const severityColors: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: 'var(--accent-red-dim)', color: 'var(--accent-red)', border: 'rgba(239,107,107,0.3)' },
  high: { bg: 'rgba(251,191,36,0.12)', color: 'var(--accent-amber)', border: 'rgba(251,191,36,0.3)' },
  medium: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', border: 'rgba(96,165,250,0.3)' },
  low: { bg: 'var(--accent-purple-dim)', color: 'var(--accent-purple)', border: 'rgba(167,139,250,0.3)' },
}

const catIcons: Record<string, React.ReactNode> = {
  Revenue: <TrendingDown size={16} />,
  Legal: <Shield size={16} />,
  Tax: <FileWarning size={16} />,
  Financial: <Lock size={16} />,
  Protection: <Umbrella size={16} />,
  Compliance: <Eye size={16} />,
}

type Tab = 'matrix' | 'list' | 'audit'

export function RiskMatrix() {
  const { risks, healthScore, state } = useFortuna()
  const [activeTab, setActiveTab] = useState<Tab>('matrix')
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  const auditRisk = useMemo(() => analyzeAuditRisk(state), [state])

  const critHigh = risks.filter(r => r.severity === 'critical' || r.severity === 'high').length
  const protectionScore = healthScore.components.riskProtection

  const heatmapRisks = useMemo(() => {
    return risks.map(r => {
      const impact = r.score >= 80 ? 5 : r.score >= 60 ? 4 : r.score >= 40 ? 3 : r.score >= 20 ? 2 : 1
      const probability = r.severity === 'critical' ? 5 : r.severity === 'high' ? 4 : r.severity === 'medium' ? 3 : r.severity === 'low' ? 2 : 1
      return { ...r, impact, probability }
    })
  }, [risks])

  const gridData = useMemo(() => {
    const grid: Record<string, typeof heatmapRisks> = {}
    for (let p = 1; p <= 5; p++) {
      for (let i = 1; i <= 5; i++) {
        grid[`${p}-${i}`] = heatmapRisks.filter(r => r.probability === p && r.impact === i)
      }
    }
    return grid
  }, [heatmapRisks])

  const getCellColor = (prob: number, impact: number): string => {
    const score = prob * impact
    if (score >= 16) return 'rgba(239,68,68,0.35)'
    if (score >= 10) return 'rgba(249,115,22,0.30)'
    if (score >= 6) return 'rgba(245,158,11,0.25)'
    if (score >= 3) return 'rgba(96,165,250,0.20)'
    return 'rgba(16,185,129,0.12)'
  }

  const getCellBorder = (prob: number, impact: number): string => {
    const score = prob * impact
    if (score >= 16) return 'rgba(239,68,68,0.5)'
    if (score >= 10) return 'rgba(249,115,22,0.4)'
    if (score >= 6) return 'rgba(245,158,11,0.3)'
    return 'rgba(255,255,255,0.06)'
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'matrix', label: 'Heatmap', icon: <Target size={13} /> },
    { key: 'list', label: 'Risk Register', icon: <Activity size={13} /> },
    { key: 'audit', label: 'Audit Risk', icon: <Shield size={13} /> },
  ]

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title">Risk Intelligence</h1>
          <span className="pill gold"><Shield size={11} /> {risks.length} Tracked</span>
          {critHigh > 0 && (
            <span className="pill" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={11} /> {critHigh} Critical/High
            </span>
          )}
        </div>
        <p className="section-subtitle">Probability x impact risk heatmap, audit risk profiling, and mitigation playbooks</p>
      </div>

      <div className="grid-4 stagger" style={{ marginBottom: 24 }}>
        <div className="metric-card" style={{ borderColor: critHigh > 0 ? 'rgba(239,107,107,0.2)' : 'var(--border-subtle)' }}>
          <span className="metric-label">Critical / High</span>
          <div className="metric-value" style={{ color: critHigh > 0 ? 'var(--accent-red)' : 'var(--accent-emerald)' }}>{critHigh}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{critHigh > 0 ? 'Require attention' : 'All clear'}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Protection Score</span>
          <div className="metric-value" style={{ color: protectionScore >= 60 ? 'var(--accent-emerald)' : 'var(--accent-gold)' }}>{protectionScore}/100</div>
          <div className="progress-bar" style={{ marginTop: 8 }}><div className="progress-fill" style={{ width: `${protectionScore}%`, background: protectionScore >= 60 ? 'var(--accent-emerald)' : 'var(--accent-gold)' }} /></div>
        </div>
        <div className="metric-card">
          <span className="metric-label">Audit Risk Score</span>
          <div className="metric-value" style={{ color: auditRisk.overallScore >= 50 ? '#ef4444' : auditRisk.overallScore >= 30 ? '#f59e0b' : '#10b981' }}>
            {auditRisk.overallScore}/100
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{auditRisk.riskLevel.replace('-', ' ')}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Actionable</span>
          <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{risks.filter(r => r.actionable).length}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>of {risks.length} total risks</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)',
            display: 'flex', alignItems: 'center', gap: 6,
            background: activeTab === tab.key ? 'var(--accent-gold)' : 'var(--bg-elevated)',
            color: activeTab === tab.key ? '#0c0e12' : 'var(--text-muted)',
            transition: 'all 0.2s',
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'matrix' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20 }}>
              <div style={{
                transform: 'rotate(-90deg)', whiteSpace: 'nowrap',
                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>Probability</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', gap: 4 }}>
                <div />
                {['Very Low', 'Low', 'Medium', 'High', 'Critical'].map(label => (
                  <div key={label} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', padding: '4px 0', fontWeight: 500 }}>{label}</div>
                ))}
                {[5, 4, 3, 2, 1].map(prob => (
                  <div key={`row-${prob}`} style={{ display: 'contents' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 10, color: 'var(--text-muted)', paddingRight: 8, fontWeight: 500 }}>
                      {prob === 5 ? 'Certain' : prob === 4 ? 'Likely' : prob === 3 ? 'Possible' : prob === 2 ? 'Unlikely' : 'Rare'}
                    </div>
                    {[1, 2, 3, 4, 5].map(impact => {
                      const cellKey = `${prob}-${impact}`
                      const cellRisks = gridData[cellKey] || []
                      const isHovered = hoveredCell === cellKey
                      return (
                        <div key={cellKey}
                          onMouseEnter={() => setHoveredCell(cellKey)}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            position: 'relative', minHeight: 56, borderRadius: 8,
                            background: getCellColor(prob, impact),
                            border: `1px solid ${isHovered ? 'var(--accent-gold)' : getCellBorder(prob, impact)}`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 4, padding: 6, cursor: cellRisks.length > 0 ? 'pointer' : 'default',
                            transition: 'all 0.2s', transform: isHovered && cellRisks.length > 0 ? 'scale(1.05)' : 'scale(1)',
                          }}
                        >
                          {cellRisks.length > 0 ? (
                            <>
                              <div style={{
                                fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
                                color: prob * impact >= 16 ? '#ef4444' : prob * impact >= 10 ? '#f97316' : prob * impact >= 6 ? '#f59e0b' : '#60a5fa',
                              }}>{cellRisks.length}</div>
                              <div style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>
                                {cellRisks[0].name.slice(0, 16)}{cellRisks.length > 1 ? ` +${cellRisks.length - 1}` : ''}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.1)' }}>-</div>
                          )}
                          {isHovered && cellRisks.length > 0 && (
                            <div style={{
                              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                              marginTop: 8, padding: '10px 14px', background: '#1a1d24',
                              border: '1px solid var(--border-subtle)', borderRadius: 10,
                              zIndex: 10, minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            }}>
                              {cellRisks.map(r => (
                                <div key={r.id} style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 4 }}>
                                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                                  <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>Score: {r.score}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Impact
              </div>
            </div>
            <div style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 24 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Risk Zones</div>
              {[
                { label: 'Critical (16-25)', color: 'rgba(239,68,68,0.35)' },
                { label: 'High (10-15)', color: 'rgba(249,115,22,0.30)' },
                { label: 'Moderate (6-9)', color: 'rgba(245,158,11,0.25)' },
                { label: 'Low (3-5)', color: 'rgba(96,165,250,0.20)' },
                { label: 'Minimal (1-2)', color: 'rgba(16,185,129,0.12)' },
              ].map(z => (
                <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: z.color }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{z.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {risks.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add financial data to generate risk analysis.</p>
            </div>
          )}
          {risks.map(risk => {
            const sev = severityColors[risk.severity]
            const isExpanded = expandedRisk === risk.id
            return (
              <div key={risk.id} className="card" style={{ overflow: 'hidden' }}>
                <button onClick={() => setExpandedRisk(isExpanded ? null : risk.id)} style={{
                  width: '100%', padding: '18px 24px', display: 'flex', gap: 16, alignItems: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: sev.bg, border: `1px solid ${sev.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: sev.color, flexShrink: 0,
                  }}>
                    {catIcons[risk.category] || <AlertTriangle size={16} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{risk.name}</span>
                      <span className="pill" style={{ background: sev.bg, color: sev.color, borderColor: sev.border, fontSize: 10, textTransform: 'uppercase' }}>{risk.severity}</span>
                      <span className="pill gold" style={{ fontSize: 10 }}>{risk.category}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{risk.description}</p>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'center', width: 56 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      border: `3px solid ${sev.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: sev.color,
                    }}>{risk.score}</div>
                  </div>
                  {isExpanded ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                </button>
                {isExpanded && (
                  <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                      <div style={{ padding: 14, background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)' }}>
                        <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Risk Detail</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{risk.description}</div>
                      </div>
                      <div style={{ padding: 14, background: 'rgba(16,185,129,0.06)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.15)' }}>
                        <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Mitigation</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{risk.mitigation}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 24, marginBottom: 24, alignItems: 'center' }}>
              <div style={{
                width: 100, height: 100, borderRadius: '50%',
                border: `4px solid ${auditRisk.overallScore >= 50 ? '#ef4444' : auditRisk.overallScore >= 30 ? '#f59e0b' : '#10b981'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: auditRisk.overallScore >= 50 ? '#ef4444' : auditRisk.overallScore >= 30 ? '#f59e0b' : '#10b981' }}>
                  {auditRisk.overallScore}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Risk</div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{auditRisk.riskLabel}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  Baseline rate: <strong>{(auditRisk.baselineAuditRate * 100).toFixed(2)}%</strong> |
                  Adjusted: <strong style={{ color: auditRisk.overallScore >= 50 ? '#ef4444' : '#10b981' }}>{(auditRisk.adjustedAuditRate * 100).toFixed(2)}%</strong> |
                  Red: <strong style={{ color: '#ef4444' }}>{auditRisk.redFlagCount}</strong> |
                  Yellow: <strong style={{ color: '#f59e0b' }}>{auditRisk.yellowFlagCount}</strong>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditRisk.triggers.filter(t => t.triggered).map(trigger => {
                const sevMap: Record<string, { bg: string; text: string }> = {
                  critical: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
                  high: { bg: 'rgba(249,115,22,0.12)', text: '#f97316' },
                  medium: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
                  low: { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
                }
                const s = sevMap[trigger.severity]
                const isExp = expandedRisk === trigger.id
                return (
                  <div key={trigger.id} style={{ borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
                    <button onClick={() => setExpandedRisk(isExp ? null : trigger.id)} style={{
                      width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: s.bg, color: s.text, textTransform: 'uppercase', flexShrink: 0 }}>
                        {trigger.severity}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{trigger.name}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: s.text }}>{trigger.riskScore}/100</span>
                      {isExp ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                    </button>
                    {isExp && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12, marginBottom: 10 }}>{trigger.description}</div>
                        <div style={{ padding: '10px 14px', background: 'rgba(96,165,250,0.06)', borderRadius: 8, border: '1px solid rgba(96,165,250,0.15)', marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>IRS Context</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{trigger.irsContext}</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.15)' }}>
                          <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Mitigation</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{trigger.mitigation}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--accent-gold-dim)', borderRadius: 10, border: '1px solid rgba(212,168,67,0.2)' }}>
              <div style={{ fontSize: 10, color: 'var(--accent-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Priority Actions</div>
              {auditRisk.topRecommendations.map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <CheckCircle2 size={13} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
