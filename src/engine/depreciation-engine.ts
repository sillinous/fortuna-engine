/**
 * Fortuna Engine — Depreciation & Asset Strategy v9
 *
 * Complete business asset depreciation modeling:
 *  - Section 179 immediate expensing with phase-out
 *  - Bonus Depreciation (80% for 2024, phasing down)
 *  - MACRS standard depreciation schedules (3/5/7/15/27.5/39 yr)
 *  - Vehicle deduction optimizer (standard mileage vs actual)
 *  - Home office depreciation
 *  - Year-by-year depreciation schedule with tax impact
 *  - Asset purchase timing optimization
 */

import type { FortunaState } from './storage'
import { generateTaxReport } from './tax-calculator'

// ===================================================================
//  2024-2026 DEPRECIATION CONSTANTS
// ===================================================================

const SECTION_179_LIMIT_2024 = 1220000
const SECTION_179_PHASEOUT_START = 3050000
const BONUS_DEPRECIATION_RATES: Record<number, number> = {
  2024: 0.60,  // 60% bonus depreciation
  2025: 0.40,  // 40%
  2026: 0.20,  // 20%
  2027: 0.00,  // fully phased out
}

// Vehicle limits (first-year, luxury auto limits)
const VEHICLE_LIMITS_2024 = {
  firstYear_withBonus: 20400,
  firstYear_noBonus: 12400,
  secondYear: 19800,
  thirdYear: 11900,
  subsequent: 7160,
  suvOver6000: 28900, // SUV Section 179 limit
}

const STANDARD_MILEAGE_RATE_2024 = 0.67 // 67 cents per mile

// MACRS recovery periods and depreciation percentages
const MACRS_TABLES: Record<number, number[]> = {
  3: [0.3333, 0.4445, 0.1481, 0.0741],
  5: [0.2000, 0.3200, 0.1920, 0.1152, 0.1152, 0.0576],
  7: [0.1429, 0.2449, 0.1749, 0.1249, 0.0893, 0.0892, 0.0893, 0.0446],
  15: [0.0500, 0.0950, 0.0855, 0.0770, 0.0693, 0.0623, 0.0590, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590, 0.0591, 0.0590, 0.0591, 0.0295],
}

// Common asset classes and their MACRS life
const ASSET_CLASSES: AssetClass[] = [
  { id: 'computer', name: 'Computers & Peripherals', macrsLife: 5, section179: true, examples: 'Laptops, desktops, servers, monitors' },
  { id: 'software', name: 'Off-the-Shelf Software', macrsLife: 3, section179: true, examples: 'Commercial software licenses' },
  { id: 'furniture', name: 'Office Furniture', macrsLife: 7, section179: true, examples: 'Desks, chairs, shelving, filing cabinets' },
  { id: 'equipment', name: 'Business Equipment', macrsLife: 7, section179: true, examples: 'Printers, manufacturing equipment, tools' },
  { id: 'vehicle_light', name: 'Vehicle (under 6,000 lbs)', macrsLife: 5, section179: true, examples: 'Cars, small trucks, sedans' },
  { id: 'vehicle_heavy', name: 'Vehicle/SUV (over 6,000 lbs)', macrsLife: 5, section179: true, examples: 'Heavy SUVs, trucks, vans' },
  { id: 'land_improvement', name: 'Land Improvements', macrsLife: 15, section179: false, examples: 'Parking lots, fencing, landscaping' },
  { id: 'residential_rental', name: 'Residential Rental Property', macrsLife: 27, section179: false, examples: 'Rental buildings (residential)' },
  { id: 'commercial', name: 'Commercial Property', macrsLife: 39, section179: false, examples: 'Office buildings, warehouses' },
  { id: 'phone', name: 'Phones & Tablets', macrsLife: 5, section179: true, examples: 'Smartphones, iPads, mobile devices' },
]

// ===================================================================
//  TYPES
// ===================================================================

export interface AssetClass {
  id: string
  name: string
  macrsLife: number
  section179: boolean
  examples: string
}

export interface BusinessAsset {
  id: string
  name: string
  classId: string
  purchaseDate: string
  cost: number
  businessUsePercent: number // 0-100
  section179Elected: boolean
  bonusDepreciation: boolean
  salvageValue: number
  entityId?: string          // Entity this asset belongs to
}

export interface DepreciationScheduleYear {
  year: number
  section179: number
  bonusDepreciation: number
  macrsDepreciation: number
  totalDepreciation: number
  remainingBasis: number
  taxSavings: number
}

export interface AssetDepreciationResult {
  asset: BusinessAsset
  assetClass: AssetClass
  depreciableBasis: number
  schedule: DepreciationScheduleYear[]
  totalDeductions: number
  firstYearDeduction: number
  taxSavingsFirstYear: number
  taxSavingsTotal: number
  method: string
}

export interface VehicleDeductionAnalysis {
  standardMileage: {
    annualDeduction: number
    effective: boolean
    calculation: string
  }
  actualExpense: {
    annualDeduction: number
    effective: boolean
    calculation: string
    depreciationComponent: number
    operatingComponent: number
  }
  recommendation: 'standard_mileage' | 'actual_expense'
  difference: number
  notes: string[]
}

export interface HomeOfficeDeduction {
  simplified: {
    deduction: number
    calculation: string
  }
  regular: {
    deduction: number
    directExpenses: number
    indirectExpenses: number
    depreciation: number
    calculation: string
  }
  recommendation: 'simplified' | 'regular'
  difference: number
}

export interface DepreciationSummary {
  totalAssets: number
  totalCost: number
  totalDepreciatedToDate: number
  remainingBasis: number
  currentYearDeduction: number
  section179Used: number
  section179Remaining: number
  bonusDepreciationRate: number
  assetResults: AssetDepreciationResult[]
  vehicleAnalysis: VehicleDeductionAnalysis | null
  homeOffice: HomeOfficeDeduction | null
  purchaseTimingInsights: PurchaseTimingInsight[]
  totalTaxSavingsThisYear: number
  entityBreakdown?: { entityId: string; assetCount: number; totalCost: number; currentYearDeduction: number; section179Used: number }[]
}

export interface PurchaseTimingInsight {
  type: 'opportunity' | 'warning' | 'info'
  title: string
  detail: string
  impact?: number
}

// ===================================================================
//  DEPRECIATION CALCULATOR
// ===================================================================

function calculateAssetDepreciation(
  asset: BusinessAsset,
  marginalRate: number,
  section179Used: number,
): AssetDepreciationResult {
  const assetClass = ASSET_CLASSES.find(c => c.id === asset.classId) || ASSET_CLASSES[4]
  const businessBasis = asset.cost * (asset.businessUsePercent / 100)
  const depreciableBasis = businessBasis - asset.salvageValue
  let remaining = depreciableBasis

  const purchaseYear = new Date(asset.purchaseDate || new Date().toISOString()).getFullYear()
  const currentYear = new Date().getFullYear()
  const schedule: DepreciationScheduleYear[] = []
  const methodParts: string[] = []

  // ── Section 179 ──
  let s179 = 0
  if (asset.section179Elected && assetClass.section179) {
    const available = Math.max(0, SECTION_179_LIMIT_2024 - section179Used)
    // Vehicle heavy cap
    const vehicleCap = asset.classId === 'vehicle_heavy' ? VEHICLE_LIMITS_2024.suvOver6000 : Infinity
    s179 = Math.min(remaining, available, vehicleCap)
    remaining -= s179
    methodParts.push(`§179: $${s179.toLocaleString()}`)
  }

  // ── Bonus Depreciation ──
  let bonus = 0
  if (asset.bonusDepreciation && remaining > 0) {
    const bonusRate = BONUS_DEPRECIATION_RATES[purchaseYear] ?? 0
    // Vehicle limits
    if (asset.classId === 'vehicle_light') {
      const maxFirst = bonusRate > 0
        ? VEHICLE_LIMITS_2024.firstYear_withBonus
        : VEHICLE_LIMITS_2024.firstYear_noBonus
      bonus = Math.min(remaining, Math.max(0, maxFirst - s179))
    } else {
      bonus = Math.round(remaining * bonusRate)
    }
    remaining -= bonus
    if (bonus > 0) methodParts.push(`Bonus ${(BONUS_DEPRECIATION_RATES[purchaseYear] ?? 0) * 100}%: $${bonus.toLocaleString()}`)
  }

  // ── MACRS Schedule ──
  const macrsRates = MACRS_TABLES[assetClass.macrsLife] || MACRS_TABLES[7]
  const macrsYears = macrsRates.length
  let macrsRemaining = remaining

  for (let i = 0; i < macrsYears; i++) {
    const year = purchaseYear + i
    const macrsDepr = Math.min(
      Math.round(remaining * macrsRates[i]),
      macrsRemaining
    )
    macrsRemaining -= macrsDepr

    const yearS179 = i === 0 ? s179 : 0
    const yearBonus = i === 0 ? bonus : 0
    const totalDepr = yearS179 + yearBonus + macrsDepr

    schedule.push({
      year,
      section179: yearS179,
      bonusDepreciation: yearBonus,
      macrsDepreciation: macrsDepr,
      totalDepreciation: totalDepr,
      remainingBasis: macrsRemaining,
      taxSavings: Math.round(totalDepr * marginalRate),
    })
  }

  if (macrsRates.length > 0) {
    methodParts.push(`MACRS ${assetClass.macrsLife}-yr`)
  }

  const totalDeductions = schedule.reduce((s, y) => s + y.totalDepreciation, 0)
  const firstYearDeduction = schedule[0]?.totalDepreciation || 0

  return {
    asset,
    assetClass,
    depreciableBasis,
    schedule,
    totalDeductions,
    firstYearDeduction,
    taxSavingsFirstYear: Math.round(firstYearDeduction * marginalRate),
    taxSavingsTotal: Math.round(totalDeductions * marginalRate),
    method: methodParts.join(' + ') || `MACRS ${assetClass.macrsLife}-yr`,
  }
}

// ===================================================================
//  VEHICLE DEDUCTION OPTIMIZER
// ===================================================================

export function analyzeVehicleDeduction(
  annualMiles: number,
  businessMiles: number,
  vehicleCost: number,
  annualFuel: number,
  annualInsurance: number,
  annualMaintenance: number,
  annualParking: number,
  marginalRate: number,
): VehicleDeductionAnalysis {
  const businessPct = annualMiles > 0 ? businessMiles / annualMiles : 0

  // Standard mileage
  const stdDeduction = Math.round(businessMiles * STANDARD_MILEAGE_RATE_2024)

  // Actual expense
  const totalOperating = annualFuel + annualInsurance + annualMaintenance + annualParking
  const operatingDeduction = Math.round(totalOperating * businessPct)

  // Depreciation component (simplified 5-yr MACRS)
  const macrsRate = MACRS_TABLES[5]?.[0] || 0.20
  const deprComponent = Math.round(vehicleCost * macrsRate * businessPct)
  const actualTotal = operatingDeduction + deprComponent

  const recommendation = stdDeduction >= actualTotal ? 'standard_mileage' : 'actual_expense'
  const diff = Math.abs(stdDeduction - actualTotal)

  const notes: string[] = []
  if (businessPct > 0.5) notes.push('High business use qualifies for either method')
  if (businessPct < 0.5) notes.push('Business use under 50% — Section 179 not available')
  if (vehicleCost > 60000) notes.push('Luxury vehicle limits may apply — consider heavy SUV exception')
  if (businessMiles > 20000) notes.push('High mileage favors standard mileage rate')
  notes.push(`Standard mileage rate for 2024: $${STANDARD_MILEAGE_RATE_2024}/mile`)

  return {
    standardMileage: {
      annualDeduction: stdDeduction,
      effective: recommendation === 'standard_mileage',
      calculation: `${businessMiles.toLocaleString()} miles × $${STANDARD_MILEAGE_RATE_2024} = $${stdDeduction.toLocaleString()}`,
    },
    actualExpense: {
      annualDeduction: actualTotal,
      effective: recommendation === 'actual_expense',
      calculation: `($${totalOperating.toLocaleString()} operating × ${(businessPct * 100).toFixed(0)}%) + $${deprComponent.toLocaleString()} depreciation`,
      depreciationComponent: deprComponent,
      operatingComponent: operatingDeduction,
    },
    recommendation,
    difference: diff,
    notes,
  }
}

// ===================================================================
//  HOME OFFICE DEDUCTION
// ===================================================================

export function analyzeHomeOffice(
  homeSquareFt: number,
  officeSquareFt: number,
  annualRentOrMortgage: number,
  annualUtilities: number,
  annualInsurance: number,
  homeValue: number, // for depreciation if owned
  isOwner: boolean,
  marginalRate: number,
): HomeOfficeDeduction {
  const businessPct = homeSquareFt > 0 ? officeSquareFt / homeSquareFt : 0

  // Simplified method: $5/sqft, max 300 sqft
  const simplifiedSqft = Math.min(officeSquareFt, 300)
  const simplified = simplifiedSqft * 5

  // Regular method
  const indirectExpenses = Math.round(
    (annualRentOrMortgage + annualUtilities + annualInsurance) * businessPct
  )
  const depreciation = isOwner ? Math.round(homeValue * businessPct / 39) : 0 // 39-yr straight-line
  const regular = indirectExpenses + depreciation

  return {
    simplified: {
      deduction: simplified,
      calculation: `${simplifiedSqft} sq ft × $5 = $${simplified.toLocaleString()} (max 300 sq ft)`,
    },
    regular: {
      deduction: regular,
      directExpenses: 0,
      indirectExpenses,
      depreciation,
      calculation: `${(businessPct * 100).toFixed(1)}% of ($${(annualRentOrMortgage + annualUtilities + annualInsurance).toLocaleString()}) + $${depreciation.toLocaleString()} depreciation`,
    },
    recommendation: simplified >= regular ? 'simplified' : 'regular',
    difference: Math.abs(simplified - regular),
  }
}

// ===================================================================
//  PURCHASE TIMING OPTIMIZER
// ===================================================================

function analyzePurchaseTiming(
  state: FortunaState,
  marginalRate: number,
): PurchaseTimingInsight[] {
  const insights: PurchaseTimingInsight[] = []
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-indexed

  // Bonus depreciation phase-down alert
  const currentBonus = BONUS_DEPRECIATION_RATES[currentYear] ?? 0
  const nextBonus = BONUS_DEPRECIATION_RATES[currentYear + 1] ?? 0
  if (currentBonus > nextBonus) {
    insights.push({
      type: 'warning',
      title: `Bonus Depreciation Drops to ${nextBonus * 100}% in ${currentYear + 1}`,
      detail: `Current rate is ${currentBonus * 100}%. For a $50,000 asset, waiting costs $${Math.round(50000 * (currentBonus - nextBonus) * marginalRate).toLocaleString()} in first-year tax savings.`,
      impact: Math.round(50000 * (currentBonus - nextBonus) * marginalRate),
    })
  }

  // Year-end purchasing opportunity
  if (currentMonth >= 9) { // Oct-Dec
    insights.push({
      type: 'opportunity',
      title: 'Year-End Asset Purchases',
      detail: `Assets placed in service before Dec 31 qualify for full-year Section 179 and bonus depreciation. Even a December purchase gets the same first-year deduction as a January purchase.`,
    })
  }

  // Section 179 capacity
  const section179Remaining = SECTION_179_LIMIT_2024
  insights.push({
    type: 'info',
    title: `$${section179Remaining.toLocaleString()} Section 179 Capacity Available`,
    detail: `Immediate expensing up to $${SECTION_179_LIMIT_2024.toLocaleString()} for qualifying equipment. Phase-out begins at $${SECTION_179_PHASEOUT_START.toLocaleString()} total assets placed in service.`,
  })

  // Marginal rate opportunity
  if (marginalRate >= 0.32) {
    insights.push({
      type: 'opportunity',
      title: `High Bracket = Maximum Deduction Value`,
      detail: `At ${(marginalRate * 100).toFixed(0)}% marginal rate, every $1 of depreciation saves $${marginalRate.toFixed(2)} in tax. This is the optimal time for capital expenditures.`,
    })
  }

  // Heavy vehicle exception
  insights.push({
    type: 'info',
    title: 'Heavy Vehicle Exception (Over 6,000 lbs GVWR)',
    detail: `Vehicles over 6,000 lbs bypass luxury auto limits. Up to $${VEHICLE_LIMITS_2024.suvOver6000.toLocaleString()} Section 179 for SUVs, unlimited for trucks/vans. Popular qualifying vehicles: Ford F-150, Chevy Tahoe, Tesla Model X, BMW X5.`,
  })

  return insights
}

// ===================================================================
//  MAIN ANALYSIS
// ===================================================================

export function generateDepreciationSummary(
  state: FortunaState,
  assets: BusinessAsset[] = [],
  entityFilter?: string,
): DepreciationSummary {
  const report = generateTaxReport(state)
  const marginalRate = report.marginalRate

  // Apply entity filter if specified
  const filtered = entityFilter
    ? assets.filter(a => (a.entityId || 'personal') === entityFilter)
    : assets

  let section179Used = 0
  const assetResults: AssetDepreciationResult[] = []

  for (const asset of filtered) {
    const result = calculateAssetDepreciation(asset, marginalRate, section179Used)
    section179Used += result.schedule[0]?.section179 || 0
    assetResults.push(result)
  }

  const timingInsights = analyzePurchaseTiming(state, marginalRate)

  const currentYear = new Date().getFullYear()
  const currentYearDeduction = assetResults.reduce((sum, r) => {
    const thisYear = r.schedule.find(s => s.year === currentYear)
    return sum + (thisYear?.totalDepreciation || 0)
  }, 0)

  // Per-entity breakdown
  const entityIds = new Set(assets.map(a => a.entityId || 'personal'))
  const entityBreakdown: { entityId: string; assetCount: number; totalCost: number; currentYearDeduction: number; section179Used: number }[] = []
  for (const eid of entityIds) {
    const entityAssets = assets.filter(a => (a.entityId || 'personal') === eid)
    let eid179 = 0
    let eidDeduction = 0
    for (const asset of entityAssets) {
      const r = calculateAssetDepreciation(asset, marginalRate, eid179)
      eid179 += r.schedule[0]?.section179 || 0
      const thisYear = r.schedule.find(s => s.year === currentYear)
      eidDeduction += thisYear?.totalDepreciation || 0
    }
    entityBreakdown.push({ entityId: eid, assetCount: entityAssets.length, totalCost: entityAssets.reduce((s, a) => s + a.cost, 0), currentYearDeduction: eidDeduction, section179Used: eid179 })
  }

  return {
    totalAssets: filtered.length,
    totalCost: filtered.reduce((s, a) => s + a.cost, 0),
    totalDepreciatedToDate: assetResults.reduce((s, r) => s + r.totalDeductions, 0),
    remainingBasis: assetResults.reduce((s, r) => {
      const last = r.schedule[r.schedule.length - 1]
      return s + (last?.remainingBasis || 0)
    }, 0),
    currentYearDeduction,
    section179Used,
    section179Remaining: Math.max(0, SECTION_179_LIMIT_2024 - section179Used),
    bonusDepreciationRate: BONUS_DEPRECIATION_RATES[new Date().getFullYear()] ?? 0,
    assetResults,
    vehicleAnalysis: null,
    homeOffice: null,
    purchaseTimingInsights: timingInsights,
    totalTaxSavingsThisYear: Math.round(currentYearDeduction * marginalRate),
    entityBreakdown,
  }
}

export { ASSET_CLASSES, VEHICLE_LIMITS_2024, SECTION_179_LIMIT_2024, STANDARD_MILEAGE_RATE_2024, BONUS_DEPRECIATION_RATES }
