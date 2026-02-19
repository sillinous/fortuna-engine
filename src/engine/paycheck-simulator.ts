/**
 * Fortuna Engine - Paycheck Simulator
 * Calculates per-period take-home pay from W-2 data with full deduction breakdown.
 */

import type { FortunaState, IncomeStream } from './storage'
import { FEDERAL_BRACKETS_2024, STANDARD_DEDUCTION_2024 } from './tax-calculator'

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
}

export interface PaycheckBreakdown {
  streamId: string
  streamName: string
  employerName: string
  payFrequency: PayFrequency
  periodsPerYear: number

  // Gross
  grossPay: number           // per period
  annualGross: number

  // Pre-tax deductions
  pretax401k: number
  pretaxHealth: number
  pretaxHSA: number
  pretaxOther: number
  totalPretax: number

  // Taxable wages per period
  taxableWages: number

  // Tax withholding per period
  federalWithholding: number
  stateWithholding: number
  socialSecurity: number     // 6.2% up to wage base
  medicare: number           // 1.45% + 0.9% above $200k
  totalFICA: number
  totalTaxes: number

  // Net
  netPay: number             // per period — what hits bank account
  annualNet: number

  // Employer contributions (not deducted, just tracked)
  employerFICA: number
  employer401kMatch: number
  totalCompensation: number  // gross + employer FICA + employer match

  // Analytics
  effectiveRate: number      // total taxes / gross
  takeHomeRate: number       // net / gross
  marginalFedRate: number

  // Discrepancy detection
  discrepancies: PaycheckDiscrepancy[]
}

export interface PaycheckDiscrepancy {
  field: string
  expected: number
  actual: number
  severity: 'info' | 'warning' | 'alert'
  message: string
}

// Social Security wage base 2025
const SS_WAGE_BASE = 176100
const SS_RATE = 0.062
const MEDICARE_RATE = 0.0145
const MEDICARE_ADDITIONAL_THRESHOLD = 200000
const MEDICARE_ADDITIONAL_RATE = 0.009

export function simulatePaycheck(
  stream: IncomeStream,
  state: FortunaState,
  frequency: PayFrequency = 'biweekly'
): PaycheckBreakdown | null {
  if (stream.type !== 'w2' || !stream.isActive || stream.annualAmount <= 0) return null

  const w2 = stream.w2 || {}
  const periods = PERIODS_PER_YEAR[frequency]
  const annualGross = w2.grossSalary && w2.grossSalary > 0 ? w2.grossSalary : stream.annualAmount
  const grossPay = Math.round(annualGross / periods)

  // Pre-tax deductions per period
  const pretax401k = Math.round((w2.pretax401k || 0) / periods)
  const pretaxHealth = Math.round((w2.pretaxHealthInsurance || 0) / periods)
  const pretaxHSA = Math.round((w2.pretaxHSA || 0) / periods)
  const pretaxOther = Math.round((w2.otherPretaxDeductions || 0) / periods)
  const totalPretax = pretax401k + pretaxHealth + pretaxHSA + pretaxOther

  // Taxable wages (after pre-tax deductions)
  const taxableWages = grossPay - totalPretax
  const annualTaxable = taxableWages * periods

  // Federal withholding estimate (if user provided, use that; otherwise calc)
  let federalWithholding: number
  if (w2.federalWithholding && w2.federalWithholding > 0) {
    federalWithholding = Math.round(w2.federalWithholding / periods)
  } else {
    // Estimate: apply brackets to annual taxable minus standard deduction
    const stdDed = STANDARD_DEDUCTION_2024[state.profile.filingStatus] || 14600
    const annualFedTaxable = Math.max(0, annualTaxable - stdDed)
    const brackets = FEDERAL_BRACKETS_2024[state.profile.filingStatus as keyof typeof FEDERAL_BRACKETS_2024] || FEDERAL_BRACKETS_2024.single
    let annualFedTax = 0
    for (const bracket of brackets) {
      if (annualFedTaxable > bracket.min) {
        const taxableInBracket = Math.min(annualFedTaxable, bracket.max) - bracket.min
        annualFedTax += taxableInBracket * bracket.rate
      }
    }
    federalWithholding = Math.round(annualFedTax / periods)
  }

  // State withholding
  let stateWithholding: number
  if (w2.stateWithholding && w2.stateWithholding > 0) {
    stateWithholding = Math.round(w2.stateWithholding / periods)
  } else {
    // Rough estimate using state effective rate
    const stateRate = getStateRate(state.profile.state)
    stateWithholding = Math.round((annualTaxable * stateRate) / periods)
  }

  // FICA per period
  // SS: 6.2% up to wage base, need to track cumulative
  const annualSS = Math.min(annualGross, SS_WAGE_BASE) * SS_RATE
  const socialSecurity = Math.round(annualSS / periods)

  // Medicare: 1.45% on all + 0.9% on income above $200k
  const annualMedicare = annualGross * MEDICARE_RATE +
    Math.max(0, annualGross - MEDICARE_ADDITIONAL_THRESHOLD) * MEDICARE_ADDITIONAL_RATE
  const medicare = Math.round(annualMedicare / periods)

  const totalFICA = socialSecurity + medicare
  const totalTaxes = federalWithholding + stateWithholding + totalFICA

  // Net pay
  const netPay = grossPay - totalPretax - totalTaxes
  const annualNet = netPay * periods

  // Employer side
  const employerFICA = totalFICA // employer matches employee FICA
  const employer401kMatch = Math.round((w2.employerMatch401k || 0) / periods)
  const totalCompensation = annualGross + (employerFICA * periods) + (w2.employerMatch401k || 0)

  // Marginal federal rate
  const brackets = FEDERAL_BRACKETS_2024[state.profile.filingStatus as keyof typeof FEDERAL_BRACKETS_2024] || FEDERAL_BRACKETS_2024.single
  let marginalFedRate = 0.10
  const stdDed = STANDARD_DEDUCTION_2024[state.profile.filingStatus] || 14600
  const fedTaxableIncome = Math.max(0, annualTaxable - stdDed)
  for (const bracket of brackets) {
    if (fedTaxableIncome > bracket.min) marginalFedRate = bracket.rate
  }

  // Discrepancy detection
  const discrepancies: PaycheckDiscrepancy[] = []

  if (w2.ficaWithheld && w2.ficaWithheld > 0) {
    const expectedFICA = annualSS + annualMedicare
    const diff = Math.abs(w2.ficaWithheld - expectedFICA)
    if (diff > expectedFICA * 0.05) {
      discrepancies.push({
        field: 'FICA',
        expected: Math.round(expectedFICA),
        actual: w2.ficaWithheld,
        severity: diff > expectedFICA * 0.15 ? 'alert' : 'warning',
        message: `FICA withholding ${w2.ficaWithheld > expectedFICA ? 'higher' : 'lower'} than expected by $${Math.round(diff).toLocaleString()}`,
      })
    }
  }

  if (w2.federalWithholding && w2.federalWithholding > 0) {
    const expectedAnnualFed = federalWithholding * periods
    // Compare entered vs calculated
    const diff = Math.abs(w2.federalWithholding - expectedAnnualFed)
    if (diff > 2000 && diff > expectedAnnualFed * 0.15) {
      discrepancies.push({
        field: 'Federal Withholding',
        expected: expectedAnnualFed,
        actual: w2.federalWithholding,
        severity: diff > expectedAnnualFed * 0.3 ? 'alert' : 'warning',
        message: w2.federalWithholding > expectedAnnualFed
          ? `Overwithholding ~$${Math.round(diff).toLocaleString()}/yr — consider updating W-4`
          : `Underwithholding ~$${Math.round(diff).toLocaleString()}/yr — may owe at filing`,
      })
    }
  }

  if (w2.pretax401k && w2.pretax401k > 23500) {
    discrepancies.push({
      field: '401(k)',
      expected: 23500,
      actual: w2.pretax401k,
      severity: 'alert',
      message: `401(k) contribution $${w2.pretax401k.toLocaleString()} exceeds 2025 limit ($23,500 / $31,000 if 50+)`,
    })
  }

  return {
    streamId: stream.id,
    streamName: stream.name || 'W-2 Job',
    employerName: w2.employerName || stream.name || 'Employer',
    payFrequency: frequency,
    periodsPerYear: periods,
    grossPay,
    annualGross,
    pretax401k,
    pretaxHealth,
    pretaxHSA,
    pretaxOther,
    totalPretax,
    taxableWages,
    federalWithholding,
    stateWithholding,
    socialSecurity,
    medicare,
    totalFICA,
    totalTaxes,
    netPay,
    annualNet,
    employerFICA,
    employer401kMatch,
    totalCompensation,
    effectiveRate: grossPay > 0 ? totalTaxes / grossPay : 0,
    takeHomeRate: grossPay > 0 ? netPay / grossPay : 0,
    marginalFedRate,
    discrepancies,
  }
}

export function simulateAllPaychecks(state: FortunaState, frequency: PayFrequency = 'biweekly'): PaycheckBreakdown[] {
  const results: PaycheckBreakdown[] = []

  // Standard W-2 paychecks
  const w2Streams = state.incomeStreams
    .filter(s => s.type === 'w2' && s.isActive && s.annualAmount > 0)
  for (const s of w2Streams) {
    const pb = simulatePaycheck(s, state, frequency)
    if (pb) results.push(pb)
  }

  // S-Corp officer salary paychecks (from entities with officerSalary)
  const scorpEntities = state.entities.filter(e =>
    (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive && e.officerSalary && e.officerSalary > 0
  )
  for (const entity of scorpEntities) {
    const syntheticStream: IncomeStream = {
      id: `scorp-salary-${entity.id}`,
      name: `${entity.name} — Officer Salary`,
      type: 'w2',
      annualAmount: entity.officerSalary!,
      isActive: true,
      entityId: entity.id,
    }
    const pb = simulatePaycheck(syntheticStream, state, frequency)
    if (pb) {
      pb.streamName = `${entity.name} — Officer Salary`
      pb.employerName = entity.name
      results.push(pb)
    }
  }

  return results
}

function getStateRate(stateCode: string): number {
  // Simplified state rates for withholding estimation
  const rates: Record<string, number> = {
    CA: 0.066, NY: 0.055, TX: 0, FL: 0, WA: 0, NV: 0, WY: 0, SD: 0, AK: 0, TN: 0, NH: 0,
    IL: 0.0495, PA: 0.0307, OH: 0.035, GA: 0.055, NC: 0.0475, MI: 0.0425, NJ: 0.055,
    VA: 0.055, MA: 0.05, AZ: 0.025, CO: 0.044, MN: 0.055, WI: 0.053, MO: 0.048,
    MD: 0.05, IN: 0.0305, CT: 0.05, OR: 0.08, KY: 0.04, SC: 0.065, AL: 0.05,
    LA: 0.0425, UT: 0.0465, IA: 0.044, OK: 0.0475, KS: 0.055, AR: 0.044, MS: 0.05,
    NE: 0.055, NM: 0.049, WV: 0.055, ID: 0.058, HI: 0.065, ME: 0.055, MT: 0.059,
    RI: 0.055, DE: 0.055, ND: 0.0195, VT: 0.066, DC: 0.065,
  }
  return rates[stateCode] || 0.05
}
