/**
 * Fortuna Engine — FinTech Transaction Enrichment
 *
 * Tax-aware transaction categorization engine. Applies 100+ rules
 * to assign deductibility, schedule references, and Fortuna tax
 * categories to raw bank transactions.
 *
 * Rule precedence:
 *   1. MCC code (most specific)
 *   2. Merchant name pattern (high confidence)
 *   3. Category mapping (moderate confidence)
 *   4. Amount heuristics (low confidence)
 *
 * Every rule produces:
 *   - fortunaCategory: Maps to Fortuna's 25 tax categories
 *   - isDeductible: Boolean
 *   - deductionPct: 0-100 (meals = 50, mileage = 100, entertainment = 0)
 *   - scheduleRef: Tax form line reference
 *   - isTaxPayment: For estimated/quarterly tax payments
 *   - is1099Reportable: For contractor payments ≥ $600
 *
 * @module fintech-enrichment
 */

import type { FinTechTransaction } from './fintech-models'

// ─── Enrichment Result ────────────────────────────────────────────────────

export interface EnrichedTransaction {
  fortunaCategory: string
  isDeductible: boolean
  deductionPct: number
  scheduleRef?: string
  isTaxPayment: boolean
  taxPaymentType?: 'estimated_federal' | 'estimated_state' | 'property_tax' | 'sales_tax' | 'payroll_tax'
  is1099Reportable: boolean
  incomeType?: string
  confidence: number           // 0-1
  ruleMatched?: string         // Which rule triggered
}

// ─── Enrichment Engine ────────────────────────────────────────────────────

export function enrichTransaction(txn: FinTechTransaction): EnrichedTransaction {
  const name = (txn.merchantName || txn.name || '').toLowerCase()
  const category = (txn.category.primary || '').toLowerCase()
  const detailed = (txn.category.detailed || '').toLowerCase()
  const mcc = txn.merchant?.mcc || ''

  // 1. MCC-based rules (highest confidence)
  const mccResult = matchMCC(mcc)
  if (mccResult) return { ...mccResult, confidence: 0.95, ruleMatched: `mcc:${mcc}` }

  // 2. Merchant name patterns (high confidence)
  const nameResult = matchMerchantName(name, txn.amount, txn.type)
  if (nameResult) return { ...nameResult, confidence: 0.85, ruleMatched: `name:${nameResult.ruleMatched}` }

  // 3. Category-based rules (moderate confidence)
  const catResult = matchCategory(category, detailed, txn.type)
  if (catResult) return { ...catResult, confidence: 0.70, ruleMatched: `cat:${category}` }

  // 4. Default — uncategorized
  return {
    fortunaCategory: txn.type === 'credit' ? 'other_income' : 'uncategorized',
    isDeductible: false,
    deductionPct: 0,
    isTaxPayment: false,
    is1099Reportable: false,
    confidence: 0.3,
    ruleMatched: 'default',
  }
}

// ─── MCC Rules ────────────────────────────────────────────────────────────

const MCC_RULES: Record<string, Partial<EnrichedTransaction>> = {
  // Travel
  '3000-3299': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' },
  '4511': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' }, // Airlines
  '4411': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' }, // Cruise
  '7011': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' }, // Hotels
  '7512': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' }, // Car rental

  // Meals
  '5812': { fortunaCategory: 'meals', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 24b' }, // Restaurants
  '5813': { fortunaCategory: 'meals', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 24b' }, // Bars
  '5814': { fortunaCategory: 'meals', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 24b' }, // Fast food

  // Office supplies
  '5111': { fortunaCategory: 'office_supplies', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 18' }, // Stationery
  '5943': { fortunaCategory: 'office_supplies', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 18' }, // Office supplies
  '5044': { fortunaCategory: 'office_supplies', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 18' }, // Office equipment

  // Software / Tech
  '5734': { fortunaCategory: 'software', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' }, // Computer software
  '5045': { fortunaCategory: 'software', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' }, // Computers

  // Auto / Gas
  '5541': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' }, // Gas stations
  '5542': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' }, // Automated fuel
  '7538': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' }, // Auto repair
  '5571': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' }, // Motorcycle

  // Professional services
  '8111': { fortunaCategory: 'legal', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 17' }, // Legal
  '8931': { fortunaCategory: 'professional_fees', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 17' }, // Accounting
  '7392': { fortunaCategory: 'professional_fees', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 17' }, // Consulting

  // Insurance
  '6300': { fortunaCategory: 'insurance', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 15' }, // Insurance
  '6399': { fortunaCategory: 'insurance', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 15' },

  // Education
  '8220': { fortunaCategory: 'education', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' }, // Colleges
  '8299': { fortunaCategory: 'education', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' }, // Schools

  // Medical
  '8011': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' }, // Doctors
  '8021': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' }, // Dentists
  '8099': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' }, // Medical services
  '5912': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' }, // Pharmacy

  // Charity
  '8398': { fortunaCategory: 'charitable', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 12' }, // Charitable orgs
  '8661': { fortunaCategory: 'charitable', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 12' }, // Religious orgs

  // Utilities
  '4900': { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 25' }, // Utilities
  '4814': { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 25' }, // Telecom
  '4816': { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 25' }, // Internet

  // Advertising
  '7311': { fortunaCategory: 'advertising', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 8' }, // Advertising services
  '7312': { fortunaCategory: 'advertising', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 8' }, // Billboards

  // Entertainment (non-deductible post-TCJA)
  '7832': { fortunaCategory: 'entertainment', isDeductible: false, deductionPct: 0 }, // Movie theaters
  '7941': { fortunaCategory: 'entertainment', isDeductible: false, deductionPct: 0 }, // Sports
  '7922': { fortunaCategory: 'entertainment', isDeductible: false, deductionPct: 0 }, // Theaters

  // Government — tax payments
  '9311': { fortunaCategory: 'tax_payment', isDeductible: false, deductionPct: 0, isTaxPayment: true },
  '9222': { fortunaCategory: 'tax_payment', isDeductible: false, deductionPct: 0, isTaxPayment: true },
  '9399': { fortunaCategory: 'tax_payment', isDeductible: false, deductionPct: 0, isTaxPayment: true },
}

function matchMCC(mcc: string): Partial<EnrichedTransaction> | null {
  if (!mcc) return null

  // Direct match
  if (MCC_RULES[mcc]) return { ...MCC_RULES[mcc], isTaxPayment: MCC_RULES[mcc].isTaxPayment || false, is1099Reportable: false }

  // Range match (e.g., 3000-3299 for airlines)
  const mccNum = parseInt(mcc)
  for (const [key, rule] of Object.entries(MCC_RULES)) {
    if (key.includes('-')) {
      const [lo, hi] = key.split('-').map(Number)
      if (mccNum >= lo && mccNum <= hi) return { ...rule, isTaxPayment: rule.isTaxPayment || false, is1099Reportable: false }
    }
  }

  return null
}

// ─── Merchant Name Rules ──────────────────────────────────────────────────

interface NameRule {
  pattern: RegExp
  result: Partial<EnrichedTransaction>
  name: string
}

const MERCHANT_RULES: NameRule[] = [
  // ── Tax Payments ──────────────────────────────────────────────────────
  { name: 'irs_payment', pattern: /\birs\b|internal revenue|eftps|us treasury.*tax/i, result: { fortunaCategory: 'tax_payment', isDeductible: false, deductionPct: 0, isTaxPayment: true, taxPaymentType: 'estimated_federal' } },
  { name: 'state_tax', pattern: /state.*tax|franchise tax|dept.*revenue|comptroller/i, result: { fortunaCategory: 'tax_payment', isDeductible: true, deductionPct: 100, isTaxPayment: true, taxPaymentType: 'estimated_state', scheduleRef: 'Schedule A Line 5a' } },
  { name: 'property_tax', pattern: /property.*tax|county.*tax|real estate.*tax/i, result: { fortunaCategory: 'tax_payment', isDeductible: true, deductionPct: 100, isTaxPayment: true, taxPaymentType: 'property_tax', scheduleRef: 'Schedule A Line 5b' } },

  // ── Software / SaaS ──────────────────────────────────────────────────
  { name: 'saas', pattern: /\b(aws|amazon web services|azure|google cloud|gcp|digitalocean|heroku|vercel|netlify|cloudflare|github|gitlab|bitbucket|jira|confluence|slack|notion|figma|canva|adobe|dropbox|google workspace|microsoft 365|zoom|hubspot|salesforce|quickbooks|xero|freshbooks|stripe|twilio|sendgrid|mailchimp|shopify|squarespace|wix)\b/i, result: { fortunaCategory: 'software', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' } },

  // ── Advertising ──────────────────────────────────────────────────────
  { name: 'ads', pattern: /\b(google ads|facebook ads|meta ads|instagram ads|tiktok ads|linkedin ads|bing ads|twitter ads|pinterest ads|amazon ads)\b|facebk|fb\.com|goog.*ads/i, result: { fortunaCategory: 'advertising', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 8' } },

  // ── Legal & Professional ─────────────────────────────────────────────
  { name: 'legal', pattern: /\b(law office|attorney|legal|law firm|esquire)\b/i, result: { fortunaCategory: 'legal', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 17', is1099Reportable: true } },
  { name: 'accounting', pattern: /\b(cpa|accountant|accounting|tax prep|h&r block|turbotax|jackson hewitt|bookkeeper)\b/i, result: { fortunaCategory: 'professional_fees', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 17' } },

  // ── Insurance ────────────────────────────────────────────────────────
  { name: 'health_insurance', pattern: /\b(blue cross|aetna|cigna|united health|humana|kaiser|anthem|bcbs|health insurance)\b/i, result: { fortunaCategory: 'health_insurance', isDeductible: true, deductionPct: 100, scheduleRef: '1040 Schedule 1 Line 17' } },
  { name: 'business_insurance', pattern: /\b(general liability|business insurance|e&o insurance|professional liability|workers comp)\b/i, result: { fortunaCategory: 'insurance', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 15' } },

  // ── Meals / Dining ───────────────────────────────────────────────────
  { name: 'restaurants', pattern: /\b(restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|chipotle|panera|subway|taco bell|wendy|chick-fil-a|dunkin|grubhub|doordash|uber eats|postmates|caviar|seamless)\b/i, result: { fortunaCategory: 'meals', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 24b' } },

  // ── Travel ───────────────────────────────────────────────────────────
  { name: 'airlines', pattern: /\b(airline|united air|delta air|american air|southwest|jetblue|spirit|frontier|alaska air|hawaiian air)\b/i, result: { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' } },
  { name: 'hotels', pattern: /\b(marriott|hilton|hyatt|ihg|best western|holiday inn|hampton|courtyard|sheraton|westin|airbnb|vrbo|hotel|motel|resort)\b/i, result: { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' } },
  { name: 'rideshare', pattern: /\b(uber|lyft|taxi|cab)\b/i, result: { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' } },

  // ── Vehicle ──────────────────────────────────────────────────────────
  { name: 'gas', pattern: /\b(shell|exxon|mobil|chevron|bp|texaco|sunoco|marathon|speedway|wawa|gas|fuel|petro)\b/i, result: { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' } },
  { name: 'auto_repair', pattern: /\b(jiffy lube|midas|firestone|goodyear|autozone|advance auto|o'reilly|napa|pep boys|oil change|auto repair|tire|mechanic)\b/i, result: { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' } },
  { name: 'parking', pattern: /\b(parking|parkme|spothero|parkwhiz)\b/i, result: { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' } },
  { name: 'tolls', pattern: /\b(toll|ez.?pass|sunpass|fastrak|i-pass)\b/i, result: { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' } },

  // ── Office / Supplies ────────────────────────────────────────────────
  { name: 'office', pattern: /\b(office depot|staples|officemax|amazon.*office|paper|toner|printer|ink)\b/i, result: { fortunaCategory: 'office_supplies', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 18' } },

  // ── Shipping ─────────────────────────────────────────────────────────
  { name: 'shipping', pattern: /\b(usps|ups|fedex|dhl|postage|shipping|stamps\.com)\b/i, result: { fortunaCategory: 'shipping', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' } },

  // ── Rent ─────────────────────────────────────────────────────────────
  { name: 'rent', pattern: /\b(rent|lease payment|commercial lease|office space|coworking|wework|regus)\b/i, result: { fortunaCategory: 'rent', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 20b' } },

  // ── Utilities ────────────────────────────────────────────────────────
  { name: 'internet', pattern: /\b(comcast|xfinity|spectrum|at&t.*internet|verizon.*fios|cox|centurylink|frontier|tmobile.*home|starlink)\b/i, result: { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 25' } },
  { name: 'phone', pattern: /\b(verizon|at&t|t-mobile|sprint|us cellular|mint mobile|google fi|visible)\b(?!.*fios)/i, result: { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 25' } },

  // ── Education / Training ─────────────────────────────────────────────
  { name: 'education', pattern: /\b(udemy|coursera|skillshare|masterclass|linkedin learning|pluralsight|o'reilly|safari|conference|seminar|workshop|training)\b/i, result: { fortunaCategory: 'education', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' } },

  // ── Subscriptions ────────────────────────────────────────────────────
  { name: 'subscriptions', pattern: /\b(netflix|hulu|disney\+|hbo|spotify|apple music|youtube premium|amazon prime)\b/i, result: { fortunaCategory: 'entertainment', isDeductible: false, deductionPct: 0 } },

  // ── Charitable ───────────────────────────────────────────────────────
  { name: 'charity', pattern: /\b(charity|donation|donat|non.?profit|united way|red cross|salvation army|gofundme|church|synagogue|mosque|temple)\b/i, result: { fortunaCategory: 'charitable', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 12' } },

  // ── Banking / Fees ───────────────────────────────────────────────────
  { name: 'bank_fees', pattern: /\b(bank fee|service charge|monthly fee|wire fee|overdraft|nsf fee|atm fee|maintenance fee)\b/i, result: { fortunaCategory: 'bank_fees', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' } },

  // ── Payroll ──────────────────────────────────────────────────────────
  { name: 'payroll', pattern: /\b(adp|paychex|gusto|justworks|payroll|quickbooks payroll|square payroll|rippling)\b/i, result: { fortunaCategory: 'payroll', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 26' } },

  // ── Contractor / 1099 ────────────────────────────────────────────────
  { name: 'contractor', pattern: /\b(upwork|fiverr|toptal|freelancer|99designs|contract labor)\b/i, result: { fortunaCategory: 'contract_labor', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 11', is1099Reportable: true } },

  // ── Retirement ───────────────────────────────────────────────────────
  { name: 'retirement', pattern: /\b(fidelity|vanguard|schwab|ameritrade|etrade|merrill|edward jones|retirement|401k|ira|roth)\b.*\b(contrib|transfer|deposit)\b/i, result: { fortunaCategory: 'retirement_contribution', isDeductible: true, deductionPct: 100, scheduleRef: '1040 Schedule 1 Line 20' } },

  // ── Income patterns (credit transactions) ────────────────────────────
  { name: 'paycheck', pattern: /\b(payroll|direct deposit|salary|wages|paycheck)\b/i, result: { fortunaCategory: 'employment_income', isDeductible: false, deductionPct: 0, incomeType: 'employment' } },
  { name: 'interest_income', pattern: /\b(interest|dividend|capital gain|distribution)\b/i, result: { fortunaCategory: 'investment_income', isDeductible: false, deductionPct: 0, incomeType: 'investment' } },
  { name: 'rental_income', pattern: /\b(rent received|tenant|rental income|property income)\b/i, result: { fortunaCategory: 'rental_income', isDeductible: false, deductionPct: 0, incomeType: 'rental' } },

  // ── Transfers (non-taxable) ──────────────────────────────────────────
  { name: 'transfer', pattern: /\b(transfer|xfer|ach transfer|wire transfer|internal transfer|zelle|venmo|paypal|cash app)\b/i, result: { fortunaCategory: 'transfer', isDeductible: false, deductionPct: 0 } },
]

function matchMerchantName(name: string, amount: number, type: string): (Partial<EnrichedTransaction> & { ruleMatched: string }) | null {
  for (const rule of MERCHANT_RULES) {
    if (rule.pattern.test(name)) {
      return {
        ...rule.result,
        isTaxPayment: rule.result.isTaxPayment || false,
        is1099Reportable: rule.result.is1099Reportable && amount >= 600 ? true : false,
        ruleMatched: rule.name,
      }
    }
  }
  return null
}

// ─── Category Rules ───────────────────────────────────────────────────────

const CATEGORY_RULES: Record<string, Partial<EnrichedTransaction>> = {
  'food and drink': { fortunaCategory: 'meals', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 24b' },
  'restaurants': { fortunaCategory: 'meals', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 24b' },
  'travel': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' },
  'airlines': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' },
  'lodging': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' },
  'car rental': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' },
  'gas': { fortunaCategory: 'vehicle_expense', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 9' },
  'transportation': { fortunaCategory: 'travel', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 24a' },
  'entertainment': { fortunaCategory: 'entertainment', isDeductible: false, deductionPct: 0 },
  'recreation': { fortunaCategory: 'entertainment', isDeductible: false, deductionPct: 0 },
  'medical': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' },
  'healthcare': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' },
  'pharmacy': { fortunaCategory: 'medical', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 1' },
  'rent': { fortunaCategory: 'rent', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 20b' },
  'utilities': { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 25' },
  'internet': { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 25' },
  'phone': { fortunaCategory: 'utilities', isDeductible: true, deductionPct: 50, scheduleRef: 'Schedule C Line 25' },
  'insurance': { fortunaCategory: 'insurance', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 15' },
  'office supplies': { fortunaCategory: 'office_supplies', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 18' },
  'shipping': { fortunaCategory: 'shipping', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' },
  'education': { fortunaCategory: 'education', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' },
  'charitable': { fortunaCategory: 'charitable', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule A Line 12' },
  'government': { fortunaCategory: 'tax_payment', isDeductible: false, deductionPct: 0, isTaxPayment: true },
  'tax': { fortunaCategory: 'tax_payment', isDeductible: false, deductionPct: 0, isTaxPayment: true },
  'bank fees': { fortunaCategory: 'bank_fees', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 27a' },
  'service': { fortunaCategory: 'professional_fees', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 17' },
  'income': { fortunaCategory: 'business_income', isDeductible: false, deductionPct: 0, incomeType: 'business' },
  'payroll': { fortunaCategory: 'employment_income', isDeductible: false, deductionPct: 0, incomeType: 'employment' },
  'transfer': { fortunaCategory: 'transfer', isDeductible: false, deductionPct: 0 },
  'payment': { fortunaCategory: 'transfer', isDeductible: false, deductionPct: 0 },
  'general merchandise': { fortunaCategory: 'supplies', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 22' },
  'home improvement': { fortunaCategory: 'repairs', isDeductible: true, deductionPct: 100, scheduleRef: 'Schedule C Line 21' },
  'personal care': { fortunaCategory: 'non_deductible', isDeductible: false, deductionPct: 0 },
  'groceries': { fortunaCategory: 'non_deductible', isDeductible: false, deductionPct: 0 },
  'clothing': { fortunaCategory: 'non_deductible', isDeductible: false, deductionPct: 0 },
}

function matchCategory(category: string, detailed: string, type: string): Partial<EnrichedTransaction> | null {
  // Try detailed first
  if (detailed && CATEGORY_RULES[detailed]) {
    return { ...CATEGORY_RULES[detailed], isTaxPayment: CATEGORY_RULES[detailed].isTaxPayment || false, is1099Reportable: false }
  }
  // Then primary
  if (category && CATEGORY_RULES[category]) {
    return { ...CATEGORY_RULES[category], isTaxPayment: CATEGORY_RULES[category].isTaxPayment || false, is1099Reportable: false }
  }
  // Partial match
  for (const [key, rule] of Object.entries(CATEGORY_RULES)) {
    if (category.includes(key) || detailed.includes(key)) {
      return { ...rule, isTaxPayment: rule.isTaxPayment || false, is1099Reportable: false }
    }
  }
  return null
}

// ─── Batch Enrichment ─────────────────────────────────────────────────────

/**
 * Enrich a batch of transactions and return aggregate tax stats.
 */
export function enrichBatch(transactions: FinTechTransaction[]): {
  enriched: (FinTechTransaction & { enrichment: EnrichedTransaction })[]
  stats: {
    totalDeductible: number
    totalNonDeductible: number
    totalTaxPayments: number
    totalIncome: number
    categoryBreakdown: Record<string, { count: number; total: number; deductible: boolean }>
    confidence: { high: number; medium: number; low: number }
  }
} {
  let totalDeductible = 0, totalNonDeductible = 0, totalTaxPayments = 0, totalIncome = 0
  const categoryBreakdown: Record<string, { count: number; total: number; deductible: boolean }> = {}
  let highConf = 0, medConf = 0, lowConf = 0

  const enriched = transactions.map(txn => {
    const e = enrichTransaction(txn)

    // Stats
    if (e.isDeductible) totalDeductible += txn.amount
    else totalNonDeductible += txn.amount
    if (e.isTaxPayment) totalTaxPayments += txn.amount
    if (txn.type === 'credit') totalIncome += txn.amount

    // Category breakdown
    const cat = e.fortunaCategory || 'uncategorized'
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { count: 0, total: 0, deductible: e.isDeductible }
    categoryBreakdown[cat].count++
    categoryBreakdown[cat].total += txn.amount

    // Confidence
    if (e.confidence >= 0.8) highConf++
    else if (e.confidence >= 0.6) medConf++
    else lowConf++

    return { ...txn, enrichment: e }
  })

  return {
    enriched,
    stats: {
      totalDeductible: Math.round(totalDeductible * 100) / 100,
      totalNonDeductible: Math.round(totalNonDeductible * 100) / 100,
      totalTaxPayments: Math.round(totalTaxPayments * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      categoryBreakdown,
      confidence: { high: highConf, medium: medConf, low: lowConf },
    },
  }
}

// ─── Custom Rule Management ───────────────────────────────────────────────

/**
 * Users can add custom enrichment rules that take priority over defaults.
 * Stored in FortunaState and loaded at enrichment time.
 */
export interface CustomEnrichmentRule {
  id: string
  matchType: 'merchant_contains' | 'merchant_regex' | 'category_equals' | 'mcc_equals'
  matchValue: string
  fortunaCategory: string
  isDeductible: boolean
  deductionPct: number
  scheduleRef?: string
  is1099Reportable: boolean
  priority: number
  createdAt: string
}

let customRules: CustomEnrichmentRule[] = []

export function setCustomRules(rules: CustomEnrichmentRule[]) {
  customRules = rules.sort((a, b) => b.priority - a.priority)
}

export function getCustomRules(): CustomEnrichmentRule[] {
  return [...customRules]
}
