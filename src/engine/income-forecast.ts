/**
 * FORTUNA ENGINE — Income Forecasting Engine v1
 * 
 * Predictive modeling for self-employed income:
 *   - Historical pattern analysis from bank transactions
 *   - Seasonal adjustment detection
 *   - Growth trend calculation (linear + exponential)
 *   - Quarterly estimated tax projection
 *   - Cash reserve recommendations
 *   - Scenario planning (best/expected/worst)
 *   - Safe harbor payment calculator
 *   - Year-end tax position forecast
 */

export interface ForecastResult {
  period: string              // "2025-Q3", "2025", etc.
  projectedIncome: number
  projectedExpenses: number
  projectedNetIncome: number
  estimatedTaxLiability: number
  estimatedPaymentNeeded: number
  confidence: 'high' | 'medium' | 'low'
  scenarios: {
    optimistic: { income: number; tax: number }
    expected: { income: number; tax: number }
    conservative: { income: number; tax: number }
  }
}

export interface IncomePattern {
  monthlyAverages: number[]     // index 0 = Jan
  seasonalFactors: number[]     // 1.0 = average, 1.2 = 20% above average
  growthRate: number            // annual growth rate
  volatility: number            // standard deviation as % of mean
  trend: 'growing' | 'stable' | 'declining'
  peakMonths: number[]          // best months (0-indexed)
  troughMonths: number[]        // worst months
}

export interface SafeHarborCalc {
  priorYearTax: number
  currentYearEstimate: number
  method: '100_prior' | '110_prior' | '90_current'  // which safe harbor to use
  quarterlyPayment: number
  totalRequired: number
  alreadyPaid: number
  remaining: number
  nextPaymentDate: string
  nextPaymentAmount: number
  onTrack: boolean
}

export interface CashReserve {
  monthsOfExpenses: number
  recommendedReserve: number
  currentReserve: number
  taxReserve: number            // set aside for quarterly payments
  emergencyReserve: number
  totalRecommended: number
  gap: number
}

// ─── Pattern Analysis ───────────────────────────────────────────────────────

export function analyzeIncomePattern(
  monthlyIncome: { month: string; amount: number }[],  // "2024-01", etc.
): IncomePattern {
  if (monthlyIncome.length < 3) {
    return {
      monthlyAverages: Array(12).fill(0),
      seasonalFactors: Array(12).fill(1),
      growthRate: 0,
      volatility: 0,
      trend: 'stable',
      peakMonths: [],
      troughMonths: [],
    }
  }

  // Group by month-of-year
  const byMonth: Record<number, number[]> = {}
  for (let m = 0; m < 12; m++) byMonth[m] = []

  for (const entry of monthlyIncome) {
    const monthIdx = parseInt(entry.month.split('-')[1]) - 1
    byMonth[monthIdx].push(entry.amount)
  }

  // Monthly averages
  const monthlyAverages = Array(12).fill(0).map((_, m) =>
    byMonth[m].length > 0 ? byMonth[m].reduce((s, n) => s + n, 0) / byMonth[m].length : 0
  )

  const overallAvg = monthlyAverages.reduce((s, n) => s + n, 0) / Math.max(1, monthlyAverages.filter(n => n > 0).length)

  // Seasonal factors
  const seasonalFactors = monthlyAverages.map(avg =>
    overallAvg > 0 ? Math.round((avg / overallAvg) * 100) / 100 : 1
  )

  // Growth rate (compare first half to second half of data)
  const sorted = [...monthlyIncome].sort((a, b) => a.month.localeCompare(b.month))
  const half = Math.floor(sorted.length / 2)
  const firstHalfAvg = sorted.slice(0, half).reduce((s, e) => s + e.amount, 0) / Math.max(1, half)
  const secondHalfAvg = sorted.slice(half).reduce((s, e) => s + e.amount, 0) / Math.max(1, sorted.length - half)
  const monthsSpan = sorted.length
  const growthRate = firstHalfAvg > 0
    ? Math.pow(secondHalfAvg / firstHalfAvg, 12 / Math.max(1, monthsSpan)) - 1
    : 0

  // Volatility
  const amounts = monthlyIncome.map(e => e.amount)
  const mean = amounts.reduce((s, n) => s + n, 0) / amounts.length
  const variance = amounts.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / amounts.length
  const volatility = mean > 0 ? Math.sqrt(variance) / mean : 0

  // Trend
  const trend: IncomePattern['trend'] = growthRate > 0.05 ? 'growing' : growthRate < -0.05 ? 'declining' : 'stable'

  // Peak/trough months
  const avgForRanking = monthlyAverages.map((avg, i) => ({ month: i, avg })).filter(m => m.avg > 0)
  avgForRanking.sort((a, b) => b.avg - a.avg)
  const peakMonths = avgForRanking.slice(0, 3).map(m => m.month)
  const troughMonths = avgForRanking.slice(-3).map(m => m.month)

  return { monthlyAverages, seasonalFactors, growthRate, volatility, trend, peakMonths, troughMonths }
}

// ─── Forecasting ────────────────────────────────────────────────────────────

export function forecastIncome(
  pattern: IncomePattern,
  baselineAnnualIncome: number,
  baselineAnnualExpenses: number,
  forecastMonths: number = 12,
  startMonth: number = new Date().getMonth(),  // 0-indexed
  marginalRate: number = 0.32,
  seRate: number = 0.153,
): ForecastResult[] {
  const results: ForecastResult[] = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = startMonth

  // Generate monthly forecasts
  const monthlyForecasts: { month: string; income: number; expenses: number }[] = []
  const monthlyBase = baselineAnnualIncome / 12
  const monthlyExpBase = baselineAnnualExpenses / 12

  for (let i = 0; i < forecastMonths; i++) {
    const monthIdx = (currentMonth + i) % 12
    const yearOffset = Math.floor((currentMonth + i) / 12)
    const year = currentYear + yearOffset
    const monthStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}`

    const growthFactor = Math.pow(1 + pattern.growthRate, (i + 1) / 12)
    const seasonalFactor = pattern.seasonalFactors[monthIdx] || 1
    const projected = monthlyBase * growthFactor * seasonalFactor

    monthlyForecasts.push({
      month: monthStr,
      income: Math.round(projected),
      expenses: Math.round(monthlyExpBase * growthFactor * 0.9), // expenses grow slower
    })
  }

  // Aggregate into quarterly forecasts
  let qIncome = 0, qExpenses = 0, qMonths = 0
  let qStart = ''

  for (let i = 0; i < monthlyForecasts.length; i++) {
    const mf = monthlyForecasts[i]
    if (qMonths === 0) qStart = mf.month

    qIncome += mf.income
    qExpenses += mf.expenses
    qMonths++

    if (qMonths === 3 || i === monthlyForecasts.length - 1) {
      const year = qStart.split('-')[0]
      const startMo = parseInt(qStart.split('-')[1])
      const quarter = Math.ceil(startMo / 3)
      const period = `${year}-Q${quarter}`

      const netIncome = qIncome - qExpenses
      const taxLiability = Math.round(netIncome * (marginalRate + seRate * 0.5))
      const paymentNeeded = Math.round(taxLiability)

      const volatilityFactor = pattern.volatility

      results.push({
        period,
        projectedIncome: Math.round(qIncome),
        projectedExpenses: Math.round(qExpenses),
        projectedNetIncome: Math.round(netIncome),
        estimatedTaxLiability: Math.max(0, taxLiability),
        estimatedPaymentNeeded: Math.max(0, paymentNeeded),
        confidence: volatilityFactor < 0.2 ? 'high' : volatilityFactor < 0.4 ? 'medium' : 'low',
        scenarios: {
          optimistic: {
            income: Math.round(qIncome * (1 + volatilityFactor * 0.5)),
            tax: Math.round(qIncome * (1 + volatilityFactor * 0.5) * (marginalRate + seRate * 0.5)),
          },
          expected: {
            income: Math.round(qIncome),
            tax: Math.max(0, taxLiability),
          },
          conservative: {
            income: Math.round(qIncome * (1 - volatilityFactor * 0.5)),
            tax: Math.round(Math.max(0, qIncome * (1 - volatilityFactor * 0.5)) * (marginalRate + seRate * 0.5)),
          },
        },
      })

      qIncome = 0
      qExpenses = 0
      qMonths = 0
    }
  }

  return results
}

// ─── Safe Harbor Calculator ─────────────────────────────────────────────────

export function calculateSafeHarbor(params: {
  priorYearTax: number
  priorYearAGI: number
  currentYearEstimatedTax: number
  alreadyPaid: number
  currentQuarter: number         // 1-4
}): SafeHarborCalc {
  const { priorYearTax, priorYearAGI, currentYearEstimatedTax, alreadyPaid, currentQuarter } = params

  // Three safe harbor methods:
  // 1. Pay 100% of prior year tax (110% if AGI > $150K)
  // 2. Pay 90% of current year tax
  const priorYearFactor = priorYearAGI > 150000 ? 1.10 : 1.00
  const method100 = priorYearTax * priorYearFactor
  const method90 = currentYearEstimatedTax * 0.90

  // Use whichever is lower (more favorable to taxpayer)
  const useMethod = method100 < method90 ? (priorYearFactor > 1 ? '110_prior' : '100_prior') : '90_current'
  const totalRequired = Math.min(method100, method90)
  const quarterlyPayment = Math.round(totalRequired / 4)

  // Payment schedule
  const year = new Date().getFullYear()
  const deadlines = [
    `${year}-04-15`, `${year}-06-16`, `${year}-09-15`, `${year + 1}-01-15`,
  ]

  const requiredByNow = quarterlyPayment * currentQuarter
  const remaining = Math.max(0, totalRequired - alreadyPaid)
  const onTrack = alreadyPaid >= requiredByNow * 0.95

  const nextQ = Math.min(currentQuarter, 3) // 0-indexed for deadlines
  const nextPaymentDate = deadlines[nextQ] || deadlines[3]
  const nextPaymentAmount = Math.round(remaining / Math.max(1, 4 - currentQuarter + 1))

  return {
    priorYearTax,
    currentYearEstimate: currentYearEstimatedTax,
    method: useMethod,
    quarterlyPayment,
    totalRequired: Math.round(totalRequired),
    alreadyPaid,
    remaining: Math.round(remaining),
    nextPaymentDate,
    nextPaymentAmount,
    onTrack,
  }
}

// ─── Cash Reserve Calculator ────────────────────────────────────────────────

export function calculateCashReserve(params: {
  monthlyExpenses: number
  annualTaxLiability: number
  currentCash: number
  irregularIncome: boolean
}): CashReserve {
  const { monthlyExpenses, annualTaxLiability, currentCash, irregularIncome } = params

  // Self-employed need more reserves than W-2
  const monthsRecommended = irregularIncome ? 6 : 4
  const emergencyReserve = monthlyExpenses * monthsRecommended
  const taxReserve = annualTaxLiability * 0.3 // keep 30% of annual tax as buffer
  const totalRecommended = emergencyReserve + taxReserve

  return {
    monthsOfExpenses: currentCash > 0 ? Math.round((currentCash / monthlyExpenses) * 10) / 10 : 0,
    recommendedReserve: Math.round(emergencyReserve),
    currentReserve: Math.round(currentCash),
    taxReserve: Math.round(taxReserve),
    emergencyReserve: Math.round(emergencyReserve),
    totalRecommended: Math.round(totalRecommended),
    gap: Math.round(Math.max(0, totalRecommended - currentCash)),
  }
}

// ─── Year-End Tax Position Forecast ─────────────────────────────────────────

export function forecastYearEnd(params: {
  ytdIncome: number
  ytdExpenses: number
  ytdTaxPaid: number           // estimated payments + withholding
  monthsRemaining: number
  pattern: IncomePattern
  filingStatus: 'single' | 'mfj'
  stateCode: string
  retirementContributions: number
}): {
  projectedAnnualIncome: number
  projectedAnnualTax: number
  projectedRefundOrOwed: number
  recommendation: string
  actions: string[]
} {
  const { ytdIncome, ytdExpenses, ytdTaxPaid, monthsRemaining, pattern, retirementContributions } = params

  // Project remaining months
  const monthlyAvgIncome = ytdIncome / Math.max(1, 12 - monthsRemaining)
  let remainingIncome = 0
  const currentMonth = 12 - monthsRemaining

  for (let m = currentMonth; m < 12; m++) {
    const seasonal = pattern.seasonalFactors[m] || 1
    remainingIncome += monthlyAvgIncome * seasonal
  }

  const projectedAnnual = ytdIncome + remainingIncome
  const projectedExpenses = ytdExpenses * (12 / Math.max(1, 12 - monthsRemaining))
  const projectedNet = projectedAnnual - projectedExpenses - retirementContributions

  // Rough tax estimate
  const seTax = projectedNet * 0.9235 * 0.153
  const taxableIncome = Math.max(0, projectedNet - seTax / 2 - 15000)

  let fedTax = 0
  const brackets: [number, number][] = [
    [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
    [250525, 0.32], [626350, 0.35], [Infinity, 0.37],
  ]
  let rem = taxableIncome, prev = 0
  for (const [max, rate] of brackets) {
    const t = Math.min(rem, max - prev)
    if (t <= 0) break
    fedTax += t * rate
    rem -= t
    prev = max
  }

  const projectedTax = Math.round(fedTax + seTax)
  const refundOrOwed = ytdTaxPaid - projectedTax

  const actions: string[] = []
  let recommendation = ''

  if (refundOrOwed < -5000) {
    recommendation = `You may owe approximately $${Math.abs(Math.round(refundOrOwed)).toLocaleString()} at year-end. Increase estimated payments.`
    actions.push(`Increase Q${Math.ceil((12 - monthsRemaining + 1) / 3)} estimated payment`)
    if (retirementContributions < 69000) actions.push('Maximize retirement contributions to reduce taxable income')
  } else if (refundOrOwed > 5000) {
    recommendation = `You're overpaying — projected refund of $${Math.round(refundOrOwed).toLocaleString()}. Consider reducing estimated payments and investing the difference.`
    actions.push('Consider reducing next estimated payment')
    actions.push('Review if Roth conversion makes sense to use up low brackets')
  } else {
    recommendation = 'On track — estimated payments are well-aligned with projected liability.'
  }

  if (monthsRemaining <= 3) {
    actions.push('Review tax-loss harvesting opportunities before Dec 31')
    actions.push('Confirm Solo 401(k) employee deferrals by Dec 31')
    actions.push('Consider year-end equipment purchases for §179 deduction')
  }

  return {
    projectedAnnualIncome: Math.round(projectedAnnual),
    projectedAnnualTax: projectedTax,
    projectedRefundOrOwed: Math.round(refundOrOwed),
    recommendation,
    actions,
  }
}

// ─── Phase H: Entity-Aware Income Forecast ─────────────────────────────────

import type { IncomeStream, EstimatedPayment } from './storage'

export interface EntityForecast {
  entityId: string
  entityName: string
  projectedIncome: number
  projectedExpenses: number
  projectedNetIncome: number
  growthTrend: 'growing' | 'stable' | 'declining'
}

export function forecastByEntity(
  incomeStreams: IncomeStream[],
  expenses: { entityId?: string; annualAmount: number; isDeductible: boolean; deductionPct: number }[],
  entities: { id: string; name: string }[],
): EntityForecast[] {
  const entityIds = new Set<string>()
  incomeStreams.filter(s => s.isActive).forEach(s => entityIds.add(s.entityId || 'personal'))
  expenses.forEach(e => entityIds.add(e.entityId || 'personal'))

  return [...entityIds].map(eid => {
    const entityIncome = incomeStreams
      .filter(s => s.isActive && (s.entityId || 'personal') === eid)
      .reduce((s, i) => s + i.annualAmount, 0)
    const entityExpenses = expenses
      .filter(e => (e.entityId || 'personal') === eid && e.isDeductible)
      .reduce((s, e) => s + e.annualAmount * e.deductionPct / 100, 0)
    const entity = entities.find(e => e.id === eid)

    return {
      entityId: eid,
      entityName: entity?.name || (eid === 'personal' ? 'Personal' : eid),
      projectedIncome: entityIncome,
      projectedExpenses: entityExpenses,
      projectedNetIncome: entityIncome - entityExpenses,
      growthTrend: 'stable' as const, // could enhance with historical data
    }
  })
}

// ─── Phase G: Income Forecast → Estimated Payment Generation ────────────────

export interface ComputedEstimatedPayments {
  year: number
  annualLiability: number
  safeHarborAmount: number
  quarterlyAmount: number
  payments: EstimatedPayment[]
}

export function computeEstimatedPayments(
  projectedAnnualIncome: number,
  projectedAnnualTax: number,
  withholdingTotal: number,
  priorYearTax: number,
  taxYear: number = new Date().getFullYear(),
): ComputedEstimatedPayments {
  // Safe harbor: lesser of 100% of prior year tax or 90% of current year
  // (110% of prior year if AGI > $150k)
  const safeHarborPrior = projectedAnnualIncome > 150000
    ? Math.round(priorYearTax * 1.10)
    : priorYearTax
  const safeHarbor90 = Math.round(projectedAnnualTax * 0.90)
  const safeHarborAmount = Math.min(safeHarborPrior, safeHarbor90)

  const remainingLiability = Math.max(0, safeHarborAmount - withholdingTotal)
  const quarterlyAmount = Math.round(remainingLiability / 4)

  const quarters = [
    { quarter: 1, dueDate: `${taxYear}-04-15` },
    { quarter: 2, dueDate: `${taxYear}-06-15` },
    { quarter: 3, dueDate: `${taxYear}-09-15` },
    { quarter: 4, dueDate: `${taxYear + 1}-01-15` },
  ]

  const payments: EstimatedPayment[] = quarters.map(q => ({
    id: `est-${taxYear}-q${q.quarter}`,
    taxYear,
    quarter: q.quarter as 1 | 2 | 3 | 4,
    dueDate: q.dueDate,
    amount: quarterlyAmount,
    paidAmount: 0,
    paidDate: undefined,
    jurisdiction: 'federal' as const,
    entityId: 'personal',
    memberId: 'primary',
    tags: ['auto-computed'],
  }))

  return {
    year: taxYear,
    annualLiability: projectedAnnualTax,
    safeHarborAmount,
    quarterlyAmount,
    payments,
  }
}
