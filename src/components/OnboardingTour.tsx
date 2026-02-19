/**
 * Fortuna Engine — Onboarding Tour
 *
 * Guided walkthrough of core features shown once after initial profile setup.
 * Each step highlights a key capability with visual preview, description,
 * and a "Try it" action that navigates directly to that feature.
 *
 * Stored in localStorage so it only appears once per user.
 */

import { useState, useCallback, useEffect } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateTaxReport } from '../engine/tax-calculator'
import { getFinancialPulse } from '../engine/proactive-intelligence'
import type { ViewKey } from '../App'
import {
  LayoutDashboard, DollarSign, Bot, FileText, GitBranch,
  Building2, PiggyBank, Users, Sparkles, ChevronRight,
  ChevronLeft, X, ArrowRight, Shield, Bell, TrendingUp,
  Briefcase, BarChart3, Calculator, Target, Zap,
  CheckCircle2, Rocket,
} from 'lucide-react'

// ─── Storage ──────────────────────────────────────────────────────────

const TOUR_KEY = 'fortuna:onboarding-complete'

export function hasCompletedTour(): boolean {
  return localStorage.getItem(TOUR_KEY) === 'true'
}

function completeTour(): void {
  localStorage.setItem(TOUR_KEY, 'true')
}

// ─── Tour Step Config ─────────────────────────────────────────────────

interface TourStep {
  id: string
  title: string
  subtitle: string
  description: string
  features: string[]
  icon: JSX.Element
  color: string
  gradient: string
  action?: { label: string; view: ViewKey }
  illustration: 'dashboard' | 'tax' | 'ai' | 'docs' | 'scenarios' | 'entity' | 'planning' | 'collab' | 'welcome' | 'finish'
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Fortuna',
    subtitle: 'Your financial command center is ready',
    description: 'Fortuna continuously analyzes your financial data to find tax savings, flag risks, and generate actionable strategies — all in real time. Here\'s a quick tour of what you can do.',
    features: [
      'Real-time tax calculations across all income sources',
      'AI-powered strategy recommendations',
      '30+ analytical modules working together',
      'Professional document generation',
    ],
    icon: <Rocket size={24} />,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    illustration: 'welcome',
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    subtitle: 'Everything at a glance',
    description: 'The Dashboard surfaces what matters most — your key financial metrics, proactive alerts, and the single most impactful action you can take right now. It updates in real time as your data changes.',
    features: [
      'KPI cards: income, taxes, effective rate, net take-home',
      'Proactive Intelligence Pulse with alerts and deadlines',
      'Health score tracking your overall financial fitness',
      'Smart strategy feed prioritized by impact',
    ],
    icon: <LayoutDashboard size={24} />,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #b8912e)',
    action: { label: 'View Dashboard', view: 'dashboard' },
    illustration: 'dashboard',
  },
  {
    id: 'tax',
    title: 'Tax Strategy',
    subtitle: 'See exactly where your money goes',
    description: 'A complete breakdown of your tax position: federal, state, self-employment, and effective rates. Fortuna identifies bracket-crossing risks, missing deductions, and optimization opportunities automatically.',
    features: [
      'Full tax calculation with bracket visualization',
      'Marginal vs. effective rate analysis',
      'Automatic deduction gap detection',
      'Year-over-year comparison tracking',
    ],
    icon: <DollarSign size={24} />,
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    action: { label: 'Explore Tax Strategy', view: 'tax' },
    illustration: 'tax',
  },
  {
    id: 'alerts',
    title: 'Intelligence Feed',
    subtitle: 'Fortuna watches your back',
    description: 'Proactive alerts surface time-sensitive deadlines, tax-saving opportunities, and risk factors before they become problems. This is what makes Fortuna different — it comes to you.',
    features: [
      'Estimated tax payment reminders with countdown',
      'Bracket-crossing projections and warnings',
      'Retirement contribution gap analysis',
      'S-Corp election opportunity detection',
      'Audit risk threshold monitoring',
    ],
    icon: <Bell size={24} />,
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    action: { label: 'View Intelligence Feed', view: 'alerts' },
    illustration: 'tax',
  },
  {
    id: 'advisor',
    title: 'AI Financial Advisor',
    subtitle: 'Ask anything about your finances',
    description: 'Chat with an AI advisor that has full context of your financial data. Ask it to analyze your situation, compare strategies, explain tax concepts, or generate specific recommendations.',
    features: [
      'Full financial context in every conversation',
      'Pre-built query categories for common questions',
      'Multi-provider support (Anthropic, OpenAI, Gemini)',
      'Conversation history for reference',
    ],
    icon: <Bot size={24} />,
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    action: { label: 'Chat with Advisor', view: 'advisor' },
    illustration: 'ai',
  },
  {
    id: 'documents',
    title: 'AI Document Center',
    subtitle: 'Turn data into deliverables',
    description: 'Generate professional financial documents powered by AI — CPA handoff letters, entity recommendation memos, year-end action plans, and more. Print, download, or share with your accountant.',
    features: [
      '6 AI-powered document templates',
      'CPA Summary Letter for accountant handoff',
      'Entity Recommendation Memo with dollar math',
      'Year-End Tax Action Plan with deadlines',
      'Tax forms: 1040-ES vouchers, checklists',
    ],
    icon: <FileText size={24} />,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    action: { label: 'Open Document Center', view: 'documents' },
    illustration: 'docs',
  },
  {
    id: 'scenarios',
    title: 'Scenario Modeler',
    subtitle: 'What-if planning made easy',
    description: 'Compare your current financial path against alternative scenarios. What if you formed an S-Corp? Moved states? Increased retirement contributions? See the exact dollar impact side by side.',
    features: [
      'Pre-built smart scenarios based on your data',
      'Custom scenario builder with unlimited variables',
      'Side-by-side delta comparison',
      'Impact visualization with break-even analysis',
    ],
    icon: <GitBranch size={24} />,
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
    action: { label: 'Try Scenarios', view: 'scenarios' },
    illustration: 'scenarios',
  },
  {
    id: 'entity',
    title: 'Entity Design',
    subtitle: 'Optimize your business structure',
    description: 'Analyze and compare entity types — sole prop, LLC, S-Corp, C-Corp — with specific dollar savings for your income level. See compliance costs, liability protection, and payroll tax optimization.',
    features: [
      'Entity comparison with your actual numbers',
      'S-Corp reasonable salary calculator',
      'Compliance cost tracking',
      'Multi-entity structuring analysis',
    ],
    icon: <Building2 size={24} />,
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    action: { label: 'Explore Entities', view: 'entity' },
    illustration: 'entity',
  },
  {
    id: 'planning',
    title: 'Planning & Tracking',
    subtitle: 'Retirement, goals, and cash flow',
    description: 'Long-term financial planning tools: retirement contribution optimization, goal tracking, cash flow projections, and multi-year tax analysis to see where you\'re headed.',
    features: [
      'Retirement optimizer (SEP-IRA, Solo 401k, Roth)',
      'Goal planner with milestone tracking',
      'Monthly cash flow projections',
      'Multi-year tax trajectory analysis',
      'Financial health score with factors',
    ],
    icon: <Target size={24} />,
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
    action: { label: 'Plan Retirement', view: 'retirement' },
    illustration: 'planning',
  },
  {
    id: 'collab',
    title: 'Workspace Collaboration',
    subtitle: 'Work together, plan together',
    description: 'Create workspaces to collaborate with business partners, financial advisors, or your CPA. Shared state, pooled AI keys, role-based access control, and real-time activity logging.',
    features: [
      'Invite team members with role-based access',
      'Owner, Admin, Member, and Viewer roles',
      'Shared financial state and AI advisor',
      'Activity log for accountability',
    ],
    icon: <Users size={24} />,
    color: '#14b8a6',
    gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    action: { label: 'Create Workspace', view: 'workspace' },
    illustration: 'collab',
  },
  {
    id: 'finish',
    title: 'You\'re All Set',
    subtitle: 'Start optimizing your finances',
    description: 'Your profile is configured and Fortuna is already analyzing your data. Check the Dashboard for your first insights, or dive into any module that interests you. You can always return to update your data from the sidebar.',
    features: [
      'Tip: Check the Intelligence Feed for immediate opportunities',
      'Tip: Ask the AI Advisor "What are my top 3 tax-saving moves?"',
      'Tip: Generate a CPA Summary Letter to share with your accountant',
      'Tip: Run scenarios to compare S-Corp vs. your current structure',
    ],
    icon: <CheckCircle2 size={24} />,
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    action: { label: 'Go to Dashboard', view: 'dashboard' },
    illustration: 'finish',
  },
]

// ─── Illustration Component ──────────────────────────────────────────

function StepIllustration({ type, color, report }: {
  type: TourStep['illustration']
  color: string
  report?: { grossIncome: number; totalTax: number; effectiveRate: number; netIncome: number }
}) {
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`

  // Simple visual previews for each step type
  const illustrations: Record<string, JSX.Element> = {
    welcome: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 64, lineHeight: 1 }}>⚡</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Tax', 'Entity', 'Alerts', 'AI', 'Docs'].map(l => (
            <div key={l} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
              background: `${color}18`, color, letterSpacing: '0.03em',
            }}>{l}</div>
          ))}
        </div>
      </div>
    ),
    dashboard: report ? (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
        {[
          { label: 'Income', value: fmt(report.grossIncome), c: '#f59e0b' },
          { label: 'Tax', value: fmt(report.totalTax), c: '#ef4444' },
          { label: 'Rate', value: `${report.effectiveRate.toFixed(1)}%`, c: '#8b5cf6' },
          { label: 'Net', value: fmt(report.netIncome), c: '#10b981' },
        ].map(kpi => (
          <div key={kpi.label} style={{
            padding: '10px 12px', borderRadius: 8,
            background: `${kpi.c}08`, border: `1px solid ${kpi.c}18`,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: kpi.c }}>{kpi.value}</div>
          </div>
        ))}
      </div>
    ) : <div />,
    tax: (
      <div style={{ width: '100%' }}>
        {[
          { label: 'Federal Income Tax', pct: 65, c: '#3b82f6' },
          { label: 'State Tax', pct: 15, c: '#8b5cf6' },
          { label: 'Self-Employment Tax', pct: 20, c: '#f59e0b' },
        ].map(bar => (
          <div key={bar.label} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
              <span>{bar.label}</span>
              <span style={{ color: bar.c, fontWeight: 600 }}>{bar.pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', width: `${bar.pct}%`, borderRadius: 3, background: bar.c, transition: 'width 0.8s ease' }} />
            </div>
          </div>
        ))}
      </div>
    ),
    ai: (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={12} style={{ color: '#8b5cf6' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 10px', borderRadius: '2px 10px 10px 10px', background: 'rgba(139,92,246,0.08)', lineHeight: 1.4 }}>
            Based on your income of $85k, forming an S-Corp would save approximately $4,200/yr in SE tax...
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {['Tax Strategy', 'Entity', 'Retirement'].map(cat => (
            <div key={cat} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{cat}</div>
          ))}
        </div>
      </div>
    ),
    docs: (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['📋 CPA Summary Letter', '🏛️ Entity Recommendation', '📅 Year-End Action Plan'].map(d => (
          <div key={d} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            borderRadius: 8, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 14 }}>{d.split(' ')[0]}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{d.split(' ').slice(1).join(' ')}</span>
            <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700 }}>AI</span>
          </div>
        ))}
      </div>
    ),
    scenarios: (
      <div style={{ width: '100%', display: 'flex', gap: 8 }}>
        {[
          { label: 'Current', tax: '$18.2k', color: 'var(--text-muted)' },
          { label: 'S-Corp', tax: '$14.0k', color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'center',
            background: s.color === '#10b981' ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${s.color === '#10b981' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.tax}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>total tax</div>
          </div>
        ))}
      </div>
    ),
    entity: (
      <div style={{ width: '100%' }}>
        {[
          { type: 'Sole Prop', tax: 'Highest SE tax', rec: false },
          { type: 'LLC + S-Corp', tax: 'Lowest total tax', rec: true },
          { type: 'C-Corp', tax: 'Double taxation risk', rec: false },
        ].map(e => (
          <div key={e.type} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
            marginBottom: 4, borderRadius: 6,
            background: e.rec ? 'rgba(16,185,129,0.08)' : 'transparent',
            border: e.rec ? '1px solid rgba(16,185,129,0.15)' : '1px solid transparent',
          }}>
            <Building2 size={12} style={{ color: e.rec ? '#10b981' : 'var(--text-muted)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, fontWeight: e.rec ? 600 : 400 }}>{e.type}</span>
            <span style={{ fontSize: 10, color: e.rec ? '#10b981' : 'var(--text-muted)' }}>{e.tax}</span>
            {e.rec && <CheckCircle2 size={12} style={{ color: '#10b981' }} />}
          </div>
        ))}
      </div>
    ),
    planning: (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { icon: <PiggyBank size={14} />, label: 'Retirement', sub: 'SEP-IRA, Solo 401(k)', c: '#ec4899' },
          { icon: <Target size={14} />, label: 'Goal Tracking', sub: 'Revenue milestones', c: '#f59e0b' },
          { icon: <BarChart3 size={14} />, label: 'Multi-Year', sub: '5-year trajectory', c: '#3b82f6' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${item.c}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.c }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
    ),
    collab: (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { role: 'Owner', desc: 'Full control', c: '#f59e0b' },
          { role: 'Admin', desc: 'Manage members', c: '#3b82f6' },
          { role: 'Member', desc: 'View & edit', c: '#10b981' },
          { role: 'Viewer', desc: 'Read-only', c: '#6b7280' },
        ].map(r => (
          <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.c }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', width: 60 }}>{r.role}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.desc}</span>
          </div>
        ))}
      </div>
    ),
    finish: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>🎯</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
          Your financial engine is running.
        </div>
      </div>
    ),
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, minHeight: 120,
    }}>
      {illustrations[type] || illustrations.welcome}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

interface OnboardingTourProps {
  onComplete: (navigateTo?: ViewKey) => void
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const { state } = useFortuna()
  const [step, setStep] = useState(0)
  const [animating, setAnimating] = useState(false)

  const report = generateTaxReport(state)
  const current = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === TOUR_STEPS.length - 1
  const progress = ((step + 1) / TOUR_STEPS.length) * 100

  const goNext = useCallback(() => {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setStep(s => Math.min(s + 1, TOUR_STEPS.length - 1))
      setAnimating(false)
    }, 150)
  }, [animating])

  const goPrev = useCallback(() => {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setStep(s => Math.max(s - 1, 0))
      setAnimating(false)
    }, 150)
  }, [animating])

  const handleFinish = useCallback((view?: ViewKey) => {
    completeTour()
    onComplete(view)
  }, [onComplete])

  const handleSkip = useCallback(() => {
    completeTour()
    onComplete('dashboard')
  }, [onComplete])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); isLast ? handleFinish(current.action?.view) : goNext() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'Escape') { e.preventDefault(); handleSkip() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, handleFinish, handleSkip, isLast, current])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--bg-elevated, #1a1d24)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        opacity: animating ? 0.6 : 1,
        transform: animating ? 'scale(0.98)' : 'scale(1)',
        transition: 'all 0.15s ease',
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: current.gradient,
            transition: 'width 0.3s ease',
            borderRadius: '0 2px 2px 0',
          }} />
        </div>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: current.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: `0 4px 16px ${current.color}40`,
            }}>
              {current.icon}
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                Step {step + 1} of {TOUR_STEPS.length}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {current.title}
              </div>
            </div>
          </div>
          <button
            onClick={handleSkip}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4,
            }}
            title="Skip tour (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Subtitle */}
        <div style={{ padding: '4px 24px 0', fontSize: 13, color: current.color, fontWeight: 500 }}>
          {current.subtitle}
        </div>

        {/* Illustration */}
        <div style={{ padding: '8px 24px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)',
            padding: '8px 16px',
          }}>
            <StepIllustration
              type={current.illustration}
              color={current.color}
              report={report}
            />
          </div>
        </div>

        {/* Description */}
        <div style={{ padding: '0 24px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '8px 0 12px' }}>
            {current.description}
          </p>

          {/* Feature bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
            {current.features.map((feat, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Zap size={10} style={{ color: current.color, marginTop: 3, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 24px 20px', gap: 12,
        }}>
          {/* Left: Back / Skip */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button
                onClick={goPrev}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
          </div>

          {/* Center: dots */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === step ? current.color : 'rgba(255,255,255,0.1)',
                  transition: 'all 0.3s ease', cursor: 'pointer',
                }}
              />
            ))}
          </div>

          {/* Right: Next / Try it / Finish */}
          <div style={{ display: 'flex', gap: 8 }}>
            {current.action && !isLast && (
              <button
                onClick={() => handleFinish(current.action!.view)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${current.color}30`,
                  color: current.color, cursor: 'pointer',
                }}
              >
                {current.action.label} <ArrowRight size={12} />
              </button>
            )}
            <button
              onClick={isLast ? () => handleFinish(current.action?.view) : goNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: current.gradient, border: 'none',
                color: '#fff', cursor: 'pointer',
                boxShadow: `0 4px 12px ${current.color}30`,
              }}
            >
              {isLast ? 'Get Started' : 'Next'} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
