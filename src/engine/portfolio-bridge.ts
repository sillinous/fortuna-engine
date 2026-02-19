/**
 * Fortuna Engine — Portfolio Bridge
 *
 * Central integration layer between Portfolio Intelligence (localStorage)
 * and all engine modules (tax calculator, strategy detector, proactive alerts,
 * AI context, health score, CPA export, scenario modeler, unified intelligence).
 *
 * UIF L3 (Shared Services): Asset valuation, tax classification, risk scoring
 * UIF L4 (Events): Position changes, tax event triggers
 */

import { STATE_TAX_RATES } from './tax-calculator'

// ─── Types (mirror PortfolioIntelligence.tsx but importable by engines) ──────

export type AssetClass = 'crypto' | 'defi' | 'nft' | 'equity' | 'commodity' | 'real_estate' | 'speculative' | 'other'
export type PositionStatus = 'active' | 'pending' | 'exited' | 'locked' | 'staking'
export type TaxTreatment = 'ordinary_income' | 'short_term_cg' | 'long_term_cg' | 'mining_income' | 'airdrop' | 'staking_reward' | 'unknown'

export interface PortfolioPosition {
  id: string
  name: string
  ticker?: string
  assetClass: AssetClass
  status: PositionStatus
  quantity: number
  costBasis: number
  currentValue: number
  acquiredDate?: string
  notes: string
  taxTreatment: TaxTreatment
  tags: string[]
  riskScore: number
  chain?: string
  wallet?: string
  isLocked?: boolean
  unlockDate?: string
  sourceEnvelope?: string
}

export interface OpportunityAnalysis {
  id: string
  title: string
  summary: string
  status: 'watching' | 'researching' | 'ready' | 'active' | 'exited' | 'passed'
  estimatedValue: number
  confidence: number
  timeHorizon: string
  taxImplications: string
  actionItems: string[]
  sourceRef?: string
  created: string
  tags: string[]
}

export interface TaxEvent {
  id: string
  type: 'airdrop' | 'tge' | 'vest' | 'sale' | 'conversion' | 'staking_reward' | 'mining' | 'income' | 'loss'
  description: string
  estimatedAmount: number
  taxTreatment: TaxTreatment
  expectedDate?: string
  realized: boolean
  positionId?: string
  notes: string
}

export interface PortfolioData {
  positions: PortfolioPosition[]
  opportunities: OpportunityAnalysis[]
  taxEvents: TaxEvent[]
  envelopeHistory: { imported: string; source: string; positionCount: number; date: string }[]
}

// ─── Storage Access ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'fortuna:portfolio-intelligence'

export function getPortfolioData(): PortfolioData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return { positions: [], opportunities: [], taxEvents: [], envelopeHistory: [] }
}

export function hasPortfolioData(): boolean {
  const data = getPortfolioData()
  return data.positions.length > 0 || data.taxEvents.length > 0 || data.opportunities.length > 0
}

// ─── Computed Aggregates (UIF L3 — Shared Services) ─────────────────────────

export interface PortfolioSummary {
  // Position totals
  activePositionCount: number
  totalValue: number
  totalCostBasis: number
  unrealizedGainLoss: number
  unrealizedGainLossPct: number

  // By asset class
  allocationByClass: Record<AssetClass, { count: number; value: number; pct: number }>

  // Capital gains breakdown
  shortTermGains: number   // positions held < 1 year with gains
  longTermGains: number    // positions held >= 1 year with gains
  shortTermLosses: number
  longTermLosses: number
  netCapitalGains: number

  // Income from portfolio (ordinary income items)
  ordinaryIncomeFromPortfolio: number  // airdrops, mining, staking
  stakingRewards: number
  airdropIncome: number
  miningIncome: number

  // Tax events
  pendingTaxEvents: number
  estimatedTaxableFromEvents: number

  // Opportunities
  activeOpportunities: number
  watchingOpportunities: number
  totalPipelineValue: number

  // Risk
  avgRiskScore: number
  highRiskPositionCount: number
  highRiskExposure: number
  concentrationRisk: number  // largest position as % of total

  // Holding periods
  positionsNearLTCGThreshold: PortfolioPosition[]  // 10-12 months held
  positionsAtLTCGRate: number

  // Tax-loss harvesting candidates
  harvestCandidates: { position: PortfolioPosition; loss: number; treatment: 'short_term' | 'long_term' }[]

  // Wash sale warnings
  recentExits: PortfolioPosition[]  // exited in last 30 days
}

export function computePortfolioSummary(data?: PortfolioData): PortfolioSummary {
  const portfolio = data || getPortfolioData()
  const active = portfolio.positions.filter(p => p.status !== 'exited')
  const totalValue = active.reduce((s, p) => s + p.currentValue, 0)
  const totalCostBasis = active.reduce((s, p) => s + p.costBasis, 0)

  // Allocation by class
  const allocationByClass = {} as Record<AssetClass, { count: number; value: number; pct: number }>
  const classes: AssetClass[] = ['crypto', 'defi', 'nft', 'equity', 'commodity', 'real_estate', 'speculative', 'other']
  for (const cls of classes) {
    const positions = active.filter(p => p.assetClass === cls)
    const value = positions.reduce((s, p) => s + p.currentValue, 0)
    allocationByClass[cls] = { count: positions.length, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }
  }

  // Capital gains analysis by holding period
  const now = new Date()
  let shortTermGains = 0, longTermGains = 0, shortTermLosses = 0, longTermLosses = 0

  const harvestCandidates: PortfolioSummary['harvestCandidates'] = []
  const positionsNearLTCGThreshold: PortfolioPosition[] = []
  let positionsAtLTCGRate = 0

  for (const pos of active) {
    const gl = pos.currentValue - pos.costBasis
    const monthsHeld = pos.acquiredDate
      ? (now.getTime() - new Date(pos.acquiredDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
      : (pos.taxTreatment === 'long_term_cg' ? 13 : 6) // default assumption

    const isLongTerm = monthsHeld >= 12 || pos.taxTreatment === 'long_term_cg'

    if (isLongTerm) {
      positionsAtLTCGRate++
      if (gl >= 0) longTermGains += gl
      else longTermLosses += Math.abs(gl)
    } else {
      if (gl >= 0) shortTermGains += gl
      else shortTermLosses += Math.abs(gl)
    }

    // Near LTCG threshold (10-12 months)
    if (monthsHeld >= 10 && monthsHeld < 12) {
      positionsNearLTCGThreshold.push(pos)
    }

    // Tax-loss harvesting candidates (unrealized losses > $100)
    if (gl < -100 && pos.status === 'active') {
      harvestCandidates.push({
        position: pos,
        loss: Math.abs(gl),
        treatment: isLongTerm ? 'long_term' : 'short_term',
      })
    }
  }

  // Ordinary income from portfolio
  let stakingRewards = 0, airdropIncome = 0, miningIncome = 0
  for (const pos of active) {
    if (pos.taxTreatment === 'staking_reward') stakingRewards += pos.currentValue
    else if (pos.taxTreatment === 'airdrop') airdropIncome += pos.currentValue
    else if (pos.taxTreatment === 'mining_income') miningIncome += pos.currentValue
  }
  const ordinaryIncomeFromPortfolio = stakingRewards + airdropIncome + miningIncome

  // Tax events
  const pendingEvents = portfolio.taxEvents.filter(e => !e.realized)
  const estimatedTaxableFromEvents = pendingEvents.reduce((s, e) => s + e.estimatedAmount, 0)

  // Opportunities
  const activeOpps = portfolio.opportunities.filter(o => o.status === 'active')
  const watchingOpps = portfolio.opportunities.filter(o => o.status === 'watching' || o.status === 'researching')
  const totalPipelineValue = portfolio.opportunities
    .filter(o => !['exited', 'passed'].includes(o.status))
    .reduce((s, o) => s + o.estimatedValue * (o.confidence / 100), 0)

  // Risk
  const avgRiskScore = active.length > 0 ? active.reduce((s, p) => s + p.riskScore, 0) / active.length : 0
  const highRisk = active.filter(p => p.riskScore >= 7)
  const largestPosition = active.reduce((max, p) => p.currentValue > max ? p.currentValue : max, 0)
  const concentrationRisk = totalValue > 0 ? (largestPosition / totalValue) * 100 : 0

  // Wash sale: recently exited positions
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recentExits = portfolio.positions.filter(p => p.status === 'exited')
    // In a full implementation, we'd check the exit date. For now flag all exited positions.

  // Sort harvest candidates by loss (largest first)
  harvestCandidates.sort((a, b) => b.loss - a.loss)

  return {
    activePositionCount: active.length,
    totalValue,
    totalCostBasis,
    unrealizedGainLoss: totalValue - totalCostBasis,
    unrealizedGainLossPct: totalCostBasis > 0 ? ((totalValue - totalCostBasis) / totalCostBasis) * 100 : 0,
    allocationByClass,
    shortTermGains, longTermGains, shortTermLosses, longTermLosses,
    netCapitalGains: (shortTermGains + longTermGains) - (shortTermLosses + longTermLosses),
    ordinaryIncomeFromPortfolio, stakingRewards, airdropIncome, miningIncome,
    pendingTaxEvents: pendingEvents.length,
    estimatedTaxableFromEvents,
    activeOpportunities: activeOpps.length,
    watchingOpportunities: watchingOpps.length,
    totalPipelineValue,
    avgRiskScore,
    highRiskPositionCount: highRisk.length,
    highRiskExposure: highRisk.reduce((s, p) => s + p.currentValue, 0),
    concentrationRisk,
    positionsNearLTCGThreshold,
    positionsAtLTCGRate,
    harvestCandidates,
    recentExits,
  }
}

// ─── Tax Integration Helpers (feed into tax-calculator) ─────────────────────

/** Returns additional income that should be added to tax calculations from portfolio */
export function getPortfolioTaxIncome(stateCode: string): {
  additionalOrdinaryIncome: number   // airdrops, staking, mining
  shortTermCapGains: number
  longTermCapGains: number
  capitalLosses: number
  netInvestmentIncome: number        // for NIIT calculation
  estimatedCapGainsTax: number
  estimatedOrdinaryTax: number
} {
  const summary = computePortfolioSummary()
  const stateRate = STATE_TAX_RATES[stateCode]?.rate || 0

  // Ordinary income additions (taxed at marginal rate)
  const additionalOrdinaryIncome = summary.ordinaryIncomeFromPortfolio

  // Capital gains (net)
  const shortTermCapGains = Math.max(0, summary.shortTermGains - summary.shortTermLosses)
  const longTermCapGains = Math.max(0, summary.longTermGains - summary.longTermLosses)

  // Capital loss deduction (max $3,000/yr, carry forward)
  const totalLosses = summary.shortTermLosses + summary.longTermLosses
  const totalGains = summary.shortTermGains + summary.longTermGains
  const capitalLosses = Math.min(3000, Math.max(0, totalLosses - totalGains))

  // Net investment income (for NIIT — 3.8% on investment income over $200k)
  const netInvestmentIncome = shortTermCapGains + longTermCapGains + additionalOrdinaryIncome

  // Estimated taxes
  const estimatedCapGainsTax = (shortTermCapGains * (0.24 + stateRate)) + (longTermCapGains * (0.15 + stateRate))
  const estimatedOrdinaryTax = additionalOrdinaryIncome * (0.24 + stateRate)

  return {
    additionalOrdinaryIncome,
    shortTermCapGains,
    longTermCapGains,
    capitalLosses,
    netInvestmentIncome,
    estimatedCapGainsTax,
    estimatedOrdinaryTax,
  }
}

// ─── Strategy Helpers ───────────────────────────────────────────────────────

/** Returns portfolio-based strategy opportunities */
export function getPortfolioStrategies(marginalRate: number): {
  id: string
  title: string
  impact: number
  priority: 'critical' | 'high' | 'medium' | 'low'
  description: string
  steps: string[]
  category: string
}[] {
  const summary = computePortfolioSummary()
  const strategies: ReturnType<typeof getPortfolioStrategies> = []

  // Tax-loss harvesting
  if (summary.harvestCandidates.length > 0) {
    const totalHarvestable = summary.harvestCandidates.reduce((s, c) => s + c.loss, 0)
    const taxSavings = Math.min(totalHarvestable, summary.shortTermGains + summary.longTermGains + 3000) * marginalRate
    strategies.push({
      id: 'portfolio-tlh',
      title: 'Tax-Loss Harvesting Opportunity',
      impact: Math.round(taxSavings),
      priority: taxSavings > 2000 ? 'critical' : taxSavings > 500 ? 'high' : 'medium',
      description: `${summary.harvestCandidates.length} position(s) with $${Math.round(totalHarvestable).toLocaleString()} in unrealized losses. Selling these offsets capital gains and up to $3,000 in ordinary income.`,
      steps: [
        `Identify ${summary.harvestCandidates.length} positions with unrealized losses`,
        'Sell losing positions before year-end to realize losses',
        'Use losses to offset capital gains, then up to $3,000 ordinary income',
        'Wait 31+ days before repurchasing same asset (wash sale rule)',
        'Carry forward excess losses to future years',
      ],
      category: 'investment',
    })
  }

  // Holding period optimization
  if (summary.positionsNearLTCGThreshold.length > 0) {
    const positions = summary.positionsNearLTCGThreshold
    const totalGains = positions.reduce((s, p) => s + Math.max(0, p.currentValue - p.costBasis), 0)
    const rateDiff = marginalRate - 0.15 // difference between ordinary and LTCG rate
    const savings = Math.round(totalGains * rateDiff)

    if (savings > 100) {
      strategies.push({
        id: 'portfolio-ltcg-wait',
        title: 'Hold for Long-Term Capital Gains Rate',
        impact: savings,
        priority: savings > 3000 ? 'critical' : savings > 1000 ? 'high' : 'medium',
        description: `${positions.length} position(s) approaching 1-year holding period. Waiting saves ${Math.round(rateDiff * 100)}% on $${Math.round(totalGains).toLocaleString()} in gains.`,
        steps: positions.map(p => {
          const daysToLTCG = p.acquiredDate
            ? Math.max(0, 365 - Math.floor((Date.now() - new Date(p.acquiredDate).getTime()) / (1000 * 60 * 60 * 24)))
            : 60
          return `${p.name}: Hold ${daysToLTCG} more days to qualify for 15% LTCG rate`
        }),
        category: 'investment',
      })
    }
  }

  // Concentration risk
  if (summary.concentrationRisk > 50 && summary.totalValue > 10000) {
    strategies.push({
      id: 'portfolio-concentration',
      title: 'Portfolio Concentration Risk',
      impact: 0,
      priority: summary.concentrationRisk > 80 ? 'high' : 'medium',
      description: `Single position represents ${summary.concentrationRisk.toFixed(0)}% of portfolio. Consider diversifying to reduce risk.`,
      steps: [
        'Identify tax-efficient exit strategy for concentrated position',
        'Consider incremental sales spread across tax years',
        'Evaluate covered calls or protective puts for hedging',
        'Reinvest into diversified positions',
      ],
      category: 'risk',
    })
  }

  // Staking/mining income not structured through entity
  if (summary.stakingRewards + summary.miningIncome > 5000) {
    const seAmount = summary.stakingRewards + summary.miningIncome
    const seTax = Math.round(seAmount * 0.153)
    strategies.push({
      id: 'portfolio-staking-entity',
      title: 'Structure Staking/Mining Through Entity',
      impact: Math.round(seTax * 0.4),
      priority: seAmount > 20000 ? 'high' : 'medium',
      description: `$${seAmount.toLocaleString()} in staking/mining income may be subject to SE tax. Structuring through an LLC with S-Corp election could save on self-employment taxes.`,
      steps: [
        'Determine if staking income is treated as SE income in your jurisdiction',
        'If SE-taxable, consider LLC formation for liability protection',
        'At $50k+ annual staking income, evaluate S-Corp election for SE tax savings',
        'Track all staking rewards at FMV on date received',
      ],
      category: 'entity',
    })
  }

  // Large unrealized gains — year-end planning
  const now = new Date()
  if (now.getMonth() >= 9 && summary.unrealizedGainLoss > 10000) {
    strategies.push({
      id: 'portfolio-yearend',
      title: 'Year-End Gain/Loss Planning',
      impact: Math.round(summary.unrealizedGainLoss * 0.05),
      priority: 'high',
      description: `$${Math.round(summary.unrealizedGainLoss).toLocaleString()} in unrealized gains. Q4 is the window to strategically realize gains/losses to optimize your tax bracket.`,
      steps: [
        'Review all positions for gain/loss harvesting opportunities',
        'Offset gains with losses to reduce tax liability',
        'Consider realizing gains that fall within lower tax brackets',
        'Defer large gains to next year if expecting lower income',
        'Complete all trades by Dec 31 for current year treatment',
      ],
      category: 'tax',
    })
  }

  // Pending TGE/airdrop events — estimated tax impact
  const portfolio = getPortfolioData()
  const pendingTGEs = portfolio.taxEvents.filter(e => !e.realized && (e.type === 'tge' || e.type === 'airdrop') && e.estimatedAmount > 0)
  if (pendingTGEs.length > 0) {
    const totalTGEValue = pendingTGEs.reduce((s, e) => s + e.estimatedAmount, 0)
    const taxOnTGE = Math.round(totalTGEValue * marginalRate)
    strategies.push({
      id: 'portfolio-tge-prep',
      title: 'Prepare for TGE/Airdrop Tax Events',
      impact: taxOnTGE,
      priority: taxOnTGE > 5000 ? 'critical' : 'high',
      description: `${pendingTGEs.length} pending TGE/airdrop event(s) worth ~$${totalTGEValue.toLocaleString()}. These are taxed as ordinary income at FMV on receipt (~$${taxOnTGE.toLocaleString()} tax liability).`,
      steps: [
        'Set aside estimated tax: ' + pendingTGEs.map(e => `${e.description}: ~$${Math.round(e.estimatedAmount * marginalRate).toLocaleString()}`).join(', '),
        'Document FMV at exact time of receipt (screenshot exchange price)',
        'Track as ordinary income for the tax year received',
        'Consider selling portion immediately to cover tax liability',
        'File estimated quarterly taxes if liability exceeds $1,000',
      ],
      category: 'tax',
    })
  }

  // High overall risk score
  if (summary.avgRiskScore > 7 && summary.activePositionCount > 2) {
    strategies.push({
      id: 'portfolio-risk-rebalance',
      title: 'Rebalance High-Risk Portfolio',
      impact: 0,
      priority: 'medium',
      description: `Average risk score is ${summary.avgRiskScore.toFixed(1)}/10 across ${summary.activePositionCount} positions. Consider balancing with lower-risk assets.`,
      steps: [
        'Audit highest-risk positions for continued conviction',
        'Set stop-loss levels for speculative positions',
        'Allocate portion to stable yield or index positions',
        'Document investment thesis for each high-risk position',
      ],
      category: 'risk',
    })
  }

  return strategies
}

// ─── Proactive Alert Helpers ────────────────────────────────────────────────

export interface PortfolioAlert {
  id: string
  title: string
  message: string
  severity: 'urgent' | 'warning' | 'opportunity' | 'info'
  category: string
  impact?: number
  actionView: string
}

export function getPortfolioAlerts(): PortfolioAlert[] {
  const summary = computePortfolioSummary()
  const portfolio = getPortfolioData()
  const alerts: PortfolioAlert[] = []

  // LTCG threshold approaching
  for (const pos of summary.positionsNearLTCGThreshold) {
    const daysTo = pos.acquiredDate
      ? Math.max(0, 365 - Math.floor((Date.now() - new Date(pos.acquiredDate).getTime()) / (1000 * 60 * 60 * 24)))
      : 30
    const gain = pos.currentValue - pos.costBasis
    if (gain > 0) {
      alerts.push({
        id: `ltcg-${pos.id}`,
        title: `${pos.name}: ${daysTo} days to LTCG rate`,
        message: `Hold ${daysTo} more days to save ~${Math.round(gain * 0.09)}% on $${Math.round(gain).toLocaleString()} gain by qualifying for long-term capital gains rate.`,
        severity: daysTo <= 14 ? 'urgent' : 'warning',
        category: 'tax',
        impact: Math.round(gain * 0.09),
        actionView: 'portfolio',
      })
    }
  }

  // Large unrealized losses (harvesting opportunity)
  if (summary.harvestCandidates.length > 0) {
    const total = summary.harvestCandidates.reduce((s, c) => s + c.loss, 0)
    alerts.push({
      id: 'tlh-opportunity',
      title: `Tax-loss harvesting: $${Math.round(total).toLocaleString()} available`,
      message: `${summary.harvestCandidates.length} position(s) with unrealized losses. Harvest before year-end to offset gains.`,
      severity: 'opportunity',
      category: 'tax',
      impact: Math.round(total * 0.24),
      actionView: 'portfolio',
    })
  }

  // Pending TGE events approaching
  for (const evt of portfolio.taxEvents.filter(e => !e.realized && e.expectedDate)) {
    const daysUntil = Math.floor((new Date(evt.expectedDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntil >= 0 && daysUntil <= 30) {
      alerts.push({
        id: `event-${evt.id}`,
        title: `${evt.description}: ${daysUntil} days away`,
        message: `Estimated ${evt.estimatedAmount > 0 ? '$' + evt.estimatedAmount.toLocaleString() : 'TBD'} taxable event. Prepare by setting aside estimated taxes and documenting FMV.`,
        severity: daysUntil <= 7 ? 'urgent' : 'warning',
        category: 'tax',
        impact: evt.estimatedAmount,
        actionView: 'portfolio',
      })
    }
  }

  // Concentration risk
  if (summary.concentrationRisk > 60 && summary.totalValue > 5000) {
    alerts.push({
      id: 'concentration-risk',
      title: `Portfolio concentration: ${summary.concentrationRisk.toFixed(0)}% in single position`,
      message: 'High concentration risk. Consider diversifying to protect against significant loss in any single asset.',
      severity: summary.concentrationRisk > 80 ? 'warning' : 'info',
      category: 'risk',
      actionView: 'portfolio',
    })
  }

  // Quarterly estimated tax reminder for portfolio income
  const qTaxIncome = summary.ordinaryIncomeFromPortfolio + summary.shortTermGains
  if (qTaxIncome > 4000) {
    const now = new Date()
    const quarterDeadlines = [
      { q: 'Q1', month: 3, day: 15 },
      { q: 'Q2', month: 5, day: 15 },
      { q: 'Q3', month: 8, day: 15 },
      { q: 'Q4', month: 0, day: 15 },
    ]
    for (const dl of quarterDeadlines) {
      const deadline = new Date(now.getFullYear() + (dl.month === 0 ? 1 : 0), dl.month, dl.day)
      const daysUntil = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntil > 0 && daysUntil <= 21) {
        alerts.push({
          id: `portfolio-est-tax-${dl.q}`,
          title: `${dl.q} estimated tax due in ${daysUntil} days`,
          message: `Portfolio income of ~$${Math.round(qTaxIncome).toLocaleString()} may require estimated quarterly payment to avoid underpayment penalty.`,
          severity: daysUntil <= 7 ? 'urgent' : 'warning',
          category: 'deadline',
          actionView: 'portfolio',
        })
        break // only show nearest deadline
      }
    }
  }

  return alerts
}

// ─── AI Context Builder ─────────────────────────────────────────────────────

export function buildPortfolioAIContext(): string {
  const summary = computePortfolioSummary()
  const portfolio = getPortfolioData()

  if (summary.activePositionCount === 0 && portfolio.opportunities.length === 0) {
    return ''
  }

  const lines: string[] = [
    '\n════════════════════════════════════════════════════════',
    'PORTFOLIO INTELLIGENCE',
    '════════════════════════════════════════════════════════',
    `Active Positions: ${summary.activePositionCount}`,
    `Total Portfolio Value: $${Math.round(summary.totalValue).toLocaleString()}`,
    `Total Cost Basis: $${Math.round(summary.totalCostBasis).toLocaleString()}`,
    `Unrealized Gain/Loss: ${summary.unrealizedGainLoss >= 0 ? '+' : ''}$${Math.round(summary.unrealizedGainLoss).toLocaleString()} (${summary.unrealizedGainLossPct.toFixed(1)}%)`,
    '',
    'CAPITAL GAINS EXPOSURE:',
    `  Short-term gains: $${Math.round(summary.shortTermGains).toLocaleString()} (taxed at ordinary rates)`,
    `  Long-term gains: $${Math.round(summary.longTermGains).toLocaleString()} (taxed at 0/15/20%)`,
    `  Unrealized losses: $${Math.round(summary.shortTermLosses + summary.longTermLosses).toLocaleString()} (harvestable)`,
    `  Net capital gains: $${Math.round(summary.netCapitalGains).toLocaleString()}`,
    '',
    'PORTFOLIO INCOME (Ordinary):',
    `  Staking rewards: $${Math.round(summary.stakingRewards).toLocaleString()}`,
    `  Airdrop income: $${Math.round(summary.airdropIncome).toLocaleString()}`,
    `  Mining income: $${Math.round(summary.miningIncome).toLocaleString()}`,
    `  Total: $${Math.round(summary.ordinaryIncomeFromPortfolio).toLocaleString()}/year`,
  ]

  // Positions detail
  if (portfolio.positions.length > 0) {
    lines.push('', 'POSITIONS:')
    for (const pos of portfolio.positions.filter(p => p.status !== 'exited').slice(0, 15)) {
      const gl = pos.currentValue - pos.costBasis
      lines.push(`  - ${pos.name}${pos.ticker ? ' (' + pos.ticker + ')' : ''}: $${Math.round(pos.currentValue).toLocaleString()} | ${gl >= 0 ? '+' : ''}$${Math.round(gl).toLocaleString()} | ${pos.assetClass} | Risk: ${pos.riskScore}/10 | Tax: ${pos.taxTreatment.replace(/_/g, ' ')}`)
    }
  }

  // Tax events
  const pendingEvents = portfolio.taxEvents.filter(e => !e.realized)
  if (pendingEvents.length > 0) {
    lines.push('', 'PENDING TAX EVENTS:')
    for (const evt of pendingEvents) {
      lines.push(`  - ${evt.description}: ~$${Math.round(evt.estimatedAmount).toLocaleString()} (${evt.taxTreatment.replace(/_/g, ' ')})${evt.expectedDate ? ' — expected ' + evt.expectedDate : ''}`)
    }
  }

  // Opportunities
  const activeOpps = portfolio.opportunities.filter(o => !['exited', 'passed'].includes(o.status))
  if (activeOpps.length > 0) {
    lines.push('', 'OPPORTUNITY PIPELINE:')
    for (const opp of activeOpps.slice(0, 8)) {
      lines.push(`  - ${opp.title}: ${opp.status} | ~$${Math.round(opp.estimatedValue).toLocaleString()} at ${opp.confidence}% confidence | Tax: ${opp.taxImplications || 'TBD'}`)
    }
  }

  // Key risk indicators
  lines.push('', 'RISK PROFILE:')
  lines.push(`  Avg risk score: ${summary.avgRiskScore.toFixed(1)}/10`)
  lines.push(`  High-risk positions: ${summary.highRiskPositionCount} ($${Math.round(summary.highRiskExposure).toLocaleString()})`)
  lines.push(`  Concentration: ${summary.concentrationRisk.toFixed(0)}% in largest position`)

  // Harvesting
  if (summary.harvestCandidates.length > 0) {
    lines.push('', 'TAX-LOSS HARVESTING CANDIDATES:')
    for (const c of summary.harvestCandidates.slice(0, 5)) {
      lines.push(`  - ${c.position.name}: -$${Math.round(c.loss).toLocaleString()} (${c.treatment.replace('_', '-')})`)
    }
  }

  // Holding period alerts
  if (summary.positionsNearLTCGThreshold.length > 0) {
    lines.push('', 'APPROACHING LTCG THRESHOLD:')
    for (const p of summary.positionsNearLTCGThreshold) {
      const daysTo = p.acquiredDate
        ? Math.max(0, 365 - Math.floor((Date.now() - new Date(p.acquiredDate).getTime()) / (1000 * 60 * 60 * 24)))
        : 30
      lines.push(`  - ${p.name}: ${daysTo} days until long-term rate`)
    }
  }

  return lines.join('\n')
}

// ─── Health Score Dimension ─────────────────────────────────────────────────

export function scorePortfolioHealth(): {
  score: number
  grade: string
  factors: { name: string; score: number; maxScore: number; detail: string }[]
} {
  const summary = computePortfolioSummary()

  if (summary.activePositionCount === 0) {
    return { score: -1, grade: 'N/A', factors: [] } // -1 = not applicable
  }

  const factors: { name: string; score: number; maxScore: number; detail: string }[] = []

  // Diversification (25 pts)
  const classesUsed = Object.values(summary.allocationByClass).filter(a => a.count > 0).length
  const diversScore = Math.min(25, classesUsed * 5 + (summary.concentrationRisk < 40 ? 10 : summary.concentrationRisk < 60 ? 5 : 0))
  factors.push({ name: 'Diversification', score: diversScore, maxScore: 25, detail: `${classesUsed} asset classes, ${summary.concentrationRisk.toFixed(0)}% concentration` })

  // Risk management (25 pts)
  const riskScore = summary.avgRiskScore <= 4 ? 25 : summary.avgRiskScore <= 6 ? 18 : summary.avgRiskScore <= 8 ? 10 : 5
  factors.push({ name: 'Risk Management', score: riskScore, maxScore: 25, detail: `Avg risk ${summary.avgRiskScore.toFixed(1)}/10, ${summary.highRiskPositionCount} high-risk` })

  // Tax efficiency (25 pts)
  const ltcgPct = summary.activePositionCount > 0 ? (summary.positionsAtLTCGRate / summary.activePositionCount) * 100 : 0
  const harvestUsed = summary.harvestCandidates.length === 0 ? 10 : 0
  const taxEffScore = Math.min(25, Math.round(ltcgPct / 4) + harvestUsed + (summary.pendingTaxEvents <= 2 ? 5 : 0))
  factors.push({ name: 'Tax Efficiency', score: taxEffScore, maxScore: 25, detail: `${ltcgPct.toFixed(0)}% at LTCG rate, ${summary.harvestCandidates.length} harvest candidates` })

  // Documentation / tracking (25 pts)
  const posWithBasis = summary.activePositionCount > 0
    ? portfolio().positions.filter(p => p.status !== 'exited' && p.costBasis > 0).length / summary.activePositionCount
    : 0
  const posWithDates = summary.activePositionCount > 0
    ? portfolio().positions.filter(p => p.status !== 'exited' && p.acquiredDate).length / summary.activePositionCount
    : 0
  const docScore = Math.round((posWithBasis * 12 + posWithDates * 13))
  factors.push({ name: 'Documentation', score: Math.min(25, docScore), maxScore: 25, detail: `${Math.round(posWithBasis * 100)}% with cost basis, ${Math.round(posWithDates * 100)}% with dates` })

  const total = factors.reduce((s, f) => s + f.score, 0)
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F'

  return { score: total, grade, factors }
}

function portfolio() { return getPortfolioData() }

// ─── CPA Export Helpers ─────────────────────────────────────────────────────

export interface Form8949Line {
  description: string
  dateAcquired: string
  dateSold: string
  proceeds: number
  costBasis: number
  gainLoss: number
  holdingPeriod: 'short' | 'long'
}

export function generateForm8949Data(): {
  lines: Form8949Line[]
  shortTermTotal: { proceeds: number; basis: number; gainLoss: number }
  longTermTotal: { proceeds: number; basis: number; gainLoss: number }
  netCapitalGainLoss: number
} {
  const data = getPortfolioData()
  const exited = data.positions.filter(p => p.status === 'exited')
  const lines: Form8949Line[] = []

  let stProceeds = 0, stBasis = 0, stGL = 0
  let ltProceeds = 0, ltBasis = 0, ltGL = 0

  for (const pos of exited) {
    const gl = pos.currentValue - pos.costBasis
    const isLT = pos.taxTreatment === 'long_term_cg' || (pos.acquiredDate && (Date.now() - new Date(pos.acquiredDate).getTime()) > 365 * 24 * 60 * 60 * 1000)

    const line: Form8949Line = {
      description: `${pos.name}${pos.ticker ? ' (' + pos.ticker + ')' : ''} — ${pos.quantity} units`,
      dateAcquired: pos.acquiredDate || 'Various',
      dateSold: 'Various',
      proceeds: pos.currentValue,
      costBasis: pos.costBasis,
      gainLoss: gl,
      holdingPeriod: isLT ? 'long' : 'short',
    }
    lines.push(line)

    if (isLT) { ltProceeds += pos.currentValue; ltBasis += pos.costBasis; ltGL += gl }
    else { stProceeds += pos.currentValue; stBasis += pos.costBasis; stGL += gl }
  }

  return {
    lines,
    shortTermTotal: { proceeds: stProceeds, basis: stBasis, gainLoss: stGL },
    longTermTotal: { proceeds: ltProceeds, basis: ltBasis, gainLoss: ltGL },
    netCapitalGainLoss: stGL + ltGL,
  }
}

// ─── Scenario Modeler Helpers ───────────────────────────────────────────────

/** Generate smart scenarios from portfolio positions */
export function getPortfolioScenarios(): {
  name: string
  description: string
  icon: string
  additionalIncome: number
  additionalDeduction: number
  capitalGains: { shortTerm: number; longTerm: number }
}[] {
  const summary = computePortfolioSummary()
  const data = getPortfolioData()
  const scenarios: ReturnType<typeof getPortfolioScenarios> = []

  // "Sell all positions" scenario
  if (summary.totalValue > 1000) {
    scenarios.push({
      name: 'Liquidate Portfolio',
      description: `Sell all ${summary.activePositionCount} positions for $${Math.round(summary.totalValue).toLocaleString()}`,
      icon: '💰',
      additionalIncome: summary.ordinaryIncomeFromPortfolio,
      additionalDeduction: 0,
      capitalGains: { shortTerm: summary.shortTermGains - summary.shortTermLosses, longTerm: summary.longTermGains - summary.longTermLosses },
    })
  }

  // "TGE happens" scenario
  const tgeEvents = data.taxEvents.filter(e => !e.realized && (e.type === 'tge' || e.type === 'airdrop') && e.estimatedAmount > 0)
  if (tgeEvents.length > 0) {
    const totalTGE = tgeEvents.reduce((s, e) => s + e.estimatedAmount, 0)
    scenarios.push({
      name: 'All TGEs Realized',
      description: `All ${tgeEvents.length} pending TGE/airdrop events trigger (~$${Math.round(totalTGE).toLocaleString()})`,
      icon: '🚀',
      additionalIncome: totalTGE,
      additionalDeduction: 0,
      capitalGains: { shortTerm: 0, longTerm: 0 },
    })
  }

  // "Harvest all losses" scenario
  if (summary.harvestCandidates.length > 0) {
    const totalLoss = summary.harvestCandidates.reduce((s, c) => s + c.loss, 0)
    scenarios.push({
      name: 'Harvest All Losses',
      description: `Realize $${Math.round(totalLoss).toLocaleString()} in losses across ${summary.harvestCandidates.length} positions`,
      icon: '🌾',
      additionalIncome: 0,
      additionalDeduction: Math.min(totalLoss, summary.shortTermGains + summary.longTermGains + 3000),
      capitalGains: { shortTerm: -summary.shortTermLosses, longTerm: -summary.longTermLosses },
    })
  }

  return scenarios
}

// ─── Dashboard Widget Data ──────────────────────────────────────────────────

export interface PortfolioDashboardWidget {
  totalValue: number
  gainLoss: number
  gainLossPct: number
  positionCount: number
  topPositions: { name: string; value: number; pct: number; riskScore: number }[]
  pendingEvents: number
  alertCount: number
  healthScore: number
}

export function getPortfolioDashboardData(): PortfolioDashboardWidget | null {
  const summary = computePortfolioSummary()
  if (summary.activePositionCount === 0) return null

  const data = getPortfolioData()
  const active = data.positions.filter(p => p.status !== 'exited')
    .sort((a, b) => b.currentValue - a.currentValue)

  const topPositions = active.slice(0, 4).map(p => ({
    name: p.name,
    value: p.currentValue,
    pct: summary.totalValue > 0 ? (p.currentValue / summary.totalValue) * 100 : 0,
    riskScore: p.riskScore,
  }))

  const healthResult = scorePortfolioHealth()
  const alerts = getPortfolioAlerts()

  return {
    totalValue: summary.totalValue,
    gainLoss: summary.unrealizedGainLoss,
    gainLossPct: summary.unrealizedGainLossPct,
    positionCount: summary.activePositionCount,
    topPositions,
    pendingEvents: summary.pendingTaxEvents,
    alertCount: alerts.filter(a => a.severity === 'urgent' || a.severity === 'warning').length,
    healthScore: healthResult.score,
  }
}
