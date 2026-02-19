/**
 * Fortuna Engine — Unified Intelligence Layer v9.1
 *
 * Chains all engines together to produce composite recommendations
 * that no single engine can detect independently. This is the "brain"
 * that makes every module smarter by context-sharing.
 *
 * Pipeline: Tax → Entity → Retirement → Credits → Depreciation →
 *           Multi-Year → State Arbitrage → Audit Risk → Health
 *
 * Outputs cross-engine "nexus insights" — compound recommendations
 * that reference multiple modules simultaneously.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'
import { detectStrategies, analyzeRisks, calculateHealthScore, type Strategy } from './strategy-detector'
import { compareRetirementVehicles, type RetirementComparison } from './retirement-optimizer'
import { analyzeTaxCredits, type TaxCreditSummary } from './tax-credits'
import { runMultiYearAnalysis, type MultiYearAnalysis } from './multi-year-tax'
import { generateDepreciationSummary, type DepreciationSummary } from './depreciation-engine'
import { optimizeEntities, type EntityOptimizerResult } from './entity-optimizer'
import { analyzeAuditRisk, type AuditRiskProfile } from './audit-risk'
import { generateHealthReport, type FinancialHealthReport } from './health-score'
import { generateProactiveAlerts, type ProactiveAlert } from './proactive-intelligence'
import { hasPortfolioData, computePortfolioSummary, getPortfolioTaxIncome } from './portfolio-bridge'

// ===================================================================
//  TYPES
// ===================================================================

export interface NexusInsight {
  id: string
  title: string
  description: string
  engines: string[] // which engines contributed
  impact: number // estimated dollar impact
  priority: 'critical' | 'high' | 'medium' | 'low'
  category: 'compound_savings' | 'timing' | 'structural' | 'risk_mitigation' | 'growth'
  actions: NexusAction[]
  reasoning: string
}

export interface NexusAction {
  label: string
  view: string // ViewKey to navigate to
  detail: string
}

export interface UnifiedIntelligence {
  // Raw engine outputs (cached for AI advisor)
  taxReport: TaxReport
  strategies: Strategy[]
  retirement: RetirementComparison
  credits: TaxCreditSummary
  multiYear: MultiYearAnalysis
  depreciation: DepreciationSummary
  entityOpt: EntityOptimizerResult
  auditRisk: AuditRiskProfile
  healthReport: FinancialHealthReport
  alerts: ProactiveAlert[]

  // Cross-engine synthesis
  nexusInsights: NexusInsight[]
  totalCompoundSavings: number
  topPriorityAction: NexusAction | null

  // Summary metrics
  enginesCrossReferenced: number
  insightsGenerated: number
  computedAt: string
}

// ===================================================================
//  NEXUS DETECTION — Cross-Engine Insight Generators
// ===================================================================

function detectRetirementCreditNexus(
  tax: TaxReport,
  credits: TaxCreditSummary,
  retirement: RetirementComparison,
  state: FortunaState,
): NexusInsight | null {
  // If retirement contributions could reduce AGI enough to unlock credits
  const saversCredit = credits.credits.find(c => c.id === 'savers')
  const eitc = credits.credits.find(c => c.id === 'eitc')

  if (tax.retirementGap > 5000) {
    // Check if maxing retirement unlocks Saver's Credit
    if (saversCredit && !saversCredit.eligible) {
      const agiAfterRetirement = tax.agi - tax.retirementGap
      const threshold = state.profile.filingStatus === 'married_joint' ? 76500 : 38250
      if (agiAfterRetirement <= threshold) {
        const creditGain = Math.min(2000, Math.round(Math.min(tax.retirementGap, 2000) * 0.10))
        const taxSaved = Math.round(tax.retirementGap * tax.marginalRate)
        const total = creditGain + taxSaved

        return {
          id: 'retirement-credit-nexus',
          title: 'Retirement + Credit Double Benefit',
          description: `Contributing $${tax.retirementGap.toLocaleString()} to retirement saves $${taxSaved.toLocaleString()} in taxes AND unlocks the Saver's Credit worth up to $${creditGain.toLocaleString()}.`,
          engines: ['tax-calculator', 'retirement-optimizer', 'tax-credits'],
          impact: total,
          priority: 'high',
          category: 'compound_savings',
          actions: [
            { label: 'Retirement Options', view: 'retirement', detail: 'Compare SEP-IRA vs Solo 401(k) contribution limits' },
            { label: 'Credit Details', view: 'credits', detail: 'View Saver\'s Credit eligibility requirements' },
          ],
          reasoning: `Your AGI of $${tax.agi.toLocaleString()} is above the Saver's Credit threshold of $${threshold.toLocaleString()}. Contributing $${tax.retirementGap.toLocaleString()} to retirement drops AGI to $${agiAfterRetirement.toLocaleString()}, unlocking the credit while also generating a ${(tax.marginalRate * 100).toFixed(0)}% deduction.`,
        }
      }
    }
  }
  return null
}

function detectDepreciationTimingNexus(
  tax: TaxReport,
  multiYear: MultiYearAnalysis,
  depreciation: DepreciationSummary,
): NexusInsight | null {
  // If high-bracket year AND bonus depreciation phasing down — buy now
  const currentYear = new Date().getFullYear()
  const baseline = multiYear.baseline

  if (baseline.length < 2) return null

  const thisYear = baseline[0]
  const nextYear = baseline[1]
  const bonusRate = depreciation.bonusDepreciationRate

  if (thisYear.marginalRate >= 0.24 && bonusRate > (depreciation.bonusDepreciationRate - 0.20)) {
    const examplePurchase = 50000
    const thisYearDeduction = Math.round(examplePurchase * Math.min(1, bonusRate + 0.20)) // 179 + bonus
    const nextYearDeduction = Math.round(examplePurchase * Math.max(0, bonusRate - 0.20 + 0.20))
    const savingsDiff = Math.round((thisYearDeduction - nextYearDeduction) * thisYear.marginalRate)

    if (savingsDiff > 1000) {
      return {
        id: 'depreciation-timing-nexus',
        title: 'Asset Purchase Timing Advantage',
        description: `Buying $50K in equipment THIS year saves $${savingsDiff.toLocaleString()} more than waiting. Your ${(thisYear.marginalRate * 100).toFixed(0)}% bracket + ${(bonusRate * 100).toFixed(0)}% bonus depreciation is a shrinking window.`,
        engines: ['depreciation-engine', 'multi-year-tax', 'tax-calculator'],
        impact: savingsDiff,
        priority: thisYear.marginalRate >= 0.32 ? 'high' : 'medium',
        category: 'timing',
        actions: [
          { label: 'Calculate Depreciation', view: 'depreciation', detail: 'Model specific asset purchases with §179 and bonus' },
          { label: 'Multi-Year Impact', view: 'multiyear', detail: 'See how purchases affect your 5-year projection' },
        ],
        reasoning: `Current bonus depreciation at ${(bonusRate * 100).toFixed(0)}% drops next year. Combined with your ${(thisYear.marginalRate * 100).toFixed(0)}% marginal rate, each dollar of depreciation saves $${thisYear.marginalRate.toFixed(2)} now vs potentially less later.`,
      }
    }
  }
  return null
}

function detectEntityTaxCreditNexus(
  tax: TaxReport,
  entityOpt: EntityOptimizerResult,
  credits: TaxCreditSummary,
  state: FortunaState,
): NexusInsight | null {
  // R&D credit + S-Corp conversion = compound benefit
  const rdCredit = credits.credits.find(c => c.id === 'rd_credit')
  const hasBusinessIncome = state.incomeStreams.some(s =>
    ['business', 'freelance'].includes(s.type) && s.isActive
  )

  if (rdCredit?.eligible && hasBusinessIncome && tax.sCorpSavings > 3000) {
    const rdEstimate = state.expenses
      .filter(e => e.isDeductible && (
        e.category.toLowerCase().includes('software') ||
        e.category.toLowerCase().includes('development') ||
        e.category.toLowerCase().includes('contractor')
      ))
      .reduce((s, e) => s + e.annualAmount, 0) * 0.14

    if (rdEstimate > 1000) {
      const total = Math.round(tax.sCorpSavings + rdEstimate)
      return {
        id: 'entity-credit-nexus',
        title: 'S-Corp + R&D Credit Stack',
        description: `Converting to S-Corp saves $${tax.sCorpSavings.toLocaleString()} in SE tax, PLUS you can claim ~$${Math.round(rdEstimate).toLocaleString()} R&D credit on development expenses. Combined: $${total.toLocaleString()}/year.`,
        engines: ['entity-optimizer', 'tax-credits', 'tax-calculator'],
        impact: total,
        priority: 'critical',
        category: 'structural',
        actions: [
          { label: 'Entity Optimizer', view: 'optimizer', detail: 'Calculate optimal salary vs distribution split' },
          { label: 'R&D Credit Details', view: 'credits', detail: 'See R&D credit requirements and calculation' },
          { label: 'Formation Checklist', view: 'taxdocs', detail: 'Get S-Corp formation steps and timeline' },
        ],
        reasoning: `S-Corp election eliminates SE tax on distributions (saving $${tax.sCorpSavings.toLocaleString()}). The R&D credit applies to your development expenses as a separate dollar-for-dollar tax reduction. These stack — one reduces payroll tax, the other reduces income tax.`,
      }
    }
  }
  return null
}

function detectTCJARetirementNexus(
  multiYear: MultiYearAnalysis,
  retirement: RetirementComparison,
  tax: TaxReport,
): NexusInsight | null {
  // If TCJA sunset is within projection window AND retirement gap exists — front-load
  const sunsetYear = multiYear.baseline.find(y => y.bracketRegime === 'pre_tcja')
  if (!sunsetYear || tax.retirementGap <= 0) return null

  const yearsUntilSunset = sunsetYear.year - new Date().getFullYear()
  const totalFrontLoad = Math.round(tax.retirementGap * yearsUntilSunset)
  const currentRateSavings = Math.round(totalFrontLoad * tax.marginalRate)
  const postSunsetRate = sunsetYear.marginalRate
  const rateGap = postSunsetRate - tax.marginalRate

  if (rateGap > 0.02) {
    const additionalSavings = Math.round(totalFrontLoad * rateGap)
    return {
      id: 'tcja-retirement-nexus',
      title: 'Front-Load Retirement Before TCJA Sunset',
      description: `${yearsUntilSunset} years until bracket increases. Maxing retirement contributions now deducts at ${(tax.marginalRate * 100).toFixed(0)}% — after sunset, rates jump to ${(postSunsetRate * 100).toFixed(0)}%. Front-loading saves an extra $${additionalSavings.toLocaleString()}.`,
      engines: ['multi-year-tax', 'retirement-optimizer', 'tax-calculator'],
      impact: additionalSavings,
      priority: 'high',
      category: 'timing',
      actions: [
        { label: 'Multi-Year Projection', view: 'multiyear', detail: 'See TCJA sunset impact on your rates' },
        { label: 'Retirement Vehicles', view: 'retirement', detail: 'Compare contribution limits and vehicles' },
      ],
      reasoning: `Each $1 deducted pre-sunset saves ${(tax.marginalRate * 100).toFixed(0)}¢. Post-sunset, the same deduction saves ${(postSunsetRate * 100).toFixed(0)}¢ — but you've already locked in the higher-value deduction. Over ${yearsUntilSunset} years, the rate differential on $${totalFrontLoad.toLocaleString()} in contributions yields $${additionalSavings.toLocaleString()} extra savings.`,
    }
  }
  return null
}

function detectAuditProtectionNexus(
  audit: AuditRiskProfile,
  tax: TaxReport,
  depreciation: DepreciationSummary,
  state: FortunaState,
): NexusInsight | null {
  // High audit risk + large deductions = documentation nexus
  const riskLevel = audit.riskLevel
  const totalDeductions = state.deductions.reduce((s, d) => s + d.amount, 0) +
    state.expenses.filter(e => e.isDeductible).reduce((s, e) => s + e.annualAmount * e.deductionPct / 100, 0)
  const deductionRatio = tax.grossIncome > 0 ? totalDeductions / tax.grossIncome : 0

  if ((riskLevel === 'high' || riskLevel === 'elevated') && deductionRatio > 0.3) {
    return {
      id: 'audit-protection-nexus',
      title: 'Audit Risk × Deduction Documentation',
      description: `Your audit risk is ${riskLevel} with a ${(deductionRatio * 100).toFixed(0)}% deduction-to-income ratio. Documenting $${totalDeductions.toLocaleString()} in deductions NOW protects $${Math.round(totalDeductions * tax.marginalRate).toLocaleString()} in tax savings.`,
      engines: ['audit-risk', 'tax-calculator', 'depreciation-engine'],
      impact: Math.round(totalDeductions * tax.marginalRate),
      priority: 'high',
      category: 'risk_mitigation',
      actions: [
        { label: 'Audit Profile', view: 'audit', detail: 'Review red flags and mitigation strategies' },
        { label: 'Audit Documentation', view: 'taxdocs', detail: 'Generate documentation checklists' },
        { label: 'CPA Export', view: 'cpa', detail: 'Prepare CPA-ready documentation package' },
      ],
      reasoning: `The IRS flags returns with high deduction ratios for examination. Your ${(deductionRatio * 100).toFixed(0)}% ratio exceeds the typical threshold. Proactive documentation doesn't reduce deductions — it protects them. Every undocumented deduction is a potential disallowance.`,
    }
  }
  return null
}

function detectStateArbitrageEntityNexus(
  state: FortunaState,
  tax: TaxReport,
  entityOpt: EntityOptimizerResult,
): NexusInsight | null {
  // If state tax is high AND entity restructuring could help
  const stateRate = tax.stateTax / (tax.grossIncome || 1)
  if (stateRate < 0.04 || tax.grossIncome < 50000) return null

  const noTaxStates = ['FL', 'TX', 'NV', 'WY', 'SD', 'AK', 'WA', 'NH', 'TN']
  if (noTaxStates.includes(state.profile.state)) return null

  const stateSavings = tax.stateTax
  const sCorpSavings = tax.sCorpSavings
  const combined = stateSavings + sCorpSavings

  if (combined > 5000) {
    return {
      id: 'state-entity-nexus',
      title: 'Relocation + Entity Restructuring Stack',
      description: `Relocating to a no-income-tax state saves $${stateSavings.toLocaleString()}/yr. Combined with S-Corp election savings of $${sCorpSavings.toLocaleString()}/yr, total optimization: $${combined.toLocaleString()}/yr.`,
      engines: ['state-arbitrage', 'entity-optimizer', 'tax-calculator'],
      impact: combined,
      priority: combined > 15000 ? 'critical' : 'high',
      category: 'structural',
      actions: [
        { label: 'State Comparison', view: 'arbitrage', detail: 'Compare total tax burden by state' },
        { label: 'Entity Optimizer', view: 'optimizer', detail: 'Model S-Corp conversion at new location' },
        { label: 'Scenario Modeler', view: 'scenarios', detail: 'Model combined relocation + entity change' },
      ],
      reasoning: `You're paying ${(stateRate * 100).toFixed(1)}% state tax ($${stateSavings.toLocaleString()}) that's avoidable in 9 states. Entity restructuring provides additional savings independent of location. Together, these represent the largest structural optimization available.`,
    }
  }
  return null
}

function detectIncomeGrowthBracketNexus(
  multiYear: MultiYearAnalysis,
  strategies: Strategy[],
): NexusInsight | null {
  const baseline = multiYear.baseline
  if (baseline.length < 3) return null

  // Check if growth trajectory pushes into new bracket
  const current = baseline[0]
  const future = baseline[2] // 2 years out

  if (future.marginalRate > current.marginalRate && future.marginalRate >= 0.32) {
    const bracketJump = future.marginalRate - current.marginalRate
    const incomeGrowth = future.grossIncome - current.grossIncome

    return {
      id: 'growth-bracket-nexus',
      title: 'Income Growth → Bracket Jump Warning',
      description: `Projected growth pushes you from ${(current.marginalRate * 100).toFixed(0)}% to ${(future.marginalRate * 100).toFixed(0)}% by ${future.year}. Proactive strategies can shield $${incomeGrowth.toLocaleString()} in new income from the higher rate.`,
      engines: ['multi-year-tax', 'strategy-detector', 'retirement-optimizer'],
      impact: Math.round(incomeGrowth * bracketJump),
      priority: 'medium',
      category: 'growth',
      actions: [
        { label: 'Multi-Year View', view: 'multiyear', detail: 'Income shifting scenarios to smooth bracket exposure' },
        { label: 'Strategies', view: 'tax', detail: 'Tax strategies for high-growth periods' },
        { label: 'Retirement', view: 'retirement', detail: 'Max contributions to offset growing income' },
      ],
      reasoning: `Revenue growth of ~$${incomeGrowth.toLocaleString()} over 2 years crosses into the ${(future.marginalRate * 100).toFixed(0)}% bracket. Without intervention, the marginal tax on that growth is ${(future.marginalRate * 100).toFixed(0)}¢ per dollar. Retirement contributions, income deferral, and entity restructuring can keep more income at the current ${(current.marginalRate * 100).toFixed(0)}% rate.`,
    }
  }
  return null
}

// ===================================================================
//  MAIN INTELLIGENCE PIPELINE
// ===================================================================

export function runUnifiedIntelligence(state: FortunaState): UnifiedIntelligence {
  // ── Phase 1: Run all engines ──
  const taxReport = generateTaxReport(state)
  const strategies = detectStrategies(state)
  const retirement = compareRetirementVehicles(state)
  const credits = analyzeTaxCredits(state)
  const multiYear = runMultiYearAnalysis(state, 5)
  const depreciation = generateDepreciationSummary(state)
  const entityOpt = optimizeEntities(state)
  const auditRisk = analyzeAuditRisk(state)
  const healthReport = generateHealthReport(state)
  const alerts = generateProactiveAlerts(state)

  // ── Phase 2: Cross-engine nexus detection ──
  const nexusInsights: NexusInsight[] = []

  const n1 = detectRetirementCreditNexus(taxReport, credits, retirement, state)
  if (n1) nexusInsights.push(n1)

  const n2 = detectDepreciationTimingNexus(taxReport, multiYear, depreciation)
  if (n2) nexusInsights.push(n2)

  const n3 = detectEntityTaxCreditNexus(taxReport, entityOpt, credits, state)
  if (n3) nexusInsights.push(n3)

  const n4 = detectTCJARetirementNexus(multiYear, retirement, taxReport)
  if (n4) nexusInsights.push(n4)

  const n5 = detectAuditProtectionNexus(auditRisk, taxReport, depreciation, state)
  if (n5) nexusInsights.push(n5)

  const n6 = detectStateArbitrageEntityNexus(state, taxReport, entityOpt)
  if (n6) nexusInsights.push(n6)

  const n7 = detectIncomeGrowthBracketNexus(multiYear, strategies)
  if (n7) nexusInsights.push(n7)

  // ── Portfolio Intelligence nexus insights ────────────────────────
  if (hasPortfolioData()) {
    const ps = computePortfolioSummary()
    const ptx = getPortfolioTaxIncome(state.profile.state)

    // Portfolio gains + Retirement contributions = bracket optimization
    if (ptx.shortTermCapGains > 5000 && taxReport.retirementGap > 5000) {
      const retirementOffset = Math.min(taxReport.retirementGap, ptx.shortTermCapGains)
      const savings = Math.round(retirementOffset * taxReport.marginalRate)
      nexusInsights.push({
        id: 'portfolio-retirement-bracket',
        title: 'Capital Gains + Retirement Contribution Offset',
        description: `$${ptx.shortTermCapGains.toLocaleString()} in short-term capital gains can be offset by increasing retirement contributions by $${retirementOffset.toLocaleString()}, reducing taxable income and saving ~$${savings.toLocaleString()}.`,
        engines: ['Portfolio Intelligence', 'Retirement Optimizer', 'Tax Calculator'],
        impact: savings,
        priority: savings > 3000 ? 'critical' : 'high',
        category: 'compound_savings',
        actions: [
          { label: 'View portfolio positions', view: 'portfolio', detail: 'Review capital gains exposure' },
          { label: 'Optimize retirement', view: 'retirement', detail: `Increase contributions by $${retirementOffset.toLocaleString()}` },
        ],
        reasoning: `Short-term capital gains are taxed at ordinary rates (${(taxReport.marginalRate * 100).toFixed(0)}%). Retirement contributions reduce AGI, effectively sheltering gain income from tax.`,
      })
    }

    // Staking/mining income + Entity structure = SE tax avoidance
    if (ps.stakingRewards + ps.miningIncome > 10000 && entityOpt.scenarios.length > 1) {
      const seIncome = ps.stakingRewards + ps.miningIncome
      const seSavings = Math.round(seIncome * 0.153 * 0.4) // ~40% SE tax reduction via S-Corp
      nexusInsights.push({
        id: 'portfolio-entity-staking',
        title: 'Staking Income + Entity Structure Optimization',
        description: `$${seIncome.toLocaleString()}/yr in staking/mining income may be subject to 15.3% SE tax. Structuring through S-Corp election could save ~$${seSavings.toLocaleString()}/yr.`,
        engines: ['Portfolio Intelligence', 'Entity Optimizer', 'Tax Calculator'],
        impact: seSavings,
        priority: seSavings > 2000 ? 'high' : 'medium',
        category: 'structural',
        actions: [
          { label: 'Review staking income', view: 'portfolio', detail: 'Track staking rewards and mining income' },
          { label: 'Entity optimization', view: 'optimizer', detail: 'Evaluate S-Corp election for crypto income' },
        ],
        reasoning: 'Crypto staking/mining income treatment varies by jurisdiction. If classified as SE income, entity structuring can significantly reduce the tax burden.',
      })
    }

    // Tax-loss harvesting + Multi-year projection = strategic loss timing
    if (ps.harvestCandidates.length > 0 && multiYear.baseline.length > 1) {
      const harvestTotal = ps.harvestCandidates.reduce((s, c) => s + c.loss, 0)
      const currentYearRate = taxReport.marginalRate
      const nextYearRate = multiYear.baseline[1]?.effectiveRate || currentYearRate
      const betterYear = nextYearRate > currentYearRate ? 'next year' : 'this year'
      const savings = Math.round(harvestTotal * Math.max(currentYearRate, nextYearRate) * 0.3)

      nexusInsights.push({
        id: 'portfolio-multiyear-harvest',
        title: 'Strategic Loss Harvesting Timing',
        description: `$${harvestTotal.toLocaleString()} in harvestable losses. Multi-year analysis suggests ${betterYear} is optimal for realization at ${(Math.max(currentYearRate, nextYearRate) * 100).toFixed(0)}% marginal rate.`,
        engines: ['Portfolio Intelligence', 'Multi-Year Tax', 'Strategy Detector'],
        impact: savings,
        priority: harvestTotal > 10000 ? 'high' : 'medium',
        category: 'timing',
        actions: [
          { label: 'View harvest candidates', view: 'portfolio', detail: `${ps.harvestCandidates.length} positions with unrealized losses` },
          { label: 'Multi-year projection', view: 'multiyear', detail: 'Compare tax rates across years' },
        ],
        reasoning: `Losses are more valuable when offset against income taxed at higher rates. ${betterYear === 'this year' ? 'Current year has higher marginal rate — harvest now.' : 'Next year projects higher marginal rate — consider deferring losses.'}`,
      })
    }

    // Portfolio concentration + Audit risk = documentation flag
    if (ps.concentrationRisk > 50 && ps.totalValue > 50000) {
      nexusInsights.push({
        id: 'portfolio-audit-concentration',
        title: 'High-Value Concentrated Position — Audit Awareness',
        description: `${ps.concentrationRisk.toFixed(0)}% of $${Math.round(ps.totalValue).toLocaleString()} portfolio in single position. Large capital gains events from concentrated positions attract IRS scrutiny.`,
        engines: ['Portfolio Intelligence', 'Audit Profiler'],
        impact: 0,
        priority: 'medium',
        category: 'risk_mitigation',
        actions: [
          { label: 'Portfolio diversification', view: 'portfolio', detail: 'Review concentration risk' },
          { label: 'Audit readiness', view: 'audit', detail: 'Ensure documentation is complete for high-value positions' },
        ],
        reasoning: 'IRS DIF scores flag large capital gains, especially from concentrated positions. Proactive documentation reduces audit risk.',
      })
    }
  }

  // ── Metamodel Nexus Insights ──────────────────────────────────────

  // Estimated payments + Income forecast = safe harbor optimization
  const estPayments = state.estimatedPayments || []
  const missedEst = estPayments.filter(p => {
    const due = new Date(p.dueDate)
    return due < new Date() && (!p.paidAmount || p.paidAmount === 0)
  })
  if (missedEst.length > 0) {
    const totalMissed = missedEst.reduce((s, p) => s + p.amount, 0)
    const penaltyEst = Math.round(totalMissed * 0.04)
    nexusInsights.push({
      id: 'est-payment-penalty-nexus',
      title: 'Missed Estimated Payments + Penalty Exposure',
      description: `${missedEst.length} missed payment(s) totaling $${totalMissed.toLocaleString()} may trigger ~$${penaltyEst.toLocaleString()} in underpayment penalties (Form 2210). Review safe harbor strategy.`,
      engines: ['Proactive Intelligence', 'Income Forecast', 'Tax Calendar'],
      impact: penaltyEst,
      priority: penaltyEst > 1000 ? 'critical' : 'high',
      category: 'risk_mitigation',
      actions: [
        { label: 'Make payments now', view: 'calendar', detail: 'Minimize penalty accrual' },
        { label: 'Recalculate safe harbor', view: 'forecast', detail: 'Adjust remaining quarterly payments' },
      ],
      reasoning: `IRS charges ~4% annualized interest on underpayments. Making up missed payments reduces further accrual.`,
    })
  }

  // Depreciation + Entity structure = §179 per-entity optimization
  const depAssets = (state.depreciationAssets || []).filter(a => a.isActive)
  const entitiesWithAssets = new Set(depAssets.map(a => a.entityId || 'personal'))
  if (entitiesWithAssets.size > 1 && depAssets.length >= 3) {
    const totalBasis = depAssets.reduce((s, a) => s + a.purchasePrice, 0)
    nexusInsights.push({
      id: 'depreciation-entity-split',
      title: 'Multi-Entity Depreciation Strategy',
      description: `${depAssets.length} assets across ${entitiesWithAssets.size} entities totaling $${totalBasis.toLocaleString()}. Each entity gets its own §179 election — strategic asset placement can maximize first-year deductions.`,
      engines: ['Depreciation Engine', 'Entity Optimizer', 'Tax Calculator'],
      impact: Math.round(totalBasis * 0.05),
      priority: 'medium',
      category: 'structural',
      actions: [
        { label: 'Review asset placement', view: 'depreciation', detail: 'Optimize which entity holds each asset' },
      ],
      reasoning: 'Per-entity §179 elections allow strategic first-year expensing. Assets should be placed in the entity with the highest marginal rate.',
    })
  }

  // Retirement accounts + Goals = alignment check
  const retAccounts = state.retirementAccounts || []
  const retGoals = (state.goals || []).filter(g => g.type === 'retirement' && g.status === 'active')
  if (retAccounts.length > 0 && retGoals.length > 0) {
    const totalBalance = retAccounts.reduce((s, a) => s + (a.balance || 0), 0)
    const targetAmount = retGoals[0].targetAmount || 0
    if (targetAmount > 0 && totalBalance < targetAmount * 0.5) {
      const gap = targetAmount - totalBalance
      nexusInsights.push({
        id: 'retirement-goal-gap',
        title: 'Retirement Goal Gap',
        description: `Current retirement balance $${totalBalance.toLocaleString()} is ${Math.round(totalBalance / targetAmount * 100)}% of your $${targetAmount.toLocaleString()} goal. Consider increasing contributions or adjusting timeline.`,
        engines: ['Retirement Optimizer', 'Goal Planner', 'Income Forecast'],
        impact: Math.round(gap * 0.03),
        priority: 'high',
        category: 'compound_savings',
        actions: [
          { label: 'Maximize contributions', view: 'retirement', detail: `$${gap.toLocaleString()} gap to close` },
          { label: 'Review goal timeline', view: 'goals', detail: 'Adjust target date or amount' },
        ],
        reasoning: 'Earlier contributions benefit from compounding. Each year of delay requires significantly more savings to reach the same target.',
      })
    }
  }

  // Carryforwards + Multi-year = utilization planning
  const cf = state.carryforwards || {}
  const totalCarryforward = (cf.capitalLoss || 0) + (cf.netOperatingLoss || 0) + (cf.charitableContributions || 0)
  if (totalCarryforward > 5000) {
    nexusInsights.push({
      id: 'carryforward-utilization',
      title: `$${totalCarryforward.toLocaleString()} in Tax Carryforwards Available`,
      description: `Capital loss: $${(cf.capitalLoss || 0).toLocaleString()}, NOL: $${(cf.netOperatingLoss || 0).toLocaleString()}, Charitable: $${(cf.charitableContributions || 0).toLocaleString()}. Multi-year projections now factor these in for optimal utilization timing.`,
      engines: ['Multi-Year Tax', 'Tax Calculator', 'Strategy Detector'],
      impact: Math.round(totalCarryforward * taxReport.marginalRate * 0.5),
      priority: totalCarryforward > 20000 ? 'high' : 'medium',
      category: 'timing',
      actions: [
        { label: 'View multi-year impact', view: 'multiyear', detail: 'Carryforwards propagated through projection' },
      ],
      reasoning: 'Carryforwards reduce future taxable income. Capital losses limited to $3k/year against ordinary income, NOLs limited to 80% of income post-2017.',
    })
  }

  // Kiddie tax alert for dependents with unearned income
  const household = state.household
  if (household?.dependents?.length) {
    const atRisk = household.dependents.filter(d =>
      d.unearnedIncome && d.unearnedIncome > 2500 && d.age < 19
    )
    if (atRisk.length > 0) {
      const totalKiddieTax = atRisk.reduce((s, d) => {
        const parentRateAmount = Math.max(0, (d.unearnedIncome || 0) - 2500)
        return s + Math.round(parentRateAmount * taxReport.marginalRate)
      }, 0)
      nexusInsights.push({
        id: 'kiddie-tax-alert',
        title: `Kiddie Tax Applies to ${atRisk.length} Dependent${atRisk.length > 1 ? 's' : ''}`,
        description: `${atRisk.map(d => d.name).join(', ')} ha${atRisk.length > 1 ? 've' : 's'} unearned income above $2,500 — excess taxed at your ${(taxReport.marginalRate * 100).toFixed(0)}% rate. Total additional tax: ~$${totalKiddieTax.toLocaleString()}.`,
        engines: ['Tax Calculator', 'Tax Credits'],
        impact: totalKiddieTax,
        priority: totalKiddieTax > 2000 ? 'high' : 'medium',
        category: 'risk_mitigation',
        actions: [
          { label: 'Review dependent income', view: 'tax', detail: 'Consider shifting income to tax-advantaged accounts (529, UTMA)' },
        ],
        reasoning: 'Form 8615 requires unearned income above $2,500 for children under 19 (24 if student) to be taxed at the parent\'s marginal rate.',
      })
    }
  }

  // Cross-entity wash sale detection flag
  // (Actual detection runs when portfolio view loads — flag presence of multi-entity positions)
  const multiEntityInvestors = new Set(
    state.incomeStreams
      .filter(s => s.isActive && s.type === 'investment')
      .map(s => s.entityId || 'personal')
  )
  if (multiEntityInvestors.size > 1) {
    nexusInsights.push({
      id: 'cross-entity-wash-sale-risk',
      title: 'Cross-Entity Wash Sale Risk',
      description: `Investment income flows through ${multiEntityInvestors.size} entities. IRS wash sale rules apply across ALL accounts you control — selling at a loss in one entity and repurchasing in another within 30 days triggers wash sale disallowance.`,
      engines: ['Cost Basis', 'Entity Optimizer', 'Portfolio Intelligence'],
      impact: 0,
      priority: 'medium',
      category: 'risk_mitigation',
      actions: [
        { label: 'Review positions', view: 'portfolio', detail: 'Check for cross-entity wash sales' },
      ],
      reasoning: 'IRS Publication 550 extends wash sale rules to substantially identical securities across all accounts owned by the taxpayer and spouse.',
    })
  }

  // Sort by impact
  nexusInsights.sort((a, b) => b.impact - a.impact)

  const totalCompoundSavings = nexusInsights.reduce((s, n) => s + n.impact, 0)
  const topAction = nexusInsights[0]?.actions[0] || null

  return {
    taxReport,
    strategies,
    retirement,
    credits,
    multiYear,
    depreciation,
    entityOpt,
    auditRisk,
    healthReport,
    alerts,
    nexusInsights,
    totalCompoundSavings,
    topPriorityAction: topAction,
    enginesCrossReferenced: 14,
    insightsGenerated: nexusInsights.length,
    computedAt: new Date().toISOString(),
  }
}

/**
 * Build a compact text summary for the AI advisor context
 */
export function buildIntelligenceBrief(intel: UnifiedIntelligence): string {
  const sections: string[] = []

  // Multi-year projection summary
  const my = intel.multiYear
  sections.push(`MULTI-YEAR PROJECTION (${my.baseline.length} years):`)
  for (const yr of my.baseline) {
    sections.push(`  ${yr.year}: Income $${yr.grossIncome.toLocaleString()} | Tax $${yr.totalTax.toLocaleString()} | Eff ${(yr.effectiveRate * 100).toFixed(1)}% | Marginal ${(yr.marginalRate * 100).toFixed(0)}% | ${yr.bracketRegime === 'pre_tcja' ? '⚠️ POST-TCJA' : 'TCJA'}`)
  }
  if (my.tcjaSunsetImpact > 0) {
    sections.push(`  TCJA Sunset Impact: +$${my.tcjaSunsetImpact.toLocaleString()}/yr additional tax`)
  }
  sections.push(`  Bracket Headroom: $${my.bracketHeadroom.toLocaleString()} before next rate jump`)

  // Income shifting scenarios
  if (my.scenarios.length > 0) {
    sections.push(`\nINCOME SHIFTING SCENARIOS:`)
    for (const sc of my.scenarios.slice(0, 3)) {
      sections.push(`  - ${sc.name}: Saves $${sc.totalTaxSavings.toLocaleString()} (${sc.recommendation})`)
    }
  }

  // Tax credits
  const cr = intel.credits
  const activeCreds = cr.credits.filter(c => c.eligible && c.amount > 0)
  if (activeCreds.length > 0 || cr.optimizations.length > 0) {
    sections.push(`\nTAX CREDITS:`)
    for (const c of activeCreds) {
      sections.push(`  ✓ ${c.name}: $${c.amount.toLocaleString()} (${c.type})`)
    }
    sections.push(`  Total Credits: $${cr.totalCredits.toLocaleString()} | Optimizations Available: ${cr.optimizations.length} (+$${cr.optimizations.reduce((s, o) => s + o.additionalCredits, 0).toLocaleString()} potential)`)
  }

  // Depreciation
  const dep = intel.depreciation
  sections.push(`\nDEPRECIATION:`)
  sections.push(`  §179 Available: $${dep.section179Remaining.toLocaleString()} | Bonus Rate: ${(dep.bonusDepreciationRate * 100).toFixed(0)}%`)
  sections.push(`  Timing Insights: ${dep.purchaseTimingInsights.length} active`)

  // Retirement
  const ret = intel.retirement
  if (ret.vehicles && ret.vehicles.length > 0) {
    const best = ret.vehicles.reduce((a, b) => a.maxContribution > b.maxContribution ? a : b)
    sections.push(`\nRETIREMENT:`)
    sections.push(`  Best Vehicle: ${best.name} ($${best.maxContribution.toLocaleString()} max)`)
    sections.push(`  Contribution Gap: $${intel.taxReport.retirementGap.toLocaleString()}`)
  }

  // Entity optimization
  if (intel.entityOpt && intel.entityOpt.scenarios) {
    sections.push(`\nENTITY OPTIMIZATION:`)
    sections.push(`  Recommended: ${intel.entityOpt.recommended.entityType} — ${intel.entityOpt.summary}`)
    sections.push(`  Max Savings: $${intel.entityOpt.maxSavings.toLocaleString()}`)
  }

  // Cross-engine nexus insights
  if (intel.nexusInsights.length > 0) {
    sections.push(`\n★ CROSS-ENGINE COMPOUND INSIGHTS (${intel.nexusInsights.length}):`)
    for (const n of intel.nexusInsights) {
      sections.push(`  [${n.priority.toUpperCase()}] ${n.title} — $${n.impact.toLocaleString()} impact`)
      sections.push(`    ${n.reasoning}`)
      sections.push(`    Engines: ${n.engines.join(' × ')}`)
    }
    sections.push(`  TOTAL COMPOUND SAVINGS POTENTIAL: $${intel.totalCompoundSavings.toLocaleString()}`)
  }

  // Portfolio Intelligence summary
  if (hasPortfolioData()) {
    const ps = computePortfolioSummary()
    sections.push(`\nPORTFOLIO INTELLIGENCE:`)
    sections.push(`  Positions: ${ps.activePositionCount} | Value: $${Math.round(ps.totalValue).toLocaleString()} | Unrealized G/L: ${ps.unrealizedGainLoss >= 0 ? '+' : ''}$${Math.round(ps.unrealizedGainLoss).toLocaleString()}`)
    if (ps.netCapitalGains !== 0) sections.push(`  Net Capital Gains: $${Math.round(ps.netCapitalGains).toLocaleString()} (ST: $${Math.round(ps.shortTermGains - ps.shortTermLosses).toLocaleString()} + LT: $${Math.round(ps.longTermGains - ps.longTermLosses).toLocaleString()})`)
    if (ps.ordinaryIncomeFromPortfolio > 0) sections.push(`  Portfolio Ordinary Income: $${Math.round(ps.ordinaryIncomeFromPortfolio).toLocaleString()} (staking: $${Math.round(ps.stakingRewards).toLocaleString()}, airdrops: $${Math.round(ps.airdropIncome).toLocaleString()}, mining: $${Math.round(ps.miningIncome).toLocaleString()})`)
    if (ps.pendingTaxEvents > 0) sections.push(`  Pending Tax Events: ${ps.pendingTaxEvents} (~$${Math.round(ps.estimatedTaxableFromEvents).toLocaleString()} est. taxable)`)
    if (ps.harvestCandidates.length > 0) sections.push(`  Tax-Loss Harvesting: ${ps.harvestCandidates.length} candidates ($${Math.round(ps.harvestCandidates.reduce((s, c) => s + c.loss, 0)).toLocaleString()} harvestable)`)
    sections.push(`  Risk: avg ${ps.avgRiskScore.toFixed(1)}/10 | Concentration: ${ps.concentrationRisk.toFixed(0)}%`)
    if (ps.activeOpportunities + ps.watchingOpportunities > 0) sections.push(`  Pipeline: ${ps.activeOpportunities} active, ${ps.watchingOpportunities} watching ($${Math.round(ps.totalPipelineValue).toLocaleString()} expected value)`)
  }

  return sections.join('\n')
}
