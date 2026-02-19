/**
 * Fortuna Engine - Strategy Detector
 * Autonomously analyzes financial state and identifies optimization opportunities
 */

import type { FortunaState } from './storage'
import { hasPortfolioData, getPortfolioStrategies } from './portfolio-bridge'
import {
  generateTaxReport, calculateSCorpSavings, calculateMaxSEPIRA,
  calculateMaxSolo401k, STATE_TAX_RATES, type TaxReport
} from './tax-calculator'

export interface DetectedStrategy {
  id: string
  title: string
  category: 'tax' | 'entity' | 'revenue' | 'risk' | 'investment' | 'deduction'
  priority: 'critical' | 'high' | 'medium' | 'low'
  estimatedImpact: number // annual dollars
  impactLabel: string
  description: string
  reasoning: string
  steps: string[]
  risk: 'none' | 'low' | 'medium' | 'high'
  timeline: string
  prerequisites: string[]
  automatable: boolean
}

export interface RiskItem {
  id: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  score: number // 0-100
  description: string
  mitigation: string
  category: string
  actionable: boolean
}

export interface FinancialHealthScore {
  overall: number
  components: {
    taxEfficiency: number
    entityOptimization: number
    incomeGrowth: number
    riskProtection: number
    retirementReadiness: number
    diversification: number
  }
  grade: string
}

// ==================== Strategy Detection ====================

export function detectStrategies(state: FortunaState): DetectedStrategy[] {
  const strategies: DetectedStrategy[] = []
  const report = generateTaxReport(state)
  const { profile, incomeStreams, expenses, deductions, entities } = state

  const netSEIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0) -
    expenses.filter(e => e.isDeductible).reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)

  // 1. S-Corp Election
  const hasScorp = entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  if (!hasScorp && netSEIncome > 50000) {
    const reasonableSalary = Math.round(Math.max(netSEIncome * 0.5, Math.min(netSEIncome * 0.7, 80000)))
    const savings = calculateSCorpSavings(netSEIncome, reasonableSalary)

    if (savings.savings > 2000) {
      strategies.push({
        id: 'scorp-election',
        title: 'S-Corp Election',
        category: 'entity',
        priority: savings.savings > 5000 ? 'critical' : 'high',
        estimatedImpact: savings.savings,
        impactLabel: `$${savings.savings.toLocaleString()}/yr`,
        description: `Your self-employment income of $${netSEIncome.toLocaleString()} makes you an excellent candidate for S-Corp election. Pay yourself a reasonable salary of ~$${reasonableSalary.toLocaleString()} and take $${savings.distributionAmount.toLocaleString()} as distributions to avoid SE tax on that portion.`,
        reasoning: `Current SE tax: $${savings.currentSETax.toLocaleString()}. After S-Corp: $${savings.sCorpSETax.toLocaleString()}. Net savings: $${savings.savings.toLocaleString()}/year.`,
        steps: [
          'Form LLC in your state (if not already formed)',
          'File Form 2553 with the IRS to elect S-Corp status',
          'Set up payroll service for reasonable salary payments',
          'Establish quarterly distribution schedule',
          'Adjust quarterly estimated tax payments',
        ],
        risk: 'low',
        timeline: '30-60 days',
        prerequisites: ['EIN number', 'LLC formation (or convert existing entity)'],
        automatable: false,
      })
    }
  }

  // 2. SEP-IRA / Solo 401(k) Maximization
  if (netSEIncome > 20000) {
    const maxSEP = calculateMaxSEPIRA(netSEIncome)
    const solo401k = calculateMaxSolo401k(netSEIncome, profile.age)
    const currentRetirement = deductions
      .filter(d => d.category === 'retirement')
      .reduce((sum, d) => sum + d.amount, 0)

    const bestRetirement = Math.max(maxSEP, solo401k.totalMax)
    const gap = bestRetirement - currentRetirement

    if (gap > 3000) {
      const taxSavings = Math.round(gap * report.marginalRate)
      const useSolo = solo401k.totalMax > maxSEP

      strategies.push({
        id: 'retirement-max',
        title: useSolo ? 'Solo 401(k) Maximization' : 'SEP-IRA Maximization',
        category: 'tax',
        priority: gap > 10000 ? 'high' : 'medium',
        estimatedImpact: taxSavings,
        impactLabel: `$${gap.toLocaleString()} deferral ($${taxSavings.toLocaleString()} tax savings)`,
        description: `You're contributing $${currentRetirement.toLocaleString()} of a possible $${bestRetirement.toLocaleString()} to retirement accounts. The remaining $${gap.toLocaleString()} in contributions would reduce your taxable income and save $${taxSavings.toLocaleString()} in taxes this year.`,
        reasoning: `Max ${useSolo ? 'Solo 401(k)' : 'SEP-IRA'}: $${bestRetirement.toLocaleString()}. Current: $${currentRetirement.toLocaleString()}. Gap: $${gap.toLocaleString()}. At ${(report.marginalRate * 100).toFixed(0)}% marginal rate = $${taxSavings.toLocaleString()} saved.`,
        steps: [
          `Open/verify ${useSolo ? 'Solo 401(k)' : 'SEP-IRA'} account`,
          `Calculate exact maximum contribution: $${bestRetirement.toLocaleString()}`,
          'Make contribution before tax filing deadline (including extensions)',
          useSolo ? 'Set up employee + employer contribution schedule' : 'Single annual contribution before deadline',
        ],
        risk: 'none',
        timeline: 'Immediate',
        prerequisites: [useSolo ? 'Solo 401(k) account' : 'SEP-IRA account'],
        automatable: true,
      })
    }
  }

  // 3. QBI Deduction Optimization
  if (netSEIncome > 30000 && !hasScorp) {
    const qbiAmount = Math.round(netSEIncome * 0.20)
    const isNearPhaseout = report.agi > 150000

    if (qbiAmount > 5000) {
      strategies.push({
        id: 'qbi-optimization',
        title: 'Section 199A QBI Deduction',
        category: 'tax',
        priority: isNearPhaseout ? 'high' : 'medium',
        estimatedImpact: Math.round(qbiAmount * report.marginalRate),
        impactLabel: `Up to $${qbiAmount.toLocaleString()} deduction`,
        description: `Your qualifying business income of $${netSEIncome.toLocaleString()} entitles you to a 20% QBI deduction of up to $${qbiAmount.toLocaleString()}. ${isNearPhaseout ? 'Warning: You are approaching the phase-out threshold. Consider strategies to stay under the limit.' : 'You are well below the phase-out threshold.'}`,
        reasoning: `QBI = 20% × $${netSEIncome.toLocaleString()} = $${qbiAmount.toLocaleString()}. Tax savings at ${(report.marginalRate * 100).toFixed(0)}% marginal rate: $${Math.round(qbiAmount * report.marginalRate).toLocaleString()}.`,
        steps: [
          'Ensure all qualifying business income is properly classified',
          'Verify no specified service trade or business (SSTB) issues',
          isNearPhaseout ? 'Consider deferring income or accelerating deductions to stay below phase-out' : 'Maintain income below phase-out thresholds',
          'Coordinate with entity structure for maximum benefit',
        ],
        risk: 'none',
        timeline: 'Tax filing',
        prerequisites: [],
        automatable: true,
      })
    }
  }

  // 4. Home Office Deduction
  const hasHomeOffice = deductions.some(d => d.category === 'home_office')
  if (netSEIncome > 10000 && !hasHomeOffice) {
    strategies.push({
      id: 'home-office',
      title: 'Home Office Deduction',
      category: 'deduction',
      priority: 'medium',
      estimatedImpact: Math.round(3000 * report.marginalRate),
      impactLabel: `$1,500-5,000+ deduction`,
      description: 'No home office deduction detected. If you use a dedicated space for business, you can deduct a proportional share of housing costs (mortgage/rent, utilities, insurance, repairs) or use the simplified method ($5/sqft, max 300 sqft = $1,500).',
      reasoning: 'Actual expense method typically yields higher deductions than simplified method for dedicated home offices. Average deduction: $3,000-5,000/year.',
      steps: [
        'Measure dedicated office space (must be exclusive and regular use)',
        'Calculate total housing costs eligible for allocation',
        'Compare simplified ($5/sqft) vs actual expense method',
        'Photograph space and maintain documentation',
      ],
      risk: 'low',
      timeline: '1-2 weeks',
      prerequisites: ['Dedicated home office space'],
      automatable: true,
    })
  }

  // 5. LLC Formation (liability protection)
  const hasLLC = entities.some(e => ['llc', 'llc_scorp', 'scorp', 'ccorp'].includes(e.type) && e.isActive)
  if (!hasLLC && report.grossIncome > 30000) {
    strategies.push({
      id: 'llc-formation',
      title: 'LLC Formation for Liability Protection',
      category: 'entity',
      priority: report.grossIncome > 100000 ? 'critical' : 'high',
      estimatedImpact: 0, // Protection value, not direct savings
      impactLabel: 'Personal asset protection',
      description: 'You are currently operating without a legal entity, exposing all personal assets to business liabilities. An LLC creates a legal separation between personal and business assets.',
      reasoning: `With gross income of $${report.grossIncome.toLocaleString()}, the risk exposure is significant. LLC formation costs are minimal ($75-800 depending on state) and provide essential protection.`,
      steps: [
        `File Articles of Organization in ${STATE_TAX_RATES[profile.state]?.name || profile.state}`,
        'Obtain EIN from the IRS (free, instant online)',
        'Open separate business bank account',
        'Create operating agreement',
        'Separate business and personal finances completely',
      ],
      risk: 'none',
      timeline: '1-2 weeks',
      prerequisites: [],
      automatable: false,
    })
  }

  // 6. Income diversification
  const activeStreams = incomeStreams.filter(s => s.isActive)
  if (activeStreams.length > 0) {
    const maxStream = Math.max(...activeStreams.map(s => s.annualAmount))
    const concentration = maxStream / report.grossIncome

    if (concentration > 0.6) {
      strategies.push({
        id: 'diversification',
        title: 'Income Stream Diversification',
        category: 'revenue',
        priority: concentration > 0.8 ? 'high' : 'medium',
        estimatedImpact: Math.round(report.grossIncome * 0.15),
        impactLabel: `Reduce ${(concentration * 100).toFixed(0)}% concentration risk`,
        description: `${(concentration * 100).toFixed(0)}% of your income comes from a single source. This creates significant vulnerability. Diversifying into 2-3 additional streams could reduce risk while growing total revenue.`,
        reasoning: `Best practice is <50% from any single source. Current: ${(concentration * 100).toFixed(0)}%. Target additional streams to reach healthy diversification.`,
        steps: [
          'Identify 2-3 revenue opportunities aligned with existing skills',
          'Prioritize low-effort, high-confidence opportunities first',
          'Set 90-day targets for each new stream',
          'Reinvest initial revenue into stream growth',
        ],
        risk: 'none',
        timeline: '1-3 months',
        prerequisites: [],
        automatable: false,
      })
    }
  }

  // 7. Vehicle deduction
  const hasVehicle = deductions.some(d => d.category === 'vehicle')
  if (netSEIncome > 20000 && !hasVehicle) {
    strategies.push({
      id: 'vehicle-deduction',
      title: 'Business Vehicle Deduction',
      category: 'deduction',
      priority: 'low',
      estimatedImpact: Math.round(2000 * report.marginalRate),
      impactLabel: '$1,000-4,000+ deduction',
      description: 'If you use a personal vehicle for business purposes, you can deduct mileage at $0.67/mile (2024) or actual expenses. Common business uses include client meetings, supply runs, and business errands.',
      reasoning: 'Average self-employed vehicle deduction: $2,000-4,000/year. IRS standard mileage rate for 2024: $0.67/mile.',
      steps: [
        'Begin tracking all business miles (MileIQ app recommended)',
        'Maintain a contemporaneous mileage log',
        'Compare standard mileage vs actual expense method',
        'Keep all fuel, maintenance, and insurance receipts',
      ],
      risk: 'none',
      timeline: 'Start immediately',
      prerequisites: ['Vehicle used for business'],
      automatable: true,
    })
  }

  // ── Portfolio Intelligence strategies ────────────────────────────
  if (hasPortfolioData()) {
    const portfolioStrats = getPortfolioStrategies(report.marginalRate)
    for (const ps of portfolioStrats) {
      strategies.push({
        id: ps.id,
        title: ps.title,
        category: ps.category as DetectedStrategy['category'],
        priority: ps.priority,
        estimatedImpact: ps.impact,
        impactLabel: ps.impact > 0 ? `$${ps.impact.toLocaleString()}/year` : 'Risk reduction',
        description: ps.description,
        reasoning: ps.description,
        steps: ps.steps,
        risk: 'low',
        timeline: 'This quarter',
        prerequisites: [],
        automatable: false,
      })
    }
  }

  // Sort by priority then impact
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  strategies.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (pDiff !== 0) return pDiff
    return b.estimatedImpact - a.estimatedImpact
  })

  return strategies
}

// ==================== Risk Analysis ====================

export function analyzeRisks(state: FortunaState): RiskItem[] {
  const risks: RiskItem[] = []
  const report = generateTaxReport(state)
  const { profile, incomeStreams, entities, deductions, expenses } = state

  const activeStreams = incomeStreams.filter(s => s.isActive)
  const hasLLC = entities.some(e => ['llc', 'llc_scorp', 'scorp', 'ccorp'].includes(e.type) && e.isActive)

  // Income concentration
  if (activeStreams.length > 0) {
    const maxStream = Math.max(...activeStreams.map(s => s.annualAmount))
    const concentration = report.grossIncome > 0 ? maxStream / report.grossIncome : 0
    if (concentration > 0.5) {
      risks.push({
        id: 'income-concentration',
        name: 'Income Concentration',
        severity: concentration > 0.8 ? 'critical' : concentration > 0.6 ? 'high' : 'medium',
        score: Math.round(concentration * 100),
        description: `${(concentration * 100).toFixed(0)}% of income from single source. Loss would be catastrophic.`,
        mitigation: 'Diversify into 2-3 additional revenue streams. Target <50% from any single source.',
        category: 'Revenue',
        actionable: true,
      })
    }
  }

  // Liability exposure
  if (!hasLLC && report.grossIncome > 20000) {
    risks.push({
      id: 'liability',
      name: 'Personal Liability Exposure',
      severity: report.grossIncome > 100000 ? 'critical' : 'high',
      score: Math.min(90, Math.round(report.grossIncome / 3000)),
      description: 'No legal entity protection. All personal assets at risk from business liabilities.',
      mitigation: 'Form an LLC immediately. Cost: $75-800. Provides personal asset separation.',
      category: 'Legal',
      actionable: true,
    })
  }

  // Tax underpayment risk
  if (report.totalTax > 10000) {
    risks.push({
      id: 'tax-underpayment',
      name: 'Estimated Tax Compliance',
      severity: 'medium',
      score: 40,
      description: `Total tax liability of $${report.totalTax.toLocaleString()} requires quarterly estimated payments of ~$${Math.round(report.totalTax / 4).toLocaleString()}.`,
      mitigation: 'Set calendar reminders for quarterly deadlines (Apr 15, Jun 15, Sep 15, Jan 15). Adjust payments as income fluctuates.',
      category: 'Tax',
      actionable: true,
    })
  }

  // Emergency fund
  const monthlyExpenses = expenses.reduce((sum, e) => sum + e.annualAmount / 12, 0) || (report.grossIncome * 0.5 / 12)
  risks.push({
    id: 'emergency-fund',
    name: 'Emergency Fund Adequacy',
    severity: 'medium',
    score: 35,
    description: `Self-employed individuals should maintain 6+ months of expenses (~$${Math.round(monthlyExpenses * 6).toLocaleString()}) in liquid reserves.`,
    mitigation: 'Target 6-month emergency fund in high-yield savings. Automate monthly contributions.',
    category: 'Financial',
    actionable: true,
  })

  // Insurance gaps
  risks.push({
    id: 'insurance',
    name: 'Insurance Coverage',
    severity: report.grossIncome > 100000 ? 'high' : 'medium',
    score: 45,
    description: 'Verify professional liability (E&O), business property, and disability insurance coverage.',
    mitigation: 'Obtain professional liability insurance ($500-1,200/yr). Consider disability insurance for income protection.',
    category: 'Protection',
    actionable: true,
  })

  // Documentation
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0) +
    expenses.filter(e => e.isDeductible).reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)
  if (totalDeductions > 10000) {
    risks.push({
      id: 'documentation',
      name: 'Deduction Documentation',
      severity: totalDeductions > 30000 ? 'medium' : 'low',
      score: 30,
      description: `$${totalDeductions.toLocaleString()} in deductions requires thorough documentation in case of audit.`,
      mitigation: 'Maintain digital copies of all receipts. Use accounting software for categorization. Keep contemporaneous records for mileage and home office.',
      category: 'Compliance',
      actionable: true,
    })
  }

  // Sort by severity
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  risks.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])

  return risks
}

// ==================== Financial Health Score ====================

export function calculateHealthScore(state: FortunaState): FinancialHealthScore {
  const report = generateTaxReport(state)
  const strategies = detectStrategies(state)
  const risks = analyzeRisks(state)
  const { incomeStreams, entities, deductions } = state

  // Tax efficiency (0-100)
  const taxEff = Math.max(0, Math.min(100, Math.round((0.35 - report.effectiveRate) / 0.20 * 100)))

  // Entity optimization — enhanced with entityBreakdown
  const hasLLC = entities.some(e => ['llc', 'llc_scorp', 'scorp', 'ccorp'].includes(e.type) && e.isActive)
  const hasScorp = entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  let entityScore = 30
  if (hasLLC) entityScore += 35
  if (hasScorp && report.selfEmploymentIncome > 50000) entityScore += 35
  // Bonus: check entity P&L health from entityBreakdown
  const breakdown = report.entityBreakdown || []
  const profitableEntities = breakdown.filter(e => e.netIncome > 0)
  if (profitableEntities.length >= 2) entityScore = Math.min(100, entityScore + 10)

  // Income growth / diversification
  const activeStreams = incomeStreams.filter(s => s.isActive)
  const diversification = Math.min(100, activeStreams.length * 25)

  // Risk protection — factor in estimated payment compliance
  const highRisks = risks.filter(r => r.severity === 'critical' || r.severity === 'high').length
  let riskScore = Math.max(0, 100 - highRisks * 25)
  const estPayments = state.estimatedPayments || []
  const missedPayments = estPayments.filter(p => {
    const due = new Date(p.dueDate)
    return due < new Date() && (!p.paidAmount || p.paidAmount === 0)
  })
  if (missedPayments.length > 0) riskScore = Math.max(0, riskScore - missedPayments.length * 10)

  // Retirement readiness — enhanced with actual accounts
  const accounts = state.retirementAccounts || []
  const accountContribs = accounts.reduce((s, a) => s + (a.annualContribution || 0), 0)
  const maxPossible = accounts.reduce((s, a) => s + (a.maxContribution || 0), 0)
  let retirementScore: number
  if (maxPossible > 0) {
    retirementScore = Math.round((accountContribs / maxPossible) * 100)
  } else if (report.maxSEPIRA > 0) {
    retirementScore = Math.round((report.currentRetirementContributions / report.maxSEPIRA) * 100)
  } else {
    retirementScore = 50
  }

  // Overall
  const overall = Math.round(
    taxEff * 0.25 +
    entityScore * 0.20 +
    diversification * 0.15 +
    riskScore * 0.20 +
    retirementScore * 0.20
  )

  const grade = overall >= 90 ? 'A+' : overall >= 80 ? 'A' : overall >= 70 ? 'B+' :
                overall >= 60 ? 'B' : overall >= 50 ? 'C+' : overall >= 40 ? 'C' : 'D'

  return {
    overall,
    components: {
      taxEfficiency: taxEff,
      entityOptimization: Math.min(100, entityScore),
      incomeGrowth: diversification,
      riskProtection: riskScore,
      retirementReadiness: Math.min(100, retirementScore),
      diversification,
    },
    grade,
  }
}
