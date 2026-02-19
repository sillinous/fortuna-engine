/**
 * Fortuna Engine - Data Validation Schemas
 * Runtime validation for state imports, API responses, CSV data,
 * and cross-engine data flow. Uses Zod for type-safe validation.
 *
 * @module validation
 */

import { z } from 'zod'

// ─── Primitive Validators ─────────────────────────────────────────────────

const positiveNumber = z.number().min(0)
const currencyAmount = z.number().min(-1_000_000_000).max(1_000_000_000)
const percentage = z.number().min(0).max(1)
const taxYear = z.number().int().min(2000).max(2099)
const stateCode = z.string().length(2).regex(/^[A-Z]{2}$/)
const entityId = z.string().min(1).max(50)
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}/)

// ─── Core Profile ─────────────────────────────────────────────────────────

export const filingStatusSchema = z.enum([
  'single', 'married_joint', 'married_separate', 'head_of_household',
])

export const profileSchema = z.object({
  name: z.string().min(1).max(200),
  state: stateCode,
  filingStatus: filingStatusSchema,
  age: z.number().int().min(0).max(120),
  dependents: z.number().int().min(0).max(20).optional(),
  spouseAge: z.number().int().min(0).max(120).optional(),
})

// ─── Income Streams ───────────────────────────────────────────────────────

export const incomeTypeSchema = z.enum([
  'w2', 'business', 'freelance', 'rental', 'investment', 'retirement_distribution', 'other',
])

export const incomeStreamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  type: incomeTypeSchema,
  annualAmount: currencyAmount,
  isActive: z.boolean(),
  entityId: entityId.optional(),
  memberId: z.enum(['primary', 'spouse']).optional(),
  // W-2 specific
  w2FederalWithheld: positiveNumber.optional(),
  w2StateWithheld: positiveNumber.optional(),
  w2FICAPaid: positiveNumber.optional(),
  w2PretaxDeductions: positiveNumber.optional(),
  w2EmployerMatch: positiveNumber.optional(),
})

// ─── Expenses ─────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  monthlyAmount: currencyAmount,
  isDeductible: z.boolean().optional(),
  entityId: entityId.optional(),
})

// ─── Deductions ───────────────────────────────────────────────────────────

export const deductionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  amount: currencyAmount,
  isItemized: z.boolean().optional(),
  entityId: entityId.optional(),
})

// ─── Legal Entities ───────────────────────────────────────────────────────

export const entityTypeSchema = z.enum([
  'sole_prop', 'llc_single', 'llc_partnership', 'llc_scorp',
  'scorp', 'ccorp', 'partnership', 'trust',
])

export const entitySchema = z.object({
  id: entityId,
  name: z.string().min(1).max(200),
  type: entityTypeSchema,
  state: stateCode,
  isActive: z.boolean(),
  ein: z.string().optional(),
  formationDate: dateString.optional(),
  isSSTB: z.boolean().optional(),
  officerSalary: positiveNumber.optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
})

// ─── Investments ──────────────────────────────────────────────────────────

export const investmentSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  type: z.enum(['stock', 'etf', 'mutual_fund', 'bond', 'crypto', 'real_estate', 'other']),
  quantity: z.number(),
  costBasis: currencyAmount,
  currentValue: currencyAmount.optional(),
  acquisitionDate: dateString,
  isLongTerm: z.boolean().optional(),
  entityId: entityId.optional(),
})

// ─── Household ────────────────────────────────────────────────────────────

export const dependentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  relationship: z.enum(['child', 'stepchild', 'foster', 'sibling', 'parent', 'other']),
  dateOfBirth: dateString,
  monthsLived: z.number().int().min(0).max(12),
  isStudent: z.boolean().optional(),
  isDisabled: z.boolean().optional(),
  unearnedIncome: positiveNumber.optional(),
  earnedIncome: positiveNumber.optional(),
  age: z.number().int().min(0).max(120),
})

export const householdSchema = z.object({
  members: z.array(z.object({
    id: z.string().min(1),
    role: z.enum(['primary', 'spouse']),
    name: z.string().min(1).max(200),
    age: z.number().int().min(0).max(120),
    ssn: z.string().optional(), // not validated for content — sensitive
  })),
  dependents: z.array(dependentSchema),
  filingStatus: filingStatusSchema,
})

// ─── Estimated Payments ───────────────────────────────────────────────────

export const estimatedPaymentSchema = z.object({
  id: z.string().min(1),
  quarter: z.number().int().min(1).max(4),
  taxYear: taxYear,
  dueDate: dateString,
  amount: positiveNumber,
  paidAmount: positiveNumber.optional(),
  paidDate: dateString.optional(),
})

// ─── Retirement Accounts ──────────────────────────────────────────────────

export const retirementAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum([
    'traditional_401k', 'roth_401k', 'solo_401k', 'sep_ira', 'simple_ira',
    'traditional_ira', 'roth_ira', 'hsa', 'pension', 'other',
  ]),
  balance: positiveNumber,
  annualContribution: positiveNumber,
  employerMatch: positiveNumber.optional(),
  maxContribution: positiveNumber,
  isTaxDeductible: z.boolean(),
})

// ─── Full State Schema ────────────────────────────────────────────────────

export const fortunaStateSchema = z.object({
  profile: profileSchema,
  incomeStreams: z.array(incomeStreamSchema),
  expenses: z.array(expenseSchema),
  deductions: z.array(deductionSchema),
  entities: z.array(entitySchema),
  investments: z.array(investmentSchema).optional(),
  household: householdSchema.optional(),
  estimatedPayments: z.array(estimatedPaymentSchema).optional(),
  retirementAccounts: z.array(retirementAccountSchema).optional(),
}).passthrough() // Allow additional fields for extensibility

// ─── Validation Functions ─────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: { path: string; message: string; value?: unknown }[]
  warnings: { path: string; message: string }[]
  sanitized?: unknown // cleaned data if valid
}

/** Validate full FortunaState */
export function validateState(data: unknown): ValidationResult {
  const result = fortunaStateSchema.safeParse(data)
  if (result.success) {
    return { valid: true, errors: [], warnings: generateWarnings(result.data), sanitized: result.data }
  }
  return {
    valid: false,
    errors: result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
    warnings: [],
  }
}

/** Validate a single income stream */
export function validateIncome(data: unknown): ValidationResult {
  const result = incomeStreamSchema.safeParse(data)
  if (result.success) return { valid: true, errors: [], warnings: [] }
  return {
    valid: false,
    errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    warnings: [],
  }
}

/** Validate entity */
export function validateEntity(data: unknown): ValidationResult {
  const result = entitySchema.safeParse(data)
  if (result.success) return { valid: true, errors: [], warnings: [] }
  return {
    valid: false,
    errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    warnings: [],
  }
}

/** Validate CSV import row (lenient) */
export function validateImportRow(row: Record<string, unknown>, rowIndex: number): ValidationResult {
  const warnings: { path: string; message: string }[] = []
  const errors: { path: string; message: string; value?: unknown }[] = []

  // Check for required fields
  if (!row.name && !row.Name && !row.description) {
    errors.push({ path: `row[${rowIndex}].name`, message: 'Missing name/description field' })
  }

  // Check numeric fields
  for (const [key, value] of Object.entries(row)) {
    if (['amount', 'annualAmount', 'monthlyAmount', 'costBasis', 'quantity', 'balance'].includes(key)) {
      const num = Number(value)
      if (isNaN(num)) {
        errors.push({ path: `row[${rowIndex}].${key}`, message: `"${value}" is not a valid number`, value })
      } else if (num < -1_000_000_000 || num > 1_000_000_000) {
        warnings.push({ path: `row[${rowIndex}].${key}`, message: `Value ${num} seems unusually large` })
      }
    }
  }

  // Check dates
  for (const [key, value] of Object.entries(row)) {
    if (['date', 'acquiredDate', 'disposalDate', 'dueDate'].includes(key) && value) {
      const d = new Date(value as string)
      if (isNaN(d.getTime())) {
        errors.push({ path: `row[${rowIndex}].${key}`, message: `"${value}" is not a valid date` })
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Warning Generator ────────────────────────────────────────────────────

function generateWarnings(state: z.infer<typeof fortunaStateSchema>): { path: string; message: string }[] {
  const warnings: { path: string; message: string }[] = []

  // Check for suspiciously high values
  for (let i = 0; i < state.incomeStreams.length; i++) {
    const s = state.incomeStreams[i]
    if (s.annualAmount > 10_000_000) {
      warnings.push({ path: `incomeStreams[${i}].annualAmount`, message: `$${s.annualAmount.toLocaleString()} is unusually high — verify` })
    }
    if (s.annualAmount < 0) {
      warnings.push({ path: `incomeStreams[${i}].annualAmount`, message: 'Negative income — should this be an expense or loss?' })
    }
  }

  // Check entity references exist
  const entityIds = new Set(state.entities.map(e => e.id))
  for (let i = 0; i < state.incomeStreams.length; i++) {
    const s = state.incomeStreams[i]
    if (s.entityId && s.entityId !== 'personal' && !entityIds.has(s.entityId)) {
      warnings.push({ path: `incomeStreams[${i}].entityId`, message: `References entity "${s.entityId}" which doesn't exist` })
    }
  }

  // Check S-Corp has officer salary
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i]
    if ((e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive && (!e.officerSalary || e.officerSalary === 0)) {
      warnings.push({ path: `entities[${i}].officerSalary`, message: `Active S-Corp "${e.name}" has no officer salary — IRS requires reasonable compensation` })
    }
  }

  return warnings
}
