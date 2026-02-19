import { useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { analyzeMarginalRates } from '../engine/marginal-rate'
import {
  Layers, AlertTriangle, TrendingUp, DollarSign, Target, Percent
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell, ComposedChart, Line
} from 'recharts'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }
function fmtK(n: number): string { return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}` }
function pct(n: number): string { return `${(n * 100).toFixed(1)}%` }

export function MarginalRateView() {
  const { state, taxReport } = useFortuna()
  const analysis = useMemo(() => analyzeMarginalRates(state), [state])
  const hasData = state.incomeStreams.length > 0

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Layers size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Marginal Rate Stack</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add income to see your marginal rate breakdown at every income level.</p>
        </div>
      </div>
    )
  }

  // Chart data: stacked area of rate components
  const stackedData = analysis.points.filter(p => p.income > 0 && p.income <= 500000).map(p => ({
    income: p.income,
    federal: +(p.federalRate * 100).toFixed(1),
    state: +(p.stateRate * 100).toFixed(1),
    se: +(p.seRate * 100).toFixed(1),
    fica: +(p.ficaRate * 100).toFixed(1),
    niit: +(p.niitRate * 100).toFixed(1),
    total: +(p.totalRate * 100).toFixed(1),
    keep: +(p.keepRate * 100).toFixed(1),
  }))

  // Keep rate chart data
  const keepData = analysis.points.filter(p => p.income > 0 && p.income <= 500000).map(p => ({
    income: p.income,
    keep: +(p.keepRate * 100).toFixed(1),
  }))

  const cp = analysis.currentPoint

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title">Marginal Rate Stack</h1>
        <p className="section-subtitle">If you earn $1 more, how much do you keep? See your combined marginal rate decomposed.</p>
      </div>

      {/* Current Rate KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Total Marginal', value: pct(cp.totalRate), color: cp.totalRate > 0.45 ? 'var(--accent-red)' : 'var(--accent-gold)' },
          { label: 'Federal', value: pct(cp.federalRate), color: '#ef4444' },
          { label: 'State', value: pct(cp.stateRate), color: '#f97316' },
          { label: 'SE Tax', value: pct(cp.seRate), color: '#a78bfa' },
          { label: 'FICA', value: pct(cp.ficaRate), color: '#60a5fa' },
          { label: 'You Keep', value: pct(cp.keepRate), color: 'var(--accent-emerald)' },
        ].map((kpi, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Next Bracket Info */}
      {analysis.nextBracketAt > analysis.currentIncome && (
        <div className="glass-card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <Target size={18} color="var(--accent-gold)" />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Next rate increase at <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{fmtK(analysis.nextBracketAt)}</strong>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              ({fmtK(analysis.nextBracketAt - analysis.currentIncome)} of room) → {pct(analysis.nextBracketRate)} marginal
            </span>
          </div>
        </div>
      )}

      {/* Stacked Rate Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Marginal Rate Stack by Income</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={stackedData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="fedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="stateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <XAxis dataKey="income" tickFormatter={v => fmtK(v)} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} domain={[0, 60]} />
              <Tooltip
                formatter={(v: number, name: string) => [`${v}%`, name.charAt(0).toUpperCase() + name.slice(1)]}
                labelFormatter={v => `Income: ${fmtK(Number(v))}`}
                contentStyle={{ background: '#1a1d24', border: '1px solid #2a2d35', borderRadius: 8, fontSize: 11 }}
              />
              <Area type="stepAfter" dataKey="niit" stackId="1" fill="#ec4899" stroke="none" fillOpacity={0.6} />
              <Area type="stepAfter" dataKey="se" stackId="1" fill="#a78bfa" stroke="none" fillOpacity={0.7} />
              <Area type="stepAfter" dataKey="fica" stackId="1" fill="#60a5fa" stroke="none" fillOpacity={0.6} />
              <Area type="stepAfter" dataKey="state" stackId="1" fill="url(#stateGrad)" stroke="none" />
              <Area type="stepAfter" dataKey="federal" stackId="1" fill="url(#fedGrad)" stroke="none" />
              <ReferenceLine x={analysis.currentIncome} stroke="var(--accent-gold)" strokeDasharray="4 4" strokeWidth={2} label={{ value: 'You', fill: 'var(--accent-gold)', fontSize: 10, position: 'top' }} />
            </AreaChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
            {[
              { label: 'Federal', color: '#ef4444' },
              { label: 'State', color: '#f97316' },
              { label: 'FICA', color: '#60a5fa' },
              { label: 'SE Tax', color: '#a78bfa' },
              { label: 'NIIT', color: '#ec4899' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Keep Rate Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Dollar Retention Rate</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>How much of each additional dollar you keep</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={keepData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="keepGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="income" tickFormatter={v => fmtK(v)} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} domain={[30, 100]} />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'Keep Rate']}
                labelFormatter={v => `Income: ${fmtK(Number(v))}`}
                contentStyle={{ background: '#1a1d24', border: '1px solid #2a2d35', borderRadius: 8, fontSize: 11 }}
              />
              <Area type="stepAfter" dataKey="keep" fill="url(#keepGrad)" stroke="#10b981" strokeWidth={2} />
              <ReferenceLine x={analysis.currentIncome} stroke="var(--accent-gold)" strokeDasharray="4 4" strokeWidth={2} />
              <ReferenceLine y={50} stroke="rgba(239,68,68,0.3)" strokeDasharray="3 3" label={{ value: '50% cliff', fill: 'var(--accent-red)', fontSize: 9, position: 'right' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Danger Zones & Sweet Spots */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {analysis.dangerZones.length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title" style={{ color: 'var(--accent-red)' }}><AlertTriangle size={14} /> Danger Zones</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.dangerZones.map((zone, i) => (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>
                    {fmtK(zone.start)} — {fmtK(zone.end)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{zone.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {analysis.sweetSpots.length > 0 && (
          <div className="card">
            <div className="card-header"><span className="card-title" style={{ color: 'var(--accent-emerald)' }}><TrendingUp size={14} /> Sweet Spots</span></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analysis.sweetSpots.map((spot, i) => (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
                    {fmtK(spot.income)} · Keep {pct(spot.keepRate)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{spot.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
