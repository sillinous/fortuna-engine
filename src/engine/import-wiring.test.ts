/**
 * Import Wire-Up Tests
 * Validates OFX transaction → FortunaState categorization and
 * tax return → profile pre-fill logic (pure functions, no PDF.js calls).
 */
import { describe, it, expect } from 'vitest'
import { categorizeTransactions } from './data-import'
import { preFillFortunaFromReturn, type ExtractedReturn } from './tax-return-import'

// ── OFX categorization, income/expense split ──────────────────────────────

describe('OFX transaction categorization for import', () => {
  const rawTxns = [
    { date: '2024-01-15', description: 'DIRECT DEPOSIT PAYROLL ACME CORP', amount: 5000, memo: '' },
    { date: '2024-02-01', description: 'Adobe Creative Cloud', amount: -59.99, memo: '' },
    { date: '2024-02-10', description: 'TRANSFER to savings', amount: -1000, memo: '' },
    { date: '2024-03-01', description: 'Stripe payout business', amount: 2500, memo: '' },
    { date: '2024-03-15', description: 'Google Ads campaign', amount: -300, memo: '' },
  ]

  it('should split income vs expense transactions', () => {
    const categorized = categorizeTransactions(rawTxns)
    const income = categorized.filter(t => t.isIncome)
    const expenses = categorized.filter(t => !t.isIncome && t.autoCategory !== 'transfer')
    const transfers = categorized.filter(t => t.autoCategory === 'transfer')

    expect(income.length).toBeGreaterThanOrEqual(1)  // payroll + stripe
    expect(expenses.length).toBeGreaterThanOrEqual(1) // adobe + google ads
    expect(transfers.length).toBeGreaterThanOrEqual(1) // savings transfer
  })

  it('should mark payroll as salary (W-2 type)', () => {
    const categorized = categorizeTransactions(rawTxns)
    const payroll = categorized.find(t => t.description.includes('PAYROLL'))
    expect(payroll).toBeDefined()
    expect(payroll!.isIncome).toBe(true)
    expect(payroll!.autoCategory).toBe('salary')
  })

  it('should mark Adobe as software subscription', () => {
    const categorized = categorizeTransactions(rawTxns)
    const adobe = categorized.find(t => t.description.includes('Adobe'))
    expect(adobe).toBeDefined()
    expect(adobe!.isIncome).toBe(false)
    expect(adobe!.autoCategory).toBe('software_subscriptions')
  })

  it('should mark Google Ads as advertising', () => {
    const categorized = categorizeTransactions(rawTxns)
    const ads = categorized.find(t => t.description.includes('Google Ads'))
    expect(ads).toBeDefined()
    expect(ads!.autoCategory).toBe('advertising')
  })

  it('should deduplicate using key matching', () => {
    const key = (t: { date: string; description: string; amount: number }) =>
      `${t.date}|${t.description}|${t.amount}`

    const existingKeys = new Set([key(rawTxns[0])]) // payroll already in state
    const newTxns = rawTxns.filter(t => !existingKeys.has(key(t)))
    expect(newTxns.length).toBe(rawTxns.length - 1)
    expect(newTxns.find(t => t.description.includes('PAYROLL'))).toBeUndefined()
  })
})

// ── Tax return pre-fill logic ─────────────────────────────────────────────

describe('preFillFortunaFromReturn', () => {
  const mockReturn: ExtractedReturn = {
    taxYear: 2023,
    filingStatus: 'single',
    forms: [],
    rawText: '',
    confidence: 85,
    warnings: [],
    summary: {
      grossIncome: 120000,
      agi: 105000,
      taxableIncome: 90000,
      totalTax: 18000,
      totalPayments: 20000,
      refundOrOwed: 2000,
      filingStatus: 'single',
      businessIncome: 50000,
      businessExpenses: 15000,
      netBusinessProfit: 35000,
      shortTermGainLoss: 2000,
      longTermGainLoss: 5000,
      selfEmploymentTax: 4945,
      wagesTotal: 70000,
      federalWithheld: 12000,
      estimatedMarginalRate: 0.22,
      estimatedEffectiveRate: 0.15,
    },
  }

  it('should extract filing status', () => {
    const prefill = preFillFortunaFromReturn(mockReturn)
    expect(prefill.filingStatus).toBe('single')
  })

  it('should extract W-2 wages', () => {
    const prefill = preFillFortunaFromReturn(mockReturn)
    expect(prefill.w2Income).toBe(70000)
  })

  it('should extract Schedule C net profit', () => {
    const prefill = preFillFortunaFromReturn(mockReturn)
    expect(prefill.scheduleCIncome).toBe(35000)
  })

  it('should extract Schedule C expenses', () => {
    const prefill = preFillFortunaFromReturn(mockReturn)
    expect(prefill.businessExpenses).toBe(15000)
  })

  it('should extract capital gains', () => {
    const prefill = preFillFortunaFromReturn(mockReturn)
    expect(prefill.shortTermCapGains).toBe(2000)
    expect(prefill.longTermCapGains).toBe(5000)
  })

  it('should extract prior year AGI and tax', () => {
    const prefill = preFillFortunaFromReturn(mockReturn)
    expect(prefill.priorYearAGI).toBe(105000)
    expect(prefill.priorYearTotalTax).toBe(18000)
    expect(prefill.priorTaxYear).toBe(2023)
  })
})
