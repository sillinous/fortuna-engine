import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { analyzeAuditRisk, type AuditTrigger, type AuditRiskProfile } from '../engine/audit-risk'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, ChevronDown,
  ChevronUp, FileText, Eye, AlertCircle, Info, Target, Gauge,
  TrendingDown, Lock, Fingerprint, ClipboardCheck, Scale,
  ShieldX, ShieldQuestion, ArrowRight
} from 'lucide-react'

type Tab = 'overview' | 'triggers' | 'documentation' | 'mitigation'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Risk Overview', icon: <Gauge size={14} /> },
  { key: 'triggers', label: 'Audit Triggers', icon: <AlertTriangle size={14} /> },
  { key: 'documentation', label: 'Documentation', icon: <ClipboardCheck size={14} /> },
  { key: 'mitigation', label: 'Mitigation Plan', icon: <ShieldCheck size={14} /> },
]

const severityConfig: Record<string, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'CRITICAL', icon: <ShieldX size={14} /> },
  high: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'HIGH', icon: <AlertTriangle size={14} /> },
  medium: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: 'MEDIUM', icon: <ShieldQuestion size={14} /> },
  low: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'LOW', icon: <ShieldCheck size={14} /> },
}

const categoryLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  income: { label: 'Income', icon: <Target size={13} /> },
  deductions: { label: 'Deductions', icon: <TrendingDown size={13} /> },
  credits: { label: 'Credits', icon: <Scale size={13} /> },
  reporting: { label: 'Reporting', icon: <FileText size={13} /> },
  entity: { label: 'Entity', icon: <Lock size={13} /> },
  lifestyle: { label: 'Lifestyle', icon: <Fingerprint size={13} /> },
}

function pctStr(n: number): string { return `${(n * 100).toFixed(2)}%` }

export function AuditProfiler() {
  const { state } = useFortuna()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const hasData = state.incomeStreams.length > 0
  const profile = useMemo(() => analyzeAuditRisk(state), [state])

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <ShieldAlert size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Audit Risk Profiler</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add your financial data first to analyze IRS audit triggers and risk exposure.</p>
        </div>
      </div>
    )
  }

  const riskColor = profile.overallScore >= 50 ? '#ef4444'
    : profile.overallScore >= 35 ? '#f59e0b'
    : profile.overallScore >= 20 ? '#60a5fa'
    : '#10b981'

  const filteredTriggers = categoryFilter
    ? profile.triggers.filter(t => t.category === categoryFilter)
    : profile.triggers

  const triggeredTriggers = profile.triggers.filter(t => t.triggered)
  const categories = [...new Set(profile.triggers.map(t => t.category))]

  return (
    <div className="view-enter">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title">Audit Risk Profiler</h1>
          <span className="pill" style={{ background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}33` }}>
            <ShieldAlert size={11} /> {profile.riskLevel.replace('-', ' ').toUpperCase()}
          </span>
        </div>
        <p className="section-subtitle">IRS audit trigger analysis based on DIF scoring factors, published audit rates, and known examination criteria.</p>
      </div>

      {/* ── Top Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Risk Score', value: `${profile.overallScore}`, sub: '/100', color: riskColor, big: true },
          { label: 'National Audit Rate', value: pctStr(profile.baselineAuditRate), sub: 'for your income level', color: 'var(--accent-blue)' },
          { label: 'Your Adjusted Rate', value: pctStr(profile.adjustedAuditRate), sub: 'estimated with triggers', color: profile.adjustedAuditRate > profile.baselineAuditRate * 1.5 ? '#f59e0b' : 'var(--accent-emerald)' },
          { label: 'Red Flags', value: `${profile.redFlagCount}`, sub: 'critical+high', color: profile.redFlagCount > 0 ? '#ef4444' : 'var(--accent-emerald)' },
          { label: 'Checks Passed', value: `${profile.totalChecks - profile.triggeredCount}/${profile.totalChecks}`, sub: 'clean triggers', color: 'var(--accent-emerald)' },
        ].map((m, i) => (
          <div key={i} style={{
            padding: '16px 14px', borderRadius: 14, background: 'var(--bg-elevated)',
            border: `1px solid ${i === 0 ? `${riskColor}33` : 'var(--border-subtle)'}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, marginBottom: 8 }}>{m.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: m.big ? 28 : 20, fontWeight: 700, color: m.color }}>{m.value}</span>
              {m.sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-subtle)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: '10px 10px 0 0',
              border: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--accent-gold)' : '2px solid transparent',
              background: activeTab === tab.key ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-gold)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)', transition: 'all 0.2s',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: OVERVIEW ══════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Risk Gauge + Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Gauge Card */}
            <div className="card">
              <div className="card-header"><span className="card-title">Audit Risk Assessment</span></div>
              <div className="card-body" style={{ padding: '24px', textAlign: 'center' }}>
                <RiskGauge score={profile.overallScore} color={riskColor} />
                <div style={{ marginTop: 16, fontSize: 14, fontWeight: 500, color: riskColor }}>{profile.riskLabel}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 360, margin: '8px auto 0' }}>
                  Based on {profile.totalChecks} IRS audit trigger checks against your financial profile. 
                  {profile.triggeredCount > 0
                    ? ` ${profile.triggeredCount} trigger${profile.triggeredCount > 1 ? 's' : ''} detected.`
                    : ' No significant triggers detected.'}
                </div>
              </div>
            </div>

            {/* Audit Rate Comparison */}
            <div className="card">
              <div className="card-header"><span className="card-title">IRS Audit Rate Comparison</span></div>
              <div className="card-body" style={{ padding: '24px' }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>National average (your income bracket)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-blue)', fontWeight: 600 }}>{pctStr(profile.baselineAuditRate)}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, profile.baselineAuditRate * 400)}%`,
                      height: '100%', borderRadius: 5,
                      background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Your estimated audit probability</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: riskColor, fontWeight: 600 }}>{pctStr(profile.adjustedAuditRate)}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, profile.adjustedAuditRate * 400)}%`,
                      height: '100%', borderRadius: 5,
                      background: `linear-gradient(90deg, ${riskColor}, ${riskColor}cc)`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>

                <div style={{
                  padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                  <Info size={13} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent-blue)' }} />
                  {profile.adjustedAuditRate > profile.baselineAuditRate * 1.5
                    ? `Your triggers push your estimated audit probability to ${(profile.adjustedAuditRate / profile.baselineAuditRate).toFixed(1)}x the national average for your income level. Focus on red-flag mitigation.`
                    : `Your filing profile is close to the national average. Maintaining good documentation keeps you in safe territory.`}
                </div>

                {/* Risk factor breakdown */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Trigger Severity Distribution
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                      const count = profile.triggers.filter(t => t.triggered && t.severity === sev).length
                      const cfg = severityConfig[sev]
                      return (
                        <div key={sev} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 14px', borderRadius: 10,
                          background: count > 0 ? cfg.bg : 'var(--bg-surface)',
                          border: `1px solid ${count > 0 ? cfg.color + '33' : 'var(--border-subtle)'}`,
                        }}>
                          <span style={{ color: cfg.color }}>{cfg.icon}</span>
                          <span style={{ fontSize: 12, color: count > 0 ? cfg.color : 'var(--text-muted)', fontWeight: 600 }}>{count}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cfg.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Recommendations */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Top Recommendations</span></div>
            <div className="card-body" style={{ padding: '16px 20px' }}>
              {profile.topRecommendations.map((rec, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  padding: '12px 0',
                  borderBottom: i < profile.topRecommendations.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                    background: i === 0 && profile.redFlagCount > 0 ? 'rgba(239,68,68,0.15)' : 'var(--accent-gold-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: i === 0 && profile.redFlagCount > 0 ? '#ef4444' : 'var(--accent-gold)',
                    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{rec}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick trigger summary */}
          {triggeredTriggers.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Active Triggers at a Glance</span>
                <button onClick={() => setActiveTab('triggers')} style={{
                  background: 'none', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4,
                }}>View All <ArrowRight size={12} /></button>
              </div>
              <div className="card-body" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {triggeredTriggers.slice(0, 6).map(trigger => {
                    const cfg = severityConfig[trigger.severity]
                    return (
                      <div key={trigger.id} style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: 'var(--bg-surface)', border: `1px solid ${cfg.color}22`,
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{ color: cfg.color, flexShrink: 0 }}>{cfg.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trigger.name}</div>
                          <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>{cfg.label} · Score: {trigger.riskScore}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ TAB: TRIGGERS ══════════════ */}
      {activeTab === 'triggers' && (
        <>
          {/* Category filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setCategoryFilter(null)}
              style={{
                padding: '6px 14px', borderRadius: 8,
                border: `1px solid ${!categoryFilter ? 'rgba(212,168,67,0.4)' : 'var(--border-subtle)'}`,
                background: !categoryFilter ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                color: !categoryFilter ? 'var(--accent-gold)' : 'var(--text-muted)',
                cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-body)', fontWeight: 500,
              }}>
              All ({profile.triggers.length})
            </button>
            {categories.map(cat => {
              const count = profile.triggers.filter(t => t.category === cat).length
              const triggered = profile.triggers.filter(t => t.category === cat && t.triggered).length
              const catInfo = categoryLabels[cat] || { label: cat, icon: <Info size={13} /> }
              return (
                <button key={cat} onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    border: `1px solid ${categoryFilter === cat ? 'rgba(212,168,67,0.4)' : 'var(--border-subtle)'}`,
                    background: categoryFilter === cat ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                    color: categoryFilter === cat ? 'var(--accent-gold)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-body)', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  {catInfo.icon} {catInfo.label} ({triggered}/{count})
                </button>
              )
            })}
          </div>

          {/* Trigger list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredTriggers.map(trigger => {
              const cfg = severityConfig[trigger.severity]
              const isExpanded = expandedTrigger === trigger.id
              return (
                <div key={trigger.id} className="card" style={{
                  border: trigger.triggered ? `1px solid ${cfg.color}22` : '1px solid var(--border-subtle)',
                  opacity: trigger.triggered ? 1 : 0.6,
                }}>
                  <div
                    className="card-body"
                    style={{ padding: '16px 20px', cursor: 'pointer' }}
                    onClick={() => setExpandedTrigger(isExpanded ? null : trigger.id)}
                  >
                    {/* Trigger header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: cfg.color,
                      }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{trigger.name}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: cfg.bg, color: cfg.color, letterSpacing: '0.05em',
                          }}>
                            {cfg.label}
                          </span>
                          {trigger.triggered && (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                              TRIGGERED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                          {trigger.description.length > 150 && !isExpanded
                            ? trigger.description.substring(0, 150) + '…'
                            : trigger.description}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        {/* Risk score bar */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: cfg.color }}>{trigger.riskScore}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>RISK</div>
                        </div>
                        <span style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                          <ChevronDown size={16} />
                        </span>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                        {/* IRS Context */}
                        <div style={{
                          padding: 14, borderRadius: 10, background: 'rgba(96,165,250,0.06)',
                          border: '1px solid rgba(96,165,250,0.15)', marginBottom: 14,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Eye size={12} color="#60a5fa" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>What the IRS Looks For</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{trigger.irsContext}</div>
                        </div>

                        {/* Threshold */}
                        {trigger.threshold && (
                          <div style={{
                            padding: '10px 14px', borderRadius: 8, background: 'var(--bg-surface)',
                            fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14,
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <Target size={13} color="var(--accent-gold)" />
                            <span style={{ fontWeight: 500, color: 'var(--accent-gold)' }}>Threshold:</span> {trigger.threshold}
                          </div>
                        )}

                        {/* Mitigation */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <ShieldCheck size={12} color="var(--accent-emerald)" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mitigation Strategy</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{trigger.mitigation}</div>
                        </div>

                        {/* Documentation Needed */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <FileText size={12} color="var(--accent-amber)" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Documentation Needed</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {trigger.documentationNeeded.map((doc, i) => (
                              <div key={i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4,
                              }}>
                                <div style={{
                                  width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                                  border: '1.5px solid var(--border-medium)', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                                </div>
                                {doc}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ══════════════ TAB: DOCUMENTATION ══════════════ */}
      {activeTab === 'documentation' && (
        <>
          {/* Documentation Score */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Documentation Readiness Score
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 700,
                color: profile.documentationScore >= 70 ? 'var(--accent-emerald)' : profile.documentationScore >= 40 ? 'var(--accent-gold)' : '#ef4444',
              }}>
                {profile.documentationScore}
              </div>
              <div style={{
                width: '60%', height: 8, borderRadius: 4, background: 'var(--bg-surface)',
                margin: '16px auto', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${profile.documentationScore}%`, height: '100%', borderRadius: 4,
                  background: profile.documentationScore >= 70 ? 'var(--accent-emerald)' : profile.documentationScore >= 40 ? 'var(--accent-gold)' : '#ef4444',
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto' }}>
                {profile.documentationScore >= 70
                  ? 'Good documentation posture. If audited, you likely have the records needed to defend your positions.'
                  : profile.documentationScore >= 40
                  ? 'Moderate documentation gaps. Some audit triggers require better records to defend your positions.'
                  : 'Significant documentation gaps. Without proper records, triggered deductions could be disallowed entirely.'}
              </div>
            </div>
          </div>

          {/* Master Documentation Checklist */}
          <div className="card">
            <div className="card-header"><span className="card-title">Master Documentation Checklist</span></div>
            <div className="card-body" style={{ padding: '16px 20px' }}>
              {triggeredTriggers.map(trigger => (
                <div key={trigger.id} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ color: severityConfig[trigger.severity].color }}>
                      {severityConfig[trigger.severity].icon}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{trigger.name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: severityConfig[trigger.severity].bg,
                      color: severityConfig[trigger.severity].color,
                    }}>
                      {severityConfig[trigger.severity].label}
                    </span>
                  </div>
                  <div style={{ paddingLeft: 8, borderLeft: `2px solid ${severityConfig[trigger.severity].color}22` }}>
                    {trigger.documentationNeeded.map((doc, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', marginBottom: 4, borderRadius: 8,
                        background: 'var(--bg-surface)',
                        fontSize: 12, color: 'var(--text-secondary)',
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          border: '1.5px solid var(--border-medium)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }} />
                        {doc}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {triggeredTriggers.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                  <CheckCircle2 size={28} color="var(--accent-emerald)" style={{ marginBottom: 8 }} />
                  <div>No active triggers requiring documentation.</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════ TAB: MITIGATION ══════════════ */}
      {activeTab === 'mitigation' && (
        <>
          {/* Priority Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {triggeredTriggers
              .filter(t => t.severity === 'critical' || t.severity === 'high')
              .map((trigger, i) => {
                const cfg = severityConfig[trigger.severity]
                return (
                  <div key={trigger.id} className="card" style={{ border: `1px solid ${cfg.color}22` }}>
                    <div className="card-body" style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                          background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: cfg.color, fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
                        }}>
                          #{i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{trigger.name}</span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: cfg.bg, color: cfg.color,
                            }}>{cfg.label} PRIORITY</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                            {trigger.mitigation}
                          </div>
                          <div style={{
                            padding: 12, borderRadius: 10, background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                              Required Documentation
                            </div>
                            {trigger.documentationNeeded.map((doc, j) => (
                              <div key={j} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 0', fontSize: 12, color: 'var(--text-secondary)',
                                borderBottom: j < trigger.documentationNeeded.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                              }}>
                                <ArrowRight size={10} color="var(--accent-gold)" style={{ flexShrink: 0 }} />
                                {doc}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

            {/* Medium triggers */}
            {triggeredTriggers.filter(t => t.severity === 'medium').length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Secondary Concerns</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {triggeredTriggers.filter(t => t.severity === 'medium').length} items
                  </span>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  {triggeredTriggers.filter(t => t.severity === 'medium').map(trigger => (
                    <div key={trigger.id} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <span style={{ color: '#60a5fa', marginTop: 2 }}><ShieldQuestion size={14} /></span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{trigger.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{trigger.mitigation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Low risk items */}
            {triggeredTriggers.filter(t => t.severity === 'low').length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Monitoring Items</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Low risk — maintain awareness</span>
                </div>
                <div className="card-body" style={{ padding: '12px 16px' }}>
                  {triggeredTriggers.filter(t => t.severity === 'low').map(trigger => (
                    <div key={trigger.id} style={{
                      display: 'flex', gap: 10, alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <CheckCircle2 size={14} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{trigger.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>Score: {trigger.riskScore}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {triggeredTriggers.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, background: 'var(--bg-elevated)', borderRadius: 14, border: '1px dashed var(--border-medium)' }}>
                <ShieldCheck size={32} color="var(--accent-emerald)" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--accent-emerald)', marginBottom: 4 }}>Clean Profile</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No significant audit triggers detected. Maintain current practices.</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Risk Gauge (SVG) ──────────────────────────────────────────────

function RiskGauge({ score, color }: { score: number; color: string }) {
  const radius = 80
  const strokeWidth = 14
  const circumference = Math.PI * radius // Half circle
  const progress = (score / 100) * circumference

  // Angle for the needle (0 = left, 180 = right)
  const needleAngle = (score / 100) * 180
  const needleRadians = (needleAngle - 90) * (Math.PI / 180) // Adjust so 0 is left
  const cx = 100
  const cy = 90
  const needleLen = radius - 20
  const nx = cx + needleLen * Math.cos(needleRadians - Math.PI)
  const ny = cy + needleLen * Math.sin(needleRadians - Math.PI)

  return (
    <svg width={200} height={120} viewBox="0 0 200 120" style={{ margin: '0 auto', display: 'block' }}>
      {/* Background arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="var(--bg-surface)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Colored arc segments - gradient from green to red */}
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="35%" stopColor="#60a5fa" />
          <stop offset="60%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.3}
      />
      {/* Progress arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 ${score > 50 ? 1 : 0} 1 ${cx + radius * Math.cos(Math.PI - needleAngle * Math.PI / 180)} ${cy - radius * Math.sin(Math.PI - needleAngle * Math.PI / 180)}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
      />
      {/* Needle */}
      <circle cx={cx} cy={cy} r={6} fill={color} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {/* Labels */}
      <text x={cx - radius - 5} y={cy + 16} fontSize={9} fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--font-mono)">LOW</text>
      <text x={cx + radius + 5} y={cy + 16} fontSize={9} fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--font-mono)">HIGH</text>
      <text x={cx} y={cy + 4} fontSize={9} fill="var(--text-muted)" textAnchor="middle" fontFamily="var(--font-mono)">MED</text>
    </svg>
  )
}
