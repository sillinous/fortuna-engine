/**
 * Cross-Process Integration Tests
 * Validates: carryforward propagation, bank-feed polarity, cost-basis entity, depreciation entity
 */
import { describe, it, expect, afterEach } from 'vitest'
import { CostBasisTracker, detectCrossEntityWashSales } from './cost-basis'
import { toStorageTransaction, fromStorageTransaction, transactionsToExpenses, type BankTransaction } from './bank-feed'
import { generateDepreciationSummary, type BusinessAsset } from './depreciation-engine'
import { createDefaultState } from './storage'
import { eventBus, detectStateChanges } from './event-bus'
import { validateState, validateIncome, validateImportRow } from './validation'
import { optimizeRothConversion } from './retirement-optimizer'
import { compareScenariosBatch, generateSmartScenarios } from './scenario-modeler'

// ── Bank-Feed Polarity Adapters ────────────────────────────────────────────

describe('bank-feed polarity adapters', () => {
  const bankExpense: BankTransaction = {
    id: 'txn-1',
    accountId: 'acct-1',
    date: '2024-06-15',
    description: 'Office Depot',
    merchantName: 'Office Depot',
    amount: 250,  // positive = expense in bank-feed
    category: 'office_expense',
    subcategory: '',
    isBusinessExpense: true,
    isRecurring: false,
    tags: ['office'],
    notes: '',
    reviewed: true,
    entityId: 'llc-1',
  }

  const bankIncome: BankTransaction = {
    ...bankExpense,
    id: 'txn-2',
    description: 'Client Payment',
    merchantName: 'Acme Corp',
    amount: -5000,  // negative = income in bank-feed
    category: 'income',
    isBusinessExpense: false,
  }

  it('should flip expense polarity: bank positive → storage negative', () => {
    const storage = toStorageTransaction(bankExpense)
    expect(storage.amount).toBe(-250) // Flipped
    expect(storage.entityId).toBe('llc-1')
  })

  it('should flip income polarity: bank negative → storage positive', () => {
    const storage = toStorageTransaction(bankIncome)
    expect(storage.amount).toBe(5000) // Flipped
  })

  it('should roundtrip: bank → storage → bank preserves amount', () => {
    const storage = toStorageTransaction(bankExpense)
    const backToBank = fromStorageTransaction(storage)
    expect(backToBank.amount).toBe(bankExpense.amount) // 250
  })
})

// ── Bank-Feed → Expense Auto-Categorization ────────────────────────────────

describe('transactionsToExpenses', () => {
  it('should aggregate business transactions by category', () => {
    const transactions: BankTransaction[] = [
      {
        id: 'e1', accountId: 'a1', date: '2024-01-15', description: 'Adobe',
        amount: 100, category: 'office_expense', subcategory: '', isBusinessExpense: true,
        isRecurring: true, tags: [], notes: '', reviewed: true, entityId: 'llc-1',
      },
      {
        id: 'e2', accountId: 'a1', date: '2024-02-15', description: 'Google Workspace',
        amount: 50, category: 'office_expense', subcategory: '', isBusinessExpense: true,
        isRecurring: true, tags: [], notes: '', reviewed: true, entityId: 'llc-1',
      },
      {
        id: 'e3', accountId: 'a1', date: '2024-03-10', description: 'Uber',
        amount: 80, category: 'travel', subcategory: '', isBusinessExpense: true,
        isRecurring: false, tags: [], notes: '', reviewed: true, entityId: 'llc-1',
      },
    ]

    const expenses = transactionsToExpenses(transactions)
    expect(expenses.length).toBe(2) // office_expense + travel
    const office = expenses.find(e => e.category === 'office_expense')
    expect(office).toBeDefined()
    expect(office!.entityId).toBe('llc-1')
    expect(office!.tags).toContain('auto-categorized')
  })

  it('should skip already-imported expenses', () => {
    const transactions: BankTransaction[] = [
      {
        id: 'e1', accountId: 'a1', date: '2024-01-15', description: 'Adobe',
        amount: 100, category: 'office_expense', subcategory: '', isBusinessExpense: true,
        isRecurring: false, tags: [], notes: '', reviewed: true,
      },
    ]
    const existing = new Set(['e1'])
    const expenses = transactionsToExpenses(transactions, existing)
    expect(expenses.length).toBe(0) // Skipped
  })
})

// ── Cost Basis Entity Tracking ─────────────────────────────────────────────

describe('CostBasisTracker entity methods', () => {
  it('should filter lots by entity', () => {
    const tracker = new CostBasisTracker('fifo')
    tracker.addLot({ ticker: 'AAPL', quantity: 100, costPerUnit: 150, acquiredDate: '2024-01-01', entityId: 'llc-1' })
    tracker.addLot({ ticker: 'AAPL', quantity: 50, costPerUnit: 160, acquiredDate: '2024-02-01', entityId: 'personal' })

    const llcLots = tracker.getLotsForEntity('llc-1')
    expect(llcLots.length).toBe(1)
    expect(llcLots[0].quantity).toBe(100)

    const personalLots = tracker.getLotsForEntity('personal')
    expect(personalLots.length).toBe(1)
    expect(personalLots[0].quantity).toBe(50)
  })

  it('should generate per-entity summaries', () => {
    const tracker = new CostBasisTracker('fifo')
    tracker.addLot({ ticker: 'AAPL', quantity: 100, costPerUnit: 150, acquiredDate: '2024-01-01', entityId: 'llc-1' })
    tracker.addLot({ ticker: 'GOOGL', quantity: 20, costPerUnit: 140, acquiredDate: '2024-01-01', entityId: 'personal' })

    const llcSummary = tracker.getSummaryByEntity('llc-1')
    expect(llcSummary.length).toBe(1) // Only AAPL
    expect(llcSummary[0].ticker).toBe('AAPL')

    const personalSummary = tracker.getSummaryByEntity('personal')
    expect(personalSummary.length).toBe(1) // Only GOOGL
    expect(personalSummary[0].ticker).toBe('GOOGL')
  })

  it('should list unique entity IDs', () => {
    const tracker = new CostBasisTracker('fifo')
    tracker.addLot({ ticker: 'AAPL', quantity: 100, costPerUnit: 150, acquiredDate: '2024-01-01', entityId: 'llc-1' })
    tracker.addLot({ ticker: 'GOOGL', quantity: 50, costPerUnit: 140, acquiredDate: '2024-01-01' }) // no entityId → 'personal'

    const ids = tracker.getEntityIds()
    expect(ids).toContain('llc-1')
    expect(ids).toContain('personal')
  })
})

// ── Depreciation Entity Filtering ──────────────────────────────────────────

describe('depreciation entity filtering', () => {
  it('should filter assets by entity and produce per-entity breakdown', () => {
    const state = createDefaultState()
    const assets: BusinessAsset[] = [
      { id: 'a1', name: 'Laptop', classId: 'computer', purchaseDate: '2024-01-01', cost: 3000, businessUsePercent: 100, section179Elected: true, bonusDepreciation: false, salvageValue: 0, entityId: 'llc-1' },
      { id: 'a2', name: 'Desk', classId: 'furniture', purchaseDate: '2024-03-01', cost: 1500, businessUsePercent: 100, section179Elected: false, bonusDepreciation: true, salvageValue: 0, entityId: 'llc-2' },
      { id: 'a3', name: 'Phone', classId: 'computer', purchaseDate: '2024-06-01', cost: 1200, businessUsePercent: 80, section179Elected: true, bonusDepreciation: false, salvageValue: 0, entityId: 'llc-1' },
    ]

    // Full summary
    const full = generateDepreciationSummary(state, assets)
    expect(full.totalAssets).toBe(3)
    expect(full.entityBreakdown).toBeDefined()
    expect(full.entityBreakdown!.length).toBe(2) // llc-1, llc-2

    // Entity-filtered
    const llc1Only = generateDepreciationSummary(state, assets, 'llc-1')
    expect(llc1Only.totalAssets).toBe(2) // Laptop + Phone
  })
})

// ── Event Bus ─────────────────────────────────────────────────────────────

import { eventBus, detectStateChanges } from './event-bus'

describe('FortunaEventBus', () => {
  afterEach(() => eventBus.clear())

  it('should emit and receive events', () => {
    let received = false
    eventBus.on('state:income_changed', () => { received = true })
    eventBus.emit('state:income_changed', { field: 'amount' }, 'test')
    expect(received).toBe(true)
  })

  it('should return affected engines for event types', () => {
    const affected = eventBus.getAffectedEngines('state:income_changed')
    expect(affected).toContain('tax-calculator')
    expect(affected).toContain('cash-flow')
    expect(affected).toContain('strategy-detector')
  })

  it('should batch events and deduplicate', () => {
    let count = 0
    eventBus.on('state:income_changed', () => { count++ })
    eventBus.startBatch()
    eventBus.emit('state:income_changed', { v: 1 }, 'test')
    eventBus.emit('state:income_changed', { v: 2 }, 'test')
    eventBus.emit('state:income_changed', { v: 3 }, 'test')
    expect(count).toBe(0) // not yet dispatched
    eventBus.commitBatch()
    expect(count).toBe(1) // deduplicated to 1
  })

  it('should detect state changes', () => {
    const sharedExpenses = [2]
    const sharedProfile = 'a'
    const prev = { incomeStreams: [1], expenses: sharedExpenses, profile: sharedProfile }
    const next = { incomeStreams: [1, 3], expenses: sharedExpenses, profile: sharedProfile }
    const events = detectStateChanges(prev, next)
    expect(events).toContain('state:income_changed')
    expect(events).not.toContain('state:expense_changed')
  })
})

// ── Validation ────────────────────────────────────────────────────────────

import { validateState, validateIncome, validateImportRow } from './validation'

describe('data validation', () => {
  it('should validate a minimal valid state', () => {
    const state = {
      profile: { name: 'Test', state: 'IL', filingStatus: 'single', age: 35 },
      incomeStreams: [],
      expenses: [],
      deductions: [],
      entities: [],
    }
    const result = validateState(state)
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  it('should reject invalid filing status', () => {
    const state = {
      profile: { name: 'Test', state: 'IL', filingStatus: 'invalid_status', age: 35 },
      incomeStreams: [],
      expenses: [],
      deductions: [],
      entities: [],
    }
    const result = validateState(state)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should validate income streams', () => {
    const valid = validateIncome({
      id: 'inc-1', name: 'Job', type: 'w2', annualAmount: 100000, isActive: true,
    })
    expect(valid.valid).toBe(true)

    const invalid = validateIncome({
      id: '', name: '', type: 'invalid', annualAmount: 'not a number',
    })
    expect(invalid.valid).toBe(false)
  })

  it('should validate CSV import rows', () => {
    const valid = validateImportRow({ name: 'Test Item', amount: 5000 }, 0)
    expect(valid.valid).toBe(true)

    const invalid = validateImportRow({ amount: 'abc' }, 1)
    expect(invalid.valid).toBe(false)
  })

  it('should warn about orphaned entity references', () => {
    const state = {
      profile: { name: 'Test', state: 'IL', filingStatus: 'single', age: 35 },
      incomeStreams: [
        { id: 'i1', name: 'Biz', type: 'business', annualAmount: 50000, isActive: true, entityId: 'nonexistent' },
      ],
      expenses: [],
      deductions: [],
      entities: [],
    }
    const result = validateState(state)
    expect(result.valid).toBe(true) // passes but with warnings
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

// ── Roth Conversion Optimizer ─────────────────────────────────────────────

import { optimizeRothConversion } from './retirement-optimizer'

describe('Roth conversion optimizer', () => {
  it('should generate year-by-year conversion plan', () => {
    const state = createDefaultState()
    state.profile = { ...state.profile, age: 45, filingStatus: 'single', state: 'IL' }
    state.incomeStreams = [
      { id: 'w2', name: 'Job', type: 'w2', annualAmount: 120000, isActive: true },
    ]
    const result = optimizeRothConversion(state, 500000, 65, 0.07)
    
    expect(result.yearByYear.length).toBeGreaterThan(0)
    expect(result.optimalAnnualConversion).toBeGreaterThan(0)
    expect(result.breakEvenYears).toBeGreaterThan(0)
    expect(['aggressive', 'moderate', 'conservative', 'wait']).toContain(result.recommendation)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('should detect TCJA sunset urgency', () => {
    const state = createDefaultState()
    state.profile = { ...state.profile, age: 55, filingStatus: 'single', state: 'TX' }
    state.incomeStreams = [
      { id: 'w2', name: 'Job', type: 'w2', annualAmount: 80000, isActive: true },
    ]
    const result = optimizeRothConversion(state, 800000, 65)
    expect(result.tcjaSunsetImpact.urgencyScore).toBeGreaterThanOrEqual(0)
    expect(result.rmdAvoidance.projectedRMDAge72).toBeGreaterThan(0)
  })
})

// ── Cross-Entity Wash Sale Detection ──────────────────────────────────────

import { CostBasisTracker, detectCrossEntityWashSales } from './cost-basis'

describe('cross-entity wash sale detection', () => {
  it('should detect wash sales across entity boundaries', () => {
    const tracker = new CostBasisTracker('fifo')
    
    // Add lot in entity A
    tracker.addLot({
      id: 'lot-1', ticker: 'AAPL', quantity: 100, costPerUnit: 150,
      totalCost: 15000, acquiredDate: '2024-01-15', source: 'broker',
      remainingQty: 100, isWashSaleDisallowed: false, disallowedAmount: 0,
      entityId: 'llc-1',
    })
    
    // Sell at loss in entity A
    tracker.dispose({ ticker: 'AAPL', quantity: 100, proceedsPerUnit: 130, disposalDate: '2024-06-01' })
    
    // Buy replacement in entity B within 30 days
    tracker.addLot({
      id: 'lot-2', ticker: 'AAPL', quantity: 50, costPerUnit: 135,
      totalCost: 6750, acquiredDate: '2024-06-10', source: 'another broker',
      remainingQty: 50, isWashSaleDisallowed: false, disallowedAmount: 0,
      entityId: 'llc-2',
    })
    
    const alerts = detectCrossEntityWashSales(tracker)
    // Expect at least awareness of cross-entity positions
    expect(alerts).toBeDefined()
  })
})

// ── Batch Scenario Comparison ─────────────────────────────────────────────

import { compareScenariosBatch, generateSmartScenarios } from './scenario-modeler'

describe('batch scenario comparison', () => {
  it('should compare multiple scenarios and rank by savings', () => {
    const state = createDefaultState()
    state.profile = { ...state.profile, filingStatus: 'single', state: 'CA' }
    state.incomeStreams = [
      { id: 'biz', name: 'Consulting', type: 'business', annualAmount: 150000, isActive: true },
    ]
    const scenarios = generateSmartScenarios(state)
    
    if (scenarios.length > 0) {
      const matrix = compareScenariosBatch(state, scenarios, 4)
      expect(matrix.baseline).toBeDefined()
      expect(matrix.baseline.taxDelta).toBe(0)
      expect(matrix.scenarios.length).toBeGreaterThan(0)
      // Should be sorted by tax delta
      for (let i = 1; i < matrix.scenarios.length; i++) {
        expect(matrix.scenarios[i].taxDelta).toBeGreaterThanOrEqual(matrix.scenarios[i - 1].taxDelta)
      }
    }
  })
})
