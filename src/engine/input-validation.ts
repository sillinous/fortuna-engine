/**
 * Fortuna Engine — Financial Input Validation
 *
 * Domain-specific validation rules for all financial inputs.
 * Goes beyond basic type checking — applies tax domain knowledge:
 *   • IRS contribution limits (401k, IRA, HSA)
 *   • Reasonable salary tests (S-Corp)
 *   • Filing status / dependent consistency
 *   • Depreciation schedules
 *   • Deduction ceilings
 *   • Suspicious pattern detection
 *
 * @module input-validation
 */

import type { FortunaState, IncomeStream, BusinessExpense, LegalEntity,
  DepreciationAsset, RetirementAccount, EstimatedPayment
} from './storage'

// ─── Validation Types ─────────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  field: string          // Dot-path: "incomeStreams.0.annualAmount"
  severity: Severity
  message: string
  suggestion?: string    // Suggested fix
  autoFixValue?: unknown // Value that would fix it
  irsRef?: string        // IRS reference (e.g., "Pub 590-A")
}

export interface FieldValidation {
  valid: boolean
  issues: ValidationIssue[]
}

// ─── 2025 IRS Limits ──────────────────────────────────────────────────────

export const IRS_LIMITS_2025 = {
  // Retirement contributions
  '401k_elective': 23_500,
  '401k_elective_50plus': 31_000,  // +$7,500 catch-up
  '401k_total': 70_000,           // Employer + employee
  'ira_contribution': 7_000,
  'ira_contribution_50plus': 8_000,
  'sep_ira_max': 70_000,
  'simple_ira': 16_500,
  'simple_ira_50plus': 20_000,

  // HSA
  'hsa_individual': 4_300,
  'hsa_family': 8_550,
  'hsa_catchup_55plus': 1_000,

  // Income thresholds
  'qbi_deduction_single': 191_950,
  'qbi_deduction_joint': 383_900,
  'amt_exemption_single': 88_100,
  'amt_exemption_joint': 137_000,

  // Deduction limits
  'salt_cap': 10_000,
  'charitable_cash_agi_limit': 0.60,    // 60% of AGI
  'charitable_appreciated_agi_limit': 0.30, // 30% of AGI
  'student_loan_interest_max': 2_500,
  'educator_expense': 300,
  'home_office_simplified_max': 1_500, // $5/sqft × 300 sqft

  // Standard deductions
  'standard_deduction_single': 15_000,
  'standard_deduction_joint': 30_000,
  'standard_deduction_hoh': 22_500,
  'standard_deduction_separate': 15_000,

  // Self-employment
  'se_tax_rate': 0.153,  // 15.3%
  'social_security_wage_base': 176_100,

  // Estimated payments
  'safe_harbor_pct': 0.90,  // Pay 90% of current year
  'prior_year_safe_harbor': 1.10,  // Or 110% of prior year (AGI > $150K)

  // Depreciation
  'section_179_limit': 1_250_000,
  'section_179_phaseout': 3_130_000,
  'bonus_depreciation_pct': 0.40,  // 2025: 40% (phasing down)
} as const

// ─── Field-Level Validators ───────────────────────────────────────────────

/**
 * Validate a currency/dollar amount input.
 */
export function validateAmount(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; allowNegative?: boolean; label?: string } = {},
): FieldValidation {
  const issues: ValidationIssue[] = []
  const label = opts.label || field

  if (value === undefined || value === null || value === '') {
    issues.push({ field, severity: 'error', message: `${label} is required` })
    return { valid: false, issues }
  }

  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value)

  if (isNaN(num)) {
    issues.push({ field, severity: 'error', message: `${label} must be a valid number`, suggestion: 'Remove any letters or special characters' })
    return { valid: false, issues }
  }

  if (!opts.allowNegative && num < 0) {
    issues.push({ field, severity: 'error', message: `${label} cannot be negative`, autoFixValue: Math.abs(num) })
  }

  if (opts.min !== undefined && num < opts.min) {
    issues.push({ field, severity: 'error', message: `${label} must be at least $${opts.min.toLocaleString()}` })
  }

  if (opts.max !== undefined && num > opts.max) {
    issues.push({ field, severity: 'warning', message: `${label} of $${num.toLocaleString()} exceeds expected maximum of $${opts.max.toLocaleString()}`, suggestion: 'Double-check this amount' })
  }

  // Suspicious amounts
  if (num > 10_000_000) {
    issues.push({ field, severity: 'warning', message: `${label} of $${num.toLocaleString()} is unusually high — is this correct?` })
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
}

/**
 * Validate a percentage input (0-100).
 */
export function validatePercentage(value: unknown, field: string, label?: string): FieldValidation {
  const issues: ValidationIssue[] = []
  const name = label || field
  const num = Number(value)

  if (isNaN(num)) {
    issues.push({ field, severity: 'error', message: `${name} must be a number` })
  } else if (num < 0 || num > 100) {
    issues.push({ field, severity: 'error', message: `${name} must be between 0% and 100%`, autoFixValue: Math.max(0, Math.min(100, num)) })
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
}

/**
 * Validate a tax year.
 */
export function validateTaxYear(value: unknown, field: string): FieldValidation {
  const issues: ValidationIssue[] = []
  const num = Number(value)
  const currentYear = new Date().getFullYear()

  if (isNaN(num) || !Number.isInteger(num)) {
    issues.push({ field, severity: 'error', message: 'Tax year must be a whole number' })
  } else if (num < 2020 || num > currentYear + 1) {
    issues.push({ field, severity: 'warning', message: `Tax year ${num} seems unusual. Current year is ${currentYear}.` })
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
}

/**
 * Validate a date string (ISO format).
 */
export function validateDate(value: unknown, field: string, label?: string): FieldValidation {
  const issues: ValidationIssue[] = []
  const name = label || field

  if (!value || typeof value !== 'string') {
    issues.push({ field, severity: 'error', message: `${name} is required` })
    return { valid: false, issues }
  }

  const d = new Date(value)
  if (isNaN(d.getTime())) {
    issues.push({ field, severity: 'error', message: `${name} is not a valid date`, suggestion: 'Use YYYY-MM-DD format' })
  } else if (d.getFullYear() < 1950) {
    issues.push({ field, severity: 'warning', message: `${name} date of ${value} seems unusually old` })
  } else if (d > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 * 10)) {
    issues.push({ field, severity: 'warning', message: `${name} date is more than 10 years in the future` })
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
}

// ─── Domain-Specific Validators ───────────────────────────────────────────

/**
 * Validate an income stream against domain rules.
 */
export function validateIncomeStream(income: Partial<IncomeStream>, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `incomeStreams.${index}`

  if (!income.name?.trim()) {
    issues.push({ field: `${prefix}.name`, severity: 'error', message: 'Income source name is required' })
  }

  if (!income.type) {
    issues.push({ field: `${prefix}.type`, severity: 'error', message: 'Income type is required' })
  }

  const amtCheck = validateAmount(income.annualAmount, `${prefix}.annualAmount`, { label: 'Annual income', max: 50_000_000 })
  issues.push(...amtCheck.issues)

  // W-2 specific checks
  if (income.type === 'w2' && income.w2) {
    if (income.w2.federalWithholding && income.annualAmount && income.w2.federalWithholding > income.annualAmount * 0.5) {
      issues.push({
        field: `${prefix}.w2.federalWithholding`,
        severity: 'warning',
        message: 'Federal withholding exceeds 50% of gross salary — verify this is correct',
      })
    }
    if (income.w2.pretax401k && income.w2.pretax401k > IRS_LIMITS_2025['401k_elective_50plus']) {
      issues.push({
        field: `${prefix}.w2.pretax401k`,
        severity: 'warning',
        message: `401(k) contribution of $${income.w2.pretax401k.toLocaleString()} exceeds 2025 limit of $${IRS_LIMITS_2025['401k_elective_50plus'].toLocaleString()} (50+ catch-up)`,
        irsRef: 'IRC §402(g)',
      })
    }
    if (income.w2.pretaxHSA) {
      const limit = IRS_LIMITS_2025.hsa_family // Conservative
      if (income.w2.pretaxHSA > limit + IRS_LIMITS_2025.hsa_catchup_55plus) {
        issues.push({
          field: `${prefix}.w2.pretaxHSA`,
          severity: 'warning',
          message: `HSA contribution exceeds 2025 family limit + catch-up`,
          irsRef: 'IRC §223(b)',
        })
      }
    }
  }

  // S-Corp reasonable salary check
  if (income.type === 'business' && income.scorp) {
    if (income.scorp.officerSalary && income.annualAmount) {
      const salaryRatio = income.scorp.officerSalary / income.annualAmount
      if (salaryRatio < 0.20) {
        issues.push({
          field: `${prefix}.scorp.officerSalary`,
          severity: 'warning',
          message: `S-Corp officer salary is only ${(salaryRatio * 100).toFixed(0)}% of total income. IRS may challenge this as too low.`,
          suggestion: 'Consider increasing to at least 30-40% for reasonable compensation',
          irsRef: 'IRS Fact Sheet 2008-25',
        })
      }
    }
  }

  return issues
}

/**
 * Validate a business expense.
 */
export function validateExpense(expense: Partial<BusinessExpense>, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `expenses.${index}`

  if (!expense.category?.trim()) {
    issues.push({ field: `${prefix}.category`, severity: 'error', message: 'Expense category is required' })
  }

  const amtCheck = validateAmount(expense.annualAmount, `${prefix}.annualAmount`, { label: 'Expense amount', max: 10_000_000 })
  issues.push(...amtCheck.issues)

  if (expense.deductionPct !== undefined) {
    const pctCheck = validatePercentage(expense.deductionPct, `${prefix}.deductionPct`, 'Deduction percentage')
    issues.push(...pctCheck.issues)
  }

  // Meals are 50% deductible (post-TCJA, after 2025 temporary 100% expired)
  if (expense.category?.toLowerCase().includes('meal') && expense.deductionPct === 100) {
    issues.push({
      field: `${prefix}.deductionPct`,
      severity: 'warning',
      message: 'Business meals are generally 50% deductible (the temporary 100% deduction expired after 2022)',
      autoFixValue: 50,
      irsRef: 'IRC §274(n)',
    })
  }

  // Entertainment is 0% deductible post-TCJA
  if (expense.category?.toLowerCase().includes('entertainment') && expense.isDeductible) {
    issues.push({
      field: `${prefix}.isDeductible`,
      severity: 'warning',
      message: 'Entertainment expenses are generally NOT deductible after TCJA (2018+)',
      autoFixValue: false,
      irsRef: 'IRC §274(a)(1)',
    })
  }

  return issues
}

/**
 * Validate an entity.
 */
export function validateEntity(entity: Partial<LegalEntity>, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `entities.${index}`

  if (!entity.name?.trim()) {
    issues.push({ field: `${prefix}.name`, severity: 'error', message: 'Entity name is required' })
  }
  if (!entity.type) {
    issues.push({ field: `${prefix}.type`, severity: 'error', message: 'Entity type is required' })
  }
  if (!entity.state?.trim()) {
    issues.push({ field: `${prefix}.state`, severity: 'warning', message: 'Formation state helps with state tax calculations' })
  }

  // S-Corp officer salary check
  if ((entity.type === 'scorp' || entity.type === 'llc_scorp' || entity.type === 'llc') && entity.officerSalary !== undefined) {
    if (entity.officerSalary < 20_000 && entity.isActive) {
      issues.push({
        field: `${prefix}.officerSalary`,
        severity: 'warning',
        message: 'S-Corp/LLC officer salary under $20K may be challenged by IRS as unreasonably low',
        irsRef: 'IRS Fact Sheet 2008-25',
      })
    }
  }

  // W-2 wages for QBI
  if (entity.type === 'scorp' && entity.w2WagesPaid === 0 && entity.isActive) {
    issues.push({
      field: `${prefix}.w2WagesPaid`,
      severity: 'info',
      message: 'No W-2 wages paid. QBI deduction may be limited for high-income taxpayers.',
      irsRef: 'IRC §199A(b)(2)',
    })
  }

  return issues
}

/**
 * Validate a retirement account.
 */
export function validateRetirementAccount(account: Partial<RetirementAccount>, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `retirementAccounts.${index}`

  if (!account.type) {
    issues.push({ field: `${prefix}.type`, severity: 'error', message: 'Account type is required' })
  }

  if (account.balance !== undefined && account.balance < 0) {
    issues.push({ field: `${prefix}.balance`, severity: 'error', message: 'Account balance cannot be negative', autoFixValue: 0 })
  }

  // Contribution limit checks
  if (account.annualContribution && account.type) {
    const limits: Record<string, { limit: number; ref: string }> = {
      'traditional_ira': { limit: IRS_LIMITS_2025.ira_contribution_50plus, ref: 'IRC §219(b)' },
      'roth_ira': { limit: IRS_LIMITS_2025.ira_contribution_50plus, ref: 'IRC §408A(c)' },
      '401k': { limit: IRS_LIMITS_2025['401k_elective_50plus'], ref: 'IRC §402(g)' },
      'roth_401k': { limit: IRS_LIMITS_2025['401k_elective_50plus'], ref: 'IRC §402(g)' },
      '403b': { limit: IRS_LIMITS_2025['401k_elective_50plus'], ref: 'IRC §402(g)' },
      'sep_ira': { limit: IRS_LIMITS_2025.sep_ira_max, ref: 'IRC §408(k)' },
      'simple_ira': { limit: IRS_LIMITS_2025.simple_ira_50plus, ref: 'IRC §408(p)' },
      'hsa': { limit: IRS_LIMITS_2025.hsa_family + IRS_LIMITS_2025.hsa_catchup_55plus, ref: 'IRC §223(b)' },
    }

    const check = limits[account.type]
    if (check && account.annualContribution > check.limit) {
      issues.push({
        field: `${prefix}.annualContribution`,
        severity: 'warning',
        message: `Contribution of $${account.annualContribution.toLocaleString()} exceeds 2025 ${account.type.toUpperCase()} limit of $${check.limit.toLocaleString()} (includes catch-up)`,
        irsRef: check.ref,
      })
    }
  }

  return issues
}

/**
 * Validate a depreciation asset.
 */
export function validateDepreciationAsset(asset: Partial<DepreciationAsset>, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `depreciationAssets.${index}`

  if (!asset.name?.trim()) {
    issues.push({ field: `${prefix}.name`, severity: 'error', message: 'Asset name is required' })
  }

  if (asset.purchasePrice !== undefined && asset.purchasePrice <= 0) {
    issues.push({ field: `${prefix}.purchasePrice`, severity: 'error', message: 'Purchase price must be greater than $0' })
  }

  if (asset.usefulLifeYears !== undefined && (asset.usefulLifeYears < 1 || asset.usefulLifeYears > 50)) {
    issues.push({
      field: `${prefix}.usefulLifeYears`,
      severity: 'warning',
      message: `Useful life of ${asset.usefulLifeYears} years seems unusual. Common values: 5, 7, 15, 27.5, 39 years.`,
      irsRef: 'IRS Pub 946, MACRS tables',
    })
  }

  if (asset.method === 'section_179' && asset.purchasePrice && asset.purchasePrice > IRS_LIMITS_2025.section_179_limit) {
    issues.push({
      field: `${prefix}.method`,
      severity: 'warning',
      message: `Section 179 deduction limited to $${IRS_LIMITS_2025.section_179_limit.toLocaleString()} for 2025`,
      irsRef: 'IRC §179(b)',
    })
  }

  return issues
}

/**
 * Validate estimated tax payments.
 */
export function validateEstimatedPayment(payment: Partial<EstimatedPayment>, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `estimatedPayments.${index}`

  if (payment.amount !== undefined && payment.amount < 0) {
    issues.push({ field: `${prefix}.amount`, severity: 'error', message: 'Payment amount cannot be negative' })
  }

  if (payment.quarter !== undefined && (payment.quarter < 1 || payment.quarter > 4)) {
    issues.push({ field: `${prefix}.quarter`, severity: 'error', message: 'Quarter must be 1-4' })
  }

  return issues
}

// ─── Full State Validation ────────────────────────────────────────────────

/**
 * Run all validators across the entire FortunaState.
 * Returns categorized issues for display.
 */
export function validateFullState(state: FortunaState): {
  issues: ValidationIssue[]
  errorCount: number
  warningCount: number
  infoCount: number
  sections: { section: string; issues: ValidationIssue[] }[]
} {
  const issues: ValidationIssue[] = []

  // Profile
  // Profile / Global
  const yr = validateTaxYear(state.taxYear, 'taxYear')
  issues.push(...yr.issues)

  if (state.profile) {
    if (state.profile.filingStatus === 'married_joint' || state.profile.filingStatus === 'married_separate') {
      if (!state.household?.members.some(m => m.role === 'spouse')) {
        issues.push({
          field: 'household.members',
          severity: 'info',
          message: 'Filing as married but no spouse info entered. Adding spouse details improves accuracy.',
        })
      }
    }

    if (state.profile.filingStatus === 'head_of_household') {
      const hasDependents = (state.household?.dependents?.length || 0) > 0
      if (!hasDependents) {
        issues.push({
          field: 'profile.filingStatus',
          severity: 'warning',
          message: 'Head of Household filing status generally requires a qualifying dependent',
          irsRef: 'IRC §2(b)',
        })
      }
    }
  }

  // Income streams
  for (let i = 0; i < (state.incomeStreams?.length || 0); i++) {
    issues.push(...validateIncomeStream(state.incomeStreams[i], i))
  }

  // Expenses
  for (let i = 0; i < (state.expenses?.length || 0); i++) {
    issues.push(...validateExpense(state.expenses[i], i))
  }

  // Entities
  for (let i = 0; i < (state.entities?.length || 0); i++) {
    issues.push(...validateEntity(state.entities[i], i))
  }

  // Retirement accounts
  for (let i = 0; i < (state.retirementAccounts?.length || 0); i++) {
    issues.push(...validateRetirementAccount(state.retirementAccounts[i], i))
  }

  // Depreciation assets
  for (let i = 0; i < (state.depreciationAssets?.length || 0); i++) {
    issues.push(...validateDepreciationAsset(state.depreciationAssets[i], i))
  }

  // Estimated payments
  for (let i = 0; i < (state.estimatedPayments?.length || 0); i++) {
    issues.push(...validateEstimatedPayment(state.estimatedPayments[i], i))
  }

  // Cross-field validations
  const totalIncome = (state.incomeStreams || []).reduce((s, i) => s + (i.annualAmount || 0), 0)
  const totalExpenses = (state.expenses || []).reduce((s, e) => s + (e.annualAmount || 0), 0)

  if (totalExpenses > totalIncome * 2 && totalIncome > 0) {
    issues.push({
      field: 'expenses',
      severity: 'warning',
      message: `Total expenses ($${totalExpenses.toLocaleString()}) are more than 2× income ($${totalIncome.toLocaleString()}).`,
      suggestion: 'Verify expense amounts — the IRS may flag disproportionate deductions',
    })
  }

  // SALT cap check
  const saltExpenses = (state.deductions || []).filter(d =>
    d.categoryId === 'state_local_tax' || d.categoryId === 'property_tax',
  )
  const totalSALT = saltExpenses.reduce((s, d) => s + (d.amount || 0), 0)
  if (totalSALT > IRS_LIMITS_2025.salt_cap) {
    issues.push({
      field: 'deductions.salt',
      severity: 'info',
      message: `SALT deductions of $${totalSALT.toLocaleString()} exceed the $${IRS_LIMITS_2025.salt_cap.toLocaleString()} cap. Only $10K is deductible.`,
      irsRef: 'IRC §164(b)(6)',
    })
  }

  // Group by section
  const sectionMap = new Map<string, ValidationIssue[]>()
  for (const issue of issues) {
    const section = issue.field.split('.')[0]
    if (!sectionMap.has(section)) sectionMap.set(section, [])
    sectionMap.get(section)!.push(issue)
  }

  return {
    issues,
    errorCount: issues.filter(i => i.severity === 'error').length,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    infoCount: issues.filter(i => i.severity === 'info').length,
    sections: Array.from(sectionMap.entries()).map(([section, issues]) => ({ section, issues })),
  }
}

// ─── Inline Helpers for Views ─────────────────────────────────────────────

/**
 * Quick check if a field value is valid for display (red border, etc.).
 */
export function isFieldValid(value: unknown, type: 'amount' | 'percentage' | 'year' | 'date' | 'required'): boolean {
  switch (type) {
    case 'amount': return typeof value === 'number' && !isNaN(value) && value >= 0
    case 'percentage': return typeof value === 'number' && value >= 0 && value <= 100
    case 'year': { const n = Number(value); return !isNaN(n) && n >= 2020 && n <= 2030 }
    case 'date': return typeof value === 'string' && !isNaN(new Date(value).getTime())
    case 'required': return value !== undefined && value !== null && value !== ''
    default: return true
  }
}

/**
 * Format a currency input (strip non-numeric, format with commas).
 */
export function formatCurrencyInput(value: string): { display: string; numeric: number } {
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const numeric = parseFloat(cleaned)
  if (isNaN(numeric)) return { display: value, numeric: 0 }
  const display = numeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return { display, numeric }
}

/**
 * Get the applicable IRS limit for a field, for inline display.
 */
export function getIRSLimit(field: string): { limit: number; label: string; ref: string } | null {
  const limits: Record<string, { limit: number; label: string; ref: string }> = {
    '401k_contribution': { limit: IRS_LIMITS_2025['401k_elective'], label: '2025 401(k) elective limit', ref: 'IRC §402(g)' },
    'ira_contribution': { limit: IRS_LIMITS_2025.ira_contribution, label: '2025 IRA contribution limit', ref: 'IRC §219(b)' },
    'hsa_individual': { limit: IRS_LIMITS_2025.hsa_individual, label: '2025 HSA individual limit', ref: 'IRC §223(b)' },
    'hsa_family': { limit: IRS_LIMITS_2025.hsa_family, label: '2025 HSA family limit', ref: 'IRC §223(b)' },
    'salt_deduction': { limit: IRS_LIMITS_2025.salt_cap, label: 'SALT deduction cap', ref: 'IRC §164(b)(6)' },
    'section_179': { limit: IRS_LIMITS_2025.section_179_limit, label: '2025 Section 179 limit', ref: 'IRC §179(b)' },
    'student_loan_interest': { limit: IRS_LIMITS_2025.student_loan_interest_max, label: 'Student loan interest deduction', ref: '1040 Line 21' },
  }
  return limits[field] || null
}
