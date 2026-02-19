/**
 * Fortuna Engine - Execution Timeline
 * Generates time-aware action plans with real deadlines
 */

import type { FortunaState } from './storage'
import { detectStrategies, type DetectedStrategy } from './strategy-detector'
import { generateTaxReport } from './tax-calculator'

export interface TimelineAction {
  id: string
  strategyId: string
  title: string
  description: string
  deadline: string // ISO date
  deadlineLabel: string
  quarter: string // Q1 2025, Q2 2025, etc.
  category: 'tax' | 'entity' | 'revenue' | 'risk' | 'compliance' | 'retirement' | 'deduction'
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'upcoming' | 'urgent' | 'overdue' | 'completed'
  estimatedImpact: number
  impactLabel: string
  steps: string[]
  daysUntilDeadline: number
  irsForm?: string
}

export interface QuarterBlock {
  quarter: string
  label: string
  actions: TimelineAction[]
  totalImpact: number
}

const CURRENT_YEAR = new Date().getFullYear()

// Key tax deadlines
const TAX_DEADLINES = {
  q1_estimated: `${CURRENT_YEAR}-04-15`,
  q2_estimated: `${CURRENT_YEAR}-06-15`,
  q3_estimated: `${CURRENT_YEAR}-09-15`,
  q4_estimated: `${CURRENT_YEAR + 1}-01-15`,
  scorp_election: `${CURRENT_YEAR}-03-15`,
  tax_filing: `${CURRENT_YEAR}-04-15`,
  tax_extension: `${CURRENT_YEAR}-10-15`,
  sep_ira_deadline: `${CURRENT_YEAR}-04-15`, // Or extension deadline
  sep_ira_extended: `${CURRENT_YEAR}-10-15`,
  solo401k_setup: `${CURRENT_YEAR}-12-31`,
  solo401k_employee: `${CURRENT_YEAR}-12-31`,
  solo401k_employer: `${CURRENT_YEAR}-04-15`,
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function getStatus(days: number): TimelineAction['status'] {
  if (days < 0) return 'overdue'
  if (days <= 14) return 'urgent'
  return 'upcoming'
}

function getQuarter(dateStr: string): string {
  const d = new Date(dateStr)
  const q = Math.ceil((d.getMonth() + 1) / 3)
  return `Q${q} ${d.getFullYear()}`
}

export function generateTimeline(state: FortunaState): TimelineAction[] {
  const actions: TimelineAction[] = []
  const strategies = detectStrategies(state)
  const report = generateTaxReport(state)
  const hasScorp = state.entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)

  // S-Corp election deadline
  const scorpStrategy = strategies.find(s => s.id === 'scorp-election')
  if (scorpStrategy) {
    actions.push({
      id: 'action-scorp',
      strategyId: 'scorp-election',
      title: 'File S-Corp Election (Form 2553)',
      description: `File Form 2553 to elect S-Corp status. Saves ${scorpStrategy.impactLabel} annually. Must be filed by March 15 for current tax year (or within 75 days of formation).`,
      deadline: TAX_DEADLINES.scorp_election,
      deadlineLabel: 'March 15',
      quarter: getQuarter(TAX_DEADLINES.scorp_election),
      category: 'entity',
      priority: 'critical',
      status: getStatus(daysUntil(TAX_DEADLINES.scorp_election)),
      estimatedImpact: scorpStrategy.estimatedImpact,
      impactLabel: scorpStrategy.impactLabel,
      daysUntilDeadline: daysUntil(TAX_DEADLINES.scorp_election),
      irsForm: 'Form 2553',
      steps: [
        'Ensure LLC is formed in your state',
        'Complete Form 2553 (Election by a Small Business Corporation)',
        'All shareholders must consent and sign',
        'File with the IRS service center for your state',
        'Set up payroll for reasonable salary',
      ],
    })
  }

  // LLC formation (if recommended)
  const llcStrategy = strategies.find(s => s.id === 'llc-formation')
  if (llcStrategy) {
    actions.push({
      id: 'action-llc',
      strategyId: 'llc-formation',
      title: 'Form LLC for Liability Protection',
      description: 'File Articles of Organization, obtain EIN, open business bank account. Foundation for all other entity strategies.',
      deadline: `${CURRENT_YEAR}-03-01`,
      deadlineLabel: 'ASAP (before S-Corp deadline)',
      quarter: `Q1 ${CURRENT_YEAR}`,
      category: 'entity',
      priority: 'critical',
      status: 'urgent',
      estimatedImpact: 0,
      impactLabel: 'Asset protection',
      daysUntilDeadline: daysUntil(`${CURRENT_YEAR}-03-01`),
      steps: [
        'File Articles of Organization with Secretary of State',
        'Apply for EIN on IRS.gov (instant, free)',
        'Draft Operating Agreement',
        'Open business checking account',
        'Begin separating business/personal finances',
      ],
    })
  }

  // Quarterly estimated tax payments
  if (report.totalTax > 1000) {
    const quarterlyAmount = Math.round(report.totalTax / 4)
    const estimatedDeadlines = [
      { deadline: TAX_DEADLINES.q1_estimated, label: 'Q1 Estimated Tax', qLabel: 'April 15' },
      { deadline: TAX_DEADLINES.q2_estimated, label: 'Q2 Estimated Tax', qLabel: 'June 15' },
      { deadline: TAX_DEADLINES.q3_estimated, label: 'Q3 Estimated Tax', qLabel: 'September 15' },
      { deadline: TAX_DEADLINES.q4_estimated, label: 'Q4 Estimated Tax', qLabel: 'January 15' },
    ]

    estimatedDeadlines.forEach((ed, i) => {
      const days = daysUntil(ed.deadline)
      if (days > -30) { // Show if not more than 30 days past
        actions.push({
          id: `action-est-${i + 1}`,
          strategyId: 'estimated-tax',
          title: ed.label,
          description: `Pay ~$${quarterlyAmount.toLocaleString()} (Form 1040-ES). Based on projected annual tax of $${report.totalTax.toLocaleString()}.`,
          deadline: ed.deadline,
          deadlineLabel: ed.qLabel,
          quarter: getQuarter(ed.deadline),
          category: 'compliance',
          priority: days <= 30 ? 'high' : 'medium',
          status: getStatus(days),
          estimatedImpact: 0,
          impactLabel: `$${quarterlyAmount.toLocaleString()} payment`,
          daysUntilDeadline: days,
          irsForm: 'Form 1040-ES',
          steps: [
            `Calculate payment: ~$${quarterlyAmount.toLocaleString()}`,
            'Pay via IRS Direct Pay (irs.gov/directpay)',
            'Or use EFTPS (Electronic Federal Tax Payment System)',
            'Keep confirmation number for records',
          ],
        })
      }
    })
  }

  // Retirement contribution deadline
  const retirementStrategy = strategies.find(s => s.id === 'retirement-max')
  if (retirementStrategy) {
    actions.push({
      id: 'action-retirement',
      strategyId: 'retirement-max',
      title: 'Maximize Retirement Contributions',
      description: retirementStrategy.description,
      deadline: TAX_DEADLINES.sep_ira_extended,
      deadlineLabel: 'Tax filing deadline (or extension)',
      quarter: getQuarter(TAX_DEADLINES.sep_ira_deadline),
      category: 'retirement',
      priority: 'high',
      status: getStatus(daysUntil(TAX_DEADLINES.sep_ira_deadline)),
      estimatedImpact: retirementStrategy.estimatedImpact,
      impactLabel: retirementStrategy.impactLabel,
      daysUntilDeadline: daysUntil(TAX_DEADLINES.sep_ira_deadline),
      steps: retirementStrategy.steps,
    })
  }

  // Home office setup
  const homeOffice = strategies.find(s => s.id === 'home-office')
  if (homeOffice) {
    actions.push({
      id: 'action-home-office',
      strategyId: 'home-office',
      title: 'Document Home Office Deduction',
      description: 'Measure, photograph, and calculate home office deduction before year-end.',
      deadline: `${CURRENT_YEAR}-12-31`,
      deadlineLabel: 'Year-end',
      quarter: `Q4 ${CURRENT_YEAR}`,
      category: 'deduction',
      priority: 'medium',
      status: 'upcoming',
      estimatedImpact: homeOffice.estimatedImpact,
      impactLabel: homeOffice.impactLabel,
      daysUntilDeadline: daysUntil(`${CURRENT_YEAR}-12-31`),
      steps: homeOffice.steps,
    })
  }

  // Vehicle mileage tracking
  const vehicle = strategies.find(s => s.id === 'vehicle-deduction')
  if (vehicle) {
    actions.push({
      id: 'action-vehicle',
      strategyId: 'vehicle-deduction',
      title: 'Start Mileage Tracking',
      description: 'Begin tracking business miles immediately. Retroactive logs are not accepted by the IRS.',
      deadline: `${CURRENT_YEAR}-02-28`,
      deadlineLabel: 'Start immediately',
      quarter: `Q1 ${CURRENT_YEAR}`,
      category: 'deduction',
      priority: 'medium',
      status: 'urgent',
      estimatedImpact: vehicle.estimatedImpact,
      impactLabel: vehicle.impactLabel,
      daysUntilDeadline: 0,
      steps: vehicle.steps,
    })
  }

  // Annual tax filing
  actions.push({
    id: 'action-tax-filing',
    strategyId: 'compliance',
    title: 'Annual Tax Filing',
    description: `File federal and state income tax returns. Projected tax: $${report.totalTax.toLocaleString()}.`,
    deadline: TAX_DEADLINES.tax_filing,
    deadlineLabel: 'April 15 (or Oct 15 with extension)',
    quarter: getQuarter(TAX_DEADLINES.tax_filing),
    category: 'compliance',
    priority: 'high',
    status: getStatus(daysUntil(TAX_DEADLINES.tax_filing)),
    estimatedImpact: 0,
    impactLabel: 'Required',
    daysUntilDeadline: daysUntil(TAX_DEADLINES.tax_filing),
    irsForm: 'Form 1040 + Schedule C/SE',
    steps: [
      'Gather all income documents (1099s, W-2s)',
      'Compile business expense records',
      'Calculate all deductions and credits',
      hasScorp ? 'File Form 1120-S (S-Corp return) by March 15' : 'File Schedule C with Form 1040',
      'File state return for your state',
      'Consider filing for extension (Form 4868) if needed',
    ],
  })

  // Sort by deadline
  actions.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())

  return actions
}

/**
 * Group actions into quarters
 */
export function groupByQuarter(actions: TimelineAction[]): QuarterBlock[] {
  const quarterMap = new Map<string, TimelineAction[]>()

  actions.forEach(action => {
    const q = action.quarter
    if (!quarterMap.has(q)) quarterMap.set(q, [])
    quarterMap.get(q)!.push(action)
  })

  const quarters: QuarterBlock[] = []
  quarterMap.forEach((actions, quarter) => {
    quarters.push({
      quarter,
      label: quarter,
      actions: actions.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()),
      totalImpact: actions.reduce((s, a) => s + a.estimatedImpact, 0),
    })
  })

  return quarters.sort((a, b) => {
    const aDate = new Date(a.actions[0]?.deadline || '2099-01-01')
    const bDate = new Date(b.actions[0]?.deadline || '2099-01-01')
    return aDate.getTime() - bDate.getTime()
  })
}
