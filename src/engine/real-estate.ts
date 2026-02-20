import type { FortunaState, RealEstateProperty } from './storage'

export interface RealEstateSummary {
  totalPortfolioValue: number
  totalEquity: number
  totalUnrealizedGain: number
  potential1031Value: number
}

export function calculateRealEstateSummary(state: FortunaState): RealEstateSummary | null {
  if (!state.realEstate || state.realEstate.length === 0) return null

  let totalPortfolioValue = 0
  let totalEquity = 0
  let totalUnrealizedGain = 0
  let potential1031Value = 0

  for (const prop of state.realEstate) {
    totalPortfolioValue += prop.currentValue
    totalEquity += (prop.currentValue - (prop.outstandingMortgage || 0))
    const unrealizedGain = Math.max(0, prop.currentValue - prop.purchasePrice)
    totalUnrealizedGain += unrealizedGain

    if (prop.type !== 'primary_residence' && prop.is1031ExchangeTarget !== false) {
      potential1031Value += prop.currentValue
    }
  }

  return {
    totalPortfolioValue,
    totalEquity,
    totalUnrealizedGain,
    potential1031Value
  }
}
