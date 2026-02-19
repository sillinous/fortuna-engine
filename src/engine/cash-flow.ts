/**
 * Fortuna Engine - Cash Flow Forecaster
 * Monthly cash flow projections with quarterly tax payments,
 * seasonal patterns, runway analysis, and expense forecasting.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'

// ─── Types ──────────────────────────────────────────────────────

export interface MonthlyForecast {
  month: number // 0-11
  label: string
  year: number
  // Income
  grossIncome: number
  seasonalMultiplier: number
  // Expenses
  businessExpenses: number
  personalExpenses: number
  retirementContribution: number
  // Tax
  estimatedTaxPayment: number // quarterly payment (only in Q months)
  monthlyTaxAccrual: number // how much tax accrues this month
  isQuarterlyPaymentMonth: boolean
  // W-2 Withholding
  w2Withholding: number  // monthly W-2 withholding (fed + state + FICA)
  w2FederalWithholding: number
  w2StateWithholding: number
  w2FICAWithholding: number
  cumulativeWithheld: number // running total of withholding
  // Cash
  netCashFlow: number
  cumulativeCash: number
  // Runway
  monthsOfRunway: number
}

export interface CashFlowSummary {
  months: MonthlyForecast[]
  // Annual totals
  totalGrossIncome: number
  totalBusinessExpenses: number
  totalPersonalExpenses: number
  totalRetirement: number
  totalTaxPayments: number
  totalW2Withheld: number // total W-2 withholding for the period
  remainingEstimatedTax: number // what SE earners still owe after W-2 withholding
  totalNetCash: number
  // Analytics
  averageMonthlyCash: number
  lowestCashMonth: MonthlyForecast
  highestCashMonth: MonthlyForecast
  monthsNegative: number
  burnRate: number // monthly average expenses
  runwayMonths: number // at current savings rate
  // Seasonal patterns
  seasonalPattern: 'stable' | 'cyclical' | 'growth' | 'decline'
  cashReserveRecommendation: number
  emergencyFundTarget: number
}

export interface CashFlowConfig {
  projectionMonths: number // 12-24
  startingCash: number
  growthRate: number // monthly %
  seasonality: 'none' | 'mild' | 'moderate' | 'strong'
  personalMonthlyExpenses: number
  retirementPct: number // % of income
}

// ─── Seasonal Patterns ───────────────────────────────────────────

const SEASONAL_MULTIPLIERS: Record<string, number[]> = {
  none: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  mild: [0.92, 0.95, 1.0, 1.02, 1.05, 1.03, 0.98, 0.95, 1.02, 1.05, 1.08, 0.95],
  moderate: [0.80, 0.85, 0.95, 1.05, 1.10, 1.05, 0.90, 0.85, 1.05, 1.15, 1.20, 0.85],
  strong: [0.65, 0.70, 0.85, 1.10, 1.25, 1.15, 0.80, 0.75, 1.10, 1.30, 1.40, 0.75],
}

// IRS Quarterly estimated tax payment months (0-indexed)
// Q1: Apr 15, Q2: Jun 15, Q3: Sep 15, Q4: Jan 15 (next year)
const QUARTERLY_TAX_MONTHS = [3, 5, 8, 0] // April, June, September, January

// ─── Cash Flow Generator ─────────────────────────────────────────

export function generateCashFlow(
  state: FortunaState,
  config: CashFlowConfig = {
    projectionMonths: 12,
    startingCash: 10000,
    growthRate: 0,
    seasonality: 'mild',
    personalMonthlyExpenses: 3000,
    retirementPct: 0,
  },
  entityFilter?: string, // 'all' | 'personal' | entity id
): CashFlowSummary {
  const report = generateTaxReport(state)
  const filterEid = entityFilter && entityFilter !== 'all' ? entityFilter : undefined

  // If filtering by entity, use entity-level income from breakdown
  const annualGross = filterEid
    ? (report.entityBreakdown || []).filter(e => e.entityId === filterEid).reduce((s, e) => s + e.revenue, 0)
    : report.grossIncome
  const monthlyGross = annualGross / 12

  const monthlyBusinessExpenses = state.expenses
    .filter(e => e.isDeductible)
    .filter(e => !filterEid || (e.entityId || 'personal') === filterEid)
    .reduce((s, e) => s + e.annualAmount, 0) / 12

  const retirementMonthly = (config.retirementPct / 100) * monthlyGross

  // ── W-2 withholding: spreads evenly across 12 months ──────────────
  const annualW2FedWithholding = report.w2FederalWithheld || 0
  const annualW2StateWithholding = report.w2StateWithheld || 0
  const annualW2FICAWithholding = report.w2FICAWithheld || 0
  const annualW2TotalWithholding = annualW2FedWithholding + annualW2StateWithholding + annualW2FICAWithholding
  const monthlyW2Fed = Math.round(annualW2FedWithholding / 12)
  const monthlyW2State = Math.round(annualW2StateWithholding / 12)
  const monthlyW2FICA = Math.round(annualW2FICAWithholding / 12)
  const monthlyW2Total = monthlyW2Fed + monthlyW2State + monthlyW2FICA

  // Quarterly estimated tax covers only non-W-2 tax liability
  // Total tax minus annual W-2 withholding (fed + state, FICA already covered)
  const nonW2TaxLiability = Math.max(0, report.totalTax - annualW2FedWithholding - annualW2StateWithholding)
  const defaultQuarterlyTax = Math.round(nonW2TaxLiability / 4)

  // Use actual estimatedPayments[] if available, otherwise fall back to computed
  const actualPayments = state.estimatedPayments || []
  const getEstPaymentForMonth = (monthIdx: number, year: number): { amount: number; isPaid: boolean } => {
    // Map months to quarters: Apr=Q1, Jun=Q2, Sep=Q3, Jan=Q4
    const quarterMap: Record<number, number> = { 3: 1, 5: 2, 8: 3, 0: 4 }
    const quarter = quarterMap[monthIdx]
    if (!quarter) return { amount: 0, isPaid: false }

    const match = actualPayments.find(p => {
      if (p.quarter !== quarter) return false
      // Use taxYear if available, otherwise derive from dueDate
      const pYear = p.taxYear || new Date(p.dueDate).getFullYear()
      return quarter === 4 ? year === pYear + 1 : year === pYear
    })
    if (match) {
      return {
        amount: match.amount || defaultQuarterlyTax,
        isPaid: (match.paidAmount || 0) >= (match.amount || 0) * 0.9,
      }
    }
    return { amount: defaultQuarterlyTax, isPaid: false }
  }

  const seasonalMults = SEASONAL_MULTIPLIERS[config.seasonality]
  const now = new Date()
  const startMonth = now.getMonth()
  const startYear = now.getFullYear()

  const months: MonthlyForecast[] = []
  let cumulativeCash = config.startingCash
  let cumulativeWithheld = 0
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  for (let i = 0; i < config.projectionMonths; i++) {
    const monthIdx = (startMonth + i) % 12
    const year = startYear + Math.floor((startMonth + i) / 12)
    const growthFactor = Math.pow(1 + config.growthRate / 100, i)
    const seasonal = seasonalMults[monthIdx]

    const grossIncome = Math.round(monthlyGross * seasonal * growthFactor)
    const bizExpenses = Math.round(monthlyBusinessExpenses * (0.95 + seasonal * 0.05))
    const personalExpenses = Math.round(config.personalMonthlyExpenses)
    const retirement = Math.round(retirementMonthly * growthFactor)

    // W-2 withholding (comes out of paycheck before you see it)
    const w2Fed = Math.round(monthlyW2Fed * growthFactor)
    const w2State = Math.round(monthlyW2State * growthFactor)
    const w2FICA = Math.round(monthlyW2FICA * growthFactor)
    const w2Total = w2Fed + w2State + w2FICA
    cumulativeWithheld += w2Total

    // Tax accrual each month
    const monthlyTaxAccrual = Math.round(report.totalTax / 12 * growthFactor)

    // Quarterly estimated payment — use actual amounts from estimatedPayments[] when available
    const isQMonth = QUARTERLY_TAX_MONTHS.includes(monthIdx)
    const estPaymentInfo = getEstPaymentForMonth(monthIdx, year)
    const estimatedTaxPayment = isQMonth ? Math.round(estPaymentInfo.amount * growthFactor) : 0

    // Net cash: gross income minus withholding, expenses, retirement, quarterly estimates
    const netCashFlow = grossIncome - w2Total - bizExpenses - personalExpenses - retirement - estimatedTaxPayment
    cumulativeCash += netCashFlow

    // Runway
    const totalMonthlyExpenses = bizExpenses + personalExpenses + retirement + monthlyTaxAccrual
    const monthsOfRunway = totalMonthlyExpenses > 0 ? Math.max(0, Math.round(cumulativeCash / totalMonthlyExpenses)) : 999

    months.push({
      month: monthIdx,
      label: `${monthNames[monthIdx]} '${String(year).slice(2)}`,
      year,
      grossIncome,
      seasonalMultiplier: seasonal,
      businessExpenses: bizExpenses,
      personalExpenses,
      retirementContribution: retirement,
      estimatedTaxPayment,
      monthlyTaxAccrual,
      isQuarterlyPaymentMonth: isQMonth,
      w2Withholding: w2Total,
      w2FederalWithholding: w2Fed,
      w2StateWithholding: w2State,
      w2FICAWithholding: w2FICA,
      cumulativeWithheld,
      netCashFlow,
      cumulativeCash,
      monthsOfRunway,
    })
  }

  // Analytics
  const totalGross = months.reduce((s, m) => s + m.grossIncome, 0)
  const totalBizExp = months.reduce((s, m) => s + m.businessExpenses, 0)
  const totalPersonal = months.reduce((s, m) => s + m.personalExpenses, 0)
  const totalRetirement = months.reduce((s, m) => s + m.retirementContribution, 0)
  const totalTax = months.reduce((s, m) => s + m.estimatedTaxPayment, 0)
  const totalNet = months.reduce((s, m) => s + m.netCashFlow, 0)

  const avgMonthly = totalNet / months.length
  const lowestCash = months.reduce((min, m) => m.netCashFlow < min.netCashFlow ? m : min, months[0])
  const highestCash = months.reduce((max, m) => m.netCashFlow > max.netCashFlow ? m : max, months[0])
  const negativeMonths = months.filter(m => m.netCashFlow < 0).length

  const burnRate = (totalBizExp + totalPersonal + totalTax) / months.length
  const runwayMonths = burnRate > 0 ? Math.round(config.startingCash / burnRate) : 999

  // Pattern detection
  const firstHalf = months.slice(0, Math.floor(months.length / 2))
  const secondHalf = months.slice(Math.floor(months.length / 2))
  const firstAvg = firstHalf.reduce((s, m) => s + m.grossIncome, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((s, m) => s + m.grossIncome, 0) / secondHalf.length
  const variance = months.map(m => m.grossIncome).reduce((s, v) => s + Math.pow(v - monthlyGross, 2), 0) / months.length
  const cv = Math.sqrt(variance) / Math.max(1, monthlyGross)

  let seasonalPattern: CashFlowSummary['seasonalPattern'] = 'stable'
  if (secondAvg > firstAvg * 1.15) seasonalPattern = 'growth'
  else if (secondAvg < firstAvg * 0.85) seasonalPattern = 'decline'
  else if (cv > 0.1) seasonalPattern = 'cyclical'

  // Recommendations
  const cashReserveRecommendation = Math.round(burnRate * 3) // 3 months expenses
  const emergencyFundTarget = Math.round(burnRate * 6) // 6 months

  return {
    months,
    totalGrossIncome: totalGross,
    totalBusinessExpenses: totalBizExp,
    totalPersonalExpenses: totalPersonal,
    totalRetirement,
    totalTaxPayments: totalTax,
    totalW2Withheld: months.reduce((s, m) => s + m.w2Withholding, 0),
    remainingEstimatedTax: totalTax,
    totalNetCash: totalNet,
    averageMonthlyCash: avgMonthly,
    lowestCashMonth: lowestCash,
    highestCashMonth: highestCash,
    monthsNegative: negativeMonths,
    burnRate,
    runwayMonths,
    seasonalPattern,
    cashReserveRecommendation,
    emergencyFundTarget,
  }
}
