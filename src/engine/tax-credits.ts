/**
 * Fortuna Engine — Tax Credit Optimizer v9
 *
 * Identifies and calculates all available federal tax credits:
 *  - Child Tax Credit / Additional CTC / Child & Dependent Care
 *  - Earned Income Tax Credit (EITC)
 *  - Education Credits (American Opportunity, Lifetime Learning)
 *  - Energy Credits (residential clean energy, EV)
 *  - Health Premium Tax Credit (ACA marketplace)
 *  - Retirement Savings Credit (Saver's Credit)
 *  - R&D Tax Credit (for small businesses)
 *  - Home Office deduction credit interactions
 *  - General Business Credits
 */

import type { FortunaState } from './storage'
import { generateTaxReport } from './tax-calculator'

// ===================================================================
//  2024 CREDIT CONSTANTS
// ===================================================================

// Child Tax Credit
const CTC_AMOUNT = 2000
const CTC_REFUNDABLE_MAX = 1700 // Additional CTC refundable portion
const CTC_PHASEOUT_SINGLE = 200000
const CTC_PHASEOUT_JOINT = 400000
const CTC_PHASEOUT_RATE = 0.05 // $50 per $1000 over threshold

// Child & Dependent Care Credit
const DEPENDENT_CARE_MAX_ONE = 3000
const DEPENDENT_CARE_MAX_TWO = 6000
const DEPENDENT_CARE_MAX_RATE = 0.35
const DEPENDENT_CARE_MIN_RATE = 0.20
const DEPENDENT_CARE_RATE_THRESHOLD = 15000

// EITC 2024 (zero dependents used as base)
const EITC_LIMITS = {
  0: { maxCredit: 632, phaseoutStart_single: 9800, phaseoutEnd_single: 18591, phaseoutStart_joint: 16510, phaseoutEnd_joint: 25511 },
  1: { maxCredit: 3995, phaseoutStart_single: 12730, phaseoutEnd_single: 46560, phaseoutStart_joint: 22230, phaseoutEnd_joint: 53120 },
  2: { maxCredit: 6604, phaseoutStart_single: 12730, phaseoutEnd_single: 52918, phaseoutStart_joint: 22230, phaseoutEnd_joint: 59478 },
  3: { maxCredit: 7430, phaseoutStart_single: 12730, phaseoutEnd_single: 56838, phaseoutStart_joint: 22230, phaseoutEnd_joint: 63398 },
}

// Education Credits
const AOTC_MAX = 2500
const AOTC_PHASEOUT_SINGLE = 80000
const AOTC_PHASEOUT_END_SINGLE = 90000
const AOTC_PHASEOUT_JOINT = 160000
const AOTC_PHASEOUT_END_JOINT = 180000
const LLC_MAX = 2000
const LLC_PHASEOUT_SINGLE = 80000
const LLC_PHASEOUT_END_SINGLE = 90000

// Saver's Credit
const SAVERS_CREDIT_LIMITS_2024 = {
  single: [
    { maxAGI: 23000, rate: 0.50 },
    { maxAGI: 25000, rate: 0.20 },
    { maxAGI: 38250, rate: 0.10 },
  ],
  married_joint: [
    { maxAGI: 46000, rate: 0.50 },
    { maxAGI: 50000, rate: 0.20 },
    { maxAGI: 76500, rate: 0.10 },
  ],
  head_of_household: [
    { maxAGI: 34500, rate: 0.50 },
    { maxAGI: 37500, rate: 0.20 },
    { maxAGI: 57375, rate: 0.10 },
  ],
}
const SAVERS_MAX_CONTRIBUTION = 2000

// Clean Energy
const EV_CREDIT_NEW = 7500
const EV_CREDIT_USED = 4000
const EV_AGI_LIMIT_SINGLE = 150000
const EV_AGI_LIMIT_JOINT = 300000
const RESIDENTIAL_ENERGY_RATE = 0.30
const RESIDENTIAL_ENERGY_MAX = 3200

// R&D Credit (small business)
const RD_CREDIT_RATE = 0.20
const RD_SIMPLIFIED_RATE = 0.14
const RD_PAYROLL_TAX_LIMIT = 500000 // for startups

// Health Premium Tax Credit
const ACA_FPL_2024_SINGLE = 15060
const ACA_CONTRIBUTION_CAPS = [
  { fplPct: 1.50, contribution: 0.00 },
  { fplPct: 2.00, contribution: 0.02 },
  { fplPct: 2.50, contribution: 0.04 },
  { fplPct: 3.00, contribution: 0.06 },
  { fplPct: 4.00, contribution: 0.085 },
]

// ===================================================================
//  TYPES
// ===================================================================

export interface TaxCredit {
  id: string
  name: string
  category: 'family' | 'education' | 'energy' | 'retirement' | 'business' | 'health' | 'foreign'
  amount: number
  type: 'nonrefundable' | 'refundable' | 'partially_refundable'
  eligible: boolean
  eligibilityReason: string
  phaseoutApplied: boolean
  fullAmount: number // before phaseout
  requirements: string[]
  actionItems: string[]
  notes: string[]
}

export interface CreditOptimization {
  title: string
  description: string
  additionalCredits: number
  difficulty: 'easy' | 'moderate' | 'complex'
  category: string
}

export interface TaxCreditSummary {
  credits: TaxCredit[]
  totalNonrefundable: number
  totalRefundable: number
  totalCredits: number
  taxLiabilityReduction: number // actual reduction (nonrefundable capped at tax owed)
  optimizations: CreditOptimization[]
  unusedCredits: number // nonrefundable credits exceeding tax liability
  effectiveCreditRate: number // credits as % of gross income
}

// ===================================================================
//  CREDIT CALCULATORS
// ===================================================================

function calcChildTaxCredit(state: FortunaState, agi: number): TaxCredit {
  // Use rich household dependents if available, fall back to profile.dependents count
  const householdDeps = state.household?.dependents || []
  const currentYear = state.taxYear || new Date().getFullYear()

  // Count qualifying children (under 17 at end of tax year)
  let qualifyingChildren: number
  const childDetails: string[] = []
  if (householdDeps.length > 0) {
    const qualifying = householdDeps.filter(d => {
      if (!d.dateOfBirth) return true // assume qualifying if no DOB
      const age = currentYear - new Date(d.dateOfBirth).getFullYear()
      return age < 17
    })
    qualifyingChildren = qualifying.length
    const overAge = householdDeps.filter(d => {
      if (!d.dateOfBirth) return false
      const age = currentYear - new Date(d.dateOfBirth).getFullYear()
      return age >= 17
    })
    if (overAge.length > 0) {
      childDetails.push(`${overAge.length} dependent(s) age 17+ do not qualify for CTC but may qualify for Other Dependent Credit ($500)`)
    }
    const disabled = qualifying.filter(d => d.isDisabled)
    if (disabled.length > 0) {
      childDetails.push(`${disabled.length} qualifying child(ren) with disability may also qualify for additional credits`)
    }
  } else {
    qualifyingChildren = state.profile.dependents
  }

  if (qualifyingChildren === 0) {
    const notes = householdDeps.length > 0 && householdDeps.length > qualifyingChildren
      ? [`${householdDeps.length} dependent(s) claimed but none under age 17. Other Dependent Credit may apply ($500 each).`]
      : []
    return {
      id: 'ctc', name: 'Child Tax Credit', category: 'family',
      amount: 0, type: 'partially_refundable', eligible: false,
      eligibilityReason: householdDeps.length > 0 ? 'No dependents under age 17' : 'No qualifying dependents claimed',
      phaseoutApplied: false, fullAmount: 0,
      requirements: ['Child under 17', 'SSN for child', 'Child must be claimed as dependent'],
      actionItems: [], notes,
    }
  }

  const fullCredit = qualifyingChildren * CTC_AMOUNT
  const threshold = state.profile.filingStatus === 'married_joint'
    ? CTC_PHASEOUT_JOINT : CTC_PHASEOUT_SINGLE
  const excess = Math.max(0, agi - threshold)
  const reduction = Math.ceil(excess / 1000) * 50
  const credit = Math.max(0, fullCredit - reduction)
  const refundable = Math.min(credit, qualifyingChildren * CTC_REFUNDABLE_MAX)

  return {
    id: 'ctc', name: 'Child Tax Credit', category: 'family',
    amount: credit, type: 'partially_refundable', eligible: credit > 0,
    eligibilityReason: credit > 0 ? `$${CTC_AMOUNT.toLocaleString()} per qualifying child \u00D7 ${qualifyingChildren}` : `AGI exceeds phaseout threshold`,
    phaseoutApplied: reduction > 0, fullAmount: fullCredit,
    requirements: ['Child under 17 with SSN', 'Claimed as dependent', `AGI under $${(threshold + fullCredit / 0.05 * 1000).toLocaleString()}`],
    actionItems: reduction > 0 ? ['Consider retirement contributions to reduce AGI below phaseout'] : [],
    notes: [`Up to $${refundable.toLocaleString()} refundable as Additional CTC`, ...childDetails],
  }
}

function calcEITC(state: FortunaState, agi: number, earnedIncome: number): TaxCredit {
  const deps = Math.min(state.profile.dependents, 3) as 0 | 1 | 2 | 3
  const limits = EITC_LIMITS[deps]
  const isJoint = state.profile.filingStatus === 'married_joint'

  const phaseoutStart = isJoint ? limits.phaseoutStart_joint : limits.phaseoutStart_single
  const phaseoutEnd = isJoint ? limits.phaseoutEnd_joint : limits.phaseoutEnd_single

  let credit = 0
  if (agi <= phaseoutStart) {
    credit = limits.maxCredit
  } else if (agi < phaseoutEnd) {
    const pct = (phaseoutEnd - agi) / (phaseoutEnd - phaseoutStart)
    credit = Math.round(limits.maxCredit * pct)
  }

  // Investment income limit ($11,600 for 2024)
  const investIncome = state.incomeStreams
    .filter(s => s.type === 'investment' && s.isActive)
    .reduce((s, i) => s + i.annualAmount, 0)
  if (investIncome > 11600) credit = 0

  return {
    id: 'eitc', name: 'Earned Income Tax Credit', category: 'family',
    amount: credit, type: 'refundable', eligible: credit > 0,
    eligibilityReason: credit > 0
      ? `Earned income of $${earnedIncome.toLocaleString()} with ${deps} qualifying children`
      : `AGI of $${agi.toLocaleString()} exceeds EITC limit of $${phaseoutEnd.toLocaleString()}`,
    phaseoutApplied: agi > phaseoutStart && credit > 0, fullAmount: limits.maxCredit,
    requirements: ['Earned income required', 'Investment income under $11,600', `AGI under $${phaseoutEnd.toLocaleString()}`],
    actionItems: credit === 0 && agi < phaseoutEnd * 1.2
      ? ['Retirement contributions could reduce AGI into EITC range']
      : [],
    notes: deps > 0 ? [`Max credit with ${deps} children: $${limits.maxCredit.toLocaleString()}`] : [],
  }
}

function calcSaversCredit(state: FortunaState, agi: number): TaxCredit {
  const statusKey = state.profile.filingStatus === 'married_separate'
    ? 'single' : (state.profile.filingStatus as keyof typeof SAVERS_CREDIT_LIMITS_2024)
  const brackets = SAVERS_CREDIT_LIMITS_2024[statusKey] || SAVERS_CREDIT_LIMITS_2024.single

  const retirementContrib = state.deductions
    .filter(d => d.category === 'retirement')
    .reduce((s, d) => s + d.amount, 0)

  const eligibleContrib = Math.min(retirementContrib, SAVERS_MAX_CONTRIBUTION)
  let rate = 0
  for (const b of brackets) {
    if (agi <= b.maxAGI) { rate = b.rate; break }
  }

  const credit = Math.round(eligibleContrib * rate)
  const maxAGI = brackets[brackets.length - 1]?.maxAGI || 0

  return {
    id: 'savers', name: 'Retirement Savings Credit', category: 'retirement',
    amount: credit, type: 'nonrefundable', eligible: credit > 0 && agi <= maxAGI,
    eligibilityReason: agi > maxAGI
      ? `AGI of $${agi.toLocaleString()} exceeds limit of $${maxAGI.toLocaleString()}`
      : retirementContrib === 0
        ? 'No retirement contributions detected'
        : `${(rate * 100).toFixed(0)}% credit on $${eligibleContrib.toLocaleString()} contribution`,
    phaseoutApplied: false, fullAmount: Math.round(SAVERS_MAX_CONTRIBUTION * 0.50),
    requirements: ['Age 18+', 'Not full-time student', 'Not claimed as dependent', `AGI under $${maxAGI.toLocaleString()}`],
    actionItems: retirementContrib === 0 ? ['Start retirement contributions to claim up to $1,000 credit'] : [],
    notes: [`Max credit: $${Math.round(SAVERS_MAX_CONTRIBUTION * 0.50).toLocaleString()} at 50% rate`],
  }
}

function calcEVCredit(state: FortunaState, agi: number): TaxCredit {
  const limit = state.profile.filingStatus === 'married_joint'
    ? EV_AGI_LIMIT_JOINT : EV_AGI_LIMIT_SINGLE
  const eligible = agi <= limit

  return {
    id: 'ev_new', name: 'Clean Vehicle Credit (New EV)', category: 'energy',
    amount: 0, type: 'nonrefundable', eligible,
    eligibilityReason: eligible
      ? `AGI under $${limit.toLocaleString()} — eligible for up to $${EV_CREDIT_NEW.toLocaleString()} on qualifying new EV purchase`
      : `AGI exceeds $${limit.toLocaleString()} limit`,
    phaseoutApplied: false, fullAmount: EV_CREDIT_NEW,
    requirements: [
      `AGI ≤ $${limit.toLocaleString()}`,
      'Vehicle MSRP under $55K (cars) or $80K (SUVs/trucks)',
      'Final assembly in North America',
      'Battery sourcing requirements met',
    ],
    actionItems: eligible
      ? ['Check IRS FuelEconomy.gov for qualifying vehicles', 'Can transfer credit to dealer at point of sale']
      : [],
    notes: [
      `Also available: $${EV_CREDIT_USED.toLocaleString()} credit for used EVs (AGI limit: $${(limit * 0.5).toLocaleString()})`,
      'Credit can be taken at point of sale starting 2024',
    ],
  }
}

function calcResidentialEnergy(state: FortunaState): TaxCredit {
  return {
    id: 'residential_energy', name: 'Residential Clean Energy Credit', category: 'energy',
    amount: 0, type: 'nonrefundable', eligible: true,
    eligibilityReason: 'Available for qualifying home energy improvements — no income limit',
    phaseoutApplied: false, fullAmount: RESIDENTIAL_ENERGY_MAX,
    requirements: [
      'Must be primary or secondary residence',
      'Qualifying improvements: solar, wind, geothermal, battery storage',
      'Heat pumps, insulation, windows, doors also qualify (separate limits)',
    ],
    actionItems: [
      `Solar panels: 30% credit with no cap`,
      `Energy-efficient improvements: 30% up to $${RESIDENTIAL_ENERGY_MAX.toLocaleString()}/year`,
      'Keep all receipts and manufacturer certifications',
    ],
    notes: [
      'Solar: 30% of cost with no cap through 2032',
      `Other improvements: $${RESIDENTIAL_ENERGY_MAX.toLocaleString()} annual limit`,
      'Heat pump/water heater: up to $2,000 credit',
    ],
  }
}

function calcRDCredit(state: FortunaState): TaxCredit {
  const hasBusinessIncome = state.incomeStreams.some(s =>
    ['business', 'freelance'].includes(s.type) && s.isActive
  )
  const grossReceipts = state.incomeStreams
    .filter(s => s.isActive)
    .reduce((s, i) => s + i.annualAmount, 0)

  const isSmallBusiness = grossReceipts < 5000000

  return {
    id: 'rd_credit', name: 'R&D Tax Credit', category: 'business',
    amount: 0, type: 'nonrefundable', eligible: hasBusinessIncome,
    eligibilityReason: hasBusinessIncome
      ? 'Business income detected — may qualify for R&D credit on development activities'
      : 'No business income — R&D credit requires business/trade activities',
    phaseoutApplied: false,
    fullAmount: 0,
    requirements: [
      'Qualified research expenses (wages, supplies, contract research)',
      'Must involve technological uncertainty',
      'Process of experimentation required',
      'Business component purpose',
    ],
    actionItems: hasBusinessIncome ? [
      'Document development hours and activities',
      'Track software development wages and contractor costs',
      `Simplified credit: ${RD_SIMPLIFIED_RATE * 100}% of qualified expenses above base`,
      isSmallBusiness ? `Startups: up to $${(RD_PAYROLL_TAX_LIMIT / 1000).toFixed(0)}K can offset payroll taxes` : '',
    ].filter(Boolean) : [],
    notes: [
      'Software development often qualifies',
      `Regular method: ${RD_CREDIT_RATE * 100}% | Simplified: ${RD_SIMPLIFIED_RATE * 100}%`,
      isSmallBusiness ? 'Eligible for payroll tax offset as small business' : '',
    ].filter(Boolean),
  }
}

function calcEducationCredits(state: FortunaState, agi: number): TaxCredit {
  const isJoint = state.profile.filingStatus === 'married_joint'
  const phaseoutStart = isJoint ? AOTC_PHASEOUT_JOINT : AOTC_PHASEOUT_SINGLE
  const phaseoutEnd = isJoint ? AOTC_PHASEOUT_END_JOINT : AOTC_PHASEOUT_END_SINGLE
  const eligible = agi < phaseoutEnd

  let phasedAmount = AOTC_MAX
  if (agi > phaseoutStart) {
    const pct = (phaseoutEnd - agi) / (phaseoutEnd - phaseoutStart)
    phasedAmount = Math.round(AOTC_MAX * Math.max(0, pct))
  }

  return {
    id: 'education', name: 'Education Credits (AOTC / LLC)', category: 'education',
    amount: 0, type: 'partially_refundable', eligible,
    eligibilityReason: eligible
      ? `AGI under phaseout — American Opportunity Credit up to $${phasedAmount.toLocaleString()}`
      : `AGI exceeds $${phaseoutEnd.toLocaleString()} phaseout`,
    phaseoutApplied: agi > phaseoutStart, fullAmount: AOTC_MAX,
    requirements: [
      'Enrolled at eligible educational institution',
      'Paying qualified tuition and expenses',
      'AOTC: First 4 years of postsecondary only',
      'LLC: Any postsecondary or skill improvement',
    ],
    actionItems: eligible
      ? [`AOTC: Up to $${AOTC_MAX.toLocaleString()} (40% refundable = $${Math.round(AOTC_MAX * 0.4).toLocaleString()})`,
         `LLC: Up to $${LLC_MAX.toLocaleString()} (nonrefundable)`,
         'Cannot claim both for same student']
      : [],
    notes: ['AOTC is more valuable due to partial refundability', '1098-T required from institution'],
  }
}

// ===================================================================
//  OPTIMIZATION SUGGESTIONS
// ===================================================================

function findOptimizations(
  state: FortunaState,
  credits: TaxCredit[],
  agi: number,
  taxReport: ReturnType<typeof generateTaxReport>,
): CreditOptimization[] {
  const opts: CreditOptimization[] = []

  // AGI reduction to unlock credits
  const ineligible = credits.filter(c => !c.eligible && c.fullAmount > 0)
  for (const c of ineligible) {
    if (c.id === 'eitc' || c.id === 'savers') {
      const retirementGap = taxReport.retirementGap
      if (retirementGap > 5000) {
        opts.push({
          title: `Retirement contributions could unlock ${c.name}`,
          description: `Contributing $${retirementGap.toLocaleString()} to retirement accounts reduces AGI, potentially qualifying for up to $${c.fullAmount.toLocaleString()}.`,
          additionalCredits: c.fullAmount,
          difficulty: 'moderate',
          category: c.category,
        })
      }
    }
  }

  // R&D credit for software developers
  const rdCredit = credits.find(c => c.id === 'rd_credit')
  if (rdCredit?.eligible) {
    const devExpenses = state.expenses
      .filter(e => e.isDeductible && (
        e.category.toLowerCase().includes('software') ||
        e.category.toLowerCase().includes('development') ||
        e.category.toLowerCase().includes('contractor')
      ))
      .reduce((s, e) => s + e.annualAmount, 0)

    if (devExpenses > 10000) {
      opts.push({
        title: 'Claim R&D Credit on Development Activities',
        description: `$${devExpenses.toLocaleString()} in potential qualified research expenses detected. Simplified credit of ${RD_SIMPLIFIED_RATE * 100}% could yield $${Math.round(devExpenses * RD_SIMPLIFIED_RATE).toLocaleString()}.`,
        additionalCredits: Math.round(devExpenses * RD_SIMPLIFIED_RATE),
        difficulty: 'complex',
        category: 'business',
      })
    }
  }

  // EV credit reminder
  const evCredit = credits.find(c => c.id === 'ev_new')
  if (evCredit?.eligible) {
    opts.push({
      title: 'EV Purchase Qualifies for $7,500 Credit',
      description: 'Your AGI qualifies for the full clean vehicle credit. Can be applied at point of sale for immediate savings.',
      additionalCredits: EV_CREDIT_NEW,
      difficulty: 'easy',
      category: 'energy',
    })
  }

  // Energy improvements
  opts.push({
    title: 'Home Energy Improvements',
    description: `30% credit on solar panels (no cap), heat pumps ($2,000), insulation/windows ($1,200). No income limit. Total up to $${RESIDENTIAL_ENERGY_MAX.toLocaleString()}/year for non-solar.`,
    additionalCredits: RESIDENTIAL_ENERGY_MAX,
    difficulty: 'moderate',
    category: 'energy',
  })

  return opts.sort((a, b) => b.additionalCredits - a.additionalCredits)
}

// ===================================================================
//  MAIN ANALYSIS
// ===================================================================

// ─── Foreign Tax Credit (Form 1116) ────────────────────────────────────────

function calcForeignTaxCredit(state: FortunaState, agi: number): TaxCredit {
  const report = generateTaxReport(state)

  // Check for foreign-source income in investment streams
  const foreignIncome = state.incomeStreams
    .filter(s => s.isActive && s.tags?.includes('foreign'))
    .reduce((s, i) => s + i.annualAmount, 0)

  // Check carryforwards for prior foreign tax credit
  const carryforward = state.carryforwards?.foreignTaxCredit || 0

  // Foreign taxes paid (from deductions tagged as foreign)
  const foreignTaxesPaid = state.deductions
    .filter(d => d.category === 'other' && d.notes?.toLowerCase().includes('foreign tax'))
    .reduce((s, d) => s + d.amount, 0)

  const totalForeignTax = foreignTaxesPaid + carryforward
  const eligible = totalForeignTax > 0

  // Credit limitation: (foreign source income / worldwide income) × US tax
  let creditLimit = Infinity
  if (foreignIncome > 0 && report.grossIncome > 0) {
    creditLimit = Math.round((foreignIncome / report.grossIncome) * report.federalIncomeTax)
  }
  const creditAmount = Math.min(totalForeignTax, creditLimit)

  return {
    id: 'foreign_tax_credit',
    name: 'Foreign Tax Credit',
    category: 'foreign',
    amount: eligible ? creditAmount : 0,
    type: 'nonrefundable',
    eligible,
    eligibilityReason: eligible
      ? `$${foreignTaxesPaid.toLocaleString()} in foreign taxes paid${carryforward > 0 ? ` + $${carryforward.toLocaleString()} carryforward` : ''}`
      : 'No foreign taxes paid or reported',
    phaseoutApplied: creditAmount < totalForeignTax,
    fullAmount: totalForeignTax,
    requirements: [
      'Foreign taxes paid or accrued to a foreign country',
      'Tax must be a legal and actual foreign tax liability',
      'Must be an income tax or tax in lieu of income tax',
    ],
    actionItems: eligible
      ? creditAmount < totalForeignTax
        ? [`$${(totalForeignTax - creditAmount).toLocaleString()} excess credit can carry forward 10 years or back 1 year`]
        : ['Credit fully utilized this year']
      : ['Tag foreign-source income streams with "foreign" tag', 'Add foreign tax payments as deductions with "foreign tax" in notes'],
    notes: eligible
      ? [`Form 1116 required for credit > $300 single / $600 joint`, `Credit limited to ${foreignIncome > 0 ? Math.round(foreignIncome / report.grossIncome * 100) : 0}% of US tax (foreign income ratio)`]
      : ['Many international ETFs and funds pay foreign withholding taxes'],
  }
}

export function analyzeTaxCredits(state: FortunaState): TaxCreditSummary {
  const report = generateTaxReport(state)
  const agi = report.agi
  const earnedIncome = report.w2Income + report.selfEmploymentIncome

  // Calculate all credits
  const credits: TaxCredit[] = [
    calcChildTaxCredit(state, agi),
    calcEITC(state, agi, earnedIncome),
    calcSaversCredit(state, agi),
    calcEVCredit(state, agi),
    calcResidentialEnergy(state),
    calcRDCredit(state),
    calcEducationCredits(state, agi),
    calcForeignTaxCredit(state, agi),
  ]

  // Totals
  const totalRefundable = credits
    .filter(c => c.eligible && (c.type === 'refundable' || c.type === 'partially_refundable'))
    .reduce((s, c) => s + c.amount, 0)

  const totalNonrefundable = credits
    .filter(c => c.eligible && c.type === 'nonrefundable')
    .reduce((s, c) => s + c.amount, 0)

  const totalCredits = totalRefundable + totalNonrefundable

  // Nonrefundable credits are limited by tax liability
  const taxLiability = report.federalIncomeTax
  const usableNonrefundable = Math.min(totalNonrefundable, taxLiability)
  const taxLiabilityReduction = usableNonrefundable + totalRefundable
  const unusedCredits = Math.max(0, totalNonrefundable - taxLiability)

  // Optimizations
  const optimizations = findOptimizations(state, credits, agi, report)

  return {
    credits,
    totalNonrefundable,
    totalRefundable,
    totalCredits,
    taxLiabilityReduction,
    optimizations,
    unusedCredits,
    effectiveCreditRate: report.grossIncome > 0 ? taxLiabilityReduction / report.grossIncome : 0,
  }
}
