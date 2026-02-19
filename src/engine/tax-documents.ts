/**
 * Fortuna Engine — Actionable Tax Document Generator v8
 *
 * Generates ready-to-use tax documents:
 *  - 1040-ES Estimated Tax Payment Vouchers (all 4 quarters)
 *  - State-specific Entity Formation Checklists
 *  - Schedule C / Schedule SE Draft Worksheets
 *  - Retirement Contribution Optimization Worksheet
 *  - Audit Documentation Checklist
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'
import { hasPortfolioData, computePortfolioSummary } from './portfolio-bridge'

// ===================================================================
//  1040-ES ESTIMATED TAX PAYMENT VOUCHERS
// ===================================================================

export interface EstimatedPaymentVoucher {
  quarter: 1 | 2 | 3 | 4
  dueDate: string
  paymentAmount: number
  cumulativePaid: number
  remainingForYear: number
  taxYear: number
  payeeName: string
  ssn: string // placeholder
  address: string
  paymentMethod: string
  irsMailAddress: string
  formContent: string // rendered voucher text
}

export function generate1040ES(state: FortunaState): {
  vouchers: EstimatedPaymentVoucher[]
  totalEstimated: number
  safeHarborAmount: number
  notes: string[]
} {
  const report = generateTaxReport(state)
  const taxYear = new Date().getFullYear()
  const quarterly = report.quarterlyEstimated
  const totalEstimated = quarterly * 4

  // Safe harbor: pay at least 100% of prior year tax (or 110% if AGI > $150K)
  const safeHarbor = report.agi > 150000 ? totalEstimated * 1.10 : totalEstimated
  const safeHarborQuarterly = Math.ceil(safeHarbor / 4)

  const dueDates = [
    `April 15, ${taxYear}`,
    `June 15, ${taxYear}`,
    `September 15, ${taxYear}`,
    `January 15, ${taxYear + 1}`,
  ]

  // IRS mailing addresses by state (simplified — Southeast, Northeast, etc.)
  const stateMailMap: Record<string, string> = {
    DEFAULT: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    CT: 'Internal Revenue Service\nP.O. Box 931000\nLouisville, KY 40293-1000',
    NY: 'Internal Revenue Service\nP.O. Box 931000\nLouisville, KY 40293-1000',
    CA: 'Internal Revenue Service\nP.O. Box 510000\nSan Francisco, CA 94151-5100',
    TX: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
    IL: 'Internal Revenue Service\nP.O. Box 931000\nLouisville, KY 40293-1000',
    FL: 'Internal Revenue Service\nP.O. Box 1300\nCharlotte, NC 28201-1300',
  }

  const irsAddress = stateMailMap[state.profile.state] || stateMailMap.DEFAULT

  const vouchers: EstimatedPaymentVoucher[] = [1, 2, 3, 4].map((q, i) => {
    const quarterNum = q as 1 | 2 | 3 | 4
    return {
      quarter: quarterNum,
      dueDate: dueDates[i],
      paymentAmount: safeHarborQuarterly,
      cumulativePaid: safeHarborQuarterly * q,
      remainingForYear: safeHarborQuarterly * (4 - q),
      taxYear,
      payeeName: state.profile.name || '[YOUR NAME]',
      ssn: 'XXX-XX-XXXX',
      address: `[YOUR ADDRESS], ${state.profile.state}`,
      paymentMethod: 'Check payable to "United States Treasury" or pay online at irs.gov/payments',
      irsMailAddress: irsAddress,
      formContent: generateVoucherText(
        quarterNum, dueDates[i], safeHarborQuarterly, taxYear,
        state.profile.name || '[YOUR NAME]', state.profile.state, irsAddress,
      ),
    }
  })

  const notes: string[] = [
    `Based on estimated ${taxYear} total federal tax of $${totalEstimated.toLocaleString()}.`,
    `Safe harbor amount: $${safeHarbor.toLocaleString()} (${report.agi > 150000 ? '110%' : '100%'} of estimated tax).`,
    'Pay online at irs.gov/payments (recommended) or mail with Form 1040-ES voucher.',
    'If income changes significantly, recalculate quarterly amounts using Fortuna\'s scenario modeler.',
    report.selfEmploymentTax > 0
      ? `Includes $${report.selfEmploymentTax.toLocaleString()} self-employment tax.`
      : '',
  ].filter(Boolean)

  return { vouchers, totalEstimated, safeHarborAmount: safeHarbor, notes }
}

function generateVoucherText(
  quarter: number, dueDate: string, amount: number, taxYear: number,
  name: string, stateCode: string, irsAddress: string,
): string {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║                  FORM 1040-ES PAYMENT VOUCHER ${quarter}                    ║
║                     Tax Year ${taxYear}                                ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Name:    ${name.padEnd(50)}        ║
║  SSN:     XXX-XX-XXXX                                                ║
║  State:   ${stateCode}                                                       ║
║                                                                      ║
║  ┌─────────────────────────────────────────────┐                     ║
║  │ PAYMENT AMOUNT:  $${amount.toLocaleString().padEnd(28)}│                     ║
║  │ DUE DATE:        ${dueDate.padEnd(29)}│                     ║
║  │ QUARTER:         Q${quarter} of ${taxYear}                       │                     ║
║  └─────────────────────────────────────────────┘                     ║
║                                                                      ║
║  Make check payable to: United States Treasury                       ║
║  Write "${taxYear} Form 1040-ES" and your SSN on check              ║
║                                                                      ║
║  Mail to:                                                            ║
║  ${irsAddress.split('\n').map(l => l.padEnd(60)).join('║\n║  ')}           ║
║                                                                      ║
║  OR pay online: irs.gov/payments (Direct Pay or EFTPS)               ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝

  ⚠ This is a worksheet — not an official IRS form. Use as reference
    when making payments via IRS Direct Pay or when completing the
    official Form 1040-ES from irs.gov/pub/irs-pdf/f1040es.pdf
`.trim()
}

// ===================================================================
//  ENTITY FORMATION CHECKLIST
// ===================================================================

export interface FormationStep {
  step: number
  title: string
  description: string
  estimatedCost: string
  timeline: string
  resource?: string
  completed: boolean
}

export interface EntityFormationChecklist {
  entityType: string
  state: string
  stateName: string
  totalEstimatedCost: string
  totalTimeline: string
  steps: FormationStep[]
  warnings: string[]
  tips: string[]
}

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',
}

const STATE_FEES: Record<string, { llc: number; corp: number; annual: number }> = {
  CA: { llc: 70, corp: 100, annual: 800 },
  NY: { llc: 200, corp: 125, annual: 25 },
  TX: { llc: 300, corp: 300, annual: 0 },
  FL: { llc: 125, corp: 70, annual: 138 },
  IL: { llc: 150, corp: 150, annual: 75 },
  DE: { llc: 90, corp: 89, annual: 300 },
  WY: { llc: 100, corp: 100, annual: 60 },
  NV: { llc: 75, corp: 75, annual: 350 },
  WA: { llc: 200, corp: 180, annual: 60 },
  DEFAULT: { llc: 150, corp: 150, annual: 100 },
}

export function generateFormationChecklist(
  entityType: 'llc' | 'llc_scorp' | 'scorp' | 'ccorp',
  stateCode: string,
): EntityFormationChecklist {
  const fees = STATE_FEES[stateCode] || STATE_FEES.DEFAULT
  const stateName = STATE_NAMES[stateCode] || stateCode
  const isLLC = entityType === 'llc' || entityType === 'llc_scorp'
  const isSCorp = entityType === 'llc_scorp' || entityType === 'scorp'
  const formationFee = isLLC ? fees.llc : fees.corp

  const steps: FormationStep[] = []
  let step = 0

  // 1. Name availability
  steps.push({
    step: ++step, title: 'Check Name Availability',
    description: `Search the ${stateName} Secretary of State business database to verify your desired business name is available. Most states allow online name searches.`,
    estimatedCost: 'Free',
    timeline: '1 day',
    resource: `https://www.sos.${stateCode.toLowerCase()}.gov (or search "${stateName} Secretary of State business search")`,
    completed: false,
  })

  // 2. Register with state
  steps.push({
    step: ++step, title: isLLC ? 'File Articles of Organization' : 'File Articles of Incorporation',
    description: isLLC
      ? `File Articles of Organization with the ${stateName} Secretary of State. Include: business name, registered agent, organizer name, and management structure (member-managed vs. manager-managed).`
      : `File Articles of Incorporation with the ${stateName} Secretary of State. Include: corporate name, registered agent, number of authorized shares, and incorporator information.`,
    estimatedCost: `$${formationFee}`,
    timeline: '1-3 weeks (expedited available in most states)',
    completed: false,
  })

  // 3. EIN
  steps.push({
    step: ++step, title: 'Obtain EIN from IRS',
    description: 'Apply for an Employer Identification Number (EIN) from the IRS. Required for business bank accounts, hiring employees, and tax filings. Apply online for immediate issuance.',
    estimatedCost: 'Free',
    timeline: 'Immediate (online)',
    resource: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
    completed: false,
  })

  // 4. Operating Agreement / Bylaws
  steps.push({
    step: ++step, title: isLLC ? 'Draft Operating Agreement' : 'Draft Corporate Bylaws',
    description: isLLC
      ? 'Create an Operating Agreement defining ownership structure, member responsibilities, profit distribution, and dissolution procedures. Not filed with the state but essential for legal protection.'
      : 'Create Corporate Bylaws governing board meetings, officer roles, shareholder rights, and corporate procedures.',
    estimatedCost: '$0 (self-drafted) – $500 (attorney)',
    timeline: '1-2 weeks',
    completed: false,
  })

  // 5. Registered Agent
  steps.push({
    step: ++step, title: 'Designate Registered Agent',
    description: `Appoint a registered agent with a physical address in ${stateName} to receive legal documents and state correspondence. Can be yourself, a business member, or a professional service.`,
    estimatedCost: '$0 (self) – $125/yr (service)',
    timeline: 'Same day',
    completed: false,
  })

  // 6. Business Bank Account
  steps.push({
    step: ++step, title: 'Open Business Bank Account',
    description: 'Open a dedicated business checking account. Bring: EIN confirmation letter, Articles of Organization/Incorporation, Operating Agreement/Bylaws, and government-issued ID.',
    estimatedCost: '$0-25/mo',
    timeline: '1 day',
    completed: false,
  })

  // S-Corp Election
  if (isSCorp) {
    steps.push({
      step: ++step, title: 'File IRS Form 2553 (S-Corp Election)',
      description: 'File Form 2553 with the IRS to elect S-Corporation tax status. Must be filed within 75 days of formation OR by March 15 for the current tax year. All shareholders must sign.',
      estimatedCost: 'Free',
      timeline: '1-2 months for IRS acceptance letter',
      resource: 'https://www.irs.gov/forms-pubs/about-form-2553',
      completed: false,
    })

    steps.push({
      step: ++step, title: 'Set Up Payroll',
      description: 'S-Corps must pay owner-employees a reasonable salary via payroll. Set up payroll service (Gusto, ADP, or similar) to handle W-2 issuance, tax withholding, and quarterly payroll tax filings.',
      estimatedCost: '$40-80/mo',
      timeline: '1 week',
      completed: false,
    })
  }

  // 7. Business licenses
  steps.push({
    step: ++step, title: 'Obtain Required Business Licenses',
    description: `Check ${stateName} and local municipality requirements for business licenses, permits, and professional registrations applicable to your industry.`,
    estimatedCost: 'Varies ($0-500)',
    timeline: '1-4 weeks',
    completed: false,
  })

  // 8. Annual filing
  steps.push({
    step: ++step, title: 'Note Annual Filing Requirements',
    description: `${stateName} requires annual reports/franchise tax filings. Annual cost: ~$${fees.annual}. Mark deadlines in your calendar to maintain good standing.`,
    estimatedCost: `$${fees.annual}/yr`,
    timeline: 'Recurring annually',
    completed: false,
  })

  // Estimated totals
  const baseCost = formationFee + (isSCorp ? 480 : 0) // payroll year 1
  const totalCost = `$${baseCost.toLocaleString()} – $${(baseCost + 700).toLocaleString()}`
  const totalTimeline = isSCorp ? '3-6 weeks' : '2-4 weeks'

  // State-specific warnings
  const warnings: string[] = []
  if (stateCode === 'CA') {
    warnings.push('California imposes an $800 minimum franchise tax on all LLCs and corporations, due annually regardless of income.')
  }
  if (stateCode === 'NY') {
    warnings.push('New York requires LLCs to publish formation notice in two newspapers for 6 consecutive weeks ($200-2,000+ depending on county).')
  }
  if (isSCorp) {
    warnings.push('S-Corp election requires "reasonable compensation" to owner-employees. Underpaying salary is a top IRS audit trigger.')
    warnings.push('Form 2553 must be filed within 75 days of formation or by March 15 for current-year election. Late elections require reasonable cause.')
  }

  const tips = [
    isLLC ? 'Member-managed LLCs are simpler for single-owner businesses. Manager-managed works better for passive investors.' : '',
    isSCorp ? 'Use Fortuna\'s Entity Optimizer to determine your optimal salary/distribution split.' : '',
    'Keep personal and business finances completely separate to maintain liability protection.',
    `Consider forming in your home state (${stateName}) rather than Delaware or Wyoming — the multi-state compliance costs usually outweigh any benefits for small businesses.`,
  ].filter(Boolean)

  return {
    entityType: entityType === 'llc_scorp' ? 'LLC with S-Corp Election' : entityType.toUpperCase(),
    state: stateCode,
    stateName,
    totalEstimatedCost: totalCost,
    totalTimeline,
    steps,
    warnings,
    tips,
  }
}

// ===================================================================
//  SCHEDULE C DRAFT WORKSHEET
// ===================================================================

export interface ScheduleCLine {
  line: string
  label: string
  amount: number
  notes?: string
}

export interface ScheduleCWorksheet {
  taxYear: number
  businessName: string
  businessCode: string
  ein: string
  grossReceipts: number
  totalExpenses: number
  netProfit: number
  lines: ScheduleCLine[]
  partII: ScheduleCLine[] // expenses by category
  seTaxEstimate: number
  seDeduction: number
  formContent: string
}

const SCHEDULE_C_EXPENSE_CATEGORIES: Record<string, { line: string; label: string }> = {
  advertising: { line: '8', label: 'Advertising' },
  vehicle: { line: '9', label: 'Car and truck expenses' },
  commissions: { line: '10', label: 'Commissions and fees' },
  contract_labor: { line: '11', label: 'Contract labor' },
  depreciation: { line: '13', label: 'Depreciation and section 179' },
  insurance: { line: '15', label: 'Insurance (other than health)' },
  interest: { line: '16', label: 'Interest (mortgage/other)' },
  legal: { line: '17', label: 'Legal and professional services' },
  office: { line: '18', label: 'Office expense' },
  rent: { line: '20', label: 'Rent or lease' },
  repairs: { line: '21', label: 'Repairs and maintenance' },
  supplies: { line: '22', label: 'Supplies' },
  taxes: { line: '23', label: 'Taxes and licenses' },
  travel: { line: '24a', label: 'Travel' },
  meals: { line: '24b', label: 'Deductible meals' },
  utilities: { line: '25', label: 'Utilities' },
  wages: { line: '26', label: 'Wages' },
  other: { line: '27', label: 'Other expenses' },
  home_office: { line: '30', label: 'Business use of home' },
}

export function generateScheduleC(state: FortunaState): ScheduleCWorksheet {
  const taxYear = new Date().getFullYear()
  const report = generateTaxReport(state)

  // Group expenses by category
  const expensesByCategory: Record<string, number> = {}
  state.expenses
    .filter(e => e.isDeductible)
    .forEach(e => {
      const cat = e.category.toLowerCase().replace(/\s+/g, '_')
      const deductible = e.annualAmount * (e.deductionPct / 100)
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + deductible
    })

  // Map to Schedule C lines
  const partII: ScheduleCLine[] = []
  let totalExpenses = 0

  for (const [cat, amount] of Object.entries(expensesByCategory)) {
    const mapping = SCHEDULE_C_EXPENSE_CATEGORIES[cat] || SCHEDULE_C_EXPENSE_CATEGORIES.other
    partII.push({
      line: mapping.line,
      label: mapping.label,
      amount: Math.round(amount),
    })
    totalExpenses += Math.round(amount)
  }

  // Add home office deduction if present
  const homeOffice = state.deductions.find(d => d.category === 'home_office')
  if (homeOffice) {
    partII.push({
      line: '30',
      label: 'Business use of home',
      amount: homeOffice.amount,
    })
    totalExpenses += homeOffice.amount
  }

  partII.sort((a, b) => parseInt(a.line) - parseInt(b.line))

  const grossReceipts = report.selfEmploymentIncome
  const netProfit = grossReceipts - totalExpenses

  // SE tax calculation
  const seBase = netProfit * 0.9235
  const seTax = seBase > 0 ? Math.min(seBase, 176100) * 0.153 + Math.max(0, seBase - 176100) * 0.029 : 0
  const seDeduction = seTax / 2

  // Primary business entity
  const primaryEntity = state.entities.find(e => e.isActive)

  // Part I lines
  const lines: ScheduleCLine[] = [
    { line: '1', label: 'Gross receipts or sales', amount: grossReceipts },
    { line: '2', label: 'Returns and allowances', amount: 0 },
    { line: '3', label: 'Cost of goods sold', amount: 0 },
    { line: '5', label: 'Gross income', amount: grossReceipts },
    { line: '28', label: 'Total expenses', amount: totalExpenses },
    { line: '29', label: 'Tentative profit (or loss)', amount: netProfit },
    { line: '31', label: 'Net profit (or loss)', amount: netProfit },
  ]

  const formContent = renderScheduleC(
    taxYear, state.profile.name, primaryEntity?.einNumber || 'XX-XXXXXXX',
    grossReceipts, totalExpenses, netProfit, partII, seTax, seDeduction,
  )

  return {
    taxYear,
    businessName: primaryEntity?.name || state.profile.name || '[BUSINESS NAME]',
    businessCode: '999999',
    ein: primaryEntity?.einNumber || 'XX-XXXXXXX',
    grossReceipts,
    totalExpenses,
    netProfit,
    lines,
    partII,
    seTaxEstimate: Math.round(seTax),
    seDeduction: Math.round(seDeduction),
    formContent,
  }
}

function renderScheduleC(
  year: number, name: string, ein: string,
  gross: number, expenses: number, net: number,
  expenseLines: ScheduleCLine[], seTax: number, seDeduction: number,
): string {
  const dollarFmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const pad = (s: string, w: number) => s.padEnd(w)

  let out = `
╔══════════════════════════════════════════════════════════════════════╗
║         SCHEDULE C DRAFT WORKSHEET — Profit or Loss                  ║
║                    From Business (Sole Proprietorship)               ║
║                         Tax Year ${year}                                ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Name: ${pad(name || '[YOUR NAME]', 54)}       ║
║  EIN:  ${pad(ein, 54)}       ║
║                                                                      ║
║  ═══ PART I — INCOME ═════════════════════════════════════════════   ║
║                                                                      ║
║  1  Gross receipts or sales .............. ${pad(dollarFmt(gross), 16)}       ║
║  5  Gross income ........................ ${pad(dollarFmt(gross), 16)}       ║
║                                                                      ║
║  ═══ PART II — EXPENSES ══════════════════════════════════════════   ║
║                                                                      ║
`

  for (const line of expenseLines) {
    out += `║  ${pad(line.line, 3)} ${pad(line.label, 36)} ${pad(dollarFmt(line.amount), 16)}       ║\n`
  }

  out += `║                                                                      ║
║  28  Total expenses ..................... ${pad(dollarFmt(expenses), 16)}       ║
║                                                                      ║
║  ═══ NET PROFIT ══════════════════════════════════════════════════   ║
║                                                                      ║
║  31  Net profit (or loss) ............... ${pad(dollarFmt(net), 16)}       ║
║                                                                      ║
║  ═══ SELF-EMPLOYMENT TAX (Schedule SE) ══════════════════════════   ║
║                                                                      ║
║  SE tax base (92.35% of net profit) .... ${pad(dollarFmt(Math.round(net * 0.9235)), 16)}       ║
║  Estimated SE tax ....................... ${pad(dollarFmt(Math.round(seTax)), 16)}       ║
║  SE tax deduction (50% of SE tax) ...... ${pad(dollarFmt(Math.round(seDeduction)), 16)}       ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝

  ⚠ DRAFT WORKSHEET — Not an official IRS form. Use as a reference when
    preparing your actual Schedule C with your tax software or CPA.
    Verify all amounts against your actual financial records.
`

  return out.trim()
}

// ===================================================================
//  AUDIT DOCUMENTATION CHECKLIST
// ===================================================================

export interface AuditDocItem {
  category: string
  items: {
    description: string
    scheduleRef: string
    priority: 'essential' | 'recommended' | 'optional'
    status: 'needed' | 'have' | 'na'
  }[]
}

export function generateAuditDocChecklist(state: FortunaState): AuditDocItem[] {
  const categories: AuditDocItem[] = []

  // Income documentation
  const incomeItems: AuditDocItem['items'] = []
  const hasW2 = state.incomeStreams.some(s => s.type === 'w2')
  const hasSE = state.incomeStreams.some(s => ['business', 'freelance'].includes(s.type))
  const hasInvest = state.incomeStreams.some(s => s.type === 'investment')

  if (hasW2) {
    incomeItems.push({ description: 'W-2 forms from all employers', scheduleRef: 'Form 1040, Line 1', priority: 'essential', status: 'needed' })
  }
  if (hasSE) {
    incomeItems.push({ description: '1099-NEC / 1099-MISC for all clients', scheduleRef: 'Schedule C, Line 1', priority: 'essential', status: 'needed' })
    incomeItems.push({ description: 'Business income ledger / P&L statement', scheduleRef: 'Schedule C', priority: 'essential', status: 'needed' })
    incomeItems.push({ description: 'Bank statements (business account, 12 months)', scheduleRef: 'Schedule C', priority: 'essential', status: 'needed' })
    incomeItems.push({ description: 'Invoices sent to clients (all)', scheduleRef: 'Schedule C, Line 1', priority: 'recommended', status: 'needed' })
  }
  if (hasInvest) {
    incomeItems.push({ description: '1099-B (brokerage transactions)', scheduleRef: 'Schedule D', priority: 'essential', status: 'needed' })
    incomeItems.push({ description: '1099-DIV (dividends)', scheduleRef: 'Schedule B', priority: 'essential', status: 'needed' })
    incomeItems.push({ description: '1099-INT (interest income)', scheduleRef: 'Schedule B', priority: 'essential', status: 'needed' })
  }
  // Portfolio Intelligence — crypto & DeFi specific docs
  if (hasPortfolioData()) {
    const ps = computePortfolioSummary()
    if (ps.activePositionCount > 0) {
      const hasCrypto = Object.values(ps.allocationByClass).some((a) => a.count > 0 && ['crypto', 'defi', 'nft'].includes('crypto')) || ps.totalValue > 0
      if (hasCrypto) {
        incomeItems.push({ description: 'Crypto exchange transaction history (all exchanges)', scheduleRef: 'Form 8949', priority: 'essential', status: 'needed' })
        incomeItems.push({ description: 'DeFi protocol transaction records', scheduleRef: 'Form 8949 / Schedule D', priority: 'essential', status: 'needed' })
        incomeItems.push({ description: 'Wallet-to-wallet transfer records', scheduleRef: 'Cost basis tracking', priority: 'recommended', status: 'needed' })
      }
      if (ps.stakingRewards > 0) {
        incomeItems.push({ description: `Staking reward records (~$${Math.round(ps.stakingRewards).toLocaleString()} tracked)`, scheduleRef: 'Schedule 1 / Schedule C', priority: 'essential', status: 'needed' })
      }
      if (ps.airdropIncome > 0) {
        incomeItems.push({ description: `Airdrop documentation with FMV at receipt (~$${Math.round(ps.airdropIncome).toLocaleString()})`, scheduleRef: 'Schedule 1 (ordinary income)', priority: 'essential', status: 'needed' })
      }
      if (ps.miningIncome > 0) {
        incomeItems.push({ description: `Mining income records + electricity/equipment costs (~$${Math.round(ps.miningIncome).toLocaleString()})`, scheduleRef: 'Schedule C', priority: 'essential', status: 'needed' })
      }
    }
  }
  incomeItems.push({ description: 'Prior year tax return (complete)', scheduleRef: 'Reference', priority: 'essential', status: 'needed' })
  categories.push({ category: 'Income Documentation', items: incomeItems })

  // Expense documentation
  if (hasSE || state.expenses.length > 0) {
    const expenseItems: AuditDocItem['items'] = [
      { description: 'Receipts for all business expenses over $75', scheduleRef: 'Schedule C, Part II', priority: 'essential', status: 'needed' },
      { description: 'Credit card statements (business purchases)', scheduleRef: 'Schedule C', priority: 'essential', status: 'needed' },
      { description: 'Mileage log (if claiming vehicle expenses)', scheduleRef: 'Schedule C, Line 9', priority: 'essential', status: 'needed' },
    ]

    const hasHomeOffice = state.deductions.some(d => d.category === 'home_office')
    if (hasHomeOffice) {
      expenseItems.push({ description: 'Home office measurements (sq ft of office vs total)', scheduleRef: 'Form 8829', priority: 'essential', status: 'needed' })
      expenseItems.push({ description: 'Mortgage interest / rent payments', scheduleRef: 'Form 8829', priority: 'essential', status: 'needed' })
      expenseItems.push({ description: 'Utility bills (12 months)', scheduleRef: 'Form 8829', priority: 'recommended', status: 'needed' })
      expenseItems.push({ description: 'Photo of dedicated home office space', scheduleRef: 'Form 8829', priority: 'recommended', status: 'needed' })
    }

    expenseItems.push({ description: 'Software/subscription receipts', scheduleRef: 'Schedule C, Line 18/27', priority: 'recommended', status: 'needed' })
    expenseItems.push({ description: 'Professional services invoices (legal, accounting)', scheduleRef: 'Schedule C, Line 17', priority: 'recommended', status: 'needed' })
    expenseItems.push({ description: 'Insurance policy documentation', scheduleRef: 'Schedule C, Line 15', priority: 'recommended', status: 'needed' })

    categories.push({ category: 'Expense Documentation', items: expenseItems })
  }

  // Entity documentation
  if (state.entities.length > 0) {
    categories.push({
      category: 'Entity & Legal',
      items: [
        { description: 'Articles of Organization / Incorporation', scheduleRef: 'Entity records', priority: 'essential', status: 'needed' },
        { description: 'Operating Agreement / Corporate Bylaws', scheduleRef: 'Entity records', priority: 'essential', status: 'needed' },
        { description: 'EIN confirmation letter', scheduleRef: 'Entity records', priority: 'essential', status: 'needed' },
        { description: 'S-Corp election acceptance (Form 2553)', scheduleRef: 'Form 1120-S', priority: state.entities.some(e => e.type === 'llc_scorp' || e.type === 'scorp') ? 'essential' : 'optional', status: 'needed' },
        { description: 'Reasonable compensation analysis', scheduleRef: 'Form 1120-S', priority: state.entities.some(e => e.type === 'llc_scorp' || e.type === 'scorp') ? 'essential' : 'optional', status: 'needed' },
      ],
    })
  }

  // Deduction documentation
  const deductionItems: AuditDocItem['items'] = []
  const hasRetirement = state.deductions.some(d => d.category === 'retirement')
  const hasCharitable = state.deductions.some(d => d.category === 'charitable')
  const hasHealth = state.deductions.some(d => d.category === 'health')

  if (hasRetirement) {
    deductionItems.push({ description: '5498 forms (IRA/SEP/Solo 401k contributions)', scheduleRef: 'Form 1040, Line 20', priority: 'essential', status: 'needed' })
    deductionItems.push({ description: 'Solo 401k adoption agreement', scheduleRef: 'Retirement plan', priority: 'recommended', status: 'needed' })
  }
  if (hasCharitable) {
    deductionItems.push({ description: 'Charitable donation receipts', scheduleRef: 'Schedule A, Line 12', priority: 'essential', status: 'needed' })
    deductionItems.push({ description: 'Written acknowledgment for donations over $250', scheduleRef: 'Schedule A', priority: 'essential', status: 'needed' })
  }
  if (hasHealth) {
    deductionItems.push({ description: 'Health insurance premium statements (Form 1095)', scheduleRef: 'Schedule A / Schedule C', priority: 'essential', status: 'needed' })
  }
  deductionItems.push({ description: 'Estimated tax payment records (1040-ES)', scheduleRef: 'Form 1040, Line 26', priority: 'essential', status: 'needed' })

  if (deductionItems.length > 0) {
    categories.push({ category: 'Deduction & Credit Documentation', items: deductionItems })
  }

  return categories
}
