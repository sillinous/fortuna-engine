/**
 * FORTUNA ENGINE — Multi-Entity Cascade Engine v2
 * 
 * Models tax implications across multiple business entities:
 *   - Entity hierarchy with parent/child relationships
 *   - Pass-through cascade (K-1 flow from partnerships/S-Corps)
 *   - Salary + distribution optimization across entities
 *   - Intercompany management fee strategies
 *   - Consolidated tax projection
 *   - Entity comparison: sole prop vs S-Corp vs C-Corp
 *   - QSBS (§1202) tracking for C-Corp qualified small business stock
 *
 * v2: Uses canonical EntityType from storage.ts
 */

import { type EntityType, type LegalEntity } from './storage'
export type { EntityType }

// Alias map for any legacy 'single_llc' / 's_corp' / 'c_corp' references
export function normalizeEntityType(t: string): EntityType {
  const map: Record<string, EntityType> = {
    single_llc: 'llc', s_corp: 'scorp', c_corp: 'ccorp',
  }
  return (map[t] || t) as EntityType
}

export interface BusinessEntity {
  id: string
  name: string
  type: EntityType
  ein?: string
  stateOfFormation: string
  ownershipPct: number
  parentEntityId?: string
  annualRevenue: number
  annualExpenses: number
  officerSalary: number
  retirementContrib: number
  healthInsurancePremium: number
  otherDeductions: number
  estimatedTaxPayments: number
  notes: string
}

/** Convert a LegalEntity + its attributed income/expenses into a BusinessEntity for cascade */
export function legalToBusinessEntity(
  entity: LegalEntity,
  revenue: number,
  expenses: number,
): BusinessEntity {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    ein: entity.einNumber,
    stateOfFormation: entity.state,
    ownershipPct: entity.ownershipPct ?? 100,
    parentEntityId: entity.parentEntityId,
    annualRevenue: revenue,
    annualExpenses: expenses,
    officerSalary: entity.officerSalary ?? 0,
    retirementContrib: entity.retirementContrib ?? 0,
    healthInsurancePremium: entity.healthInsurancePremium ?? 0,
    otherDeductions: 0,
    estimatedTaxPayments: 0,
    notes: entity.notes || '',
  }
}

export interface EntityTaxResult {
  entity: BusinessEntity
  grossProfit: number
  taxableIncome: number
  entityLevelTax: number         // C-Corp: corporate tax; others: 0
  passThruIncome: number         // income flowing to personal return
  selfEmploymentIncome: number   // subject to SE tax
  seTax: number
  ficaTax: number                // on W-2 salary (employer + employee share)
  qbiDeduction: number           // §199A for pass-throughs
  effectiveEntityRate: number
  totalEntityBurden: number      // all taxes attributable to this entity
  notes: string[]
}

export interface CascadeResult {
  entities: EntityTaxResult[]
  consolidatedPersonal: {
    totalPassThruIncome: number
    totalW2Income: number
    totalSETax: number
    totalFICATax: number
    totalQBI: number
    estimatedFederalTax: number
    estimatedStateTax: number
    totalTaxBurden: number
    effectiveRate: number
  }
  optimizationNotes: string[]
}

// ─── Tax Rate Constants ─────────────────────────────────────────────────────

const CORP_TAX_RATE = 0.21
const SE_RATE = 0.9235 * 0.153
const SS_WAGE_BASE = 168600
const FICA_RATE = 0.0765  // employee share
const FICA_EMPLOYER = 0.0765
const QBI_RATE = 0.20

// Federal brackets (2025 single, simplified)
const FED_BRACKETS = [
  { max: 11925, rate: 0.10 },
  { max: 48475, rate: 0.12 },
  { max: 103350, rate: 0.22 },
  { max: 197300, rate: 0.24 },
  { max: 250525, rate: 0.32 },
  { max: 626350, rate: 0.35 },
  { max: Infinity, rate: 0.37 },
]

function calcFederalTax(taxable: number): number {
  let tax = 0, prev = 0
  for (const b of FED_BRACKETS) {
    const amt = Math.min(taxable - prev, b.max - prev)
    if (amt <= 0) break
    tax += amt * b.rate
    prev = b.max
  }
  return tax
}

function calcSETax(netSE: number): { total: number; deductibleHalf: number } {
  const base = netSE * 0.9235
  const ss = Math.min(base, SS_WAGE_BASE) * 0.124
  const med = base * 0.029
  const total = ss + med
  return { total: Math.round(total), deductibleHalf: Math.round(total / 2) }
}

// ─── Single Entity Tax Calculator ───────────────────────────────────────────

function calculateEntityTax(entity: BusinessEntity): EntityTaxResult {
  const grossProfit = entity.annualRevenue - entity.annualExpenses
  const notes: string[] = []
  let entityLevelTax = 0
  let passThruIncome = 0
  let selfEmploymentIncome = 0
  let seTax = 0
  let ficaTax = 0
  let qbiDeduction = 0
  let taxableIncome = grossProfit

  switch (entity.type) {
    case 'sole_prop':
    case 'llc': {
      // All income is pass-through + subject to SE tax
      const deductions = entity.retirementContrib + entity.healthInsurancePremium + entity.otherDeductions
      taxableIncome = Math.max(0, grossProfit - deductions)
      passThruIncome = taxableIncome
      selfEmploymentIncome = grossProfit // SE tax on gross before retirement
      const se = calcSETax(selfEmploymentIncome)
      seTax = se.total
      passThruIncome -= se.deductibleHalf // deduct half SE tax
      qbiDeduction = Math.min(passThruIncome * QBI_RATE, passThruIncome) // simplified QBI
      notes.push(`Full SE tax applies: $${seTax.toLocaleString()}`)
      notes.push(`QBI deduction (§199A): $${Math.round(qbiDeduction).toLocaleString()}`)
      break
    }

    case 'scorp': {
      // Salary subject to FICA; distributions avoid SE tax
      const salary = entity.officerSalary
      const distribution = Math.max(0, grossProfit - salary - entity.retirementContrib - entity.healthInsurancePremium - entity.otherDeductions)
      
      // FICA on salary (both shares)
      const employeeFICA = Math.min(salary, SS_WAGE_BASE) * FICA_RATE + salary * 0.0145 // SS cap + Medicare
      const employerFICA = Math.min(salary, SS_WAGE_BASE) * FICA_EMPLOYER + salary * 0.0145
      ficaTax = Math.round(employeeFICA + employerFICA)
      
      // Pass-through: salary + distribution to personal return
      passThruIncome = distribution // distribution flows through K-1
      selfEmploymentIncome = 0 // no SE tax on S-Corp income
      
      qbiDeduction = Math.min(distribution * QBI_RATE, distribution)
      
      const seTaxSaved = calcSETax(grossProfit).total - ficaTax
      notes.push(`Salary: $${salary.toLocaleString()} | Distribution: $${Math.round(distribution).toLocaleString()}`)
      notes.push(`FICA (both shares): $${ficaTax.toLocaleString()}`)
      notes.push(`SE tax savings vs sole prop: ~$${Math.max(0, Math.round(seTaxSaved)).toLocaleString()}`)
      
      // W-2 income goes to personal return separately
      taxableIncome = salary + distribution
      break
    }

    case 'ccorp': {
      // Double taxation: corporate tax on profits, then dividend tax on distributions
      const deductions = entity.officerSalary + entity.retirementContrib + entity.healthInsurancePremium + entity.otherDeductions
      const corpTaxable = Math.max(0, grossProfit - deductions)
      entityLevelTax = Math.round(corpTaxable * CORP_TAX_RATE)
      
      const afterTaxProfit = corpTaxable - entityLevelTax
      passThruIncome = 0 // C-Corp doesn't pass through (unless distributed as dividends)
      
      // FICA on salary
      const empFICA = Math.min(entity.officerSalary, SS_WAGE_BASE) * FICA_RATE + entity.officerSalary * 0.0145
      const erFICA = Math.min(entity.officerSalary, SS_WAGE_BASE) * FICA_EMPLOYER + entity.officerSalary * 0.0145
      ficaTax = Math.round(empFICA + erFICA)
      
      taxableIncome = corpTaxable
      notes.push(`Corporate tax (21%): $${entityLevelTax.toLocaleString()}`)
      notes.push(`After-tax retained: $${Math.round(afterTaxProfit).toLocaleString()}`)
      notes.push(`QSBS (§1202): If held 5+ years, up to $10M or 10x basis gain exclusion`)
      if (afterTaxProfit > 0) {
        const divTax = Math.round(afterTaxProfit * 0.15) // qualified dividend rate
        notes.push(`If distributed as dividend: additional $${divTax.toLocaleString()} tax (15% LTCG rate)`)
      }
      break
    }

    case 'partnership': {
      // Pass-through based on ownership %
      const deductions = entity.retirementContrib + entity.otherDeductions
      taxableIncome = Math.max(0, grossProfit - deductions)
      passThruIncome = taxableIncome * (entity.ownershipPct / 100)
      selfEmploymentIncome = passThruIncome // general partners pay SE tax
      const se = calcSETax(selfEmploymentIncome)
      seTax = se.total
      passThruIncome -= se.deductibleHalf
      qbiDeduction = Math.min(passThruIncome * QBI_RATE, passThruIncome)
      notes.push(`Your share (${entity.ownershipPct}%): $${Math.round(passThruIncome).toLocaleString()}`)
      notes.push(`SE tax on partnership income: $${seTax.toLocaleString()}`)
      break
    }

    case 'trust': {
      // Trust income taxed at compressed brackets (highest rate at ~$14,450)
      const deductions = entity.otherDeductions
      taxableIncome = Math.max(0, grossProfit - deductions)
      // Trust brackets reach 37% at just $14,450
      let trustTax = 0
      if (taxableIncome <= 3100) trustTax = taxableIncome * 0.10
      else if (taxableIncome <= 11150) trustTax = 310 + (taxableIncome - 3100) * 0.24
      else if (taxableIncome <= 15200) trustTax = 2242 + (taxableIncome - 11150) * 0.35
      else trustTax = 3660 + (taxableIncome - 15200) * 0.37
      
      entityLevelTax = Math.round(trustTax)
      notes.push(`Trust tax (compressed brackets): $${entityLevelTax.toLocaleString()}`)
      notes.push(`Consider distributing income to beneficiaries to avoid compressed brackets`)
      break
    }

    default:
      passThruIncome = taxableIncome
  }

  const totalBurden = entityLevelTax + seTax + ficaTax
  const effectiveRate = grossProfit > 0 ? totalBurden / grossProfit : 0

  return {
    entity,
    grossProfit,
    taxableIncome,
    entityLevelTax,
    passThruIncome,
    selfEmploymentIncome,
    seTax,
    ficaTax,
    qbiDeduction,
    effectiveEntityRate: Math.round(effectiveRate * 10000) / 10000,
    totalEntityBurden: totalBurden,
    notes,
  }
}

// ─── Multi-Entity Cascade ───────────────────────────────────────────────────

export function calculateEntityCascade(
  entities: BusinessEntity[],
  personalW2Income: number = 0,
  stateCode: string = 'IL',
  filingStatus: string = 'single',
): CascadeResult {
  // Calculate each entity
  const entityResults = entities.map(e => calculateEntityTax(e))

  // Consolidate to personal return
  let totalPassThru = entityResults.reduce((s, r) => s + r.passThruIncome, 0)
  let totalW2 = personalW2Income
  let totalSETax = entityResults.reduce((s, r) => s + r.seTax, 0)
  let totalFICATax = entityResults.reduce((s, r) => s + r.ficaTax, 0)
  let totalQBI = entityResults.reduce((s, r) => s + r.qbiDeduction, 0)

  // Add S-Corp/C-Corp salaries to W-2 income
  for (const r of entityResults) {
    if (r.entity.type === 'scorp' || r.entity.type === 'ccorp') {
      totalW2 += r.entity.officerSalary
    }
  }

  // Calculate personal federal tax
  const totalIncome = totalW2 + totalPassThru
  const halfSE = entityResults.reduce((s, r) => {
    if (r.entity.type === 'sole_prop' || r.entity.type === 'llc' || r.entity.type === 'partnership') {
      return s + calcSETax(r.selfEmploymentIncome).deductibleHalf
    }
    return s
  }, 0)
  
  const standardDeduction = filingStatus === 'mfj' ? 30000 : 15000
  const personalTaxable = Math.max(0, totalIncome - halfSE - standardDeduction - totalQBI)
  const federalTax = Math.round(calcFederalTax(personalTaxable))

  // Estimate state tax (simplified)
  const stateRate = getSimpleStateRate(stateCode)
  const stateTax = Math.round(personalTaxable * stateRate)

  const totalBurden = federalTax + stateTax + totalSETax + totalFICATax +
    entityResults.reduce((s, r) => s + r.entityLevelTax, 0)

  const effectiveRate = totalIncome > 0 ? totalBurden / totalIncome : 0

  // Generate optimization notes
  const optimizationNotes: string[] = []

  // Check if sole prop should be S-Corp
  for (const r of entityResults) {
    if ((r.entity.type === 'sole_prop' || r.entity.type === 'llc') && r.grossProfit > 50000) {
      const potentialSCorpSavings = r.seTax - Math.round(r.grossProfit * 0.45 * (FICA_RATE + FICA_EMPLOYER) + r.grossProfit * 0.45 * 0.029) - 3000
      if (potentialSCorpSavings > 3000) {
        optimizationNotes.push(`💡 "${r.entity.name}" could save ~$${Math.round(potentialSCorpSavings).toLocaleString()}/yr by electing S-Corp status. Net profit $${Math.round(r.grossProfit).toLocaleString()} exceeds threshold.`)
      }
    }
  }

  // Check intercompany management fee opportunity
  const sCorps = entityResults.filter(r => r.entity.type === 'scorp')
  const cCorps = entityResults.filter(r => r.entity.type === 'ccorp')
  if (sCorps.length > 0 && cCorps.length > 0) {
    optimizationNotes.push(`💡 Consider intercompany management fees from C-Corp to S-Corp to reduce double taxation on C-Corp earnings.`)
  }

  // QBI deduction sunset warning
  if (totalQBI > 0) {
    optimizationNotes.push(`⚠️ §199A QBI deduction ($${Math.round(totalQBI).toLocaleString()}) is set to expire after 2025 unless Congress extends. Plan for potential loss.`)
  }

  // Retirement contribution optimization
  const totalRetirement = entities.reduce((s, e) => s + e.retirementContrib, 0)
  const maxRetirement = 69000 // Solo 401(k) max
  if (totalRetirement < maxRetirement * 0.5 && totalIncome > 100000) {
    optimizationNotes.push(`💡 Retirement contributions ($${totalRetirement.toLocaleString()}) are well below maximum ($${maxRetirement.toLocaleString()}). Increasing contributions could save $${Math.round((maxRetirement - totalRetirement) * 0.30).toLocaleString()} in taxes.`)
  }

  return {
    entities: entityResults,
    consolidatedPersonal: {
      totalPassThruIncome: Math.round(totalPassThru),
      totalW2Income: Math.round(totalW2),
      totalSETax,
      totalFICATax,
      totalQBI: Math.round(totalQBI),
      estimatedFederalTax: federalTax,
      estimatedStateTax: stateTax,
      totalTaxBurden: totalBurden,
      effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    },
    optimizationNotes,
  }
}

// ─── Entity Comparison Tool ─────────────────────────────────────────────────

export function compareEntityStructures(
  annualRevenue: number,
  annualExpenses: number,
  stateCode: string = 'IL',
): { type: EntityType; totalTax: number; effectiveRate: number; notes: string[] }[] {
  const profit = annualRevenue - annualExpenses
  const reasonableSalary = Math.max(40000, profit * 0.45)

  const structures: { type: EntityType; salary: number }[] = [
    { type: 'sole_prop', salary: 0 },
    { type: 'scorp', salary: Math.round(reasonableSalary) },
    { type: 'ccorp', salary: Math.round(reasonableSalary) },
  ]

  return structures.map(s => {
    const entity: BusinessEntity = {
      id: s.type, name: s.type, type: s.type, stateOfFormation: stateCode,
      ownershipPct: 100, annualRevenue, annualExpenses,
      officerSalary: s.salary, retirementContrib: 0,
      healthInsurancePremium: 0, otherDeductions: 0,
      estimatedTaxPayments: 0, notes: '',
    }
    const result = calculateEntityCascade([entity], 0, stateCode)
    return {
      type: s.type,
      totalTax: result.consolidatedPersonal.totalTaxBurden,
      effectiveRate: result.consolidatedPersonal.effectiveRate,
      notes: result.entities[0]?.notes || [],
    }
  }).sort((a, b) => a.totalTax - b.totalTax)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSimpleStateRate(code: string): number {
  const rates: Record<string, number> = {
    AL: 0.05, AK: 0, AZ: 0.025, AR: 0.044, CA: 0.093, CO: 0.044,
    CT: 0.05, DE: 0.066, FL: 0, GA: 0.055, HI: 0.075, ID: 0.058,
    IL: 0.0495, IN: 0.0305, IA: 0.038, KS: 0.057, KY: 0.04,
    LA: 0.0425, ME: 0.0715, MD: 0.0575, MA: 0.05, MI: 0.0425,
    MN: 0.0785, MS: 0.05, MO: 0.048, MT: 0.059, NE: 0.0564,
    NV: 0, NH: 0, NJ: 0.0675, NM: 0.059, NY: 0.0685, NC: 0.045,
    ND: 0.0195, OH: 0.035, OK: 0.0475, OR: 0.099, PA: 0.0307,
    RI: 0.0599, SC: 0.064, SD: 0, TN: 0, TX: 0, UT: 0.0465,
    VT: 0.0875, VA: 0.0575, WA: 0, WV: 0.0512, WI: 0.0765,
    WY: 0, DC: 0.085,
  }
  return rates[code] || 0.05
}
