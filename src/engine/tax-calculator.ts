/**
 * Fortuna Engine - Tax Calculator
 * Real federal + state + SE tax calculations using 2024/2025 brackets
 */

import type { FortunaState, IncomeStream, Deduction, LegalEntity, EntityType } from './storage'

// ==================== 2024 Federal Tax Brackets ====================
const FEDERAL_BRACKETS_2024 = {
  single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
  married_joint: [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
  ],
  married_separate: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 365600, rate: 0.35 },
    { min: 365600, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 16550, rate: 0.10 },
    { min: 16550, max: 63100, rate: 0.12 },
    { min: 63100, max: 100500, rate: 0.22 },
    { min: 100500, max: 191950, rate: 0.24 },
    { min: 191950, max: 243700, rate: 0.32 },
    { min: 243700, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
}

const STANDARD_DEDUCTION_2024: Record<string, number> = {
  single: 14600,
  married_joint: 29200,
  married_separate: 14600,
  head_of_household: 21900,
}

// SE Tax constants
const SE_TAX_RATE = 0.153 // 15.3% (12.4% SS + 2.9% Medicare)
const SS_WAGE_BASE_2024 = 168600
const SE_DEDUCTIBLE_FRACTION = 0.9235 // Only 92.35% of SE income subject
const ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000
const ADDITIONAL_MEDICARE_RATE = 0.009 // 0.9%

// QBI deduction
const QBI_RATE = 0.20
const QBI_THRESHOLD_SINGLE = 191950
const QBI_THRESHOLD_JOINT = 383900

// SEP-IRA / Solo 401k limits
const SEP_IRA_MAX_2024 = 69000
const SEP_IRA_RATE = 0.25 // 25% of net SE income
const SOLO_401K_EMPLOYEE_MAX = 23000 // Under 50

// AMT (Alternative Minimum Tax) 2024
const AMT_EXEMPTION: Record<string, number> = {
  single: 85700, married_joint: 133300, married_separate: 66650, head_of_household: 85700,
}
const AMT_PHASEOUT_START: Record<string, number> = {
  single: 609350, married_joint: 1218700, married_separate: 609350, head_of_household: 609350,
}
const AMT_RATE_1 = 0.26
const AMT_RATE_2 = 0.28
const AMT_RATE_2_THRESHOLD: Record<string, number> = {
  single: 232600, married_joint: 232600, married_separate: 116300, head_of_household: 232600,
}

// NIIT (Net Investment Income Tax) 3.8%
const NIIT_RATE = 0.038
const NIIT_THRESHOLD: Record<string, number> = {
  single: 200000, married_joint: 250000, married_separate: 125000, head_of_household: 200000,
}
const SOLO_401K_EMPLOYEE_MAX_50PLUS = 30500

// Kiddie Tax (Form 8615) — 2024
const KIDDIE_TAX_THRESHOLD = 2500 // First $1,250 tax-free, next $1,250 at child's rate
const KIDDIE_TAX_UNEARNED_LIMIT = 1250
const KIDDIE_TAX_AGE_LIMIT = 19 // Under 19, or under 24 if full-time student
const KIDDIE_TAX_STUDENT_AGE_LIMIT = 24

// Underpayment Penalty (Form 2210) — 2024
const UNDERPAYMENT_PENALTY_RATE = 0.08 // IRS rate (adjusts quarterly, using recent rate)
const SAFE_HARBOR_PCT = 1.00 // 100% of prior year tax (110% if AGI > $150k)
const SAFE_HARBOR_HIGH_INCOME_PCT = 1.10
const SAFE_HARBOR_CURRENT_YEAR_PCT = 0.90 // 90% of current year tax
const HIGH_INCOME_THRESHOLD = 150000

// State tax rates (simplified - using flat or effective rates)
const STATE_TAX_RATES: Record<string, { rate: number; type: 'flat' | 'progressive'; name: string }> = {
  AL: { rate: 0.050, type: 'flat', name: 'Alabama' },
  AK: { rate: 0, type: 'flat', name: 'Alaska' },
  AZ: { rate: 0.025, type: 'flat', name: 'Arizona' },
  AR: { rate: 0.044, type: 'flat', name: 'Arkansas' },
  CA: { rate: 0.093, type: 'progressive', name: 'California' },
  CO: { rate: 0.044, type: 'flat', name: 'Colorado' },
  CT: { rate: 0.050, type: 'progressive', name: 'Connecticut' },
  DE: { rate: 0.066, type: 'progressive', name: 'Delaware' },
  FL: { rate: 0, type: 'flat', name: 'Florida' },
  GA: { rate: 0.055, type: 'flat', name: 'Georgia' },
  HI: { rate: 0.075, type: 'progressive', name: 'Hawaii' },
  ID: { rate: 0.058, type: 'flat', name: 'Idaho' },
  IL: { rate: 0.0495, type: 'flat', name: 'Illinois' },
  IN: { rate: 0.0305, type: 'flat', name: 'Indiana' },
  IA: { rate: 0.038, type: 'flat', name: 'Iowa' },
  KS: { rate: 0.057, type: 'progressive', name: 'Kansas' },
  KY: { rate: 0.040, type: 'flat', name: 'Kentucky' },
  LA: { rate: 0.0425, type: 'progressive', name: 'Louisiana' },
  ME: { rate: 0.0715, type: 'progressive', name: 'Maine' },
  MD: { rate: 0.0575, type: 'progressive', name: 'Maryland' },
  MA: { rate: 0.050, type: 'flat', name: 'Massachusetts' },
  MI: { rate: 0.0425, type: 'flat', name: 'Michigan' },
  MN: { rate: 0.0785, type: 'progressive', name: 'Minnesota' },
  MS: { rate: 0.050, type: 'flat', name: 'Mississippi' },
  MO: { rate: 0.048, type: 'progressive', name: 'Missouri' },
  MT: { rate: 0.059, type: 'progressive', name: 'Montana' },
  NE: { rate: 0.0564, type: 'progressive', name: 'Nebraska' },
  NV: { rate: 0, type: 'flat', name: 'Nevada' },
  NH: { rate: 0, type: 'flat', name: 'New Hampshire' },
  NJ: { rate: 0.0675, type: 'progressive', name: 'New Jersey' },
  NM: { rate: 0.059, type: 'progressive', name: 'New Mexico' },
  NY: { rate: 0.0685, type: 'progressive', name: 'New York' },
  NC: { rate: 0.045, type: 'flat', name: 'North Carolina' },
  ND: { rate: 0.0195, type: 'progressive', name: 'North Dakota' },
  OH: { rate: 0.035, type: 'progressive', name: 'Ohio' },
  OK: { rate: 0.0475, type: 'progressive', name: 'Oklahoma' },
  OR: { rate: 0.099, type: 'progressive', name: 'Oregon' },
  PA: { rate: 0.0307, type: 'flat', name: 'Pennsylvania' },
  RI: { rate: 0.0599, type: 'progressive', name: 'Rhode Island' },
  SC: { rate: 0.064, type: 'progressive', name: 'South Carolina' },
  SD: { rate: 0, type: 'flat', name: 'South Dakota' },
  TN: { rate: 0, type: 'flat', name: 'Tennessee' },
  TX: { rate: 0, type: 'flat', name: 'Texas' },
  UT: { rate: 0.0465, type: 'flat', name: 'Utah' },
  VT: { rate: 0.0875, type: 'progressive', name: 'Vermont' },
  VA: { rate: 0.0575, type: 'progressive', name: 'Virginia' },
  WA: { rate: 0, type: 'flat', name: 'Washington' },
  WV: { rate: 0.0512, type: 'progressive', name: 'West Virginia' },
  WI: { rate: 0.0765, type: 'progressive', name: 'Wisconsin' },
  WY: { rate: 0, type: 'flat', name: 'Wyoming' },
  DC: { rate: 0.085, type: 'progressive', name: 'District of Columbia' },
}

// ==================== Core Calculation Functions ====================

export function calculateFederalIncomeTax(taxableIncome: number, filingStatus: string): number {
  const brackets = FEDERAL_BRACKETS_2024[filingStatus as keyof typeof FEDERAL_BRACKETS_2024] || FEDERAL_BRACKETS_2024.single
  let tax = 0
  let remaining = Math.max(0, taxableIncome)

  for (const bracket of brackets) {
    const taxable = Math.min(remaining, bracket.max - bracket.min)
    if (taxable <= 0) break
    tax += taxable * bracket.rate
    remaining -= taxable
  }

  return Math.round(tax)
}

export function calculateSelfEmploymentTax(netSEIncome: number): {
  socialSecurity: number
  medicare: number
  additionalMedicare: number
  total: number
  deductibleHalf: number
} {
  const taxableBase = netSEIncome * SE_DEDUCTIBLE_FRACTION
  const ssBase = Math.min(taxableBase, SS_WAGE_BASE_2024)
  const socialSecurity = ssBase * 0.124
  const medicare = taxableBase * 0.029
  const additionalMedicare = taxableBase > ADDITIONAL_MEDICARE_THRESHOLD_SINGLE
    ? (taxableBase - ADDITIONAL_MEDICARE_THRESHOLD_SINGLE) * ADDITIONAL_MEDICARE_RATE
    : 0
  const total = socialSecurity + medicare + additionalMedicare
  const deductibleHalf = total / 2

  return {
    socialSecurity: Math.round(socialSecurity),
    medicare: Math.round(medicare),
    additionalMedicare: Math.round(additionalMedicare),
    total: Math.round(total),
    deductibleHalf: Math.round(deductibleHalf),
  }
}

export function calculateSCorpSavings(
  netSEIncome: number,
  reasonableSalary: number
): {
  currentSETax: number
  sCorpSETax: number
  savings: number
  payrollTaxOnSalary: number
  distributionAmount: number
} {
  // Current: full SE tax on all income
  const currentSE = calculateSelfEmploymentTax(netSEIncome)

  // S-Corp: only pay payroll tax on reasonable salary
  const payrollTax = calculateSelfEmploymentTax(reasonableSalary)
  const distributionAmount = netSEIncome - reasonableSalary

  return {
    currentSETax: currentSE.total,
    sCorpSETax: payrollTax.total,
    savings: currentSE.total - payrollTax.total,
    payrollTaxOnSalary: payrollTax.total,
    distributionAmount,
  }
}

export function calculateStateTax(taxableIncome: number, stateCode: string): number {
  const state = STATE_TAX_RATES[stateCode]
  if (!state) return 0
  return Math.round(taxableIncome * state.rate)
}

export function calculateQBIDeduction(
  qbi: number,
  taxableIncomeBeforeQBI: number,
  filingStatus: string,
  isSSTB: boolean = false,  // Specified Service Trade or Business (lawyers, doctors, consultants, etc.)
  w2Wages: number = 0,      // W-2 wages paid by the business
  qualifiedProperty: number = 0, // UBIA of qualified property
): number {
  const threshold = filingStatus === 'married_joint' ? QBI_THRESHOLD_JOINT : QBI_THRESHOLD_SINGLE
  const phaseOutRange = filingStatus === 'married_joint' ? 100000 : 50000
  const phaseOutEnd = threshold + phaseOutRange

  // Below threshold: full 20% deduction regardless of SSTB status
  if (taxableIncomeBeforeQBI <= threshold) {
    return Math.round(qbi * QBI_RATE)
  }

  // SSTB: deduction phases to ZERO above threshold+phaseout
  if (isSSTB) {
    if (taxableIncomeBeforeQBI >= phaseOutEnd) return 0
    // In phaseout range: reduce applicable QBI percentage
    const phasePct = 1 - (taxableIncomeBeforeQBI - threshold) / phaseOutRange
    const applicableQBI = qbi * phasePct
    const applicableWages = w2Wages * phasePct
    const applicableProperty = qualifiedProperty * phasePct
    // Apply W-2/UBIA limitation on the phased amount
    const wageLimit = Math.max(applicableWages * 0.50, applicableWages * 0.25 + applicableProperty * 0.025)
    return Math.round(Math.min(applicableQBI * QBI_RATE, wageLimit * QBI_RATE))
  }

  // Non-SSTB above threshold: W-2 wage / UBIA limitation phases in
  if (taxableIncomeBeforeQBI >= phaseOutEnd) {
    // Fully subject to W-2/UBIA limitation
    const wageLimit = Math.max(w2Wages * 0.50, w2Wages * 0.25 + qualifiedProperty * 0.025)
    return Math.round(Math.min(qbi * QBI_RATE, wageLimit > 0 ? wageLimit : qbi * QBI_RATE))
  }

  // In phaseout range: blend between full deduction and limited
  const phasePct = (taxableIncomeBeforeQBI - threshold) / phaseOutRange
  const fullDeduction = qbi * QBI_RATE
  const wageLimit = Math.max(w2Wages * 0.50, w2Wages * 0.25 + qualifiedProperty * 0.025)
  const limitedDeduction = wageLimit > 0 ? Math.min(qbi * QBI_RATE, wageLimit) : fullDeduction
  const reduction = (fullDeduction - limitedDeduction) * phasePct
  return Math.round(fullDeduction - reduction)
}

export function calculateMaxSEPIRA(netSEIncome: number): number {
  // SEP-IRA max is 25% of net SE earnings (after SE tax deduction)
  const seTax = calculateSelfEmploymentTax(netSEIncome)
  const netAfterSE = netSEIncome - seTax.deductibleHalf
  const maxContribution = Math.min(netAfterSE * SEP_IRA_RATE, SEP_IRA_MAX_2024)
  return Math.round(Math.max(0, maxContribution))
}

export function calculateMaxSolo401k(netSEIncome: number, age: number): {
  employeeMax: number
  employerMax: number
  totalMax: number
} {
  const seTax = calculateSelfEmploymentTax(netSEIncome)
  const netAfterSE = netSEIncome - seTax.deductibleHalf
  const employeeMax = age >= 50 ? SOLO_401K_EMPLOYEE_MAX_50PLUS : SOLO_401K_EMPLOYEE_MAX
  const employerMax = Math.min(netAfterSE * 0.25, SEP_IRA_MAX_2024 - employeeMax)
  return {
    employeeMax,
    employerMax: Math.round(Math.max(0, employerMax)),
    totalMax: Math.round(Math.min(employeeMax + Math.max(0, employerMax), SEP_IRA_MAX_2024)),
  }
}

// ==================== Kiddie Tax (Form 8615) ====================

export interface KiddieTaxResult {
  dependentName: string
  age: number
  unearnedIncome: number
  taxAtChildRate: number
  taxAtParentRate: number
  kiddieTaxLiability: number
  applies: boolean
  reason: string
}

export function calculateKiddieTax(
  unearnedIncome: number,
  dependentAge: number,
  isStudent: boolean,
  parentMarginalRate: number,
  parentFilingStatus: string,
): KiddieTaxResult {
  const ageLimit = isStudent ? KIDDIE_TAX_STUDENT_AGE_LIMIT : KIDDIE_TAX_AGE_LIMIT
  const applies = dependentAge < ageLimit && unearnedIncome > KIDDIE_TAX_THRESHOLD

  if (!applies) {
    return {
      dependentName: '', age: dependentAge, unearnedIncome,
      taxAtChildRate: 0, taxAtParentRate: 0, kiddieTaxLiability: 0,
      applies: false,
      reason: dependentAge >= ageLimit
        ? `Age ${dependentAge} is at/above the ${ageLimit} limit`
        : `Unearned income $${unearnedIncome.toLocaleString()} is below $${KIDDIE_TAX_THRESHOLD} threshold`,
    }
  }

  // First $1,250: tax-free. Next $1,250: child's rate (10%). Above $2,500: parent's rate
  const taxFreeAmount = KIDDIE_TAX_UNEARNED_LIMIT
  const childRateAmount = Math.min(KIDDIE_TAX_UNEARNED_LIMIT, Math.max(0, unearnedIncome - taxFreeAmount))
  const parentRateAmount = Math.max(0, unearnedIncome - KIDDIE_TAX_THRESHOLD)

  const taxAtChildRate = Math.round(childRateAmount * 0.10)
  const taxAtParentRate = Math.round(parentRateAmount * parentMarginalRate)

  return {
    dependentName: '', age: dependentAge, unearnedIncome,
    taxAtChildRate, taxAtParentRate,
    kiddieTaxLiability: taxAtChildRate + taxAtParentRate,
    applies: true,
    reason: `$${parentRateAmount.toLocaleString()} above $${KIDDIE_TAX_THRESHOLD} threshold taxed at parent's ${(parentMarginalRate * 100).toFixed(0)}% rate`,
  }
}

/** Apply kiddie tax across all dependents with unearned income */
export function calculateAllKiddieTax(
  state: FortunaState,
  parentMarginalRate: number,
): KiddieTaxResult[] {
  const household = state.household
  if (!household?.dependents?.length) return []

  return household.dependents
    .filter(d => d.unearnedIncome && d.unearnedIncome > 0)
    .map(d => {
      const result = calculateKiddieTax(
        d.unearnedIncome!,
        d.age,
        d.isStudent || false,
        parentMarginalRate,
        state.profile.filingStatus,
      )
      result.dependentName = d.name
      return result
    })
    .filter(r => r.applies)
}

// ==================== Underpayment Penalty (Form 2210) ====================

export interface UnderpaymentPenaltyResult {
  annualRequired: number
  safeHarborAmount: number
  safeHarborMethod: '100%_prior' | '110%_prior' | '90%_current'
  quarterlyRequired: number
  quarters: {
    quarter: 1 | 2 | 3 | 4
    dueDate: string
    required: number
    paid: number
    shortfall: number
    daysLate: number
    penalty: number
  }[]
  totalPenalty: number
  waived: boolean
  waiverReason?: string
}

export function calculateUnderpaymentPenalty(
  currentYearTax: number,
  priorYearTax: number,
  priorYearAGI: number,
  taxYear: number,
  payments: { quarter: number; amount: number; paidDate?: string }[],
  withholdingTotal: number,
): UnderpaymentPenaltyResult {
  // Safe harbor: 100% of prior year (110% if AGI > $150k), or 90% of current year
  const priorYearPct = priorYearAGI > HIGH_INCOME_THRESHOLD
    ? SAFE_HARBOR_HIGH_INCOME_PCT : SAFE_HARBOR_PCT
  const safeHarborPrior = Math.round(priorYearTax * priorYearPct)
  const safeHarborCurrent = Math.round(currentYearTax * SAFE_HARBOR_CURRENT_YEAR_PCT)
  const safeHarborAmount = Math.min(safeHarborPrior, safeHarborCurrent)
  const safeHarborMethod = safeHarborAmount === safeHarborPrior
    ? (priorYearPct > 1 ? '110%_prior' : '100%_prior') : '90%_current'

  // Required estimated payments = safe harbor minus withholding
  const annualRequired = Math.max(0, safeHarborAmount - withholdingTotal)
  const quarterlyRequired = Math.round(annualRequired / 4)

  const dueDates = [
    { quarter: 1 as const, dueDate: `${taxYear}-04-15` },
    { quarter: 2 as const, dueDate: `${taxYear}-06-15` },
    { quarter: 3 as const, dueDate: `${taxYear}-09-15` },
    { quarter: 4 as const, dueDate: `${taxYear + 1}-01-15` },
  ]

  const now = new Date()
  let totalPenalty = 0

  const quarters = dueDates.map(q => {
    const payment = payments.find(p => p.quarter === q.quarter)
    const paid = payment?.amount || 0
    const shortfall = Math.max(0, quarterlyRequired - paid)

    // Calculate days late (from due date to payment date or now)
    const dueDate = new Date(q.dueDate)
    const paidDate = payment?.paidDate ? new Date(payment.paidDate) : now
    const daysLate = shortfall > 0 ? Math.max(0, Math.round((Math.min(paidDate.getTime(), now.getTime()) - dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0

    // Penalty: daily rate on shortfall
    const dailyRate = UNDERPAYMENT_PENALTY_RATE / 365
    const penalty = Math.round(shortfall * dailyRate * daysLate)
    totalPenalty += penalty

    return {
      quarter: q.quarter,
      dueDate: q.dueDate,
      required: quarterlyRequired,
      paid,
      shortfall,
      daysLate,
      penalty,
    }
  })

  // Waiver: no penalty if total tax < $1,000 or if withholding covers 100% of prior year
  const waived = currentYearTax < 1000 || withholdingTotal >= priorYearTax
  if (waived) totalPenalty = 0

  return {
    annualRequired,
    safeHarborAmount,
    safeHarborMethod,
    quarterlyRequired,
    quarters,
    totalPenalty: waived ? 0 : totalPenalty,
    waived,
    waiverReason: currentYearTax < 1000
      ? 'Total tax under $1,000 — no penalty applies'
      : withholdingTotal >= priorYearTax
        ? 'W-2 withholding covers 100% of prior year tax'
        : undefined,
  }
}

// ==================== Comprehensive Tax Report ====================

// ─── Entity-Level P&L (metamodel v9) ─────────────────────────────────

export interface EntityPnL {
  entityId: string
  entityName: string
  entityType: string
  revenue: number
  expenses: number
  depreciation: number
  netIncome: number
  // How this entity's income reaches the personal return
  flowThrough: 'schedule_c' | 'k1' | 'w2_salary' | 'corporate' | 'personal'
  seTaxableAmount: number   // Amount subject to SE tax
  qbiEligibleAmount: number // Amount eligible for §199A
  officerSalary: number     // S-Corp/C-Corp W-2 salary
  distributions: number     // S-Corp distributions (not subject to SE)
}

export interface TaxReport {
  // Income
  grossIncome: number
  w2Income: number
  selfEmploymentIncome: number
  investmentIncome: number
  otherIncome: number

  // Adjustments
  seDeduction: number
  retirementDeduction: number
  totalAdjustments: number
  agi: number

  // Deductions
  standardDeduction: number
  itemizedDeductions: number
  deductionUsed: 'standard' | 'itemized'
  deductionAmount: number
  qbiDeduction: number

  // Taxable Income
  taxableIncome: number

  // Taxes
  federalIncomeTax: number
  selfEmploymentTax: number
  stateTax: number
  amt: number                    // Alternative Minimum Tax
  niit: number                   // Net Investment Income Tax (3.8%)
  totalTax: number
  effectiveRate: number
  marginalRate: number

  // Take-home
  afterTaxIncome: number

  // W-2 withholding tracking
  w2FederalWithheld: number
  w2StateWithheld: number
  w2FICAWithheld: number
  w2PretaxDeductions: number
  w2EmployerMatch: number
  netTaxOwed: number

  // Optimization potential
  maxSEPIRA: number
  currentRetirementContributions: number
  retirementGap: number
  sCorpSavings: number
  identifiedSavings: number

  // Entity breakdown (metamodel v9)
  entityBreakdown: EntityPnL[]

  // Portfolio gains breakdown (v10.6)
  shortTermPortfolioGains: number
  longTermPortfolioGains: number
}

export function generateTaxReport(state: FortunaState): TaxReport {
  const { profile, incomeStreams, expenses, deductions, entities } = state

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 1: Build entity-level P&L
  // ═══════════════════════════════════════════════════════════════════

  // Collect all entity IDs (always include 'personal')
  const entityIds = new Set<string>(['personal'])
  for (const e of entities) if (e.isActive) entityIds.add(e.id)

  // Build entity lookup
  const entityMap = new Map<string, LegalEntity>()
  for (const e of entities) entityMap.set(e.id, e)

  // Group active income by entityId
  const incomeByEntity = new Map<string, IncomeStream[]>()
  for (const s of incomeStreams.filter(s => s.isActive)) {
    const eid = s.entityId || 'personal'
    if (!incomeByEntity.has(eid)) incomeByEntity.set(eid, [])
    incomeByEntity.get(eid)!.push(s)
  }

  // Group expenses by entityId
  const expenseByEntity = new Map<string, typeof expenses>()
  for (const ex of expenses.filter(e => e.isDeductible)) {
    const eid = ex.entityId || 'personal'
    if (!expenseByEntity.has(eid)) expenseByEntity.set(eid, [])
    expenseByEntity.get(eid)!.push(ex)
  }

  // Group depreciation by entityId
  const depAssets = state.depreciationAssets || []
  const depByEntity = new Map<string, number>()
  for (const a of depAssets.filter(a => a.isActive)) {
    const eid = a.entityId || 'personal'
    // Simple annual depreciation estimate
    const annualDep = a.method === 'section_179'
      ? a.purchasePrice * (a.businessUsePct / 100)
      : (a.purchasePrice - (a.salvageValue || 0)) / Math.max(1, a.usefulLifeYears) * (a.businessUsePct / 100)
    depByEntity.set(eid, (depByEntity.get(eid) || 0) + annualDep)
  }

  // Compute per-entity P&L
  const entityBreakdown: EntityPnL[] = []
  let totalSEIncome = 0
  let totalSETaxable = 0
  let totalQBIEligible = 0
  let totalOfficerSalary = 0

  for (const eid of entityIds) {
    const entityStreams = incomeByEntity.get(eid) || []
    const entityExpenses = expenseByEntity.get(eid) || []
    const entityDep = depByEntity.get(eid) || 0
    const entity = entityMap.get(eid)
    const entityType = entity?.type || 'personal'
    const entityName = entity?.name || 'Personal'

    const revenue = entityStreams.reduce((s, i) => s + i.annualAmount, 0)
    const expenseTotal = entityExpenses.reduce((s, e) => s + (e.annualAmount * e.deductionPct / 100), 0)
    const netIncome = Math.max(0, revenue - expenseTotal - entityDep)

    // Determine flow-through type and SE tax treatment
    let flowThrough: EntityPnL['flowThrough'] = 'personal'
    let seTaxableAmount = 0
    let qbiEligibleAmount = 0
    let officerSalary = 0
    let distributions = 0

    if (eid === 'personal') {
      // Personal income: W-2 not subject to SE, investments not SE
      flowThrough = 'personal'
      const seStreams = entityStreams.filter(s => ['business', 'freelance'].includes(s.type))
      seTaxableAmount = seStreams.reduce((s, i) => s + i.annualAmount, 0) - expenseTotal - entityDep
      seTaxableAmount = Math.max(0, seTaxableAmount)
    } else if (entityType === 'sole_prop' || entityType === 'llc') {
      // Schedule C: all net income subject to SE tax
      flowThrough = 'schedule_c'
      seTaxableAmount = netIncome
      qbiEligibleAmount = netIncome
    } else if (entityType === 'llc_scorp' || entityType === 'scorp') {
      // S-Corp: salary subject to FICA, distributions are not
      flowThrough = 'k1'
      officerSalary = entity?.officerSalary || Math.round(netIncome * 0.6)
      officerSalary = Math.min(officerSalary, netIncome) // Can't exceed net
      distributions = Math.max(0, netIncome - officerSalary)
      seTaxableAmount = 0 // Salary goes through payroll, not SE tax
      qbiEligibleAmount = distributions // QBI on distributions
      totalOfficerSalary += officerSalary
    } else if (entityType === 'ccorp') {
      // C-Corp: entity-level tax, salary is deductible
      flowThrough = 'corporate'
      officerSalary = entity?.officerSalary || Math.round(netIncome * 0.5)
      officerSalary = Math.min(officerSalary, netIncome)
      distributions = 0 // Dividends taxed separately (not modeled in basic calc)
      totalOfficerSalary += officerSalary
    } else if (entityType === 'partnership') {
      flowThrough = 'k1'
      const ownerPct = (entity?.ownershipPct || 100) / 100
      seTaxableAmount = netIncome * ownerPct
      qbiEligibleAmount = netIncome * ownerPct
    }

    totalSEIncome += (flowThrough === 'schedule_c' || eid === 'personal') ? seTaxableAmount : 0
    totalSETaxable += seTaxableAmount
    totalQBIEligible += qbiEligibleAmount

    entityBreakdown.push({
      entityId: eid,
      entityName,
      entityType,
      revenue,
      expenses: expenseTotal + entityDep,
      depreciation: entityDep,
      netIncome,
      flowThrough,
      seTaxableAmount,
      qbiEligibleAmount,
      officerSalary,
      distributions,
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 2: Aggregate to personal return (backward-compatible)
  // ═══════════════════════════════════════════════════════════════════

  // Categorize income by type (for backward compat fields)
  const w2Streams = incomeStreams.filter(s => s.type === 'w2' && s.isActive)
  const w2Income = w2Streams.reduce((sum, s) => sum + s.annualAmount, 0) + totalOfficerSalary
  const seIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)
  const investmentIncome = incomeStreams
    .filter(s => s.type === 'investment' && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  // Bridge portfolio realized gains from portfolioTaxEvents[]
  const portfolioTaxEvents = (state as any).portfolioTaxEvents || []
  const realizedGains = portfolioTaxEvents
    .filter((e: any) => e.realized && e.taxYear === (state.taxYear || new Date().getFullYear()))
    .reduce((sum: number, e: any) => sum + (e.estimatedAmount || 0), 0)
  const shortTermPortfolioGains = portfolioTaxEvents
    .filter((e: any) => e.realized && e.taxTreatment === 'short_term_cg' && e.taxYear === (state.taxYear || new Date().getFullYear()))
    .reduce((sum: number, e: any) => sum + (e.estimatedAmount || 0), 0)
  const longTermPortfolioGains = Math.max(0, realizedGains - shortTermPortfolioGains)

  const totalInvestmentIncome = investmentIncome + realizedGains

  const otherIncome = incomeStreams
    .filter(s => ['rental', 'passive', 'other'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  const grossIncome = w2Income + seIncome + totalInvestmentIncome + otherIncome

  // W-2 withholding
  let w2FederalWithheld = 0, w2StateWithheld = 0, w2FICAWithheld = 0
  let w2PretaxDeductions = 0, w2EmployerMatch = 0
  for (const s of w2Streams) {
    if (s.w2) {
      w2FederalWithheld += s.w2.federalWithholding || 0
      w2StateWithheld += s.w2.stateWithholding || 0
      w2FICAWithheld += s.w2.ficaWithheld || 0
      w2PretaxDeductions += (s.w2.pretax401k || 0) + (s.w2.pretaxHealthInsurance || 0)
        + (s.w2.pretaxHSA || 0) + (s.w2.otherPretaxDeductions || 0)
      w2EmployerMatch += s.w2.employerMatch401k || 0
    }
  }

  // Business expenses total (entity-aware: sum across all entities)
  const totalBusinessExpenses = entityBreakdown
    .filter(e => e.entityId !== 'personal')
    .reduce((s, e) => s + e.expenses, 0)
    + (expenseByEntity.get('personal') || [])
      .reduce((s, e) => s + (e.annualAmount * e.deductionPct / 100), 0)

  // Net SE income (entity-aware)
  const netSEIncome = entityBreakdown
    .filter(e => e.flowThrough === 'schedule_c')
    .reduce((s, e) => s + e.seTaxableAmount, 0)
    + entityBreakdown.find(e => e.entityId === 'personal')?.seTaxableAmount || 0

  // S-Corp detection
  const hasScorp = entityBreakdown.some(e =>
    e.flowThrough === 'k1' && (e.entityType === 'llc_scorp' || e.entityType === 'scorp')
  )

  // SE tax on non-S-Corp income
  const seTax = calculateSelfEmploymentTax(netSEIncome)
  const seDeduction = seTax.deductibleHalf

  // S-Corp officer salary SE tax (employer+employee FICA)
  const scorpFICA = totalOfficerSalary > 0
    ? Math.round(totalOfficerSalary * 0.153) // Combined employer+employee share
    : 0

  // Retirement
  const manualRetirementContributions = deductions
    .filter(d => d.category === 'retirement')
    .reduce((sum, d) => sum + d.amount, 0)
  const retirementContributions = manualRetirementContributions

  const totalAdjustments = seDeduction + retirementContributions
  const agi = grossIncome - totalBusinessExpenses - totalAdjustments

  // Standard vs Itemized
  const standardDed = STANDARD_DEDUCTION_2024[profile.filingStatus] || 14600
  const itemizedTotal = deductions
    .filter(d => d.isItemized)
    .reduce((sum, d) => sum + d.amount, 0)
  const useItemized = itemizedTotal > standardDed
  const deductionAmount = useItemized ? itemizedTotal : standardDed

  // QBI (entity-aware with SSTB detection)
  const qbiEntities = entityBreakdown.filter(e => e.qbiEligibleAmount > 0)
  // Aggregate SSTB status — if ANY QBI entity is SSTB, apply phaseout to that portion
  const sstbQBI = qbiEntities.filter(e => entityMap.get(e.entityId)?.isSSTB).reduce((s, e) => s + e.qbiEligibleAmount, 0)
  const nonSSTBQBI = totalQBIEligible - sstbQBI
  const totalW2Wages = qbiEntities.reduce((s, e) => s + (entityMap.get(e.entityId)?.w2WagesPaid || 0), 0)
  const totalQualifiedProp = qbiEntities.reduce((s, e) => s + (entityMap.get(e.entityId)?.qualifiedPropertyUBIA || 0), 0)

  const sstbDeduction = sstbQBI > 0
    ? calculateQBIDeduction(sstbQBI, agi - deductionAmount, profile.filingStatus, true, totalW2Wages, totalQualifiedProp)
    : 0
  const nonSSTBDeduction = nonSSTBQBI > 0
    ? calculateQBIDeduction(nonSSTBQBI, agi - deductionAmount, profile.filingStatus, false, totalW2Wages, totalQualifiedProp)
    : 0
  const qbiDeduction = sstbDeduction + nonSSTBDeduction

  // Taxable income
  const taxableIncome = Math.max(0, agi - deductionAmount - qbiDeduction)

  // Federal tax
  const federalTax = calculateFederalIncomeTax(taxableIncome, profile.filingStatus)

  // Total SE tax (sole prop SE + S-Corp FICA)
  const actualSETax = seTax.total + scorpFICA

  // W-2 FICA estimate
  const estimatedW2FICA = w2FICAWithheld > 0 ? w2FICAWithheld : Math.round(
    (w2Income - totalOfficerSalary) * 0.0765 // Only on actual W-2, not officer salary already counted
  )

  // State tax
  const stateT = calculateStateTax(taxableIncome, profile.state)

  // ── AMT (Alternative Minimum Tax) ──
  const amtExemption = AMT_EXEMPTION[profile.filingStatus] || AMT_EXEMPTION.single
  const amtPhaseoutStart = AMT_PHASEOUT_START[profile.filingStatus] || AMT_PHASEOUT_START.single
  const amtRate2Threshold = AMT_RATE_2_THRESHOLD[profile.filingStatus] || AMT_RATE_2_THRESHOLD.single

  // AMTI = taxable income + add-backs (SALT, misc itemized, ISO spreads)
  const saltAddBack = useItemized ? Math.min(itemizedTotal * 0.3, 10000) : 0 // SALT cap already limits this, but pre-TCJA had unlimited
  const amti = taxableIncome + saltAddBack
  // Phase out exemption
  const amtExemptionReduction = amti > amtPhaseoutStart ? Math.min(amtExemption, (amti - amtPhaseoutStart) * 0.25) : 0
  const effectiveExemption = Math.max(0, amtExemption - amtExemptionReduction)
  const amtBase = Math.max(0, amti - effectiveExemption)
  // Two-rate AMT
  const amtTax = amtBase <= amtRate2Threshold
    ? amtBase * AMT_RATE_1
    : amtRate2Threshold * AMT_RATE_1 + (amtBase - amtRate2Threshold) * AMT_RATE_2
  // AMT = excess over regular tax
  const amt = Math.max(0, Math.round(amtTax - federalTax))

  // ── NIIT (Net Investment Income Tax — 3.8% surtax) ──
  const niitThreshold = NIIT_THRESHOLD[profile.filingStatus] || NIIT_THRESHOLD.single
  const nii = totalInvestmentIncome // interest, dividends, capital gains, portfolio realized gains
  const niit = agi > niitThreshold && nii > 0
    ? Math.round(Math.min(nii, agi - niitThreshold) * NIIT_RATE)
    : 0

  // Totals (now includes AMT + NIIT)
  const totalTax = federalTax + actualSETax + stateT + amt + niit
  const netTaxOwed = totalTax - w2FederalWithheld - w2StateWithheld

  // S-Corp savings (what they'd save by converting remaining sole prop to S-Corp)
  const unconvertedSEIncome = entityBreakdown
    .filter(e => e.flowThrough === 'schedule_c')
    .reduce((s, e) => s + e.netIncome, 0)
  const reasonableSalary = Math.round(unconvertedSEIncome * 0.6)
  const scorpCalc = unconvertedSEIncome > 0
    ? calculateSCorpSavings(unconvertedSEIncome, reasonableSalary)
    : { savings: 0, soleProptax: 0, scorpTax: 0 }

  // Retirement gap
  const maxSEP = calculateMaxSEPIRA(netSEIncome > 0 ? netSEIncome : unconvertedSEIncome)
  const retirementGap = Math.max(0, maxSEP - retirementContributions)

  // Marginal rate
  const brackets = FEDERAL_BRACKETS_2024[profile.filingStatus as keyof typeof FEDERAL_BRACKETS_2024] || FEDERAL_BRACKETS_2024.single
  let marginalRate = 0.10
  for (const bracket of brackets) {
    if (taxableIncome > bracket.min) marginalRate = bracket.rate
  }

  return {
    grossIncome,
    w2Income,
    selfEmploymentIncome: seIncome,
    investmentIncome: totalInvestmentIncome,
    otherIncome,
    seDeduction,
    retirementDeduction: retirementContributions,
    totalAdjustments,
    agi,
    standardDeduction: standardDed,
    itemizedDeductions: itemizedTotal,
    deductionUsed: useItemized ? 'itemized' : 'standard',
    deductionAmount,
    qbiDeduction,
    taxableIncome,
    federalIncomeTax: federalTax,
    selfEmploymentTax: actualSETax,
    stateTax: stateT,
    amt,
    niit,
    totalTax,
    effectiveRate: grossIncome > 0 ? totalTax / grossIncome : 0,
    marginalRate,
    afterTaxIncome: grossIncome - totalTax,
    w2FederalWithheld,
    w2StateWithheld,
    w2FICAWithheld: estimatedW2FICA,
    w2PretaxDeductions,
    w2EmployerMatch,
    netTaxOwed,
    maxSEPIRA: maxSEP,
    currentRetirementContributions: retirementContributions,
    retirementGap,
    sCorpSavings: scorpCalc.savings,
    identifiedSavings: scorpCalc.savings + retirementGap * marginalRate,
    entityBreakdown,
    shortTermPortfolioGains,
    longTermPortfolioGains,
  }
}

// Entity comparison for a given income level
export interface EntityComparison {
  type: string
  label: string
  totalTax: number
  effectiveRate: number
  seTax: number
  federalTax: number
  stateTax: number
  annualCost: number
  netAfterTax: number
  liabilityProtection: boolean
  score: number
}

export function compareEntities(netSEIncome: number, profile: FortunaState['profile']): EntityComparison[] {
  const { filingStatus, state: stateCode } = profile
  const standardDed = STANDARD_DEDUCTION_2024[filingStatus] || 14600

  function calcForEntity(type: string): EntityComparison {
    let seTax = 0
    let adjustedIncome = netSEIncome
    let annualCost = 0
    let label = ''
    let liabilityProtection = false

    switch (type) {
      case 'sole_prop':
        label = 'Sole Proprietorship'
        seTax = calculateSelfEmploymentTax(netSEIncome).total
        adjustedIncome = netSEIncome - calculateSelfEmploymentTax(netSEIncome).deductibleHalf
        annualCost = 0
        break
      case 'llc':
        label = 'Single-Member LLC'
        seTax = calculateSelfEmploymentTax(netSEIncome).total
        adjustedIncome = netSEIncome - calculateSelfEmploymentTax(netSEIncome).deductibleHalf
        annualCost = 300
        liabilityProtection = true
        break
      case 'llc_scorp': {
        label = 'LLC + S-Corp Election'
        const salary = Math.round(netSEIncome * 0.6)
        seTax = calculateSelfEmploymentTax(salary).total
        adjustedIncome = netSEIncome - seTax / 2
        annualCost = 2000
        liabilityProtection = true
        break
      }
      case 'ccorp':
        label = 'C-Corporation'
        seTax = 0
        annualCost = 5000
        liabilityProtection = true
        // C-Corp: 21% flat rate, then personal tax on distributions
        const corpTax = netSEIncome * 0.21
        const afterCorpIncome = netSEIncome - corpTax - annualCost
        const personalTax = calculateFederalIncomeTax(Math.max(0, afterCorpIncome - standardDed), filingStatus)
        const stTax = calculateStateTax(Math.max(0, afterCorpIncome - standardDed), stateCode)
        return {
          type, label,
          totalTax: Math.round(corpTax + personalTax + stTax),
          effectiveRate: (corpTax + personalTax + stTax) / netSEIncome,
          seTax: 0,
          federalTax: Math.round(corpTax + personalTax),
          stateTax: stTax,
          annualCost,
          netAfterTax: Math.round(netSEIncome - corpTax - personalTax - stTax - annualCost),
          liabilityProtection,
          score: 0, // calculated below
        }
    }

    const qbi = type !== 'ccorp' ? calculateQBIDeduction(netSEIncome, adjustedIncome, filingStatus) : 0
    const taxableIncome = Math.max(0, adjustedIncome - standardDed - qbi)
    const fedTax = calculateFederalIncomeTax(taxableIncome, filingStatus)
    const stTax = calculateStateTax(taxableIncome, stateCode)
    const totalTax = fedTax + seTax + stTax

    return {
      type, label,
      totalTax,
      effectiveRate: netSEIncome > 0 ? totalTax / netSEIncome : 0,
      seTax,
      federalTax: fedTax,
      stateTax: stTax,
      annualCost,
      netAfterTax: Math.round(netSEIncome - totalTax - annualCost),
      liabilityProtection,
      score: 0,
    }
  }

  const results = ['sole_prop', 'llc', 'llc_scorp', 'ccorp'].map(calcForEntity)

  // Score entities (lower tax + protection = higher score)
  const maxNet = Math.max(...results.map(r => r.netAfterTax))
  const minNet = Math.min(...results.map(r => r.netAfterTax))
  const range = maxNet - minNet || 1

  results.forEach(r => {
    let score = ((r.netAfterTax - minNet) / range) * 70 // 70% weight on net income
    if (r.liabilityProtection) score += 20 // 20% for liability protection
    if (r.type === 'llc_scorp') score += 10 // Small bonus for balanced approach
    r.score = Math.round(Math.min(100, score))
  })

  return results.sort((a, b) => b.score - a.score)
}

export { STATE_TAX_RATES, STANDARD_DEDUCTION_2024, FEDERAL_BRACKETS_2024 }

// ─── Portfolio-Enhanced Tax Report ──────────────────────────────────────────

export interface PortfolioTaxAddendum {
  portfolioOrdinaryIncome: number      // staking, airdrops, mining
  shortTermCapitalGains: number
  longTermCapitalGains: number
  capitalLossDeduction: number         // max $3k/yr
  netInvestmentIncome: number          // for NIIT
  niitTax: number                      // 3.8% on NII above threshold
  portfolioFederalTax: number
  portfolioStateTax: number
  portfolioTotalTax: number
  adjustedTotalTax: number             // base totalTax + portfolio taxes
  adjustedEffectiveRate: number
  adjustedAfterTaxIncome: number
}

/**
 * Computes a portfolio tax addendum that layers on top of the base TaxReport.
 * Does NOT modify the base report — returns supplemental data.
 * Consumers can use base report alone (backward-compatible) or add portfolio layer.
 */
export function computePortfolioTaxAddendum(baseReport: TaxReport, stateCode: string): PortfolioTaxAddendum | null {
  try {
    const { hasPortfolioData: hasPD, getPortfolioTaxIncome } = require('./portfolio-bridge')
    if (!hasPD()) return null

    const ptx = getPortfolioTaxIncome(stateCode)
    if (ptx.additionalOrdinaryIncome === 0 && ptx.shortTermCapGains === 0 && ptx.longTermCapGains === 0) return null

    const stateRate = STATE_TAX_RATES[stateCode]?.rate || 0

    // Ordinary income from portfolio (taxed at marginal rate)
    const ordinaryTax = ptx.additionalOrdinaryIncome * baseReport.marginalRate
    const ordinaryStateTax = ptx.additionalOrdinaryIncome * stateRate

    // Short-term capital gains (taxed at ordinary rates)
    const stcgTax = ptx.shortTermCapGains * baseReport.marginalRate
    const stcgStateTax = ptx.shortTermCapGains * stateRate

    // Long-term capital gains (taxed at preferential rates)
    const ltcgRate = baseReport.taxableIncome > 492300 ? 0.20 : baseReport.taxableIncome > 44625 ? 0.15 : 0
    const ltcgTax = ptx.longTermCapGains * ltcgRate
    const ltcgStateTax = ptx.longTermCapGains * stateRate

    // Capital loss deduction benefit
    const lossDeductionBenefit = ptx.capitalLosses * baseReport.marginalRate

    // NIIT (3.8% on net investment income for AGI > $200k single / $250k MFJ)
    const niitThreshold = baseReport.taxableIncome > 200000 ? 0.038 : 0
    const niitTax = Math.round(ptx.netInvestmentIncome * niitThreshold)

    const portfolioFederalTax = Math.round(ordinaryTax + stcgTax + ltcgTax - lossDeductionBenefit + niitTax)
    const portfolioStateTax = Math.round(ordinaryStateTax + stcgStateTax + ltcgStateTax)
    const portfolioTotalTax = portfolioFederalTax + portfolioStateTax

    const adjustedTotalTax = baseReport.totalTax + portfolioTotalTax
    const totalIncome = baseReport.grossIncome + ptx.additionalOrdinaryIncome + ptx.shortTermCapGains + ptx.longTermCapGains
    const adjustedEffectiveRate = totalIncome > 0 ? adjustedTotalTax / totalIncome : 0
    const adjustedAfterTaxIncome = totalIncome - adjustedTotalTax

    return {
      portfolioOrdinaryIncome: ptx.additionalOrdinaryIncome,
      shortTermCapitalGains: ptx.shortTermCapGains,
      longTermCapitalGains: ptx.longTermCapGains,
      capitalLossDeduction: ptx.capitalLosses,
      netInvestmentIncome: ptx.netInvestmentIncome,
      niitTax,
      portfolioFederalTax,
      portfolioStateTax,
      portfolioTotalTax,
      adjustedTotalTax,
      adjustedEffectiveRate,
      adjustedAfterTaxIncome,
    }
  } catch {
    return null
  }
}
