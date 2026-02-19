/**
 * Fortuna Engine - Exchange Rate API
 * Real-time currency conversion for foreign income reporting
 * and foreign tax credit calculations (Form 1116).
 *
 * Source: Open Exchange Rate API (free, no key required)
 * Fallback: ECB reference rates
 *
 * @module exchange-rates
 */

import { cachedFetch, TTL } from './api-cache'

// ─── Types ────────────────────────────────────────────────────────────────

export interface ExchangeRates {
  base: string
  date: string
  rates: Record<string, number>
  provider: string
}

export interface CurrencyConversion {
  from: string
  to: string
  amount: number
  convertedAmount: number
  rate: number
  date: string
}

export interface ForeignIncomeConversion {
  currency: string
  foreignAmount: number
  usdAmount: number
  rate: number
  foreignTaxPaid: number
  foreignTaxPaidUSD: number
  country: string
  form1116Category: 'general' | 'passive' | 'section901j' | 'resourced_treaty'
}

// ─── API Endpoints ────────────────────────────────────────────────────────

const EXCHANGE_API = 'https://open.er-api.com/v6/latest'

interface ExchangeAPIResponse {
  result: string
  base_code: string
  time_last_update_utc: string
  rates: Record<string, number>
}

// ─── Fetch Exchange Rates ─────────────────────────────────────────────────

/** Fetch current exchange rates (base: USD) */
export async function fetchExchangeRates(base: string = 'USD'): Promise<ExchangeRates | null> {
  const data = await cachedFetch<ExchangeAPIResponse>(
    `${EXCHANGE_API}/${base}`,
    { cacheKey: `exchange_${base}`, cacheTTL: TTL.HOURS_6, provider: 'exchange' },
  )

  if (!data?.rates) return null

  return {
    base: data.base_code,
    date: data.time_last_update_utc,
    rates: data.rates,
    provider: 'open.er-api.com',
  }
}

/** Convert a specific amount between currencies */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
): Promise<CurrencyConversion | null> {
  const rates = await fetchExchangeRates('USD')
  if (!rates) return null

  const fromUpper = from.toUpperCase()
  const toUpper = to.toUpperCase()

  // Convert through USD
  const fromRate = fromUpper === 'USD' ? 1 : rates.rates[fromUpper]
  const toRate = toUpper === 'USD' ? 1 : rates.rates[toUpper]

  if (!fromRate || !toRate) return null

  const usdAmount = amount / fromRate
  const convertedAmount = usdAmount * toRate
  const directRate = toRate / fromRate

  return {
    from: fromUpper,
    to: toUpper,
    amount,
    convertedAmount: Number(convertedAmount.toFixed(2)),
    rate: Number(directRate.toFixed(6)),
    date: rates.date,
  }
}

// ─── Foreign Income Tax Helpers ───────────────────────────────────────────

// Common tax treaty countries and their withholding rates
const TREATY_WITHHOLDING_RATES: Record<string, { dividends: number; interest: number; royalties: number }> = {
  'GB': { dividends: 0.15, interest: 0, royalties: 0 },
  'CA': { dividends: 0.15, interest: 0.10, royalties: 0.10 },
  'DE': { dividends: 0.15, interest: 0, royalties: 0 },
  'FR': { dividends: 0.15, interest: 0, royalties: 0 },
  'JP': { dividends: 0.10, interest: 0.10, royalties: 0 },
  'AU': { dividends: 0.15, interest: 0.10, royalties: 0.05 },
  'IN': { dividends: 0.15, interest: 0.15, royalties: 0.15 },
  'IE': { dividends: 0.15, interest: 0, royalties: 0 },
  'CH': { dividends: 0.15, interest: 0, royalties: 0 },
  'SG': { dividends: 0.15, interest: 0.12, royalties: 0.10 },
  'KR': { dividends: 0.15, interest: 0.12, royalties: 0.10 },
  'NL': { dividends: 0.15, interest: 0, royalties: 0 },
  'IL': { dividends: 0.25, interest: 0.175, royalties: 0.10 },
  'MX': { dividends: 0.10, interest: 0.10, royalties: 0.10 },
  'BR': { dividends: 0, interest: 0.15, royalties: 0.15 },
}

// Country code → currency mapping for common countries
const COUNTRY_CURRENCY: Record<string, string> = {
  'GB': 'GBP', 'CA': 'CAD', 'DE': 'EUR', 'FR': 'EUR', 'JP': 'JPY',
  'AU': 'AUD', 'IN': 'INR', 'IE': 'EUR', 'CH': 'CHF', 'SG': 'SGD',
  'KR': 'KRW', 'NL': 'EUR', 'IL': 'ILS', 'MX': 'MXN', 'BR': 'BRL',
  'IT': 'EUR', 'ES': 'EUR', 'SE': 'SEK', 'NO': 'NOK', 'DK': 'DKK',
  'NZ': 'NZD', 'HK': 'HKD', 'TW': 'TWD', 'CN': 'CNY', 'PH': 'PHP',
}

/** Convert foreign income to USD for tax reporting */
export async function convertForeignIncome(
  foreignAmount: number,
  foreignTaxPaid: number,
  countryCode: string,
  incomeType: 'general' | 'passive' | 'section901j' | 'resourced_treaty' = 'passive',
): Promise<ForeignIncomeConversion | null> {
  const currency = COUNTRY_CURRENCY[countryCode.toUpperCase()]
  if (!currency) return null

  const conversion = await convertCurrency(foreignAmount, currency, 'USD')
  if (!conversion) return null

  const taxConversion = await convertCurrency(foreignTaxPaid, currency, 'USD')
  if (!taxConversion) return null

  return {
    currency,
    foreignAmount,
    usdAmount: conversion.convertedAmount,
    rate: conversion.rate,
    foreignTaxPaid,
    foreignTaxPaidUSD: taxConversion.convertedAmount,
    country: countryCode.toUpperCase(),
    form1116Category: incomeType,
  }
}

/** Get treaty withholding rate for a country */
export function getTreatyRate(
  countryCode: string,
  incomeType: 'dividends' | 'interest' | 'royalties',
): number | null {
  const rates = TREATY_WITHHOLDING_RATES[countryCode.toUpperCase()]
  if (!rates) return null
  return rates[incomeType]
}

/** Check if a country has a tax treaty with the US */
export function hasTaxTreaty(countryCode: string): boolean {
  return countryCode.toUpperCase() in TREATY_WITHHOLDING_RATES
}

/** Get list of all treaty countries */
export function getTreatyCountries(): string[] {
  return Object.keys(TREATY_WITHHOLDING_RATES)
}

/** Calculate maximum foreign tax credit */
export async function calcMaxForeignTaxCredit(
  foreignIncome: { amount: number; taxPaid: number; countryCode: string }[],
  totalWorldwideIncome: number,
  totalUSTax: number,
): Promise<{
  totalForeignIncomeUSD: number
  totalForeignTaxUSD: number
  creditLimit: number
  allowableCredit: number
  excessCredit: number
  conversions: ForeignIncomeConversion[]
}> {
  const conversions: ForeignIncomeConversion[] = []
  let totalForeignUSD = 0
  let totalTaxUSD = 0

  for (const fi of foreignIncome) {
    const conv = await convertForeignIncome(fi.amount, fi.taxPaid, fi.countryCode)
    if (conv) {
      conversions.push(conv)
      totalForeignUSD += conv.usdAmount
      totalTaxUSD += conv.foreignTaxPaidUSD
    }
  }

  // FTC limitation: (foreign source income / worldwide income) × US tax
  const creditLimit = totalWorldwideIncome > 0
    ? (totalForeignUSD / totalWorldwideIncome) * totalUSTax
    : 0

  const allowableCredit = Math.min(totalTaxUSD, creditLimit)
  const excessCredit = Math.max(0, totalTaxUSD - creditLimit)

  return {
    totalForeignIncomeUSD: Number(totalForeignUSD.toFixed(2)),
    totalForeignTaxUSD: Number(totalTaxUSD.toFixed(2)),
    creditLimit: Number(creditLimit.toFixed(2)),
    allowableCredit: Number(allowableCredit.toFixed(2)),
    excessCredit: Number(excessCredit.toFixed(2)),
    conversions,
  }
}
