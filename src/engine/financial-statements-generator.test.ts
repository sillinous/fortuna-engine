/**
 * Tests for the Four Financial Statements Generator
 */

import { describe, it, expect } from 'vitest'
import {
  generateFinancialStatements,
  type FinancialStatementsInput,
} from './financial-statements-generator'

// ── Fixtures ─────────────────────────────────────────────────────

/** Minimal valid input: service business with just revenue + labor */
const minimalInput: FinancialStatementsInput = {
  businessName: 'Minimal Test Co',
  period: '2025',
  businessType: 'service',
  primaryRevenue: 100_000,
  laborExpenses: 40_000,
  endingCash: 20_000,
}

/**
 * Full input: product business with all fields.
 * beginningEquity is intentionally omitted so the engine derives it from
 * the balance sheet equation, keeping all four statements consistent.
 */
const fullInput: FinancialStatementsInput = {
  businessName: 'Full Test Corp',
  period: 'FY 2025',
  businessType: 'product',
  primaryRevenue: 500_000,
  otherRevenue: 10_000,
  costOfGoodsSold: 200_000,
  laborExpenses: 80_000,
  facilitiesExpenses: 24_000,
  marketingExpenses: 15_000,
  professionalServices: 8_000,
  technologyExpenses: 6_000,
  insuranceExpenses: 3_600,
  depreciationExpense: 5_000,
  otherOperatingExpenses: 4_000,
  interestExpense: 3_000,
  nonOperatingIncome: 500,
  incomeTaxExpense: 20_000,
  endingCash: 50_000,
  beginningCash: 30_000,
  accountsReceivable: 25_000,
  inventory: 15_000,
  prepaidAndOther: 2_000,
  fixedAssetsGross: 100_000,
  accumulatedDepreciation: 30_000,
  accountsPayable: 12_000,
  accruedLiabilities: 5_000,
  shortTermDebt: 10_000,
  longTermDebt: 40_000,
  // beginningEquity omitted — engine derives it so all statements link
  capitalContributions: 10_000,
  ownerDraws: 30_000,
  capitalExpenditures: 20_000,
  assetSaleProceeds: 0,
  newBorrowings: 5_000,
  debtRepayments: 8_000,
}

// ===================================================================
//  INCOME STATEMENT
// ===================================================================

describe('Income Statement', () => {
  it('computes totalRevenue as sum of primary + other revenue', () => {
    const result = generateFinancialStatements(fullInput)
    expect(result.incomeStatement.totalRevenue).toBe(510_000)
  })

  it('totalRevenue equals primaryRevenue when otherRevenue is omitted', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result.incomeStatement.totalRevenue).toBe(100_000)
  })

  it('grossProfit = totalRevenue - totalCOGS', () => {
    const result = generateFinancialStatements(fullInput)
    const is = result.incomeStatement
    expect(is.grossProfit).toBe(is.totalRevenue - is.totalCOGS)
  })

  it('grossProfit equals totalRevenue for pure service business (no COGS)', () => {
    const result = generateFinancialStatements(minimalInput)
    const is = result.incomeStatement
    expect(is.totalCOGS).toBe(0)
    expect(is.grossProfit).toBe(is.totalRevenue)
  })

  it('operatingIncome = grossProfit - totalOpex', () => {
    const result = generateFinancialStatements(fullInput)
    const is = result.incomeStatement
    expect(is.operatingIncome).toBe(is.grossProfit - is.totalOpex)
  })

  it('netIncome = preTaxIncome - taxExpense', () => {
    const result = generateFinancialStatements(fullInput)
    const is = result.incomeStatement
    expect(is.netIncome).toBe(is.preTaxIncome - is.taxExpense)
  })

  it('estimates tax at 21% of pre-tax income when incomeTaxExpense is omitted', () => {
    const result = generateFinancialStatements(minimalInput)
    const is = result.incomeStatement
    const expectedTax = Math.round(is.preTaxIncome * 0.21)
    expect(is.taxExpense).toBe(expectedTax)
  })

  it('uses provided incomeTaxExpense when supplied', () => {
    const result = generateFinancialStatements(fullInput)
    expect(result.incomeStatement.taxExpense).toBe(20_000)
  })

  it('netMarginPct = (netIncome / totalRevenue) * 100', () => {
    const result = generateFinancialStatements(fullInput)
    const is = result.incomeStatement
    const expected = Math.round((is.netIncome / is.totalRevenue) * 10_000) / 100
    expect(is.netMarginPct).toBe(expected)
  })

  it('does not include COGS line items for a service business', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result.incomeStatement.cogsItems).toHaveLength(0)
  })

  it('estimates depreciation at 10% of gross fixed assets when not provided', () => {
    const input: FinancialStatementsInput = {
      ...minimalInput,
      fixedAssetsGross: 50_000,
    }
    const result = generateFinancialStatements(input)
    const deprItem = result.incomeStatement.opexItems.find(i => i.label === 'Depreciation')
    expect(deprItem?.amount).toBe(5_000)
    expect(deprItem?.note).toContain('estimated')
  })
})

// ===================================================================
//  BALANCE SHEET
// ===================================================================

describe('Balance Sheet', () => {
  it('totalAssets = totalCurrentAssets + totalFixedAssets', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(bs.totalAssets).toBe(bs.totalCurrentAssets + bs.totalFixedAssets)
  })

  it('totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(bs.totalLiabilities).toBe(bs.totalCurrentLiabilities + bs.totalLongTermLiabilities)
  })

  it('liabilitiesAndEquity = totalLiabilities + totalEquity', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(bs.liabilitiesAndEquity).toBe(bs.totalLiabilities + bs.totalEquity)
  })

  it('balance sheet balances (Assets ≈ L+E within $1)', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(Math.abs(bs.totalAssets - bs.liabilitiesAndEquity)).toBeLessThanOrEqual(1)
    expect(bs.isBalanced).toBe(true)
  })

  it('totalCurrentAssets includes cash + AR + inventory + prepaid', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(bs.totalCurrentAssets).toBe(50_000 + 25_000 + 15_000 + 2_000)
  })

  it('fixedNet = fixedGross - accumulatedDepreciation', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(bs.totalFixedAssets).toBe(100_000 - 30_000)
  })

  it('back-derives beginning equity from balance sheet equation when not supplied', () => {
    // fullInput already omits beginningEquity — verify the derivation is correct
    const result = generateFinancialStatements(fullInput)
    const is = result.incomeStatement
    const bs = result.balanceSheet
    const expectedBeginning = bs.totalEquity - is.netIncome - (fullInput.capitalContributions ?? 0) + (fullInput.ownerDraws ?? 0)
    const actual = result.ownerEquityStatement.beginningEquity
    expect(Math.abs(actual - expectedBeginning)).toBeLessThanOrEqual(1)
  })
})

// ===================================================================
//  CASH FLOW STATEMENT
// ===================================================================

describe('Cash Flow Statement', () => {
  it('netCashFromOperations = netIncome + depreciation', () => {
    const result = generateFinancialStatements(fullInput)
    const cf = result.cashFlowStatement
    const depr = result.incomeStatement.opexItems.find(i => i.label === 'Depreciation')?.amount ?? 0
    expect(cf.netCashFromOperations).toBe(result.incomeStatement.netIncome + depr)
  })

  it('netCashFromInvesting = -capex + assetSales', () => {
    const result = generateFinancialStatements(fullInput)
    const cf = result.cashFlowStatement
    expect(cf.netCashFromInvesting).toBe(-20_000 + 0)
  })

  it('netCashFromFinancing = contributions - draws + newBorrowings - repayments', () => {
    const result = generateFinancialStatements(fullInput)
    const cf = result.cashFlowStatement
    expect(cf.netCashFromFinancing).toBe(10_000 - 30_000 + 5_000 - 8_000)
  })

  it('netChangeInCash = sum of all three sections', () => {
    const result = generateFinancialStatements(fullInput)
    const cf = result.cashFlowStatement
    expect(cf.netChangeInCash).toBe(
      cf.netCashFromOperations + cf.netCashFromInvesting + cf.netCashFromFinancing
    )
  })

  it('endingCash matches the supplied ending cash', () => {
    const result = generateFinancialStatements(fullInput)
    expect(result.cashFlowStatement.endingCash).toBe(fullInput.endingCash)
  })

  it('beginningCash uses supplied value when provided', () => {
    const result = generateFinancialStatements(fullInput)
    expect(result.cashFlowStatement.beginningCash).toBe(fullInput.beginningCash)
  })

  it('investing section is empty when no capex or asset sales supplied', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result.cashFlowStatement.investingItems).toHaveLength(0)
    expect(result.cashFlowStatement.netCashFromInvesting).toBe(0)
  })

  it('financing section is empty when no equity or debt activity supplied', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result.cashFlowStatement.financingItems).toHaveLength(0)
    expect(result.cashFlowStatement.netCashFromFinancing).toBe(0)
  })
})

// ===================================================================
//  STATEMENT OF OWNER'S EQUITY
// ===================================================================

describe("Statement of Owner's Equity", () => {
  it('endingEquity = beginningEquity + contributions + netIncome - draws', () => {
    const result = generateFinancialStatements(fullInput)
    const eq = result.ownerEquityStatement
    const expected = eq.beginningEquity + eq.capitalContributions + eq.netIncome - eq.ownerDraws
    expect(Math.abs(eq.endingEquity - expected)).toBeLessThanOrEqual(1)
  })

  it('endingEquity matches balance sheet totalEquity', () => {
    const result = generateFinancialStatements(fullInput)
    expect(Math.abs(result.ownerEquityStatement.endingEquity - result.balanceSheet.totalEquity)).toBeLessThanOrEqual(1)
  })

  it('reports zero contributions and draws when not provided', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result.ownerEquityStatement.capitalContributions).toBe(0)
    expect(result.ownerEquityStatement.ownerDraws).toBe(0)
  })

  it('line items include a final Ending Balance row', () => {
    const result = generateFinancialStatements(fullInput)
    const last = result.ownerEquityStatement.lineItems.at(-1)
    expect(last?.label).toBe('Ending Balance')
    expect(last?.isTotal).toBe(true)
  })
})

// ===================================================================
//  METRICS
// ===================================================================

describe('Key Metrics', () => {
  it('grossMarginPct = (grossProfit / totalRevenue) * 100', () => {
    const result = generateFinancialStatements(fullInput)
    const is = result.incomeStatement
    const expected = Math.round((is.grossProfit / is.totalRevenue) * 10_000) / 100
    expect(result.metrics.grossMarginPct).toBe(expected)
  })

  it('currentRatio = totalCurrentAssets / totalCurrentLiabilities', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    const expected = Math.round((bs.totalCurrentAssets / bs.totalCurrentLiabilities) * 100) / 100
    expect(result.metrics.currentRatio).toBe(expected)
  })

  it('currentRatio is 999 (N/A) when there are no current liabilities', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result.metrics.currentRatio).toBe(999)
  })

  it('workingCapital = totalCurrentAssets - totalCurrentLiabilities', () => {
    const result = generateFinancialStatements(fullInput)
    const bs = result.balanceSheet
    expect(result.metrics.workingCapital).toBe(bs.totalCurrentAssets - bs.totalCurrentLiabilities)
  })
})

// ===================================================================
//  CONSISTENCY & INSIGHTS
// ===================================================================

describe('Consistency & Insights', () => {
  it('isConsistent is true when all four statements link correctly', () => {
    const result = generateFinancialStatements(fullInput)
    expect(result.isConsistent).toBe(true)
  })

  it('generates at least one insight for a loss-making business', () => {
    const lossInput: FinancialStatementsInput = {
      ...minimalInput,
      primaryRevenue: 10_000,
      laborExpenses: 80_000,
    }
    const result = generateFinancialStatements(lossInput)
    const lossInsight = result.insights.some(i => i.includes('net loss'))
    expect(lossInsight).toBe(true)
  })

  it('generates tax estimate insight when incomeTaxExpense is omitted', () => {
    const result = generateFinancialStatements(minimalInput)
    const hasTaxNote = result.insights.some(i => i.includes('estimated'))
    expect(hasTaxNote).toBe(true)
  })

  it('generates no-revenue insight when revenue is zero', () => {
    const noRevInput: FinancialStatementsInput = {
      businessName: 'Empty Co',
      period: '2025',
      businessType: 'service',
      primaryRevenue: 0,
      laborExpenses: 0,
      endingCash: 0,
    }
    const result = generateFinancialStatements(noRevInput)
    expect(result.insights.some(i => i.includes('No revenue'))).toBe(true)
  })

  it('generates strong margin insight when net margin exceeds 20%', () => {
    const highMarginInput: FinancialStatementsInput = {
      ...minimalInput,
      primaryRevenue: 200_000,
      laborExpenses: 20_000,
      incomeTaxExpense: 0,
    }
    const result = generateFinancialStatements(highMarginInput)
    expect(result.insights.some(i => i.includes('Strong net margin'))).toBe(true)
  })
})

// ===================================================================
//  EDGE CASES
// ===================================================================

describe('Edge cases', () => {
  it('handles all-zero optional inputs without throwing', () => {
    expect(() => generateFinancialStatements(minimalInput)).not.toThrow()
  })

  it('handles very large numbers without overflow or NaN', () => {
    const bigInput: FinancialStatementsInput = {
      ...fullInput,
      primaryRevenue: 100_000_000,
      laborExpenses: 50_000_000,
    }
    const result = generateFinancialStatements(bigInput)
    expect(isNaN(result.incomeStatement.netIncome)).toBe(false)
    expect(isFinite(result.incomeStatement.netIncome)).toBe(true)
  })

  it('handles zero-revenue with expenses (loss scenario)', () => {
    const lossInput: FinancialStatementsInput = {
      businessName: 'Startup',
      period: '2025',
      businessType: 'service',
      primaryRevenue: 0,
      laborExpenses: 50_000,
      endingCash: 5_000,
    }
    const result = generateFinancialStatements(lossInput)
    expect(result.incomeStatement.netIncome).toBeLessThan(0)
  })

  it('returns all four statements in every run', () => {
    const result = generateFinancialStatements(minimalInput)
    expect(result).toHaveProperty('incomeStatement')
    expect(result).toHaveProperty('balanceSheet')
    expect(result).toHaveProperty('cashFlowStatement')
    expect(result).toHaveProperty('ownerEquityStatement')
  })
})
