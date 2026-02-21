/**
 * Fortuna Engine — Production Persistence Layer v7
 * 
 * Dual-backend: localStorage (primary) + window.storage (fallback for Claude artifacts)
 * Schema versioning with automatic forward-migrations
 * UX preference persistence (sidebar, last view, theme)
 * Data export/import for backup & cross-device transfer
 */

// ===================================================================
//  SCHEMA VERSION — increment on ANY data shape change
// ===================================================================
const SCHEMA_VERSION = 16

// ===================================================================
//  STORAGE KEYS
// ===================================================================
const KEYS = {
  FULL_STATE: 'fortuna:full-state',
  UX_PREFS: 'fortuna:ux-prefs',
  ADVISOR_HISTORY: 'fortuna:advisor-history',
  FINANCIAL_HISTORY: 'fortuna:financial-history',
  SCHEMA_VERSION: 'fortuna:schema-version',
} as const

// ===================================================================
//  BACKEND ABSTRACTION
// ===================================================================

declare global {
  interface Window {
    storage?: {
      get(key: string, shared?: boolean): Promise<{ key: string; value: string; shared: boolean } | null>
      set(key: string, value: string, shared?: boolean): Promise<{ key: string; value: string; shared: boolean } | null>
      delete(key: string, shared?: boolean): Promise<{ key: string; deleted: boolean; shared: boolean } | null>
      list(prefix?: string, shared?: boolean): Promise<{ keys: string[]; prefix?: string; shared: boolean } | null>
    }
  }
}

/**
 * Tries localStorage first (works on Hostinger, any browser),
 * falls back to window.storage (Claude artifacts).
 * If both fail, returns fallback silently.
 */
function getBackend(): 'localStorage' | 'windowStorage' | 'none' {
  try {
    const testKey = '__fortuna_storage_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)
    return 'localStorage'
  } catch {
    // localStorage unavailable
  }
  if (window.storage) return 'windowStorage'
  return 'none'
}

async function rawGet(key: string): Promise<string | null> {
  const backend = getBackend()
  if (backend === 'localStorage') {
    return localStorage.getItem(key)
  }
  if (backend === 'windowStorage') {
    try {
      const result = await window.storage!.get(key)
      return result?.value ?? null
    } catch { return null }
  }
  return null
}

async function rawSet(key: string, value: string): Promise<boolean> {
  const backend = getBackend()
  if (backend === 'localStorage') {
    try {
      localStorage.setItem(key, value)
      return true
    } catch { return false }
  }
  if (backend === 'windowStorage') {
    try {
      const result = await window.storage!.set(key, value)
      return !!result
    } catch { return false }
  }
  return false
}

async function rawDelete(key: string): Promise<boolean> {
  const backend = getBackend()
  if (backend === 'localStorage') {
    try {
      localStorage.removeItem(key)
      return true
    } catch { return false }
  }
  if (backend === 'windowStorage') {
    try {
      const result = await window.storage!.delete(key)
      return !!result?.deleted
    } catch { return false }
  }
  return false
}

// Typed helpers
async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await rawGet(key)
    if (raw) return JSON.parse(raw) as T
    return fallback
  } catch {
    return fallback
  }
}

async function safeSet<T>(key: string, value: T): Promise<boolean> {
  try {
    return await rawSet(key, JSON.stringify(value))
  } catch {
    return false
  }
}

// ===================================================================
//  SCHEMA MIGRATIONS
// ===================================================================

const migrations: Record<number, (state: any) => any> = {
  1: (state: any) => ({ ...state, strategies: state.strategies ?? [] }),
  2: (state: any) => ({ ...state }),
  3: (state: any) => ({ ...state }),
  4: (state: any) => ({ ...state }),
  5: (state: any) => ({ ...state }),
  6: (state: any) => ({
    ...state,
    profile: {
      name: '', state: 'IL', filingStatus: 'single',
      dependents: 0, hasHealthInsurance: true, age: 35,
      ...state.profile,
    },
    incomeStreams: state.incomeStreams ?? [],
    expenses: state.expenses ?? [],
    entities: state.entities ?? [],
    deductions: state.deductions ?? [],
    strategies: state.strategies ?? [],
    onboardingComplete: state.onboardingComplete ?? false,
    lastUpdated: state.lastUpdated ?? new Date().toISOString(),
  }),
  // v7 → v8: Financial history engine
  7: (state: any) => ({ ...state }),
  // v8 → v9: Unified Metamodel — household, attribution, orphaned types
  8: (state: any) => {
    // Build household from existing profile
    const profile = state.profile || {}
    const household = {
      members: [{
        id: 'primary',
        name: profile.name || '',
        role: 'primary',
      }],
      dependents: Array.from({ length: profile.dependents || 0 }, (_, i) => ({
        id: `dep-${i + 1}`,
        name: `Dependent ${i + 1}`,
        relationship: 'child' as const,
        dateOfBirth: '',
        monthsLived: 12,
      })),
      filingStatus: profile.filingStatus || 'single',
    }

    // Backfill entityId='personal' on records that lack it
    const backfillAttribution = (arr: any[]) =>
      (arr || []).map((item: any) => ({
        ...item,
        entityId: item.entityId || 'personal',
      }))

    return {
      ...state,
      household,
      taxYear: new Date().getFullYear(),
      incomeStreams: backfillAttribution(state.incomeStreams).map((s: any) => ({
        ...s,
        isPrimary: s.isPrimary ?? false,
        isTaxable: s.isTaxable ?? true
      })),
      expenses: backfillAttribution(state.expenses),
      deductions: backfillAttribution(state.deductions),
      depreciationAssets: [],
      investments: [],
      retirementAccounts: [],
      goals: [],
      documents: [],
      bankTransactions: [],
      estimatedPayments: [],
      carryforwards: {},
    }
  },
  9: (state: any) => ({
    ...state,
    realEstate: state.realEstate ?? [],
    estatePlan: state.estatePlan ?? { trusts: [], directives: [], lifeInsurance: [] },
  }),
  10: (state: any) => ({
    ...state,
    liabilities: state.liabilities ?? [],
  }),
  11: (state: any) => ({
    ...state,
    equityCompensation: state.equityCompensation ?? [],
  }),
  12: (state: any) => ({
    ...state,
    receipts: state.receipts ?? [],
  }),
  13: (state: any) => ({
    ...state,
    receipts: (state.receipts || []).map((r: any) => ({
      ...r,
      paymentMethodId: r.paymentMethodId ?? null,
      isRecurring: r.isRecurring ?? false,
    }))
  }),
  14: (state: any) => ({
    ...state,
    intakeBatches: state.intakeBatches ?? [],
    receipts: (state.receipts || []).map((r: any) => ({
      ...r,
      batchId: r.batchId ?? null
    }))
  }),
  15: (state: any) => ({
    ...state,
    documents: state.documents ?? []
  }),
  16: (state: any) => ({
    ...state,
    documents: (state.documents || []).map((d: any) => ({
      ...d,
      batchId: d.batchId ?? null
    })),
    intakeBatches: (state.intakeBatches || []).map((b: any) => ({
      ...b,
      documentIds: b.documentIds ?? []
    }))
  }),
}

async function migrateIfNeeded(state: FortunaState): Promise<FortunaState> {
  let storedVersion = await safeGet<number>(KEYS.SCHEMA_VERSION, 0)
  if (storedVersion === 0 && state.onboardingComplete) storedVersion = 1

  let migrated = { ...state }
  for (let v = storedVersion; v < SCHEMA_VERSION; v++) {
    const fn = migrations[v]
    if (fn) {
      migrated = fn(migrated)
      console.log(`[Fortuna] Migrated schema v${v} → v${v + 1}`)
    }
  }

  if (storedVersion < SCHEMA_VERSION) {
    await safeSet(KEYS.SCHEMA_VERSION, SCHEMA_VERSION)
  }
  return migrated
}

// ===================================================================
//  UX PREFERENCES
// ===================================================================

export interface UXPreferences {
  sidebarCollapsed: boolean
  lastActiveView: string
  theme: 'dark' | 'light'
  sidebarSections: Record<string, boolean>
  lastSessionTimestamp: string
  dataVersion: number
  // Phase 1-2 UX additions
  userMode?: 'beginner' | 'standard' | 'power'
  friendlyLabels?: boolean
  [key: string]: any // forward-compatible with future prefs
}

function createDefaultUXPrefs(): UXPreferences {
  return {
    sidebarCollapsed: false,
    lastActiveView: 'dashboard',
    theme: 'dark',
    sidebarSections: {},
    lastSessionTimestamp: new Date().toISOString(),
    dataVersion: SCHEMA_VERSION,
  }
}

// ===================================================================
//  DATA TYPES — UNIFIED METAMODEL v9
// ===================================================================

// ─── Canonical Entity Type (used everywhere) ────────────────────────

export type EntityType =
  | 'personal'    // Individual taxpayer (always exists, id='personal')
  | 'sole_prop'   // Schedule C
  | 'llc'         // Single-member LLC (disregarded, treated as sole prop)
  | 'llc_scorp'   // LLC electing S-Corp treatment
  | 'scorp'       // S-Corporation
  | 'ccorp'       // C-Corporation
  | 'partnership'  // Partnership / Multi-member LLC
  | 'trust'        // Trust / Estate

export type FilingStatus = 'single' | 'married_joint' | 'married_separate' | 'head_of_household'

// ─── Universal Attribution (mixed into every financial record) ───────

/** Fields shared by all financial records for entity/person/year attribution */
export interface Attribution {
  entityId?: string     // Which entity this belongs to. Default: 'personal'
  memberId?: string     // Which household member. Default: primary filer
  taxYear?: number      // Which tax year. Default: current year
  tags?: string[]       // User-defined categorization
  sourceId?: string     // Link to import source (CSV row, bank feed, etc.)
}

// ─── Household Model (supports joint filers) ────────────────────────

export interface HouseholdMember {
  id: string            // 'primary' for main filer, 'spouse' for spouse
  name: string
  role: 'primary' | 'spouse'
  dateOfBirth?: string
  ssn?: string          // Optional, encrypted if stored
}

export interface Dependent {
  id: string
  name: string
  relationship: 'child' | 'stepchild' | 'foster' | 'sibling' | 'parent' | 'other'
  dateOfBirth: string
  monthsLived: number   // Months lived with filer (for custody situations)
  isStudent?: boolean
  isDisabled?: boolean
  unearnedIncome?: number  // Investment/passive income (for kiddie tax)
  earnedIncome?: number    // W-2/self-employment income
  age: number              // Computed from dateOfBirth or manually set
}

export interface Household {
  members: HouseholdMember[]
  dependents: Dependent[]
  filingStatus: FilingStatus
}

// ─── Profile (backward-compat, household takes precedence) ──────────

export interface FinancialProfile {
  name: string
  state: string
  filingStatus: FilingStatus
  dependents: number
  hasHealthInsurance: boolean
  age: number
}

// ─── Core Financial Records ─────────────────────────────────────────

export interface IncomeStream extends Attribution {
  id: string
  name: string
  type: 'business' | 'w2' | 'freelance' | 'investment' | 'rental' | 'passive' | 'other'
  annualAmount: number
  isActive: boolean
  monthlyBreakdown?: number[]
  notes?: string
  isPrimary?: boolean // v9 addition
  isTaxable?: boolean // v9 addition
  // W-2 specific fields
  w2?: {
    employerName?: string
    grossSalary?: number
    federalWithholding?: number
    stateWithholding?: number
    ficaWithheld?: number
    pretax401k?: number
    pretaxHealthInsurance?: number
    pretaxHSA?: number
    employerMatch401k?: number
    otherPretaxDeductions?: number
  }
  // S-Corp specific fields
  scorp?: {
    officerSalary?: number     // Reasonable salary for SE tax purposes
    distributions?: number     // Remaining taken as distributions
  }
}

export interface BusinessExpense extends Attribution {
  id: string
  category: string
  description: string
  annualAmount: number
  isDeductible: boolean
  deductionPct: number
}

export interface LegalEntity {
  id: string
  name: string
  type: EntityType
  state: string
  einNumber?: string
  formationDate?: string
  annualCost: number
  isActive: boolean
  // Enhanced fields
  ownershipPct?: number        // 0-100, your ownership percentage
  parentEntityId?: string      // For subsidiary relationships
  officerSalary?: number       // S-Corp reasonable salary
  healthInsurancePremium?: number
  retirementContrib?: number
  linkedAccountIds?: string[]  // IDs of dedicated business accounts
  notes?: string
  // QBI fields
  isSSTB?: boolean             // Specified Service Trade or Business (law, health, consulting, etc.)
  w2WagesPaid?: number         // Total W-2 wages paid by this entity (for QBI limitation)
  qualifiedPropertyUBIA?: number // Unadjusted basis of qualified property
}

export interface DeductionRecord {
  id: string
  entityId: string // Which entity is claiming this (e.g. personal, sole_prop)
  categoryId: string // e.g. supplies, travel, home_office
  amount: number
  description: string
  date: string
  status: 'planned' | 'realized' | 'rejected'
  receiptId?: string
}

export type DocumentType = 'receipt' | 'invoice' | 'tax_notice' | 'contract' | 'identity' | 'other' | 'not_applicable'

export interface DocumentRecord {
  id: string
  documentType: DocumentType
  dateAdded: string
  sourceFile: string // e.g., URL or base64 (though large base64 should be careful in LS)
  metadata: Record<string, any> // Flexible payload for specific types
  entityId?: string // Optional link to a specific entity
  goalId?: string // Optional link to a financial goal
  status: 'pending' | 'processed' | 'needs_review' | 'rejected'
  summary?: string
  batchId?: string // Link to IntakeBatch
  thumbnail?: string // low-res base64
}

// ─── Metamodel v13 Additions ──────────────────────────────────────

export interface RealEstateProperty extends Attribution {
  id: string
  address: string
  type: 'primary_residence' | 'rental' | 'commercial' | 'land' | 'other'
  purchasePrice: number
  purchaseDate: string
  currentValue: number
  outstandingMortgage: number
  annualPropertyTax: number
  annualInsurance: number
  monthlyRentalIncome?: number
  is1031Eligible?: boolean
}

export interface TrustEntity extends Attribution {
  id: string
  name: string
  type: 'revocable' | 'irrevocable' | 'charitable' | 'special_needs' | 'other'
  trustees: string[]
  beneficiaries: string[]
  assets: string[] // IDs of assets held in trust
  isGrantor: boolean
}

export interface EstateDirective {
  id: string
  type: 'will' | 'living_will' | 'power_of_attorney' | 'healthcare_proxy'
  status: 'draft' | 'signed' | 'notarized'
  lastUpdated: string
  fileUrl?: string
}

export interface LifeInsurancePolicy extends Attribution {
  id: string
  provider: string
  policyType: 'term' | 'whole' | 'universal' | 'variable'
  deathBenefit: number
  annualPremium: number
  beneficiaries: string[]
  cashValue?: number
  expirationDate?: string
}

export interface EstatePlan {
  trusts: TrustEntity[]
  directives: EstateDirective[]
  lifeInsurance: LifeInsurancePolicy[]
}

export interface Liability extends Attribution {
  id: string
  name: string
  type: 'mortgage' | 'student_loan' | 'auto_loan' | 'credit_card' | 'business_loan' | 'margin' | 'other'
  principalBalance: number
  interestRate: number
  minimumMonthlyPayment: number
  termMonths?: number
  isInterestTaxDeductible?: boolean
}

export interface EquityCompensation extends Attribution {
  id: string
  companyName: string
  grantType: 'iso' | 'nso' | 'rsu' | 'espp' | 'founder_stock'
  grantDate: string
  totalSharesGranted: number
  vestingSchedule: 'standard_4yr_1yr_cliff' | 'custom' | 'immediate'
  vestedShares: number
  unvestedShares: number
  strikePrice?: number
  currentFairMarketValue: number
  has83bElection?: boolean
  expirationDate?: string
}

export interface ReceiptItem {
  id: string
  description: string
  amount: number
  quantity: number
  inferredCategory: string
  allocatedEntityId?: string // 'personal' or specific LegalEntity.id
  confidenceScore: number    // 0-1 for AI assignment
  isBusiness?: boolean       // Explicit override flag
  status?: 'scanned' | 'processing' | 'allocated' | 'needs_review'
}

export interface ReceiptRecord extends Attribution {
  id: string
  merchantName: string
  date: string
  totalAmount: number
  taxAmount?: number
  tipAmount?: number
  items: ReceiptItem[]
  imageUrl?: string
  status: 'scanned' | 'processing' | 'allocated' | 'needs_review'
  splitStrategy?: 'itemized' | 'proportional' | 'manual'
  paymentMethodId?: string // Link to account/card
  isRecurring?: boolean   // Subscription flag
  batchId?: string        // Link to IntakeBatch
  thumbnail?: string      // low-res base64
}

export interface IntakeBatch extends Attribution {
  id: string
  name: string
  dateStarted: string
  dateCompleted?: string
  status: 'uploading' | 'processing' | 'completed' | 'failed'
  totalCount: number
  successCount: number
  errorCount: number
  receiptIds: string[]
  documentIds: string[]
  progress: number // 0-100
  defaultEntityId?: string // Override for all receipts in batch
}

// ─── Previously Orphaned Types (now persisted in FortunaState) ──────

export interface DepreciationAsset extends Attribution {
  id: string
  name: string
  category: 'equipment' | 'vehicle' | 'furniture' | 'computer' | 'building' | 'improvement' | 'other'
  purchaseDate: string
  purchasePrice: number
  method: 'straight_line' | 'macrs' | 'section_179' | 'bonus'
  usefulLifeYears: number
  businessUsePct: number       // 0-100
  salvageValue?: number
  accumulatedDepreciation?: number
  isActive: boolean
}

export interface InvestmentPosition extends Attribution {
  id: string
  symbol: string
  name: string
  type: 'stock' | 'etf' | 'mutual_fund' | 'bond' | 'crypto' | 'real_estate' | 'other'
  quantity: number
  costBasis: number
  currentValue?: number
  acquisitionDate: string
  isLongTerm?: boolean         // Computed from acquisitionDate, but cacheable
  accountType?: 'taxable' | 'traditional_ira' | 'roth_ira' | '401k' | 'hsa' | 'other'
}

export interface RetirementAccount extends Attribution {
  id: string
  name: string
  type: 'traditional_401k' | 'roth_401k' | 'solo_401k' | 'sep_ira' | 'simple_ira' | 'traditional_ira' | 'roth_ira' | 'hsa' | 'pension' | 'other'
  balance: number
  annualContribution: number
  employerMatch?: number       // Employer match amount
  maxContribution: number      // Annual limit
  isTaxDeductible: boolean
}

export interface FinancialGoal extends Attribution {
  id: string
  title: string
  type: 'tax_reduction' | 'savings' | 'retirement' | 'debt_payoff' | 'investment' | 'income_growth' | 'entity_setup' | 'other'
  targetAmount?: number
  currentAmount?: number
  targetDate?: string
  priority: 'high' | 'medium' | 'low'
  status: 'active' | 'completed' | 'paused'
  notes?: string
}

export interface EstimatedPayment extends Attribution {
  id: string
  taxYear?: number              // Tax year this payment covers
  quarter: 1 | 2 | 3 | 4
  dueDate: string
  amount: number
  paidDate?: string
  paidAmount?: number
  jurisdiction: 'federal' | string  // 'federal' or state code
}

export interface BankTransaction extends Attribution {
  id: string
  date: string
  description: string
  amount: number               // Positive = income, negative = expense
  category?: string
  isReconciled: boolean
  linkedExpenseId?: string     // Link to BusinessExpense if categorized
  linkedIncomeId?: string      // Link to IncomeStream if categorized
  accountName?: string
}

export interface Carryforwards {
  capitalLoss?: number         // Remaining capital loss carryforward
  netOperatingLoss?: number    // NOL carryforward
  charitableContributions?: number  // Excess charitable carryforward (5 years)
  foreignTaxCredit?: number
  generalBusinessCredit?: number
  passiveActivityLoss?: number
  [key: string]: number | undefined  // Forward-compatible
}

// ─── Strategy & Advisor ─────────────────────────────────────────────

export interface StrategyRecord {
  id: string
  title: string
  status: 'identified' | 'recommended' | 'in_progress' | 'implemented' | 'dismissed'
  category: 'tax' | 'entity' | 'revenue' | 'risk' | 'investment'
  estimatedImpact: number
  implementedDate?: string
  notes?: string
  entityId?: string            // Which entity this strategy applies to
}

export interface AdvisorMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ─── FortunaState: The Unified Root ─────────────────────────────────

export interface FortunaState {
  profile: FinancialProfile
  incomeStreams: IncomeStream[]
  expenses: BusinessExpense[]
  entities: LegalEntity[]
  deductions: DeductionRecord[] // Changed from Deduction to DeductionRecord
  strategies: StrategyRecord[]
  lastUpdated: string
  onboardingComplete: boolean

  household: Household
  taxYear: number
  depreciationAssets: DepreciationAsset[]
  investmentPortfolio: InvestmentPosition[]
  retirementAccounts: RetirementAccount[]
  goals: FinancialGoal[]
  documents: DocumentRecord[] // Changed from DocumentRecord (Attribution) to new DocumentRecord
  auditHistory: BankTransaction[] // Renamed from bankTransactions
  estimatedPayments: EstimatedPayment[]
  carryforwards: Carryforwards

  // v13 Additions
  realEstate: RealEstateProperty[]
  estatePlan: EstatePlan
  liabilities: Liability[]
  equityCompensation: EquityCompensation[]
  receipts: ReceiptRecord[]
  intakeBatches: IntakeBatch[]

  // Cross-view persistence
  portfolioOpportunities: any[]  // OpportunityAnalysis from PortfolioIntelligence
  portfolioTaxEvents: any[]      // TaxEvent from PortfolioIntelligence
  scenarioSnapshots: any[]       // Saved scenario comparisons from ScenarioModeler
  aiDocuments: any[]             // AI-generated documents from DocumentCenter

  // UX preferences (moved from separate storage)
  ux: {
    sidebarCollapsed: boolean
    activeView: string
    theme: 'light' | 'dark' | 'auto'
    lastSaved: string
  }
}

// ===================================================================
//  EXPORT / IMPORT FORMAT
// ===================================================================

export interface FortunaExport {
  _format: 'fortuna-engine-export'
  _version: number
  _exportedAt: string
  _appVersion: string
  state: FortunaState
  advisorHistory: AdvisorMessage[]
  uxPrefs: UXPreferences
  financialHistory?: any
}

const APP_VERSION = '10.3.0'

// ===================================================================
//  DEFAULT STATE FACTORY
// ===================================================================

export function createDefaultState(): FortunaState {
  return {
    profile: {
      name: '', state: 'IL', filingStatus: 'single',
      dependents: 0, hasHealthInsurance: true, age: 35,
    },
    household: {
      members: [{ id: 'primary', name: '', role: 'primary' }],
      dependents: [],
      filingStatus: 'single',
    },
    taxYear: new Date().getFullYear(),
    incomeStreams: [],
    expenses: [],
    entities: [],
    deductions: [],
    strategies: [],
    depreciationAssets: [],
    investmentPortfolio: [],
    retirementAccounts: [],
    goals: [],
    documents: [],
    auditHistory: [], // Renamed from bankTransactions
    estimatedPayments: [],
    carryforwards: {},

    // v13 Additions
    realEstate: [],
    estatePlan: { trusts: [], directives: [], lifeInsurance: [] },
    liabilities: [],
    equityCompensation: [],
    receipts: [],
    intakeBatches: [],

    portfolioOpportunities: [],
    portfolioTaxEvents: [],
    scenarioSnapshots: [],
    aiDocuments: [],
    ux: {
      sidebarCollapsed: false,
      activeView: 'dashboard',
      theme: 'auto',
      lastSaved: new Date().toISOString(),
    },
    lastUpdated: new Date().toISOString(),
    onboardingComplete: false,
  }
}

// ===================================================================
//  PUBLIC API
// ===================================================================

export const Storage = {
  keys: KEYS,
  schemaVersion: SCHEMA_VERSION,
  appVersion: APP_VERSION,

  getBackendName: getBackend,
  isAvailable: () => getBackend() !== 'none',

  // ---- Full State ----
  async getFullState(): Promise<FortunaState> {
    const raw = await safeGet<FortunaState>(KEYS.FULL_STATE, createDefaultState())
    return migrateIfNeeded(raw)
  },
  async saveFullState(state: FortunaState): Promise<boolean> {
    return safeSet(KEYS.FULL_STATE, state)
  },

  // ---- UX Preferences ----
  async getUXPrefs(): Promise<UXPreferences> {
    const prefs = await safeGet<UXPreferences>(KEYS.UX_PREFS, createDefaultUXPrefs())
    return { ...createDefaultUXPrefs(), ...prefs }
  },
  async saveUXPrefs(prefs: UXPreferences): Promise<boolean> {
    return safeSet(KEYS.UX_PREFS, {
      ...prefs,
      lastSessionTimestamp: new Date().toISOString(),
      dataVersion: SCHEMA_VERSION,
    })
  },

  // ---- Advisor History ----
  async getAdvisorHistory(): Promise<AdvisorMessage[]> {
    return safeGet<AdvisorMessage[]>(KEYS.ADVISOR_HISTORY, [])
  },
  async saveAdvisorHistory(messages: AdvisorMessage[]): Promise<boolean> {
    return safeSet(KEYS.ADVISOR_HISTORY, messages.slice(-50))
  },

  // ---- Financial History (snapshots) ----
  async getFinancialHistory(): Promise<any> {
    return safeGet(KEYS.FINANCIAL_HISTORY, null)
  },
  async saveFinancialHistory(history: any): Promise<boolean> {
    return safeSet(KEYS.FINANCIAL_HISTORY, history)
  },

  // ---- Export / Import ----
  async exportAll(): Promise<FortunaExport> {
    const [state, advisorHistory, uxPrefs, financialHistory] = await Promise.all([
      Storage.getFullState(),
      Storage.getAdvisorHistory(),
      Storage.getUXPrefs(),
      Storage.getFinancialHistory(),
    ])
    return {
      _format: 'fortuna-engine-export',
      _version: SCHEMA_VERSION,
      _exportedAt: new Date().toISOString(),
      _appVersion: APP_VERSION,
      state, advisorHistory, uxPrefs,
      financialHistory: financialHistory ?? undefined,
    }
  },

  async importAll(data: FortunaExport): Promise<{ success: boolean; error?: string }> {
    if (!data || data._format !== 'fortuna-engine-export') {
      return { success: false, error: 'Invalid file format. Expected a Fortuna Engine export.' }
    }
    if (!data.state?.profile) {
      return { success: false, error: 'Export file is corrupted — missing state data.' }
    }
    try {
      let state = data.state
      if (data._version && data._version < SCHEMA_VERSION) {
        await safeSet(KEYS.SCHEMA_VERSION, data._version)
        state = await migrateIfNeeded(state)
      }
      await Storage.saveFullState(state)
      if (data.advisorHistory) await Storage.saveAdvisorHistory(data.advisorHistory)
      if (data.uxPrefs) await Storage.saveUXPrefs({ ...createDefaultUXPrefs(), ...data.uxPrefs })
      if (data.financialHistory) await Storage.saveFinancialHistory(data.financialHistory)
      await safeSet(KEYS.SCHEMA_VERSION, SCHEMA_VERSION)
      return { success: true }
    } catch (e) {
      return { success: false, error: `Import failed: ${e instanceof Error ? e.message : 'unknown'}` }
    }
  },

  validateExport(json: string): { valid: boolean; data?: FortunaExport; error?: string } {
    try {
      const data = JSON.parse(json)
      if (data._format !== 'fortuna-engine-export') return { valid: false, error: 'Not a Fortuna export' }
      if (!data.state?.profile) return { valid: false, error: 'Missing profile data' }
      return { valid: true, data }
    } catch {
      return { valid: false, error: 'Invalid JSON' }
    }
  },

  // ---- Reset ----
  async clearAll(): Promise<void> {
    await Promise.all(Object.values(KEYS).map(k => rawDelete(k)))
  },

  // ---- Storage diagnostics ----
  async estimateSize(): Promise<{ bytes: number; formatted: string }> {
    let totalBytes = 0
    if (getBackend() === 'localStorage') {
      for (const key of Object.values(KEYS)) {
        const val = localStorage.getItem(key)
        if (val) totalBytes += key.length + val.length
      }
    } else {
      const state = await Storage.getFullState()
      totalBytes = JSON.stringify(state).length
    }
    const formatted = totalBytes < 1024 ? `${totalBytes} B`
      : totalBytes < 1048576 ? `${(totalBytes / 1024).toFixed(1)} KB`
      : `${(totalBytes / 1048576).toFixed(2)} MB`
    return { bytes: totalBytes, formatted }
  },
}

// ===================================================================
//  UTILITIES
// ===================================================================

export function genId(): string {
  return Math.random().toString(36).substring(2, 10)
}
