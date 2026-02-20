import type { FortunaState } from './storage'

export interface BalanceSheet {
  assets: {
    cashAndEquivalents: number
    investments: number
    retirement: number
    realEstate: number
    businessEquity: number
    startupEquity: number
    lifeInsuranceCashValue: number
    trustAssets: number
    totalAssets: number
  }
  liabilities: {
    mortgages: number
    consumerDebt: number // credit cards, auto, personal
    studentLoans: number
    businessDebt: number
    totalLiabilities: number
  }
  netWorth: number
  liquidNetWorth: number
}

export function generateBalanceSheet(state: FortunaState): BalanceSheet {
  const assets = {
    cashAndEquivalents: 0,
    investments: 0,
    retirement: 0,
    realEstate: 0,
    businessEquity: 0,
    startupEquity: 0,
    lifeInsuranceCashValue: 0,
    trustAssets: 0,
    totalAssets: 0,
  }

  const liabilities = {
    mortgages: 0,
    consumerDebt: 0,
    studentLoans: 0,
    businessDebt: 0,
    totalLiabilities: 0,
  }

  // Cash / Bank Balances (Requires parsing bank transactions if we had a pure balance,
  // but we'll assume investments with type 'cash'/'cd' or future explicit bank accounts)
  if (state.investments) {
    for (const inv of state.investments) {
      const val = inv.currentValue || inv.costBasis || 0
      if (inv.type === 'cash' || inv.type === 'cd') {
        assets.cashAndEquivalents += val
      } else {
        assets.investments += val
      }
    }
  }

  // Retirement
  if (state.retirementAccounts) {
    for (const acc of state.retirementAccounts) {
      assets.retirement += (acc.balance || 0)
    }
  }

  // Real Estate
  if (state.realEstate) {
    for (const prop of state.realEstate) {
      assets.realEstate += prop.currentValue
      if (prop.outstandingMortgage) {
        liabilities.mortgages += prop.outstandingMortgage
      }
    }
  }

  // Startup Equity (Vested Value)
  if (state.equityCompensation) {
    for (const eq of state.equityCompensation) {
      const unitValue = Math.max(0, eq.currentFairMarketValue - (eq.strikePrice || 0))
      assets.startupEquity += (unitValue * eq.vestedShares)
    }
  }

  // Life Insurance Cash Value
  if (state.estatePlan?.lifeInsurance) {
    for (const policy of state.estatePlan.lifeInsurance) {
      assets.lifeInsuranceCashValue += (policy.cashValue || 0)
    }
  }

  // Trusts
  if (state.estatePlan?.trusts) {
    for (const trust of state.estatePlan.trusts) {
      assets.trustAssets += trust.estimatedValue
    }
  }

  // Liabilities (Debt)
  if (state.liabilities) {
    for (const debt of state.liabilities) {
      const bal = debt.principalBalance
      if (debt.type === 'mortgage') liabilities.mortgages += bal
      else if (debt.type === 'student_loan') liabilities.studentLoans += bal
      else if (debt.type === 'business_loan') liabilities.businessDebt += bal
      else liabilities.consumerDebt += bal // auto, credit cards, margin, other
    }
  }

  assets.totalAssets = 
    assets.cashAndEquivalents + 
    assets.investments + 
    assets.retirement + 
    assets.realEstate + 
    assets.businessEquity + 
    assets.startupEquity + 
    assets.lifeInsuranceCashValue + 
    assets.trustAssets

  liabilities.totalLiabilities = 
    liabilities.mortgages + 
    liabilities.consumerDebt + 
    liabilities.studentLoans + 
    liabilities.businessDebt

  const netWorth = assets.totalAssets - liabilities.totalLiabilities
  const liquidNetWorth = assets.cashAndEquivalents + assets.investments

  return {
    assets,
    liabilities,
    netWorth,
    liquidNetWorth
  }
}
