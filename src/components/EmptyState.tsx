/**
 * FORTUNA ENGINE — Empty State Component
 * Displays a friendly, actionable empty state when a view has no data.
 * Every view should use this instead of showing blank screens.
 */

import { type ReactNode } from 'react'
import type { ViewKey } from '../App'
import {
  LayoutDashboard, Receipt, Building2, TrendingUp, Shield, ShieldAlert,
  Zap, Bot, BarChart3, Calendar, FileText, Wallet, Bell, Upload,
  Compass, Activity, Scale, Briefcase, Database, History, PiggyBank,
  MapPin, CalendarRange, Package, Award, Brain, CreditCard, Layers,
  Target, ClipboardCheck, Users, Search, FileSpreadsheet, ArrowRight,
  Plus, Sparkles,
} from 'lucide-react'

// ─── Empty State Configs per View ───────────────────────────────────

interface EmptyConfig {
  icon: ReactNode
  iconBg: string
  title: string
  description: string
  ctaLabel: string
  ctaView?: ViewKey
  ctaAction?: string
}

const EMPTY_CONFIGS: Partial<Record<ViewKey, EmptyConfig>> = {
  dashboard: {
    icon: <LayoutDashboard size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Welcome to Fortuna',
    description: 'Let\'s set up your financial profile to unlock personalized tax strategies, savings estimates, and intelligent recommendations.',
    ctaLabel: 'Get Started',
    ctaView: 'setup',
  },
  tax: {
    icon: <Receipt size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'No tax data yet',
    description: 'Add your income and deduction details to see your tax strategy, projected liability, and savings opportunities.',
    ctaLabel: 'Enter Tax Info',
    ctaView: 'setup',
  },
  entity: {
    icon: <Building2 size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Design your entity structure',
    description: 'Compare sole proprietorship, LLC, S-Corp, and C-Corp to find the structure that minimizes your tax burden.',
    ctaLabel: 'Start Comparison',
    ctaView: 'setup',
  },
  revenue: {
    icon: <TrendingUp size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Track your revenue streams',
    description: 'Add your income sources to see revenue analysis, projections, and diversification recommendations.',
    ctaLabel: 'Add Income',
    ctaView: 'setup',
  },
  risk: {
    icon: <Shield size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-amber), #d97706)',
    title: 'Risk assessment needs data',
    description: 'Complete your financial profile to receive a comprehensive risk matrix covering tax, entity, compliance, and cash flow risks.',
    ctaLabel: 'Complete Profile',
    ctaView: 'setup',
  },
  audit: {
    icon: <ShieldAlert size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-red), #dc2626)',
    title: 'Audit risk profiler',
    description: 'Enter your tax data to get an audit risk score, red flag detection, and documentation gap analysis.',
    ctaLabel: 'Enter Tax Data',
    ctaView: 'setup',
  },
  scenarios: {
    icon: <BarChart3 size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'Model different scenarios',
    description: 'Run what-if simulations to see how decisions like selling crypto, changing entity type, or relocating affect your taxes.',
    ctaLabel: 'Create Scenario',
    ctaAction: 'create',
  },
  cashflow: {
    icon: <Wallet size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Cash flow analysis',
    description: 'Add your income and expense data to see monthly cash flow trends, projections, and reserve recommendations.',
    ctaLabel: 'Add Financial Data',
    ctaView: 'setup',
  },
  alerts: {
    icon: <Bell size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'No alerts right now',
    description: 'When Fortuna detects tax deadlines, savings opportunities, or risk changes, they\'ll appear here.',
    ctaLabel: 'View Dashboard',
    ctaView: 'dashboard',
  },
  calendar: {
    icon: <Calendar size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Tax calendar',
    description: 'Your personalized tax deadline calendar will populate once you set your filing status and entity type.',
    ctaLabel: 'Set Up Profile',
    ctaView: 'setup',
  },
  documents: {
    icon: <FileText size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'Document center',
    description: 'Upload receipts, tax forms, and business documents. Fortuna will auto-categorize and map them to Schedule C lines.',
    ctaLabel: 'Upload Document',
    ctaAction: 'upload',
  },
  import: {
    icon: <Upload size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Import your data',
    description: 'Import transactions from exchanges, banks, or CSV files. Fortuna supports Coinbase, Binance, Kraken, and 5 more.',
    ctaLabel: 'Start Import',
    ctaAction: 'import',
  },
  workflows: {
    icon: <Compass size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Strategic workflows',
    description: 'Complete your profile to unlock step-by-step workflows for entity formation, retirement optimization, and tax planning.',
    ctaLabel: 'Complete Profile',
    ctaView: 'setup',
  },
  automations: {
    icon: <Zap size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-amber), #d97706)',
    title: 'Automations',
    description: 'Set up automated alerts for tax deadlines, estimated payment reminders, and strategy triggers.',
    ctaLabel: 'Create Automation',
    ctaAction: 'create',
  },
  advisor: {
    icon: <Bot size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'AI Tax Advisor',
    description: 'Ask any tax question and get personalized guidance based on your financial profile. Try "How can I reduce my self-employment tax?"',
    ctaLabel: 'Ask a Question',
    ctaAction: 'focus',
  },
  health: {
    icon: <Activity size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Financial health score',
    description: 'Your health score measures tax efficiency, risk exposure, and optimization potential. Add your data to see your score.',
    ctaLabel: 'Get Started',
    ctaView: 'setup',
  },
  optimizer: {
    icon: <Scale size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Entity optimizer',
    description: 'Compare your current entity structure against alternatives with side-by-side tax projections.',
    ctaLabel: 'Enter Income Data',
    ctaView: 'setup',
  },
  reports: {
    icon: <FileText size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Reports',
    description: 'Generate comprehensive tax reports, strategy summaries, and CPA-ready export packages.',
    ctaLabel: 'Add Data First',
    ctaView: 'setup',
  },
  history: {
    icon: <History size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'Financial history',
    description: 'Track how your tax position evolves over time. Your historical snapshots will appear here after your first session.',
    ctaLabel: 'View Dashboard',
    ctaView: 'dashboard',
  },
  retirement: {
    icon: <PiggyBank size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Retirement optimizer',
    description: 'Compare Solo 401(k), SEP-IRA, Traditional IRA, Roth, and HSA to maximize tax-deferred savings.',
    ctaLabel: 'Enter Income',
    ctaView: 'setup',
  },
  arbitrage: {
    icon: <MapPin size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'State tax arbitrage',
    description: 'Compare your tax burden across all 50 states to find relocation savings opportunities.',
    ctaLabel: 'Set Current State',
    ctaView: 'setup',
  },
  portfolio: {
    icon: <Briefcase size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Portfolio intelligence',
    description: 'Connect your investment accounts to get tax-aware portfolio analysis, cost basis tracking, and harvest opportunities.',
    ctaLabel: 'Import Portfolio',
    ctaView: 'import',
  },
  multiyear: {
    icon: <CalendarRange size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'Multi-year projections',
    description: 'See how your tax position projects across 3-5 years with growth modeling and strategy impact analysis.',
    ctaLabel: 'Enter Base Year Data',
    ctaView: 'setup',
  },
  depreciation: {
    icon: <Package size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-amber), #d97706)',
    title: 'Depreciation tracker',
    description: 'Track business assets, calculate §179 deductions, bonus depreciation, and MACRS schedules.',
    ctaLabel: 'Add First Asset',
    ctaAction: 'create',
  },
  credits: {
    icon: <Award size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Tax credit finder',
    description: 'Discover tax credits you may be eligible for based on your income, family, education, and business activities.',
    ctaLabel: 'Check Eligibility',
    ctaView: 'setup',
  },
  nexus: {
    icon: <Brain size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Nexus insights',
    description: 'AI-powered connections between your financial data points, revealing hidden optimization opportunities.',
    ctaLabel: 'Add Data',
    ctaView: 'setup',
  },
  paycheck: {
    icon: <CreditCard size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Paycheck simulator',
    description: 'See how W-4 changes, retirement contributions, and pre-tax deductions affect your take-home pay.',
    ctaLabel: 'Enter Salary Info',
    ctaView: 'setup',
  },
  deductions: {
    icon: <Search size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Deduction finder',
    description: 'Answer a few questions about your work and life to discover deductions you might be missing.',
    ctaLabel: 'Start Discovery',
    ctaAction: 'start',
  },
  marginal: {
    icon: <Layers size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'Marginal rate analysis',
    description: 'See your effective and marginal tax rates across federal, state, and self-employment taxes.',
    ctaLabel: 'Enter Income',
    ctaView: 'setup',
  },
  goals: {
    icon: <Target size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Goal planner',
    description: 'Set financial goals and get a personalized action plan with tax-optimized milestones.',
    ctaLabel: 'Set First Goal',
    ctaAction: 'create',
  },
  taxprep: {
    icon: <ClipboardCheck size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Tax prep checklist',
    description: 'A step-by-step checklist to make sure you have everything ready before filing.',
    ctaLabel: 'Start Checklist',
    ctaAction: 'start',
  },
  taxdocs: {
    icon: <FileSpreadsheet size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Tax documents',
    description: 'Generate Schedule C, Form 8949, estimated payment vouchers, and other IRS-ready documents.',
    ctaLabel: 'Generate Documents',
    ctaView: 'setup',
  },
  cpa: {
    icon: <Briefcase size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'CPA export',
    description: 'Package your data into TXF, CSV, and Form 8949 formats ready for your tax professional.',
    ctaLabel: 'Prepare Export',
    ctaView: 'setup',
  },
  workspace: {
    icon: <Users size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)',
    title: 'Collaboration workspace',
    description: 'Invite your CPA, bookkeeper, or business partner to collaborate on your tax data securely.',
    ctaLabel: 'Create Workspace',
    ctaAction: 'create',
  },
  data: {
    icon: <Database size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-amber), #d97706)',
    title: 'Data manager',
    description: 'View, edit, and manage all your stored financial data, backups, and sync settings.',
    ctaLabel: 'View Dashboard',
    ctaView: 'dashboard',
  },
  pnl: {
    icon: <BarChart3 size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-emerald), #059669)',
    title: 'Profit & Loss statement',
    description: 'Generate a detailed P&L from your income and expense data. Perfect for loan applications and business planning.',
    ctaLabel: 'Add Revenue Data',
    ctaView: 'setup',
  },
  flow: {
    icon: <Building2 size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
    title: 'Entity flow designer',
    description: 'Visualize and design complex multi-entity structures with income flow diagrams.',
    ctaLabel: 'Create Entity',
    ctaView: 'entity',
  },
  timeline: {
    icon: <Calendar size={28} />,
    iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
    title: 'Execution timeline',
    description: 'See your recommended actions organized on a timeline with deadlines and dependencies.',
    ctaLabel: 'View Strategies',
    ctaView: 'tax',
  },
}

// ─── Default fallback ───────────────────────────────────────────────

const DEFAULT_EMPTY: EmptyConfig = {
  icon: <Sparkles size={28} />,
  iconBg: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
  title: 'Nothing here yet',
  description: 'Complete your financial profile to unlock this feature.',
  ctaLabel: 'Get Started',
  ctaView: 'setup',
}

// ─── Component ──────────────────────────────────────────────────────

interface EmptyStateProps {
  view: ViewKey
  onNavigate?: (view: ViewKey) => void
  onAction?: (action: string) => void
  hasData?: boolean
  children?: ReactNode
}

export function EmptyState({ view, onNavigate, onAction, hasData, children }: EmptyStateProps) {
  if (hasData) return <>{children}</>

  const config = EMPTY_CONFIGS[view] || DEFAULT_EMPTY

  const handleCTA = () => {
    if (config.ctaView && onNavigate) {
      onNavigate(config.ctaView)
    } else if (config.ctaAction && onAction) {
      onAction(config.ctaAction)
    }
  }

  return (
    <div className="empty-state" role="status" aria-label={`${config.title}: ${config.description}`}>
      <div className="empty-state-icon" style={{ background: config.iconBg, color: '#fff' }}>
        {config.icon}
      </div>
      <div className="empty-state-title">{config.title}</div>
      <div className="empty-state-description">{config.description}</div>
      <button
        className="empty-state-cta"
        onClick={handleCTA}
        aria-label={config.ctaLabel}
      >
        {config.ctaLabel}
        <ArrowRight size={16} />
      </button>
    </div>
  )
}
