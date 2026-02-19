import { useState, useMemo, useRef } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { analyzeAuditRisk, type AuditRiskProfile, type AuditTrigger } from '../engine/audit-risk'
import { generateWaterfall } from '../engine/scenario-modeler'
import { generateTimeline, groupByQuarter } from '../engine/execution-timeline'
import {
  FileText, Printer, Shield, AlertTriangle, CheckCircle2,
  TrendingUp, DollarSign, Building2, Clock, Target, Activity,
  BarChart3, ChevronDown, ChevronRight, Eye, Sparkles
} from 'lucide-react'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }
function pct(n: number): string { return `${(n * 100).toFixed(1)}%` }

const RISK_COLORS: Record<string, string> = {
  'very-high': '#ef4444',
  'high': '#f97316',
  'elevated': '#f59e0b',
  'moderate': '#60a5fa',
  'low': '#10b981',
}

const SEV_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
  high: { bg: 'rgba(249,115,22,0.12)', text: '#f97316' },
  medium: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  low: { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
}

export function Reports() {
  const { state, taxReport, strategies, risks, healthScore, entityComparison } = useFortuna()
  const [expandedTriggers, setExpandedTriggers] = useState<Set<string>>(new Set())
  const reportRef = useRef<HTMLDivElement>(null)

  const hasData = state.incomeStreams.length > 0
  const auditRisk = useMemo(() => analyzeAuditRisk(state), [state])
  const waterfall = useMemo(() => generateWaterfall(taxReport), [taxReport])
  const timeline = useMemo(() => generateTimeline(state), [state])
  const quarters = useMemo(() => groupByQuarter(timeline), [timeline])

  const toggleTrigger = (id: string) => {
    setExpandedTriggers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <FileText size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Financial Reports</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add financial data first to generate reports.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      {/* ── Header (non-printable controls) ── */}
      <div className="no-print" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <h1 className="section-title">Financial Intelligence Report</h1>
              <span className="pill gold"><FileText size={11} /> Printable</span>
            </div>
            <p className="section-subtitle">Comprehensive analysis including audit risk, tax breakdown, strategies, and execution timeline</p>
          </div>
          <button onClick={handlePrint} style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: 'var(--accent-gold)', color: '#0c0e12',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Printer size={16} /> Print / Export PDF
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* ══ PRINTABLE REPORT CONTENT ══ */}
      {/* ══════════════════════════════════════════════ */}
      <div ref={reportRef} id="fortuna-report">

        {/* ── Report Cover ── */}
        <div className="report-section" style={{
          padding: '40px 36px', background: 'var(--bg-elevated)', borderRadius: 16,
          border: '1px solid var(--border-subtle)', marginBottom: 20,
          borderLeft: '4px solid var(--accent-gold)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--accent-gold)', marginBottom: 4 }}>
                FORTUNA
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 16 }}>
                Financial Intelligence Report
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <div>Prepared for: <strong style={{ color: 'var(--text-primary)' }}>{state.profile.name || 'Financial Profile'}</strong></div>
                <div>Filing Status: <strong style={{ color: 'var(--text-primary)' }}>{state.profile.filingStatus.replace('_', ' ')}</strong></div>
                <div>State: <strong style={{ color: 'var(--text-primary)' }}>{state.profile.state}</strong></div>
                <div>Generated: <strong style={{ color: 'var(--text-primary)' }}>{reportDate}</strong></div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Health Score</div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 48, fontWeight: 700,
                color: healthScore.overall >= 70 ? 'var(--accent-emerald)' : healthScore.overall >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)',
                lineHeight: 1,
              }}>
                {healthScore.overall}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
                Grade: {healthScore.grade}
              </div>
            </div>
          </div>
        </div>

        {/* ── Executive Summary ── */}
        <ReportCard title="Executive Summary" icon={<Sparkles size={16} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            <MetricBox label="Gross Revenue" value={fmt(taxReport.grossIncome)} color="var(--accent-blue)" />
            <MetricBox label="Total Tax Burden" value={fmt(taxReport.totalTax)} sub={pct(taxReport.effectiveRate)} color="var(--accent-red)" />
            <MetricBox label="After-Tax Income" value={fmt(taxReport.afterTaxIncome)} color="var(--accent-emerald)" />
            <MetricBox label="Identified Savings" value={fmt(taxReport.identifiedSavings)} color="var(--accent-gold)" />
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            Your effective tax rate is <strong>{pct(taxReport.effectiveRate)}</strong> with a marginal rate of <strong>{pct(taxReport.marginalRate)}</strong>.
            {taxReport.identifiedSavings > 0 && (
              <> The engine has identified <strong style={{ color: 'var(--accent-gold)' }}>{fmt(taxReport.identifiedSavings)}</strong> in potential annual tax savings through entity restructuring, retirement maximization, and deduction optimization.</>
            )}
            {' '}Your financial health score of <strong>{healthScore.overall}/100 ({healthScore.grade})</strong> indicates
            {healthScore.overall >= 70 ? ' a well-optimized financial position with room for incremental improvement.' : healthScore.overall >= 50 ? ' a solid foundation with meaningful optimization opportunities available.' : ' significant optimization potential — implementing recommended strategies could materially improve your financial position.'}
          </div>
        </ReportCard>

        {/* ── Tax Breakdown (Waterfall) ── */}
        <ReportCard title="Tax Waterfall Analysis" icon={<BarChart3 size={16} />}>
          <div style={{ marginBottom: 16 }}>
            {waterfall.map((seg, i) => {
              const maxVal = waterfall[0]?.amount || 1
              const barWidth = Math.max(4, (Math.abs(seg.amount) / maxVal) * 100)
              const isLast = i === waterfall.length - 1
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '4px 0' }}>
                  <div style={{ width: 110, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>{seg.label}</div>
                  <div style={{ flex: 1, height: 20, background: 'var(--bg-surface)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, height: '100%',
                      width: `${isLast ? (seg.amount / maxVal) * 100 : barWidth}%`,
                      background: seg.color, borderRadius: 4, opacity: 0.8,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{
                    width: 85, fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: isLast ? 600 : 400,
                    color: seg.type === 'net' ? '#10b981' : seg.type === 'tax' ? '#ef4444' : seg.type === 'deduction' ? '#f59e0b' : 'var(--text-primary)',
                  }}>
                    {seg.amount >= 0 ? '' : '-'}{fmt(Math.abs(seg.amount))}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <MiniStat label="Federal Income Tax" value={fmt(taxReport.federalIncomeTax)} />
            <MiniStat label="Self-Employment Tax" value={fmt(taxReport.selfEmploymentTax)} />
            <MiniStat label="State Tax ({state.profile.state})" value={fmt(taxReport.stateTax)} />
            <MiniStat label="QBI Deduction (§199A)" value={fmt(taxReport.qbiDeduction)} />
            <MiniStat label="Marginal Rate" value={pct(taxReport.marginalRate)} />
            <MiniStat label="Effective Rate" value={pct(taxReport.effectiveRate)} />
          </div>
        </ReportCard>

        {/* ── Audit Risk Assessment ── */}
        <ReportCard title="IRS Audit Risk Assessment" icon={<Shield size={16} />}>
          {/* Risk dashboard */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'center' }}>
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              border: `4px solid ${RISK_COLORS[auditRisk.riskLevel]}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: RISK_COLORS[auditRisk.riskLevel] }}>
                {auditRisk.overallScore}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk Score</div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: RISK_COLORS[auditRisk.riskLevel], marginBottom: 6 }}>
                {auditRisk.riskLabel}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                <div>National baseline audit rate for your income level: <strong style={{ color: 'var(--text-primary)' }}>{(auditRisk.baselineAuditRate * 100).toFixed(2)}%</strong></div>
                <div>Your estimated adjusted rate: <strong style={{ color: RISK_COLORS[auditRisk.riskLevel] }}>{(auditRisk.adjustedAuditRate * 100).toFixed(2)}%</strong></div>
                <div>Triggers analyzed: <strong style={{ color: 'var(--text-primary)' }}>{auditRisk.triggeredCount}</strong> of {auditRisk.totalChecks} checks flagged</div>
                <div>Red flags: <strong style={{ color: '#ef4444' }}>{auditRisk.redFlagCount}</strong> · Yellow flags: <strong style={{ color: '#f59e0b' }}>{auditRisk.yellowFlagCount}</strong></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MiniGauge label="Documentation" value={auditRisk.documentationScore} color={auditRisk.documentationScore > 60 ? '#10b981' : '#f59e0b'} />
              <MiniGauge label="Compliance" value={Math.max(0, 100 - auditRisk.overallScore)} color={auditRisk.overallScore < 40 ? '#10b981' : '#f59e0b'} />
            </div>
          </div>

          {/* Triggered items */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Audit Trigger Analysis ({auditRisk.triggers.filter(t => t.triggered).length} Active)
          </div>
          {auditRisk.triggers.filter(t => t.triggered).map(trigger => {
            const isExpanded = expandedTriggers.has(trigger.id)
            const sev = SEV_COLORS[trigger.severity]
            return (
              <div key={trigger.id} style={{
                marginBottom: 8, borderRadius: 12, border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)', overflow: 'hidden',
              }}>
                <button onClick={() => toggleTrigger(trigger.id)} style={{
                  width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: sev.bg, color: sev.text, textTransform: 'uppercase', letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}>
                    {trigger.severity}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{trigger.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: sev.text, marginRight: 8 }}>
                    {trigger.riskScore}/100
                  </span>
                  {isExpanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12, marginBottom: 12 }}>
                      {trigger.description}
                    </div>

                    <div style={{ padding: '10px 14px', background: 'rgba(96,165,250,0.06)', borderRadius: 8, border: '1px solid rgba(96,165,250,0.15)', marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>IRS Context</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{trigger.irsContext}</div>
                    </div>

                    <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.15)', marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Mitigation Strategy</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{trigger.mitigation}</div>
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Documentation Needed</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {trigger.documentationNeeded.map((doc, j) => (
                        <span key={j} style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: 11,
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}>
                          {doc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Top Recommendations */}
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--accent-gold-dim)', borderRadius: 10, border: '1px solid rgba(212,168,67,0.2)' }}>
            <div style={{ fontSize: 11, color: 'var(--accent-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Priority Recommendations
            </div>
            {auditRisk.topRecommendations.map((rec, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <CheckCircle2 size={13} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{rec}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        {/* ── Health Score Breakdown ── */}
        <ReportCard title="Financial Health Breakdown" icon={<Activity size={16} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {[
              { label: 'Tax Efficiency', value: healthScore.components.taxEfficiency, weight: '25%', color: '#d4a843' },
              { label: 'Entity Design', value: healthScore.components.entityOptimization, weight: '20%', color: '#60a5fa' },
              { label: 'Diversification', value: healthScore.components.diversification, weight: '15%', color: '#a78bfa' },
              { label: 'Risk Protection', value: healthScore.components.riskProtection, weight: '20%', color: '#10b981' },
              { label: 'Retirement', value: healthScore.components.retirementReadiness, weight: '20%', color: '#f59e0b' },
            ].map((comp, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', margin: '0 auto 10px',
                  border: `3px solid ${comp.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${comp.color}11`,
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: comp.color }}>
                    {comp.value}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{comp.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Weight: {comp.weight}</div>
              </div>
            ))}
          </div>
        </ReportCard>

        {/* ── Strategy Recommendations ── */}
        <ReportCard title="Strategy Recommendations" icon={<Target size={16} />}>
          {strategies.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No strategies detected — your profile is well-optimized.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {strategies.sort((a, b) => b.estimatedImpact - a.estimatedImpact).slice(0, 8).map(strat => {
                const sev = SEV_COLORS[strat.priority]
                return (
                  <div key={strat.id} style={{
                    padding: '14px 18px', borderRadius: 10, background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: 14,
                  }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: sev.bg, color: sev.text, textTransform: 'uppercase', flexShrink: 0, marginTop: 2,
                    }}>
                      {strat.priority}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{strat.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{strat.description}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)' }}>{strat.impactLabel}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{strat.timeline}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ReportCard>

        {/* ── Entity Comparison ── */}
        <ReportCard title="Entity Structure Analysis" icon={<Building2 size={16} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {entityComparison.map(ent => {
              const isBest = entityComparison.every(e => e.score <= ent.score)
              const isCurrent = state.entities.some(e => e.type === ent.entityType && e.isActive) ||
                (ent.entityType === 'sole_prop' && !state.entities.some(e => e.isActive && e.type !== 'sole_prop'))
              return (
                <div key={ent.entityType} style={{
                  padding: 16, borderRadius: 12, background: 'var(--bg-surface)',
                  border: `1px solid ${isBest ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                  position: 'relative',
                }}>
                  {isBest && (
                    <div style={{
                      position: 'absolute', top: -8, right: 12, padding: '2px 8px',
                      background: 'var(--accent-gold)', color: '#0c0e12', fontSize: 9,
                      fontWeight: 700, borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>Best Fit</div>
                  )}
                  {isCurrent && (
                    <div style={{
                      position: 'absolute', top: -8, left: 12, padding: '2px 8px',
                      background: 'var(--accent-blue)', color: '#fff', fontSize: 9,
                      fontWeight: 700, borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>Current</div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, marginTop: 4 }}>{ent.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                    <div>Score: <strong style={{ color: 'var(--accent-gold)' }}>{ent.score}/100</strong></div>
                    <div>Total Tax: <strong>{fmt(ent.totalTax)}</strong></div>
                    <div>Eff. Rate: <strong>{pct(ent.effectiveRate)}</strong></div>
                    <div>SE Tax: <strong>{fmt(ent.seTax)}</strong></div>
                    <div>Annual Cost: <strong>{fmt(ent.annualCost)}</strong></div>
                  </div>
                </div>
              )
            })}
          </div>
        </ReportCard>

        {/* ── Execution Timeline ── */}
        <ReportCard title="Execution Timeline" icon={<Clock size={16} />}>
          {quarters.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No upcoming actions detected.</div>
          ) : (
            quarters.slice(0, 4).map(q => (
              <div key={q.quarter} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 8 }}>{q.label}</div>
                {q.actions.slice(0, 5).map(action => (
                  <div key={action.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      background: action.status === 'overdue' ? 'rgba(239,68,68,0.12)' : action.status === 'urgent' ? 'rgba(245,158,11,0.12)' : 'rgba(96,165,250,0.12)',
                      color: action.status === 'overdue' ? '#ef4444' : action.status === 'urgent' ? '#f59e0b' : '#60a5fa',
                      textTransform: 'uppercase', flexShrink: 0,
                    }}>
                      {action.status}
                    </span>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{action.title}</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{action.deadlineLabel}</div>
                    {action.irsForm && (
                      <span style={{ fontSize: 10, color: 'var(--accent-blue)', background: 'rgba(96,165,250,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                        {action.irsForm}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </ReportCard>

        {/* ── Risk Assessment ── */}
        <ReportCard title="Risk Exposure Summary" icon={<AlertTriangle size={16} />}>
          {risks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No significant risks detected.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {risks.sort((a, b) => b.severity - a.severity).slice(0, 6).map(risk => {
                const sevKey = risk.severity >= 70 ? 'critical' : risk.severity >= 50 ? 'high' : risk.severity >= 30 ? 'medium' : 'low'
                const sev = SEV_COLORS[sevKey]
                return (
                  <div key={risk.id} style={{
                    display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 10,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: sev.bg, color: sev.text, textTransform: 'uppercase', flexShrink: 0, height: 'fit-content',
                    }}>
                      {sevKey}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{risk.category}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{risk.description}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 200, textAlign: 'right' }}>{risk.mitigation}</div>
                  </div>
                )
              })}
            </div>
          )}
        </ReportCard>

        {/* ── Disclaimer ── */}
        <div style={{
          padding: '16px 20px', borderRadius: 10, background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)', marginTop: 20,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <strong>Disclaimer:</strong> This report is generated by the Fortuna Financial Engine for informational and planning purposes only.
            It does not constitute tax, legal, or financial advice. Tax calculations are based on 2024 federal brackets, standard deduction amounts,
            and simplified state tax rates. Actual tax liability may vary based on additional factors not captured in this analysis.
            Audit risk scores are estimates based on publicly available IRS statistics and known DIF scoring factors.
            Consult a qualified CPA or tax professional before making any tax planning decisions. Generated {reportDate}.
          </div>
        </div>
      </div>

      {/* ── Print Styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sidebar, aside, .app-bg, .app-grain { display: none !important; }
          .main-content { margin-left: 0 !important; padding: 0 !important; }
          body { background: white !important; color: #1a1a1a !important; }
          .report-section, .card { break-inside: avoid; }
          #fortuna-report { max-width: 100% !important; }
          #fortuna-report * {
            color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────

function ReportCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="report-section" style={{
      marginBottom: 20, borderRadius: 14, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: 'var(--accent-gold)' }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{title}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  )
}

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      padding: 14, borderRadius: 10, background: 'var(--bg-surface)',
      border: `1px solid ${color}22`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: `${color}aa`, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function MiniGauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-surface)', borderRadius: 10 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', margin: '0 auto 6px',
        border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}
