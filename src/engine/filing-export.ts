/**
 * FORTUNA ENGINE — Filing Tool Export v1
 * 
 * Exports Fortuna financial data in formats compatible with:
 *   - TXF (Tax Exchange Format) — universal import for TurboTax, TaxAct
 *   - CSV for H&R Block, FreeTaxUSA
 *   - IRS Form 8949 pre-formatted data
 *   - Schedule C line-item mapping
 *   - Schedule D summary
 *   - Estimated payment tracking (Form 1040-ES)
 *   - CPA handoff package (all data + notes)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FilingExportData {
  taxYear: number
  filingStatus: string
  personalInfo: { name: string; ssn?: string; address?: string }
  income: IncomeData
  deductions: DeductionData
  credits: CreditData
  capitalGains: CapGainsData
  selfEmployment: SEData
  estimatedPayments: EstimatedPayment[]
  retirementContributions: RetirementData
  stateCode: string
}

interface IncomeData {
  w2Wages: number
  w2Withheld: number
  interestIncome: number
  dividendIncome: number
  qualifiedDividends: number
  businessIncome: number
  rentalIncome: number
  otherIncome: number
  stakingIncome: number
  miningIncome: number
  airdropIncome: number
}

interface DeductionData {
  standardOrItemized: 'standard' | 'itemized'
  standardDeduction: number
  mortgageInterest: number
  stateLocalTaxes: number
  charitableContributions: number
  medicalExpenses: number
  businessExpenses: ScheduleCExpense[]
  homeOffice: number
  healthInsurance: number
  retirementDeduction: number
  halfSETax: number
  studentLoanInterest: number
}

interface ScheduleCExpense {
  category: string
  lineNumber: string
  amount: number
  description: string
}

interface CreditData {
  childTaxCredit: number
  earnedIncomeCredit: number
  educationCredits: number
  energyCredits: number
  otherCredits: { name: string; amount: number }[]
}

interface CapGainsData {
  shortTermGains: number
  shortTermLosses: number
  longTermGains: number
  longTermLosses: number
  transactions: Form8949Transaction[]
  carryoverLoss: number
}

interface Form8949Transaction {
  description: string
  dateAcquired: string
  dateSold: string
  proceeds: number
  costBasis: number
  adjustmentCode: string
  adjustment: number
  gainLoss: number
  box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  isWashSale: boolean
}

interface SEData {
  netBusinessIncome: number
  seTax: number
  deductibleHalf: number
}

interface EstimatedPayment {
  quarter: string
  date: string
  federalAmount: number
  stateAmount: number
  confirmationNumber?: string
}

interface RetirementData {
  solo401kEmployee: number
  solo401kEmployer: number
  sepIRA: number
  traditionalIRA: number
  rothIRA: number
  hsa: number
}

// ─── TXF Export (TurboTax / TaxAct compatible) ──────────────────────────────

export function exportTXF(data: FilingExportData): string {
  const lines: string[] = []
  const year = data.taxYear

  // TXF Header
  lines.push('V042')           // TXF version
  lines.push(`A`)               // Account type
  lines.push(`D ${year}`)       // Tax year

  // Helper to add TXF records
  const addRecord = (refNum: number, description: string, amount: number, date?: string) => {
    if (amount === 0) return
    lines.push(`T${String(refNum).padStart(4, '0')}`)  // Reference number
    lines.push(`N${description}`)
    lines.push(`C1`)              // Copy 1
    lines.push(`L1`)              // Line 1
    lines.push(`$${amount.toFixed(2)}`)
    if (date) lines.push(`D${date}`)
    lines.push(`^`)               // Record separator
  }

  // Income
  addRecord(1, 'Wages, salaries, tips', data.income.w2Wages)
  addRecord(2, 'Interest income', data.income.interestIncome)
  addRecord(3, 'Dividend income', data.income.dividendIncome)
  addRecord(7, 'Business income (Schedule C)', data.income.businessIncome)
  addRecord(8, 'Other income', data.income.otherIncome + data.income.stakingIncome + data.income.miningIncome + data.income.airdropIncome)

  // Capital Gains (Form 8949 transactions)
  for (const tx of data.capitalGains.transactions) {
    lines.push(`T${tx.gainLoss >= 0 ? '0323' : '0323'}`)
    lines.push(`N${tx.description}`)
    lines.push(`C1`)
    lines.push(`L1`)
    lines.push(`P${tx.costBasis.toFixed(2)}`)
    lines.push(`$${tx.proceeds.toFixed(2)}`)
    lines.push(`D${tx.dateSold}`)
    if (tx.dateAcquired) lines.push(`D${tx.dateAcquired}`)
    if (tx.isWashSale) lines.push(`XW`)
    lines.push(`^`)
  }

  // Deductions
  if (data.deductions.standardOrItemized === 'itemized') {
    addRecord(100, 'Mortgage interest', data.deductions.mortgageInterest)
    addRecord(101, 'State and local taxes', data.deductions.stateLocalTaxes)
    addRecord(102, 'Charitable contributions', data.deductions.charitableContributions)
    addRecord(103, 'Medical expenses', data.deductions.medicalExpenses)
  }

  // Self-employment
  addRecord(200, 'Self-employment tax', data.selfEmployment.seTax)
  addRecord(201, 'Deductible half SE tax', data.selfEmployment.deductibleHalf)
  addRecord(202, 'SE health insurance', data.deductions.healthInsurance)

  // Retirement
  addRecord(300, 'Solo 401(k) employee', data.retirementContributions.solo401kEmployee)
  addRecord(301, 'Solo 401(k) employer', data.retirementContributions.solo401kEmployer)
  addRecord(302, 'SEP-IRA', data.retirementContributions.sepIRA)
  addRecord(303, 'Traditional IRA', data.retirementContributions.traditionalIRA)
  addRecord(304, 'HSA', data.retirementContributions.hsa)

  // Estimated payments
  for (const ep of data.estimatedPayments) {
    addRecord(400, `Estimated payment ${ep.quarter}`, ep.federalAmount, ep.date)
  }

  return lines.join('\n')
}

// ─── CSV Export (H&R Block / FreeTaxUSA) ────────────────────────────────────

export function exportCSV(data: FilingExportData): string {
  const rows: string[][] = []

  rows.push(['Category', 'Item', 'Amount', 'Notes'])
  rows.push(['---', '---', '---', '---'])

  // Income
  rows.push(['Income', 'W-2 Wages', String(data.income.w2Wages), ''])
  rows.push(['Income', 'Federal Tax Withheld', String(data.income.w2Withheld), ''])
  rows.push(['Income', 'Interest Income', String(data.income.interestIncome), ''])
  rows.push(['Income', 'Dividend Income', String(data.income.dividendIncome), ''])
  rows.push(['Income', 'Qualified Dividends', String(data.income.qualifiedDividends), ''])
  rows.push(['Income', 'Business Income (Schedule C)', String(data.income.businessIncome), ''])
  if (data.income.stakingIncome > 0) rows.push(['Income', 'Crypto Staking Income', String(data.income.stakingIncome), 'Ordinary income at FMV when received'])
  if (data.income.miningIncome > 0) rows.push(['Income', 'Crypto Mining Income', String(data.income.miningIncome), 'Ordinary income + possible SE tax'])
  if (data.income.airdropIncome > 0) rows.push(['Income', 'Crypto Airdrop Income', String(data.income.airdropIncome), 'Ordinary income at FMV when received'])

  // Deductions
  rows.push(['Deduction', `Type: ${data.deductions.standardOrItemized}`, String(data.deductions.standardDeduction), ''])
  if (data.deductions.standardOrItemized === 'itemized') {
    rows.push(['Deduction', 'Mortgage Interest', String(data.deductions.mortgageInterest), ''])
    rows.push(['Deduction', 'State/Local Taxes (capped $10K)', String(Math.min(data.deductions.stateLocalTaxes, 10000)), ''])
    rows.push(['Deduction', 'Charitable Contributions', String(data.deductions.charitableContributions), ''])
  }
  rows.push(['Deduction', 'Self-Employed Health Insurance', String(data.deductions.healthInsurance), 'Above-the-line'])
  rows.push(['Deduction', 'Half Self-Employment Tax', String(data.deductions.halfSETax), 'Above-the-line'])
  rows.push(['Deduction', 'Home Office', String(data.deductions.homeOffice), ''])

  // Schedule C Expenses
  for (const exp of data.deductions.businessExpenses) {
    rows.push(['Schedule C', `${exp.category} (Line ${exp.lineNumber})`, String(exp.amount), exp.description])
  }

  // Capital Gains
  rows.push(['Capital Gains', 'Short-Term Gains', String(data.capitalGains.shortTermGains), ''])
  rows.push(['Capital Gains', 'Short-Term Losses', String(data.capitalGains.shortTermLosses), ''])
  rows.push(['Capital Gains', 'Long-Term Gains', String(data.capitalGains.longTermGains), ''])
  rows.push(['Capital Gains', 'Long-Term Losses', String(data.capitalGains.longTermLosses), ''])
  if (data.capitalGains.carryoverLoss > 0) {
    rows.push(['Capital Gains', 'Carryover Loss from Prior Year', String(data.capitalGains.carryoverLoss), ''])
  }

  // Estimated Payments
  for (const ep of data.estimatedPayments) {
    rows.push(['Estimated Payment', `${ep.quarter} (${ep.date})`, String(ep.federalAmount), ep.confirmationNumber || ''])
  }

  // Retirement
  rows.push(['Retirement', 'Solo 401(k) Employee Deferral', String(data.retirementContributions.solo401kEmployee), ''])
  rows.push(['Retirement', 'Solo 401(k) Employer Contribution', String(data.retirementContributions.solo401kEmployer), ''])
  rows.push(['Retirement', 'SEP-IRA', String(data.retirementContributions.sepIRA), ''])
  rows.push(['Retirement', 'HSA Contribution', String(data.retirementContributions.hsa), ''])

  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}

// ─── Form 8949 Export ───────────────────────────────────────────────────────

export function exportForm8949(transactions: Form8949Transaction[]): string {
  const header = ['Description of Property', 'Date Acquired', 'Date Sold', 'Proceeds', 'Cost Basis', 'Adj Code', 'Adj Amount', 'Gain/Loss', 'Box']
  const rows = transactions.map(tx => [
    tx.description,
    tx.dateAcquired,
    tx.dateSold,
    tx.proceeds.toFixed(2),
    tx.costBasis.toFixed(2),
    tx.adjustmentCode,
    tx.adjustment.toFixed(2),
    tx.gainLoss.toFixed(2),
    tx.box,
  ])

  return [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
}

// ─── Schedule C Export ──────────────────────────────────────────────────────

export function exportScheduleC(data: FilingExportData): string {
  const lines: string[] = []
  lines.push(`Schedule C Data Export — Tax Year ${data.taxYear}`)
  lines.push(`Business Name: ${data.personalInfo.name}`)
  lines.push('')
  lines.push('INCOME')
  lines.push(`  Line 1  Gross receipts: $${data.income.businessIncome.toLocaleString()}`)
  lines.push('')
  lines.push('EXPENSES')

  const lineMap: Record<string, string> = {
    '8': 'Advertising', '9': 'Car/truck expenses', '10': 'Commissions/fees',
    '11': 'Contract labor', '13': 'Depreciation', '14': 'Employee benefits',
    '15': 'Insurance', '16': 'Interest (mortgage)', '16b': 'Interest (other)',
    '17': 'Legal/professional', '18': 'Office expense', '19': 'Pension/profit-sharing',
    '20a': 'Rent (vehicles/equip)', '20b': 'Rent (other)', '21': 'Repairs',
    '22': 'Supplies', '23': 'Taxes/licenses', '24a': 'Travel',
    '24b': 'Meals (50%)', '25': 'Utilities', '27a': 'Other expenses',
    '30': 'Business use of home',
  }

  for (const exp of data.deductions.businessExpenses) {
    const label = lineMap[exp.lineNumber] || exp.category
    lines.push(`  Line ${exp.lineNumber}  ${label}: $${exp.amount.toLocaleString()}`)
  }

  const totalExp = data.deductions.businessExpenses.reduce((s, e) => s + e.amount, 0)
  lines.push('')
  lines.push(`  Line 28  Total expenses: $${totalExp.toLocaleString()}`)
  lines.push(`  Line 31  Net profit: $${(data.income.businessIncome - totalExp).toLocaleString()}`)

  return lines.join('\n')
}

// ─── CPA Handoff Package ────────────────────────────────────────────────────

// ─── Entity-Aware Multi-Schedule C Export ──────────────────────────────────

export interface EntityScheduleC {
  entityId: string
  entityName: string
  entityType: string
  ein?: string
  scheduleC: string
}

export function exportEntityScheduleCs(
  data: FilingExportData,
  entities: { id: string; name: string; type: string; ein?: string }[],
  incomeStreams: { entityId?: string; annualAmount: number; isActive: boolean }[],
  expenses: { entityId?: string; annualAmount: number; deductionPct: number; isDeductible: boolean; category: string }[],
): EntityScheduleC[] {
  // Group by entity
  const entityIds = new Set<string>()
  incomeStreams.filter(s => s.isActive && s.entityId && s.entityId !== 'personal').forEach(s => entityIds.add(s.entityId!))
  expenses.filter(e => e.isDeductible && e.entityId && e.entityId !== 'personal').forEach(e => entityIds.add(e.entityId!))

  const results: EntityScheduleC[] = []

  for (const eid of entityIds) {
    const entity = entities.find(e => e.id === eid) || { id: eid, name: eid, type: 'sole_prop' }
    const revenue = incomeStreams.filter(s => s.entityId === eid && s.isActive).reduce((s, i) => s + i.annualAmount, 0)
    const entityExpenses = expenses.filter(e => e.entityId === eid && e.isDeductible)
    const totalExp = entityExpenses.reduce((s, e) => s + e.annualAmount * e.deductionPct / 100, 0)

    const lines: string[] = [
      `Schedule C Data Export — Tax Year ${data.taxYear}`,
      `Entity: ${entity.name} (${entity.type})`,
      entity.ein ? `EIN: ${entity.ein}` : '',
      '',
      'INCOME',
      `  Line 1  Gross receipts: $${revenue.toLocaleString()}`,
      '',
      'EXPENSES',
    ]

    // Group expenses by category
    const byCategory = new Map<string, number>()
    for (const e of entityExpenses) {
      const amt = e.annualAmount * e.deductionPct / 100
      byCategory.set(e.category, (byCategory.get(e.category) || 0) + amt)
    }
    for (const [cat, amt] of byCategory) {
      lines.push(`  ${cat}: $${Math.round(amt).toLocaleString()}`)
    }

    lines.push('')
    lines.push(`  Total expenses: $${Math.round(totalExp).toLocaleString()}`)
    lines.push(`  Net profit: $${Math.round(revenue - totalExp).toLocaleString()}`)

    results.push({ entityId: eid, entityName: entity.name, entityType: entity.type, ein: entity.ein, scheduleC: lines.filter(Boolean).join('\n') })
  }

  // Also export personal Schedule C if there's business income without entity
  const personalBizIncome = incomeStreams.filter(s => s.isActive && (!s.entityId || s.entityId === 'personal')).reduce((s, i) => s + i.annualAmount, 0)
  if (personalBizIncome > 0 && data.income.businessIncome > 0) {
    results.unshift({
      entityId: 'personal', entityName: data.personalInfo.name || 'Personal', entityType: 'sole_prop',
      scheduleC: exportScheduleC(data),
    })
  }

  return results
}

export function generateCPAPackage(data: FilingExportData): {
  summary: string
  txfFile: string
  csvFile: string
  form8949: string
  scheduleC: string
} {
  const totalIncome = data.income.w2Wages + data.income.businessIncome + data.income.interestIncome +
    data.income.dividendIncome + data.income.stakingIncome + data.income.miningIncome + data.income.airdropIncome

  const totalExpenses = data.deductions.businessExpenses.reduce((s, e) => s + e.amount, 0)
  const netCapGains = (data.capitalGains.shortTermGains - data.capitalGains.shortTermLosses) +
    (data.capitalGains.longTermGains - data.capitalGains.longTermLosses)

  const summary = [
    `FORTUNA ENGINE — CPA HANDOFF PACKAGE`,
    `Tax Year: ${data.taxYear}`,
    `Filing Status: ${data.filingStatus}`,
    `State: ${data.stateCode}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `══════════════════════════════════════`,
    `INCOME SUMMARY`,
    `  W-2 Wages:              $${data.income.w2Wages.toLocaleString()}`,
    `  Business Income (Sch C): $${data.income.businessIncome.toLocaleString()}`,
    `  Business Expenses:      ($${totalExpenses.toLocaleString()})`,
    `  Net Business Profit:     $${(data.income.businessIncome - totalExpenses).toLocaleString()}`,
    `  Interest:                $${data.income.interestIncome.toLocaleString()}`,
    `  Dividends:               $${data.income.dividendIncome.toLocaleString()}`,
    `  Crypto Staking:          $${data.income.stakingIncome.toLocaleString()}`,
    `  Crypto Mining:           $${data.income.miningIncome.toLocaleString()}`,
    `  Crypto Airdrops:         $${data.income.airdropIncome.toLocaleString()}`,
    `  Capital Gains (net):     $${netCapGains.toLocaleString()}`,
    `  Total Gross Income:      $${totalIncome.toLocaleString()}`,
    ``,
    `ESTIMATED PAYMENTS MADE`,
    ...data.estimatedPayments.map(ep => `  ${ep.quarter}: $${ep.federalAmount.toLocaleString()} federal, $${ep.stateAmount.toLocaleString()} state`),
    ``,
    `RETIREMENT CONTRIBUTIONS`,
    `  Solo 401(k) Employee:    $${data.retirementContributions.solo401kEmployee.toLocaleString()}`,
    `  Solo 401(k) Employer:    $${data.retirementContributions.solo401kEmployer.toLocaleString()}`,
    `  SEP-IRA:                 $${data.retirementContributions.sepIRA.toLocaleString()}`,
    `  Traditional IRA:         $${data.retirementContributions.traditionalIRA.toLocaleString()}`,
    `  HSA:                     $${data.retirementContributions.hsa.toLocaleString()}`,
    ``,
    `CAPITAL GAINS (${data.capitalGains.transactions.length} transactions)`,
    `  Short-term gains:        $${data.capitalGains.shortTermGains.toLocaleString()}`,
    `  Short-term losses:      ($${data.capitalGains.shortTermLosses.toLocaleString()})`,
    `  Long-term gains:         $${data.capitalGains.longTermGains.toLocaleString()}`,
    `  Long-term losses:       ($${data.capitalGains.longTermLosses.toLocaleString()})`,
    `  Prior year carryover:   ($${data.capitalGains.carryoverLoss.toLocaleString()})`,
    ``,
    `NOTES FOR CPA`,
    `  - Crypto income reported per IRS Notice 2014-21 and Rev. Rul. 2023-14`,
    `  - Staking rewards valued at FMV on date of receipt`,
    `  - Wash sale tracking for crypto applies starting 2025`,
    `  - Form 8949 detail attached separately`,
    `  - All data generated by Fortuna Engine v10.0`,
  ].join('\n')

  return {
    summary,
    txfFile: exportTXF(data),
    csvFile: exportCSV(data),
    form8949: exportForm8949(data.capitalGains.transactions),
    scheduleC: exportScheduleC(data),
  }
}
