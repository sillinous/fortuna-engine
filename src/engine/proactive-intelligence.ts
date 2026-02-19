/**
 * Fortuna Engine v5 - Proactive Intelligence System
 * Monitors financial state and generates time-sensitive, context-aware alerts.
 * This is the core differentiator — transforms Fortuna from a tool you consult
 * into a system that watches your back.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, calculateSCorpSavings, calculateMaxSEPIRA, calculateMaxSolo401k, STATE_TAX_RATES } from './tax-calculator'
import { hasPortfolioData, getPortfolioAlerts } from './portfolio-bridge'

// ==================== Types ====================

export type AlertSeverity = 'urgent' | 'warning' | 'opportunity' | 'info'
export type AlertCategory = 'tax' | 'entity' | 'audit' | 'cashflow' | 'retirement' | 'deadline' | 'strategy'

export interface ProactiveAlert {
  id: string
  title: string
  message: string
  severity: AlertSeverity
  category: AlertCategory
  impact?: number
  impactLabel?: string
  action?: string
  actionView?: string // which view to navigate to
  deadline?: string // ISO date string
  daysUntilDeadline?: number
  reasoning: string
  dismissed?: boolean
  createdAt: string
  expiresAt?: string
}

export interface TaxDeadline {
  id: string
  name: string
  date: string
  description: string
  category: 'filing' | 'payment' | 'election' | 'extension' | 'contribution'
  appliesTo: string[] // entity types or 'all'
  recurring: boolean
  priority: AlertSeverity
  actionItems: string[]
}

export interface QuarterContext {
  quarter: 1 | 2 | 3 | 4
  month: number
  dayOfMonth: number
  daysLeftInQuarter: number
  daysLeftInYear: number
  yearProgress: number // 0-1
  isQ4Rush: boolean
  isYearEnd: boolean
}

// ==================== Quarter Context ====================

export function getQuarterContext(now: Date = new Date()): QuarterContext {
  const month = now.getMonth() + 1
  const dayOfMonth = now.getDate()
  const year = now.getFullYear()
  
  const quarter = (Math.ceil(month / 3)) as 1 | 2 | 3 | 4
  
  const quarterEndDates = [
    new Date(year, 2, 31),  // Q1: Mar 31
    new Date(year, 5, 30),  // Q2: Jun 30
    new Date(year, 8, 30),  // Q3: Sep 30
    new Date(year, 11, 31), // Q4: Dec 31
  ]
  
  const yearEnd = new Date(year, 11, 31)
  const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + 1
  
  const daysLeftInQuarter = Math.max(0, Math.ceil((quarterEndDates[quarter - 1].getTime() - now.getTime()) / 86400000))
  const daysLeftInYear = Math.max(0, Math.ceil((yearEnd.getTime() - now.getTime()) / 86400000))
  
  return {
    quarter,
    month,
    dayOfMonth,
    daysLeftInQuarter,
    daysLeftInYear,
    yearProgress: dayOfYear / 365,
    isQ4Rush: quarter === 4 && month >= 11,
    isYearEnd: month === 12 && dayOfMonth >= 15,
  }
}

// ==================== Tax Calendar ====================

export function getTaxDeadlines(state: FortunaState, year: number = new Date().getFullYear()): TaxDeadline[] {
  const deadlines: TaxDeadline[] = []
  const { entities, incomeStreams, profile } = state
  
  const hasSelfEmployment = incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  const hasScorp = entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  const hasCcorp = entities.some(e => e.type === 'ccorp' && e.isActive)
  const hasPartnership = entities.some(e => e.type === 'partnership' && e.isActive)
  
  // Q1 Estimated Tax Payment
  deadlines.push({
    id: 'est-q1',
    name: 'Q1 Estimated Tax Payment',
    date: `${year}-04-15`,
    description: 'First quarterly estimated tax payment due for current tax year',
    category: 'payment',
    appliesTo: ['all'],
    recurring: true,
    priority: 'urgent',
    actionItems: ['Calculate estimated quarterly payment', 'File Form 1040-ES', 'Pay via IRS Direct Pay or EFTPS'],
  })
  
  // Personal Tax Filing
  deadlines.push({
    id: 'filing-1040',
    name: 'Personal Tax Return (1040)',
    date: `${year}-04-15`,
    description: 'Federal individual income tax return due',
    category: 'filing',
    appliesTo: ['all'],
    recurring: true,
    priority: 'urgent',
    actionItems: ['Gather all W-2s, 1099s, and K-1s', 'Compile deduction documentation', 'File Form 1040 or request extension (Form 4868)'],
  })
  
  // Q2 Estimated Tax
  deadlines.push({
    id: 'est-q2',
    name: 'Q2 Estimated Tax Payment',
    date: `${year}-06-15`,
    description: 'Second quarterly estimated tax payment',
    category: 'payment',
    appliesTo: ['all'],
    recurring: true,
    priority: 'urgent',
    actionItems: ['Review Q1 actual vs estimated income', 'Adjust payment if income changed', 'Pay via IRS Direct Pay or EFTPS'],
  })
  
  // Q3 Estimated Tax
  deadlines.push({
    id: 'est-q3',
    name: 'Q3 Estimated Tax Payment',
    date: `${year}-09-15`,
    description: 'Third quarterly estimated tax payment',
    category: 'payment',
    appliesTo: ['all'],
    recurring: true,
    priority: 'urgent',
    actionItems: ['Review YTD income trends', 'Calculate adjusted payment amount', 'Pay via IRS Direct Pay or EFTPS'],
  })
  
  // Extension deadline
  deadlines.push({
    id: 'extension-1040',
    name: 'Extended 1040 Filing Deadline',
    date: `${year}-10-15`,
    description: 'Deadline for filing if extension was requested',
    category: 'extension',
    appliesTo: ['all'],
    recurring: true,
    priority: 'urgent',
    actionItems: ['Finalize and file Form 1040', 'Note: taxes were still due April 15'],
  })
  
  // Q4 Estimated Tax
  deadlines.push({
    id: 'est-q4',
    name: 'Q4 Estimated Tax Payment',
    date: `${year + 1}-01-15`,
    description: 'Fourth quarterly estimated tax payment for prior year',
    category: 'payment',
    appliesTo: ['all'],
    recurring: true,
    priority: 'urgent',
    actionItems: ['Calculate final quarterly payment', 'Consider paying entire balance to avoid underpayment penalty', 'Pay via IRS Direct Pay or EFTPS'],
  })
  
  // S-Corp specific
  if (hasScorp) {
    deadlines.push({
      id: 'filing-1120s',
      name: 'S-Corp Tax Return (1120-S)',
      date: `${year}-03-15`,
      description: 'S-Corporation tax return and K-1 generation deadline',
      category: 'filing',
      appliesTo: ['scorp', 'llc_scorp'],
      recurring: true,
      priority: 'urgent',
      actionItems: ['Prepare Form 1120-S', 'Generate K-1 for shareholders', 'File or extend (Form 7004)'],
    })
    
    // S-Corp election deadline (for new entities)
    deadlines.push({
      id: 'election-scorp',
      name: 'S-Corp Election Deadline (2553)',
      date: `${year}-03-15`,
      description: 'Deadline for S-Corp election to be effective for current tax year',
      category: 'election',
      appliesTo: ['scorp', 'llc_scorp'],
      recurring: true,
      priority: 'warning',
      actionItems: ['File Form 2553 with IRS', 'All shareholders must consent', 'Must be filed within 75 days of formation or by March 15'],
    })
  }
  
  // C-Corp specific
  if (hasCcorp) {
    deadlines.push({
      id: 'filing-1120',
      name: 'C-Corp Tax Return (1120)',
      date: `${year}-04-15`,
      description: 'C-Corporation tax return deadline',
      category: 'filing',
      appliesTo: ['ccorp'],
      recurring: true,
      priority: 'urgent',
      actionItems: ['Prepare Form 1120', 'Calculate corporate tax liability', 'File or extend (Form 7004)'],
    })
  }
  
  // Partnership specific
  if (hasPartnership) {
    deadlines.push({
      id: 'filing-1065',
      name: 'Partnership Return (1065)',
      date: `${year}-03-15`,
      description: 'Partnership return and K-1 generation deadline',
      category: 'filing',
      appliesTo: ['partnership'],
      recurring: true,
      priority: 'urgent',
      actionItems: ['Prepare Form 1065', 'Generate K-1s for all partners', 'File or extend (Form 7004)'],
    })
  }
  
  // Retirement contribution deadlines
  if (hasSelfEmployment || hasScorp) {
    deadlines.push({
      id: 'contrib-sep',
      name: 'SEP-IRA Contribution Deadline',
      date: `${year}-04-15`,
      description: 'SEP-IRA contributions due (or extension deadline if filed)',
      category: 'contribution',
      appliesTo: ['all'],
      recurring: true,
      priority: 'opportunity',
      actionItems: ['Calculate maximum SEP-IRA contribution', 'Make contribution before filing deadline', 'Deadline extends to Oct 15 if extension filed'],
    })
    
    deadlines.push({
      id: 'contrib-solo401k',
      name: 'Solo 401(k) Employee Contribution Deadline',
      date: `${year}-12-31`,
      description: 'Employee salary deferral contributions must be made by year-end',
      category: 'contribution',
      appliesTo: ['all'],
      recurring: true,
      priority: 'warning',
      actionItems: ['Maximize employee deferral ($23,500 limit for 2025, $24,000 for 2026)', 'Catch-up contribution if age 50+ ($7,500 additional)', 'Employer contribution due at tax filing deadline'],
    })
  }
  
  // Year-end planning
  deadlines.push({
    id: 'yearend-planning',
    name: 'Year-End Tax Planning Window',
    date: `${year}-12-01`,
    description: 'Final window for tax-reduction strategies before year-end',
    category: 'payment',
    appliesTo: ['all'],
    recurring: true,
    priority: 'warning',
    actionItems: [
      'Accelerate deductible expenses into current year',
      'Defer income to next year if beneficial',
      'Harvest tax losses in investment portfolio',
      'Make charitable contributions',
      'Purchase business equipment (Section 179)',
      'Review retirement contribution maximums',
    ],
  })
  
  // Roth IRA contribution deadline
  deadlines.push({
    id: 'contrib-roth',
    name: 'IRA/Roth IRA Contribution Deadline',
    date: `${year}-04-15`,
    description: 'Last day to make IRA contributions for prior tax year',
    category: 'contribution',
    appliesTo: ['all'],
    recurring: true,
    priority: 'opportunity',
    actionItems: ['Max out Roth IRA if eligible ($7,000 limit, $8,000 if 50+)', 'Consider backdoor Roth if over income limits', 'Traditional IRA if not covered by employer plan'],
  })
  
  // Sort by date
  deadlines.sort((a, b) => a.date.localeCompare(b.date))
  
  return deadlines
}

// ==================== Proactive Alerts Generation ====================

export function generateProactiveAlerts(state: FortunaState): ProactiveAlert[] {
  const alerts: ProactiveAlert[] = []
  const now = new Date()
  const ctx = getQuarterContext(now)
  const report = generateTaxReport(state)
  const deadlines = getTaxDeadlines(state)
  const { profile, incomeStreams, expenses, deductions, entities } = state
  
  const totalIncome = incomeStreams.filter(s => s.isActive).reduce((sum, s) => sum + s.annualAmount, 0)
  const selfEmploymentIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)
  const totalDeductibleExpenses = expenses.filter(e => e.isDeductible).reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)
  const netSEIncome = selfEmploymentIncome - totalDeductibleExpenses
  
  // ===== 1. BRACKET CROSSING DETECTION =====
  const brackets2025 = [
    { rate: 10, single: 11925, mfj: 23850 },
    { rate: 12, single: 48475, mfj: 96950 },
    { rate: 22, single: 103350, mfj: 206700 },
    { rate: 24, single: 197300, mfj: 394600 },
    { rate: 32, single: 250525, mfj: 501050 },
    { rate: 35, single: 626350, mfj: 1252700 },
    { rate: 37, single: Infinity, mfj: Infinity },
  ]
  
  const isJoint = profile.filingStatus === 'married_joint'
  const taxableIncome = report.taxableIncome
  const projectedYearEnd = taxableIncome * (1 / Math.max(ctx.yearProgress, 0.1))
  
  for (let i = 0; i < brackets2025.length - 1; i++) {
    const threshold = isJoint ? brackets2025[i].mfj : brackets2025[i].single
    const nextRate = brackets2025[i + 1].rate
    const currentRate = brackets2025[i].rate
    
    if (taxableIncome < threshold && projectedYearEnd > threshold) {
      const overshoot = projectedYearEnd - threshold
      const additionalTax = overshoot * ((nextRate - currentRate) / 100)
      
      alerts.push({
        id: `bracket-cross-${nextRate}`,
        title: `Projected ${nextRate}% Bracket Crossing`,
        message: `At current income pace, you'll exceed the ${currentRate}% bracket by ~$${Math.round(overshoot).toLocaleString()} by year-end. This means ~$${Math.round(additionalTax).toLocaleString()} in additional tax at the higher rate.`,
        severity: additionalTax > 5000 ? 'urgent' : 'warning',
        category: 'tax',
        impact: additionalTax,
        impactLabel: `$${Math.round(additionalTax).toLocaleString()} additional tax`,
        action: 'Review deduction acceleration strategies',
        actionView: 'tax',
        reasoning: `Current taxable income: $${Math.round(taxableIncome).toLocaleString()}. Year-end projection: $${Math.round(projectedYearEnd).toLocaleString()}. ${currentRate}% bracket ceiling: $${threshold.toLocaleString()}.`,
        createdAt: now.toISOString(),
      })
      break
    }
  }
  
  // ===== 2. ESTIMATED TAX PAYMENT ALERTS =====
  if (selfEmploymentIncome > 0 || totalIncome > 100000) {
    const quarterlyEstimate = Math.round(report.totalFederalTax / 4)
    
    // Find next estimated tax deadline
    const estDeadlines = ['04-15', '06-15', '09-15', '01-15']
    const estMonths = [4, 6, 9, 13] // 13 = next Jan
    
    for (let i = 0; i < estDeadlines.length; i++) {
      const deadlineYear = estMonths[i] === 13 ? now.getFullYear() + 1 : now.getFullYear()
      const deadlineMonth = estMonths[i] === 13 ? 1 : estMonths[i]
      const deadline = new Date(deadlineYear, deadlineMonth - 1, 15)
      const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
      
      if (daysUntil > 0 && daysUntil <= 45) {
        alerts.push({
          id: `est-tax-q${i + 1}`,
          title: `Q${i + 1} Estimated Tax Due in ${daysUntil} Days`,
          message: `Your estimated quarterly tax payment of ~$${quarterlyEstimate.toLocaleString()} is due ${deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Late payment triggers underpayment penalties.`,
          severity: daysUntil <= 14 ? 'urgent' : 'warning',
          category: 'deadline',
          impact: quarterlyEstimate,
          impactLabel: `$${quarterlyEstimate.toLocaleString()} due`,
          action: 'Generate 1040-ES voucher',
          actionView: 'documents',
          deadline: deadline.toISOString(),
          daysUntilDeadline: daysUntil,
          reasoning: `Total estimated federal tax: $${Math.round(report.totalFederalTax).toLocaleString()} ÷ 4 = $${quarterlyEstimate.toLocaleString()} per quarter.`,
          createdAt: now.toISOString(),
        })
        break
      }
    }
  }
  
  // ===== 3. RETIREMENT CONTRIBUTION OPTIMIZATION =====
  const retirementDeductions = deductions.filter(d => d.category === 'retirement')
  const currentRetirement = retirementDeductions.reduce((sum, d) => sum + d.amount, 0)
  
  if (netSEIncome > 30000) {
    const maxSEP = calculateMaxSEPIRA(netSEIncome)
    const max401k = calculateMaxSolo401k(netSEIncome, profile.age)
    const bestOption = max401k.total > maxSEP ? { name: 'Solo 401(k)', max: max401k.total, detail: max401k } : { name: 'SEP-IRA', max: maxSEP, detail: null }
    
    if (currentRetirement < bestOption.max * 0.5) {
      const gap = bestOption.max - currentRetirement
      const taxSavings = gap * (report.effectiveRate / 100)
      
      alerts.push({
        id: 'retirement-gap',
        title: 'Retirement Contribution Gap',
        message: `You're contributing $${currentRetirement.toLocaleString()} but could contribute up to $${Math.round(bestOption.max).toLocaleString()} to a ${bestOption.name}. The additional $${Math.round(gap).toLocaleString()} would save ~$${Math.round(taxSavings).toLocaleString()} in taxes this year.`,
        severity: gap > 20000 ? 'warning' : 'opportunity',
        category: 'retirement',
        impact: taxSavings,
        impactLabel: `$${Math.round(taxSavings).toLocaleString()} tax savings`,
        action: 'View retirement strategy',
        actionView: 'tax',
        reasoning: `Net SE income: $${Math.round(netSEIncome).toLocaleString()}. Max ${bestOption.name}: $${Math.round(bestOption.max).toLocaleString()}. Current contributions: $${currentRetirement.toLocaleString()}. Effective tax rate: ${report.effectiveRate.toFixed(1)}%.`,
        createdAt: now.toISOString(),
      })
    }
    
    // Year-end urgency for Solo 401k employee contributions
    if (ctx.quarter === 4 && ctx.daysLeftInYear <= 45 && currentRetirement < (max401k.employeeDeferral || 23500)) {
      alerts.push({
        id: 'solo401k-yearend',
        title: 'Solo 401(k) Employee Deferral Deadline Approaching',
        message: `Employee salary deferrals to a Solo 401(k) must be made by December 31. You have ${ctx.daysLeftInYear} days to contribute up to $${(23500).toLocaleString()} in employee deferrals.`,
        severity: 'urgent',
        category: 'deadline',
        daysUntilDeadline: ctx.daysLeftInYear,
        action: 'Maximize 401(k) contributions',
        actionView: 'tax',
        reasoning: 'Employee deferral deadline is always December 31, regardless of tax filing extensions. Employer contributions can be made until filing deadline.',
        createdAt: now.toISOString(),
      })
    }
  }
  
  // ===== 4. S-CORP ELECTION OPPORTUNITY =====
  const hasScorp = entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  if (!hasScorp && netSEIncome > 50000) {
    const reasonableSalary = Math.round(Math.max(netSEIncome * 0.5, Math.min(netSEIncome * 0.7, 80000)))
    const savings = calculateSCorpSavings(netSEIncome, reasonableSalary)
    
    if (savings.savings > 3000) {
      // Check if S-Corp election deadline is approaching
      const isBeforeMarch15 = ctx.month <= 3 && (ctx.month < 3 || ctx.dayOfMonth <= 15)
      
      alerts.push({
        id: 'scorp-opportunity',
        title: `S-Corp Could Save $${savings.savings.toLocaleString()}/yr`,
        message: isBeforeMarch15
          ? `You have until March 15 to file Form 2553 for S-Corp election effective this year. With net SE income of $${Math.round(netSEIncome).toLocaleString()}, you'd save ~$${savings.savings.toLocaleString()}/year in self-employment tax.`
          : `Your income level of $${Math.round(netSEIncome).toLocaleString()} makes you an excellent S-Corp candidate. File Form 2553 to start saving $${savings.savings.toLocaleString()}/year in SE tax starting next year.`,
        severity: isBeforeMarch15 ? 'urgent' : 'opportunity',
        category: 'entity',
        impact: savings.savings,
        impactLabel: `$${savings.savings.toLocaleString()}/yr savings`,
        action: 'View entity comparison',
        actionView: 'entity',
        deadline: isBeforeMarch15 ? `${now.getFullYear()}-03-15` : undefined,
        daysUntilDeadline: isBeforeMarch15 ? Math.ceil((new Date(now.getFullYear(), 2, 15).getTime() - now.getTime()) / 86400000) : undefined,
        reasoning: `Current SE tax: $${savings.currentSETax.toLocaleString()}. After S-Corp (salary $${reasonableSalary.toLocaleString()}): $${savings.sCorpSETax.toLocaleString()}.`,
        createdAt: now.toISOString(),
      })
    }
  }
  
  // ===== 5. AUDIT RISK THRESHOLD ALERTS =====
  const homeOfficeDeduction = deductions.filter(d => d.category === 'home_office').reduce((sum, d) => sum + d.amount, 0)
  const charitableDeduction = deductions.filter(d => d.category === 'charitable').reduce((sum, d) => sum + d.amount, 0)
  const vehicleDeduction = deductions.filter(d => d.category === 'vehicle').reduce((sum, d) => sum + d.amount, 0)
  
  // Home office audit flag
  if (homeOfficeDeduction > 0 && totalIncome > 0) {
    const homeOfficeRatio = homeOfficeDeduction / totalIncome
    if (homeOfficeRatio > 0.15) {
      alerts.push({
        id: 'audit-home-office',
        title: 'Home Office Deduction Approaching Audit Threshold',
        message: `Your home office deduction ($${homeOfficeDeduction.toLocaleString()}) is ${(homeOfficeRatio * 100).toFixed(1)}% of gross income — IRS attention increases above 15%. Consider restructuring or ensuring meticulous documentation.`,
        severity: homeOfficeRatio > 0.25 ? 'warning' : 'info',
        category: 'audit',
        action: 'Review audit risk profile',
        actionView: 'audit',
        reasoning: `Home office: $${homeOfficeDeduction.toLocaleString()} / Gross income: $${totalIncome.toLocaleString()} = ${(homeOfficeRatio * 100).toFixed(1)}% ratio. IRS DIF scoring flags returns with unusually high deduction-to-income ratios.`,
        createdAt: now.toISOString(),
      })
    }
  }
  
  // Charitable over 50% AGI
  if (charitableDeduction > 0 && report.agi > 0) {
    const charRatio = charitableDeduction / report.agi
    if (charRatio > 0.30) {
      alerts.push({
        id: 'audit-charitable',
        title: 'Charitable Deductions Drawing Attention',
        message: `Charitable contributions of $${charitableDeduction.toLocaleString()} represent ${(charRatio * 100).toFixed(1)}% of AGI. Ensure you have acknowledgment letters for all donations over $250 and Form 8283 for non-cash gifts over $500.`,
        severity: charRatio > 0.50 ? 'warning' : 'info',
        category: 'audit',
        action: 'Review audit preparedness',
        actionView: 'audit',
        reasoning: `Charitable: $${charitableDeduction.toLocaleString()} / AGI: $${Math.round(report.agi).toLocaleString()} = ${(charRatio * 100).toFixed(1)}%. Deduction limited to 60% of AGI for cash, 30% for appreciated assets.`,
        createdAt: now.toISOString(),
      })
    }
  }
  
  // ===== 6. Q4 YEAR-END ACCELERATION =====
  if (ctx.quarter === 4) {
    const potentialDeductions: string[] = []
    let potentialSavings = 0
    
    // Business equipment (Section 179)
    if (selfEmploymentIncome > 50000) {
      potentialDeductions.push('Business equipment purchases (Section 179 immediate deduction)')
    }
    
    // Prepay expenses
    if (netSEIncome > 30000) {
      potentialDeductions.push('Prepay Q1 rent, insurance, or subscriptions')
      potentialSavings += netSEIncome * 0.02
    }
    
    // Charitable contributions
    potentialDeductions.push('Make planned charitable contributions before Dec 31')
    
    // Tax loss harvesting
    potentialDeductions.push('Harvest investment losses to offset gains')
    
    if (potentialDeductions.length > 0) {
      alerts.push({
        id: 'q4-acceleration',
        title: `${ctx.daysLeftInYear} Days Left for Year-End Tax Moves`,
        message: `Key strategies before December 31:\n${potentialDeductions.map(d => `• ${d}`).join('\n')}`,
        severity: ctx.daysLeftInYear <= 15 ? 'urgent' : 'warning',
        category: 'strategy',
        action: 'Launch year-end workflow',
        actionView: 'workflows',
        daysUntilDeadline: ctx.daysLeftInYear,
        reasoning: `Q4 is the last window for deduction acceleration, income deferral, and contribution maximization. These strategies cannot be retroactively applied after December 31.`,
        createdAt: now.toISOString(),
      })
    }
  }
  
  // ===== 7. INCOME DIVERSIFICATION =====
  if (incomeStreams.filter(s => s.isActive).length === 1 && totalIncome > 0) {
    alerts.push({
      id: 'diversification',
      title: 'Single Income Stream Risk',
      message: 'Your entire income depends on one source. Consider diversifying with additional revenue streams to reduce risk and unlock additional tax optimization strategies.',
      severity: 'info',
      category: 'strategy',
      action: 'Explore revenue strategies',
      actionView: 'revenue',
      reasoning: 'Single-source income creates concentration risk and limits entity structuring options. Multiple income types enable more sophisticated tax optimization.',
      createdAt: now.toISOString(),
    })
  }
  
  // ===== 8. MISSING DEDUCTION CATEGORIES =====
  const deductionCategories = new Set(deductions.map(d => d.category))
  const missingHighValue: { cat: string; label: string; hint: string }[] = []
  
  if (selfEmploymentIncome > 0) {
    if (!deductionCategories.has('home_office') && !deductionCategories.has('vehicle')) {
      missingHighValue.push({ cat: 'home_office', label: 'Home Office', hint: 'If you use part of your home regularly and exclusively for business' })
    }
    if (!deductionCategories.has('retirement')) {
      missingHighValue.push({ cat: 'retirement', label: 'Retirement', hint: 'SEP-IRA, Solo 401(k), or SIMPLE IRA contributions' })
    }
    if (!deductionCategories.has('health') && !profile.hasHealthInsurance) {
      missingHighValue.push({ cat: 'health', label: 'Health Insurance', hint: 'Self-employed health insurance deduction (above-the-line)' })
    }
  }
  
  if (missingHighValue.length > 0) {
    const totalPotential = missingHighValue.length * 3000 // rough estimate
    alerts.push({
      id: 'missing-deductions',
      title: `${missingHighValue.length} Potential Deduction${missingHighValue.length > 1 ? 's' : ''} Not Claimed`,
      message: `You may be missing: ${missingHighValue.map(m => `${m.label} (${m.hint})`).join('; ')}. Adding these could reduce your tax bill significantly.`,
      severity: 'opportunity',
      category: 'tax',
      action: 'Update deductions',
      actionView: 'setup',
      reasoning: `Common high-value deductions not found in your profile. Each could save hundreds to thousands annually depending on your situation.`,
      createdAt: now.toISOString(),
    })
  }
  
  // ===== 9. STATE TAX OPTIMIZATION =====
  const stateRate = STATE_TAX_RATES[profile.state] || 0
  if (stateRate > 0.06 && totalIncome > 100000) {
    const noTaxStates = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY']
    const currentStateTax = totalIncome * stateRate
    
    alerts.push({
      id: 'state-tax-optimization',
      title: `State Tax: $${Math.round(currentStateTax).toLocaleString()}/yr (${(stateRate * 100).toFixed(1)}%)`,
      message: `Your ${profile.state} state tax rate of ${(stateRate * 100).toFixed(1)}% costs ~$${Math.round(currentStateTax).toLocaleString()} annually. If your work is location-independent, states like ${noTaxStates.slice(0, 4).join(', ')} have no income tax.`,
      severity: currentStateTax > 10000 ? 'opportunity' : 'info',
      category: 'tax',
      impact: currentStateTax,
      impactLabel: `$${Math.round(currentStateTax).toLocaleString()}/yr state tax`,
      action: 'Compare state scenarios',
      actionView: 'scenarios',
      reasoning: `Current state: ${profile.state} (${(stateRate * 100).toFixed(1)}%). This is informational — relocation decisions involve many factors beyond tax savings.`,
      createdAt: now.toISOString(),
    })
  }
  
  // ===== 10. UNDERPAYMENT PENALTY RISK =====
  if (report.totalFederalTax > 1000 && selfEmploymentIncome > 0) {
    const annualizedIncome = totalIncome * (1 / Math.max(ctx.yearProgress, 0.1))
    const annualizedTax = report.totalFederalTax * (1 / Math.max(ctx.yearProgress, 0.1))
    
    // Safe harbor: must pay lesser of 100% of prior year tax or 90% of current year tax
    // Since we don't have prior year, flag if quarterly payments would be high
    const quarterlyRequired = Math.round(annualizedTax / 4)
    
    if (quarterlyRequired > 2500) {
      alerts.push({
        id: 'underpayment-risk',
        title: 'Underpayment Penalty Prevention',
        message: `Based on current income, your estimated quarterly tax payment should be ~$${quarterlyRequired.toLocaleString()}. Ensure you're making timely 1040-ES payments to avoid underpayment penalties (currently ~8% annualized).`,
        severity: 'info',
        category: 'tax',
        impact: quarterlyRequired * 4,
        impactLabel: `$${quarterlyRequired.toLocaleString()}/quarter`,
        action: 'View estimated tax details',
        actionView: 'cashflow',
        reasoning: `Annualized tax projection: $${Math.round(annualizedTax).toLocaleString()}. Safe harbor requires paying at least 90% of current year liability in estimated payments, or 100% of prior year tax.`,
        createdAt: now.toISOString(),
      })
    }
  }
  
  // ── Portfolio Intelligence alerts ────────────────────────────────
  if (hasPortfolioData()) {
    const portfolioAlerts = getPortfolioAlerts()
    for (const pa of portfolioAlerts) {
      alerts.push({
        id: pa.id,
        title: pa.title,
        message: pa.message,
        severity: pa.severity,
        category: pa.category as AlertCategory,
        impact: pa.impact,
        impactLabel: pa.impact ? `$${pa.impact.toLocaleString()}` : undefined,
        action: 'View in Portfolio Intelligence',
        actionView: pa.actionView,
        reasoning: pa.message,
        createdAt: new Date().toISOString(),
      })
    }
  }
  
  // ===== METAMODEL-AWARE ALERTS =====

  // Estimated Payment Tracking (from actual estimatedPayments[])
  const estPayments = state.estimatedPayments || []
  if (estPayments.length > 0) {
    const missed = estPayments.filter(p => {
      const due = new Date(p.dueDate)
      return due < now && (!p.paidAmount || p.paidAmount === 0)
    })
    if (missed.length > 0) {
      const totalMissed = missed.reduce((s, p) => s + p.amount, 0)
      alerts.push({
        id: 'est-payment-missed',
        title: `${missed.length} Estimated Payment(s) Past Due`,
        message: `$${totalMissed.toLocaleString()} in estimated tax payments are past due. Late payments accrue interest and may trigger an underpayment penalty (Form 2210).`,
        severity: 'urgent', category: 'tax', impact: Math.round(totalMissed * 0.04),
        impactLabel: `~$${Math.round(totalMissed * 0.04).toLocaleString()} potential penalty`,
        action: 'Make payments immediately to minimize penalties',
        actionView: 'calendar', reasoning: `Past due payments: ${missed.map(p => p.dueDate).join(', ')}`,
        createdAt: now.toISOString(),
      })
    }
    const upcoming = estPayments.filter(p => {
      const due = new Date(p.dueDate)
      const daysUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      return daysUntil > 0 && daysUntil <= 30 && (!p.paidAmount || p.paidAmount === 0)
    })
    if (upcoming.length > 0) {
      const amt = upcoming.reduce((s, p) => s + p.amount, 0)
      alerts.push({
        id: 'est-payment-upcoming',
        title: `Estimated Payment Due Within 30 Days`,
        message: `$${amt.toLocaleString()} estimated tax payment due ${upcoming[0].dueDate}. Ensure funds are available to avoid underpayment penalties.`,
        severity: 'warning', category: 'tax', impact: amt,
        impactLabel: `$${amt.toLocaleString()} due`, action: 'Prepare quarterly payment',
        actionView: 'calendar', reasoning: `Next payment: $${amt.toLocaleString()} due ${upcoming[0].dueDate}`,
        createdAt: now.toISOString(),
      })
    }
  }

  // Depreciation Asset Alerts
  const depAssets = (state.depreciationAssets || []).filter(a => a.isActive)
  if (depAssets.length > 0) {
    const currentYear = now.getFullYear()
    const yearEndApproaching = now.getMonth() >= 9 // October+
    const no179 = depAssets.filter(a => a.method !== 'section_179' && a.purchasePrice >= 5000)
    if (yearEndApproaching && no179.length > 0) {
      const totalBasis = no179.reduce((s, a) => s + a.purchasePrice, 0)
      alerts.push({
        id: 'depreciation-179-opportunity',
        title: `\u00A7179 Opportunity: $${totalBasis.toLocaleString()} in Assets`,
        message: `${no179.length} asset(s) totaling $${totalBasis.toLocaleString()} could qualify for \u00A7179 immediate expensing. Year-end is approaching \u2014 consider electing \u00A7179 to accelerate deductions into ${currentYear}.`,
        severity: 'opportunity', category: 'tax', impact: Math.round(totalBasis * 0.25),
        impactLabel: `~$${Math.round(totalBasis * 0.25).toLocaleString()} potential savings`,
        action: 'Review \u00A7179 election in Depreciation module',
        actionView: 'depreciation', reasoning: `Assets without \u00A7179: ${no179.map(a => a.name).slice(0, 3).join(', ')}`,
        createdAt: now.toISOString(),
      })
    }
  }

  // Retirement Contribution Gap
  const retAccounts = state.retirementAccounts || []
  if (retAccounts.length > 0 && selfEmploymentIncome > 50000) {
    const totalContrib = retAccounts.reduce((s, a) => s + (a.annualContribution || 0), 0)
    const maxPossible = retAccounts.reduce((s, a) => s + (a.maxContribution || 0), 0)
    const gap = maxPossible - totalContrib
    if (gap > 5000) {
      alerts.push({
        id: 'retirement-gap',
        title: `$${gap.toLocaleString()} Retirement Contribution Gap`,
        message: `You're contributing $${totalContrib.toLocaleString()}/yr but could contribute up to $${maxPossible.toLocaleString()}/yr across ${retAccounts.length} account(s). The $${gap.toLocaleString()} gap represents missed tax deductions.`,
        severity: 'opportunity', category: 'optimization', impact: Math.round(gap * 0.25),
        impactLabel: `~$${Math.round(gap * 0.25).toLocaleString()} tax savings`,
        action: 'Maximize retirement contributions',
        actionView: 'retirement', reasoning: `Current: $${totalContrib.toLocaleString()}, Max: $${maxPossible.toLocaleString()}`,
        createdAt: now.toISOString(),
      })
    }
  }

  // Goal Progress Alerts
  const goals = (state.goals || []).filter(g => g.status === 'active')
  for (const goal of goals.slice(0, 2)) {
    if (goal.targetDate && goal.targetAmount && goal.currentAmount !== undefined) {
      const daysLeft = (new Date(goal.targetDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      const progress = (goal.currentAmount || 0) / goal.targetAmount
      if (daysLeft < 90 && progress < 0.5) {
        alerts.push({
          id: `goal-behind-${goal.id}`,
          title: `Goal "${goal.title}" Behind Pace`,
          message: `${Math.round(progress * 100)}% progress with ${Math.round(daysLeft)} days remaining. Target: $${goal.targetAmount.toLocaleString()}.`,
          severity: 'warning', category: 'optimization', impact: goal.targetAmount - (goal.currentAmount || 0),
          impactLabel: `$${(goal.targetAmount - (goal.currentAmount || 0)).toLocaleString()} remaining`,
          action: 'Review goal strategy', actionView: 'goals',
          reasoning: `Goal: ${goal.title}, progress: ${Math.round(progress * 100)}%, deadline: ${goal.targetDate}`,
          createdAt: now.toISOString(),
        })
      }
    }
  }

  // Sort: urgent first, then warning, then opportunity, then info
  const severityOrder: Record<AlertSeverity, number> = { urgent: 0, warning: 1, opportunity: 2, info: 3 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
  
  return alerts
}

// ==================== Financial Pulse Summary ====================

export interface FinancialPulse {
  headline: string
  subheadline: string
  urgentCount: number
  opportunityCount: number
  estimatedSavingsAvailable: number
  nextDeadline: { name: string; daysUntil: number; date: string } | null
  quarterSummary: string
}

export function getFinancialPulse(state: FortunaState): FinancialPulse {
  const alerts = generateProactiveAlerts(state)
  const ctx = getQuarterContext()
  const deadlines = getTaxDeadlines(state)
  const now = new Date()
  
  const urgentCount = alerts.filter(a => a.severity === 'urgent').length
  const opportunityCount = alerts.filter(a => a.severity === 'opportunity').length
  const estimatedSavings = alerts
    .filter(a => a.impact && (a.category === 'tax' || a.category === 'entity' || a.category === 'retirement'))
    .reduce((sum, a) => sum + (a.impact || 0), 0)
  
  // Find next deadline
  let nextDeadline: FinancialPulse['nextDeadline'] = null
  for (const d of deadlines) {
    const deadlineDate = new Date(d.date)
    const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / 86400000)
    if (daysUntil > 0) {
      nextDeadline = { name: d.name, daysUntil, date: d.date }
      break
    }
  }
  
  // Generate headline
  let headline = ''
  let subheadline = ''
  
  if (urgentCount > 0) {
    headline = `${urgentCount} urgent item${urgentCount > 1 ? 's' : ''} need${urgentCount === 1 ? 's' : ''} attention`
    subheadline = alerts.find(a => a.severity === 'urgent')?.title || ''
  } else if (opportunityCount > 0) {
    headline = `$${Math.round(estimatedSavings).toLocaleString()} in potential savings identified`
    subheadline = `${opportunityCount} optimization opportunit${opportunityCount > 1 ? 'ies' : 'y'} available`
  } else {
    headline = 'Financial position looks solid'
    subheadline = 'No urgent items — keep monitoring'
  }
  
  const quarterNames = ['', 'Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)']
  const quarterSummary = `${quarterNames[ctx.quarter]} • ${ctx.daysLeftInQuarter} days remaining • Year ${Math.round(ctx.yearProgress * 100)}% complete`
  
  return {
    headline,
    subheadline,
    urgentCount,
    opportunityCount,
    estimatedSavingsAvailable: estimatedSavings,
    nextDeadline,
    quarterSummary,
  }
}
