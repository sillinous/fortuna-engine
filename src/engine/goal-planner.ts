/**
 * Fortuna Engine - Goal-Based Reverse Planner
 * Works backward from financial targets to calculate required income,
 * savings rates, and optimal structure to hit goals.
 */

import type { FortunaState, FinancialGoal as StorageGoal } from './storage'
import { generateTaxReport } from './tax-calculator'
import { generateCashFlow, type CashFlowConfig } from './cash-flow'

export type GoalType = 'after_tax_income' | 'savings_target' | 'retirement_balance' | 'tax_bill_limit' | 'monthly_net'

export interface FinancialGoal {
  id: string
  type: GoalType
  name: string
  targetAmount: number
  deadline?: string // ISO date
  deadlineMonths?: number
  priority: 'critical' | 'high' | 'medium'
}

export interface GoalPlan {
  goal: FinancialGoal
  feasible: boolean
  
  // Required metrics
  requiredGrossIncome: number
  currentGrossIncome: number
  incomeGap: number
  
  // Tax-optimized path
  requiredMonthlyGross: number
  requiredMonthlySavings: number
  effectiveTaxRate: number
  
  // Structure recommendations
  optimalEntityType: string
  estimatedTaxSavings: number
  
  // Timeline
  monthsToGoal: number
  progressPercent: number
  onTrack: boolean
  
  // Monthly breakdown
  monthlyPlan: MonthlyMilestone[]
  
  // Sensitivity
  ifYouEarnMore: { extraMonthly: number; monthsSaved: number }[]
}

export interface MonthlyMilestone {
  month: number
  label: string
  cumulativeSaved: number
  targetAtMonth: number
  surplus: number
  onTrack: boolean
}

const GOAL_LABELS: Record<GoalType, string> = {
  after_tax_income: 'After-Tax Income Target',
  savings_target: 'Savings Goal',
  retirement_balance: 'Retirement Target',
  tax_bill_limit: 'Tax Bill Ceiling',
  monthly_net: 'Monthly Take-Home Target',
}

export { GOAL_LABELS }

export function calculateGoalPlan(goal: FinancialGoal, state: FortunaState): GoalPlan {
  const report = generateTaxReport(state)
  const currentGross = report.grossIncome
  const currentAfterTax = report.afterTaxIncome
  const currentEffRate = report.effectiveRate
  const monthsToDeadline = goal.deadlineMonths || 12

  let requiredGross = 0
  let incomeGap = 0
  let feasible = true
  let progressPercent = 0
  let requiredMonthlySavings = 0

  switch (goal.type) {
    case 'after_tax_income': {
      // Need gross income that yields target after-tax
      // Iterative solve: gross * (1 - effectiveRate) ≈ target
      const estRate = currentEffRate > 0 ? currentEffRate : 0.25
      requiredGross = Math.round(goal.targetAmount / (1 - estRate))
      // Refine with bracket awareness
      for (let i = 0; i < 5; i++) {
        const estTax = requiredGross * estRate
        const afterTax = requiredGross - estTax
        const error = goal.targetAmount - afterTax
        requiredGross += Math.round(error / (1 - estRate))
      }
      incomeGap = Math.max(0, requiredGross - currentGross)
      progressPercent = Math.min(100, (currentAfterTax / goal.targetAmount) * 100)
      break
    }

    case 'savings_target': {
      // How much monthly savings needed to hit target by deadline
      const currentMonthlySurplus = (currentAfterTax / 12) - (state.expenses.reduce((s, e) => s + e.annualAmount, 0) / 12)
      requiredMonthlySavings = Math.round(goal.targetAmount / monthsToDeadline)
      const currentMonthlyCapacity = Math.max(0, currentMonthlySurplus)
      requiredGross = currentMonthlySavings > currentMonthlyCapacity
        ? currentGross + Math.round((requiredMonthlySavings - currentMonthlyCapacity) * 12 / (1 - currentEffRate))
        : currentGross
      incomeGap = Math.max(0, requiredGross - currentGross)
      progressPercent = currentMonthlyCapacity > 0 ? Math.min(100, (currentMonthlyCapacity / requiredMonthlySavings) * 100) : 0
      break
    }

    case 'retirement_balance': {
      // Annual contribution needed to reach target (simplified without investment returns)
      const currentRetirement = state.deductions.filter(d => d.category === 'retirement').reduce((s, d) => s + d.amount, 0)
      const w2Retirement = state.incomeStreams.filter(s => s.type === 'w2' && s.isActive).reduce((s, i) => s + (i.w2?.pretax401k || 0) + (i.w2?.employerMatch401k || 0), 0)
      const totalRetirement = currentRetirement + w2Retirement
      const yearsToGoal = Math.max(1, monthsToDeadline / 12)
      const assumedReturn = 0.07 // 7% annual return
      // Future value of annuity: FV = PMT × ((1+r)^n - 1) / r
      // Solve for PMT: PMT = FV × r / ((1+r)^n - 1)
      const fvFactor = (Math.pow(1 + assumedReturn, yearsToGoal) - 1) / assumedReturn
      const requiredAnnualContribution = Math.round(goal.targetAmount / fvFactor)
      const contributionGap = Math.max(0, requiredAnnualContribution - totalRetirement)
      requiredGross = currentGross + Math.round(contributionGap / (1 - currentEffRate))
      incomeGap = Math.max(0, requiredGross - currentGross)
      requiredMonthlySavings = Math.round(requiredAnnualContribution / 12)
      progressPercent = Math.min(100, (totalRetirement / requiredAnnualContribution) * 100)
      break
    }

    case 'tax_bill_limit': {
      // Maximum gross income to keep taxes under target
      // Binary search for the right income level
      let lo = 0, hi = currentGross * 3
      for (let i = 0; i < 20; i++) {
        const mid = Math.round((lo + hi) / 2)
        const estTax = mid * currentEffRate
        if (estTax < goal.targetAmount) lo = mid
        else hi = mid
      }
      requiredGross = lo
      incomeGap = currentGross > requiredGross ? -(currentGross - requiredGross) : 0
      progressPercent = report.totalTax <= goal.targetAmount ? 100 : Math.round((goal.targetAmount / report.totalTax) * 100)
      feasible = report.totalTax <= goal.targetAmount || incomeGap <= 0
      break
    }

    case 'monthly_net': {
      // Annual after-tax income needed = monthly target × 12
      const annualTarget = goal.targetAmount * 12
      const estRate = currentEffRate > 0 ? currentEffRate : 0.25
      requiredGross = Math.round(annualTarget / (1 - estRate))
      incomeGap = Math.max(0, requiredGross - currentGross)
      progressPercent = Math.min(100, ((currentAfterTax / 12) / goal.targetAmount) * 100)
      break
    }
  }

  const onTrack = progressPercent >= 80

  // Monthly milestone projection
  const monthlyPlan: MonthlyMilestone[] = []
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const now = new Date()
  
  if (goal.type === 'savings_target' || goal.type === 'retirement_balance') {
    const monthlySavings = requiredMonthlySavings > 0 ? requiredMonthlySavings : Math.round(goal.targetAmount / monthsToDeadline)
    for (let i = 1; i <= Math.min(monthsToDeadline, 24); i++) {
      const monthIdx = (now.getMonth() + i) % 12
      const year = now.getFullYear() + Math.floor((now.getMonth() + i) / 12)
      const targetAtMonth = Math.round((goal.targetAmount / monthsToDeadline) * i)
      const cumulativeSaved = monthlySavings * i
      monthlyPlan.push({
        month: i,
        label: `${monthNames[monthIdx]} '${String(year).slice(2)}`,
        cumulativeSaved,
        targetAtMonth,
        surplus: cumulativeSaved - targetAtMonth,
        onTrack: cumulativeSaved >= targetAtMonth * 0.9,
      })
    }
  }

  // Entity optimization estimate
  const hasSE = state.incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  const hasScorp = state.entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  let optimalEntity = 'Current structure'
  let estTaxSavings = 0
  if (hasSE && !hasScorp && report.selfEmploymentTax > 3000) {
    optimalEntity = 'S-Corp election'
    estTaxSavings = report.sCorpSavings || Math.round(report.selfEmploymentTax * 0.3)
  }

  // Sensitivity: what if you earn X more per month
  const sensitivities = [500, 1000, 2000, 5000].map(extra => {
    if (goal.type === 'savings_target' && requiredMonthlySavings > 0) {
      const adjustedMonths = Math.max(1, Math.ceil(goal.targetAmount / (requiredMonthlySavings + extra * (1 - currentEffRate))))
      return { extraMonthly: extra, monthsSaved: Math.max(0, monthsToDeadline - adjustedMonths) }
    }
    return { extraMonthly: extra, monthsSaved: 0 }
  })

  return {
    goal,
    feasible,
    requiredGrossIncome: requiredGross,
    currentGrossIncome: currentGross,
    incomeGap,
    requiredMonthlyGross: Math.round(requiredGross / 12),
    requiredMonthlySavings,
    effectiveTaxRate: currentEffRate,
    optimalEntityType: optimalEntity,
    estimatedTaxSavings: estTaxSavings,
    monthsToGoal: monthsToDeadline,
    progressPercent: Math.round(progressPercent),
    onTrack,
    monthlyPlan,
    ifYouEarnMore: sensitivities,
  }
}

export function getPresetGoals(state: FortunaState): FinancialGoal[] {
  const report = generateTaxReport(state)
  const goals: FinancialGoal[] = []

  // Preset: Double after-tax income
  if (report.afterTaxIncome > 0) {
    goals.push({
      id: 'double-income', type: 'after_tax_income', name: 'Double After-Tax Income',
      targetAmount: report.afterTaxIncome * 2, priority: 'high',
    })
  }

  // Preset: $100k after-tax
  goals.push({
    id: '100k-target', type: 'after_tax_income', name: '$100k After-Tax Income',
    targetAmount: 100000, priority: 'high',
  })

  // Preset: House down payment
  goals.push({
    id: 'house-down', type: 'savings_target', name: 'House Down Payment ($50k)',
    targetAmount: 50000, deadlineMonths: 24, priority: 'high',
  })

  // Preset: Emergency fund
  goals.push({
    id: 'emergency', type: 'savings_target', name: '6-Month Emergency Fund',
    targetAmount: Math.round((state.expenses.reduce((s, e) => s + e.annualAmount, 0) / 12 + 3000) * 6),
    deadlineMonths: 12, priority: 'critical',
  })

  // Preset: Retirement
  goals.push({
    id: 'retirement-1m', type: 'retirement_balance', name: '$1M Retirement',
    targetAmount: 1000000, deadlineMonths: 240, priority: 'medium',
  })

  // Preset: Keep taxes under current level
  if (report.totalTax > 0) {
    goals.push({
      id: 'tax-ceiling', type: 'tax_bill_limit', name: 'Keep Taxes Under Current',
      targetAmount: report.totalTax, priority: 'medium',
    })
  }

  // Preset: $8k/month take-home
  goals.push({
    id: 'monthly-8k', type: 'monthly_net', name: '$8,000/Month Take-Home',
    targetAmount: 8000, priority: 'high',
  })

  return goals
}

// ─── Phase F: Type Adapters ─────────────────────────────────────────────────

const GOAL_TYPE_MAP: Record<GoalType, StorageGoal['type']> = {
  after_tax_income: 'income_growth',
  savings_target: 'savings',
  retirement_balance: 'retirement',
  tax_bill_limit: 'tax_reduction',
  monthly_net: 'income_growth',
}

const STORAGE_TO_GOAL_TYPE: Record<string, GoalType> = {
  savings: 'savings_target',
  tax_reduction: 'tax_bill_limit',
  retirement: 'retirement_balance',
  debt_payoff: 'savings_target',
  investment: 'savings_target',
  income_growth: 'after_tax_income',
  entity_setup: 'savings_target',
  other: 'savings_target',
}

/** Convert planner FinancialGoal → storage FinancialGoal */
export function goalToStorage(goal: FinancialGoal, plan?: GoalPlan): StorageGoal {
  return {
    id: goal.id,
    title: goal.name,
    type: GOAL_TYPE_MAP[goal.type] || 'other',
    targetAmount: goal.targetAmount,
    currentAmount: plan?.monthlyTarget ? Math.round(plan.monthlyTarget * (plan.totalMonths - (plan.feasible ? 0 : plan.totalMonths))) : 0,
    targetDate: goal.deadline,
    priority: goal.priority === 'critical' ? 'high' : goal.priority,
    status: 'active',
    entityId: 'personal',
    memberId: 'primary',
    taxYear: new Date().getFullYear(),
    tags: [],
  }
}

/** Convert storage FinancialGoal → planner FinancialGoal */
export function storageToGoal(sg: StorageGoal): FinancialGoal {
  return {
    id: sg.id,
    type: STORAGE_TO_GOAL_TYPE[sg.type] || 'investment',
    name: sg.title,
    targetAmount: sg.targetAmount || 0,
    deadline: sg.targetDate,
    priority: sg.priority === 'low' ? 'medium' : sg.priority as 'critical' | 'high' | 'medium',
  }
}

/** Merge planner recommendations into existing StorageGoal[] */
export function mergePlannerGoals(existingGoals: StorageGoal[], plannerGoals: FinancialGoal[], plans: GoalPlan[]): StorageGoal[] {
  const result = [...existingGoals]

  for (const goal of plannerGoals) {
    const existing = result.find(g => g.id === goal.id || g.type === GOAL_TYPE_MAP[goal.type])
    const plan = plans.find(p => p.goal.id === goal.id)
    if (existing) {
      existing.targetAmount = goal.targetAmount
      if (goal.deadline) existing.targetDate = goal.deadline
    } else {
      result.push(goalToStorage(goal, plan))
    }
  }

  return result
}
