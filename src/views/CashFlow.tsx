import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateCashFlow, type CashFlowConfig, type CashFlowSummary } from '../engine/cash-flow'
import {
  Wallet, TrendingUp, TrendingDown, Calendar, AlertTriangle,
  DollarSign, PiggyBank, Activity, ArrowUpRight, ArrowDownRight, Shield
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend
} from 'recharts'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }

const PATTERNS: Record<string, { label: string; color: string }> = {
  stable: { label: 'Stable', color: '#10b981' },
  growth: { label: 'Growth', color: '#d4a843' },
  cyclical: { label: 'Cyclical', color: '#60a5fa' },
  decline: { label: 'Declining', color: '#ef4444' },
}

export function CashFlow() {
  const { state, taxReport } = useFortuna()
  const hasData = state.incomeStreams.length > 0

  // Config state
  const [projMonths, setProjMonths] = useState(12)
  const [startingCash, setStartingCash] = useState(10000)
  const [growthRate, setGrowthRate] = useState(2)
  const [seasonality, setSeasonality] = useState<'none' | 'mild' | 'moderate' | 'strong'>('mild')
  const [personalExp, setPersonalExp] = useState(3000)
  const [retirementPct, setRetirementPct] = useState(10)

  const config: CashFlowConfig = useMemo(() => ({
    projectionMonths: projMonths,
    startingCash,
    growthRate,
    seasonality,
    personalMonthlyExpenses: personalExp,
    retirementPct,
  }), [projMonths, startingCash, growthRate, seasonality, personalExp, retirementPct])

  const cashFlow = useMemo(() => generateCashFlow(state, config), [state, config])

  // Chart data
  const flowChartData = cashFlow.months.map(m => ({
    name: m.label,
    income: m.grossIncome,
    bizExpenses: -m.businessExpenses,
    personalExp: -m.personalExpenses,
    retirement: -m.retirementContribution,
    w2Withholding: -m.w2Withholding,
    taxPayment: -m.estimatedTaxPayment,
    net: m.netCashFlow,
    cumulative: m.cumulativeCash,
    isQTax: m.isQuarterlyPaymentMonth,
  }))

  const cumulativeData = cashFlow.months.map(m => ({
    name: m.label,
    cash: m.cumulativeCash,
    runway: m.monthsOfRunway,
  }))

  const pattern = PATTERNS[cashFlow.seasonalPattern]

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Wallet size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Cash Flow Forecaster</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add income and expenses first to project cash flow.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title">Cash Flow Forecaster</h1>
          <span className="pill gold"><Activity size={11} /> {projMonths}-Month Projection</span>
          <span className="pill" style={{
            background: `${pattern.color}15`, color: pattern.color,
            border: `1px solid ${pattern.color}30`,
          }}>
            {pattern.label} Pattern
          </span>
        </div>
        <p className="section-subtitle">Monthly cash flow projections with tax payment timing, seasonal modeling, and runway analysis</p>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        <KPI
          label="Avg Monthly Cash"
          value={fmt(cashFlow.averageMonthlyCash)}
          icon={<DollarSign size={15} />}
          color={cashFlow.averageMonthlyCash >= 0 ? '#10b981' : '#ef4444'}
          sub={cashFlow.averageMonthlyCash >= 0 ? 'Positive flow' : 'Cash deficit'}
        />
        <KPI
          label="Total Net Cash"
          value={fmt(cashFlow.totalNetCash)}
          icon={cashFlow.totalNetCash >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
          color={cashFlow.totalNetCash >= 0 ? '#10b981' : '#ef4444'}
          sub={`Over ${projMonths} months`}
        />
        <KPI
          label="Burn Rate"
          value={fmt(cashFlow.burnRate)}
          icon={<TrendingDown size={15} />}
          color="#f59e0b"
          sub="Monthly expenses"
        />
        <KPI
          label="Runway"
          value={`${Math.min(cashFlow.runwayMonths, 99)} mo`}
          icon={<Calendar size={15} />}
          color={cashFlow.runwayMonths >= 6 ? '#10b981' : cashFlow.runwayMonths >= 3 ? '#f59e0b' : '#ef4444'}
          sub={cashFlow.runwayMonths >= 6 ? 'Healthy' : 'Build reserves'}
        />
        <KPI
          label="Emergency Target"
          value={fmt(cashFlow.emergencyFundTarget)}
          icon={<Shield size={15} />}
          color="#60a5fa"
          sub="6-month reserve"
        />
      </div>

      {/* ── W-2 Withholding vs Estimated Tax ── */}
      {cashFlow.totalW2Withheld > 0 && (
        <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>W-2 Withholding vs Estimated Tax Payments</span>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {[
              { label: 'W-2 Monthly', value: cashFlow.months[0]?.w2Withholding || 0, color: '#38bdf8', sub: 'Auto-withheld/mo' },
              { label: 'W-2 Annual', value: cashFlow.totalW2Withheld, color: '#38bdf8', sub: 'Total withheld' },
              { label: 'Est. Tax Payments', value: cashFlow.totalTaxPayments, color: '#d4a843', sub: 'Quarterly estimates' },
              { label: 'Total Tax Coverage', value: cashFlow.totalW2Withheld + cashFlow.totalTaxPayments, color: '#10b981', sub: 'All sources' },
            ].map((item, i, arr) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '0 12px', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: item.color }}>{fmt(item.value)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{item.sub}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
            💡 W-2 withholding covers tax automatically each paycheck. Quarterly estimated payments are only needed for non-W-2 income (SE, rental, investment).
          </div>
        </div>
      )}

      {/* ── Config Sliders ── */}
      <div className="card" style={{ marginBottom: 24, padding: '18px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, alignItems: 'center' }}>
          <SliderControl label="Starting Cash" value={startingCash} min={0} max={200000} step={1000} unit="$" onChange={setStartingCash} />
          <SliderControl label="Growth Rate" value={growthRate} min={-5} max={20} step={0.5} unit="%" onChange={setGrowthRate} />
          <SliderControl label="Personal Expenses" value={personalExp} min={0} max={20000} step={250} unit="$/mo" onChange={setPersonalExp} />
          <SliderControl label="Retirement %" value={retirementPct} min={0} max={30} step={1} unit="%" onChange={setRetirementPct} />
          <SliderControl label="Months" value={projMonths} min={6} max={24} step={1} unit="mo" onChange={setProjMonths} />
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Seasonality</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['none', 'mild', 'moderate', 'strong'] as const).map(s => (
                <button key={s} onClick={() => setSeasonality(s)} style={{
                  padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-body)',
                  background: seasonality === s ? 'var(--accent-gold)' : 'var(--bg-surface)',
                  color: seasonality === s ? '#0c0e12' : 'var(--text-muted)',
                  transition: 'all 0.2s',
                }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Chart: Cash Flow Waterfall ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: '18px 24px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            Monthly Cash Flow
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Income vs expenses with quarterly tax payments highlighted
          </div>
        </div>
        <div style={{ padding: '16px 16px 8px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={flowChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    income: 'Income', bizExpenses: 'Business Exp', personalExp: 'Personal Exp',
                    retirement: 'Retirement', w2Withholding: 'W-2 Withholding', taxPayment: 'Est. Tax Payment', net: 'Net Cash Flow',
                  }
                  return [fmt(Math.abs(value)), labels[name] || name]
                }}
              />
              <Bar dataKey="income" stackId="pos" fill="#10b981" opacity={0.7} radius={[2, 2, 0, 0]} />
              <Bar dataKey="bizExpenses" stackId="neg" fill="#ef4444" opacity={0.5} radius={[0, 0, 2, 2]} />
              <Bar dataKey="personalExp" stackId="neg" fill="#f97316" opacity={0.5} />
              <Bar dataKey="retirement" stackId="neg" fill="#a78bfa" opacity={0.5} />
              <Bar dataKey="w2Withholding" stackId="neg" fill="#38bdf8" opacity={0.6} />
              <Bar dataKey="taxPayment" stackId="neg" fill="#d4a843" opacity={0.8}>
                {flowChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.isQTax ? '#d4a843' : '#d4a84340'} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="net" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, marginBottom: 4 }}>
            {[
              { label: 'Income', color: '#10b981' },
              { label: 'Business', color: '#ef4444' },
              { label: 'Personal', color: '#f97316' },
              { label: 'Retirement', color: '#a78bfa' },
              { label: 'W-2 Withholding', color: '#38bdf8' },
              { label: 'Est. Tax', color: '#d4a843' },
              { label: 'Net Flow', color: '#60a5fa' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* ── Cumulative Cash Chart ── */}
        <div className="card">
          <div style={{ padding: '18px 24px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Cumulative Cash Position
            </div>
          </div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cumulativeData}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [fmt(v), 'Cash']}
                />
                <Area type="monotone" dataKey="cash" stroke="#10b981" fill="url(#cashGrad)" strokeWidth={2} />
                <ReferenceLine y={cashFlow.emergencyFundTarget} stroke="#60a5fa" strokeDasharray="6 3" label={{ value: '6mo Reserve', fill: '#60a5fa', fontSize: 10 }} />
                <ReferenceLine y={cashFlow.cashReserveRecommendation} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: '3mo Reserve', fill: '#f59e0b', fontSize: 10 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Runway Gauge ── */}
        <div className="card">
          <div style={{ padding: '18px 24px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Runway & Reserve Analysis
            </div>
          </div>
          <div style={{ padding: 20 }}>
            {/* Runway gauge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                border: `4px solid ${cashFlow.runwayMonths >= 6 ? '#10b981' : cashFlow.runwayMonths >= 3 ? '#f59e0b' : '#ef4444'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: cashFlow.runwayMonths >= 6 ? '#10b981' : cashFlow.runwayMonths >= 3 ? '#f59e0b' : '#ef4444' }}>
                  {Math.min(cashFlow.runwayMonths, 99)}
                </div>
                <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>months</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {cashFlow.runwayMonths >= 12 ? 'Strong Runway' : cashFlow.runwayMonths >= 6 ? 'Adequate Runway' : cashFlow.runwayMonths >= 3 ? 'Limited Runway' : 'Critical — Build Reserves'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  At current burn rate of {fmt(cashFlow.burnRate)}/mo, starting cash of {fmt(startingCash)} provides {Math.min(cashFlow.runwayMonths, 99)} months of coverage.
                </div>
              </div>
            </div>

            {/* Reserve targets */}
            <div style={{ display: 'grid', gap: 10 }}>
              <ReserveBar label="3-Month Reserve" target={cashFlow.cashReserveRecommendation} current={startingCash} color="#f59e0b" />
              <ReserveBar label="6-Month Emergency" target={cashFlow.emergencyFundTarget} current={startingCash} color="#60a5fa" />
              <ReserveBar label="12-Month Safety" target={cashFlow.burnRate * 12} current={startingCash} color="#a78bfa" />
            </div>

            {/* Quarterly tax calendar */}
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--accent-gold-dim)', borderRadius: 10, border: '1px solid rgba(212,168,67,0.2)' }}>
              <div style={{ fontSize: 10, color: 'var(--accent-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Quarterly Tax Payments
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {cashFlow.months.filter(m => m.isQuarterlyPaymentMonth).slice(0, 4).map(m => (
                  <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{m.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 500 }}>{fmt(m.estimatedTaxPayment)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly Breakdown Table ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: '18px 24px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            Monthly Breakdown
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Month', 'Income', 'Biz Exp', 'Personal', 'Retire', 'Tax Pmt', 'Net Flow', 'Cumulative', 'Runway'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashFlow.months.map((m, i) => (
                <tr key={i} style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: m.isQuarterlyPaymentMonth ? 'rgba(212,168,67,0.04)' : 'transparent',
                }}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {m.label} {m.isQuarterlyPaymentMonth && <span style={{ color: '#d4a843', fontSize: 9 }}>TAX</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981' }}>{fmt(m.grossIncome)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444' }}>{fmt(m.businessExpenses)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f97316' }}>{fmt(m.personalExpenses)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#a78bfa' }}>{fmt(m.retirementContribution)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: m.estimatedTaxPayment > 0 ? '#d4a843' : 'var(--text-muted)' }}>
                    {m.estimatedTaxPayment > 0 ? fmt(m.estimatedTaxPayment) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: m.netCashFlow >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {m.netCashFlow >= 0 ? '+' : ''}{fmt(m.netCashFlow)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: m.cumulativeCash >= 0 ? 'var(--text-primary)' : '#ef4444', fontWeight: 500 }}>
                    {fmt(m.cumulativeCash)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: m.monthsOfRunway >= 6 ? '#10b981' : m.monthsOfRunway >= 3 ? '#f59e0b' : '#ef4444' }}>
                    {m.monthsOfRunway}mo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Insights ── */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Cash Flow Insights
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <InsightItem
            icon={cashFlow.averageMonthlyCash >= 0 ? <TrendingUp size={13} color="#10b981" /> : <TrendingDown size={13} color="#ef4444" />}
            text={`Average monthly net cash flow: ${fmt(cashFlow.averageMonthlyCash)}.${cashFlow.averageMonthlyCash > 0 ? " You\u2019re building wealth each month." : " Consider reducing expenses or increasing revenue."}`}
          />
          <InsightItem
            icon={<Calendar size={13} color="#d4a843" />}
            text={`Quarterly tax payments of ~${fmt(Math.round(taxReport.totalTax / 4))} are due in Apr, Jun, Sep, and Jan. These are your biggest cash flow events.`}
          />
          <InsightItem
            icon={<AlertTriangle size={13} color="#f59e0b" />}
            text={`Tightest month: ${cashFlow.lowestCashMonth.label} (${fmt(cashFlow.lowestCashMonth.netCashFlow)} net). ${cashFlow.monthsNegative > 0 ? `${cashFlow.monthsNegative} month(s) projected negative.` : 'No negative months projected.'}`}
          />
          <InsightItem
            icon={<PiggyBank size={13} color="#a78bfa" />}
            text={`Emergency fund target: ${fmt(cashFlow.emergencyFundTarget)} (6 months of expenses). ${startingCash >= cashFlow.emergencyFundTarget ? 'You meet this target.' : `You need ${fmt(cashFlow.emergencyFundTarget - startingCash)} more.`}`}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function KPI({ label, value, icon, color, sub }: { label: string; value: string; icon: React.ReactNode; color: string; sub: string }) {
  return (
    <div className="metric-card" style={{ borderColor: `${color}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value" style={{ color, fontSize: 20 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function SliderControl({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 500 }}>
          {unit === '$' ? `$${value.toLocaleString()}` : unit === '$/mo' ? `$${value.toLocaleString()}/mo` : `${value}${unit}`}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent-gold)', height: 4, cursor: 'pointer' }} />
    </div>
  )
}

function ReserveBar({ label, target, current, color }: { label: string; target: number; current: number; color: string }) {
  const pct = Math.min(100, (current / Math.max(1, target)) * 100)
  const met = current >= target
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: met ? '#10b981' : color }}>
          {`$${Math.round(current).toLocaleString()}`} / {`$${Math.round(target).toLocaleString()}`}
        </span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%`, background: met ? '#10b981' : color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

function InsightItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <span>{text}</span>
    </div>
  )
}
