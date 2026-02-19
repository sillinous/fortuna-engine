/**
 * Fortuna Engine — QuickBooks IIF Exporter
 * Export Fortuna state data back to IIF format for QuickBooks Desktop import.
 *
 * Generates:
 *   - Chart of Accounts from Fortuna income/expense/entity categories
 *   - General Journal entries from income streams and expenses
 *   - Vendor list from contractor/1099 data
 *   - Class list from entities
 *
 * The exported IIF can be imported via:
 *   QB Desktop: File → Utilities → Import → IIF Files
 *
 * @module qb-iif-exporter
 */

import type { FortunaState } from './storage'
import { generateIIF, type IIFAccount, type IIFTransaction, type IIFVendor, type IIFClass, type IIFTransactionLine } from './qb-iif-parser'

// ─── Fortuna → QB Account Type Mapping ────────────────────────────────────

function incomeTypeToQBAccount(type: string): { name: string; qbType: string } {
  switch (type) {
    case 'salary': case 'wages': return { name: 'Wages & Salary', qbType: 'INC' }
    case 'self_employment': return { name: 'Service Income', qbType: 'INC' }
    case 'business': return { name: 'Business Revenue', qbType: 'INC' }
    case 'rental': return { name: 'Rental Income', qbType: 'INC' }
    case 'interest': return { name: 'Interest Income', qbType: 'INC' }
    case 'dividend': return { name: 'Dividend Income', qbType: 'INC' }
    case 'capital_gains': return { name: 'Capital Gains', qbType: 'INC' }
    case 'investment': return { name: 'Investment Income', qbType: 'INC' }
    case 'freelance': return { name: 'Freelance Income', qbType: 'INC' }
    case 'consulting': return { name: 'Consulting Fees', qbType: 'INC' }
    default: return { name: 'Other Income', qbType: 'INC' }
  }
}

function expenseCategoryToQBAccount(category: string): { name: string; qbType: string } {
  switch (category) {
    case 'advertising': return { name: 'Advertising & Marketing', qbType: 'EXP' }
    case 'auto': case 'vehicle': return { name: 'Auto & Vehicle', qbType: 'EXP' }
    case 'bank_fees': return { name: 'Bank Charges & Fees', qbType: 'EXP' }
    case 'business': return { name: 'Business Expenses', qbType: 'EXP' }
    case 'cogs': return { name: 'Cost of Goods Sold', qbType: 'COGS' }
    case 'contract_labor': return { name: 'Contract Labor', qbType: 'EXP' }
    case 'depreciation': return { name: 'Depreciation Expense', qbType: 'EXP' }
    case 'dues': return { name: 'Dues & Subscriptions', qbType: 'EXP' }
    case 'education': return { name: 'Education & Training', qbType: 'EXP' }
    case 'home_office': return { name: 'Home Office Expense', qbType: 'EXP' }
    case 'insurance': return { name: 'Insurance', qbType: 'EXP' }
    case 'interest': return { name: 'Interest Expense', qbType: 'EXP' }
    case 'legal': return { name: 'Legal & Professional', qbType: 'EXP' }
    case 'meals': return { name: 'Meals & Entertainment', qbType: 'EXP' }
    case 'office_supplies': return { name: 'Office Supplies', qbType: 'EXP' }
    case 'payroll': return { name: 'Payroll Expenses', qbType: 'EXP' }
    case 'rent': return { name: 'Rent or Lease', qbType: 'EXP' }
    case 'rental': return { name: 'Rental Property Expenses', qbType: 'EXP' }
    case 'repairs': return { name: 'Repairs & Maintenance', qbType: 'EXP' }
    case 'retirement': return { name: 'Retirement Plans', qbType: 'EXP' }
    case 'software': return { name: 'Software & Technology', qbType: 'EXP' }
    case 'taxes': return { name: 'Taxes & Licenses', qbType: 'EXP' }
    case 'travel': return { name: 'Travel', qbType: 'EXP' }
    case 'utilities': return { name: 'Utilities', qbType: 'EXP' }
    default: return { name: 'Other Expenses', qbType: 'EXP' }
  }
}

// ─── Export Functions ──────────────────────────────────────────────────────

/**
 * Generate Chart of Accounts IIF from Fortuna state.
 */
export function exportChartOfAccounts(state: FortunaState): IIFAccount[] {
  const accounts: IIFAccount[] = []
  const seen = new Set<string>()

  // Standard accounts
  const standard: { name: string; type: string; desc: string }[] = [
    { name: 'Checking', type: 'BANK', desc: 'Primary checking account' },
    { name: 'Savings', type: 'BANK', desc: 'Savings account' },
    { name: 'Accounts Receivable', type: 'AR', desc: 'Outstanding invoices' },
    { name: 'Accounts Payable', type: 'AP', desc: 'Outstanding bills' },
    { name: 'Owner\'s Equity', type: 'EQUITY', desc: 'Owner investment' },
    { name: 'Retained Earnings', type: 'EQUITY', desc: 'Accumulated profits' },
    { name: 'Owner\'s Draw', type: 'EQUITY', desc: 'Owner distributions' },
  ]

  for (const s of standard) {
    accounts.push({ name: s.name, accountType: s.type, description: s.desc, raw: {} })
    seen.add(s.name)
  }

  // Income accounts from income streams
  for (const income of (state.incomeStreams || [])) {
    const { name, qbType } = incomeTypeToQBAccount(income.type)
    const acctName = income.name || name
    if (!seen.has(acctName)) {
      accounts.push({ name: acctName, accountType: qbType, description: `Income: ${income.type}`, raw: {} })
      seen.add(acctName)
    }
  }

  // Expense accounts
  for (const expense of (state.expenses || [])) {
    const { name, qbType } = expenseCategoryToQBAccount(expense.category || 'other')
    const acctName = expense.description || name
    if (!seen.has(acctName)) {
      accounts.push({ name: acctName, accountType: qbType, description: `Expense: ${expense.category}`, raw: {} })
      seen.add(acctName)
    }
  }

  return accounts
}

/**
 * Generate journal entry transactions from Fortuna state.
 * Creates GENERAL JOURNAL entries that QuickBooks can import.
 */
export function exportTransactions(state: FortunaState, taxYear?: number): IIFTransaction[] {
  const year = taxYear || state.taxYear || new Date().getFullYear()
  const transactions: IIFTransaction[] = []

  // Income streams → deposits
  for (const income of (state.incomeStreams || [])) {
    const { name } = incomeTypeToQBAccount(income.type)
    const acctName = income.name || name
    const date = `12/31/${year}`

    const header: IIFTransactionLine = {
      lineType: 'TRNS',
      trnsType: 'GENERAL JOURNAL',
      date,
      account: 'Checking',
      name: income.notes || '',
      amount: income.annualAmount,
      memo: `${income.type} income - ${income.name || 'Annual'}`,
      raw: {},
    }

    const split: IIFTransactionLine = {
      lineType: 'SPL',
      trnsType: 'GENERAL JOURNAL',
      date,
      account: acctName,
      name: '',
      amount: -income.annualAmount,
      memo: '',
      raw: {},
    }

    transactions.push({ header, splits: [split], balanced: true, balanceError: 0 })
  }

  // Expenses → checks
  for (const expense of (state.expenses || [])) {
    const { name } = expenseCategoryToQBAccount(expense.category || 'other')
    const acctName = expense.description || name
    const date = `12/31/${year}`

    const header: IIFTransactionLine = {
      lineType: 'TRNS',
      trnsType: 'GENERAL JOURNAL',
      date,
      account: acctName,
      name: '',
      amount: expense.annualAmount,
      memo: `${expense.category} expense - ${expense.description || 'Annual'}`,
      raw: {},
    }

    const split: IIFTransactionLine = {
      lineType: 'SPL',
      trnsType: 'GENERAL JOURNAL',
      date,
      account: 'Checking',
      name: '',
      amount: -expense.annualAmount,
      memo: '',
      raw: {},
    }

    transactions.push({ header, splits: [split], balanced: true, balanceError: 0 })
  }

  return transactions
}

/**
 * Generate vendor list from Fortuna state (1099 contractors, etc.)
 */
export function exportVendors(state: FortunaState): IIFVendor[] {
  const vendors: IIFVendor[] = []

  // Extract vendors from expenses that look like contractor payments
  for (const expense of (state.expenses || [])) {
    if (expense.category === 'contract_labor' || expense.category === 'legal' ||
        expense.category === 'professional') {
      if (expense.description) {
        vendors.push({
          name: expense.description,
          print1099: (expense.annualAmount || 0) >= 600,
          raw: {},
        })
      }
    }
  }

  return vendors
}

/**
 * Generate class list from Fortuna entities.
 */
export function exportClasses(state: FortunaState): IIFClass[] {
  return (state.entities || []).map(e => ({
    name: e.name,
    hidden: false,
    raw: {},
  }))
}

/**
 * Full export: Generate complete IIF file from Fortuna state.
 */
export function exportFortunaToIIF(state: FortunaState, taxYear?: number): string {
  const accounts = exportChartOfAccounts(state)
  const transactions = exportTransactions(state, taxYear)
  const vendors = exportVendors(state)
  const classes = exportClasses(state)

  return generateIIF({
    accounts,
    transactions,
    customers: [],
    vendors,
    classes,
  })
}

/**
 * Generate a P&L summary in IIF-compatible format.
 */
export function exportProfitAndLoss(state: FortunaState): string {
  const lines: string[] = []

  lines.push('=== FORTUNA ENGINE — PROFIT & LOSS SUMMARY ===')
  lines.push(`Tax Year: ${state.taxYear || new Date().getFullYear()}`)
  lines.push(`Filing Status: ${state.profile.filingStatus}`)
  lines.push('')

  lines.push('--- INCOME ---')
  let totalIncome = 0
  for (const income of (state.incomeStreams || [])) {
    lines.push(`  ${income.name || income.type}\t$${income.annualAmount.toLocaleString()}`)
    totalIncome += income.annualAmount
  }
  lines.push(`  TOTAL INCOME\t$${totalIncome.toLocaleString()}`)
  lines.push('')

  lines.push('--- EXPENSES ---')
  let totalExpenses = 0
  for (const expense of (state.expenses || [])) {
    lines.push(`  ${expense.description || expense.category}\t$${expense.annualAmount.toLocaleString()}`)
    totalExpenses += expense.annualAmount
  }
  lines.push(`  TOTAL EXPENSES\t$${totalExpenses.toLocaleString()}`)
  lines.push('')

  lines.push(`NET INCOME\t$${(totalIncome - totalExpenses).toLocaleString()}`)

  return lines.join('\n')
}
