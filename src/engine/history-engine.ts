/**
 * Fortuna Engine — Financial History Engine v8
 *
 * Records periodic financial snapshots, computes trends, diffs,
 * strategy effectiveness, seasonal patterns, and trajectory projections.
 * Transforms Fortuna from a point-in-time tool to a time-series intelligence system.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport } from './tax-calculator'
import { analyzeAuditRisk } from './audit-risk'
import { calculateHealthScore } from './strategy-detector'

// ===================================================================
//  SNAPSHOT DATA MODEL
// ===================================================================

export interface SnapshotMetrics {
  // Income
  totalIncome: number
  selfEmploymentIncome: number
  w2Income: number
  investmentIncome: number
  incomeStreamCount: number

  // Expenses & Deductions
  totalExpenses: number
  totalDeductions: number
  netIncome: number

  // Tax
  totalTaxBurden: number
  effectiveTaxRate: number
  marginalRate: number
  selfEmploymentTax: number
  quarterlyEstimated: number

  // Risk & Health
  healthScore: number
  auditRiskScore: number

  // Structure
  entityCount: number
  activeEntityTypes: string[]

  // Retirement
  retirementContributions: number

  // Strategies
  strategiesDetected: number
  strategiesImplemented: number
  estimatedSavingsTotal: number
}

export interface FinancialSnapshot {
  id: string
  timestamp: string
  trigger: 'auto' | 'manual' | 'monthly' | 'event'
  eventDescription?: string
  metrics: SnapshotMetrics
  // Compact copy of key state for diff
  stateDigest: {
    profileHash: string
    streamIds: string[]
    entityIds: string[]
    expenseCount: number
    deductionCount: number
  }
}

export interface HistoryStore {
  snapshots: FinancialSnapshot[]
  lastAutoSnapshot: string | null
  lastMonthlySnapshot: string | null
}

// ===================================================================
//  SNAPSHOT CREATION
// ===================================================================

function hashProfile(state: FortunaState): string {
  const p = state.profile
  return `${p.name}|${p.state}|${p.filingStatus}|${p.dependents}|${p.age}`
}

export function captureSnapshot(
  state: FortunaState,
  trigger: FinancialSnapshot['trigger'],
  eventDescription?: string,
): FinancialSnapshot {
  const taxReport = generateTaxReport(state)
  const auditRisk = analyzeAuditRisk(state)
  const health = calculateHealthScore(state)

  const totalExpenses = state.expenses
    .filter(e => e.isDeductible)
    .reduce((s, e) => s + (e.annualAmount * e.deductionPct / 100), 0)

  const totalDeductions = state.deductions.reduce((s, d) => s + d.amount, 0)

  const retirementContribs = state.deductions
    .filter(d => d.category === 'retirement')
    .reduce((s, d) => s + d.amount, 0)

  const implemented = state.strategies.filter(s => s.status === 'implemented')
  const estimatedSavings = implemented.reduce((s, st) => s + st.estimatedImpact, 0)

  const metrics: SnapshotMetrics = {
    totalIncome: taxReport.grossIncome,
    selfEmploymentIncome: taxReport.selfEmploymentIncome,
    w2Income: taxReport.w2Income,
    investmentIncome: taxReport.investmentIncome,
    incomeStreamCount: state.incomeStreams.filter(s => s.isActive).length,
    totalExpenses,
    totalDeductions: totalExpenses + totalDeductions,
    netIncome: taxReport.grossIncome - taxReport.totalFederalTax - totalExpenses,
    totalTaxBurden: taxReport.totalFederalTax,
    effectiveTaxRate: taxReport.effectiveRate,
    marginalRate: taxReport.marginalRate,
    selfEmploymentTax: taxReport.selfEmploymentTax,
    quarterlyEstimated: taxReport.quarterlyEstimated,
    healthScore: health.overall,
    auditRiskScore: auditRisk.overallScore,
    entityCount: state.entities.filter(e => e.isActive).length,
    activeEntityTypes: [...new Set(state.entities.filter(e => e.isActive).map(e => e.type))],
    retirementContributions: retirementContribs,
    strategiesDetected: state.strategies.length,
    strategiesImplemented: implemented.length,
    estimatedSavingsTotal: estimatedSavings,
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    trigger,
    eventDescription,
    metrics,
    stateDigest: {
      profileHash: hashProfile(state),
      streamIds: state.incomeStreams.map(s => s.id).sort(),
      entityIds: state.entities.map(e => e.id).sort(),
      expenseCount: state.expenses.length,
      deductionCount: state.deductions.length,
    },
  }
}

// ===================================================================
//  AUTO-SNAPSHOT LOGIC
// ===================================================================

/**
 * Determines if a new auto-snapshot should be taken.
 * Triggers on:
 *  - First time (no history)
 *  - Monthly cadence (at least 30 days since last monthly)
 *  - Significant structural change (streams/entities added/removed)
 */
export function shouldAutoSnapshot(
  state: FortunaState,
  history: HistoryStore,
): { should: boolean; trigger: FinancialSnapshot['trigger']; reason?: string } {
  if (!state.onboardingComplete) return { should: false, trigger: 'auto' }

  // No snapshots yet — take the first one
  if (history.snapshots.length === 0) {
    return { should: true, trigger: 'auto', reason: 'Initial snapshot' }
  }

  const now = new Date()
  const last = history.snapshots[history.snapshots.length - 1]

  // Monthly cadence
  if (history.lastMonthlySnapshot) {
    const lastMonthly = new Date(history.lastMonthlySnapshot)
    const daysSince = (now.getTime() - lastMonthly.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince >= 30) {
      return { should: true, trigger: 'monthly', reason: `Monthly snapshot (${Math.floor(daysSince)} days since last)` }
    }
  } else {
    // Never done a monthly — do one now
    return { should: true, trigger: 'monthly', reason: 'First monthly snapshot' }
  }

  // Structural change detection
  const currentDigest = {
    profileHash: hashProfile(state),
    streamIds: state.incomeStreams.map(s => s.id).sort(),
    entityIds: state.entities.map(e => e.id).sort(),
    expenseCount: state.expenses.length,
    deductionCount: state.deductions.length,
  }

  const prev = last.stateDigest
  if (currentDigest.streamIds.join() !== prev.streamIds.join()) {
    return { should: true, trigger: 'event', reason: 'Income streams changed' }
  }
  if (currentDigest.entityIds.join() !== prev.entityIds.join()) {
    return { should: true, trigger: 'event', reason: 'Entity structure changed' }
  }
  if (currentDigest.profileHash !== prev.profileHash) {
    return { should: true, trigger: 'event', reason: 'Profile updated' }
  }

  // Significant income change (>10% shift)
  const currentIncome = state.incomeStreams.filter(s => s.isActive).reduce((s, i) => s + i.annualAmount, 0)
  if (last.metrics.totalIncome > 0) {
    const pctChange = Math.abs(currentIncome - last.metrics.totalIncome) / last.metrics.totalIncome
    if (pctChange > 0.10) {
      return { should: true, trigger: 'event', reason: `Income shifted ${(pctChange * 100).toFixed(0)}%` }
    }
  }

  return { should: false, trigger: 'auto' }
}

// ===================================================================
//  TREND ANALYSIS
// ===================================================================

export interface TrendPoint {
  timestamp: string
  value: number
  label?: string
}

export interface TrendLine {
  metric: string
  label: string
  unit: string
  points: TrendPoint[]
  current: number
  change: number // absolute change from first to last
  changePct: number // percentage change
  direction: 'up' | 'down' | 'flat'
  isPositive: boolean // is the direction good?
}

export function computeTrends(history: HistoryStore): TrendLine[] {
  const snaps = history.snapshots
  if (snaps.length < 2) return []

  const first = snaps[0].metrics
  const last = snaps[snaps.length - 1].metrics

  function buildTrend(
    metric: string,
    label: string,
    unit: string,
    extract: (m: SnapshotMetrics) => number,
    positiveDirection: 'up' | 'down',
  ): TrendLine {
    const points = snaps.map(s => ({
      timestamp: s.timestamp,
      value: extract(s.metrics),
      label: s.eventDescription,
    }))
    const current = extract(last)
    const firstVal = extract(first)
    const change = current - firstVal
    const changePct = firstVal !== 0 ? (change / Math.abs(firstVal)) * 100 : 0
    const direction: 'up' | 'down' | 'flat' = Math.abs(changePct) < 1 ? 'flat' : change > 0 ? 'up' : 'down'
    const isPositive = direction === 'flat' || direction === positiveDirection

    return { metric, label, unit, points, current, change, changePct, direction, isPositive }
  }

  return [
    buildTrend('totalIncome', 'Total Income', '$', m => m.totalIncome, 'up'),
    buildTrend('netIncome', 'Net Income (After Tax)', '$', m => m.netIncome, 'up'),
    buildTrend('effectiveTaxRate', 'Effective Tax Rate', '%', m => m.effectiveTaxRate * 100, 'down'),
    buildTrend('totalTaxBurden', 'Total Tax Burden', '$', m => m.totalTaxBurden, 'down'),
    buildTrend('healthScore', 'Financial Health', 'pts', m => m.healthScore, 'up'),
    buildTrend('auditRiskScore', 'Audit Risk', 'pts', m => m.auditRiskScore, 'down'),
    buildTrend('selfEmploymentTax', 'Self-Employment Tax', '$', m => m.selfEmploymentTax, 'down'),
    buildTrend('retirementContributions', 'Retirement Contributions', '$', m => m.retirementContributions, 'up'),
    buildTrend('incomeStreamCount', 'Income Streams', '#', m => m.incomeStreamCount, 'up'),
    buildTrend('estimatedSavingsTotal', 'Implemented Savings', '$', m => m.estimatedSavingsTotal, 'up'),
  ]
}

// ===================================================================
//  SNAPSHOT DIFFING
// ===================================================================

export interface MetricDiff {
  metric: string
  label: string
  before: number
  after: number
  change: number
  changePct: number
  unit: string
  isPositive: boolean
}

export function diffSnapshots(a: FinancialSnapshot, b: FinancialSnapshot): MetricDiff[] {
  const defs: { key: keyof SnapshotMetrics; label: string; unit: string; positiveDir: 'up' | 'down' }[] = [
    { key: 'totalIncome', label: 'Total Income', unit: '$', positiveDir: 'up' },
    { key: 'netIncome', label: 'Net Income', unit: '$', positiveDir: 'up' },
    { key: 'totalTaxBurden', label: 'Tax Burden', unit: '$', positiveDir: 'down' },
    { key: 'effectiveTaxRate', label: 'Effective Rate', unit: '%', positiveDir: 'down' },
    { key: 'selfEmploymentTax', label: 'SE Tax', unit: '$', positiveDir: 'down' },
    { key: 'healthScore', label: 'Health Score', unit: 'pts', positiveDir: 'up' },
    { key: 'auditRiskScore', label: 'Audit Risk', unit: 'pts', positiveDir: 'down' },
    { key: 'retirementContributions', label: 'Retirement', unit: '$', positiveDir: 'up' },
    { key: 'incomeStreamCount', label: 'Income Streams', unit: '#', positiveDir: 'up' },
    { key: 'entityCount', label: 'Entities', unit: '#', positiveDir: 'up' },
  ]

  return defs.map(d => {
    const before = a.metrics[d.key] as number
    const after = b.metrics[d.key] as number
    const change = after - before
    const changePct = before !== 0 ? (change / Math.abs(before)) * 100 : 0
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
    const isPositive = dir === 'flat' || (dir === 'up' && d.positiveDir === 'up') || (dir === 'down' && d.positiveDir === 'down')
    // For effectiveTaxRate, scale to %
    const scaledBefore = d.key === 'effectiveTaxRate' ? before * 100 : before
    const scaledAfter = d.key === 'effectiveTaxRate' ? after * 100 : after
    const scaledChange = d.key === 'effectiveTaxRate' ? change * 100 : change

    return {
      metric: d.key,
      label: d.label,
      before: scaledBefore,
      after: scaledAfter,
      change: scaledChange,
      changePct,
      unit: d.unit,
      isPositive,
    }
  })
}

// ===================================================================
//  STRATEGY EFFECTIVENESS
// ===================================================================

export interface StrategyEffect {
  strategyTitle: string
  implementedDate: string
  snapshotBefore: FinancialSnapshot | null
  snapshotAfter: FinancialSnapshot | null
  taxBurdenChange: number
  healthScoreChange: number
  effectiveRateChange: number
  verdict: 'positive' | 'neutral' | 'negative' | 'insufficient_data'
  summary: string
}

export function analyzeStrategyEffectiveness(
  state: FortunaState,
  history: HistoryStore,
): StrategyEffect[] {
  const implemented = state.strategies.filter(s => s.status === 'implemented' && s.implementedDate)
  if (implemented.length === 0 || history.snapshots.length < 2) return []

  return implemented.map(strategy => {
    const implDate = new Date(strategy.implementedDate!)
    const snaps = history.snapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Find closest snapshot before and after implementation
    let before: FinancialSnapshot | null = null
    let after: FinancialSnapshot | null = null

    for (const snap of snaps) {
      const snapDate = new Date(snap.timestamp)
      if (snapDate <= implDate) before = snap
      if (snapDate > implDate && !after) after = snap
    }

    if (!before || !after) {
      return {
        strategyTitle: strategy.title,
        implementedDate: strategy.implementedDate!,
        snapshotBefore: before,
        snapshotAfter: after,
        taxBurdenChange: 0,
        healthScoreChange: 0,
        effectiveRateChange: 0,
        verdict: 'insufficient_data' as const,
        summary: 'Not enough snapshot data to measure impact yet. Impact will be measurable after the next snapshot.',
      }
    }

    const taxChange = after.metrics.totalTaxBurden - before.metrics.totalTaxBurden
    const healthChange = after.metrics.healthScore - before.metrics.healthScore
    const rateChange = (after.metrics.effectiveTaxRate - before.metrics.effectiveTaxRate) * 100

    let verdict: StrategyEffect['verdict'] = 'neutral'
    if (taxChange < -500 || healthChange > 5) verdict = 'positive'
    else if (taxChange > 500 || healthChange < -5) verdict = 'negative'

    const summary = verdict === 'positive'
      ? `Reduced tax burden by $${Math.abs(taxChange).toLocaleString()} and improved health score by ${healthChange.toFixed(0)} points.`
      : verdict === 'negative'
        ? `Tax burden increased $${Math.abs(taxChange).toLocaleString()} since implementation. May need review.`
        : `Minimal measurable change so far. May need more time to show impact.`

    return {
      strategyTitle: strategy.title,
      implementedDate: strategy.implementedDate!,
      snapshotBefore: before,
      snapshotAfter: after,
      taxBurdenChange: taxChange,
      healthScoreChange: healthChange,
      effectiveRateChange: rateChange,
      verdict,
      summary,
    }
  })
}

// ===================================================================
//  TRAJECTORY PROJECTION
// ===================================================================

export interface Projection {
  metric: string
  label: string
  current: number
  projected3Month: number
  projected6Month: number
  projected12Month: number
  confidence: 'high' | 'medium' | 'low'
  unit: string
}

export function projectTrajectory(history: HistoryStore): Projection[] {
  const snaps = history.snapshots
  if (snaps.length < 3) return [] // Need 3+ points for meaningful projection

  // Simple linear regression on recent snapshots
  function linearProject(extract: (m: SnapshotMetrics) => number): { slope: number; current: number } {
    const points = snaps.map((s, i) => ({
      x: i,
      y: extract(s.metrics),
    }))
    const n = points.length
    const sumX = points.reduce((s, p) => s + p.x, 0)
    const sumY = points.reduce((s, p) => s + p.y, 0)
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const current = points[points.length - 1].y
    return { slope: isFinite(slope) ? slope : 0, current }
  }

  // Estimate intervals per month (based on snapshot cadence)
  const firstTime = new Date(snaps[0].timestamp).getTime()
  const lastTime = new Date(snaps[snaps.length - 1].timestamp).getTime()
  const totalMonths = Math.max(1, (lastTime - firstTime) / (1000 * 60 * 60 * 24 * 30))
  const intervalsPerMonth = (snaps.length - 1) / totalMonths

  const confidence: Projection['confidence'] = snaps.length >= 6 ? 'high' : snaps.length >= 4 ? 'medium' : 'low'

  function buildProjection(
    metric: string,
    label: string,
    unit: string,
    extract: (m: SnapshotMetrics) => number,
    scale: number = 1,
  ): Projection {
    const { slope, current } = linearProject(extract)
    const monthlyDelta = slope * intervalsPerMonth * scale
    return {
      metric, label, unit, current: current * scale, confidence,
      projected3Month: Math.max(0, (current * scale) + monthlyDelta * 3),
      projected6Month: Math.max(0, (current * scale) + monthlyDelta * 6),
      projected12Month: Math.max(0, (current * scale) + monthlyDelta * 12),
    }
  }

  return [
    buildProjection('totalIncome', 'Total Income', '$', m => m.totalIncome),
    buildProjection('effectiveTaxRate', 'Effective Tax Rate', '%', m => m.effectiveTaxRate, 100),
    buildProjection('healthScore', 'Health Score', 'pts', m => m.healthScore),
    buildProjection('totalTaxBurden', 'Tax Burden', '$', m => m.totalTaxBurden),
    buildProjection('netIncome', 'Net Income', '$', m => m.netIncome),
  ]
}

// ===================================================================
//  MILESTONES & EVENTS
// ===================================================================

export interface Milestone {
  timestamp: string
  type: 'snapshot' | 'strategy' | 'entity' | 'income' | 'achievement'
  title: string
  description: string
  icon: string
  color: string
}

export function buildTimeline(state: FortunaState, history: HistoryStore): Milestone[] {
  const milestones: Milestone[] = []

  // Snapshot milestones
  history.snapshots.forEach(snap => {
    milestones.push({
      timestamp: snap.timestamp,
      type: 'snapshot',
      title: snap.trigger === 'monthly' ? 'Monthly Snapshot' : snap.trigger === 'event' ? 'Event Snapshot' : 'Auto Snapshot',
      description: snap.eventDescription || `Health: ${snap.metrics.healthScore} | Income: $${snap.metrics.totalIncome.toLocaleString()} | Tax: $${snap.metrics.totalTaxBurden.toLocaleString()}`,
      icon: '📊',
      color: 'var(--accent-blue)',
    })
  })

  // Strategy milestones
  state.strategies.filter(s => s.implementedDate).forEach(strategy => {
    milestones.push({
      timestamp: strategy.implementedDate!,
      type: 'strategy',
      title: `Strategy Implemented: ${strategy.title}`,
      description: `Est. impact: $${strategy.estimatedImpact.toLocaleString()}/yr`,
      icon: '⚡',
      color: 'var(--accent-gold)',
    })
  })

  // Entity milestones
  state.entities.filter(e => e.formationDate).forEach(entity => {
    milestones.push({
      timestamp: entity.formationDate!,
      type: 'entity',
      title: `Entity Formed: ${entity.name}`,
      description: `${entity.type.toUpperCase()} in ${entity.state}`,
      icon: '🏛',
      color: 'var(--accent-purple)',
    })
  })

  // Achievement milestones (from snapshots)
  if (history.snapshots.length >= 2) {
    const first = history.snapshots[0]
    const last = history.snapshots[history.snapshots.length - 1]
    if (last.metrics.healthScore >= 80 && first.metrics.healthScore < 80) {
      milestones.push({
        timestamp: last.timestamp,
        type: 'achievement',
        title: 'Achievement: Health Score A-',
        description: 'Financial health score reached 80+',
        icon: '🏆',
        color: 'var(--accent-emerald)',
      })
    }
    if (last.metrics.effectiveTaxRate < first.metrics.effectiveTaxRate * 0.9) {
      milestones.push({
        timestamp: last.timestamp,
        type: 'achievement',
        title: 'Achievement: Tax Rate Reduced 10%+',
        description: `Effective rate dropped from ${(first.metrics.effectiveTaxRate * 100).toFixed(1)}% to ${(last.metrics.effectiveTaxRate * 100).toFixed(1)}%`,
        icon: '🎯',
        color: 'var(--accent-emerald)',
      })
    }
  }

  return milestones.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// ===================================================================
//  HISTORY MANAGEMENT
// ===================================================================

export function createEmptyHistory(): HistoryStore {
  return {
    snapshots: [],
    lastAutoSnapshot: null,
    lastMonthlySnapshot: null,
  }
}

export function addSnapshot(history: HistoryStore, snapshot: FinancialSnapshot): HistoryStore {
  const updated = {
    ...history,
    snapshots: [...history.snapshots, snapshot],
    lastAutoSnapshot: snapshot.timestamp,
  }
  if (snapshot.trigger === 'monthly') {
    updated.lastMonthlySnapshot = snapshot.timestamp
  }
  // Keep max 120 snapshots (~10 years monthly)
  if (updated.snapshots.length > 120) {
    updated.snapshots = updated.snapshots.slice(-120)
  }
  return updated
}
