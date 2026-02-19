/**
 * Fortuna Engine - Stock Quote API
 * Real-time and historical stock data for portfolio intelligence.
 *
 * Sources:
 *   - Alpha Vantage (free tier: 25 calls/day, needs key)
 *   - Yahoo Finance v8 (unofficial, no key needed)
 *
 * @module stock-quotes
 */

import { cachedFetch, TTL, apiCache } from './api-cache'

// ─── Types ────────────────────────────────────────────────────────────────

export interface StockQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  high52Week?: number
  low52Week?: number
  peRatio?: number
  dividendYield?: number
  lastUpdated: string
  source: string
}

export interface PortfolioValuation {
  holdings: {
    symbol: string
    quantity: number
    costBasis: number
    currentPrice: number
    currentValue: number
    unrealizedGain: number
    unrealizedGainPct: number
    isLongTerm: boolean
    estimatedTax: number
  }[]
  totalCostBasis: number
  totalCurrentValue: number
  totalUnrealizedGain: number
  totalEstimatedTax: number
  lastUpdated: string
}

export interface DividendInfo {
  symbol: string
  annualDividend: number
  dividendYield: number
  exDividendDate?: string
  paymentDate?: string
  qualified: boolean // Qualified dividends get preferential tax treatment
}

// ─── API Configuration ────────────────────────────────────────────────────

let alphaVantageKey: string | null = null

export function setAlphaVantageKey(key: string): void {
  alphaVantageKey = key
}

// ─── Yahoo Finance (No key required) ──────────────────────────────────────
// Using the public quote endpoint

interface YahooQuoteResponse {
  chart: {
    result: {
      meta: {
        symbol: string
        regularMarketPrice: number
        previousClose: number
        regularMarketVolume: number
        fiftyTwoWeekHigh: number
        fiftyTwoWeekLow: number
      }
      indicators: {
        quote: { close: number[]; volume: number[] }[]
      }
    }[]
  }
}

/** Fetch quote from Yahoo Finance (no key needed) */
async function fetchYahooQuote(symbol: string): Promise<StockQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`

  const data = await cachedFetch<YahooQuoteResponse>(url, {
    cacheKey: `yahoo_${symbol}`,
    cacheTTL: TTL.MINUTES_30,
    provider: 'alphavantage', // Share rate limit pool
    headers: { 'User-Agent': 'FortunaEngine/10.8' },
  })

  if (!data?.chart?.result?.[0]) return null

  const meta = data.chart.result[0].meta
  const change = meta.regularMarketPrice - meta.previousClose
  const changePct = meta.previousClose > 0 ? (change / meta.previousClose) * 100 : 0

  return {
    symbol: meta.symbol,
    price: meta.regularMarketPrice,
    change: Number(change.toFixed(2)),
    changePercent: Number(changePct.toFixed(2)),
    volume: meta.regularMarketVolume,
    high52Week: meta.fiftyTwoWeekHigh,
    low52Week: meta.fiftyTwoWeekLow,
    lastUpdated: new Date().toISOString(),
    source: 'yahoo',
  }
}

// ─── Alpha Vantage (Free tier: 25 calls/day) ─────────────────────────────

interface AVGlobalQuote {
  'Global Quote': {
    '01. symbol': string
    '05. price': string
    '09. change': string
    '10. change percent': string
    '06. volume': string
  }
}

/** Fetch quote from Alpha Vantage (needs API key) */
async function fetchAlphaVantageQuote(symbol: string): Promise<StockQuote | null> {
  if (!alphaVantageKey) return null

  const data = await cachedFetch<AVGlobalQuote>(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${alphaVantageKey}`,
    { cacheKey: `av_${symbol}`, cacheTTL: TTL.MINUTES_30, provider: 'alphavantage' },
  )

  if (!data?.['Global Quote']?.['05. price']) return null

  const q = data['Global Quote']
  return {
    symbol: q['01. symbol'],
    price: parseFloat(q['05. price']),
    change: parseFloat(q['09. change']),
    changePercent: parseFloat(q['10. change percent']?.replace('%', '') || '0'),
    volume: parseInt(q['06. volume']),
    lastUpdated: new Date().toISOString(),
    source: 'alphavantage',
  }
}

// ─── Unified Quote Fetcher ────────────────────────────────────────────────

/** Fetch stock quote, trying multiple sources */
export async function fetchQuote(symbol: string): Promise<StockQuote | null> {
  // Try Yahoo first (no key needed)
  const yahoo = await fetchYahooQuote(symbol)
  if (yahoo) return yahoo

  // Fall back to Alpha Vantage
  const av = await fetchAlphaVantageQuote(symbol)
  if (av) return av

  return null
}

/** Fetch multiple quotes in batch */
export async function fetchQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>()

  // Check cache first for all, only fetch missing
  const toFetch: string[] = []
  for (const sym of symbols) {
    const cached = apiCache.get<StockQuote>(`yahoo_${sym}`) || apiCache.get<StockQuote>(`av_${sym}`)
    if (cached) {
      results.set(sym, cached)
    } else {
      toFetch.push(sym)
    }
  }

  // Fetch missing (with rate limit awareness)
  for (const sym of toFetch) {
    const quote = await fetchQuote(sym)
    if (quote) results.set(sym, quote)
    // Small delay between requests to be nice
    if (toFetch.indexOf(sym) < toFetch.length - 1) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return results
}

// ─── Portfolio Valuation ──────────────────────────────────────────────────

export interface PortfolioHolding {
  symbol: string
  quantity: number
  costBasis: number
  acquiredDate: string
  entityId?: string
}

/** Value a portfolio with real-time prices and tax estimates */
export async function valuePortfolio(
  holdings: PortfolioHolding[],
  marginalRate: number = 0.24,
  longTermRate: number = 0.15,
): Promise<PortfolioValuation> {
  const symbols = [...new Set(holdings.map(h => h.symbol))]
  const quotes = await fetchQuotes(symbols)

  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const valuedHoldings = holdings.map(h => {
    const quote = quotes.get(h.symbol)
    const price = quote?.price ?? 0
    const currentValue = price * h.quantity
    const gain = currentValue - h.costBasis
    const isLongTerm = new Date(h.acquiredDate) < oneYearAgo
    const taxRate = isLongTerm ? longTermRate : marginalRate
    const estimatedTax = gain > 0 ? gain * taxRate : gain * marginalRate * 0.5 // Losses offset at marginal

    return {
      symbol: h.symbol,
      quantity: h.quantity,
      costBasis: h.costBasis,
      currentPrice: price,
      currentValue: Number(currentValue.toFixed(2)),
      unrealizedGain: Number(gain.toFixed(2)),
      unrealizedGainPct: h.costBasis > 0 ? Number(((gain / h.costBasis) * 100).toFixed(2)) : 0,
      isLongTerm,
      estimatedTax: Number(estimatedTax.toFixed(2)),
    }
  })

  return {
    holdings: valuedHoldings,
    totalCostBasis: valuedHoldings.reduce((s, h) => s + h.costBasis, 0),
    totalCurrentValue: valuedHoldings.reduce((s, h) => s + h.currentValue, 0),
    totalUnrealizedGain: valuedHoldings.reduce((s, h) => s + h.unrealizedGain, 0),
    totalEstimatedTax: valuedHoldings.reduce((s, h) => s + h.estimatedTax, 0),
    lastUpdated: new Date().toISOString(),
  }
}

// ─── Tax-Loss Harvesting Scanner ──────────────────────────────────────────

export interface TaxLossCandidate {
  symbol: string
  quantity: number
  costBasis: number
  currentValue: number
  unrealizedLoss: number
  taxSavings: number
  isLongTerm: boolean
  daysHeld: number
  recommendation: string
}

/** Scan portfolio for tax-loss harvesting opportunities with real prices */
export async function scanTaxLossHarvesting(
  holdings: PortfolioHolding[],
  marginalRate: number = 0.24,
  capitalGainRate: number = 0.15,
): Promise<TaxLossCandidate[]> {
  const symbols = [...new Set(holdings.map(h => h.symbol))]
  const quotes = await fetchQuotes(symbols)

  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const candidates: TaxLossCandidate[] = []

  for (const h of holdings) {
    const quote = quotes.get(h.symbol)
    if (!quote) continue

    const currentValue = quote.price * h.quantity
    const gain = currentValue - h.costBasis

    if (gain >= 0) continue // Only losses

    const acquiredDate = new Date(h.acquiredDate)
    const isLongTerm = acquiredDate < oneYearAgo
    const daysHeld = Math.floor((now.getTime() - acquiredDate.getTime()) / (1000 * 60 * 60 * 24))
    const loss = Math.abs(gain)

    // Tax savings: short-term losses offset at marginal rate, long-term at cap gains rate
    const taxSavings = isLongTerm ? loss * capitalGainRate : loss * marginalRate

    let recommendation = ''
    if (loss > 3000 && !isLongTerm) {
      recommendation = `Harvest $${loss.toLocaleString()} short-term loss — saves $${taxSavings.toLocaleString()} at ${(marginalRate * 100).toFixed(0)}% rate`
    } else if (loss > 5000 && isLongTerm) {
      recommendation = `Harvest $${loss.toLocaleString()} long-term loss — saves $${taxSavings.toLocaleString()}`
    } else if (loss > 1000) {
      recommendation = `Minor loss ($${loss.toLocaleString()}) — consider if approaching year-end`
    } else {
      continue // Too small to bother
    }

    candidates.push({
      symbol: h.symbol,
      quantity: h.quantity,
      costBasis: h.costBasis,
      currentValue: Number(currentValue.toFixed(2)),
      unrealizedLoss: Number(loss.toFixed(2)),
      taxSavings: Number(taxSavings.toFixed(2)),
      isLongTerm,
      daysHeld,
      recommendation,
    })
  }

  // Sort by tax savings descending
  candidates.sort((a, b) => b.taxSavings - a.taxSavings)
  return candidates
}
