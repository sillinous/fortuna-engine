/**
 * FORTUNA ENGINE v6 — Multi-Entity Optimizer
 * 
 * Automatically models the optimal number and type of business entities
 * for any given income mix. Handles:
 * - S-Corp reasonable salary determination
 * - Entity arbitrage (splitting income across entities)
 * - Compliance cost-benefit breakeven analysis
 * - Pass-through tax calculations
 * - Self-employment tax optimization
 * - State-specific formation considerations
 */

import type { FortunaState, IncomeStream, Entity } from './storage'
import { generateTaxReport, calculateSCorpSavings, calculateSelfEmploymentTax } from './tax-calculator'

// ─── Types ───────────────────────────────────────────────────────────────

export type EntityType = 'sole_prop' | 'llc_disregarded' | 'llc_scorp' | 'scorp' | 'ccorp'

export interface EntityConfig {
  type: EntityType
  name: string
  allocatedIncome: number
  reasonableSalary?: number
  distributions?: number
  annualComplianceCost: number
  setupCost: number
}

export interface EntityScenario {
  id: string
  label: string
  description: string
  entities: EntityConfig[]
  totalIncome: number
  totalSETax: number
  totalIncomeTax: number
  totalComplianceCost: number
  totalTaxBurden: number
  netSavings: number
  breakEvenMonths: number
  isRecommended: boolean
  reasoning: string
  pros: string[]
  cons: string[]
}

export interface ReasonableSalaryAnalysis {
  income: number
  recommendedSalary: number
  salaryRange: { min: number; max: number }
  distributions: number
  seTaxOnSalary: number
  seTaxSavings: number
  methodology: string
  riskLevel: 'low' | 'moderate' | 'high'
  riskNotes: string
}

export interface EntityOptimizerResult {
  scenarios: EntityScenario[]
  recommended: EntityScenario
  currentScenario: EntityScenario
  salaryAnalysis: ReasonableSalaryAnalysis | null
  breakEvenIncome: number
  maxSavings: number
  summary: string
}

// ─── Reasonable Salary Calculator ───────────────────────────────────────

const INDUSTRY_SALARY_MULTIPLIERS: Record<string, { min: number; max: number }> = {
  consulting: { min: 0.40, max: 0.65 },
  freelance: { min: 0.35, max: 0.55 },
  ecommerce: { min: 0.30, max: 0.50 },
  saas: { min: 0.35, max: 0.55 },
  creative: { min: 0.35, max: 0.55 },
  professional: { min: 0.45, max: 0.70 },
  default: { min: 0.40, max: 0.60 },
}

export function calculateReasonableSalary(
  netIncome: number,
  industryType: string = 'default',
  hoursPerWeek: number = 40,
): ReasonableSalaryAnalysis {
  const multipliers = INDUSTRY_SALARY_MULTIPLIERS[industryType] || INDUSTRY_SALARY_MULTIPLIERS.default

  // IRS guidance: salary must be "reasonable" — comparable to what you'd pay someone else
  // Factor in: income level, industry, hours worked, complexity
  const minSalary = Math.max(
    netIncome * multipliers.min,
    Math.min(40000, netIncome * 0.8) // Absolute floor unless income is very low
  )
  const maxSalary = Math.min(
    netIncome * multipliers.max,
    netIncome * 0.85 // Never above 85% — must have some distribution benefit
  )

  // Hours-adjusted: part-time reduces the reasonable salary
  const hoursFactor = Math.min(hoursPerWeek / 40, 1.2)
  let recommendedSalary = Math.round(((minSalary + maxSalary) / 2) * hoursFactor)
  recommendedSalary = Math.max(recommendedSalary, Math.min(30000, netIncome * 0.5))
  recommendedSalary = Math.min(recommendedSalary, netIncome)

  // Social Security wage base caps the employer FICA benefit
  const ssWageBase2024 = 168600
  const ssWageBase2025 = 176100
  const wageBase = ssWageBase2025

  const distributions = Math.max(0, netIncome - recommendedSalary)
  const seTaxOnSalary = recommendedSalary * 0.153 // Both halves of FICA
  const fullSETax = calculateSelfEmploymentTax(netIncome).total
  const seTaxSavings = fullSETax - seTaxOnSalary

  // Risk assessment
  const salaryRatio = recommendedSalary / netIncome
  let riskLevel: 'low' | 'moderate' | 'high' = 'low'
  let riskNotes = ''
  if (salaryRatio < 0.35) {
    riskLevel = 'high'
    riskNotes = `Salary is only ${Math.round(salaryRatio * 100)}% of net income — IRS may challenge as unreasonably low.`
  } else if (salaryRatio < 0.45) {
    riskLevel = 'moderate'
    riskNotes = `Salary at ${Math.round(salaryRatio * 100)}% is defensible but may attract scrutiny on audit.`
  } else {
    riskNotes = `Salary at ${Math.round(salaryRatio * 100)}% of income is well within safe harbor range.`
  }

  return {
    income: netIncome,
    recommendedSalary,
    salaryRange: { min: Math.round(minSalary), max: Math.round(maxSalary) },
    distributions,
    seTaxOnSalary: Math.round(seTaxOnSalary),
    seTaxSavings: Math.round(seTaxSavings),
    methodology: `Based on ${industryType} industry benchmarks, ${hoursPerWeek}hrs/wk commitment, and IRS reasonable compensation standards. Range: $${Math.round(minSalary).toLocaleString()} – $${Math.round(maxSalary).toLocaleString()}.`,
    riskLevel,
    riskNotes,
  }
}

// ─── Compliance Cost Estimator ──────────────────────────────────────────

interface ComplianceCosts {
  formation: number
  annualStateFiling: number
  payrollService: number
  taxPreparation: number
  registeredAgent: number
  annualTotal: number
  description: string
}

function estimateComplianceCosts(entityType: EntityType, state: string): ComplianceCosts {
  const stateFilingCosts: Record<string, number> = {
    'CA': 800, 'NY': 200, 'TX': 300, 'FL': 150, 'IL': 75,
    'MA': 500, 'NJ': 125, 'PA': 70, 'OH': 99, 'WA': 60,
    'DEFAULT': 100,
  }

  const stateFee = stateFilingCosts[state] || stateFilingCosts.DEFAULT

  switch (entityType) {
    case 'sole_prop':
      return {
        formation: 0, annualStateFiling: 0, payrollService: 0,
        taxPreparation: 200, registeredAgent: 0,
        annualTotal: 200,
        description: 'Minimal compliance — Schedule C on personal return',
      }
    case 'llc_disregarded':
      return {
        formation: 150, annualStateFiling: stateFee, payrollService: 0,
        taxPreparation: 400, registeredAgent: 125,
        annualTotal: stateFee + 525,
        description: `LLC formation + annual ${state} filing + registered agent`,
      }
    case 'llc_scorp':
    case 'scorp':
      return {
        formation: 300, annualStateFiling: stateFee, payrollService: 1200,
        taxPreparation: 1500, registeredAgent: 125,
        annualTotal: stateFee + 2825,
        description: `S-Corp election requires payroll ($100/mo), separate tax return (Form 1120-S), ${state} annual filing`,
      }
    case 'ccorp':
      return {
        formation: 400, annualStateFiling: stateFee, payrollService: 1200,
        taxPreparation: 2000, registeredAgent: 125,
        annualTotal: stateFee + 3325,
        description: `C-Corp double taxation structure — payroll, corporate return (Form 1120), state filing`,
      }
    default:
      return { formation: 0, annualStateFiling: 0, payrollService: 0, taxPreparation: 200, registeredAgent: 0, annualTotal: 200, description: '' }
  }
}

// ─── Scenario Builder ───────────────────────────────────────────────────

function buildSolePropScenario(
  netIncome: number,
  state: string,
): EntityScenario {
  const seTax = calculateSelfEmploymentTax(netIncome).total
  const compliance = estimateComplianceCosts('sole_prop', state)
  const incomeTax = estimateIncomeTax(netIncome, 'single') // simplified

  return {
    id: 'sole_prop',
    label: 'Sole Proprietorship',
    description: 'Default structure — no entity formation required',
    entities: [{
      type: 'sole_prop',
      name: 'Personal (Schedule C)',
      allocatedIncome: netIncome,
      annualComplianceCost: compliance.annualTotal,
      setupCost: 0,
    }],
    totalIncome: netIncome,
    totalSETax: Math.round(seTax),
    totalIncomeTax: Math.round(incomeTax),
    totalComplianceCost: compliance.annualTotal,
    totalTaxBurden: Math.round(seTax + incomeTax + compliance.annualTotal),
    netSavings: 0,
    breakEvenMonths: 0,
    isRecommended: false,
    reasoning: 'Simplest structure with no formation costs. All income subject to SE tax.',
    pros: [
      'Zero formation cost or complexity',
      'Minimal record-keeping requirements',
      'Easy to start and stop',
      'All business losses deductible on personal return',
    ],
    cons: [
      'Full self-employment tax on all net income',
      'No asset protection',
      'Limited credibility with some clients',
      'No income-splitting opportunity',
    ],
  }
}

function buildLLCScenario(
  netIncome: number,
  state: string,
): EntityScenario {
  const seTax = calculateSelfEmploymentTax(netIncome).total
  const compliance = estimateComplianceCosts('llc_disregarded', state)
  const incomeTax = estimateIncomeTax(netIncome, 'single')

  return {
    id: 'llc_disregarded',
    label: 'LLC (Disregarded Entity)',
    description: 'Asset protection without tax benefit — same tax treatment as sole prop',
    entities: [{
      type: 'llc_disregarded',
      name: 'LLC',
      allocatedIncome: netIncome,
      annualComplianceCost: compliance.annualTotal,
      setupCost: compliance.formation,
    }],
    totalIncome: netIncome,
    totalSETax: Math.round(seTax),
    totalIncomeTax: Math.round(incomeTax),
    totalComplianceCost: compliance.annualTotal,
    totalTaxBurden: Math.round(seTax + incomeTax + compliance.annualTotal),
    netSavings: 0,
    breakEvenMonths: 0,
    isRecommended: false,
    reasoning: 'Provides liability protection but identical tax treatment to sole proprietorship. Same SE tax applies.',
    pros: [
      'Personal asset protection',
      'Professional credibility',
      'Flexible management structure',
      'Can elect S-Corp status later',
    ],
    cons: [
      'Annual state filing fees',
      'No SE tax savings',
      'Additional record-keeping',
      `$${compliance.annualTotal}/yr in compliance costs`,
    ],
  }
}

function buildSCorpScenario(
  netIncome: number,
  state: string,
  salary?: number,
): EntityScenario {
  const salaryAnalysis = calculateReasonableSalary(netIncome)
  const actualSalary = salary || salaryAnalysis.recommendedSalary
  const distributions = netIncome - actualSalary
  const compliance = estimateComplianceCosts('llc_scorp', state)

  // S-Corp: FICA only on salary, not distributions
  const ficaOnSalary = actualSalary * 0.153
  const fullSETax = calculateSelfEmploymentTax(netIncome).total
  const seTaxSavings = fullSETax - ficaOnSalary

  const incomeTax = estimateIncomeTax(netIncome, 'single')

  // Net savings after compliance costs
  const netAnnualSavings = seTaxSavings - compliance.annualTotal
  const breakEvenMonths = netAnnualSavings > 0
    ? Math.ceil(compliance.formation / (netAnnualSavings / 12))
    : Infinity

  return {
    id: 'scorp',
    label: 'S-Corp (LLC + S Election)',
    description: `Split income: $${actualSalary.toLocaleString()} salary + $${distributions.toLocaleString()} distributions`,
    entities: [{
      type: 'llc_scorp',
      name: 'S-Corporation',
      allocatedIncome: netIncome,
      reasonableSalary: actualSalary,
      distributions,
      annualComplianceCost: compliance.annualTotal,
      setupCost: compliance.formation,
    }],
    totalIncome: netIncome,
    totalSETax: Math.round(ficaOnSalary),
    totalIncomeTax: Math.round(incomeTax),
    totalComplianceCost: compliance.annualTotal,
    totalTaxBurden: Math.round(ficaOnSalary + incomeTax + compliance.annualTotal),
    netSavings: Math.round(Math.max(0, netAnnualSavings)),
    breakEvenMonths: isFinite(breakEvenMonths) ? breakEvenMonths : 999,
    isRecommended: false,
    reasoning: `S-Corp election saves $${Math.round(seTaxSavings).toLocaleString()}/yr in SE tax by splitting income. After $${compliance.annualTotal.toLocaleString()}/yr compliance costs, net savings are $${Math.round(netAnnualSavings).toLocaleString()}/yr. ${netAnnualSavings > 0 ? `Pays for itself in ${breakEvenMonths} months.` : 'Compliance costs exceed tax savings at this income level.'}`,
    pros: [
      `$${Math.round(Math.max(0, seTaxSavings)).toLocaleString()}/yr SE tax reduction`,
      'Asset protection via LLC',
      'Salary enables W-2, improving mortgage/credit applications',
      'Retirement plan contributions based on salary',
      netAnnualSavings > 0 ? `Net $${Math.round(netAnnualSavings).toLocaleString()}/yr after compliance` : '',
    ].filter(Boolean),
    cons: [
      `$${compliance.annualTotal.toLocaleString()}/yr ongoing compliance cost`,
      'Must run payroll (monthly or bi-weekly)',
      'Separate corporate tax return (Form 1120-S)',
      'IRS scrutiny on salary reasonableness',
      distributions < 5000 ? 'Low distribution amount may not justify complexity' : '',
    ].filter(Boolean),
  }
}

function buildDualEntityScenario(
  streams: IncomeStream[],
  state: string,
): EntityScenario | null {
  // Only makes sense with 2+ income types
  const businessStreams = streams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  if (businessStreams.length < 2) return null

  const totalIncome = businessStreams.reduce((s, i) => s + i.annualAmount, 0)
  if (totalIncome < 80000) return null

  // Largest stream → S-Corp, remaining → Sole Prop
  const sorted = [...businessStreams].sort((a, b) => b.annualAmount - a.annualAmount)
  const scorpStream = sorted[0]
  const solePropStreams = sorted.slice(1)
  const scorpIncome = scorpStream.annualAmount
  const solePropIncome = solePropStreams.reduce((s, i) => s + i.annualAmount, 0)

  const salary = calculateReasonableSalary(scorpIncome).recommendedSalary
  const distributions = scorpIncome - salary

  const scorpCompliance = estimateComplianceCosts('llc_scorp', state)
  const solePropCompliance = estimateComplianceCosts('sole_prop', state)

  const ficaOnSalary = salary * 0.153
  const solePropSETax = calculateSelfEmploymentTax(solePropIncome).total
  const fullSETax = calculateSelfEmploymentTax(totalIncome).total
  const totalSETax = ficaOnSalary + solePropSETax

  const seTaxSavings = fullSETax - totalSETax
  const totalCompliance = scorpCompliance.annualTotal + solePropCompliance.annualTotal
  const netSavings = seTaxSavings - totalCompliance
  const incomeTax = estimateIncomeTax(totalIncome, 'single')

  return {
    id: 'dual_entity',
    label: 'Dual Structure (S-Corp + Sole Prop)',
    description: `Primary income ($${scorpIncome.toLocaleString()}) through S-Corp, secondary ($${solePropIncome.toLocaleString()}) as sole prop`,
    entities: [
      {
        type: 'llc_scorp', name: `S-Corp (${scorpStream.name})`,
        allocatedIncome: scorpIncome, reasonableSalary: salary, distributions,
        annualComplianceCost: scorpCompliance.annualTotal, setupCost: scorpCompliance.formation,
      },
      {
        type: 'sole_prop', name: `Sole Prop (${solePropStreams.map(s => s.name).join(', ')})`,
        allocatedIncome: solePropIncome,
        annualComplianceCost: solePropCompliance.annualTotal, setupCost: 0,
      },
    ],
    totalIncome: totalIncome,
    totalSETax: Math.round(totalSETax),
    totalIncomeTax: Math.round(incomeTax),
    totalComplianceCost: totalCompliance,
    totalTaxBurden: Math.round(totalSETax + incomeTax + totalCompliance),
    netSavings: Math.round(Math.max(0, netSavings)),
    breakEvenMonths: netSavings > 0 ? Math.ceil(scorpCompliance.formation / (netSavings / 12)) : 999,
    isRecommended: false,
    reasoning: `Isolates primary income stream in S-Corp for SE tax savings while keeping smaller streams simple. Saves $${Math.round(seTaxSavings).toLocaleString()}/yr in SE tax, netting $${Math.round(Math.max(0, netSavings)).toLocaleString()}/yr after compliance.`,
    pros: [
      'Optimizes highest-income stream for tax savings',
      'Keeps smaller income simple',
      'Liability separation between business activities',
      `$${Math.round(Math.max(0, netSavings)).toLocaleString()}/yr net savings`,
    ],
    cons: [
      'Two sets of records to maintain',
      'More complex tax filing',
      `$${totalCompliance.toLocaleString()}/yr total compliance`,
      'Must track income allocation carefully',
    ],
  }
}

// ─── Simplified income tax estimate ─────────────────────────────────────

function estimateIncomeTax(taxableIncome: number, status: string): number {
  const brackets2025 = [
    { min: 0, max: 11925, rate: 0.10 },
    { min: 11925, max: 48475, rate: 0.12 },
    { min: 48475, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 626350, rate: 0.35 },
    { min: 626350, max: Infinity, rate: 0.37 },
  ]
  let tax = 0
  for (const b of brackets2025) {
    if (taxableIncome <= b.min) break
    const taxable = Math.min(taxableIncome, b.max) - b.min
    tax += taxable * b.rate
  }
  return tax
}

// ─── Main Optimizer ─────────────────────────────────────────────────────

export function optimizeEntities(state: FortunaState): EntityOptimizerResult {
  const { profile, incomeStreams, expenses } = state
  const stateCode = profile.state || 'IL'

  const activeStreams = incomeStreams.filter(s => s.isActive)
  const selfEmploymentIncome = activeStreams
    .filter(s => ['business', 'freelance'].includes(s.type))
    .reduce((sum, s) => sum + s.annualAmount, 0)
  const deductibleExpenses = expenses.filter(e => e.isDeductible)
    .reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)
  const netSEIncome = Math.max(0, selfEmploymentIncome - deductibleExpenses)

  if (netSEIncome < 1000) {
    const baseline = buildSolePropScenario(0, stateCode)
    return {
      scenarios: [baseline],
      recommended: baseline,
      currentScenario: baseline,
      salaryAnalysis: null,
      breakEvenIncome: 50000,
      maxSavings: 0,
      summary: 'No significant self-employment income to optimize entity structure for.',
    }
  }

  // Build all scenarios
  const scenarios: EntityScenario[] = []

  const soleProp = buildSolePropScenario(netSEIncome, stateCode)
  scenarios.push(soleProp)

  const llc = buildLLCScenario(netSEIncome, stateCode)
  llc.netSavings = soleProp.totalTaxBurden - llc.totalTaxBurden
  scenarios.push(llc)

  if (netSEIncome >= 30000) {
    const scorp = buildSCorpScenario(netSEIncome, stateCode)
    scorp.netSavings = soleProp.totalTaxBurden - scorp.totalTaxBurden
    scenarios.push(scorp)
  }

  const dual = buildDualEntityScenario(activeStreams, stateCode)
  if (dual) {
    dual.netSavings = soleProp.totalTaxBurden - dual.totalTaxBurden
    scenarios.push(dual)
  }

  // Determine recommended
  const sorted = [...scenarios].sort((a, b) => b.netSavings - a.netSavings)
  const best = sorted[0]
  best.isRecommended = true

  // Salary analysis for S-Corp scenarios
  const salaryAnalysis = netSEIncome >= 30000
    ? calculateReasonableSalary(netSEIncome)
    : null

  // Calculate breakeven income for S-Corp
  const scorpCompliance = estimateComplianceCosts('llc_scorp', stateCode)
  // Breakeven when SE tax savings > compliance cost
  // SE savings ≈ distributions * 0.153
  // distributions = income - salary ≈ income * 0.5
  // So savings ≈ income * 0.5 * 0.153 = income * 0.0765
  const breakEvenIncome = Math.round(scorpCompliance.annualTotal / 0.0765)

  const maxSavings = best.netSavings

  let summary = ''
  if (best.id === 'sole_prop') {
    summary = `At $${netSEIncome.toLocaleString()} net SE income, entity structuring doesn't yet offset compliance costs. S-Corp becomes beneficial around $${breakEvenIncome.toLocaleString()}.`
  } else if (best.id === 'scorp') {
    summary = `S-Corp election would save approximately $${maxSavings.toLocaleString()}/yr after compliance costs. Recommended salary: $${salaryAnalysis?.recommendedSalary.toLocaleString()}.`
  } else if (best.id === 'dual_entity') {
    summary = `Dual entity structure (S-Corp + Sole Prop) optimizes your multiple income streams, saving $${maxSavings.toLocaleString()}/yr.`
  }

  // Determine current scenario
  const hasEntity = state.entities.some(e => e.isActive && (e.type === 'llc_scorp' || e.type === 'scorp'))
  const currentScenario = hasEntity
    ? scenarios.find(s => s.id === 'scorp') || soleProp
    : soleProp

  return {
    scenarios,
    recommended: best,
    currentScenario,
    salaryAnalysis,
    breakEvenIncome,
    maxSavings,
    summary,
  }
}

// ─── Income threshold analysis ──────────────────────────────────────────

export interface ThresholdAnalysis {
  currentIncome: number
  thresholds: {
    label: string
    income: number
    savings: number
    description: string
    reached: boolean
  }[]
}

export function analyzeIncomeThresholds(netSEIncome: number, state: string): ThresholdAnalysis {
  const thresholds = [
    { label: 'LLC Worthwhile', income: 25000, description: 'Asset protection justifies formation costs' },
    { label: 'S-Corp Breakeven', income: 40000, description: 'S-Corp tax savings begin to exceed compliance costs' },
    { label: 'S-Corp Sweet Spot', income: 75000, description: 'Strong savings with manageable audit risk' },
    { label: 'Max SE Savings', income: 168600, description: 'Social Security wage base cap — maximum FICA benefit' },
    { label: 'Dual Entity', income: 150000, description: 'Multiple entities may optimize different income streams' },
    { label: 'C-Corp Consideration', income: 400000, description: 'C-Corp qualified dividends may beat pass-through rates' },
  ]

  return {
    currentIncome: netSEIncome,
    thresholds: thresholds.map(t => {
      const solePropTax = calculateSelfEmploymentTax(t.income).total + estimateIncomeTax(t.income, 'single')
      const salary = calculateReasonableSalary(t.income).recommendedSalary
      const scorpTax = salary * 0.153 + estimateIncomeTax(t.income, 'single')
      const compliance = estimateComplianceCosts('llc_scorp', state).annualTotal
      const savings = Math.max(0, solePropTax - scorpTax - compliance)

      return {
        ...t,
        savings: Math.round(savings),
        reached: netSEIncome >= t.income,
      }
    }),
  }
}
