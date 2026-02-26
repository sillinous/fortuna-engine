/**
 * Fortuna Engine — FinTech Connection Manager
 *
 * Orchestrates the full lifecycle of financial data connections:
 *
 *   1. CONNECT: Create link → user authenticates → exchange token → store
 *   2. SYNC:    Initial pull → enrich → bridge to FortunaState → merge
 *   3. REFRESH: Incremental sync via cursor → merge delta
 *   4. HEALTH:  Monitor status, handle re-auth, track errors
 *   5. WEBHOOK: Process provider notifications → trigger sync
 *
 * Supports multiple simultaneous connections across providers.
 * All connection state persisted in FortunaState.fintechConnections.
 *
 * @module fintech-manager
 */

import type {
  FinTechProvider, FinTechConnection, FinTechAccount, FinTechTransaction,
  FinTechCapability, WebhookEvent,
} from './fintech-models'
import type { FinTechAdapter, TransactionSyncResult, ProviderConfig } from './fintech-adapters'
import { createAdapter } from './fintech-adapters'
import { enrichBatch, type EnrichedTransaction } from './fintech-enrichment'
import { runFullBridge, type BridgeResult } from './fintech-bridge'
import type { FortunaState } from './storage'

// ─── Connection Store ─────────────────────────────────────────────────────

export interface ConnectionRecord {
  connection: FinTechConnection
  accessToken: string           // Encrypted — never exposed to UI
  syncCursor?: string           // For incremental transaction sync
  lastSyncResult?: SyncResult
  accounts: FinTechAccount[]
  enrichmentRules?: any[]       // Custom per-connection rules
}

export interface SyncResult {
  timestamp: string
  transactionsAdded: number
  transactionsModified: number
  transactionsRemoved: number
  bridgeResult?: BridgeResult
  errors: string[]
  durationMs: number
}

export interface ConnectionManagerState {
  connections: ConnectionRecord[]
  providerConfigs: Partial<Record<FinTechProvider, ProviderConfig>>
  globalSyncEnabled: boolean
  lastGlobalSync?: string
  syncIntervalMinutes: number
}

// ─── Default State ────────────────────────────────────────────────────────

export const DEFAULT_MANAGER_STATE: ConnectionManagerState = {
  connections: [],
  providerConfigs: {},
  globalSyncEnabled: true,
  syncIntervalMinutes: 60,
}

// ─── Connection Manager ───────────────────────────────────────────────────

export class FinTechConnectionManager {
  private state: ConnectionManagerState
  private adapters: Map<string, FinTechAdapter> = new Map()
  private syncTimers: Map<string, NodeJS.Timeout> = new Map()
  private onStateChange?: (state: ConnectionManagerState) => void
  private onFortunaUpdate?: (patch: Partial<FortunaState>) => void

  constructor(
    initialState?: Partial<ConnectionManagerState>,
    callbacks?: {
      onStateChange?: (state: ConnectionManagerState) => void
      onFortunaUpdate?: (patch: Partial<FortunaState>) => void
    },
  ) {
    this.state = { ...DEFAULT_MANAGER_STATE, ...initialState }
    this.onStateChange = callbacks?.onStateChange
    this.onFortunaUpdate = callbacks?.onFortunaUpdate

    // Initialize adapters for configured providers
    for (const [provider, config] of Object.entries(this.state.providerConfigs)) {
      if (config) {
        try {
          this.adapters.set(provider, createAdapter(config))
        } catch { /* skip unconfigured */ }
      }
    }
  }

  // ── Provider Configuration ────────────────────────────────────────────

  configureProvider(config: ProviderConfig): void {
    this.state.providerConfigs[config.provider] = config
    this.adapters.set(config.provider, createAdapter(config))
    this.emitStateChange()
  }

  getConfiguredProviders(): FinTechProvider[] {
    return Object.keys(this.state.providerConfigs) as FinTechProvider[]
  }

  private getAdapter(provider: FinTechProvider): FinTechAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) throw new Error(`Provider ${provider} not configured. Call configureProvider() first.`)
    return adapter
  }

  // ── Connection Lifecycle ──────────────────────────────────────────────

  /**
   * Step 1: Create a link token for the frontend SDK (e.g., Plaid Link).
   */
  async createLink(
    provider: FinTechProvider,
    userId: string,
    products: FinTechCapability[] = ['accounts', 'transactions'],
  ): Promise<{ linkToken: string; expiration: string } | { error: string }> {
    try {
      const adapter = this.getAdapter(provider)
      const result = await adapter.createLinkToken(userId, products)
      if (!result.success) return { error: result.error?.message || 'Failed to create link' }
      return result.data!
    } catch (err) {
      return { error: (err as Error).message }
    }
  }

  /**
   * Step 2: Exchange the public token from frontend SDK for an access token.
   * Creates the connection record and triggers initial sync.
   */
  async completeLink(
    provider: FinTechProvider,
    publicToken: string,
    institutionName: string,
    institutionId: string = '',
  ): Promise<{ connectionId: string } | { error: string }> {
    try {
      const adapter = this.getAdapter(provider)
      const result = await adapter.exchangePublicToken(publicToken)
      if (!result.success) return { error: result.error?.message || 'Token exchange failed' }

      const { connectionId, accessToken } = result.data!

      // Create connection record
      const connection: FinTechConnection = {
        id: connectionId,
        provider,
        institutionId,
        institutionName,
        status: 'active',
        accountIds: [],
        capabilities: ['accounts', 'transactions'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const record: ConnectionRecord = {
        connection,
        accessToken,
        accounts: [],
      }

      this.state.connections.push(record)
      this.emitStateChange()

      // Trigger initial sync (non-blocking)
      this.syncConnection(connectionId).catch(err => {
        console.error(`Initial sync failed for ${connectionId}:`, err)
      })

      return { connectionId }
    } catch (err) {
      return { error: (err as Error).message }
    }
  }

  /**
   * Remove a connection and clean up.
   */
  async removeConnection(connectionId: string): Promise<void> {
    const idx = this.state.connections.findIndex(c => c.connection.id === connectionId)
    if (idx === -1) return

    const record = this.state.connections[idx]
    try {
      const adapter = this.getAdapter(record.connection.provider)
      await adapter.removeConnection(record.accessToken)
    } catch { /* best-effort cleanup */ }

    // Cancel any sync timer
    const timer = this.syncTimers.get(connectionId)
    if (timer) {
      clearTimeout(timer)
      this.syncTimers.delete(connectionId)
    }

    this.state.connections.splice(idx, 1)
    this.emitStateChange()
  }

  // ── Sync Operations ───────────────────────────────────────────────────

  /**
   * Sync a single connection: pull accounts, transactions, enrich, bridge.
   */
  async syncConnection(connectionId: string): Promise<SyncResult> {
    const start = Date.now()
    const record = this.findConnection(connectionId)
    if (!record) return { timestamp: new Date().toISOString(), transactionsAdded: 0, transactionsModified: 0, transactionsRemoved: 0, errors: ['Connection not found'], durationMs: 0 }

    const errors: string[] = []
    const adapter = this.getAdapter(record.connection.provider)

    // Update status
    record.connection.status = 'active'
    record.connection.lastAttemptedSync = new Date().toISOString()

    try {
      // 1. Pull accounts
      const accountsResult = await adapter.getAccounts(record.accessToken)
      if (accountsResult.success && accountsResult.data) {
        record.accounts = accountsResult.data
        record.connection.accountIds = accountsResult.data.map(a => a.id)
      } else if (accountsResult.error) {
        errors.push(`Accounts: ${accountsResult.error.message}`)
      }

      // 2. Sync transactions (incremental if cursor exists)
      const txnResult: TransactionSyncResult = { added: [], modified: [], removed: [], hasMore: false, nextCursor: '' }

      if (adapter.syncTransactions) {
        // Use cursor-based sync for incremental updates
        let hasMore = true
        let cursor = record.syncCursor

        while (hasMore) {
          const syncResp = await adapter.syncTransactions(record.accessToken, cursor)
          if (syncResp.success && syncResp.data) {
            txnResult.added.push(...syncResp.data.added)
            txnResult.modified.push(...syncResp.data.modified)
            txnResult.removed.push(...syncResp.data.removed)
            hasMore = syncResp.data.hasMore
            cursor = syncResp.data.nextCursor
          } else {
            errors.push(`Transactions sync: ${syncResp.error?.message || 'Unknown error'}`)
            hasMore = false
          }
        }

        record.syncCursor = cursor
      } else {
        // Fall back to date-range fetch (last 90 days)
        const endDate = new Date().toISOString().split('T')[0]
        const startDate = new Date(Date.now() - 90 * 86400_000).toISOString().split('T')[0]
        const txnResp = await adapter.getTransactions(record.accessToken, { startDate, endDate, count: 500 })
        if (txnResp.success && txnResp.data) {
          txnResult.added = txnResp.data
        } else if (txnResp.error) {
          errors.push(`Transactions: ${txnResp.error.message}`)
        }
      }

      // 3. Pull investments if supported
      let investments: any = undefined
      if (adapter.getInvestmentHoldings) {
        const invResult = await adapter.getInvestmentHoldings(record.accessToken)
        if (invResult.success && invResult.data) {
          investments = invResult.data
        }
      }

      // 4. Pull liabilities if supported
      let liabilities: any = undefined
      if (adapter.getLiabilities) {
        const liabResult = await adapter.getLiabilities(record.accessToken)
        if (liabResult.success && liabResult.data) {
          liabilities = liabResult.data
        }
      }

      // 5. Enrich transactions
      const allTxns = [...txnResult.added, ...txnResult.modified]
      const enriched = allTxns.length > 0 ? enrichBatch(allTxns) : { enrichedTransactions: [], stats: null }

      // 6. Bridge to FortunaState
      const bridgeResult = runFullBridge({
        accounts: record.accounts,
        transactions: allTxns,
        investments: investments ? {
          holdings: investments.holdings,
          securities: investments.securities,
        } : undefined,
        liabilities,
      })

      // 7. Emit FortunaState update
      if (this.onFortunaUpdate && bridgeResult.patch) {
        this.onFortunaUpdate(bridgeResult.patch)
      }

      record.connection.lastSuccessfulSync = new Date().toISOString()
      record.connection.status = 'active'

      const syncResult: SyncResult = {
        timestamp: new Date().toISOString(),
        transactionsAdded: txnResult.added.length,
        transactionsModified: txnResult.modified.length,
        transactionsRemoved: txnResult.removed.length,
        bridgeResult,
        errors,
        durationMs: Date.now() - start,
      }

      record.lastSyncResult = syncResult
      this.emitStateChange()
      return syncResult

    } catch (err) {
      record.connection.status = 'error'
      record.connection.errorCode = (err as Error).message
      this.emitStateChange()

      return {
        timestamp: new Date().toISOString(),
        transactionsAdded: 0,
        transactionsModified: 0,
        transactionsRemoved: 0,
        errors: [(err as Error).message],
        durationMs: Date.now() - start,
      }
    }
  }

  /**
   * Sync all active connections.
   */
  async syncAll(): Promise<Map<string, SyncResult>> {
    const results = new Map<string, SyncResult>()
    const active = this.state.connections.filter(c => c.connection.status === 'active')

    // Sync in parallel with concurrency limit of 3
    const chunks: ConnectionRecord[][] = []
    for (let i = 0; i < active.length; i += 3) {
      chunks.push(active.slice(i, i + 3))
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(c => this.syncConnection(c.connection.id)),
      )
      chunk.forEach((c, i) => {
        const result = chunkResults[i]
        results.set(c.connection.id, result.status === 'fulfilled' ? result.value : {
          timestamp: new Date().toISOString(),
          transactionsAdded: 0, transactionsModified: 0, transactionsRemoved: 0,
          errors: [(result as PromiseRejectedResult).reason?.message || 'Sync failed'],
          durationMs: 0,
        })
      })
    }

    this.state.lastGlobalSync = new Date().toISOString()
    this.emitStateChange()
    return results
  }

  /**
   * Start automatic sync interval.
   */
  startAutoSync(intervalMinutes?: number): void {
    const interval = (intervalMinutes || this.state.syncIntervalMinutes) * 60_000
    this.state.globalSyncEnabled = true
    this.state.syncIntervalMinutes = intervalMinutes || this.state.syncIntervalMinutes

    // Clear any existing timer
    const existing = this.syncTimers.get('global')
    if (existing) clearInterval(existing)

    const timer = setInterval(() => {
      this.syncAll().catch(console.error)
    }, interval)

    this.syncTimers.set('global', timer as unknown as NodeJS.Timeout)
    this.emitStateChange()
  }

  stopAutoSync(): void {
    this.state.globalSyncEnabled = false
    const timer = this.syncTimers.get('global')
    if (timer) {
      clearInterval(timer)
      this.syncTimers.delete('global')
    }
    this.emitStateChange()
  }

  // ── Webhook Processing ────────────────────────────────────────────────

  /**
   * Process an inbound webhook event from a provider.
   * Returns the action taken.
   */
  async processWebhook(event: WebhookEvent): Promise<{ action: string }> {
    const record = this.state.connections.find(c => c.connection.id === event.connectionId)
    if (!record) return { action: 'ignored_unknown_connection' }

    switch (event.type) {
      case 'transactions.sync':
      case 'transactions.initial_update':
      case 'transactions.historical_update':
        await this.syncConnection(record.connection.id)
        return { action: 'synced_transactions' }

      case 'connection.error':
        record.connection.status = 'error'
        record.connection.errorCode = (event.data as any)?.error_code
        record.connection.statusDetail = (event.data as any)?.error_message
        this.emitStateChange()
        return { action: 'marked_error' }

      case 'connection.updated':
        record.connection.status = 'active'
        record.connection.updatedAt = new Date().toISOString()
        this.emitStateChange()
        return { action: 'updated_connection' }

      case 'connection.removed':
        await this.removeConnection(record.connection.id)
        return { action: 'removed_connection' }

      case 'investments.update':
        await this.syncConnection(record.connection.id)
        return { action: 'synced_investments' }

      case 'income.verification_complete':
        return { action: 'income_verified' }

      default:
        return { action: `unhandled_${event.type}` }
    }
  }

  // ── Connection Health ─────────────────────────────────────────────────

  /**
   * Get health summary for all connections.
   */
  getHealthSummary(): {
    total: number
    active: number
    degraded: number
    error: number
    pendingReauth: number
    needsAttention: ConnectionRecord[]
  } {
    const conns = this.state.connections
    const needsAttention = conns.filter(c =>
      c.connection.status === 'error' ||
      c.connection.status === 'pending_reauth' ||
      c.connection.status === 'degraded',
    )

    return {
      total: conns.length,
      active: conns.filter(c => c.connection.status === 'active').length,
      degraded: conns.filter(c => c.connection.status === 'degraded').length,
      error: conns.filter(c => c.connection.status === 'error').length,
      pendingReauth: conns.filter(c => c.connection.status === 'pending_reauth').length,
      needsAttention,
    }
  }

  /**
   * Check if a connection needs re-authentication.
   */
  async checkConnectionHealth(connectionId: string): Promise<'healthy' | 'needs_reauth' | 'error'> {
    const record = this.findConnection(connectionId)
    if (!record) return 'error'

    try {
      const adapter = this.getAdapter(record.connection.provider)
      const status = await adapter.getConnectionStatus(record.accessToken)
      if (!status.success) return 'error'
      if (status.data?.status === 'pending_reauth') return 'needs_reauth'
      return 'healthy'
    } catch {
      return 'error'
    }
  }

  // ── Getters ───────────────────────────────────────────────────────────

  getConnections(): ConnectionRecord[] {
    return this.state.connections
  }

  getConnection(connectionId: string): ConnectionRecord | undefined {
    return this.findConnection(connectionId)
  }

  getAccounts(): FinTechAccount[] {
    return this.state.connections.flatMap(c => c.accounts)
  }

  getAccountsByType(type: string): FinTechAccount[] {
    return this.getAccounts().filter(a => a.type === type)
  }

  getState(): ConnectionManagerState {
    return { ...this.state }
  }

  // ── Aggregate Stats ───────────────────────────────────────────────────

  getAggregateStats(): {
    totalAccounts: number
    totalBalance: number
    totalDebt: number
    netWorth: number
    byType: Record<string, { count: number; balance: number }>
    lastSync: string | undefined
  } {
    const accounts = this.getAccounts()
    const byType: Record<string, { count: number; balance: number }> = {}
    let totalBalance = 0
    let totalDebt = 0

    for (const acct of accounts) {
      const type = acct.type
      if (!byType[type]) byType[type] = { count: 0, balance: 0 }
      byType[type].count++
      const bal = acct.balances.current || 0
      byType[type].balance += bal

      if (type === 'loan' || type === 'credit') {
        totalDebt += Math.abs(bal)
      } else {
        totalBalance += bal
      }
    }

    return {
      totalAccounts: accounts.length,
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalDebt: Math.round(totalDebt * 100) / 100,
      netWorth: Math.round((totalBalance - totalDebt) * 100) / 100,
      byType,
      lastSync: this.state.lastGlobalSync,
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private findConnection(id: string): ConnectionRecord | undefined {
    return this.state.connections.find(c => c.connection.id === id)
  }

  private emitStateChange(): void {
    this.onStateChange?.(this.state)
  }

  /**
   * Clean up all timers and resources.
   */
  destroy(): void {
    for (const timer of this.syncTimers.values()) {
      clearInterval(timer)
    }
    this.syncTimers.clear()
  }
}

// ─── Supported Institutions (Static List) ─────────────────────────────────

export interface InstitutionInfo {
  id: string
  name: string
  logo?: string
  primaryColor?: string
  url?: string
  providers: FinTechProvider[]
  popular: boolean
}

export const POPULAR_INSTITUTIONS: InstitutionInfo[] = [
  { id: 'ins_1', name: 'Chase', primaryColor: '#117ACA', url: 'https://chase.com', providers: ['plaid', 'mx', 'yodlee'], popular: true },
  { id: 'ins_2', name: 'Bank of America', primaryColor: '#012169', url: 'https://bankofamerica.com', providers: ['plaid', 'mx', 'yodlee'], popular: true },
  { id: 'ins_3', name: 'Wells Fargo', primaryColor: '#D71E28', url: 'https://wellsfargo.com', providers: ['plaid', 'mx', 'yodlee'], popular: true },
  { id: 'ins_4', name: 'Citi', primaryColor: '#003B70', url: 'https://citi.com', providers: ['plaid', 'mx', 'yodlee'], popular: true },
  { id: 'ins_5', name: 'Capital One', primaryColor: '#004879', url: 'https://capitalone.com', providers: ['plaid', 'mx', 'yodlee'], popular: true },
  { id: 'ins_6', name: 'US Bank', primaryColor: '#D32F2F', url: 'https://usbank.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_7', name: 'PNC', primaryColor: '#F58025', url: 'https://pnc.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_8', name: 'TD Bank', primaryColor: '#34A853', url: 'https://td.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_9', name: 'Schwab', primaryColor: '#00A0DF', url: 'https://schwab.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_10', name: 'Fidelity', primaryColor: '#4E8542', url: 'https://fidelity.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_11', name: 'Vanguard', primaryColor: '#C41E25', url: 'https://vanguard.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_12', name: 'American Express', primaryColor: '#006FCF', url: 'https://americanexpress.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_13', name: 'USAA', primaryColor: '#00529B', url: 'https://usaa.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_14', name: 'Navy Federal', primaryColor: '#003366', url: 'https://navyfederal.org', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_15', name: 'Discover', primaryColor: '#FF6600', url: 'https://discover.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_16', name: 'Ally Bank', primaryColor: '#4E2A84', url: 'https://ally.com', providers: ['plaid', 'mx'], popular: true },
  { id: 'ins_17', name: 'Marcus by Goldman Sachs', primaryColor: '#000000', url: 'https://marcus.com', providers: ['plaid'], popular: false },
  { id: 'ins_18', name: 'SoFi', primaryColor: '#00B4D8', url: 'https://sofi.com', providers: ['plaid'], popular: false },
  { id: 'ins_19', name: 'Robinhood', primaryColor: '#00C805', url: 'https://robinhood.com', providers: ['plaid'], popular: false },
  { id: 'ins_20', name: 'Coinbase', primaryColor: '#0052FF', url: 'https://coinbase.com', providers: ['plaid'], popular: false },
]

/**
 * Search institutions by name.
 */
export function searchInstitutions(query: string, limit: number = 10): InstitutionInfo[] {
  if (!query.trim()) return POPULAR_INSTITUTIONS.filter(i => i.popular).slice(0, limit)
  const q = query.toLowerCase()
  return POPULAR_INSTITUTIONS
    .filter(i => i.name.toLowerCase().includes(q))
    .slice(0, limit)
}
