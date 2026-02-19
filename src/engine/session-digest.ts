/**
 * Fortuna Engine — Session Digest
 *
 * Generates a personalized summary of what changed since the user's last session.
 * Compares current state against the most recent snapshot to produce actionable insights.
 */

import type { FortunaState } from './storage'
import type { HistoryStore, FinancialSnapshot, TrendLine } from './history-engine'
import type { DetectedStrategy } from './strategy-detector'
import type { TaxReport } from './tax-calculator'
import { hasPortfolioData, computePortfolioSummary, getPortfolioAlerts } from './portfolio-bridge'

export interface DigestItem {
  id: string
  type: 'positive' | 'negative' | 'neutral' | 'action' | 'milestone'
  icon: string
  title: string
  detail: string
  metric?: { label: string; value: string; change?: string }
  actionLabel?: string
  actionView?: string
}

export interface SessionDigest {
  greeting: string
  timeSinceLastSession: string
  items: DigestItem[]
  quickStats: { label: string; value: string; color: string }[]
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return '1 day'
  if (days < 7) return `${days} days`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return '1 week'
  if (weeks < 5) return `${weeks} weeks`
  const months = Math.floor(days / 30)
  return `${months} month${months > 1 ? 's' : ''}`
}

export function generateSessionDigest(
  state: FortunaState,
  history: HistoryStore,
  trends: TrendLine[],
  strategies: DetectedStrategy[],
  taxReport: TaxReport,
  lastSessionTimestamp: string | null,
): SessionDigest {
  const items: DigestItem[] = []
  const snaps = history.snapshots
  const lastSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null
  const prevSnap = snaps.length > 1 ? snaps[snaps.length - 2] : null

  const timeSinceSession = lastSessionTimestamp
    ? timeSince(lastSessionTimestamp)
    : 'your first session'

  const hour = new Date().getHours()
  const firstName = state.profile.name?.split(' ')[0] || 'there'
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // ── Health Score Change ──
  if (lastSnap && prevSnap) {
    const healthDiff = lastSnap.metrics.healthScore - prevSnap.metrics.healthScore
    if (Math.abs(healthDiff) >= 3) {
      items.push({
        id: 'health-change',
        type: healthDiff > 0 ? 'positive' : 'negative',
        icon: healthDiff > 0 ? '📈' : '📉',
        title: healthDiff > 0 ? 'Health Score Improved' : 'Health Score Declined',
        detail: `${healthDiff > 0 ? '+' : ''}${healthDiff.toFixed(0)} points since last snapshot`,
        metric: {
          label: 'Health Score',
          value: lastSnap.metrics.healthScore.toFixed(0),
          change: `${healthDiff > 0 ? '+' : ''}${healthDiff.toFixed(0)}`,
        },
        actionLabel: 'View Health',
        actionView: 'health',
      })
    }
  }

  // ── Tax Rate Movement ──
  if (lastSnap && prevSnap) {
    const rateDiff = (lastSnap.metrics.effectiveTaxRate - prevSnap.metrics.effectiveTaxRate) * 100
    if (Math.abs(rateDiff) >= 0.5) {
      items.push({
        id: 'tax-rate-change',
        type: rateDiff < 0 ? 'positive' : 'negative',
        icon: rateDiff < 0 ? '💰' : '⚠️',
        title: rateDiff < 0 ? 'Effective Tax Rate Dropped' : 'Tax Rate Increased',
        detail: `${rateDiff < 0 ? '' : '+'}${rateDiff.toFixed(1)}pp — now ${(lastSnap.metrics.effectiveTaxRate * 100).toFixed(1)}%`,
        actionLabel: 'Tax Strategy',
        actionView: 'tax',
      })
    }
  }

  // ── New Strategies Detected ──
  const highPriority = strategies.filter(s => s.priority === 'critical' || s.priority === 'high')
  if (highPriority.length > 0) {
    const totalSavings = highPriority.reduce((sum, s) => sum + (s.estimatedImpact || 0), 0)
    items.push({
      id: 'strategies-pending',
      type: 'action',
      icon: '🎯',
      title: `${highPriority.length} High-Priority ${highPriority.length === 1 ? 'Strategy' : 'Strategies'} Pending`,
      detail: totalSavings > 0
        ? `${highPriority[0].title}${highPriority.length > 1 ? ` and ${highPriority.length - 1} more` : ''} — ~$${totalSavings.toLocaleString()}/yr potential`
        : `${highPriority[0].title}${highPriority.length > 1 ? ` and ${highPriority.length - 1} more` : ''}`,
      actionLabel: 'Review Strategies',
      actionView: 'tax',
    })
  }

  // ── Income Change ──
  if (lastSnap && prevSnap) {
    const incomeDiff = lastSnap.metrics.totalIncome - prevSnap.metrics.totalIncome
    const pct = prevSnap.metrics.totalIncome > 0
      ? (incomeDiff / prevSnap.metrics.totalIncome) * 100
      : 0
    if (Math.abs(pct) >= 5) {
      items.push({
        id: 'income-change',
        type: incomeDiff > 0 ? 'positive' : 'negative',
        icon: incomeDiff > 0 ? '🚀' : '📊',
        title: `Income ${incomeDiff > 0 ? 'Up' : 'Down'} ${Math.abs(pct).toFixed(0)}%`,
        detail: `$${Math.abs(incomeDiff).toLocaleString()} ${incomeDiff > 0 ? 'increase' : 'decrease'} since last snapshot`,
        metric: {
          label: 'Total Income',
          value: `$${lastSnap.metrics.totalIncome.toLocaleString()}`,
          change: `${incomeDiff > 0 ? '+' : '-'}$${Math.abs(incomeDiff).toLocaleString()}`,
        },
        actionLabel: 'Revenue',
        actionView: 'revenue',
      })
    }
  }

  // ── Upcoming Quarterly Tax ──
  const quarterlyEstimated = Math.round(taxReport.totalTax / 4)
  if (quarterlyEstimated > 0) {
    const now = new Date()
    const month = now.getMonth()
    const day = now.getDate()
    const year = now.getFullYear()
    const deadlines = [
      { q: 'Q1', month: 3, day: 15 },
      { q: 'Q2', month: 5, day: 15 },
      { q: 'Q3', month: 8, day: 15 },
      { q: 'Q4', month: 0, day: 15 },
    ]
    const nextDeadline = deadlines.find(d => {
      const dMonth = d.month
      if (dMonth > month || (dMonth === month && d.day > day)) return true
      return false
    }) || deadlines[0]

    const deadlineDate = new Date(nextDeadline.month === 0 ? year + 1 : year, nextDeadline.month, nextDeadline.day)
    const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntil <= 30 && daysUntil > 0) {
      items.push({
        id: 'quarterly-deadline',
        type: daysUntil <= 7 ? 'negative' : 'action',
        icon: daysUntil <= 7 ? '🔴' : '📅',
        title: `${nextDeadline.q} Estimated Payment Due in ${daysUntil} Day${daysUntil !== 1 ? 's' : ''}`,
        detail: `$${quarterlyEstimated.toLocaleString()} due ${deadlineDate.toLocaleDateString()}`,
        actionLabel: 'Tax Documents',
        actionView: 'taxdocs',
      })
    }
  }

  // ── Snapshot Milestone ──
  if (snaps.length > 0 && [5, 10, 25, 50].includes(snaps.length)) {
    items.push({
      id: 'snapshot-milestone',
      type: 'milestone',
      icon: '🏆',
      title: `${snaps.length} Snapshots Recorded`,
      detail: 'Your financial history is building. Projections become more accurate with each data point.',
      actionLabel: 'View History',
      actionView: 'history',
    })
  }

  // ── Trend Highlights ──
  const incomeTrend = trends.find(t => t.metric === 'totalIncome')
  const savingsTrend = trends.find(t => t.metric === 'estimatedSavingsTotal')

  if (savingsTrend && savingsTrend.direction === 'up' && savingsTrend.changePct > 10) {
    items.push({
      id: 'savings-trend',
      type: 'positive',
      icon: '✅',
      title: 'Implemented Savings Growing',
      detail: `Up ${savingsTrend.changePct.toFixed(0)}% — you're executing well on recommended strategies`,
      actionLabel: 'Strategy Impact',
      actionView: 'history',
    })
  }

  // ── Entity Performance Summary ──
  const activeEntities = state.entities.filter(e => e.isActive)
  if (activeEntities.length > 0) {
    const entityPnL = taxReport.entityBreakdown || []
    const unprofitable = entityPnL.filter(e => e.netIncome < 0)
    if (unprofitable.length > 0) {
      const totalLoss = unprofitable.reduce((s, e) => s + Math.abs(e.netIncome), 0)
      items.push({
        id: 'entity-losses',
        type: 'negative',
        icon: '\u26A0\uFE0F',
        title: `${unprofitable.length} ${unprofitable.length === 1 ? 'Entity' : 'Entities'} Operating at a Loss`,
        detail: `$${totalLoss.toLocaleString()} combined loss across ${unprofitable.map(e => e.entityName).join(', ')}`,
        actionLabel: 'Entity P&L',
        actionView: 'pnl',
      })
    }
    const scorpEntities = activeEntities.filter(e => (e.type === 'llc_scorp' || e.type === 'scorp'))
    const missingSalary = scorpEntities.filter(e => !e.officerSalary || e.officerSalary === 0)
    if (missingSalary.length > 0) {
      items.push({
        id: 'scorp-salary-missing',
        type: 'action',
        icon: '\uD83D\uDCCB',
        title: `${missingSalary.length} S-Corp${missingSalary.length > 1 ? 's' : ''} Missing Officer Salary`,
        detail: `${missingSalary.map(e => e.name).join(', ')} \u2014 IRS requires reasonable compensation`,
        actionLabel: 'Entity Setup',
        actionView: 'entities',
      })
    }
  }

  // Quick stats
  const quickStats = [
    { label: 'Gross Income', value: `$${(taxReport.grossIncome / 1000).toFixed(0)}K`, color: 'var(--accent-gold)' },
    { label: 'Tax Rate', value: `${(taxReport.effectiveRate * 100).toFixed(1)}%`, color: 'var(--accent-red)' },
    { label: 'Strategies', value: `${strategies.length}`, color: 'var(--accent-blue)' },
    { label: 'Snapshots', value: `${snaps.length}`, color: 'var(--accent-purple)' },
  ]

  // Portfolio digest items
  if (hasPortfolioData()) {
    const ps = computePortfolioSummary()
    const pAlerts = getPortfolioAlerts()
    const urgentAlerts = pAlerts.filter(a => a.severity === 'urgent')

    if (urgentAlerts.length > 0) {
      items.push({
        id: 'portfolio-urgent',
        type: 'negative',
        icon: '🚨',
        title: `${urgentAlerts.length} Urgent Portfolio Alert${urgentAlerts.length !== 1 ? 's' : ''}`,
        detail: urgentAlerts[0].title,
        actionLabel: 'View Portfolio',
        actionView: 'portfolio',
      })
    }

    if (ps.harvestCandidates.length > 0) {
      const harvestable = ps.harvestCandidates.reduce((s, c) => s + c.loss, 0)
      items.push({
        id: 'portfolio-harvest',
        type: 'info',
        icon: '🌾',
        title: 'Tax-Loss Harvesting Available',
        detail: `$${Math.round(harvestable).toLocaleString()} in harvestable losses across ${ps.harvestCandidates.length} positions`,
        actionLabel: 'View Portfolio',
        actionView: 'portfolio',
      })
    }

    if (ps.positionsNearLTCGThreshold.length > 0) {
      items.push({
        id: 'portfolio-ltcg',
        type: 'info',
        icon: '⏳',
        title: `${ps.positionsNearLTCGThreshold.length} Position${ps.positionsNearLTCGThreshold.length !== 1 ? 's' : ''} Near LTCG Threshold`,
        detail: `Hold a bit longer to qualify for lower long-term capital gains rate`,
        actionLabel: 'View Portfolio',
        actionView: 'portfolio',
      })
    }

    // Replace Snapshots quickStat with Portfolio if data exists
    if (ps.totalValue > 0) {
      quickStats[3] = { label: 'Portfolio', value: `$${(ps.totalValue / 1000).toFixed(0)}K`, color: 'var(--accent-purple)' }
    }
  }

  // ── Metamodel: Estimated Payment Status ──
  const estPayments = state.estimatedPayments || []
  const missedPayments = estPayments.filter(p => {
    const due = new Date(p.dueDate)
    return due < new Date() && (!p.paidAmount || p.paidAmount === 0)
  })
  if (missedPayments.length > 0) {
    const totalMissed = missedPayments.reduce((s, p) => s + p.amount, 0)
    items.push({
      id: 'est-payments-missed',
      type: 'negative',
      icon: '\u26A0\uFE0F',
      title: `${missedPayments.length} Estimated Payment(s) Past Due`,
      detail: `$${totalMissed.toLocaleString()} unpaid \u2014 penalties may apply`,
      actionLabel: 'View Calendar',
      actionView: 'calendar',
    })
  }

  // ── Metamodel: Goal Progress ──
  const activeGoals = (state.goals || []).filter(g => g.status === 'active')
  if (activeGoals.length > 0) {
    const withProgress = activeGoals.filter(g => g.currentAmount && g.targetAmount && g.currentAmount >= g.targetAmount)
    if (withProgress.length > 0) {
      items.push({
        id: 'goals-completed',
        type: 'positive',
        icon: '\uD83C\uDFC6',
        title: `${withProgress.length} Goal${withProgress.length > 1 ? 's' : ''} Reached!`,
        detail: withProgress.map(g => g.title).join(', '),
        actionLabel: 'View Goals',
        actionView: 'goals',
      })
    }
  }

  // ── Metamodel: Retirement Account Summary ──
  const retAccounts = state.retirementAccounts || []
  if (retAccounts.length > 0) {
    const totalBalance = retAccounts.reduce((s, a) => s + (a.balance || 0), 0)
    const totalContrib = retAccounts.reduce((s, a) => s + (a.annualContribution || 0), 0)
    const maxContrib = retAccounts.reduce((s, a) => s + (a.maxContribution || 0), 0)
    if (totalBalance > 0) {
      quickStats.push({ label: 'Retirement', value: `$${(totalBalance / 1000).toFixed(0)}K`, color: 'var(--accent-blue)' })
    }
    if (maxContrib > 0 && totalContrib < maxContrib * 0.5) {
      items.push({
        id: 'retirement-undercontributing',
        type: 'action',
        icon: '\uD83D\uDCB0',
        title: 'Retirement Contributions Below 50% of Maximum',
        detail: `$${totalContrib.toLocaleString()}/yr of $${maxContrib.toLocaleString()} max \u2014 $${(maxContrib - totalContrib).toLocaleString()} gap`,
        actionLabel: 'Optimize Retirement',
        actionView: 'retirement',
      })
    }
  }

  // ── Metamodel: Depreciation Asset Count ──
  const depAssets = (state.depreciationAssets || []).filter(a => a.isActive)
  if (depAssets.length > 0) {
    const totalBasis = depAssets.reduce((s, a) => s + a.purchasePrice, 0)
    quickStats.push({ label: 'Assets', value: `$${(totalBasis / 1000).toFixed(0)}K`, color: 'var(--text-secondary)' })
  }

  return {
    greeting: `${timeGreeting}, ${firstName}`,
    timeSinceLastSession: timeSinceSession,
    items: items.slice(0, 6), // Max 6 items
    quickStats,
  }
}
