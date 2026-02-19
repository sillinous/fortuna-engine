/**
 * Fortuna Engine — Navigation Context
 *
 * Provides app-wide navigation without prop drilling.
 * Any view can import useNavigation() to navigate to other views
 * and render contextual "Related Views" links.
 */

import { createContext, useContext, useCallback, type ReactNode } from 'react'
import type { ViewKey } from '../App'

// ── View Metadata & Relationship Map ──────────────────────────────────

export interface ViewMeta {
  key: ViewKey
  label: string
  icon: string // emoji shorthand
  section: string
}

export const VIEW_REGISTRY: Record<string, ViewMeta> = {
  dashboard:    { key: 'dashboard',    label: 'Dashboard',            icon: '📊', section: 'Overview' },
  tax:          { key: 'tax',          label: 'Tax Strategy',         icon: '💡', section: 'Strategy' },
  entity:       { key: 'entity',       label: 'Entity Design',        icon: '🏗️', section: 'Entities' },
  revenue:      { key: 'revenue',      label: 'Revenue Engine',       icon: '💰', section: 'Revenue' },
  risk:         { key: 'risk',         label: 'Risk Matrix',          icon: '⚠️', section: 'Risk' },
  automations:  { key: 'automations',  label: 'Automations',          icon: '⚡', section: 'Tools' },
  advisor:      { key: 'advisor',      label: 'AI Advisor',           icon: '🤖', section: 'Intelligence' },
  scenarios:    { key: 'scenarios',     label: 'Scenario Modeler',     icon: '🔮', section: 'Strategy' },
  timeline:     { key: 'timeline',     label: 'Execution Timeline',   icon: '📅', section: 'Planning' },
  flow:         { key: 'flow',         label: 'Entity Flow',          icon: '🔄', section: 'Entities' },
  reports:      { key: 'reports',      label: 'Reports',              icon: '📄', section: 'Reports' },
  cashflow:     { key: 'cashflow',     label: 'Cash Flow',            icon: '💸', section: 'Revenue' },
  audit:        { key: 'audit',        label: 'Audit Profiler',       icon: '🔍', section: 'Risk' },
  alerts:       { key: 'alerts',       label: 'Proactive Alerts',     icon: '🔔', section: 'Intelligence' },
  calendar:     { key: 'calendar',     label: 'Tax Calendar',         icon: '📆', section: 'Planning' },
  documents:    { key: 'documents',    label: 'Document Center',      icon: '📁', section: 'Reports' },
  import:       { key: 'import',       label: 'Data Import',          icon: '📥', section: 'Tools' },
  workflows:    { key: 'workflows',    label: 'Workflows',            icon: '🔗', section: 'Tools' },
  optimizer:    { key: 'optimizer',    label: 'Entity Optimizer',     icon: '⚙️', section: 'Entities' },
  health:       { key: 'health',       label: 'Health Score',         icon: '❤️', section: 'Overview' },
  cpa:          { key: 'cpa',          label: 'CPA Export',           icon: '📋', section: 'Reports' },
  data:         { key: 'data',         label: 'Data Manager',         icon: '💾', section: 'Tools' },
  history:      { key: 'history',      label: 'Financial History',    icon: '📈', section: 'Overview' },
  taxdocs:      { key: 'taxdocs',      label: 'Tax Documents',        icon: '📝', section: 'Reports' },
  retirement:   { key: 'retirement',   label: 'Retirement Optimizer', icon: '🏖️', section: 'Strategy' },
  arbitrage:    { key: 'arbitrage',    label: 'State Arbitrage',      icon: '🗺️', section: 'Strategy' },
  multiyear:    { key: 'multiyear',    label: 'Multi-Year Projections', icon: '📊', section: 'Strategy' },
  depreciation: { key: 'depreciation', label: 'Depreciation & Assets', icon: '🏭', section: 'Strategy' },
  credits:      { key: 'credits',      label: 'Tax Credits',          icon: '🏆', section: 'Strategy' },
  nexus:        { key: 'nexus' as ViewKey, label: 'Intelligence Nexus', icon: '🧠', section: 'Intelligence' },
  pnl:          { key: 'pnl' as ViewKey, label: 'P&L Statement',      icon: '📊', section: 'Reports' },
}

/** Contextual links between views — "if you're on X, you might want Y" */
export const VIEW_RELATIONSHIPS: Record<string, string[]> = {
  dashboard:    ['health', 'alerts', 'nexus', 'advisor'],
  tax:          ['multiyear', 'credits', 'retirement', 'scenarios', 'nexus'],
  entity:       ['optimizer', 'flow', 'taxdocs'],
  revenue:      ['cashflow', 'scenarios', 'pnl'],
  risk:         ['audit', 'alerts', 'health'],
  advisor:      ['nexus', 'tax', 'scenarios', 'health'],
  scenarios:    ['multiyear', 'tax', 'arbitrage'],
  timeline:     ['calendar', 'alerts', 'workflows'],
  flow:         ['entity', 'optimizer'],
  reports:      ['pnl', 'cpa', 'taxdocs'],
  cashflow:     ['pnl', 'revenue', 'scenarios'],
  audit:        ['cpa', 'taxdocs', 'risk'],
  alerts:       ['timeline', 'nexus', 'advisor'],
  calendar:     ['timeline', 'alerts', 'taxdocs'],
  documents:    ['cpa', 'taxdocs', 'import'],
  optimizer:    ['entity', 'tax', 'arbitrage'],
  health:       ['nexus', 'advisor', 'dashboard'],
  cpa:          ['taxdocs', 'documents', 'audit'],
  history:      ['health', 'dashboard', 'reports'],
  taxdocs:      ['cpa', 'documents', 'audit'],
  retirement:   ['credits', 'multiyear', 'tax'],
  arbitrage:    ['optimizer', 'scenarios', 'tax'],
  multiyear:    ['credits', 'retirement', 'depreciation', 'nexus'],
  depreciation: ['multiyear', 'credits', 'tax'],
  credits:      ['retirement', 'multiyear', 'depreciation'],
  nexus:        ['advisor', 'tax', 'multiyear', 'credits'],
  pnl:          ['cashflow', 'reports', 'revenue'],
}

// ── Context ───────────────────────────────────────────────────────────

interface NavigationContextValue {
  navigate: (view: ViewKey) => void
  currentView: ViewKey
}

const NavigationContext = createContext<NavigationContextValue>({
  navigate: () => {},
  currentView: 'dashboard',
})

export function NavigationProvider({
  children,
  onNavigate,
  currentView,
}: {
  children: ReactNode
  onNavigate: (view: ViewKey) => void
  currentView: ViewKey
}) {
  const navigate = useCallback((view: ViewKey) => {
    onNavigate(view)
  }, [onNavigate])

  return (
    <NavigationContext.Provider value={{ navigate, currentView }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}

// ── Related Views Component ───────────────────────────────────────────

export function RelatedViews({ currentView }: { currentView?: string }) {
  const { navigate, currentView: ctxView } = useNavigation()
  const view = currentView || ctxView

  const related = VIEW_RELATIONSHIPS[view] || []
  if (related.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      padding: '12px 0',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      marginTop: 16,
    }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: '28px' }}>
        Related:
      </span>
      {related.map(key => {
        const meta = VIEW_REGISTRY[key]
        if (!meta) return null
        return (
          <button
            key={key}
            onClick={() => navigate(meta.key)}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              ;(e.target as HTMLElement).style.background = 'rgba(99,102,241,0.2)'
              ;(e.target as HTMLElement).style.borderColor = 'rgba(99,102,241,0.4)'
            }}
            onMouseLeave={e => {
              ;(e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
              ;(e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'
            }}
          >
            {meta.icon} {meta.label}
          </button>
        )
      })}
    </div>
  )
}

/** Compact breadcrumb showing current section */
export function ViewBreadcrumb({ viewKey }: { viewKey?: string }) {
  const { navigate, currentView } = useNavigation()
  const key = viewKey || currentView
  const meta = VIEW_REGISTRY[key]
  if (!meta) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: 'rgba(255,255,255,0.4)',
      marginBottom: 8,
    }}>
      <span
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('dashboard')}
        onMouseEnter={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.7)'}
        onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.4)'}
      >
        Fortuna
      </span>
      <span>›</span>
      <span>{meta.section}</span>
      <span>›</span>
      <span style={{ color: 'rgba(255,255,255,0.7)' }}>{meta.label}</span>
    </div>
  )
}
