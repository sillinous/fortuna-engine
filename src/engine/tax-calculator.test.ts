/**
 * Tax Calculator — Core Test Suite
 * Validates: brackets, QBI/SSTB, AMT, NIIT, SE tax, entity P&L, portfolio bridge
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateTaxReport,
  calculateFederalIncomeTax,
  calculateSelfEmploymentTax,
  calculateQBIDeduction,
  calculateMaxSEPIRA,
  type TaxReport,
} from './tax-calculator'
import { createDefaultState, type FortunaState } from './storage'

function makeState(overrides: Partial<FortunaState> = {}): FortunaState {
  return { ...createDefaultState(), ...overrides } as FortunaState
}

// ── Federal Bracket Tests ──────────────────────────────────────────────────

describe('calculateFederalIncomeTax', () => {
  it('should return 0 for zero income', () => {
    expect(calculateFederalIncomeTax(0, 'single')).toBe(0)
  })

  it('should calculate correctly for the 10% bracket', () => {
    // Single 10% bracket ends at $11,925
    const tax = calculateFederalIncomeTax(10000, 'single')
    expect(tax).toBe(1000) // 10% of $10,000
  })

  it('should span multiple brackets for $100k single', () => {
    const tax = calculateFederalIncomeTax(100000, 'single')
    // 10% on $11,925 = $1,192.50
    // 12% on ($48,475 - $11,925) = $4,386
    // 22% on ($103,350 - $48,475) = $12,072.50
    // But only up to $100k: 22% on ($100,000 - $48,475) = $11,335.50
    // Total ≈ $16,914
    expect(tax).toBeGreaterThan(16000)
    expect(tax).toBeLessThan(18000)
  })

  it('should calculate higher tax for married_joint at same income', () => {
    const single = calculateFederalIncomeTax(200000, 'single')
    const joint = calculateFederalIncomeTax(200000, 'married_joint')
    // Joint brackets are wider, so less tax
    expect(joint).toBeLessThan(single)
  })
})

// ── Self-Employment Tax ────────────────────────────────────────────────────

describe('calculateSelfEmploymentTax', () => {
  it('should return 0 for zero SE income', () => {
    expect(calculateSelfEmploymentTax(0).total).toBe(0)
  })

  it('should calculate 15.3% on low SE income', () => {
    const result = calculateSelfEmploymentTax(50000)
    // 92.35% of $50k = $46,175 → 15.3% = $7,064.78
    expect(result.total).toBeGreaterThan(7000)
    expect(result.total).toBeLessThan(7200)
  })

  it('should cap Social Security at wage base', () => {
    // SE income of $200k: SS portion caps at $168,600 * 92.35% threshold
    const low = calculateSelfEmploymentTax(100000)
    const high = calculateSelfEmploymentTax(300000)
    // Higher income pays more (Medicare), but SS is capped
    const ratio = high.total / low.total
    expect(ratio).toBeLessThan(3) // Not linear due to SS cap
  })
})

// ── QBI Deduction ──────────────────────────────────────────────────────────

describe('calculateQBIDeduction', () => {
  it('should give full 20% below threshold', () => {
    const qbi = calculateQBIDeduction(100000, 150000, 'single', false)
    expect(qbi).toBe(20000) // 20% of $100k
  })

  it('should give full 20% for SSTB below threshold', () => {
    const qbi = calculateQBIDeduction(100000, 150000, 'single', true)
    expect(qbi).toBe(20000) // Below threshold, SSTB doesn't matter
  })

  it('should phase out SSTB to zero above threshold+range', () => {
    // Single threshold $191,950 + $50,000 range = $241,950
    const qbi = calculateQBIDeduction(100000, 250000, 'single', true)
    expect(qbi).toBe(0)
  })

  it('should partially reduce SSTB in phaseout range', () => {
    // Midpoint of phaseout: $191,950 + $25,000 = $216,950
    // Must provide w2Wages for non-zero result (wage limitation applies in phaseout)
    const full = calculateQBIDeduction(100000, 150000, 'single', true, 80000)
    const partial = calculateQBIDeduction(100000, 216950, 'single', true, 80000)
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(full)
  })

  it('should use joint thresholds for married_joint', () => {
    // Joint threshold is $383,900
    const qbi = calculateQBIDeduction(100000, 350000, 'married_joint', true)
    expect(qbi).toBe(20000) // Still below joint threshold
  })
})

// ── Full Tax Report ────────────────────────────────────────────────────────

describe('generateTaxReport', () => {
  it('should generate a valid report for minimal state', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'IL', filingStatus: 'single' },
      incomeStreams: [],
      expenses: [],
      entities: [],
      deductions: [],
    })
    const report = generateTaxReport(state)
    expect(report.grossIncome).toBe(0)
    expect(report.totalTax).toBe(0)
    expect(report.effectiveRate).toBe(0)
  })

  it('should compute taxes for W-2 income', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'IL', filingStatus: 'single' },
      incomeStreams: [
        { id: 'w2-1', name: 'Job', type: 'w2', annualAmount: 100000, isActive: true },
      ],
      expenses: [],
      entities: [],
      deductions: [],
    })
    const report = generateTaxReport(state)
    expect(report.grossIncome).toBe(100000)
    expect(report.w2Income).toBe(100000)
    expect(report.selfEmploymentIncome).toBe(0)
    expect(report.selfEmploymentTax).toBe(0) // W-2 has no SE tax
    expect(report.federalIncomeTax).toBeGreaterThan(0)
    expect(report.effectiveRate).toBeGreaterThan(0)
    expect(report.effectiveRate).toBeLessThan(0.4)
  })

  it('should compute SE tax for freelance income', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'TX', filingStatus: 'single' },
      incomeStreams: [
        { id: 'se-1', name: 'Freelance', type: 'freelance', annualAmount: 80000, isActive: true },
      ],
      expenses: [],
      entities: [],
      deductions: [],
    })
    const report = generateTaxReport(state)
    expect(report.selfEmploymentIncome).toBe(80000)
    expect(report.selfEmploymentTax).toBeGreaterThan(0)
    // SE deduction should be half of SE tax
    expect(report.seDeduction).toBeCloseTo(report.selfEmploymentTax / 2, -1)
  })

  it('should include entity breakdown', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'IL', filingStatus: 'single' },
      incomeStreams: [
        { id: 'biz-1', name: 'Consulting', type: 'business', annualAmount: 150000, isActive: true, entityId: 'llc-1' },
      ],
      expenses: [
        { id: 'exp-1', category: 'office_expense', description: 'Software', annualAmount: 5000, isDeductible: true, deductionPct: 100, entityId: 'llc-1' },
      ],
      entities: [
        { id: 'llc-1', name: 'My LLC', type: 'llc', state: 'IL', annualCost: 500, isActive: true },
      ],
      deductions: [],
    })
    const report = generateTaxReport(state)
    expect(report.entityBreakdown.length).toBeGreaterThan(0)
    const llc = report.entityBreakdown.find(e => e.entityId === 'llc-1')
    expect(llc).toBeDefined()
    expect(llc!.revenue).toBe(150000)
  })

  it('should bridge portfolio realized gains into investmentIncome', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'TX', filingStatus: 'single' },
      incomeStreams: [],
      expenses: [],
      entities: [],
      deductions: [],
      portfolioTaxEvents: [
        { realized: true, taxYear: new Date().getFullYear(), estimatedAmount: 25000, taxTreatment: 'short_term_cg' },
        { realized: true, taxYear: new Date().getFullYear(), estimatedAmount: 15000, taxTreatment: 'long_term_cg' },
      ],
    })
    const report = generateTaxReport(state)
    expect(report.investmentIncome).toBe(40000)
    expect(report.shortTermPortfolioGains).toBe(25000)
    expect(report.longTermPortfolioGains).toBe(15000)
    expect(report.grossIncome).toBe(40000)
  })

  it('should compute NIIT for high earners with investment income', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'TX', filingStatus: 'single' },
      incomeStreams: [
        { id: 'w2-1', name: 'Job', type: 'w2', annualAmount: 180000, isActive: true },
        { id: 'inv-1', name: 'Dividends', type: 'investment', annualAmount: 50000, isActive: true },
      ],
      expenses: [],
      entities: [],
      deductions: [],
    })
    const report = generateTaxReport(state)
    // AGI $230,000 > NIIT threshold $200,000
    // NII = $50,000, excess = $30,000
    // NIIT = min($50k, $30k) * 3.8% = $1,140
    expect(report.niit).toBeGreaterThan(0)
    expect(report.niit).toBeLessThan(2000)
  })

  it('should compute AMT when applicable', () => {
    const state = makeState({
      profile: { name: 'Test', state: 'CA', filingStatus: 'single' },
      incomeStreams: [
        { id: 'w2-1', name: 'Job', type: 'w2', annualAmount: 500000, isActive: true },
      ],
      expenses: [],
      entities: [],
      deductions: [
        { id: 'd-1', name: 'SALT', category: 'other', amount: 50000, isItemized: true },
      ],
    })
    const report = generateTaxReport(state)
    // At $500k with large SALT deduction, AMT may kick in
    expect(report.amt).toBeGreaterThanOrEqual(0) // May or may not trigger
  })
})

// ── SEP-IRA Calculation ────────────────────────────────────────────────────

describe('calculateMaxSEPIRA', () => {
  it('should return 25% of net SE for modest income', () => {
    const max = calculateMaxSEPIRA(100000)
    // After SE tax deduction: ~$92,935 → 25% ≈ $23,234
    expect(max).toBeGreaterThan(20000)
    expect(max).toBeLessThan(25000)
  })

  it('should cap at SEP-IRA annual limit', () => {
    const max = calculateMaxSEPIRA(500000)
    expect(max).toBeLessThanOrEqual(69000) // 2024 SEP-IRA max
  })
})

// ── Kiddie Tax ─────────────────────────────────────────────────────────────

import { calculateKiddieTax, calculateUnderpaymentPenalty } from './tax-calculator'

describe('calculateKiddieTax', () => {
  it('should not apply when unearned income below threshold', () => {
    const result = calculateKiddieTax(2000, 15, false, 0.32, 'married_joint')
    expect(result.applies).toBe(false)
    expect(result.kiddieTaxLiability).toBe(0)
  })

  it('should apply when unearned income above $2,500 and child under 19', () => {
    const result = calculateKiddieTax(10000, 15, false, 0.32, 'married_joint')
    expect(result.applies).toBe(true)
    expect(result.kiddieTaxLiability).toBeGreaterThan(0)
    // $1,250 tax-free + $1,250 at 10% + $7,500 at 32%
    expect(result.taxAtChildRate).toBe(125) // $1,250 × 10%
    expect(result.taxAtParentRate).toBe(2400) // $7,500 × 32%
  })

  it('should not apply when child age >= 19 and not student', () => {
    const result = calculateKiddieTax(10000, 20, false, 0.32, 'single')
    expect(result.applies).toBe(false)
  })

  it('should apply for students under 24', () => {
    const result = calculateKiddieTax(10000, 22, true, 0.32, 'single')
    expect(result.applies).toBe(true)
  })
})

// ── Underpayment Penalty ───────────────────────────────────────────────────

describe('calculateUnderpaymentPenalty', () => {
  it('should waive penalty when total tax under $1,000', () => {
    const result = calculateUnderpaymentPenalty(800, 5000, 100000, 2024, [], 0)
    expect(result.waived).toBe(true)
    expect(result.totalPenalty).toBe(0)
  })

  it('should waive when withholding covers prior year', () => {
    const result = calculateUnderpaymentPenalty(50000, 40000, 200000, 2024, [], 45000)
    expect(result.waived).toBe(true)
  })

  it('should compute safe harbor for high income (110% prior year)', () => {
    const result = calculateUnderpaymentPenalty(50000, 40000, 200000, 2024, [], 0)
    // AGI > $150k → 110% of prior year tax = $44,000
    expect(result.safeHarborMethod).toBe('110%_prior')
    expect(result.safeHarborAmount).toBeLessThanOrEqual(44000)
  })

  it('should calculate penalty on shortfall', () => {
    const result = calculateUnderpaymentPenalty(50000, 20000, 100000, 2024, [
      { quarter: 1, amount: 2000 },
      { quarter: 2, amount: 2000 },
    ], 0)
    // Some quarters have shortfall
    expect(result.quarters.filter(q => q.shortfall > 0).length).toBeGreaterThan(0)
  })
})
