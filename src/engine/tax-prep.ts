/**
 * Fortuna Engine - Tax Preparation Checklist
 * Generates a comprehensive filing preparation summary organized by form,
 * with document tracking and CPA-ready export data.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'

export interface TaxPrepItem {
  id: string
  form: string
  description: string
  category: 'income' | 'deduction' | 'entity' | 'payment' | 'document' | 'action'
  status: 'complete' | 'partial' | 'missing' | 'na'
  amount?: number
  notes: string
  priority: 'required' | 'recommended' | 'optional'
  dueDate?: string
}

export interface TaxPrepSection {
  title: string
  icon: string
  items: TaxPrepItem[]
  completionPct: number
}

export interface TaxPrepChecklist {
  filingYear: number
  filingDeadline: string
  filingStatus: string
  sections: TaxPrepSection[]
  overallCompletion: number
  estimatedRefundOrOwed: number
  isRefund: boolean
  criticalMissing: TaxPrepItem[]
  summary: {
    totalIncome: number
    totalDeductions: number
    totalTax: number
    totalWithheld: number
    totalEstimatedPaid: number
    netOwed: number
  }
}

export function generateTaxPrepChecklist(state: FortunaState): TaxPrepChecklist {
  const report = generateTaxReport(state)
  const year = new Date().getFullYear() - 1 // Prep is for prior year
  const filingDeadline = `April 15, ${year + 1}`
  
  const sections: TaxPrepSection[] = []

  // ─── Section 1: W-2 Income ──────────────────────────────────────
  const w2Streams = state.incomeStreams.filter(s => s.type === 'w2' && s.isActive)
  const w2Items: TaxPrepItem[] = w2Streams.map((s, i) => {
    const w2 = s.w2 || {}
    const hasBasic = s.annualAmount > 0
    const hasWithholding = (w2.federalWithholding || 0) > 0
    const status = hasBasic && hasWithholding ? 'complete' : hasBasic ? 'partial' : 'missing'
    return {
      id: `w2-${i}`, form: 'W-2', description: `${w2.employerName || s.name || 'Employer'} — Wages`,
      category: 'income' as const, status,
      amount: s.annualAmount,
      notes: status === 'complete'
        ? `Wages: $${s.annualAmount.toLocaleString()}, Fed withheld: $${(w2.federalWithholding || 0).toLocaleString()}`
        : status === 'partial' ? 'Missing withholding details — enter federal/state withheld amounts'
        : 'Need W-2 from employer',
      priority: 'required' as const,
    }
  })
  if (w2Items.length === 0 && w2Streams.length === 0) {
    // Check if they might need W-2s
    w2Items.push({
      id: 'w2-check', form: 'W-2', description: 'Confirm: Any employment income this year?',
      category: 'document', status: 'na', notes: 'No W-2 income entered. If you had employment income, add it in Setup.',
      priority: 'recommended',
    })
  }
  sections.push(buildSection('W-2 Employment Income', '💼', w2Items))

  // ─── Section 2: Self-Employment / Schedule C ──────────────────────
  const seStreams = state.incomeStreams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  const seItems: TaxPrepItem[] = []
  if (seStreams.length > 0) {
    const totalSE = seStreams.reduce((s, i) => s + i.annualAmount, 0)
    const bizExpenses = state.expenses.filter(e => e.isDeductible).reduce((s, e) => s + e.annualAmount, 0)
    seItems.push({
      id: 'sched-c-income', form: 'Schedule C', description: 'Gross Business Income',
      category: 'income', status: totalSE > 0 ? 'complete' : 'missing',
      amount: totalSE, notes: `${seStreams.length} business income stream(s) totaling $${totalSE.toLocaleString()}`,
      priority: 'required',
    })
    seItems.push({
      id: 'sched-c-expenses', form: 'Schedule C', description: 'Business Expenses',
      category: 'deduction', status: bizExpenses > 0 ? 'complete' : 'partial',
      amount: bizExpenses, notes: bizExpenses > 0
        ? `$${bizExpenses.toLocaleString()} in deductible expenses entered`
        : 'No business expenses entered — likely missing deductions',
      priority: 'required',
    })
    seItems.push({
      id: 'sched-se', form: 'Schedule SE', description: 'Self-Employment Tax',
      category: 'payment', status: 'complete',
      amount: report.selfEmploymentTax,
      notes: `SE tax: $${report.selfEmploymentTax.toLocaleString()} (15.3% on 92.35% of net SE income)`,
      priority: 'required',
    })
    // 1099 tracking
    for (const s of seStreams) {
      seItems.push({
        id: `1099-${s.id}`, form: '1099-NEC/MISC', description: `${s.name || 'Business'} — collect 1099 forms`,
        category: 'document', status: 'missing',
        notes: `Clients who paid $600+ should send 1099-NEC. Check for $${s.annualAmount.toLocaleString()} income.`,
        priority: 'recommended',
      })
    }
  }
  if (seItems.length > 0) sections.push(buildSection('Self-Employment / Schedule C', '🏢', seItems))

  // ─── Section 3: Entity K-1s ────────────────────────────────────────
  const activeEntities = state.entities.filter(e => e.isActive)
  const entityItems: TaxPrepItem[] = activeEntities.map(e => ({
    id: `k1-${e.id}`, form: e.type.includes('scorp') ? 'Schedule K-1 (1120-S)' : 'Schedule K-1 (1065)',
    description: `${e.name} — ${e.type.toUpperCase()} K-1`,
    category: 'entity' as const, status: 'missing' as const,
    notes: `Need K-1 from ${e.name}. Entity return (${e.type.includes('scorp') ? '1120-S' : '1065'}) due March 15.`,
    priority: 'required' as const, dueDate: `March 15, ${year + 1}`,
  }))
  if (activeEntities.length > 0) {
    entityItems.push({
      id: 'entity-return', form: activeEntities[0].type.includes('scorp') ? '1120-S' : '1065',
      description: 'Entity Tax Return Filing',
      category: 'action', status: 'missing',
      notes: `Entity return due March 15 (before personal return). File or extend.`,
      priority: 'required', dueDate: `March 15, ${year + 1}`,
    })
  }
  if (entityItems.length > 0) sections.push(buildSection('Entity / Pass-Through K-1s', '🏛️', entityItems))

  // ─── Section 4: Deductions ─────────────────────────────────────────
  const dedItems: TaxPrepItem[] = []
  const retirementDeds = state.deductions.filter(d => d.category === 'retirement')
  const totalRetirement = retirementDeds.reduce((s, d) => s + d.amount, 0)
  const w2Retirement = w2Streams.reduce((s, i) => s + (i.w2?.pretax401k || 0), 0)
  if (totalRetirement + w2Retirement > 0) {
    dedItems.push({
      id: 'retirement-ded', form: 'Form 8880 / 1040', description: 'Retirement Contributions',
      category: 'deduction', status: 'complete', amount: totalRetirement + w2Retirement,
      notes: `Total: $${(totalRetirement + w2Retirement).toLocaleString()} (W-2 401k: $${w2Retirement.toLocaleString()}, Other: $${totalRetirement.toLocaleString()})`,
      priority: 'required',
    })
  }
  // Standard vs Itemized
  const stdDed = report.standardDeduction || 14600
  const itemizedTotal = state.deductions.filter(d => !['retirement', 'above_line'].includes(d.category)).reduce((s, d) => s + d.amount, 0)
  dedItems.push({
    id: 'std-vs-itemized', form: 'Schedule A / 1040', description: 'Standard vs. Itemized Deduction',
    category: 'deduction', status: 'complete',
    amount: Math.max(stdDed, itemizedTotal),
    notes: itemizedTotal > stdDed
      ? `Itemizing saves $${(itemizedTotal - stdDed).toLocaleString()} over standard deduction`
      : `Standard deduction ($${stdDed.toLocaleString()}) is better than itemized ($${itemizedTotal.toLocaleString()})`,
    priority: 'required',
  })
  if (report.qbiDeduction > 0) {
    dedItems.push({
      id: 'qbi', form: 'Form 8995', description: 'QBI Deduction (Section 199A)',
      category: 'deduction', status: 'complete', amount: report.qbiDeduction,
      notes: `$${report.qbiDeduction.toLocaleString()} QBI deduction (20% of qualified business income)`,
      priority: 'required',
    })
  }
  sections.push(buildSection('Deductions & Adjustments', '📋', dedItems))

  // ─── Section 5: Tax Payments Made ──────────────────────────────────
  const paymentItems: TaxPrepItem[] = []
  const fedWithheld = report.w2FederalWithheld
  const stateWithheld = report.w2StateWithheld
  const ficaWithheld = report.w2FICAWithheld
  if (fedWithheld > 0) {
    paymentItems.push({
      id: 'w2-fed-withheld', form: 'W-2 Box 2', description: 'Federal Income Tax Withheld',
      category: 'payment', status: 'complete', amount: fedWithheld,
      notes: `$${fedWithheld.toLocaleString()} withheld from W-2 paychecks`,
      priority: 'required',
    })
  }
  if (stateWithheld > 0) {
    paymentItems.push({
      id: 'w2-state-withheld', form: 'W-2 Box 17', description: 'State Income Tax Withheld',
      category: 'payment', status: 'complete', amount: stateWithheld,
      notes: `$${stateWithheld.toLocaleString()} state tax withheld`,
      priority: 'required',
    })
  }
  // Estimated tax payments
  paymentItems.push({
    id: 'est-q1', form: '1040-ES', description: 'Q1 Estimated Payment (Apr 15)',
    category: 'payment', status: 'missing', notes: 'Enter amount of Q1 estimated tax payment made, if any',
    priority: seStreams.length > 0 ? 'required' : 'optional',
  })
  paymentItems.push({
    id: 'est-q2', form: '1040-ES', description: 'Q2 Estimated Payment (Jun 15)',
    category: 'payment', status: 'missing', notes: 'Enter amount of Q2 estimated tax payment made',
    priority: seStreams.length > 0 ? 'required' : 'optional',
  })
  paymentItems.push({
    id: 'est-q3', form: '1040-ES', description: 'Q3 Estimated Payment (Sep 15)',
    category: 'payment', status: 'missing', notes: 'Enter amount of Q3 estimated tax payment made',
    priority: seStreams.length > 0 ? 'required' : 'optional',
  })
  paymentItems.push({
    id: 'est-q4', form: '1040-ES', description: 'Q4 Estimated Payment (Jan 15)',
    category: 'payment', status: 'missing', notes: 'Enter amount of Q4 estimated tax payment made',
    priority: seStreams.length > 0 ? 'required' : 'optional',
  })
  sections.push(buildSection('Tax Payments & Withholding', '💰', paymentItems))

  // ─── Section 6: Documents to Collect ───────────────────────────────
  const docItems: TaxPrepItem[] = []
  docItems.push({
    id: 'doc-id', form: 'General', description: 'Photo ID & Social Security numbers',
    category: 'document', status: 'missing', notes: 'SSN for you, spouse (if filing jointly), and all dependents',
    priority: 'required',
  })
  if (w2Streams.length > 0) {
    docItems.push({
      id: 'doc-w2', form: 'W-2', description: `W-2 forms from ${w2Streams.length} employer(s)`,
      category: 'document', status: 'missing', notes: 'Usually available by Jan 31. Check employer portal.',
      priority: 'required',
    })
  }
  docItems.push({
    id: 'doc-1099-int', form: '1099-INT', description: 'Bank interest statements',
    category: 'document', status: 'missing', notes: 'From banks/credit unions for interest earned > $10',
    priority: 'recommended',
  })
  docItems.push({
    id: 'doc-1099-div', form: '1099-DIV', description: 'Dividend statements',
    category: 'document', status: 'missing', notes: 'From brokerages for dividends received',
    priority: 'recommended',
  })
  if (state.incomeStreams.some(s => s.type === 'investment')) {
    docItems.push({
      id: 'doc-1099-b', form: '1099-B', description: 'Investment sales / capital gains',
      category: 'document', status: 'missing', notes: 'From brokerages for stock/crypto/asset sales',
      priority: 'required',
    })
  }
  if (state.profile.hasHealthInsurance) {
    docItems.push({
      id: 'doc-1095', form: '1095-A/B/C', description: 'Health insurance coverage proof',
      category: 'document', status: 'missing', notes: '1095-A if marketplace, 1095-B/C from insurer/employer',
      priority: 'recommended',
    })
  }
  if (state.incomeStreams.some(s => s.type === 'rental')) {
    docItems.push({
      id: 'doc-rental', form: 'Schedule E', description: 'Rental income & expense records',
      category: 'document', status: 'missing', notes: 'Rent received, mortgage interest (1098), repairs, depreciation',
      priority: 'required',
    })
  }
  sections.push(buildSection('Documents to Collect', '📁', docItems))

  // ─── Section 7: Filing Actions ─────────────────────────────────────
  const actionItems: TaxPrepItem[] = []
  actionItems.push({
    id: 'action-review', form: '1040', description: 'Review all income sources for completeness',
    category: 'action', status: state.incomeStreams.length > 0 ? 'complete' : 'missing',
    notes: `${state.incomeStreams.filter(s => s.isActive).length} active income streams entered`,
    priority: 'required',
  })
  actionItems.push({
    id: 'action-efile', form: '1040', description: 'Choose filing method',
    category: 'action', status: 'missing',
    notes: 'E-file (free for AGI < $84k via IRS Free File), tax software, or CPA',
    priority: 'required',
  })
  if (activeEntities.length > 0) {
    actionItems.push({
      id: 'action-entity-first', form: activeEntities[0].type.includes('scorp') ? '1120-S' : '1065',
      description: '⚠️ File entity return BEFORE personal return',
      category: 'action', status: 'missing',
      notes: `Entity return due March 15 — must be filed first to get K-1 for personal return`,
      priority: 'required', dueDate: `March 15, ${year + 1}`,
    })
  }
  if (report.netTaxOwed > 1000) {
    actionItems.push({
      id: 'action-payment-plan', form: '9465', description: 'Consider IRS payment plan if owed amount is high',
      category: 'action', status: 'na',
      notes: `Estimated owed: $${report.netTaxOwed.toLocaleString()}. IRS offers installment agreements.`,
      priority: 'recommended',
    })
  }
  sections.push(buildSection('Filing Actions', '🎯', actionItems))

  // Calculate overall
  const allItems = sections.flatMap(s => s.items)
  const overallCompletion = Math.round(
    (allItems.filter(i => i.status === 'complete').length / Math.max(1, allItems.filter(i => i.status !== 'na').length)) * 100
  )
  const criticalMissing = allItems.filter(i => i.priority === 'required' && (i.status === 'missing' || i.status === 'partial'))

  const totalWithheld = fedWithheld + stateWithheld
  const netOwed = report.netTaxOwed

  return {
    filingYear: year,
    filingDeadline,
    filingStatus: state.profile.filingStatus,
    sections,
    overallCompletion,
    estimatedRefundOrOwed: Math.abs(netOwed),
    isRefund: netOwed <= 0,
    criticalMissing,
    summary: {
      totalIncome: report.grossIncome,
      totalDeductions: report.standardDeduction + (report.seDeduction || 0) + (report.qbiDeduction || 0),
      totalTax: report.totalTax,
      totalWithheld,
      totalEstimatedPaid: 0, // would come from user input
      netOwed,
    },
  }
}

function buildSection(title: string, icon: string, items: TaxPrepItem[]): TaxPrepSection {
  const applicable = items.filter(i => i.status !== 'na')
  const complete = applicable.filter(i => i.status === 'complete').length
  return {
    title, icon, items,
    completionPct: applicable.length > 0 ? Math.round((complete / applicable.length) * 100) : 100,
  }
}
