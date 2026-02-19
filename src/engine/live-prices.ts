/**
 * FORTUNA ENGINE — Live Price Feed v1
 * 
 * Real-time price lookups for portfolio positions:
 *   - CoinGecko API (free tier) for crypto/DeFi tokens
 *   - Ticker-to-CoinGecko-ID mapping for common assets
 *   - Batch price fetching (reduces API calls)
 *   - Cache layer (5-min TTL) to respect rate limits
 *   - Fallback estimates for unknown/illiquid tokens
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PriceData {
  ticker: string
  priceUSD: number
  change24h: number | null
  change7d: number | null
  marketCap: number | null
  volume24h: number | null
  lastUpdated: string
  source: 'coingecko' | 'cache' | 'manual' | 'unknown'
}

export interface PriceFeedResult {
  prices: Record<string, PriceData>
  errors: string[]
  fromCache: number
  fromAPI: number
  timestamp: string
}

// ─── Ticker → CoinGecko ID Map ─────────────────────────────────────────────

const TICKER_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
  DOT: 'polkadot', AVAX: 'avalanche-2', MATIC: 'matic-network',
  LINK: 'chainlink', XRP: 'ripple', BNB: 'binancecoin',
  DOGE: 'dogecoin', SHIB: 'shiba-inu', LTC: 'litecoin',
  UNI: 'uniswap', AAVE: 'aave', ATOM: 'cosmos',
  NEAR: 'near', FTM: 'fantom', ALGO: 'algorand',
  XLM: 'stellar', VET: 'vechain', HBAR: 'hedera-hashgraph',
  ICP: 'internet-computer', FIL: 'filecoin', GRT: 'the-graph',
  SAND: 'the-sandbox', MANA: 'decentraland', APE: 'apecoin',
  CRV: 'curve-dao-token', MKR: 'maker', SNX: 'havven',
  COMP: 'compound-governance-token', SUSHI: 'sushi',
  YFI: 'yearn-finance', BAL: 'balancer',
  REN: 'republic-protocol', CAKE: 'pancakeswap-token',
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
  BUSD: 'binance-usd', FRAX: 'frax',
  OP: 'optimism', ARB: 'arbitrum', SUI: 'sui',
  SEI: 'sei-network', TIA: 'celestia', INJ: 'injective-protocol',
  DYDX: 'dydx-chain', GMX: 'gmx', PENDLE: 'pendle',
  WLD: 'worldcoin-wld', RNDR: 'render-token', FET: 'fetch-ai',
  TAO: 'bittensor', BONK: 'bonk', WIF: 'dogwifcoin',
  PEPE: 'pepe', FLOKI: 'floki',
  STX: 'blockstack', RUNE: 'thorchain', OSMO: 'osmosis',
  PYTH: 'pyth-network', JUP: 'jupiter-exchange-solana',
  TRX: 'tron', TON: 'the-open-network', KAS: 'kaspa',
  APT: 'aptos', EGLD: 'elrond-erd-2',
  // DePIN / Travis-relevant
  HNT: 'helium', MOBILE: 'helium-mobile', IOT: 'helium-iot',
  IOTX: 'iotex', DIMO: 'dimo', HONEY: 'hivemapper',
  RENDER: 'render-token', AKT: 'akash-network',
  AR: 'arweave', GRASS: 'grass',
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const priceCache = new Map<string, { data: PriceData; expires: number }>()

function getCached(ticker: string): PriceData | null {
  const entry = priceCache.get(ticker.toUpperCase())
  if (entry && Date.now() < entry.expires) return { ...entry.data, source: 'cache' }
  return null
}

function setCache(ticker: string, data: PriceData) {
  priceCache.set(ticker.toUpperCase(), { data, expires: Date.now() + CACHE_TTL })
}

export function clearPriceCache() {
  priceCache.clear()
}

// ─── CoinGecko Fetch ────────────────────────────────────────────────────────

async function fetchCoinGeckoPrices(coinIds: string[]): Promise<Record<string, { usd: number; usd_24h_change?: number; usd_market_cap?: number; usd_24h_vol?: number }>> {
  if (coinIds.length === 0) return {}
  
  // CoinGecko free API: max ~250 IDs per call, 10-30 calls/min
  const batchSize = 100
  const results: Record<string, any> = {}
  
  for (let i = 0; i < coinIds.length; i += batchSize) {
    const batch = coinIds.slice(i, i + batchSize)
    const idsParam = batch.join(',')
    
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`
      const response = await fetch(url)
      
      if (response.status === 429) {
        // Rate limited — wait and retry once
        await new Promise(r => setTimeout(r, 2000))
        const retry = await fetch(url)
        if (retry.ok) {
          const data = await retry.json()
          Object.assign(results, data)
        }
      } else if (response.ok) {
        const data = await response.json()
        Object.assign(results, data)
      }
    } catch (err) {
      console.warn(`CoinGecko fetch error for batch ${i}:`, err)
    }
    
    // Rate limit spacing
    if (i + batchSize < coinIds.length) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }
  
  return results
}

// ─── Main Price Fetch ───────────────────────────────────────────────────────

export async function fetchPrices(tickers: string[]): Promise<PriceFeedResult> {
  const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))]
  const prices: Record<string, PriceData> = {}
  const errors: string[] = []
  let fromCache = 0
  let fromAPI = 0
  
  // Step 1: Check cache
  const needsFetch: string[] = []
  for (const ticker of uniqueTickers) {
    const cached = getCached(ticker)
    if (cached) {
      prices[ticker] = cached
      fromCache++
    } else {
      needsFetch.push(ticker)
    }
  }
  
  if (needsFetch.length === 0) {
    return { prices, errors, fromCache, fromAPI, timestamp: new Date().toISOString() }
  }
  
  // Step 2: Map tickers to CoinGecko IDs
  const tickerToId: Record<string, string> = {}
  const idToTicker: Record<string, string> = {}
  const unknownTickers: string[] = []
  
  for (const ticker of needsFetch) {
    const geckoId = TICKER_TO_COINGECKO[ticker]
    if (geckoId) {
      tickerToId[ticker] = geckoId
      idToTicker[geckoId] = ticker
    } else {
      unknownTickers.push(ticker)
    }
  }
  
  // Step 3: Fetch from CoinGecko
  const geckoIds = Object.values(tickerToId)
  if (geckoIds.length > 0) {
    try {
      const geckoData = await fetchCoinGeckoPrices(geckoIds)
      
      for (const [geckoId, data] of Object.entries(geckoData)) {
        const ticker = idToTicker[geckoId]
        if (ticker && data.usd) {
          const priceData: PriceData = {
            ticker,
            priceUSD: data.usd,
            change24h: data.usd_24h_change ?? null,
            change7d: null,
            marketCap: data.usd_market_cap ?? null,
            volume24h: data.usd_24h_vol ?? null,
            lastUpdated: new Date().toISOString(),
            source: 'coingecko',
          }
          prices[ticker] = priceData
          setCache(ticker, priceData)
          fromAPI++
        }
      }
    } catch (err) {
      errors.push(`CoinGecko API error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  
  // Step 4: Handle unknown tickers
  for (const ticker of unknownTickers) {
    // Try CoinGecko search as fallback
    try {
      const searchUrl = `https://api.coingecko.com/api/v3/search?query=${ticker.toLowerCase()}`
      const searchResp = await fetch(searchUrl)
      if (searchResp.ok) {
        const searchData = await searchResp.json()
        const coin = searchData.coins?.[0]
        if (coin) {
          // Cache the mapping for next time
          TICKER_TO_COINGECKO[ticker] = coin.id
          const priceResp = await fetchCoinGeckoPrices([coin.id])
          const data = priceResp[coin.id]
          if (data?.usd) {
            const priceData: PriceData = {
              ticker,
              priceUSD: data.usd,
              change24h: data.usd_24h_change ?? null,
              change7d: null,
              marketCap: data.usd_market_cap ?? null,
              volume24h: data.usd_24h_vol ?? null,
              lastUpdated: new Date().toISOString(),
              source: 'coingecko',
            }
            prices[ticker] = priceData
            setCache(ticker, priceData)
            fromAPI++
            continue
          }
        }
      }
    } catch {
      // Search failed, mark unknown
    }
    
    prices[ticker] = {
      ticker,
      priceUSD: 0,
      change24h: null,
      change7d: null,
      marketCap: null,
      volume24h: null,
      lastUpdated: new Date().toISOString(),
      source: 'unknown',
    }
    errors.push(`No price data found for ${ticker}`)
  }
  
  // Stablecoins — hardcode to $1
  for (const stable of ['USDT', 'USDC', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'USDP']) {
    if (prices[stable] && Math.abs(prices[stable].priceUSD - 1) < 0.05) continue
    if (uniqueTickers.includes(stable) && !prices[stable]) {
      prices[stable] = {
        ticker: stable, priceUSD: 1.00, change24h: 0, change7d: 0,
        marketCap: null, volume24h: null,
        lastUpdated: new Date().toISOString(), source: 'manual',
      }
    }
  }
  
  return { prices, errors, fromCache, fromAPI, timestamp: new Date().toISOString() }
}

// ─── Single Price Lookup ────────────────────────────────────────────────────

export async function fetchPrice(ticker: string): Promise<PriceData | null> {
  const result = await fetchPrices([ticker])
  return result.prices[ticker.toUpperCase()] || null
}

// ─── Portfolio Value Update ─────────────────────────────────────────────────

export interface PortfolioValuation {
  totalCurrentValue: number
  totalCostBasis: number
  totalGainLoss: number
  totalGainLossPct: number
  positionValues: { ticker: string; quantity: number; price: number; value: number; gainLoss: number; gainLossPct: number }[]
  pricesUpdated: number
  priceErrors: string[]
  timestamp: string
}

export async function updatePortfolioValues(
  positions: { ticker?: string; quantity: number; costBasis: number; currentValue: number }[]
): Promise<PortfolioValuation> {
  const tickers = positions.map(p => p.ticker).filter((t): t is string => !!t && t.length > 0)
  const feedResult = await fetchPrices(tickers)
  
  let totalCurrentValue = 0
  let totalCostBasis = 0
  const positionValues: PortfolioValuation['positionValues'] = []
  
  for (const pos of positions) {
    const ticker = (pos.ticker || '').toUpperCase()
    const priceData = feedResult.prices[ticker]
    const price = priceData?.priceUSD || 0
    const value = price > 0 ? pos.quantity * price : pos.currentValue
    const gainLoss = value - pos.costBasis
    const gainLossPct = pos.costBasis > 0 ? (gainLoss / pos.costBasis) * 100 : 0
    
    totalCurrentValue += value
    totalCostBasis += pos.costBasis
    
    positionValues.push({ ticker, quantity: pos.quantity, price, value, gainLoss, gainLossPct })
  }
  
  return {
    totalCurrentValue,
    totalCostBasis,
    totalGainLoss: totalCurrentValue - totalCostBasis,
    totalGainLossPct: totalCostBasis > 0 ? ((totalCurrentValue - totalCostBasis) / totalCostBasis) * 100 : 0,
    positionValues,
    pricesUpdated: feedResult.fromAPI,
    priceErrors: feedResult.errors,
    timestamp: feedResult.timestamp,
  }
}

// ─── Format Helpers ─────────────────────────────────────────────────────────

export function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (price >= 0.01) return `$${price.toFixed(4)}`
  if (price >= 0.0001) return `$${price.toFixed(6)}`
  return `$${price.toFixed(8)}`
}

export function formatChange(change: number | null): { text: string; color: string } {
  if (change === null) return { text: '—', color: '#888' }
  const sign = change >= 0 ? '+' : ''
  return {
    text: `${sign}${change.toFixed(2)}%`,
    color: change >= 0 ? '#10b981' : '#ef4444',
  }
}
