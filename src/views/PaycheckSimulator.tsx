import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { simulateAllPaychecks, type PayFrequency, type PaycheckBreakdown } from '../engine/paycheck-simulator'
import {
  Wallet, DollarSign, ArrowDown, ChevronDown, AlertTriangle,
  Building2, TrendingDown, Percent, CreditCard, PiggyBank, Shield
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }

const FREQ_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 Weeks', semimonthly: 'Twice a Month', monthly: 'Monthly',
}

export function PaycheckSimulator() {
  const { state } = useFortuna()
  const [frequency, setFrequency] = useState<PayFrequency>('biweekly')
  const paychecks = useMemo(() => simulateAllPaychecks(state, frequency), [state, frequency])
  const hasW2 = paychecks.length > 0

  if (!hasW2) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Wallet size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Paycheck Simulator</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add W-2 income streams to simulate your paycheck breakdown.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="section-title">Paycheck Simulator</h1>
          <p className="section-subtitle">See exactly where every dollar of your paycheck goes</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 10, padding: 3, border: '1px solid var(--border-subtle)' }}>
          {(Object.keys(FREQ_LABELS) as PayFrequency[]).map(f => (
            <button key={f} onClick={() => setFrequency(f)}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: frequency === f ? 'var(--accent-gold)' : 'transparent',
                color: frequency === f ? '#0c0e12' : 'var(--text-muted)' }}>
              {FREQ_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {paychecks.map(pc => <PaycheckCard key={pc.streamId} pc={pc} />)}
    </div>
  )
}

function PaycheckCard({ pc }: { pc: PaycheckBreakdown }) {
  const [expanded, setExpanded] = useState(true)

  const waterfall = [
    { label: 'Gross Pay', amount: pc.grossPay, color: '#10b981', running: pc.grossPay },
    ...(pc.pretax401k > 0 ? [{ label: '401(k)', amount: -pc.pretax401k, color: '#a78bfa', running: pc.grossPay - pc.pretax401k }] : []),
    ...(pc.pretaxHealth > 0 ? [{ label: 'Health Ins.', amount: -pc.pretaxHealth, color: '#60a5fa', running: pc.grossPay - pc.pretax401k - pc.pretaxHealth }] : []),
    ...(pc.pretaxHSA > 0 ? [{ label: 'HSA', amount: -pc.pretaxHSA, color: '#38bdf8', running: pc.taxableWages + pc.pretaxHSA }] : []),
    { label: 'Taxable Wages', amount: pc.taxableWages, color: '#d4a843', running: pc.taxableWages },
    { label: 'Federal Tax', amount: -pc.federalWithholding, color: '#ef4444', running: pc.taxableWages - pc.federalWithholding },
    { label: 'State Tax', amount: -pc.stateWithholding, color: '#f97316', running: pc.taxableWages - pc.federalWithholding - pc.stateWithholding },
    { label: 'Social Security', amount: -pc.socialSecurity, color: '#8b5cf6', running: pc.taxableWages - pc.federalWithholding - pc.stateWithholding - pc.socialSecurity },
    { label: 'Medicare', amount: -pc.medicare, color: '#ec4899', running: pc.netPay },
    { label: 'Net Pay', amount: pc.netPay, color: '#10b981', running: pc.netPay },
  ]

  const chartData = waterfall.filter(w => w.amount !== 0).map(w => ({
    name: w.label, value: Math.abs(w.amount), fill: w.color, isDeduction: w.amount < 0,
  }))

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} /> {pc.employerName}
          </span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{FREQ_LABELS[pc.payFrequency]} · {pc.periodsPerYear} pay periods/yr</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--accent-emerald)' }}>{fmt(pc.netPay)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>net per paycheck</div>
          </div>
          <ChevronDown size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {expanded && (
        <div className="card-body">
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Gross', value: fmt(pc.grossPay), color: 'var(--accent-gold)', icon: <DollarSign size={13} /> },
              { label: 'Pre-tax', value: fmt(pc.totalPretax), color: 'var(--accent-purple)', icon: <PiggyBank size={13} /> },
              { label: 'Taxes', value: fmt(pc.totalTaxes), color: 'var(--accent-red)', icon: <TrendingDown size={13} /> },
              { label: 'Take-Home Rate', value: `${(pc.takeHomeRate * 100).toFixed(1)}%`, color: 'var(--accent-emerald)', icon: <Percent size={13} /> },
              { label: 'Annual Net', value: fmt(pc.annualNet), color: 'var(--accent-blue)', icon: <CreditCard size={13} /> },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-primary)', textAlign: 'center' }}>
                <div style={{ color: kpi.color, marginBottom: 4 }}>{kpi.icon}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Paycheck Waterfall */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Paycheck Waterfall</div>
              {waterfall.filter(w => w.amount !== 0).map((item, i) => {
                const pct = pc.grossPay > 0 ? Math.abs(item.amount) / pc.grossPay * 100 : 0
                const isNet = item.label === 'Net Pay' || item.label === 'Gross Pay' || item.label === 'Taxable Wages'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                    borderBottom: isNet ? '1px solid var(--border-medium)' : '1px solid var(--border-subtle)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: item.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: isNet ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isNet ? 600 : 400 }}>{item.label}</span>
                    <div style={{ width: 60, height: 4, borderRadius: 2, background: 'var(--bg-hover)', flexShrink: 0 }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 2, background: item.color }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: isNet ? 600 : 400, color: item.amount < 0 ? 'var(--accent-red)' : 'var(--text-primary)', minWidth: 70, textAlign: 'right' }}>
                      {item.amount < 0 ? '-' : ''}{fmt(Math.abs(item.amount))}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Visual chart */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Breakdown</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" width={90} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: '#1a1d24', border: '1px solid #2a2d35', borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.fill} opacity={d.isDeduction ? 0.7 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Employer total cost */}
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Employer Cost</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Your salary + employer FICA + 401k match</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--accent-gold)' }}>
                {fmt(pc.totalCompensation)}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>/yr</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Salary: {fmt(pc.annualGross)}</span>
              <span>Employer FICA: {fmt(pc.employerFICA * pc.periodsPerYear)}</span>
              {pc.employer401kMatch > 0 && <span>401k Match: {fmt(pc.employer401kMatch * pc.periodsPerYear)}</span>}
            </div>
          </div>

          {/* Discrepancies */}
          {pc.discrepancies.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {pc.discrepancies.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', marginBottom: 4,
                  borderRadius: 8, background: d.severity === 'alert' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${d.severity === 'alert' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}` }}>
                  <AlertTriangle size={14} color={d.severity === 'alert' ? '#ef4444' : '#f59e0b'} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{d.field}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{d.message}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      Expected: {fmt(d.expected)} · Entered: {fmt(d.actual)}
                    </div>
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
