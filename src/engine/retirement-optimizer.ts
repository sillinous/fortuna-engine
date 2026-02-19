/**
 * Fortuna Engine — Retirement Optimizer v8
 *
 * Comprehensive retirement strategy optimization:
 *  - SEP IRA vs Solo 401(k) comparison with catch-up
 *  - Roth conversion ladder analysis (5-year projection)
 *  - Backdoor Roth IRA eligibility & guidance
 *  - Contribution timing optimization (front-load vs dollar-cost)
 *  - Multi-decade retirement projection with tax-aware modeling
 *  - Social Security optimization timing
 */

import type { FortunaState, RetirementAccount } from './storage'
import { generateTaxReport } from './tax-calculator'

// ===================================================================
//  2025 LIMITS
// ===================================================================

const LIMITS = {
  IRA_LIMIT: 7000,
  IRA_CATCHUP_50: 1000,
  SOLO_401K_EMPLOYEE: 23500,
  SOLO_401K_CATCHUP_50: 7500,
  SOLO_401K_CATCHUP_60_63: 11250, // SECURE 2.0
  SOLO_401K_TOTAL: 70000,
  SEP_RATE: 0.25, // 25% of net self-employment income
  SEP_MAX: 70000,
  ROTH_IRA_MAGI_SINGLE: 150000,
  ROTH_IRA_PHASEOUT_SINGLE: 165000,
  ROTH_IRA_MAGI_JOINT: 236000,
  ROTH_IRA_PHASEOUT_JOINT: 246000,
  TRAD_IRA_DEDUCT_MAGI_SINGLE: 83000, // if covered by employer plan
  TRAD_IRA_DEDUCT_MAGI_JOINT: 136000,
  HSA_SINGLE: 4300,
  HSA_FAMILY: 8550,
  HSA_CATCHUP_55: 1000,
  SS_FULL_RETIREMENT_1960_PLUS: 67,
  SS_EARLY: 62,
  SS_DELAYED_MAX: 70,
}

// ===================================================================
//  VEHICLE COMPARISON
// ===================================================================

export interface RetirementVehicle {
  name: string
  type: 'sep_ira' | 'solo_401k' | 'trad_ira' | 'roth_ira' | 'backdoor_roth' | 'hsa'
  maxContribution: number
  employeeContribution: number
  employerContribution: number
  taxDeductionNow: number
  taxFreeGrowth: boolean
  taxFreeWithdrawal: boolean
  eligibility: 'eligible' | 'income_limited' | 'ineligible'
  eligibilityNote: string
  pros: string[]
  cons: string[]
  bestFor: string
  priority: number // higher = recommend more
}

export interface RetirementComparison {
  vehicles: RetirementVehicle[]
  recommendedStrategy: string
  totalMaxContribution: number
  totalTaxDeduction: number
  netSEIncome: number
  agi: number
  age: number
}

export function compareRetirementVehicles(state: FortunaState): RetirementComparison {
  const report = generateTaxReport(state)
  const age = state.profile.age
  const filing = state.profile.filingStatus
  const isJoint = filing === 'married_joint'

  const netSE = report.selfEmploymentIncome -
    state.expenses.filter(e => e.isDeductible).reduce((s, e) => s + e.annualAmount * e.deductionPct / 100, 0)
  const adjustedSE = Math.max(0, netSE * 0.9235) // SE income after half SE tax deduction

  const catchup50 = age >= 50
  const catchup60_63 = age >= 60 && age <= 63
  const catchup55 = age >= 55

  const vehicles: RetirementVehicle[] = []

  // ---- SEP IRA ----
  const sepMax = Math.min(LIMITS.SEP_MAX, adjustedSE * LIMITS.SEP_RATE)
  if (netSE > 0) {
    vehicles.push({
      name: 'SEP IRA',
      type: 'sep_ira',
      maxContribution: Math.round(sepMax),
      employeeContribution: 0,
      employerContribution: Math.round(sepMax),
      taxDeductionNow: Math.round(sepMax),
      taxFreeGrowth: false,
      taxFreeWithdrawal: false,
      eligibility: 'eligible',
      eligibilityNote: 'Available to any self-employed individual',
      pros: [
        'Simple to set up and maintain',
        'High contribution limits for high earners',
        'Flexible — no required annual contributions',
        'Can be opened and funded up to tax filing deadline',
      ],
      cons: [
        'No Roth option',
        'No employee catch-up contributions',
        'Contributions are percentage-based — lower income = lower limit',
        'Cannot have both SEP and Solo 401k employer contributions',
      ],
      bestFor: 'High-income solopreneurs wanting simplicity',
      priority: netSE > 200000 ? 7 : 5,
    })
  }

  // ---- Solo 401(k) ----
  const solo401kEmployee = Math.min(
    LIMITS.SOLO_401K_EMPLOYEE + (catchup60_63 ? LIMITS.SOLO_401K_CATCHUP_60_63 : catchup50 ? LIMITS.SOLO_401K_CATCHUP_50 : 0),
    adjustedSE,
  )
  const solo401kEmployer = Math.min(adjustedSE * 0.25, LIMITS.SOLO_401K_TOTAL - solo401kEmployee)
  const solo401kTotal = Math.min(LIMITS.SOLO_401K_TOTAL, Math.round(solo401kEmployee + Math.max(0, solo401kEmployer)))

  if (netSE > 0) {
    vehicles.push({
      name: 'Solo 401(k)',
      type: 'solo_401k',
      maxContribution: solo401kTotal,
      employeeContribution: Math.round(solo401kEmployee),
      employerContribution: Math.round(Math.max(0, solo401kEmployer)),
      taxDeductionNow: solo401kTotal, // traditional portion
      taxFreeGrowth: false,
      taxFreeWithdrawal: false,
      eligibility: 'eligible',
      eligibilityNote: 'Available to self-employed with no employees (except spouse)',
      pros: [
        'Highest contribution limits of any retirement vehicle',
        'Both employee + employer contributions',
        'Roth option available for employee portion',
        catchup50 ? `Age ${age} catch-up: +$${catchup60_63 ? LIMITS.SOLO_401K_CATCHUP_60_63.toLocaleString() : LIMITS.SOLO_401K_CATCHUP_50.toLocaleString()}` : 'Catch-up contributions at age 50+',
        'Loan provision available',
      ],
      cons: [
        'More paperwork than SEP (Form 5500-EZ if >$250k)',
        'Must be established by Dec 31 of tax year',
        'Cannot have employees (except spouse)',
      ],
      bestFor: 'Self-employed maximizing retirement savings',
      priority: 9,
    })
  }

  // ---- Traditional IRA ----
  const iraLimit = LIMITS.IRA_LIMIT + (catchup50 ? LIMITS.IRA_CATCHUP_50 : 0)
  const hasEmployerPlan = netSE > 0 // Solo 401k / SEP counts as employer plan
  const magiLimit = isJoint ? LIMITS.TRAD_IRA_DEDUCT_MAGI_JOINT : LIMITS.TRAD_IRA_DEDUCT_MAGI_SINGLE
  const deductible = !hasEmployerPlan || report.agi < magiLimit

  vehicles.push({
    name: 'Traditional IRA',
    type: 'trad_ira',
    maxContribution: iraLimit,
    employeeContribution: iraLimit,
    employerContribution: 0,
    taxDeductionNow: deductible ? iraLimit : 0,
    taxFreeGrowth: false,
    taxFreeWithdrawal: false,
    eligibility: deductible ? 'eligible' : 'income_limited',
    eligibilityNote: deductible
      ? 'Fully deductible at your income level'
      : `Non-deductible: AGI ($${report.agi.toLocaleString()}) exceeds ${isJoint ? '$136K joint' : '$83K single'} with employer plan. Consider backdoor Roth instead.`,
    pros: ['Tax-deductible contributions', 'No income limit to contribute', 'Simple to open'],
    cons: ['Low contribution limit', 'Taxed on withdrawal', 'RMDs at 73', deductible ? '' : 'Non-deductible at your income'].filter(Boolean),
    bestFor: 'Additional tax-deferred savings beyond 401k',
    priority: deductible ? 4 : 1,
  })

  // ---- Roth IRA ----
  const rothMagiLimit = isJoint ? LIMITS.ROTH_IRA_MAGI_SINGLE : LIMITS.ROTH_IRA_MAGI_SINGLE // simplified
  const rothPhaseout = isJoint ? LIMITS.ROTH_IRA_PHASEOUT_JOINT : LIMITS.ROTH_IRA_PHASEOUT_SINGLE
  const rothEligible = report.agi < rothPhaseout

  vehicles.push({
    name: 'Roth IRA',
    type: 'roth_ira',
    maxContribution: rothEligible ? iraLimit : 0,
    employeeContribution: rothEligible ? iraLimit : 0,
    employerContribution: 0,
    taxDeductionNow: 0,
    taxFreeGrowth: true,
    taxFreeWithdrawal: true,
    eligibility: rothEligible ? 'eligible' : 'income_limited',
    eligibilityNote: rothEligible
      ? 'Direct contributions allowed at your income level'
      : `AGI ($${report.agi.toLocaleString()}) exceeds Roth limit. Use backdoor Roth instead.`,
    pros: ['Tax-free growth forever', 'Tax-free withdrawal in retirement', 'No RMDs', 'Contributions withdrawable anytime penalty-free'],
    cons: ['No tax deduction now', 'Income limits for direct contribution', 'Low contribution limit'],
    bestFor: 'Tax-free retirement income',
    priority: rothEligible ? 6 : 0,
  })

  // ---- Backdoor Roth ----
  if (!rothEligible) {
    vehicles.push({
      name: 'Backdoor Roth IRA',
      type: 'backdoor_roth',
      maxContribution: iraLimit,
      employeeContribution: iraLimit,
      employerContribution: 0,
      taxDeductionNow: 0,
      taxFreeGrowth: true,
      taxFreeWithdrawal: true,
      eligibility: 'eligible',
      eligibilityNote: 'Available via non-deductible Traditional IRA → Roth conversion. ⚠ Pro-rata rule applies if you have existing Traditional IRA balances.',
      pros: ['Tax-free growth', 'No income limit', 'Bypasses Roth IRA income restrictions'],
      cons: ['Pro-rata rule can trigger tax if existing Traditional IRA balance', 'Requires two-step process', 'Potential legislative risk'],
      bestFor: 'High earners wanting Roth benefits',
      priority: 7,
    })
  }

  // ---- HSA ----
  if (state.profile.hasHealthInsurance) {
    const hsaLimit = (isJoint ? LIMITS.HSA_FAMILY : LIMITS.HSA_SINGLE) + (catchup55 ? LIMITS.HSA_CATCHUP_55 : 0)
    vehicles.push({
      name: 'HSA (Health Savings)',
      type: 'hsa',
      maxContribution: hsaLimit,
      employeeContribution: hsaLimit,
      employerContribution: 0,
      taxDeductionNow: hsaLimit,
      taxFreeGrowth: true,
      taxFreeWithdrawal: true,
      eligibility: 'eligible',
      eligibilityNote: 'Requires High Deductible Health Plan (HDHP). Triple tax advantage: deductible, grows tax-free, withdraws tax-free for medical.',
      pros: ['Triple tax advantage — only account with all three benefits', 'No use-it-or-lose-it (unlike FSA)', 'Rolls over year to year', 'After 65, can withdraw for any purpose (taxed like Traditional IRA)'],
      cons: ['Requires HDHP enrollment', 'High deductible means more out-of-pocket', 'Limited to medical expenses before 65 for tax-free withdrawal'],
      bestFor: 'Anyone with HDHP — the ultimate retirement stealth vehicle',
      priority: 8,
    })
  }

  // Sort by priority
  vehicles.sort((a, b) => b.priority - a.priority)

  // Build recommendation
  const topVehicles = vehicles.filter(v => v.eligibility !== 'ineligible' && v.priority >= 5)
  const totalMax = topVehicles.reduce((s, v) => s + v.maxContribution, 0)
  const totalDeduction = topVehicles.reduce((s, v) => s + v.taxDeductionNow, 0)

  let recommendation = ''
  if (topVehicles.length > 0) {
    const names = topVehicles.map(v => v.name).join(' → ')
    recommendation = `Recommended priority: ${names}. Total max contribution: $${totalMax.toLocaleString()}/yr with $${totalDeduction.toLocaleString()} tax deduction.`
  }

  return {
    vehicles,
    recommendedStrategy: recommendation,
    totalMaxContribution: totalMax,
    totalTaxDeduction: totalDeduction,
    netSEIncome: Math.max(0, netSE),
    agi: report.agi,
    age,
  }
}

// ===================================================================
//  ROTH CONVERSION LADDER
// ===================================================================

export interface RothConversionYear {
  year: number
  age: number
  convertAmount: number
  taxOnConversion: number
  marginalRate: number
  netCost: number
  cumulativeConverted: number
  cumulativeTax: number
  withdrawableYear: number // 5 years later
  notes: string
}

export interface RothLadderAnalysis {
  years: RothConversionYear[]
  totalConverted: number
  totalTaxPaid: number
  taxSavingsVsLumpSum: number
  optimalAnnualConversion: number
  strategy: string
}

export function analyzeRothLadder(
  state: FortunaState,
  traditionalBalance: number,
  targetRetirementAge: number,
): RothLadderAnalysis {
  const report = generateTaxReport(state)
  const currentAge = state.profile.age
  const yearsToRetirement = Math.max(1, targetRetirementAge - currentAge)
  const currentYear = new Date().getFullYear()

  // Find optimal conversion amount to stay in current bracket
  const brackets2025 = [
    { limit: 11925, rate: 0.10 },
    { limit: 48475, rate: 0.12 },
    { limit: 103350, rate: 0.22 },
    { limit: 191950, rate: 0.24 },
    { limit: 243725, rate: 0.32 },
    { limit: 609350, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ]

  // Find how much room in current bracket
  const currentTaxable = report.agi - report.deductionAmount
  let bracketRoom = 0
  for (const bracket of brackets2025) {
    if (currentTaxable < bracket.limit) {
      bracketRoom = bracket.limit - currentTaxable
      break
    }
  }

  // Optimal conversion: fill current bracket without jumping
  const optimalAnnual = Math.min(
    Math.max(10000, bracketRoom),
    traditionalBalance / Math.max(1, Math.min(yearsToRetirement, 10)),
  )

  const years: RothConversionYear[] = []
  let cumConverted = 0
  let cumTax = 0
  let remaining = traditionalBalance

  for (let i = 0; i < Math.min(yearsToRetirement, 15); i++) {
    if (remaining <= 0) break

    const convertAmount = Math.min(Math.round(optimalAnnual), remaining)
    const taxableWithConversion = currentTaxable + convertAmount
    
    // Calculate marginal rate on conversion
    let marginalRate = 0.10
    for (const bracket of brackets2025) {
      if (taxableWithConversion <= bracket.limit) {
        marginalRate = bracket.rate
        break
      }
      marginalRate = bracket.rate
    }

    const taxOnConversion = Math.round(convertAmount * marginalRate)
    cumConverted += convertAmount
    cumTax += taxOnConversion
    remaining -= convertAmount

    years.push({
      year: currentYear + i,
      age: currentAge + i,
      convertAmount,
      taxOnConversion,
      marginalRate,
      netCost: taxOnConversion,
      cumulativeConverted: cumConverted,
      cumulativeTax: cumTax,
      withdrawableYear: currentYear + i + 5,
      notes: i === 0 ? 'Start ladder' : remaining <= 0 ? 'Final conversion' : '',
    })
  }

  // Lump sum comparison
  const lumpSumRate = 0.32 // assume higher bracket for lump sum
  const lumpSumTax = Math.round(traditionalBalance * lumpSumRate)
  const savings = lumpSumTax - cumTax

  const strategy = yearsToRetirement >= 5
    ? `Convert ~$${Math.round(optimalAnnual).toLocaleString()}/yr over ${years.length} years to stay in the ${(years[0]?.marginalRate * 100 || 22).toFixed(0)}% bracket. Total tax: $${cumTax.toLocaleString()} vs $${lumpSumTax.toLocaleString()} lump sum — saving $${savings.toLocaleString()}.`
    : 'With less than 5 years to retirement, a full Roth conversion ladder may not be optimal. Consider partial conversions focused on years with lower income.'

  return {
    years,
    totalConverted: cumConverted,
    totalTaxPaid: cumTax,
    taxSavingsVsLumpSum: savings,
    optimalAnnualConversion: Math.round(optimalAnnual),
    strategy,
  }
}

// ===================================================================
//  RETIREMENT PROJECTION
// ===================================================================

export interface RetirementProjectionYear {
  year: number
  age: number
  balance: number
  contributions: number
  growth: number
  withdrawals: number
  taxOnWithdrawals: number
}

export interface RetirementProjection {
  years: RetirementProjectionYear[]
  retirementAge: number
  retirementBalance: number
  sustainableWithdrawal: number // 4% rule
  monthlyInRetirement: number
  yearsOfFunding: number // at target withdrawal
  socialSecurityEstimate: number
  totalWithSS: number
  shortfall: number
  recommendation: string
}

export function projectRetirement(
  state: FortunaState,
  currentBalance: number,
  annualContribution: number,
  returnRate: number = 0.07,
  retirementAge: number = 65,
  targetMonthlyIncome: number = 0,
): RetirementProjection {
  const age = state.profile.age
  const yearsToRetirement = Math.max(0, retirementAge - age)
  const currentYear = new Date().getFullYear()
  const report = generateTaxReport(state)

  // Default target: 80% of current income
  const target = targetMonthlyIncome > 0
    ? targetMonthlyIncome * 12
    : report.grossIncome * 0.80

  // Accumulation phase
  const years: RetirementProjectionYear[] = []
  let balance = currentBalance

  for (let i = 0; i <= yearsToRetirement + 30; i++) {
    const currentAge = age + i
    const isRetired = currentAge >= retirementAge
    const contributions = isRetired ? 0 : annualContribution
    const growth = Math.round(balance * returnRate)
    const withdrawals = isRetired ? Math.round(balance * 0.04) : 0 // 4% rule
    const taxRate = isRetired ? 0.15 : 0 // estimated blended rate in retirement
    const taxOnWithdrawals = Math.round(withdrawals * taxRate)

    years.push({
      year: currentYear + i,
      age: currentAge,
      balance: Math.round(balance),
      contributions,
      growth,
      withdrawals,
      taxOnWithdrawals,
    })

    balance = balance + contributions + growth - withdrawals
    if (balance <= 0 && isRetired) break
    if (currentAge > 100) break
  }

  const retirementBalance = years.find(y => y.age === retirementAge)?.balance || 0
  const sustainableWithdrawal = Math.round(retirementBalance * 0.04)
  const monthlyInRetirement = Math.round(sustainableWithdrawal / 12)

  // Social Security estimate (simplified)
  const avgEarnings = Math.min(report.grossIncome, 176100) // SS wage base
  const estimatedPIA = Math.round(avgEarnings * 0.012 + 15000) // rough approximation
  const ssMonthly = Math.round(estimatedPIA / 12)

  const totalMonthly = monthlyInRetirement + ssMonthly
  const shortfall = Math.max(0, Math.round(target / 12) - totalMonthly)

  // Years of funding
  const yearsOfFunding = sustainableWithdrawal > 0 ? Math.round(retirementBalance / sustainableWithdrawal) : 0

  let recommendation = ''
  if (shortfall > 0) {
    const additionalNeeded = Math.round(shortfall * 12 / 0.04)
    recommendation = `Current trajectory shows a $${shortfall.toLocaleString()}/mo shortfall vs target. Increase annual contributions by ~$${Math.round(additionalNeeded / yearsToRetirement).toLocaleString()}/yr or target ${Math.round(returnRate * 100) + 1}% returns to close the gap.`
  } else {
    recommendation = `On track to exceed retirement income target by $${Math.abs(shortfall).toLocaleString()}/mo. Consider maximizing tax-advantaged accounts and exploring Roth conversions to reduce future tax burden.`
  }

  return {
    years: years.slice(0, yearsToRetirement + 31),
    retirementAge,
    retirementBalance: Math.round(retirementBalance),
    sustainableWithdrawal,
    monthlyInRetirement,
    yearsOfFunding,
    socialSecurityEstimate: ssMonthly,
    totalWithSS: totalMonthly,
    shortfall,
    recommendation,
  }
}

// ─── Phase F: Type Adapters ─────────────────────────────────────────────────

const VEHICLE_TO_ACCOUNT_TYPE: Record<string, RetirementAccount['type']> = {
  sep_ira: 'sep_ira',
  solo_401k: 'solo_401k',
  trad_ira: 'traditional_ira',
  roth_ira: 'roth_ira',
  backdoor_roth: 'roth_ira',
  hsa: 'hsa',
}

const ACCOUNT_TO_VEHICLE_TYPE: Record<string, RetirementVehicle['type'] | null> = {
  traditional_401k: null,  // Not modeled by optimizer (employer plan)
  roth_401k: null,
  solo_401k: 'solo_401k',
  sep_ira: 'sep_ira',
  simple_ira: null,
  traditional_ira: 'trad_ira',
  roth_ira: 'roth_ira',
  hsa: 'hsa',
  pension: null,
  other: null,
}

/** Convert optimizer RetirementVehicle → storage RetirementAccount */
export function vehicleToAccount(vehicle: RetirementVehicle, existingAccount?: RetirementAccount): RetirementAccount {
  return {
    id: existingAccount?.id || `ret-${vehicle.type}`,
    name: vehicle.name,
    type: VEHICLE_TO_ACCOUNT_TYPE[vehicle.type] || 'other',
    balance: existingAccount?.balance || 0,
    annualContribution: vehicle.employeeContribution + vehicle.employerContribution,
    employerMatch: vehicle.employerContribution > 0 ? vehicle.employerContribution : undefined,
    maxContribution: vehicle.maxContribution,
    isTaxDeductible: vehicle.taxDeductionNow > 0,
    entityId: existingAccount?.entityId || 'personal',
    memberId: existingAccount?.memberId || 'primary',
    taxYear: new Date().getFullYear(),
    tags: existingAccount?.tags || [],
  }
}

/** Convert storage RetirementAccount → optimizer RetirementVehicle (partial) */
export function accountToVehicle(account: RetirementAccount): Partial<RetirementVehicle> & { type: string } {
  return {
    name: account.name,
    type: ACCOUNT_TO_VEHICLE_TYPE[account.type] || 'trad_ira',
    maxContribution: account.maxContribution,
    employeeContribution: account.annualContribution,
    employerContribution: account.employerMatch || 0,
    taxDeductionNow: account.isTaxDeductible ? account.annualContribution : 0,
  }
}

/** Merge optimizer recommendations into existing RetirementAccount[] */
export function mergeVehicleRecommendations(
  existingAccounts: RetirementAccount[],
  vehicles: RetirementVehicle[],
): RetirementAccount[] {
  const result = [...existingAccounts]

  for (const vehicle of vehicles) {
    if (vehicle.eligibility === 'ineligible') continue
    const accountType = VEHICLE_TO_ACCOUNT_TYPE[vehicle.type]
    if (!accountType) continue

    const existing = result.find(a => a.type === accountType)
    if (existing) {
      // Update max contribution from optimizer
      existing.maxContribution = vehicle.maxContribution
    } else {
      // Add new recommended account
      result.push(vehicleToAccount(vehicle))
    }
  }

  return result
}

// ==================== Roth Conversion Optimizer ====================
// Strategic analysis: when to convert traditional → Roth IRA considering
// bracket filling, TCJA sunset, IRMAA thresholds, and RMD avoidance.

// TCJA sunset brackets (revert to pre-TCJA rates after 2025)
const POST_TCJA_BRACKETS_SINGLE = [
  { limit: 10275, rate: 0.10 },
  { limit: 41775, rate: 0.15 },
  { limit: 89075, rate: 0.25 },
  { limit: 170050, rate: 0.28 },
  { limit: 215950, rate: 0.33 },
  { limit: 539900, rate: 0.35 },
  { limit: Infinity, rate: 0.396 },
]

const POST_TCJA_BRACKETS_JOINT = [
  { limit: 20550, rate: 0.10 },
  { limit: 83550, rate: 0.15 },
  { limit: 178150, rate: 0.25 },
  { limit: 340100, rate: 0.28 },
  { limit: 431900, rate: 0.33 },
  { limit: 647850, rate: 0.35 },
  { limit: Infinity, rate: 0.396 },
]

// IRMAA thresholds (Medicare surcharges for high-income retirees)
const IRMAA_THRESHOLDS_2024 = [
  { magi: 103000, monthlyPremiumAdd: 0, label: 'Standard' },
  { magi: 129000, monthlyPremiumAdd: 65.90, label: 'Tier 1' },
  { magi: 161000, monthlyPremiumAdd: 164.80, label: 'Tier 2' },
  { magi: 193000, monthlyPremiumAdd: 263.70, label: 'Tier 3' },
  { magi: 500000, monthlyPremiumAdd: 362.60, label: 'Tier 4' },
  { magi: Infinity, monthlyPremiumAdd: 395.60, label: 'Tier 5' },
]

export interface RothConversionStrategy {
  optimalAnnualConversion: number
  currentBracketRoom: number
  currentMarginalRate: number
  nextBracketRate: number
  tcjaSunsetImpact: {
    currentRateOnConversion: number
    postSunsetRate: number
    urgencyScore: number // 0-100: how urgent is it to convert before sunset
    savingsIfConvertNow: number
  }
  irmaaImpact: {
    currentTier: string
    conversionTriggersNextTier: boolean
    maxConversionBeforeIRMAA: number
    annualIRMAACost: number
  }
  rmdAvoidance: {
    projectedRMDAge72: number // what RMDs would be without conversion
    rmdReductionFromConversion: number
    lifetimeTaxSavingsFromRMDReduction: number
  }
  breakEvenYears: number // years until Roth advantage exceeds tax cost
  yearByYear: {
    year: number
    convertAmount: number
    taxCost: number
    cumulativeConverted: number
    cumulativeTax: number
    remainingTraditional: number
    projectedRothBalance: number
    bracketUsed: string
    isTCJAWindow: boolean
  }[]
  summary: string
  recommendation: 'aggressive' | 'moderate' | 'conservative' | 'wait'
  reasons: string[]
}

export function optimizeRothConversion(
  state: FortunaState,
  traditionalBalance: number,
  targetRetirementAge: number = 65,
  expectedReturnRate: number = 0.07,
  retirementTaxRate: number | null = null, // if null, estimated from projection
): RothConversionStrategy {
  const report = generateTaxReport(state)
  const currentAge = state.profile.age
  const yearsToRetirement = Math.max(1, targetRetirementAge - currentAge)
  const currentYear = new Date().getFullYear()
  const isJoint = state.profile.filingStatus === 'married_joint'

  // Current bracket analysis
  const currentTaxable = report.taxableIncome
  const brackets2025 = isJoint
    ? [
        { limit: 23200, rate: 0.10, label: '10%' }, { limit: 94300, rate: 0.12, label: '12%' },
        { limit: 201050, rate: 0.22, label: '22%' }, { limit: 383900, rate: 0.24, label: '24%' },
        { limit: 487450, rate: 0.32, label: '32%' }, { limit: 731200, rate: 0.35, label: '35%' },
        { limit: Infinity, rate: 0.37, label: '37%' },
      ]
    : [
        { limit: 11600, rate: 0.10, label: '10%' }, { limit: 47150, rate: 0.12, label: '12%' },
        { limit: 100525, rate: 0.22, label: '22%' }, { limit: 191950, rate: 0.24, label: '24%' },
        { limit: 243725, rate: 0.32, label: '32%' }, { limit: 609350, rate: 0.35, label: '35%' },
        { limit: Infinity, rate: 0.37, label: '37%' },
      ]

  let bracketRoom = 0
  let currentRate = 0.10
  let nextRate = 0.12
  let currentLabel = '10%'
  for (let i = 0; i < brackets2025.length; i++) {
    if (currentTaxable < brackets2025[i].limit) {
      bracketRoom = brackets2025[i].limit - currentTaxable
      currentRate = brackets2025[i].rate
      currentLabel = brackets2025[i].label
      nextRate = i + 1 < brackets2025.length ? brackets2025[i + 1].rate : currentRate
      break
    }
  }

  // TCJA sunset analysis — rates revert after 2025
  const postSunsetBrackets = isJoint ? POST_TCJA_BRACKETS_JOINT : POST_TCJA_BRACKETS_SINGLE
  let postSunsetRate = 0.10
  for (const b of postSunsetBrackets) {
    if (currentTaxable <= b.limit) { postSunsetRate = b.rate; break }
    postSunsetRate = b.rate
  }
  const tcjaWindowRemaining = Math.max(0, 2026 - currentYear) // years of TCJA rates left
  const rateDelta = postSunsetRate - currentRate
  const urgencyScore = Math.min(100, Math.round(
    (rateDelta > 0 ? 40 : 0) + // rates going up = urgent
    (tcjaWindowRemaining <= 1 ? 30 : tcjaWindowRemaining <= 2 ? 15 : 0) + // time pressure
    (traditionalBalance > 500000 ? 20 : traditionalBalance > 200000 ? 10 : 0) + // balance size
    (currentRate <= 0.22 ? 10 : 0) // low current rate = good time
  ))

  // IRMAA analysis (relevant for age 63+ due to 2-year lookback)
  const agi = report.agi
  let currentIRMAATier = IRMAA_THRESHOLDS_2024[0]
  let maxBeforeNextIRMAA = Infinity
  for (let i = 0; i < IRMAA_THRESHOLDS_2024.length; i++) {
    if (agi <= IRMAA_THRESHOLDS_2024[i].magi) {
      currentIRMAATier = IRMAA_THRESHOLDS_2024[i]
      maxBeforeNextIRMAA = IRMAA_THRESHOLDS_2024[i].magi - agi
      break
    }
  }
  const conversionTriggersIRMAA = bracketRoom > 0 && maxBeforeNextIRMAA < bracketRoom

  // RMD avoidance projection
  const rmdAge72Balance = traditionalBalance * Math.pow(1 + expectedReturnRate, Math.max(0, 72 - currentAge))
  const rmdFactor72 = 27.4 // IRS Uniform Lifetime Table at 72
  const projectedRMDAge72 = Math.round(rmdAge72Balance / rmdFactor72)

  // Optimal annual conversion
  const optimal = Math.min(
    bracketRoom > 0 ? bracketRoom : 50000,
    Math.min(maxBeforeNextIRMAA, Infinity),
    traditionalBalance / Math.max(1, Math.min(yearsToRetirement, 15)),
  )
  const optimalAnnual = Math.max(5000, Math.round(optimal / 1000) * 1000) // round to nearest $1k

  // Year-by-year projection
  const yearByYear: RothConversionStrategy['yearByYear']  = []
  let remaining = traditionalBalance
  let cumConverted = 0
  let cumTax = 0
  let rothBalance = 0

  for (let i = 0; i < Math.min(yearsToRetirement, 20); i++) {
    if (remaining <= 0) break
    const year = currentYear + i
    const isTCJA = year <= 2025
    const convertAmount = Math.min(Math.round(optimalAnnual), remaining)

    // Use current rates if TCJA window, post-sunset otherwise
    const activeBrackets = isTCJA ? brackets2025 : postSunsetBrackets
    let yearRate = 0.10
    for (const b of activeBrackets) {
      if (currentTaxable + convertAmount <= (b as any).limit) { yearRate = (b as any).rate; break }
      yearRate = (b as any).rate
    }
    const taxCost = Math.round(convertAmount * yearRate)
    cumConverted += convertAmount
    cumTax += taxCost
    remaining -= convertAmount
    rothBalance = (rothBalance + convertAmount) * (1 + expectedReturnRate)

    yearByYear.push({
      year,
      convertAmount,
      taxCost,
      cumulativeConverted: cumConverted,
      cumulativeTax: cumTax,
      remainingTraditional: Math.round(remaining * Math.pow(1 + expectedReturnRate, 1)),
      projectedRothBalance: Math.round(rothBalance),
      bracketUsed: `${(yearRate * 100).toFixed(0)}%`,
      isTCJAWindow: isTCJA,
    })
  }

  // Break-even: how many years until Roth tax-free growth > conversion tax cost
  const estimatedRetirementRate = retirementTaxRate || Math.max(0.15, currentRate - 0.05)
  const annualTaxCost = optimalAnnual * currentRate
  const annualRothBenefit = optimalAnnual * expectedReturnRate * estimatedRetirementRate
  const breakEvenYears = annualRothBenefit > 0 ? Math.ceil(annualTaxCost / annualRothBenefit) : 99

  // RMD reduction from converting
  const convertedByRetirement = yearByYear.reduce((s, y) => s + y.convertAmount, 0)
  const reducedTraditional = traditionalBalance - convertedByRetirement
  const reducedRMDBalance = reducedTraditional * Math.pow(1 + expectedReturnRate, Math.max(0, 72 - currentAge))
  const reducedRMD = Math.round(reducedRMDBalance / rmdFactor72)
  const rmdReduction = projectedRMDAge72 - reducedRMD
  const lifetimeRMDSavings = Math.round(rmdReduction * estimatedRetirementRate * 15) // ~15 years of RMDs

  // Recommendation
  const reasons: string[] = []
  let recommendation: RothConversionStrategy['recommendation'] = 'moderate'

  if (rateDelta > 0.02) { reasons.push(`TCJA sunset will increase your rate from ${(currentRate * 100).toFixed(0)}% to ${(postSunsetRate * 100).toFixed(0)}% — convert while rates are low`); recommendation = 'aggressive' }
  if (currentRate <= 0.22) { reasons.push(`Current ${(currentRate * 100).toFixed(0)}% bracket is historically low — favorable conversion window`); if (recommendation !== 'aggressive') recommendation = 'aggressive' }
  if (breakEvenYears > yearsToRetirement) { reasons.push(`Break-even is ${breakEvenYears} years vs ${yearsToRetirement} years to retirement — payoff may not materialize`); recommendation = 'conservative' }
  if (projectedRMDAge72 > 100000) { reasons.push(`Projected RMDs of $${projectedRMDAge72.toLocaleString()}/year at 72 — conversion reduces forced distributions by $${rmdReduction.toLocaleString()}/year`) }
  if (currentAge >= 55 && traditionalBalance > 500000) { reasons.push('Large traditional balance with limited conversion window — front-load conversions') }
  if (conversionTriggersIRMAA && currentAge >= 61) { reasons.push(`Limit conversion to $${Math.round(maxBeforeNextIRMAA).toLocaleString()} to avoid IRMAA surcharge ($${Math.round(currentIRMAATier.monthlyPremiumAdd * 12).toLocaleString()}/year)`) }
  if (reasons.length === 0) reasons.push('Standard bracket-filling Roth conversion recommended')

  const summary = recommendation === 'aggressive'
    ? `Convert $${optimalAnnual.toLocaleString()}/year aggressively — TCJA sunset and low bracket create ideal window. ${breakEvenYears}-year break-even.`
    : recommendation === 'conservative'
      ? `Conservative approach recommended — convert $${Math.round(optimalAnnual * 0.5).toLocaleString()}/year to stay well within bracket.`
      : `Convert $${optimalAnnual.toLocaleString()}/year to fill ${currentLabel} bracket. Break-even in ${breakEvenYears} years.`

  return {
    optimalAnnualConversion: optimalAnnual,
    currentBracketRoom: Math.round(bracketRoom),
    currentMarginalRate: currentRate,
    nextBracketRate: nextRate,
    tcjaSunsetImpact: {
      currentRateOnConversion: currentRate,
      postSunsetRate,
      urgencyScore,
      savingsIfConvertNow: Math.round(traditionalBalance * rateDelta * 0.3),
    },
    irmaaImpact: {
      currentTier: currentIRMAATier.label,
      conversionTriggersNextTier: conversionTriggersIRMAA,
      maxConversionBeforeIRMAA: Math.round(maxBeforeNextIRMAA),
      annualIRMAACost: Math.round(currentIRMAATier.monthlyPremiumAdd * 12),
    },
    rmdAvoidance: {
      projectedRMDAge72,
      rmdReductionFromConversion: rmdReduction,
      lifetimeTaxSavingsFromRMDReduction: lifetimeRMDSavings,
    },
    breakEvenYears,
    yearByYear,
    summary,
    recommendation,
    reasons,
  }
}
