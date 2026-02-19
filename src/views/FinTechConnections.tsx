/**
 * Fortuna Engine — FinTech Connections View
 *
 * Self-service bank connection management:
 *   - Search & connect institutions (Plaid Link / Unit SDK style)
 *   - Connection status cards with health indicators
 *   - Account overview with balances + tax relevance
 *   - Sync controls (manual + auto scheduling)
 *   - Net worth snapshot across all connected accounts
 *   - Provider configuration (API keys)
 *
 * @module FinTechConnections
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  searchInstitutions, POPULAR_INSTITUTIONS,
  type InstitutionInfo, type ConnectionRecord, type SyncResult,
  type ConnectionManagerState, DEFAULT_MANAGER_STATE,
} from '../engine/fintech-manager'
import type { FinTechAccount, FinTechProvider } from '../engine/fintech-models'

type Phase = 'overview' | 'search' | 'connecting' | 'provider_config'

export default function FinTechConnections() {
  const { state, updateState } = useFortuna()
  const [phase, setPhase] = useState<Phase>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [managerState, setManagerState] = useState<ConnectionManagerState>(
    () => (state as any).fintechConnections || DEFAULT_MANAGER_STATE,
  )
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<FinTechProvider>('plaid')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Persist manager state to Fortuna
  useEffect(() => {
    updateState((prev: any) => ({ ...prev, fintechConnections: managerState }))
  }, [managerState])

  // Search results
  const searchResults = useMemo(() => searchInstitutions(searchQuery, 12), [searchQuery])

  // Aggregate stats
  const stats = useMemo(() => {
    const accounts = managerState.connections.flatMap(c => c.accounts || [])
    let totalBalance = 0, totalDebt = 0
    const byType: Record<string, { count: number; balance: number }> = {}

    for (const a of accounts) {
      const bal = a.balances?.current || 0
      const t = a.type
      if (!byType[t]) byType[t] = { count: 0, balance: 0 }
      byType[t].count++
      byType[t].balance += bal
      if (t === 'loan' || t === 'credit') totalDebt += Math.abs(bal)
      else totalBalance += bal
    }

    return { totalAccounts: accounts.length, totalBalance, totalDebt, netWorth: totalBalance - totalDebt, byType }
  }, [managerState.connections])

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleConnectInstitution = useCallback((inst: InstitutionInfo) => {
    // Simulate Plaid Link / provider SDK flow
    // In production, this would open the provider's frontend SDK (Plaid Link, etc.)
    setPhase('connecting')
    const timer = setTimeout(() => {
      const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      const newRecord: ConnectionRecord = {
        connection: {
          id: connId,
          provider: selectedProvider,
          institutionId: inst.id,
          institutionName: inst.name,
          status: 'active',
          lastSuccessfulSync: new Date().toISOString(),
          accountIds: [],
          capabilities: ['accounts', 'transactions', 'balance'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        accessToken: `access_${connId}`,
        accounts: generateMockAccounts(inst, connId),
      }

      setManagerState(prev => ({
        ...prev,
        connections: [...prev.connections, newRecord],
      }))
      setNotification({ type: 'success', message: `Connected to ${inst.name}` })
      setPhase('overview')
      setSearchQuery('')
    }, 1500)
    return () => clearTimeout(timer)
  }, [selectedProvider])

  const handleRemoveConnection = useCallback((connId: string) => {
    setManagerState(prev => ({
      ...prev,
      connections: prev.connections.filter(c => c.connection.id !== connId),
    }))
    setNotification({ type: 'success', message: 'Connection removed' })
  }, [])

  const handleSync = useCallback(async (connId: string) => {
    setSyncingId(connId)
    // Simulate sync
    await new Promise(r => setTimeout(r, 1200))
    setManagerState(prev => ({
      ...prev,
      connections: prev.connections.map(c =>
        c.connection.id === connId
          ? {
              ...c,
              connection: { ...c.connection, lastSuccessfulSync: new Date().toISOString(), status: 'active' as const },
              lastSyncResult: { timestamp: new Date().toISOString(), transactionsAdded: Math.floor(Math.random() * 20), transactionsModified: 0, transactionsRemoved: 0, errors: [], durationMs: 1200 },
            }
          : c,
      ),
    }))
    setSyncingId(null)
    setNotification({ type: 'success', message: 'Sync complete' })
  }, [])

  const handleSyncAll = useCallback(async () => {
    setSyncingId('all')
    await new Promise(r => setTimeout(r, 2000))
    setManagerState(prev => ({
      ...prev,
      lastGlobalSync: new Date().toISOString(),
      connections: prev.connections.map(c => ({
        ...c,
        connection: { ...c.connection, lastSuccessfulSync: new Date().toISOString(), status: 'active' as const },
      })),
    }))
    setSyncingId(null)
    setNotification({ type: 'success', message: 'All connections synced' })
  }, [])

  // ── Styles ────────────────────────────────────────────────────────────

  const card: React.CSSProperties = { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a4a', padding: 20 }
  const statBox: React.CSSProperties = { ...card, textAlign: 'center', padding: 16 }
  const btn = (color: string, small = false): React.CSSProperties => ({
    background: color, color: '#fff', border: 'none', borderRadius: 8,
    padding: small ? '6px 12px' : '10px 18px', cursor: 'pointer',
    fontSize: small ? 12 : 14, fontWeight: 600, transition: 'opacity 0.15s',
  })
  const badge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '3px 8px', borderRadius: 12,
    fontSize: 11, fontWeight: 600, color: '#fff', background: color,
  })
  const statusColor = (s: string) =>
    s === 'active' ? '#22c55e' : s === 'degraded' ? '#f59e0b' : s === 'pending_reauth' ? '#f59e0b' : '#ef4444'

  // ── Clear notification ────────────────────────────────────────────────

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 3000)
      return () => clearTimeout(t)
    }
  }, [notification])

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, color: '#e5e7eb' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#fff' }}>Connected Accounts</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9ca3af' }}>
            Link your bank accounts, credit cards, and investments for automatic tax categorization
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {managerState.connections.length > 0 && (
            <button style={btn('#3b82f6', true)} onClick={handleSyncAll} disabled={syncingId === 'all'}>
              {syncingId === 'all' ? '⟳ Syncing...' : '⟳ Sync All'}
            </button>
          )}
          <button style={btn('#6366f1')} onClick={() => setPhase('search')}>+ Connect Account</button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500,
          background: notification.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: notification.type === 'success' ? '#22c55e' : '#ef4444',
          border: `1px solid ${notification.type === 'success' ? '#22c55e33' : '#ef444433'}`,
        }}>
          {notification.message}
        </div>
      )}

      {/* Search / Connect Phase */}
      {phase === 'search' && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Connect Your Financial Institution</h3>
            <button style={{ ...btn('#ef4444', true), opacity: 0.8 }} onClick={() => { setPhase('overview'); setSearchQuery('') }}>✕ Cancel</button>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search banks, credit unions, brokerages..."
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid #4a4a6a',
              background: '#0d0d1a', color: '#e5e7eb', fontSize: 15, marginBottom: 16,
              outline: 'none', boxSizing: 'border-box',
            }}
            autoFocus
          />

          {!searchQuery && (
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Popular institutions</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {searchResults.map(inst => (
              <button
                key={inst.id}
                onClick={() => handleConnectInstitution(inst)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                  background: '#0d0d1a', border: '1px solid #2a2a4a', borderRadius: 10,
                  color: '#e5e7eb', cursor: 'pointer', transition: 'border-color 0.15s',
                  textAlign: 'left', fontSize: 14,
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = inst.primaryColor || '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a2a4a')}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: inst.primaryColor || '#333',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {inst.name.charAt(0)}
                </div>
                <span style={{ fontWeight: 500 }}>{inst.name}</span>
              </button>
            ))}
          </div>

          {searchResults.length === 0 && searchQuery && (
            <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 20 }}>
              No institutions found for "{searchQuery}". Try a different search term.
            </p>
          )}
        </div>
      )}

      {/* Connecting Phase */}
      {phase === 'connecting' && (
        <div style={{ ...card, textAlign: 'center', padding: 48, marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔗</div>
          <p style={{ fontSize: 16, color: '#fff', fontWeight: 500 }}>Connecting to your institution...</p>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>Securely establishing connection via {selectedProvider.toUpperCase()}</p>
          <div style={{ marginTop: 16 }}>
            <div style={{ width: 200, height: 4, background: '#2a2a4a', borderRadius: 4, margin: '0 auto', overflow: 'hidden' }}>
              <div style={{
                width: '60%', height: '100%', background: '#6366f1', borderRadius: 4,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Net Worth Summary */}
      {managerState.connections.length > 0 && phase === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <div style={statBox}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Net Worth</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: stats.netWorth >= 0 ? '#22c55e' : '#ef4444', marginTop: 4 }}>
              ${Math.abs(stats.netWorth).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={statBox}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Assets</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', marginTop: 4 }}>
              ${stats.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={statBox}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Liabilities</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>
              ${stats.totalDebt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={statBox}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Accounts</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e5e7eb', marginTop: 4 }}>{stats.totalAccounts}</div>
          </div>
        </div>
      )}

      {/* Connection Cards */}
      {phase === 'overview' && managerState.connections.map(record => (
        <div key={record.connection.id} style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: getInstColor(record.connection.institutionName),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 18,
              }}>
                {record.connection.institutionName.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{record.connection.institutionName}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                  <span style={badge(statusColor(record.connection.status))}>
                    {record.connection.status === 'active' ? '● Connected' : record.connection.status}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    via {record.connection.provider.toUpperCase()}
                  </span>
                  {record.connection.lastSuccessfulSync && (
                    <span style={{ fontSize: 11, color: '#6b7280' }}>
                      · Last sync: {new Date(record.connection.lastSuccessfulSync).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={btn('#3b82f6', true)}
                onClick={() => handleSync(record.connection.id)}
                disabled={syncingId === record.connection.id}
              >
                {syncingId === record.connection.id ? '⟳' : '⟳ Sync'}
              </button>
              <button style={btn('#ef4444', true)} onClick={() => handleRemoveConnection(record.connection.id)}>
                Remove
              </button>
            </div>
          </div>

          {/* Accounts */}
          {record.accounts.length > 0 && (
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {record.accounts.map(acct => (
                <div key={acct.id} style={{
                  padding: '10px 14px', background: '#0d0d1a', borderRadius: 8, border: '1px solid #1a1a3e',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e7eb' }}>{acct.name}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {acct.subtype?.replace(/_/g, ' ')} {acct.mask ? `···${acct.mask}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: 15, fontWeight: 600,
                        color: (acct.type === 'loan' || acct.type === 'credit') ? '#ef4444' : '#22c55e',
                      }}>
                        ${Math.abs(acct.balances?.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      {acct.taxRelevance?.isTaxAdvantaged && (
                        <span style={{ ...badge('#8b5cf6'), fontSize: 9 }}>TAX-ADV</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Last sync result */}
          {record.lastSyncResult && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280', display: 'flex', gap: 12 }}>
              <span>+{record.lastSyncResult.transactionsAdded} txns</span>
              <span>{record.lastSyncResult.durationMs}ms</span>
              {record.lastSyncResult.errors.length > 0 && (
                <span style={{ color: '#ef4444' }}>{record.lastSyncResult.errors.length} errors</span>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Empty State */}
      {phase === 'overview' && managerState.connections.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
          <h3 style={{ color: '#fff', margin: '0 0 8px' }}>No accounts connected yet</h3>
          <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 400, margin: '0 auto 20px' }}>
            Connect your bank accounts, credit cards, and investment accounts to automatically
            import transactions and identify tax deductions.
          </p>
          <button style={btn('#6366f1')} onClick={() => setPhase('search')}>
            Connect Your First Account
          </button>

          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'left' }}>
            {[
              { icon: '🔒', title: 'Bank-Level Security', desc: 'Your data is encrypted end-to-end. We never store your bank login credentials.' },
              { icon: '🏷️', title: 'Auto Tax Categories', desc: 'Transactions are automatically categorized to the right Schedule C, A, or E line items.' },
              { icon: '💰', title: 'Find Missed Deductions', desc: 'Our enrichment engine identifies deductible expenses you might be overlooking.' },
            ].map((item, i) => (
              <div key={i} style={{ padding: 16 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How It Works (bottom) */}
      {phase === 'overview' && managerState.connections.length > 0 && (
        <div style={{ ...card, marginTop: 16, background: '#0d0d1a' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
            Data Flow
          </h4>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
            Bank → <span style={{ color: '#6366f1' }}>Plaid/Unit/MX</span> → Canonical Models → <span style={{ color: '#f59e0b' }}>Tax Enrichment</span> (MCC + merchant patterns + 100+ rules) → <span style={{ color: '#22c55e' }}>Fortuna Bridge</span> → Income Streams, Expenses, Investments, Liabilities → Tax Optimization Engine
          </div>
          <div style={{ fontSize: 12, color: '#4b5563', marginTop: 8 }}>
            Supported: 11,000+ institutions · Transactions auto-categorized to IRS schedules · Deductions flagged with confidence scores · Recurring streams detected
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Mock Account Generator (for demo/sandbox) ───────────────────────────

function generateMockAccounts(inst: InstitutionInfo, connectionId: string): FinTechAccount[] {
  const accounts: FinTechAccount[] = []
  const now = new Date().toISOString()

  // Checking
  accounts.push({
    id: `acct_${Date.now()}_chk`, connectionId, provider: 'plaid' as FinTechProvider,
    institutionName: inst.name, name: `${inst.name} Checking`, type: 'depository', subtype: 'checking',
    mask: String(Math.floor(1000 + Math.random() * 9000)),
    balances: { current: Math.round((5000 + Math.random() * 25000) * 100) / 100, available: null, limit: null, lastUpdated: now },
    isoCurrencyCode: 'USD', taxRelevance: { isTaxAdvantaged: false, taxType: 'taxable', fortunaMapping: 'bank' },
    providerAccountId: `plaid_${Date.now()}_1`, isActive: true, createdAt: now, updatedAt: now,
  })

  // Savings
  accounts.push({
    id: `acct_${Date.now()}_sav`, connectionId, provider: 'plaid' as FinTechProvider,
    institutionName: inst.name, name: `${inst.name} Savings`, type: 'depository', subtype: 'savings',
    mask: String(Math.floor(1000 + Math.random() * 9000)),
    balances: { current: Math.round((10000 + Math.random() * 50000) * 100) / 100, available: null, limit: null, lastUpdated: now },
    isoCurrencyCode: 'USD', taxRelevance: { isTaxAdvantaged: false, taxType: 'taxable', fortunaMapping: 'bank' },
    providerAccountId: `plaid_${Date.now()}_2`, isActive: true, createdAt: now, updatedAt: now,
  })

  // Credit card (50% chance)
  if (Math.random() > 0.5) {
    accounts.push({
      id: `acct_${Date.now()}_cc`, connectionId, provider: 'plaid' as FinTechProvider,
      institutionName: inst.name, name: `${inst.name} Credit Card`, type: 'credit', subtype: 'credit_card',
      mask: String(Math.floor(1000 + Math.random() * 9000)),
      balances: { current: -Math.round((500 + Math.random() * 4000) * 100) / 100, available: null, limit: 15000, lastUpdated: now },
      isoCurrencyCode: 'USD', taxRelevance: { isTaxAdvantaged: false, taxType: 'taxable', fortunaMapping: 'bank' },
      providerAccountId: `plaid_${Date.now()}_3`, isActive: true, createdAt: now, updatedAt: now,
    })
  }

  return accounts
}

function getInstColor(name: string): string {
  const inst = POPULAR_INSTITUTIONS.find(i => i.name === name)
  return inst?.primaryColor || '#4a4a6a'
}
