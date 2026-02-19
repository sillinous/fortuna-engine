/**
 * FORTUNA ENGINE — Tax Impact Simulator v1
 * 
 * Instant "what-if" analysis before making financial decisions:
 *   - "What if I sell $50K of crypto?"
 *   - "What if I max my Solo 401(k)?"
 *   - "What if I take a $100K distribution?"
 *   - "What if I move to Texas?"
 *   - "What if I convert to S-Corp?"
 *   - "What if I buy equipment (§179)?"
 *   - "What if I hire a contractor?"
 * 
 * Shows side-by-side: current tax position vs. after-decision,
 * with marginal rate impact, total tax change, and cascading effects.
 */

export interface TaxPosition {
  grossIncome: number
  agi: number
  taxableIncome: number
  federalTax: number
  stateTax: number
  seTax: number
  niit: number
  totalTax: number
  effectiveRate: number
  marginalRate: number
  stateCode: string
  filingStatus: string
  takeHomePay: number
}

export interface SimulationResult {
  scenarioName: string
  description: string
  before: TaxPosition
  after: TaxPosition
  taxDelta: number             // positive = more tax, negative = savings
  effectiveRateDelta: number
  marginalRateDelta: number
  takeHomeDelta: number
  warnings: string[]
  cascadeEffects: CascadeEffect[]
  recommendation: string
}

export interface CascadeEffect {
  name: string
  description: string
  impact: number
  direction: 'positive' | 'negative' | 'neutral'
}

export type SimulationScenario =
  | { type: 'sell_crypto'; amount: number; holdingPeriod: 'short' | 'long'; costBasis: number }
  | { type: 'sell_stock'; amount: number; holdingPeriod: 'short' | 'long'; costBasis: number }
  | { type: 'retirement_contribution'; amount: number; accountType: 'solo401k' | 'sep_ira' | 'traditional_ira' | 'roth_ira' | 'hsa' }
  | { type: 'take_distribution'; amount: number; entityType: 's_corp' | 'partnership' | 'c_corp_dividend' }
  | { type: 'relocate_state'; newState: string }
  | { type: 'scorp_conversion'; currentNetIncome: number; proposedSalary: number }
  | { type: 'equipment_purchase'; amount: number; method: 'section_179' | 'bonus_depreciation' | 'standard' }
  | { type: 'hire_contractor'; annualCost: number }
  | { type: 'additional_income'; amount: number; incomeType: 'w2' | 'self_employment' | 'investment' | 'rental' }
  | { type: 'charitable_donation'; amount: number; donationType: 'cash' | 'appreciated_stock' | 'appreciated_crypto' }
  | { type: 'roth_conversion'; amount: number }

// ─── Federal Brackets (2025) ────────────────────────────────────────────────

const BRACKETS_SINGLE: [number, number][] = [
  [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
  [250525, 0.32], [626350, 0.35], [Infinity, 0.37],
]

const BRACKETS_MFJ: [number, number][] = [
  [23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24],
  [501050, 0.32], [751600, 0.35], [Infinity, 0.37],
]

const LTCG_BRACKETS_SINGLE: [number, number][] = [
  [47025, 0.00], [518900, 0.15], [Infinity, 0.20],
]

const STATE_RATES: Record<string, number> = {
  CA: 0.093, NY: 0.0685, IL: 0.0495, TX: 0, FL: 0, WA: 0, NV: 0, WY: 0, TN: 0, SD: 0, AK: 0, NH: 0,
  OR: 0.099, HI: 0.11, NJ: 0.1075, MN: 0.0985, VT: 0.0875, DC: 0.1075,
  MA: 0.05, CO: 0.044, NC: 0.045, PA: 0.0307, IN: 0.0305, AZ: 0.025, ND: 0.0195,
  GA: 0.0549, VA: 0.0575, MD: 0.0575, WI: 0.0765, OH: 0.035, MI: 0.0425,
}

const STD_DED = { single: 15000, mfj: 30000 }

// ─── Core Tax Calculator ────────────────────────────────────────────────────

function calcPosition(params: {
  ordinaryIncome: number
  selfEmploymentIncome: number
  longTermCapGains: number
  shortTermCapGains: number
  deductions: number
  retirementContributions: number
  stateCode: string
  filingStatus: 'single' | 'mfj'
}): TaxPosition {
  const { ordinaryIncome, selfEmploymentIncome, longTermCapGains, shortTermCapGains, deductions, retirementContributions, stateCode, filingStatus } = params

  // SE tax
  const seBase = selfEmploymentIncome * 0.9235
  const ssSE = Math.min(seBase, 176100) * 0.124
  const medSE = seBase * 0.029
  const seTax = Math.max(0, ssSE + medSE)
  const halfSE = seTax / 2

  // AGI
  const totalIncome = ordinaryIncome + selfEmploymentIncome + longTermCapGains + shortTermCapGains
  const agi = totalIncome - halfSE - retirementContributions

  // Taxable income (ordinary portion)
  const stdDed = STD_DED[filingStatus]
  const totalDeduction = Math.max(stdDed, deductions)
  const ordinaryTaxable = Math.max(0, agi - longTermCapGains - totalDeduction)

  // Federal tax on ordinary income
  const brackets = filingStatus === 'mfj' ? BRACKETS_MFJ : BRACKETS_SINGLE
  let fedTax = 0
  let remaining = ordinaryTaxable
  let prev = 0
  let marginalRate = 0.10
  for (const [max, rate] of brackets) {
    const taxable = Math.min(remaining, max - prev)
    if (taxable <= 0) break
    fedTax += taxable * rate
    marginalRate = rate
    remaining -= taxable
    prev = max
  }

  // LTCG tax
  let ltcgTax = 0
  if (longTermCapGains > 0) {
    const ltcgBrackets = LTCG_BRACKETS_SINGLE
    let ltcgRemaining = longTermCapGains
    let ltcgPrev = 0
    for (const [max, rate] of ltcgBrackets) {
      const taxable = Math.min(ltcgRemaining, max - ltcgPrev)
      if (taxable <= 0) break
      ltcgTax += taxable * rate
      ltcgRemaining -= taxable
      ltcgPrev = max
    }
  }

  fedTax += ltcgTax

  // NIIT
  const niitThreshold = filingStatus === 'mfj' ? 250000 : 200000
  const investmentIncome = longTermCapGains + shortTermCapGains
  const niit = agi > niitThreshold ? Math.min(investmentIncome, agi - niitThreshold) * 0.038 : 0

  // State tax
  const stateRate = STATE_RATES[stateCode] || 0.05
  const stateTaxable = Math.max(0, agi - totalDeduction)
  const stateTax = stateTaxable * stateRate

  const totalTax = Math.round(fedTax + stateTax + seTax + niit)
  const grossIncome = totalIncome
  const effectiveRate = grossIncome > 0 ? totalTax / grossIncome : 0

  return {
    grossIncome: Math.round(grossIncome),
    agi: Math.round(agi),
    taxableIncome: Math.round(ordinaryTaxable + longTermCapGains),
    federalTax: Math.round(fedTax),
    stateTax: Math.round(stateTax),
    seTax: Math.round(seTax),
    niit: Math.round(niit),
    totalTax,
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    marginalRate,
    stateCode,
    filingStatus,
    takeHomePay: Math.round(grossIncome - totalTax),
  }
}

// ─── Scenario Simulator ─────────────────────────────────────────────────────

export function simulate(
  baseline: {
    ordinaryIncome: number
    selfEmploymentIncome: number
    longTermCapGains: number
    shortTermCapGains: number
    deductions: number
    retirementContributions: number
    stateCode: string
    filingStatus: 'single' | 'mfj'
  },
  scenario: SimulationScenario,
): SimulationResult {
  const before = calcPosition(baseline)
  const modified = { ...baseline }
  let scenarioName = ''
  let description = ''
  const warnings: string[] = []
  const cascadeEffects: CascadeEffect[] = []

  switch (scenario.type) {
    case 'sell_crypto':
    case 'sell_stock': {
      const gain = scenario.amount - scenario.costBasis
      const asset = scenario.type === 'sell_crypto' ? 'crypto' : 'stock'
      scenarioName = `Sell $${scenario.amount.toLocaleString()} of ${asset}`
      description = `${scenario.holdingPeriod === 'long' ? 'Long-term' : 'Short-term'} ${gain >= 0 ? 'gain' : 'loss'} of $${Math.abs(gain).toLocaleString()}`

      if (scenario.holdingPeriod === 'long') {
        modified.longTermCapGains += gain
      } else {
        modified.shortTermCapGains += gain
      }

      if (gain > 0) {
        cascadeEffects.push({ name: 'NIIT', description: 'May trigger 3.8% Net Investment Income Tax', impact: gain * 0.038, direction: 'negative' })
      }
      if (scenario.holdingPeriod === 'short' && gain > 0) {
        warnings.push(`Short-term gains taxed at ordinary income rates (up to 37%). Consider holding ${Math.max(0, 366 - 180)} more days for long-term treatment.`)
      }
      break
    }

    case 'retirement_contribution': {
      scenarioName = `Contribute $${scenario.amount.toLocaleString()} to ${scenario.accountType.replace('_', ' ').toUpperCase()}`
      
      if (scenario.accountType === 'roth_ira') {
        description = 'Roth contributions are after-tax — no current deduction but tax-free growth.'
        warnings.push('Roth contribution does not reduce current-year taxes.')
      } else {
        description = `Pre-tax contribution reduces taxable income by $${scenario.amount.toLocaleString()}`
        modified.retirementContributions += scenario.amount
        
        cascadeEffects.push({ name: 'AGI Reduction', description: 'Lower AGI may unlock other deductions/credits', impact: -scenario.amount, direction: 'positive' })
        if (scenario.accountType === 'hsa') {
          cascadeEffects.push({ name: 'HSA Triple Tax Benefit', description: 'Pre-tax in, tax-free growth, tax-free qualified withdrawals', impact: 0, direction: 'positive' })
        }
      }
      break
    }

    case 'relocate_state': {
      scenarioName = `Relocate from ${baseline.stateCode} to ${scenario.newState}`
      modified.stateCode = scenario.newState
      const oldRate = STATE_RATES[baseline.stateCode] || 0.05
      const newRate = STATE_RATES[scenario.newState] || 0.05
      description = `State tax rate change: ${(oldRate * 100).toFixed(1)}% → ${(newRate * 100).toFixed(1)}%`
      
      if (newRate === 0) {
        cascadeEffects.push({ name: 'Zero State Tax', description: 'No state income tax in new state', impact: 0, direction: 'positive' })
      }
      if (scenario.newState === 'CA') {
        warnings.push('California does not conform to §199A QBI deduction and taxes capital gains as ordinary income.')
      }
      break
    }

    case 'scorp_conversion': {
      const currentSE = scenario.currentNetIncome * 0.9235 * 0.153
      const newSE = scenario.proposedSalary * 0.9235 * 0.153
      const seSavings = currentSE - newSE

      scenarioName = `Convert to S-Corp (salary: $${scenario.proposedSalary.toLocaleString()})`
      description = `SE tax savings of ~$${Math.round(seSavings).toLocaleString()}/year`

      // Move income from SE to ordinary
      modified.selfEmploymentIncome -= (scenario.currentNetIncome - scenario.proposedSalary)
      modified.ordinaryIncome += (scenario.currentNetIncome - scenario.proposedSalary) // distributions

      cascadeEffects.push({ name: 'SE Tax Savings', description: 'Distributions not subject to self-employment tax', impact: -seSavings, direction: 'positive' })
      cascadeEffects.push({ name: 'Compliance Costs', description: 'Payroll, 1120-S filing, state fees (~$3,500/year)', impact: 3500, direction: 'negative' })
      
      const salaryRatio = scenario.proposedSalary / scenario.currentNetIncome
      if (salaryRatio < 0.35) {
        warnings.push(`Salary is only ${(salaryRatio * 100).toFixed(0)}% of net income. IRS may challenge as too low. Recommend 40-50%+.`)
      }
      break
    }

    case 'equipment_purchase': {
      scenarioName = `Buy $${scenario.amount.toLocaleString()} equipment (${scenario.method.replace('_', ' ')})`
      let deduction = 0
      
      if (scenario.method === 'section_179') {
        deduction = Math.min(scenario.amount, 1250000) // 2025 limit
        description = `Full §179 deduction of $${deduction.toLocaleString()} in year 1`
      } else if (scenario.method === 'bonus_depreciation') {
        deduction = scenario.amount * 0.60 // 60% in 2025 (phasing down)
        description = `60% bonus depreciation: $${Math.round(deduction).toLocaleString()} year 1`
        warnings.push('Bonus depreciation phases down: 60% (2025), 40% (2026), 20% (2027), 0% (2028)')
      } else {
        deduction = scenario.amount / 5 // 5-year MACRS simplified
        description = `Standard depreciation: $${Math.round(deduction).toLocaleString()}/year over 5 years`
      }

      modified.deductions += deduction
      cascadeEffects.push({ name: 'QBI Impact', description: 'Lower business income reduces QBI deduction basis', impact: deduction * 0.2 * 0.24, direction: 'negative' })
      break
    }

    case 'hire_contractor': {
      scenarioName = `Hire contractor ($${scenario.annualCost.toLocaleString()}/year)`
      description = `Deductible business expense on Schedule C Line 11`
      modified.selfEmploymentIncome -= scenario.annualCost

      cascadeEffects.push({ name: 'SE Tax Reduction', description: 'Lower SE income = lower SE tax', impact: -scenario.annualCost * 0.153, direction: 'positive' })
      cascadeEffects.push({ name: '1099-NEC Required', description: 'Must issue 1099-NEC if paying $600+ to individual', impact: 0, direction: 'neutral' })
      break
    }

    case 'additional_income': {
      scenarioName = `Add $${scenario.amount.toLocaleString()} ${scenario.incomeType} income`
      description = `Impact of additional ${scenario.incomeType.replace('_', ' ')} income on tax position`

      switch (scenario.incomeType) {
        case 'w2': modified.ordinaryIncome += scenario.amount; break
        case 'self_employment': modified.selfEmploymentIncome += scenario.amount; break
        case 'investment': modified.longTermCapGains += scenario.amount; break
        case 'rental': modified.ordinaryIncome += scenario.amount; break
      }

      if (scenario.incomeType === 'self_employment') {
        cascadeEffects.push({ name: 'SE Tax', description: 'Self-employment income subject to 15.3% SE tax', impact: scenario.amount * 0.153, direction: 'negative' })
      }
      break
    }

    case 'charitable_donation': {
      scenarioName = `Donate $${scenario.amount.toLocaleString()} (${scenario.donationType.replace('_', ' ')})`
      
      if (scenario.donationType === 'cash') {
        modified.deductions += scenario.amount
        description = `Cash donation deduction of $${scenario.amount.toLocaleString()}`
      } else {
        modified.deductions += scenario.amount
        description = `Donate appreciated ${scenario.donationType.includes('crypto') ? 'crypto' : 'stock'} — deduct FMV and avoid capital gains tax`
        cascadeEffects.push({ name: 'Avoid Capital Gains', description: 'No tax on appreciation of donated asset', impact: -scenario.amount * 0.15, direction: 'positive' })
      }
      
      const agiLimit = before.agi * (scenario.donationType === 'cash' ? 0.60 : 0.30)
      if (scenario.amount > agiLimit) {
        warnings.push(`Donation exceeds AGI limitation (${scenario.donationType === 'cash' ? '60%' : '30%'} of AGI). Excess carries forward 5 years.`)
      }
      break
    }

    case 'roth_conversion': {
      scenarioName = `Roth Conversion: $${scenario.amount.toLocaleString()}`
      description = 'Convert traditional IRA/401k to Roth — pay tax now for tax-free growth'
      modified.ordinaryIncome += scenario.amount
      
      warnings.push('Conversion amount is added to ordinary income. Consider spreading over multiple years.')
      cascadeEffects.push({ name: 'Future Tax-Free Growth', description: 'All Roth earnings grow tax-free forever', impact: 0, direction: 'positive' })
      cascadeEffects.push({ name: 'No RMDs', description: 'Roth IRAs have no required minimum distributions', impact: 0, direction: 'positive' })
      break
    }

    case 'take_distribution': {
      scenarioName = `Take $${scenario.amount.toLocaleString()} ${scenario.entityType.replace('_', ' ')} distribution`
      
      if (scenario.entityType === 's_corp') {
        modified.ordinaryIncome += scenario.amount // already paid salary, distribution just comes through
        description = 'S-Corp distribution — not subject to SE tax but taxed as ordinary income'
      } else if (scenario.entityType === 'c_corp_dividend') {
        modified.longTermCapGains += scenario.amount // qualified dividends taxed at cap gains rate
        description = 'Qualified dividend — taxed at preferential long-term capital gains rate'
        warnings.push('C-Corp dividends are double-taxed: once at corporate level (21%) and again at individual level.')
      } else {
        modified.selfEmploymentIncome += scenario.amount
        description = 'Partnership distribution — subject to self-employment tax'
      }
      break
    }
  }

  const after = calcPosition(modified)

  return {
    scenarioName,
    description,
    before,
    after,
    taxDelta: after.totalTax - before.totalTax,
    effectiveRateDelta: after.effectiveRate - before.effectiveRate,
    marginalRateDelta: after.marginalRate - before.marginalRate,
    takeHomeDelta: after.takeHomePay - before.takeHomePay,
    warnings,
    cascadeEffects,
    recommendation: after.totalTax < before.totalTax
      ? `This scenario saves $${Math.abs(after.totalTax - before.totalTax).toLocaleString()} in taxes.`
      : after.totalTax > before.totalTax
      ? `This scenario increases taxes by $${(after.totalTax - before.totalTax).toLocaleString()}.`
      : 'This scenario has no net tax impact.',
  }
}

// ─── Batch Comparison ───────────────────────────────────────────────────────

export function compareScenarios(
  baseline: Parameters<typeof simulate>[0],
  scenarios: SimulationScenario[],
): SimulationResult[] {
  return scenarios
    .map(s => simulate(baseline, s))
    .sort((a, b) => a.taxDelta - b.taxDelta) // best savings first
}
