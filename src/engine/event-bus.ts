/**
 * Fortuna Engine - Reactive Event Bus
 * Enables engines to react to state changes without tight coupling.
 * When state changes, affected engines are automatically re-run and
 * downstream consumers (views, alerts, CPA exports) are notified.
 *
 * @module event-bus
 */

// ─── Event Types ──────────────────────────────────────────────────────────

export type FortunaEventType =
  // State mutations
  | 'state:income_changed'
  | 'state:expense_changed'
  | 'state:deduction_changed'
  | 'state:entity_changed'
  | 'state:profile_changed'
  | 'state:investment_changed'
  | 'state:retirement_changed'
  | 'state:household_changed'
  // Engine outputs
  | 'engine:tax_recalculated'
  | 'engine:health_score_updated'
  | 'engine:strategy_detected'
  | 'engine:alert_generated'
  | 'engine:scenario_evaluated'
  | 'engine:cost_basis_changed'
  | 'engine:retirement_analyzed'
  // Cross-engine signals
  | 'pipeline:entity_pnl_ready'
  | 'pipeline:portfolio_synced'
  | 'pipeline:defi_tax_events_ready'
  | 'pipeline:credits_calculated'
  // User actions
  | 'action:scenario_saved'
  | 'action:export_generated'
  | 'action:workspace_synced'
  | 'action:document_imported'

export interface FortunaEvent<T = unknown> {
  type: FortunaEventType
  payload: T
  timestamp: number
  source: string // engine/view that emitted
  correlationId?: string // for tracking related events
}

type EventHandler<T = unknown> = (event: FortunaEvent<T>) => void

// ─── Engine Dependency Graph ──────────────────────────────────────────────
// When a state change occurs, which engines need to re-run?

const ENGINE_DEPENDENCIES: Record<string, FortunaEventType[]> = {
  'tax-calculator':       ['state:income_changed', 'state:deduction_changed', 'state:entity_changed', 'state:profile_changed'],
  'health-score':         ['engine:tax_recalculated', 'state:income_changed', 'state:entity_changed', 'pipeline:entity_pnl_ready'],
  'strategy-detector':    ['engine:tax_recalculated', 'state:income_changed', 'state:entity_changed'],
  'proactive-intelligence': ['engine:tax_recalculated', 'engine:health_score_updated', 'engine:strategy_detected'],
  'cash-flow':            ['engine:tax_recalculated', 'state:income_changed', 'state:expense_changed'],
  'scenario-modeler':     ['engine:tax_recalculated', 'state:entity_changed'],
  'retirement-optimizer': ['engine:tax_recalculated', 'state:retirement_changed', 'state:income_changed'],
  'cost-basis':           ['state:investment_changed', 'pipeline:defi_tax_events_ready'],
  'entity-optimizer':     ['engine:tax_recalculated', 'state:entity_changed', 'pipeline:entity_pnl_ready'],
  'state-arbitrage':      ['state:entity_changed', 'state:profile_changed', 'engine:tax_recalculated'],
  'audit-risk':           ['engine:tax_recalculated', 'state:deduction_changed', 'state:entity_changed'],
  'deduction-discovery':  ['engine:tax_recalculated', 'state:deduction_changed', 'state:income_changed'],
  'tax-credits':          ['engine:tax_recalculated', 'state:household_changed', 'state:income_changed'],
  'marginal-rate':        ['engine:tax_recalculated'],
  'multi-year-tax':       ['engine:tax_recalculated', 'state:income_changed'],
  'income-forecast':      ['state:income_changed', 'state:entity_changed'],
  'depreciation':         ['state:entity_changed', 'engine:tax_recalculated'],
  'unified-intelligence': ['engine:tax_recalculated', 'engine:health_score_updated', 'engine:strategy_detected', 'pipeline:credits_calculated'],
  'session-digest':       ['engine:tax_recalculated', 'engine:alert_generated', 'engine:strategy_detected'],
}

// ─── Event Bus ────────────────────────────────────────────────────────────

class FortunaEventBus {
  private handlers = new Map<FortunaEventType, Set<EventHandler>>()
  private eventLog: FortunaEvent[] = []
  private maxLogSize = 500
  private suppressedTypes = new Set<FortunaEventType>()
  private batchQueue: FortunaEvent[] = []
  private isBatching = false

  /** Subscribe to an event type */
  on<T = unknown>(type: FortunaEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    const handlerSet = this.handlers.get(type)!
    handlerSet.add(handler as EventHandler)

    // Return unsubscribe function
    return () => { handlerSet.delete(handler as EventHandler) }
  }

  /** Subscribe to multiple event types */
  onAny(types: FortunaEventType[], handler: EventHandler): () => void {
    const unsubs = types.map(t => this.on(t, handler))
    return () => unsubs.forEach(u => u())
  }

  /** Emit an event */
  emit<T = unknown>(type: FortunaEventType, payload: T, source: string, correlationId?: string): void {
    if (this.suppressedTypes.has(type)) return

    const event: FortunaEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
      source,
      correlationId: correlationId || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }

    if (this.isBatching) {
      this.batchQueue.push(event as FortunaEvent)
      return
    }

    this.dispatch(event as FortunaEvent)
  }

  private dispatch(event: FortunaEvent): void {
    // Log
    this.eventLog.push(event)
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-Math.round(this.maxLogSize * 0.8))
    }

    // Notify handlers
    const handlers = this.handlers.get(event.type)
    if (handlers) {
      for (const handler of handlers) {
        try { handler(event) } catch (err) { console.error(`[EventBus] Handler error for ${event.type}:`, err) }
      }
    }
  }

  /** Batch multiple events — handlers fire only once per type after commit */
  startBatch(): void {
    this.isBatching = true
    this.batchQueue = []
  }

  /** Commit batch — deduplicate by type and dispatch */
  commitBatch(): void {
    this.isBatching = false
    // Deduplicate: keep last event of each type
    const byType = new Map<FortunaEventType, FortunaEvent>()
    for (const event of this.batchQueue) {
      byType.set(event.type, event)
    }
    this.batchQueue = []

    // Dispatch in dependency order
    const typeOrder: FortunaEventType[] = [
      // State changes first
      'state:income_changed', 'state:expense_changed', 'state:deduction_changed',
      'state:entity_changed', 'state:profile_changed', 'state:investment_changed',
      'state:retirement_changed', 'state:household_changed',
      // Then engine outputs
      'engine:tax_recalculated', 'engine:health_score_updated', 'engine:strategy_detected',
      'engine:alert_generated', 'pipeline:entity_pnl_ready', 'pipeline:credits_calculated',
      // Then cross-engine
      'engine:scenario_evaluated', 'engine:cost_basis_changed',
    ]

    for (const type of typeOrder) {
      const event = byType.get(type)
      if (event) this.dispatch(event)
    }
    // Dispatch any remaining not in typeOrder
    for (const [type, event] of byType) {
      if (!typeOrder.includes(type)) this.dispatch(event)
    }
  }

  /** Suppress events during bulk operations */
  suppress(type: FortunaEventType): void { this.suppressedTypes.add(type) }
  unsuppress(type: FortunaEventType): void { this.suppressedTypes.delete(type) }

  /** Get engines that should re-run for a given event */
  getAffectedEngines(type: FortunaEventType): string[] {
    return Object.entries(ENGINE_DEPENDENCIES)
      .filter(([, deps]) => deps.includes(type))
      .map(([engine]) => engine)
  }

  /** Get recent event log */
  getLog(limit: number = 50): FortunaEvent[] {
    return this.eventLog.slice(-limit)
  }

  /** Get events by correlation ID */
  getCorrelated(correlationId: string): FortunaEvent[] {
    return this.eventLog.filter(e => e.correlationId === correlationId)
  }

  /** Clear all handlers (for cleanup/testing) */
  clear(): void {
    this.handlers.clear()
    this.eventLog = []
    this.batchQueue = []
    this.isBatching = false
  }

  /** Get dependency graph for visualization */
  getDependencyGraph(): { engine: string; dependsOn: FortunaEventType[] }[] {
    return Object.entries(ENGINE_DEPENDENCIES).map(([engine, deps]) => ({ engine, dependsOn: deps }))
  }
}

// Singleton instance
export const eventBus = new FortunaEventBus()

// ─── Helper: Map state field changes to event types ──────────────────────

export function detectStateChanges(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): FortunaEventType[] {
  const events: FortunaEventType[] = []

  if (prev.incomeStreams !== next.incomeStreams) events.push('state:income_changed')
  if (prev.expenses !== next.expenses) events.push('state:expense_changed')
  if (prev.deductions !== next.deductions) events.push('state:deduction_changed')
  if (prev.entities !== next.entities) events.push('state:entity_changed')
  if (prev.profile !== next.profile) events.push('state:profile_changed')
  if (prev.investments !== next.investments) events.push('state:investment_changed')
  if (prev.retirementAccounts !== next.retirementAccounts) events.push('state:retirement_changed')
  if (prev.household !== next.household) events.push('state:household_changed')

  return events
}
