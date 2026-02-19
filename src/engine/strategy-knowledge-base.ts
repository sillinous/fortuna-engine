/**
 * FORTUNA ENGINE — Tax Strategy Knowledge Base v1
 * 
 * Structured database of tax strategies with:
 *   - IRC section references
 *   - Phase-out thresholds
 *   - Dollar-impact estimators
 *   - Implementation checklists
 *   - State-specific notes
 *   - Eligibility criteria
 *   - Risk/audit flags
 *
 * Bridges the gap between Fortuna's contextual 25-40 strategies and
 * Corvee's 1,500+ database by providing deep, authoritative detail
 * for the highest-impact strategies relevant to self-employed entrepreneurs.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaxStrategy {
  id: string
  name: string
  category: StrategyCategory
  subcategory: string
  summary: string
  detailedDescription: string
  ircReferences: IRCReference[]
  eligibility: EligibilityCriteria
  savingsEstimator: (income: number, marginalRate: number, filingStatus: string) => SavingsEstimate
  implementationChecklist: ChecklistItem[]
  phaseOuts?: PhaseOut[]
  stateNotes: StateNote[]
  auditRisk: 'low' | 'medium' | 'high'
  auditNotes: string
  relatedStrategies: string[]
  tags: string[]
  effectiveForTaxYear: number[]
  complexity: 'simple' | 'moderate' | 'complex' | 'specialist'
}

export type StrategyCategory =
  | 'retirement'
  | 'entity_structure'
  | 'deductions'
  | 'credits'
  | 'income_shifting'
  | 'timing'
  | 'investment'
  | 'real_estate'
  | 'crypto_defi'
  | 'health_benefits'
  | 'education'
  | 'charitable'
  | 'estate_planning'
  | 'international'
  | 'compliance'

export interface IRCReference {
  section: string
  title: string
  relevance: string
  url?: string
}

export interface EligibilityCriteria {
  filingStatuses: string[]
  incomeRange?: { min?: number; max?: number }
  entityTypes: string[]
  requirements: string[]
  disqualifiers: string[]
}

export interface SavingsEstimate {
  estimatedSavings: number
  explanation: string
  confidence: 'high' | 'medium' | 'low'
  caveats: string[]
}

export interface ChecklistItem {
  step: number
  action: string
  deadline?: string
  professional?: 'cpa' | 'attorney' | 'financial_advisor'
  details: string
}

export interface PhaseOut {
  description: string
  startIncome: number
  endIncome: number
  filingStatus: string
  effect: string
}

export interface StateNote {
  states: string[]
  note: string
  impact: 'positive' | 'negative' | 'neutral'
}

// ─── Category Metadata ──────────────────────────────────────────────────────

export const STRATEGY_CATEGORIES: Record<StrategyCategory, { label: string; emoji: string; color: string; description: string }> = {
  retirement:       { label: 'Retirement',          emoji: '🏦', color: '#3b82f6', description: 'Tax-advantaged retirement contributions and strategies' },
  entity_structure: { label: 'Entity Structure',    emoji: '🏢', color: '#8b5cf6', description: 'Business entity optimization for tax efficiency' },
  deductions:       { label: 'Deductions',          emoji: '✂️', color: '#10b981', description: 'Above/below-the-line deductions and write-offs' },
  credits:          { label: 'Tax Credits',         emoji: '🎯', color: '#f59e0b', description: 'Dollar-for-dollar tax credits' },
  income_shifting:  { label: 'Income Shifting',     emoji: '🔄', color: '#ec4899', description: 'Timing and allocation strategies' },
  timing:           { label: 'Timing Strategies',   emoji: '⏰', color: '#6366f1', description: 'Accelerate deductions, defer income' },
  investment:       { label: 'Investment',          emoji: '📈', color: '#14b8a6', description: 'Capital gains, harvesting, and portfolio strategies' },
  real_estate:      { label: 'Real Estate',         emoji: '🏠', color: '#a855f7', description: 'Property-related tax benefits' },
  crypto_defi:      { label: 'Crypto & DeFi',       emoji: '₿',  color: '#f97316', description: 'Digital asset-specific strategies' },
  health_benefits:  { label: 'Health Benefits',     emoji: '🏥', color: '#ef4444', description: 'Health insurance and medical deductions' },
  education:        { label: 'Education',           emoji: '📚', color: '#0ea5e9', description: 'Education credits and deductions' },
  charitable:       { label: 'Charitable',          emoji: '💝', color: '#d946ef', description: 'Charitable giving strategies' },
  estate_planning:  { label: 'Estate Planning',     emoji: '📜', color: '#78716c', description: 'Wealth transfer and estate strategies' },
  international:    { label: 'International',       emoji: '🌍', color: '#0d9488', description: 'Foreign income and treaty strategies' },
  compliance:       { label: 'Compliance',          emoji: '📋', color: '#64748b', description: 'Filing optimization and penalty avoidance' },
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const seRate = 0.9235 * 0.153 // ~14.13% SE tax effective rate
const halfSE = (income: number) => income * seRate * 0.5 // deductible half of SE tax

function clamp(val: number, min: number, max: number) { return Math.max(min, Math.min(max, val)) }

// ─── Strategy Database ──────────────────────────────────────────────────────

export const STRATEGY_DATABASE: TaxStrategy[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // RETIREMENT STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'solo-401k',
    name: 'Solo 401(k) Maximization',
    category: 'retirement',
    subcategory: 'Defined Contribution',
    summary: 'Contribute up to $69,000 ($76,500 if 50+) as both employer and employee to a solo 401(k).',
    detailedDescription: 'A Solo 401(k), also known as an Individual 401(k), allows self-employed individuals with no employees (other than a spouse) to make both employee elective deferrals and employer profit-sharing contributions. For 2025, employee deferrals are $23,500 ($31,000 if age 50+), plus employer contributions up to 25% of net self-employment income (after the SE tax deduction), with a combined limit of $69,000 ($76,500 with catch-up). This is the single most impactful retirement strategy for high-earning self-employed individuals because the employer contribution has no income phase-out.',
    ircReferences: [
      { section: 'IRC §401(k)', title: 'Cash or Deferred Arrangements', relevance: 'Establishes 401(k) plan rules including elective deferral limits' },
      { section: 'IRC §402(g)', title: 'Limitation on Exclusion for Elective Deferrals', relevance: '$23,500 employee deferral limit for 2025' },
      { section: 'IRC §415(c)', title: 'Limitation for Defined Contribution Plans', relevance: '$69,000 total annual addition limit for 2025' },
      { section: 'IRC §414(v)', title: 'Catch-Up Contributions', relevance: 'Additional $7,500 for participants age 50+' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp'],
      requirements: ['Self-employed with no full-time employees (spouse OK)', 'Must establish plan by December 31 of tax year', 'Employer contributions must be made by tax filing deadline (with extensions)'],
      disqualifiers: ['Having non-spouse W-2 employees working 1,000+ hours/year', 'Participating in employer 401(k) reduces employee deferral limit'],
    },
    savingsEstimator: (income, marginalRate) => {
      const netSE = income * 0.9235 - halfSE(income) // net SE income after half SE deduction
      const employeeDeferral = Math.min(23500, netSE)
      const employerContrib = Math.min(netSE * 0.25, 69000 - employeeDeferral)
      const totalContrib = employeeDeferral + employerContrib
      const taxSavings = totalContrib * marginalRate
      const seSavings = 0 // 401k doesn't reduce SE income
      return {
        estimatedSavings: Math.round(taxSavings),
        explanation: `Contributing $${employeeDeferral.toLocaleString()} (employee) + $${Math.round(employerContrib).toLocaleString()} (employer) = $${Math.round(totalContrib).toLocaleString()} total. At ${(marginalRate * 100).toFixed(0)}% marginal rate = ~$${Math.round(taxSavings).toLocaleString()} in federal tax savings.`,
        confidence: 'high',
        caveats: ['State tax savings additional', 'Required Minimum Distributions begin at age 73', 'Early withdrawal penalty of 10% before age 59½'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Choose a Solo 401(k) provider', details: 'Fidelity, Schwab, Vanguard, or E*TRADE all offer free Solo 401(k) plans. Compare for Roth option, loan provisions, and investment choices.' },
      { step: 2, action: 'Open and establish the plan by December 31', deadline: 'December 31 of tax year', details: 'The plan must be established (documents signed) by year-end, even though contributions can be made later.' },
      { step: 3, action: 'Calculate maximum contribution', details: 'Use net SE income (Line 31 of Schedule C minus half SE tax) to compute 25% employer limit. Add employee deferral up to $23,500.' },
      { step: 4, action: 'Make employee elective deferral', deadline: 'December 31 of tax year (for sole props/partnerships)', details: 'Sole proprietors must make employee deferrals by Dec 31. S-Corp owners must make deferrals through payroll by Dec 31.' },
      { step: 5, action: 'Make employer profit-sharing contribution', deadline: 'Tax filing deadline (including extensions)', details: 'Can be made up to April 15 (or October 15 with extension). Report on Form 1040, Line 16.' },
      { step: 6, action: 'File Form 5500-EZ if plan assets exceed $250,000', deadline: 'July 31 following plan year-end', details: 'Required annual filing once assets cross $250K threshold. Penalty for late filing: $250/day up to $150K.', professional: 'cpa' },
    ],
    phaseOuts: [], // No income phase-out for Solo 401(k)
    stateNotes: [
      { states: ['CA', 'NY', 'NJ', 'HI', 'OR', 'MN', 'VT', 'IA', 'WI', 'ME'], note: 'High state income tax makes the deduction even more valuable — state tax savings add 5-13% on top of federal.', impact: 'positive' },
      { states: ['TX', 'FL', 'WA', 'NV', 'WY', 'SD', 'AK', 'NH', 'TN'], note: 'No state income tax — savings are federal only.', impact: 'neutral' },
    ],
    auditRisk: 'low',
    auditNotes: 'Well-established retirement vehicle. Main audit risk: contributing more than allowed based on net SE income, or having disqualifying employees.',
    relatedStrategies: ['sep-ira', 'defined-benefit', 'roth-conversion', 'backdoor-roth'],
    tags: ['retirement', 'self-employed', 'high-impact', 'tax-deferral'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'moderate',
  },

  {
    id: 'sep-ira',
    name: 'SEP IRA Contribution',
    category: 'retirement',
    subcategory: 'Simplified Employee Pension',
    summary: 'Contribute up to 25% of net SE income (max $69,000) with minimal administration.',
    detailedDescription: 'A SEP IRA allows self-employed individuals to contribute up to 25% of net self-employment income (after the half-SE-tax deduction), with a maximum of $69,000 for 2025. Simpler to administer than a Solo 401(k) — no annual Form 5500 filing requirement. However, there is no employee deferral component and no Roth option, making it less flexible than a Solo 401(k) for high earners.',
    ircReferences: [
      { section: 'IRC §408(k)', title: 'Simplified Employee Pension', relevance: 'Establishes SEP IRA rules and contribution limits' },
      { section: 'IRC §402(h)', title: 'SEP Contribution Limit', relevance: '25% of compensation up to $69,000 for 2025' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp', 'c_corp'],
      requirements: ['Self-employment income', 'Can be established and funded up to tax filing deadline (with extensions)'],
      disqualifiers: ['Must cover eligible employees if you have any (contributing same % for all)', 'Cannot combine with Solo 401(k) employee deferrals at same employer'],
    },
    savingsEstimator: (income, marginalRate) => {
      const netSE = income * 0.9235 - halfSE(income)
      const maxContrib = Math.min(netSE * 0.25, 69000)
      const savings = maxContrib * marginalRate
      return {
        estimatedSavings: Math.round(savings),
        explanation: `25% of net SE income = $${Math.round(maxContrib).toLocaleString()} contribution. At ${(marginalRate * 100).toFixed(0)}% = ~$${Math.round(savings).toLocaleString()} federal tax savings.`,
        confidence: 'high',
        caveats: ['No Roth option', 'Must contribute same % for all eligible employees', 'Lower total possible contribution than Solo 401(k) at higher incomes'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Open SEP IRA at any brokerage', details: 'Fidelity, Schwab, Vanguard. Simple 1-page IRS Form 5305-SEP.' },
      { step: 2, action: 'Calculate 25% of net SE income', details: 'Net SE = Schedule C profit × 0.9235, minus half of SE tax. Then multiply by 25%.' },
      { step: 3, action: 'Make contribution by filing deadline', deadline: 'April 15 (or October 15 with extension)', details: 'This is the key advantage: you can wait until you know your actual income before deciding how much to contribute.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA', 'NY', 'NJ'], note: 'Deductible for state purposes as well, providing additional 6-13% savings.', impact: 'positive' },
    ],
    auditRisk: 'low',
    auditNotes: 'Very common strategy with minimal audit risk.',
    relatedStrategies: ['solo-401k', 'defined-benefit', 'simple-ira'],
    tags: ['retirement', 'self-employed', 'simple', 'tax-deferral'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'simple',
  },

  {
    id: 'defined-benefit',
    name: 'Defined Benefit Plan (Cash Balance)',
    category: 'retirement',
    subcategory: 'Defined Benefit',
    summary: 'Deduct $100K-$300K+ annually through an actuarially-determined pension plan.',
    detailedDescription: 'A Defined Benefit (DB) or Cash Balance plan allows dramatically higher tax-deductible contributions than any defined contribution plan. Contribution limits are based on actuarial calculations considering age, income, and years to retirement. For a self-employed individual age 50+, annual deductible contributions can exceed $250,000. Can be combined with a 401(k) for even greater total deductions. Requires annual actuarial certification and is more complex to administer.',
    ircReferences: [
      { section: 'IRC §415(b)', title: 'Limitation for Defined Benefit Plans', relevance: 'Annual benefit limit of $280,000 (2025), which drives allowed contributions' },
      { section: 'IRC §404(a)', title: 'Deduction Limits for Employer Contributions', relevance: 'Employer contribution deduction rules for DB plans' },
      { section: 'IRC §412', title: 'Minimum Funding Standards', relevance: 'Mandatory annual funding requirements' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      incomeRange: { min: 200000 },
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp', 'c_corp'],
      requirements: ['Consistent high income ($200K+/year for 3+ years recommended)', 'Must commit to funding for 3-5 years minimum', 'Annual actuarial certification required', 'Age 40+ gets highest benefit (contribution limits increase with age)'],
      disqualifiers: ['Volatile or declining income (creates funding risk)', 'Plans to retire in <3 years without sufficient accumulation'],
    },
    savingsEstimator: (income, marginalRate) => {
      // Simplified estimate based on age 50, $250K income
      const contribution = Math.min(income * 0.5, 250000) // rough approximation
      const savings = contribution * marginalRate
      return {
        estimatedSavings: Math.round(savings),
        explanation: `Estimated actuarial contribution of ~$${Math.round(contribution).toLocaleString()} (varies by age and income). At ${(marginalRate * 100).toFixed(0)}% = ~$${Math.round(savings).toLocaleString()} federal savings. Actual amount requires actuarial calculation.`,
        confidence: 'low',
        caveats: ['Requires actuarial determination — estimate only', 'Annual actuarial fees $1,500-3,000', 'Must fund plan even in low-income years', 'Excise tax for under-funding'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Consult with actuarial firm', professional: 'financial_advisor', details: 'Companies like Dedicated Defined Benefit, Kravitz, or local TPA firms. Get feasibility analysis based on your age, income, and goals.' },
      { step: 2, action: 'Establish plan by fiscal year-end', deadline: 'December 31 of tax year', details: 'Plan document must be adopted before year-end.' },
      { step: 3, action: 'Fund the plan by tax filing deadline', deadline: 'April 15 or October 15 with extension', details: 'Mandatory minimum contribution must be made or face excise tax.' },
      { step: 4, action: 'Annual actuarial certification', deadline: 'Annually', professional: 'financial_advisor', details: 'Actuary must certify funding status and recalculate contribution each year.' },
      { step: 5, action: 'File Form 5500', deadline: 'July 31', professional: 'cpa', details: 'Annual filing required with Schedule SB (actuary attaches).' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA'], note: 'California conforms — full state deduction available, adding 9.3-13.3% savings on top of federal.', impact: 'positive' },
      { states: ['NY'], note: 'New York conforms — deductible for state, adding 4-10.9% savings.', impact: 'positive' },
    ],
    auditRisk: 'medium',
    auditNotes: 'IRS scrutinizes DB plans for owner-only businesses. Key risk: plan termination within 5 years can trigger recapture. Ensure consistent income justifies contribution levels.',
    relatedStrategies: ['solo-401k', 'sep-ira', 's-corp-election'],
    tags: ['retirement', 'high-income', 'complex', 'maximum-deferral'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'specialist',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY STRUCTURE STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 's-corp-election',
    name: 'S Corporation Election',
    category: 'entity_structure',
    subcategory: 'Entity Optimization',
    summary: 'Elect S-Corp status to split income into salary (subject to SE tax) and distributions (not subject to SE tax).',
    detailedDescription: 'An S Corporation election allows business owners to pay themselves a "reasonable salary" and take remaining profits as distributions that are NOT subject to self-employment tax (15.3%). For a sole proprietor earning $150K in profit, converting to S-Corp with a $70K salary could save $11,000+ in SE tax annually. The key IRS requirement is "reasonable compensation" — salary must be fair market value for the services provided.',
    ircReferences: [
      { section: 'IRC §1362', title: 'Election; Revocation; Termination', relevance: 'S-Corp election requirements and procedures (Form 2553)' },
      { section: 'IRC §1361(b)', title: 'Small Business Corporation Defined', relevance: 'Eligibility: ≤100 shareholders, one class of stock, US shareholders only' },
      { section: 'Rev. Rul. 74-44', title: 'Reasonable Compensation', relevance: 'IRS position that S-Corp officer-shareholders must receive reasonable compensation' },
      { section: 'IRC §3121(a)', title: 'Wages; Employment Tax', relevance: 'Only wages (not distributions) subject to FICA taxes' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      incomeRange: { min: 50000 },
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership'],
      requirements: ['Net profit generally >$50K/year for savings to exceed compliance costs', 'Must pay reasonable compensation via payroll', 'Must file Form 1120-S annually', 'Must maintain corporate formalities'],
      disqualifiers: ['Non-US shareholders', 'More than 100 shareholders', 'Multiple classes of stock', 'Income too low to justify compliance costs'],
    },
    savingsEstimator: (income, marginalRate) => {
      if (income < 50000) return { estimatedSavings: 0, explanation: 'Income below threshold for S-Corp savings.', confidence: 'high', caveats: [] }
      const reasonableSalary = Math.max(40000, income * 0.45) // rough reasonable comp estimate
      const distribution = Math.max(0, income - reasonableSalary)
      const seTaxSaved = distribution * 0.153
      const additionalCosts = 3000 // payroll + extra filing costs
      const netSavings = seTaxSaved - additionalCosts
      return {
        estimatedSavings: Math.round(Math.max(0, netSavings)),
        explanation: `Reasonable salary: ~$${Math.round(reasonableSalary).toLocaleString()}, Distribution: ~$${Math.round(distribution).toLocaleString()}. SE tax saved on distributions: ~$${Math.round(seTaxSaved).toLocaleString()}, minus ~$3K compliance costs = ~$${Math.round(netSavings).toLocaleString()} net savings.`,
        confidence: 'medium',
        caveats: ['Reasonable compensation is subjective and fact-dependent', 'Additional costs: payroll service ($500-1500/yr), separate tax return ($500-1500)', 'Must file Form 2553 by March 15 (or within 75 days of formation)'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Evaluate if S-Corp makes financial sense', details: 'Rule of thumb: net profit >$50K and SE tax savings exceed $3-5K in additional compliance costs.' },
      { step: 2, action: 'File Form 2553 with IRS', deadline: 'March 15 of the year election is to take effect (or within 75 days of formation)', details: 'Late elections possible with reasonable cause via Rev. Proc. 2013-30.', professional: 'cpa' },
      { step: 3, action: 'Set up payroll', details: 'Use Gusto, ADP, or similar to process regular payroll with W-2, withholding, and payroll tax filings.' },
      { step: 4, action: 'Determine reasonable compensation', details: 'Research comparable salaries for your role using BLS data, salary surveys. Document your methodology.', professional: 'cpa' },
      { step: 5, action: 'Run payroll at least monthly', details: 'Pay yourself regular salary with proper withholding. Take remaining profits as distributions.' },
      { step: 6, action: 'File Form 1120-S and Schedule K-1', deadline: 'March 15 (or September 15 with extension)', professional: 'cpa', details: 'S-Corp files its own return. K-1 flows to your personal 1040.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA'], note: 'California imposes a 1.5% net income tax on S-Corps (minimum $800), reducing savings by ~$800-2,250+.', impact: 'negative' },
      { states: ['NY'], note: 'New York City does not recognize S-Corp status — city tax still applies on full income.', impact: 'negative' },
      { states: ['TX'], note: 'Texas franchise tax applies to S-Corps with >$2.47M in revenue. Below threshold: no state impact.', impact: 'neutral' },
      { states: ['IL'], note: 'Illinois imposes a 1.5% replacement tax on S-Corp income.', impact: 'negative' },
      { states: ['NH'], note: 'New Hampshire taxes S-Corp distributions as business profits tax (7.5%).', impact: 'negative' },
    ],
    auditRisk: 'medium',
    auditNotes: 'IRS actively audits S-Corp reasonable compensation. Key risk: setting salary too low relative to industry norms. Watson v. Commissioner (2012) established that IRS can reclassify distributions as wages.',
    relatedStrategies: ['solo-401k', 'qbi-deduction', 'reasonable-comp', 'health-insurance-deduction'],
    tags: ['entity', 'se-tax-reduction', 'high-impact', 'payroll'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'moderate',
  },

  {
    id: 'qbi-deduction',
    name: 'Qualified Business Income (QBI) Deduction',
    category: 'entity_structure',
    subcategory: 'Pass-Through Deduction',
    summary: 'Deduct up to 20% of qualified business income from pass-through entities (§199A).',
    detailedDescription: 'The §199A deduction allows owners of pass-through businesses (sole proprietorships, LLCs, S-Corps, partnerships) to deduct up to 20% of qualified business income. For taxable income below $191,950 (single) / $383,900 (MFJ) in 2025, the deduction is straightforward. Above those thresholds, limitations based on W-2 wages and qualified property begin to apply, and "specified service trades or businesses" (SSTBs) face phase-outs.',
    ircReferences: [
      { section: 'IRC §199A', title: 'Qualified Business Income', relevance: 'Establishes the 20% pass-through deduction' },
      { section: 'IRC §199A(d)', title: 'Specified Service Trade or Business', relevance: 'Defines SSTBs subject to income-based phase-outs' },
      { section: 'Treas. Reg. §1.199A-1 through §1.199A-6', title: 'QBI Regulations', relevance: 'Detailed rules for calculation, aggregation, and limitations' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp'],
      requirements: ['Pass-through business income', 'Not a C Corporation'],
      disqualifiers: ['C Corporation income', 'Employee wage income (W-2)', 'Guaranteed payments from partnerships (partially)'],
    },
    savingsEstimator: (income, marginalRate, filingStatus) => {
      const qbiAmount = income * 0.2
      const threshold = filingStatus === 'mfj' ? 383900 : 191950
      let deduction: number
      if (income <= threshold) {
        deduction = qbiAmount
      } else {
        deduction = Math.max(0, qbiAmount * (1 - (income - threshold) / 100000))
      }
      const savings = deduction * marginalRate
      return {
        estimatedSavings: Math.round(savings),
        explanation: `20% of $${income.toLocaleString()} QBI = $${Math.round(deduction).toLocaleString()} deduction. At ${(marginalRate * 100).toFixed(0)}% = ~$${Math.round(savings).toLocaleString()} savings.`,
        confidence: income > threshold ? 'medium' : 'high',
        caveats: income > threshold ? ['SSTB phase-out may reduce or eliminate deduction', 'W-2 wage / qualified property limitations apply above threshold'] : ['Confirm business is not an SSTB', 'Currently set to expire after 2025 unless Congress extends'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Determine if your business qualifies', details: 'Most non-SSTB businesses qualify. SSTBs (consulting, law, accounting, health, financial services) face income-based phase-outs.' },
      { step: 2, action: 'Calculate QBI on your return', details: 'QBI = net business income minus the deductible half of SE tax, minus SE health insurance, minus retirement contributions.', professional: 'cpa' },
      { step: 3, action: 'Check income thresholds', details: 'Below $191,950 (single) / $383,900 (MFJ): full 20% deduction. Above: W-2 wages / qualified property test applies.' },
      { step: 4, action: 'Consider aggregation of businesses', details: 'If you have multiple businesses, aggregating them may help satisfy the W-2 wage test.', professional: 'cpa' },
    ],
    phaseOuts: [
      { description: 'SSTB Income Phase-Out (Single)', startIncome: 191950, endIncome: 241950, filingStatus: 'single', effect: 'SSTB QBI deduction phases out completely over this range' },
      { description: 'SSTB Income Phase-Out (MFJ)', startIncome: 383900, endIncome: 433900, filingStatus: 'mfj', effect: 'SSTB QBI deduction phases out completely over this range' },
    ],
    stateNotes: [
      { states: ['CA', 'NJ', 'MN', 'HI'], note: 'These states do NOT conform to §199A — no state-level QBI deduction.', impact: 'negative' },
      { states: ['IL', 'OH', 'PA', 'IN'], note: 'These states generally conform or have flat taxes that aren\u2019t affected.', impact: 'neutral' },
    ],
    auditRisk: 'low',
    auditNotes: 'Standard deduction claimed on millions of returns. Risk increases if claiming QBI deduction for an SSTB above income thresholds.',
    relatedStrategies: ['s-corp-election', 'reasonable-comp', 'income-shifting-family'],
    tags: ['deduction', 'pass-through', 'section-199a', 'sunset-risk-2025'],
    effectiveForTaxYear: [2024, 2025],
    complexity: 'moderate',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CRYPTO & DEFI STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'tax-loss-harvesting-crypto',
    name: 'Crypto Tax-Loss Harvesting',
    category: 'crypto_defi',
    subcategory: 'Capital Loss Optimization',
    summary: 'Sell underperforming crypto to realize losses that offset capital gains (no wash sale rule for crypto in 2024).',
    detailedDescription: 'Tax-loss harvesting involves selling crypto assets at a loss to offset realized capital gains, then optionally repurchasing the same or similar asset. For tax years through 2024, the IRS wash sale rule (IRC §1091) technically applies only to "securities" and "stock" — crypto is classified as "property," not a security, meaning you could theoretically sell and immediately rebuy. IMPORTANT: Starting January 1, 2025, the Tax Cuts and Jobs Act amendments expand wash sale rules to cover digital assets. Capital losses can offset unlimited capital gains, plus up to $3,000 of ordinary income annually, with unlimited carryforward.',
    ircReferences: [
      { section: 'IRC §1091', title: 'Loss from Wash Sales of Stock or Securities', relevance: 'Wash sale rule — does not explicitly cover crypto through 2024; extended to digital assets starting 2025' },
      { section: 'IRC §1211', title: 'Limitation on Capital Losses', relevance: '$3,000 annual limit on capital losses deducted against ordinary income' },
      { section: 'IRC §1212', title: 'Capital Loss Carryovers', relevance: 'Unlimited carryforward of unused capital losses to future years' },
      { section: 'Notice 2014-21', title: 'IRS Virtual Currency Guidance', relevance: 'Establishes crypto as "property" for tax purposes' },
      { section: 'Rev. Proc. 2024-28', title: 'Per-Wallet Cost Basis', relevance: 'Mandatory per-wallet cost basis tracking starting 2025' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp', 'c_corp', 'individual'],
      requirements: ['Crypto positions with unrealized losses', 'Realized capital gains to offset (or $3K ordinary income offset)'],
      disqualifiers: ['No unrealized losses to harvest', 'After 2024: wash sale rule applies to digital assets (30-day restriction)'],
    },
    savingsEstimator: (income, marginalRate) => {
      // Assume 10% of portfolio is at a loss, average loss 30%
      const estimatedHarvest = income * 0.05 // rough: 5% of income available to harvest
      const gainOffset = estimatedHarvest * 0.15 // LTCG rate savings
      const ordinaryOffset = Math.min(3000, estimatedHarvest) * marginalRate
      const totalSavings = gainOffset + ordinaryOffset
      return {
        estimatedSavings: Math.round(totalSavings),
        explanation: `Estimated harvestable losses offset capital gains at 15% rate plus up to $3,000 at ${(marginalRate * 100).toFixed(0)}% ordinary rate. Actual savings depend on specific positions.`,
        confidence: 'low',
        caveats: ['Actual savings depend on portfolio positions', 'Wash sale rules apply starting 2025 for crypto', 'Must maintain documentation of all transactions'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Review portfolio for positions with unrealized losses', details: 'Compare current value vs. cost basis for each position. Prioritize largest losses.' },
      { step: 2, action: 'Calculate total realized gains YTD', details: 'Sum all capital gains from sales, swaps, and conversions during the tax year.' },
      { step: 3, action: 'Execute harvesting sales before December 31', deadline: 'December 31', details: 'Sell loss positions. For 2024: can immediately repurchase. For 2025+: wait 30 days to avoid wash sale.' },
      { step: 4, action: 'Document all transactions', details: 'Record date, quantity, cost basis, proceeds, and exchange for every sale. Keep exchange confirmation screenshots.' },
      { step: 5, action: 'Report on Form 8949 and Schedule D', deadline: 'Tax filing deadline', professional: 'cpa', details: 'Each harvesting sale must be reported individually.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA'], note: 'California taxes capital gains as ordinary income — harvesting losses is even more valuable (saves at marginal rate up to 13.3%).', impact: 'positive' },
      { states: ['NY', 'NJ', 'CT', 'OR', 'HI'], note: 'High state capital gains rates make loss harvesting more impactful.', impact: 'positive' },
    ],
    auditRisk: 'low',
    auditNotes: 'Tax-loss harvesting is a standard, well-accepted strategy. Key documentation: maintain trade confirmations, cost basis records, and timing proof for wash sale compliance (2025+).',
    relatedStrategies: ['holding-period-optimization', 'staking-entity-structure', 'crypto-donation'],
    tags: ['crypto', 'capital-gains', 'portfolio', 'year-end'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'moderate',
  },

  {
    id: 'staking-entity-structure',
    name: 'Staking/Mining Income Entity Structuring',
    category: 'crypto_defi',
    subcategory: 'Entity Optimization for Crypto Income',
    summary: 'Route staking/mining income through an S-Corp to avoid full SE tax on crypto income classified as ordinary income.',
    detailedDescription: 'Cryptocurrency staking rewards and mining income are taxable as ordinary income at fair market value when received, and may be subject to self-employment tax if conducted as a trade or business. By routing this activity through an S-Corp, you can pay a reasonable salary and take remaining income as distributions exempt from SE tax. This is particularly valuable for validators, large-scale stakers, and miners with significant regular income streams.',
    ircReferences: [
      { section: 'IRC §61', title: 'Gross Income Defined', relevance: 'Staking rewards are gross income at FMV when received' },
      { section: 'IRC §1402', title: 'Self-Employment Tax', relevance: 'Mining/staking as trade or business subject to SE tax' },
      { section: 'Notice 2014-21', title: 'Virtual Currency', relevance: 'IRS guidance on mining as ordinary income' },
      { section: 'Rev. Rul. 2023-14', title: 'Staking Rewards', relevance: 'Staking rewards taxable when received (dominion and control)' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      incomeRange: { min: 20000 },
      entityTypes: ['sole_proprietorship', 'single_member_llc'],
      requirements: ['Staking/mining income >$20K/year', 'Activity constitutes trade or business', 'Consistent, regular income stream'],
      disqualifiers: ['Sporadic small staking rewards (<$5K/year)', 'Activity more passive investment than business'],
    },
    savingsEstimator: (income, marginalRate) => {
      const stakingIncome = Math.min(income * 0.3, 100000)
      const reasonableSalary = stakingIncome * 0.4
      const distribution = stakingIncome - reasonableSalary
      const seTaxSaved = distribution * 0.153
      const complianceCost = 3000
      return {
        estimatedSavings: Math.round(Math.max(0, seTaxSaved - complianceCost)),
        explanation: `Estimated staking/mining income routed through S-Corp: salary $${Math.round(reasonableSalary).toLocaleString()}, distributions $${Math.round(distribution).toLocaleString()}. SE tax saved: ~$${Math.round(seTaxSaved).toLocaleString()} minus $3K compliance costs.`,
        confidence: 'medium',
        caveats: ['IRS position on staking SE tax is evolving', 'Reasonable compensation must be justified', 'S-Corp compliance costs apply'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Evaluate staking/mining income volume', details: 'Track total staking rewards and mining income over 12 months. If >$20K, entity structuring likely beneficial.' },
      { step: 2, action: 'Form LLC and elect S-Corp status', professional: 'attorney', details: 'Form LLC in your state, then file Form 2553 for S-Corp election.' },
      { step: 3, action: 'Transfer staking/mining operations to entity', details: 'Move validator nodes, mining equipment, and wallet operations under the entity.' },
      { step: 4, action: 'Set up payroll and determine reasonable compensation', professional: 'cpa', details: 'Pay regular salary through payroll service. Document compensation analysis.' },
      { step: 5, action: 'Track all staking rewards with timestamps and FMV', details: 'Maintain detailed log of every reward: date, amount, token, FMV at receipt. Use crypto tax software for automation.' },
    ],
    phaseOuts: [],
    stateNotes: [],
    auditRisk: 'medium',
    auditNotes: 'IRS is increasingly scrutinizing crypto income reporting. Key risks: failure to report staking rewards, aggressive salary/distribution splits. Jarrett v. United States (2022) raised questions about staking tax timing (creation vs. receipt) but IRS position remains: taxable at receipt.',
    relatedStrategies: ['s-corp-election', 'tax-loss-harvesting-crypto', 'solo-401k'],
    tags: ['crypto', 'staking', 'mining', 'entity', 'se-tax'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'complex',
  },

  {
    id: 'holding-period-optimization',
    name: 'Crypto Holding Period Optimization',
    category: 'crypto_defi',
    subcategory: 'Capital Gains Rate Management',
    summary: 'Strategically time sales to qualify for long-term capital gains rates (0%/15%/20%) instead of ordinary income rates.',
    detailedDescription: 'Crypto held for more than 12 months qualifies for preferential long-term capital gains rates: 0% up to $47,025 (single) / $94,050 (MFJ), 15% up to $518,900 (single) / $583,750 (MFJ), and 20% above those thresholds. Short-term gains are taxed at ordinary income rates up to 37%. For a taxpayer in the 32% bracket, the difference between selling at 11 months vs 13 months can be 17 percentage points (32% vs 15%).',
    ircReferences: [
      { section: 'IRC §1(h)', title: 'Maximum Capital Gains Rate', relevance: '0%/15%/20% rate structure for long-term capital gains' },
      { section: 'IRC §1222', title: 'Long-Term and Short-Term Definitions', relevance: 'Defines >12 months holding period for LTCG treatment' },
      { section: 'IRC §1(h)(11)', title: 'Net Capital Gain', relevance: 'Calculation of preferential rate brackets' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp', 'individual'],
      requirements: ['Crypto positions approaching 12-month holding period', 'Flexibility to time sales'],
      disqualifiers: ['Day traders (holding period rarely exceeds days)', 'Positions already past 12 months (already qualify)'],
    },
    savingsEstimator: (income, marginalRate) => {
      // Estimate savings from timing a $50K gain as LTCG vs STCG
      const estimatedGain = 50000
      const stcgTax = estimatedGain * marginalRate
      const ltcgRate = income > 518900 ? 0.20 : income > 47025 ? 0.15 : 0
      const ltcgTax = estimatedGain * ltcgRate
      const savings = stcgTax - ltcgTax
      return {
        estimatedSavings: Math.round(savings),
        explanation: `On a $50K gain: short-term tax at ${(marginalRate * 100).toFixed(0)}% = $${Math.round(stcgTax).toLocaleString()} vs long-term at ${(ltcgRate * 100).toFixed(0)}% = $${Math.round(ltcgTax).toLocaleString()}. Savings: $${Math.round(savings).toLocaleString()}.`,
        confidence: 'high',
        caveats: ['Requires holding for 12+ months', 'Market risk during holding period', 'NIIT (3.8%) may apply above $200K/$250K AGI'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Tag all positions with acquisition dates', details: 'Record exact purchase/receipt date for every position in your portfolio tracker.' },
      { step: 2, action: 'Set alerts for positions approaching 12-month threshold', details: 'Fortuna\u2019s proactive alerts will notify you when positions are 10-14 days from LTCG eligibility.' },
      { step: 3, action: 'Delay planned sales until after LTCG qualification', details: 'If selling a position at 11 months, waiting 30+ days saves the rate differential.' },
      { step: 4, action: 'Use specific identification method', details: 'When selling partial positions, specifically identify the lots held >12 months to maximize LTCG treatment.', professional: 'cpa' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA', 'NY', 'NJ', 'OR', 'HI', 'MN'], note: 'These states tax capital gains as ordinary income — no state-level benefit from LTCG rate. Federal savings still apply.', impact: 'negative' },
    ],
    auditRisk: 'low',
    auditNotes: 'Standard tax planning. Ensure acquisition date documentation is iron-clad.',
    relatedStrategies: ['tax-loss-harvesting-crypto', 'staking-entity-structure'],
    tags: ['crypto', 'capital-gains', 'holding-period', 'timing'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'simple',
  },

  {
    id: 'airdrop-tge-planning',
    name: 'Airdrop & TGE Tax Planning',
    category: 'crypto_defi',
    subcategory: 'Token Event Preparation',
    summary: 'Plan for the tax impact of token airdrops and Token Generation Events before they create surprise tax bills.',
    detailedDescription: 'Airdrops and TGE events create taxable ordinary income at the fair market value of tokens when received (dominion and control). For large airdrops (e.g., 100M tokens at $0.02 = $2M income), the tax impact can be devastating if not planned for. Pre-TGE strategies include: estimating tax liability and reserving funds, structuring entity ownership for optimal tax treatment, timing the claim/receipt if possible, and setting up quarterly estimated payments.',
    ircReferences: [
      { section: 'IRC §61', title: 'Gross Income', relevance: 'Airdrops are gross income at FMV when received' },
      { section: 'Rev. Rul. 2019-24', title: 'Airdrop Tax Treatment', relevance: 'IRS confirms airdrops as ordinary income; taxable even if unsolicited' },
      { section: 'IRC §6654', title: 'Failure to Pay Estimated Tax', relevance: 'Penalty for underpayment of estimated taxes on airdrop income' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp', 'individual'],
      requirements: ['Anticipated or received crypto airdrop/TGE', 'Need to plan for tax impact'],
      disqualifiers: [],
    },
    savingsEstimator: (income, marginalRate) => {
      const airdropValue = income * 0.1
      const penaltyAvoided = airdropValue * marginalRate * 0.05 // estimated underpayment penalty
      return {
        estimatedSavings: Math.round(penaltyAvoided + airdropValue * 0.02),
        explanation: `Planning avoids estimated tax penalties (~${Math.round(penaltyAvoided).toLocaleString()}) and enables strategies like entity structuring and timing optimization.`,
        confidence: 'low',
        caveats: ['Actual savings depend on airdrop size and timing', 'Token value at receipt determines income', 'Liquidity risk if tokens are illiquid'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Estimate expected airdrop value', details: 'Research token price at comparable projects. For pre-TGE: model scenarios at different price points.' },
      { step: 2, action: 'Calculate estimated tax impact', details: 'Airdrop value × marginal rate = estimated tax. Add state tax. Add NIIT (3.8%) if AGI >$200K/$250K.' },
      { step: 3, action: 'Set aside funds for tax liability', details: 'Reserve 30-50% of estimated airdrop value in liquid assets (stablecoins or USD) for tax payments.' },
      { step: 4, action: 'Make quarterly estimated tax payment', deadline: 'Within quarter of receipt', details: 'File Form 1040-ES with payment to avoid underpayment penalties.' },
      { step: 5, action: 'Consider entity structuring before TGE', professional: 'cpa', details: 'If TGE is >$50K, S-Corp election may reduce SE tax on staking-earned tokens. Must be structured BEFORE the event.' },
      { step: 6, action: 'Document FMV at time of receipt', details: 'Screenshot exchange prices, CoinGecko data at exact time of token receipt. This becomes your cost basis.' },
    ],
    phaseOuts: [],
    stateNotes: [],
    auditRisk: 'medium',
    auditNotes: 'IRS is actively targeting unreported airdrop income. Key: report ALL airdrops, even small ones. The FMV determination methodology should be documented.',
    relatedStrategies: ['staking-entity-structure', 'tax-loss-harvesting-crypto', 'holding-period-optimization'],
    tags: ['crypto', 'airdrop', 'tge', 'planning', 'income'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'moderate',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEDUCTION STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'home-office-deduction',
    name: 'Home Office Deduction (Actual Method)',
    category: 'deductions',
    subcategory: 'Business Use of Home',
    summary: 'Deduct proportional home expenses (mortgage interest, property tax, utilities, insurance, repairs, depreciation) for dedicated office space.',
    detailedDescription: 'The home office deduction allows self-employed individuals who use a dedicated portion of their home exclusively and regularly for business to deduct related expenses. Two methods: (1) Simplified method: $5 per sq ft, max 300 sq ft = $1,500 max. (2) Actual expense method: percentage of total home expenses based on square footage ratio. The actual method often yields significantly higher deductions and also allows depreciation of the home (which reduces basis but provides current deduction).',
    ircReferences: [
      { section: 'IRC §280A', title: 'Disallowance of Certain Expenses in Connection with Business Use of Home', relevance: 'Primary home office deduction rules' },
      { section: 'IRC §280A(c)(1)', title: 'Exclusive and Regular Use Test', relevance: 'Space must be used exclusively and regularly for business' },
      { section: 'IRS Pub. 587', title: 'Business Use of Your Home', relevance: 'Detailed IRS guidance on calculation methods' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc'],
      requirements: ['Dedicated space used exclusively for business', 'Regular and exclusive use', 'Principal place of business OR place to meet clients'],
      disqualifiers: ['Space used for personal and business (not exclusive)', 'Employee using home office for employer convenience (different rules)', 'S-Corp/C-Corp owners (deducted differently via accountable plan)'],
    },
    savingsEstimator: (income, marginalRate) => {
      // Assume 200 sq ft office in 2000 sq ft home (10%), $30K annual home costs
      const homeExpenses = 30000
      const businessPct = 0.10
      const deduction = homeExpenses * businessPct // $3,000
      const savings = deduction * (marginalRate + 0.1413) // income tax + SE tax
      return {
        estimatedSavings: Math.round(savings),
        explanation: `Estimated 10% business use on $30K home expenses = $${deduction.toLocaleString()} deduction. Saves at ${(marginalRate * 100).toFixed(0)}% income tax + 14.1% SE tax = ~$${Math.round(savings).toLocaleString()}.`,
        confidence: 'medium',
        caveats: ['Actual savings depend on home size, expenses, and office square footage', 'Depreciation reduces home basis (recaptured at sale)', 'Must maintain exclusive use — no dual-purpose space'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Measure your dedicated office space', details: 'Record exact square footage. Must be a dedicated space — not a kitchen table or living room corner.' },
      { step: 2, action: 'Calculate business use percentage', details: 'Office sq ft ÷ total home sq ft = business percentage. Keep floor plan documentation.' },
      { step: 3, action: 'Track all home expenses', details: 'Mortgage interest, property taxes, insurance, utilities, repairs, maintenance, HOA fees. Keep receipts.' },
      { step: 4, action: 'Claim on Schedule C (Form 8829)', deadline: 'Tax filing deadline', details: 'File Form 8829 (Expenses for Business Use of Your Home) with Schedule C.' },
      { step: 5, action: 'Take photos of your office space', details: 'Document the dedicated space for audit protection. Date-stamped photos showing exclusive business use.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA'], note: 'California conforms to federal home office rules. State deduction available.', impact: 'positive' },
    ],
    auditRisk: 'medium',
    auditNotes: 'Home office is a known audit trigger, but the IRS has indicated it focuses on the exclusivity test rather than blanket auditing. Key: maintain clear documentation of exclusive business use.',
    relatedStrategies: ['vehicle-deduction', 'health-insurance-deduction', 'se-tax-deduction'],
    tags: ['deduction', 'home-office', 'self-employed', 'se-tax-reduction'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'simple',
  },

  {
    id: 'health-insurance-deduction',
    name: 'Self-Employed Health Insurance Deduction',
    category: 'health_benefits',
    subcategory: 'Above-the-Line Deduction',
    summary: 'Deduct 100% of health, dental, and vision insurance premiums for yourself, spouse, and dependents as an above-the-line deduction.',
    detailedDescription: 'Self-employed individuals can deduct health insurance premiums as an above-the-line deduction (Line 17 of Schedule 1), which reduces both income tax AND the basis for the QBI deduction. This deduction is available even if you don\u2019t itemize. For S-Corp owners, the premiums must be paid by or reimbursed by the S-Corp and included on the shareholder\u2019s W-2.',
    ircReferences: [
      { section: 'IRC §162(l)', title: 'Special Rules for Health Insurance Costs of Self-Employed Individuals', relevance: 'Establishes the above-the-line deduction for SE health premiums' },
      { section: 'Rev. Rul. 91-26', title: 'S-Corp Health Insurance', relevance: 'S-Corp must pay premiums and include on W-2 for >2% shareholder-employees' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp'],
      requirements: ['Self-employed with net profit', 'Not eligible for employer-subsidized health plan (yours or spouse\u2019s)'],
      disqualifiers: ['Eligible for employer health plan through spouse', 'Months where you were eligible for employer plan'],
    },
    savingsEstimator: (income, marginalRate) => {
      const premiums = 12000 // average individual premium
      const savings = premiums * marginalRate // saves on income tax (not SE tax, but reduces QBI)
      return {
        estimatedSavings: Math.round(savings),
        explanation: `$${premiums.toLocaleString()} annual premiums × ${(marginalRate * 100).toFixed(0)}% rate = ~$${Math.round(savings).toLocaleString()} savings. Also reduces QBI computation.`,
        confidence: 'high',
        caveats: ['Cannot exceed net SE income', 'Not deductible for months eligible for employer plan', 'Does not reduce SE tax directly (but reduces QBI)'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Ensure you have qualifying health insurance', details: 'Medical, dental, vision, and qualified long-term care insurance all qualify.' },
      { step: 2, action: 'For S-Corp: set up proper reimbursement', details: 'S-Corp must pay or reimburse premiums and report on W-2 box 1 (not boxes 3/5 — exempt from FICA).', professional: 'cpa' },
      { step: 3, action: 'Claim deduction on Schedule 1, Line 17', deadline: 'Tax filing deadline', details: 'Report total qualifying premiums. Limited to net SE income for the year.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['NJ'], note: 'New Jersey does not allow the SE health insurance deduction. Must add back on NJ return.', impact: 'negative' },
    ],
    auditRisk: 'low',
    auditNotes: 'Very common deduction. Keep insurance statements and proof of payment.',
    relatedStrategies: ['s-corp-election', 'hsa-contribution', 'home-office-deduction'],
    tags: ['health', 'deduction', 'above-the-line', 'self-employed'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'simple',
  },

  {
    id: 'hsa-contribution',
    name: 'Health Savings Account (HSA) Triple Tax Advantage',
    category: 'health_benefits',
    subcategory: 'Tax-Advantaged Savings',
    summary: 'Contribute up to $4,300 (individual) / $8,550 (family) with pre-tax dollars, tax-free growth, and tax-free qualified withdrawals.',
    detailedDescription: 'HSAs are the only "triple tax advantage" account in the tax code: contributions are tax-deductible, investment growth is tax-free, and withdrawals for qualified medical expenses are tax-free. For self-employed individuals with high-deductible health plans, the HSA doubles as a stealth retirement account — after age 65, withdrawals for any purpose are taxed as ordinary income (like a traditional IRA) but with no RMDs.',
    ircReferences: [
      { section: 'IRC §223', title: 'Health Savings Accounts', relevance: 'Establishes HSA rules, contribution limits, and eligibility' },
      { section: 'IRC §223(b)', title: 'HSA Contribution Limits', relevance: '$4,300 individual / $8,550 family for 2025, plus $1,000 catch-up for 55+' },
      { section: 'IRC §223(c)(2)', title: 'High Deductible Health Plan Requirements', relevance: 'Min deductible: $1,650 individual / $3,300 family; max OOP: $8,300 / $16,600 for 2025' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp', 'individual'],
      requirements: ['Enrolled in qualifying High Deductible Health Plan (HDHP)', 'Not enrolled in Medicare', 'Not claimed as dependent on another return', 'No disqualifying coverage'],
      disqualifiers: ['Medicare enrollment', 'Non-HDHP health insurance', 'Full-purpose FSA enrollment'],
    },
    savingsEstimator: (income, marginalRate) => {
      const contribution = 4300 // individual
      const incomeTaxSaved = contribution * marginalRate
      const seTaxSaved = contribution * 0.0765 // HSA deduction reduces SE income for employee portion
      const totalSavings = incomeTaxSaved + seTaxSaved
      return {
        estimatedSavings: Math.round(totalSavings),
        explanation: `$${contribution.toLocaleString()} contribution saves $${Math.round(incomeTaxSaved).toLocaleString()} income tax + ~$${Math.round(seTaxSaved).toLocaleString()} in FICA equivalent. Plus tax-free growth and withdrawals for medical.`,
        confidence: 'high',
        caveats: ['Must have qualifying HDHP', 'Family contribution limit is $8,550', 'Non-medical withdrawals before 65 incur 20% penalty + income tax'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Verify HDHP enrollment', details: 'Confirm your health plan meets minimum deductible ($1,650 individual / $3,300 family) and maximum OOP requirements.' },
      { step: 2, action: 'Open HSA account', details: 'Fidelity (no fees, broad investments) or Lively/HSA Bank for self-employed. Avoid HSAs with high fees.' },
      { step: 3, action: 'Contribute maximum by April 15', deadline: 'April 15 of following year', details: 'Can contribute for prior tax year up to April 15. Set up monthly transfers to spread contributions.' },
      { step: 4, action: 'Invest HSA funds for long-term growth', details: 'Treat as retirement account: invest in index funds, not savings. Keep separate funds for near-term medical expenses.' },
      { step: 5, action: 'Save medical receipts indefinitely', details: 'You can reimburse yourself from HSA for past expenses at any time in the future. Keep receipt archive.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['CA', 'NJ'], note: 'California and New Jersey do NOT recognize HSA deductions or tax-free growth. HSA contributions are taxable, and investment gains are taxable at state level.', impact: 'negative' },
      { states: ['AL', 'WI'], note: 'These states have limited HSA conformity. Check current state treatment.', impact: 'negative' },
    ],
    auditRisk: 'low',
    auditNotes: 'Well-established tax-advantaged account. Key: ensure HDHP eligibility and stay within contribution limits.',
    relatedStrategies: ['health-insurance-deduction', 'solo-401k', 'defined-benefit'],
    tags: ['health', 'savings', 'triple-tax-advantage', 'retirement'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'simple',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMING & INCOME STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'quarterly-estimated-optimization',
    name: 'Quarterly Estimated Tax Payment Optimization',
    category: 'compliance',
    subcategory: 'Payment Timing',
    summary: 'Optimize estimated tax payments to avoid underpayment penalties while preserving cash flow.',
    detailedDescription: 'Self-employed individuals must make quarterly estimated tax payments (Form 1040-ES). The safe harbor rules allow you to avoid penalties by paying either (1) 100% of prior year tax (110% if AGI >$150K), or (2) 90% of current year tax. The annualized income installment method (Form 2210, Schedule AI) can reduce earlier payments if income is uneven throughout the year. This is critical for entrepreneurs with lumpy income from project completions, TGE events, or seasonal businesses.',
    ircReferences: [
      { section: 'IRC §6654', title: 'Failure to Pay Estimated Income Tax', relevance: 'Underpayment penalty rules and safe harbor provisions' },
      { section: 'IRC §6654(d)(1)(B)', title: 'Safe Harbor', relevance: '100%/110% prior year safe harbor' },
      { section: 'IRC §6654(d)(2)', title: 'Annualized Income Installment Method', relevance: 'Reduces estimated payments when income is uneven' },
    ],
    eligibility: {
      filingStatuses: ['single', 'mfj', 'mfs', 'hoh'],
      entityTypes: ['sole_proprietorship', 'single_member_llc', 'partnership', 's_corp'],
      requirements: ['Expected tax liability >$1,000', 'Self-employment or other non-withheld income'],
      disqualifiers: [],
    },
    savingsEstimator: (income, marginalRate) => {
      const estimatedTax = income * marginalRate * 0.7
      const cashFlowBenefit = estimatedTax * 0.05 * 0.25 // 5% opportunity cost saved for 3 months average
      return {
        estimatedSavings: Math.round(cashFlowBenefit + 500), // + penalty avoidance value
        explanation: `Optimized payment timing preserves cash flow (est. $${Math.round(cashFlowBenefit).toLocaleString()} opportunity value) and avoids ~$500+ in underpayment penalties.`,
        confidence: 'medium',
        caveats: ['Must still pay enough to meet safe harbor', 'Annualized method requires detailed income tracking'],
      }
    },
    implementationChecklist: [
      { step: 1, action: 'Calculate safe harbor amount', details: 'Pull prior year total tax from Form 1040. If AGI >$150K, safe harbor is 110%. Divide by 4 for quarterly payments.' },
      { step: 2, action: 'Set quarterly payment reminders', deadline: 'April 15, June 15, September 15, January 15', details: 'Mark all four dates. Late payments accrue penalties even if annual total is correct.' },
      { step: 3, action: 'Consider annualized income method for uneven income', details: 'If most income arrives in Q3/Q4, Form 2210 Schedule AI can reduce Q1/Q2 payments.', professional: 'cpa' },
      { step: 4, action: 'File Form 1040-ES with each payment', details: 'Pay via IRS Direct Pay (irs.gov), EFTPS, or mail Form 1040-ES voucher.' },
    ],
    phaseOuts: [],
    stateNotes: [
      { states: ['IL'], note: 'Illinois quarterly estimates due on same federal schedule with additional IL-1040-ES.', impact: 'neutral' },
      { states: ['CA'], note: 'California estimated tax due dates differ: April 15, June 15, and January 15 (no September payment — 3 installments).', impact: 'neutral' },
    ],
    auditRisk: 'low',
    auditNotes: 'No audit risk from optimizing estimated payments. Risk only from underpayment.',
    relatedStrategies: ['s-corp-election', 'income-deferral'],
    tags: ['compliance', 'cash-flow', 'estimated-taxes', 'penalties'],
    effectiveForTaxYear: [2024, 2025, 2026],
    complexity: 'simple',
  },
]

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

export function getStrategyById(id: string): TaxStrategy | undefined {
  return STRATEGY_DATABASE.find(s => s.id === id)
}

export function getStrategiesByCategory(category: StrategyCategory): TaxStrategy[] {
  return STRATEGY_DATABASE.filter(s => s.category === category)
}

export function getStrategiesByTags(tags: string[]): TaxStrategy[] {
  return STRATEGY_DATABASE.filter(s => tags.some(t => s.tags.includes(t)))
}

export function searchStrategies(query: string): TaxStrategy[] {
  const q = query.toLowerCase()
  return STRATEGY_DATABASE.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.summary.toLowerCase().includes(q) ||
    s.tags.some(t => t.includes(q)) ||
    s.ircReferences.some(r => r.section.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))
  )
}

export function estimateAllStrategySavings(income: number, marginalRate: number, filingStatus: string): { strategy: TaxStrategy; savings: SavingsEstimate }[] {
  return STRATEGY_DATABASE
    .map(strategy => ({
      strategy,
      savings: strategy.savingsEstimator(income, marginalRate, filingStatus),
    }))
    .filter(r => r.savings.estimatedSavings > 0)
    .sort((a, b) => b.savings.estimatedSavings - a.savings.estimatedSavings)
}
