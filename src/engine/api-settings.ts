/**
 * Fortuna Engine — API Settings Manager
 * Manages optional API keys, data source preferences,
 * and real-time data toggle settings.
 *
 * @module api-settings
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface APISettings {
  alphaVantageKey: string | null
  fredAPIKey: string | null // Optional: enables higher rate limits
  enableLiveMarketData: boolean
  enableExchangeRates: boolean
  enableStockQuotes: boolean
  enableSECSearch: boolean
  autoRefreshInterval: number // minutes, 0 = manual only
  preferredCurrency: string
}

const STORAGE_KEY = 'fortuna_api_settings'

const DEFAULT_SETTINGS: APISettings = {
  alphaVantageKey: null,
  fredAPIKey: null,
  enableLiveMarketData: true,
  enableExchangeRates: true,
  enableStockQuotes: true,
  enableSECSearch: true,
  autoRefreshInterval: 30,
  preferredCurrency: 'USD',
}

// ─── Persistence ──────────────────────────────────────────────────────────

export function loadAPISettings(): APISettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch { /* */ }
  return { ...DEFAULT_SETTINGS }
}

export function saveAPISettings(settings: APISettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch { /* */ }
}

// ─── Data Source Registry ─────────────────────────────────────────────────

export interface DataSource {
  id: string
  name: string
  description: string
  url: string
  requiresKey: boolean
  isKeyOptional: boolean
  freeLimit: string
  dataTypes: string[]
  status: 'active' | 'inactive' | 'error'
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'fred',
    name: 'Federal Reserve (FRED)',
    description: 'Fed funds rate, treasury yields, mortgage rates, S&P 500',
    url: 'https://fred.stlouisfed.org',
    requiresKey: false,
    isKeyOptional: true,
    freeLimit: 'No key: CSV access unlimited. With key: 120 req/min',
    dataTypes: ['interest_rates', 'inflation', 'market_indices'],
    status: 'active',
  },
  {
    id: 'bls',
    name: 'Bureau of Labor Statistics',
    description: 'CPI inflation, employment data, regional price indices',
    url: 'https://api.bls.gov',
    requiresKey: false,
    isKeyOptional: true,
    freeLimit: 'v1: 25 req/day (no key). v2: 500 req/day (with key)',
    dataTypes: ['cpi', 'inflation', 'employment'],
    status: 'active',
  },
  {
    id: 'treasury',
    name: 'Treasury Fiscal Data',
    description: 'Treasury bill/note/bond rates, national debt, interest rates',
    url: 'https://fiscaldata.treasury.gov',
    requiresKey: false,
    isKeyOptional: false,
    freeLimit: 'Unlimited — open government data',
    dataTypes: ['treasury_rates', 'government_debt'],
    status: 'active',
  },
  {
    id: 'exchange',
    name: 'Open Exchange Rate API',
    description: 'Real-time currency conversion for foreign income (Form 1116)',
    url: 'https://open.er-api.com',
    requiresKey: false,
    isKeyOptional: false,
    freeLimit: '~1,500 req/month — no key needed',
    dataTypes: ['exchange_rates', 'currency_conversion'],
    status: 'active',
  },
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    description: 'Stock quotes, 52-week ranges, volume, market cap',
    url: 'https://finance.yahoo.com',
    requiresKey: false,
    isKeyOptional: false,
    freeLimit: 'Public endpoints — rate limited',
    dataTypes: ['stock_quotes', 'market_data'],
    status: 'active',
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    description: 'Stock quotes, company fundamentals, technical indicators',
    url: 'https://www.alphavantage.co',
    requiresKey: true,
    isKeyOptional: true,
    freeLimit: '25 req/day (free key). Sign up at alphavantage.co/support/#api-key',
    dataTypes: ['stock_quotes', 'fundamentals', 'technical_analysis'],
    status: 'inactive',
  },
  {
    id: 'sec',
    name: 'SEC EDGAR',
    description: 'Company filings, entity research, S-Corp/C-Corp analysis',
    url: 'https://www.sec.gov/cgi-bin/browse-edgar',
    requiresKey: false,
    isKeyOptional: false,
    freeLimit: '10 req/sec with User-Agent header',
    dataTypes: ['sec_filings', 'company_info', 'industry_data'],
    status: 'active',
  },
]

/** Get all active data sources */
export function getActiveDataSources(settings: APISettings): DataSource[] {
  return DATA_SOURCES.filter(ds => {
    if (!settings.enableLiveMarketData) return false
    if (ds.id === 'exchange' && !settings.enableExchangeRates) return false
    if ((ds.id === 'yahoo' || ds.id === 'alphavantage') && !settings.enableStockQuotes) return false
    if (ds.id === 'sec' && !settings.enableSECSearch) return false
    if (ds.requiresKey && !ds.isKeyOptional) {
      // Check if key is provided
      if (ds.id === 'alphavantage' && !settings.alphaVantageKey) return false
    }
    return true
  })
}
