/**
 * Fortuna Engine — Four Financial Statements Generator
 *
 * Produces all four core financial statements from the minimum
 * set of inputs an owner needs to provide:
 *
 *   1. Income Statement     (Revenue → Gross Profit → Net Income)
 *   2. Balance Sheet        (Assets = Liabilities + Owner's Equity)
 *   3. Cash Flow Statement  (Operating / Investing / Financing — indirect method)
 *   4. Statement of Owner's Equity (Beg. Equity → Ending Equity)
 *
 * Smart defaults allow a complete output even from a very thin
 * input — the owner only needs to supply the numbers they know.
 */

// ===================================================================
//  INPUT TYPES
// ===================================================================

export type BusinessType = 'service' | 'product' | 'mixed' | 'other'

/** Minimum owner-supplied data required to generate all four statements. */
export interface FinancialStatementsInput {
  // ── Identity ────────────────────────────────────────────────────
  businessName: string
  /** e.g. "2025", "Q1 2025", "FY 2025" */
  period: string
  businessType: BusinessType

  // ── Revenue ─────────────────────────────────────────────────────
  /** Primary operating revenue (service fees, sales, etc.) */
  primaryRevenue: number
  /** Secondary revenue streams (commissions, royalties, etc.) */
  otherRevenue?: number

  // ── Cost of Goods Sold (product/mixed businesses) ───────────────
  /** Direct costs tied to revenue production. 0 for pure service. */
  costOfGoodsSold?: number

  // ── Operating Expenses ──────────────────────────────────────────
  /** Wages, salaries, contractor pay */
  laborExpenses: number
  /** Office, warehouse, retail rent & utilities */
  facilitiesExpenses?: number
  /** Ads, social media, promotions */
  marketingExpenses?: number
  /** Accounting, legal, consulting fees */
  professionalServices?: number
  /** Computer equipment, software subscriptions */
  technologyExpenses?: number
  /** Business insurance premiums */
  insuranceExpenses?: number
  /**
   * Annual depreciation on fixed assets.
   * If omitted and fixedAssetsGross is supplied, estimated at 10% of gross assets.
   */
  depreciationExpense?: number
  /** All remaining operating costs not listed above */
  otherOperatingExpenses?: number

  // ── Non-Operating ────────────────────────────────────────────────
  /** Interest paid on business loans */
  interestExpense?: number
  /** Interest earned, gains, etc. */
  nonOperatingIncome?: number
  /**
   * Income tax expense.
   * If omitted, a rough estimate is computed at 21% of pre-tax income
   * (C-corp rate; service note warns owner to consult a CPA).
   */
  incomeTaxExpense?: number

  // ── Balance Sheet Inputs ─────────────────────────────────────────
  /** Cash & equivalents at period end */
  endingCash: number
  /** Cash & equivalents at period start (for cash flow reconciliation) */
  beginningCash?: number
  /** Receivables from customers (invoiced but not yet collected) */
  accountsReceivable?: number
  /** Merchandise / raw-material inventory value */
  inventory?: number
  /** Prepaid expenses (insurance, subscriptions, deposits) */
  prepaidAndOther?: number
  /** Total acquisition cost of equipment, vehicles, fixtures, etc. */
  fixedAssetsGross?: number
  /** Accumulated depreciation to date (reduces book value) */
  accumulatedDepreciation?: number

  /** Money owed to suppliers */
  accountsPayable?: number
  /** Wages accrued but not yet paid, short-term accruals */
  accruedLiabilities?: number
  /** Loans / lines of credit due within 12 months */
  shortTermDebt?: number
  /** Loans & notes payable beyond 12 months */
  longTermDebt?: number

  // ── Equity / Capital Activity ────────────────────────────────────
  /**
   * Owner's equity at the beginning of this period.
   * If unknown, the engine back-calculates it from ending equity.
   */
  beginningEquity?: number
  /** New owner capital invested during this period */
  capitalContributions?: number
  /** Owner withdrawals / distributions during this period */
  ownerDraws?: number

  // ── Cash Flow Detail (optional, improves accuracy) ───────────────
  /** Capital expenditures (purchases of fixed assets this period) */
  capitalExpenditures?: number
  /** Cash received from selling assets */
  assetSaleProceeds?: number
  /** New debt borrowed this period */
  newBorrowings?: number
  /** Debt principal repaid this period */
  debtRepayments?: number
}

// ===================================================================
//  OUTPUT TYPES
// ===================================================================

export interface LineItem {
  label: string
  amount: number
  indent?: number
  isSubtotal?: boolean
  isTotal?: boolean
  note?: string
}

// ── Statement 1: Income Statement ─────────────────────────────────

export interface IncomeStatement {
  period: string
  businessName: string

  revenueItems: LineItem[]
  totalRevenue: number

  cogsItems: LineItem[]
  totalCOGS: number

  grossProfit: number
  grossMarginPct: number

  opexItems: LineItem[]
  totalOpex: number

  operatingIncome: number
  operatingMarginPct: number

  nonOperatingItems: LineItem[]
  preTaxIncome: number

  taxExpense: number
  netIncome: number
  netMarginPct: number
}

// ── Statement 2: Balance Sheet ─────────────────────────────────────

export interface BalanceSheetStatement {
  period: string
  businessName: string

  currentAssets: LineItem[]
  totalCurrentAssets: number

  fixedAssets: LineItem[]
  totalFixedAssets: number

  totalAssets: number

  currentLiabilities: LineItem[]
  totalCurrentLiabilities: number

  longTermLiabilities: LineItem[]
  totalLongTermLiabilities: number

  totalLiabilities: number

  equityItems: LineItem[]
  totalEquity: number

  /** Must equal totalAssets for a balanced sheet */
  liabilitiesAndEquity: number

  isBalanced: boolean
}

// ── Statement 3: Cash Flow Statement ──────────────────────────────

export interface CashFlowStatement {
  period: string
  businessName: string

  // Indirect method: start with net income, adjust
  operatingItems: LineItem[]
  netCashFromOperations: number

  investingItems: LineItem[]
  netCashFromInvesting: number

  financingItems: LineItem[]
  netCashFromFinancing: number

  netChangeInCash: number
  beginningCash: number
  endingCash: number

  /** True when beginning + change = ending (within $1 rounding) */
  reconciles: boolean
}

// ── Statement 4: Statement of Owner's Equity ──────────────────────

export interface OwnerEquityStatement {
  period: string
  businessName: string

  beginningEquity: number
  capitalContributions: number
  netIncome: number
  ownerDraws: number
  endingEquity: number

  lineItems: LineItem[]
}

// ── All Four Statements + Insights ────────────────────────────────

export interface FinancialMetrics {
  grossMarginPct: number
  operatingMarginPct: number
  netMarginPct: number
  currentRatio: number
  debtToEquityRatio: number
  returnOnEquityPct: number
  workingCapital: number
}

export interface FinancialStatements {
  incomeStatement: IncomeStatement
  balanceSheet: BalanceSheetStatement
  cashFlowStatement: CashFlowStatement
  ownerEquityStatement: OwnerEquityStatement
  metrics: FinancialMetrics
  insights: string[]
  /** True when all four statements are internally consistent */
  isConsistent: boolean
}

// ===================================================================
//  HELPERS
// ===================================================================

function round(n: number): number {
  return Math.round(n)
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return round((numerator / denominator) * 10000) / 100 // 2 decimal places
}

// ===================================================================
//  CORE GENERATOR
// ===================================================================

/**
 * Generates all four financial statements from a minimal input object.
 * Unspecified optional fields default to zero; estimates are computed
 * where noted and flagged in insights.
 */
export function generateFinancialStatements(input: FinancialStatementsInput): FinancialStatements {
  // ── Normalise / default all inputs ────────────────────────────────
  const totalRevenue = round(input.primaryRevenue + (input.otherRevenue ?? 0))
  const cogs = round(input.costOfGoodsSold ?? 0)

  const labor = round(input.laborExpenses)
  const facilities = round(input.facilitiesExpenses ?? 0)
  const marketing = round(input.marketingExpenses ?? 0)
  const professional = round(input.professionalServices ?? 0)
  const technology = round(input.technologyExpenses ?? 0)
  const insurance = round(input.insuranceExpenses ?? 0)

  // Estimate depreciation from gross assets when not supplied
  const estimatedDepreciation = input.depreciationExpense == null && (input.fixedAssetsGross ?? 0) > 0
  const depreciation = round(
    input.depreciationExpense ??
    ((input.fixedAssetsGross ?? 0) * 0.10)
  )
  const otherOpex = round(input.otherOperatingExpenses ?? 0)

  const interestExpense = round(input.interestExpense ?? 0)
  const nonOpIncome = round(input.nonOperatingIncome ?? 0)

  // ── Statement 1: Income Statement ─────────────────────────────────

  const grossProfit = round(totalRevenue - cogs)
  const grossMarginPct = pct(grossProfit, totalRevenue)

  const opexItems: LineItem[] = []
  if (labor > 0)       opexItems.push({ label: 'Wages & Contractor Labor', amount: labor, indent: 1 })
  if (facilities > 0)  opexItems.push({ label: 'Rent & Facilities', amount: facilities, indent: 1 })
  if (marketing > 0)   opexItems.push({ label: 'Marketing & Advertising', amount: marketing, indent: 1 })
  if (professional > 0) opexItems.push({ label: 'Professional Services', amount: professional, indent: 1 })
  if (technology > 0)  opexItems.push({ label: 'Technology & Software', amount: technology, indent: 1 })
  if (insurance > 0)   opexItems.push({ label: 'Insurance', amount: insurance, indent: 1 })
  if (depreciation > 0) opexItems.push({
    label: 'Depreciation',
    amount: depreciation,
    indent: 1,
    note: estimatedDepreciation ? 'estimated at 10% of gross assets' : undefined,
  })
  if (otherOpex > 0)   opexItems.push({ label: 'Other Operating Expenses', amount: otherOpex, indent: 1 })

  const totalOpex = opexItems.reduce((s, i) => s + i.amount, 0)
  const operatingIncome = round(grossProfit - totalOpex)
  const operatingMarginPct = pct(operatingIncome, totalRevenue)

  const nonOperatingItems: LineItem[] = []
  if (nonOpIncome > 0)    nonOperatingItems.push({ label: 'Non-Operating Income', amount: nonOpIncome, indent: 1 })
  if (interestExpense > 0) nonOperatingItems.push({ label: 'Interest Expense', amount: -interestExpense, indent: 1 })

  const preTaxIncome = round(operatingIncome + nonOpIncome - interestExpense)

  const estimatedTax = input.incomeTaxExpense == null
  const taxExpense = round(input.incomeTaxExpense ?? Math.max(0, preTaxIncome * 0.21))

  const netIncome = round(preTaxIncome - taxExpense)
  const netMarginPct = pct(netIncome, totalRevenue)

  const revenueItems: LineItem[] = []
  if (input.primaryRevenue > 0) {
    revenueItems.push({
      label: input.businessType === 'product' ? 'Product Sales Revenue'
           : input.businessType === 'service' ? 'Service Revenue'
           : 'Operating Revenue',
      amount: round(input.primaryRevenue),
      indent: 1,
    })
  }
  if ((input.otherRevenue ?? 0) > 0) {
    revenueItems.push({ label: 'Other Revenue', amount: round(input.otherRevenue!), indent: 1 })
  }

  const cogsItems: LineItem[] = cogs > 0
    ? [{ label: 'Cost of Goods Sold', amount: cogs, indent: 1 }]
    : []

  const incomeStatement: IncomeStatement = {
    period: input.period,
    businessName: input.businessName,
    revenueItems,
    totalRevenue,
    cogsItems,
    totalCOGS: cogs,
    grossProfit,
    grossMarginPct,
    opexItems,
    totalOpex,
    operatingIncome,
    operatingMarginPct,
    nonOperatingItems,
    preTaxIncome,
    taxExpense,
    netIncome,
    netMarginPct,
  }

  // ── Statement 2: Balance Sheet ─────────────────────────────────────

  const endingCash = round(input.endingCash)
  const ar = round(input.accountsReceivable ?? 0)
  const inventory = round(input.inventory ?? 0)
  const prepaid = round(input.prepaidAndOther ?? 0)
  const fixedGross = round(input.fixedAssetsGross ?? 0)
  const accumDepr = round(input.accumulatedDepreciation ?? depreciation) // at minimum this period's depreciation
  const fixedNet = Math.max(0, fixedGross - accumDepr)

  const totalCurrentAssets = round(endingCash + ar + inventory + prepaid)
  const totalFixedAssets = fixedNet
  const totalAssets = round(totalCurrentAssets + totalFixedAssets)

  const ap = round(input.accountsPayable ?? 0)
  const accrued = round(input.accruedLiabilities ?? 0)
  const stDebt = round(input.shortTermDebt ?? 0)
  const ltDebt = round(input.longTermDebt ?? 0)

  const totalCurrentLiabilities = round(ap + accrued + stDebt)
  const totalLongTermLiabilities = ltDebt
  const totalLiabilities = round(totalCurrentLiabilities + totalLongTermLiabilities)

  // Equity: derive ending equity from the balance sheet identity
  // Assets = Liabilities + Equity  →  Equity = Assets - Liabilities
  const endingEquity = round(totalAssets - totalLiabilities)

  // Back-compute beginning equity when not supplied
  const capitalContributions = round(input.capitalContributions ?? 0)
  const ownerDraws = round(input.ownerDraws ?? 0)
  const derivedBeginningEquity = round(endingEquity - netIncome - capitalContributions + ownerDraws)
  const beginningEquity = round(input.beginningEquity ?? derivedBeginningEquity)

  const currentAssets: LineItem[] = []
  if (endingCash > 0) currentAssets.push({ label: 'Cash & Equivalents', amount: endingCash, indent: 1 })
  if (ar > 0)         currentAssets.push({ label: 'Accounts Receivable', amount: ar, indent: 1 })
  if (inventory > 0)  currentAssets.push({ label: 'Inventory', amount: inventory, indent: 1 })
  if (prepaid > 0)    currentAssets.push({ label: 'Prepaid Expenses & Other', amount: prepaid, indent: 1 })

  const fixedAssetsItems: LineItem[] = []
  if (fixedGross > 0) {
    fixedAssetsItems.push({ label: 'Fixed Assets (Gross)', amount: fixedGross, indent: 1 })
    fixedAssetsItems.push({ label: 'Less: Accumulated Depreciation', amount: -accumDepr, indent: 1 })
  }

  const currentLiabilities: LineItem[] = []
  if (ap > 0)      currentLiabilities.push({ label: 'Accounts Payable', amount: ap, indent: 1 })
  if (accrued > 0) currentLiabilities.push({ label: 'Accrued Liabilities', amount: accrued, indent: 1 })
  if (stDebt > 0)  currentLiabilities.push({ label: 'Short-Term Debt', amount: stDebt, indent: 1 })

  const ltLiabilities: LineItem[] = ltDebt > 0
    ? [{ label: 'Long-Term Debt', amount: ltDebt, indent: 1 }]
    : []

  const equityItems: LineItem[] = [
    { label: 'Beginning Owner\'s Equity', amount: beginningEquity, indent: 1 },
    ...(capitalContributions > 0 ? [{ label: 'Capital Contributions', amount: capitalContributions, indent: 1 }] : []),
    { label: 'Net Income', amount: netIncome, indent: 1 },
    ...(ownerDraws > 0 ? [{ label: 'Less: Owner\'s Draws', amount: -ownerDraws, indent: 1 }] : []),
  ]

  const liabilitiesAndEquity = round(totalLiabilities + endingEquity)
  const isBalanced = Math.abs(totalAssets - liabilitiesAndEquity) <= 1

  const balanceSheet: BalanceSheetStatement = {
    period: input.period,
    businessName: input.businessName,
    currentAssets,
    totalCurrentAssets,
    fixedAssets: fixedAssetsItems,
    totalFixedAssets,
    totalAssets,
    currentLiabilities,
    totalCurrentLiabilities,
    longTermLiabilities: ltLiabilities,
    totalLongTermLiabilities,
    totalLiabilities,
    equityItems,
    totalEquity: endingEquity,
    liabilitiesAndEquity,
    isBalanced,
  }

  // ── Statement 3: Cash Flow Statement (Indirect Method) ─────────────

  const beginningCash = round(input.beginningCash ?? endingCash - netIncome)

  // Operating section — indirect: start with net income, add back non-cash
  const operatingItems: LineItem[] = [
    { label: 'Net Income', amount: netIncome },
    { label: 'Add: Depreciation & Amortization', amount: depreciation, indent: 1, note: 'non-cash' },
  ]

  // Working capital adjustments (increases in assets use cash; increases in liabilities provide cash)
  // Since we only have ending balances, we flag with a note that these are estimated
  if (ar > 0) {
    operatingItems.push({ label: 'Changes in Accounts Receivable', amount: 0, indent: 1, note: 'prior balance not provided; assumed unchanged' })
  }
  if (inventory > 0) {
    operatingItems.push({ label: 'Changes in Inventory', amount: 0, indent: 1, note: 'prior balance not provided; assumed unchanged' })
  }
  if (ap > 0) {
    operatingItems.push({ label: 'Changes in Accounts Payable', amount: 0, indent: 1, note: 'prior balance not provided; assumed unchanged' })
  }
  if (accrued > 0) {
    operatingItems.push({ label: 'Changes in Accrued Liabilities', amount: 0, indent: 1, note: 'prior balance not provided; assumed unchanged' })
  }

  const netCashFromOperations = round(netIncome + depreciation)

  // Investing section
  const capex = round(input.capitalExpenditures ?? 0)
  const assetSales = round(input.assetSaleProceeds ?? 0)
  const investingItems: LineItem[] = []
  if (capex > 0)      investingItems.push({ label: 'Capital Expenditures', amount: -capex, indent: 1 })
  if (assetSales > 0) investingItems.push({ label: 'Proceeds from Asset Sales', amount: assetSales, indent: 1 })

  const netCashFromInvesting = round(-capex + assetSales)

  // Financing section
  const newBorrowings = round(input.newBorrowings ?? 0)
  const debtRepayments = round(input.debtRepayments ?? 0)
  const financingItems: LineItem[] = []
  if (capitalContributions > 0) financingItems.push({ label: 'Owner Capital Contributions', amount: capitalContributions, indent: 1 })
  if (ownerDraws > 0)           financingItems.push({ label: 'Owner Draws / Distributions', amount: -ownerDraws, indent: 1 })
  if (newBorrowings > 0)        financingItems.push({ label: 'Proceeds from New Borrowings', amount: newBorrowings, indent: 1 })
  if (debtRepayments > 0)       financingItems.push({ label: 'Debt Repayments', amount: -debtRepayments, indent: 1 })

  const netCashFromFinancing = round(capitalContributions - ownerDraws + newBorrowings - debtRepayments)

  const netChangeInCash = round(netCashFromOperations + netCashFromInvesting + netCashFromFinancing)
  const impliedEndingCash = round(beginningCash + netChangeInCash)
  const reconciles = Math.abs(impliedEndingCash - endingCash) <= 5

  const cashFlowStatement: CashFlowStatement = {
    period: input.period,
    businessName: input.businessName,
    operatingItems,
    netCashFromOperations,
    investingItems,
    netCashFromInvesting,
    financingItems,
    netCashFromFinancing,
    netChangeInCash,
    beginningCash,
    endingCash,
    reconciles,
  }

  // ── Statement 4: Statement of Owner's Equity ───────────────────────

  const equityLineItems: LineItem[] = [
    { label: 'Beginning Balance', amount: beginningEquity },
    ...(capitalContributions > 0 ? [{ label: 'Add: Owner Capital Contributions', amount: capitalContributions, indent: 1 }] : []),
    { label: 'Add: Net Income for the Period', amount: netIncome, indent: 1 },
    ...(ownerDraws > 0 ? [{ label: 'Less: Owner\'s Draws / Distributions', amount: -ownerDraws, indent: 1 }] : []),
    { label: 'Ending Balance', amount: endingEquity, isTotal: true },
  ]

  const ownerEquityStatement: OwnerEquityStatement = {
    period: input.period,
    businessName: input.businessName,
    beginningEquity,
    capitalContributions,
    netIncome,
    ownerDraws,
    endingEquity,
    lineItems: equityLineItems,
  }

  // ── Key Metrics ────────────────────────────────────────────────────

  const currentRatio = totalCurrentLiabilities > 0
    ? round((totalCurrentAssets / totalCurrentLiabilities) * 100) / 100
    : 999

  const debtToEquityRatio = endingEquity > 0
    ? round((totalLiabilities / endingEquity) * 100) / 100
    : 0

  const returnOnEquityPct = endingEquity > 0
    ? pct(netIncome, endingEquity)
    : 0

  const workingCapital = round(totalCurrentAssets - totalCurrentLiabilities)

  const metrics: FinancialMetrics = {
    grossMarginPct,
    operatingMarginPct,
    netMarginPct,
    currentRatio,
    debtToEquityRatio,
    returnOnEquityPct,
    workingCapital,
  }

  // ── Insights ───────────────────────────────────────────────────────

  const insights: string[] = []

  if (totalRevenue === 0) {
    insights.push('No revenue recorded. Enter your primary revenue to get meaningful statement analysis.')
  }

  if (netIncome < 0) {
    insights.push(`The business recorded a net loss of $${Math.abs(netIncome).toLocaleString()} this period. Review operating expenses — labor and facilities are often the largest levers.`)
  } else if (netMarginPct > 20) {
    insights.push(`Strong net margin of ${netMarginPct}% — well above the typical small business average of 6–10%.`)
  } else if (netMarginPct < 5 && totalRevenue > 50000) {
    insights.push(`Thin net margin of ${netMarginPct}%. Consider whether pricing, COGS, or overhead can be optimised.`)
  }

  if (grossMarginPct > 0 && grossMarginPct < 30 && cogs > 0) {
    insights.push(`Gross margin of ${grossMarginPct}% is low. Renegotiating supplier terms or adjusting pricing could have an outsized impact.`)
  }

  if (currentRatio < 1 && currentRatio > 0) {
    insights.push(`Current ratio of ${currentRatio}x is below 1.0, meaning current liabilities exceed current assets. Improve by collecting receivables faster or securing a line of credit.`)
  } else if (currentRatio >= 2) {
    insights.push(`Current ratio of ${currentRatio}x indicates strong short-term liquidity.`)
  }

  if (estimatedTax && preTaxIncome > 0) {
    insights.push(`Income tax was estimated at 21% of pre-tax income ($${taxExpense.toLocaleString()}). Actual liability depends on your entity type and deductions — consult a CPA.`)
  }

  if (estimatedDepreciation) {
    insights.push(`Depreciation was estimated at 10% of gross fixed assets ($${depreciation.toLocaleString()}). Provide the actual figure for a more accurate income statement.`)
  }

  if (!isBalanced) {
    insights.push('The balance sheet does not balance. This usually means some assets or liabilities are missing. Review equity, debt, and asset entries.')
  }

  if (!cashFlowStatement.reconciles && input.beginningCash != null) {
    insights.push('Cash flow statement does not fully reconcile to the stated beginning cash. Provide working-capital details (A/R, A/P changes) for a complete indirect-method reconciliation.')
  }

  if (debtToEquityRatio > 3) {
    insights.push(`High debt-to-equity ratio of ${debtToEquityRatio}x. Consider paying down debt or increasing retained earnings to reduce financial risk.`)
  }

  const isConsistent = isBalanced && Math.abs(endingEquity - (beginningEquity + capitalContributions + netIncome - ownerDraws)) <= 1

  return {
    incomeStatement,
    balanceSheet,
    cashFlowStatement,
    ownerEquityStatement,
    metrics,
    insights,
    isConsistent,
  }
}
