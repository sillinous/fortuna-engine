/**
 * Fortuna Engine — P&L Statement View
 *
 * Professional income statement with period-over-period comparison,
 * margin visualization, and actionable insights.
 */

import { useMemo, useState } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generatePnL, type PnLLineItem, type PnLStatement } from '../engine/pnl-engine'
import { useNavigation, RelatedViews, ViewBreadcrumb } from '../context/NavigationContext'
import {
  FileText, TrendingUp, TrendingDown, Minus, ArrowRight,
  DollarSign, Percent, BarChart3, Lightbulb
} from 'lucide-react'

function fmt(n: number): string {
  if (n < 0) return `($${Math.abs(n).toLocaleString()})`
  return `$${n.toLocaleString()}`
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  const change = (current - previous) / Math.abs(previous)
  const positive = change >= 0
  const Icon = change > 0.01 ? TrendingUp : change < -0.01 ? TrendingDown : Minus
  return (
    <span style={{
      fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3,
      color: positive ? '#22c55e' : '#ef4444',
    }}>
      <Icon size={11} />
      {Math.abs(change * 100).toFixed(1)}%
    </span>
  )
}

function LineItemRow({ item, showPrevious }: { item: PnLLineItem; showPrevious: boolean }) {
  const isHighlight = item.isSubtotal || item.isTotal

  return (
    <tr style={{
      fontWeight: isHighlight ? 700 : 400,
      borderTop: item.isSubtotal ? '1px solid var(--border-subtle)' : undefined,
      borderBottom: item.isTotal ? '2px solid var(--text-muted)' : undefined,
    }}>
      <td style={{
        padding: '8px 12px',
        paddingLeft: item.indent ? 12 + item.indent * 20 : 12,
        color: isHighlight ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: isHighlight ? 14 : 13,
      }}>
        {item.label}
        {item.note && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>({item.note})</span>
        )}
      </td>
      <td style={{
        padding: '8px 12px', textAlign: 'right',
        fontFamily: 'var(--font-mono)', fontSize: 13,
        color: item.amount < 0 ? '#ef4444' : isHighlight ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}>
        {fmt(item.amount)}
      </td>
      {showPrevious && (
        <>
          <td style={{
            padding: '8px 12px', textAlign: 'right',
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--text-muted)',
          }}>
            {fmt(item.previousAmount)}
          </td>
          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
            <ChangeIndicator current={item.amount} previous={item.previousAmount} />
          </td>
        </>
      )}
    </tr>
  )
}

function MarginBar({ label, value, color }: { label: string; value: number; color: string }) {
  const width = Math.min(Math.abs(value) * 100, 100)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: value < 0 ? '#ef4444' : color }}>
          {pct(value)}
        </span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${width}%`,
          background: value < 0 ? '#ef4444' : color,
          borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

export function PnLView() {
  const { state } = useFortuna()
  const { navigate } = useNavigation()
  const [showPrevious, setShowPrevious] = useState(true)
  const [growthRate, setGrowthRate] = useState(10)
  const [activeTab, setActiveTab] = useState<'statement' | 'analysis'>('statement')

  const pnl: PnLStatement = useMemo(() => {
    return generatePnL(state, growthRate / 100)
  }, [state, growthRate])

  // Build the statement rows
  const buildRows = (): PnLLineItem[] => {
    const rows: PnLLineItem[] = []

    // Revenue section
    for (const item of pnl.revenueItems) {
      rows.push({ ...item, indent: 1 })
    }
    rows.push({
      label: 'Total Revenue', amount: pnl.totalRevenue, previousAmount: pnl.prevTotalRevenue,
      category: 'revenue', isSubtotal: true,
    })

    // COGS
    if (pnl.cogsItems.length > 0) {
      for (const item of pnl.cogsItems) {
        rows.push({ ...item, indent: 1 })
      }
      rows.push({
        label: 'Total Cost of Goods Sold', amount: -pnl.totalCOGS, previousAmount: -pnl.prevTotalCOGS,
        category: 'cogs', isSubtotal: true,
      })
    }

    // Gross Profit
    rows.push({
      label: 'Gross Profit', amount: pnl.grossProfit, previousAmount: pnl.prevGrossProfit,
      category: 'revenue', isSubtotal: true,
    })

    // Operating Expenses
    for (const item of pnl.opexItems) {
      rows.push({ ...item, indent: 1 })
    }
    rows.push({
      label: 'Total Operating Expenses', amount: -pnl.totalOpex, previousAmount: -pnl.prevTotalOpex,
      category: 'operating', isSubtotal: true,
    })

    // Operating Income
    rows.push({
      label: 'Operating Income (EBITDA)', amount: pnl.operatingIncome, previousAmount: pnl.prevOperatingIncome,
      category: 'operating', isSubtotal: true,
    })

    // Taxes
    for (const item of pnl.taxItems) {
      rows.push({ ...item, indent: 1 })
    }
    rows.push({
      label: 'Total Taxes', amount: -pnl.totalTax, previousAmount: -pnl.prevTotalTax,
      category: 'tax', isSubtotal: true,
    })

    // Net Income
    rows.push({
      label: 'Net Income', amount: pnl.netIncome, previousAmount: pnl.prevNetIncome,
      category: 'revenue', isTotal: true,
    })

    return rows
  }

  const rows = buildRows()
  const tabs = [
    { key: 'statement', label: 'P&L Statement', icon: FileText },
    { key: 'analysis', label: 'Margin Analysis', icon: BarChart3 },
  ] as const

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <ViewBreadcrumb viewKey="pnl" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <FileText size={24} style={{ color: '#818cf8' }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Profit & Loss Statement
            </h1>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            {pnl.periodLabel} — Income statement with period-over-period comparison
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Revenue', value: fmt(pnl.totalRevenue), sub: pct(pnl.yoyGrowth) + ' YoY', color: '#818cf8' },
          { label: 'Gross Margin', value: pct(pnl.grossMargin), sub: fmt(pnl.grossProfit), color: '#22c55e' },
          { label: 'Op. Margin', value: pct(pnl.operatingMargin), sub: fmt(pnl.operatingIncome), color: '#06b6d4' },
          { label: 'Tax Rate', value: pct(pnl.effectiveTaxRate), sub: fmt(pnl.totalTax), color: '#f59e0b' },
          { label: 'Net Income', value: fmt(pnl.netIncome), sub: pct(pnl.netMargin) + ' margin', color: pnl.netIncome >= 0 ? '#22c55e' : '#ef4444' },
        ].map((k, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', borderRadius: 10,
            padding: '12px 14px', border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: k.color }}>
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                fontSize: 13, padding: '7px 14px', borderRadius: 8,
                background: activeTab === t.key ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: `1px solid ${activeTab === t.key ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
                color: activeTab === t.key ? '#818cf8' : 'var(--text-muted)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={showPrevious} onChange={e => setShowPrevious(e.target.checked)}
              style={{ marginRight: 6 }} />
            Compare
          </label>
          {showPrevious && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Growth:</span>
              <input type="number" value={growthRate} onChange={e => setGrowthRate(Number(e.target.value))}
                style={{
                  width: 48, fontSize: 12, padding: '3px 6px', borderRadius: 4,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', textAlign: 'center',
                }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'statement' && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border-subtle)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  Account
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {pnl.period}
                </th>
                {showPrevious && (
                  <>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {pnl.previousPeriod}
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                      Δ
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Section headers */}
              <tr><td colSpan={showPrevious ? 4 : 2} style={{
                padding: '12px 12px 4px', fontSize: 11, fontWeight: 700,
                color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>Revenue</td></tr>

              {rows.slice(0, pnl.revenueItems.length + 1).map((r, i) => (
                <LineItemRow key={`rev-${i}`} item={r} showPrevious={showPrevious} />
              ))}

              {pnl.cogsItems.length > 0 && (
                <>
                  <tr><td colSpan={showPrevious ? 4 : 2} style={{
                    padding: '12px 12px 4px', fontSize: 11, fontWeight: 700,
                    color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>Cost of Goods Sold</td></tr>
                  {rows.slice(pnl.revenueItems.length + 1, pnl.revenueItems.length + 1 + pnl.cogsItems.length + 1).map((r, i) => (
                    <LineItemRow key={`cogs-${i}`} item={r} showPrevious={showPrevious} />
                  ))}
                </>
              )}

              {/* Gross Profit row */}
              <LineItemRow
                item={rows.find(r => r.label === 'Gross Profit')!}
                showPrevious={showPrevious}
              />

              <tr><td colSpan={showPrevious ? 4 : 2} style={{
                padding: '12px 12px 4px', fontSize: 11, fontWeight: 700,
                color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>Operating Expenses</td></tr>

              {pnl.opexItems.map((item, i) => (
                <LineItemRow key={`opex-${i}`} item={{ ...item, indent: 1 }} showPrevious={showPrevious} />
              ))}
              <LineItemRow
                item={rows.find(r => r.label === 'Total Operating Expenses')!}
                showPrevious={showPrevious}
              />
              <LineItemRow
                item={rows.find(r => r.label === 'Operating Income (EBITDA)')!}
                showPrevious={showPrevious}
              />

              <tr><td colSpan={showPrevious ? 4 : 2} style={{
                padding: '12px 12px 4px', fontSize: 11, fontWeight: 700,
                color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>Taxes</td></tr>

              {pnl.taxItems.map((item, i) => (
                <LineItemRow key={`tax-${i}`} item={{ ...item, indent: 1 }} showPrevious={showPrevious} />
              ))}
              <LineItemRow
                item={rows.find(r => r.label === 'Total Taxes')!}
                showPrevious={showPrevious}
              />

              {/* Net Income */}
              <LineItemRow
                item={rows.find(r => r.label === 'Net Income')!}
                showPrevious={showPrevious}
              />
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12,
            padding: 20, border: '1px solid var(--border-subtle)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              Margin Waterfall
            </h3>
            <MarginBar label="Gross Margin" value={pnl.grossMargin} color="#22c55e" />
            <MarginBar label="Operating Margin" value={pnl.operatingMargin} color="#06b6d4" />
            <MarginBar label="Net Margin" value={pnl.netMargin} color={pnl.netMargin >= 0 ? '#818cf8' : '#ef4444'} />
            <MarginBar label="Tax Burden (% of Revenue)" value={-pnl.effectiveTaxRate} color="#f59e0b" />
          </div>

          <div style={{
            background: 'var(--bg-card)', borderRadius: 12,
            padding: 20, border: '1px solid var(--border-subtle)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              Revenue Breakdown
            </h3>
            {pnl.revenueItems.map((item, i) => {
              const share = pnl.totalRevenue > 0 ? item.amount / pnl.totalRevenue : 0
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {fmt(item.amount)} ({pct(share)})
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', width: `${share * 100}%`,
                      background: `hsl(${240 + i * 30}, 70%, 65%)`,
                      borderRadius: 2,
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Expense distribution */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12,
            padding: 20, border: '1px solid var(--border-subtle)',
            gridColumn: '1 / -1',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
              Expense Distribution
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {pnl.opexItems.map((item, i) => {
                const share = pnl.totalOpex > 0 ? item.amount / pnl.totalOpex : 0
                return (
                  <div key={i} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {fmt(item.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct(share)} of opex</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Insights */}
      {pnl.insights.length > 0 && (
        <div style={{
          marginTop: 20, padding: 16,
          background: 'rgba(99,102,241,0.05)',
          borderRadius: 10,
          border: '1px solid rgba(99,102,241,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Lightbulb size={16} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              P&L Insights
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pnl.insights.map((insight, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 24 }}>
                • {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      <RelatedViews currentView="pnl" />
    </div>
  )
}
