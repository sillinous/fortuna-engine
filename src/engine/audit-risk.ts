/**
 * Fortuna Engine - Audit Risk Profiler
 * Analyzes IRS audit trigger thresholds, DIF scoring factors,
 * and generates audit probability estimates with mitigation strategies
 * 
 * Based on publicly available IRS audit statistics, DIF score factors,
 * and known audit selection criteria from tax professional literature.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'

// ─── Types ──────────────────────────────────────────────────────

export interface AuditTrigger {
  id: string
  name: string
  category: 'income' | 'deductions' | 'credits' | 'reporting' | 'entity' | 'lifestyle'
  severity: 'critical' | 'high' | 'medium' | 'low'
  riskScore: number // 0-100
  triggered: boolean
  description: string
  irsContext: string // What the IRS looks for
  mitigation: string
  documentationNeeded: string[]
  threshold?: string // The specific threshold that triggers this
}

export interface AuditRiskProfile {
  overallScore: number // 0-100 (higher = more risk)
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high' | 'very-high'
  riskLabel: string
  triggers: AuditTrigger[]
  triggeredCount: number
  totalChecks: number
  baselineAuditRate: number // National average for this income level
  adjustedAuditRate: number // Estimated adjusted rate based on triggers
  topRecommendations: string[]
  documentationScore: number // 0-100 how well documented they likely are
  redFlagCount: number
  yellowFlagCount: number
}

// ─── IRS Audit Rate by Income (2023-2024 published data) ─────────

function getBaseAuditRate(agi: number, hasSchedC: boolean): number {
  // Based on IRS Data Book published audit rates
  if (agi <= 25000) return hasSchedC ? 0.012 : 0.004
  if (agi <= 50000) return hasSchedC ? 0.009 : 0.003
  if (agi <= 75000) return hasSchedC ? 0.008 : 0.003
  if (agi <= 100000) return hasSchedC ? 0.009 : 0.004
  if (agi <= 200000) return hasSchedC ? 0.011 : 0.005
  if (agi <= 500000) return hasSchedC ? 0.015 : 0.008
  if (agi <= 1000000) return hasSchedC ? 0.022 : 0.013
  if (agi <= 5000000) return 0.028
  if (agi <= 10000000) return 0.065
  return 0.133 // $10M+ has ~13.3% audit rate
}

// ─── DIF Score Factor Analysis ───────────────────────────────────

// The IRS Discriminant Information Function (DIF) scores returns based on
// statistical norms. These are the known factors that contribute to higher DIF scores.

function analyzeScheduleCRatios(state: FortunaState, report: TaxReport): AuditTrigger[] {
  const triggers: AuditTrigger[] = []
  const seIncome = state.incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  if (seIncome === 0) return triggers

  const totalExpenses = state.expenses
    .filter(e => e.isDeductible)
    .reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)

  const expenseRatio = totalExpenses / Math.max(1, seIncome)

  // High expense-to-income ratio
  triggers.push({
    id: 'sched-c-expense-ratio',
    name: 'Schedule C Expense Ratio',
    category: 'deductions',
    severity: expenseRatio > 0.85 ? 'critical' : expenseRatio > 0.65 ? 'high' : expenseRatio > 0.45 ? 'medium' : 'low',
    riskScore: expenseRatio > 0.85 ? 85 : expenseRatio > 0.65 ? 60 : expenseRatio > 0.45 ? 35 : 10,
    triggered: expenseRatio > 0.50,
    description: `Your business expenses are ${(expenseRatio * 100).toFixed(0)}% of gross revenue. ${expenseRatio > 0.65 ? 'This exceeds the norm for your industry and may flag DIF scoring.' : 'This is within normal ranges.'}`,
    irsContext: 'The IRS DIF system flags Schedule C returns where expenses significantly deviate from statistical norms for the reported industry. Returns with expenses exceeding 65% of gross receipts receive elevated scrutiny.',
    mitigation: 'Maintain meticulous records for every deduction. Categorize expenses precisely. Consider separating personal and business expenses into distinct accounts.',
    documentationNeeded: ['Receipts for all expenses over $75', 'Mileage log if claiming vehicle', 'Home office measurements and photos', 'Business purpose documentation for each category'],
    threshold: '>50% expense-to-income ratio triggers closer review',
  })

  // Net losses on Schedule C
  const netSCIncome = seIncome - totalExpenses
  if (netSCIncome < 0) {
    const consecutiveLosses = true // Simplified - in production, track multi-year
    triggers.push({
      id: 'sched-c-losses',
      name: 'Business Net Loss',
      category: 'income',
      severity: 'high',
      riskScore: 70,
      triggered: true,
      description: `Your business shows a net loss of $${Math.abs(netSCIncome).toLocaleString()}. The IRS scrutinizes businesses that report losses, especially in consecutive years.`,
      irsContext: 'IRC §183 (hobby loss rule): If a business does not show profit in 3 of the last 5 years, the IRS may reclassify it as a hobby, disallowing deductions. Consecutive losses are a top audit trigger.',
      mitigation: 'Document your profit motive: maintain a business plan, track efforts to improve profitability, keep separate business accounts, and operate in a businesslike manner.',
      documentationNeeded: ['Written business plan', 'Records of efforts to improve profitability', 'Time and effort logs', 'Professional development expenses', 'Advisory/consulting relationships'],
      threshold: '3+ years of losses triggers §183 scrutiny',
    })
  }

  return triggers
}

function analyzeDeductionTriggers(state: FortunaState, report: TaxReport): AuditTrigger[] {
  const triggers: AuditTrigger[] = []

  // Home office deduction
  const hasHomeOffice = state.deductions.some(d => d.category === 'home_office')
  if (hasHomeOffice) {
    const homeOfficeAmt = state.deductions.filter(d => d.category === 'home_office').reduce((s, d) => s + d.amount, 0)
    triggers.push({
      id: 'home-office',
      name: 'Home Office Deduction',
      category: 'deductions',
      severity: homeOfficeAmt > 5000 ? 'medium' : 'low',
      riskScore: homeOfficeAmt > 5000 ? 45 : 20,
      triggered: true,
      description: `Home office deduction of $${homeOfficeAmt.toLocaleString()} claimed. This is a known audit trigger, though the simplified method ($5/sqft, max $1,500) has lower risk.`,
      irsContext: 'Home office deductions are audited more frequently because the IRS must verify exclusive and regular business use. The actual-expense method has higher audit risk than the simplified method.',
      mitigation: 'Use the simplified method if deduction is under $1,500. If using actual expenses, photograph the space, maintain a floor plan showing dedicated space, and document exclusive business use.',
      documentationNeeded: ['Floor plan with measurements', 'Photographs of dedicated office space', 'Utility bills and mortgage/rent statements', 'Usage log showing exclusive business use'],
    })
  }

  // Vehicle deduction
  const hasVehicle = state.deductions.some(d => d.category === 'vehicle')
  if (hasVehicle) {
    const vehicleAmt = state.deductions.filter(d => d.category === 'vehicle').reduce((s, d) => s + d.amount, 0)
    triggers.push({
      id: 'vehicle-deduction',
      name: 'Vehicle / Mileage Deduction',
      category: 'deductions',
      severity: vehicleAmt > 15000 ? 'high' : 'medium',
      riskScore: vehicleAmt > 15000 ? 55 : 30,
      triggered: true,
      description: `Vehicle deduction of $${vehicleAmt.toLocaleString()} claimed. The IRS frequently audits vehicle deductions, especially claims of 100% business use.`,
      irsContext: 'Vehicle deductions require contemporaneous mileage logs. The IRS is skeptical of 100% business-use claims. Mixed-use vehicles should have clear personal/business allocation.',
      mitigation: 'Maintain a daily mileage log (app-based like MileIQ is accepted). Never claim 100% business use unless you have a separate personal vehicle. Keep fuel receipts and maintenance records.',
      documentationNeeded: ['Contemporaneous mileage log (date, destination, purpose, miles)', 'Vehicle registration showing ownership', 'Fuel and maintenance receipts', 'Documentation of personal vehicle if claiming 100% business'],
    })
  }

  // Charitable contributions
  const charitable = state.deductions.filter(d => d.category === 'charitable').reduce((s, d) => s + d.amount, 0)
  if (charitable > 0) {
    const charitableRatio = charitable / Math.max(1, report.agi)
    triggers.push({
      id: 'charitable',
      name: 'Charitable Contributions',
      category: 'deductions',
      severity: charitableRatio > 0.15 ? 'high' : charitableRatio > 0.05 ? 'medium' : 'low',
      riskScore: charitableRatio > 0.15 ? 60 : charitableRatio > 0.05 ? 30 : 10,
      triggered: charitableRatio > 0.03,
      description: `Charitable deductions are ${(charitableRatio * 100).toFixed(1)}% of AGI ($${charitable.toLocaleString()}). ${charitableRatio > 0.10 ? 'This significantly exceeds the average for your income level.' : 'Within typical ranges.'}`,
      irsContext: 'The IRS compares charitable deductions against statistical norms by income level. Average charitable giving is 3-5% of AGI. Non-cash donations over $500 require Form 8283. Donations over $5,000 need qualified appraisals.',
      mitigation: 'Keep donation receipts from all organizations. Get written acknowledgment for donations over $250. File Form 8283 for non-cash donations over $500.',
      documentationNeeded: ['Written receipts from charitable organizations', 'Bank/credit card statements showing donations', 'Form 8283 for non-cash donations >$500', 'Qualified appraisals for items >$5,000'],
    })
  }

  // Large deduction relative to income
  const totalItemized = state.deductions.filter(d => d.isItemized).reduce((s, d) => s + d.amount, 0)
  const deductionRatio = totalItemized / Math.max(1, report.agi)
  if (totalItemized > 0 && deductionRatio > 0.30) {
    triggers.push({
      id: 'excessive-deductions',
      name: 'High Deduction-to-Income Ratio',
      category: 'deductions',
      severity: deductionRatio > 0.50 ? 'high' : 'medium',
      riskScore: deductionRatio > 0.50 ? 55 : 35,
      triggered: true,
      description: `Itemized deductions total $${totalItemized.toLocaleString()} (${(deductionRatio * 100).toFixed(0)}% of AGI). DIF scoring flags returns where deductions significantly exceed norms for the income level.`,
      irsContext: 'The DIF system compares each line item against statistical averages for the taxpayer\'s income bracket and zip code. Outliers receive higher DIF scores and are more likely to be selected for examination.',
      mitigation: 'Ensure every deduction is well-documented. Consider whether any deductions could be restructured (e.g., timing contributions across tax years).',
      documentationNeeded: ['Supporting documentation for each deduction category', 'Receipts organized by type', 'Year-over-year comparison to show consistency'],
    })
  }

  return triggers
}

function analyzeEntityTriggers(state: FortunaState, report: TaxReport): AuditTrigger[] {
  const triggers: AuditTrigger[] = []
  const hasScorp = state.entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  const seIncome = state.incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  // S-Corp reasonable salary
  if (hasScorp && seIncome > 0) {
    const reasonableSalary = seIncome * 0.6 // Common threshold
    const distributions = seIncome - reasonableSalary
    triggers.push({
      id: 'scorp-salary',
      name: 'S-Corp Reasonable Salary',
      category: 'entity',
      severity: 'high',
      riskScore: 50,
      triggered: true,
      description: `S-Corp entities must pay shareholders a "reasonable salary" before taking distributions. With $${seIncome.toLocaleString()} in revenue, ensure salary is competitive for your role and industry.`,
      irsContext: 'The IRS actively scrutinizes S-Corp officer compensation. Setting salary too low to avoid FICA taxes is one of the most common S-Corp audit triggers. The IRS uses job comparables, education, experience, and industry standards.',
      mitigation: 'Research comparable salaries using BLS data or salary surveys. Document why your salary level is reasonable. Keep records of time spent on different activities. Consider getting a reasonable compensation study.',
      documentationNeeded: ['Salary comparability study or research', 'Job description for S-Corp officer role', 'BLS or salary survey data for your industry/region', 'Board resolution setting compensation'],
      threshold: 'Salary should be 50-70% of net S-Corp income',
    })
  }

  // No entity with high income
  if (!state.entities.some(e => e.isActive && e.type !== 'sole_prop') && seIncome > 100000) {
    triggers.push({
      id: 'no-entity-high-income',
      name: 'High SE Income Without Entity',
      category: 'entity',
      severity: 'medium',
      riskScore: 25,
      triggered: true,
      description: `Operating as a sole proprietor with $${seIncome.toLocaleString()} in SE income. While not an audit trigger per se, it may indicate missed planning opportunities that could reduce overall IRS scrutiny.`,
      irsContext: 'Sole proprietorships (Schedule C) have the highest audit rates of all business entity types. S-Corps and partnerships are audited at lower rates because they require more formal record-keeping.',
      mitigation: 'Consider forming an LLC or electing S-Corp status. Entity formality inherently improves record-keeping, which reduces audit risk.',
      documentationNeeded: ['Business bank statements separate from personal', 'Clear business expense records', 'Consistent record-keeping practices'],
    })
  }

  return triggers
}

function analyzeIncomeTriggers(state: FortunaState, report: TaxReport): AuditTrigger[] {
  const triggers: AuditTrigger[] = []

  // Cash-intensive business
  const businessStreams = state.incomeStreams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  if (businessStreams.length > 0) {
    triggers.push({
      id: 'cash-income',
      name: 'Self-Employment Income Reporting',
      category: 'income',
      severity: report.grossIncome > 200000 ? 'medium' : 'low',
      riskScore: report.grossIncome > 200000 ? 35 : 15,
      triggered: report.grossIncome > 100000,
      description: `Self-employment income of $${businessStreams.reduce((s, b) => s + b.annualAmount, 0).toLocaleString()} reported. The IRS cross-references with 1099 forms filed by clients and payment processors.`,
      irsContext: 'The IRS matches reported income against 1099-NEC, 1099-K, and 1099-MISC forms. Discrepancies trigger automatic notices. Starting 2024, the $600 threshold for 1099-K means more reporting.',
      mitigation: 'Reconcile all income against 1099 forms received. Report all income even if no 1099 was received. Keep records of income sources and dates.',
      documentationNeeded: ['All 1099 forms received', 'Bank deposit records', 'Invoice records', 'Payment processor statements (PayPal, Stripe, etc.)'],
    })
  }

  // Multi-state income
  const hasMultiState = state.entities.some(e => e.state !== state.profile.state && e.isActive)
  if (hasMultiState) {
    triggers.push({
      id: 'multi-state',
      name: 'Multi-State Filing Complexity',
      category: 'reporting',
      severity: 'medium',
      riskScore: 30,
      triggered: true,
      description: 'Income earned across multiple states requires multi-state returns. Errors in state apportionment are a common audit trigger.',
      irsContext: 'State tax authorities share data with each other and the IRS. Inconsistencies between federal and state returns, or between different state returns, trigger cross-examination.',
      mitigation: 'File in all states where you have nexus. Use consistent income allocation methods. Consider consulting a tax professional for multi-state compliance.',
      documentationNeeded: ['Records of income by state', 'Days worked in each state', 'State filing requirements documentation'],
    })
  }

  // Round numbers
  const hasRoundNumbers = state.incomeStreams.some(s => s.annualAmount > 0 && s.annualAmount % 1000 === 0) ||
    state.deductions.some(d => d.amount > 500 && d.amount % 100 === 0)
  if (hasRoundNumbers) {
    triggers.push({
      id: 'round-numbers',
      name: 'Round Number Reporting',
      category: 'reporting',
      severity: 'low',
      riskScore: 15,
      triggered: true,
      description: 'Some amounts appear as round numbers. While often legitimate (e.g., set rates), the IRS DIF scoring slightly flags round-number deductions as potential estimates rather than actual amounts.',
      irsContext: 'The DIF system gives slightly higher scores to returns with many round-number deductions, as this may indicate estimation rather than actual record-keeping.',
      mitigation: 'When possible, report actual amounts rather than rounded figures. Keep detailed records that support exact amounts.',
      documentationNeeded: ['Receipts showing exact amounts', 'Accounting records with precise figures'],
    })
  }

  return triggers
}

function analyzeRetirementTriggers(state: FortunaState, report: TaxReport): AuditTrigger[] {
  const triggers: AuditTrigger[] = []

  const retirementDeductions = state.deductions.filter(d => d.category === 'retirement').reduce((s, d) => s + d.amount, 0)
  const seIncome = state.incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)

  if (retirementDeductions > 0) {
    // Check if contributions are near or at limits
    const maxSEP = Math.min(69000, (seIncome * 0.9235) * 0.25)
    if (retirementDeductions > maxSEP * 0.95) {
      triggers.push({
        id: 'retirement-near-max',
        name: 'Retirement Contributions Near Maximum',
        category: 'deductions',
        severity: retirementDeductions > maxSEP ? 'high' : 'low',
        riskScore: retirementDeductions > maxSEP ? 60 : 15,
        triggered: retirementDeductions > maxSEP,
        description: retirementDeductions > maxSEP
          ? `Retirement contributions of $${retirementDeductions.toLocaleString()} may exceed the calculated maximum of $${Math.round(maxSEP).toLocaleString()} based on your net SE income. Excess contributions trigger penalties.`
          : `Retirement contributions of $${retirementDeductions.toLocaleString()} are within limits ($${Math.round(maxSEP).toLocaleString()} max).`,
        irsContext: 'The IRS computer systems automatically flag retirement contributions that exceed statutory limits. Excess contributions are subject to 6% annual penalty tax until withdrawn.',
        mitigation: 'Verify contribution limits based on exact net self-employment income. Consider consulting with a CPA to ensure calculations are correct, especially with multiple retirement accounts.',
        documentationNeeded: ['Retirement account contribution statements', 'Form 5498 from custodian', 'Net SE income calculation worksheet'],
      })
    }
  }

  return triggers
}

// ─── Main Analysis Function ──────────────────────────────────────

export function analyzeAuditRisk(state: FortunaState): AuditRiskProfile {
  const report = generateTaxReport(state)
  const hasSchedC = state.incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive)

  // Collect all triggers
  const allTriggers: AuditTrigger[] = [
    ...analyzeScheduleCRatios(state, report),
    ...analyzeDeductionTriggers(state, report),
    ...analyzeEntityTriggers(state, report),
    ...analyzeIncomeTriggers(state, report),
    ...analyzeRetirementTriggers(state, report),
  ]

  const triggeredItems = allTriggers.filter(t => t.triggered)
  const redFlags = triggeredItems.filter(t => t.severity === 'critical' || t.severity === 'high')
  const yellowFlags = triggeredItems.filter(t => t.severity === 'medium')

  // Calculate overall risk score
  const maxPossibleScore = allTriggers.length * 100
  const actualScore = triggeredItems.reduce((sum, t) => sum + t.riskScore, 0)
  const overallScore = allTriggers.length > 0 ? Math.round((actualScore / maxPossibleScore) * 100) : 0

  // Determine risk level
  let riskLevel: AuditRiskProfile['riskLevel']
  let riskLabel: string
  if (overallScore >= 70) { riskLevel = 'very-high'; riskLabel = 'Very High Risk — Multiple red flags detected' }
  else if (overallScore >= 50) { riskLevel = 'high'; riskLabel = 'High Risk — Significant audit triggers present' }
  else if (overallScore >= 35) { riskLevel = 'elevated'; riskLabel = 'Elevated Risk — Some triggers warrant attention' }
  else if (overallScore >= 20) { riskLevel = 'moderate'; riskLabel = 'Moderate Risk — Standard filing profile' }
  else { riskLevel = 'low'; riskLabel = 'Low Risk — Clean filing profile' }

  // Calculate adjusted audit rate
  const baseRate = getBaseAuditRate(report.agi, hasSchedC)
  const riskMultiplier = 1 + (overallScore / 100) * 3 // Up to 4x base rate
  const adjustedRate = Math.min(baseRate * riskMultiplier, 0.25) // Cap at 25%

  // Documentation score (inverse of risk, simplified)
  const documentationScore = Math.max(0, 100 - overallScore - (redFlags.length * 10))

  // Top recommendations
  const topRecommendations: string[] = []
  if (redFlags.length > 0) {
    topRecommendations.push(`Address ${redFlags.length} high-severity trigger(s) immediately: ${redFlags.map(f => f.name).join(', ')}`)
  }
  if (hasSchedC) {
    topRecommendations.push('Maintain meticulous business records — Schedule C filers are audited 2-3x more often')
  }
  if (report.agi > 200000) {
    topRecommendations.push('Higher-income returns face elevated scrutiny — ensure all reporting is precise')
  }
  if (triggeredItems.some(t => t.id === 'scorp-salary')) {
    topRecommendations.push('Get a reasonable compensation study for your S-Corp salary')
  }
  topRecommendations.push('Keep all documentation for at least 7 years (3 year statute + 4 year safety margin)')

  return {
    overallScore,
    riskLevel,
    riskLabel,
    triggers: allTriggers.sort((a, b) => b.riskScore - a.riskScore),
    triggeredCount: triggeredItems.length,
    totalChecks: allTriggers.length,
    baselineAuditRate: baseRate,
    adjustedAuditRate: adjustedRate,
    topRecommendations,
    documentationScore,
    redFlagCount: redFlags.length,
    yellowFlagCount: yellowFlags.length,
  }
}
