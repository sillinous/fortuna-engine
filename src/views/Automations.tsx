import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateTimeline } from '../engine/execution-timeline'
import {
  Zap, Clock, CheckCircle2, Play, Pause,
  Bot, DollarSign, Calendar, FileText, Shield,
  AlertTriangle, Settings, RefreshCw, ArrowRight
} from 'lucide-react'

interface AutomationItem {
  id: string
  name: string
  description: string
  category: string
  status: 'active' | 'paused' | 'available'
  frequency: string
  impact: string
  icon: React.ReactNode
  automatable: boolean
  steps: string[]
}

export function Automations() {
  const { state, strategies, taxReport } = useFortuna()
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set())
  const hasData = state.incomeStreams.length > 0

  const timeline = useMemo(() => generateTimeline(state), [state])

  // Build automation items from real strategies and timeline
  const automations: AutomationItem[] = useMemo(() => {
    const items: AutomationItem[] = []

    // Quarterly tax payments
    if (taxReport.totalTax > 1000) {
      const quarterly = Math.round(taxReport.totalTax / 4)
      items.push({
        id: 'auto-estimated-tax',
        name: 'Quarterly Estimated Tax',
        description: `Auto-calculate and remind for quarterly payments of ~$${quarterly.toLocaleString()} via IRS Direct Pay.`,
        category: 'Compliance',
        status: 'available',
        frequency: 'Quarterly',
        impact: `$${quarterly.toLocaleString()} per quarter`,
        icon: <Calendar size={18} />,
        automatable: true,
        steps: ['Calculate quarterly amount from projected annual tax', 'Set reminders 7 days before each deadline', 'Generate Form 1040-ES worksheet', 'Track payments against projected liability'],
      })
    }

    // Mileage tracking
    const vehicleStrat = strategies.find(s => s.id === 'vehicle-deduction')
    if (vehicleStrat) {
      items.push({
        id: 'auto-mileage',
        name: 'Business Mileage Tracker',
        description: `Track business miles automatically. At $0.67/mile (2024 rate), this could save ${vehicleStrat.impactLabel}.`,
        category: 'Deductions',
        status: 'available',
        frequency: 'Continuous',
        impact: vehicleStrat.impactLabel,
        icon: <DollarSign size={18} />,
        automatable: true,
        steps: ['Log trip start/end automatically', 'Categorize business vs personal', 'Calculate deduction at IRS standard rate', 'Generate year-end mileage report'],
      })
    }

    // Expense categorization
    if (state.expenses.length > 0 || state.incomeStreams.some(s => s.type === 'business')) {
      items.push({
        id: 'auto-expense-cat',
        name: 'AI Expense Categorizer',
        description: 'Automatically categorize business expenses and flag deductible items using AI classification.',
        category: 'Bookkeeping',
        status: 'available',
        frequency: 'Continuous',
        impact: 'Time savings + missed deductions',
        icon: <Bot size={18} />,
        automatable: true,
        steps: ['Connect bank feed or import transactions', 'AI classifies each transaction', 'Flag unusual or non-deductible items', 'Generate categorized expense reports'],
      })
    }

    // Tax document collection
    items.push({
      id: 'auto-doc-collect',
      name: 'Tax Document Collector',
      description: 'Track and collect all tax documents (1099s, W-2s, receipts) as they arrive. Alert on missing documents.',
      category: 'Compliance',
      status: 'available',
      frequency: 'Jan-Mar annually',
      impact: 'Prevent late filing',
      icon: <FileText size={18} />,
      automatable: true,
      steps: ['Create document checklist from income streams', 'Track received vs expected documents', 'Send reminders for missing items', 'Organize for tax preparer'],
    })

    // Retirement contribution optimizer
    const retirementStrat = strategies.find(s => s.id === 'retirement-max')
    if (retirementStrat) {
      items.push({
        id: 'auto-retirement',
        name: 'Retirement Contribution Optimizer',
        description: `Monitor income and auto-calculate optimal retirement contributions. Gap: ${retirementStrat.impactLabel}.`,
        category: 'Retirement',
        status: 'available',
        frequency: 'Monthly',
        impact: retirementStrat.impactLabel,
        icon: <Shield size={18} />,
        automatable: true,
        steps: ['Track YTD income against projections', 'Calculate optimal contribution schedule', 'Alert before contribution deadlines', 'Model tax impact of contributions'],
      })
    }

    // Entity compliance
    if (state.entities.some(e => e.isActive)) {
      items.push({
        id: 'auto-entity-compliance',
        name: 'Entity Compliance Monitor',
        description: 'Track annual report filings, registered agent renewals, and entity maintenance requirements.',
        category: 'Legal',
        status: 'available',
        frequency: 'Annually',
        impact: 'Prevent dissolution',
        icon: <Shield size={18} />,
        automatable: true,
        steps: ['Track state filing deadlines', 'Remind before annual report due dates', 'Monitor registered agent renewal', 'Verify good standing status'],
      })
    }

    // Deadline monitor from timeline
    if (timeline.length > 0) {
      const urgentCount = timeline.filter(a => a.status === 'urgent' || a.status === 'overdue').length
      items.push({
        id: 'auto-deadline-monitor',
        name: 'Deadline Intelligence',
        description: `Real-time monitoring of ${timeline.length} financial deadlines. ${urgentCount > 0 ? `${urgentCount} need immediate attention.` : 'All deadlines on track.'}`,
        category: 'Monitoring',
        status: 'active',
        frequency: 'Continuous',
        impact: `${timeline.length} deadlines tracked`,
        icon: <Clock size={18} />,
        automatable: true,
        steps: ['Monitor all tax and compliance deadlines', 'Send escalating alerts as deadlines approach', 'Track completion status', 'Auto-reschedule based on extensions'],
      })
    }

    return items
  }, [state, strategies, taxReport, timeline])

  const activeCount = automations.filter(a => toggledIds.has(a.id) || a.status === 'active').length
  const totalImpactStrategies = strategies.filter(s => s.automatable).reduce((s, st) => s + st.estimatedImpact, 0)

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Zap size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Automations</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add financial data to unlock automation opportunities.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title">Automations</h1>
          <span className="pill gold"><Zap size={11} /> Autonomous</span>
        </div>
        <p className="section-subtitle">Engine-detected automation opportunities — reduce manual work and capture missed savings</p>
      </div>

      {/* Metrics */}
      <div className="grid-4 stagger" style={{ marginBottom: 24 }}>
        <div className="metric-card">
          <span className="metric-label">Available</span>
          <div className="metric-value" style={{ color: 'var(--accent-gold)' }}>{automations.length}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Automations detected</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Active</span>
          <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>{activeCount}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Currently running</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Automatable Savings</span>
          <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>${totalImpactStrategies.toLocaleString()}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>From automatable strategies</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Deadlines Tracked</span>
          <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{timeline.length}</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Via Execution Timeline</span>
        </div>
      </div>

      {/* Automation Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {automations.map(auto => (
          <AutoCard key={auto.id} auto={auto} isActive={toggledIds.has(auto.id) || auto.status === 'active'}
            onToggle={() => {
              setToggledIds(prev => {
                const next = new Set(prev)
                if (next.has(auto.id)) next.delete(auto.id)
                else next.add(auto.id)
                return next
              })
            }}
          />
        ))}
      </div>
    </div>
  )
}

function AutoCard({ auto, isActive, onToggle }: { auto: AutomationItem; isActive: boolean; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card" style={{
      borderColor: isActive ? 'rgba(52,211,153,0.2)' : 'var(--border-subtle)',
    }}>
      <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: isActive ? 'var(--accent-emerald-dim)' : 'var(--bg-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
          flexShrink: 0,
        }}>{auto.icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{auto.name}</span>
            <span className="pill" style={{ fontSize: 10, background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>{auto.category}</span>
            <span className="pill" style={{ fontSize: 10, background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
              <Clock size={9} /> {auto.frequency}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{auto.description}</div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--accent-emerald)', marginBottom: 4 }}>{auto.impact}</div>
        </div>

        <button onClick={onToggle} style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: isActive ? 'var(--accent-emerald)' : 'var(--border-medium)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
          flexShrink: 0,
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: 9, background: '#fff',
            position: 'absolute', top: 3,
            left: isActive ? 23 : 3,
            transition: 'left 0.2s',
          }} />
        </button>

        <button onClick={() => setExpanded(!expanded)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <ArrowRight size={14} style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : '' }} />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 22px 18px 80px', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Automation Steps</div>
          {auto.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                background: isActive ? 'var(--accent-emerald-dim)' : 'var(--bg-surface)',
                border: `1px solid ${isActive ? 'rgba(52,211,153,0.2)' : 'var(--border-subtle)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
              }}>{isActive ? <CheckCircle2 size={10} /> : i + 1}</div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
