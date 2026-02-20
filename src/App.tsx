import React, { useState, useEffect, useCallback, lazy } from 'react'
import { FortunaProvider, useFortuna } from './hooks/useFortuna'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AuthScreen } from './views/AuthScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ViewShell } from './components/ViewShell'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { ToastProvider, useToasts } from './components/ToastSystem'
import { OnboardingTour, hasCompletedTour } from './components/OnboardingTour'
import { NavigationProvider } from './context/NavigationContext'
import { MobileBottomBar } from './components/MobileBottomBar'
import { SaveStatusBar } from './components/SaveStatusBar'
import { QuickStartWizard } from './components/QuickStartWizard'
import { UXPreferencesToggle } from './components/UXPreferences'
import './App.css'

// ─── Code-split views (React.lazy) ─────────────────────────────────────────
// Dashboard loaded eagerly (most common landing), all others lazy
import { Dashboard } from './views/Dashboard'
import { DataSetup } from './views/DataSetup'

const TaxStrategy = lazy(() => import('./views/TaxStrategy').then(m => ({ default: m.TaxStrategy })))
const EntityDesign = lazy(() => import('./views/EntityDesign').then(m => ({ default: m.EntityDesign })))
const RevenueEngine = lazy(() => import('./views/RevenueEngine').then(m => ({ default: m.RevenueEngine })))
const RiskMatrix = lazy(() => import('./views/RiskMatrix').then(m => ({ default: m.RiskMatrix })))
const Automations = lazy(() => import('./views/Automations').then(m => ({ default: m.Automations })))
const AIAdvisor = lazy(() => import('./views/AIAdvisor').then(m => ({ default: m.AIAdvisor })))
const ScenarioModeler = lazy(() => import('./views/ScenarioModeler').then(m => ({ default: m.ScenarioModeler })))
const ExecutionTimeline = lazy(() => import('./views/ExecutionTimeline').then(m => ({ default: m.ExecutionTimeline })))
const EntityFlow = lazy(() => import('./views/EntityFlow').then(m => ({ default: m.EntityFlow })))
const Reports = lazy(() => import('./views/Reports').then(m => ({ default: m.Reports })))
const CashFlow = lazy(() => import('./views/CashFlow').then(m => ({ default: m.CashFlow })))
const AuditProfiler = lazy(() => import('./views/AuditProfiler').then(m => ({ default: m.AuditProfiler })))
// v5
const ProactiveAlerts = lazy(() => import('./views/ProactiveAlerts').then(m => ({ default: m.ProactiveAlerts })))
const TaxCalendar = lazy(() => import('./views/TaxCalendar').then(m => ({ default: m.TaxCalendar })))
const DocumentCenter = lazy(() => import('./views/DocumentCenter').then(m => ({ default: m.DocumentCenter })))
const DataImport = lazy(() => import('./views/DataImport').then(m => ({ default: m.DataImport })))
const DocumentIntake = lazy(() => import('./views/DocumentIntake').then(m => ({ default: m.DocumentIntake })))
const Workflows = lazy(() => import('./views/Workflows').then(m => ({ default: m.Workflows })))
// v6
const EntityOptimizer = lazy(() => import('./views/EntityOptimizer').then(m => ({ default: m.EntityOptimizer })))
const HealthScore = lazy(() => import('./views/HealthScore').then(m => ({ default: m.HealthScore })))
const CPAExport = lazy(() => import('./views/CPAExport').then(m => ({ default: m.CPAExport })))
// v7
const DataManager = lazy(() => import('./views/DataManager').then(m => ({ default: m.DataManager })))
// v8
const FinancialHistory = lazy(() => import('./views/FinancialHistory').then(m => ({ default: m.FinancialHistory })))
const TaxDocuments = lazy(() => import('./views/TaxDocuments').then(m => ({ default: m.TaxDocuments })))
const RetirementOptimizer = lazy(() => import('./views/RetirementOptimizer').then(m => ({ default: m.RetirementOptimizer })))
const StateArbitrage = lazy(() => import('./views/StateArbitrage').then(m => ({ default: m.StateArbitrage })))
// v9
const MultiYearTaxView = lazy(() => import('./views/MultiYearTax').then(m => ({ default: m.MultiYearTaxView })))
const DepreciationView = lazy(() => import('./views/DepreciationView').then(m => ({ default: m.DepreciationView })))
const TaxCreditsView = lazy(() => import('./views/TaxCreditsView').then(m => ({ default: m.TaxCreditsView })))
// v9.1
const NexusView = lazy(() => import('./views/NexusView').then(m => ({ default: m.NexusView })))
const PnLView = lazy(() => import('./views/PnLView').then(m => ({ default: m.PnLView })))
// v10
const PaycheckSimulator = lazy(() => import('./views/PaycheckSimulator').then(m => ({ default: m.PaycheckSimulator })))
const DeductionDiscovery = lazy(() => import('./views/DeductionDiscovery').then(m => ({ default: m.DeductionDiscovery })))
const MarginalRateView = lazy(() => import('./views/MarginalRateView').then(m => ({ default: m.MarginalRateView })))
const GoalPlanner = lazy(() => import('./views/GoalPlanner').then(m => ({ default: m.GoalPlanner })))
const TaxPrepChecklist = lazy(() => import('./views/TaxPrepChecklist').then(m => ({ default: m.TaxPrepChecklist })))
const WorkspacePanel = lazy(() => import('./views/WorkspacePanel').then(m => ({ default: m.WorkspacePanel })))
const PortfolioIntelligence = lazy(() => import('./views/PortfolioIntelligence').then(m => ({ default: m.PortfolioIntelligence })))
const MarketIntelligence = lazy(() => import('./views/MarketIntelligence'))
const QuickBooksImport = lazy(() => import('./views/QuickBooksImport'))
const FinTechConnections = lazy(() => import('./views/FinTechConnections'))
const TransactionReview = lazy(() => import('./views/TransactionReview'))
const FinTechHub = lazy(() => import('./views/FinTechHub'))

export type ViewKey = 'dashboard' | 'tax' | 'entity' | 'revenue' | 'risk' | 'automations' | 'advisor' | 'setup' | 'scenarios' | 'timeline' | 'flow' | 'reports' | 'cashflow' | 'audit' | 'alerts' | 'calendar' | 'documents' | 'import' | 'receipt-scan' | 'workflows' | 'optimizer' | 'health' | 'cpa' | 'data' | 'history' | 'taxdocs' | 'retirement' | 'arbitrage' | 'multiyear' | 'depreciation' | 'credits' | 'nexus' | 'pnl' | 'paycheck' | 'deductions' | 'marginal' | 'goals' | 'taxprep' | 'workspace' | 'portfolio' | 'quickbooks' | 'fintech' | 'fintech-hub' | 'txn-review'

const VALID_VIEWS = new Set<ViewKey>([
  'dashboard','tax','entity','revenue','risk','automations','advisor','setup',
  'scenarios','timeline','flow','reports','cashflow','audit','alerts','calendar',
  'documents', 'import', 'receipt-scan', 'workflows', 'optimizer', 'health', 'cpa', 'data', 'history', 'taxdocs',
  'retirement','arbitrage','multiyear','depreciation','credits','nexus','pnl',
  'paycheck', 'deductions', 'marginal', 'goals', 'taxprep', 'workspace', 'portfolio', 'quickbooks', 'fintech', 'fintech-hub', 'txn-review',
])

function AppInner() {
  const { state, loading, healthScore, uxPrefs, updateUXPrefs } = useFortuna()
  const { addToast } = useToasts()
  const [activeView, setActiveViewRaw] = useState<ViewKey>('dashboard')
  const [mounted, setMounted] = useState(false)
  const [prefsApplied, setPrefsApplied] = useState(false)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // ⌘K / Ctrl+K keyboard shortcut for Command Palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Restore last active view + sidebar from UX prefs (once, after loading)
  useEffect(() => {
    if (!loading && !prefsApplied) {
      const lastView = uxPrefs.lastActiveView as ViewKey
      if (lastView && VALID_VIEWS.has(lastView) && state.onboardingComplete) {
        setActiveViewRaw(lastView)
      }
      setPrefsApplied(true)
    }
  }, [loading, prefsApplied, uxPrefs, state.onboardingComplete])

  // Redirect to quick start if onboarding not complete
  useEffect(() => {
    if (!loading && !state.onboardingComplete) {
      setShowQuickStart(true)
      setActiveViewRaw('setup')
    }
  }, [loading, state.onboardingComplete])

  // Detect ?invite=CODE in URL and navigate to workspace
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const inviteCode = params.get('invite')
    if (inviteCode) {
      // Store invite code for WorkspacePanel to pick up
      sessionStorage.setItem('fortuna:pending-invite', inviteCode)
      setActiveViewRaw('workspace')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Persist active view changes
  const setActiveView = useCallback((view: ViewKey) => {
    setActiveViewRaw(view)
    updateUXPrefs({ lastActiveView: view })
  }, [updateUXPrefs])

  // Persist sidebar collapsed state
  const sidebarCollapsed = uxPrefs.sidebarCollapsed
  const toggleSidebar = useCallback(() => {
    updateUXPrefs({ sidebarCollapsed: !sidebarCollapsed })
  }, [sidebarCollapsed, updateUXPrefs])

  const highPriorityCount = state.strategies.filter((s: any) => s.priority === 'critical' || s.priority === 'high').length

  const renderView = useCallback(() => {
    switch (activeView) {
      case 'setup': return <DataSetup onComplete={() => {
        if (!hasCompletedTour()) {
          setShowTour(true)
        }
        setActiveView('dashboard')
      }} editMode={state.onboardingComplete} />
      case 'dashboard': return <Dashboard onNavigate={setActiveView} />
      case 'tax': return <TaxStrategy />
      case 'entity': return <EntityDesign />
      case 'revenue': return <RevenueEngine />
      case 'risk': return <RiskMatrix />
      case 'automations': return <Automations />
      case 'advisor': return <AIAdvisor />
      case 'scenarios': return <ScenarioModeler />
      case 'timeline': return <ExecutionTimeline />
      case 'flow': return <EntityFlow />
      case 'reports': return <Reports />
      case 'cashflow': return <CashFlow />
      case 'audit': return <AuditProfiler />
      // v5
      case 'alerts': return <ProactiveAlerts onNavigate={setActiveView} />
      case 'calendar': return <TaxCalendar />
      case 'documents': return <DocumentCenter />
      case 'import': return <DataImport />
      case 'document-scan': return <DocumentIntake />
      case 'workflows': return <Workflows onNavigate={setActiveView} />
      // v6
      case 'optimizer': return <EntityOptimizer />
      case 'health': return <HealthScore onNavigate={setActiveView} />
      case 'cpa': return <CPAExport />
      // v7
      case 'data': return <DataManager />
      // v8
      case 'history': return <FinancialHistory />
      case 'taxdocs': return <TaxDocuments />
      case 'retirement': return <RetirementOptimizer />
      case 'arbitrage': return <StateArbitrage />
      // v9
      case 'multiyear': return <MultiYearTaxView onNavigate={setActiveView} />
      case 'depreciation': return <DepreciationView onNavigate={setActiveView} />
      case 'credits': return <TaxCreditsView onNavigate={setActiveView} />
      // v9.1
      case 'nexus': return <NexusView />
      case 'pnl': return <PnLView />
      // v10
      case 'paycheck': return <PaycheckSimulator />
      case 'deductions': return <DeductionDiscovery />
      case 'marginal': return <MarginalRateView />
      case 'goals': return <GoalPlanner />
      case 'taxprep': return <TaxPrepChecklist />
      case 'workspace': return <WorkspacePanel />
      case 'portfolio': return <PortfolioIntelligence />
      case 'markets': return <MarketIntelligence />
      case 'quickbooks': return <QuickBooksImport />
      case 'fintech': return <FinTechConnections />
      case 'txn-review': return <TransactionReview />
      case 'fintech-hub': return <FinTechHub />
      default: return <Dashboard onNavigate={setActiveView} />
    }
  }, [activeView, state.onboardingComplete, setActiveView])

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 4px 24px rgba(212,168,67,0.3)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0c0e12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--accent-gold)', marginBottom: 8 }}>Fortuna</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
            LOADING ENGINE...
          </div>
        </div>
      </div>
    )
  }

  return (
    <NavigationProvider onNavigate={setActiveView} currentView={activeView}>
    <div className={`app-root ${mounted ? 'mounted' : ''}`}>
      {/* Skip to content — accessibility */}
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <div className="app-bg" aria-hidden="true" />
      <div className="app-grain" aria-hidden="true" />

      {/* Quick Start Wizard for first-time users */}
      {showQuickStart && !state.onboardingComplete && (
        <main id="main-content" className="main-content no-sidebar" style={{ marginLeft: 0 }}>
          <QuickStartWizard
            onComplete={(navigateTo) => {
              setShowQuickStart(false)
              if (!hasCompletedTour()) setShowTour(true)
              setActiveView(navigateTo || 'dashboard')
            }}
            onSkipToFull={() => {
              setShowQuickStart(false)
              setActiveView('setup')
            }}
          />
        </main>
      )}

      {/* Normal app shell */}
      {(!showQuickStart || state.onboardingComplete) && (
        <>
          {activeView !== 'setup' && (
            <Sidebar
              activeView={activeView}
              onNavigate={setActiveView}
              collapsed={sidebarCollapsed}
              onToggle={toggleSidebar}
              notificationCount={highPriorityCount}
              healthScore={healthScore.overall}
              healthChange={healthScore.grade}
            />
          )}
          <main
            id="main-content"
            className={`main-content ${sidebarCollapsed ? 'expanded' : ''} ${activeView === 'setup' ? 'no-sidebar' : ''}`}
            style={{ ...(activeView === 'setup' ? { marginLeft: 0 } : {}), paddingBottom: 36 }}
            role="main"
            aria-label={`${activeView} view`}
          >
            <ViewShell view={activeView} state={state} onNavigate={setActiveView}>
                {renderView()}
            </ViewShell>
          </main>

          {/* Mobile Bottom Bar — hidden on desktop via CSS */}
          {activeView !== 'setup' && (
            <MobileBottomBar activeView={activeView} onNavigate={setActiveView} />
          )}

          {/* Save Status Bar — persistent bottom indicator */}
          <SaveStatusBar />
        </>
      )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNavigate={(view) => { setActiveView(view); setCmdPaletteOpen(false) }}
      />
      {/* UX Preferences Toggle */}
      <UXPreferencesToggle />
      {/* Onboarding Tour */}
      {showTour && (
        <OnboardingTour onComplete={(view) => {
          setShowTour(false)
          if (view) setActiveView(view)
        }} />
      )}
      {/* ⌘K hint — hide on mobile */}
      {activeView !== 'setup' && !cmdPaletteOpen && (
        <button
          onClick={() => setCmdPaletteOpen(true)}
          className="hide-mobile"
          aria-label="Open command palette (Command+K)"
          style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-muted)', opacity: 0.5, transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
        >
          ⌘K to search
        </button>
      )}
    </div>
    </NavigationProvider>
  )
}

function AuthGate() {
  const { isLoggedIn, isLoading, isOfflineMode } = useAuth()
  
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0e1a', color: '#fbbf24', fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
          <div style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Loading Fortuna Engine...</div>
        </div>
      </div>
    )
  }
  
  if (!isLoggedIn && !isOfflineMode) {
    return <AuthScreen />
  }
  
  return (
    <FortunaProvider>
      <AppInner />
    </FortunaProvider>
  )
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
