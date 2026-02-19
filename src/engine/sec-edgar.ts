/**
 * Fortuna Engine - SEC EDGAR API Integration
 * Free access to SEC filings for entity research, compliance checking,
 * and industry benchmarking.
 *
 * Source: SEC EDGAR EFTS (full-text search) + Company API
 * No key required. Must include User-Agent header.
 *
 * @module sec-edgar
 */

import { cachedFetch, TTL } from './api-cache'

// ─── Types ────────────────────────────────────────────────────────────────

export interface SECFiling {
  id: string
  formType: string
  filedDate: string
  companyName: string
  cik: string
  description: string
  url: string
}

export interface CompanyInfo {
  cik: string
  name: string
  ticker?: string
  sic: string
  sicDescription: string
  stateOfIncorporation: string
  filingCount: number
  recentFilings: SECFiling[]
}

export interface IndustryBenchmark {
  sic: string
  sicDescription: string
  avgRevenue: number
  medianRevenue: number
  avgProfitMargin: number
  companyCount: number
}

// ─── EDGAR Config ─────────────────────────────────────────────────────────

const EDGAR_HEADERS = {
  'User-Agent': 'FortunaEngine/10.8 admin@unlessrx.com',
  'Accept': 'application/json',
}

const EDGAR_SEARCH = 'https://efts.sec.gov/LATEST/search-index'
const EDGAR_COMPANY = 'https://data.sec.gov/submissions'

// ─── Company Search ───────────────────────────────────────────────────────

interface EDGARSearchResponse {
  hits: {
    total: { value: number }
    hits: {
      _source: {
        file_num: string
        display_names: string[]
        form_type: string
        file_date: string
        period_of_report?: string
      }
      _id: string
    }[]
  }
}

/** Search SEC filings by keyword */
export async function searchFilings(
  query: string,
  formType?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<SECFiling[]> {
  let url = `${EDGAR_SEARCH}?q=${encodeURIComponent(query)}`
  if (formType) url += `&forms=${encodeURIComponent(formType)}`
  if (dateFrom && dateTo) url += `&dateRange=custom&startdt=${dateFrom}&enddt=${dateTo}`
  url += '&from=0&size=10'

  const data = await cachedFetch<EDGARSearchResponse>(url, {
    cacheKey: `edgar_search_${query}_${formType || 'all'}`,
    cacheTTL: TTL.DAY_1,
    provider: 'sec',
    headers: EDGAR_HEADERS,
  })

  if (!data?.hits?.hits) return []

  return data.hits.hits.map(hit => ({
    id: hit._id,
    formType: hit._source.form_type,
    filedDate: hit._source.file_date,
    companyName: hit._source.display_names?.[0] || 'Unknown',
    cik: hit._source.file_num || '',
    description: `${hit._source.form_type} filed ${hit._source.file_date}`,
    url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${hit._source.file_num}&type=${hit._source.form_type}&dateb=&owner=include&count=10`,
  }))
}

// ─── Company Lookup ───────────────────────────────────────────────────────

interface EDGARCompanyResponse {
  cik: string
  entityType: string
  sic: string
  sicDescription: string
  name: string
  tickers: string[]
  stateOfIncorporation: string
  filings: {
    recent: {
      accessionNumber: string[]
      filingDate: string[]
      form: string[]
      primaryDocument: string[]
    }
  }
}

/** Look up company by CIK number */
export async function lookupCompany(cik: string): Promise<CompanyInfo | null> {
  // Pad CIK to 10 digits
  const paddedCIK = cik.padStart(10, '0')

  const data = await cachedFetch<EDGARCompanyResponse>(
    `${EDGAR_COMPANY}/CIK${paddedCIK}.json`,
    {
      cacheKey: `edgar_company_${cik}`,
      cacheTTL: TTL.WEEK_1,
      provider: 'sec',
      headers: EDGAR_HEADERS,
    },
  )

  if (!data) return null

  const recentFilings: SECFiling[] = []
  const recent = data.filings?.recent
  if (recent) {
    const count = Math.min(10, recent.accessionNumber?.length || 0)
    for (let i = 0; i < count; i++) {
      recentFilings.push({
        id: recent.accessionNumber[i],
        formType: recent.form[i],
        filedDate: recent.filingDate[i],
        companyName: data.name,
        cik: data.cik,
        description: `${recent.form[i]} - ${recent.primaryDocument?.[i] || ''}`,
        url: `https://www.sec.gov/Archives/edgar/data/${data.cik}/${recent.accessionNumber[i].replace(/-/g, '')}/${recent.primaryDocument?.[i] || ''}`,
      })
    }
  }

  return {
    cik: data.cik,
    name: data.name,
    ticker: data.tickers?.[0],
    sic: data.sic,
    sicDescription: data.sicDescription,
    stateOfIncorporation: data.stateOfIncorporation,
    filingCount: recent?.accessionNumber?.length || 0,
    recentFilings,
  }
}

// ─── Entity Type Research ─────────────────────────────────────────────────

/** Common form types relevant to Fortuna users */
export const RELEVANT_FORMS = {
  '1120-S': 'S Corporation Income Tax Return',
  '1120': 'C Corporation Income Tax Return',
  '1065': 'Partnership Return of Income',
  '1040': 'Individual Income Tax Return',
  'Schedule K-1': 'Partner/Shareholder Income Share',
  '2553': 'Election by a Small Business Corporation (S-Corp)',
  '8832': 'Entity Classification Election (Check-the-box)',
  '1023': 'Application for Tax-Exempt Status',
  '990': 'Return of Organization Exempt from Income Tax',
  'W-2': 'Wage and Tax Statement',
  '1099': 'Information Returns',
}

/** Search for entity type election filings (useful for entity structure research) */
export async function searchEntityElections(companyName: string): Promise<SECFiling[]> {
  // Search for S-Corp elections and entity classifications
  const results = await searchFilings(
    companyName,
    undefined,
    undefined,
    undefined,
  )
  return results
}

// ─── SIC Code Reference ───────────────────────────────────────────────────

// Common SIC codes for businesses Fortuna users might operate
export const COMMON_SIC_CODES: Record<string, { description: string; avgMargin: number; audit_flag: boolean }> = {
  '7371': { description: 'Computer Services', avgMargin: 0.15, audit_flag: false },
  '7372': { description: 'Prepackaged Software', avgMargin: 0.25, audit_flag: false },
  '7374': { description: 'Computer Processing & Data Prep', avgMargin: 0.12, audit_flag: false },
  '8721': { description: 'Accounting, Auditing & Bookkeeping', avgMargin: 0.20, audit_flag: false },
  '8742': { description: 'Management Consulting', avgMargin: 0.18, audit_flag: false },
  '7389': { description: 'Miscellaneous Business Services', avgMargin: 0.10, audit_flag: false },
  '6512': { description: 'Real Estate Operators', avgMargin: 0.25, audit_flag: true },
  '5812': { description: 'Eating Places (Restaurants)', avgMargin: 0.05, audit_flag: true },
  '1521': { description: 'General Building Contractors', avgMargin: 0.08, audit_flag: true },
  '8011': { description: 'Offices of Physicians', avgMargin: 0.35, audit_flag: false },
  '8111': { description: 'Legal Services', avgMargin: 0.30, audit_flag: false },
  '5411': { description: 'Grocery Stores', avgMargin: 0.02, audit_flag: false },
  '5999': { description: 'Miscellaneous Retail', avgMargin: 0.08, audit_flag: false },
  '4813': { description: 'Telephone Communications', avgMargin: 0.12, audit_flag: false },
  '2741': { description: 'Miscellaneous Publishing', avgMargin: 0.15, audit_flag: false },
}

/** Get industry benchmark data for a SIC code */
export function getIndustryBenchmark(sicCode: string): IndustryBenchmark | null {
  const sic = COMMON_SIC_CODES[sicCode]
  if (!sic) return null

  return {
    sic: sicCode,
    sicDescription: sic.description,
    avgRevenue: 0, // Would need IRS SOI data
    medianRevenue: 0,
    avgProfitMargin: sic.avgMargin,
    companyCount: 0,
  }
}

/** Check if a SIC code is flagged for higher audit scrutiny */
export function isHighAuditRiskIndustry(sicCode: string): boolean {
  return COMMON_SIC_CODES[sicCode]?.audit_flag ?? false
}
