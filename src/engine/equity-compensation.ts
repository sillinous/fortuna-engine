import type { FortunaState } from './storage'

export interface EquitySummary {
    totalVestedValue: number
    totalUnvestedValue: number
    estimatedTaxLiability: number
    isoSpread: number // Important for AMT calculation
    hasUnexercisedOptions: boolean
    hasExpiringOptions: boolean
    eligibleFor83b: boolean
}

export function analyzeEquityCompensation(state: FortunaState): EquitySummary | null {
    if (!state.equityCompensation || state.equityCompensation.length === 0) return null

    let totalVestedValue = 0
    let totalUnvestedValue = 0
    let estimatedTaxLiability = 0
    let isoSpread = 0
    let hasUnexercisedOptions = false
    let hasExpiringOptions = false
    let eligibleFor83b = false

    const currentDate = new Date()

    for (const equity of state.equityCompensation) {
        const fmv = equity.currentFairMarketValue
        const strike = equity.strikePrice || 0

        // Value = (FMV - Strike) * Shares
        const unitValue = Math.max(0, fmv - strike)

        totalVestedValue += unitValue * equity.vestedShares
        totalUnvestedValue += unitValue * equity.unvestedShares

        // ISO Spread for AMT
        if (equity.grantType === 'iso') {
            isoSpread += unitValue * equity.vestedShares
            if (equity.vestedShares > 0) hasUnexercisedOptions = true
        }

        // NSO Liability (Ordinary Income on exercise)
        if (equity.grantType === 'nso') {
            // Rough approximation: 35% combined tax rate for NSO exercise
            estimatedTaxLiability += (unitValue * equity.vestedShares) * 0.35
            if (equity.vestedShares > 0) hasUnexercisedOptions = true
        }

        // RSUs trigger ordinary income upon vesting
        if (equity.grantType === 'rsu') {
            // Rough approximation: 35% tax on unvested value that will vest
            estimatedTaxLiability += (fmv * equity.unvestedShares) * 0.35
        }

        // 83(b) Election Eligibility (typically within 30 days of grant for early exercise or founder stock)
        const grantDateObj = new Date(equity.grantDate)
        const daysSinceGrant = (currentDate.getTime() - grantDateObj.getTime()) / (1000 * 3600 * 24)
        if (daysSinceGrant <= 30 && !equity.has83bElection && (equity.grantType === 'founder_stock' || equity.grantType === 'iso')) {
            eligibleFor83b = true
        }

        // Expiring Options (e.g. 90 days post termination or 10-year limit)
        if (equity.expirationDate) {
            const expDateObj = new Date(equity.expirationDate)
            const daysToExpiration = (expDateObj.getTime() - currentDate.getTime()) / (1000 * 3600 * 24)
            if (daysToExpiration > 0 && daysToExpiration <= 90 && equity.vestedShares > 0) {
                hasExpiringOptions = true
            }
        }
    }

    return {
        totalVestedValue,
        totalUnvestedValue,
        estimatedTaxLiability,
        isoSpread,
        hasUnexercisedOptions,
        hasExpiringOptions,
        eligibleFor83b
    }
}
