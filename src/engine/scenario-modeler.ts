/**
 * Fortuna Engine - Scenario Modeler v2
 * Interactive what-if analysis with multi-year projections,
 * reverse calculators, waterfall breakdowns, and real-time sliders
 */

import type { FortunaState, IncomeStream, LegalEntity, Deduction } from './storage'
import { generateTaxReport, calculateMaxSEPIRA, type TaxReport } from './tax-calculator'
import { calculateHealthScore, type FinancialHealthScore } from './strategy-detector'
import { genId } from './storage'
import { hasPortfolioData, getPortfolioScenarios } from './portfolio-bridge'

// ─── Core Types ──────────────────────────────────────────────────

export interface ScenarioModification {
  type: 'add_income' | 'remove_income' | 'modify_income' | 'change_entity' | 'add_deduction' | 'remove_deduction' | 'modify_deduction' | 'add_expense' | 'change_filing' | 'change_state'
  incomeId?: string
  incomeName?: string
  incomeType?: IncomeStream['type']
  incomeAmount?: number
  entityType?: LegalEntity['type']
  entityCost?: number
  deductionId?: string
  deductionName?: string
  deductionCategory?: Deduction['category']
  deductionAmount?: number
  expenseDesc?: string
  expenseAmount?: number
  expensePct?: number
  filingStatus?: string
  stateCode?: string
}

export interface ScenarioResult {
  name: string
  modifications: ScenarioModification[]
  taxReport: TaxReport
  healthScore: FinancialHealthScore
  state: FortunaState
}

export interface ScenarioComparison {
  baseline: ScenarioResult
  scenarios: ScenarioResult[]
}

// ─── Waterfall Breakdown ─────────────────────────────────────────

export interface WaterfallSegment {
  label: string
  amount: number
  cumulative: number
  type: 'income' | 'deduction' | 'tax' | 'net'
  color: string
}

export function generateWaterfall(report: TaxReport): WaterfallSegment[] {
  const segments: WaterfallSegment[] = []
  let cumulative = 0

  cumulative = report.grossIncome
  segments.push({ label: 'Gross Revenue', amount: report.grossIncome, cumulative, type: 'income', color: '#60a5fa' })

  const businessDeductions = report.grossIncome - report.agi
  if (businessDeductions > 0) {
    cumulative -= businessDeductions
    segments.push({ label: 'Business Expenses', amount: -businessDeductions, cumulative, type: 'deduction', color: '#f59e0b' })
  }

  const halfSE = report.selfEmploymentTax * 0.5
  if (halfSE > 0) {
    cumulative -= halfSE
    segments.push({ label: 'SE Tax Ded.', amount: -halfSE, cumulative, type: 'deduction', color: '#f59e0b' })
  }

  const personalDeductions = report.agi - report.taxableIncome - (report.qbiDeduction || 0) + halfSE
  if (personalDeductions > 0) {
    cumulative -= personalDeductions
    segments.push({ label: 'Std. Deduction', amount: -personalDeductions, cumulative, type: 'deduction', color: '#fbbf24' })
  }

  if (report.qbiDeduction > 0) {
    cumulative -= report.qbiDeduction
    segments.push({ label: 'QBI Deduction', amount: -report.qbiDeduction, cumulative, type: 'deduction', color: '#fbbf24' })
  }

  if (report.federalIncomeTax > 0) {
    cumulative -= report.federalIncomeTax
    segments.push({ label: 'Federal Tax', amount: -report.federalIncomeTax, cumulative, type: 'tax', color: '#ef4444' })
  }

  if (report.selfEmploymentTax > 0) {
    cumulative -= report.selfEmploymentTax
    segments.push({ label: 'SE Tax', amount: -report.selfEmploymentTax, cumulative, type: 'tax', color: '#dc2626' })
  }

  if (report.stateTax > 0) {
    cumulative -= report.stateTax
    segments.push({ label: 'State Tax', amount: -report.stateTax, cumulative, type: 'tax', color: '#b91c1c' })
  }

  segments.push({ label: 'You Keep', amount: report.afterTaxIncome, cumulative: report.afterTaxIncome, type: 'net', color: '#10b981' })

  return segments
}

// ─── Multi-Year Projections ──────────────────────────────────────

export interface ProjectionYear {
  year: number
  grossIncome: number
  totalTax: number
  afterTaxIncome: number
  effectiveRate: number
  cumulativeAfterTax: number
  cumulativeTax: number
  retirementBalance: number
}

export interface ProjectionConfig {
  years: number
  annualGrowthRate: number
  inflationRate: number
  retirementContribRate: number
  retirementReturnRate: number
}

export const DEFAULT_PROJECTION: ProjectionConfig = {
  years: 5,
  annualGrowthRate: 0.10,
  inflationRate: 0.03,
  retirementContribRate: 0.10,
  retirementReturnRate: 0.08,
}

export function projectMultiYear(
  baseState: FortunaState,
  mods: ScenarioModification[],
  config: ProjectionConfig = DEFAULT_PROJECTION
): ProjectionYear[] {
  const projections: ProjectionYear[] = []
  let cumulativeAfterTax = 0
  let cumulativeTax = 0
  let retirementBalance = 0
  const currentYear = new Date().getFullYear()

  for (let i = 0; i < config.years; i++) {
    const growthMultiplier = Math.pow(1 + config.annualGrowthRate, i)
    const yearState: FortunaState = JSON.parse(JSON.stringify(baseState))

    yearState.incomeStreams = yearState.incomeStreams.map(s => ({
      ...s,
      annualAmount: Math.round(s.annualAmount * growthMultiplier),
    }))

    const modifiedState = mods.length > 0 ? applyModifications(yearState, mods) : yearState
    const report = generateTaxReport(modifiedState)

    const retirementContrib = Math.round(report.grossIncome * config.retirementContribRate)
    retirementBalance = Math.round((retirementBalance + retirementContrib) * (1 + config.retirementReturnRate))

    cumulativeAfterTax += report.afterTaxIncome
    cumulativeTax += report.totalTax

    projections.push({
      year: currentYear + i,
      grossIncome: report.grossIncome,
      totalTax: report.totalTax,
      afterTaxIncome: report.afterTaxIncome,
      effectiveRate: report.effectiveRate,
      cumulativeAfterTax,
      cumulativeTax,
      retirementBalance,
    })
  }

  return projections
}

// ─── Reverse Calculator ──────────────────────────────────────────

export interface ReverseCalcResult {
  targetAfterTax: number
  requiredGrossIncome: number
  totalTaxAtTarget: number
  effectiveRateAtTarget: number
  marginalRateAtTarget: number
}

export function reverseCalculateIncome(
  baseState: FortunaState,
  targetAfterTax: number
): ReverseCalcResult {
  let low = targetAfterTax
  let high = targetAfterTax * 3
  let bestGuess = targetAfterTax
  let bestReport: TaxReport | null = null

  const testState: FortunaState = JSON.parse(JSON.stringify(baseState))
  const primaryType = testState.incomeStreams.find(s => s.isActive)?.type || 'business'
  testState.incomeStreams = [{ id: 'rc', name: 'Target', type: primaryType, annualAmount: high, isActive: true }]

  let testReport = generateTaxReport(testState)
  let iter = 0
  while (testReport.afterTaxIncome < targetAfterTax && iter < 10) {
    high *= 2
    testState.incomeStreams[0].annualAmount = high
    testReport = generateTaxReport(testState)
    iter++
  }

  while (high - low > 100 && iter < 60) {
    const mid = Math.round((low + high) / 2)
    testState.incomeStreams[0].annualAmount = mid
    testReport = generateTaxReport(testState)

    if (testReport.afterTaxIncome < targetAfterTax) {
      low = mid
    } else {
      high = mid
      bestGuess = mid
      bestReport = testReport
    }
    iter++
  }

  if (!bestReport) {
    testState.incomeStreams[0].annualAmount = bestGuess
    bestReport = generateTaxReport(testState)
  }

  return {
    targetAfterTax,
    requiredGrossIncome: bestGuess,
    totalTaxAtTarget: bestReport.totalTax,
    effectiveRateAtTarget: bestReport.effectiveRate,
    marginalRateAtTarget: bestReport.marginalRate,
  }
}

// ─── Income Sensitivity Curve ────────────────────────────────────

export interface SensitivityPoint {
  income: number
  totalTax: number
  afterTax: number
  effectiveRate: number
  marginalRate: number
  federalTax: number
  seTax: number
  stateTax: number
}

export function generateSensitivityCurve(
  baseState: FortunaState,
  incomeRange: { min: number; max: number },
  points: number = 25
): SensitivityPoint[] {
  const curve: SensitivityPoint[] = []
  const step = (incomeRange.max - incomeRange.min) / (points - 1)

  for (let i = 0; i < points; i++) {
    const income = Math.round(incomeRange.min + step * i)
    const testState: FortunaState = JSON.parse(JSON.stringify(baseState))

    const currentTotal = testState.incomeStreams.filter(s => s.isActive).reduce((s, inc) => s + inc.annualAmount, 0)
    if (currentTotal > 0) {
      const scale = income / currentTotal
      testState.incomeStreams = testState.incomeStreams.map(s => ({
        ...s,
        annualAmount: s.isActive ? Math.round(s.annualAmount * scale) : s.annualAmount,
      }))
    } else {
      testState.incomeStreams = [{ id: 'sens', name: 'Income', type: 'business', annualAmount: income, isActive: true }]
    }

    const report = generateTaxReport(testState)
    curve.push({
      income,
      totalTax: report.totalTax,
      afterTax: report.afterTaxIncome,
      effectiveRate: report.effectiveRate,
      marginalRate: report.marginalRate,
      federalTax: report.federalIncomeTax,
      seTax: report.selfEmploymentTax,
      stateTax: report.stateTax,
    })
  }

  return curve
}

// ─── Apply Modifications ─────────────────────────────────────────

export function applyModifications(baseState: FortunaState, mods: ScenarioModification[]): FortunaState {
  const state: FortunaState = JSON.parse(JSON.stringify(baseState))

  for (const mod of mods) {
    switch (mod.type) {
      case 'add_income':
        state.incomeStreams.push({
          id: genId(), name: mod.incomeName || 'New Income',
          type: mod.incomeType || 'business', annualAmount: mod.incomeAmount || 0, isActive: true,
        })
        break
      case 'remove_income':
        state.incomeStreams = state.incomeStreams.filter(s => s.id !== mod.incomeId)
        break
      case 'modify_income':
        state.incomeStreams = state.incomeStreams.map(s =>
          s.id === mod.incomeId ? { ...s, annualAmount: mod.incomeAmount ?? s.annualAmount, name: mod.incomeName ?? s.name } : s
        )
        break
      case 'change_entity': {
        const entityName = mod.entityType === 'sole_prop' ? 'Sole Proprietorship'
          : mod.entityType === 'llc' ? 'Business LLC'
          : mod.entityType === 'llc_scorp' ? 'Business LLC (S-Corp)'
          : mod.entityType === 'scorp' ? 'S-Corporation'
          : mod.entityType === 'ccorp' ? 'C-Corporation' : 'Entity'
        const newEntityId = genId()
        state.entities = mod.entityType === 'sole_prop' ? [] : [{
          id: newEntityId, name: entityName, type: mod.entityType || 'llc',
          state: state.profile.state,
          annualCost: mod.entityCost ?? (mod.entityType === 'llc_scorp' ? 2000 : mod.entityType === 'llc' ? 300 : mod.entityType === 'ccorp' ? 5000 : 0),
          isActive: true,
        }]
        // Reassign business/freelance income to new entity
        if (mod.entityType !== 'sole_prop') {
          state.incomeStreams = state.incomeStreams.map(s =>
            ['business', 'freelance'].includes(s.type) && s.isActive
              ? { ...s, entityId: newEntityId } : s
          )
          // Reassign business expenses to new entity
          state.expenses = state.expenses.map(e =>
            e.isDeductible ? { ...e, entityId: newEntityId } : e
          )
          // Set S-Corp officer salary if applicable
          if ((mod.entityType === 'llc_scorp' || mod.entityType === 'scorp') && state.incomeStreams.length > 0) {
            const bizIncome = state.incomeStreams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
              .reduce((sum, s) => sum + s.annualAmount, 0)
            state.incomeStreams = state.incomeStreams.map(s =>
              s.entityId === newEntityId ? { ...s, scorp: { officerSalary: Math.round(bizIncome * 0.6), distributions: Math.round(bizIncome * 0.4) } } : s
            )
          }
        } else {
          // Revert to personal
          state.incomeStreams = state.incomeStreams.map(s => ({ ...s, entityId: 'personal' }))
          state.expenses = state.expenses.map(e => ({ ...e, entityId: 'personal' }))
        }
        break
      }
      case 'add_deduction':
        state.deductions.push({
          id: genId(), name: mod.deductionName || 'New Deduction',
          category: mod.deductionCategory || 'business', amount: mod.deductionAmount || 0, isItemized: false,
        })
        break
      case 'remove_deduction':
        state.deductions = state.deductions.filter(d => d.id !== mod.deductionId)
        break
      case 'modify_deduction':
        state.deductions = state.deductions.map(d =>
          d.id === mod.deductionId ? { ...d, amount: mod.deductionAmount ?? d.amount } : d
        )
        break
      case 'add_expense':
        state.expenses.push({
          id: genId(), category: 'business', description: mod.expenseDesc || 'New Expense',
          annualAmount: mod.expenseAmount || 0, isDeductible: true, deductionPct: mod.expensePct ?? 100,
        })
        break
      case 'change_filing':
        if (mod.filingStatus) state.profile.filingStatus = mod.filingStatus as any
        break
      case 'change_state':
        if (mod.stateCode) state.profile.state = mod.stateCode
        break
    }
  }
  return state
}

// ─── Evaluate & Compare ──────────────────────────────────────────

export function evaluateScenario(name: string, baseState: FortunaState, mods: ScenarioModification[]): ScenarioResult {
  const modifiedState = applyModifications(baseState, mods)
  const taxReport = generateTaxReport(modifiedState)
  const healthScore = calculateHealthScore(modifiedState)
  return { name, modifications: mods, taxReport, healthScore, state: modifiedState }
}

export function compareScenarios(
  baseState: FortunaState,
  scenarios: { name: string; mods: ScenarioModification[] }[]
): ScenarioComparison {
  const baseline = evaluateScenario('Current Situation', baseState, [])
  const evaluated = scenarios.map(s => evaluateScenario(s.name, baseState, s.mods))
  return { baseline, scenarios: evaluated }
}

// ─── Smart Scenarios ─────────────────────────────────────────────

export function generateSmartScenarios(baseState: FortunaState): { name: string; mods: ScenarioModification[]; description: string; icon: string }[] {
  const scenarios: { name: string; mods: ScenarioModification[]; description: string; icon: string }[] = []
  const report = generateTaxReport(baseState)
  const hasScorp = baseState.entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  const netSE = baseState.incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  if (!hasScorp && netSE > 40000) {
    scenarios.push({ name: 'S-Corp Election', description: 'Elect S-Corp status to reduce SE tax.', mods: [{ type: 'change_entity', entityType: 'llc_scorp', entityCost: 2000 }], icon: '🏛️' })
  }

  const maxSEP = calculateMaxSEPIRA(netSE)
  const currentRetirement = baseState.deductions.filter(d => d.category === 'retirement').reduce((s, d) => s + d.amount, 0)
  if (maxSEP - currentRetirement > 5000) {
    scenarios.push({ name: 'Max Retirement', description: `Max SEP-IRA to $${maxSEP.toLocaleString()}.`, mods: [{ type: 'add_deduction', deductionName: 'SEP-IRA Max', deductionCategory: 'retirement', deductionAmount: maxSEP - currentRetirement }], icon: '🏦' })
  }

  if (!hasScorp && netSE > 50000 && maxSEP - currentRetirement > 5000) {
    scenarios.push({ name: 'S-Corp + Retirement', description: 'Entity restructure + maxed contributions.', mods: [{ type: 'change_entity', entityType: 'llc_scorp', entityCost: 2000 }, { type: 'add_deduction', deductionName: 'SEP-IRA Max', deductionCategory: 'retirement', deductionAmount: maxSEP - currentRetirement }], icon: '⚡' })
  }

  if (netSE > 0) {
    const add = Math.round(netSE * 0.4)
    scenarios.push({ name: `+$${(add / 1000).toFixed(0)}k Revenue`, description: `Add $${add.toLocaleString()} consulting revenue.`, mods: [{ type: 'add_income', incomeName: 'AI Consulting', incomeType: 'business', incomeAmount: add }], icon: '📈' })
  }

  if (!hasScorp && netSE > 50000) {
    const add = Math.round(netSE * 0.4)
    scenarios.push({ name: 'Full Optimization', description: `S-Corp + Retirement + $${(add / 1000).toFixed(0)}k revenue.`, mods: [{ type: 'change_entity', entityType: 'llc_scorp', entityCost: 2000 }, { type: 'add_deduction', deductionName: 'SEP-IRA Max', deductionCategory: 'retirement', deductionAmount: maxSEP - currentRetirement }, { type: 'add_income', incomeName: 'AI Consulting', incomeType: 'business', incomeAmount: add }], icon: '🚀' })
  }

  const stateTaxRate = report.stateTax / Math.max(1, report.taxableIncome)
  if (stateTaxRate > 0.04 && report.stateTax > 3000) {
    scenarios.push({ name: 'No-Tax State', description: `Relocate to save $${report.stateTax.toLocaleString()}/yr.`, mods: [{ type: 'change_state', stateCode: 'TX' }], icon: '🗺️' })
  }

  // ── Portfolio Intelligence scenarios ────────────────────────────
  if (hasPortfolioData()) {
    const portfolioScens = getPortfolioScenarios()
    for (const ps of portfolioScens) {
      const mods: ScenarioModification[] = []
      if (ps.additionalIncome > 0) {
        mods.push({ type: 'add_income', incomeName: ps.name, incomeType: 'investment', incomeAmount: ps.additionalIncome })
      }
      if (ps.additionalDeduction > 0) {
        mods.push({ type: 'add_deduction', deductionName: `${ps.name} (loss offset)`, deductionCategory: 'other', deductionAmount: ps.additionalDeduction })
      }
      if (ps.capitalGains.shortTerm > 0 && ps.additionalIncome === 0) {
        mods.push({ type: 'add_income', incomeName: `${ps.name} (ST gains)`, incomeType: 'investment', incomeAmount: ps.capitalGains.shortTerm })
      }
      if (ps.capitalGains.longTerm > 0 && ps.additionalIncome === 0) {
        mods.push({ type: 'add_income', incomeName: `${ps.name} (LT gains)`, incomeType: 'investment', incomeAmount: ps.capitalGains.longTerm })
      }
      if (mods.length > 0) {
        scenarios.push({ name: ps.name, description: ps.description, mods, icon: ps.icon })
      }
    }
  }

  return scenarios
}

// ==================== Batch Scenario Comparison Matrix ====================
// Evaluate multiple scenarios simultaneously for side-by-side comparison.

export interface ScenarioComparisonRow {
  scenarioName: string
  scenarioIcon: string
  // Tax impact
  totalTax: number
  effectiveRate: number
  taxDelta: number // vs baseline
  taxDeltaPct: number
  // Income
  grossIncome: number
  afterTaxIncome: number
  // SE / Payroll
  selfEmploymentTax: number
  // Components
  federalTax: number
  stateTax: number
  amt: number
  niit: number
  // Health & risk
  healthScoreEstimate: number // simple estimate
  auditRiskEstimate: 'low' | 'medium' | 'high'
  // Meta
  modifications: string[]
  recommendation: string
}

export interface ScenarioMatrix {
  baseline: ScenarioComparisonRow
  scenarios: ScenarioComparisonRow[]
  bestScenario: string
  worstScenario: string
  maxSavings: number
  insights: string[]
}

/** Evaluate multiple scenarios in batch, returning a comparison matrix */
export function compareScenariosBatch(
  state: FortunaState,
  scenarios: ScenarioTemplate[],
  maxScenarios: number = 8,
): ScenarioMatrix {
  const baseReport = generateTaxReport(state)

  // Build baseline row
  const baseline: ScenarioComparisonRow = {
    scenarioName: 'Current (Baseline)',
    scenarioIcon: '📊',
    totalTax: baseReport.totalTax,
    effectiveRate: baseReport.effectiveRate,
    taxDelta: 0,
    taxDeltaPct: 0,
    grossIncome: baseReport.grossIncome,
    afterTaxIncome: baseReport.afterTaxIncome,
    selfEmploymentTax: baseReport.selfEmploymentTax,
    federalTax: baseReport.federalIncomeTax,
    stateTax: baseReport.stateTax,
    amt: baseReport.amt,
    niit: baseReport.niit,
    healthScoreEstimate: 50,
    auditRiskEstimate: 'low',
    modifications: [],
    recommendation: 'Current position',
  }

  const rows: ScenarioComparisonRow[] = []

  for (const template of scenarios.slice(0, maxScenarios)) {
    const result = evaluateScenario(template.name, state, template.mods)
    const rpt = result.taxReport

    const delta = rpt.totalTax - baseReport.totalTax
    const deltaPct = baseReport.totalTax > 0 ? delta / baseReport.totalTax : 0

    // Estimate health score impact
    let healthEstimate = 50
    if (delta < -5000) healthEstimate += 15 // significant savings
    if (rpt.effectiveRate < baseReport.effectiveRate) healthEstimate += 10
    if (rpt.afterTaxIncome > baseReport.afterTaxIncome) healthEstimate += 10
    healthEstimate = Math.min(100, Math.max(0, healthEstimate))

    // Estimate audit risk
    const auditRisk: 'low' | 'medium' | 'high' =
      template.mods.some(m => m.type === 'change_entity') && Math.abs(delta) > 20000
        ? 'medium'
        : Math.abs(delta) > 50000 ? 'high' : 'low'

    const savings = -delta
    rows.push({
      scenarioName: template.name,
      scenarioIcon: template.icon,
      totalTax: rpt.totalTax,
      effectiveRate: rpt.effectiveRate,
      taxDelta: delta,
      taxDeltaPct: deltaPct,
      grossIncome: rpt.grossIncome,
      afterTaxIncome: rpt.afterTaxIncome,
      selfEmploymentTax: rpt.selfEmploymentTax,
      federalTax: rpt.federalIncomeTax,
      stateTax: rpt.stateTax,
      amt: rpt.amt,
      niit: rpt.niit,
      healthScoreEstimate: healthEstimate,
      auditRiskEstimate: auditRisk,
      modifications: template.mods.map(m => `${m.type}${m.type.includes('income') ? `: $${(m as any).incomeAmount?.toLocaleString() || ''}` : ''}`),
      recommendation: savings > 10000
        ? `Save $${savings.toLocaleString()}/year — high priority`
        : savings > 3000
          ? `Save $${savings.toLocaleString()}/year — moderate priority`
          : savings > 0
            ? `Marginal savings of $${savings.toLocaleString()}`
            : `Increases tax by $${Math.abs(savings).toLocaleString()}`,
    })
  }

  // Sort by tax delta (most savings first)
  rows.sort((a, b) => a.taxDelta - b.taxDelta)

  const bestScenario = rows.length > 0 && rows[0].taxDelta < 0 ? rows[0].scenarioName : 'Current (Baseline)'
  const worstScenario = rows.length > 0 ? rows[rows.length - 1].scenarioName : 'Current (Baseline)'
  const maxSavings = rows.length > 0 ? Math.max(0, -rows[0].taxDelta) : 0

  // Generate insights
  const insights: string[] = []
  if (maxSavings > 10000) insights.push(`Best scenario saves $${maxSavings.toLocaleString()}/year (${rows[0].scenarioName})`)
  const entityScenarios = rows.filter(r => r.modifications.some(m => m.includes('change_entity')))
  if (entityScenarios.length > 0 && entityScenarios[0].taxDelta < -5000) {
    insights.push(`Entity restructuring yields the biggest wins — ${entityScenarios[0].scenarioName} saves $${Math.abs(entityScenarios[0].taxDelta).toLocaleString()}`)
  }
  const combinedScenarios = rows.filter(r => r.modifications.length > 1)
  if (combinedScenarios.length > 0 && combinedScenarios[0].taxDelta < -8000) {
    insights.push(`Combined strategies outperform single changes — ${combinedScenarios[0].scenarioName}`)
  }
  if (rows.some(r => r.auditRiskEstimate === 'high')) {
    insights.push('⚠️ Some aggressive scenarios may increase IRS scrutiny — review with CPA')
  }

  return {
    baseline,
    scenarios: rows,
    bestScenario,
    worstScenario,
    maxSavings,
    insights,
  }
}
