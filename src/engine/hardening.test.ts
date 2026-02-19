/**
 * Fortuna Engine — Hardening Test Suite
 *
 * Covers:
 *   1. Data Safety: validation, repair, backup rotation, corruption recovery
 *   2. Input Validation: IRS limits, domain rules, field validators
 *   3. QuickBooks Parsers: IIF, OFX/QBO, COA mapping
 *   4. State Integrity: referential integrity, migration, defaults
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDefaultState, type FortunaState } from './storage'

// ─── Data Safety Tests ────────────────────────────────────────────────────

import { validateState, repairState, type ValidationResult } from './data-safety'

describe('data safety: state validation', () => {
  let state: FortunaState

  beforeEach(() => {
    state = createDefaultState()
  })

  it('should validate a clean default state', () => {
    const result = validateState(state)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject null/undefined state', () => {
    expect(validateState(null).valid).toBe(false)
    expect(validateState(undefined).valid).toBe(false)
    expect(validateState(42).valid).toBe(false)
  })

  it('should error on missing profile', () => {
    const bad = { ...state, profile: undefined } as unknown
    const result = validateState(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('profile'))).toBe(true)
  })

  it('should error on invalid filingStatus', () => {
    const bad = { ...state, profile: { ...state.profile, filingStatus: 'invalid' } }
    const result = validateState(bad)
    expect(result.errors.some(e => e.includes('filingStatus'))).toBe(true)
  })

  it('should warn on missing arrays', () => {
    const partial = { profile: state.profile } as unknown
    const result = validateState(partial)
    expect(result.warnings.some(w => w.includes('Missing array'))).toBe(true)
  })

  it('should warn on negative income', () => {
    const bad = {
      ...state,
      incomeStreams: [{ id: '1', name: 'Test', type: 'w2', annualAmount: -50000, isActive: true }],
    }
    const result = validateState(bad)
    expect(result.warnings.some(w => w.includes('negative'))).toBe(true)
  })

  it('should warn on extremely high income', () => {
    const high = {
      ...state,
      incomeStreams: [{ id: '1', name: 'Test', type: 'w2', annualAmount: 200_000_000, isActive: true }],
    }
    const result = validateState(high)
    expect(result.warnings.some(w => w.includes('unusually high'))).toBe(true)
  })

  it('should error on non-array incomeStreams', () => {
    const bad = { ...state, incomeStreams: 'not an array' } as unknown
    const result = validateState(bad)
    expect(result.errors.some(e => e.includes('not an array'))).toBe(true)
  })

  it('should warn on orphaned entity references', () => {
    const bad = {
      ...state,
      incomeStreams: [{ id: '1', name: 'Biz', type: 'business', annualAmount: 100000, isActive: true, entityId: 'ghost_entity' }],
      entities: [],
    }
    const result = validateState(bad)
    expect(result.warnings.some(w => w.includes('non-existent entity'))).toBe(true)
  })

  it('should detect missing entity type', () => {
    const bad = {
      ...state,
      entities: [{ id: '1', name: 'LLC', state: 'IL', annualCost: 0, isActive: true }],
    }
    const result = validateState(bad)
    expect(result.errors.some(e => e.includes('missing type'))).toBe(true)
  })
})

describe('data safety: state repair', () => {
  it('should create default state from null', () => {
    const { state, repairs } = repairState(null)
    expect(state.profile).toBeDefined()
    expect(repairs.length).toBeGreaterThan(0)
  })

  it('should restore missing arrays', () => {
    const partial = { profile: createDefaultState().profile }
    const { state, repairs } = repairState(partial)
    expect(Array.isArray(state.incomeStreams)).toBe(true)
    expect(Array.isArray(state.expenses)).toBe(true)
    expect(Array.isArray(state.entities)).toBe(true)
    expect(repairs.some(r => r.includes('Initialized missing array'))).toBe(true)
  })

  it('should add missing IDs to array items', () => {
    const noId = {
      profile: createDefaultState().profile,
      incomeStreams: [{ name: 'Job', type: 'w2', annualAmount: 50000, isActive: true }],
      expenses: [], entities: [], deductions: [], depreciationAssets: [],
      investments: [], retirementAccounts: [], goals: [], documents: [],
      estimatedPayments: [], bankTransactions: [],
    }
    const { state, repairs } = repairState(noId)
    expect(state.incomeStreams[0].id).toBeTruthy()
    expect(repairs.some(r => r.includes('Generated missing id'))).toBe(true)
  })

  it('repaired state should pass validation', () => {
    const corrupt = { profile: null, incomeStreams: 'broken' }
    const { state } = repairState(corrupt)
    const v = validateState(state)
    expect(v.valid).toBe(true)
  })
})

// ─── Input Validation Tests ───────────────────────────────────────────────

import {
  validateAmount, validatePercentage, validateTaxYear, validateDate,
  validateIncomeStream, validateExpense, validateEntity,
  validateRetirementAccount, validateDepreciationAsset,
  validateFullState, isFieldValid, formatCurrencyInput,
  IRS_LIMITS_2025,
} from './input-validation'

describe('input validation: field validators', () => {
  it('validateAmount: rejects NaN', () => {
    const r = validateAmount('abc', 'test')
    expect(r.valid).toBe(false)
    expect(r.issues[0].severity).toBe('error')
  })

  it('validateAmount: rejects negative when not allowed', () => {
    const r = validateAmount(-100, 'test')
    expect(r.issues.some(i => i.message.includes('negative'))).toBe(true)
  })

  it('validateAmount: allows negative when explicitly permitted', () => {
    const r = validateAmount(-100, 'test', { allowNegative: true })
    expect(r.valid).toBe(true)
  })

  it('validateAmount: warns on high values', () => {
    const r = validateAmount(50_000_000, 'test')
    expect(r.issues.some(i => i.severity === 'warning')).toBe(true)
  })

  it('validateAmount: strips currency formatting', () => {
    const r = validateAmount('$1,234.56', 'test')
    expect(r.valid).toBe(true)
  })

  it('validateAmount: rejects empty', () => {
    expect(validateAmount('', 'test').valid).toBe(false)
    expect(validateAmount(null, 'test').valid).toBe(false)
    expect(validateAmount(undefined, 'test').valid).toBe(false)
  })

  it('validatePercentage: rejects out of range', () => {
    expect(validatePercentage(-5, 'test').valid).toBe(false)
    expect(validatePercentage(101, 'test').valid).toBe(false)
    expect(validatePercentage(50, 'test').valid).toBe(true)
  })

  it('validateTaxYear: accepts current and recent years', () => {
    expect(validateTaxYear(2025, 'test').valid).toBe(true)
    expect(validateTaxYear(2024, 'test').valid).toBe(true)
  })

  it('validateTaxYear: warns on old/future years', () => {
    const r = validateTaxYear(2010, 'test')
    expect(r.issues.some(i => i.severity === 'warning')).toBe(true)
  })

  it('validateDate: rejects invalid dates', () => {
    expect(validateDate('not-a-date', 'test').valid).toBe(false)
    expect(validateDate('', 'test').valid).toBe(false)
  })

  it('validateDate: accepts ISO dates', () => {
    expect(validateDate('2025-01-15', 'test').valid).toBe(true)
    expect(validateDate('2025-12-31', 'test').valid).toBe(true)
  })
})

describe('input validation: domain rules', () => {
  it('warns on 401k contribution over limit', () => {
    const income = {
      name: 'Job', type: 'w2' as const, annualAmount: 150000, isActive: true,
      w2: { pretax401k: 40000, grossSalary: 150000 },
    }
    const issues = validateIncomeStream(income, 0)
    expect(issues.some(i => i.message.includes('401(k)') && i.message.includes('limit'))).toBe(true)
  })

  it('warns on low S-Corp officer salary', () => {
    const income = {
      name: 'S-Corp', type: 'business' as const, annualAmount: 200000, isActive: true,
      scorp: { officerSalary: 20000, distributions: 180000 },
    }
    const issues = validateIncomeStream(income, 0)
    expect(issues.some(i => i.message.includes('officer salary') && i.message.includes('too low'))).toBe(true)
  })

  it('warns on 100% meals deduction (post-TCJA)', () => {
    const expense = {
      category: 'Meals & Entertainment', annualAmount: 5000,
      isDeductible: true, deductionPct: 100,
    }
    const issues = validateExpense(expense, 0)
    expect(issues.some(i => i.message.includes('50% deductible'))).toBe(true)
  })

  it('warns on entertainment deduction (post-TCJA)', () => {
    const expense = {
      category: 'entertainment', annualAmount: 3000,
      isDeductible: true, deductionPct: 100,
    }
    const issues = validateExpense(expense, 0)
    expect(issues.some(i => i.message.includes('NOT deductible'))).toBe(true)
  })

  it('warns on HoH without dependents', () => {
    const state = {
      ...createDefaultState(),
      profile: { ...createDefaultState().profile, filingStatus: 'head_of_household' as const },
      incomeStreams: [{ id: '1', name: 'Job', type: 'w2' as const, annualAmount: 50000, isActive: true }],
    }
    const result = validateFullState(state as FortunaState)
    expect(result.issues.some(i => i.message.includes('qualifying dependent'))).toBe(true)
  })

  it('warns on expenses > 2x income', () => {
    const state = {
      ...createDefaultState(),
      incomeStreams: [{ id: '1', name: 'Job', type: 'w2' as const, annualAmount: 50000, isActive: true }],
      expenses: [{ id: '1', category: 'office', description: 'Big expense', annualAmount: 150000, isDeductible: true, deductionPct: 100 }],
    }
    const result = validateFullState(state as FortunaState)
    expect(result.issues.some(i => i.message.includes('2×'))).toBe(true)
  })

  it('warns on IRA contribution over limit', () => {
    const account = {
      type: 'traditional_ira' as const, balance: 50000,
      annualContribution: 15000,
    }
    const issues = validateRetirementAccount(account, 0)
    expect(issues.some(i => i.message.includes('limit'))).toBe(true)
  })

  it('warns on Section 179 over limit', () => {
    const asset = {
      name: 'Equipment', costBasis: 2_000_000,
      section179: true, usefulLifeYears: 7,
    }
    const issues = validateDepreciationAsset(asset, 0)
    expect(issues.some(i => i.message.includes('Section 179'))).toBe(true)
  })
})

describe('input validation: helpers', () => {
  it('isFieldValid checks amounts correctly', () => {
    expect(isFieldValid(100, 'amount')).toBe(true)
    expect(isFieldValid(-1, 'amount')).toBe(false)
    expect(isFieldValid(NaN, 'amount')).toBe(false)
  })

  it('isFieldValid checks percentages correctly', () => {
    expect(isFieldValid(50, 'percentage')).toBe(true)
    expect(isFieldValid(101, 'percentage')).toBe(false)
    expect(isFieldValid(-1, 'percentage')).toBe(false)
  })

  it('formatCurrencyInput strips non-numeric', () => {
    expect(formatCurrencyInput('$1,234.56').numeric).toBe(1234.56)
    expect(formatCurrencyInput('abc').numeric).toBe(0)
    expect(formatCurrencyInput('10000').numeric).toBe(10000)
  })

  it('IRS limits are populated for 2025', () => {
    expect(IRS_LIMITS_2025['401k_elective']).toBe(23500)
    expect(IRS_LIMITS_2025.ira_contribution).toBe(7000)
    expect(IRS_LIMITS_2025.salt_cap).toBe(10000)
    expect(IRS_LIMITS_2025.section_179_limit).toBe(1_250_000)
    expect(IRS_LIMITS_2025.social_security_wage_base).toBe(176_100)
  })
})

// ─── QuickBooks Parser Tests ──────────────────────────────────────────────

import { parseIIF, generateIIF, type IIFParseResult } from './qb-iif-parser'
import { parseOFX, parseQIF, type OFXParseResult } from './qb-ofx-parser'
import { mapAccount, mapAllAccounts, type AccountMapping } from './qb-coa-mapper'

describe('QuickBooks IIF parser', () => {
  const SAMPLE_IIF = `!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO
!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO
!ENDTRNS
TRNS\tCHECK\t01/15/2025\tChecking\tOffice Depot\t-150.00\tOffice supplies
SPL\tCHECK\t01/15/2025\tOffice Supplies\t\t150.00\t
ENDTRNS
TRNS\tDEPOSIT\t01/20/2025\tChecking\tClient ABC\t5000.00\tProject payment
SPL\tDEPOSIT\t01/20/2025\tConsulting Income\t\t-5000.00\t
ENDTRNS`

  it('should parse transactions from IIF text', () => {
    const result = parseIIF(SAMPLE_IIF)
    expect(result.transactions).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('should extract transaction types correctly', () => {
    const result = parseIIF(SAMPLE_IIF)
    expect(result.transactions[0].header.trnsType).toBe('CHECK')
    expect(result.transactions[1].header.trnsType).toBe('DEPOSIT')
  })

  it('should parse amounts correctly', () => {
    const result = parseIIF(SAMPLE_IIF)
    expect(result.transactions[0].header.amount).toBe(-150)
    expect(result.transactions[1].header.amount).toBe(5000)
  })

  it('should verify transaction balance (TRNS + SPL = 0)', () => {
    const result = parseIIF(SAMPLE_IIF)
    for (const txn of result.transactions) {
      const total = txn.header.amount + txn.splits.reduce((s, sp) => s + sp.amount, 0)
      expect(Math.abs(total)).toBeLessThan(0.01) // Penny tolerance
    }
  })

  it('should parse account records', () => {
    const iifWithAccounts = `!ACCNT\tNAME\tACCNTTYPE\tDESC
ACCNT\tChecking\tBANK\tMain checking
ACCNT\tConsulting Income\tINC\tService revenue
ACCNT\tOffice Supplies\tEXP\tOffice materials`

    const result = parseIIF(iifWithAccounts)
    expect(result.accounts).toHaveLength(3)
    expect(result.accounts[0].name).toBe('Checking')
    expect(result.accounts[0].accountType).toBe('BANK')
    expect(result.accounts[1].accountType).toBe('INC')
  })

  it('should handle empty input gracefully', () => {
    const result = parseIIF('')
    expect(result.transactions).toHaveLength(0)
    expect(result.accounts).toHaveLength(0)
  })

  it('should round-trip via generateIIF', () => {
    const result = parseIIF(SAMPLE_IIF)
    const regenerated = generateIIF({ accounts: result.accounts, transactions: result.transactions })
    expect(regenerated).toContain('CHECK')
    expect(regenerated).toContain('DEPOSIT')
    expect(regenerated).toContain('ENDTRNS')
  })
})


describe('QuickBooks OFX parser', () => {
  const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20250115<LANGUAGE>ENG</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKACCTFROM><BANKID>021000021<ACCTID>123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20250101<DTEND>20250131
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250105<TRNAMT>-42.50<FITID>TXN001<NAME>AMAZON.COM</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250115<TRNAMT>3500.00<FITID>TXN002<NAME>PAYROLL DIRECT DEPOSIT</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>8234.56<DTASOF>20250131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

  it('should parse OFX bank statements', () => {
    const result = parseOFX(SAMPLE_OFX)
    expect(result.statements.length).toBeGreaterThan(0)
    expect(result.stats.transactionCount).toBe(2)
  })

  it('should extract amounts correctly', () => {
    const result = parseOFX(SAMPLE_OFX)
    const txns = result.statements[0].transactions
    expect(txns[0].amount).toBe(-42.50)
    expect(txns[1].amount).toBe(3500)
  })

  it('should extract payee names', () => {
    const result = parseOFX(SAMPLE_OFX)
    const txns = result.statements[0].transactions
    expect(txns[0].name).toBe('AMAZON.COM')
    expect(txns[1].name).toBe('PAYROLL DIRECT DEPOSIT')
  })

  it('should extract unique FITIDs', () => {
    const result = parseOFX(SAMPLE_OFX)
    const fitids = result.statements[0].transactions.map(t => t.fitId)
    expect(new Set(fitids).size).toBe(fitids.length)
  })

  it('should extract bank account info', () => {
    const result = parseOFX(SAMPLE_OFX)
    const stmt = result.statements[0]
    expect(stmt.bankAccount?.bankId).toBe('021000021')
    expect(stmt.bankAccount?.accountId).toBe('123456789')
    expect(stmt.bankAccount?.accountType).toBe('CHECKING')
  })

  it('should extract ledger balance', () => {
    const result = parseOFX(SAMPLE_OFX)
    expect(result.statements[0].ledgerBalance?.amount).toBe(8234.56)
  })

  it('should handle empty OFX gracefully', () => {
    const result = parseOFX('<OFX></OFX>')
    expect(result.stats.transactionCount).toBe(0)
  })
})

describe('QuickBooks QIF parser', () => {
  const SAMPLE_QIF = `!Type:Bank
D01/05/2025
T-42.50
PAMAZON.COM
MOnline purchase
LOffice Supplies
^
D01/15/2025
T3500.00
PPAYROLL
MJanuary salary
LIncome:Salary
^`

  it('should parse QIF transactions', () => {
    const result = parseQIF(SAMPLE_QIF)
    expect(result.transactions).toHaveLength(2)
  })

  it('should extract amounts', () => {
    const result = parseQIF(SAMPLE_QIF)
    expect(result.transactions[0].amount).toBe(-42.50)
    expect(result.transactions[1].amount).toBe(3500)
  })

  it('should extract payees', () => {
    const result = parseQIF(SAMPLE_QIF)
    expect(result.transactions[0].payee).toBe('AMAZON.COM')
    expect(result.transactions[1].payee).toBe('PAYROLL')
  })

  it('should extract categories', () => {
    const result = parseQIF(SAMPLE_QIF)
    expect(result.transactions[0].category).toBe('Office Supplies')
    expect(result.transactions[1].category).toBe('Income:Salary')
  })
})

describe('QuickBooks COA mapper', () => {
  it('should map INC accounts to business_income', () => {
    const mapping = mapAccount({ name: 'Sales Revenue', accountType: 'INC' } as any)
    expect(mapping.fortunaCategory).toBe('business_income')
    expect(mapping.isDeductible).toBe(false)
  })

  it('should map EXP accounts to business_expense', () => {
    const mapping = mapAccount({ name: 'Office Supplies', accountType: 'EXP' } as any)
    expect(mapping.fortunaCategory).toBe('business_expense')
    expect(mapping.isDeductible).toBe(true)
  })

  it('should map COGS accounts correctly', () => {
    const mapping = mapAccount({ name: 'Cost of Goods Sold', accountType: 'COGS' } as any)
    expect(mapping.fortunaCategory).toBe('cogs')
  })

  it('should detect vehicle expenses from account name', () => {
    const mapping = mapAccount({ name: 'Auto Expense', accountType: 'EXP' } as any)
    expect(mapping.fortunaCategory).toBe('vehicle_expense')
    expect(mapping.scheduleRef).toContain('Schedule C')
  })

  it('should detect home office from account name', () => {
    const mapping = mapAccount({ name: 'Business Use of Home', accountType: 'EXP' } as any)
    expect(mapping.fortunaCategory).toBe('home_office')
    expect(mapping.scheduleRef).toContain('Form 8829')
  })

  it('should detect depreciation from account name', () => {
    const mapping = mapAccount({ name: 'Depreciation Expense', accountType: 'EXP' } as any)
    expect(mapping.fortunaCategory).toBe('depreciation')
  })

  it('should detect rental income', () => {
    const mapping = mapAccount({ name: 'Rental Income - Property A', accountType: 'INC' } as any)
    expect(mapping.fortunaCategory).toBe('rental_income')
    expect(mapping.scheduleRef).toContain('Schedule E')
  })

  it('should detect charitable donations', () => {
    const mapping = mapAccount({ name: 'Charitable Contributions', accountType: 'EXP' } as any)
    expect(mapping.fortunaCategory).toBe('itemized_deduction')
  })

  it('should mark entertainment as non-deductible', () => {
    const mapping = mapAccount({ name: 'Entertainment', accountType: 'EXP' } as any)
    expect(mapping.fortunaCategory).toBe('non_deductible')
  })

  it('should batch-map multiple accounts', () => {
    const accounts = [
      { name: 'Checking', accountType: 'BANK', description: '' },
      { name: 'Sales', accountType: 'INC', description: '' },
      { name: 'Rent Expense', accountType: 'EXP', description: '' },
    ]
    const result = mapAllAccounts(accounts as any)
    expect(result.size).toBe(3)
    expect(result.get('Sales')?.fortunaCategory).toBe('business_income')
    expect(result.get('Rent Expense')?.fortunaCategory).toBe('business_expense')
  })
})

// ─── State Integrity Tests ────────────────────────────────────────────────

describe('state integrity', () => {
  it('createDefaultState should pass validation', () => {
    const state = createDefaultState()
    const result = validateState(state)
    expect(result.valid).toBe(true)
  })

  it('default state should have all required arrays', () => {
    const state = createDefaultState()
    expect(Array.isArray(state.incomeStreams)).toBe(true)
    expect(Array.isArray(state.expenses)).toBe(true)
    expect(Array.isArray(state.entities)).toBe(true)
    expect(Array.isArray(state.deductions)).toBe(true)
    expect(Array.isArray(state.depreciationAssets)).toBe(true)
    expect(Array.isArray(state.investments)).toBe(true)
    expect(Array.isArray(state.retirementAccounts)).toBe(true)
    expect(Array.isArray(state.goals)).toBe(true)
    expect(Array.isArray(state.documents)).toBe(true)
    expect(Array.isArray(state.estimatedPayments)).toBe(true)
  })

  it('default state should have valid profile', () => {
    const state = createDefaultState()
    expect(state.profile.filingStatus).toBe('single')
    expect(state.taxYear).toBeGreaterThanOrEqual(2024)
  })

  it('full state validation should categorize issues', () => {
    const state = {
      ...createDefaultState(),
      profile: { ...createDefaultState().profile, filingStatus: 'head_of_household' as const },
      incomeStreams: [{ id: '1', name: 'Job', type: 'w2' as const, annualAmount: 50000, isActive: true }],
      expenses: [{ id: '1', category: 'Meals', description: 'Meals', annualAmount: 200000, isDeductible: true, deductionPct: 100 }],
    }
    const result = validateFullState(state as FortunaState)
    expect(result.sections.length).toBeGreaterThan(0)
    expect(result.warningCount + result.infoCount + result.errorCount).toBe(result.issues.length)
  })
})
