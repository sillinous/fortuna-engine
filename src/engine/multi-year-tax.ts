/**
 * Fortuna Engine — Multi-Year Tax Projection & Income Shifting v9
 *
 * Models tax burden across 3-5 year horizons with:
 *  - Bracket-aware income timing optimization
 *  - Revenue growth projection with confidence intervals
 *  - Year-over-year strategy impact compounding
 *  - Income deferral vs acceleration recommendations
 *  - TCJA sunset modeling (2026 bracket changes)
 *  - Effective vs marginal rate trajectory
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'

// ===================================================================
//  TCJA SUNSET — 2026 brackets revert to pre-TCJA (inflation-adjusted)
// ===================================================================

const TCJA_SUNSET_YEAR = 2026

const PRE_TCJA_BRACKETS_PROJECTED = {
  single: [
    { min: 0, max: 11000, rate: 0.10 },
    { min: 11000, max: 44725, rate: 0.15 },
    { min: 44725, max: 95375, rate: 0.25 },
    { min: 95375, max: 171050, rate: 0.28 },
    { min: 171050, max: 372950, rate: 0.33 },
    { min: 372950, max: 418850, rate: 0.35 },
    { min: 418850, max: Infinity, rate: 0.396 },
  ],
  married_joint: [
    { min: 0, max: 22000, rate: 0.10 },
    { min: 22000, max: 89450, rate: 0.15 },
    { min: 89450, max: 190750, rate: 0.25 },
    { min: 190750, max: 342050, rate: 0.28 },
    { min: 342050, max: 418850, rate: 0.33 },
    { min: 418850, max: 628300, rate: 0.35 },
    { min: 628300, max: Infinity, rate: 0.396 },
  ],
}

const PRE_TCJA_STANDARD_DEDUCTION: Record<string, number> = {
  single: 8300,
  married_joint: 16600,
  married_separate: 8300,
  head_of_household: 12200,
}

// Current brackets for comparison
const CURRENT_BRACKETS = {
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
}

const CURRENT_STANDARD_DEDUCTION: Record<string, number> = {
  single: 14600,
  married_joint: 29200,
  married_separate: 14600,
  head_of_household: 21900,
}

// ===================================================================
//  TYPES
// ===================================================================

export interface YearProjection {
  year: number
  grossIncome: number
  growthRate: number
  taxableIncome: number
  federalTax: number
  stateTax: number
  seTax: number
  totalTax: number
  effectiveRate: number
  marginalRate: number
  afterTax: number
  bracketRegime: 'tcja' | 'pre_tcja'
  strategySavings: number
  cumulativeSavings: number
  bracketUtilization: BracketSlice[]
  lowEstimate: number
  highEstimate: number
  // Carryforward tracking
  capitalLossUsed?: number
  capitalLossRemaining?: number
  nolUsed?: number
  nolRemaining?: number
  charitableCarryUsed?: number
  charitableCarryRemaining?: number
}

export interface BracketSlice {
  rate: number
  filled: number
  capacity: number
  utilization: number // 0-1
}

export interface IncomeShiftScenario {
  id: string
  name: string
  description: string
  shifts: YearShift[]
  totalTaxSavings: number
  yearByYear: YearProjection[]
  recommendation: 'strong' | 'moderate' | 'neutral' | 'avoid'
  reasoning: string
}

interface YearShift {
  year: number
  shiftAmount: number // positive = defer into this year, negative = accelerate out
  shiftType: 'defer_revenue' | 'accelerate_expense' | 'prepay_expense' | 'delay_billing'
}

export interface MultiYearAnalysis {
  baseline: YearProjection[]
  scenarios: IncomeShiftScenario[]
  tcjaSunsetImpact: number // additional tax burden if TCJA expires
  optimalScenario: string // id of best scenario
  bracketHeadroom: number // room in current bracket before next rate jump
  insights: MultiYearInsight[]
}

export interface MultiYearInsight {
  type: 'warning' | 'opportunity' | 'info'
  title: string
  detail: string
  impact?: number
  actionView?: string
}

// ===================================================================
//  BRACKET CALCULATOR
// ===================================================================

function calcFederalTax(
  taxableIncome: number,
  filingStatus: string,
  year: number,
): { tax: number; marginal: number; slices: BracketSlice[] } {
  const useTCJA = year < TCJA_SUNSET_YEAR
  const statusKey = filingStatus === 'head_of_household' ? 'single' : filingStatus
  const key = (statusKey === 'married_joint' || statusKey === 'married_separate')
    ? 'married_joint' : 'single'

  const brackets = useTCJA
    ? CURRENT_BRACKETS[key]
    : (PRE_TCJA_BRACKETS_PROJECTED[key] || CURRENT_BRACKETS[key])

  let tax = 0
  let marginal = 0.10
  const slices: BracketSlice[] = []

  for (const b of brackets) {
    const capacity = b.max === Infinity ? b.min + 500000 : b.max - b.min
    const inBracket = Math.min(Math.max(0, taxableIncome - b.min), b.max - b.min)
    tax += inBracket * b.rate
    if (inBracket > 0) marginal = b.rate

    slices.push({
      rate: b.rate,
      filled: inBracket,
      capacity,
      utilization: capacity > 0 ? inBracket / capacity : 0,
    })
  }

  return { tax: Math.round(tax), marginal, slices }
}

function getStandardDeduction(filingStatus: string, year: number): number {
  const useTCJA = year < TCJA_SUNSET_YEAR
  const deductions = useTCJA ? CURRENT_STANDARD_DEDUCTION : PRE_TCJA_STANDARD_DEDUCTION
  return deductions[filingStatus] || deductions.single
}

// ===================================================================
//  GROWTH MODEL
// ===================================================================

function projectGrowthRate(state: FortunaState, yearsOut: number): number {
  // Base growth from income diversity and trajectory
  const activeStreams = state.incomeStreams.filter(s => s.isActive)
  const totalIncome = activeStreams.reduce((s, i) => s + i.annualAmount, 0)

  const businessIncome = activeStreams
    .filter(s => ['business', 'freelance'].includes(s.type))
    .reduce((s, i) => s + i.annualAmount, 0)

  const businessRatio = totalIncome > 0 ? businessIncome / totalIncome : 0

  // Business-heavy portfolios have higher growth potential but more variance
  const baseGrowth = 0.03 + businessRatio * 0.07 // 3-10% base
  // Growth moderates over time
  const decayFactor = Math.pow(0.92, yearsOut)
  return baseGrowth * decayFactor
}

function projectIncome(currentIncome: number, growthRate: number): {
  projected: number
  low: number
  high: number
} {
  const projected = Math.round(currentIncome * (1 + growthRate))
  const variance = 0.15 // ±15% confidence band
  return {
    projected,
    low: Math.round(projected * (1 - variance)),
    high: Math.round(projected * (1 + variance)),
  }
}

// ===================================================================
//  YEAR PROJECTION
// ===================================================================

function projectYear(
  state: FortunaState,
  year: number,
  grossIncome: number,
  growthRate: number,
  cumulativeSavingsBase: number,
  lowIncome: number,
  highIncome: number,
  carryforwards?: { capitalLoss: number; nol: number; charitable: number },
): YearProjection {
  const { profile } = state
  const stdDeduction = getStandardDeduction(profile.filingStatus, year)

  const currentReport = generateTaxReport(state)
  const seRatio = currentReport.grossIncome > 0
    ? currentReport.selfEmploymentIncome / currentReport.grossIncome : 0.5
  const seIncome = grossIncome * seRatio

  const itemized = state.deductions
    .filter(d => d.isItemized)
    .reduce((s, d) => s + d.amount, 0)
  const deduction = Math.max(stdDeduction, itemized)

  const qbi = seIncome > 0 ? Math.round(seIncome * 0.20) : 0

  // Apply carryforwards
  const cf = carryforwards || { capitalLoss: 0, nol: 0, charitable: 0 }
  const capitalLossUsed = Math.min(cf.capitalLoss, 3000) // $3k annual limit
  const nolUsed = cf.nol > 0 ? Math.min(cf.nol, Math.round(grossIncome * 0.80)) : 0 // 80% of income limit post-2017
  const charitableCarryUsed = Math.min(cf.charitable, Math.round(grossIncome * 0.60)) // 60% AGI limit

  const taxableIncome = Math.max(0, grossIncome - deduction - qbi - capitalLossUsed - nolUsed - charitableCarryUsed)

  const { tax: federalTax, marginal, slices } = calcFederalTax(taxableIncome, profile.filingStatus, year)

  const seBase = seIncome * 0.9235
  const seTax = Math.round(seBase * 0.153)

  const stateRate = currentReport.stateTax / (currentReport.grossIncome || 1)
  const stateTax = Math.round(grossIncome * stateRate)

  const totalTax = federalTax + seTax + stateTax
  const effectiveRate = grossIncome > 0 ? totalTax / grossIncome : 0

  const yearIndex = year - new Date().getFullYear()
  const strategySavings = Math.round(
    (currentReport.identifiedSavings || 0) * Math.pow(1.05, yearIndex)
  )

  return {
    year,
    grossIncome,
    growthRate,
    taxableIncome,
    federalTax,
    stateTax,
    seTax,
    totalTax,
    effectiveRate,
    marginalRate: marginal,
    afterTax: grossIncome - totalTax,
    bracketRegime: year < TCJA_SUNSET_YEAR ? 'tcja' : 'pre_tcja',
    strategySavings,
    cumulativeSavings: cumulativeSavingsBase + strategySavings,
    bracketUtilization: slices,
    lowEstimate: Math.round(lowIncome - lowIncome * effectiveRate),
    highEstimate: Math.round(highIncome - highIncome * effectiveRate),
    capitalLossUsed,
    capitalLossRemaining: cf.capitalLoss - capitalLossUsed,
    nolUsed,
    nolRemaining: cf.nol - nolUsed,
    charitableCarryUsed,
    charitableCarryRemaining: cf.charitable - charitableCarryUsed,
  }
}

// ===================================================================
//  INCOME SHIFTING SCENARIOS
// ===================================================================

function generateShiftScenarios(
  state: FortunaState,
  baseline: YearProjection[],
): IncomeShiftScenario[] {
  const scenarios: IncomeShiftScenario[] = []
  const currentYear = new Date().getFullYear()
  const report = generateTaxReport(state)

  if (baseline.length < 2) return scenarios

  // ── Scenario 1: Accelerate income before TCJA sunset ──
  const tcjaYears = baseline.filter(y => y.bracketRegime === 'tcja')
  const postTcjaYears = baseline.filter(y => y.bracketRegime === 'pre_tcja')

  if (tcjaYears.length > 0 && postTcjaYears.length > 0) {
    const shiftAmount = Math.round(report.grossIncome * 0.10) // shift 10%
    const shifts: YearShift[] = [
      { year: TCJA_SUNSET_YEAR - 1, shiftAmount: shiftAmount, shiftType: 'accelerate_expense' as const },
      { year: TCJA_SUNSET_YEAR, shiftAmount: -shiftAmount, shiftType: 'defer_revenue' as const },
    ]

    // Calculate savings
    const lastTcjaYear = tcjaYears[tcjaYears.length - 1]
    const firstPostYear = postTcjaYears[0]
    const rateGap = (firstPostYear.marginalRate - lastTcjaYear.marginalRate)
    const savings = Math.round(shiftAmount * Math.max(0, rateGap))

    scenarios.push({
      id: 'accelerate-pre-sunset',
      name: 'Accelerate Income Before TCJA Sunset',
      description: `Recognize $${shiftAmount.toLocaleString()} additional income in ${TCJA_SUNSET_YEAR - 1} to lock in current lower rates before brackets revert.`,
      shifts,
      totalTaxSavings: savings,
      yearByYear: baseline, // simplified
      recommendation: savings > 2000 ? 'strong' : savings > 500 ? 'moderate' : 'neutral',
      reasoning: `Current top rate of ${(lastTcjaYear.marginalRate * 100).toFixed(0)}% jumps to ${(firstPostYear.marginalRate * 100).toFixed(0)}% after sunset. Accelerating income saves the rate differential on shifted amount.`,
    })
  }

  // ── Scenario 2: Bracket smoothing — even out lumpy income ──
  const avgIncome = baseline.reduce((s, y) => s + y.grossIncome, 0) / baseline.length
  const maxDeviation = Math.max(...baseline.map(y => Math.abs(y.grossIncome - avgIncome)))

  if (maxDeviation > avgIncome * 0.15) {
    const peakYear = baseline.reduce((a, b) => a.grossIncome > b.grossIncome ? a : b)
    const valleyYear = baseline.reduce((a, b) => a.grossIncome < b.grossIncome ? a : b)
    const shiftAmount = Math.round((peakYear.grossIncome - valleyYear.grossIncome) * 0.25)

    const rateDiff = peakYear.marginalRate - valleyYear.marginalRate
    const savings = Math.round(shiftAmount * Math.max(0, rateDiff))

    scenarios.push({
      id: 'bracket-smoothing',
      name: 'Bracket Smoothing',
      description: `Shift $${shiftAmount.toLocaleString()} from peak year (${peakYear.year}) to lower year (${valleyYear.year}) to reduce marginal rate exposure.`,
      shifts: [
        { year: peakYear.year, shiftAmount: -shiftAmount, shiftType: 'defer_revenue' },
        { year: valleyYear.year, shiftAmount: shiftAmount, shiftType: 'delay_billing' },
      ],
      totalTaxSavings: savings,
      yearByYear: baseline,
      recommendation: savings > 3000 ? 'strong' : savings > 1000 ? 'moderate' : 'neutral',
      reasoning: `Income variance of $${maxDeviation.toLocaleString()} pushes peak years into higher brackets. Smoothing keeps more income at ${(valleyYear.marginalRate * 100).toFixed(0)}% instead of ${(peakYear.marginalRate * 100).toFixed(0)}%.`,
    })
  }

  // ── Scenario 3: Defer into lower-rate year ──
  if (baseline.length >= 2) {
    const thisYear = baseline[0]
    const nextYear = baseline[1]

    if (thisYear.marginalRate > nextYear.marginalRate) {
      const shiftAmount = Math.round(report.grossIncome * 0.08)
      const savings = Math.round(shiftAmount * (thisYear.marginalRate - nextYear.marginalRate))

      scenarios.push({
        id: 'defer-next-year',
        name: 'Defer Revenue to Next Year',
        description: `Push $${shiftAmount.toLocaleString()} in revenue recognition to ${nextYear.year} where your projected marginal rate is lower.`,
        shifts: [
          { year: thisYear.year, shiftAmount: -shiftAmount, shiftType: 'defer_revenue' },
          { year: nextYear.year, shiftAmount: shiftAmount, shiftType: 'delay_billing' },
        ],
        totalTaxSavings: savings,
        yearByYear: baseline,
        recommendation: savings > 2000 ? 'strong' : 'moderate',
        reasoning: `Your ${thisYear.year} marginal rate (${(thisYear.marginalRate * 100).toFixed(0)}%) exceeds ${nextYear.year} (${(nextYear.marginalRate * 100).toFixed(0)}%). Timing flexibility can capture the rate differential.`,
      })
    }
  }

  // ── Scenario 4: Maximize retirement contributions pre-sunset ──
  if (report.retirementGap > 5000 && tcjaYears.length > 0) {
    const maxDefer = Math.min(report.retirementGap, 69000)
    const savings = Math.round(maxDefer * baseline[0].marginalRate)

    scenarios.push({
      id: 'max-retirement-pre-sunset',
      name: 'Max Retirement Contributions Before Sunset',
      description: `Deploy full $${maxDefer.toLocaleString()} retirement contribution capacity while TCJA deductions are at their most valuable.`,
      shifts: tcjaYears.map(y => ({
        year: y.year,
        shiftAmount: -maxDefer,
        shiftType: 'accelerate_expense' as const,
      })),
      totalTaxSavings: savings * tcjaYears.length,
      yearByYear: baseline,
      recommendation: 'strong',
      reasoning: `Every $1 deducted now saves ${(baseline[0].marginalRate * 100).toFixed(0)}¢. After sunset, the same deduction may only save ${Math.round(baseline[0].marginalRate * 0.85 * 100)}¢. Front-loading is optimal.`,
    })
  }

  // ── Scenario 5: Prepay expenses in high-income year ──
  const highYears = baseline.filter(y => y.marginalRate >= 0.32)
  if (highYears.length > 0) {
    const prepayAmount = Math.round(
      state.expenses.reduce((s, e) => s + (e.isDeductible ? e.annualAmount * e.deductionPct / 100 : 0), 0) * 0.5
    )
    if (prepayAmount > 2000) {
      const savings = Math.round(prepayAmount * highYears[0].marginalRate)
      scenarios.push({
        id: 'prepay-high-year',
        name: 'Prepay Deductible Expenses',
        description: `Accelerate $${prepayAmount.toLocaleString()} in deductible expenses into ${highYears[0].year} (${(highYears[0].marginalRate * 100).toFixed(0)}% bracket) for maximum deduction value.`,
        shifts: [
          { year: highYears[0].year, shiftAmount: -prepayAmount, shiftType: 'prepay_expense' },
        ],
        totalTaxSavings: savings,
        yearByYear: baseline,
        recommendation: savings > 1500 ? 'moderate' : 'neutral',
        reasoning: `Deductions are worth more in higher brackets. Prepaying shifts deduction value from a potential ${((highYears[0].marginalRate - 0.02) * 100).toFixed(0)}% year to the ${(highYears[0].marginalRate * 100).toFixed(0)}% year.`,
      })
    }
  }

  return scenarios.sort((a, b) => b.totalTaxSavings - a.totalTaxSavings)
}

// ===================================================================
//  INSIGHTS GENERATOR
// ===================================================================

function generateInsights(
  baseline: YearProjection[],
  scenarios: IncomeShiftScenario[],
  state: FortunaState,
): MultiYearInsight[] {
  const insights: MultiYearInsight[] = []

  // TCJA sunset warning
  const tcjaTransition = baseline.find(y => y.bracketRegime === 'pre_tcja')
  if (tcjaTransition) {
    const lastTcja = baseline.filter(y => y.bracketRegime === 'tcja').pop()
    if (lastTcja && tcjaTransition) {
      const impact = tcjaTransition.totalTax - Math.round(
        tcjaTransition.grossIncome * lastTcja.effectiveRate
      )
      insights.push({
        type: 'warning',
        title: `TCJA Sunset in ${TCJA_SUNSET_YEAR}`,
        detail: `Tax brackets revert to pre-2017 rates. Your projected tax increase: $${Math.max(0, impact).toLocaleString()}/year. Standard deduction drops from $${CURRENT_STANDARD_DEDUCTION[state.profile.filingStatus]?.toLocaleString()} to ~$${PRE_TCJA_STANDARD_DEDUCTION[state.profile.filingStatus]?.toLocaleString()}.`,
        impact: Math.max(0, impact),
      })
    }
  }

  // Bracket jump warning
  const currentBracket = baseline[0]?.marginalRate || 0
  for (const yr of baseline.slice(1)) {
    if (yr.marginalRate > currentBracket + 0.05) {
      insights.push({
        type: 'warning',
        title: `Bracket Jump in ${yr.year}`,
        detail: `Projected income growth pushes marginal rate from ${(currentBracket * 100).toFixed(0)}% to ${(yr.marginalRate * 100).toFixed(0)}%. Consider deferral or retirement contributions to stay in current bracket.`,
        impact: yr.totalTax - baseline[0].totalTax,
        actionView: 'retirement',
      })
      break
    }
  }

  // Bracket headroom opportunity
  if (baseline.length > 0) {
    const current = baseline[0]
    const underutilized = current.bracketUtilization.find(s => s.utilization > 0 && s.utilization < 0.85)
    if (underutilized) {
      const headroom = underutilized.capacity - underutilized.filled
      if (headroom > 10000) {
        insights.push({
          type: 'opportunity',
          title: 'Bracket Headroom Available',
          detail: `$${headroom.toLocaleString()} room at ${(underutilized.rate * 100).toFixed(0)}% before jumping to next bracket. Consider Roth conversions or income recognition to fill this space at the lower rate.`,
          impact: headroom,
          actionView: 'retirement',
        })
      }
    }
  }

  // Effective rate trend
  if (baseline.length >= 3) {
    const rateChange = baseline[baseline.length - 1].effectiveRate - baseline[0].effectiveRate
    if (Math.abs(rateChange) > 0.02) {
      insights.push({
        type: rateChange > 0 ? 'warning' : 'opportunity',
        title: rateChange > 0 ? 'Rising Effective Rate' : 'Declining Effective Rate',
        detail: `Your effective rate ${rateChange > 0 ? 'increases' : 'decreases'} from ${(baseline[0].effectiveRate * 100).toFixed(1)}% to ${(baseline[baseline.length - 1].effectiveRate * 100).toFixed(1)}% over the projection period.`,
      })
    }
  }

  // Total scenario savings
  const bestScenario = scenarios[0]
  if (bestScenario && bestScenario.totalTaxSavings > 1000) {
    insights.push({
      type: 'opportunity',
      title: `Income Shifting Could Save $${bestScenario.totalTaxSavings.toLocaleString()}`,
      detail: `The "${bestScenario.name}" strategy is the highest-impact timing optimization available. ${bestScenario.reasoning}`,
      impact: bestScenario.totalTaxSavings,
    })
  }

  // 5-year cumulative tax projection
  const totalTax5yr = baseline.reduce((s, y) => s + y.totalTax, 0)
  const totalIncome5yr = baseline.reduce((s, y) => s + y.grossIncome, 0)
  insights.push({
    type: 'info',
    title: `${baseline.length}-Year Tax Projection: $${totalTax5yr.toLocaleString()}`,
    detail: `On $${totalIncome5yr.toLocaleString()} projected gross income, blended effective rate of ${(totalTax5yr / totalIncome5yr * 100).toFixed(1)}%.`,
  })

  return insights
}

// ===================================================================
//  MAIN ANALYSIS
// ===================================================================

export function runMultiYearAnalysis(
  state: FortunaState,
  years: number = 5,
): MultiYearAnalysis {
  const currentYear = new Date().getFullYear()
  const report = generateTaxReport(state)
  const baseline: YearProjection[] = []

  let income = report.grossIncome
  let cumulativeSavings = 0

  // Initialize carryforwards from metamodel
  const cf = state.carryforwards || {}
  let carryforwards = {
    capitalLoss: cf.capitalLoss || 0,
    nol: cf.netOperatingLoss || 0,
    charitable: cf.charitableContributions || 0,
  }

  for (let i = 0; i < years; i++) {
    const year = currentYear + i
    const growthRate = i === 0 ? 0 : projectGrowthRate(state, i)
    const { projected, low, high } = i === 0
      ? { projected: income, low: income, high: income }
      : projectIncome(income, growthRate)

    const yp = projectYear(state, year, projected, growthRate, cumulativeSavings, low, high, carryforwards)
    baseline.push(yp)

    // Propagate remaining carryforwards to next year
    carryforwards = {
      capitalLoss: yp.capitalLossRemaining || 0,
      nol: yp.nolRemaining || 0,
      charitable: yp.charitableCarryRemaining || 0,
    }

    cumulativeSavings = yp.cumulativeSavings
    income = projected
  }

  const scenarios = generateShiftScenarios(state, baseline)
  const insights = generateInsights(baseline, scenarios, state)

  // TCJA sunset impact
  const preSunset = baseline.filter(y => y.bracketRegime === 'tcja')
  const postSunset = baseline.filter(y => y.bracketRegime === 'pre_tcja')
  let tcjaSunsetImpact = 0
  if (preSunset.length > 0 && postSunset.length > 0) {
    const lastPre = preSunset[preSunset.length - 1]
    const firstPost = postSunset[0]
    tcjaSunsetImpact = Math.max(0, firstPost.totalTax - Math.round(firstPost.grossIncome * lastPre.effectiveRate))
  }

  // Bracket headroom
  let bracketHeadroom = 0
  if (baseline.length > 0) {
    const current = baseline[0]
    const activeBracket = current.bracketUtilization.find(s => s.utilization > 0 && s.utilization < 1)
    if (activeBracket) {
      bracketHeadroom = activeBracket.capacity - activeBracket.filled
    }
  }

  return {
    baseline,
    scenarios,
    tcjaSunsetImpact,
    optimalScenario: scenarios[0]?.id || '',
    bracketHeadroom: Math.round(bracketHeadroom),
    insights,
  }
}
