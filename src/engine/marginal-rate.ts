/**
 * Fortuna Engine - Marginal Rate Stack
 * Calculates the effective marginal rate at each income level,
 * decomposed into federal, state, SE, NIIT, and phase-out components.
 */

import type { FortunaState } from './storage'
import { FEDERAL_BRACKETS_2024, STANDARD_DEDUCTION_2024, generateTaxReport } from './tax-calculator'

export interface MarginalPoint {
  income: number
  federalRate: number
  stateRate: number
  seRate: number      // SE tax (15.3% on self-employment)
  ficaRate: number    // W-2 FICA (7.65% employee share)
  niitRate: number    // Net Investment Income Tax (3.8%)
  totalRate: number
  keepRate: number    // 1 - totalRate
  label: string       // bracket label
  isCliff: boolean    // true if rate jumps significantly
}

export interface MarginalAnalysis {
  points: MarginalPoint[]
  currentIncome: number
  currentPoint: MarginalPoint
  nextBracketAt: number
  nextBracketRate: number
  dangerZones: { start: number; end: number; rate: number; reason: string }[]
  sweetSpots: { income: number; keepRate: number; reason: string }[]
}

export function analyzeMarginalRates(state: FortunaState): MarginalAnalysis {
  const report = generateTaxReport(state)
  const currentIncome = report.grossIncome
  const hasSE = state.incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive && s.annualAmount > 0)
  const seIncome = state.incomeStreams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive).reduce((s, i) => s + i.annualAmount, 0)
  const hasW2 = state.incomeStreams.some(s => s.type === 'w2' && s.isActive && s.annualAmount > 0)
  const hasInvestment = state.incomeStreams.some(s => s.type === 'investment' && s.isActive && s.annualAmount > 0)

  const filingStatus = state.profile.filingStatus as keyof typeof FEDERAL_BRACKETS_2024
  const brackets = FEDERAL_BRACKETS_2024[filingStatus] || FEDERAL_BRACKETS_2024.single
  const stdDed = STANDARD_DEDUCTION_2024[state.profile.filingStatus] || 14600

  // State rate
  const stateRate = report.stateTax / Math.max(1, report.taxableIncome)

  // SE tax rate (if applicable)
  const seRateBase = hasSE ? 0.153 * 0.9235 : 0 // 15.3% on 92.35%
  const SS_WAGE_BASE = 176100

  // NIIT threshold
  const niitThreshold = filingStatus === 'married_joint' ? 250000 :
    filingStatus === 'married_separate' ? 125000 : 200000

  // Generate points at key income levels
  const incomePoints: number[] = []
  for (let i = 0; i <= 500000; i += 5000) incomePoints.push(i)
  // Add bracket boundaries
  for (const b of brackets) {
    if (b.min > 0) incomePoints.push(b.min + stdDed)
    if (b.max < Infinity) incomePoints.push(b.max + stdDed)
  }
  // Add SS wage base, NIIT threshold, current income
  incomePoints.push(SS_WAGE_BASE, niitThreshold, currentIncome)
  const sorted = [...new Set(incomePoints)].sort((a, b) => a - b).filter(x => x >= 0 && x <= 600000)

  const points: MarginalPoint[] = sorted.map(income => {
    const taxable = Math.max(0, income - stdDed)

    // Federal marginal rate
    let fedRate = 0
    for (const bracket of brackets) {
      if (taxable > bracket.min) fedRate = bracket.rate
    }

    // SE rate (phases down after SS wage base for SS portion)
    let seRate = 0
    if (hasSE) {
      const seIncomeAtLevel = Math.min(income, seIncome + (income - currentIncome))
      if (seIncomeAtLevel > 0) {
        const ssPartIncome = seIncomeAtLevel * 0.9235
        if (ssPartIncome <= SS_WAGE_BASE) {
          seRate = 0.153 * 0.9235 // full SE rate
        } else {
          seRate = 0.029 * 0.9235 // only Medicare portion above SS base
        }
      }
    }

    // W-2 FICA
    let ficaRate = 0
    if (hasW2) {
      if (income <= SS_WAGE_BASE) {
        ficaRate = 0.0765 // 6.2% SS + 1.45% Medicare
      } else if (income <= 200000) {
        ficaRate = 0.0145 // only Medicare above SS base
      } else {
        ficaRate = 0.0235 // Medicare + additional Medicare
      }
    }

    // NIIT
    let niitRate = 0
    if (hasInvestment && income > niitThreshold) {
      niitRate = 0.038
    }

    const totalRate = Math.min(0.75, fedRate + stateRate + seRate + ficaRate + niitRate)
    const keepRate = 1 - totalRate

    // Label
    let label = `${(fedRate * 100).toFixed(0)}% bracket`
    if (income <= stdDed) label = 'Standard deduction zone'

    return {
      income, federalRate: fedRate, stateRate, seRate, ficaRate, niitRate,
      totalRate, keepRate, label, isCliff: false,
    }
  })

  // Mark cliffs (rate jumps > 5%)
  for (let i = 1; i < points.length; i++) {
    if (points[i].totalRate - points[i - 1].totalRate > 0.05) {
      points[i].isCliff = true
    }
  }

  // Find current point
  const currentPoint = points.reduce((closest, p) =>
    Math.abs(p.income - currentIncome) < Math.abs(closest.income - currentIncome) ? p : closest
  , points[0])

  // Next bracket
  let nextBracketAt = currentIncome
  let nextBracketRate = currentPoint.totalRate
  for (const p of points) {
    if (p.income > currentIncome && p.totalRate > currentPoint.totalRate + 0.01) {
      nextBracketAt = p.income
      nextBracketRate = p.totalRate
      break
    }
  }

  // Danger zones: where effective rate > 45%
  const dangerZones: MarginalAnalysis['dangerZones'] = []
  let inDanger = false
  let dangerStart = 0
  for (const p of points) {
    if (p.totalRate > 0.45 && !inDanger) {
      inDanger = true
      dangerStart = p.income
    } else if (p.totalRate <= 0.45 && inDanger) {
      inDanger = false
      dangerZones.push({ start: dangerStart, end: p.income, rate: p.totalRate,
        reason: `Combined rate > 45%${hasSE ? ' (includes 15.3% SE tax)' : ''}` })
    }
  }
  if (inDanger) {
    dangerZones.push({ start: dangerStart, end: 600000, rate: points[points.length - 1].totalRate,
      reason: 'High combined marginal rate' })
  }

  // Sweet spots: best keep rates
  const sweetSpots: MarginalAnalysis['sweetSpots'] = []
  if (stdDed > 0) sweetSpots.push({ income: stdDed, keepRate: 1, reason: 'Standard deduction covers all income — 0% effective rate' })
  if (hasSE && seIncome > 0 && seIncome < SS_WAGE_BASE) {
    sweetSpots.push({ income: SS_WAGE_BASE, keepRate: points.find(p => p.income >= SS_WAGE_BASE)?.keepRate || 0.65,
      reason: 'Social Security wage base — SE tax drops from 15.3% to 2.9% above this' })
  }

  return {
    points, currentIncome, currentPoint, nextBracketAt, nextBracketRate, dangerZones, sweetSpots,
  }
}
