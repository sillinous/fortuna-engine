import type { FortunaState, EstatePlan } from './storage'

export interface EstateSummary {
  totalEstimatedEstateValue: number
  estimatedEstateTaxLiability: number
  lifetimeExemptionUsed: number
  lifetimeExemptionRemaining: number
  hasWill: boolean
  hasHealthcareProxy: boolean
  hasPowerOfAttorney: boolean
  totalLifeInsuranceBenefit: number
  missingBeneficiaries: string[] // IDs of accounts/policies missing beneficiaries
  trustFundingStatus: Record<string, 'funded' | 'unfunded' | 'partially_funded'>
  recommendations: EstateRecommendation[]
}

export interface EstateRecommendation {
  id: string
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  impact?: number
}

// 2024 Federal Estate Tax Exemption amounts
const FEDERAL_EXEMPTION_2024_SINGLE = 13_610_000
const FEDERAL_EXEMPTION_2024_MARRIED = 27_220_000

export function calculateEstateSummary(state: FortunaState): EstateSummary {
  const profile = state.profile || {}
  const estatePlan: EstatePlan = state.estatePlan || { trusts: [], directives: [], lifeInsurance: [] }
  const isMarried = profile.filingStatus === 'married_joint' || profile.filingStatus === 'married_separate'

  const federalExemption = isMarried ? FEDERAL_EXEMPTION_2024_MARRIED : FEDERAL_EXEMPTION_2024_SINGLE

  // 1. Calculate Total Estate Value
  let totalGrossAssets = 0

  // Real Estate
  if (state.realEstate) {
    totalGrossAssets += state.realEstate.reduce((sum, prop) => sum + prop.currentValue, 0)
  }

  // Investments
  if (state.investments) {
    totalGrossAssets += state.investments.reduce((sum, inv) => sum + (inv.currentValue || inv.costBasis), 0)
  }

  // Retirement
  if (state.retirementAccounts) {
    totalGrossAssets += state.retirementAccounts.reduce((sum, acc) => sum + acc.balance, 0)
  }

  // Business Entities (rough approximation from officersalary/etc if we had valuation, but let's assume 0 for basic unless specified)
  // Cash/Bank
  if (state.bankTransactions) {
    // In a real app we'd sum up current bank balances, assuming here we just look at accounts if they existed
  }

  // Deduct liabilities
  let totalLiabilities = 0
  if (state.realEstate) {
    totalLiabilities += state.realEstate.reduce((sum, prop) => sum + (prop.outstandingMortgage || 0), 0)
  }

  let netEstateValue = totalGrossAssets - totalLiabilities

  // Add Life Insurance Death Benefits (if owned by the decedent/not in ILIT)
  let totalLifeInsuranceBenefit = 0
  const missingBeneficiaries: string[] = []

  estatePlan.lifeInsurance.forEach(policy => {
    // If it's not in an ILIT, the death benefit is generally included in the gross estate
    totalLifeInsuranceBenefit += policy.deathBenefit
    netEstateValue += policy.deathBenefit

    if (!policy.beneficiaries || policy.beneficiaries.length === 0) {
      missingBeneficiaries.push(`policy_${policy.id}`)
    }
  })

  // 2. Estate Tax Liability
  const taxableEstate = Math.max(0, netEstateValue - federalExemption)

  // Simplified flat 40% for the highest bracket on the excess
  const estimatedEstateTaxLiability = taxableEstate > 0 ? taxableEstate * 0.40 : 0

  // 3. Directives Check
  const hasWill = estatePlan.directives.some(d => d.type === 'will')
  const hasHealthcareProxy = estatePlan.directives.some(d => d.type === 'healthcare_proxy' || d.type === 'living_will')
  const hasPowerOfAttorney = estatePlan.directives.some(d => d.type === 'power_of_attorney')

  // 4. Trust Funding Status
  const trustFundingStatus: Record<string, 'funded' | 'unfunded' | 'partially_funded'> = {}
  estatePlan.trusts.forEach(trust => {
    if (trust.estimatedValue > 0) {
      trustFundingStatus[trust.id] = 'funded'
    } else {
      trustFundingStatus[trust.id] = 'unfunded'
    }
  })

  // 5. Generate Recommendations
  const recommendations: EstateRecommendation[] = []

  if (!hasWill) {
    recommendations.push({
      id: 'missing-will',
      title: 'Draft a Last Will and Testament',
      description: 'Without a will, state intestacy laws determine how your assets are distributed, which may not align with your wishes.',
      priority: 'critical'
    })
  }

  if (!hasHealthcareProxy || !hasPowerOfAttorney) {
    recommendations.push({
      id: 'missing-directives',
      title: 'Complete Advance Directives',
      description: 'You are missing a Healthcare Proxy or Durable Power of Attorney. These are critical if you become incapacitated.',
      priority: 'high'
    })
  }

  if (estimatedEstateTaxLiability > 0) {
    recommendations.push({
      id: 'estate-tax-liability',
      title: 'High Estate Tax Exposure',
      description: `Your estimated net estate ($${(netEstateValue / 1_000_000).toFixed(1)}M) exceeds the federal exemption ($${(federalExemption / 1_000_000).toFixed(1)}M). Consider irrevocable trusts (e.g., ILIT, SLAT) to shield assets.`,
      priority: 'high',
      impact: estimatedEstateTaxLiability
    })
  }

  if (missingBeneficiaries.length > 0) {
    recommendations.push({
      id: 'missing-beneficiaries',
      title: 'Update Policy Beneficiaries',
      description: `You have ${missingBeneficiaries.length} life insurance policy/policies missing named beneficiaries. This could subject the payout to probate.`,
      priority: 'medium'
    })
  }

  estatePlan.trusts.filter(t => trustFundingStatus[t.id] === 'unfunded').forEach(t => {
    recommendations.push({
      id: `unfunded-trust-${t.id}`,
      title: `Fund Trust: ${t.name}`,
      description: 'You have established a trust but it appears unfunded (0 estimated value). An unfunded trust provides no probate or tax protection.',
      priority: 'high'
    })
  })

  return {
    totalEstimatedEstateValue: netEstateValue,
    estimatedEstateTaxLiability,
    lifetimeExemptionUsed: 0, // Simplified for now
    lifetimeExemptionRemaining: federalExemption,
    hasWill,
    hasHealthcareProxy,
    hasPowerOfAttorney,
    totalLifeInsuranceBenefit,
    missingBeneficiaries,
    trustFundingStatus,
    recommendations
  }
}
