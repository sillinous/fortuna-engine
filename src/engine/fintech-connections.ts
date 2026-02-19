/**
 * Fortuna Engine — FinTech Connection Manager
 *
 * Orchestrates connections to financial data providers, manages sync
 * state, handles multi-provider data aggregation, and coordinates
 * the full data pipeline:
 *
 *   Connect → Sync → Normalize → Enrich → Bridge → FortunaState
 *
 * Supports multiple simultaneous providers (e.g., Plaid for bank
 * aggregation + Unit for BaaS + Stripe for payments).
 *
 * @module fintech-connections
 */

import type {
  FinTechProvider, FinTechConnection, FinTechAccount,
  FinTechTransaction, FinTechCapability, FinTechResponse,
  InvestmentHolding, Security, LiabilityDetail,
  IncomeVerification, RecurringStream,
} from './fintech-models'
import type { FinTechAdapter, ProviderConfig, TransactionSyncResult } from './fintech-adapters'
import { createAdapter } from './fintech-adapters'
import { runFullBridge, type BridgeResult } from './fintech-bridge'
import { enrichBatch } from './fintech-enrichment'

// ─── Connection Store ─────────────────────────────────────────────────────

export interface ConnectionState {
  connections: FinTechConnection[]
  accounts: FinTechAccount[]
  syncCursors: Record<string, string>       // connectionId → cursor
  lastSyncAt: Record<string, string>         // connectionId → ISO date
  providerConfigs: Record<string, ProviderConfig>
}

const DEFAULT_STATE: ConnectionState = {
  connections: [],
  accounts: [],
  syncCursors: {},
  lastSyncAt: {},
  providerConfigs: {},
}

let state: ConnectionState = { ...DEFAULT_STATE }
const adapters: Map<string, FinTechAdapter> = new Map()

// ─── Initialization ───────────────────────────────────────────────────────

/**
 * Initialize the connection manager with saved state.
 */
export function initConnectionManager(saved?: Partial<ConnectionState>) {
  state = { ...DEFAULT_STATE, ...saved }
  // Recreate adapters from saved configs
  for (const [key, config] of Object.entries(state.providerConfigs)) {
    try {
      adapters.set(key, createAdapter(config))
    } catch {
      console.warn(`Failed to create adapter for ${key}`)
    }
  }
}

/**
 * Get current connection state (for persistence).
 */
export function getConnectionState(): ConnectionState {
  return { ...state }
}

// ─── Provider Registration ────────────────────────────────────────────────

/**
 * Register a new provider with API credentials.
 * Must be called before connecting to any provider.
 */
export function registerProvider(config: ProviderConfig): void {
  const adapter = createAdapter(config)
  const key = `${config.provider}_${config.clientId.slice(0, 8)}`
  adapters.set(key, adapter)
  state.providerConfigs[key] = config
}

/**
 * Get all registered providers.
 */
export function getRegisteredProviders(): { key: string; provider: FinTechProvider; environment: string }[] {
  return Object.entries(state.providerConfigs).map(([key, config]) => ({
    key,
    provider: config.provider,
    environment: config.environment,
  }))
}

/**
 * Remove a provider registration.
 */
export function unregisterProvider(key: string): void {
  adapters.delete(key)
  delete state.providerConfigs[key]
}

// ─── Connection Lifecycle ─────────────────────────────────────────────────

/**
 * Create a link token for the Plaid/MX Link widget.
 * Returns a token the frontend passes to the Link component.
 */
export async function createLinkToken(
  adapterKey: string,
  userId: string,
  products: FinTechCapability[] = ['accounts', 'transactions'],
): Promise<FinTechResponse<{ linkToken: string; expiration: string }>> {
  const adapter = adapters.get(adapterKey)
  if (!adapter) throw new Error(`No adapter registered for key: ${adapterKey}`)
  return adapter.createLinkToken(userId, products)
}

/**
 * Exchange a public token (from Link widget) for an access token.
 * Creates a new connection entry.
 */
export async function exchangeToken(
  adapterKey: string,
  publicToken: string,
  institutionName: string = '',
): Promise<FinTechConnection> {
  const adapter = adapters.get(adapterKey)
  if (!adapter) throw new Error(`No adapter registered for key: ${adapterKey}`)

  const result = await adapter.exchangePublicToken(publicToken)
  if (!result.success || !result.data) throw new Error(result.error?.message || 'Token exchange failed')

  const connection: FinTechConnection = {
    id: result.data.connectionId,
    provider: adapter.provider,
    institutionId: '',
    institutionName,
    status: 'active',
    accountIds: [],
    capabilities: ['accounts', 'transactions'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { adapterKey, accessToken: result.data.accessToken },
  }

  state.connections.push(connection)
  return connection
}

/**
 * Remove a connection and all associated data.
 */
export async function removeConnection(connectionId: string): Promise<void> {
  const conn = state.connections.find(c => c.id === connectionId)
  if (!conn) return

  const adapterKey = (conn.metadata as any)?.adapterKey
  const adapter = adapterKey ? adapters.get(adapterKey) : null
  const accessToken = (conn.metadata as any)?.accessToken

  if (adapter && accessToken) {
    await adapter.removeConnection(accessToken)
  }

  state.connections = state.connections.filter(c => c.id !== connectionId)
  state.accounts = state.accounts.filter(a => a.connectionId !== connectionId)
  delete state.syncCursors[connectionId]
  delete state.lastSyncAt[connectionId]
}

/**
 * Get all connections.
 */
export function getConnections(): FinTechConnection[] {
  return [...state.connections]
}

/**
 * Get connection by ID.
 */
export function getConnection(connectionId: string): FinTechConnection | undefined {
  return state.connections.find(c => c.id === connectionId)
}

// ─── Data Sync ────────────────────────────────────────────────────────────

export interface SyncResult {
  connectionId: string
  accounts: FinTechAccount[]
  transactions: FinTechTransaction[]
  investments?: { holdings: InvestmentHolding[]; securities: Security[] }
  liabilities?: LiabilityDetail[]
  incomeVerification?: IncomeVerification
  recurringStreams?: RecurringStream[]
  bridge: BridgeResult
  enrichmentStats: {
    totalDeductible: number
    totalNonDeductible: number
    totalTaxPayments: number
    categoryBreakdown: Record<string, { count: number; total: number; deductible: boolean }>
  }
  syncedAt: string
  errors: string[]
}

/**
 * Full sync for a connection: accounts + transactions + optional data.
 */
export async function syncConnection(
  connectionId: string,
  options: {
    includeInvestments?: boolean
    includeLiabilities?: boolean
    includeIncome?: boolean
    includeRecurring?: boolean
    transactionDays?: number
  } = {},
): Promise<SyncResult> {
  const conn = state.connections.find(c => c.id === connectionId)
  if (!conn) throw new Error(`Connection not found: ${connectionId}`)

  const adapterKey = (conn.metadata as any)?.adapterKey
  const adapter = adapterKey ? adapters.get(adapterKey) : null
  if (!adapter) throw new Error(`No adapter for connection: ${connectionId}`)

  const accessToken = (conn.metadata as any)?.accessToken || connectionId
  const errors: string[] = []
  const now = new Date()

  // 1. Fetch accounts
  let accounts: FinTechAccount[] = []
  try {
    const acctResult = await adapter.getAccounts(accessToken)
    if (acctResult.success && acctResult.data) {
      accounts = acctResult.data.map(a => ({ ...a, connectionId }))
      // Update connection's account IDs
      conn.accountIds = accounts.map(a => a.id)
      // Merge into state
      state.accounts = [
        ...state.accounts.filter(a => a.connectionId !== connectionId),
        ...accounts,
      ]
    }
  } catch (err) {
    errors.push(`Accounts: ${(err as Error).message}`)
  }

  // 2. Sync transactions (incremental if cursor exists)
  let transactions: FinTechTransaction[] = []
  try {
    const cursor = state.syncCursors[connectionId]
    if (adapter.syncTransactions) {
      // Incremental sync
      let hasMore = true
      let syncCursor = cursor
      while (hasMore) {
        const syncResult = await adapter.syncTransactions(accessToken, syncCursor)
        if (syncResult.success && syncResult.data) {
          transactions.push(...syncResult.data.added)
          hasMore = syncResult.data.hasMore
          syncCursor = syncResult.data.nextCursor
        } else {
          hasMore = false
        }
      }
      if (syncCursor) state.syncCursors[connectionId] = syncCursor
    } else {
      // Full fetch fallback
      const days = options.transactionDays || 90
      const startDate = new Date(now.getTime() - days * 86400_000).toISOString().split('T')[0]
      const endDate = now.toISOString().split('T')[0]
      const txnResult = await adapter.getTransactions(accessToken, { startDate, endDate })
      if (txnResult.success && txnResult.data) {
        transactions = txnResult.data
      }
    }
  } catch (err) {
    errors.push(`Transactions: ${(err as Error).message}`)
  }

  // 3. Optional: Investments
  let investments: { holdings: InvestmentHolding[]; securities: Security[] } | undefined
  if (options.includeInvestments && adapter.getInvestmentHoldings) {
    try {
      const invResult = await adapter.getInvestmentHoldings(accessToken)
      if (invResult.success && invResult.data) investments = invResult.data
    } catch (err) {
      errors.push(`Investments: ${(err as Error).message}`)
    }
  }

  // 4. Optional: Liabilities
  let liabilities: LiabilityDetail[] | undefined
  if (options.includeLiabilities && adapter.getLiabilities) {
    try {
      const liabResult = await adapter.getLiabilities(accessToken)
      if (liabResult.success && liabResult.data) liabilities = liabResult.data
    } catch (err) {
      errors.push(`Liabilities: ${(err as Error).message}`)
    }
  }

  // 5. Optional: Income
  let incomeVerification: IncomeVerification | undefined
  if (options.includeIncome && adapter.getIncomeVerification) {
    try {
      const incResult = await adapter.getIncomeVerification(accessToken)
      if (incResult.success && incResult.data) incomeVerification = incResult.data
    } catch (err) {
      errors.push(`Income: ${(err as Error).message}`)
    }
  }

  // 6. Optional: Recurring
  let recurringStreams: RecurringStream[] | undefined
  if (options.includeRecurring && adapter.getRecurringTransactions) {
    try {
      const recResult = await adapter.getRecurringTransactions(accessToken)
      if (recResult.success && recResult.data) recurringStreams = recResult.data
    } catch (err) {
      errors.push(`Recurring: ${(err as Error).message}`)
    }
  }

  // 7. Enrich transactions
  const enrichResult = enrichBatch(transactions)

  // 8. Bridge to FortunaState
  const bridge = runFullBridge({
    accounts,
    transactions,
    holdings: investments?.holdings,
    securities: investments?.securities,
    liabilities,
    incomeVerification,
    recurringStreams,
  })

  // Update sync timestamp
  state.lastSyncAt[connectionId] = now.toISOString()
  conn.lastSuccessfulSync = now.toISOString()
  conn.lastAttemptedSync = now.toISOString()
  conn.status = errors.length > 0 ? 'degraded' : 'active'
  conn.updatedAt = now.toISOString()

  return {
    connectionId,
    accounts,
    transactions,
    investments,
    liabilities,
    incomeVerification,
    recurringStreams,
    bridge,
    enrichmentStats: {
      totalDeductible: enrichResult.stats.totalDeductible,
      totalNonDeductible: enrichResult.stats.totalNonDeductible,
      totalTaxPayments: enrichResult.stats.totalTaxPayments,
      categoryBreakdown: enrichResult.stats.categoryBreakdown,
    },
    syncedAt: now.toISOString(),
    errors,
  }
}

/**
 * Sync all active connections.
 */
export async function syncAllConnections(options?: {
  includeInvestments?: boolean
  includeLiabilities?: boolean
}): Promise<SyncResult[]> {
  const results: SyncResult[] = []
  for (const conn of state.connections) {
    if (conn.status === 'active' || conn.status === 'degraded') {
      try {
        const result = await syncConnection(conn.id, options)
        results.push(result)
      } catch (err) {
        console.error(`Sync failed for ${conn.id}:`, err)
      }
    }
  }
  return results
}

// ─── Account Queries ──────────────────────────────────────────────────────

/**
 * Get all accounts across all connections.
 */
export function getAllAccounts(): FinTechAccount[] {
  return [...state.accounts]
}

/**
 * Get accounts by type.
 */
export function getAccountsByType(type: string): FinTechAccount[] {
  return state.accounts.filter(a => a.type === type)
}

/**
 * Get total balances across all accounts.
 */
export function getAggregateBalances(): {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  byType: Record<string, { count: number; balance: number }>
} {
  let totalAssets = 0, totalLiabilities = 0
  const byType: Record<string, { count: number; balance: number }> = {}

  for (const acct of state.accounts) {
    const balance = acct.balances.current || 0
    const type = acct.type

    if (!byType[type]) byType[type] = { count: 0, balance: 0 }
    byType[type].count++
    byType[type].balance += balance

    if (type === 'credit' || type === 'loan') {
      totalLiabilities += Math.abs(balance)
    } else {
      totalAssets += balance
    }
  }

  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, byType }
}

// ─── Health Check ─────────────────────────────────────────────────────────

export interface ConnectionHealth {
  id: string
  provider: FinTechProvider
  institution: string
  status: FinTechConnection['status']
  lastSync: string | undefined
  accountCount: number
  needsReauth: boolean
  staleDays: number
}

export function getConnectionHealth(): ConnectionHealth[] {
  const now = Date.now()
  return state.connections.map(conn => {
    const lastSync = state.lastSyncAt[conn.id]
    const staleDays = lastSync ? Math.floor((now - new Date(lastSync).getTime()) / 86400_000) : 999
    return {
      id: conn.id,
      provider: conn.provider,
      institution: conn.institutionName,
      status: conn.status,
      lastSync,
      accountCount: conn.accountIds.length,
      needsReauth: conn.status === 'pending_reauth' || conn.status === 'error',
      staleDays,
    }
  })
}

// ─── Supported Providers Reference ────────────────────────────────────────

export const SUPPORTED_PROVIDERS: {
  provider: FinTechProvider
  name: string
  type: 'aggregation' | 'baas' | 'payments' | 'identity' | 'verification'
  capabilities: FinTechCapability[]
  description: string
  website: string
  sandboxAvailable: boolean
}[] = [
  {
    provider: 'plaid',
    name: 'Plaid',
    type: 'aggregation',
    capabilities: ['accounts', 'transactions', 'identity', 'investments', 'liabilities', 'income', 'balance', 'recurring', 'transfer'],
    description: 'Account aggregation — connect bank accounts, credit cards, investments, loans. Transaction enrichment with merchant data.',
    website: 'https://plaid.com',
    sandboxAvailable: true,
  },
  {
    provider: 'unit',
    name: 'Unit',
    type: 'baas',
    capabilities: ['accounts', 'transactions', 'identity', 'payment_initiation', 'transfer'],
    description: 'Banking-as-a-Service — deposit accounts, debit cards, ACH transfers, wires, check deposits. Full KYC/KYB.',
    website: 'https://unit.co',
    sandboxAvailable: true,
  },
  {
    provider: 'mx',
    name: 'MX',
    type: 'aggregation',
    capabilities: ['accounts', 'transactions', 'identity', 'balance'],
    description: 'Account aggregation with enhanced merchant-level enrichment and data cleansing.',
    website: 'https://mx.com',
    sandboxAvailable: true,
  },
  {
    provider: 'stripe',
    name: 'Stripe',
    type: 'payments',
    capabilities: ['accounts', 'transactions', 'payment_initiation', 'transfer'],
    description: 'Payment processing — charges, subscriptions, payouts, treasury, issuing.',
    website: 'https://stripe.com',
    sandboxAvailable: true,
  },
  {
    provider: 'yodlee',
    name: 'Yodlee (Envestnet)',
    type: 'aggregation',
    capabilities: ['accounts', 'transactions', 'identity', 'investments', 'balance'],
    description: 'Enterprise account aggregation with investment data and document retrieval.',
    website: 'https://yodlee.com',
    sandboxAvailable: true,
  },
  {
    provider: 'moov',
    name: 'Moov',
    type: 'baas',
    capabilities: ['accounts', 'transactions', 'payment_initiation', 'transfer'],
    description: 'Money movement — wallets, ACH, card payments, disbursements.',
    website: 'https://moov.io',
    sandboxAvailable: true,
  },
  {
    provider: 'alloy',
    name: 'Alloy',
    type: 'identity',
    capabilities: ['identity'],
    description: 'Identity verification and KYC/KYB decisioning with 200+ data sources.',
    website: 'https://alloy.com',
    sandboxAvailable: true,
  },
  {
    provider: 'middesk',
    name: 'Middesk',
    type: 'verification',
    capabilities: ['identity'],
    description: 'Business verification (KYB) — Secretary of State filings, TIN matching, beneficial ownership.',
    website: 'https://middesk.com',
    sandboxAvailable: true,
  },
]
