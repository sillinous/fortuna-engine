import { useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  TrendingUp, DollarSign, ArrowUpRight, BarChart3, Target,
  Sparkles, AlertTriangle, Plus
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts'

const STREAM_COLORS = ['#d4a843', '#60a5fa', '#a78bfa', '#34d399', '#f87171', '#fbbf24', '#c084fc']

const GROWTH_OPPORTUNITIES: {
  name: string
  type: string
  potentialRange: [number, number]
  effort: 'low' | 'medium' | 'high'
  timeToRevenue: string
  description: string
  matchesSkills: string[]
}[] = [
  { name: 'AI Consulting', type: 'business', potentialRange: [40000, 120000], effort: 'medium', timeToRevenue: '1-2 months', description: 'Offer AI strategy, implementation, and automation consulting to businesses. High demand, premium rates.', matchesSkills: ['tech', 'ai', 'automation', 'development'] },
  { name: 'SaaS Product Revenue', type: 'business', potentialRange: [24000, 240000], effort: 'high', timeToRevenue: '3-6 months', description: 'Productize your tools into recurring SaaS offerings. High effort but highest long-term value.', matchesSkills: ['development', 'product', 'saas'] },
  { name: 'Digital Products / Templates', type: 'passive', potentialRange: [6000, 48000], effort: 'low', timeToRevenue: '2-4 weeks', description: 'Create and sell templates, guides, or digital tools on platforms like Gumroad or your own site.', matchesSkills: ['design', 'writing', 'development'] },
  { name: 'Affiliate / Referral Income', type: 'passive', potentialRange: [2400, 24000], effort: 'low', timeToRevenue: '1-3 months', description: 'Earn commissions by recommending tools and services you already use. Low effort, compounds over time.', matchesSkills: ['content', 'audience'] },
  { name: 'Training / Workshops', type: 'business', potentialRange: [12000, 72000], effort: 'medium', timeToRevenue: '1-2 months', description: 'Teach skills through paid workshops, cohorts, or online courses. Leverages existing expertise.', matchesSkills: ['teaching', 'expertise'] },
  { name: 'Content Monetization', type: 'passive', potentialRange: [6000, 36000], effort: 'medium', timeToRevenue: '3-6 months', description: 'Monetize content through YouTube, newsletters, or membership communities.', matchesSkills: ['writing', 'video', 'audience'] },
]

export function RevenueEngine() {
  const { state, taxReport, strategies } = useFortuna()
  const activeStreams = state.incomeStreams.filter(s => s.isActive && s.annualAmount > 0)
  const totalRevenue = activeStreams.reduce((s, r) => s + r.annualAmount, 0)
  const hasData = activeStreams.length > 0

  // Revenue diversification
  const diversificationScore = useMemo(() => {
    if (activeStreams.length === 0) return 0
    if (activeStreams.length === 1) return 15
    const maxConcentration = Math.max(...activeStreams.map(s => s.annualAmount)) / totalRevenue
    return Math.round((1 - maxConcentration) * 100)
  }, [activeStreams, totalRevenue])

  // Revenue growth projection (12 months)
  const projectionData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthly = totalRevenue / 12
    return months.map((name, i) => ({
      name,
      current: Math.round(monthly * (0.9 + Math.random() * 0.2)),
      optimistic: Math.round(monthly * (1.05 + i * 0.02) * (0.95 + Math.random() * 0.1)),
      aggressive: Math.round(monthly * (1.10 + i * 0.04) * (0.93 + Math.random() * 0.14)),
    }))
  }, [totalRevenue])

  // Pie data for stream breakdown
  const pieData = activeStreams.map((s, i) => ({
    name: s.name || s.type,
    value: s.annualAmount,
    color: STREAM_COLORS[i % STREAM_COLORS.length],
  }))

  // Revenue strategies from engine
  const revenueStrategies = strategies.filter(s => s.category === 'revenue')

  // Growth opportunity total
  const midOpportunity = GROWTH_OPPORTUNITIES.reduce((s, o) => s + (o.potentialRange[0] + o.potentialRange[1]) / 2, 0)

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <TrendingUp size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Revenue Engine</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add income streams in your profile to analyze revenue composition and growth opportunities.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 28 }}>
        <h1 className="section-title">Revenue Engine</h1>
        <p className="section-subtitle">Revenue intelligence, diversification analysis, and growth modeling</p>
      </div>

      {/* Metrics */}
      <div className="grid-4 stagger" style={{ marginBottom: 24 }}>
        <div className="metric-card glow-gold">
          <span className="metric-label">Total Revenue</span>
          <div className="metric-value">${totalRevenue.toLocaleString()}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>${Math.round(totalRevenue / 12).toLocaleString()}/mo</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Active Streams</span>
          <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{activeStreams.length}</div>
          <span style={{ fontSize: 12, color: activeStreams.length < 3 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>{activeStreams.length < 3 ? 'Below target (3+)' : 'Healthy diversification'}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Diversification</span>
          <div className="metric-value" style={{ color: diversificationScore > 40 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>{diversificationScore}%</div>
          <div className="progress-bar" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${diversificationScore}%`, background: diversificationScore > 40 ? 'var(--accent-emerald)' : 'var(--accent-red)' }} />
          </div>
        </div>
        <div className="metric-card">
          <span className="metric-label">After-Tax Revenue</span>
          <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>${taxReport.afterTaxIncome.toLocaleString()}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(100 - taxReport.effectiveRate * 100).toFixed(0)}% retention</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Stream Breakdown */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue Composition</span>
          </div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeStreams.map((stream, i) => {
                const pct = Math.round((stream.annualAmount / totalRevenue) * 100)
                return (
                  <div key={stream.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{stream.name || stream.type}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>${(stream.annualAmount / 1000).toFixed(0)}k</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: pct > 60 ? 'var(--accent-red)' : 'var(--text-muted)' }}>{pct}%</span>
                      </div>
                    </div>
                    <div className="progress-bar" style={{ height: 3 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
              {activeStreams.length === 1 && (
                <div style={{ fontSize: 11, color: 'var(--accent-amber)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <AlertTriangle size={12} /> 100% concentration — add more streams
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Growth Projection */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">12-Month Projection</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={projectionData}>
                <defs>
                  <linearGradient id="gCurrent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4a843" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#d4a843" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOptimistic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#565c6a', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#565c6a', fontSize: 10, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Area type="monotone" dataKey="current" stroke="#d4a843" fill="url(#gCurrent)" strokeWidth={2} name="Baseline" />
                <Area type="monotone" dataKey="optimistic" stroke="#34d399" fill="url(#gOptimistic)" strokeWidth={2} name="With Growth" />
                <Area type="monotone" dataKey="aggressive" stroke="#a78bfa" fill="none" strokeWidth={1} strokeDasharray="5 5" name="Aggressive" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Growth Opportunities */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Growth Opportunities</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sorted by effort-to-reward ratio</span>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {GROWTH_OPPORTUNITIES.map((opp, i) => {
          const midValue = (opp.potentialRange[0] + opp.potentialRange[1]) / 2
          const effortColors = { low: 'var(--accent-emerald)', medium: 'var(--accent-gold)', high: 'var(--accent-red)' }
          return (
            <div key={i} className="card">
              <div style={{ padding: '20px 20px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{opp.name}</div>
                    <span className="pill gold" style={{ fontSize: 10 }}>{opp.type}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                    ${(opp.potentialRange[0] / 1000).toFixed(0)}-{(opp.potentialRange[1] / 1000).toFixed(0)}k
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>{opp.description}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>Effort: <span style={{ color: effortColors[opp.effort], fontWeight: 500 }}>{opp.effort}</span></span>
                  <span>Time: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{opp.timeToRevenue}</span></span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Revenue risks from engine */}
      {revenueStrategies.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Sparkles size={16} /> Engine-Detected Revenue Strategies</span>
          </div>
          <div className="card-body">
            {revenueStrategies.map(strat => (
              <div key={strat.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <AlertTriangle size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{strat.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{strat.description}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-emerald)', fontWeight: 500, flexShrink: 0 }}>{strat.impactLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
