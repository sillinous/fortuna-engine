import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { calculateGoalPlan, getPresetGoals, GOAL_LABELS, type FinancialGoal, type GoalType } from '../engine/goal-planner'
import {
  Target, DollarSign, TrendingUp, Calendar, Plus, X,
  CheckCircle2, AlertTriangle, ArrowRight, Zap, PiggyBank
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }
function fmtK(n: number): string { return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}` }

const GOAL_ICONS: Record<GoalType, string> = {
  after_tax_income: '💰', savings_target: '🏦', retirement_balance: '🏖️',
  tax_bill_limit: '🛡️', monthly_net: '📅',
}

export function GoalPlanner() {
  const { state, updateState } = useFortuna()
  const hasData = state.incomeStreams.length > 0
  const presets = useMemo(() => getPresetGoals(state), [state])

  // Load from persisted goals
  const initialGoals: FinancialGoal[] = (state.goals || []).map(sg => ({
    id: sg.id,
    type: (sg.type === 'tax_reduction' ? 'tax_bill_limit' : sg.type === 'savings' ? 'savings_target' : sg.type === 'retirement' ? 'retirement_balance' : sg.type === 'income_growth' ? 'after_tax_income' : 'after_tax_income') as GoalType,
    name: sg.title,
    targetAmount: sg.targetAmount || 0,
    deadlineMonths: sg.targetDate ? Math.max(1, Math.round((new Date(sg.targetDate).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000))) : 12,
    priority: sg.priority === 'low' ? 'medium' as const : sg.priority as 'critical' | 'high' | 'medium',
  }))
  const [activeGoals, _setActiveGoals] = useState<FinancialGoal[]>(initialGoals)

  const setActiveGoals = (goals: FinancialGoal[]) => {
    _setActiveGoals(goals)
    // Persist back to storage format
    updateState(s => ({
      ...s,
      goals: goals.map(g => ({
        id: g.id,
        title: g.name,
        type: (g.type === 'tax_bill_limit' ? 'tax_reduction' : g.type === 'savings_target' ? 'savings' : g.type === 'retirement_balance' ? 'retirement' : g.type === 'after_tax_income' ? 'income_growth' : 'other') as any,
        targetAmount: g.targetAmount,
        currentAmount: 0,
        targetDate: g.deadlineMonths ? new Date(Date.now() + g.deadlineMonths * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : undefined,
        priority: g.priority === 'critical' ? 'high' as const : g.priority as 'high' | 'medium' | 'low',
        status: 'active' as const,
        entityId: 'personal', memberId: 'primary', taxYear: new Date().getFullYear(), tags: [],
      })),
    }))
  }
  const [showCustom, setShowCustom] = useState(false)
  const [customType, setCustomType] = useState<GoalType>('after_tax_income')
  const [customName, setCustomName] = useState('')
  const [customAmount, setCustomAmount] = useState(100000)
  const [customMonths, setCustomMonths] = useState(12)

  const plans = useMemo(() => activeGoals.map(g => calculateGoalPlan(g, state)), [activeGoals, state])

  const addGoal = (goal: FinancialGoal) => {
    if (!activeGoals.find(g => g.id === goal.id)) {
      setActiveGoals([...activeGoals, goal])
    }
  }

  const removeGoal = (id: string) => setActiveGoals(activeGoals.filter(g => g.id !== id))

  const addCustomGoal = () => {
    const goal: FinancialGoal = {
      id: `custom-${Date.now()}`, type: customType,
      name: customName || GOAL_LABELS[customType],
      targetAmount: customAmount, deadlineMonths: customMonths, priority: 'high',
    }
    addGoal(goal)
    setShowCustom(false)
    setCustomName('')
  }

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Target size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Goal Planner</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add income data to plan backward from your financial goals.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title">Goal-Based Planner</h1>
        <p className="section-subtitle">Work backward from your targets — the engine calculates what's needed to get there</p>
      </div>

      {/* Quick Presets */}
      {activeGoals.length === 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><span className="card-title">Quick Goals</span></div>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {presets.slice(0, 8).map(preset => (
              <div key={preset.id}
                style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                  cursor: 'pointer', transition: 'border-color 0.2s' }}
                onClick={() => addGoal(preset)}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-gold-glow)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{GOAL_ICONS[preset.type]}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{preset.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', marginTop: 2 }}>
                  {preset.type === 'monthly_net' ? `${fmt(preset.targetAmount)}/mo` : fmt(preset.targetAmount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={() => setShowCustom(!showCustom)} style={{ fontSize: 12 }}>
          <Plus size={14} /> Custom Goal
        </button>
        {activeGoals.length > 0 && presets.filter(p => !activeGoals.find(g => g.id === p.id)).length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {presets.filter(p => !activeGoals.find(g => g.id === p.id)).slice(0, 4).map(p => (
              <button key={p.id} className="btn btn-ghost" onClick={() => addGoal(p)} style={{ fontSize: 11, padding: '4px 10px' }}>
                + {p.name.substring(0, 20)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom Goal Builder */}
      {showCustom && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Goal Type</label>
              <select value={customType} onChange={e => setCustomType(e.target.value as GoalType)}
                className="input" style={{ fontSize: 12, padding: '8px 10px' }}>
                {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Name (optional)</label>
              <input className="input" value={customName} onChange={e => setCustomName(e.target.value)}
                placeholder={GOAL_LABELS[customType]} style={{ fontSize: 12, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Target Amount ($)</label>
              <input className="input" type="number" value={customAmount} onChange={e => setCustomAmount(Number(e.target.value))}
                style={{ fontSize: 12, padding: '8px 10px' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Timeline (months)</label>
              <input className="input" type="number" value={customMonths} onChange={e => setCustomMonths(Number(e.target.value))}
                style={{ fontSize: 12, padding: '8px 10px' }} />
            </div>
            <button className="btn btn-primary" onClick={addCustomGoal} style={{ fontSize: 12, padding: '8px 16px' }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}

      {/* Goal Plans */}
      {plans.map((plan, i) => (
        <div key={plan.goal.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{GOAL_ICONS[plan.goal.type]}</span>
              <div>
                <span className="card-title">{plan.goal.name}</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Target: {plan.goal.type === 'monthly_net' ? `${fmt(plan.goal.targetAmount)}/mo` : fmt(plan.goal.targetAmount)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`badge ${plan.onTrack ? 'emerald' : plan.progressPercent > 50 ? 'amber' : 'red'}`}>
                {plan.onTrack ? 'On Track' : `${plan.progressPercent}%`}
              </span>
              <button onClick={() => removeGoal(plan.goal.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="card-body">
            {/* Progress Bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Current: {fmt(plan.currentGrossIncome)}</span>
                <span>Required: {fmt(plan.requiredGrossIncome)}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-hover)' }}>
                <div style={{
                  height: '100%', borderRadius: 4, width: `${Math.min(100, plan.progressPercent)}%`,
                  background: plan.onTrack ? 'var(--accent-emerald)' : plan.progressPercent > 50 ? 'var(--accent-gold)' : 'var(--accent-red)',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Income Gap', value: plan.incomeGap > 0 ? fmt(plan.incomeGap) : 'None', color: plan.incomeGap > 0 ? 'var(--accent-red)' : 'var(--accent-emerald)' },
                { label: 'Monthly Gross Needed', value: fmt(plan.requiredMonthlyGross), color: 'var(--accent-gold)' },
                { label: 'Monthly Savings', value: plan.requiredMonthlySavings > 0 ? fmt(plan.requiredMonthlySavings) : 'N/A', color: 'var(--accent-blue)' },
                { label: 'Effective Tax Rate', value: `${(plan.effectiveTaxRate * 100).toFixed(1)}%`, color: 'var(--text-muted)' },
                { label: 'Entity Savings', value: plan.estimatedTaxSavings > 0 ? fmt(plan.estimatedTaxSavings) : 'Optimal', color: plan.estimatedTaxSavings > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' },
              ].map((kpi, j) => (
                <div key={j} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-primary)', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Monthly milestones chart */}
            {plan.monthlyPlan.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Milestone Timeline</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={plan.monthlyPlan} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                    <defs>
                      <linearGradient id={`goalGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
                    <YAxis tickFormatter={v => fmtK(v)} tick={{ fill: 'var(--text-muted)', fontSize: 9 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: '#1a1d24', border: '1px solid #2a2d35', borderRadius: 8, fontSize: 11 }} />
                    <Area type="monotone" dataKey="cumulativeSaved" name="Projected Savings" fill={`url(#goalGrad-${i})`} stroke="#10b981" strokeWidth={2} />
                    <Area type="monotone" dataKey="targetAtMonth" name="Target Pace" fill="none" stroke="var(--accent-gold)" strokeWidth={1.5} strokeDasharray="4 4" />
                    <ReferenceLine y={plan.goal.targetAmount} stroke="var(--accent-gold)" strokeDasharray="3 3" label={{ value: 'Goal', fill: 'var(--accent-gold)', fontSize: 9 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Entity recommendation */}
            {plan.estimatedTaxSavings > 0 && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={16} color="var(--accent-emerald)" />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--accent-emerald)' }}>{plan.optimalEntityType}</strong> could save {fmt(plan.estimatedTaxSavings)}/yr — accelerating your goal by reducing tax drag
                </div>
              </div>
            )}

            {/* Sensitivity */}
            {plan.ifYouEarnMore.some(s => s.monthsSaved > 0) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>If you earn more:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {plan.ifYouEarnMore.filter(s => s.monthsSaved > 0).map((s, j) => (
                    <div key={j} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-primary)', fontSize: 11 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>+{fmt(s.extraMonthly)}/mo</span>
                      <span style={{ color: 'var(--text-muted)' }}> → </span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>{s.monthsSaved} months faster</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {activeGoals.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          Select a goal above or create a custom one to see your reverse-engineered plan
        </div>
      )}
    </div>
  )
}
