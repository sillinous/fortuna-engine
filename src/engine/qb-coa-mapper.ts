/**
 * Fortuna Engine — QuickBooks Chart of Accounts Mapper
 * Bridges QuickBooks account types/detail types to Fortuna's tax model.
 *
 * This is the critical data layer that translates between:
 *   QB World: Accounts, Classes, Customer/Vendor, TRNS types
 *   Fortuna World: Income streams, expenses, deductions, entities, investments
 *
 * QB Account Types (IIF):
 *   BANK, AR, AP, CCARD, OASSET, OFIXASSET, OCASSET,
 *   OLIAB, LTLIAB, EQUITY, INC, COGS, EXP, EXEXP, NONPOSTACCT
 *
 * QB Account Types (QBO Online):
 *   Bank, Accounts Receivable, Other Current Asset, Fixed Asset, Other Asset,
 *   Accounts Payable, Credit Card, Other Current Liability, Long Term Liability,
 *   Equity, Income, Cost of Goods Sold, Expense, Other Income, Other Expense
 *
 * @module qb-coa-mapper
 */

import type { IIFAccount, IIFTransaction, IIFVendor } from './qb-iif-parser'
import type { FortunaState, IncomeStream, BusinessExpense, LegalEntity, BankTransaction } from './storage'

// ─── QB Account Type Constants ────────────────────────────────────────────

/** IIF account type codes (QuickBooks Desktop) */
export const QB_DESKTOP_ACCOUNT_TYPES = {
  BANK: 'BANK',
  AR: 'AR',                   // Accounts Receivable
  AP: 'AP',                   // Accounts Payable
  CCARD: 'CCARD',             // Credit Card
  OASSET: 'OASSET',           // Other Asset
  OFIXASSET: 'OFIXASSET',     // Other Fixed Asset (sometimes in IIF)
  FIXASSET: 'FIXASSET',       // Fixed Asset
  OCASSET: 'OCASSET',         // Other Current Asset
  OLIAB: 'OLIAB',             // Other Current Liability
  LTLIAB: 'LTLIAB',           // Long-Term Liability
  EQUITY: 'EQUITY',           // Equity
  INC: 'INC',                 // Income
  COGS: 'COGS',               // Cost of Goods Sold
  EXP: 'EXP',                 // Expense
  EXEXP: 'EXEXP',             // Other Expense (Extraordinary)
  NONPOSTACCT: 'NONPOSTACCT', // Non-posting (estimates, purchase orders)
} as const

/** QBO Online account types */
export const QB_ONLINE_ACCOUNT_TYPES = {
  BANK: 'Bank',
  AR: 'Accounts Receivable',
  OTHER_CURRENT_ASSET: 'Other Current Asset',
  FIXED_ASSET: 'Fixed Asset',
  OTHER_ASSET: 'Other Asset',
  AP: 'Accounts Payable',
  CREDIT_CARD: 'Credit Card',
  OTHER_CURRENT_LIABILITY: 'Other Current Liability',
  LONG_TERM_LIABILITY: 'Long Term Liability',
  EQUITY: 'Equity',
  INCOME: 'Income',
  COGS: 'Cost of Goods Sold',
  EXPENSE: 'Expense',
  OTHER_INCOME: 'Other Income',
  OTHER_EXPENSE: 'Other Expense',
} as const

// ─── Fortuna Tax Category Mapping ─────────────────────────────────────────

export type FortunaTaxCategory =
  | 'business_income'       // Schedule C / 1120-S / 1065 income
  | 'business_expense'      // Schedule C / business expenses
  | 'cogs'                  // Cost of goods sold
  | 'employment_income'     // W-2 wages
  | 'investment_income'     // Schedule D / qualified dividends
  | 'rental_income'         // Schedule E rental
  | 'rental_expense'        // Schedule E expenses
  | 'interest_income'       // 1099-INT
  | 'dividend_income'       // 1099-DIV
  | 'capital_gains'         // Schedule D
  | 'other_income'          // Line 8 / other
  | 'itemized_deduction'    // Schedule A
  | 'self_employment_tax'   // Schedule SE
  | 'depreciation'          // Form 4562
  | 'payroll'               // W-2s, 941, payroll taxes
  | 'retirement_contribution' // 401k, IRA, SEP
  | 'health_insurance'      // SE health insurance deduction
  | 'home_office'           // Form 8829
  | 'vehicle_expense'       // Actual method or standard mileage
  | 'asset'                 // Balance sheet — not P&L
  | 'liability'             // Balance sheet — not P&L
  | 'equity'                // Balance sheet — not P&L
  | 'transfer'              // Internal transfers — no tax impact
  | 'tax_payment'           // Estimated tax payments
  | 'non_deductible'        // Personal / non-deductible
  | 'uncategorized'

export interface AccountMapping {
  qbAccountType: string
  qbAccountName: string
  fortunaCategory: FortunaTaxCategory
  scheduleRef: string       // e.g., "Schedule C Line 1", "1040 Line 12"
  entityRelevance: ('sole_prop' | 's_corp' | 'c_corp' | 'partnership' | 'llc' | 'trust')[]
  isDeductible: boolean
  isAboveTheLine: boolean   // Above-the-line deduction (reduces AGI)
  notes?: string
}

// ─── Account Name → Tax Category Rules ────────────────────────────────────

/** Pattern-based rules for intelligent account categorization */
const ACCOUNT_NAME_PATTERNS: { pattern: RegExp; category: FortunaTaxCategory; schedule: string }[] = [
  // Income patterns
  { pattern: /sales|revenue|service income|consulting|fees earned|professional fees/i, category: 'business_income', schedule: 'Schedule C Line 1' },
  { pattern: /rental income|rent received|tenant/i, category: 'rental_income', schedule: 'Schedule E Line 3' },
  { pattern: /interest income|interest earned|savings interest/i, category: 'interest_income', schedule: '1040 Schedule B' },
  { pattern: /dividend/i, category: 'dividend_income', schedule: '1040 Schedule B' },
  { pattern: /capital gain|stock sale|investment gain/i, category: 'capital_gains', schedule: 'Schedule D' },
  { pattern: /wage|salary|payroll income|w-?2/i, category: 'employment_income', schedule: '1040 Line 1a' },
  { pattern: /other income|misc income|miscellaneous/i, category: 'other_income', schedule: '1040 Line 8' },

  // COGS patterns
  { pattern: /cost of (goods|sales)|cogs|materials|inventory|purchases/i, category: 'cogs', schedule: 'Schedule C Line 4' },
  { pattern: /freight|shipping cost|delivery/i, category: 'cogs', schedule: 'Schedule C Line 4' },

  // Business expense patterns
  { pattern: /advertis|marketing|promotion/i, category: 'business_expense', schedule: 'Schedule C Line 8' },
  { pattern: /auto|vehicle|car|mileage|gas|fuel/i, category: 'vehicle_expense', schedule: 'Schedule C Line 9' },
  { pattern: /commission/i, category: 'business_expense', schedule: 'Schedule C Line 10' },
  { pattern: /depletion/i, category: 'business_expense', schedule: 'Schedule C Line 12' },
  { pattern: /depreciat/i, category: 'depreciation', schedule: 'Schedule C Line 13 / Form 4562' },
  { pattern: /employee benefit|health insurance|medical/i, category: 'health_insurance', schedule: 'Schedule C Line 14' },
  { pattern: /insurance(?!.*health)|liability insurance|e&o|workers comp/i, category: 'business_expense', schedule: 'Schedule C Line 15' },
  { pattern: /interest(?!.*income)|loan interest|mortgage interest/i, category: 'business_expense', schedule: 'Schedule C Line 16' },
  { pattern: /legal|attorney|professional fee|accounting fee|cpa|bookkeep/i, category: 'business_expense', schedule: 'Schedule C Line 17' },
  { pattern: /office (supplies|expense)|supplies|postage|printing/i, category: 'business_expense', schedule: 'Schedule C Line 18' },
  { pattern: /pension|profit.?sharing|401.?k|sep|simple|retirement/i, category: 'retirement_contribution', schedule: 'Schedule C Line 19' },
  { pattern: /rent|lease(?!.*vehicle)/i, category: 'business_expense', schedule: 'Schedule C Line 20' },
  { pattern: /repair|maintenance/i, category: 'business_expense', schedule: 'Schedule C Line 21' },
  { pattern: /tax(?!.*payment)|license|permit|filing fee/i, category: 'business_expense', schedule: 'Schedule C Line 23' },
  { pattern: /travel|lodging|hotel|airfare|flight/i, category: 'business_expense', schedule: 'Schedule C Line 24a' },
  { pattern: /meal|dining|restaurant/i, category: 'business_expense', schedule: 'Schedule C Line 24b (50%)' },
  { pattern: /utilit|electric|water|gas.*bill|internet|phone|telecom/i, category: 'business_expense', schedule: 'Schedule C Line 25' },
  { pattern: /wage|salary|payroll|compensation|officer salary/i, category: 'payroll', schedule: 'Schedule C Line 26' },
  { pattern: /home office|business use of home/i, category: 'home_office', schedule: 'Form 8829' },
  { pattern: /contract(or|ed)|subcontract|1099/i, category: 'business_expense', schedule: 'Schedule C Line 11' },
  { pattern: /software|subscript|saas|cloud|hosting/i, category: 'business_expense', schedule: 'Schedule C Line 27' },
  { pattern: /education|training|seminar|conference/i, category: 'business_expense', schedule: 'Schedule C Line 27' },
  { pattern: /bank (fee|charge|service)|merchant fee|processing fee/i, category: 'business_expense', schedule: 'Schedule C Line 27' },
  { pattern: /dues|membership/i, category: 'business_expense', schedule: 'Schedule C Line 27' },

  // Rental expense patterns
  { pattern: /property management|hoa|association/i, category: 'rental_expense', schedule: 'Schedule E Line 6' },
  { pattern: /property tax/i, category: 'rental_expense', schedule: 'Schedule E Line 16' },
  { pattern: /rental repair|tenant/i, category: 'rental_expense', schedule: 'Schedule E Line 14' },
  { pattern: /mortgage(?!.*rate)/i, category: 'rental_expense', schedule: 'Schedule E Line 12' },

  // Itemized deduction patterns
  { pattern: /charit|donat|contrib/i, category: 'itemized_deduction', schedule: 'Schedule A Line 12' },
  { pattern: /state.*(income|tax)|salt/i, category: 'itemized_deduction', schedule: 'Schedule A Line 5a' },
  { pattern: /medical.*expense|healthcare/i, category: 'itemized_deduction', schedule: 'Schedule A Line 1' },

  // Tax payment patterns
  { pattern: /estimated tax|tax payment|federal tax|state tax.*pay/i, category: 'tax_payment', schedule: '1040-ES / State estimated' },

  // Non-deductible
  { pattern: /personal|draw|distribution|owner.*(draw|dist)/i, category: 'non_deductible', schedule: 'N/A (not deductible)' },
  { pattern: /entertainment/i, category: 'non_deductible', schedule: 'N/A (not deductible post-TCJA)' },

  // Balance sheet
  { pattern: /checking|savings|money market|petty cash/i, category: 'asset', schedule: 'Balance Sheet' },
  { pattern: /accounts receivable|a\/?r/i, category: 'asset', schedule: 'Balance Sheet' },
  { pattern: /accounts payable|a\/?p/i, category: 'liability', schedule: 'Balance Sheet' },
  { pattern: /credit card|visa|mastercard|amex/i, category: 'liability', schedule: 'Balance Sheet' },
  { pattern: /loan|note payable|line of credit/i, category: 'liability', schedule: 'Balance Sheet' },
  { pattern: /equipment|furniture|computer|machinery/i, category: 'asset', schedule: 'Form 4562 (depreciable)' },
  { pattern: /building|land|real property/i, category: 'asset', schedule: 'Form 4562 (depreciable)' },
  { pattern: /accumulated deprec/i, category: 'asset', schedule: 'Form 4562' },
  { pattern: /equity|retained earnings|capital|opening balance/i, category: 'equity', schedule: 'Balance Sheet' },
]

// ─── QB Account Type → Base Category ──────────────────────────────────────

function baseCategory(qbType: string): FortunaTaxCategory {
  const upper = qbType.toUpperCase().replace(/\s+/g, '')
  switch (upper) {
    case 'BANK': case 'AR': case 'OCASSET': case 'OASSET':
    case 'FIXASSET': case 'OFIXASSET': case 'FIXEDASSET':
    case 'OTHERCURRENTASSET': case 'OTHERASSET':
      return 'asset'
    case 'AP': case 'CCARD': case 'CREDITCARD':
    case 'OLIAB': case 'LTLIAB': case 'OTHERCURRENTLIABILITY':
    case 'LONGTERMLIABILITY':
      return 'liability'
    case 'EQUITY':
      return 'equity'
    case 'INC': case 'INCOME': case 'OTHERINCOME':
      return 'business_income'
    case 'COGS': case 'COSTOFGOODSSOLD':
      return 'cogs'
    case 'EXP': case 'EXPENSE':
      return 'business_expense'
    case 'EXEXP': case 'OTHEREXPENSE':
      return 'business_expense'
    case 'NONPOSTACCT':
      return 'uncategorized'
    default:
      return 'uncategorized'
  }
}

// ─── Smart Mapper ─────────────────────────────────────────────────────────

/**
 * Map a QB account to Fortuna tax category using type + name intelligence.
 * Uses QB account type as the base, then refines using name pattern matching.
 */
export function mapAccount(account: IIFAccount): AccountMapping {
  // Start with base category from account type
  let category = baseCategory(account.accountType)
  let schedule = 'Uncategorized'
  let isDeductible = false
  let isAboveTheLine = false
  const entityRelevance: AccountMapping['entityRelevance'] = ['sole_prop', 's_corp', 'c_corp', 'partnership', 'llc']

  // Refine using name patterns (only for P&L accounts)
  if (['business_income', 'business_expense', 'cogs', 'uncategorized'].includes(category) ||
      account.accountType === 'INC' || account.accountType === 'EXP' ||
      account.accountType === 'COGS' || account.accountType === 'EXEXP') {
    for (const rule of ACCOUNT_NAME_PATTERNS) {
      if (rule.pattern.test(account.name)) {
        category = rule.category
        schedule = rule.schedule
        break
      }
    }
  }

  // Balance sheet items can also be refined
  if (['asset', 'liability', 'equity'].includes(category)) {
    for (const rule of ACCOUNT_NAME_PATTERNS) {
      if (rule.pattern.test(account.name) && !['asset', 'liability', 'equity'].includes(rule.category)) {
        // Don't override balance sheet with P&L category unless it's clearly wrong
        schedule = rule.schedule
        break
      }
    }
  }

  // Use tax line mapping if provided by QB
  if (account.taxLine) {
    schedule = account.taxLine
  }

  // Determine deductibility
  isDeductible = [
    'business_expense', 'cogs', 'depreciation', 'home_office',
    'vehicle_expense', 'health_insurance', 'retirement_contribution',
    'rental_expense', 'payroll', 'itemized_deduction',
  ].includes(category)

  // Above-the-line deductions
  isAboveTheLine = [
    'business_expense', 'cogs', 'depreciation', 'home_office',
    'vehicle_expense', 'health_insurance', 'retirement_contribution',
    'rental_expense', 'payroll', 'self_employment_tax',
  ].includes(category)

  return {
    qbAccountType: account.accountType,
    qbAccountName: account.name,
    fortunaCategory: category,
    scheduleRef: schedule,
    entityRelevance,
    isDeductible,
    isAboveTheLine,
    notes: account.description,
  }
}

/**
 * Map all accounts from an IIF parse, building a complete mapping table.
 */
export function mapAllAccounts(accounts: IIFAccount[]): Map<string, AccountMapping> {
  const mappings = new Map<string, AccountMapping>()
  for (const account of accounts) {
    mappings.set(account.name, mapAccount(account))
  }
  return mappings
}

// ─── Transaction → Fortuna Transforms ─────────────────────────────────────

/**
 * Convert IIF transactions to Fortuna income streams.
 * Groups transactions by account, aggregates amounts by category.
 */
export function transactionsToIncomeStreams(
  transactions: IIFTransaction[],
  accountMap: Map<string, AccountMapping>,
): Partial<IncomeStream>[] {
  const streams: Map<string, { total: number; count: number; mapping: AccountMapping }> = new Map()

  for (const txn of transactions) {
    // Process all lines (header + splits)
    const allLines = [txn.header, ...txn.splits]
    for (const line of allLines) {
      const mapping = accountMap.get(line.account)
      if (!mapping) continue

      // Only income categories
      if (['business_income', 'rental_income', 'interest_income',
           'dividend_income', 'capital_gains', 'other_income',
           'employment_income', 'investment_income'].includes(mapping.fortunaCategory)) {
        const key = `${mapping.fortunaCategory}:${line.account}`
        const existing = streams.get(key) || { total: 0, count: 0, mapping }
        existing.total += Math.abs(line.amount) // Income is typically negative in SPL
        existing.count++
        streams.set(key, existing)
      }
    }
  }

  return Array.from(streams.entries()).map(([key, data]) => {
    const [, accountName] = key.split(':')
    const type = mapCategoryToFortunaIncomeType(data.mapping.fortunaCategory)
    return {
      name: accountName || 'Imported Income',
      type,
      annualAmount: Math.round(data.total * 100) / 100,
      isActive: true,
      notes: `QuickBooks Import (${data.count} transactions)`,
    }
  })
}

/**
 * Convert IIF transactions to Fortuna expenses.
 */
export function transactionsToExpenses(
  transactions: IIFTransaction[],
  accountMap: Map<string, AccountMapping>,
): Partial<BusinessExpense>[] {
  const expenses: Map<string, { total: number; count: number; mapping: AccountMapping }> = new Map()

  for (const txn of transactions) {
    const allLines = [txn.header, ...txn.splits]
    for (const line of allLines) {
      const mapping = accountMap.get(line.account)
      if (!mapping) continue

      if (['business_expense', 'cogs', 'depreciation', 'home_office',
           'vehicle_expense', 'health_insurance', 'payroll',
           'rental_expense', 'retirement_contribution'].includes(mapping.fortunaCategory)) {
        const key = `${mapping.fortunaCategory}:${line.account}`
        const existing = expenses.get(key) || { total: 0, count: 0, mapping }
        existing.total += Math.abs(line.amount)
        existing.count++
        expenses.set(key, existing)
      }
    }
  }

  return Array.from(expenses.entries()).map(([key, data]) => {
    const [, accountName] = key.split(':')
    return {
      category: mapCategoryToExpenseCategory(data.mapping.fortunaCategory),
      description: `${accountName} (${data.count} transactions from QuickBooks)`,
      annualAmount: Math.round(data.total * 100) / 100,
      isDeductible: data.mapping.isDeductible,
      deductionPct: data.mapping.isDeductible ? 100 : 0,
    }
  })
}

/**
 * Extract vendor 1099 relationships from QB vendor list.
 */
export function extract1099Vendors(vendors: IIFVendor[]): {
  name: string; taxId?: string; total?: number
}[] {
  return vendors
    .filter(v => v.print1099)
    .map(v => ({
      name: v.name,
      taxId: v.taxId,
      total: v.balance,
    }))
}

/**
 * Build Fortuna entity from QB class + account structure.
 * QB Classes often represent business segments/entities.
 */
export function classesToEntities(
  classes: { name: string }[],
  transactions: IIFTransaction[],
): Partial<LegalEntity>[] {
  const entityMap: Map<string, { income: number; expenses: number; txnCount: number }> = new Map()

  // Group transaction amounts by class
  for (const txn of transactions) {
    const allLines = [txn.header, ...txn.splits]
    for (const line of allLines) {
      if (!line.class) continue
      const existing = entityMap.get(line.class) || { income: 0, expenses: 0, txnCount: 0 }
      if (line.amount > 0) existing.income += line.amount
      else existing.expenses += Math.abs(line.amount)
      existing.txnCount++
      entityMap.set(line.class, existing)
    }
  }

  return Array.from(entityMap.entries()).map(([className, data]) => ({
    name: className,
    type: 'sole_prop' as LegalEntity['type'], // Default — user can reclassify
    state: '',
    annualCost: 0,
    isActive: true,
    notes: `QB Import: $${Math.round(data.income).toLocaleString()} income, $${Math.round(data.expenses).toLocaleString()} expenses (${data.txnCount} txns)`,
  }))
}

// ─── Category Mapping Helpers ─────────────────────────────────────────────

function mapCategoryToFortunaIncomeType(category: FortunaTaxCategory): IncomeStream['type'] {
  switch (category) {
    case 'business_income': return 'business'
    case 'employment_income': return 'w2'
    case 'rental_income': return 'rental'
    case 'interest_income': return 'investment'
    case 'dividend_income': return 'investment'
    case 'capital_gains': return 'investment'
    case 'investment_income': return 'investment'
    case 'other_income': return 'other'
    default: return 'other'
  }
}

function mapCategoryToExpenseCategory(category: FortunaTaxCategory): string {
  switch (category) {
    case 'business_expense': return 'business'
    case 'cogs': return 'cogs'
    case 'depreciation': return 'depreciation'
    case 'home_office': return 'home_office'
    case 'vehicle_expense': return 'vehicle'
    case 'health_insurance': return 'insurance'
    case 'payroll': return 'payroll'
    case 'rental_expense': return 'rental'
    case 'retirement_contribution': return 'retirement'
    default: return 'other'
  }
}

// ─── QB → Fortuna State Merge ─────────────────────────────────────────────

/**
 * Convert IIF bank transactions to Fortuna BankTransaction records.
 */
export function transactionsToBankTransactions(
  transactions: IIFTransaction[],
  accountMap: Map<string, AccountMapping>,
): Partial<BankTransaction>[] {
  return transactions.map(txn => ({
    date: txn.header.date,
    description: `${txn.header.trnsType}: ${txn.header.name || txn.header.memo || txn.header.account}`,
    amount: txn.header.amount,
    category: accountMap.get(txn.header.account)?.fortunaCategory || 'uncategorized',
    isReconciled: txn.balanced,
    accountName: txn.header.account,
  }))
}

export interface QBImportSummary {
  accountsMapped: number
  incomeStreamsCreated: number
  expensesCreated: number
  entitiesDetected: number
  vendors1099: number
  bankTransactionsImported: number
  unmappedAccounts: string[]
  taxImpact: {
    estimatedGrossIncome: number
    estimatedDeductions: number
    estimatedTaxableIncome: number
  }
  warnings: string[]
}

/**
 * Full import: Parse IIF, map accounts, generate Fortuna state patch.
 * Returns a partial state that can be merged into existing FortunaState.
 */
export function generateFortunaStatePatch(
  accounts: IIFAccount[],
  transactions: IIFTransaction[],
  vendors: IIFVendor[],
  classes: { name: string }[],
): {
  patch: Partial<FortunaState>
  summary: QBImportSummary
} {
  const accountMap = mapAllAccounts(accounts)
  const incomeStreams = transactionsToIncomeStreams(transactions, accountMap)
  const expenses = transactionsToExpenses(transactions, accountMap)
  const entities = classesToEntities(classes, transactions)
  const vendors1099 = extract1099Vendors(vendors)
  const bankTxns = transactionsToBankTransactions(transactions, accountMap)

  const unmapped = accounts
    .filter(a => {
      const m = accountMap.get(a.name)
      return m && m.fortunaCategory === 'uncategorized'
    })
    .map(a => a.name)

  const totalIncome = incomeStreams.reduce((s, i) => s + (i.annualAmount || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + (e.annualAmount || 0), 0)

  const warnings: string[] = []
  if (unmapped.length > 0) {
    warnings.push(`${unmapped.length} accounts could not be auto-categorized — review in Account Mapping`)
  }
  if (transactions.some(t => !t.balanced)) {
    warnings.push(`${transactions.filter(t => !t.balanced).length} transactions are out of balance`)
  }
  if (vendors1099.length > 0) {
    warnings.push(`${vendors1099.length} vendors flagged for 1099 reporting`)
  }

  return {
    patch: {
      incomeStreams: incomeStreams as IncomeStream[],
      expenses: expenses as BusinessExpense[],
      entities: entities as LegalEntity[],
      bankTransactions: bankTxns as BankTransaction[],
    },
    summary: {
      accountsMapped: accountMap.size,
      incomeStreamsCreated: incomeStreams.length,
      expensesCreated: expenses.length,
      entitiesDetected: entities.length,
      vendors1099: vendors1099.length,
      bankTransactionsImported: bankTxns.length,
      unmappedAccounts: unmapped,
      taxImpact: {
        estimatedGrossIncome: Math.round(totalIncome * 100) / 100,
        estimatedDeductions: Math.round(totalExpenses * 100) / 100,
        estimatedTaxableIncome: Math.round((totalIncome - totalExpenses) * 100) / 100,
      },
      warnings,
    },
  }
}

// ─── IIF Transaction Type Reference ───────────────────────────────────────

export const TRNS_TYPE_DESCRIPTIONS: Record<string, string> = {
  'CHECK': 'Check — Payment from bank account',
  'DEPOSIT': 'Deposit — Funds received into bank account',
  'INVOICE': 'Invoice — Customer billing (A/R)',
  'BILL': 'Bill — Vendor invoice (A/P)',
  'BILL REFUND': 'Bill Refund — Vendor credit',
  'CREDIT MEMO': 'Credit Memo — Customer credit',
  'PAYMENT': 'Payment — Customer payment received (A/R)',
  'BILL PMT': 'Bill Payment — Payment to vendor (A/P)',
  'CASH SALE': 'Cash Sale / Sales Receipt — Immediate payment',
  'GENERAL JOURNAL': 'General Journal Entry — Manual adjustment',
  'TRANSFER': 'Transfer — Funds moved between accounts',
  'CREDIT CARD': 'Credit Card Charge — CC purchase',
  'CREDIT CARD REFUND': 'Credit Card Refund — CC return',
  'PAYCHECK': 'Paycheck — Employee payroll',
  'SALES TAX PAYMENT': 'Sales Tax Payment — Remit to state',
  'ESTIMATE': 'Estimate — Non-posting quote',
  'PURCHASE ORDER': 'Purchase Order — Non-posting order',
}

/** Map QB transaction type to primary Fortuna flow */
export function trnsTypeToFlow(trnsType: string): 'income' | 'expense' | 'transfer' | 'other' {
  const upper = trnsType.toUpperCase()
  switch (upper) {
    case 'DEPOSIT': case 'INVOICE': case 'CASH SALE': case 'PAYMENT':
    case 'CREDIT CARD REFUND': case 'BILL REFUND':
      return 'income'
    case 'CHECK': case 'BILL': case 'BILL PMT': case 'CREDIT CARD':
    case 'PAYCHECK': case 'SALES TAX PAYMENT':
      return 'expense'
    case 'TRANSFER':
      return 'transfer'
    default:
      return 'other'
  }
}
