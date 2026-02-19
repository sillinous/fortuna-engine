/**
 * Fortuna Engine — FinTech Provider Adapters
 *
 * Abstract adapter interface + concrete implementations for major providers.
 * Each adapter normalizes provider-native data into canonical FinTech models.
 *
 * Architecture:
 *   ┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
 *   │   Fortuna     │ ──► │  FinTechAdapter   │ ──► │  Provider API    │
 *   │   Bridge      │ ◄── │  (normalize)      │ ◄── │  (Plaid/Unit/MX) │
 *   └──────────────┘     └──────────────────┘     └──────────────────┘
 *
 * All adapters implement FinTechAdapter and return FinTechResponse<T>.
 * The bridge layer (fintech-bridge.ts) further maps into FortunaState.
 *
 * @module fintech-adapters
 */

import type {
  FinTechProvider, FinTechConnection, FinTechAccount, FinTechTransaction,
  FinTechResponse, KYCIdentity, KYBBusinessIdentity, InvestmentHolding,
  Security, InvestmentTransaction, LiabilityDetail, IncomeVerification,
  RecurringStream, AssetReport, WebhookEvent, FinTechCapability,
  AccountType, AccountSubtype, TransactionType, AccountTaxRelevance,
  TransactionTaxRelevance, PostalAddress, AccountBalances,
} from './fintech-models'

// ─── Abstract Adapter Interface ───────────────────────────────────────────

export interface FinTechAdapter {
  readonly provider: FinTechProvider

  // Connection lifecycle
  createLinkToken(userId: string, products: FinTechCapability[]): Promise<FinTechResponse<{ linkToken: string; expiration: string }>>
  exchangePublicToken(publicToken: string): Promise<FinTechResponse<{ connectionId: string; accessToken: string }>>
  removeConnection(connectionId: string): Promise<FinTechResponse<void>>
  getConnectionStatus(connectionId: string): Promise<FinTechResponse<FinTechConnection>>

  // Accounts
  getAccounts(connectionId: string): Promise<FinTechResponse<FinTechAccount[]>>
  getAccountBalances(connectionId: string, accountIds?: string[]): Promise<FinTechResponse<FinTechAccount[]>>

  // Transactions
  getTransactions(connectionId: string, params: TransactionParams): Promise<FinTechResponse<FinTechTransaction[]>>
  syncTransactions(connectionId: string, cursor?: string): Promise<FinTechResponse<TransactionSyncResult>>

  // Identity
  getIdentity(connectionId: string): Promise<FinTechResponse<KYCIdentity>>

  // Investments (optional)
  getInvestmentHoldings?(connectionId: string): Promise<FinTechResponse<{ holdings: InvestmentHolding[]; securities: Security[] }>>
  getInvestmentTransactions?(connectionId: string, params: TransactionParams): Promise<FinTechResponse<InvestmentTransaction[]>>

  // Liabilities (optional)
  getLiabilities?(connectionId: string): Promise<FinTechResponse<LiabilityDetail[]>>

  // Income (optional)
  getIncomeVerification?(connectionId: string): Promise<FinTechResponse<IncomeVerification>>

  // Recurring (optional)
  getRecurringTransactions?(connectionId: string): Promise<FinTechResponse<RecurringStream[]>>

  // Assets (optional)
  createAssetReport?(connectionId: string, daysRequested: number): Promise<FinTechResponse<{ reportId: string }>>
  getAssetReport?(reportId: string): Promise<FinTechResponse<AssetReport>>

  // Webhook verification
  verifyWebhook?(headers: Record<string, string>, body: string): Promise<boolean>
}

export interface TransactionParams {
  startDate: string            // ISO date
  endDate: string              // ISO date
  accountIds?: string[]
  count?: number               // Max transactions per request
  offset?: number              // Pagination offset
}

export interface TransactionSyncResult {
  added: FinTechTransaction[]
  modified: FinTechTransaction[]
  removed: string[]            // Transaction IDs
  hasMore: boolean
  nextCursor: string
}

// ─── Provider Configuration ───────────────────────────────────────────────

export interface ProviderConfig {
  provider: FinTechProvider
  clientId: string
  secret: string
  environment: 'sandbox' | 'development' | 'production'
  baseUrl: string
  webhookUrl?: string
  version?: string             // API version header
}

// ─── Helper: Generate request ID ──────────────────────────────────────────

function requestId(): string {
  return `ftk_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

function envelope<T>(provider: FinTechProvider, data: T): FinTechResponse<T> {
  return { success: true, data, provider, requestId: requestId(), timestamp: new Date().toISOString() }
}

function errorEnvelope<T>(provider: FinTechProvider, code: string, message: string, type: 'auth' | 'rate_limit' | 'api_error' | 'connection_error' | 'validation' = 'api_error'): FinTechResponse<T> {
  return { success: false, data: null, error: { code, message, type, retryable: type === 'rate_limit' }, provider, requestId: requestId(), timestamp: new Date().toISOString() }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLAID ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Plaid API adapter.
 * Maps Plaid's /accounts, /transactions, /identity, /investments,
 * /liabilities, /income, /assets endpoints to canonical models.
 *
 * API Reference: https://plaid.com/docs/api/
 */
export class PlaidAdapter implements FinTechAdapter {
  readonly provider: FinTechProvider = 'plaid'
  private config: ProviderConfig

  constructor(config: Omit<ProviderConfig, 'provider'>) {
    this.config = { ...config, provider: 'plaid' }
    if (!this.config.baseUrl) {
      this.config.baseUrl = config.environment === 'production'
        ? 'https://production.plaid.com'
        : config.environment === 'development'
          ? 'https://development.plaid.com'
          : 'https://sandbox.plaid.com'
    }
  }

  private async plaidRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': this.config.clientId,
        'PLAID-SECRET': this.config.secret,
        ...(this.config.version ? { 'Plaid-Version': this.config.version } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error_code: 'UNKNOWN', error_message: resp.statusText }))
      throw new PlaidError(err.error_code, err.error_message, err.error_type)
    }
    return resp.json()
  }

  // ── Connection Lifecycle ──────────────────────────────────────────────

  async createLinkToken(userId: string, products: FinTechCapability[]) {
    try {
      const plaidProducts = products.map(p => PLAID_PRODUCT_MAP[p]).filter(Boolean)
      const data = await this.plaidRequest<{ link_token: string; expiration: string }>('/link/token/create', {
        client_id: this.config.clientId,
        secret: this.config.secret,
        user: { client_user_id: userId },
        client_name: 'Fortuna Engine',
        products: plaidProducts.length > 0 ? plaidProducts : ['transactions'],
        country_codes: ['US'],
        language: 'en',
        webhook: this.config.webhookUrl,
      })
      return envelope(this.provider, { linkToken: data.link_token, expiration: data.expiration })
    } catch (err) {
      return this.handleError(err)
    }
  }

  async exchangePublicToken(publicToken: string) {
    try {
      const data = await this.plaidRequest<{ access_token: string; item_id: string }>('/item/public_token/exchange', {
        public_token: publicToken,
      })
      return envelope(this.provider, { connectionId: data.item_id, accessToken: data.access_token })
    } catch (err) {
      return this.handleError(err)
    }
  }

  async removeConnection(accessToken: string) {
    try {
      await this.plaidRequest('/item/remove', { access_token: accessToken })
      return envelope<void>(this.provider, undefined as unknown as void)
    } catch (err) {
      return this.handleError(err)
    }
  }

  async getConnectionStatus(accessToken: string) {
    try {
      const data = await this.plaidRequest<{
        item: { item_id: string; institution_id: string; webhook: string; error: unknown; consent_expiration_time: string }
        status: { transactions: { last_successful_update: string } }
      }>('/item/get', { access_token: accessToken })

      const conn: FinTechConnection = {
        id: data.item.item_id,
        provider: 'plaid',
        institutionId: data.item.institution_id || '',
        institutionName: '', // Resolved via /institutions/get_by_id
        status: data.item.error ? 'error' : 'active',
        consentExpiresAt: data.item.consent_expiration_time,
        lastSuccessfulSync: data.status?.transactions?.last_successful_update,
        accountIds: [],
        capabilities: ['accounts', 'transactions'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return envelope(this.provider, conn)
    } catch (err) {
      return this.handleError(err)
    }
  }

  // ── Accounts ──────────────────────────────────────────────────────────

  async getAccounts(accessToken: string) {
    try {
      const data = await this.plaidRequest<{ accounts: PlaidAccount[] }>('/accounts/get', {
        access_token: accessToken,
      })
      return envelope(this.provider, data.accounts.map(a => normalizePlaidAccount(a, '')))
    } catch (err) {
      return this.handleError(err)
    }
  }

  async getAccountBalances(accessToken: string, accountIds?: string[]) {
    try {
      const body: Record<string, unknown> = { access_token: accessToken }
      if (accountIds?.length) body.options = { account_ids: accountIds }
      const data = await this.plaidRequest<{ accounts: PlaidAccount[] }>('/accounts/balance/get', body)
      return envelope(this.provider, data.accounts.map(a => normalizePlaidAccount(a, '')))
    } catch (err) {
      return this.handleError(err)
    }
  }

  // ── Transactions ──────────────────────────────────────────────────────

  async getTransactions(accessToken: string, params: TransactionParams) {
    try {
      const data = await this.plaidRequest<{ transactions: PlaidTransaction[]; total_transactions: number }>('/transactions/get', {
        access_token: accessToken,
        start_date: params.startDate,
        end_date: params.endDate,
        options: {
          count: params.count || 500,
          offset: params.offset || 0,
          ...(params.accountIds?.length ? { account_ids: params.accountIds } : {}),
        },
      })
      const txns = data.transactions.map(t => normalizePlaidTransaction(t))
      const result: FinTechResponse<FinTechTransaction[]> = {
        ...envelope(this.provider, txns),
        pagination: {
          total: data.total_transactions,
          offset: params.offset || 0,
          limit: params.count || 500,
          hasMore: (params.offset || 0) + txns.length < data.total_transactions,
        },
      }
      return result
    } catch (err) {
      return this.handleError(err)
    }
  }

  async syncTransactions(accessToken: string, cursor?: string) {
    try {
      const data = await this.plaidRequest<{
        added: PlaidTransaction[]; modified: PlaidTransaction[]
        removed: { transaction_id: string }[]; has_more: boolean; next_cursor: string
      }>('/transactions/sync', {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
      })
      return envelope(this.provider, {
        added: data.added.map(normalizePlaidTransaction),
        modified: data.modified.map(normalizePlaidTransaction),
        removed: data.removed.map(r => r.transaction_id),
        hasMore: data.has_more,
        nextCursor: data.next_cursor,
      })
    } catch (err) {
      return this.handleError(err)
    }
  }

  // ── Identity ──────────────────────────────────────────────────────────

  async getIdentity(accessToken: string) {
    try {
      const data = await this.plaidRequest<{ accounts: { owners: PlaidOwner[] }[] }>('/identity/get', {
        access_token: accessToken,
      })
      const owner = data.accounts?.[0]?.owners?.[0]
      if (!owner) return errorEnvelope<KYCIdentity>(this.provider, 'NO_IDENTITY', 'No identity data available')

      const identity: KYCIdentity = {
        id: `plaid_id_${Date.now()}`,
        provider: 'plaid',
        verificationStatus: 'verified',
        verifiedAt: new Date().toISOString(),
        legalFirstName: owner.names?.[0]?.split(' ')[0] || '',
        legalLastName: owner.names?.[0]?.split(' ').slice(-1)[0] || '',
        dateOfBirth: '',
        email: owner.emails?.[0]?.data || '',
        emailVerified: false,
        phone: owner.phone_numbers?.[0]?.data || '',
        phoneVerified: false,
        address: {
          street1: owner.addresses?.[0]?.data?.street || '',
          city: owner.addresses?.[0]?.data?.city || '',
          region: owner.addresses?.[0]?.data?.region || '',
          postalCode: owner.addresses?.[0]?.data?.postal_code || '',
          country: owner.addresses?.[0]?.data?.country || 'US',
        },
        checksPerformed: ['identity_verification'],
      }
      return envelope(this.provider, identity)
    } catch (err) {
      return this.handleError(err)
    }
  }

  // ── Investments ───────────────────────────────────────────────────────

  async getInvestmentHoldings(accessToken: string) {
    try {
      const data = await this.plaidRequest<{
        holdings: PlaidHolding[]; securities: PlaidSecurity[]; accounts: PlaidAccount[]
      }>('/investments/holdings/get', { access_token: accessToken })

      const securities: Security[] = data.securities.map(s => ({
        id: s.security_id,
        name: s.name || '',
        tickerSymbol: s.ticker_symbol || undefined,
        cusip: s.cusip || undefined,
        isin: s.isin || undefined,
        sedol: s.sedol || undefined,
        type: mapPlaidSecurityType(s.type),
        isoCurrencyCode: s.iso_currency_code || 'USD',
        closePrice: s.close_price || undefined,
        closePriceAsOf: s.close_price_as_of || undefined,
        isCashEquivalent: s.is_cash_equivalent || false,
      }))

      const holdings: InvestmentHolding[] = data.holdings.map(h => ({
        id: `${h.account_id}_${h.security_id}`,
        accountId: h.account_id,
        securityId: h.security_id,
        quantity: h.quantity,
        costBasis: h.cost_basis || 0,
        marketValue: h.institution_value || (h.quantity * (h.institution_price || 0)),
        price: h.institution_price || 0,
        priceAsOf: h.institution_price_as_of || new Date().toISOString(),
        unrealizedGainLoss: (h.institution_value || 0) - (h.cost_basis || 0),
        unrealizedGainLossPct: h.cost_basis ? (((h.institution_value || 0) - h.cost_basis) / h.cost_basis) * 100 : 0,
        isLongTerm: false,
        isoCurrencyCode: h.iso_currency_code || 'USD',
      }))

      return envelope(this.provider, { holdings, securities })
    } catch (err) {
      return this.handleError(err)
    }
  }

  // ── Liabilities ───────────────────────────────────────────────────────

  async getLiabilities(accessToken: string) {
    try {
      const data = await this.plaidRequest<{
        liabilities: {
          credit?: PlaidCreditLiability[]
          mortgage?: PlaidMortgageLiability[]
          student?: PlaidStudentLiability[]
        }
      }>('/liabilities/get', { access_token: accessToken })

      const liabilities: LiabilityDetail[] = []

      // Credit cards
      for (const cc of (data.liabilities.credit || [])) {
        liabilities.push({
          id: cc.account_id,
          accountId: cc.account_id,
          type: 'credit_card',
          currentBalance: cc.last_statement_balance || 0,
          minimumPayment: cc.minimum_payment_amount || 0,
          lastPaymentAmount: cc.last_payment_amount || undefined,
          lastPaymentDate: cc.last_payment_date || undefined,
          nextPaymentDueDate: cc.next_payment_due_date || undefined,
          interestRateType: 'variable',
          interestRatePct: cc.aprs?.[0]?.apr_percentage || 0,
          taxDeductibleInterest: false,
        })
      }

      // Mortgages
      for (const m of (data.liabilities.mortgage || [])) {
        liabilities.push({
          id: m.account_id,
          accountId: m.account_id,
          type: 'mortgage',
          currentBalance: m.current_balance || 0,
          minimumPayment: m.last_payment_amount || 0,
          lastPaymentAmount: m.last_payment_amount || undefined,
          lastPaymentDate: m.last_payment_date || undefined,
          nextPaymentDueDate: m.next_payment_due_date || undefined,
          interestRateType: m.interest_rate?.type === 'fixed' ? 'fixed' : 'variable',
          interestRatePct: m.interest_rate?.percentage || 0,
          originalLoanAmount: m.original_balance || undefined,
          originationDate: m.origination_date || undefined,
          maturityDate: m.maturity_date || undefined,
          termMonths: m.term ? parseInt(m.term) : undefined,
          mortgage: {
            escrowBalance: m.escrow_balance || undefined,
            loanType: mapMortgageType(m.loan_type_description),
            interestPaidYTD: m.ytd_interest_paid || undefined,
          },
          taxDeductibleInterest: true,
          scheduleRef: 'Schedule A Line 8a / Form 1098',
        })
      }

      // Student loans
      for (const s of (data.liabilities.student || [])) {
        liabilities.push({
          id: s.account_id,
          accountId: s.account_id,
          type: 'student',
          currentBalance: s.outstanding_interest_amount + (s.last_statement_balance || 0),
          minimumPayment: s.minimum_payment_amount || 0,
          lastPaymentAmount: s.last_payment_amount || undefined,
          lastPaymentDate: s.last_payment_date || undefined,
          nextPaymentDueDate: s.next_payment_due_date || undefined,
          interestRateType: s.interest_rate_percentage ? 'fixed' : 'variable',
          interestRatePct: s.interest_rate_percentage || 0,
          originalLoanAmount: s.origination_principal_amount || undefined,
          originationDate: s.origination_date || undefined,
          maturityDate: s.expected_payoff_date || undefined,
          studentLoan: {
            guarantor: s.guarantor || undefined,
            interestPaidYTD: s.ytd_interest_paid || undefined,
            servicerName: s.servicer_address?.name || undefined,
            repaymentPlan: mapRepaymentPlan(s.repayment_plan?.type),
            pslf: s.pslf_status ? {
              isEligible: s.pslf_status.estimated_eligibility_date != null,
              qualifyingPayments: s.pslf_status.payments_made || 0,
            } : undefined,
          },
          taxDeductibleInterest: true,
          interestDeductionLimit: 2500,
          scheduleRef: '1040 Line 21 / Form 1098-E',
        })
      }

      return envelope(this.provider, liabilities)
    } catch (err) {
      return this.handleError(err)
    }
  }

  // ── Error Handler ─────────────────────────────────────────────────────

  private handleError<T>(err: unknown): FinTechResponse<T> {
    if (err instanceof PlaidError) {
      const type = err.errorType === 'INVALID_REQUEST' ? 'validation' as const
        : err.errorType === 'INVALID_INPUT' ? 'validation' as const
          : err.errorType === 'RATE_LIMIT_EXCEEDED' ? 'rate_limit' as const
            : err.errorType === 'ITEM_ERROR' ? 'connection_error' as const
              : 'api_error' as const
      return errorEnvelope(this.provider, err.code, err.message, type)
    }
    return errorEnvelope(this.provider, 'UNKNOWN', (err as Error).message)
  }
}

class PlaidError extends Error {
  constructor(
    public code: string,
    message: string,
    public errorType: string,
  ) {
    super(message)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  UNIT ADAPTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unit API adapter.
 * Banking-as-a-Service: deposit accounts, debit cards, ACH, wires,
 * check deposits, KYC/KYB verification.
 *
 * API Reference: https://docs.unit.co/
 */
export class UnitAdapter implements FinTechAdapter {
  readonly provider: FinTechProvider = 'unit'
  private config: ProviderConfig

  constructor(config: Omit<ProviderConfig, 'provider'>) {
    this.config = { ...config, provider: 'unit' }
    if (!this.config.baseUrl) {
      this.config.baseUrl = config.environment === 'production'
        ? 'https://api.s.unit.sh'
        : 'https://api.s.unit.sh' // Sandbox uses same base with sandbox token
    }
  }

  private async unitRequest<T>(method: string, endpoint: string, body?: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${this.config.secret}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ errors: [{ title: resp.statusText }] }))
      throw new Error(err.errors?.[0]?.title || resp.statusText)
    }
    return resp.json()
  }

  // ── Connection (Unit: Application) ────────────────────────────────────

  async createLinkToken(userId: string, _products: FinTechCapability[]) {
    // Unit uses Applications for onboarding, not link tokens
    // Return a placeholder — actual flow uses Unit's SDK
    return envelope(this.provider, {
      linkToken: `unit_app_${userId}_${Date.now()}`,
      expiration: new Date(Date.now() + 3600_000).toISOString(),
    })
  }

  async exchangePublicToken(_publicToken: string) {
    return envelope(this.provider, { connectionId: `unit_${Date.now()}`, accessToken: '' })
  }

  async removeConnection(_connectionId: string) {
    return envelope<void>(this.provider, undefined as unknown as void)
  }

  async getConnectionStatus(customerId: string) {
    try {
      const data = await this.unitRequest<{ data: UnitCustomer }>('GET', `/customers/${customerId}`)
      const conn: FinTechConnection = {
        id: data.data.id,
        provider: 'unit',
        institutionId: 'unit',
        institutionName: 'Unit Banking',
        status: data.data.attributes.status === 'Active' ? 'active' : 'pending_reauth',
        accountIds: [],
        capabilities: ['accounts', 'transactions', 'identity', 'payment_initiation', 'transfer'],
        createdAt: data.data.attributes.createdAt,
        updatedAt: data.data.attributes.createdAt,
      }
      return envelope(this.provider, conn)
    } catch (err) {
      return errorEnvelope<FinTechConnection>(this.provider, 'API_ERROR', (err as Error).message)
    }
  }

  // ── Accounts ──────────────────────────────────────────────────────────

  async getAccounts(customerId: string) {
    try {
      const data = await this.unitRequest<{ data: UnitAccount[] }>('GET', `/accounts?filter[customerId]=${customerId}`)
      return envelope(this.provider, data.data.map(normalizeUnitAccount))
    } catch (err) {
      return errorEnvelope<FinTechAccount[]>(this.provider, 'API_ERROR', (err as Error).message)
    }
  }

  async getAccountBalances(customerId: string, accountIds?: string[]) {
    return this.getAccounts(customerId) // Unit returns balances with accounts
  }

  // ── Transactions ──────────────────────────────────────────────────────

  async getTransactions(accountId: string, params: TransactionParams) {
    try {
      const query = new URLSearchParams({
        'filter[accountId]': accountId,
        'filter[since]': params.startDate,
        'filter[until]': params.endDate,
        'page[limit]': String(params.count || 100),
        'page[offset]': String(params.offset || 0),
      })
      const data = await this.unitRequest<{ data: UnitTransaction[] }>('GET', `/transactions?${query}`)
      return envelope(this.provider, data.data.map(normalizeUnitTransaction))
    } catch (err) {
      return errorEnvelope<FinTechTransaction[]>(this.provider, 'API_ERROR', (err as Error).message)
    }
  }

  async syncTransactions(_connectionId: string, _cursor?: string): Promise<FinTechResponse<TransactionSyncResult>> {
    return envelope(this.provider, { added: [], modified: [], removed: [], hasMore: false, nextCursor: '' })
  }

  // ── Identity (KYC) ───────────────────────────────────────────────────

  async getIdentity(customerId: string) {
    try {
      const data = await this.unitRequest<{ data: UnitCustomer }>('GET', `/customers/${customerId}`)
      const attrs = data.data.attributes
      const identity: KYCIdentity = {
        id: data.data.id,
        provider: 'unit',
        verificationStatus: attrs.status === 'Active' ? 'verified' : attrs.status === 'Denied' ? 'denied' : 'pending',
        verifiedAt: attrs.status === 'Active' ? new Date().toISOString() : undefined,
        legalFirstName: attrs.fullName?.first || '',
        legalLastName: attrs.fullName?.last || '',
        dateOfBirth: attrs.dateOfBirth || '',
        ssnLast4: attrs.ssn ? `***-**-${attrs.ssn.slice(-4)}` : undefined,
        email: attrs.email || '',
        emailVerified: true,
        phone: attrs.phone?.number || '',
        phoneVerified: true,
        address: {
          street1: attrs.address?.street || '',
          street2: attrs.address?.street2 || undefined,
          city: attrs.address?.city || '',
          region: attrs.address?.state || '',
          postalCode: attrs.address?.postalCode || '',
          country: attrs.address?.country || 'US',
        },
        checksPerformed: ['identity_verification', 'ssn_verification', 'address_verification', 'ofac_screening'],
      }
      return envelope(this.provider, identity)
    } catch (err) {
      return errorEnvelope<KYCIdentity>(this.provider, 'API_ERROR', (err as Error).message)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MX ADAPTER (Stub — same interface, different provider)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MX API adapter (stub).
 * Enhanced account aggregation with merchant-level enrichment.
 * Full implementation follows same pattern as Plaid/Unit above.
 */
export class MXAdapter implements FinTechAdapter {
  readonly provider: FinTechProvider = 'mx'
  private config: ProviderConfig

  constructor(config: Omit<ProviderConfig, 'provider'>) {
    this.config = { ...config, provider: 'mx' }
    if (!this.config.baseUrl) {
      this.config.baseUrl = config.environment === 'production'
        ? 'https://api.mx.com'
        : 'https://int-api.mx.com'
    }
  }

  async createLinkToken(userId: string, _products: FinTechCapability[]) {
    return envelope(this.provider, { linkToken: `mx_widget_${userId}`, expiration: new Date(Date.now() + 3600_000).toISOString() })
  }
  async exchangePublicToken(_pt: string) { return envelope(this.provider, { connectionId: '', accessToken: '' }) }
  async removeConnection(_id: string) { return envelope<void>(this.provider, undefined as unknown as void) }
  async getConnectionStatus(_id: string) { return errorEnvelope<FinTechConnection>(this.provider, 'NOT_IMPL', 'MX: implement with API key') }
  async getAccounts(_id: string) { return errorEnvelope<FinTechAccount[]>(this.provider, 'NOT_IMPL', 'MX: implement with API key') }
  async getAccountBalances(_id: string) { return errorEnvelope<FinTechAccount[]>(this.provider, 'NOT_IMPL', 'MX: implement with API key') }
  async getTransactions(_id: string, _p: TransactionParams) { return errorEnvelope<FinTechTransaction[]>(this.provider, 'NOT_IMPL', 'MX: implement with API key') }
  async syncTransactions(_id: string) { return envelope(this.provider, { added: [], modified: [], removed: [] as string[], hasMore: false, nextCursor: '' } as TransactionSyncResult) }
  async getIdentity(_id: string) { return errorEnvelope<KYCIdentity>(this.provider, 'NOT_IMPL', 'MX: implement with API key') }
}

// ─── Plaid Normalization Helpers ──────────────────────────────────────────

// Raw Plaid response types (minimal — only fields we use)
interface PlaidAccount {
  account_id: string; name: string; official_name?: string
  type: string; subtype: string; mask?: string
  balances: { current: number | null; available: number | null; limit: number | null; iso_currency_code: string }
}
interface PlaidTransaction {
  transaction_id: string; account_id: string; amount: number; date: string
  datetime?: string; authorized_date?: string; pending: boolean
  name: string; merchant_name?: string; original_description?: string
  category?: string[]; personal_finance_category?: { primary: string; detailed: string; confidence_level: string }
  payment_channel: string; payment_meta?: Record<string, string>
  location?: { address?: string; city?: string; region?: string; postal_code?: string; country?: string; lat?: number; lon?: number; store_number?: string }
  iso_currency_code: string
}
interface PlaidOwner {
  names?: string[]; emails?: { data: string }[]; phone_numbers?: { data: string }[]
  addresses?: { data: { street?: string; city?: string; region?: string; postal_code?: string; country?: string } }[]
}
interface PlaidHolding {
  account_id: string; security_id: string; quantity: number; cost_basis?: number
  institution_value?: number; institution_price?: number; institution_price_as_of?: string
  iso_currency_code?: string
}
interface PlaidSecurity {
  security_id: string; name?: string; ticker_symbol?: string; cusip?: string
  isin?: string; sedol?: string; type?: string; is_cash_equivalent?: boolean
  iso_currency_code?: string; close_price?: number; close_price_as_of?: string
}
interface PlaidCreditLiability {
  account_id: string; last_statement_balance?: number; minimum_payment_amount?: number
  last_payment_amount?: number; last_payment_date?: string; next_payment_due_date?: string
  aprs?: { apr_percentage: number }[]
}
interface PlaidMortgageLiability {
  account_id: string; current_balance?: number; last_payment_amount?: number
  last_payment_date?: string; next_payment_due_date?: string; interest_rate?: { type: string; percentage: number }
  original_balance?: number; origination_date?: string; maturity_date?: string; term?: string
  escrow_balance?: number; loan_type_description?: string; ytd_interest_paid?: number
}
interface PlaidStudentLiability {
  account_id: string; outstanding_interest_amount: number; last_statement_balance?: number
  minimum_payment_amount?: number; last_payment_amount?: number; last_payment_date?: string
  next_payment_due_date?: string; interest_rate_percentage?: number; origination_principal_amount?: number
  origination_date?: string; expected_payoff_date?: string; guarantor?: string; ytd_interest_paid?: number
  servicer_address?: { name?: string }; repayment_plan?: { type?: string }
  pslf_status?: { estimated_eligibility_date?: string; payments_made?: number }
}

// Unit response types
interface UnitCustomer {
  id: string
  attributes: {
    status: string; createdAt: string; fullName?: { first: string; last: string }
    dateOfBirth?: string; ssn?: string; email?: string; phone?: { number: string }
    address?: { street: string; street2?: string; city: string; state: string; postalCode: string; country: string }
  }
}
interface UnitAccount {
  id: string
  type: string
  attributes: {
    name: string; createdAt: string; balance: number; available: number
    routingNumber?: string; accountNumber?: string; currency: string; status: string
  }
}
interface UnitTransaction {
  id: string
  type: string
  attributes: {
    amount: number; direction: string; description: string; createdAt: string
    summary?: string; balance?: number
  }
  relationships?: { account?: { data?: { id: string } } }
}

function normalizePlaidAccount(a: PlaidAccount, connId: string): FinTechAccount {
  return {
    id: a.account_id, connectionId: connId, provider: 'plaid', institutionName: '',
    name: a.name, officialName: a.official_name || undefined,
    type: mapPlaidAccountType(a.type), subtype: mapPlaidSubtype(a.subtype),
    mask: a.mask || undefined,
    balances: {
      current: a.balances.current, available: a.balances.available,
      limit: a.balances.limit, lastUpdated: new Date().toISOString(),
    },
    isoCurrencyCode: a.balances.iso_currency_code || 'USD',
    taxRelevance: inferTaxRelevance(a.type, a.subtype),
    providerAccountId: a.account_id,
    isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
}

function normalizePlaidTransaction(t: PlaidTransaction): FinTechTransaction {
  const isDebit = t.amount > 0 // Plaid: positive = money leaving account
  return {
    id: t.transaction_id, accountId: t.account_id, connectionId: '', provider: 'plaid',
    amount: Math.abs(t.amount), type: isDebit ? 'debit' : 'credit',
    date: t.date, datetime: t.datetime || undefined, authorizedDate: t.authorized_date || undefined,
    pending: t.pending,
    name: t.name, merchantName: t.merchant_name || undefined, originalDescription: t.original_description || undefined,
    category: {
      primary: t.personal_finance_category?.primary || t.category?.[0] || 'Other',
      detailed: t.personal_finance_category?.detailed || t.category?.[1] || undefined,
      confidenceLevel: t.personal_finance_category?.confidence_level === 'VERY_HIGH' ? 0.95
        : t.personal_finance_category?.confidence_level === 'HIGH' ? 0.85
          : t.personal_finance_category?.confidence_level === 'LOW' ? 0.5 : 0.7,
    },
    paymentChannel: (t.payment_channel || 'other') as FinTechTransaction['paymentChannel'],
    location: t.location ? {
      address: t.location.address || undefined, city: t.location.city || undefined,
      region: t.location.region || undefined, postalCode: t.location.postal_code || undefined,
      country: t.location.country || undefined, lat: t.location.lat || undefined,
      lon: t.location.lon || undefined, storeNumber: t.location.store_number || undefined,
    } : undefined,
    taxRelevance: { isDeductible: false, deductionPct: 0, isTaxPayment: false, is1099Reportable: false },
    isoCurrencyCode: t.iso_currency_code || 'USD',
    providerTransactionId: t.transaction_id,
  }
}

function normalizeUnitAccount(a: UnitAccount): FinTechAccount {
  const isChecking = a.type === 'depositAccount'
  return {
    id: a.id, connectionId: '', provider: 'unit', institutionName: 'Unit Banking',
    name: a.attributes.name || (isChecking ? 'Checking' : 'Account'),
    type: 'depository', subtype: isChecking ? 'checking' : 'savings',
    balances: {
      current: a.attributes.balance / 100, available: a.attributes.available / 100,
      limit: null, lastUpdated: new Date().toISOString(),
    },
    routingNumber: a.attributes.routingNumber,
    accountNumber: a.attributes.accountNumber,
    isoCurrencyCode: a.attributes.currency || 'USD',
    taxRelevance: { isTaxAdvantaged: false, taxType: 'taxable', fortunaMapping: 'bank' },
    providerAccountId: a.id,
    isActive: a.attributes.status === 'Open', createdAt: a.attributes.createdAt, updatedAt: a.attributes.createdAt,
  }
}

function normalizeUnitTransaction(t: UnitTransaction): FinTechTransaction {
  return {
    id: t.id, accountId: t.relationships?.account?.data?.id || '', connectionId: '', provider: 'unit',
    amount: Math.abs(t.attributes.amount) / 100,
    type: t.attributes.direction === 'Debit' ? 'debit' : 'credit',
    date: t.attributes.createdAt.split('T')[0], datetime: t.attributes.createdAt,
    pending: false,
    name: t.attributes.description || t.attributes.summary || '',
    category: { primary: 'Other' },
    paymentChannel: 'other',
    taxRelevance: { isDeductible: false, deductionPct: 0, isTaxPayment: false, is1099Reportable: false },
    isoCurrencyCode: 'USD',
    providerTransactionId: t.id,
  }
}

// ─── Type Mapping Helpers ─────────────────────────────────────────────────

const PLAID_PRODUCT_MAP: Record<string, string> = {
  accounts: 'transactions', transactions: 'transactions', balance: 'transactions',
  identity: 'identity', investments: 'investments', liabilities: 'liabilities',
  income: 'income_verification', assets: 'assets', recurring: 'transactions',
  payment_initiation: 'payment_initiation', transfer: 'transfer',
}

function mapPlaidAccountType(type: string): AccountType {
  switch (type) {
    case 'depository': return 'depository'
    case 'credit': return 'credit'
    case 'investment': return 'investment'
    case 'loan': return 'loan'
    default: return 'other'
  }
}

function mapPlaidSubtype(subtype: string): AccountSubtype {
  const map: Record<string, AccountSubtype> = {
    checking: 'checking', savings: 'savings', 'money market': 'money_market', cd: 'cd',
    hsa: 'hsa', 'cash management': 'cash_management',
    'credit card': 'credit_card', 'line of credit': 'line_of_credit', paypal: 'paypal',
    '401k': '401k', '401a': '401a', '403b': '403b', '457b': '457b', ira: 'ira',
    'roth ira': 'roth_ira', 'roth 401k': 'roth_401k', 'sep ira': 'sep_ira',
    'simple ira': 'simple_ira', brokerage: 'brokerage', pension: 'pension',
    '529': '529', trust: 'trust', ugma: 'ugma', utma: 'utma',
    'stock plan': 'stock_plan', 'profit sharing': 'profit_sharing',
    mortgage: 'mortgage', student: 'student', auto: 'auto', personal: 'personal',
    'home equity': 'home_equity', commercial: 'commercial',
    payroll: 'payroll', prepaid: 'prepaid', rewards: 'rewards',
  }
  return map[subtype] || 'other'
}

function mapPlaidSecurityType(type?: string): Security['type'] {
  const map: Record<string, Security['type']> = {
    equity: 'equity', etf: 'etf', 'mutual fund': 'mutual_fund', bond: 'bond',
    'fixed income': 'fixed_income', option: 'option', cryptocurrency: 'cryptocurrency',
    cash: 'cash', derivative: 'derivative',
  }
  return (type && map[type]) || 'other'
}

function inferTaxRelevance(type: string, subtype: string): AccountTaxRelevance {
  const taxAdvantaged = ['401k', '401a', '403b', '457b', 'ira', 'roth ira', 'roth 401k',
    'sep ira', 'simple ira', 'hsa', '529', 'pension', 'profit sharing'].includes(subtype)

  const taxType = subtype.includes('roth') ? 'roth' as const
    : subtype === 'hsa' ? 'tax_free' as const
      : taxAdvantaged ? 'pre_tax' as const : 'taxable' as const

  const fortunaMapping = taxAdvantaged ? 'retirement' as const
    : type === 'investment' ? 'investment' as const
      : type === 'loan' ? 'liability' as const
        : subtype === 'hsa' ? 'hsa' as const
          : subtype === '529' ? 'education' as const : 'bank' as const

  return { isTaxAdvantaged: taxAdvantaged, taxType, fortunaMapping }
}

function mapMortgageType(desc?: string): LiabilityDetail['mortgage'] extends { loanType: infer T } ? T : never {
  if (!desc) return 'other' as any
  const d = desc.toLowerCase()
  if (d.includes('fha')) return 'fha' as any
  if (d.includes('va')) return 'va' as any
  if (d.includes('usda')) return 'usda' as any
  if (d.includes('jumbo')) return 'jumbo' as any
  return 'conventional' as any
}

function mapRepaymentPlan(type?: string): 'standard' | 'graduated' | 'income_driven' | 'extended' | 'other' {
  if (!type) return 'other'
  const t = type.toLowerCase()
  if (t.includes('income')) return 'income_driven'
  if (t.includes('graduated')) return 'graduated'
  if (t.includes('extended')) return 'extended'
  if (t.includes('standard')) return 'standard'
  return 'other'
}

// ─── Provider Factory ─────────────────────────────────────────────────────

/**
 * Create a FinTech adapter for the specified provider.
 */
export function createAdapter(config: ProviderConfig): FinTechAdapter {
  switch (config.provider) {
    case 'plaid': return new PlaidAdapter(config)
    case 'unit': return new UnitAdapter(config)
    case 'mx': return new MXAdapter(config)
    default: throw new Error(`Unsupported provider: ${config.provider}`)
  }
}
