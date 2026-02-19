/**
 * Fortuna Engine - Deduction Discovery
 * Proactively identifies unclaimed deductions and credits based on user profile.
 */

import type { FortunaState } from './storage'
import { generateTaxReport } from './tax-calculator'

export interface DiscoveredDeduction {
  id: string
  name: string
  category: string
  estimatedAmount: number
  taxSavings: number
  confidence: 'high' | 'medium' | 'low'
  eligibility: string
  howToClaim: string
  requirements: string[]
  applies: boolean
  alreadyClaimed: boolean
}

export function discoverDeductions(state: FortunaState): DiscoveredDeduction[] {
  const { profile, incomeStreams, deductions, entities, expenses } = state
  const report = generateTaxReport(state)
  const discoveries: DiscoveredDeduction[] = []

  const hasSEIncome = incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive && s.annualAmount > 0)
  const seIncome = incomeStreams.filter(s => ['business', 'freelance'].includes(s.type) && s.isActive).reduce((s, i) => s + i.annualAmount, 0)
  const hasW2 = incomeStreams.some(s => s.type === 'w2' && s.isActive)
  const w2Income = incomeStreams.filter(s => s.type === 'w2' && s.isActive).reduce((s, i) => s + i.annualAmount, 0)
  const totalIncome = report.grossIncome
  const hasRental = incomeStreams.some(s => s.type === 'rental' && s.isActive)
  const claimedCategories = new Set(deductions.map(d => d.category))
  const claimedNames = new Set(deductions.map(d => d.name.toLowerCase()))
  const hasEntity = entities.some(e => e.isActive)
  const marginalRate = report.marginalRate

  // ─── SE Health Insurance Deduction ─────────────────────────────────
  if (hasSEIncome && !profile.hasHealthInsurance) {
    discoveries.push({
      id: 'se-health-insurance', name: 'Self-Employed Health Insurance Deduction',
      category: 'health', estimatedAmount: 7200, taxSavings: Math.round(7200 * marginalRate),
      confidence: 'high',
      eligibility: 'Self-employed individuals who pay their own health insurance premiums',
      howToClaim: 'Deduct premiums on Form 1040 Line 17 (above-the-line)',
      requirements: ['Must have SE net income', 'Cannot be eligible for employer-sponsored plan', 'Premiums ≤ net SE income'],
      applies: true, alreadyClaimed: claimedNames.has('health insurance') || claimedCategories.has('health'),
    })
  }

  // ─── Home Office Deduction ─────────────────────────────────────────
  if (hasSEIncome) {
    const hasHomeOffice = expenses.some(e => e.description.toLowerCase().includes('home office')) || claimedCategories.has('home_office')
    const simplified = Math.min(1500, 5 * 300) // $5/sqft up to 300 sqft
    discoveries.push({
      id: 'home-office', name: 'Home Office Deduction',
      category: 'home_office', estimatedAmount: simplified, taxSavings: Math.round(simplified * (marginalRate + 0.153)),
      confidence: 'medium',
      eligibility: 'Self-employed individuals who use part of home exclusively for business',
      howToClaim: 'Simplified method: $5/sqft up to 300 sqft ($1,500). Or actual expenses method (Form 8829).',
      requirements: ['Exclusive and regular business use', 'Principal place of business', 'Not available for W-2 employees'],
      applies: hasSEIncome, alreadyClaimed: hasHomeOffice,
    })
  }

  // ─── Vehicle / Mileage Deduction ───────────────────────────────────
  if (hasSEIncome) {
    const hasMileage = expenses.some(e => e.description.toLowerCase().includes('vehicle') || e.description.toLowerCase().includes('mileage'))
    const estMiles = 8000 // conservative estimate
    const mileageRate = 0.70 // 2025 rate
    const estDeduction = Math.round(estMiles * mileageRate)
    discoveries.push({
      id: 'vehicle-mileage', name: 'Vehicle / Mileage Deduction',
      category: 'vehicle', estimatedAmount: estDeduction, taxSavings: Math.round(estDeduction * (marginalRate + 0.153)),
      confidence: 'low',
      eligibility: 'Self-employed individuals who use vehicle for business',
      howToClaim: 'Standard mileage rate ($0.70/mile for 2025) or actual expenses. Track mileage log.',
      requirements: ['Business-use miles documented', 'Mileage log maintained', 'Cannot use both methods for same vehicle'],
      applies: hasSEIncome, alreadyClaimed: hasMileage,
    })
  }

  // ─── SEP-IRA / Solo 401(k) ────────────────────────────────────────
  if (hasSEIncome && seIncome > 10000) {
    const hasRetirement = claimedCategories.has('retirement')
    const currentRetirement = deductions.filter(d => d.category === 'retirement').reduce((s, d) => s + d.amount, 0)
    const maxSEP = Math.min(69000, Math.round(seIncome * 0.25))
    const gap = Math.max(0, maxSEP - currentRetirement)
    if (gap > 2000) {
      discoveries.push({
        id: 'sep-ira', name: 'SEP-IRA / Solo 401(k) Contribution',
        category: 'retirement', estimatedAmount: gap, taxSavings: Math.round(gap * marginalRate),
        confidence: 'high',
        eligibility: 'Self-employed individuals with net SE income',
        howToClaim: 'Contribute to SEP-IRA (up to 25% of net SE income, max $69,000) or Solo 401(k) with employee + employer contributions.',
        requirements: ['Must have net SE income', 'SEP-IRA: contribute by tax filing deadline', 'Solo 401(k): establish by Dec 31'],
        applies: true, alreadyClaimed: hasRetirement && gap < 2000,
      })
    }
  }

  // ─── W-2 401(k) Gap ───────────────────────────────────────────────
  if (hasW2) {
    const w2Streams = incomeStreams.filter(s => s.type === 'w2' && s.isActive)
    const total401k = w2Streams.reduce((s, w) => s + (w.w2?.pretax401k || 0), 0)
    const limit = profile.age >= 50 ? 31000 : 23500
    const gap = limit - total401k
    if (gap > 2000) {
      discoveries.push({
        id: 'w2-401k-gap', name: `401(k) Contribution Gap`,
        category: 'retirement', estimatedAmount: gap, taxSavings: Math.round(gap * marginalRate),
        confidence: 'high',
        eligibility: `You're contributing $${total401k.toLocaleString()} — limit is $${limit.toLocaleString()}${profile.age >= 50 ? ' (catch-up)' : ''}`,
        howToClaim: 'Increase 401(k) contribution rate through employer payroll. Reduces taxable income dollar-for-dollar.',
        requirements: ['Employer offers 401(k) plan', 'Increase contribution through HR/payroll'],
        applies: true, alreadyClaimed: gap < 1000,
      })
    }
  }

  // ─── HSA Contribution ──────────────────────────────────────────────
  {
    const w2Streams = incomeStreams.filter(s => s.type === 'w2' && s.isActive)
    const currentHSA = w2Streams.reduce((s, w) => s + (w.w2?.pretaxHSA || 0), 0)
    const hsaLimit = profile.filingStatus === 'single' || profile.filingStatus === 'married_separate' ? 4300 : 8550
    const catchUp = profile.age >= 55 ? 1000 : 0
    const maxHSA = hsaLimit + catchUp
    const gap = maxHSA - currentHSA
    if (gap > 500) {
      discoveries.push({
        id: 'hsa-gap', name: 'HSA Contribution Gap',
        category: 'health', estimatedAmount: gap, taxSavings: Math.round(gap * (marginalRate + 0.0765)),
        confidence: 'medium',
        eligibility: `HSA limit: $${maxHSA.toLocaleString()} — current: $${currentHSA.toLocaleString()}. Triple tax advantage.`,
        howToClaim: 'Contribute through payroll (avoids FICA) or directly to HSA account (deduct on 1040).',
        requirements: ['Enrolled in high-deductible health plan (HDHP)', 'Not enrolled in Medicare', 'Cannot be claimed as dependent'],
        applies: profile.hasHealthInsurance, alreadyClaimed: gap < 500,
      })
    }
  }

  // ─── QBI Deduction ────────────────────────────────────────────────
  if (hasSEIncome && report.qbiDeduction === 0 && seIncome > 5000) {
    const potential = Math.round(seIncome * 0.20)
    discoveries.push({
      id: 'qbi', name: 'Qualified Business Income Deduction (199A)',
      category: 'business', estimatedAmount: potential, taxSavings: Math.round(potential * marginalRate),
      confidence: 'medium',
      eligibility: 'Pass-through business owners may deduct up to 20% of qualified business income',
      howToClaim: 'Claimed automatically on Form 8995. Ensure business income qualifies.',
      requirements: ['Pass-through entity or sole prop', 'Below income thresholds or in qualified trade', 'Not specified service business above threshold'],
      applies: true, alreadyClaimed: report.qbiDeduction > 0,
    })
  }

  // ─── Child Tax Credit ─────────────────────────────────────────────
  if (profile.dependents > 0) {
    const ctcAmount = profile.dependents * 2000
    const hasCTC = claimedNames.has('child tax credit') || claimedNames.has('ctc')
    discoveries.push({
      id: 'child-tax-credit', name: 'Child Tax Credit',
      category: 'other', estimatedAmount: ctcAmount, taxSavings: ctcAmount, // direct credit
      confidence: 'high',
      eligibility: `${profile.dependents} dependent${profile.dependents > 1 ? 's' : ''} × $2,000 = $${ctcAmount.toLocaleString()} credit`,
      howToClaim: 'Claimed on Form 1040. Partially refundable. Phase-out begins at $200k single / $400k joint.',
      requirements: ['Qualifying child under 17', 'SSN for child', 'Income below phase-out threshold'],
      applies: true, alreadyClaimed: hasCTC,
    })
  }

  // ─── Earned Income Tax Credit ──────────────────────────────────────
  if (totalIncome < 63398 && profile.filingStatus !== 'married_separate') {
    const eitcMax = profile.dependents >= 3 ? 7830 : profile.dependents === 2 ? 6960 : profile.dependents === 1 ? 3995 : 632
    discoveries.push({
      id: 'eitc', name: 'Earned Income Tax Credit',
      category: 'other', estimatedAmount: eitcMax, taxSavings: eitcMax,
      confidence: totalIncome < 50000 ? 'medium' : 'low',
      eligibility: `Income $${totalIncome.toLocaleString()} may qualify. Max EITC: $${eitcMax.toLocaleString()} with ${profile.dependents} dependent(s).`,
      howToClaim: 'Claimed on Form 1040 Schedule EIC. Fully refundable credit.',
      requirements: ['Earned income required', 'Investment income < $11,600', 'Valid SSN', 'Filing status not MFS'],
      applies: true, alreadyClaimed: false,
    })
  }

  // ─── Student Loan Interest ─────────────────────────────────────────
  if (totalIncome < 90000 || (profile.filingStatus === 'married_joint' && totalIncome < 185000)) {
    const hasStudentLoan = claimedNames.has('student loan interest') || claimedNames.has('student loan')
    if (!hasStudentLoan) {
      discoveries.push({
        id: 'student-loan', name: 'Student Loan Interest Deduction',
        category: 'education', estimatedAmount: 2500, taxSavings: Math.round(2500 * marginalRate),
        confidence: 'low',
        eligibility: 'Deduct up to $2,500 in student loan interest paid (above-the-line)',
        howToClaim: 'Report on Form 1040 Schedule 1 Line 21. Lender sends 1098-E.',
        requirements: ['Legally obligated to pay interest', 'Loan for qualified education expenses', 'Income below phase-out'],
        applies: true, alreadyClaimed: hasStudentLoan,
      })
    }
  }

  // ─── Charitable Contributions ──────────────────────────────────────
  {
    const hasCharitable = claimedCategories.has('charitable')
    if (!hasCharitable && totalIncome > 40000) {
      const estCharitable = Math.round(totalIncome * 0.03) // conservative 3%
      discoveries.push({
        id: 'charitable', name: 'Charitable Contribution Deduction',
        category: 'charitable', estimatedAmount: estCharitable, taxSavings: Math.round(estCharitable * marginalRate),
        confidence: 'low',
        eligibility: 'Itemize charitable donations if total itemized deductions exceed standard deduction',
        howToClaim: 'Schedule A (itemized deductions). Cash donations: up to 60% of AGI. Non-cash: up to 30%.',
        requirements: ['Donations to qualified 501(c)(3) organizations', 'Written acknowledgment for donations > $250', 'Non-cash items at fair market value'],
        applies: true, alreadyClaimed: hasCharitable,
      })
    }
  }

  // ─── SE Tax Deduction (half of SE tax) ─────────────────────────────
  if (hasSEIncome && report.seDeduction > 0) {
    discoveries.push({
      id: 'se-tax-deduction', name: 'Self-Employment Tax Deduction',
      category: 'business', estimatedAmount: report.seDeduction, taxSavings: Math.round(report.seDeduction * marginalRate),
      confidence: 'high',
      eligibility: 'Automatically deduct 50% of SE tax from income (above-the-line)',
      howToClaim: 'Calculated on Schedule SE, deducted on Form 1040 Schedule 1.',
      requirements: ['Must have SE income', 'Automatically calculated'],
      applies: true, alreadyClaimed: true, // always auto-claimed
    })
  }

  // ─── Depreciation (for rental / business assets) ───────────────────
  if (hasRental || hasSEIncome) {
    const hasDepreciation = expenses.some(e => e.description.toLowerCase().includes('depreci'))
    if (!hasDepreciation) {
      discoveries.push({
        id: 'depreciation', name: 'Section 179 / Bonus Depreciation',
        category: 'business', estimatedAmount: 5000, taxSavings: Math.round(5000 * (marginalRate + (hasSEIncome ? 0.153 : 0))),
        confidence: 'low',
        eligibility: 'Deduct cost of business equipment, vehicles, and assets in the year purchased',
        howToClaim: 'Section 179: up to $1,220,000 (2025). Bonus depreciation: 40% in 2025 (phasing down).',
        requirements: ['Asset used > 50% for business', 'Placed in service during tax year', 'Must have business income for Sec 179'],
        applies: true, alreadyClaimed: hasDepreciation,
      })
    }
  }

  // Sort: unclaimed first, then by tax savings
  return discoveries.sort((a, b) => {
    if (a.alreadyClaimed !== b.alreadyClaimed) return a.alreadyClaimed ? 1 : -1
    return b.taxSavings - a.taxSavings
  })
}
