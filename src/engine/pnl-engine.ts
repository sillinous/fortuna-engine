/**
 * Fortuna Engine — P&L Statement Generator
 *
 * Produces a proper income statement from existing financial data:
 * revenue → COGS → gross profit → operating expenses → EBITDA →
 * taxes → net income. Supports quarterly and annual periods
 * with period-over-period comparison.
 */

import type { FortunaState } from './storage'
import { generateTaxReport } from './tax-calculator'

// ===================================================================
//  TYPES
// ===================================================================

export interface PnLLineItem {
  label: string
  amount: number
  previousAmount: number
  category: 'revenue' | 'cogs' | 'operating' | 'tax' | 'other'
  isSubtotal?: boolean
  isTotal?: boolean
  indent?: number
  note?: string
}

export interface PnLStatement {
  period: string
  periodLabel: string
  previousPeriod: string

  // Revenue
  revenueItems: PnLLineItem[]
  totalRevenue: number
  prevTotalRevenue: number

  // COGS (if applicable)
  cogsItems: PnLLineItem[]
  totalCOGS: number
  prevTotalCOGS: number

  // Gross Profit
  grossProfit: number
  prevGrossProfit: number
  grossMargin: number

  // Operating Expenses
  opexItems: PnLLineItem[]
  totalOpex: number
  prevTotalOpex: number

  // EBITDA / Operating Income
  operatingIncome: number
  prevOperatingIncome: number
  operatingMargin: number

  // Taxes
  taxItems: PnLLineItem[]
  totalTax: number
  prevTotalTax: number

  // Net Income
  netIncome: number
  prevNetIncome: number
  netMargin: number

  // Metrics
  effectiveTaxRate: number
  yoyGrowth: number // revenue growth
  insights: string[]
}

// ===================================================================
//  EXPENSE CATEGORIZATION
// ===================================================================

const COGS_KEYWORDS = ['cost of goods', 'cogs', 'materials', 'inventory', 'shipping', 'fulfillment', 'manufacturing']
const OPEX_CATEGORIES: Record<string, string> = {
  'office': 'Office & Administration',
  'software': 'Software & Technology',
  'marketing': 'Marketing & Advertising',
  'travel': 'Travel & Entertainment',
  'professional': 'Professional Services',
  'insurance': 'Insurance',
  'utilities': 'Utilities',
  'rent': 'Rent & Facilities',
  'equipment': 'Equipment & Supplies',
  'vehicle': 'Vehicle Expenses',
  'education': 'Education & Training',
  'contractor': 'Contractors & Subcontractors',
  'payroll': 'Payroll & Benefits',
  'other': 'Other Operating Expenses',
}

function categorizeExpense(description: string, category: string): 'cogs' | 'operating' {
  const lower = (description + ' ' + category).toLowerCase()
  if (COGS_KEYWORDS.some(kw => lower.includes(kw))) return 'cogs'
  return 'operating'
}

function getOpexBucket(category: string, description: string): string {
  const lower = (category + ' ' + description).toLowerCase()
  for (const [key, label] of Object.entries(OPEX_CATEGORIES)) {
    if (lower.includes(key)) return label
  }
  return 'Other Operating Expenses'
}

// ===================================================================
//  P&L GENERATOR
// ===================================================================

export function generatePnL(
  state: FortunaState,
  growthRate: number = 0.10, // assumed prior period growth for comparison
  entityFilter?: string, // 'all' | 'personal' | entity id — filter to specific entity
): PnLStatement {
  const report = generateTaxReport(state)
  const currentYear = new Date().getFullYear()
  const filterEid = entityFilter && entityFilter !== 'all' ? entityFilter : undefined

  // ── Revenue ────────────────────────────────────────────────────
  const revenueItems: PnLLineItem[] = state.incomeStreams
    .filter(s => s.isActive)
    .filter(s => !filterEid || (s.entityId || 'personal') === filterEid)
    .map(s => {
      const prevAmount = Math.round(s.annualAmount / (1 + growthRate))
      return {
        label: s.name,
        amount: s.annualAmount,
        previousAmount: prevAmount,
        category: 'revenue' as const,
        note: s.type,
      }
    })

  const totalRevenue = revenueItems.reduce((s, i) => s + i.amount, 0)
  const prevTotalRevenue = revenueItems.reduce((s, i) => s + i.previousAmount, 0)

  // ── COGS ───────────────────────────────────────────────────────
  const cogsExpenses = state.expenses
    .filter(e => categorizeExpense(e.description, e.category) === 'cogs')
    .filter(e => !filterEid || (e.entityId || 'personal') === filterEid)
  const cogsItems: PnLLineItem[] = cogsExpenses.map(e => ({
    label: e.description,
    amount: e.annualAmount,
    previousAmount: Math.round(e.annualAmount / (1 + growthRate)),
    category: 'cogs' as const,
  }))
  const totalCOGS = cogsItems.reduce((s, i) => s + i.amount, 0)
  const prevTotalCOGS = cogsItems.reduce((s, i) => s + i.previousAmount, 0)

  // ── Gross Profit ───────────────────────────────────────────────
  const grossProfit = totalRevenue - totalCOGS
  const prevGrossProfit = prevTotalRevenue - prevTotalCOGS
  const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0

  // ── Operating Expenses ─────────────────────────────────────────
  const opExpenses = state.expenses
    .filter(e => categorizeExpense(e.description, e.category) === 'operating')
    .filter(e => !filterEid || (e.entityId || 'personal') === filterEid)

  // Group by bucket
  const buckets: Record<string, { amount: number; prev: number }> = {}
  for (const e of opExpenses) {
    const bucket = getOpexBucket(e.category, e.description)
    if (!buckets[bucket]) buckets[bucket] = { amount: 0, prev: 0 }
    buckets[bucket].amount += e.annualAmount
    buckets[bucket].prev += Math.round(e.annualAmount / (1 + growthRate))
  }

  // Add entity costs
  for (const ent of state.entities.filter(e => e.isActive && e.annualCost)) {
    if (filterEid && ent.id !== filterEid) continue
    const bucket = 'Professional Services'
    if (!buckets[bucket]) buckets[bucket] = { amount: 0, prev: 0 }
    buckets[bucket].amount += ent.annualCost
    buckets[bucket].prev += Math.round(ent.annualCost / (1 + growthRate))
  }

  const opexItems: PnLLineItem[] = Object.entries(buckets)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([label, data]) => ({
      label,
      amount: data.amount,
      previousAmount: data.prev,
      category: 'operating' as const,
    }))

  const totalOpex = opexItems.reduce((s, i) => s + i.amount, 0)
  const prevTotalOpex = opexItems.reduce((s, i) => s + i.previousAmount, 0)

  // ── Operating Income ───────────────────────────────────────────
  const operatingIncome = grossProfit - totalOpex
  const prevOperatingIncome = prevGrossProfit - prevTotalOpex
  const operatingMargin = totalRevenue > 0 ? operatingIncome / totalRevenue : 0

  // ── Taxes ──────────────────────────────────────────────────────
  const taxItems: PnLLineItem[] = [
    {
      label: 'Federal Income Tax',
      amount: report.federalIncomeTax,
      previousAmount: Math.round(report.federalIncomeTax / (1 + growthRate)),
      category: 'tax' as const,
    },
    {
      label: 'Self-Employment Tax',
      amount: report.selfEmploymentTax,
      previousAmount: Math.round(report.selfEmploymentTax / (1 + growthRate)),
      category: 'tax' as const,
    },
    {
      label: `State Tax (${state.profile.state})`,
      amount: report.stateTax,
      previousAmount: Math.round(report.stateTax / (1 + growthRate)),
      category: 'tax' as const,
    },
  ]
  const totalTax = taxItems.reduce((s, i) => s + i.amount, 0)
  const prevTotalTax = taxItems.reduce((s, i) => s + i.previousAmount, 0)

  // ── Net Income ─────────────────────────────────────────────────
  const netIncome = operatingIncome - totalTax
  const prevNetIncome = prevOperatingIncome - prevTotalTax
  const netMargin = totalRevenue > 0 ? netIncome / totalRevenue : 0

  // ── Insights ───────────────────────────────────────────────────
  const insights: string[] = []

  if (grossMargin > 0.7) {
    insights.push(`Strong gross margin at ${(grossMargin * 100).toFixed(0)}% — typical of service-based businesses with low COGS.`)
  } else if (grossMargin < 0.3) {
    insights.push(`Low gross margin at ${(grossMargin * 100).toFixed(0)}% — consider renegotiating supplier costs or raising prices.`)
  }

  if (operatingMargin < 0.15 && totalRevenue > 50000) {
    insights.push(`Operating margin is tight at ${(operatingMargin * 100).toFixed(0)}%. Review top expense categories for reduction opportunities.`)
  }

  const taxRate = totalRevenue > 0 ? totalTax / totalRevenue : 0
  if (taxRate > 0.25) {
    insights.push(`Tax burden consumes ${(taxRate * 100).toFixed(0)}% of revenue. Entity restructuring and retirement contributions could lower this significantly.`)
  }

  if (report.identifiedSavings > 0) {
    insights.push(`Fortuna has identified $${report.identifiedSavings.toLocaleString()} in potential annual tax savings that would improve your net margin by ${(report.identifiedSavings / (totalRevenue || 1) * 100).toFixed(1)} percentage points.`)
  }

  const largestExpense = opexItems[0]
  if (largestExpense && largestExpense.amount > totalRevenue * 0.15) {
    insights.push(`"${largestExpense.label}" is your largest operating cost at ${(largestExpense.amount / totalRevenue * 100).toFixed(0)}% of revenue — worth reviewing for optimization.`)
  }

  return {
    period: `FY ${currentYear}`,
    periodLabel: `${currentYear} (Current)`,
    previousPeriod: `FY ${currentYear - 1} (Est.)`,
    revenueItems, totalRevenue, prevTotalRevenue,
    cogsItems, totalCOGS, prevTotalCOGS,
    grossProfit, prevGrossProfit, grossMargin,
    opexItems, totalOpex, prevTotalOpex,
    operatingIncome, prevOperatingIncome, operatingMargin,
    taxItems, totalTax, prevTotalTax,
    netIncome, prevNetIncome, netMargin,
    effectiveTaxRate: totalRevenue > 0 ? totalTax / totalRevenue : 0,
    yoyGrowth: prevTotalRevenue > 0 ? (totalRevenue - prevTotalRevenue) / prevTotalRevenue : 0,
    insights,
  }
}
