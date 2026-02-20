import React, { useState, useMemo, useEffect } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { evaluateScenario, generateSmartScenarios } from '../engine/scenario-modeler'
import type { ViewKey } from '../App'
import { SessionDigestBar } from '../components/SessionDigestBar'
import { ProactivePulse } from '../components/ProactivePulse'
import { CompletionBanner } from '../components/CompletionTracker'
import { getPortfolioDashboardData } from '../engine/portfolio-bridge'
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, DollarSign,
  PiggyBank, Target, Sparkles, ChevronRight, Minus,
  CheckCircle2, Clock, AlertTriangle, Shield, Activity,
  BarChart3, Calendar, Building2, Bell, Zap, MapPin,
  ArrowRight, ExternalLink, Flame, Eye, FileText,
  History, Brain, CreditCard, Briefcase,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, RadarChart,
  PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts'

interface DashboardProps { onNavigate: (view: ViewKey) => void }

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }

function MiniSparkline({ points, color, w = 80, h = 28 }: { points: number[]; color: string; w?: number; h?: number }) {
  if (points.length < 2) return null
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1
  const path = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ')
  const area = `M0,${h} ${path.replace('M', 'L')} L${w},${h} Z`
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getGreeting(name: string): string {
  const hour = new Date().getHours()
  const first = name.split(' ')[0] || 'there'
  if (hour < 12) return `Good morning, ${first}`
  if (hour < 17) return `Good afternoon, ${first}`
  return `Good evening, ${first}`
}

function getDayContext(): string {
  const now = new Date()
  const month = now.getMonth(), day = now.getDate()
  if (month === 0 && day <= 15) return 'Q4 estimated taxes due Jan 15'
  if (month === 3 && day <= 15) return 'Tax filing deadline Apr 15'
  if (month === 5 && day <= 15) return 'Q2 estimated taxes due Jun 15'
  if (month === 8 && day <= 15) return 'Q3 estimated taxes due Sep 15'
  if (month === 11) return 'Year-end tax planning window'
  if (month >= 9) return 'Q4 optimization window open'
  return ''
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { state, taxReport, strategies, risks, healthScore, trends, projections, milestones, strategyEffects, history, sessionDigest } = useFortuna()
  const hasData = state.incomeStreams.length > 0
  const [digestDismissed, setDigestDismissed] = useState(false)
  const snapshotCount = history.snapshots.length
  const incomeTrend = trends.find(t => t.metric === 'totalIncome')
  const taxRateTrend = trends.find(t => t.metric === 'effectiveTaxRate')
  const healthTrend = trends.find(t => t.metric === 'healthScore')
  const netTrend = trends.find(t => t.metric === 'netIncome')
  const criticalStrategies = strategies.filter(s => s.priority === 'critical' || s.priority === 'high')
  const urgentCount = criticalStrategies.length
  const dayContext = getDayContext()
  const revenueStreams = state.incomeStreams.filter(s => s.isActive && s.annualAmount > 0).sort((a, b) => b.annualAmount - a.annualAmount)
  const totalRevenue = revenueStreams.reduce((s, r) => s + r.annualAmount, 0)
  const taxAllocation = [
    { name: 'Federal Income', value: taxReport.federalIncomeTax, color: '#d4a843' },
    { name: 'State', value: taxReport.stateTax, color: '#60a5fa' },
    { name: 'Self-Employment', value: taxReport.selfEmploymentTax, color: '#a78bfa' },
  ].filter(d => d.value > 0)
  const radarData = [
    { dimension: 'Tax Eff.', value: healthScore.components.taxEfficiency },
    { dimension: 'Entity', value: healthScore.components.entityOptimization },
    { dimension: 'Diverse', value: healthScore.components.diversification },
    { dimension: 'Risk', value: healthScore.components.riskProtection },
    { dimension: 'Retire', value: healthScore.components.retirementReadiness },
  ]
  const priorityColors: Record<string, string> = { critical: 'var(--accent-red)', high: 'var(--accent-gold)', medium: 'var(--accent-blue)', low: 'var(--text-muted)' }
  const portfolioWidget = useMemo(() => getPortfolioDashboardData(), [])

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div className="animate-float" style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 24px', background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 40px rgba(212,168,67,0.3)' }}>
            <Sparkles size={32} color="#0c0e12" />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, marginBottom: 12, color: 'var(--text-primary)' }}>Welcome to Fortuna Engine</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 32, maxWidth: 440, margin: '0 auto 32px' }}>Autonomous tax optimization, strategy detection, risk analysis, and AI-powered financial intelligence — all in one system.</p>
          <button className="btn btn-primary animate-glow" style={{ fontSize: 15, padding: '14px 28px', borderRadius: 12 }} onClick={() => onNavigate('setup')}><Sparkles size={16} /> Set Up Financial Profile</button>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title" style={{ fontSize: 26 }}>{getGreeting(state.profile.name)}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="pulse-dot" style={{ background: 'var(--accent-emerald)' }} /><span style={{ fontSize: 11, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>LIVE</span></div>
        </div>
        <p className="section-subtitle">
          {snapshotCount > 0 ? `${snapshotCount} snapshots · ` : ''}{strategies.length} strategies detected · Health: {healthScore.grade}
          {dayContext && <span style={{ color: 'var(--accent-amber)', marginLeft: 8 }}>· {dayContext}</span>}
        </p>
      </div>

      {/* Profile completion banner */}
      <CompletionBanner onNavigate={onNavigate} />

      {/* Urgency bar */}
      {urgentCount > 0 && (
        <div className="urgency-bar warning" style={{ cursor: 'pointer' }} onClick={() => onNavigate('alerts')}>
          <Flame size={14} />
          <span style={{ fontWeight: 600 }}>{urgentCount} high-priority action{urgentCount > 1 ? 's' : ''}</span>
          <span style={{ opacity: 0.7 }}>—</span>
          <span>{criticalStrategies[0]?.title}</span>
          {criticalStrategies[0]?.impactLabel && <span className="badge amber" style={{ marginLeft: 'auto' }}>{criticalStrategies[0].impactLabel}</span>}
          <ChevronRight size={14} style={{ marginLeft: 4, opacity: 0.5 }} />
        </div>
      )}

      {/* Session Intelligence Digest */}
      {!digestDismissed && sessionDigest.items.length > 0 && (
        <SessionDigestBar
          digest={sessionDigest}
          onNavigate={onNavigate}
          onDismiss={() => setDigestDismissed(true)}
        />
      )}

      {/* Proactive Intelligence Pulse */}
      {hasData && <ProactivePulse onNavigate={onNavigate} />}

      {/* KPI Row */}
      <div className="grid-4 stagger-fast" style={{ marginBottom: 20 }}>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-gold)' } as any}>
          <div className="kpi-label">Gross Income</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="kpi-value">${(taxReport.grossIncome / 1000).toFixed(0)}k</div>
            {incomeTrend && <MiniSparkline points={incomeTrend.points.map(p => p.value)} color="var(--accent-gold)" />}
          </div>
          <div className="kpi-sub" style={{ color: incomeTrend?.isPositive ? 'var(--accent-emerald)' : incomeTrend ? 'var(--accent-red)' : 'var(--text-muted)' }}>
            {incomeTrend ? <>{incomeTrend.direction === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {Math.abs(incomeTrend.changePct).toFixed(1)}%</> : <>{revenueStreams.length} stream{revenueStreams.length !== 1 ? 's' : ''}</>}
          </div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-emerald)' } as any}>
          <div className="kpi-label">After-Tax Income</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="kpi-value">${(taxReport.afterTaxIncome / 1000).toFixed(0)}k</div>
            {netTrend && <MiniSparkline points={netTrend.points.map(p => p.value)} color="var(--accent-emerald)" />}
          </div>
          <div className="kpi-sub" style={{ color: 'var(--accent-emerald)' }}>{((taxReport.afterTaxIncome / (taxReport.grossIncome || 1)) * 100).toFixed(0)}% retention rate</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-red)' } as any}>
          <div className="kpi-label">Total Tax</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="kpi-value" style={{ color: 'var(--accent-red)' }}>${(taxReport.totalTax / 1000).toFixed(0)}k</div>
            {taxRateTrend && <MiniSparkline points={taxRateTrend.points.map(p => p.value)} color="var(--accent-red)" />}
          </div>
          <div className="kpi-sub" style={{ color: 'var(--text-muted)' }}>
            {(taxReport.effectiveRate * 100).toFixed(1)}% effective · {(taxReport.marginalRate * 100).toFixed(0)}% marginal
            {(taxReport.w2FederalWithheld > 0 || taxReport.w2StateWithheld > 0) && (
              <div style={{ fontSize: 10, marginTop: 2, color: taxReport.netTaxOwed <= 0 ? 'var(--accent-emerald)' : 'var(--accent-gold)' }}>
                {taxReport.netTaxOwed <= 0
                  ? `Refund est. $${Math.abs(taxReport.netTaxOwed).toLocaleString()}`
                  : `Still owed ~$${taxReport.netTaxOwed.toLocaleString()}`
                }
              </div>
            )}
          </div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-gold)', cursor: 'pointer' } as any} onClick={() => onNavigate('health')}>
          <div className="kpi-label">Health Score</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="kpi-value" style={{ color: healthScore.overall >= 70 ? 'var(--accent-emerald)' : healthScore.overall >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
              {healthScore.overall}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
            </div>
            {healthTrend && <MiniSparkline points={healthTrend.points.map(p => p.value)} color={healthScore.overall >= 70 ? 'var(--accent-emerald)' : 'var(--accent-gold)'} />}
          </div>
          <div className="kpi-sub" style={{ color: healthScore.overall >= 70 ? 'var(--accent-emerald)' : 'var(--accent-gold)' }}>
            Grade: {healthScore.grade}{healthTrend && healthTrend.direction !== 'flat' && <span style={{ marginLeft: 6 }}>{healthTrend.direction === 'up' ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />} {Math.abs(healthTrend.change).toFixed(0)} pts</span>}
          </div>
        </div>
      </div>

      {/* W-2 Withholding Summary — only shows when W-2 data present */}
      {taxReport.w2FederalWithheld > 0 && (() => {
        const totalWithheld = taxReport.w2FederalWithheld + taxReport.w2StateWithheld
        const ficaWithheld = taxReport.w2FICAWithheld
        const allWithheld = totalWithheld + ficaWithheld
        const owed = taxReport.netTaxOwed
        const isRefund = owed <= 0
        const w2Streams = state.incomeStreams.filter(s => s.type === 'w2' && s.isActive)
        const w2Pretax = w2Streams.reduce((s, inc) => s + ((inc.w2?.pretax401k || 0) + (inc.w2?.pretaxHealthInsurance || 0) + (inc.w2?.pretaxHSA || 0)), 0)
        const empMatch = w2Streams.reduce((s, inc) => s + (inc.w2?.employerMatch401k || 0), 0)
        return (
          <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CreditCard size={13} /> W-2 Withholding & Benefits
              </span>
              <span className={`badge ${isRefund ? 'emerald' : 'amber'}`}>{isRefund ? `Refund ~${fmt(Math.abs(owed))}` : `Owe ~${fmt(owed)}`}</span>
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { label: 'Federal Withheld', value: taxReport.w2FederalWithheld, color: 'var(--accent-gold)' },
                { label: 'State Withheld', value: taxReport.w2StateWithheld, color: 'var(--accent-blue)' },
                { label: 'FICA Withheld', value: ficaWithheld, color: 'var(--accent-purple)' },
                ...(w2Pretax > 0 ? [{ label: 'Pre-tax Deductions', value: w2Pretax, color: 'var(--accent-emerald)' }] : []),
                ...(empMatch > 0 ? [{ label: 'Employer 401k Match', value: empMatch, color: 'var(--accent-amber)' }] : []),
              ].map((item, i, arr) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', padding: '0 12px', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: item.color }}>{fmt(item.value)}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: isRefund ? 'rgba(16,185,129,0.06)' : 'rgba(212,168,67,0.06)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total tax liability: {fmt(taxReport.totalTax)} · Withheld: {fmt(totalWithheld)}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: isRefund ? 'var(--accent-emerald)' : 'var(--accent-gold)' }}>
                {isRefund ? `≈ ${fmt(Math.abs(owed))} refund` : `≈ ${fmt(owed)} still owed`}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Savings banner */}
      {taxReport.identifiedSavings > 2000 && (
        <div className="glass-card gold-glow" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onNavigate('tax')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent-gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><DollarSign size={20} color="var(--accent-gold)" /></div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--accent-gold)' }}>${taxReport.identifiedSavings.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>/year savings identified</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{strategies.length} strategies ready{taxReport.sCorpSavings > 0 && ` · S-Corp saves $${taxReport.sCorpSavings.toLocaleString()}`}</div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--accent-gold)" />
        </div>
      )}

      {/* Next Best Action */}
      {(() => {
        const smartScens = generateSmartScenarios(state)
        if (smartScens.length === 0) return null
        const scResults = smartScens.slice(0, 4).map(sc => {
          const r = evaluateScenario(sc.name, state, sc.mods)
          return { ...sc, result: r, delta: r.taxReport.afterTaxIncome - taxReport.afterTaxIncome, taxDelta: taxReport.totalTax - r.taxReport.totalTax }
        }).filter(s => s.delta !== 0)
        if (scResults.length === 0) return null
        return (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={15} /> Quick What-If</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onNavigate('scenarios')}>Full Modeler <ChevronRight size={12} /></button>
            </div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(scResults.length, 4)}, 1fr)`, gap: 10 }}>
              {scResults.map((sc, i) => {
                const isPositive = sc.delta > 0
                return (
                  <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-primary)', border: `1px solid ${isPositive ? 'rgba(16,185,129,0.15)' : 'var(--border-subtle)'}`, cursor: 'pointer', transition: 'border-color 0.2s' }}
                    onClick={() => onNavigate('scenarios')}>
                    <div style={{ fontSize: 16, marginBottom: 6 }}>{sc.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{sc.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {fmt(Math.abs(sc.delta))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {sc.taxDelta > 0 ? `Saves ${fmt(sc.taxDelta)} tax` : sc.description}
                    </div>
                    <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'var(--bg-hover)' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, (Math.abs(sc.delta) / Math.max(1, taxReport.afterTaxIncome)) * 100 * 10)}%`, background: isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Next Best Action — Strategy Focus */}
      {criticalStrategies.length > 0 && (() => {
        const nextAction = criticalStrategies[0]
        const stepCount = nextAction.steps?.length || 0
        return (
          <div style={{
            marginBottom: 20, padding: '18px 20px', borderRadius: 14,
            background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))',
            border: '1px solid var(--border-medium)',
            display: 'flex', gap: 16, alignItems: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}
          onClick={() => onNavigate('workflows')}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--border-glow)'
            e.currentTarget.style.boxShadow = '0 4px 24px rgba(212,168,67,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-medium)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(212,168,67,0.25)',
            }}>
              <Zap size={22} color="#0c0e12" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--accent-gold)' }}>NEXT BEST ACTION</span>
                <span className={`badge ${nextAction.priority === 'critical' ? 'red' : 'amber'}`}>{nextAction.priority}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{nextAction.title}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{nextAction.impactLabel}</span>
                <span>{nextAction.timeline}</span>
                {stepCount > 0 && <span>{stepCount} step{stepCount !== 1 ? 's' : ''}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--accent-gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ArrowRight size={16} color="var(--accent-gold)" />
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Start</span>
            </div>
          </div>
        )
      })()}

      {/* Projections bar */}
      {projections.length > 0 && (
        <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={13} /> 12-Month Trajectory</span>
            <span className="badge muted">{projections[0]?.confidence} conf · {snapshotCount} pts</span>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {projections.slice(0, 5).map((proj, i) => {
              const diff12 = proj.projected12Month - proj.current
              const isUp = diff12 > 0
              const isBetter = proj.metric === 'effectiveTaxRate' || proj.metric === 'totalTaxBurden' ? !isUp : isUp
              const color = Math.abs(diff12) < 1 ? 'var(--text-muted)' : isBetter ? 'var(--accent-emerald)' : 'var(--accent-red)'
              return (
                <div key={proj.metric} style={{ flex: 1, textAlign: 'center', padding: '0 12px', borderRight: i < 4 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{proj.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{proj.unit === '$' ? `$${(proj.current / 1000).toFixed(0)}K` : `${proj.current.toFixed(1)}${proj.unit}`}</div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color, marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}><ArrowRight size={9} />{proj.unit === '$' ? `$${(proj.projected12Month / 1000).toFixed(0)}K` : `${proj.projected12Month.toFixed(1)}${proj.unit}`}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main grid: Strategy Feed + Health Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Strategy Intelligence</span><button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onNavigate('tax')}>All Strategies <ChevronRight size={12} /></button></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 320, overflow: 'auto' }}>
            {strategies.length > 0 ? strategies.slice(0, 6).map(strat => (
              <div key={strat.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: priorityColors[strat.priority], boxShadow: strat.priority === 'critical' ? '0 0 8px rgba(239,107,107,0.4)' : 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{strat.title}</span>
                      <span className={`badge ${strat.priority === 'critical' ? 'red' : strat.priority === 'high' ? 'gold' : 'muted'}`}>{strat.priority}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{strat.impactLabel}</span>
                      <span>{strat.timeline}</span>
                      <span>Risk: {strat.risk}</span>
                    </div>
                  </div>
                </div>
              </div>
            )) : <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Add financial data to detect strategies</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Health Radar</div>
            <ResponsiveContainer width="100%" height={160}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="var(--border-subtle)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Radar name="Score" dataKey="value" stroke="var(--accent-gold)" fill="var(--accent-gold)" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {taxAllocation.length > 0 && (
            <div className="card" style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tax Allocation</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ResponsiveContainer width={80} height={80}><PieChart><Pie data={taxAllocation} dataKey="value" innerRadius={24} outerRadius={38} paddingAngle={2} strokeWidth={0}>{taxAllocation.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  {taxAllocation.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 6, height: 6, borderRadius: 3, background: d.color }} /><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.name}</span></div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)' }}>${(d.value / 1000).toFixed(1)}k</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revenue Streams */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Revenue Streams</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>${(totalRevenue / 1000).toFixed(0)}k<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>/yr</span></span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onNavigate('revenue')}>Manage <ChevronRight size={12} /></button>
          </div>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(revenueStreams.length || 1, 4)}, 1fr)`, gap: 12 }}>
          {revenueStreams.slice(0, 4).map((stream, i) => {
            const pct = totalRevenue > 0 ? (stream.annualAmount / totalRevenue) * 100 : 0
            const colors = ['var(--accent-gold)', 'var(--accent-blue)', 'var(--accent-purple)', 'var(--accent-emerald)']
            const color = colors[i % colors.length]
            return (
              <div key={stream.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-primary)', borderLeft: `3px solid ${color}` }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{stream.name || stream.type}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>${(stream.annualAmount / 1000).toFixed(0)}k</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--bg-hover)' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} /></div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: pct > 60 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                </div>
              </div>
            )
          })}
          {revenueStreams.length === 0 && <div style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>No revenue streams configured</div>}
        </div>
      </div>

      {/* Entity P&L Breakdown */}
      {taxReport.entityBreakdown && taxReport.entityBreakdown.filter(e => e.revenue > 0 || e.expenses > 0).length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Entity P&L</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onNavigate('entity')}>Manage <ChevronRight size={12} /></button>
          </div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(taxReport.entityBreakdown.filter(e => e.revenue > 0 || e.expenses > 0).length, 3)}, 1fr)`, gap: 12 }}>
            {taxReport.entityBreakdown.filter(e => e.revenue > 0 || e.expenses > 0).map(ent => {
              const margin = ent.revenue > 0 ? (ent.netIncome / ent.revenue) * 100 : 0
              const flowColors: Record<string, string> = { schedule_c: 'var(--accent-gold)', k1: 'var(--accent-purple)', w2_salary: 'var(--accent-blue)', corporate: 'var(--accent-red)', personal: 'var(--accent-emerald)' }
              const flowLabels: Record<string, string> = { schedule_c: 'Sched C', k1: 'K-1', w2_salary: 'W-2', corporate: 'Corp', personal: 'Personal' }
              return (
                <div key={ent.entityId} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-primary)', borderLeft: `3px solid ${flowColors[ent.flowThrough] || 'var(--text-muted)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ent.entityName}</span>
                    <span className="badge" style={{ background: `${flowColors[ent.flowThrough] || 'var(--text-muted)'}22`, color: flowColors[ent.flowThrough] || 'var(--text-muted)', fontSize: 10 }}>
                      {flowLabels[ent.flowThrough] || ent.flowThrough}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2 }}>Revenue</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-emerald)' }}>${(ent.revenue / 1000).toFixed(0)}k</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2 }}>Net Income</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: ent.netIncome >= 0 ? 'var(--text-primary)' : 'var(--accent-red)' }}>${(ent.netIncome / 1000).toFixed(0)}k</div>
                    </div>
                  </div>
                  {ent.officerSalary > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Officer salary: ${ent.officerSalary.toLocaleString()} · Distributions: ${ent.distributions.toLocaleString()}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--bg-hover)' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, margin))}%`, height: '100%', borderRadius: 2, background: margin > 30 ? 'var(--accent-emerald)' : margin > 10 ? 'var(--accent-gold)' : 'var(--accent-red)' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{margin.toFixed(0)}% margin</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Strategy Effectiveness */}
      {strategyEffects.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Strategy Impact Tracking</span><button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onNavigate('history')}>Full History <ChevronRight size={12} /></button></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {strategyEffects.slice(0, 3).map((effect, i) => {
              const vColor = { positive: 'var(--accent-emerald)', negative: 'var(--accent-red)', neutral: 'var(--accent-gold)', insufficient_data: 'var(--text-muted)' }[effect.verdict]
              return (<div key={i} style={{ flex: '1 1 200px', padding: 14, borderRadius: 10, background: 'var(--bg-primary)', borderLeft: `3px solid ${vColor}` }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{effect.strategyTitle}</span><span className={`badge ${effect.verdict === 'positive' ? 'emerald' : effect.verdict === 'negative' ? 'red' : 'muted'}`}>{effect.verdict === 'insufficient_data' ? 'pending' : effect.verdict}</span></div><div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{effect.summary}</div></div>)
            })}
          </div>
        </div>
      )}

      {/* Portfolio Intelligence Widget */}
      {portfolioWidget && (
        <div style={{ marginBottom: 20, padding: '18px 20px', borderRadius: 14, background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface))', border: '1px solid var(--border-medium)', cursor: 'pointer', transition: 'border-color 0.3s' }}
          onClick={() => onNavigate('portfolio')}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-medium)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Briefcase size={14} color="#8b5cf6" />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.1em', color: '#8b5cf6', textTransform: 'uppercase' }}>Portfolio Intelligence</span>
            {portfolioWidget.alertCount > 0 && <span className="badge red" style={{ fontSize: 9 }}>{portfolioWidget.alertCount} alert{portfolioWidget.alertCount !== 1 ? 's' : ''}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Portfolio Value</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>${Math.round(portfolioWidget.totalValue).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Gain / Loss</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: portfolioWidget.gainLoss >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                {portfolioWidget.gainLoss >= 0 ? '+' : ''}{portfolioWidget.gainLossPct.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Positions</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{portfolioWidget.positionCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Pending Events</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: portfolioWidget.pendingEvents > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>{portfolioWidget.pendingEvents}</div>
            </div>
          </div>
          {portfolioWidget.topPositions.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {portfolioWidget.topPositions.map((p, i) => (
                <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {p.name} · ${Math.round(p.value).toLocaleString()} · {p.pct.toFixed(0)}%
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }} className="stagger-fast">
          {[
            { key: 'scenarios', label: 'Scenarios', sub: 'What-if modeler', icon: <BarChart3 size={18} />, color: 'var(--accent-gold)' },
            { key: 'document-scan', label: 'Scanner', sub: 'Multi-doc intake', icon: <FileText size={18} />, color: 'var(--accent-blue)' },
            { key: 'audit', label: 'Audit Profiler', sub: 'IRS DIF scoring', icon: <Shield size={18} />, color: 'var(--accent-red)' },
            { key: 'optimizer', label: 'Entity Optimizer', sub: 'Structure arbitrage', icon: <Building2 size={18} />, color: 'var(--accent-purple)' },
            { key: 'advisor', label: 'AI Advisor', sub: 'Full-context AI', icon: <Brain size={18} />, color: 'var(--accent-emerald)' },
            { key: 'history', label: 'History', sub: `${snapshotCount} snapshots`, icon: <History size={18} />, color: 'var(--accent-gold)' },
            { key: 'cpa', label: 'CPA Export', sub: 'Professional handoff', icon: <Briefcase size={18} />, color: 'var(--accent-blue)' },
            { key: 'alerts', label: 'Intelligence', sub: 'Proactive alerts', icon: <Bell size={18} />, color: 'var(--accent-amber)' },
          ].map(item => (
            <div key={item.key} className="action-card" onClick={() => onNavigate(item.key as ViewKey)}>
              <div className="action-icon" style={{ background: `${item.color}12`, color: item.color }}>{item.icon}</div>
              <div><div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.sub}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
