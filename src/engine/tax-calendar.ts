/**
 * FORTUNA ENGINE — Tax Calendar & Deadline Engine v1
 * 
 * Comprehensive tax deadline tracking with:
 *   - All federal estimated tax payment dates
 *   - Filing deadlines (original + extended)
 *   - Entity election windows (S-Corp, fiscal year)
 *   - Retirement contribution deadlines
 *   - State-specific deadlines (CA, NY, etc.)
 *   - Custom user deadlines
 *   - Smart reminder scheduling (7-day, 3-day, 1-day, day-of)
 *   - Penalty estimation for missed deadlines
 */

export interface TaxDeadline {
  id: string
  title: string
  description: string
  date: string             // ISO date (YYYY-MM-DD)
  category: DeadlineCategory
  priority: 'critical' | 'high' | 'medium' | 'low'
  recurring: 'annual' | 'quarterly' | 'one-time'
  applicableTo: ApplicableEntity[]
  form?: string            // IRS form number
  penaltyInfo?: string     // what happens if you miss it
  completed: boolean
  completedDate?: string
  notes: string
  reminderDays: number[]   // days before deadline to remind [7, 3, 1, 0]
}

export type DeadlineCategory =
  | 'estimated_tax'
  | 'filing'
  | 'extension'
  | 'entity_election'
  | 'retirement'
  | 'payroll'
  | 'information_return'
  | 'state'
  | 'custom'

export type ApplicableEntity =
  | 'all'
  | 'sole_proprietor'
  | 'single_member_llc'
  | 's_corp'
  | 'c_corp'
  | 'partnership'
  | 'self_employed'
  | 'w2_employee'
  | 'crypto_investor'

export interface DeadlineAlert {
  deadline: TaxDeadline
  daysUntil: number
  urgency: 'overdue' | 'today' | 'urgent' | 'upcoming' | 'future'
  message: string
}

// ─── Standard Federal Deadlines Generator ───────────────────────────────────

export function generateFederalDeadlines(taxYear: number): TaxDeadline[] {
  const y = taxYear
  const ny = taxYear + 1
  const deadlines: TaxDeadline[] = []
  let idCounter = 0
  const id = () => `fed_${y}_${++idCounter}`

  // ─── Quarterly Estimated Tax Payments ─────────────────────────────
  const estimatedPayments: [string, string, string][] = [
    [`${y}-04-15`, 'Q1 Estimated Tax Payment', `First quarterly estimated tax payment for ${y}. Covers income earned Jan 1 – Mar 31.`],
    [`${y}-06-16`, 'Q2 Estimated Tax Payment', `Second quarterly estimated tax payment for ${y}. Covers income earned Apr 1 – May 31.`],
    [`${y}-09-15`, 'Q3 Estimated Tax Payment', `Third quarterly estimated tax payment for ${y}. Covers income earned Jun 1 – Aug 31.`],
    [`${ny}-01-15`, 'Q4 Estimated Tax Payment', `Fourth quarterly estimated tax payment for ${y}. Covers income earned Sep 1 – Dec 31.`],
  ]

  for (const [date, title, desc] of estimatedPayments) {
    deadlines.push({
      id: id(), title, description: desc, date,
      category: 'estimated_tax', priority: 'critical', recurring: 'quarterly',
      applicableTo: ['self_employed', 'sole_proprietor', 'single_member_llc', 's_corp', 'partnership'],
      form: '1040-ES',
      penaltyInfo: 'Underpayment penalty calculated at short-term federal rate + 3% on the shortfall amount.',
      completed: false, notes: '', reminderDays: [14, 7, 3, 1, 0],
    })
  }

  // ─── Filing Deadlines ─────────────────────────────────────────────

  deadlines.push({
    id: id(), title: 'S-Corp / Partnership Return Due (Form 1120-S / 1065)',
    description: `File S-Corp (Form 1120-S) or Partnership (Form 1065) returns and issue Schedule K-1s to partners/shareholders.`,
    date: `${ny}-03-17`, category: 'filing', priority: 'critical', recurring: 'annual',
    applicableTo: ['s_corp', 'partnership'], form: '1120-S / 1065',
    penaltyInfo: 'Late filing penalty: $220/month per shareholder/partner, up to 12 months.',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'Individual Tax Return Due (Form 1040)',
    description: `File personal income tax return for ${y} or request extension (Form 4868). Also deadline for IRA/HSA contributions.`,
    date: `${ny}-04-15`, category: 'filing', priority: 'critical', recurring: 'annual',
    applicableTo: ['all'], form: '1040',
    penaltyInfo: 'Failure-to-file penalty: 5% of unpaid taxes per month (max 25%). Failure-to-pay: 0.5%/month.',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1, 0],
  })

  deadlines.push({
    id: id(), title: 'C-Corp Tax Return Due (Form 1120)',
    description: `File C-Corporation income tax return for ${y}.`,
    date: `${ny}-04-15`, category: 'filing', priority: 'critical', recurring: 'annual',
    applicableTo: ['c_corp'], form: '1120',
    penaltyInfo: 'Late filing penalty: 5% of unpaid tax per month (max 25%).',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'Extended S-Corp / Partnership Return Due',
    description: `Extended deadline to file S-Corp (1120-S) or Partnership (1065) return.`,
    date: `${ny}-09-15`, category: 'extension', priority: 'high', recurring: 'annual',
    applicableTo: ['s_corp', 'partnership'], form: '1120-S / 1065 (extended)',
    penaltyInfo: 'No additional extension available. Penalty applies from original due date.',
    completed: false, notes: '', reminderDays: [14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'Extended Individual Return Due',
    description: `Extended deadline for personal tax return (Form 1040) if extension was filed.`,
    date: `${ny}-10-15`, category: 'extension', priority: 'high', recurring: 'annual',
    applicableTo: ['all'], form: '1040 (extended)',
    penaltyInfo: 'Final deadline. Interest accrues from original April 15 due date on any balance owed.',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1],
  })

  // ─── Entity Elections ─────────────────────────────────────────────

  deadlines.push({
    id: id(), title: 'S-Corp Election Deadline (Form 2553)',
    description: `Last day to file Form 2553 to elect S-Corp status for tax year ${y}. Must be filed within 75 days of fiscal year start or by March 15.`,
    date: `${y}-03-15`, category: 'entity_election', priority: 'high', recurring: 'annual',
    applicableTo: ['sole_proprietor', 'single_member_llc', 'partnership'], form: '2553',
    penaltyInfo: 'Late election requires IRS reasonable cause approval (Rev. Proc. 2013-30). May delay by full year.',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3],
  })

  // ─── Retirement Contributions ─────────────────────────────────────

  deadlines.push({
    id: id(), title: 'Solo 401(k) Employee Deferral Deadline',
    description: `Last day for employee elective deferrals to Solo 401(k) for tax year ${y} (sole proprietors/partnerships). S-Corp owners: through payroll by Dec 31.`,
    date: `${y}-12-31`, category: 'retirement', priority: 'high', recurring: 'annual',
    applicableTo: ['sole_proprietor', 'single_member_llc', 'partnership'],
    penaltyInfo: 'Cannot make employee deferrals after this date for sole proprietors.',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'Solo 401(k) Plan Establishment Deadline',
    description: `Last day to establish (sign documents for) a new Solo 401(k) plan for tax year ${y}.`,
    date: `${y}-12-31`, category: 'retirement', priority: 'high', recurring: 'annual',
    applicableTo: ['sole_proprietor', 'single_member_llc', 's_corp'],
    penaltyInfo: 'Cannot retroactively establish a 401(k) plan after year-end.',
    completed: false, notes: '', reminderDays: [60, 30, 14, 7],
  })

  deadlines.push({
    id: id(), title: 'IRA / Roth IRA Contribution Deadline',
    description: `Last day to make IRA or Roth IRA contributions for tax year ${y}. Max $7,000 ($8,000 if age 50+).`,
    date: `${ny}-04-15`, category: 'retirement', priority: 'medium', recurring: 'annual',
    applicableTo: ['all'], form: '5498',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3],
  })

  deadlines.push({
    id: id(), title: 'SEP-IRA / Solo 401(k) Employer Contribution Deadline',
    description: `Last day for employer contributions to SEP-IRA or Solo 401(k) if extension was filed.`,
    date: `${ny}-10-15`, category: 'retirement', priority: 'medium', recurring: 'annual',
    applicableTo: ['sole_proprietor', 'single_member_llc', 's_corp'],
    completed: false, notes: 'If no extension filed, deadline is April 15.', reminderDays: [14, 7, 3],
  })

  deadlines.push({
    id: id(), title: 'HSA Contribution Deadline',
    description: `Last day to contribute to Health Savings Account for tax year ${y}. Max $4,300 individual / $8,550 family.`,
    date: `${ny}-04-15`, category: 'retirement', priority: 'medium', recurring: 'annual',
    applicableTo: ['all'],
    completed: false, notes: 'Must have HDHP to qualify.', reminderDays: [30, 14, 7],
  })

  // ─── Information Returns ──────────────────────────────────────────

  deadlines.push({
    id: id(), title: 'Issue 1099-NEC / 1099-MISC to Recipients',
    description: `Send Form 1099-NEC to independent contractors paid $600+, and 1099-MISC for rents, royalties, etc.`,
    date: `${ny}-01-31`, category: 'information_return', priority: 'high', recurring: 'annual',
    applicableTo: ['sole_proprietor', 'single_member_llc', 's_corp', 'c_corp', 'partnership'], form: '1099-NEC / 1099-MISC',
    penaltyInfo: 'Late filing: $60/form (≤30 days), $120/form (by Aug 1), $310/form (after Aug 1 or not filed).',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'W-2 Due to Employees & SSA',
    description: `Issue Form W-2 to employees and file with Social Security Administration.`,
    date: `${ny}-01-31`, category: 'information_return', priority: 'high', recurring: 'annual',
    applicableTo: ['s_corp', 'c_corp'], form: 'W-2',
    penaltyInfo: 'Same penalty structure as 1099-NEC.',
    completed: false, notes: '', reminderDays: [30, 14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'Form 5500-EZ (Solo 401k with $250K+)',
    description: `Annual filing for Solo 401(k) plans with assets exceeding $250,000.`,
    date: `${ny}-07-31`, category: 'information_return', priority: 'medium', recurring: 'annual',
    applicableTo: ['sole_proprietor', 'single_member_llc', 's_corp'], form: '5500-EZ',
    penaltyInfo: 'Penalty: $250/day, up to $150,000.',
    completed: false, notes: 'Only required if plan assets exceed $250K.', reminderDays: [30, 14, 7],
  })

  // ─── Year-End Planning Windows ────────────────────────────────────

  deadlines.push({
    id: id(), title: 'Tax-Loss Harvesting Window',
    description: `Last trading day to execute tax-loss harvesting sales for ${y}. Review portfolio for unrealized losses to offset gains.`,
    date: `${y}-12-29`, category: 'custom', priority: 'high', recurring: 'annual',
    applicableTo: ['crypto_investor', 'all'],
    completed: false, notes: 'After 2024, wash sale rules apply to crypto (30-day repurchase restriction).', reminderDays: [14, 7, 3, 1],
  })

  deadlines.push({
    id: id(), title: 'Charitable Contribution Deadline',
    description: `Last day for charitable donations to be deductible for ${y}.`,
    date: `${y}-12-31`, category: 'custom', priority: 'low', recurring: 'annual',
    applicableTo: ['all'],
    completed: false, notes: 'Consider donating appreciated stock/crypto for double tax benefit.', reminderDays: [30, 14],
  })

  return deadlines
}

// ─── State-Specific Deadline Generator ──────────────────────────────────────

export function generateStateDeadlines(taxYear: number, stateCode: string): TaxDeadline[] {
  const ny = taxYear + 1
  const deadlines: TaxDeadline[] = []
  let idCounter = 0
  const id = () => `state_${stateCode}_${taxYear}_${++idCounter}`

  // California has different estimated payment schedule
  if (stateCode === 'CA') {
    const caPayments: [string, string][] = [
      [`${taxYear}-04-15`, 'CA Q1 Estimated Tax (30% of annual)'],
      [`${taxYear}-06-16`, 'CA Q2 Estimated Tax (40% of annual)'],
      [`${ny}-01-15`, 'CA Q3 Estimated Tax (0% — skip)'],
      [`${ny}-01-15`, 'CA Q4 Estimated Tax (30% of annual)'],
    ]
    for (const [date, title] of caPayments) {
      if (title.includes('skip')) continue
      deadlines.push({
        id: id(), title, description: `California estimated tax payment. CA uses a 30/40/0/30 split (not equal quarters).`,
        date, category: 'state', priority: 'critical', recurring: 'quarterly',
        applicableTo: ['self_employed'], form: 'CA 540-ES',
        penaltyInfo: 'CA underpayment penalty calculated separately from federal.',
        completed: false, notes: '', reminderDays: [14, 7, 3, 1, 0],
      })
    }
  }

  // Illinois
  if (stateCode === 'IL') {
    deadlines.push({
      id: id(), title: 'IL Individual Tax Return Due',
      description: `File Illinois IL-1040. Due same day as federal.`,
      date: `${ny}-04-15`, category: 'state', priority: 'high', recurring: 'annual',
      applicableTo: ['all'], form: 'IL-1040',
      completed: false, notes: '4.95% flat rate.', reminderDays: [14, 7, 3, 1],
    })
  }

  // Add generic state filing deadline for all states with income tax
  const noTaxStates = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY']
  if (!noTaxStates.includes(stateCode)) {
    deadlines.push({
      id: id(), title: `${stateCode} State Tax Return Due`,
      description: `File ${stateCode} state income tax return. Most states follow federal April 15 deadline.`,
      date: `${ny}-04-15`, category: 'state', priority: 'high', recurring: 'annual',
      applicableTo: ['all'],
      completed: false, notes: '', reminderDays: [14, 7, 3, 1],
    })
  }

  return deadlines
}

// ─── Alert Generator ────────────────────────────────────────────────────────

export function getDeadlineAlerts(deadlines: TaxDeadline[], asOfDate?: Date): DeadlineAlert[] {
  const now = asOfDate || new Date()
  const today = now.toISOString().split('T')[0]

  return deadlines
    .filter(d => !d.completed)
    .map(d => {
      const deadlineDate = new Date(d.date + 'T23:59:59')
      const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      let urgency: DeadlineAlert['urgency']
      let message: string

      if (daysUntil < 0) {
        urgency = 'overdue'
        message = `⚠️ OVERDUE by ${Math.abs(daysUntil)} day(s)! ${d.penaltyInfo || 'Late penalties may apply.'}`
      } else if (daysUntil === 0) {
        urgency = 'today'
        message = `🔴 DUE TODAY! Complete before midnight.`
      } else if (daysUntil <= 3) {
        urgency = 'urgent'
        message = `🟠 Due in ${daysUntil} day(s). Take action now.`
      } else if (daysUntil <= 14) {
        urgency = 'upcoming'
        message = `🟡 Due in ${daysUntil} days. Plan ahead.`
      } else {
        urgency = 'future'
        message = `🟢 Due in ${daysUntil} days.`
      }

      return { deadline: d, daysUntil, urgency, message }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

// ─── Calendar View Helpers ──────────────────────────────────────────────────

export function getDeadlinesForMonth(deadlines: TaxDeadline[], year: number, month: number): TaxDeadline[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return deadlines.filter(d => d.date.startsWith(prefix))
}

export function getUpcomingDeadlines(deadlines: TaxDeadline[], days: number = 30): TaxDeadline[] {
  const now = new Date()
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  return deadlines
    .filter(d => !d.completed && new Date(d.date) >= now && new Date(d.date) <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Penalty Estimator ──────────────────────────────────────────────────────

export function estimateUnderpaymentPenalty(
  requiredPayment: number,
  actualPaid: number,
  dueDate: string,
  paidDate: string,
): { penalty: number; daysLate: number; rate: number } {
  const due = new Date(dueDate)
  const paid = new Date(paidDate)
  const daysLate = Math.max(0, Math.ceil((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)))
  
  if (daysLate === 0 || actualPaid >= requiredPayment) {
    return { penalty: 0, daysLate: 0, rate: 0 }
  }

  // IRS underpayment rate: federal short-term rate + 3% (currently ~8% annual)
  const annualRate = 0.08
  const shortfall = Math.max(0, requiredPayment - actualPaid)
  const penalty = shortfall * annualRate * (daysLate / 365)

  return { penalty: Math.round(penalty * 100) / 100, daysLate, rate: annualRate }
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CALENDAR_STORAGE_KEY = 'fortuna:tax-calendar'

export function saveCalendar(deadlines: TaxDeadline[]) {
  localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(deadlines))
}

export function loadCalendar(): TaxDeadline[] {
  try {
    const raw = localStorage.getItem(CALENDAR_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return []
}

export function initializeCalendar(taxYear: number, stateCode: string): TaxDeadline[] {
  const existing = loadCalendar()
  if (existing.length > 0) return existing

  const federal = generateFederalDeadlines(taxYear)
  const state = generateStateDeadlines(taxYear, stateCode)
  const all = [...federal, ...state]
  saveCalendar(all)
  return all
}
