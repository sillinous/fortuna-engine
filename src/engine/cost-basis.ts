/**
 * FORTUNA ENGINE — Cost Basis Engine v1
 * 
 * Lot-level position tracking with multiple cost basis methods:
 *   - FIFO (First In, First Out) — IRS default
 *   - LIFO (Last In, First Out)
 *   - HIFO (Highest In, First Out) — minimizes gains
 *   - Specific Identification
 *   - Per-wallet tracking (IRS Rev. Proc. 2024-28 compliant)
 *   - Wash sale detection (30-day window)
 *   - Form 8949 line-item generation
 */

export type CostBasisMethod = 'fifo' | 'lifo' | 'hifo' | 'specific_id'

export interface TaxLot {
  id: string
  ticker: string
  quantity: number
  costPerUnit: number
  totalCost: number
  acquiredDate: string       // ISO date
  wallet?: string            // per-wallet tracking (2025+)
  source: string             // exchange/import source
  remainingQty: number       // qty not yet sold
  isWashSaleDisallowed: boolean
  disallowedAmount: number   // wash sale disallowed loss added to basis
  entityId?: string          // Entity that holds this position
}

export interface DisposalRecord {
  id: string
  ticker: string
  quantity: number
  proceedsPerUnit: number
  totalProceeds: number
  disposalDate: string
  lotId: string              // which lot was sold
  costBasis: number          // basis of disposed shares
  gainLoss: number           // proceeds - basis
  holdingPeriod: 'short' | 'long'
  isWashSale: boolean
  washSaleDisallowed: number
  adjustedGainLoss: number   // after wash sale adjustment
  form8949Box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'  // Box for Form 8949
  entityId?: string          // Entity that executed this disposal
}

export interface Form8949Line {
  description: string        // "2.5 BTC"
  dateAcquired: string
  dateSold: string
  proceeds: number
  costBasis: number
  adjustmentCode: string     // 'W' for wash sale, '' otherwise
  adjustmentAmount: number
  gainLoss: number
  box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
}

export interface CostBasisSummary {
  ticker: string
  method: CostBasisMethod
  totalLots: number
  openLots: number
  closedLots: number
  totalCostBasis: number
  totalProceeds: number
  realizedGainLoss: number
  shortTermGL: number
  longTermGL: number
  washSaleDisallowed: number
  unrealizedGL: number
  form8949Lines: Form8949Line[]
}

// ─── Lot Manager ────────────────────────────────────────────────────────────

export class CostBasisTracker {
  private lots: TaxLot[] = []
  private disposals: DisposalRecord[] = []
  private method: CostBasisMethod

  constructor(method: CostBasisMethod = 'fifo') {
    this.method = method
  }

  setMethod(method: CostBasisMethod) { this.method = method }
  getMethod() { return this.method }
  getLots() { return [...this.lots] }
  getDisposals() { return [...this.disposals] }

  private genId() { return 'lot_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5) }

  // ─── Add Lot (Buy/Receive) ────────────────────────────────────────

  addLot(params: {
    ticker: string; quantity: number; costPerUnit: number;
    acquiredDate: string; wallet?: string; source?: string; entityId?: string;
  }): TaxLot {
    const lot: TaxLot = {
      id: this.genId(),
      ticker: params.ticker.toUpperCase(),
      quantity: params.quantity,
      costPerUnit: params.costPerUnit,
      totalCost: params.quantity * params.costPerUnit,
      acquiredDate: params.acquiredDate,
      wallet: params.wallet,
      source: params.source || 'manual',
      remainingQty: params.quantity,
      isWashSaleDisallowed: false,
      disallowedAmount: 0,
      entityId: params.entityId,
    }
    this.lots.push(lot)
    return lot
  }

  // ─── Dispose (Sell/Convert) ───────────────────────────────────────

  dispose(params: {
    ticker: string; quantity: number; proceedsPerUnit: number;
    disposalDate: string; specificLotId?: string; wallet?: string;
  }): DisposalRecord[] {
    const ticker = params.ticker.toUpperCase()
    let remaining = params.quantity
    const records: DisposalRecord[] = []

    // Get eligible lots based on method
    const eligibleLots = this.selectLots(ticker, params.wallet)

    if (params.specificLotId) {
      // Specific identification — use exact lot
      const lot = eligibleLots.find(l => l.id === params.specificLotId && l.remainingQty > 0)
      if (lot) {
        const qty = Math.min(remaining, lot.remainingQty)
        records.push(this.createDisposal(lot, qty, params.proceedsPerUnit, params.disposalDate))
        remaining -= qty
      }
    } else {
      // Use selected method
      for (const lot of eligibleLots) {
        if (remaining <= 0) break
        if (lot.remainingQty <= 0) continue

        const qty = Math.min(remaining, lot.remainingQty)
        records.push(this.createDisposal(lot, qty, params.proceedsPerUnit, params.disposalDate))
        remaining -= qty
      }
    }

    // Check wash sales for any loss disposals
    for (const record of records) {
      if (record.gainLoss < 0) {
        const washResult = this.checkWashSale(record)
        if (washResult.isWashSale) {
          record.isWashSale = true
          record.washSaleDisallowed = washResult.disallowedAmount
          record.adjustedGainLoss = record.gainLoss + washResult.disallowedAmount
        }
      }
    }

    this.disposals.push(...records)
    return records
  }

  private selectLots(ticker: string, wallet?: string): TaxLot[] {
    const lots = this.lots.filter(l =>
      l.ticker === ticker && l.remainingQty > 0 &&
      (!wallet || l.wallet === wallet)
    )

    switch (this.method) {
      case 'fifo':
        return lots.sort((a, b) => a.acquiredDate.localeCompare(b.acquiredDate))
      case 'lifo':
        return lots.sort((a, b) => b.acquiredDate.localeCompare(a.acquiredDate))
      case 'hifo':
        return lots.sort((a, b) => b.costPerUnit - a.costPerUnit) // highest cost first = minimize gain
      case 'specific_id':
        return lots // caller specifies lot
      default:
        return lots.sort((a, b) => a.acquiredDate.localeCompare(b.acquiredDate))
    }
  }

  private createDisposal(lot: TaxLot, quantity: number, proceedsPerUnit: number, disposalDate: string): DisposalRecord {
    const effectiveCostPerUnit = lot.costPerUnit + (lot.disallowedAmount / Math.max(lot.quantity, 1))
    const costBasis = quantity * effectiveCostPerUnit
    const totalProceeds = quantity * proceedsPerUnit
    const gainLoss = totalProceeds - costBasis

    // Determine holding period
    const acqDate = new Date(lot.acquiredDate)
    const dispDate = new Date(disposalDate)
    const diffMs = dispDate.getTime() - acqDate.getTime()
    const holdingDays = diffMs / (1000 * 60 * 60 * 24)
    const holdingPeriod: 'short' | 'long' = holdingDays > 365 ? 'long' : 'short'

    // Determine Form 8949 box
    // A: Short-term reported on 1099-B with basis  B: Short-term reported without basis
    // C: Short-term not reported  D: Long-term with basis  E: Long-term without basis  F: Long-term not reported
    const isReported = ['coinbase', 'robinhood', 'schwab', 'fidelity'].some(s => lot.source.toLowerCase().includes(s))
    let box: DisposalRecord['form8949Box']
    if (holdingPeriod === 'short') {
      box = isReported ? 'A' : 'C'
    } else {
      box = isReported ? 'D' : 'F'
    }

    // Reduce lot remaining qty
    lot.remainingQty -= quantity

    return {
      id: this.genId(),
      ticker: lot.ticker,
      quantity,
      proceedsPerUnit,
      totalProceeds,
      disposalDate,
      lotId: lot.id,
      costBasis,
      gainLoss,
      holdingPeriod,
      isWashSale: false,
      washSaleDisallowed: 0,
      adjustedGainLoss: gainLoss,
      form8949Box: box,
    }
  }

  // ─── Wash Sale Detection ──────────────────────────────────────────

  private checkWashSale(disposal: DisposalRecord): { isWashSale: boolean; disallowedAmount: number } {
    if (disposal.gainLoss >= 0) return { isWashSale: false, disallowedAmount: 0 }

    const dispDate = new Date(disposal.disposalDate)
    const windowStart = new Date(dispDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(dispDate.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Look for replacement purchases within 30-day window
    const replacementLots = this.lots.filter(lot => {
      if (lot.ticker !== disposal.ticker) return false
      if (lot.id === disposal.lotId) return false
      const acqDate = new Date(lot.acquiredDate)
      return acqDate >= windowStart && acqDate <= windowEnd
    })

    if (replacementLots.length > 0) {
      const disallowedAmount = Math.abs(disposal.gainLoss)
      // Add disallowed loss to replacement lot's basis
      const replacementLot = replacementLots[0]
      replacementLot.disallowedAmount += disallowedAmount
      replacementLot.isWashSaleDisallowed = true

      return { isWashSale: true, disallowedAmount }
    }

    return { isWashSale: false, disallowedAmount: 0 }
  }

  // ─── Summary & Reporting ──────────────────────────────────────────

  getSummary(ticker?: string, currentPrices?: Record<string, number>): CostBasisSummary[] {
    const tickers = ticker
      ? [ticker.toUpperCase()]
      : [...new Set(this.lots.map(l => l.ticker))]

    return tickers.map(t => {
      const tickerLots = this.lots.filter(l => l.ticker === t)
      const tickerDisposals = this.disposals.filter(d => d.ticker === t)
      const openLots = tickerLots.filter(l => l.remainingQty > 0)

      const totalCostBasis = tickerDisposals.reduce((s, d) => s + d.costBasis, 0)
      const totalProceeds = tickerDisposals.reduce((s, d) => s + d.totalProceeds, 0)
      const realizedGL = tickerDisposals.reduce((s, d) => s + d.adjustedGainLoss, 0)
      const shortTermGL = tickerDisposals.filter(d => d.holdingPeriod === 'short').reduce((s, d) => s + d.adjustedGainLoss, 0)
      const longTermGL = tickerDisposals.filter(d => d.holdingPeriod === 'long').reduce((s, d) => s + d.adjustedGainLoss, 0)
      const washDisallowed = tickerDisposals.reduce((s, d) => s + d.washSaleDisallowed, 0)

      // Unrealized G/L
      const currentPrice = currentPrices?.[t] || 0
      const openCost = openLots.reduce((s, l) => s + l.remainingQty * (l.costPerUnit + l.disallowedAmount / Math.max(l.quantity, 1)), 0)
      const openValue = openLots.reduce((s, l) => s + l.remainingQty * currentPrice, 0)
      const unrealizedGL = currentPrice > 0 ? openValue - openCost : 0

      // Form 8949 lines
      const form8949Lines: Form8949Line[] = tickerDisposals.map(d => ({
        description: `${d.quantity} ${d.ticker}`,
        dateAcquired: tickerLots.find(l => l.id === d.lotId)?.acquiredDate || 'Various',
        dateSold: d.disposalDate,
        proceeds: d.totalProceeds,
        costBasis: d.costBasis,
        adjustmentCode: d.isWashSale ? 'W' : '',
        adjustmentAmount: d.washSaleDisallowed,
        gainLoss: d.adjustedGainLoss,
        box: d.form8949Box,
      }))

      return {
        ticker: t,
        method: this.method,
        totalLots: tickerLots.length,
        openLots: openLots.length,
        closedLots: tickerDisposals.length,
        totalCostBasis,
        totalProceeds,
        realizedGainLoss: realizedGL,
        shortTermGL,
        longTermGL,
        washSaleDisallowed: washDisallowed,
        unrealizedGL,
        form8949Lines,
      }
    })
  }

  // ─── Tax-Loss Harvesting Scanner ──────────────────────────────────

  findHarvestingOpportunities(currentPrices: Record<string, number>): {
    ticker: string; lotId: string; unrealizedLoss: number;
    quantity: number; costBasis: number; currentValue: number;
    holdingPeriod: 'short' | 'long'; daysHeld: number;
    potentialTaxSavings: number; // at 32% marginal rate
  }[] {
    const opportunities: any[] = []
    const now = new Date()

    for (const lot of this.lots) {
      if (lot.remainingQty <= 0) continue
      const price = currentPrices[lot.ticker]
      if (!price || price <= 0) continue

      const currentValue = lot.remainingQty * price
      const effectiveCost = lot.remainingQty * (lot.costPerUnit + lot.disallowedAmount / Math.max(lot.quantity, 1))
      const unrealizedLoss = currentValue - effectiveCost

      if (unrealizedLoss >= 0) continue // only losses

      const acqDate = new Date(lot.acquiredDate)
      const daysHeld = Math.floor((now.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24))
      const holdingPeriod = daysHeld > 365 ? 'long' : 'short'

      opportunities.push({
        ticker: lot.ticker,
        lotId: lot.id,
        unrealizedLoss,
        quantity: lot.remainingQty,
        costBasis: effectiveCost,
        currentValue,
        holdingPeriod,
        daysHeld,
        potentialTaxSavings: Math.abs(unrealizedLoss) * 0.32,
      })
    }

    return opportunities.sort((a, b) => a.unrealizedLoss - b.unrealizedLoss)
  }

  // ─── Import from CSV Import Engine results ────────────────────────

  importFromCSV(positions: { ticker: string; quantity: number; costBasis: number; acquiredDate?: string; wallet?: string; source?: string }[]) {
    for (const pos of positions) {
      if (pos.quantity > 0 && pos.ticker) {
        this.addLot({
          ticker: pos.ticker,
          quantity: pos.quantity,
          costPerUnit: pos.costBasis / Math.max(pos.quantity, 0.001),
          acquiredDate: pos.acquiredDate || new Date().toISOString().split('T')[0],
          wallet: pos.wallet,
          source: pos.source || 'csv-import',
        })
      }
    }
  }

  // ─── Serialization ────────────────────────────────────────────────

  serialize(): string {
    return JSON.stringify({ method: this.method, lots: this.lots, disposals: this.disposals })
  }

  static deserialize(json: string): CostBasisTracker {
    const data = JSON.parse(json)
    const tracker = new CostBasisTracker(data.method || 'fifo')
    tracker.lots = data.lots || []
    tracker.disposals = data.disposals || []
    return tracker
  }

  // Entity-aware filtering
  getLotsForEntity(entityId: string): TaxLot[] {
    return this.lots.filter(l => (l.entityId || 'personal') === entityId)
  }

  getDisposalsForEntity(entityId: string): DisposalRecord[] {
    return this.disposals.filter(d => (d.entityId || 'personal') === entityId)
  }

  getSummaryByEntity(entityId: string, currentPrices?: Record<string, number>): CostBasisSummary[] {
    const entityLots = this.getLotsForEntity(entityId)
    const entityDisposals = this.getDisposalsForEntity(entityId)
    const tickers = [...new Set(entityLots.map(l => l.ticker))]

    return tickers.map(t => {
      const tickerLots = entityLots.filter(l => l.ticker === t)
      const tickerDisposals = entityDisposals.filter(d => d.ticker === t)
      const openLots = tickerLots.filter(l => l.remainingQty > 0)

      const totalCostBasis = tickerDisposals.reduce((s, d) => s + d.costBasis, 0)
      const totalProceeds = tickerDisposals.reduce((s, d) => s + d.totalProceeds, 0)
      const realizedGL = tickerDisposals.reduce((s, d) => s + d.adjustedGainLoss, 0)
      const shortTermGL = tickerDisposals.filter(d => d.holdingPeriod === 'short').reduce((s, d) => s + d.adjustedGainLoss, 0)
      const longTermGL = tickerDisposals.filter(d => d.holdingPeriod === 'long').reduce((s, d) => s + d.adjustedGainLoss, 0)
      const washDisallowed = tickerDisposals.reduce((s, d) => s + d.washSaleDisallowed, 0)

      const currentPrice = currentPrices?.[t] || 0
      const openCost = openLots.reduce((s, l) => s + l.remainingQty * (l.costPerUnit + l.disallowedAmount / Math.max(l.quantity, 1)), 0)
      const openValue = openLots.reduce((s, l) => s + l.remainingQty * currentPrice, 0)
      const unrealizedGL = currentPrice > 0 ? openValue - openCost : 0

      return {
        ticker: t, method: this.method,
        totalLots: tickerLots.length, openLots: openLots.length, closedLots: tickerDisposals.length,
        totalCostBasis, totalProceeds, realizedGainLoss: realizedGL,
        shortTermGL, longTermGL, washSaleDisallowed: washDisallowed, unrealizedGL,
        form8949Lines: tickerDisposals.map(d => ({
          description: `${d.quantity} ${d.ticker}`,
          dateAcquired: tickerLots.find(l => l.id === d.lotId)?.acquiredDate || 'Various',
          dateSold: d.disposalDate, proceeds: d.totalProceeds, costBasis: d.costBasis,
          adjustmentCode: d.isWashSale ? 'W' : '', adjustmentAmount: d.washSaleDisallowed,
          gainLoss: d.adjustedGainLoss, box: d.form8949Box,
        })),
      }
    })
  }

  getEntityIds(): string[] {
    const ids = new Set<string>()
    this.lots.forEach(l => ids.add(l.entityId || 'personal'))
    this.disposals.forEach(d => ids.add(d.entityId || 'personal'))
    return [...ids]
  }
}

// ─── Cross-Entity Wash Sale Scanner ─────────────────────────────────────────
// IRS wash sale rules apply across ALL accounts/entities owned by the taxpayer
// (including spouse's accounts in MFJ), not just within a single account.

export interface CrossEntityWashSaleAlert {
  disposalEntityId: string
  disposalTicker: string
  disposalDate: string
  disposalLoss: number
  replacementEntityId: string
  replacementDate: string
  replacementQuantity: number
  disallowedAmount: number
  recommendation: string
}

/** Scan for wash sales across entity boundaries (IRS applies across all taxpayer accounts) */
export function detectCrossEntityWashSales(tracker: CostBasisTracker): CrossEntityWashSaleAlert[] {
  const alerts: CrossEntityWashSaleAlert[] = []
  const allLots = tracker.getLots()
  const allDisposals = tracker.getDisposals()

  // Only check disposals with losses
  const lossDisposals = allDisposals.filter(d => d.gainLoss < 0)

  for (const disposal of lossDisposals) {
    const dispDate = new Date(disposal.disposalDate)
    const windowStart = new Date(dispDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(dispDate.getTime() + 30 * 24 * 60 * 60 * 1000)
    const disposalEntity = disposal.entityId || 'personal'

    // Look for replacement purchases in DIFFERENT entities within 30-day window
    const crossEntityReplacements = allLots.filter(lot => {
      if (lot.ticker !== disposal.ticker) return false
      const lotEntity = lot.entityId || 'personal'
      if (lotEntity === disposalEntity) return false // same entity already handled
      const acqDate = new Date(lot.acquiredDate)
      return acqDate >= windowStart && acqDate <= windowEnd
    })

    for (const replacement of crossEntityReplacements) {
      const disallowedAmount = Math.min(Math.abs(disposal.gainLoss), replacement.quantity * replacement.costPerUnit)
      alerts.push({
        disposalEntityId: disposalEntity,
        disposalTicker: disposal.ticker,
        disposalDate: disposal.disposalDate,
        disposalLoss: disposal.gainLoss,
        replacementEntityId: replacement.entityId || 'personal',
        replacementDate: replacement.acquiredDate,
        replacementQuantity: replacement.quantity,
        disallowedAmount,
        recommendation: `Loss of $${Math.abs(disposal.gainLoss).toLocaleString()} on ${disposal.ticker} sold from entity "${disposalEntity}" may be disallowed — replacement purchased in entity "${replacement.entityId || 'personal'}" within 30-day window. IRS wash sale rules apply across all accounts you control.`,
      })
    }
  }

  return alerts
}

// ─── Comparison Tool: Which method is best? ─────────────────────────────────

export function compareCostBasisMethods(
  lots: { ticker: string; quantity: number; costPerUnit: number; acquiredDate: string }[],
  disposals: { ticker: string; quantity: number; proceedsPerUnit: number; disposalDate: string }[],
): Record<CostBasisMethod, { realizedGL: number; shortTermGL: number; longTermGL: number; washSaleDisallowed: number }> {
  const methods: CostBasisMethod[] = ['fifo', 'lifo', 'hifo']
  const results: any = {}

  for (const method of methods) {
    const tracker = new CostBasisTracker(method)
    for (const lot of lots) tracker.addLot(lot)
    for (const disp of disposals) tracker.dispose(disp)
    const summaries = tracker.getSummary()
    results[method] = {
      realizedGL: summaries.reduce((s, sm) => s + sm.realizedGainLoss, 0),
      shortTermGL: summaries.reduce((s, sm) => s + sm.shortTermGL, 0),
      longTermGL: summaries.reduce((s, sm) => s + sm.longTermGL, 0),
      washSaleDisallowed: summaries.reduce((s, sm) => s + sm.washSaleDisallowed, 0),
    }
  }

  results['specific_id'] = results['hifo'] // same as HIFO when optimally selected
  return results
}

// ─── Phase F: Type Adapters ─────────────────────────────────────────────────

import type { InvestmentPosition } from './storage'

/** Convert TaxLot → InvestmentPosition (for storage sync) */
export function taxLotToPosition(lot: TaxLot, currentPrice: number = 0): InvestmentPosition {
  return {
    id: lot.id,
    symbol: lot.ticker,
    name: lot.ticker,
    type: 'stock',
    quantity: lot.remainingQty,
    costBasis: lot.remainingQty * (lot.costPerUnit + lot.disallowedAmount / Math.max(lot.quantity, 1)),
    currentValue: lot.remainingQty * currentPrice,
    acquisitionDate: lot.acquiredDate,
    isLongTerm: isLongTermHolding(lot.acquiredDate),
    entityId: lot.entityId || 'personal',
    memberId: 'primary',
    taxYear: new Date().getFullYear(),
    tags: [],
  }
}

/** Convert InvestmentPosition → TaxLot (for cost-basis import) */
export function positionToTaxLot(pos: InvestmentPosition): TaxLot {
  return {
    id: pos.id,
    ticker: pos.symbol,
    quantity: pos.quantity,
    costPerUnit: pos.quantity > 0 ? pos.costBasis / pos.quantity : 0,
    totalCost: pos.costBasis,
    acquiredDate: pos.acquisitionDate,
    source: 'import',
    remainingQty: pos.quantity,
    isWashSaleDisallowed: false,
    disallowedAmount: 0,
    entityId: pos.entityId || 'personal',
  }
}

function isLongTermHolding(acquiredDate: string): boolean {
  const acquired = new Date(acquiredDate)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return acquired <= oneYearAgo
}

/** Sync cost-basis lots → InvestmentPosition[] for storage */
export function syncLotsToPositions(tracker: CostBasisTracker, currentPrices: Record<string, number> = {}): InvestmentPosition[] {
  return tracker.getLots()
    .filter(l => l.remainingQty > 0)
    .map(l => taxLotToPosition(l, currentPrices[l.ticker] || 0))
}
