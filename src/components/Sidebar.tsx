/**
 * FORTUNA ENGINE — Adaptive Sidebar (Phase 1 UX Fix)
 *
 * Progressive disclosure: Shows 6-8 core items by default.
 * Advanced tools collapsed behind expandable sections.
 * User mode: Simple (6 items) / Standard (8 items) / Expert (all items).
 * Full ARIA accessibility with keyboard navigation.
 */

import { SyncStatusBar } from './SyncStatusBar'
import { useState, useEffect, useCallback } from 'react'
import { type ViewKey } from '../App'
import { useFortuna } from '../hooks/useFortuna'
import { getLocalActiveWorkspace } from '../engine/workspace-api'
import {
  LayoutDashboard, Receipt, Building2, TrendingUp,
  Shield, ShieldAlert, Zap, Bot, ChevronLeft, ChevronRight, Flame, Settings,
  BarChart3, Calendar, ArrowDownRight, FileText, Wallet,
  Bell, CalendarClock, FileOutput, Upload, Compass,
  Activity, Scale, Briefcase, Database, ChevronDown, History, Users,
  FileSpreadsheet, PiggyBank, MapPin, Search,
  CalendarRange, Package, Award,
  Brain, BarChart,
  CreditCard, Layers, Target, ClipboardCheck, Radio, BookOpen, Landmark, ListChecks,
} from 'lucide-react'

interface SidebarProps {
  activeView: ViewKey
  onNavigate: (view: ViewKey) => void
  collapsed: boolean
  onToggle: () => void
  notificationCount: number
  healthScore?: number
  healthChange?: string
}

interface NavItem {
  key: ViewKey
  label: string
  friendlyLabel?: string
  icon: React.ReactNode
  core?: boolean
}

interface NavSection {
  id: string
  label: string
  friendlyLabel: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    id: 'core', label: 'Core', friendlyLabel: 'Overview',
    items: [
      { key: 'dashboard', label: 'Command Center', friendlyLabel: 'Home', icon: <LayoutDashboard size={18} />, core: true },
      { key: 'health', label: 'Health Score', friendlyLabel: 'Health Score', icon: <Activity size={18} />, core: true },
      { key: 'alerts', label: 'Intelligence', friendlyLabel: 'Alerts', icon: <Bell size={18} /> },
      { key: 'nexus', label: 'Nexus Insights', friendlyLabel: 'Insights', icon: <Brain size={18} /> },
      { key: 'portfolio', label: 'Portfolio Intel', friendlyLabel: 'Investments', icon: <Briefcase size={18} /> },
      { key: 'markets', label: 'Market Intel', friendlyLabel: 'Markets', icon: <Radio size={18} /> },
      { key: 'history', label: 'History', friendlyLabel: 'History', icon: <History size={18} /> },
    ],
  },
  {
    id: 'strategy', label: 'Strategy', friendlyLabel: 'Tax Strategy',
    items: [
      { key: 'tax', label: 'Tax Strategy', friendlyLabel: 'Tax Overview', icon: <Receipt size={18} />, core: true },
      { key: 'scenarios', label: 'Scenarios', friendlyLabel: 'What-If Scenarios', icon: <BarChart3 size={18} />, core: true },
      { key: 'deductions', label: 'Deduction Finder', friendlyLabel: 'Find Deductions', icon: <Search size={18} />, core: true },
      { key: 'paycheck', label: 'Paycheck Simulator', friendlyLabel: 'Paycheck Planner', icon: <CreditCard size={18} /> },
      { key: 'marginal', label: 'Marginal Rates', friendlyLabel: 'Tax Rates', icon: <Layers size={18} /> },
      { key: 'multiyear', label: 'Multi-Year Tax', friendlyLabel: 'Future Projections', icon: <CalendarRange size={18} /> },
      { key: 'depreciation', label: 'Depreciation', friendlyLabel: 'Asset Depreciation', icon: <Package size={18} /> },
      { key: 'credits', label: 'Tax Credits', friendlyLabel: 'Credits & Incentives', icon: <Award size={18} /> },
      { key: 'entity', label: 'Entity Design', friendlyLabel: 'Business Structure', icon: <Building2 size={18} /> },
      { key: 'optimizer', label: 'Entity Optimizer', friendlyLabel: 'Structure Comparison', icon: <Scale size={18} /> },
      { key: 'flow', label: 'Entity Flow', friendlyLabel: 'Entity Diagrams', icon: <ArrowDownRight size={18} /> },
      { key: 'revenue', label: 'Revenue Engine', friendlyLabel: 'Revenue Analysis', icon: <TrendingUp size={18} /> },
      { key: 'retirement', label: 'Retirement', friendlyLabel: 'Retirement Planning', icon: <PiggyBank size={18} /> },
      { key: 'arbitrage', label: 'State Arbitrage', friendlyLabel: 'State Tax Compare', icon: <MapPin size={18} /> },
    ],
  },
  {
    id: 'risk', label: 'Risk & Compliance', friendlyLabel: 'Risk',
    items: [
      { key: 'risk', label: 'Risk Matrix', friendlyLabel: 'Risk Overview', icon: <Shield size={18} />, core: true },
      { key: 'audit', label: 'Audit Profiler', friendlyLabel: 'Audit Readiness', icon: <ShieldAlert size={18} /> },
      { key: 'cashflow', label: 'Cash Flow', friendlyLabel: 'Cash Flow', icon: <Wallet size={18} /> },
    ],
  },
  {
    id: 'planning', label: 'Planning & Action', friendlyLabel: 'Planning',
    items: [
      { key: 'goals', label: 'Goal Planner', friendlyLabel: 'Goals', icon: <Target size={18} />, core: true },
      { key: 'workflows', label: 'Workflows', friendlyLabel: 'Step-by-Step Guides', icon: <Compass size={18} /> },
      { key: 'automations', label: 'Automations', friendlyLabel: 'Auto-Alerts', icon: <Zap size={18} /> },
      { key: 'timeline', label: 'Timeline', friendlyLabel: 'Action Timeline', icon: <Calendar size={18} /> },
      { key: 'calendar', label: 'Tax Calendar', friendlyLabel: 'Deadlines', icon: <CalendarClock size={18} /> },
    ],
  },
  {
    id: 'output', label: 'Output & Export', friendlyLabel: 'Reports',
    items: [
      { key: 'reports', label: 'Reports', friendlyLabel: 'Reports', icon: <FileText size={18} />, core: true },
      { key: 'pnl', label: 'P&L Statement', friendlyLabel: 'Profit & Loss', icon: <BarChart size={18} /> },
      { key: 'documents', label: 'Documents', friendlyLabel: 'Documents', icon: <FileOutput size={18} /> },
      { key: 'taxdocs', label: 'Tax Documents', friendlyLabel: 'Tax Forms', icon: <FileSpreadsheet size={18} /> },
      { key: 'taxprep', label: 'Tax Prep Checklist', friendlyLabel: 'Filing Checklist', icon: <ClipboardCheck size={18} /> },
      { key: 'cpa', label: 'CPA Export', friendlyLabel: 'Send to Accountant', icon: <Briefcase size={18} /> },
    ],
  },
  {
    id: 'tools', label: 'Tools', friendlyLabel: 'Tools',
    items: [
      { key: 'advisor', label: 'AI Advisor', friendlyLabel: 'Ask AI', icon: <Bot size={18} />, core: true },
      { key: 'workspace', label: 'Collaboration', friendlyLabel: 'Team Access', icon: <Users size={18} /> },
      { key: 'import', label: 'Data Import', friendlyLabel: 'Import Data', icon: <Upload size={18} /> },
      { key: 'quickbooks', label: 'QuickBooks Import', friendlyLabel: 'QuickBooks', icon: <BookOpen size={18} /> },
      { key: 'fintech', label: 'Linked Accounts', friendlyLabel: 'Bank Accounts', icon: <Landmark size={18} /> },
      { key: 'txn-review', label: 'Transaction Review', friendlyLabel: 'Transactions', icon: <ListChecks size={18} /> },
      { key: 'fintech', label: 'FinTech Hub', friendlyLabel: 'FinTech APIs', icon: <Radio size={18} /> },
      { key: 'setup', label: 'Edit Profile', friendlyLabel: 'My Profile', icon: <Settings size={18} /> },
      { key: 'data', label: 'Data Manager', friendlyLabel: 'Manage Data', icon: <Database size={18} /> },
    ],
  },
]

type UserMode = 'beginner' | 'standard' | 'power'

function getVisibleItems(section: NavSection, mode: UserMode, expandedSections: Record<string, boolean>, activeView: ViewKey): NavItem[] {
  if (mode === 'power') return section.items
  const coreItems = section.items.filter(i => i.core)
  const advancedItems = section.items.filter(i => !i.core)
  const activeAdvanced = advancedItems.filter(i => i.key === activeView)
  if (expandedSections[section.id]) return section.items
  return [...coreItems, ...activeAdvanced]
}

export function Sidebar({ activeView, onNavigate, collapsed, onToggle, notificationCount, healthScore = 50, healthChange = 'B' }: SidebarProps) {
  const { uxPrefs, updateUXPrefs } = useFortuna()
  const userMode: UserMode = (uxPrefs.userMode as UserMode) || 'standard'
  const useFriendlyLabels = uxPrefs.friendlyLabels !== false
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const collapsedSections = uxPrefs.sidebarSections || {}

  const toggleSection = (sectionId: string) => {
    updateUXPrefs({ sidebarSections: { ...collapsedSections, [sectionId]: !collapsedSections[sectionId] } })
  }
  const toggleExpanded = useCallback((sectionId: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }))
  }, [])
  const setMode = useCallback((mode: UserMode) => { updateUXPrefs({ userMode: mode }) }, [updateUXPrefs])

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} role="navigation" aria-label="Main navigation" style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
      background: 'var(--bg-primary)', borderRight: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', zIndex: 10,
      transition: 'width 0.4s var(--ease-out)', overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? '24px 16px' : '24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-subtle)', minHeight: 72 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 12px rgba(212,168,67,0.3)' }}>
          <Flame size={20} color="#0c0e12" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--accent-gold)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>Fortuna</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Financial Engine</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-subtle) transparent' }} aria-label="Feature navigation">
        {sections.map(section => {
          const isCollapsed = collapsedSections[section.id] && !collapsed
          const hasActive = section.items.some(i => i.key === activeView)
          const visibleItems = collapsed ? section.items : getVisibleItems(section, userMode, expandedSections, activeView)
          const advancedCount = section.items.filter(i => !i.core).length
          const isExpanded = expandedSections[section.id]
          const showMoreBtn = userMode !== 'power' && advancedCount > 0 && !collapsed

          return (
            <div key={section.id} role="group" aria-label={section.friendlyLabel}>
              {!collapsed && (
                <button onClick={() => toggleSection(section.id)} aria-expanded={!isCollapsed} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 16px 4px', background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 6 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: hasActive ? 'var(--accent-gold)' : 'var(--text-muted)', fontWeight: 500, transition: 'color 0.2s' }}>
                    {useFriendlyLabels ? section.friendlyLabel : section.label}
                  </span>
                  <ChevronDown size={12} color="var(--text-muted)" style={{ transition: 'transform 0.25s var(--ease-out)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                </button>
              )}
              {(!isCollapsed || collapsed) && visibleItems.map(item => {
                const isActive = activeView === item.key
                const displayLabel = useFriendlyLabels && item.friendlyLabel ? item.friendlyLabel : item.label
                return (
                  <button key={item.key} onClick={() => onNavigate(item.key)} title={collapsed ? displayLabel : undefined} aria-label={displayLabel} aria-current={isActive ? 'page' : undefined} tabIndex={0} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '10px 14px' : '8px 16px', borderRadius: 10, border: 'none',
                    background: isActive ? 'var(--accent-gold-dim)' : 'transparent', color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.2s var(--ease-out)', textAlign: 'left', position: 'relative', justifyContent: collapsed ? 'center' : 'flex-start', width: '100%', minHeight: 36,
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}}
                  >
                    <span style={{ flexShrink: 0, display: 'flex' }} aria-hidden="true">{item.icon}</span>
                    {!collapsed && <div style={{ overflow: 'hidden' }}><div>{displayLabel}</div></div>}
                    {isActive && <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: 2, background: 'var(--accent-gold)' }} aria-hidden="true" />}
                    {item.key === 'dashboard' && notificationCount > 0 && (
                      <span aria-label={`${notificationCount} notifications`} style={{ position: collapsed ? 'absolute' : 'relative', top: collapsed ? 6 : 'auto', right: collapsed ? 8 : 'auto', marginLeft: collapsed ? 0 : 'auto', background: 'var(--accent-red)', color: '#fff', fontSize: 10, fontWeight: 600, width: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {notificationCount}
                      </span>
                    )}
                  </button>
                )
              })}
              {showMoreBtn && !isCollapsed && (
                <button onClick={() => toggleExpanded(section.id)} aria-expanded={isExpanded} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 16px', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-gold)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                  <ChevronDown size={11} style={{ transition: 'transform 0.2s var(--ease-out)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  {isExpanded ? 'Show less' : `${advancedCount} more`}
                </button>
              )}
            </div>
          )
        })}
      </nav>

      {/* Health score */}
      {!collapsed && (
        <div style={{ margin: '0 12px 8px', padding: 14, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border-subtle)' }} role="status" aria-label={`Financial health: ${healthScore}/100`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 500 }}>Financial Health</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: healthScore >= 70 ? 'var(--accent-emerald)' : healthScore >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>{healthScore}</span>
          </div>
          <div className="progress-bar" role="progressbar" aria-valuenow={healthScore} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${healthScore}%`, background: healthScore >= 70 ? 'linear-gradient(90deg, var(--accent-emerald), #2dd4bf)' : healthScore >= 50 ? 'linear-gradient(90deg, var(--accent-gold), #e0b84d)' : 'linear-gradient(90deg, var(--accent-red), #f87171)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Grade: {healthChange}</span>
            {notificationCount > 0 && <span style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{notificationCount} action{notificationCount > 1 ? 's' : ''}</span>}
          </div>
        </div>
      )}

      {/* User mode toggle */}
      {!collapsed && (
        <div style={{ margin: '0 12px 8px', padding: '6px', background: 'var(--bg-surface)', borderRadius: 8, display: 'flex', gap: 2 }} role="radiogroup" aria-label="Navigation complexity">
          {(['beginner', 'standard', 'power'] as UserMode[]).map(mode => (
            <button key={mode} onClick={() => setMode(mode)} role="radio" aria-checked={userMode === mode} style={{
              flex: 1, padding: '4px 8px', borderRadius: 6, border: 'none',
              background: userMode === mode ? 'var(--accent-gold-dim)' : 'transparent',
              color: userMode === mode ? 'var(--accent-gold)' : 'var(--text-muted)',
              fontSize: 10, fontWeight: 500, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {mode === 'beginner' ? 'Simple' : mode === 'standard' ? 'Standard' : 'Expert'}
            </button>
          ))}
        </div>
      )}

      {/* Search hint */}
      {!collapsed && (
        <div style={{ margin: '0 12px 8px', padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'border-color 0.2s' }}
          role="button" tabIndex={0} aria-label="Open search (Command+K)"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })) }}}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-glow)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
          <Search size={13} color="var(--text-muted)" aria-hidden="true" />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>Search...</span>
          <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>⌘K</kbd>
        </div>
      )}

      {!collapsed && <WorkspaceBadge onNavigate={onNavigate} />}
      {!collapsed && <div style={{ padding: '8px 12px' }}><SyncStatusBar /></div>}

      <button onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{ padding: '16px', background: 'transparent', border: 'none', borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end', transition: 'color 0.2s' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  )
}

function WorkspaceBadge({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const [ws, setWs] = useState(getLocalActiveWorkspace())
  useEffect(() => {
    const handler = () => setWs(getLocalActiveWorkspace())
    window.addEventListener('fortuna:workspace-changed', handler)
    window.addEventListener('storage', handler)
    return () => { window.removeEventListener('fortuna:workspace-changed', handler); window.removeEventListener('storage', handler) }
  }, [])
  return (
    <div style={{ padding: '4px 12px' }}>
      <button onClick={() => onNavigate('workspace')} aria-label={ws ? `Workspace: ${ws.name}` : 'Personal mode'} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
        background: ws ? 'rgba(139,92,246,0.08)' : 'rgba(75,85,99,0.08)', border: `1px solid ${ws ? 'rgba(139,92,246,0.2)' : 'rgba(75,85,99,0.2)'}`,
        color: ws ? '#a78bfa' : 'var(--text-muted)', fontSize: 11, transition: 'all 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = ws ? 'rgba(139,92,246,0.4)' : 'rgba(75,85,99,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = ws ? 'rgba(139,92,246,0.2)' : 'rgba(75,85,99,0.2)' }}>
        <Users size={12} aria-hidden="true" />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws ? ws.name : 'Personal Mode'}</span>
        {ws && <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{ws.role}</span>}
      </button>
    </div>
  )
}
