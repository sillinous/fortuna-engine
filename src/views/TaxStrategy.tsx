import { useState } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { useCopy } from '../engine/microcopy'
import { HelpSection } from '../components/ContextualHelp'
import { PrintReport, PrintButton } from '../components/PrintReport'
import {
  ChevronDown, Shield, TrendingDown, Lightbulb, Calculator,
  Clock, CheckCircle2, ArrowRight, Zap, AlertTriangle
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const priorityConfig: Record<string, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
  critical: { bg: 'var(--accent-red-dim)', color: 'var(--accent-red)', label: 'Critical', icon: <AlertTriangle size={16} /> },
  high: { bg: 'var(--accent-gold-dim)', color: 'var(--accent-gold)', label: 'High Priority', icon: <Lightbulb size={16} /> },
  medium: { bg: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', label: 'Medium', icon: <Clock size={16} /> },
  low: { bg: 'var(--accent-purple-dim)', color: 'var(--accent-purple)', label: 'Opportunity', icon: <Shield size={16} /> },
}

export function TaxStrategy() {
  const { taxReport, strategies } = useFortuna()
  const t = useCopy()
  const [expanded, setExpanded] = useState<string | null>(strategies[0]?.id || null)

  const taxStrategies = strategies.filter(s => ['tax', 'deduction', 'entity'].includes(s.category))
  const totalSavings = taxStrategies.reduce((s, st) => s + st.estimatedImpact, 0)
  const optimizedTax = Math.max(0, taxReport.totalTax - totalSavings)
  const optimizedRate = taxReport.grossIncome > 0 ? optimizedTax / taxReport.grossIncome : 0

  const chartData = [
    { label: 'Current', amount: taxReport.totalTax, color: '#ef6b6b' },
    { label: 'Optimized', amount: optimizedTax, color: '#34d399' },
  ]

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="section-title">{t('view.tax')}</h1>
            <p className="section-subtitle">{t('subtitle.tax')}</p>
          </div>
          <PrintButton label="Print Strategy Report" />
        </div>
        <HelpSection topic="effective_rate" />
      </div>

      <div className="grid-3 stagger" style={{ marginBottom: 28 }}>
        <div className="metric-card glow-gold">
          <span className="metric-label">Identified Tax Savings</span>
          <div className="metric-value" style={{ color: 'var(--accent-gold)' }}>${totalSavings.toLocaleString()}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Across {taxStrategies.length} strategies</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Current Effective Rate</span>
          <div className="metric-value">{(taxReport.effectiveRate * 100).toFixed(1)}%</div>
          <span className="metric-change positive"><TrendingDown size={12} /> Target: {(optimizedRate * 100).toFixed(1)}%</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Tax Breakdown</span>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Federal</span>
              <span>${taxReport.federalIncomeTax.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>SE Tax</span>
              <span>${taxReport.selfEmploymentTax.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>State</span>
              <span>${taxReport.stateTax.toLocaleString()}</span>
            </div>
            {(taxReport.w2FederalWithheld > 0 || taxReport.w2StateWithheld > 0) && (<>
              <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--accent-blue)' }}>W-2 Withheld</span>
                <span style={{ color: 'var(--accent-blue)' }}>-${(taxReport.w2FederalWithheld + taxReport.w2StateWithheld).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
                <span style={{ color: taxReport.netTaxOwed <= 0 ? 'var(--accent-emerald)' : 'var(--accent-gold)' }}>
                  {taxReport.netTaxOwed <= 0 ? 'Refund' : 'Still Owed'}
                </span>
                <span style={{ color: taxReport.netTaxOwed <= 0 ? 'var(--accent-emerald)' : 'var(--accent-gold)' }}>
                  ${Math.abs(taxReport.netTaxOwed).toLocaleString()}
                </span>
              </div>
            </>)}
          </div>
        </div>
      </div>

      {totalSavings > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Current vs. Optimized Tax Burden</span>
            <span className="pill emerald"><Zap size={11} /> Achievable</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartData} layout="vertical" barSize={28}>
                <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fill: '#8b919e', fontSize: 13 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Tax']} />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent-emerald)', fontWeight: 500 }}>
                Potential reduction: ${totalSavings.toLocaleString()}/year ({((totalSavings / Math.max(1, taxReport.totalTax)) * 100).toFixed(1)}% lower)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic strategies from engine */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Detected Strategies</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Auto-analyzed from your data</span>
      </div>

      {taxStrategies.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Add income and entity data to detect optimization strategies.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {taxStrategies.map(strategy => {
          const isExpanded = expanded === strategy.id
          const pc = priorityConfig[strategy.priority]
          return (
            <div key={strategy.id} className="card" style={{ borderColor: isExpanded ? 'var(--border-medium)' : 'var(--border-subtle)' }}>
              <div onClick={() => setExpanded(isExpanded ? null : strategy.id)} style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: pc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: pc.color, flexShrink: 0 }}>
                  {pc.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{strategy.title}</span>
                    <span className="pill" style={{ background: pc.bg, color: pc.color, borderColor: 'transparent', fontSize: 11 }}>{pc.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{strategy.category}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--accent-emerald)' }}>{strategy.impactLabel}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Risk: <span style={{ color: strategy.risk === 'none' ? 'var(--accent-emerald)' : 'var(--accent-gold)', fontWeight: 500 }}>{strategy.risk}</span></div>
                </div>
                <ChevronDown size={16} color="var(--text-muted)" style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : '' }} />
              </div>

              {isExpanded && (
                <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>{strategy.description}</p>
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Analysis</div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>{strategy.reasoning}</p>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Implementation Steps</div>
                  {strategy.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 1 }}>{step}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Timeline: <strong style={{ color: 'var(--accent-gold)' }}>{strategy.timeline}</strong></span>
                    {strategy.prerequisites.length > 0 && <span> · Prerequisites: {strategy.prerequisites.join(', ')}</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
