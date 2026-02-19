import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { discoverDeductions, type DiscoveredDeduction } from '../engine/deduction-discovery'
import {
  Search, DollarSign, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Shield, PiggyBank, Zap, Eye, Tag
} from 'lucide-react'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }

const CONFIDENCE_COLORS: Record<string, string> = { high: 'var(--accent-emerald)', medium: 'var(--accent-gold)', low: 'var(--text-muted)' }
const CATEGORY_ICONS: Record<string, string> = {
  health: '🏥', home_office: '🏠', vehicle: '🚗', retirement: '🏦', business: '💼',
  education: '🎓', charitable: '❤️', other: '📋',
}

export function DeductionDiscovery() {
  const { state } = useFortuna()
  const discoveries = useMemo(() => discoverDeductions(state), [state])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'unclaimed' | 'claimed'>('all')

  const unclaimed = discoveries.filter(d => !d.alreadyClaimed && d.applies)
  const claimed = discoveries.filter(d => d.alreadyClaimed)
  const totalPotentialSavings = unclaimed.reduce((s, d) => s + d.taxSavings, 0)
  const displayed = filter === 'unclaimed' ? unclaimed : filter === 'claimed' ? claimed : discoveries.filter(d => d.applies)

  const hasData = state.incomeStreams.length > 0

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Search size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Deduction Discovery</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add your financial profile to discover unclaimed deductions and credits.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title">Deduction Discovery</h1>
        <p className="section-subtitle">Proactively identifies deductions and credits you may be missing</p>
      </div>

      {/* Summary Banner */}
      {totalPotentialSavings > 0 && (
        <div className="glass-card gold-glow" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={22} color="var(--accent-gold)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: 'var(--accent-gold)' }}>
              {fmt(totalPotentialSavings)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}> potential tax savings</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {unclaimed.length} unclaimed deduction{unclaimed.length !== 1 ? 's' : ''} found · {claimed.length} already captured
            </div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Discovered', value: `${discoveries.filter(d => d.applies).length}`, color: 'var(--accent-blue)', icon: <Search size={14} /> },
          { label: 'Unclaimed', value: `${unclaimed.length}`, color: 'var(--accent-gold)', icon: <AlertTriangle size={14} /> },
          { label: 'Already Captured', value: `${claimed.length}`, color: 'var(--accent-emerald)', icon: <CheckCircle2 size={14} /> },
          { label: 'Potential Savings', value: fmt(totalPotentialSavings), color: 'var(--accent-gold)', icon: <DollarSign size={14} /> },
        ].map((kpi, i) => (
          <div key={i} style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <div style={{ color: kpi.color, marginBottom: 4 }}>{kpi.icon}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-surface)', borderRadius: 10, padding: 3, border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
        {[
          { key: 'all', label: `All (${discoveries.filter(d => d.applies).length})` },
          { key: 'unclaimed', label: `Unclaimed (${unclaimed.length})` },
          { key: 'claimed', label: `Captured (${claimed.length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key as any)}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: filter === tab.key ? 'var(--accent-gold)' : 'transparent',
              color: filter === tab.key ? '#0c0e12' : 'var(--text-muted)' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Deduction Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {displayed.map(ded => (
          <DeductionCard key={ded.id} ded={ded} expanded={expanded === ded.id}
            onToggle={() => setExpanded(expanded === ded.id ? null : ded.id)} />
        ))}
        {displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            {filter === 'unclaimed' ? 'No unclaimed deductions found — great job!' : 'No deductions found for this filter.'}
          </div>
        )}
      </div>
    </div>
  )
}

function DeductionCard({ ded, expanded, onToggle }: { ded: DiscoveredDeduction; expanded: boolean; onToggle: () => void }) {
  const icon = CATEGORY_ICONS[ded.category] || '📋'
  const confColor = CONFIDENCE_COLORS[ded.confidence]

  return (
    <div style={{
      borderRadius: 12, background: ded.alreadyClaimed ? 'var(--bg-surface)' : 'var(--bg-elevated)',
      border: `1px solid ${ded.alreadyClaimed ? 'var(--border-subtle)' : ded.taxSavings > 1000 ? 'var(--accent-gold-glow)' : 'var(--border-medium)'}`,
      overflow: 'hidden', opacity: ded.alreadyClaimed ? 0.7 : 1,
    }}>
      <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }} onClick={onToggle}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ded.name}</span>
            {ded.alreadyClaimed && <span className="badge emerald" style={{ fontSize: 9 }}>Captured</span>}
            <span className="badge muted" style={{ fontSize: 9 }}>{ded.confidence} confidence</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ded.eligibility}</div>
        </div>
        <div style={{ textAlign: 'right', marginRight: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: ded.alreadyClaimed ? 'var(--text-muted)' : 'var(--accent-emerald)' }}>
            {fmt(ded.taxSavings)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>tax savings</div>
        </div>
        {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </div>

      {expanded && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-primary)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Estimated Deduction</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--accent-gold)' }}>{fmt(ded.estimatedAmount)}</div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-primary)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tax Savings</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--accent-emerald)' }}>{fmt(ded.taxSavings)}</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>How to Claim</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-primary)' }}>
              {ded.howToClaim}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Requirements</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ded.requirements.map((req, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <CheckCircle2 size={12} color="var(--accent-emerald)" style={{ marginTop: 1, flexShrink: 0 }} />
                  {req}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: confColor }} />
            Confidence: {ded.confidence} · Category: {ded.category}
          </div>
        </div>
      )}
    </div>
  )
}
