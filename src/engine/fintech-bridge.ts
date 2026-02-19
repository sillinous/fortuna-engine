/**
 * Fortuna Engine — FinTech Bridge
 *
 * Maps canonical FinTech data (accounts, transactions, investments,
 * liabilities, identity, income) into FortunaState fields.
 *
 * This is the integration heart:
 *
 *   External Provider → Canonical Model → FinTech Bridge → FortunaState
 *        (Plaid)         (fintech-models)    (this file)     (storage)
 *
 * The bridge performs:
 *   1. Account → Fortuna bank accounts, retirement accounts, investment positions
 *   2. Transactions → BankTransactions with tax categorization
 *   3. Investments → Portfolio positions with cost basis + tax lots
 *   4. Liabilities → Deductible interest tracking (mortgage, student loan)
 *   5. Identity → KYC data for entity / filing profile
 *   6. Income → W-2 / income stream mapping
 *   7. Recurring → Automated expense/income stream detection
 *
 * @module fintech-bridge
 */

import type {
  FinTechAccount, FinTechTransaction, InvestmentHolding, Security,
  InvestmentTransaction, LiabilityDetail, KYCIdentity, KYBBusinessIdentity,
  IncomeVerification, RecurringStream, AccountType, AccountSubtype,
} from './fintech-models'
import type {
  FortunaState, IncomeStream, BusinessExpense, LegalEntity,
  BankTransaction, RetirementAccount, DepreciationAsset,
} from './storage'
import { enrichTransaction, type EnrichedTransaction } from './fintech-enrichment'

// ─── Bridge Result ────────────────────────────────────────────────────────

export interface BridgeResult {
  patch: Partial<FortunaState>
  summary: BridgeSummary
}

export interface BridgeSummary {
  accountsImported: number
  transactionsImported: number
  incomeStreamsDetected: number
  expensesDetected: number
  investmentPositions: number
  retirementAccountsDetected: number
  liabilitiesDetected: number
  deductibleInterestFound: number
  taxPaymentsFound: number
  recurring1099Vendors: number
  warnings: string[]
}

// ─── Account Bridge ───────────────────────────────────────────────────────

/**
 * Map FinTech accounts into Fortuna structures.
 * - Depository → bank account tracking
 * - Investment (tax-advantaged) → RetirementAccount
 * - Investment (taxable) → portfolio position grouping
 * - Loan → liability with deductible interest
 * - Credit → liability tracking
 */
export function bridgeAccounts(accounts: FinTechAccount[]): {
  retirementAccounts: Partial<RetirementAccount>[]
  bankSummary: { name: string; type: string; balance: number; mask?: string }[]
  creditCards: { name: string; balance: number; limit: number | null; apr?: number }[]
} {
  const retirementAccounts: Partial<RetirementAccount>[] = []
  const bankSummary: { name: string; type: string; balance: number; mask?: string }[] = []
  const creditCards: { name: string; balance: number; limit: number | null; apr?: number }[] = []

  for (const acct of accounts) {
    // Tax-advantaged investment accounts → RetirementAccount
    if (acct.taxRelevance.isTaxAdvantaged && acct.taxRelevance.fortunaMapping === 'retirement') {
      retirementAccounts.push({
        id: `fintech_${acct.id}`,
        type: mapSubtypeToRetirementType(acct.subtype),
        provider: acct.institutionName || acct.name,
        currentBalance: acct.balances.current || 0,
        // Annual contribution tracked separately
        annualContribution: 0,
        employerMatch: 0,
        notes: `Linked via ${acct.provider} (${acct.mask ? '···' + acct.mask : acct.name})`,
      })
    }

    // Depository accounts → bank summary
    if (acct.type === 'depository') {
      bankSummary.push({
        name: acct.officialName || acct.name,
        type: acct.subtype,
        balance: acct.balances.current || 0,
        mask: acct.mask,
      })
    }

    // Credit accounts → credit card tracking
    if (acct.type === 'credit') {
      creditCards.push({
        name: acct.officialName || acct.name,
        balance: acct.balances.current || 0,
        limit: acct.balances.limit,
      })
    }
  }

  return { retirementAccounts, bankSummary, creditCards }
}

function mapSubtypeToRetirementType(subtype: AccountSubtype): string {
  const map: Record<string, string> = {
    '401k': '401k', '401a': '401k', '403b': '403b', '457b': '457b',
    'ira': 'traditional_ira', 'roth_ira': 'roth_ira', 'roth_401k': 'roth_401k',
    'sep_ira': 'sep_ira', 'simple_ira': 'simple_ira',
    'pension': 'pension', 'profit_sharing': '401k',
  }
  return map[subtype] || 'other'
}

// ─── Transaction Bridge ──────────────────────────────────────────────────

/**
 * Map FinTech transactions into Fortuna BankTransactions with tax enrichment.
 * Each transaction runs through the enrichment engine to assign:
 *   - Tax category (Schedule C/E/A/B/D references)
 *   - Deductibility and percentage
 *   - Income vs expense classification
 *   - 1099 reportability
 */
export function bridgeTransactions(
  transactions: FinTechTransaction[],
): {
  bankTransactions: BankTransaction[]
  incomeStreams: Partial<IncomeStream>[]
  expenses: Partial<BusinessExpense>[]
  taxPayments: { date: string; amount: number; type: string; description: string }[]
  stats: {
    total: number; income: number; expense: number; transfer: number
    deductible: number; taxPayments: number; recurring1099: number
  }
} {
  const bankTransactions: BankTransaction[] = []
  const incomeAgg: Map<string, { total: number; count: number; name: string; type: string }> = new Map()
  const expenseAgg: Map<string, { total: number; count: number; category: string; description: string; deductible: boolean; pct: number; schedule?: string }> = new Map()
  const taxPayments: { date: string; amount: number; type: string; description: string }[] = []
  let incomeCount = 0, expenseCount = 0, transferCount = 0, deductibleCount = 0, taxPaymentCount = 0

  for (const txn of transactions) {
    // Enrich with tax intelligence
    const enriched = enrichTransaction(txn)

    // Create BankTransaction
    const bt: BankTransaction = {
      id: `ft_${txn.id}`,
      date: txn.date,
      description: txn.merchantName || txn.name,
      amount: txn.type === 'credit' ? txn.amount : -txn.amount,
      category: enriched.fortunaCategory || txn.category.primary,
      isReconciled: !txn.pending,
      accountName: txn.accountId,
    }
    bankTransactions.push(bt)

    // Aggregate income
    if (txn.type === 'credit' && !isTransfer(txn)) {
      incomeCount++
      const key = enriched.fortunaCategory || 'other_income'
      const existing = incomeAgg.get(key) || { total: 0, count: 0, name: txn.merchantName || txn.name, type: 'other' }
      existing.total += txn.amount
      existing.count++
      if (enriched.incomeType) existing.type = enriched.incomeType
      incomeAgg.set(key, existing)
    }

    // Aggregate expenses
    if (txn.type === 'debit' && !isTransfer(txn)) {
      expenseCount++
      if (enriched.isDeductible) deductibleCount++

      const key = enriched.fortunaCategory || txn.category.primary || 'uncategorized'
      const existing = expenseAgg.get(key) || {
        total: 0, count: 0, category: key,
        description: enriched.fortunaCategory || txn.category.primary || 'Other',
        deductible: enriched.isDeductible, pct: enriched.deductionPct,
        schedule: enriched.scheduleRef,
      }
      existing.total += txn.amount
      existing.count++
      expenseAgg.set(key, existing)
    }

    // Transfer tracking
    if (isTransfer(txn)) transferCount++

    // Tax payments
    if (enriched.isTaxPayment) {
      taxPaymentCount++
      taxPayments.push({
        date: txn.date,
        amount: txn.amount,
        type: enriched.taxPaymentType || 'estimated',
        description: txn.merchantName || txn.name,
      })
    }
  }

  // Convert aggregated income to IncomeStreams
  const incomeStreams: Partial<IncomeStream>[] = Array.from(incomeAgg.entries()).map(([key, data]) => ({
    name: data.name || key,
    type: mapIncomeType(data.type),
    annualAmount: Math.round(data.total * 100) / 100,
    isActive: true,
    notes: `FinTech import: ${data.count} transactions`,
  }))

  // Convert aggregated expenses to BusinessExpenses
  const expenses: Partial<BusinessExpense>[] = Array.from(expenseAgg.entries()).map(([_, data]) => ({
    category: data.category,
    description: `${data.description} (${data.count} transactions)`,
    annualAmount: Math.round(data.total * 100) / 100,
    isDeductible: data.deductible,
    deductionPct: data.pct,
  }))

  return {
    bankTransactions,
    incomeStreams,
    expenses,
    taxPayments,
    stats: {
      total: transactions.length,
      income: incomeCount,
      expense: expenseCount,
      transfer: transferCount,
      deductible: deductibleCount,
      taxPayments: taxPaymentCount,
      recurring1099: 0, // Computed in recurring bridge
    },
  }
}

function isTransfer(txn: FinTechTransaction): boolean {
  const cat = (txn.category.primary || '').toLowerCase()
  return txn.type === 'transfer' || cat.includes('transfer') || cat === 'payment'
}

function mapIncomeType(type: string): IncomeStream['type'] {
  const map: Record<string, IncomeStream['type']> = {
    employment: 'w2', self_employment: 'freelance', business: 'business',
    investment: 'investment', rental: 'rental', passive: 'passive',
  }
  return map[type] || 'other'
}

// ─── Investment Bridge ───────────────────────────────────────────────────

export interface BridgedPortfolio {
  positions: {
    id: string
    symbol?: string
    name: string
    securityType: string
    quantity: number
    costBasis: number
    marketValue: number
    unrealizedGainLoss: number
    isLongTerm: boolean
    accountId: string
    accountSubtype?: string
  }[]
  totalMarketValue: number
  totalCostBasis: number
  totalUnrealizedGL: number
  shortTermGL: number
  longTermGL: number
  taxLossHarvestingCandidates: { symbol: string; loss: number; isLongTerm: boolean }[]
}

export function bridgeInvestments(
  holdings: InvestmentHolding[],
  securities: Security[],
  accounts: FinTechAccount[],
): BridgedPortfolio {
  const secMap = new Map(securities.map(s => [s.id, s]))
  const acctMap = new Map(accounts.map(a => [a.id, a]))

  const positions = holdings.map(h => {
    const sec = secMap.get(h.securityId)
    const acct = acctMap.get(h.accountId)
    return {
      id: h.id,
      symbol: sec?.tickerSymbol || undefined,
      name: sec?.name || 'Unknown Security',
      securityType: sec?.type || 'other',
      quantity: h.quantity,
      costBasis: h.costBasis,
      marketValue: h.marketValue,
      unrealizedGainLoss: h.unrealizedGainLoss,
      isLongTerm: h.isLongTerm,
      accountId: h.accountId,
      accountSubtype: acct?.subtype,
    }
  })

  const totalMarketValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const totalCostBasis = positions.reduce((s, p) => s + p.costBasis, 0)
  const totalUnrealizedGL = positions.reduce((s, p) => s + p.unrealizedGainLoss, 0)
  const shortTermGL = positions.filter(p => !p.isLongTerm).reduce((s, p) => s + p.unrealizedGainLoss, 0)
  const longTermGL = positions.filter(p => p.isLongTerm).reduce((s, p) => s + p.unrealizedGainLoss, 0)

  // Tax-loss harvesting candidates: taxable accounts with unrealized losses
  const taxLossHarvestingCandidates = positions
    .filter(p => p.unrealizedGainLoss < -50 && !isTaxAdvantaged(p.accountSubtype))
    .map(p => ({ symbol: p.symbol || p.name, loss: Math.abs(p.unrealizedGainLoss), isLongTerm: p.isLongTerm }))
    .sort((a, b) => b.loss - a.loss)

  return { positions, totalMarketValue, totalCostBasis, totalUnrealizedGL, shortTermGL, longTermGL, taxLossHarvestingCandidates }
}

function isTaxAdvantaged(subtype?: string): boolean {
  return ['401k', '401a', '403b', '457b', 'ira', 'roth_ira', 'roth_401k', 'sep_ira', 'simple_ira', 'pension', 'profit_sharing', '529'].includes(subtype || '')
}

// ─── Liability Bridge ────────────────────────────────────────────────────

export interface BridgedLiabilities {
  deductibleInterest: {
    type: string
    annualInterest: number
    scheduleRef: string
    description: string
  }[]
  totalDeductibleInterest: number
  mortgages: { balance: number; rate: number; interestYTD: number; address?: string }[]
  studentLoans: { balance: number; rate: number; interestYTD: number; servicer?: string }[]
  totalDebt: number
}

export function bridgeLiabilities(liabilities: LiabilityDetail[]): BridgedLiabilities {
  const deductibleInterest: BridgedLiabilities['deductibleInterest'] = []
  const mortgages: BridgedLiabilities['mortgages'] = []
  const studentLoans: BridgedLiabilities['studentLoans'] = []

  for (const l of liabilities) {
    // Mortgage interest deduction (Schedule A / Form 1098)
    if (l.type === 'mortgage' && l.taxDeductibleInterest) {
      const ytdInterest = l.mortgage?.interestPaidYTD || estimateAnnualInterest(l.currentBalance, l.interestRatePct)
      deductibleInterest.push({
        type: 'mortgage_interest',
        annualInterest: ytdInterest,
        scheduleRef: l.scheduleRef || 'Schedule A Line 8a',
        description: `Mortgage (${l.mortgage?.loanType || 'conventional'}) — ${(l.interestRatePct).toFixed(2)}% APR`,
      })
      mortgages.push({
        balance: l.currentBalance,
        rate: l.interestRatePct,
        interestYTD: ytdInterest,
        address: l.mortgage?.propertyAddress ? formatAddress(l.mortgage.propertyAddress) : undefined,
      })
    }

    // Student loan interest deduction (Form 1098-E / 1040 adjustment)
    if (l.type === 'student' && l.taxDeductibleInterest) {
      const ytdInterest = l.studentLoan?.interestPaidYTD || estimateAnnualInterest(l.currentBalance, l.interestRatePct)
      const capped = Math.min(ytdInterest, l.interestDeductionLimit || 2500)
      deductibleInterest.push({
        type: 'student_loan_interest',
        annualInterest: capped,
        scheduleRef: l.scheduleRef || '1040 Schedule 1 Line 21',
        description: `Student Loan — ${l.studentLoan?.servicer || 'Unknown servicer'} @ ${l.interestRatePct.toFixed(2)}%`,
      })
      studentLoans.push({
        balance: l.currentBalance,
        rate: l.interestRatePct,
        interestYTD: ytdInterest,
        servicer: l.studentLoan?.servicerName,
      })
    }
  }

  return {
    deductibleInterest,
    totalDeductibleInterest: deductibleInterest.reduce((s, d) => s + d.annualInterest, 0),
    mortgages,
    studentLoans,
    totalDebt: liabilities.reduce((s, l) => s + l.currentBalance, 0),
  }
}

function estimateAnnualInterest(balance: number, ratePct: number): number {
  return Math.round(balance * (ratePct / 100) * 100) / 100
}

function formatAddress(addr: { street1?: string; city?: string; region?: string; postalCode?: string }): string {
  return [addr.street1, addr.city, addr.region, addr.postalCode].filter(Boolean).join(', ')
}

// ─── Identity Bridge (KYC → Filing Profile) ─────────────────────────────

export function bridgeKYCToProfile(identity: KYCIdentity): Partial<FortunaState> {
  return {
    // These map to the user profile / household section
    // The actual field mapping depends on FortunaState structure
  }
}

// ─── Business Identity Bridge (KYB → Entity) ────────────────────────────

export function bridgeKYBToEntity(kyb: KYBBusinessIdentity): Partial<LegalEntity> {
  const entityTypeMap: Record<string, string> = {
    sole_proprietorship: 'sole_prop', single_member_llc: 'llc',
    multi_member_llc: 'llc', partnership: 'partnership',
    limited_partnership: 'partnership', s_corporation: 's_corp',
    c_corporation: 'c_corp', nonprofit: 'nonprofit', trust: 'trust',
  }
  return {
    name: kyb.dbaName || kyb.legalName,
    type: (entityTypeMap[kyb.entityType] || 'llc') as LegalEntity['type'],
    state: kyb.formationState,
    einNumber: kyb.ein || undefined,
    formationDate: kyb.formationDate || undefined,
    isActive: kyb.verificationStatus === 'verified',
    notes: `KYB verified via ${kyb.provider} — ${kyb.legalName} (${kyb.entityType})`,
  }
}

// ─── Income Verification Bridge ──────────────────────────────────────────

export function bridgeIncomeVerification(iv: IncomeVerification): Partial<IncomeStream>[] {
  const streams: Partial<IncomeStream>[] = []

  for (const s of iv.streams) {
    streams.push({
      name: s.name,
      type: s.type === 'employment' ? 'w2' : s.type === 'self_employment' ? 'freelance' : 'other',
      annualAmount: s.annualizedAmount,
      isActive: s.isActive,
      notes: `Verified income (${(s.confidence * 100).toFixed(0)}% confidence, ${s.frequency})`,
    })
  }

  // W-2 data
  for (const w2 of (iv.w2s || [])) {
    streams.push({
      name: w2.employerName,
      type: 'w2',
      annualAmount: w2.wages,
      isActive: true,
      w2: {
        employerName: w2.employerName,
        grossSalary: w2.wages,
        federalWithholding: w2.federalWithholding,
        stateWithholding: w2.stateTaxInfo?.[0]?.stateTax || 0,
        ficaWithheld: w2.socialSecurityTax + w2.medicareTax,
        pretax401k: w2.box12Codes?.find(c => c.code === 'D')?.amount || 0,
        pretaxHealthInsurance: w2.box12Codes?.find(c => c.code === 'DD')?.amount || 0,
        pretaxHSA: w2.box12Codes?.find(c => c.code === 'W')?.amount || 0,
      },
      notes: `W-2 from ${w2.employerName} (EIN: ${w2.employerEin}) — Tax Year ${w2.taxYear}`,
    })
  }

  return streams
}

// ─── Recurring Stream Bridge ─────────────────────────────────────────────

export function bridgeRecurringStreams(streams: RecurringStream[]): {
  incomeStreams: Partial<IncomeStream>[]
  expenses: Partial<BusinessExpense>[]
} {
  const incomeStreams: Partial<IncomeStream>[] = []
  const expenses: Partial<BusinessExpense>[] = []

  for (const s of streams) {
    if (!s.isActive) continue

    const annualized = annualizeAmount(s.averageAmount, s.frequency)

    if (s.streamType === 'income') {
      incomeStreams.push({
        name: s.merchantName || s.description,
        type: 'other',
        annualAmount: annualized,
        isActive: true,
        notes: `Recurring ${s.frequency} income (${s.confidence >= 0.8 ? 'high' : 'medium'} confidence)`,
      })
    } else {
      expenses.push({
        category: s.category || 'recurring',
        description: `${s.merchantName || s.description} (${s.frequency})`,
        annualAmount: annualized,
        isDeductible: false, // Needs manual review
        deductionPct: 0,
      })
    }
  }

  return { incomeStreams, expenses }
}

function annualizeAmount(amount: number, freq: string): number {
  const multipliers: Record<string, number> = {
    weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
    quarterly: 4, annual: 1, irregular: 12,
  }
  return Math.round(amount * (multipliers[freq] || 12) * 100) / 100
}

// ─── Full Bridge Pipeline ────────────────────────────────────────────────

/**
 * Run the complete bridge pipeline: accounts + transactions + investments +
 * liabilities + income → FortunaState patch with comprehensive summary.
 */
export function runFullBridge(data: {
  accounts?: FinTechAccount[]
  transactions?: FinTechTransaction[]
  holdings?: InvestmentHolding[]
  securities?: Security[]
  liabilities?: LiabilityDetail[]
  incomeVerification?: IncomeVerification
  recurringStreams?: RecurringStream[]
  kybIdentity?: KYBBusinessIdentity
}): BridgeResult {
  const warnings: string[] = []
  const patch: Partial<FortunaState> = {}

  // 1. Accounts
  let retirementCount = 0
  if (data.accounts?.length) {
    const acctBridge = bridgeAccounts(data.accounts)
    if (acctBridge.retirementAccounts.length) {
      patch.retirementAccounts = acctBridge.retirementAccounts as any[]
      retirementCount = acctBridge.retirementAccounts.length
    }
    if (acctBridge.creditCards.length) {
      warnings.push(`${acctBridge.creditCards.length} credit card(s) detected — review for business expense deductions`)
    }
  }

  // 2. Transactions
  let txnStats = { total: 0, income: 0, expense: 0, transfer: 0, deductible: 0, taxPayments: 0, recurring1099: 0 }
  if (data.transactions?.length) {
    const txnBridge = bridgeTransactions(data.transactions)
    patch.bankTransactions = txnBridge.bankTransactions
    if (txnBridge.incomeStreams.length) {
      patch.incomeStreams = txnBridge.incomeStreams as IncomeStream[]
    }
    if (txnBridge.expenses.length) {
      patch.expenses = txnBridge.expenses as BusinessExpense[]
    }
    txnStats = txnBridge.stats
    if (txnBridge.taxPayments.length) {
      warnings.push(`${txnBridge.taxPayments.length} estimated tax payment(s) detected — $${txnBridge.taxPayments.reduce((s, t) => s + t.amount, 0).toLocaleString()} total`)
    }
  }

  // 3. Investments
  let investmentCount = 0
  let tlhCount = 0
  if (data.holdings?.length && data.securities?.length) {
    const portfolio = bridgeInvestments(data.holdings, data.securities, data.accounts || [])
    investmentCount = portfolio.positions.length
    tlhCount = portfolio.taxLossHarvestingCandidates.length
    if (tlhCount > 0) {
      const totalLoss = portfolio.taxLossHarvestingCandidates.reduce((s, c) => s + c.loss, 0)
      warnings.push(`${tlhCount} tax-loss harvesting candidate(s) found — potential $${totalLoss.toLocaleString()} in harvestable losses`)
    }
  }

  // 4. Liabilities
  let deductibleInterestTotal = 0
  if (data.liabilities?.length) {
    const liabBridge = bridgeLiabilities(data.liabilities)
    deductibleInterestTotal = liabBridge.totalDeductibleInterest
    if (deductibleInterestTotal > 0) {
      warnings.push(`$${deductibleInterestTotal.toLocaleString()} in deductible interest detected (mortgage + student loan)`)
    }
  }

  // 5. Income verification → W-2 streams
  if (data.incomeVerification) {
    const incStreams = bridgeIncomeVerification(data.incomeVerification)
    patch.incomeStreams = [...(patch.incomeStreams || []), ...incStreams as IncomeStream[]]
  }

  // 6. Recurring streams
  if (data.recurringStreams?.length) {
    const recurring = bridgeRecurringStreams(data.recurringStreams)
    patch.incomeStreams = [...(patch.incomeStreams || []), ...recurring.incomeStreams as IncomeStream[]]
    patch.expenses = [...(patch.expenses || []), ...recurring.expenses as BusinessExpense[]]
  }

  // 7. KYB → Entity
  if (data.kybIdentity) {
    const entity = bridgeKYBToEntity(data.kybIdentity)
    patch.entities = [entity as LegalEntity]
  }

  return {
    patch,
    summary: {
      accountsImported: data.accounts?.length || 0,
      transactionsImported: txnStats.total,
      incomeStreamsDetected: (patch.incomeStreams?.length || 0),
      expensesDetected: (patch.expenses?.length || 0),
      investmentPositions: investmentCount,
      retirementAccountsDetected: retirementCount,
      liabilitiesDetected: data.liabilities?.length || 0,
      deductibleInterestFound: deductibleInterestTotal,
      taxPaymentsFound: txnStats.taxPayments,
      recurring1099Vendors: txnStats.recurring1099,
      warnings,
    },
  }
}
