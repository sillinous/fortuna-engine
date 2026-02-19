import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { analyzeStateArbitrage, type StateComparison } from '../engine/state-arbitrage'
import {
  MapPin, TrendingUp, TrendingDown, ArrowRight, Filter,
  ChevronDown, Star, DollarSign,
} from 'lucide-react'

type SortKey = 'adjustedSavings' | 'totalStateTax' | 'costOfLivingIndex' | 'estimatedIncomeTax'

export function StateArbitrage() {
  const { state } = useFortuna()
  const [spending, setSpending] = useState(60000)
  const [homeValue, setHomeValue] = useState(300000)
  const [sortBy, setSortBy] = useState<SortKey>('adjustedSavings')
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState<'all' | 'no_income_tax' | 'low_col'>('all')

  const analysis = useMemo(() => analyzeStateArbitrage(state, spending, homeValue), [state, spending, homeValue])

  let filtered = [...analysis.comparisons]
  if (filter === 'no_income_tax') filtered = filtered.filter(c => c.incomeTaxType === 'None')
  if (filter === 'low_col') filtered = filtered.filter(c => c.costOfLivingIndex < 100)

  filtered.sort((a, b) => {
    if (sortBy === 'adjustedSavings') return b.adjustedSavings - a.adjustedSavings
    if (sortBy === 'totalStateTax') return a.totalStateTax - b.totalStateTax
    if (sortBy === 'costOfLivingIndex') return a.costOfLivingIndex - b.costOfLivingIndex
    if (sortBy === 'estimatedIncomeTax') return a.estimatedIncomeTax - b.estimatedIncomeTax
    return 0
  })

  const displayed = showAll ? filtered : filtered.slice(0, 15)

  const card: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 24 }
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)', fontSize: 13, width: 130,
  }
  const filterBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, border: 'none',
    background: active ? 'var(--accent-gold-dim)' : 'var(--bg-surface)',
    color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
    cursor: 'pointer', fontSize: 11, fontWeight: 500,
  })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 6 }}>
          State Tax Arbitrage
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Compare total state tax burden across all states. Identifies optimal relocation targets for remote workers and location-flexible earners.
        </p>
      </div>

      {/* Current state card */}
      <div style={{
        ...card,
        background: 'linear-gradient(135deg, rgba(212,168,67,0.06), rgba(212,168,67,0.02))',
        border: '1px solid rgba(212,168,67,0.15)',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MapPin size={16} color="var(--accent-gold)" />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                Current: {analysis.currentState.name}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total State Tax</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: 'var(--accent-red)' }}>
                  ${analysis.currentState.totalStateTax.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Income Tax</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>
                  ${analysis.currentState.estimatedIncomeTax.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Property Tax</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>
                  ${analysis.currentState.estimatedPropertyTax.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>COL Index</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>
                  {analysis.currentState.costOfLivingIndex}
                </div>
              </div>
            </div>
          </div>
          <div>
            {analysis.bestOverall.code !== analysis.currentState.code && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Best alternative</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-emerald)' }}>
                  {analysis.bestOverall.name}: Save ${analysis.bestOverall.adjustedSavings.toLocaleString()}/yr
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top recommendations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        {analysis.topRecommendations.slice(0, 4).map((rec, i) => (
          <div key={rec.code} style={{
            ...card,
            padding: 16,
            borderLeft: `3px solid ${i === 0 ? 'var(--accent-gold)' : i === 1 ? 'var(--accent-emerald)' : 'var(--accent-blue)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {i === 0 && <Star size={12} color="var(--accent-gold)" />}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{rec.name}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--accent-emerald)', marginBottom: 4 }}>
              +${rec.adjustedSavings.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {rec.incomeTaxType} · COL {rec.costOfLivingIndex}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Annual Spending</label>
            <input type="number" value={spending} onChange={e => setSpending(Number(e.target.value))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Home Value</label>
            <input type="number" value={homeValue} onChange={e => setHomeValue(Number(e.target.value))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={filterBtn(filter === 'all')} onClick={() => setFilter('all')}>All States</button>
          <button style={filterBtn(filter === 'no_income_tax')} onClick={() => setFilter('no_income_tax')}>No Income Tax</button>
          <button style={filterBtn(filter === 'low_col')} onClick={() => setFilter('low_col')}>Low COL</button>
        </div>
      </div>

      {/* Comparison table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-primary)' }}>
                {[
                  { key: 'rank', label: '#', sortable: false },
                  { key: 'name', label: 'State', sortable: false },
                  { key: 'estimatedIncomeTax', label: 'Income Tax', sortable: true },
                  { key: 'estimatedSalesTax', label: 'Sales Tax', sortable: false },
                  { key: 'estimatedPropertyTax', label: 'Property Tax', sortable: false },
                  { key: 'totalStateTax', label: 'Total Tax', sortable: true },
                  { key: 'adjustedSavings', label: 'Net Savings (COL adj)', sortable: true },
                  { key: 'costOfLivingIndex', label: 'COL', sortable: true },
                  { key: 'incomeTaxType', label: 'Type', sortable: false },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && setSortBy(col.key as SortKey)}
                    style={{
                      padding: '10px 12px', textAlign: col.key === 'name' ? 'left' : 'right',
                      color: sortBy === col.key ? 'var(--accent-gold)' : 'var(--text-muted)',
                      fontWeight: 500, fontSize: 11, cursor: col.sortable ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                    {sortBy === col.key && ' ▾'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((c, i) => {
                const isCurrent = c.code === analysis.currentState.code
                return (
                  <tr key={c.code} style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isCurrent ? 'var(--accent-gold)08' : i % 2 === 0 ? 'transparent' : 'var(--bg-primary)',
                  }}>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.rank}</td>
                    <td style={{ padding: '10px 12px', fontWeight: isCurrent ? 600 : 400, color: isCurrent ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                      {c.name} {isCurrent && '(current)'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: c.estimatedIncomeTax === 0 ? 'var(--accent-emerald)' : 'var(--text-secondary)' }}>
                      {c.estimatedIncomeTax === 0 ? '—' : `$${c.estimatedIncomeTax.toLocaleString()}`}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      ${c.estimatedSalesTax.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      ${c.estimatedPropertyTax.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                      ${c.totalStateTax.toLocaleString()}
                    </td>
                    <td style={{
                      padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600,
                      color: c.adjustedSavings > 0 ? 'var(--accent-emerald)' : c.adjustedSavings < 0 ? 'var(--accent-red)' : 'var(--text-muted)',
                    }}>
                      {c.adjustedSavings > 0 ? '+' : ''}{c.adjustedSavings === 0 ? '—' : `$${c.adjustedSavings.toLocaleString()}`}
                    </td>
                    <td style={{
                      padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                      color: c.costOfLivingIndex < 95 ? 'var(--accent-emerald)' : c.costOfLivingIndex > 110 ? 'var(--accent-red)' : 'var(--text-muted)',
                    }}>
                      {c.costOfLivingIndex}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: c.incomeTaxType === 'None' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                      {c.incomeTaxType}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!showAll && filtered.length > 15 && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button
              onClick={() => setShowAll(true)}
              style={{
                background: 'none', border: 'none', color: 'var(--accent-gold)',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
              }}
            >
              Show all {filtered.length} states ▾
            </button>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        * Estimates based on simplified tax models. Income tax uses effective rates approximated from marginal brackets.
        Sales tax assumes ~35% of annual spending on taxable goods. Property tax based on state average effective rates.
        Cost of living adjustments based on BLS composite indices. Consult a tax professional before making relocation decisions.
      </div>
    </div>
  )
}
