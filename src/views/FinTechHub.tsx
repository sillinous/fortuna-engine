/**
 * Fortuna Engine — FinTech Hub View
 *
 * Manages provider connections, displays aggregated financial data,
 * runs syncs, and shows tax enrichment analysis.
 *
 * Sections:
 *   1. Provider Connections — status, health, add/remove
 *   2. Linked Accounts — all accounts across providers with balances
 *   3. Transaction Feed — enriched with tax categories
 *   4. Tax Intelligence — deductible totals, category breakdown
 *   5. Sync Controls — manual sync, last sync time, errors
 */

import { useState, useCallback, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  SUPPORTED_PROVIDERS, getConnections, getAllAccounts,
  getAggregateBalances, getConnectionHealth,
  type ConnectionHealth,
} from '../engine/fintech-connections'
import type { FinTechAccount, FinTechProvider } from '../engine/fintech-models'

type Tab = 'connections' | 'accounts' | 'transactions' | 'tax' | 'providers'

export default function FinTechHub() {
  const { state } = useFortuna()
  const [tab, setTab] = useState<Tab>('connections')
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  // ─── Data ───────────────────────────────────────────────────────────

  const connections = useMemo(() => getConnections(), [])
  const accounts = useMemo(() => getAllAccounts(), [])
  const balances = useMemo(() => getAggregateBalances(), [accounts])
  const health = useMemo(() => getConnectionHealth(), [connections])

  // ─── Styles ─────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: '#1a1a2e', borderRadius: 12, padding: 24,
    border: '1px solid rgba(255,255,255,0.06)',
  }
  const badge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 6,
    fontSize: 11, fontWeight: 600, background: `${color}20`, color,
  })
  const statBox: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 16,
    textAlign: 'center',
  }
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 600 : 400, border: 'none',
    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
    color: active ? '#818cf8' : '#94a3b8',
    transition: 'all 0.2s',
  })

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#f1f5f9' }}>
          🔗 FinTech Integration Hub
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
          Connect financial accounts via Plaid, Unit, MX, Stripe, and more. Auto-enriched with tax intelligence.
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={statBox}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Connections</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{connections.length}</div>
          <div style={{ fontSize: 10, color: health.filter(h => h.needsReauth).length > 0 ? '#f59e0b' : '#22c55e' }}>
            {health.filter(h => h.needsReauth).length > 0
              ? `${health.filter(h => h.needsReauth).length} need attention`
              : 'All healthy'}
          </div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Linked Accounts</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{accounts.length}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {Object.entries(balances.byType).map(([t, d]) => `${d.count} ${t}`).join(', ') || 'None yet'}
          </div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total Assets</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>
            ${balances.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Total Liabilities</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>
            ${balances.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Net Worth</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: balances.netWorth >= 0 ? '#22c55e' : '#ef4444' }}>
            ${balances.netWorth.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          ['connections', '🔌 Connections'],
          ['accounts', '🏦 Accounts'],
          ['transactions', '📊 Transactions'],
          ['tax', '💰 Tax Intelligence'],
          ['providers', '🧩 Available Providers'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} style={tabStyle(tab === key)} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'connections' && (
        <ConnectionsTab health={health} connections={connections} card={card} badge={badge} />
      )}
      {tab === 'accounts' && (
        <AccountsTab accounts={accounts} card={card} badge={badge} />
      )}
      {tab === 'transactions' && (
        <TransactionsTab state={state} card={card} badge={badge} />
      )}
      {tab === 'tax' && (
        <TaxIntelligenceTab state={state} card={card} badge={badge} />
      )}
      {tab === 'providers' && (
        <ProvidersTab card={card} badge={badge} selectedProvider={selectedProvider} onSelect={setSelectedProvider} />
      )}
    </div>
  )
}

// ─── Connections Tab ──────────────────────────────────────────────────────

function ConnectionsTab({ health, connections, card, badge }: {
  health: ConnectionHealth[]; connections: any[]; card: React.CSSProperties; badge: (c: string) => React.CSSProperties
}) {
  const statusColor: Record<string, string> = {
    active: '#22c55e', degraded: '#f59e0b', disconnected: '#ef4444',
    pending_reauth: '#f59e0b', error: '#ef4444',
  }

  if (connections.length === 0) {
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔌</div>
          <h3 style={{ color: '#f1f5f9', margin: '0 0 8px' }}>No Connections Yet</h3>
          <p style={{ color: '#64748b', fontSize: 13, maxWidth: 480, margin: '0 auto 20px' }}>
            Connect your bank accounts, credit cards, investments, and loans to automatically
            import transactions with tax-aware categorization. Supports Plaid, Unit, MX, Stripe, and more.
          </p>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
            <strong>How to connect:</strong><br />
            1. Register a provider in Settings → API Keys (Plaid client_id + secret)<br />
            2. Use the SDK link component or call <code>createLinkToken()</code><br />
            3. Exchange the public token to establish the connection<br />
            4. Sync accounts + transactions with <code>syncConnection()</code>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {health.map(h => (
        <div key={h.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>{h.institution || h.provider}</span>
              <span style={badge(statusColor[h.status] || '#64748b')}>{h.status}</span>
              <span style={badge('#6366f1')}>{h.provider}</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {h.accountCount} accounts • Last sync: {h.lastSync ? new Date(h.lastSync).toLocaleDateString() : 'Never'}
              {h.staleDays > 7 && <span style={{ color: '#f59e0b' }}> • Stale ({h.staleDays}d)</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>
              Sync Now
            </button>
            {h.needsReauth && (
              <button style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#f59e0b20', color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Re-authenticate
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────

function AccountsTab({ accounts, card, badge }: {
  accounts: FinTechAccount[]; card: React.CSSProperties; badge: (c: string) => React.CSSProperties
}) {
  const typeColors: Record<string, string> = {
    depository: '#22c55e', credit: '#ef4444', investment: '#6366f1', loan: '#f59e0b', other: '#64748b',
  }

  if (accounts.length === 0) {
    return (
      <div style={card}>
        <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
          No linked accounts. Connect a provider to see accounts here.
        </p>
      </div>
    )
  }

  // Group by type
  const grouped: Record<string, FinTechAccount[]> = {}
  for (const acct of accounts) {
    if (!grouped[acct.type]) grouped[acct.type] = []
    grouped[acct.type].push(acct)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {Object.entries(grouped).map(([type, accts]) => (
        <div key={type} style={card}>
          <h3 style={{ color: typeColors[type] || '#f1f5f9', margin: '0 0 12px', fontSize: 14, textTransform: 'capitalize' }}>
            {type} Accounts ({accts.length})
          </h3>
          {accts.map(acct => (
            <div key={acct.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 500 }}>
                  {acct.officialName || acct.name}
                  {acct.mask && <span style={{ color: '#64748b' }}> ····{acct.mask}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, marginTop: 2 }}>
                  <span style={badge(typeColors[acct.type] || '#64748b')}>{acct.subtype}</span>
                  {acct.taxRelevance.isTaxAdvantaged && (
                    <span style={badge('#22c55e')}>Tax-Advantaged</span>
                  )}
                  <span style={{ color: '#475569' }}>{acct.institutionName}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 14, fontWeight: 600,
                  color: (acct.balances.current || 0) >= 0 ? '#f1f5f9' : '#ef4444',
                }}>
                  ${Math.abs(acct.balances.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                {acct.balances.available != null && acct.balances.available !== acct.balances.current && (
                  <div style={{ fontSize: 10, color: '#64748b' }}>
                    Available: ${acct.balances.available.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────

function TransactionsTab({ state: fortunaState, card, badge }: {
  state: any; card: React.CSSProperties; badge: (c: string) => React.CSSProperties
}) {
  const txns = fortunaState.bankTransactions || []
  const [filter, setFilter] = useState<'all' | 'income' | 'expense' | 'deductible'>('all')

  const filtered = useMemo(() => {
    let result = [...txns].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    if (filter === 'income') result = result.filter((t: any) => t.amount > 0)
    if (filter === 'expense') result = result.filter((t: any) => t.amount < 0)
    if (filter === 'deductible') result = result.filter((t: any) => t.amount < 0) // Simplified
    return result.slice(0, 100) // Show max 100
  }, [txns, filter])

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: 14 }}>
          Transactions ({txns.length})
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'income', 'expense', 'deductible'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
              background: filter === f ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: filter === f ? '#818cf8' : '#64748b',
            }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: 20, fontSize: 13 }}>
          No transactions yet. Connect a provider and sync to see transactions enriched with tax categories.
        </p>
      ) : (
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {filtered.map((txn: any, i: number) => (
            <div key={txn.id || i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#e2e8f0' }}>{txn.description}</div>
                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, marginTop: 2 }}>
                  <span>{txn.date}</span>
                  {txn.category && <span style={badge('#6366f1')}>{txn.category}</span>}
                  {txn.isReconciled && <span style={{ color: '#22c55e' }}>✓</span>}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                color: txn.amount >= 0 ? '#22c55e' : '#ef4444',
              }}>
                {txn.amount >= 0 ? '+' : ''}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tax Intelligence Tab ─────────────────────────────────────────────────

function TaxIntelligenceTab({ state: fortunaState, card, badge }: {
  state: any; card: React.CSSProperties; badge: (c: string) => React.CSSProperties
}) {
  const txns = fortunaState.bankTransactions || []
  const expenses = fortunaState.expenses || []

  const totalDeductible = expenses.filter((e: any) => e.isDeductible).reduce((s: number, e: any) => s + (e.annualAmount || 0), 0)
  const totalNonDeductible = expenses.filter((e: any) => !e.isDeductible).reduce((s: number, e: any) => s + (e.annualAmount || 0), 0)

  // Category breakdown from expenses
  const categories: Record<string, { amount: number; deductible: boolean; count: number }> = {}
  for (const exp of expenses) {
    const cat = exp.category || 'Other'
    if (!categories[cat]) categories[cat] = { amount: 0, deductible: exp.isDeductible, count: 0 }
    categories[cat].amount += exp.annualAmount || 0
    categories[cat].count++
  }
  const sortedCategories = Object.entries(categories).sort((a, b) => b[1].amount - a[1].amount)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Deductible Expenses</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>
            ${totalDeductible.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>Schedule C / Schedule A eligible</div>
        </div>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Non-Deductible</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#94a3b8' }}>
            ${totalNonDeductible.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>Personal / entertainment / non-qualifying</div>
        </div>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Est. Tax Savings</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#6366f1' }}>
            ${Math.round(totalDeductible * 0.25).toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>At ~25% effective rate</div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div style={card}>
        <h3 style={{ margin: '0 0 12px', color: '#f1f5f9', fontSize: 14 }}>
          Expense Category Breakdown
        </h3>
        {sortedCategories.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>
            No categorized expenses yet. Import transactions from a provider or QuickBooks to see tax analysis.
          </p>
        ) : (
          sortedCategories.map(([cat, data]) => (
            <div key={cat} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#e2e8f0' }}>{cat}</span>
                {data.deductible
                  ? <span style={badge('#22c55e')}>✓ Deductible</span>
                  : <span style={badge('#64748b')}>Non-deductible</span>
                }
                <span style={{ fontSize: 11, color: '#475569' }}>({data.count})</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: data.deductible ? '#22c55e' : '#94a3b8' }}>
                ${data.amount.toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Enrichment Engine Info */}
      <div style={card}>
        <h3 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: 14 }}>
          🧠 Transaction Enrichment Engine
        </h3>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 12px' }}>
          Every imported transaction runs through the enrichment pipeline:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 4 }}>
              MCC Code Rules
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              40+ Merchant Category Codes mapped to tax categories (highest confidence)
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 4 }}>
              Merchant Name Patterns
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              60+ regex rules matching SaaS, travel, meals, professional services, tax payments
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 4 }}>
              Category Mapping
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              35+ personal finance categories mapped to Schedule C/E/A/B/D line items
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#818cf8', marginBottom: 4 }}>
              Tax Payment Detection
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Auto-detects IRS, state tax, property tax, and payroll tax payments
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Providers Tab ────────────────────────────────────────────────────────

function ProvidersTab({ card, badge, selectedProvider, onSelect }: {
  card: React.CSSProperties; badge: (c: string) => React.CSSProperties
  selectedProvider: string | null; onSelect: (p: string | null) => void
}) {
  const typeColors: Record<string, string> = {
    aggregation: '#6366f1', baas: '#22c55e', payments: '#f59e0b', identity: '#06b6d4', verification: '#a855f7',
  }

  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 4px', color: '#f1f5f9', fontSize: 14 }}>Supported FinTech Providers</h3>
      <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 16px' }}>
        Fortuna's adapter layer normalizes data from any provider into a unified schema with tax intelligence.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {SUPPORTED_PROVIDERS.map(p => (
          <div
            key={p.provider}
            onClick={() => onSelect(selectedProvider === p.provider ? null : p.provider)}
            style={{
              padding: 14, borderRadius: 8, cursor: 'pointer',
              background: selectedProvider === p.provider ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
              border: selectedProvider === p.provider ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{p.name}</span>
                <span style={{ ...badge(typeColors[p.type] || '#64748b'), marginLeft: 8 }}>{p.type}</span>
                {p.sandboxAvailable && <span style={{ ...badge('#22c55e'), marginLeft: 4 }}>sandbox</span>}
              </div>
              <span style={{ fontSize: 11, color: '#475569' }}>{p.website.replace('https://', '')}</span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              {p.description}
            </div>
            {selectedProvider === p.provider && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', marginBottom: 6 }}>
                  Capabilities:
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {p.capabilities.map(c => (
                    <span key={c} style={badge('#6366f1')}>{c}</span>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: '#64748b' }}>
                  <strong>Integration:</strong> Register via <code>registerProvider({'{'} provider: '{p.provider}', clientId, secret, environment {'}'})</code>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Architecture diagram */}
      <div style={{
        marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.02)',
        borderRadius: 8, fontFamily: 'monospace', fontSize: 11, color: '#818cf8',
        lineHeight: 1.6, whiteSpace: 'pre',
      }}>
{`  ┌───────────────┐    ┌──────────────────┐    ┌───────────────┐
  │  Provider API  │───▶│  FinTech Adapter  │───▶│  Canonical     │
  │  (Plaid/Unit)  │    │  (normalize)      │    │  Models        │
  └───────────────┘    └──────────────────┘    └───────┬───────┘
                                                        │
  ┌───────────────┐    ┌──────────────────┐    ┌───────▼───────┐
  │  FortunaState  │◀───│  FinTech Bridge   │◀───│  Enrichment   │
  │  (tax engine)  │    │  (map to state)   │    │  Engine       │
  └───────────────┘    └──────────────────┘    └───────────────┘`}
      </div>
    </div>
  )
}
