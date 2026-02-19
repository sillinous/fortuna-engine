/**
 * Fortuna Engine — FinTech Canonical Data Models
 *
 * Provider-agnostic data structures that normalize financial data from
 * any aggregation/BaaS provider into a unified schema. Every external
 * provider adapter maps its native response into these types.
 *
 * Covers the standard FinTech API surface:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  ACCOUNTS        │  TRANSACTIONS   │  IDENTITY (KYC)   │
 *   │  Bank, Credit,   │  Enriched,      │  Name, Address,   │
 *   │  Investment,     │  Categorized,   │  SSN, DOB, Phone, │
 *   │  Loan, Mortgage  │  Merchant data  │  Email verified   │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  BUSINESS (KYB)  │  INVESTMENTS    │  LIABILITIES      │
 *   │  EIN, Officers,  │  Holdings,      │  Loans, Mortgages │
 *   │  Beneficial      │  Securities,    │  Student, Credit  │
 *   │  Owners, UBO     │  Cost basis     │  Lines, APR       │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  ASSETS          │  INCOME         │  CONNECTIONS       │
 *   │  Bank + Invest   │  Streams, Pay   │  Institution link  │
 *   │  verification    │  stubs, W-2     │  status, health    │
 *   └─────────────────────────────────────────────────────────┘
 *
 * @module fintech-models
 */

// ─── Provider Enum ────────────────────────────────────────────────────────

export type FinTechProvider =
  | 'plaid'        // Account aggregation, transactions, identity, investments, liabilities, assets
  | 'unit'         // Banking-as-a-Service: deposit accounts, cards, payments, KYC/KYB
  | 'mx'           // Account aggregation with enhanced enrichment
  | 'yodlee'       // Account aggregation (Envestnet)
  | 'stripe'       // Payments, treasury, issuing
  | 'moov'         // Money movement, wallets
  | 'synapse'      // BaaS: accounts, cards, ACH, wires
  | 'column'       // BaaS: ledger-native banking
  | 'treasury_prime' // BaaS: banking infrastructure
  | 'galileo'      // Card issuing, payments
  | 'marqeta'      // Card issuing
  | 'alloy'        // Identity verification, KYC/KYB
  | 'persona'      // Identity verification
  | 'middesk'      // Business verification (KYB)
  | 'sardine'      // Fraud detection
  | 'socure'       // Identity verification + fraud
  | 'manual'       // Manual entry / file import

// ─── Connection ───────────────────────────────────────────────────────────

export interface FinTechConnection {
  id: string
  provider: FinTechProvider
  institutionId: string        // Provider's institution identifier
  institutionName: string      // Human-readable name (e.g., "Chase", "Bank of America")
  institutionLogo?: string     // URL to logo
  status: 'active' | 'degraded' | 'disconnected' | 'pending_reauth' | 'error'
  statusDetail?: string
  consentExpiresAt?: string    // ISO date — when user consent expires
  lastSuccessfulSync?: string  // ISO date
  lastAttemptedSync?: string
  errorCode?: string           // Provider-specific error code
  accountIds: string[]         // Linked account IDs
  capabilities: FinTechCapability[]
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type FinTechCapability =
  | 'accounts' | 'transactions' | 'identity' | 'investments'
  | 'liabilities' | 'assets' | 'income' | 'balance'
  | 'payment_initiation' | 'transfer' | 'recurring'

// ─── Accounts ─────────────────────────────────────────────────────────────

export type AccountType =
  | 'depository'    // Checking, savings, money market, CD, HSA
  | 'credit'        // Credit card, line of credit
  | 'investment'    // Brokerage, 401k, IRA, Roth IRA, 529
  | 'loan'          // Mortgage, student, auto, personal, HELOC
  | 'other'         // Payroll, prepaid, rewards

export type AccountSubtype =
  // Depository
  | 'checking' | 'savings' | 'money_market' | 'cd' | 'hsa' | 'cash_management'
  // Credit
  | 'credit_card' | 'line_of_credit' | 'paypal'
  // Investment
  | 'brokerage' | '401k' | '401a' | '403b' | '457b' | 'ira' | 'roth_ira'
  | 'sep_ira' | 'simple_ira' | 'roth_401k' | '529' | 'education_savings'
  | 'pension' | 'profit_sharing' | 'trust' | 'ugma' | 'utma' | 'stock_plan'
  // Loan
  | 'mortgage' | 'student' | 'auto' | 'personal' | 'home_equity' | 'commercial'
  // Other
  | 'payroll' | 'prepaid' | 'rewards' | 'other'

export interface FinTechAccount {
  id: string
  connectionId: string
  provider: FinTechProvider
  institutionName: string

  // Core
  name: string                 // Account display name
  officialName?: string        // Official institution name
  type: AccountType
  subtype: AccountSubtype
  mask?: string                // Last 4 digits

  // Balances
  balances: AccountBalances

  // Identifiers
  accountNumber?: string       // Full account number (sensitive — encrypted at rest)
  routingNumber?: string       // ABA routing number
  wireRoutingNumber?: string
  iban?: string
  swift?: string

  // Currency
  isoCurrencyCode: string      // ISO 4217 (e.g., 'USD')

  // Tax relevance
  taxRelevance: AccountTaxRelevance

  // Provider-specific
  providerAccountId: string    // Provider's internal ID
  providerItemId?: string      // Provider's connection/item ID
  metadata?: Record<string, unknown>

  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountBalances {
  current: number | null       // Most recent balance
  available: number | null     // Available for spending/withdrawal
  limit: number | null         // Credit limit or line amount
  lastUpdated: string          // ISO date of balance snapshot

  // Investment-specific
  marketValue?: number         // Current market value of holdings
  costBasis?: number           // Total cost basis
  unrealizedGainLoss?: number  // Market value - cost basis
}

export interface AccountTaxRelevance {
  isTaxAdvantaged: boolean     // 401k, IRA, HSA, 529, etc.
  taxType?: 'pre_tax' | 'roth' | 'after_tax' | 'tax_free' | 'taxable'
  // Which Fortuna module this feeds into:
  fortunaMapping: 'retirement' | 'investment' | 'bank' | 'liability' | 'hsa' | 'education' | 'none'
  scheduleRef?: string         // Tax form reference
}

// ─── Transactions ─────────────────────────────────────────────────────────

export type TransactionType = 'debit' | 'credit' | 'transfer' | 'fee' | 'interest' | 'other'

export interface FinTechTransaction {
  id: string
  accountId: string
  connectionId: string
  provider: FinTechProvider

  // Core
  amount: number               // Always positive; direction indicated by type
  type: TransactionType
  date: string                 // ISO date (posted date)
  datetime?: string            // ISO datetime if available
  authorizedDate?: string      // Date transaction was authorized (may differ from posted)
  pending: boolean

  // Description / Names
  name: string                 // Original transaction name from institution
  merchantName?: string        // Cleaned/enriched merchant name
  originalDescription?: string // Raw description string

  // Categorization
  category: TransactionCategory
  categoryDetail?: string      // Finer subcategory
  personalFinanceCategory?: PersonalFinanceCategory

  // Merchant / Counterparty
  merchant?: MerchantInfo

  // Payment channel
  paymentChannel: 'online' | 'in_store' | 'atm' | 'other'
  paymentMeta?: {
    referenceNumber?: string
    checkNumber?: string
    ppdId?: string             // ACH PPD ID
    payee?: string
    byOrderOf?: string
    payer?: string
  }

  // Location
  location?: {
    address?: string
    city?: string
    region?: string            // State/province
    postalCode?: string
    country?: string
    lat?: number
    lon?: number
    storeNumber?: string
  }

  // Enrichment
  isRecurring?: boolean
  recurringStreamId?: string
  counterpartyType?: 'business' | 'individual' | 'government' | 'unknown'

  // Tax relevance
  taxRelevance: TransactionTaxRelevance

  // ISO currency
  isoCurrencyCode: string

  // Provider-specific
  providerTransactionId: string
  metadata?: Record<string, unknown>
}

export interface TransactionCategory {
  primary: string              // Top-level: "Food and Drink", "Travel", "Transfer", etc.
  detailed?: string            // Detail: "Restaurants", "Airlines", "Internal Account Transfer"
  confidenceLevel?: number     // 0-1 confidence score from enrichment
}

export type PersonalFinanceCategory =
  | 'income' | 'transfer_in' | 'transfer_out'
  | 'loan_payment' | 'bank_fees' | 'entertainment'
  | 'food_and_drink' | 'general_merchandise' | 'general_services'
  | 'government_and_non_profit' | 'home_improvement'
  | 'medical' | 'personal_care' | 'rent_and_utilities'
  | 'transportation' | 'travel' | 'other'

export interface MerchantInfo {
  name: string
  merchantId?: string          // Unique merchant identifier
  logoUrl?: string
  website?: string
  category?: string            // Merchant category (MCC description)
  mcc?: string                 // Merchant Category Code (4-digit)
  address?: string
  city?: string
  state?: string
  country?: string
}

export interface TransactionTaxRelevance {
  isDeductible: boolean
  deductionCategory?: string   // Schedule C line, Schedule A category, etc.
  deductionPct: number         // 0-100 (e.g., meals = 50)
  isTaxPayment: boolean        // Estimated tax payment, state tax, property tax
  is1099Reportable: boolean    // Payment to contractor ≥ $600
  fortunaCategory?: string     // Maps to Fortuna tax category
  scheduleRef?: string
}

// ─── Transaction Enrichment Rules ─────────────────────────────────────────

export interface TransactionEnrichmentRule {
  id: string
  matchType: 'contains' | 'starts_with' | 'regex' | 'merchant_name' | 'mcc'
  matchValue: string
  assignCategory: string
  assignTaxDeductible: boolean
  assignDeductionPct: number
  assignScheduleRef?: string
  priority: number             // Higher = checked first
}

// ─── Identity (KYC) ──────────────────────────────────────────────────────

export interface KYCIdentity {
  id: string
  provider: FinTechProvider
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'denied' | 'review'
  verifiedAt?: string

  // Personal info
  legalFirstName: string
  legalMiddleName?: string
  legalLastName: string
  dateOfBirth: string          // ISO date
  ssn?: string                 // Encrypted at rest — last 4 only in responses
  ssnLast4?: string

  // Contact
  email: string
  emailVerified: boolean
  phone: string
  phoneVerified: boolean

  // Address
  address: PostalAddress
  previousAddresses?: PostalAddress[]

  // Government IDs
  governmentIds?: GovernmentId[]

  // Risk scoring
  riskScore?: number           // 0-100 (provider-specific)
  riskSignals?: string[]       // e.g., "address_mismatch", "ssn_mismatch"

  // Verification checks performed
  checksPerformed: KYCCheck[]

  // Watchlist / sanctions screening
  watchlistScreening?: {
    status: 'clear' | 'pending_review' | 'hit'
    hits?: { listName: string; matchScore: number }[]
    screenedAt: string
  }

  metadata?: Record<string, unknown>
}

export interface PostalAddress {
  street1: string
  street2?: string
  city: string
  region: string               // State/province
  postalCode: string
  country: string              // ISO 3166-1 alpha-2
}

export interface GovernmentId {
  type: 'ssn' | 'itin' | 'ein' | 'passport' | 'drivers_license' | 'state_id' | 'national_id'
  value?: string               // Encrypted — may be masked
  maskedValue?: string         // e.g., "***-**-1234"
  country: string
  state?: string               // For DL/state ID
  expirationDate?: string
  issuedDate?: string
}

export type KYCCheck =
  | 'identity_verification'    // Name + SSN + DOB match
  | 'address_verification'     // Address verification
  | 'document_verification'    // ID document check
  | 'phone_verification'       // Phone ownership
  | 'email_verification'       // Email ownership
  | 'ssn_verification'         // SSN match
  | 'ofac_screening'           // OFAC sanctions check
  | 'pep_screening'            // Politically Exposed Person
  | 'adverse_media'            // Adverse media screening
  | 'fraud_check'              // Device/behavioral fraud signals
  | 'bank_verification'        // Micro-deposits or instant verification

// ─── Business Identity (KYB) ─────────────────────────────────────────────

export interface KYBBusinessIdentity {
  id: string
  provider: FinTechProvider
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'denied' | 'review'
  verifiedAt?: string

  // Business info
  legalName: string
  dbaName?: string             // Doing Business As
  entityType: BusinessEntityType
  formationState: string
  formationDate?: string
  ein?: string                 // Encrypted at rest
  einMasked?: string           // "**-***1234"

  // Registration
  stateRegistrationNumber?: string
  naicsCode?: string           // North American Industry Classification
  sicCode?: string             // Standard Industrial Classification
  description?: string

  // Address
  registeredAddress: PostalAddress
  mailingAddress?: PostalAddress
  physicalAddress?: PostalAddress

  // Contact
  phone?: string
  website?: string
  email?: string

  // Financial profile
  annualRevenue?: number
  numberOfEmployees?: number
  yearEstablished?: number

  // Officers & Beneficial Owners (UBO)
  officers: BusinessOfficer[]
  beneficialOwners: BeneficialOwner[]

  // Verification
  checksPerformed: KYBCheck[]

  // Secretary of State filings
  sosFilings?: {
    status: 'active' | 'inactive' | 'dissolved' | 'suspended' | 'unknown'
    filingDate?: string
    state: string
    filingNumber?: string
  }[]

  // Tax relevance
  taxClassification?: 'sole_prop' | 'partnership' | 's_corp' | 'c_corp' | 'llc_disregarded'
    | 'llc_partnership' | 'llc_s_corp' | 'llc_c_corp' | 'nonprofit'

  metadata?: Record<string, unknown>
}

export type BusinessEntityType =
  | 'sole_proprietorship' | 'single_member_llc' | 'multi_member_llc'
  | 'partnership' | 'limited_partnership' | 'lp'
  | 's_corporation' | 'c_corporation' | 'b_corporation'
  | 'nonprofit' | 'trust' | 'estate'

export interface BusinessOfficer {
  name: string
  title: string                // CEO, CFO, President, Secretary, etc.
  email?: string
  phone?: string
  ownershipPct?: number
}

export interface BeneficialOwner {
  firstName: string
  lastName: string
  dateOfBirth?: string
  ssn?: string                 // Encrypted
  ssnLast4?: string
  ownershipPct: number         // Must total ≥25% for each UBO
  address?: PostalAddress
  isControlPerson: boolean     // Has significant management authority
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'denied'
}

export type KYBCheck =
  | 'business_name_verification'
  | 'ein_verification'
  | 'sos_filing_verification'     // Secretary of State
  | 'tin_match'                   // IRS TIN matching
  | 'ofac_screening'
  | 'adverse_media'
  | 'beneficial_owner_verification'
  | 'address_verification'
  | 'website_verification'
  | 'phone_verification'

// ─── Investments ──────────────────────────────────────────────────────────

export interface InvestmentHolding {
  id: string
  accountId: string
  securityId: string

  // Position
  quantity: number
  costBasis: number            // Total cost basis
  marketValue: number          // Current market value
  price: number                // Current price per share/unit
  priceAsOf: string            // ISO date of price

  // Gain/Loss
  unrealizedGainLoss: number
  unrealizedGainLossPct: number

  // Tax lot info
  isLongTerm: boolean          // Held > 1 year
  acquiredDate?: string        // Earliest lot acquisition date
  taxLots?: TaxLot[]

  // Classification
  isoCurrencyCode: string
}

export interface TaxLot {
  id: string
  quantity: number
  costBasis: number
  acquiredDate: string
  isLongTerm: boolean
  holdingPeriodDays: number
  unrealizedGainLoss: number
}

export interface Security {
  id: string
  name: string
  tickerSymbol?: string
  cusip?: string               // Committee on Uniform Securities Identification Procedures
  isin?: string                // International Securities Identification Number
  sedol?: string               // Stock Exchange Daily Official List
  type: SecurityType
  isoCurrencyCode: string
  closePrice?: number
  closePriceAsOf?: string
  isCashEquivalent: boolean
}

export type SecurityType =
  | 'equity' | 'etf' | 'mutual_fund' | 'fixed_income' | 'bond'
  | 'option' | 'cryptocurrency' | 'cash' | 'derivative'
  | 'alternative' | 'commodity' | 'reit' | 'other'

export interface InvestmentTransaction {
  id: string
  accountId: string
  securityId?: string
  date: string
  type: InvestmentTransactionType
  name: string
  quantity: number
  amount: number               // Total amount
  price: number                // Per-unit price
  fees: number
  isoCurrencyCode: string
}

export type InvestmentTransactionType =
  | 'buy' | 'sell' | 'short_sell' | 'cover'
  | 'dividend' | 'interest' | 'capital_gain_long' | 'capital_gain_short'
  | 'reinvestment' | 'contribution' | 'withdrawal'
  | 'fee' | 'transfer_in' | 'transfer_out' | 'spin_off' | 'split'
  | 'other'

// ─── Liabilities ──────────────────────────────────────────────────────────

export interface LiabilityDetail {
  id: string
  accountId: string
  type: 'mortgage' | 'student' | 'credit_card' | 'auto' | 'personal' | 'heloc' | 'other'

  // Current state
  currentBalance: number
  minimumPayment: number
  lastPaymentAmount?: number
  lastPaymentDate?: string
  nextPaymentDueDate?: string

  // Terms
  interestRateType: 'fixed' | 'variable'
  interestRatePct: number      // Current APR
  originalLoanAmount?: number
  originationDate?: string
  maturityDate?: string
  termMonths?: number

  // Mortgage-specific
  mortgage?: {
    propertyAddress?: PostalAddress
    escrowBalance?: number
    pmiPct?: number
    loanType: 'conventional' | 'fha' | 'va' | 'usda' | 'jumbo' | 'other'
    interestPaidYTD?: number   // For Schedule A / Form 1098
    propertyTaxPaidYTD?: number
    pmiPaidYTD?: number
  }

  // Student loan-specific
  studentLoan?: {
    guarantor?: string
    interestPaidYTD?: number   // For 1040 Line 21 / Form 1098-E
    servicerName?: string
    repaymentPlan: 'standard' | 'graduated' | 'income_driven' | 'extended' | 'other'
    pslf?: {
      isEligible: boolean
      qualifyingPayments: number
      estimatedForgiveness?: number
    }
  }

  // Tax relevance
  taxDeductibleInterest: boolean
  interestDeductionLimit?: number
  scheduleRef?: string
}

// ─── Income Verification ──────────────────────────────────────────────────

export interface IncomeVerification {
  id: string
  accountId?: string
  provider: FinTechProvider
  verifiedAt: string

  // Income streams
  streams: VerifiedIncomeStream[]

  // Pay stubs (if available)
  payStubs?: PayStub[]

  // W-2s (if available via provider)
  w2s?: W2Summary[]

  // Bank income (transaction-based)
  bankIncome?: {
    totalAmount: number
    transactionCount: number
    startDate: string
    endDate: string
    regularStreams: {
      name: string
      frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'irregular'
      averageAmount: number
      lastAmount: number
      lastDate: string
      isActive: boolean
    }[]
  }
}

export interface VerifiedIncomeStream {
  name: string                 // Employer or source name
  type: 'employment' | 'self_employment' | 'investment' | 'government' | 'other'
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'annual' | 'irregular'
  annualizedAmount: number
  lastAmount: number
  lastDate: string
  isActive: boolean
  confidence: number           // 0-1
}

export interface PayStub {
  employerName: string
  payDate: string
  payPeriod: { start: string; end: string }
  grossPay: number
  netPay: number
  deductions: {
    name: string
    amount: number
    type: 'tax' | 'benefit' | 'retirement' | 'other'
  }[]
  earnings: {
    name: string
    amount: number
    hours?: number
    rate?: number
  }[]
  ytd: {
    grossPay: number
    netPay: number
    totalDeductions: number
    federalTax: number
    stateTax: number
    socialSecurity: number
    medicare: number
    retirement401k?: number
  }
}

export interface W2Summary {
  employerName: string
  employerEin: string
  taxYear: number
  wages: number                // Box 1
  federalWithholding: number   // Box 2
  socialSecurityWages: number  // Box 3
  socialSecurityTax: number    // Box 4
  medicareWages: number        // Box 5
  medicareTax: number          // Box 6
  socialSecurityTips?: number  // Box 7
  allocatedTips?: number       // Box 8
  dependentCareBenefits?: number // Box 10
  nonqualifiedPlans?: number   // Box 11
  box12Codes?: { code: string; amount: number }[] // 401k (D), HSA (W), etc.
  stateTaxInfo?: {
    state: string
    stateId: string
    stateWages: number
    stateTax: number
  }[]
}

// ─── Recurring Transactions ───────────────────────────────────────────────

export interface RecurringStream {
  id: string
  accountId: string
  streamType: 'income' | 'expense'
  category: string
  merchantName?: string
  description: string
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'
  averageAmount: number
  lastAmount: number
  lastDate: string
  nextExpectedDate?: string
  isActive: boolean
  transactionIds: string[]     // Recent matching transactions
  confidence: number           // 0-1
  status: 'mature' | 'early_detection' | 'tombstoned'
}

// ─── Asset Report ─────────────────────────────────────────────────────────

export interface AssetReport {
  id: string
  provider: FinTechProvider
  createdAt: string
  daysRequested: number        // e.g., 60, 90
  accounts: AssetReportAccount[]
  user: {
    firstName: string
    lastName: string
    ssn?: string
    email?: string
    phone?: string
  }
}

export interface AssetReportAccount {
  accountId: string
  name: string
  officialName?: string
  type: AccountType
  subtype: AccountSubtype
  mask?: string
  balances: AccountBalances
  transactions: FinTechTransaction[] // Filtered to requested period
  daysAvailable: number
  historicalBalances: { date: string; current: number }[]
  ownerNames: string[]
}

// ─── Webhook Events ───────────────────────────────────────────────────────

export type WebhookEventType =
  | 'connection.created' | 'connection.updated' | 'connection.error' | 'connection.removed'
  | 'transactions.sync' | 'transactions.initial_update' | 'transactions.historical_update'
  | 'transactions.removed'
  | 'account.balance_update'
  | 'identity.verification_complete'
  | 'income.verification_complete'
  | 'investments.update'
  | 'liabilities.update'
  | 'transfer.update'

export interface WebhookEvent {
  id: string
  type: WebhookEventType
  provider: FinTechProvider
  connectionId: string
  timestamp: string
  data: Record<string, unknown>
}

// ─── API Response Envelope ────────────────────────────────────────────────

export interface FinTechResponse<T> {
  success: boolean
  data: T | null
  error?: {
    code: string               // Provider-specific error code
    message: string
    type: 'auth' | 'rate_limit' | 'api_error' | 'connection_error' | 'validation'
    retryable: boolean
    retryAfter?: number        // Seconds
  }
  provider: FinTechProvider
  requestId: string
  timestamp: string
  pagination?: {
    total: number
    offset: number
    limit: number
    hasMore: boolean
    cursor?: string
  }
}
