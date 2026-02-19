/**
 * FORTUNA ENGINE — CSV Import Engine v1
 * 
 * Intelligent CSV parser that transforms transaction exports from major
 * exchanges, brokerages, and banks into Fortuna PortfolioPosition and
 * TaxEvent records. Supports:
 *   - Coinbase (standard transaction history export)
 *   - Kraken (ledger export)
 *   - Binance (trade history export)
 *   - Robinhood (1099 / transaction CSV)
 *   - Schwab / Fidelity (brokerage transaction export)
 *   - Generic bank CSV (Chase, Wells Fargo, etc.)
 *   - Custom CSV with intelligent column auto-mapping
 */

// ─── Types ──────────────────────────────────────────────────────────────────

type AssetClass = 'crypto' | 'defi' | 'nft' | 'equity' | 'commodity' | 'real_estate' | 'speculative' | 'other'
type TaxTreatment = 'ordinary_income' | 'short_term_cg' | 'long_term_cg' | 'mining_income' | 'airdrop' | 'staking_reward' | 'unknown'

export interface ImportedPosition {
  name: string
  ticker?: string
  assetClass: AssetClass
  quantity: number
  costBasis: number
  currentValue: number
  acquiredDate?: string
  taxTreatment: TaxTreatment
  tags: string[]
  riskScore: number
  chain?: string
  wallet?: string
  notes: string
}

export interface ImportedTaxEvent {
  type: 'airdrop' | 'tge' | 'vest' | 'sale' | 'conversion' | 'staking_reward' | 'mining' | 'income' | 'loss'
  description: string
  estimatedAmount: number
  taxTreatment: TaxTreatment
  expectedDate?: string
  realized: boolean
  notes: string
}

export interface ImportResult {
  source: string
  format: string
  positions: ImportedPosition[]
  taxEvents: ImportedTaxEvent[]
  warnings: string[]
  skippedRows: number
  totalRows: number
  rawHeaders: string[]
}

export interface ColumnMapping {
  date?: number
  asset?: number
  type?: number
  quantity?: number
  price?: number
  total?: number
  fee?: number
  notes?: number
}

export type SupportedFormat = 
  | 'coinbase'
  | 'kraken'
  | 'binance'
  | 'robinhood'
  | 'schwab'
  | 'fidelity'
  | 'generic_bank'
  | 'custom'

// ─── CSV Parsing Core ───────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  // Skip metadata rows (Coinbase puts notes before headers)
  let headerIdx = 0
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const fields = parseCSVLine(lines[i])
    // Heuristic: header row has 4+ fields and mostly non-numeric content
    const nonNumeric = fields.filter(f => f && isNaN(Number(f.replace(/[$,]/g, '')))).length
    if (fields.length >= 4 && nonNumeric >= fields.length * 0.5) {
      headerIdx = i
      break
    }
  }

  const headers = parseCSVLine(lines[headerIdx]).map(h => h.toLowerCase().replace(/[^a-z0-9_\s]/g, '').trim())
  const rows = lines.slice(headerIdx + 1).map(parseCSVLine).filter(r => r.length >= headers.length * 0.5)
  return { headers, rows }
}

// ─── Format Detection ───────────────────────────────────────────────────────

export function detectFormat(headers: string[]): SupportedFormat {
  const h = headers.join(' ').toLowerCase()
  
  if (h.includes('timestamp') && h.includes('transaction type') && h.includes('asset')) return 'coinbase'
  if (h.includes('txid') && h.includes('refid') && h.includes('aclass')) return 'kraken'
  if (h.includes('date(utc)') || (h.includes('pair') && h.includes('executed qty'))) return 'binance'
  if (h.includes('activity date') && h.includes('instrument')) return 'robinhood'
  if (h.includes('action') && h.includes('symbol') && h.includes('description') && h.includes('schwab')) return 'schwab'
  if (h.includes('run date') && h.includes('symbol') && h.includes('security description')) return 'fidelity'
  if ((h.includes('posting date') || h.includes('transaction date')) && h.includes('description') && h.includes('amount')) return 'generic_bank'
  
  return 'custom'
}

// ─── Utility ────────────────────────────────────────────────────────────────

function genImportId(): string {
  return 'imp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
}

function parseDate(val: string): string | undefined {
  if (!val) return undefined
  // Handle common date formats
  const cleaned = val.replace(/"/g, '').trim()
  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  // Try MM/DD/YYYY
  const mdy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3]
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  return undefined
}

function parseNumber(val: string): number {
  if (!val) return 0
  return parseFloat(val.replace(/[$,"\s]/g, '')) || 0
}

function isHoldingPeriodLong(acquiredDate: string | undefined): boolean {
  if (!acquiredDate) return false
  const acq = new Date(acquiredDate)
  const now = new Date()
  const diffMs = now.getTime() - acq.getTime()
  return diffMs >= 365.25 * 24 * 60 * 60 * 1000
}

function inferAssetClass(ticker: string, name: string): AssetClass {
  const t = (ticker || '').toUpperCase()
  const n = (name || '').toLowerCase()
  
  const majors = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'XRP', 'BNB', 'DOGE', 'SHIB', 'LTC', 'UNI', 'AAVE', 'ATOM', 'NEAR', 'FTM', 'ALGO', 'XLM', 'VET', 'HBAR', 'ICP', 'FIL', 'GRT', 'SAND', 'MANA', 'APE', 'CRV', 'MKR', 'SNX', 'COMP', 'SUSHI', 'YFI', 'BAL', 'REN', '1INCH', 'CAKE', 'LUNA', 'UST', 'USDT', 'USDC', 'DAI', 'BUSD', 'FRAX']
  const defi = ['UNI', 'AAVE', 'COMP', 'SUSHI', 'YFI', 'CRV', 'BAL', 'MKR', 'SNX', '1INCH', 'CAKE', 'DYDX', 'GMX', 'PENDLE']
  const nfts = ['APE', 'MANA', 'SAND', 'AXS', 'ENJ', 'GALA', 'ILV']
  
  if (n.includes('nft') || nfts.includes(t)) return 'nft'
  if (n.includes('defi') || n.includes('liquidity') || n.includes('lp') || defi.includes(t)) return 'defi'
  if (majors.includes(t) || n.includes('bitcoin') || n.includes('ethereum') || n.includes('crypto')) return 'crypto'
  if (n.includes('gold') || n.includes('silver') || n.includes('oil') || n.includes('commodity')) return 'commodity'
  if (n.includes('reit') || n.includes('real estate')) return 'real_estate'
  
  // Check for stock-like tickers (1-5 uppercase letters)
  if (/^[A-Z]{1,5}$/.test(t) && !majors.includes(t)) return 'equity'
  
  return 'crypto' // default for unknown exchange assets
}

function inferRiskScore(assetClass: AssetClass, ticker: string): number {
  const t = (ticker || '').toUpperCase()
  const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'USDP']
  if (stablecoins.includes(t)) return 1
  
  const bluechipCrypto = ['BTC', 'ETH']
  if (bluechipCrypto.includes(t)) return 5
  
  const largeCapCrypto = ['SOL', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'XRP', 'BNB']
  if (largeCapCrypto.includes(t)) return 6
  
  switch (assetClass) {
    case 'equity': return 4
    case 'commodity': return 5
    case 'crypto': return 7
    case 'defi': return 8
    case 'nft': return 9
    case 'speculative': return 9
    default: return 6
  }
}

// ─── Position Aggregator ────────────────────────────────────────────────────

interface RawTransaction {
  date?: string
  asset: string
  ticker: string
  type: 'buy' | 'sell' | 'receive' | 'send' | 'staking_reward' | 'airdrop' | 'mining' | 'trade' | 'conversion' | 'deposit' | 'withdrawal' | 'dividend' | 'interest' | 'fee' | 'unknown'
  quantity: number
  pricePerUnit: number
  totalValue: number
  fee: number
  notes: string
}

function aggregateToPositions(transactions: RawTransaction[], source: string): { positions: ImportedPosition[], taxEvents: ImportedTaxEvent[] } {
  const positionMap = new Map<string, { buys: RawTransaction[], sells: RawTransaction[], rewards: RawTransaction[] }>()
  const taxEvents: ImportedTaxEvent[] = []

  for (const tx of transactions) {
    if (!tx.asset || tx.asset === 'USD' || tx.asset === 'EUR' || tx.asset === 'GBP') continue

    const key = tx.ticker || tx.asset
    if (!positionMap.has(key)) {
      positionMap.set(key, { buys: [], sells: [], rewards: [] })
    }
    const bucket = positionMap.get(key)!

    switch (tx.type) {
      case 'buy':
      case 'receive':
      case 'deposit':
      case 'trade':
        bucket.buys.push(tx)
        break
      case 'sell':
      case 'send':
      case 'withdrawal':
        bucket.sells.push(tx)
        // Generate tax event for sells
        taxEvents.push({
          type: 'sale',
          description: `Sold ${Math.abs(tx.quantity)} ${tx.ticker || tx.asset} via ${source}`,
          estimatedAmount: Math.abs(tx.totalValue),
          taxTreatment: isHoldingPeriodLong(tx.date) ? 'long_term_cg' : 'short_term_cg',
          expectedDate: tx.date,
          realized: true,
          notes: `Price: $${tx.pricePerUnit.toFixed(4)}, Fee: $${tx.fee.toFixed(2)}`
        })
        break
      case 'staking_reward':
        bucket.rewards.push(tx)
        taxEvents.push({
          type: 'staking_reward',
          description: `Staking reward: ${tx.quantity} ${tx.ticker || tx.asset}`,
          estimatedAmount: tx.totalValue,
          taxTreatment: 'staking_reward',
          expectedDate: tx.date,
          realized: true,
          notes: `FMV at receipt: $${tx.pricePerUnit.toFixed(4)} per unit`
        })
        break
      case 'airdrop':
        bucket.rewards.push(tx)
        taxEvents.push({
          type: 'airdrop',
          description: `Airdrop received: ${tx.quantity} ${tx.ticker || tx.asset}`,
          estimatedAmount: tx.totalValue,
          taxTreatment: 'airdrop',
          expectedDate: tx.date,
          realized: true,
          notes: `FMV at receipt: $${tx.pricePerUnit.toFixed(4)} per unit`
        })
        break
      case 'mining':
        bucket.rewards.push(tx)
        taxEvents.push({
          type: 'mining',
          description: `Mining reward: ${tx.quantity} ${tx.ticker || tx.asset}`,
          estimatedAmount: tx.totalValue,
          taxTreatment: 'mining_income',
          expectedDate: tx.date,
          realized: true,
          notes: `FMV at receipt: $${tx.pricePerUnit.toFixed(4)} per unit`
        })
        break
      case 'conversion':
        bucket.buys.push(tx)
        taxEvents.push({
          type: 'conversion',
          description: `Converted to ${tx.quantity} ${tx.ticker || tx.asset}`,
          estimatedAmount: tx.totalValue,
          taxTreatment: 'short_term_cg',
          expectedDate: tx.date,
          realized: true,
          notes: tx.notes
        })
        break
      case 'dividend':
      case 'interest':
        taxEvents.push({
          type: 'income',
          description: `${tx.type === 'dividend' ? 'Dividend' : 'Interest'}: ${tx.asset}`,
          estimatedAmount: tx.totalValue,
          taxTreatment: 'ordinary_income',
          expectedDate: tx.date,
          realized: true,
          notes: tx.notes
        })
        break
      default:
        break
    }
  }

  const positions: ImportedPosition[] = []

  for (const [ticker, data] of positionMap.entries()) {
    const totalBought = data.buys.reduce((s, t) => s + Math.abs(t.quantity), 0) + data.rewards.reduce((s, t) => s + Math.abs(t.quantity), 0)
    const totalSold = data.sells.reduce((s, t) => s + Math.abs(t.quantity), 0)
    const netQuantity = totalBought - totalSold

    if (netQuantity <= 0.000001) continue // Position fully exited

    const totalCostBasis = data.buys.reduce((s, t) => s + Math.abs(t.totalValue) + t.fee, 0) + data.rewards.reduce((s, t) => s + Math.abs(t.totalValue), 0)
    const soldCostBasisEstimate = totalSold > 0 ? (totalCostBasis / totalBought) * totalSold : 0
    const remainingCostBasis = totalCostBasis - soldCostBasisEstimate

    // Estimate current value using last known price
    const allTxs = [...data.buys, ...data.sells, ...data.rewards].filter(t => t.pricePerUnit > 0)
    const lastPrice = allTxs.length > 0 ? allTxs[allTxs.length - 1].pricePerUnit : (remainingCostBasis / Math.max(netQuantity, 0.001))
    const currentValue = netQuantity * lastPrice

    const earliestBuy = data.buys[0]
    const name = data.buys[0]?.asset || ticker
    const assetClass = inferAssetClass(ticker, name)

    const hasRewards = data.rewards.some(r => r.type === 'staking_reward')
    const hasAirdrops = data.rewards.some(r => r.type === 'airdrop')

    let taxTreatment: TaxTreatment = 'unknown'
    if (hasRewards) taxTreatment = 'staking_reward'
    else if (hasAirdrops) taxTreatment = 'airdrop'
    else if (earliestBuy?.date && isHoldingPeriodLong(earliestBuy.date)) taxTreatment = 'long_term_cg'
    else taxTreatment = 'short_term_cg'

    positions.push({
      name,
      ticker,
      assetClass,
      quantity: netQuantity,
      costBasis: Math.max(0, remainingCostBasis),
      currentValue: Math.max(0, currentValue),
      acquiredDate: earliestBuy?.date,
      taxTreatment,
      tags: [`imported:${source}`, assetClass],
      riskScore: inferRiskScore(assetClass, ticker),
      notes: `Imported from ${source}. ${data.buys.length} buy(s), ${data.sells.length} sell(s), ${data.rewards.length} reward(s).`,
    })
  }

  return { positions, taxEvents }
}

// ─── Exchange-Specific Parsers ──────────────────────────────────────────────

function parseCoinbase(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iTimestamp = idx('timestamp')
  const iType = idx('transaction type')
  const iAsset = idx('asset')
  const iQty = idx('quantity transacted')
  const iPrice = idx('spot price at transaction') !== -1 ? idx('spot price at transaction') : idx('spot price')
  const iTotal = idx('total') !== -1 ? idx('total') : idx('subtotal')
  const iFee = idx('fees and/or spread') !== -1 ? idx('fees and/or spread') : idx('fees')
  const iNotes = idx('notes')

  return rows.map(row => {
    const rawType = (row[iType] || '').toLowerCase()
    let type: RawTransaction['type'] = 'unknown'
    if (rawType === 'buy' || rawType === 'advanced trade buy') type = 'buy'
    else if (rawType === 'sell' || rawType === 'advanced trade sell') type = 'sell'
    else if (rawType === 'receive') type = 'receive'
    else if (rawType === 'send') type = 'send'
    else if (rawType.includes('staking') || rawType.includes('reward')) type = 'staking_reward'
    else if (rawType === 'airdrop') type = 'airdrop'
    else if (rawType.includes('convert') || rawType.includes('swap')) type = 'conversion'
    else if (rawType.includes('earn') || rawType === 'learning reward') type = 'airdrop'
    else type = 'unknown'

    const asset = (row[iAsset] || '').trim()
    return {
      date: parseDate(row[iTimestamp] || ''),
      asset,
      ticker: asset.toUpperCase(),
      type,
      quantity: parseNumber(row[iQty] || ''),
      pricePerUnit: parseNumber(row[iPrice] || ''),
      totalValue: Math.abs(parseNumber(row[iTotal] || '')),
      fee: parseNumber(row[iFee] || ''),
      notes: row[iNotes] || '',
    }
  }).filter(tx => tx.asset && tx.type !== 'unknown')
}

function parseKraken(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iTime = idx('time')
  const iType = idx('type')
  const iAsset = idx('asset')
  const iAmount = idx('amount')
  const iFee = idx('fee')
  const iBalance = idx('balance')

  return rows.map(row => {
    const rawType = (row[iType] || '').toLowerCase()
    let type: RawTransaction['type'] = 'unknown'
    if (rawType === 'trade' || rawType === 'buy') type = 'buy'
    else if (rawType === 'sell') type = 'sell'
    else if (rawType === 'deposit') type = 'deposit'
    else if (rawType === 'withdrawal') type = 'withdrawal'
    else if (rawType === 'staking') type = 'staking_reward'
    else if (rawType === 'transfer') type = 'receive'
    else if (rawType === 'margin') type = 'trade'
    else type = 'unknown'

    let asset = (row[iAsset] || '').trim().toUpperCase()
    // Kraken uses prefixes like XXBT for Bitcoin, XETH for Ethereum, ZUSD for USD
    if (asset.startsWith('X') && asset.length === 4) asset = asset.substring(1)
    if (asset.startsWith('Z') && asset.length === 4) asset = asset.substring(1)
    if (asset === 'XBT') asset = 'BTC'

    const amount = parseNumber(row[iAmount] || '')
    if (amount < 0 && type === 'buy') type = 'sell'
    if (amount > 0 && type === 'sell') type = 'buy'

    return {
      date: parseDate(row[iTime] || ''),
      asset,
      ticker: asset,
      type,
      quantity: Math.abs(amount),
      pricePerUnit: 0, // Kraken ledger doesn't include price directly
      totalValue: Math.abs(amount), // Will need price lookup
      fee: parseNumber(row[iFee] || ''),
      notes: `Kraken ${rawType}`,
    }
  }).filter(tx => tx.asset && !['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'].includes(tx.asset) && tx.type !== 'unknown')
}

function parseBinance(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate = idx('dateutc') !== -1 ? idx('dateutc') : idx('date')
  const iPair = idx('pair') !== -1 ? idx('pair') : idx('market')
  const iType = idx('type') !== -1 ? idx('type') : idx('side')
  const iPrice = idx('price')
  const iQty = idx('executed qty') !== -1 ? idx('executed qty') : (idx('amount') !== -1 ? idx('amount') : idx('qty'))
  const iTotal = idx('total') !== -1 ? idx('total') : idx('total quota')
  const iFee = idx('fee')

  return rows.map(row => {
    const rawType = (row[iType] || '').toLowerCase()
    const pair = (row[iPair] || '').toUpperCase()
    // Extract base asset from pair (e.g., "BTCUSDT" -> "BTC")
    const stables = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR', 'BTC', 'ETH', 'BNB']
    let asset = pair
    for (const s of stables) {
      if (pair.endsWith(s) && pair.length > s.length) {
        asset = pair.substring(0, pair.length - s.length)
        break
      }
    }

    return {
      date: parseDate(row[iDate] || ''),
      asset,
      ticker: asset,
      type: rawType === 'buy' ? 'buy' as const : rawType === 'sell' ? 'sell' as const : 'trade' as const,
      quantity: parseNumber(row[iQty] || ''),
      pricePerUnit: parseNumber(row[iPrice] || ''),
      totalValue: parseNumber(row[iTotal] || ''),
      fee: parseNumber(row[iFee] || ''),
      notes: `Binance ${pair} ${rawType}`,
    }
  }).filter(tx => tx.asset && tx.quantity > 0)
}

function parseRobinhood(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate = idx('activity date') !== -1 ? idx('activity date') : idx('date')
  const iInstrument = idx('instrument') !== -1 ? idx('instrument') : idx('description')
  const iType = idx('trans code') !== -1 ? idx('trans code') : idx('activity type')
  const iQty = idx('quantity')
  const iPrice = idx('price')
  const iAmount = idx('amount')

  return rows.map(row => {
    const rawType = (row[iType] || '').toLowerCase()
    let type: RawTransaction['type'] = 'unknown'
    if (rawType === 'buy' || rawType === 'ach' || rawType.includes('buy')) type = 'buy'
    else if (rawType === 'sell' || rawType.includes('sell')) type = 'sell'
    else if (rawType === 'div' || rawType.includes('dividend')) type = 'dividend'
    else if (rawType.includes('interest')) type = 'interest'
    else type = 'unknown'

    const instrument = (row[iInstrument] || '').trim()
    const ticker = instrument.split(' ')[0].toUpperCase()

    return {
      date: parseDate(row[iDate] || ''),
      asset: instrument || ticker,
      ticker,
      type,
      quantity: Math.abs(parseNumber(row[iQty] || '')),
      pricePerUnit: parseNumber(row[iPrice] || ''),
      totalValue: Math.abs(parseNumber(row[iAmount] || '')),
      fee: 0,
      notes: `Robinhood ${rawType}`,
    }
  }).filter(tx => tx.asset && tx.type !== 'unknown' && tx.quantity > 0)
}

function parseSchwab(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate = idx('date')
  const iAction = idx('action')
  const iSymbol = idx('symbol')
  const iDesc = idx('description')
  const iQty = idx('quantity')
  const iPrice = idx('price')
  const iAmount = idx('amount')
  const iFee = idx('fees  commissions') !== -1 ? idx('fees  commissions') : idx('fees')

  return rows.map(row => {
    const action = (row[iAction] || '').toLowerCase()
    let type: RawTransaction['type'] = 'unknown'
    if (action.includes('buy')) type = 'buy'
    else if (action.includes('sell')) type = 'sell'
    else if (action.includes('dividend') || action.includes('div')) type = 'dividend'
    else if (action.includes('interest')) type = 'interest'
    else if (action.includes('reinvest')) type = 'buy'
    else type = 'unknown'

    const ticker = (row[iSymbol] || '').trim().toUpperCase()
    const desc = (row[iDesc] || '').trim()

    return {
      date: parseDate(row[iDate] || ''),
      asset: desc || ticker,
      ticker,
      type,
      quantity: Math.abs(parseNumber(row[iQty] || '')),
      pricePerUnit: parseNumber(row[iPrice] || ''),
      totalValue: Math.abs(parseNumber(row[iAmount] || '')),
      fee: parseNumber(row[iFee] || ''),
      notes: `Schwab ${action}: ${desc}`,
    }
  }).filter(tx => tx.ticker && tx.type !== 'unknown')
}

function parseFidelity(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate = idx('run date') !== -1 ? idx('run date') : idx('date')
  const iAction = idx('action')
  const iSymbol = idx('symbol')
  const iDesc = idx('security description') !== -1 ? idx('security description') : idx('description')
  const iQty = idx('quantity')
  const iPrice = idx('price')
  const iAmount = idx('amount')
  const iComm = idx('commission')
  const iFee = idx('fees')

  return rows.map(row => {
    const action = (row[iAction] || '').toLowerCase()
    let type: RawTransaction['type'] = 'unknown'
    if (action.includes('bought') || action.includes('buy') || action.includes('reinvestment')) type = 'buy'
    else if (action.includes('sold') || action.includes('sell')) type = 'sell'
    else if (action.includes('dividend')) type = 'dividend'
    else if (action.includes('interest')) type = 'interest'
    else type = 'unknown'

    const ticker = (row[iSymbol] || '').trim().toUpperCase()
    const desc = (row[iDesc] || '').trim()

    return {
      date: parseDate(row[iDate] || ''),
      asset: desc || ticker,
      ticker,
      type,
      quantity: Math.abs(parseNumber(row[iQty] || '')),
      pricePerUnit: parseNumber(row[iPrice] || ''),
      totalValue: Math.abs(parseNumber(row[iAmount] || '')),
      fee: parseNumber(row[iComm] || '') + parseNumber(row[iFee] || ''),
      notes: `Fidelity ${action}: ${desc}`,
    }
  }).filter(tx => tx.ticker && tx.type !== 'unknown')
}

function parseGenericBank(headers: string[], rows: string[][]): RawTransaction[] {
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const iDate = idx('posting date') !== -1 ? idx('posting date') : (idx('transaction date') !== -1 ? idx('transaction date') : idx('date'))
  const iDesc = idx('description') !== -1 ? idx('description') : idx('memo')
  const iAmount = idx('amount')
  const iDebit = idx('debit')
  const iCredit = idx('credit')

  return rows.map(row => {
    let amount: number
    if (iDebit !== -1 && iCredit !== -1) {
      const debit = parseNumber(row[iDebit] || '')
      const credit = parseNumber(row[iCredit] || '')
      amount = credit > 0 ? credit : -debit
    } else {
      amount = parseNumber(row[iAmount] || '')
    }

    const desc = (row[iDesc] || '').trim()
    const type: RawTransaction['type'] = amount >= 0 ? 'deposit' : 'withdrawal'

    return {
      date: parseDate(row[iDate] || ''),
      asset: desc,
      ticker: '',
      type,
      quantity: 1,
      pricePerUnit: Math.abs(amount),
      totalValue: Math.abs(amount),
      fee: 0,
      notes: desc,
    }
  }).filter(tx => tx.totalValue > 0)
}

// ─── Custom CSV with Column Mapping ─────────────────────────────────────────

function parseCustom(headers: string[], rows: string[][], mapping: ColumnMapping): RawTransaction[] {
  return rows.map(row => {
    const typeStr = mapping.type !== undefined ? (row[mapping.type] || '').toLowerCase() : ''
    let type: RawTransaction['type'] = 'unknown'
    if (typeStr.includes('buy') || typeStr.includes('purchase')) type = 'buy'
    else if (typeStr.includes('sell') || typeStr.includes('sale')) type = 'sell'
    else if (typeStr.includes('stake') || typeStr.includes('reward')) type = 'staking_reward'
    else if (typeStr.includes('airdrop')) type = 'airdrop'
    else if (typeStr.includes('convert') || typeStr.includes('swap')) type = 'conversion'
    else if (typeStr.includes('send') || typeStr.includes('transfer out')) type = 'send'
    else if (typeStr.includes('receive') || typeStr.includes('transfer in')) type = 'receive'
    else type = 'buy' // default to buy

    const asset = mapping.asset !== undefined ? (row[mapping.asset] || '').trim() : 'UNKNOWN'
    const qty = mapping.quantity !== undefined ? parseNumber(row[mapping.quantity] || '') : 0
    const price = mapping.price !== undefined ? parseNumber(row[mapping.price] || '') : 0
    const total = mapping.total !== undefined ? parseNumber(row[mapping.total] || '') : (qty * price)

    return {
      date: mapping.date !== undefined ? parseDate(row[mapping.date] || '') : undefined,
      asset,
      ticker: asset.toUpperCase().split(' ')[0],
      type,
      quantity: qty || (total > 0 && price > 0 ? total / price : 1),
      pricePerUnit: price || (total > 0 && qty > 0 ? total / qty : 0),
      totalValue: total || (qty * price),
      fee: mapping.fee !== undefined ? parseNumber(row[mapping.fee] || '') : 0,
      notes: mapping.notes !== undefined ? (row[mapping.notes] || '') : '',
    }
  }).filter(tx => tx.asset && tx.asset !== 'UNKNOWN')
}

// ─── Auto Column Mapping ────────────────────────────────────────────────────

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase()
    if (!mapping.date && (h.includes('date') || h.includes('time') || h.includes('timestamp'))) mapping.date = i
    if (!mapping.asset && (h.includes('asset') || h.includes('currency') || h.includes('symbol') || h.includes('coin') || h.includes('token') || h.includes('ticker') || h.includes('instrument'))) mapping.asset = i
    if (!mapping.type && (h.includes('type') || h.includes('action') || h.includes('side') || h.includes('trans'))) mapping.type = i
    if (!mapping.quantity && (h.includes('quantity') || h.includes('amount') || h.includes('qty') || h.includes('size') || h.includes('volume'))) mapping.quantity = i
    if (!mapping.price && (h.includes('price') || h.includes('rate') || h.includes('spot'))) mapping.price = i
    if (!mapping.total && (h.includes('total') || h.includes('value') || h.includes('cost') || h.includes('proceeds'))) mapping.total = i
    if (!mapping.fee && (h.includes('fee') || h.includes('commission') || h.includes('spread'))) mapping.fee = i
    if (!mapping.notes && (h.includes('note') || h.includes('memo') || h.includes('description') || h.includes('comment'))) mapping.notes = i
  }

  return mapping
}

// ─── Main Import Function ───────────────────────────────────────────────────

export function importCSV(csvText: string, overrideFormat?: SupportedFormat, customMapping?: ColumnMapping): ImportResult {
  const { headers, rows } = parseCSV(csvText)
  const warnings: string[] = []
  let skippedRows = 0

  if (headers.length === 0) {
    return { source: 'Unknown', format: 'unknown', positions: [], taxEvents: [], warnings: ['Could not detect any CSV headers. Please ensure the file is a valid CSV.'], skippedRows: 0, totalRows: 0, rawHeaders: [] }
  }

  const format = overrideFormat || detectFormat(headers)
  let transactions: RawTransaction[] = []

  try {
    switch (format) {
      case 'coinbase':
        transactions = parseCoinbase(headers, rows)
        break
      case 'kraken':
        transactions = parseKraken(headers, rows)
        break
      case 'binance':
        transactions = parseBinance(headers, rows)
        break
      case 'robinhood':
        transactions = parseRobinhood(headers, rows)
        break
      case 'schwab':
        transactions = parseSchwab(headers, rows)
        break
      case 'fidelity':
        transactions = parseFidelity(headers, rows)
        break
      case 'generic_bank':
        transactions = parseGenericBank(headers, rows)
        break
      case 'custom':
        transactions = parseCustom(headers, rows, customMapping || autoMapColumns(headers))
        break
    }
  } catch (err) {
    warnings.push(`Parser error: ${err instanceof Error ? err.message : String(err)}`)
  }

  skippedRows = rows.length - transactions.length
  if (skippedRows > 0) {
    warnings.push(`${skippedRows} rows skipped (unrecognized transaction types, fiat-only, or missing data)`)
  }

  // Sort by date
  transactions.sort((a, b) => {
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })

  const sourceNames: Record<SupportedFormat, string> = {
    coinbase: 'Coinbase',
    kraken: 'Kraken',
    binance: 'Binance',
    robinhood: 'Robinhood',
    schwab: 'Charles Schwab',
    fidelity: 'Fidelity',
    generic_bank: 'Bank Statement',
    custom: 'Custom CSV',
  }

  const { positions, taxEvents } = aggregateToPositions(transactions, sourceNames[format])

  if (positions.length === 0 && taxEvents.length === 0) {
    warnings.push('No positions or tax events could be extracted. The file format may not be recognized or contains only fiat transactions.')
  }

  return {
    source: sourceNames[format],
    format,
    positions,
    taxEvents,
    warnings,
    skippedRows,
    totalRows: rows.length,
    rawHeaders: headers,
  }
}

// ─── Format Info for UI ─────────────────────────────────────────────────────

export const SUPPORTED_FORMATS: { id: SupportedFormat; label: string; description: string; icon: string }[] = [
  { id: 'coinbase', label: 'Coinbase', description: 'Transaction History export (CSV)', icon: '🔵' },
  { id: 'kraken', label: 'Kraken', description: 'Ledger export (CSV)', icon: '🐙' },
  { id: 'binance', label: 'Binance', description: 'Trade History export (CSV)', icon: '🟡' },
  { id: 'robinhood', label: 'Robinhood', description: 'Account Statements / 1099 (CSV)', icon: '🪶' },
  { id: 'schwab', label: 'Charles Schwab', description: 'Transaction History export (CSV)', icon: '🏦' },
  { id: 'fidelity', label: 'Fidelity', description: 'Activity & Orders export (CSV)', icon: '🏛️' },
  { id: 'generic_bank', label: 'Bank Statement', description: 'Chase, Wells Fargo, etc. (CSV)', icon: '🏧' },
  { id: 'custom', label: 'Custom CSV', description: 'Map your own columns', icon: '📄' },
]
