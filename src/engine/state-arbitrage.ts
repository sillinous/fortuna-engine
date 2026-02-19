/**
 * Fortuna Engine — State Tax Arbitrage v8
 *
 * Compare state tax burdens for remote workers & location-flexible earners.
 * Models total state/local tax impact across income tax, sales tax, property tax.
 * Identifies optimal states based on individual financial profile.
 */

import type { FortunaState } from './storage'
import { generateTaxReport } from './tax-calculator'

// ===================================================================
//  STATE TAX DATA (2025 rates, simplified top marginal)
// ===================================================================

interface StateTaxProfile {
  code: string
  name: string
  incomeTaxRate: number // top marginal rate
  incomeTaxType: 'none' | 'flat' | 'graduated'
  salesTaxRate: number // state rate (not including local)
  avgLocalSalesTax: number
  avgPropertyTaxRate: number // effective rate as % of home value
  hasNoIncomeTax: boolean
  costOfLivingIndex: number // 100 = national average
  notes: string[]
}

const STATE_DATA: StateTaxProfile[] = [
  { code: 'AK', name: 'Alaska', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 0, avgLocalSalesTax: 1.76, avgPropertyTaxRate: 1.04, hasNoIncomeTax: true, costOfLivingIndex: 127, notes: ['No state income tax', 'No state sales tax', 'Permanent Fund Dividend (~$1,700/yr)'] },
  { code: 'AL', name: 'Alabama', incomeTaxRate: 0.05, incomeTaxType: 'graduated', salesTaxRate: 4.0, avgLocalSalesTax: 5.24, avgPropertyTaxRate: 0.39, hasNoIncomeTax: false, costOfLivingIndex: 89, notes: ['Low property tax', 'Federal income tax deductible on state return'] },
  { code: 'AR', name: 'Arkansas', incomeTaxRate: 0.044, incomeTaxType: 'graduated', salesTaxRate: 6.5, avgLocalSalesTax: 2.97, avgPropertyTaxRate: 0.62, hasNoIncomeTax: false, costOfLivingIndex: 87, notes: ['Low cost of living'] },
  { code: 'AZ', name: 'Arizona', incomeTaxRate: 0.025, incomeTaxType: 'flat', salesTaxRate: 5.6, avgLocalSalesTax: 2.77, avgPropertyTaxRate: 0.62, hasNoIncomeTax: false, costOfLivingIndex: 103, notes: ['Flat 2.5% income tax'] },
  { code: 'CA', name: 'California', incomeTaxRate: 0.133, incomeTaxType: 'graduated', salesTaxRate: 7.25, avgLocalSalesTax: 1.57, avgPropertyTaxRate: 0.71, hasNoIncomeTax: false, costOfLivingIndex: 142, notes: ['Highest state income tax', 'High cost of living', 'Additional 1% mental health surcharge above $1M'] },
  { code: 'CO', name: 'Colorado', incomeTaxRate: 0.044, incomeTaxType: 'flat', salesTaxRate: 2.9, avgLocalSalesTax: 4.87, avgPropertyTaxRate: 0.49, hasNoIncomeTax: false, costOfLivingIndex: 105, notes: ['Flat 4.4% income tax'] },
  { code: 'CT', name: 'Connecticut', incomeTaxRate: 0.0699, incomeTaxType: 'graduated', salesTaxRate: 6.35, avgLocalSalesTax: 0, avgPropertyTaxRate: 1.96, hasNoIncomeTax: false, costOfLivingIndex: 121, notes: ['High property taxes'] },
  { code: 'DE', name: 'Delaware', incomeTaxRate: 0.066, incomeTaxType: 'graduated', salesTaxRate: 0, avgLocalSalesTax: 0, avgPropertyTaxRate: 0.53, hasNoIncomeTax: false, costOfLivingIndex: 102, notes: ['No sales tax'] },
  { code: 'FL', name: 'Florida', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 6.0, avgLocalSalesTax: 1.01, avgPropertyTaxRate: 0.86, hasNoIncomeTax: true, costOfLivingIndex: 103, notes: ['No state income tax', 'Popular for tax-motivated relocation', 'Homestead exemption up to $50K'] },
  { code: 'GA', name: 'Georgia', incomeTaxRate: 0.0549, incomeTaxType: 'flat', salesTaxRate: 4.0, avgLocalSalesTax: 3.38, avgPropertyTaxRate: 0.87, hasNoIncomeTax: false, costOfLivingIndex: 93, notes: ['Transitioning to flat tax'] },
  { code: 'HI', name: 'Hawaii', incomeTaxRate: 0.11, incomeTaxType: 'graduated', salesTaxRate: 4.0, avgLocalSalesTax: 0.44, avgPropertyTaxRate: 0.27, hasNoIncomeTax: false, costOfLivingIndex: 193, notes: ['Very high cost of living', 'Low property tax rate'] },
  { code: 'ID', name: 'Idaho', incomeTaxRate: 0.058, incomeTaxType: 'flat', salesTaxRate: 6.0, avgLocalSalesTax: 0.02, avgPropertyTaxRate: 0.63, hasNoIncomeTax: false, costOfLivingIndex: 97, notes: ['Flat 5.8% income tax'] },
  { code: 'IL', name: 'Illinois', incomeTaxRate: 0.0495, incomeTaxType: 'flat', salesTaxRate: 6.25, avgLocalSalesTax: 2.56, avgPropertyTaxRate: 2.07, hasNoIncomeTax: false, costOfLivingIndex: 95, notes: ['Flat 4.95% income tax', 'Very high property taxes', 'Retirement income exempt from state tax'] },
  { code: 'IN', name: 'Indiana', incomeTaxRate: 0.0305, incomeTaxType: 'flat', salesTaxRate: 7.0, avgLocalSalesTax: 0, avgPropertyTaxRate: 0.81, hasNoIncomeTax: false, costOfLivingIndex: 91, notes: ['Low flat income tax at 3.05%'] },
  { code: 'KY', name: 'Kentucky', incomeTaxRate: 0.04, incomeTaxType: 'flat', salesTaxRate: 6.0, avgLocalSalesTax: 0, avgPropertyTaxRate: 0.80, hasNoIncomeTax: false, costOfLivingIndex: 90, notes: ['Flat 4% income tax'] },
  { code: 'MA', name: 'Massachusetts', incomeTaxRate: 0.09, incomeTaxType: 'flat', salesTaxRate: 6.25, avgLocalSalesTax: 0, avgPropertyTaxRate: 1.15, hasNoIncomeTax: false, costOfLivingIndex: 135, notes: ['Flat 5% + 4% millionaire surcharge above $1M'] },
  { code: 'MI', name: 'Michigan', incomeTaxRate: 0.0425, incomeTaxType: 'flat', salesTaxRate: 6.0, avgLocalSalesTax: 0, avgPropertyTaxRate: 1.38, hasNoIncomeTax: false, costOfLivingIndex: 91, notes: ['Flat 4.25% income tax'] },
  { code: 'MN', name: 'Minnesota', incomeTaxRate: 0.0985, incomeTaxType: 'graduated', salesTaxRate: 6.875, avgLocalSalesTax: 0.61, avgPropertyTaxRate: 1.05, hasNoIncomeTax: false, costOfLivingIndex: 97, notes: ['High top income tax rate'] },
  { code: 'MO', name: 'Missouri', incomeTaxRate: 0.048, incomeTaxType: 'graduated', salesTaxRate: 4.225, avgLocalSalesTax: 3.97, avgPropertyTaxRate: 0.91, hasNoIncomeTax: false, costOfLivingIndex: 89, notes: ['Low cost of living'] },
  { code: 'MT', name: 'Montana', incomeTaxRate: 0.059, incomeTaxType: 'graduated', salesTaxRate: 0, avgLocalSalesTax: 0, avgPropertyTaxRate: 0.74, hasNoIncomeTax: false, costOfLivingIndex: 98, notes: ['No sales tax'] },
  { code: 'NC', name: 'North Carolina', incomeTaxRate: 0.045, incomeTaxType: 'flat', salesTaxRate: 4.75, avgLocalSalesTax: 2.22, avgPropertyTaxRate: 0.78, hasNoIncomeTax: false, costOfLivingIndex: 96, notes: ['Rate declining annually'] },
  { code: 'NE', name: 'Nebraska', incomeTaxRate: 0.0564, incomeTaxType: 'graduated', salesTaxRate: 5.5, avgLocalSalesTax: 1.44, avgPropertyTaxRate: 1.61, hasNoIncomeTax: false, costOfLivingIndex: 92, notes: ['High property taxes'] },
  { code: 'NH', name: 'New Hampshire', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 0, avgLocalSalesTax: 0, avgPropertyTaxRate: 1.86, hasNoIncomeTax: true, costOfLivingIndex: 112, notes: ['No income tax (interest/dividends tax repealed 2025)', 'No sales tax', 'Very high property tax'] },
  { code: 'NJ', name: 'New Jersey', incomeTaxRate: 0.1075, incomeTaxType: 'graduated', salesTaxRate: 6.625, avgLocalSalesTax: 0, avgPropertyTaxRate: 2.23, hasNoIncomeTax: false, costOfLivingIndex: 120, notes: ['Highest property taxes in nation'] },
  { code: 'NM', name: 'New Mexico', incomeTaxRate: 0.059, incomeTaxType: 'graduated', salesTaxRate: 4.875, avgLocalSalesTax: 2.69, avgPropertyTaxRate: 0.67, hasNoIncomeTax: false, costOfLivingIndex: 92, notes: ['Low cost of living'] },
  { code: 'NV', name: 'Nevada', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 6.85, avgLocalSalesTax: 1.38, avgPropertyTaxRate: 0.53, hasNoIncomeTax: true, costOfLivingIndex: 104, notes: ['No state income tax', 'Low property tax'] },
  { code: 'NY', name: 'New York', incomeTaxRate: 0.109, incomeTaxType: 'graduated', salesTaxRate: 4.0, avgLocalSalesTax: 4.52, avgPropertyTaxRate: 1.62, hasNoIncomeTax: false, costOfLivingIndex: 126, notes: ['NYC adds 3.876% city income tax', 'Very high total tax burden'] },
  { code: 'OH', name: 'Ohio', incomeTaxRate: 0.035, incomeTaxType: 'graduated', salesTaxRate: 5.75, avgLocalSalesTax: 1.47, avgPropertyTaxRate: 1.53, hasNoIncomeTax: false, costOfLivingIndex: 90, notes: ['Low income tax'] },
  { code: 'OK', name: 'Oklahoma', incomeTaxRate: 0.0475, incomeTaxType: 'graduated', salesTaxRate: 4.5, avgLocalSalesTax: 4.47, avgPropertyTaxRate: 0.86, hasNoIncomeTax: false, costOfLivingIndex: 87, notes: ['Low cost of living'] },
  { code: 'OR', name: 'Oregon', incomeTaxRate: 0.099, incomeTaxType: 'graduated', salesTaxRate: 0, avgLocalSalesTax: 0, avgPropertyTaxRate: 0.90, hasNoIncomeTax: false, costOfLivingIndex: 113, notes: ['No sales tax', 'High income tax'] },
  { code: 'PA', name: 'Pennsylvania', incomeTaxRate: 0.0307, incomeTaxType: 'flat', salesTaxRate: 6.0, avgLocalSalesTax: 0.34, avgPropertyTaxRate: 1.49, hasNoIncomeTax: false, costOfLivingIndex: 99, notes: ['Low flat income tax', 'High property taxes', 'Retirement income exempt'] },
  { code: 'SC', name: 'South Carolina', incomeTaxRate: 0.064, incomeTaxType: 'graduated', salesTaxRate: 6.0, avgLocalSalesTax: 1.43, avgPropertyTaxRate: 0.55, hasNoIncomeTax: false, costOfLivingIndex: 93, notes: ['Low property taxes'] },
  { code: 'SD', name: 'South Dakota', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 4.2, avgLocalSalesTax: 1.90, avgPropertyTaxRate: 1.08, hasNoIncomeTax: true, costOfLivingIndex: 94, notes: ['No state income tax', 'Low cost of living'] },
  { code: 'TN', name: 'Tennessee', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 7.0, avgLocalSalesTax: 2.55, avgPropertyTaxRate: 0.64, hasNoIncomeTax: true, costOfLivingIndex: 91, notes: ['No state income tax', 'High sales tax', 'Low cost of living'] },
  { code: 'TX', name: 'Texas', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 6.25, avgLocalSalesTax: 1.94, avgPropertyTaxRate: 1.60, hasNoIncomeTax: true, costOfLivingIndex: 93, notes: ['No state income tax', 'High property tax compensates', 'Popular relocation target'] },
  { code: 'UT', name: 'Utah', incomeTaxRate: 0.0465, incomeTaxType: 'flat', salesTaxRate: 6.1, avgLocalSalesTax: 1.09, avgPropertyTaxRate: 0.55, hasNoIncomeTax: false, costOfLivingIndex: 99, notes: ['Flat 4.65% income tax'] },
  { code: 'VA', name: 'Virginia', incomeTaxRate: 0.0575, incomeTaxType: 'graduated', salesTaxRate: 5.3, avgLocalSalesTax: 0.45, avgPropertyTaxRate: 0.80, hasNoIncomeTax: false, costOfLivingIndex: 103, notes: [] },
  { code: 'WA', name: 'Washington', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 6.5, avgLocalSalesTax: 2.74, avgPropertyTaxRate: 0.87, hasNoIncomeTax: true, costOfLivingIndex: 110, notes: ['No state income tax', '7% capital gains tax on gains above $270K'] },
  { code: 'WI', name: 'Wisconsin', incomeTaxRate: 0.0765, incomeTaxType: 'graduated', salesTaxRate: 5.0, avgLocalSalesTax: 0.43, avgPropertyTaxRate: 1.61, hasNoIncomeTax: false, costOfLivingIndex: 95, notes: [] },
  { code: 'WV', name: 'West Virginia', incomeTaxRate: 0.0512, incomeTaxType: 'graduated', salesTaxRate: 6.0, avgLocalSalesTax: 0.39, avgPropertyTaxRate: 0.53, hasNoIncomeTax: false, costOfLivingIndex: 84, notes: ['Lowest cost of living region'] },
  { code: 'WY', name: 'Wyoming', incomeTaxRate: 0, incomeTaxType: 'none', salesTaxRate: 4.0, avgLocalSalesTax: 1.36, avgPropertyTaxRate: 0.55, hasNoIncomeTax: true, costOfLivingIndex: 95, notes: ['No state income tax', 'Low overall tax burden'] },
]

// ===================================================================
//  STATE COMPARISON
// ===================================================================

export interface StateComparison {
  code: string
  name: string
  estimatedIncomeTax: number
  estimatedSalesTax: number
  estimatedPropertyTax: number
  totalStateTax: number
  savingsVsCurrent: number
  costOfLivingIndex: number
  adjustedSavings: number // savings adjusted for COL
  incomeTaxType: string
  notes: string[]
  rank: number
}

export interface ArbitrageAnalysis {
  currentState: StateComparison
  comparisons: StateComparison[]
  bestOverall: StateComparison
  bestNoIncomeTax: StateComparison | null
  bestLowCOL: StateComparison
  topRecommendations: StateComparison[]
  annualSpending: number
  homeValue: number
}

export function analyzeStateArbitrage(
  state: FortunaState,
  annualSpending: number = 60000,
  homeValue: number = 300000,
): ArbitrageAnalysis {
  const report = generateTaxReport(state)
  const taxableIncome = report.agi - report.deductionAmount

  function calculateStateTax(stateProfile: StateTaxProfile): StateComparison {
    // Income tax (simplified — uses top marginal as effective for comparison)
    const effectiveRate = stateProfile.incomeTaxType === 'none' ? 0
      : stateProfile.incomeTaxType === 'flat' ? stateProfile.incomeTaxRate
      : stateProfile.incomeTaxRate * 0.75 // approximate effective from marginal
    const incomeTax = Math.round(Math.max(0, taxableIncome) * effectiveRate)

    // Sales tax
    const totalSalesRate = (stateProfile.salesTaxRate + stateProfile.avgLocalSalesTax) / 100
    const taxableSpending = annualSpending * 0.35 // ~35% of spending is taxable goods
    const salesTax = Math.round(taxableSpending * totalSalesRate)

    // Property tax
    const propertyTax = Math.round(homeValue * stateProfile.avgPropertyTaxRate / 100)

    const totalTax = incomeTax + salesTax + propertyTax

    return {
      code: stateProfile.code,
      name: stateProfile.name,
      estimatedIncomeTax: incomeTax,
      estimatedSalesTax: salesTax,
      estimatedPropertyTax: propertyTax,
      totalStateTax: totalTax,
      savingsVsCurrent: 0, // filled later
      costOfLivingIndex: stateProfile.costOfLivingIndex,
      adjustedSavings: 0, // filled later
      incomeTaxType: stateProfile.incomeTaxType === 'none' ? 'None' : stateProfile.incomeTaxType === 'flat' ? `Flat ${(stateProfile.incomeTaxRate * 100).toFixed(1)}%` : `Graduated (up to ${(stateProfile.incomeTaxRate * 100).toFixed(1)}%)`,
      notes: stateProfile.notes,
      rank: 0,
    }
  }

  const comparisons = STATE_DATA.map(calculateStateTax)
  const currentState = comparisons.find(c => c.code === state.profile.state) || comparisons[0]

  // Calculate savings vs current
  comparisons.forEach(c => {
    c.savingsVsCurrent = currentState.totalStateTax - c.totalStateTax
    // Adjust for cost of living difference
    const colDiff = (currentState.costOfLivingIndex - c.costOfLivingIndex) / 100
    c.adjustedSavings = c.savingsVsCurrent + Math.round(annualSpending * colDiff)
  })

  // Rank by adjusted savings
  comparisons.sort((a, b) => b.adjustedSavings - a.adjustedSavings)
  comparisons.forEach((c, i) => c.rank = i + 1)

  const bestOverall = comparisons[0]
  const bestNoIncomeTax = comparisons.find(c => c.incomeTaxType === 'None' && c.code !== currentState.code) || null
  const bestLowCOL = [...comparisons].sort((a, b) => a.costOfLivingIndex - b.costOfLivingIndex)[0]

  // Top recommendations: best 5 that aren't current state
  const topRecommendations = comparisons.filter(c => c.code !== currentState.code).slice(0, 8)

  return {
    currentState,
    comparisons,
    bestOverall,
    bestNoIncomeTax,
    bestLowCOL,
    topRecommendations,
    annualSpending,
    homeValue,
  }
}

// ─── Phase H: Entity Nexus Analysis ──────────────────────────────────────────

export interface EntityNexusInfo {
  entityId: string
  entityName: string
  entityType: string
  registeredState: string
  operatingStates: string[]
  nexusWarnings: string[]
  relocationImpact: { state: string; savings: number; registrationCost: number; nexusCleared: boolean }[]
}

/** Analyze entity nexus implications for state changes */
export function analyzeEntityNexus(
  state: FortunaState,
): EntityNexusInfo[] {
  const entities = state.entities.filter(e => e.isActive)
  if (entities.length === 0) return []

  return entities.map(entity => {
    const registeredState = entity.state || state.profile.state
    const operatingStates: string[] = [registeredState]

    // Check if entity has income from other states (simplified heuristic)
    const entityIncome = state.incomeStreams
      .filter(s => s.entityId === entity.id && s.isActive)

    const nexusWarnings: string[] = []

    // S-Corp/LLC specific warnings
    if (entity.type === 'llc_scorp' || entity.type === 'scorp') {
      if (!entity.officerSalary || entity.officerSalary === 0) {
        nexusWarnings.push('S-Corp requires reasonable officer salary — missing salary creates audit risk in any state')
      }
      const totalIncome = entityIncome.reduce((s, i) => s + i.annualAmount, 0)
      if (entity.officerSalary && totalIncome > 0 && entity.officerSalary / totalIncome < 0.3) {
        nexusWarnings.push(`Officer salary is ${Math.round((entity.officerSalary / totalIncome) * 100)}% of entity income — IRS scrutinizes ratios below 30-40%`)
      }
    }

    // Franchise tax warnings
    const franchiseTaxStates = ['CA', 'TX', 'IL', 'NY', 'DE']
    if (franchiseTaxStates.includes(registeredState)) {
      nexusWarnings.push(`${registeredState} imposes franchise/entity tax regardless of income`)
    }

    // Multi-state registration
    if (registeredState !== state.profile.state) {
      operatingStates.push(state.profile.state)
      nexusWarnings.push(`Entity registered in ${registeredState} but owner in ${state.profile.state} — may need foreign qualification`)
    }

    // Estimate relocation impact for top 5 no-income-tax states
    const noTaxStates = ['TX', 'FL', 'NV', 'WA', 'WY', 'SD', 'AK', 'TN', 'NH']
    const relocationImpact = noTaxStates
      .filter(s => s !== registeredState)
      .slice(0, 5)
      .map(targetState => {
        const stateData = STATE_DATA.find(sd => sd.code === targetState)
        const currentData = STATE_DATA.find(sd => sd.code === registeredState)
        const totalEntityIncome = entityIncome.reduce((s, i) => s + i.annualAmount, 0)

        const currentRate = currentData?.incomeTaxType === 'none' ? 0
          : currentData?.incomeTaxType === 'flat' ? (currentData?.incomeTaxRate || 0)
          : (currentData?.incomeTaxRate || 0) * 0.75
        const savings = Math.round(totalEntityIncome * currentRate)

        return {
          state: targetState,
          savings,
          registrationCost: targetState === 'WY' ? 100 : targetState === 'NV' ? 425 : targetState === 'TX' ? 300 : 200,
          nexusCleared: targetState !== state.profile.state,
        }
      })

    return {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      registeredState,
      operatingStates,
      nexusWarnings,
      relocationImpact,
    }
  })
}

const STATE_DATA_IMPORT = STATE_DATA // for external access
export { STATE_DATA_IMPORT as STATE_TAX_DATA }

// ─── State Tax Reciprocity Agreements ─────────────────────────────────────
// Workers who live in one state and work in another may only need to file
// in their resident state if a reciprocity agreement exists.

/** Map of work state → list of resident states with reciprocity */
const RECIPROCITY_AGREEMENTS: Record<string, string[]> = {
  AZ: ['CA', 'IN', 'OR', 'VA'],
  DC: ['all'], // All states have reciprocity with DC
  IL: ['IA', 'KY', 'MI', 'WI'],
  IN: ['KY', 'MI', 'OH', 'PA', 'WI'],
  IA: ['IL'],
  KY: ['IL', 'IN', 'MI', 'OH', 'VA', 'WV', 'WI'],
  MD: ['DC', 'PA', 'VA', 'WV'],
  MI: ['IL', 'IN', 'KY', 'MN', 'OH', 'WI'],
  MN: ['MI', 'ND'],
  MT: ['ND'],
  NJ: ['PA'],
  ND: ['MN', 'MT'],
  OH: ['IN', 'KY', 'MI', 'PA', 'WV'],
  PA: ['IN', 'MD', 'NJ', 'OH', 'VA', 'WV'],
  VA: ['DC', 'KY', 'MD', 'PA', 'WV'],
  WV: ['KY', 'MD', 'OH', 'PA', 'VA'],
  WI: ['IL', 'IN', 'KY', 'MI'],
}

export interface ReciprocityResult {
  workState: string
  residentState: string
  hasReciprocity: boolean
  impact: string
  recommendation: string
  estimatedSavings: number
}

/** Check if cross-border worker benefits from reciprocity */
export function checkReciprocity(
  residentState: string,
  workState: string,
  annualIncome: number,
): ReciprocityResult {
  const reciprocalResidents = RECIPROCITY_AGREEMENTS[workState]
  const hasReciprocity = reciprocalResidents
    ? reciprocalResidents.includes('all') || reciprocalResidents.includes(residentState)
    : false

  if (residentState === workState) {
    return {
      workState, residentState, hasReciprocity: true,
      impact: 'Same state — no cross-border filing needed',
      recommendation: 'No action needed',
      estimatedSavings: 0,
    }
  }

  const workStateData = STATE_DATA.find(s => s.code === workState)
  const resStateData = STATE_DATA.find(s => s.code === residentState)
  const workRate = workStateData?.incomeTaxType === 'none' ? 0 : (workStateData?.incomeTaxRate || 0)
  const resRate = resStateData?.incomeTaxType === 'none' ? 0 : (resStateData?.incomeTaxRate || 0)

  if (hasReciprocity) {
    return {
      workState, residentState, hasReciprocity: true,
      impact: `Reciprocity agreement: you only pay tax to ${residentState} (${(resRate * 100).toFixed(1)}%), not ${workState} (${(workRate * 100).toFixed(1)}%).`,
      recommendation: `File form with ${workState} employer for exemption from ${workState} withholding. Only file ${residentState} return.`,
      estimatedSavings: workRate > resRate
        ? Math.round(annualIncome * (workRate - resRate))
        : 0,
    }
  }

  // No reciprocity — may owe both, with credit
  return {
    workState, residentState, hasReciprocity: false,
    impact: `No reciprocity: you must file in both ${workState} and ${residentState}. Your resident state typically gives a credit for taxes paid to ${workState}.`,
    recommendation: `File non-resident return in ${workState}, then claim credit on ${residentState} resident return. Net tax is approximately the higher of the two rates.`,
    estimatedSavings: 0,
  }
}
