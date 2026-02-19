/**
 * FORTUNA ENGINE — DeFi Protocol Tracker v1
 * 
 * Unique competitive advantage — no tax tool tracks DeFi deeply:
 *   - Liquidity pool position tracking (Uniswap, Curve, Balancer, etc.)
 *   - Impermanent loss calculation + tax treatment
 *   - Yield farming reward tracking (compounding, harvested, pending)
 *   - Governance token tracking (proposals, delegations)
 *   - Staking position monitoring (single-asset + LP staking)
 *   - Protocol fee earnings tracking
 *   - Bridge/chain tracking (cross-chain positions)
 *   - Tax event generation for each DeFi action
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LPPosition {
  id: string
  protocol: DeFiProtocol
  chain: Chain
  poolName: string             // "ETH/USDC 0.3%"
  tokenA: { symbol: string; amount: number; entryPrice: number }
  tokenB: { symbol: string; amount: number; entryPrice: number }
  lpTokens: number
  entryDate: string
  entryValueUSD: number
  currentValueUSD?: number
  feesEarned: number           // trading fees earned
  rewardsEarned: number        // farming rewards (tokens)
  rewardTokenSymbol?: string
  impermanentLoss?: number     // in USD
  status: 'active' | 'withdrawn' | 'migrated'
  entityId?: string            // Entity that holds this position
  withdrawDate?: string
  withdrawValueUSD?: number
  notes: string
  entityId?: string            // Entity this position belongs to
}

export interface StakingPosition {
  id: string
  protocol: DeFiProtocol
  chain: Chain
  tokenSymbol: string
  amountStaked: number
  stakedDate: string
  stakingType: 'single_asset' | 'lp_token' | 'validator' | 'liquid_staking'
  apy: number
  rewardsEarned: number
  rewardTokenSymbol: string
  autoCompound: boolean
  lockPeriod?: number          // days
  unlockDate?: string
  currentValueUSD?: number
  status: 'active' | 'unstaking' | 'withdrawn'
  notes: string
  entityId?: string            // Entity this position belongs to
}

export interface YieldFarmPosition {
  id: string
  protocol: DeFiProtocol
  chain: Chain
  farmName: string
  depositedToken: string
  depositedAmount: number
  depositDate: string
  depositValueUSD: number
  harvestedRewards: HarvestEvent[]
  pendingRewards: number
  pendingRewardToken: string
  apy: number
  currentValueUSD?: number
  status: 'active' | 'withdrawn'
  notes: string
}

export interface HarvestEvent {
  date: string
  rewardToken: string
  amount: number
  valueUSD: number             // FMV at harvest
  claimedOrCompounded: 'claimed' | 'compounded'
}

export interface BridgeTransaction {
  id: string
  fromChain: Chain
  toChain: Chain
  token: string
  amount: number
  bridgeProtocol: string       // "Wormhole", "LayerZero", "Arbitrum Bridge"
  date: string
  fee: number
  valueUSD: number
  status: 'completed' | 'pending' | 'failed'
}

export type DeFiProtocol =
  | 'uniswap_v2' | 'uniswap_v3' | 'sushiswap' | 'curve' | 'balancer'
  | 'aave_v3' | 'compound_v3' | 'maker' | 'lido' | 'rocket_pool'
  | 'convex' | 'yearn' | 'pendle' | 'gmx' | 'dydx'
  | 'pancakeswap' | 'raydium' | 'orca' | 'jupiter'
  | 'helium' | 'render' | 'akash' | 'custom'

export type Chain =
  | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base'
  | 'solana' | 'avalanche' | 'bsc' | 'fantom' | 'other'

// ─── Protocol Metadata ──────────────────────────────────────────────────────

export const PROTOCOL_INFO: Record<DeFiProtocol, { name: string; icon: string; chains: Chain[]; type: string }> = {
  uniswap_v2:   { name: 'Uniswap V2',    icon: '🦄', chains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'], type: 'DEX' },
  uniswap_v3:   { name: 'Uniswap V3',    icon: '🦄', chains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'], type: 'DEX' },
  sushiswap:    { name: 'SushiSwap',      icon: '🍣', chains: ['ethereum', 'polygon', 'arbitrum'], type: 'DEX' },
  curve:        { name: 'Curve Finance',   icon: '🔵', chains: ['ethereum', 'polygon', 'arbitrum', 'optimism'], type: 'DEX' },
  balancer:     { name: 'Balancer',        icon: '⚖️', chains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'], type: 'DEX' },
  aave_v3:      { name: 'Aave V3',        icon: '👻', chains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'base'], type: 'Lending' },
  compound_v3:  { name: 'Compound V3',    icon: '🏛️', chains: ['ethereum', 'polygon', 'arbitrum', 'base'], type: 'Lending' },
  maker:        { name: 'MakerDAO',        icon: '🏗️', chains: ['ethereum'], type: 'Lending' },
  lido:         { name: 'Lido',            icon: '🌊', chains: ['ethereum', 'polygon', 'solana'], type: 'Liquid Staking' },
  rocket_pool:  { name: 'Rocket Pool',     icon: '🚀', chains: ['ethereum'], type: 'Liquid Staking' },
  convex:       { name: 'Convex Finance',  icon: '🔺', chains: ['ethereum'], type: 'Yield' },
  yearn:        { name: 'Yearn Finance',   icon: '🔵', chains: ['ethereum'], type: 'Yield' },
  pendle:       { name: 'Pendle',          icon: '⏳', chains: ['ethereum', 'arbitrum'], type: 'Yield' },
  gmx:          { name: 'GMX',             icon: '📊', chains: ['arbitrum', 'avalanche'], type: 'Perps DEX' },
  dydx:         { name: 'dYdX',            icon: '📈', chains: ['ethereum'], type: 'Perps DEX' },
  pancakeswap:  { name: 'PancakeSwap',     icon: '🥞', chains: ['bsc', 'ethereum', 'arbitrum', 'base'], type: 'DEX' },
  raydium:      { name: 'Raydium',         icon: '☀️', chains: ['solana'], type: 'DEX' },
  orca:         { name: 'Orca',            icon: '🐋', chains: ['solana'], type: 'DEX' },
  jupiter:      { name: 'Jupiter',         icon: '🪐', chains: ['solana'], type: 'DEX Aggregator' },
  helium:       { name: 'Helium',          icon: '📡', chains: ['solana'], type: 'DePIN' },
  render:       { name: 'Render Network',  icon: '🖼️', chains: ['solana', 'ethereum'], type: 'DePIN' },
  akash:        { name: 'Akash Network',   icon: '☁️', chains: ['other'], type: 'DePIN' },
  custom:       { name: 'Custom Protocol', icon: '⚙️', chains: ['ethereum', 'solana', 'polygon', 'arbitrum', 'optimism', 'base', 'bsc', 'avalanche', 'fantom', 'other'], type: 'Custom' },
}

// ─── Impermanent Loss Calculator ────────────────────────────────────────────

export function calculateImpermanentLoss(
  entryPriceA: number,
  entryPriceB: number,
  currentPriceA: number,
  currentPriceB: number,
  entryValueUSD: number,
): {
  impermanentLoss: number        // in USD
  impermanentLossPercent: number // as percentage
  holdValue: number              // if you just held the tokens
  lpValue: number                // current LP value
  feesNeeded: number             // fees needed to offset IL
} {
  // Price ratio change
  const ratioA = currentPriceA / entryPriceA
  const ratioB = currentPriceB / entryPriceB

  // For constant product AMM (x*y=k):
  // IL = 2*sqrt(priceRatio) / (1+priceRatio) - 1
  // Where priceRatio = relative change of token A vs token B
  const priceRatio = ratioA / ratioB
  const ilPercent = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1

  // Hold value (what tokens would be worth if you just held them)
  const halfEntry = entryValueUSD / 2
  const holdValueA = halfEntry * ratioA
  const holdValueB = halfEntry * ratioB
  const holdValue = holdValueA + holdValueB

  // LP value accounting for IL
  const lpValue = holdValue * (1 + ilPercent)
  const impermanentLoss = holdValue - lpValue

  return {
    impermanentLoss: Math.round(impermanentLoss * 100) / 100,
    impermanentLossPercent: Math.round(ilPercent * 10000) / 100,
    holdValue: Math.round(holdValue * 100) / 100,
    lpValue: Math.round(lpValue * 100) / 100,
    feesNeeded: Math.round(impermanentLoss * 100) / 100,
  }
}

// ─── Tax Event Generation ───────────────────────────────────────────────────

export interface DeFiTaxEvent {
  date: string
  type: 'lp_entry' | 'lp_exit' | 'harvest' | 'stake' | 'unstake' | 'bridge' | 'swap' | 'airdrop' | 'lending_interest'
  description: string
  protocol: string
  chain: Chain
  taxTreatment: 'ordinary_income' | 'short_term_cg' | 'long_term_cg' | 'not_taxable' | 'cost_basis_only'
  amount: number               // in USD
  costBasis?: number
  gainLoss?: number
  tokens: { symbol: string; amount: number; priceUSD: number }[]
  notes: string
  irsGuidance: string
}

export function generateLPTaxEvents(position: LPPosition): DeFiTaxEvent[] {
  const events: DeFiTaxEvent[] = []

  // Entry: potential taxable event if adding tokens to pool
  // IRS has not definitively ruled, but most conservative: treat as disposal
  events.push({
    date: position.entryDate,
    type: 'lp_entry',
    description: `Added liquidity to ${position.poolName} on ${PROTOCOL_INFO[position.protocol].name}`,
    protocol: PROTOCOL_INFO[position.protocol].name,
    chain: position.chain,
    taxTreatment: 'cost_basis_only', // conservative: not taxable until exit
    amount: position.entryValueUSD,
    costBasis: position.entryValueUSD,
    tokens: [
      { symbol: position.tokenA.symbol, amount: position.tokenA.amount, priceUSD: position.tokenA.entryPrice },
      { symbol: position.tokenB.symbol, amount: position.tokenB.amount, priceUSD: position.tokenB.entryPrice },
    ],
    notes: 'LP entry. IRS treatment unclear — tracking cost basis conservatively.',
    irsGuidance: 'No specific guidance. Rev. Rul. 2023-14 covers staking but not LP. Conservative approach: track cost basis, recognize on exit.',
  })

  // Fees earned: likely ordinary income as earned
  if (position.feesEarned > 0) {
    events.push({
      date: position.withdrawDate || new Date().toISOString().split('T')[0],
      type: 'harvest',
      description: `Trading fees earned from ${position.poolName}`,
      protocol: PROTOCOL_INFO[position.protocol].name,
      chain: position.chain,
      taxTreatment: 'ordinary_income',
      amount: position.feesEarned,
      tokens: [],
      notes: 'LP trading fees — likely ordinary income per general tax principles.',
      irsGuidance: 'IRC §61 (gross income); analogous to interest income.',
    })
  }

  // Farming rewards
  if (position.rewardsEarned > 0) {
    events.push({
      date: position.withdrawDate || new Date().toISOString().split('T')[0],
      type: 'harvest',
      description: `Farming rewards: ${position.rewardsEarned} ${position.rewardTokenSymbol || 'tokens'}`,
      protocol: PROTOCOL_INFO[position.protocol].name,
      chain: position.chain,
      taxTreatment: 'ordinary_income',
      amount: position.rewardsEarned, // should be FMV at receipt
      tokens: position.rewardTokenSymbol
        ? [{ symbol: position.rewardTokenSymbol, amount: position.rewardsEarned, priceUSD: 0 }]
        : [],
      notes: 'Farming rewards are ordinary income at FMV when dominion and control obtained.',
      irsGuidance: 'Rev. Rul. 2023-14 (staking rewards = income when received); extends to farming by analogy.',
    })
  }

  // Exit
  if (position.status === 'withdrawn' && position.withdrawValueUSD !== undefined) {
    const gainLoss = position.withdrawValueUSD - position.entryValueUSD
    const holdingDays = daysBetween(position.entryDate, position.withdrawDate || '')

    events.push({
      date: position.withdrawDate!,
      type: 'lp_exit',
      description: `Removed liquidity from ${position.poolName}`,
      protocol: PROTOCOL_INFO[position.protocol].name,
      chain: position.chain,
      taxTreatment: holdingDays > 365 ? 'long_term_cg' : 'short_term_cg',
      amount: position.withdrawValueUSD,
      costBasis: position.entryValueUSD,
      gainLoss,
      tokens: [],
      notes: `${holdingDays > 365 ? 'Long-term' : 'Short-term'} gain/loss of $${gainLoss.toFixed(2)}. Impermanent loss reflected in exit value.`,
      irsGuidance: 'Treat LP exit as disposal of LP tokens. Gain/loss = exit value - cost basis.',
    })
  }

  return events
}

export function generateStakingTaxEvents(position: StakingPosition): DeFiTaxEvent[] {
  const events: DeFiTaxEvent[] = []

  if (position.rewardsEarned > 0) {
    events.push({
      date: new Date().toISOString().split('T')[0],
      type: 'harvest',
      description: `Staking rewards: ${position.rewardsEarned} ${position.rewardTokenSymbol}`,
      protocol: PROTOCOL_INFO[position.protocol].name,
      chain: position.chain,
      taxTreatment: 'ordinary_income',
      amount: position.rewardsEarned, // should be multiplied by FMV
      tokens: [{ symbol: position.rewardTokenSymbol, amount: position.rewardsEarned, priceUSD: 0 }],
      notes: 'Staking rewards are ordinary income at FMV when received. New cost basis = FMV at receipt.',
      irsGuidance: 'Rev. Rul. 2023-14: Staking rewards are includible in gross income when taxpayer gains dominion and control.',
    })
  }

  return events
}

// ─── Portfolio Summary ──────────────────────────────────────────────────────

export interface DeFiPortfolioSummary {
  totalValueUSD: number
  totalCostBasis: number
  unrealizedGL: number
  totalFeesEarned: number
  totalRewardsEarned: number
  totalImpermanentLoss: number
  lpPositions: number
  stakingPositions: number
  farmPositions: number
  chains: Chain[]
  protocols: DeFiProtocol[]
  taxEventsGenerated: number
  estimatedTaxLiability: number
}

export function summarizeDeFiPortfolio(
  lps: LPPosition[],
  stakes: StakingPosition[],
  farms: YieldFarmPosition[],
  marginalRate: number = 0.32,
): DeFiPortfolioSummary {
  const activeLPs = lps.filter(l => l.status === 'active')
  const activeStakes = stakes.filter(s => s.status === 'active')
  const activeFarms = farms.filter(f => f.status === 'active')

  const totalValue = activeLPs.reduce((s, l) => s + (l.currentValueUSD || l.entryValueUSD), 0) +
    activeStakes.reduce((s, st) => s + (st.currentValueUSD || st.amountStaked), 0) +
    activeFarms.reduce((s, f) => s + (f.currentValueUSD || f.depositValueUSD), 0)

  const totalCostBasis = lps.reduce((s, l) => s + l.entryValueUSD, 0) +
    farms.reduce((s, f) => s + f.depositValueUSD, 0)

  const totalFees = lps.reduce((s, l) => s + l.feesEarned, 0)
  const totalRewards = lps.reduce((s, l) => s + l.rewardsEarned, 0) +
    stakes.reduce((s, st) => s + st.rewardsEarned, 0) +
    farms.reduce((s, f) => s + f.harvestedRewards.reduce((rs, h) => rs + h.valueUSD, 0), 0)

  const totalIL = activeLPs.reduce((s, l) => s + (l.impermanentLoss || 0), 0)

  const allChains = [...new Set([...lps.map(l => l.chain), ...stakes.map(s => s.chain), ...farms.map(f => f.chain)])]
  const allProtocols = [...new Set([...lps.map(l => l.protocol), ...stakes.map(s => s.protocol), ...farms.map(f => f.protocol)])]

  // Generate tax events count
  let taxEventCount = 0
  for (const lp of lps) taxEventCount += generateLPTaxEvents(lp).length
  for (const st of stakes) taxEventCount += generateStakingTaxEvents(st).length

  const estimatedTax = (totalFees + totalRewards) * marginalRate

  return {
    totalValueUSD: Math.round(totalValue),
    totalCostBasis: Math.round(totalCostBasis),
    unrealizedGL: Math.round(totalValue - totalCostBasis),
    totalFeesEarned: Math.round(totalFees),
    totalRewardsEarned: Math.round(totalRewards),
    totalImpermanentLoss: Math.round(totalIL),
    lpPositions: activeLPs.length,
    stakingPositions: activeStakes.length,
    farmPositions: activeFarms.length,
    chains: allChains,
    protocols: allProtocols,
    taxEventsGenerated: taxEventCount,
    estimatedTaxLiability: Math.round(estimatedTax),
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  const d1 = new Date(start)
  const d2 = new Date(end)
  return Math.abs(Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)))
}

// ─── Phase H: Entity Awareness ──────────────────────────────────────────────

export interface DeFiTaxEventWithEntity extends DeFiTaxEvent {
  entityId?: string
}

/** Tag DeFi tax events with entity ownership */
export function tagEventsWithEntity(
  events: DeFiTaxEvent[],
  defaultEntityId: string = 'personal',
): DeFiTaxEventWithEntity[] {
  return events.map(e => ({ ...e, entityId: defaultEntityId }))
}

/** Filter DeFi positions and events by entity */
export function filterDeFiByEntity<T extends { entityId?: string }>(items: T[], entityId: string): T[] {
  return items.filter(i => (i.entityId || 'personal') === entityId)
}

// ─── Phase G: DeFi → Cost Basis Bridge ──────────────────────────────────────

import type { TaxLot, DisposalRecord } from './cost-basis'

/** Convert DeFi tax events into cost-basis TaxLots and DisposalRecords */
export function defiEventsToCostBasis(events: (DeFiTaxEvent | DeFiTaxEventWithEntity)[]): {
  lots: Omit<TaxLot, 'id'>[]
  disposals: Omit<DisposalRecord, 'id' | 'lotId'>[]
} {
  const lots: Omit<TaxLot, 'id'>[] = []
  const disposals: Omit<DisposalRecord, 'id' | 'lotId'>[] = []

  for (const event of events) {
    if (event.taxTreatment === 'not_taxable') continue
    const entityId = 'entityId' in event ? event.entityId : undefined

    // Entries create tax lots
    if (['lp_entry', 'stake', 'bridge'].includes(event.type) || event.taxTreatment === 'cost_basis_only') {
      for (const token of event.tokens) {
        lots.push({
          ticker: token.symbol,
          quantity: token.amount,
          costPerUnit: token.priceUSD,
          totalCost: token.amount * token.priceUSD,
          acquiredDate: event.date,
          source: `${event.protocol} (${event.chain})`,
          remainingQty: token.amount,
          isWashSaleDisallowed: false,
          disallowedAmount: 0,
          entityId,
        })
      }
    }

    // Exits create disposals
    if (['lp_exit', 'unstake', 'swap'].includes(event.type) && event.gainLoss !== undefined) {
      for (const token of event.tokens) {
        const proceeds = token.amount * token.priceUSD
        const basis = event.costBasis || 0
        const holdingDays = 365
        disposals.push({
          ticker: token.symbol,
          quantity: token.amount,
          proceedsPerUnit: token.priceUSD,
          totalProceeds: proceeds,
          disposalDate: event.date,
          costBasis: basis / Math.max(event.tokens.length, 1),
          gainLoss: event.gainLoss! / Math.max(event.tokens.length, 1),
          holdingPeriod: holdingDays > 365 ? 'long' : 'short',
          isWashSale: false,
          washSaleDisallowed: 0,
          adjustedGainLoss: event.gainLoss! / Math.max(event.tokens.length, 1),
          form8949Box: holdingDays > 365 ? 'D' : 'A' as any,
          entityId,
        })
      }
    }

    // Ordinary income events (staking rewards, airdrops, interest)
    if (['harvest', 'airdrop', 'lending_interest'].includes(event.type) && event.taxTreatment === 'ordinary_income') {
      for (const token of event.tokens) {
        lots.push({
          ticker: token.symbol,
          quantity: token.amount,
          costPerUnit: token.priceUSD,
          totalCost: token.amount * token.priceUSD,
          acquiredDate: event.date,
          source: `${event.protocol} ${event.type} (${event.chain})`,
          remainingQty: token.amount,
          isWashSaleDisallowed: false,
          disallowedAmount: 0,
          entityId,
        })
      }
    }
  }

  return { lots, disposals }
}
