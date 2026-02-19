/**
 * Fortuna Engine — View Shell
 *
 * Universal wrapper for all views that provides:
 *   1. EmptyState detection — shows actionable empty state when view has no data
 *   2. Loading skeleton — shows shimmer while lazy components load
 *   3. Consistent layout wrapper
 *
 * Wired once in App.tsx around renderView(), eliminating the need
 * to modify each of the 42 individual view files.
 *
 * @module ViewShell
 */

import { type ReactNode, Suspense } from 'react'
import type { ViewKey } from '../App'
import type { FortunaState } from '../engine/storage'
import { EmptyState } from './EmptyState'
import { SkeletonDashboard } from './SkeletonLoader'
import { ErrorBoundary } from './ErrorBoundary'

interface ViewShellProps {
  view: ViewKey
  state: FortunaState
  onNavigate: (view: ViewKey) => void
  children: ReactNode
}

/**
 * Determine if a view has enough data to render meaningfully.
 * Returns false → EmptyState is shown instead of the view.
 *
 * Logic is intentionally generous: a view shows content if ANY
 * related data exists. We'd rather show partial content than
 * block the user with an empty state unnecessarily.
 */
function viewHasData(view: ViewKey, state: FortunaState): boolean {
  const hasIncome = (state.incomeStreams?.length || 0) > 0
  const hasExpenses = (state.expenses?.length || 0) > 0
  const hasEntities = (state.entities?.length || 0) > 0
  const hasDeductions = (state.deductions?.length || 0) > 0
  const hasInvestments = (state.investments?.length || 0) > 0
  const hasRetirement = (state.retirementAccounts?.length || 0) > 0
  const hasGoals = (state.goals?.length || 0) > 0
  const hasDocuments = (state.documents?.length || 0) > 0
  const hasPayments = (state.estimatedPayments?.length || 0) > 0
  const hasDepreciation = (state.depreciationAssets?.length || 0) > 0
  const hasBankTxns = (state.bankTransactions?.length || 0) > 0
  const hasProfile = !!(state.profile?.filingStatus)
  const hasAny = hasIncome || hasExpenses || hasEntities

  switch (view) {
    // Always show — these are entry points or always useful
    case 'dashboard': return true    // Dashboard shows empty state internally
    case 'setup': return true        // Data entry — always accessible
    case 'data': return true         // Data management — always accessible
    case 'import': return true       // Import — always accessible
    case 'quickbooks': return true   // QB import — always accessible
    case 'advisor': return true      // AI advisor works even without data
    case 'workspace': return true    // Settings
    case 'settings': return true
    case 'alerts': return true       // Notifications
    case 'calendar': return true     // Calendar always shows dates

    // Need profile
    case 'tax': return hasProfile && hasIncome
    case 'scenarios': return hasProfile && hasIncome
    case 'cashflow': return hasProfile && hasIncome
    case 'multiyear': return hasProfile && hasIncome
    case 'marginal': return hasProfile && hasIncome
    case 'taxprep': return hasProfile && hasIncome
    case 'taxdocs': return hasProfile && hasIncome
    case 'cpa': return hasProfile && hasIncome
    case 'reports': return hasProfile && hasAny
    case 'paycheck': return hasProfile && hasIncome
    case 'health': return hasProfile && hasAny
    case 'deductions': return hasProfile
    case 'credits': return hasProfile

    // Need entities
    case 'entity': return hasEntities
    case 'flow': return hasEntities
    case 'optimizer': return hasEntities
    case 'nexus': return hasEntities

    // Need specific data
    case 'revenue': return hasIncome
    case 'pnl': return hasIncome || hasExpenses
    case 'risk': return hasAny
    case 'audit': return hasAny
    case 'depreciation': return hasDepreciation || hasEntities
    case 'portfolio': return hasInvestments
    case 'retirement': return hasRetirement
    case 'goals': return hasGoals
    case 'history': return hasAny
    case 'documents': return hasDocuments || hasAny
    case 'arbitrage': return hasIncome && hasEntities
    case 'automations': return hasAny
    case 'workflows': return hasAny

    // FinTech views — always show (they have their own connection flow)
    case 'fintech': return true
    case 'fintech-hub': return true
    case 'market': return true

    default: return hasAny || hasProfile
  }
}

// Views that should NEVER show an empty state (they handle it internally)
const SKIP_EMPTY_STATE: Set<ViewKey> = new Set([
  'dashboard', 'setup', 'data', 'import', 'quickbooks', 'advisor',
  'workspace', 'settings', 'calendar', 'alerts', 'fintech', 'fintech-hub', 'market',
])

export function ViewShell({ view, state, onNavigate, children }: ViewShellProps) {
  const hasData = viewHasData(view, state)
  const skipEmpty = SKIP_EMPTY_STATE.has(view)

  return (
    <ErrorBoundary key={view} onNavigate={(v) => onNavigate(v as ViewKey)}>
      <Suspense fallback={<SkeletonDashboard />}>
        {!hasData && !skipEmpty ? (
          <EmptyState
            view={view}
            hasData={false}
            onNavigate={(v) => onNavigate(v as ViewKey)}
          />
        ) : (
          children
        )}
      </Suspense>
    </ErrorBoundary>
  )
}
