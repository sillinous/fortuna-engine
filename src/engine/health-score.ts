/**
 * FORTUNA ENGINE v6 — Financial Health Score
 * 
 * Composite scoring system that evaluates financial health across
 * multiple dimensions with letter grades, trend indicators,
 * and actionable improvement recommendations.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, calculateSCorpSavings } from './tax-calculator'
import { analyzeAuditRisk } from './audit-risk'
import { hasPortfolioData, computePortfolioSummary, scorePortfolioHealth } from './portfolio-bridge'

// ─── Types ───────────────────────────────────────────────────────────────

export type HealthGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F'

export interface HealthDimension {
  id: string
  name: string
  score: number       // 0-100
  grade: HealthGrade
  weight: number      // 0-1
  color: string
  icon: string
  status: string
  detail: string
  recommendations: string[]
}

export interface FinancialHealthReport {
  overallScore: number
  overallGrade: HealthGrade
  dimensions: HealthDimension[]
  topPriority: string
  quickWins: string[]
  riskFlags: string[]
  strengthsSummary: string
}

// ─── Grading ─────────────────────────────────────────────────────────────

function scoreToGrade(score: number): HealthGrade {
  if (score >= 97) return 'A+'
  if (score >= 93) return 'A'
  if (score >= 90) return 'A-'
  if (score >= 87) return 'B+'
  if (score >= 83) return 'B'
  if (score >= 80) return 'B-'
  if (score >= 77) return 'C+'
  if (score >= 73) return 'C'
  if (score >= 70) return 'C-'
  if (score >= 60) return 'D'
  return 'F'
}

function gradeColor(grade: HealthGrade): string {
  if (grade.startsWith('A')) return '#10b981'
  if (grade.startsWith('B')) return '#3b82f6'
  if (grade.startsWith('C')) return '#f59e0b'
  if (grade.startsWith('D')) return '#ef4444'
  return '#dc2626'
}

// ─── Dimension Scorers ──────────────────────────────────────────────────

function scoreTaxEfficiency(state: FortunaState): HealthDimension {
  const { profile, incomeStreams, expenses, deductions } = state
  const totalIncome = incomeStreams.filter(s => s.isActive).reduce((sum, s) => sum + s.annualAmount, 0)
  if (totalIncome === 0) {
    return {
      id: 'tax_efficiency', name: 'Tax Efficiency', score: 50, grade: 'C-',
      weight: 0.25, color: '#f59e0b', icon: '📊',
      status: 'No income data', detail: 'Add income streams to calculate tax efficiency.',
      recommendations: ['Add your income sources in the profile setup'],
    }
  }

  const report = generateTaxReport(state)
  const effectiveRate = report.effectiveRate
  let score = 100

  // Penalize high effective rates relative to income
  if (totalIncome < 50000) {
    if (effectiveRate > 20) score -= 20
    else if (effectiveRate > 15) score -= 10
  } else if (totalIncome < 100000) {
    if (effectiveRate > 28) score -= 25
    else if (effectiveRate > 22) score -= 15
    else if (effectiveRate > 18) score -= 5
  } else {
    if (effectiveRate > 35) score -= 30
    else if (effectiveRate > 28) score -= 15
    else if (effectiveRate > 24) score -= 5
  }

  // Reward deduction optimization
  const deductionCount = deductions.length + expenses.filter(e => e.isDeductible).length
  if (deductionCount < 3) score -= 15
  else if (deductionCount < 5) score -= 5
  else if (deductionCount >= 8) score += 5

  // Check for retirement contributions
  const hasRetirement = deductions.some(d => d.category === 'retirement' && d.amount > 0)
  if (!hasRetirement) score -= 10

  // Check if they should have S-Corp but don't
  const selfEmploymentIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)
  const hasScorp = state.entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  if (selfEmploymentIncome > 60000 && !hasScorp) score -= 15

  score = Math.max(0, Math.min(100, score))
  const grade = scoreToGrade(score)
  const recommendations: string[] = []
  if (!hasRetirement) recommendations.push('Add retirement contributions (Solo 401k, SEP-IRA, or Traditional IRA)')
  if (selfEmploymentIncome > 60000 && !hasScorp) recommendations.push('Evaluate S-Corp election for SE tax savings')
  if (deductionCount < 5) recommendations.push('Review commonly missed deductions: home office, vehicle, health insurance')
  if (effectiveRate > 25) recommendations.push('Consider income timing strategies to manage bracket exposure')

  return {
    id: 'tax_efficiency', name: 'Tax Efficiency', score, grade,
    weight: 0.25, color: gradeColor(grade), icon: '📊',
    status: `${effectiveRate.toFixed(1)}% effective rate`,
    detail: `Federal effective tax rate on $${totalIncome.toLocaleString()} total income. ${deductionCount} deductions claimed.`,
    recommendations,
  }
}

function scoreEntityStructure(state: FortunaState): HealthDimension {
  const { incomeStreams, entities } = state
  const selfEmploymentIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  if (selfEmploymentIncome === 0) {
    return {
      id: 'entity_structure', name: 'Entity Structure', score: 80, grade: 'B-',
      weight: 0.20, color: '#3b82f6', icon: '🏛️',
      status: 'N/A — no SE income', detail: 'No self-employment income to optimize entity structure for.',
      recommendations: [],
    }
  }

  let score = 70
  const hasEntity = entities.some(e => e.isActive)
  const hasScorp = entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  const recommendations: string[] = []

  if (selfEmploymentIncome < 40000) {
    // Low income — sole prop is fine
    score = hasEntity ? 85 : 80
  } else if (selfEmploymentIncome < 75000) {
    // Mid income — LLC or S-Corp beneficial
    if (hasScorp) score = 95
    else if (hasEntity) score = 75
    else {
      score = 55
      recommendations.push('Evaluate LLC with S-Corp election at this income level')
    }
  } else {
    // High income — S-Corp strongly recommended
    if (hasScorp) score = 95
    else if (hasEntity) score = 60
    else {
      score = 40
      recommendations.push('S-Corp election could save significant SE tax at this income level')
    }
  }

  // Multi-stream optimization
  const bizStreams = incomeStreams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  if (bizStreams.length >= 2 && selfEmploymentIncome > 100000 && entities.length < 2) {
    score -= 10
    recommendations.push('Consider separate entities for different income streams')
  }

  score = Math.max(0, Math.min(100, score))
  const grade = scoreToGrade(score)

  return {
    id: 'entity_structure', name: 'Entity Structure', score, grade,
    weight: 0.20, color: gradeColor(grade), icon: '🏛️',
    status: hasScorp ? 'S-Corp active' : hasEntity ? 'LLC active' : 'Sole proprietorship',
    detail: `$${selfEmploymentIncome.toLocaleString()} SE income. ${entities.filter(e => e.isActive).length} active entit${entities.filter(e => e.isActive).length === 1 ? 'y' : 'ies'}.`,
    recommendations,
  }
}

function scoreAuditReadiness(state: FortunaState): HealthDimension {
  const totalIncome = state.incomeStreams.filter(s => s.isActive).reduce((sum, s) => sum + s.annualAmount, 0)
  if (totalIncome === 0) {
    return {
      id: 'audit_readiness', name: 'Audit Readiness', score: 70, grade: 'C-',
      weight: 0.15, color: '#f59e0b', icon: '🛡️',
      status: 'No data', detail: 'Add income data to assess audit risk.',
      recommendations: ['Complete your financial profile'],
    }
  }

  const auditResult = analyzeAuditRisk(state)
  // Convert audit risk score (0-100, higher = more risk) to health score (0-100, higher = better)
  const riskScore = auditResult.overallScore
  let score = 100 - riskScore

  // Bonus for having documentation
  const hasBusinessExpenses = state.expenses.some(e => e.isDeductible)
  if (hasBusinessExpenses) score += 5

  score = Math.max(0, Math.min(100, score))
  const grade = scoreToGrade(score)
  const recommendations: string[] = []

  if (riskScore > 50) recommendations.push('Review audit risk factors in the Audit Profiler')
  if (riskScore > 30) recommendations.push('Ensure all deductions have supporting documentation')

  const highRiskFactors = auditResult.triggers.filter(f => f.riskScore > 60)
  highRiskFactors.slice(0, 2).forEach(f => {
    recommendations.push(`Address: ${f.name} (${f.severity} risk)`)
  })

  return {
    id: 'audit_readiness', name: 'Audit Readiness', score, grade,
    weight: 0.15, color: gradeColor(grade), icon: '🛡️',
    status: riskScore < 30 ? 'Low risk' : riskScore < 60 ? 'Moderate risk' : 'Elevated risk',
    detail: `Audit risk score: ${riskScore}/100. ${auditResult.triggers.filter(f => f.riskScore > 50).length} elevated risk factors.`,
    recommendations,
  }
}

function scoreIncomeDiversification(state: FortunaState): HealthDimension {
  const activeStreams = state.incomeStreams.filter(s => s.isActive)
  const totalIncome = activeStreams.reduce((sum, s) => sum + s.annualAmount, 0)

  if (totalIncome === 0) {
    return {
      id: 'diversification', name: 'Income Diversification', score: 0, grade: 'F',
      weight: 0.15, color: '#dc2626', icon: '🌐',
      status: 'No income', detail: 'No income streams configured.',
      recommendations: ['Add your income sources'],
    }
  }

  let score = 50
  const recommendations: string[] = []

  // Number of streams
  if (activeStreams.length === 1) score = 40
  else if (activeStreams.length === 2) score = 65
  else if (activeStreams.length === 3) score = 80
  else score = 90

  // Concentration — Herfindahl index
  const shares = activeStreams.map(s => s.annualAmount / totalIncome)
  const hhi = shares.reduce((sum, s) => sum + s * s, 0)
  if (hhi > 0.8) score -= 20
  else if (hhi > 0.5) score -= 10
  else if (hhi < 0.4) score += 10

  // Type diversity
  const types = new Set(activeStreams.map(s => s.type))
  if (types.size >= 3) score += 10
  else if (types.size === 1) score -= 10

  // Passive income
  const hasPassive = activeStreams.some(s => ['investment', 'rental', 'royalty'].includes(s.type))
  if (hasPassive) score += 10

  score = Math.max(0, Math.min(100, score))
  const grade = scoreToGrade(score)

  if (activeStreams.length === 1) recommendations.push('Explore additional income streams for resilience')
  if (hhi > 0.7) recommendations.push('Income is highly concentrated — consider diversifying')
  if (!hasPassive) recommendations.push('Consider adding passive income (investments, rental, etc.)')

  return {
    id: 'diversification', name: 'Income Diversification', score, grade,
    weight: 0.15, color: gradeColor(grade), icon: '🌐',
    status: `${activeStreams.length} stream${activeStreams.length !== 1 ? 's' : ''}, ${Math.round(hhi * 100)}% concentration`,
    detail: `${activeStreams.length} active income streams across ${types.size} type${types.size !== 1 ? 's' : ''}. ${hasPassive ? 'Includes passive income.' : 'No passive income streams.'}`,
    recommendations,
  }
}

function scoreRetirementReadiness(state: FortunaState): HealthDimension {
  const { deductions, incomeStreams, profile } = state
  const totalIncome = incomeStreams.filter(s => s.isActive).reduce((sum, s) => sum + s.annualAmount, 0)
  const retirementContributions = deductions
    .filter(d => d.category === 'retirement')
    .reduce((sum, d) => sum + d.amount, 0)

  // Also check actual retirement accounts from metamodel
  const accounts = state.retirementAccounts || []
  const accountContributions = accounts.reduce((sum, a) => sum + (a.annualContribution || 0), 0)
  const totalRetirementActivity = Math.max(retirementContributions, accountContributions)
  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0)
  const hasRoth = accounts.some(a => a.type === 'roth_ira' || a.type === 'roth_401k')
  const hasHSA = accounts.some(a => a.type === 'hsa')
  const accountCount = accounts.length

  if (totalIncome === 0) {
    return {
      id: 'retirement', name: 'Retirement Readiness', score: 50, grade: 'C-',
      weight: 0.15, color: '#f59e0b', icon: '🏦',
      status: 'No data', detail: 'Add income to assess retirement readiness.',
      recommendations: ['Complete your financial profile'],
    }
  }

  let score = 50
  const recommendations: string[] = []
  const savingsRate = totalIncome > 0 ? (totalRetirementActivity / totalIncome) * 100 : 0

  if (savingsRate >= 20) score = 95
  else if (savingsRate >= 15) score = 90
  else if (savingsRate >= 10) score = 80
  else if (savingsRate >= 5) score = 65
  else if (savingsRate > 0) score = 50
  else score = 25

  // Account diversification bonus
  if (accountCount >= 3) score += 5
  if (hasRoth && totalRetirementActivity > 0) score += 5
  if (hasHSA) score += 3

  // Balance check (rough target: age * income * 0.1)
  const age = profile.age || 35
  const roughTarget = age * totalIncome * 0.1
  if (totalBalance > 0 && totalBalance >= roughTarget) score += 5
  else if (totalBalance > 0 && totalBalance < roughTarget * 0.5) score -= 5

  if (age > 50 && savingsRate < 15) {
    score -= 10
    recommendations.push('Consider catch-up contributions (additional $7,500 for 401k if 50+)')
  }
  if (age < 30 && savingsRate >= 10) score += 5

  const selfEmploymentIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)
  if (selfEmploymentIncome > 50000 && totalRetirementActivity < 20000) {
    score -= 10
    recommendations.push('Self-employed with high income \u2014 Solo 401(k) could shelter more income')
  }

  if (totalRetirementActivity === 0) recommendations.push('Start retirement contributions \u2014 even small amounts compound significantly')
  if (savingsRate < 15 && savingsRate > 0) recommendations.push(`Current savings rate: ${savingsRate.toFixed(1)}% \u2014 target 15-20%`)
  if (!hasRoth && totalRetirementActivity > 0) recommendations.push('Consider Roth accounts for tax-free growth and withdrawal flexibility')
  if (!hasHSA && selfEmploymentIncome > 0) recommendations.push('HSA offers triple tax advantage \u2014 deductible, tax-free growth, tax-free medical withdrawals')

  score = Math.max(0, Math.min(100, score))
  const grade = scoreToGrade(score)
  const balanceStr = totalBalance > 0 ? ` Balance: $${totalBalance.toLocaleString()}.` : ''

  return {
    id: 'retirement', name: 'Retirement Readiness', score, grade,
    weight: 0.15, color: gradeColor(grade), icon: '🏦',
    status: totalRetirementActivity > 0 ? `${savingsRate.toFixed(1)}% savings rate` : 'No contributions',
    detail: `$${totalRetirementActivity.toLocaleString()}/yr in retirement contributions (${savingsRate.toFixed(1)}% of income).${balanceStr} ${accountCount} account${accountCount !== 1 ? 's' : ''}.`,
    recommendations,
  }
}

function scoreCashFlowManagement(state: FortunaState): HealthDimension {
  const totalIncome = state.incomeStreams.filter(s => s.isActive).reduce((sum, s) => sum + s.annualAmount, 0)
  const totalExpenses = state.expenses.reduce((sum, e) => sum + e.annualAmount, 0)
  const netCashFlow = totalIncome - totalExpenses

  if (totalIncome === 0) {
    return {
      id: 'cashflow', name: 'Cash Flow', score: 50, grade: 'C-',
      weight: 0.10, color: '#f59e0b', icon: '💰',
      status: 'No data', detail: 'Add income and expenses.',
      recommendations: ['Complete your financial profile'],
    }
  }

  let score = 70
  const recommendations: string[] = []
  const margin = (netCashFlow / totalIncome) * 100

  if (margin >= 40) score = 95
  else if (margin >= 30) score = 88
  else if (margin >= 20) score = 78
  else if (margin >= 10) score = 65
  else if (margin >= 0) score = 50
  else score = 25

  // Track if expenses are well-categorized
  const categorizedExpenses = state.expenses.filter(e => e.category && e.category !== 'other')
  if (categorizedExpenses.length < state.expenses.length * 0.5) score -= 5

  score = Math.max(0, Math.min(100, score))
  const grade = scoreToGrade(score)

  if (margin < 20) recommendations.push('Target 20%+ cash flow margin for financial resilience')
  if (margin < 10) recommendations.push('Cash flow is tight — review expenses for optimization opportunities')
  if (state.expenses.length === 0) recommendations.push('Add expense tracking for accurate cash flow analysis')

  return {
    id: 'cashflow', name: 'Cash Flow', score, grade,
    weight: 0.10, color: gradeColor(grade), icon: '💰',
    status: `${margin.toFixed(0)}% margin`,
    detail: `$${Math.round(netCashFlow).toLocaleString()}/yr net cash flow (${margin.toFixed(1)}% margin). ${state.expenses.length} expenses tracked.`,
    recommendations,
  }
}

// ─── Main Health Score Generator ────────────────────────────────────────

export function generateHealthReport(state: FortunaState): FinancialHealthReport {
  const dimensions: HealthDimension[] = [
    scoreTaxEfficiency(state),
    scoreEntityStructure(state),
    scoreAuditReadiness(state),
    scoreIncomeDiversification(state),
    scoreRetirementReadiness(state),
    scoreCashFlowManagement(state),
  ]

  // Conditionally add portfolio health dimension
  if (hasPortfolioData()) {
    const ph = scorePortfolioHealth()
    if (ph.score >= 0) {
      const recommendations: string[] = []
      for (const f of ph.factors) {
        if (f.score < f.maxScore * 0.7) {
          recommendations.push(`Improve ${f.name.toLowerCase()}: ${f.detail}`)
        }
      }
      if (recommendations.length === 0) recommendations.push('Portfolio health is strong \u2014 maintain current strategy')

      dimensions.push({
        id: 'portfolio',
        name: 'Portfolio Health',
        score: ph.score,
        grade: scoreToGrade(ph.score),
        weight: 0.15,
        color: '#8b5cf6',
        icon: '\uD83D\uDCBC',
        status: ph.factors.map(f => `${f.name}: ${f.score}/${f.maxScore}`).join(' \u00B7 '),
        detail: `Portfolio score: ${ph.score}/100 (${ph.grade}). ${ph.factors.length} factors evaluated.`,
        recommendations,
      })
    }
  }

  // ── Depreciation Strategy dimension (from depreciationAssets) ──────
  const depAssets = state.depreciationAssets || []
  if (depAssets.length > 0) {
    let depScore = 70
    const depRecs: string[] = []
    const activeAssets = depAssets.filter(a => a.isActive)
    const has179 = activeAssets.some(a => a.method === 'section_179')
    const hasBonus = activeAssets.some(a => a.method === 'bonus')
    const totalValue = activeAssets.reduce((s, a) => s + a.purchasePrice, 0)
    const avgBizUse = activeAssets.length > 0 ? activeAssets.reduce((s, a) => s + a.businessUsePct, 0) / activeAssets.length : 0

    if (has179 || hasBonus) depScore += 10
    if (avgBizUse >= 80) depScore += 5
    else if (avgBizUse < 50) depScore -= 10
    if (activeAssets.length >= 3) depScore += 5

    // Check for fully depreciated assets still marked active
    const fullyDep = activeAssets.filter(a => {
      const age = (new Date().getFullYear()) - new Date(a.purchaseDate).getFullYear()
      return age >= (a.usefulLifeYears || 5)
    })
    if (fullyDep.length > 0) {
      depScore -= 5
      depRecs.push(`${fullyDep.length} asset(s) may be fully depreciated \u2014 review for replacement or removal`)
    }
    if (!has179 && totalValue > 10000) depRecs.push('\u00A7179 election could accelerate deductions on qualifying assets')
    if (avgBizUse < 80) depRecs.push('Increase business use percentage where possible to maximize deductions')

    depScore = Math.max(0, Math.min(100, depScore))
    dimensions.push({
      id: 'depreciation', name: 'Asset Strategy', score: depScore, grade: scoreToGrade(depScore),
      weight: 0.08, color: gradeColor(scoreToGrade(depScore)), icon: '\uD83C\uDFED',
      status: `${activeAssets.length} assets, $${totalValue.toLocaleString()} basis`,
      detail: `${activeAssets.length} depreciable assets worth $${totalValue.toLocaleString()}. ${has179 ? '\u00A7179 active.' : ''} ${hasBonus ? 'Bonus depreciation active.' : ''} Avg business use: ${avgBizUse.toFixed(0)}%.`,
      recommendations: depRecs.length > 0 ? depRecs : ['Depreciation strategy is well-optimized'],
    })
  }

  // ── Estimated Payment Compliance dimension ──────────────────────────
  const estPayments = state.estimatedPayments || []
  if (estPayments.length > 0) {
    let payScore = 80
    const payRecs: string[] = []
    const paid = estPayments.filter(p => p.paidAmount && p.paidAmount > 0)
    const missed = estPayments.filter(p => {
      const due = new Date(p.dueDate)
      return due < new Date() && (!p.paidAmount || p.paidAmount === 0)
    })
    const underpaid = estPayments.filter(p => p.paidAmount && p.paidAmount > 0 && p.paidAmount < p.amount * 0.9)

    if (missed.length > 0) { payScore -= missed.length * 15; payRecs.push(`${missed.length} estimated payment(s) missed \u2014 may trigger underpayment penalty`) }
    if (underpaid.length > 0) { payScore -= underpaid.length * 5; payRecs.push(`${underpaid.length} payment(s) underpaid \u2014 review safe harbor requirements`) }
    if (paid.length === estPayments.length && missed.length === 0) payScore = 95

    payScore = Math.max(0, Math.min(100, payScore))
    dimensions.push({
      id: 'payments', name: 'Payment Compliance', score: payScore, grade: scoreToGrade(payScore),
      weight: 0.08, color: gradeColor(scoreToGrade(payScore)), icon: '\uD83D\uDCC5',
      status: `${paid.length}/${estPayments.length} payments made`,
      detail: `${paid.length} of ${estPayments.length} estimated payments made. ${missed.length} missed. ${underpaid.length} underpaid.`,
      recommendations: payRecs.length > 0 ? payRecs : ['Estimated payments are on track'],
    })
  }

  // ── Goal Progress dimension ─────────────────────────────────────────
  const goals = state.goals || []
  if (goals.length > 0) {
    let goalScore = 60
    const goalRecs: string[] = []
    const active = goals.filter(g => g.status === 'active')
    const completed = goals.filter(g => g.status === 'completed')
    const withProgress = active.filter(g => g.currentAmount && g.targetAmount && g.currentAmount > 0)
    const avgProgress = withProgress.length > 0
      ? withProgress.reduce((s, g) => s + ((g.currentAmount || 0) / (g.targetAmount || 1)), 0) / withProgress.length * 100
      : 0

    if (completed.length > 0) goalScore += completed.length * 5
    if (avgProgress >= 75) goalScore += 15
    else if (avgProgress >= 50) goalScore += 10
    else if (avgProgress >= 25) goalScore += 5
    if (active.length === 0 && completed.length === 0) goalScore = 40

    if (active.length > 0 && avgProgress < 25) goalRecs.push('Goals are behind pace \u2014 review strategy alignment')
    if (active.length === 0) goalRecs.push('Set financial goals to track your progress and prioritize strategies')

    goalScore = Math.max(0, Math.min(100, goalScore))
    dimensions.push({
      id: 'goals', name: 'Goal Progress', score: goalScore, grade: scoreToGrade(goalScore),
      weight: 0.08, color: gradeColor(scoreToGrade(goalScore)), icon: '\uD83C\uDFAF',
      status: `${active.length} active, ${completed.length} completed`,
      detail: `${active.length} active goals, ${completed.length} completed. ${avgProgress > 0 ? `Average progress: ${avgProgress.toFixed(0)}%.` : ''}`,
      recommendations: goalRecs.length > 0 ? goalRecs : ['Goal tracking is on target'],
    })
  }

  // ── Entity Diversification (reads entityBreakdown from tax report) ──
  const entityBreakdown = report.entityBreakdown || []
  const activeEntities = entityBreakdown.filter(e => e.revenue > 0 || e.netIncome > 0)
  if (activeEntities.length > 0) {
    let entityScore = 50
    const entityRecs: string[] = []

    // Multiple entities = diversification bonus
    if (activeEntities.length >= 3) entityScore += 20
    else if (activeEntities.length >= 2) entityScore += 10

    // Check profitability
    const profitable = activeEntities.filter(e => e.netIncome > 0)
    if (profitable.length === activeEntities.length) entityScore += 15
    else if (profitable.length > 0) entityScore += 5
    else { entityScore -= 15; entityRecs.push('No entities are currently profitable — review expense structure') }

    // Revenue concentration risk
    const totalRevenue = activeEntities.reduce((s, e) => s + e.revenue, 0)
    const maxEntityRevenue = Math.max(...activeEntities.map(e => e.revenue))
    const concentration = totalRevenue > 0 ? maxEntityRevenue / totalRevenue : 1
    if (concentration > 0.9 && activeEntities.length > 1) {
      entityScore -= 10
      entityRecs.push('90%+ revenue concentrated in one entity — diversify income streams')
    } else if (concentration < 0.6) entityScore += 10

    // S-Corp officer salary check
    const scorpEntities = activeEntities.filter(e => e.entityType === 'llc_scorp' || e.entityType === 'scorp')
    for (const se of scorpEntities) {
      if (se.officerSalary > 0 && se.netIncome > 0 && se.officerSalary / se.netIncome < 0.3) {
        entityScore -= 10
        entityRecs.push(`${se.entityName}: officer salary is ${Math.round(se.officerSalary / se.netIncome * 100)}% of net income — IRS scrutinizes below 30-40%`)
      }
    }

    entityScore = Math.max(0, Math.min(100, entityScore))
    if (entityRecs.length === 0) entityRecs.push('Entity structure appears well-optimized')

    dimensions.push({
      id: 'entity_health', name: 'Entity Diversification', score: entityScore, grade: scoreToGrade(entityScore),
      weight: 0.08, color: gradeColor(scoreToGrade(entityScore)), icon: '\uD83C\uDFE2',
      status: `${activeEntities.length} active entities, ${profitable.length} profitable`,
      detail: `${activeEntities.length} entities generating $${totalRevenue.toLocaleString()} total revenue. Concentration: ${Math.round(concentration * 100)}%.`,
      recommendations: entityRecs,
    })
  }

  // Weighted average
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0)
  const overallScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight
  )
  const overallGrade = scoreToGrade(overallScore)

  // Find top priority (lowest-scoring dimension with high weight)
  const prioritySorted = [...dimensions].sort((a, b) => (a.score * a.weight) - (b.score * b.weight))
  const topPriority = prioritySorted[0]?.recommendations[0] || 'Your financial health looks good — maintain current strategies'

  // Quick wins (recommendations from high-weight dimensions with <80 score)
  const quickWins = dimensions
    .filter(d => d.score < 80)
    .flatMap(d => d.recommendations.slice(0, 1))
    .slice(0, 3)

  // Risk flags
  const riskFlags = dimensions
    .filter(d => d.grade.startsWith('D') || d.grade === 'F')
    .map(d => `${d.name}: ${d.status}`)

  // Strengths
  const strengths = dimensions.filter(d => d.score >= 85)
  const strengthsSummary = strengths.length > 0
    ? `Strong in: ${strengths.map(d => d.name).join(', ')}`
    : 'Work on fundamentals to build financial strength'

  return {
    overallScore,
    overallGrade,
    dimensions,
    topPriority,
    quickWins,
    riskFlags,
    strengthsSummary,
  }
}
