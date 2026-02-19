/**
 * FORTUNA ENGINE — Bank Feed Integration v1
 * 
 * Plaid Link integration for automated bank transaction import:
 *   - Plaid Link initialization and token exchange
 *   - Transaction sync with incremental updates
 *   - Smart categorization (IRS expense categories)
 *   - Recurring expense detection
 *   - Schedule C line auto-mapping
 *   - Business vs personal transaction classification
 *   - Cash flow tracking and projections
 *   - Vendor consolidation
 * 
 * Note: Requires Plaid API keys configured via environment/settings.
 * Falls back to manual CSV import when Plaid unavailable.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string
  plaidAccountId?: string
  institutionName: string
  accountName: string
  accountType: 'checking' | 'savings' | 'credit_card' | 'investment' | 'loan'
  mask: string                // last 4 digits
  currentBalance: number
  availableBalance?: number
  isBusinessAccount: boolean
  lastSynced?: string
  accessToken?: string        // encrypted Plaid access token
  entityId?: string           // Entity this account belongs to
}

export interface BankTransaction {
  id: string
  accountId: string
  plaidTransactionId?: string
  date: string
  description: string
  merchantName?: string
  amount: number              // positive = expense, negative = income
  category: TransactionCategory
  subcategory: string
  scheduleCLine?: string
  isBusinessExpense: boolean
  isRecurring: boolean
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
  tags: string[]
  notes: string
  reviewed: boolean           // user has confirmed categorization
  splitItems?: SplitItem[]    // for mixed business/personal
  entityId?: string           // Entity this transaction belongs to
}

export interface SplitItem {
  description: string
  amount: number
  isBusinessExpense: boolean
  scheduleCLine?: string
}

export type TransactionCategory =
  | 'income' | 'transfer'
  | 'advertising' | 'car_truck' | 'commissions' | 'contract_labor'
  | 'depreciation' | 'employee_benefits' | 'insurance' | 'interest'
  | 'legal_professional' | 'office_expense' | 'rent_lease'
  | 'repairs' | 'supplies' | 'taxes_licenses' | 'travel'
  | 'meals' | 'utilities' | 'wages' | 'other_expense'
  | 'home_office' | 'education' | 'software' | 'subscriptions'
  | 'bank_fees' | 'personal' | 'uncategorized'

// ─── Schedule C Line Mapping ────────────────────────────────────────────────

export const CATEGORY_TO_SCHEDULE_C: Record<TransactionCategory, { line: string; label: string } | null> = {
  income:            null,
  transfer:          null,
  advertising:       { line: '8',   label: 'Advertising' },
  car_truck:         { line: '9',   label: 'Car and truck expenses' },
  commissions:       { line: '10',  label: 'Commissions and fees' },
  contract_labor:    { line: '11',  label: 'Contract labor' },
  depreciation:      { line: '13',  label: 'Depreciation' },
  employee_benefits: { line: '14',  label: 'Employee benefit programs' },
  insurance:         { line: '15',  label: 'Insurance (other than health)' },
  interest:          { line: '16b', label: 'Interest (other)' },
  legal_professional:{ line: '17',  label: 'Legal and professional services' },
  office_expense:    { line: '18',  label: 'Office expense' },
  rent_lease:        { line: '20b', label: 'Rent or lease (other)' },
  repairs:           { line: '21',  label: 'Repairs and maintenance' },
  supplies:          { line: '22',  label: 'Supplies' },
  taxes_licenses:    { line: '23',  label: 'Taxes and licenses' },
  travel:            { line: '24a', label: 'Travel' },
  meals:             { line: '24b', label: 'Meals (subject to 50% limitation)' },
  utilities:         { line: '25',  label: 'Utilities' },
  wages:             { line: '26',  label: 'Wages' },
  other_expense:     { line: '27a', label: 'Other expenses' },
  home_office:       { line: '30',  label: 'Business use of home' },
  education:         { line: '27a', label: 'Other expenses (education)' },
  software:          { line: '18',  label: 'Office expense (software)' },
  subscriptions:     { line: '27a', label: 'Other expenses (subscriptions)' },
  bank_fees:         { line: '27a', label: 'Other expenses (bank fees)' },
  personal:          null,
  uncategorized:     null,
}

// ─── Auto-Categorization Rules ──────────────────────────────────────────────

interface CategoryRule {
  pattern: RegExp
  category: TransactionCategory
  isBusinessExpense: boolean
}

const CATEGORIZATION_RULES: CategoryRule[] = [
  // Advertising
  { pattern: /\b(google\s*ads|facebook\s*ads|meta\s*ads|twitter\s*ads|linkedin\s*ads|bing\s*ads|tiktok\s*ads|mailchimp|constant\s*contact|sendgrid)\b/i, category: 'advertising', isBusinessExpense: true },
  // Software/SaaS
  { pattern: /\b(adobe|microsoft\s*365|google\s*workspace|slack|zoom|notion|figma|canva|github|aws|azure|digital\s*ocean|heroku|vercel|netlify|hostinger|cloudflare|openai|anthropic)\b/i, category: 'software', isBusinessExpense: true },
  // Office supplies
  { pattern: /\b(staples|office\s*depot|amazon|best\s*buy|newegg|b&h\s*photo)\b/i, category: 'office_expense', isBusinessExpense: true },
  // Travel
  { pattern: /\b(airline|delta|united|american\s*airlines|southwest|jetblue|spirit|frontier|hotel|marriott|hilton|hyatt|airbnb|vrbo|uber|lyft|taxi|rental\s*car|hertz|avis|enterprise)\b/i, category: 'travel', isBusinessExpense: true },
  // Meals
  { pattern: /\b(restaurant|doordash|grubhub|uber\s*eats|starbucks|mcdonald|chipotle|panera|subway|pizza)\b/i, category: 'meals', isBusinessExpense: true },
  // Insurance
  { pattern: /\b(geico|state\s*farm|allstate|progressive|liberty\s*mutual|nationwide|usaa).*(?:business|commercial|liability)/i, category: 'insurance', isBusinessExpense: true },
  // Legal/Professional
  { pattern: /\b(attorney|lawyer|law\s*firm|cpa|accountant|bookkeeper|tax\s*prep|legal\s*zoom|legalshield)\b/i, category: 'legal_professional', isBusinessExpense: true },
  // Utilities
  { pattern: /\b(electric|gas\s*bill|water\s*bill|internet|comcast|att|verizon|t-?mobile|spectrum|cox)\b/i, category: 'utilities', isBusinessExpense: true },
  // Contract labor
  { pattern: /\b(fiverr|upwork|toptal|freelancer|99designs|guru\.com)\b/i, category: 'contract_labor', isBusinessExpense: true },
  // Vehicle
  { pattern: /\b(shell|chevron|exxon|bp|gas\s*station|auto\s*parts|autozone|o'reilly|napa|jiffy\s*lube|valvoline)\b/i, category: 'car_truck', isBusinessExpense: true },
  // Education
  { pattern: /\b(udemy|coursera|linkedin\s*learning|skillshare|masterclass|conference|workshop|seminar)\b/i, category: 'education', isBusinessExpense: true },
  // Subscriptions
  { pattern: /\b(subscription|monthly\s*fee|annual\s*fee|membership)\b/i, category: 'subscriptions', isBusinessExpense: true },
  // Bank fees
  { pattern: /\b(bank\s*fee|service\s*charge|overdraft|wire\s*fee|atm\s*fee|monthly\s*maintenance)\b/i, category: 'bank_fees', isBusinessExpense: true },
  // Rent
  { pattern: /\b(coworking|wework|regus|office\s*space|rent\s*payment)\b/i, category: 'rent_lease', isBusinessExpense: true },
  // Personal (not deductible)
  { pattern: /\b(grocery|walmart\s*(?!office)|target|costco|netflix|hulu|spotify|gym|fitness|clothing|apparel)\b/i, category: 'personal', isBusinessExpense: false },
  // Income patterns
  { pattern: /\b(deposit|payment\s*received|revenue|client\s*payment|invoice\s*payment|stripe|paypal.*(?:payment|deposit)|square.*deposit)\b/i, category: 'income', isBusinessExpense: false },
  // Transfers
  { pattern: /\b(transfer|xfer|ach.*(?:from|to)\s*(?:savings|checking)|zelle|venmo.*transfer)\b/i, category: 'transfer', isBusinessExpense: false },
]

export function categorizeTransaction(description: string, merchantName?: string, amount?: number): {
  category: TransactionCategory
  isBusinessExpense: boolean
  scheduleCLine?: string
  confidence: number
} {
  const text = `${description} ${merchantName || ''}`.toLowerCase()

  for (const rule of CATEGORIZATION_RULES) {
    if (rule.pattern.test(text)) {
      const mapping = CATEGORY_TO_SCHEDULE_C[rule.category]
      return {
        category: rule.category,
        isBusinessExpense: rule.isBusinessExpense,
        scheduleCLine: mapping?.line,
        confidence: 75,
      }
    }
  }

  // Income heuristic (negative amounts in bank feeds = deposits)
  if (amount !== undefined && amount < 0) {
    return { category: 'income', isBusinessExpense: false, confidence: 50 }
  }

  return { category: 'uncategorized', isBusinessExpense: false, confidence: 0 }
}

// ─── Recurring Detection ────────────────────────────────────────────────────

export function detectRecurring(transactions: BankTransaction[]): BankTransaction[] {
  // Group by merchant + similar amount
  const groups: Record<string, BankTransaction[]> = {}

  for (const tx of transactions) {
    const key = (tx.merchantName || tx.description.substring(0, 20)).toLowerCase().replace(/[^a-z]/g, '')
    if (!groups[key]) groups[key] = []
    groups[key].push(tx)
  }

  const updated = [...transactions]

  for (const [, group] of Object.entries(groups)) {
    if (group.length < 2) continue

    // Sort by date
    group.sort((a, b) => a.date.localeCompare(b.date))

    // Check for consistent intervals
    const intervals: number[] = []
    for (let i = 1; i < group.length; i++) {
      const d1 = new Date(group[i - 1].date)
      const d2 = new Date(group[i].date)
      intervals.push(Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)))
    }

    const avgInterval = intervals.reduce((s, n) => s + n, 0) / intervals.length
    const deviation = Math.max(...intervals.map(i => Math.abs(i - avgInterval)))

    let frequency: BankTransaction['recurringFrequency'] | undefined
    if (avgInterval >= 5 && avgInterval <= 10 && deviation < 3) frequency = 'weekly'
    else if (avgInterval >= 12 && avgInterval <= 18 && deviation < 4) frequency = 'biweekly'
    else if (avgInterval >= 25 && avgInterval <= 35 && deviation < 5) frequency = 'monthly'
    else if (avgInterval >= 80 && avgInterval <= 100 && deviation < 10) frequency = 'quarterly'
    else if (avgInterval >= 340 && avgInterval <= 395 && deviation < 30) frequency = 'annual'

    if (frequency) {
      for (const tx of group) {
        const idx = updated.findIndex(t => t.id === tx.id)
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], isRecurring: true, recurringFrequency: frequency }
        }
      }
    }
  }

  return updated
}

// ─── Schedule C Aggregation ─────────────────────────────────────────────────

export function aggregateScheduleC(transactions: BankTransaction[]): {
  line: string; label: string; total: number; count: number; transactions: BankTransaction[]
}[] {
  const businessTx = transactions.filter(t => t.isBusinessExpense && t.reviewed)
  const byLine: Record<string, { label: string; total: number; count: number; transactions: BankTransaction[] }> = {}

  for (const tx of businessTx) {
    const line = tx.scheduleCLine || '27a'
    const mapping = Object.values(CATEGORY_TO_SCHEDULE_C).find(m => m?.line === line)
    const label = mapping?.label || 'Other expenses'

    if (!byLine[line]) byLine[line] = { label, total: 0, count: 0, transactions: [] }
    byLine[line].total += Math.abs(tx.amount)
    byLine[line].count++
    byLine[line].transactions.push(tx)
  }

  return Object.entries(byLine)
    .map(([line, data]) => ({ line, ...data }))
    .sort((a, b) => a.line.localeCompare(b.line))
}

// ─── Cash Flow Analysis ─────────────────────────────────────────────────────

export function analyzeCashFlow(transactions: BankTransaction[], months: number = 6): {
  monthlyIncome: number[]
  monthlyExpenses: number[]
  monthlyNet: number[]
  averageMonthlyIncome: number
  averageMonthlyExpenses: number
  burnRate: number
  runwayMonths: number | null
  topExpenseCategories: { category: string; total: number; percentage: number }[]
} {
  const now = new Date()
  const monthlyIncome: number[] = Array(months).fill(0)
  const monthlyExpenses: number[] = Array(months).fill(0)
  const categoryTotals: Record<string, number> = {}

  for (const tx of transactions) {
    const txDate = new Date(tx.date)
    const monthsAgo = (now.getFullYear() - txDate.getFullYear()) * 12 + now.getMonth() - txDate.getMonth()
    
    if (monthsAgo < 0 || monthsAgo >= months) continue
    const idx = months - 1 - monthsAgo

    if (tx.amount < 0 || tx.category === 'income') {
      monthlyIncome[idx] += Math.abs(tx.amount)
    } else if (tx.category !== 'transfer') {
      monthlyExpenses[idx] += tx.amount
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount
    }
  }

  const monthlyNet = monthlyIncome.map((inc, i) => inc - monthlyExpenses[i])
  const totalExpenses = monthlyExpenses.reduce((s, n) => s + n, 0)
  const avgIncome = monthlyIncome.reduce((s, n) => s + n, 0) / months
  const avgExpenses = totalExpenses / months

  const topExpenseCategories = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      total,
      percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return {
    monthlyIncome, monthlyExpenses, monthlyNet,
    averageMonthlyIncome: Math.round(avgIncome),
    averageMonthlyExpenses: Math.round(avgExpenses),
    burnRate: Math.round(avgExpenses),
    runwayMonths: avgExpenses > avgIncome ? Math.round((avgIncome * months) / avgExpenses) : null,
    topExpenseCategories,
  }
}

// ─── Plaid Integration Helpers ──────────────────────────────────────────────

export interface PlaidConfig {
  clientId: string
  environment: 'sandbox' | 'development' | 'production'
  webhookUrl?: string
}

export function getPlaidLinkConfig(config: PlaidConfig, linkToken: string) {
  return {
    token: linkToken,
    onSuccess: (publicToken: string, metadata: any) => ({ publicToken, metadata }),
    onExit: (err: any) => ({ error: err }),
    onEvent: (eventName: string) => ({ event: eventName }),
  }
}

// Endpoint to call from backend to exchange public token
export function getPlaidExchangeEndpoint(config: PlaidConfig) {
  const baseUrl = config.environment === 'production'
    ? 'https://production.plaid.com'
    : config.environment === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com'

  return {
    createLinkToken: `${baseUrl}/link/token/create`,
    exchangeToken: `${baseUrl}/item/public_token/exchange`,
    getTransactions: `${baseUrl}/transactions/sync`,
    getAccounts: `${baseUrl}/accounts/get`,
    getBalances: `${baseUrl}/accounts/balance/get`,
  }
}

// ─── Storage ────────────────────────────────────────────────────────────────

const ACCOUNTS_KEY = 'fortuna:bank-accounts'
const TRANSACTIONS_KEY = 'fortuna:bank-transactions'

export function saveAccounts(accounts: BankAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function loadAccounts(): BankAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]') } catch { return [] }
}

export function saveTransactions(transactions: BankTransaction[]) {
  try { localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions)) } catch {
    console.warn('[BankFeed] Storage quota — keep only recent 6 months')
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const recent = transactions.filter(t => new Date(t.date) >= sixMonthsAgo)
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(recent))
  }
}

export function loadTransactions(): BankTransaction[] {
  try { return JSON.parse(localStorage.getItem(TRANSACTIONS_KEY) || '[]') } catch { return [] }
}

// ─── Manual Transaction Import ──────────────────────────────────────────────

export function importBankCSV(csvText: string): BankTransaction[] {
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].toLowerCase()
  const transactions: BankTransaction[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    if (cols.length < 3) continue

    // Detect column layout
    let date = '', description = '', amount = 0

    if (headers.includes('date')) {
      const dateIdx = headers.split(',').findIndex(h => h.trim().includes('date'))
      const descIdx = headers.split(',').findIndex(h => h.trim().match(/desc|memo|narration|payee/))
      const amtIdx = headers.split(',').findIndex(h => h.trim().match(/amount|value|sum/))
      const debitIdx = headers.split(',').findIndex(h => h.trim().includes('debit'))
      const creditIdx = headers.split(',').findIndex(h => h.trim().includes('credit'))

      date = cols[dateIdx] || cols[0]
      description = cols[descIdx >= 0 ? descIdx : 1] || ''
      
      if (amtIdx >= 0) {
        amount = parseFloat(cols[amtIdx]?.replace(/[$,]/g, '') || '0')
      } else if (debitIdx >= 0 && creditIdx >= 0) {
        const debit = parseFloat(cols[debitIdx]?.replace(/[$,]/g, '') || '0')
        const credit = parseFloat(cols[creditIdx]?.replace(/[$,]/g, '') || '0')
        amount = debit > 0 ? debit : -credit
      }
    } else {
      // Fallback: assume date, description, amount
      date = cols[0]
      description = cols[1]
      amount = parseFloat(cols[2]?.replace(/[$,]/g, '') || '0')
    }

    if (!date || isNaN(amount)) continue

    const { category, isBusinessExpense, scheduleCLine } = categorizeTransaction(description, undefined, amount)

    transactions.push({
      id: 'btx_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4) + i,
      accountId: 'manual',
      date: normalizeDate(date),
      description,
      amount,
      category,
      subcategory: '',
      scheduleCLine,
      isBusinessExpense,
      isRecurring: false,
      tags: [],
      notes: '',
      reviewed: false,
    })
  }

  return detectRecurring(transactions)
}

function normalizeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch { /* */ }
  return dateStr
}

// ─── Phase F: Polarity Adapters ──────────────────────────────────────────────
// Bank-feed: positive = expense, negative = income
// Storage:   positive = income,  negative = expense

import type { BankTransaction as StorageBankTransaction, BusinessExpense, IncomeStream } from './storage'

/** Convert bank-feed transaction → storage transaction (flip polarity) */
export function toStorageTransaction(bt: BankTransaction): StorageBankTransaction {
  return {
    id: bt.id,
    date: bt.date,
    description: bt.merchantName || bt.description,
    amount: -bt.amount,  // FLIP: bank positive(expense) → storage negative(expense)
    category: bt.category,
    isReconciled: bt.reviewed,
    linkedExpenseId: bt.isBusinessExpense ? bt.id : undefined,
    accountName: bt.accountId,
    entityId: bt.entityId || 'personal',
    memberId: 'primary',
    taxYear: new Date(bt.date).getFullYear(),
    tags: bt.tags,
  }
}

/** Convert storage transaction → bank-feed transaction (flip polarity) */
export function fromStorageTransaction(st: StorageBankTransaction): BankTransaction {
  return {
    id: st.id,
    accountId: st.accountName || '',
    date: st.date,
    description: st.description,
    amount: -st.amount,  // FLIP: storage positive(income) → bank negative(income)
    category: (st.category || 'other') as TransactionCategory,
    subcategory: '',
    isBusinessExpense: !!st.linkedExpenseId,
    isRecurring: false,
    tags: st.tags || [],
    notes: st.notes || '',
    reviewed: st.isReconciled,
    entityId: st.entityId,
  }
}

// ─── Phase G: Cross-Process Converters ───────────────────────────────────────

const SCHEDULE_C_LINE_MAP: Record<string, string> = {
  advertising: '8', car_truck: '9', commissions: '10', contract_labor: '11',
  depreciation: '13', employee_benefits: '14', insurance: '15', interest: '16',
  legal_professional: '17', office_expense: '18', rent_lease: '20b',
  repairs: '21', supplies: '22', taxes_licenses: '23', travel: '24a',
  meals: '24b', utilities: '25', other_expense: '27a', home_office: '30',
}

/** Convert business transactions → FortunaState expenses (auto-categorize) */
export function transactionsToExpenses(
  transactions: BankTransaction[],
  existingExpenseIds: Set<string> = new Set(),
): BusinessExpense[] {
  const bizTxns = transactions.filter(t => t.isBusinessExpense && t.amount > 0)

  // Aggregate by month+category for annualization
  const byCat = new Map<string, { total: number; count: number; desc: string; entityId?: string }>()
  for (const t of bizTxns) {
    if (existingExpenseIds.has(t.id)) continue
    const key = t.category
    const existing = byCat.get(key)
    if (existing) {
      existing.total += t.amount
      existing.count++
    } else {
      byCat.set(key, { total: t.amount, count: 1, desc: t.merchantName || t.description, entityId: t.entityId })
    }
  }

  // Determine date range for annualization
  const dates = bizTxns.map(t => new Date(t.date).getTime()).sort()
  const spanDays = dates.length > 1 ? (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24) : 365
  const annualizeFactor = spanDays > 30 ? 365 / spanDays : 1

  return [...byCat.entries()].map(([cat, data]) => ({
    id: `bank-exp-${cat}`,
    category: cat === 'meals' ? 'meals_entertainment' : cat === 'car_truck' ? 'auto' : cat,
    description: `${data.desc}${data.count > 1 ? ` (+${data.count - 1} more)` : ''}`,
    annualAmount: Math.round(data.total * annualizeFactor),
    isDeductible: true,
    deductionPct: cat === 'meals' ? 50 : 100,
    scheduleCLine: SCHEDULE_C_LINE_MAP[cat],
    entityId: data.entityId || 'personal',
    memberId: 'primary',
    taxYear: new Date().getFullYear(),
    tags: ['auto-categorized', 'bank-feed'],
  }))
}

/** Convert income transactions → FortunaState income streams */
export function transactionsToIncomeStreams(
  transactions: BankTransaction[],
): { id: string; name: string; type: string; annualAmount: number; entityId?: string }[] {
  const incomeTxns = transactions.filter(t => t.amount < 0) // negative = income in bank-feed
  if (incomeTxns.length === 0) return []

  // Group by merchant/source
  const bySource = new Map<string, { total: number; count: number; entityId?: string }>()
  for (const t of incomeTxns) {
    const key = t.merchantName || t.description.substring(0, 30)
    const existing = bySource.get(key)
    if (existing) {
      existing.total += Math.abs(t.amount)
      existing.count++
    } else {
      bySource.set(key, { total: Math.abs(t.amount), count: 1, entityId: t.entityId })
    }
  }

  const dates = incomeTxns.map(t => new Date(t.date).getTime()).sort()
  const spanDays = dates.length > 1 ? (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24) : 365
  const annualizeFactor = spanDays > 30 ? 365 / spanDays : 1

  return [...bySource.entries()]
    .filter(([, data]) => data.total > 500)
    .map(([source, data]) => ({
      id: `bank-income-${source.replace(/\s/g, '-').substring(0, 20)}`,
      name: source,
      type: 'business',
      annualAmount: Math.round(data.total * annualizeFactor),
      entityId: data.entityId,
    }))
}

/** Get transactions filtered by entity */
export function getTransactionsForEntity(transactions: BankTransaction[], entityId: string): BankTransaction[] {
  return transactions.filter(t => (t.entityId || 'personal') === entityId)
}

