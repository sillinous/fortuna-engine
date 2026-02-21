import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import {
  Search, LayoutDashboard, Receipt, Building2, TrendingUp, Shield,
  ShieldAlert, Zap, Bot, BarChart3, Calendar, FileText, Wallet,
  Bell, CalendarClock, FileOutput, Upload, Compass, Activity,
  Scale, Briefcase, Database, History, FileSpreadsheet, PiggyBank,
  MapPin, Settings, ArrowRight, Hash, DollarSign, Target, Flame,
  Command, CornerDownLeft, Package, Award, Sparkles, Users,
} from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  category: 'navigation' | 'action' | 'data' | 'strategy'
  action: () => void
  keywords: string[]
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: ViewKey) => void
}

// Fuzzy match scoring
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 90
  if (t.includes(q)) return 70
  // Fuzzy: all characters appear in order
  let qi = 0
  let consecutive = 0
  let maxConsecutive = 0
  let score = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      consecutive++
      maxConsecutive = Math.max(maxConsecutive, consecutive)
      score += consecutive * 2 // bonus for consecutive matches
    } else {
      consecutive = 0
    }
  }
  if (qi < q.length) return 0 // not all chars matched
  return Math.min(60, score + maxConsecutive * 5)
}

function bestScore(query: string, keywords: string[]): number {
  return Math.max(...keywords.map(kw => fuzzyScore(query, kw)))
}

export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const { state, taxReport, strategies, healthScore, takeManualSnapshot } = useFortuna()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Build command items
  const allItems = useMemo((): CommandItem[] => {
    const nav: CommandItem[] = [
      { id: 'nav-dashboard', label: 'Command Center', sublabel: 'Dashboard overview', icon: <LayoutDashboard size={16} />, category: 'navigation', action: () => onNavigate('dashboard'), keywords: ['dashboard', 'command center', 'home', 'overview'] },
      { id: 'nav-health', label: 'Health Score', sublabel: 'Financial wellness', icon: <Activity size={16} />, category: 'navigation', action: () => onNavigate('health'), keywords: ['health', 'score', 'wellness', 'grade'] },
      { id: 'nav-alerts', label: 'Intelligence Feed', sublabel: 'Proactive alerts', icon: <Bell size={16} />, category: 'navigation', action: () => onNavigate('alerts'), keywords: ['alerts', 'intelligence', 'notifications', 'proactive'] },
      { id: 'nav-history', label: 'Financial History', sublabel: 'Trends & snapshots', icon: <History size={16} />, category: 'navigation', action: () => onNavigate('history'), keywords: ['history', 'trends', 'snapshots', 'timeline'] },
      { id: 'nav-tax', label: 'Tax Strategy', sublabel: 'Optimization engine', icon: <Receipt size={16} />, category: 'navigation', action: () => onNavigate('tax'), keywords: ['tax', 'strategy', 'optimization', 'deductions'] },
      { id: 'nav-entity', label: 'Entity Design', sublabel: 'Business structures', icon: <Building2 size={16} />, category: 'navigation', action: () => onNavigate('entity'), keywords: ['entity', 'design', 'llc', 'scorp', 'corporation'] },
      { id: 'nav-optimizer', label: 'Entity Optimizer', sublabel: 'Structure arbitrage', icon: <Scale size={16} />, category: 'navigation', action: () => onNavigate('optimizer'), keywords: ['optimizer', 'salary', 'distribution', 'breakeven'] },
      { id: 'nav-flow', label: 'Entity Flow', sublabel: 'Money flow diagram', icon: <ArrowRight size={16} />, category: 'navigation', action: () => onNavigate('flow'), keywords: ['flow', 'entity flow', 'diagram', 'money'] },
      { id: 'nav-revenue', label: 'Revenue Engine', sublabel: 'Income streams', icon: <TrendingUp size={16} />, category: 'navigation', action: () => onNavigate('revenue'), keywords: ['revenue', 'income', 'streams', 'earnings'] },
      { id: 'nav-scenarios', label: 'Scenario Modeler', sublabel: 'What-if analysis', icon: <BarChart3 size={16} />, category: 'navigation', action: () => onNavigate('scenarios'), keywords: ['scenario', 'modeler', 'what if', 'simulation'] },
      { id: 'nav-retirement', label: 'Retirement Optimizer', sublabel: 'SEP IRA, Solo 401k, Roth', icon: <PiggyBank size={16} />, category: 'navigation', action: () => onNavigate('retirement'), keywords: ['retirement', 'sep ira', 'solo 401k', 'roth', 'pension'] },
      { id: 'nav-arbitrage', label: 'State Arbitrage', sublabel: 'Tax residency optimization', icon: <MapPin size={16} />, category: 'navigation', action: () => onNavigate('arbitrage'), keywords: ['state', 'arbitrage', 'residency', 'relocation', 'move'] },
      { id: 'nav-multiyear', label: 'Multi-Year Tax', sublabel: 'TCJA sunset, income shifting', icon: <Calendar size={16} />, category: 'navigation', action: () => onNavigate('multiyear'), keywords: ['multi year', 'projection', 'tcja', 'sunset', 'forecast', 'income shifting', 'bracket'] },
      { id: 'nav-depreciation', label: 'Depreciation & Assets', sublabel: 'Section 179, bonus, MACRS', icon: <Package size={16} />, category: 'navigation', action: () => onNavigate('depreciation'), keywords: ['depreciation', 'section 179', 'bonus', 'macrs', 'asset', 'vehicle', 'home office', 'equipment'] },
      { id: 'nav-credits', label: 'Tax Credits', sublabel: 'Federal credit optimizer', icon: <Award size={16} />, category: 'navigation', action: () => onNavigate('credits'), keywords: ['credit', 'child tax', 'eitc', 'ev', 'energy', 'education', 'r&d', 'saver'] },
      { id: 'nav-nexus', label: 'Intelligence Nexus', sublabel: 'Cross-engine compound insights', icon: <Sparkles size={16} />, category: 'navigation', action: () => onNavigate('nexus'), keywords: ['nexus', 'intelligence', 'compound', 'cross engine', 'insights', 'combined'] },
      { id: 'nav-pnl', label: 'P&L Statement', sublabel: 'Income statement & margins', icon: <FileText size={16} />, category: 'navigation', action: () => onNavigate('pnl'), keywords: ['pnl', 'profit', 'loss', 'income statement', 'margin', 'revenue', 'ebitda', 'net income'] },
      { id: 'nav-risk', label: 'Risk Matrix', sublabel: 'Vulnerability analysis', icon: <Shield size={16} />, category: 'navigation', action: () => onNavigate('risk'), keywords: ['risk', 'matrix', 'vulnerability'] },
      { id: 'nav-audit', label: 'Audit Profiler', sublabel: 'IRS DIF scoring', icon: <ShieldAlert size={16} />, category: 'navigation', action: () => onNavigate('audit'), keywords: ['audit', 'profiler', 'irs', 'dif'] },
      { id: 'nav-cashflow', label: 'Cash Flow', sublabel: 'Monthly projections', icon: <Wallet size={16} />, category: 'navigation', action: () => onNavigate('cashflow'), keywords: ['cash flow', 'monthly', 'projections', 'runway'] },
      { id: 'nav-workflows', label: 'Guided Workflows', sublabel: 'Mission paths', icon: <Compass size={16} />, category: 'navigation', action: () => onNavigate('workflows'), keywords: ['workflows', 'guided', 'mission', 'optimize'] },
      { id: 'nav-automations', label: 'Automations', sublabel: 'Rules & triggers', icon: <Zap size={16} />, category: 'navigation', action: () => onNavigate('automations'), keywords: ['automations', 'rules', 'triggers'] },
      { id: 'nav-timeline', label: 'Timeline', sublabel: 'Execution plan', icon: <Calendar size={16} />, category: 'navigation', action: () => onNavigate('timeline'), keywords: ['timeline', 'execution', 'plan'] },
      { id: 'nav-calendar', label: 'Tax Calendar', sublabel: 'Deadline tracker', icon: <CalendarClock size={16} />, category: 'navigation', action: () => onNavigate('calendar'), keywords: ['calendar', 'deadlines', 'dates', 'filing'] },
      { id: 'nav-reports', label: 'Reports', sublabel: 'Comprehensive analysis', icon: <FileText size={16} />, category: 'navigation', action: () => onNavigate('reports'), keywords: ['reports', 'analysis', 'summary'] },
      { id: 'nav-documents', label: 'Document Center', sublabel: 'Templates & forms', icon: <FileOutput size={16} />, category: 'navigation', action: () => onNavigate('documents'), keywords: ['documents', 'templates', 'forms'] },
      { id: 'nav-taxdocs', label: 'Tax Documents', sublabel: '1040-ES, Schedule C, audit docs', icon: <FileSpreadsheet size={16} />, category: 'navigation', action: () => onNavigate('taxdocs'), keywords: ['tax documents', '1040', 'schedule c', 'vouchers', 'estimated payments'] },
      { id: 'nav-cpa', label: 'CPA Export', sublabel: 'Professional handoff', icon: <Briefcase size={16} />, category: 'navigation', action: () => onNavigate('cpa'), keywords: ['cpa', 'export', 'accountant', 'handoff'] },
      { id: 'nav-advisor', label: 'AI Advisor', sublabel: 'Full-context AI chat', icon: <Bot size={16} />, category: 'navigation', action: () => onNavigate('advisor'), keywords: ['advisor', 'ai', 'chat', 'ask', 'help'] },
      { id: 'nav-import', label: 'Data Import', sublabel: 'CSV, OFX files', icon: <Upload size={16} />, category: 'navigation', action: () => onNavigate('import'), keywords: ['import', 'csv', 'ofx', 'upload', 'data'] },
      { id: 'nav-setup', label: 'Edit Profile', sublabel: 'Financial profile', icon: <Settings size={16} />, category: 'navigation', action: () => onNavigate('setup'), keywords: ['setup', 'profile', 'edit', 'settings', 'configure'] },
      { id: 'nav-data', label: 'Data Manager', sublabel: 'Export, import, backup', icon: <Database size={16} />, category: 'navigation', action: () => onNavigate('data'), keywords: ['data', 'manager', 'backup', 'export'] },
      { id: 'nav-paycheck', label: 'Paycheck Simulator', sublabel: 'Per-period take-home breakdown', icon: <Wallet size={16} />, category: 'navigation', action: () => onNavigate('paycheck'), keywords: ['paycheck', 'simulator', 'take home', 'net pay', 'gross', 'withholding', 'w2'] },
      { id: 'nav-deductions', label: 'Deduction Finder', sublabel: 'Discover unclaimed deductions', icon: <Search size={16} />, category: 'navigation', action: () => onNavigate('deductions'), keywords: ['deduction', 'finder', 'discovery', 'unclaimed', 'missed', 'savings'] },
      { id: 'nav-marginal', label: 'Marginal Rates', sublabel: 'Rate stack visualization', icon: <Shield size={16} />, category: 'navigation', action: () => onNavigate('marginal'), keywords: ['marginal', 'rate', 'bracket', 'stack', 'effective', 'keep'] },
      { id: 'nav-goals', label: 'Goal Planner', sublabel: 'Reverse-engineer financial targets', icon: <Settings size={16} />, category: 'navigation', action: () => onNavigate('goals'), keywords: ['goal', 'planner', 'target', 'savings', 'income', 'reverse'] },
      { id: 'nav-taxprep', label: 'Tax Prep Checklist', sublabel: 'Filing readiness tracker', icon: <FileText size={16} />, category: 'navigation', action: () => onNavigate('taxprep'), keywords: ['tax prep', 'checklist', 'filing', 'preparation', 'documents', 'forms'] },
      { id: 'nav-workspace', label: 'Collaboration', sublabel: 'Workspaces, teams & shared resources', icon: <Users size={16} />, category: 'navigation', action: () => onNavigate('workspace'), keywords: ['workspace', 'team', 'collaborate', 'share', 'members', 'invite'] },
    ]

    const actions: CommandItem[] = [
      {
        id: 'act-snapshot', label: 'Take Financial Snapshot', sublabel: 'Record current state',
        icon: <Hash size={16} />, category: 'action',
        action: () => { takeManualSnapshot('Manual snapshot via Command Palette'); onClose() },
        keywords: ['snapshot', 'record', 'capture'],
      },
    ]

    // Dynamic data items — income streams
    const dataItems: CommandItem[] = state.incomeStreams.filter(s => s.isActive).map(stream => ({
      id: `data-stream-${stream.id}`, label: stream.name || stream.type, sublabel: `$${stream.annualAmount.toLocaleString()}/yr · ${stream.type}`,
      icon: <DollarSign size={16} />, category: 'data' as const,
      action: () => onNavigate('revenue'),
      keywords: [stream.name, stream.type, 'income', 'stream', 'revenue'].filter(Boolean) as string[],
    }))

    // Entities
    state.entities.filter(e => e.isActive).forEach(entity => {
      dataItems.push({
        id: `data-entity-${entity.id}`, label: entity.name, sublabel: `${entity.type.toUpperCase()} · ${entity.state}`,
        icon: <Building2 size={16} />, category: 'data',
        action: () => onNavigate('entity'),
        keywords: [entity.name, entity.type, entity.state, 'entity'].filter(Boolean) as string[],
      })
    })

    // Strategy items
    const stratItems: CommandItem[] = strategies.slice(0, 10).map(strat => ({
      id: `strat-${strat.id}`, label: strat.title, sublabel: `${strat.impactLabel} · ${strat.priority} priority`,
      icon: <Target size={16} />, category: 'strategy' as const,
      action: () => onNavigate('tax'),
      keywords: [strat.title, strat.category, strat.priority, 'strategy'].filter(Boolean) as string[],
    }))

    // Document items (Scanned intelligence)
    const docItems: CommandItem[] = state.documents
      .filter(d => d.status === 'processed')
      .map(doc => ({
        id: `doc-${doc.id}`,
        label: doc.metadata.merchantName || doc.documentType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        sublabel: `${doc.metadata.date || doc.dateAdded.split('T')[0]} · ${doc.metadata.totalAmount ? `$${doc.metadata.totalAmount.toLocaleString()}` : 'No amount'}`,
        icon: doc.documentType === 'receipt' ? <Receipt size={16} /> : <FileText size={16} />,
        category: 'data' as const,
        action: () => {
          // Future: Open specific document modal/view
          onNavigate('documents')
        },
        keywords: [
          doc.metadata.merchantName,
          doc.documentType,
          doc.summary,
          'document',
          'receipt',
          'scan'
        ].filter(Boolean) as string[],
      }))

    return [...nav, ...actions, ...dataItems, ...stratItems, ...docItems]
  }, [state, strategies, onNavigate, takeManualSnapshot, onClose])

  // Filter and sort
  const filtered = useMemo(() => {
    if (!query.trim()) {
      // Show top items by category when empty
      return allItems.slice(0, 12)
    }
    return allItems
      .map(item => ({ item, score: Math.max(
        bestScore(query, item.keywords),
        fuzzyScore(query, item.label),
        fuzzyScore(query, item.sublabel || ''),
      )}))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ item }) => item)
  }, [query, allItems])

  // Keyboard navigation
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].action()
      if (filtered[selectedIndex].category === 'navigation') onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [filtered, selectedIndex, onClose])

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Reset selection when query changes
  useEffect(() => { setSelectedIndex(0) }, [query])

  if (!isOpen) return null

  const categoryLabels: Record<string, string> = {
    navigation: 'NAVIGATE',
    action: 'ACTIONS',
    data: 'YOUR DATA',
    strategy: 'STRATEGIES',
  }
  const categoryColors: Record<string, string> = {
    navigation: 'var(--accent-gold)',
    action: 'var(--accent-emerald)',
    data: 'var(--accent-blue)',
    strategy: 'var(--accent-purple)',
  }

  // Group by category
  let lastCategory = ''

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          animation: 'cmdFadeIn 0.15s ease-out',
        }}
      />

      {/* Palette */}
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 560, maxHeight: '60vh', zIndex: 9999,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-medium)',
        borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        overflow: 'hidden',
        animation: 'cmdSlideIn 0.2s var(--ease-spring)',
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <Search size={18} color="var(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search views, actions, data..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-primary)',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          }}>
            ESC
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 'calc(60vh - 60px)', overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No matches for "{query}"
            </div>
          )}
          {filtered.map((item, i) => {
            const showHeader = item.category !== lastCategory
            lastCategory = item.category
            return (
              <div key={item.id}>
                {showHeader && (
                  <div style={{
                    padding: '8px 20px 4px',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                    color: categoryColors[item.category] || 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {categoryLabels[item.category] || item.category.toUpperCase()}
                  </div>
                )}
                <button
                  onClick={() => { item.action(); if (item.category === 'navigation') onClose() }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '10px 20px',
                    background: i === selectedIndex ? 'var(--bg-hover)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    transition: 'background 0.1s',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: `${categoryColors[item.category] || 'var(--accent-gold)'}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: categoryColors[item.category] || 'var(--accent-gold)',
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div>
                    {item.sublabel && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{item.sublabel}</div>
                    )}
                  </div>
                  {i === selectedIndex && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    }}>
                      <CornerDownLeft size={12} /> Enter
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 20px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
        }}>
          <span>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
        </div>
      </div>
    </>
  )
}
