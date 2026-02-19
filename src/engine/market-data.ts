/**
 * Fortuna Engine - Market Data API Integrations
 * Real-time macro-economic data from free government APIs.
 *
 * Sources:
 *   - FRED (Federal Reserve Economic Data) — Fed funds rate, treasury yields
 *   - Treasury Fiscal Data — Treasury bill/note/bond rates
 *   - BLS (Bureau of Labor Statistics) — CPI, inflation
 *
 * All APIs are free with no key required (BLS v1, FRED CSV, Treasury).
 *
 * @module market-data
 */

import { cachedFetch, cachedFetchCSV, TTL } from './api-cache'

// ─── Types ────────────────────────────────────────────────────────────────

export interface MacroSnapshot {
  fedFundsRate: number | null       // Current federal funds effective rate (%)
  cpiLatest: number | null          // Latest CPI-U index value
  cpiYoYChange: number | null       // Year-over-year CPI change (%)
  inflationRate: number | null      // Annualized inflation rate (%)
  treasuryBillRate: number | null   // T-Bill average rate (%)
  treasuryNoteRate: number | null   // T-Note average rate (%)
  treasuryBondRate: number | null   // T-Bond average rate (%)
  iBondCompositeRate: number | null // Estimated I-Bond composite rate (%)
  underpaymentPenaltyRate: number | null // IRS underpayment penalty rate (fed funds + 3%)
  lastUpdated: string
  sources: string[]
}

export interface CPIData {
  year: string
  period: string
  periodName: string
  value: number
  latest: boolean
}

export interface TreasuryRate {
  recordDate: string
  securityDesc: string
  avgRate: number
}

// ─── FRED — Federal Reserve Economic Data ─────────────────────────────────
// Using CSV endpoint (no API key required)

const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv'

/** Fetch federal funds effective rate from FRED */
export async function fetchFedFundsRate(): Promise<number | null> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 6)
  const cosd = startDate.toISOString().split('T')[0]

  const rows = await cachedFetchCSV(
    `${FRED_CSV_BASE}?id=FEDFUNDS&cosd=${cosd}`,
    { cacheKey: 'fred_fedfunds', cacheTTL: TTL.HOURS_12, provider: 'fred' },
  )

  if (!rows || rows.length < 2) return null

  // Last row has most recent data
  const lastRow = rows[rows.length - 1]
  const rate = parseFloat(lastRow[1])
  return isNaN(rate) ? null : rate
}

/** Fetch 10-year Treasury constant maturity rate */
export async function fetchTreasury10Y(): Promise<number | null> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 3)
  const cosd = startDate.toISOString().split('T')[0]

  const rows = await cachedFetchCSV(
    `${FRED_CSV_BASE}?id=DGS10&cosd=${cosd}`,
    { cacheKey: 'fred_dgs10', cacheTTL: TTL.HOURS_12, provider: 'fred' },
  )

  if (!rows || rows.length < 2) return null

  // Find last non-empty value (FRED uses "." for missing)
  for (let i = rows.length - 1; i >= 1; i--) {
    const val = parseFloat(rows[i][1])
    if (!isNaN(val)) return val
  }
  return null
}

/** Fetch 30-year mortgage rate */
export async function fetchMortgageRate(): Promise<number | null> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 3)
  const cosd = startDate.toISOString().split('T')[0]

  const rows = await cachedFetchCSV(
    `${FRED_CSV_BASE}?id=MORTGAGE30US&cosd=${cosd}`,
    { cacheKey: 'fred_mortgage30', cacheTTL: TTL.DAY_1, provider: 'fred' },
  )

  if (!rows || rows.length < 2) return null
  for (let i = rows.length - 1; i >= 1; i--) {
    const val = parseFloat(rows[i][1])
    if (!isNaN(val)) return val
  }
  return null
}

/** Fetch S&P 500 earnings yield (for equity premium comparisons) */
export async function fetchSP500EarningsYield(): Promise<number | null> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 6)
  const cosd = startDate.toISOString().split('T')[0]

  const rows = await cachedFetchCSV(
    `${FRED_CSV_BASE}?id=SP500&cosd=${cosd}`,
    { cacheKey: 'fred_sp500', cacheTTL: TTL.HOURS_6, provider: 'fred' },
  )

  if (!rows || rows.length < 2) return null
  for (let i = rows.length - 1; i >= 1; i--) {
    const val = parseFloat(rows[i][1])
    if (!isNaN(val)) return val
  }
  return null
}

// ─── BLS — Bureau of Labor Statistics ─────────────────────────────────────
// v1 API: no key needed, 25 queries/day

const BLS_BASE = 'https://api.bls.gov/publicAPI/v1/timeseries/data'

interface BLSResponse {
  status: string
  Results: {
    series: {
      seriesID: string
      data: {
        year: string
        period: string
        periodName: string
        latest?: string
        value: string
      }[]
    }[]
  }
}

/** Fetch latest CPI-U (Consumer Price Index for All Urban Consumers) */
export async function fetchCPI(): Promise<CPIData[] | null> {
  const data = await cachedFetch<BLSResponse>(
    `${BLS_BASE}/CUUR0000SA0?latest=true`,
    { cacheKey: 'bls_cpi', cacheTTL: TTL.DAY_1, provider: 'bls' },
  )

  if (!data?.Results?.series?.[0]?.data) return null

  return data.Results.series[0].data.map(d => ({
    year: d.year,
    period: d.period,
    periodName: d.periodName,
    value: parseFloat(d.value),
    latest: d.latest === 'true',
  }))
}

/** Calculate year-over-year inflation from CPI data */
export function calcInflationFromCPI(cpiData: CPIData[]): number | null {
  if (!cpiData || cpiData.length < 2) return null

  // Latest monthly
  const monthlyData = cpiData.filter(d => d.period !== 'M13') // Exclude annual averages
  if (monthlyData.length < 2) return null

  // Sort by year+period descending
  monthlyData.sort((a, b) => {
    const yearDiff = parseInt(b.year) - parseInt(a.year)
    if (yearDiff !== 0) return yearDiff
    return parseInt(b.period.replace('M', '')) - parseInt(a.period.replace('M', ''))
  })

  const latest = monthlyData[0]

  // Find same month previous year
  const prevYear = (parseInt(latest.year) - 1).toString()
  const sameMonthPrevYear = monthlyData.find(d => d.year === prevYear && d.period === latest.period)

  if (sameMonthPrevYear) {
    return ((latest.value - sameMonthPrevYear.value) / sameMonthPrevYear.value) * 100
  }

  // Fallback: use annual averages if available
  const annuals = cpiData.filter(d => d.period === 'M13').sort((a, b) => parseInt(b.year) - parseInt(a.year))
  if (annuals.length >= 2) {
    return ((annuals[0].value - annuals[1].value) / annuals[1].value) * 100
  }

  return null
}

/** Fetch state-level CPI (available for select metro areas) */
export async function fetchRegionalCPI(regionCode: string): Promise<CPIData[] | null> {
  // BLS regional CPI series: CUUR + area code + SA0
  // e.g., CUURA207SA0 = Chicago metro
  const data = await cachedFetch<BLSResponse>(
    `${BLS_BASE}/${regionCode}?latest=true`,
    { cacheKey: `bls_cpi_${regionCode}`, cacheTTL: TTL.DAY_1, provider: 'bls' },
  )

  if (!data?.Results?.series?.[0]?.data) return null
  return data.Results.series[0].data.map(d => ({
    year: d.year,
    period: d.period,
    periodName: d.periodName,
    value: parseFloat(d.value),
    latest: d.latest === 'true',
  }))
}

// Regional CPI codes for major metros
export const REGIONAL_CPI_CODES: Record<string, string> = {
  'NY': 'CUURA101SA0',   // New York-Newark-Jersey City
  'CA_LA': 'CUURA421SA0', // Los Angeles-Long Beach-Anaheim
  'CA_SF': 'CUURA422SA0', // San Francisco-Oakland-Hayward
  'IL': 'CUURA207SA0',    // Chicago-Naperville-Elgin
  'TX_DA': 'CUURA316SA0', // Dallas-Fort Worth-Arlington
  'TX_HO': 'CUURA318SA0', // Houston-The Woodlands-Sugar Land
  'FL_MI': 'CUURA320SA0', // Miami-Fort Lauderdale-West Palm Beach
  'DC': 'CUURA311SA0',    // Washington-Arlington-Alexandria
  'MA': 'CUURA103SA0',    // Boston-Cambridge-Newton
  'WA': 'CUURA423SA0',    // Seattle-Tacoma-Bellevue
  'GA': 'CUURA319SA0',    // Atlanta-Sandy Springs-Roswell
  'AZ': 'CUURA429SA0',    // Phoenix-Mesa-Scottsdale
}

// ─── Treasury Fiscal Data ─────────────────────────────────────────────────
// No key required

const TREASURY_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'

interface TreasuryResponse {
  data: {
    record_date: string
    security_type_desc: string
    security_desc: string
    avg_interest_rate_amt: string
  }[]
}

/** Fetch current Treasury rates (bills, notes, bonds) */
export async function fetchTreasuryRates(): Promise<TreasuryRate[] | null> {
  const data = await cachedFetch<TreasuryResponse>(
    `${TREASURY_BASE}/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=20&format=json`,
    { cacheKey: 'treasury_rates', cacheTTL: TTL.DAY_1, provider: 'treasury' },
  )

  if (!data?.data) return null

  return data.data.map(d => ({
    recordDate: d.record_date,
    securityDesc: d.security_desc,
    avgRate: parseFloat(d.avg_interest_rate_amt),
  }))
}

/** Extract specific treasury rates from full data */
export function extractTreasuryRates(rates: TreasuryRate[]): {
  tBill: number | null
  tNote: number | null
  tBond: number | null
} {
  // Get most recent record date
  const latestDate = rates[0]?.recordDate
  const latest = rates.filter(r => r.recordDate === latestDate)

  const tBill = latest.find(r => r.securityDesc === 'Treasury Bills')?.avgRate ?? null
  const tNote = latest.find(r => r.securityDesc === 'Treasury Notes')?.avgRate ?? null
  const tBond = latest.find(r => r.securityDesc === 'Treasury Bonds')?.avgRate ?? null

  return { tBill, tNote, tBond }
}

// ─── Treasury Debt to Penny (National Debt) ───────────────────────────────

interface DebtResponse {
  data: {
    record_date: string
    tot_pub_debt_out_amt: string
  }[]
}

/** Fetch current national debt (for macro context) */
export async function fetchNationalDebt(): Promise<{ date: string; amount: number } | null> {
  const data = await cachedFetch<DebtResponse>(
    `${TREASURY_BASE}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1&format=json`,
    { cacheKey: 'treasury_debt', cacheTTL: TTL.WEEK_1, provider: 'treasury' },
  )

  if (!data?.data?.[0]) return null
  return {
    date: data.data[0].record_date,
    amount: parseFloat(data.data[0].tot_pub_debt_out_amt),
  }
}

// ─── Composite Snapshot ───────────────────────────────────────────────────

/** Fetch all macro data in parallel, returning a unified snapshot */
export async function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  const sources: string[] = []

  const [fedRate, cpi, treasuryRates] = await Promise.all([
    fetchFedFundsRate(),
    fetchCPI(),
    fetchTreasuryRates(),
  ])

  if (fedRate !== null) sources.push('FRED')
  if (cpi !== null) sources.push('BLS')
  if (treasuryRates !== null) sources.push('Treasury')

  const inflation = cpi ? calcInflationFromCPI(cpi) : null
  const treasury = treasuryRates ? extractTreasuryRates(treasuryRates) : { tBill: null, tNote: null, tBond: null }
  const latestCPI = cpi?.find(d => d.latest)?.value ?? cpi?.[0]?.value ?? null

  // I-Bond composite = fixed rate + (2 × semiannual inflation rate) + (fixed × semiannual inflation)
  // Approximate: inflation / 2 as semiannual, assume fixed rate ~1.2%
  const fixedRate = 1.2
  const semiInflation = (inflation ?? 3) / 2
  const iBondComposite = inflation !== null
    ? Number((fixedRate + (2 * semiInflation / 100 * 100) + (fixedRate / 100 * semiInflation / 100 * 100)).toFixed(2))
    : null

  // IRS underpayment penalty rate = short-term AFR + 3%
  // Short-term AFR approximates fed funds rate
  const underpaymentRate = fedRate !== null ? Number((fedRate + 3).toFixed(2)) : null

  return {
    fedFundsRate: fedRate,
    cpiLatest: latestCPI,
    cpiYoYChange: inflation !== null ? Number(inflation.toFixed(2)) : null,
    inflationRate: inflation !== null ? Number(inflation.toFixed(2)) : null,
    treasuryBillRate: treasury.tBill,
    treasuryNoteRate: treasury.tNote,
    treasuryBondRate: treasury.tBond,
    iBondCompositeRate: iBondComposite,
    underpaymentPenaltyRate: underpaymentRate,
    lastUpdated: new Date().toISOString(),
    sources,
  }
}

// ─── Application Helpers ──────────────────────────────────────────────────

/** Get real-time underpayment penalty rate for Form 2210 calculations */
export async function getRealPenaltyRate(): Promise<number> {
  const rate = await fetchFedFundsRate()
  // IRS penalty = short-term AFR rounded to nearest whole % + 3%
  // Short-term AFR ≈ fed funds rate
  if (rate !== null) return Math.round(rate) + 3
  return 8 // Fallback: 2024-2025 rate
}

/** Get real inflation rate for multi-year tax projections */
export async function getRealInflationRate(): Promise<number> {
  const cpi = await fetchCPI()
  if (cpi) {
    const inflation = calcInflationFromCPI(cpi)
    if (inflation !== null) return inflation / 100
  }
  return 0.03 // Fallback: 3%
}

/** Get real risk-free rate for retirement projections */
export async function getRiskFreeRate(): Promise<number> {
  const rate = await fetchTreasury10Y()
  return rate !== null ? rate / 100 : 0.04 // Fallback: 4%
}

/** Get real mortgage rate for deduction calculations */
export async function getRealMortgageRate(): Promise<number> {
  const rate = await fetchMortgageRate()
  return rate !== null ? rate / 100 : 0.065 // Fallback: 6.5%
}
