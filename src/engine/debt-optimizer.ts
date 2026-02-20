import type { FortunaState } from './storage'

export interface DebtSummary {
  totalDebt: number
  totalMonthlyService: number
  weightedAverageInterestRate: number
  highestInterestRate: number
  highInterestDebtRatio: number
}

export function analyzeLiabilities(state: FortunaState): DebtSummary | null {
  if (!state.liabilities || state.liabilities.length === 0) return null

  let totalDebt = 0
  let totalMonthlyService = 0
  let weightedInterestSum = 0
  let highestInterestRate = 0
  let highInterestDebt = 0

  for (const liability of state.liabilities) {
    if (liability.principalBalance <= 0) continue

    totalDebt += liability.principalBalance
    totalMonthlyService += liability.minimumMonthlyPayment
    weightedInterestSum += (liability.principalBalance * liability.interestRate)

    if (liability.interestRate > highestInterestRate) {
      highestInterestRate = liability.interestRate
    }

    // Define "high interest" as arbitrarily > 8% for consumer/business debt
    if (liability.interestRate >= 0.08) {
      highInterestDebt += liability.principalBalance
    }
  }

  if (totalDebt === 0) return null

  const weightedAverageInterestRate = weightedInterestSum / totalDebt
  const highInterestDebtRatio = highInterestDebt / totalDebt

  return {
    totalDebt,
    totalMonthlyService,
    weightedAverageInterestRate,
    highestInterestRate,
    highInterestDebtRatio
  }
}
