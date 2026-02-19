/**
 * FORTUNA ENGINE — Mobile Bottom Bar + More Sheet
 * Bottom tab navigation for mobile (<768px) with progressive disclosure.
 * Shows 5 core tabs + "More" sheet for all other features.
 */

import { useState, useCallback, useEffect } from 'react'
import type { ViewKey } from '../App'
import {
  LayoutDashboard, Receipt, Bot, FileText, MoreHorizontal,
  Building2, BarChart3, Shield, Wallet, Zap, Calendar,
  Bell, Upload, PiggyBank, MapPin, Activity, Target,
  Search, Briefcase, History, Users, X, ChevronRight,
  Brain, CreditCard, Scale, Package, Award, Layers,
  CalendarRange, ClipboardCheck, FileSpreadsheet, Database,
  Compass, TrendingUp,
} from 'lucide-react'

interface MobileBottomBarProps {
  activeView: ViewKey
  onNavigate: (view: ViewKey) => void
}

interface MoreItem {
  key: ViewKey
  label: string
  icon: React.ReactNode
  section: string
  description: string
}

const MORE_ITEMS: MoreItem[] = [
  // Strategy
  { key: 'tax', label: 'Tax Strategy', icon: <Receipt size={20} />, section: 'Strategy', description: 'View strategies & savings' },
  { key: 'paycheck', label: 'Paycheck Simulator', icon: <CreditCard size={20} />, section: 'Strategy', description: 'W-4 & take-home pay' },
  { key: 'deductions', label: 'Deduction Finder', icon: <Search size={20} />, section: 'Strategy', description: 'Discover missed deductions' },
  { key: 'scenarios', label: 'What-If Scenarios', icon: <BarChart3 size={20} />, section: 'Strategy', description: 'Model financial decisions' },
  { key: 'entity', label: 'Entity Comparison', icon: <Building2 size={20} />, section: 'Strategy', description: 'LLC vs S-Corp vs C-Corp' },
  { key: 'retirement', label: 'Retirement Optimizer', icon: <PiggyBank size={20} />, section: 'Strategy', description: '401k, IRA, HSA planning' },
  { key: 'arbitrage', label: 'State Tax Compare', icon: <MapPin size={20} />, section: 'Strategy', description: '50-state tax comparison' },
  // Analysis
  { key: 'health', label: 'Health Score', icon: <Activity size={20} />, section: 'Analysis', description: 'Financial health rating' },
  { key: 'nexus', label: 'Nexus Insights', icon: <Brain size={20} />, section: 'Analysis', description: 'AI-powered connections' },
  { key: 'portfolio', label: 'Portfolio Intel', icon: <Briefcase size={20} />, section: 'Analysis', description: 'Investment tax analysis' },
  { key: 'cashflow', label: 'Cash Flow', icon: <Wallet size={20} />, section: 'Analysis', description: 'Income & expense tracking' },
  { key: 'audit', label: 'Audit Risk', icon: <Shield size={20} />, section: 'Analysis', description: 'Red flags & readiness' },
  { key: 'marginal', label: 'Tax Rates', icon: <Layers size={20} />, section: 'Analysis', description: 'Marginal & effective rates' },
  { key: 'multiyear', label: 'Multi-Year View', icon: <CalendarRange size={20} />, section: 'Analysis', description: '3-5 year projections' },
  // Tools
  { key: 'goals', label: 'Goal Planner', icon: <Target size={20} />, section: 'Tools', description: 'Financial milestones' },
  { key: 'calendar', label: 'Tax Calendar', icon: <Calendar size={20} />, section: 'Tools', description: 'Deadlines & reminders' },
  { key: 'alerts', label: 'Intelligence', icon: <Bell size={20} />, section: 'Tools', description: 'Proactive alerts' },
  { key: 'depreciation', label: 'Depreciation', icon: <Package size={20} />, section: 'Tools', description: '§179 & MACRS tracking' },
  { key: 'credits', label: 'Tax Credits', icon: <Award size={20} />, section: 'Tools', description: 'Credit eligibility' },
  { key: 'import', label: 'Data Import', icon: <Upload size={20} />, section: 'Tools', description: 'CSV & exchange sync' },
  // Output
  { key: 'reports', label: 'Reports', icon: <FileText size={20} />, section: 'Output', description: 'Generate tax reports' },
  { key: 'pnl', label: 'P&L Statement', icon: <BarChart3 size={20} />, section: 'Output', description: 'Profit & loss report' },
  { key: 'taxdocs', label: 'Tax Documents', icon: <FileSpreadsheet size={20} />, section: 'Output', description: 'IRS-ready forms' },
  { key: 'cpa', label: 'CPA Export', icon: <Briefcase size={20} />, section: 'Output', description: 'Package for accountant' },
  // Settings
  { key: 'workspace', label: 'Collaboration', icon: <Users size={20} />, section: 'Settings', description: 'Team & CPA access' },
  { key: 'setup', label: 'Edit Profile', icon: <Database size={20} />, section: 'Settings', description: 'Your financial data' },
  { key: 'data', label: 'Data Manager', icon: <Database size={20} />, section: 'Settings', description: 'Backup & sync' },
]

export function MobileBottomBar({ activeView, onNavigate }: MobileBottomBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)

  // Close sheet when navigating
  const handleNav = useCallback((view: ViewKey) => {
    setMoreOpen(false)
    onNavigate(view)
  }, [onNavigate])

  // Close on escape
  useEffect(() => {
    if (!moreOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [moreOpen])

  // Prevent body scroll when sheet open
  useEffect(() => {
    document.body.style.overflow = moreOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [moreOpen])

  const coreTabActive = (keys: ViewKey[]) => keys.includes(activeView)
  const isMoreActive = !coreTabActive(['dashboard', 'tax', 'advisor', 'reports']) && activeView !== 'dashboard'

  return (
    <>
      {/* Bottom Tab Bar */}
      <div className="mobile-bottom-bar" role="navigation" aria-label="Main navigation">
        <nav>
          <button
            className={`mobile-tab ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNav('dashboard')}
            aria-label="Dashboard"
            aria-current={activeView === 'dashboard' ? 'page' : undefined}
          >
            <LayoutDashboard size={22} />
            <span>Home</span>
          </button>

          <button
            className={`mobile-tab ${coreTabActive(['tax', 'scenarios', 'entity', 'retirement', 'arbitrage', 'deductions', 'paycheck', 'marginal']) ? 'active' : ''}`}
            onClick={() => handleNav('tax')}
            aria-label="Tax Strategy"
            aria-current={activeView === 'tax' ? 'page' : undefined}
          >
            <Receipt size={22} />
            <span>Strategy</span>
          </button>

          <button
            className={`mobile-tab ${activeView === 'advisor' ? 'active' : ''}`}
            onClick={() => handleNav('advisor')}
            aria-label="AI Advisor"
            aria-current={activeView === 'advisor' ? 'page' : undefined}
          >
            <Bot size={22} />
            <span>Advisor</span>
          </button>

          <button
            className={`mobile-tab ${coreTabActive(['reports', 'taxdocs', 'cpa', 'pnl', 'documents']) ? 'active' : ''}`}
            onClick={() => handleNav('reports')}
            aria-label="Reports"
            aria-current={activeView === 'reports' ? 'page' : undefined}
          >
            <FileText size={22} />
            <span>Reports</span>
          </button>

          <button
            className={`mobile-tab ${moreOpen || isMoreActive ? 'active' : ''}`}
            onClick={() => setMoreOpen(!moreOpen)}
            aria-label="More options"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={22} />
            <span>More</span>
          </button>
        </nav>
      </div>

      {/* More Sheet Overlay */}
      <div
        className={`mobile-sheet-overlay ${moreOpen ? 'open' : ''}`}
        onClick={() => setMoreOpen(false)}
        aria-hidden={!moreOpen}
      />

      {/* More Sheet */}
      <div
        className={`mobile-sheet ${moreOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="All features"
      >
        <div className="mobile-sheet-handle" />

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 20px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-primary)' }}>
            All Features
          </span>
          <button
            onClick={() => setMoreOpen(false)}
            style={{
              background: 'var(--bg-surface)', border: 'none', borderRadius: 8,
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
            }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Grouped items */}
        <div style={{ padding: '8px 12px 32px', overflowY: 'auto' }}>
          {['Strategy', 'Analysis', 'Tools', 'Output', 'Settings'].map(section => {
            const items = MORE_ITEMS.filter(i => i.section === section)
            return (
              <div key={section} style={{ marginBottom: 8 }}>
                <div style={{
                  padding: '12px 8px 6px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                }}>
                  {section}
                </div>
                {items.map(item => (
                  <button
                    key={item.key}
                    onClick={() => handleNav(item.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      width: '100%',
                      padding: '12px 10px',
                      borderRadius: 12,
                      border: 'none',
                      background: activeView === item.key ? 'var(--accent-gold-dim)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                      minHeight: 48,
                    }}
                    aria-current={activeView === item.key ? 'page' : undefined}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: activeView === item.key ? 'var(--accent-gold-dim)' : 'var(--bg-surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: activeView === item.key ? 'var(--accent-gold)' : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}>
                      {item.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14,
                        fontWeight: activeView === item.key ? 600 : 400,
                        color: activeView === item.key ? 'var(--accent-gold)' : 'var(--text-primary)',
                      }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                        {item.description}
                      </div>
                    </div>
                    <ChevronRight size={16} color="var(--text-muted)" />
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
