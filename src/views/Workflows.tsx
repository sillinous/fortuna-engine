import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateTaxReport, calculateSCorpSavings, calculateMaxSEPIRA, calculateMaxSolo401k } from '../engine/tax-calculator'
import { getQuarterContext, generateProactiveAlerts } from '../engine/proactive-intelligence'
import { detectStrategies } from '../engine/strategy-detector'
import {
  Compass, ArrowRight, ChevronRight, Zap, Building2, Shield, Calendar,
  TrendingUp, DollarSign, PiggyBank, CheckCircle, Circle, Lock
} from 'lucide-react'
import type { ViewKey } from '../App'

interface Workflow {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ReactNode
  color: string
  estimatedTime: string
  steps: WorkflowStep[]
  isAvailable: boolean
  unavailableReason?: string
}

interface WorkflowStep {
  id: string
  title: string
  description: string
  action?: string
  navigateTo?: ViewKey | 'workflows'
  insight?: string
  isComplete?: boolean
}

export function Workflows({ onNavigate }: { onNavigate?: (view: ViewKey) => void }) {
  const { state, taxReport, strategies, healthScore } = useFortuna()
  const [activeWorkflow, setActiveWorkflow] = useState<string | null>(null)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  
  const ctx = getQuarterContext()
  const alerts = useMemo(() => generateProactiveAlerts(state), [state])
  
  const { profile, incomeStreams, expenses, deductions, entities } = state
  const totalIncome = incomeStreams.filter(s => s.isActive).reduce((sum, s) => sum + s.annualAmount, 0)
  const selfEmploymentIncome = incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0)
  const totalExpenses = expenses.filter(e => e.isDeductible).reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)
  const netSEIncome = selfEmploymentIncome - totalExpenses
  const hasScorp = entities.some(e => (e.type === 'llc_scorp' || e.type === 'scorp') && e.isActive)
  
  const workflows: Workflow[] = useMemo(() => [
    {
      id: 'optimize-quarter',
      title: `Optimize Q${ctx.quarter}`,
      subtitle: `${ctx.daysLeftInQuarter} days remaining`,
      description: `Make the most of Q${ctx.quarter} with targeted strategies for the next ${ctx.daysLeftInQuarter} days.`,
      icon: <Calendar size={22} />,
      color: '#f59e0b',
      estimatedTime: '10 min',
      isAvailable: true,
      steps: [
        {
          id: 'oq-1', title: 'Review Current Tax Position',
          description: `Your effective tax rate is ${taxReport.effectiveRate.toFixed(1)}% on $${Math.round(taxReport.taxableIncome).toLocaleString()} taxable income.`,
          navigateTo: 'tax',
          insight: `${strategies.length} optimization strategies identified`,
        },
        {
          id: 'oq-2', title: 'Check Estimated Tax Payments',
          description: `Quarterly estimated payment should be ~$${Math.round(taxReport.totalFederalTax / 4).toLocaleString()}. Ensure you're on track to avoid underpayment penalties.`,
          navigateTo: 'cashflow',
        },
        {
          id: 'oq-3', title: 'Review Deduction Opportunities',
          description: 'Check for missing deductions and pre-pay deductible expenses before quarter-end.',
          navigateTo: 'setup',
          insight: deductions.length < 3 ? 'You may have unclaimed deductions' : undefined,
        },
        {
          id: 'oq-4', title: 'Check Retirement Contributions',
          description: netSEIncome > 30000 ? `You could contribute up to $${Math.round(calculateMaxSolo401k(netSEIncome, profile.age).total).toLocaleString()} to a Solo 401(k).` : 'Review retirement savings strategy.',
          navigateTo: 'tax',
        },
        {
          id: 'oq-5', title: 'Generate 1040-ES Voucher',
          description: 'Create your estimated tax payment worksheet for the current quarter.',
          navigateTo: 'documents' as any,
        },
      ],
    },
    {
      id: 'entity-evaluation',
      title: 'Should I Form an LLC?',
      subtitle: hasScorp ? 'You already have an entity' : 'Entity analysis',
      description: 'Walk through the decision framework for whether an LLC (with optional S-Corp election) makes sense for your situation.',
      icon: <Building2 size={22} />,
      color: '#3b82f6',
      estimatedTime: '8 min',
      isAvailable: selfEmploymentIncome > 0,
      unavailableReason: 'Requires self-employment income',
      steps: [
        {
          id: 'ee-1', title: 'Assess Self-Employment Income',
          description: `Your net self-employment income is $${Math.round(netSEIncome).toLocaleString()}/year. ${netSEIncome > 50000 ? 'This is above the threshold where entity structuring typically saves money.' : 'Entity savings typically become meaningful above $50,000.'}`,
          insight: netSEIncome > 50000 ? 'Strong candidate for entity structuring' : 'May not yet justify entity complexity',
        },
        {
          id: 'ee-2', title: 'Compare Entity Types',
          description: 'View side-by-side comparison of sole proprietorship, LLC, and S-Corp tax treatment.',
          navigateTo: 'entity',
        },
        {
          id: 'ee-3', title: 'Calculate S-Corp Savings',
          description: (() => {
            if (netSEIncome > 50000) {
              const salary = Math.round(Math.max(netSEIncome * 0.5, Math.min(netSEIncome * 0.7, 80000)))
              const savings = calculateSCorpSavings(netSEIncome, salary)
              return `S-Corp could save ~$${savings.savings.toLocaleString()}/yr by splitting income between salary ($${salary.toLocaleString()}) and distributions.`
            }
            return 'S-Corp savings analysis requires higher income levels.'
          })(),
          navigateTo: 'entity',
        },
        {
          id: 'ee-4', title: 'Review Compliance Requirements',
          description: 'Understand ongoing costs: payroll ($50-200/mo), annual state filings, tax return preparation, and corporate formalities.',
        },
        {
          id: 'ee-5', title: 'Generate Formation Checklist',
          description: `Get a step-by-step formation guide for ${profile.state}.`,
          navigateTo: 'documents' as any,
        },
        {
          id: 'ee-6', title: 'Model the Scenario',
          description: 'Create side-by-side scenario comparison of your current structure vs. new entity.',
          navigateTo: 'scenarios',
        },
      ],
    },
    {
      id: 'audit-prep',
      title: 'Prepare for Audit',
      subtitle: 'Audit readiness assessment',
      description: 'Ensure you have complete documentation and understand your risk profile.',
      icon: <Shield size={22} />,
      color: '#ef4444',
      estimatedTime: '12 min',
      isAvailable: state.onboardingComplete,
      steps: [
        {
          id: 'ap-1', title: 'Check Your Audit Risk Score',
          description: 'Review your IRS DIF score simulation and identify which items draw the most attention.',
          navigateTo: 'audit',
        },
        {
          id: 'ap-2', title: 'Review Deduction-to-Income Ratios',
          description: 'High deduction ratios in specific categories trigger IRS scrutiny. Check if any of yours are above threshold.',
          navigateTo: 'audit',
        },
        {
          id: 'ap-3', title: 'Generate Audit Preparedness Checklist',
          description: 'Get a personalized list of every document you should have organized and accessible.',
          navigateTo: 'documents' as any,
        },
        {
          id: 'ap-4', title: 'Review Risk Matrix',
          description: 'Understand your overall risk profile and mitigation strategies.',
          navigateTo: 'risk',
        },
        {
          id: 'ap-5', title: 'Generate CPA Package',
          description: 'Create a comprehensive handoff document for your tax professional.',
          navigateTo: 'documents' as any,
        },
      ],
    },
    {
      id: 'maximize-retirement',
      title: 'Maximize Retirement Savings',
      subtitle: 'Tax-advantaged contributions',
      description: 'Optimize retirement contributions across all available accounts to minimize current taxes and build wealth.',
      icon: <PiggyBank size={22} />,
      color: '#10b981',
      estimatedTime: '7 min',
      isAvailable: totalIncome > 20000,
      unavailableReason: 'Requires income data',
      steps: [
        {
          id: 'mr-1', title: 'Calculate Maximum Contribution Limits',
          description: (() => {
            if (netSEIncome > 0) {
              const sep = calculateMaxSEPIRA(netSEIncome)
              const solo = calculateMaxSolo401k(netSEIncome, profile.age)
              return `SEP-IRA max: $${Math.round(sep).toLocaleString()} | Solo 401(k) max: $${Math.round(solo.total).toLocaleString()} (employee: $${Math.round(solo.employeeDeferral || 0).toLocaleString()} + employer: $${Math.round(solo.employerContribution || 0).toLocaleString()})`
            }
            return 'Roth IRA: $7,000 ($8,000 if 50+) | Traditional IRA: $7,000 ($8,000 if 50+)'
          })(),
        },
        {
          id: 'mr-2', title: 'Choose the Best Account Type',
          description: netSEIncome > 50000 ? 'Solo 401(k) offers the highest contribution limits for self-employed individuals. Consider this over SEP-IRA.' : 'Compare Roth vs Traditional IRA based on your current and expected future tax rates.',
          navigateTo: 'tax',
        },
        {
          id: 'mr-3', title: 'Calculate Tax Savings',
          description: (() => {
            if (netSEIncome > 30000) {
              const maxContrib = calculateMaxSolo401k(netSEIncome, profile.age).total
              const currentRetirement = deductions.filter(d => d.category === 'retirement').reduce((s, d) => s + d.amount, 0)
              const gap = maxContrib - currentRetirement
              const savings = gap * (taxReport.effectiveRate / 100)
              return gap > 0
                ? `Maximizing contributions could save ~$${Math.round(savings).toLocaleString()} in taxes this year.`
                : 'You\'re maximizing your retirement contributions — great work!'
            }
            return 'Review potential tax savings from retirement contributions.'
          })(),
        },
        {
          id: 'mr-4', title: 'Check Contribution Deadlines',
          description: 'Employee 401(k) deferrals: Dec 31 | Employer contributions: Tax filing deadline | IRA: April 15',
          navigateTo: 'calendar' as any,
        },
        {
          id: 'mr-5', title: 'Update Deductions',
          description: 'Add or update retirement contribution amounts in your profile.',
          navigateTo: 'setup',
        },
      ],
    },
    {
      id: 'grow-revenue',
      title: 'Scale Revenue',
      subtitle: 'Revenue optimization',
      description: 'Analyze income diversification opportunities and optimize your revenue engine.',
      icon: <TrendingUp size={22} />,
      color: '#8b5cf6',
      estimatedTime: '8 min',
      isAvailable: state.onboardingComplete,
      steps: [
        {
          id: 'gr-1', title: 'Assess Current Income Mix',
          description: `You have ${incomeStreams.filter(s => s.isActive).length} active income stream(s) totaling $${totalIncome.toLocaleString()}/yr.`,
          navigateTo: 'revenue',
          insight: incomeStreams.filter(s => s.isActive).length <= 1 ? 'Single income stream — consider diversification' : undefined,
        },
        {
          id: 'gr-2', title: 'Review Entity Flow',
          description: 'Visualize how money flows through your entity structure and identify optimization points.',
          navigateTo: 'flow',
        },
        {
          id: 'gr-3', title: 'Model Growth Scenarios',
          description: 'Use the scenario modeler to project income growth and understand tax implications.',
          navigateTo: 'scenarios',
        },
        {
          id: 'gr-4', title: 'Review Revenue Strategies',
          description: 'Explore revenue engine recommendations for your business profile.',
          navigateTo: 'revenue',
        },
        {
          id: 'gr-5', title: 'Check Cash Flow Projections',
          description: 'Ensure revenue growth plans align with cash flow needs.',
          navigateTo: 'cashflow',
        },
      ],
    },
  ], [state, ctx, taxReport, strategies, netSEIncome, selfEmploymentIncome, totalIncome, profile, deductions, entities, hasScorp, incomeStreams])
  
  const activeWf = workflows.find(w => w.id === activeWorkflow)
  
  const toggleStep = (stepId: string) => {
    setCompletedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) next.delete(stepId)
      else next.add(stepId)
      return next
    })
  }
  
  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Compass size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            Guided Workflows
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Mission-oriented paths to specific financial outcomes
        </p>
      </div>
      
      {!activeWorkflow ? (
        /* Workflow Selection */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {workflows.map(wf => (
            <button
              key={wf.id}
              onClick={() => wf.isAvailable && setActiveWorkflow(wf.id)}
              disabled={!wf.isAvailable}
              style={{
                textAlign: 'left', padding: 24, borderRadius: 16,
                border: `1px solid ${wf.isAvailable ? 'var(--border-subtle)' : 'var(--border-subtle)'}`,
                background: wf.isAvailable ? 'var(--bg-elevated)' : 'var(--bg-primary)',
                cursor: wf.isAvailable ? 'pointer' : 'not-allowed',
                opacity: wf.isAvailable ? 1 : 0.5,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                if (wf.isAvailable) {
                  e.currentTarget.style.borderColor = wf.color
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${wf.color}15`, color: wf.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {wf.isAvailable ? wf.icon : <Lock size={22} />}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  ~{wf.estimatedTime}
                </div>
              </div>
              
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {wf.title}
              </div>
              <div style={{ fontSize: 12, color: wf.color, fontWeight: 500, marginBottom: 8 }}>
                {wf.subtitle}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
                {wf.isAvailable ? wf.description : wf.unavailableReason}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: wf.color, fontWeight: 600 }}>
                {wf.isAvailable ? (
                  <>Start Workflow <ArrowRight size={14} /></>
                ) : (
                  <>Locked</>
                )}
              </div>
              
              {/* Step count indicator */}
              <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                {wf.steps.map((_, i) => (
                  <div key={i} style={{
                    height: 3, flex: 1, borderRadius: 2,
                    background: `${wf.color}${wf.isAvailable ? '30' : '10'}`,
                  }} />
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : activeWf ? (
        /* Active Workflow */
        <div>
          <button
            onClick={() => { setActiveWorkflow(null); setCompletedSteps(new Set()) }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 13, padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ← Back to workflows
          </button>
          
          {/* Workflow header */}
          <div style={{
            padding: 24, background: 'var(--bg-elevated)', borderRadius: 16, marginBottom: 24,
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: `${activeWf.color}15`, color: activeWf.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {activeWf.icon}
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{activeWf.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {completedSteps.size}/{activeWf.steps.length} steps completed
                </div>
              </div>
            </div>
            
            {/* Progress bar */}
            <div style={{ marginTop: 16, height: 6, background: 'var(--bg-primary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${(completedSteps.size / activeWf.steps.length) * 100}%`,
                background: activeWf.color, borderRadius: 3, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
          
          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeWf.steps.map((step, i) => {
              const isComplete = completedSteps.has(step.id)
              return (
                <div key={step.id} style={{
                  padding: 20, borderRadius: 14,
                  background: isComplete ? `${activeWf.color}08` : 'var(--bg-elevated)',
                  border: `1px solid ${isComplete ? `${activeWf.color}30` : 'var(--border-subtle)'}`,
                  transition: 'all 0.3s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Step number / check */}
                    <button
                      onClick={() => toggleStep(step.id)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                        background: isComplete ? activeWf.color : 'var(--bg-primary)',
                        color: isComplete ? '#fff' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        fontSize: 12, fontWeight: 700,
                        border: isComplete ? 'none' : '2px solid var(--border-subtle)',
                      }}
                    >
                      {isComplete ? <CheckCircle size={16} /> : i + 1}
                    </button>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                        textDecoration: isComplete ? 'line-through' : 'none',
                        opacity: isComplete ? 0.6 : 1,
                      }}>
                        {step.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                        {step.description}
                      </div>
                      
                      {step.insight && (
                        <div style={{
                          marginTop: 8, padding: '6px 12px', borderRadius: 6,
                          background: `${activeWf.color}10`, fontSize: 11, color: activeWf.color, fontWeight: 500,
                          display: 'inline-block',
                        }}>
                          💡 {step.insight}
                        </div>
                      )}
                    </div>
                    
                    {/* Navigate button */}
                    {step.navigateTo && onNavigate && (
                      <button
                        onClick={() => onNavigate(step.navigateTo as ViewKey)}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer',
                          fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        Go <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* Completion state */}
          {completedSteps.size === activeWf.steps.length && (
            <div style={{
              marginTop: 24, padding: 24, textAlign: 'center',
              background: `${activeWf.color}10`, borderRadius: 16,
              border: `1px solid ${activeWf.color}30`,
            }}>
              <CheckCircle size={40} style={{ color: activeWf.color, marginBottom: 12 }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                Workflow Complete! 🎉
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                You've completed all steps in "{activeWf.title}"
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
