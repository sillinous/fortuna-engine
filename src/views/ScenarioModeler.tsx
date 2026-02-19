import { useState, useMemo, useCallback } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  evaluateScenario, generateSmartScenarios, generateWaterfall, projectMultiYear,
  reverseCalculateIncome, generateSensitivityCurve,
  type ScenarioModification, type ScenarioResult, type ProjectionConfig, DEFAULT_PROJECTION,
} from '../engine/scenario-modeler'
import {
  Sparkles, Plus, X, TrendingUp, TrendingDown, Zap, BarChart3,
  Target, ArrowRight, Layers, ChevronDown, Clock, Calculator,
  Activity, DollarSign, Percent, PiggyBank
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
  AreaChart, Area, LineChart, Line, ComposedChart
} from 'recharts'

type Tab = 'compare' | 'waterfall' | 'projections' | 'sensitivity' | 'reverse'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'compare', label: 'Compare', icon: <Layers size={14} /> },
  { key: 'waterfall', label: 'Waterfall', icon: <BarChart3 size={14} /> },
  { key: 'projections', label: 'Projections', icon: <TrendingUp size={14} /> },
  { key: 'sensitivity', label: 'Sensitivity', icon: <Activity size={14} /> },
  { key: 'reverse', label: 'Target Calc', icon: <Target size={14} /> },
]

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }
function fmtK(n: number): string { return n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}` }
function pct(n: number): string { return `${(n * 100).toFixed(1)}%` }

export function ScenarioModeler() {
  const { state, taxReport, updateState } = useFortuna()

  // Hydrate saved scenarios from FortunaState
  const [activeScenarios, setActiveScenariosRaw] = useState<{ name: string; mods: ScenarioModification[]; description: string; icon: string }[]>(
    () => (state as any).savedScenarios || []
  )
  const setActiveScenarios = useCallback((scenarios: typeof activeScenarios | ((prev: typeof activeScenarios) => typeof activeScenarios)) => {
    setActiveScenariosRaw(prev => {
      const next = typeof scenarios === 'function' ? scenarios(prev) : scenarios
      updateState(s => ({ ...s, savedScenarios: next }))
      return next
    })
  }, [updateState])

  const [showCustom, setShowCustom] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('compare')

  // Interactive income slider
  const currentGross = state.incomeStreams.filter(s => s.isActive).reduce((s, i) => s + i.annualAmount, 0)
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null)
  const effectiveIncome = incomeOverride ?? currentGross

  // Projection config
  const [projConfig, setProjConfig] = useState<ProjectionConfig>(DEFAULT_PROJECTION)

  // Reverse calc target
  const [reverseTarget, setReverseTarget] = useState(100000)

  // Custom scenario builder
  const [customName, setCustomName] = useState('Custom Scenario')
  const [customMods, setCustomMods] = useState<ScenarioModification[]>([])
  const [addModType, setAddModType] = useState<ScenarioModification['type']>('add_income')

  const hasData = state.incomeStreams.length > 0

  // Build working state with income override
  const workingState: typeof state = useMemo(() => {
    if (incomeOverride === null) return state
    const s = JSON.parse(JSON.stringify(state))
    const total = s.incomeStreams.filter((i: any) => i.isActive).reduce((sum: number, i: any) => sum + i.annualAmount, 0)
    if (total > 0) {
      const scale = incomeOverride / total
      s.incomeStreams = s.incomeStreams.map((i: any) => ({ ...i, annualAmount: i.isActive ? Math.round(i.annualAmount * scale) : i.annualAmount }))
    }
    return s
  }, [state, incomeOverride])

  const smartScenarios = useMemo(() => generateSmartScenarios(workingState), [workingState])
  const baseline = useMemo(() => evaluateScenario('Current', workingState, []), [workingState])

  const results: ScenarioResult[] = useMemo(() => {
    return activeScenarios.map(s => evaluateScenario(s.name, workingState, s.mods))
  }, [activeScenarios, workingState])

  // Waterfall data
  const waterfallBaseline = useMemo(() => generateWaterfall(baseline.taxReport), [baseline])
  const waterfallScenario = useMemo(() => {
    if (results.length === 0) return null
    return generateWaterfall(results[results.length - 1].taxReport)
  }, [results])

  // Projections
  const baselineProjection = useMemo(
    () => projectMultiYear(workingState, [], projConfig),
    [workingState, projConfig]
  )
  const scenarioProjection = useMemo(() => {
    if (activeScenarios.length === 0) return null
    const lastScenario = activeScenarios[activeScenarios.length - 1]
    return projectMultiYear(workingState, lastScenario.mods, projConfig)
  }, [workingState, activeScenarios, projConfig])

  // Sensitivity
  const sensitivityCurve = useMemo(
    () => generateSensitivityCurve(workingState, { min: Math.max(10000, effectiveIncome * 0.2), max: effectiveIncome * 3 }),
    [workingState, effectiveIncome]
  )

  // Reverse calc
  const reverseResult = useMemo(
    () => reverseCalculateIncome(workingState, reverseTarget),
    [workingState, reverseTarget]
  )

  // Chart data
  const comparisonData = useMemo(() => {
    const all = [baseline, ...results]
    return all.map(r => ({
      name: r.name.length > 16 ? r.name.substring(0, 14) + '…' : r.name,
      'Federal': r.taxReport.federalIncomeTax,
      'SE Tax': r.taxReport.selfEmploymentTax,
      'State': r.taxReport.stateTax,
      total: r.taxReport.totalTax,
      net: r.taxReport.afterTaxIncome,
    }))
  }, [baseline, results])

  const projChartData = useMemo(() => {
    return baselineProjection.map((p, i) => ({
      year: p.year.toString(),
      'Current Path': p.afterTaxIncome,
      'Current Tax': p.totalTax,
      'Optimized Path': scenarioProjection ? scenarioProjection[i]?.afterTaxIncome : undefined,
      'Optimized Tax': scenarioProjection ? scenarioProjection[i]?.totalTax : undefined,
      'Retirement (Current)': p.retirementBalance,
      'Retirement (Opt)': scenarioProjection ? scenarioProjection[i]?.retirementBalance : undefined,
    }))
  }, [baselineProjection, scenarioProjection])

  const toggleScenario = (scenario: typeof smartScenarios[0]) => {
    const exists = activeScenarios.find(s => s.name === scenario.name)
    if (exists) setActiveScenarios(prev => prev.filter(s => s.name !== scenario.name))
    else setActiveScenarios(prev => [...prev, scenario])
  }

  const addCustomMod = () => {
    const mod: ScenarioModification = { type: addModType }
    switch (addModType) {
      case 'add_income': mod.incomeName = 'New Revenue'; mod.incomeType = 'business'; mod.incomeAmount = 50000; break
      case 'change_entity': mod.entityType = 'llc_scorp'; break
      case 'add_deduction': mod.deductionName = 'New Deduction'; mod.deductionCategory = 'retirement'; mod.deductionAmount = 10000; break
      case 'add_expense': mod.expenseDesc = 'New Expense'; mod.expenseAmount = 5000; mod.expensePct = 100; break
      case 'change_state': mod.stateCode = 'TX'; break
    }
    setCustomMods(prev => [...prev, mod])
  }

  const saveCustomScenario = () => {
    if (customMods.length === 0) return
    setActiveScenarios(prev => [...prev, { name: customName, mods: customMods, description: 'Custom', icon: '🔧' }])
    setCustomMods([])
    setCustomName('Custom Scenario')
    setShowCustom(false)
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
    fontSize: 13, outline: 'none', width: '100%',
  }

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <BarChart3 size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Scenario Modeler</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add your financial data first to start modeling what-if scenarios.</p>
        </div>
      </div>
    )
  }

  // ─── Metric delta display ────────────────────────
  const bestResult = results.length > 0 ? results.reduce((best, r) => r.taxReport.afterTaxIncome > best.taxReport.afterTaxIncome ? r : best, results[0]) : null
  const taxSaved = bestResult ? baseline.taxReport.totalTax - bestResult.taxReport.totalTax : 0
  const incomeGained = bestResult ? bestResult.taxReport.afterTaxIncome - baseline.taxReport.afterTaxIncome : 0

  return (
    <div className="view-enter">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 className="section-title">Scenario Modeler</h1>
          <span className="pill gold"><Zap size={11} /> Interactive</span>
        </div>
        <p className="section-subtitle">Real-time financial simulation. Toggle scenarios, drag sliders, watch everything recompute.</p>
      </div>

      {/* ── Live Metrics Bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Gross Income', value: fmt(baseline.taxReport.grossIncome), icon: <DollarSign size={14} />, color: 'var(--accent-blue)' },
          { label: 'Total Tax', value: fmt(baseline.taxReport.totalTax), sub: pct(baseline.taxReport.effectiveRate), icon: <Percent size={14} />, color: 'var(--accent-red)' },
          { label: 'After Tax', value: fmt(baseline.taxReport.afterTaxIncome), icon: <TrendingUp size={14} />, color: 'var(--accent-emerald)' },
          { label: taxSaved > 0 ? 'Tax Saved' : 'Health Score', value: taxSaved > 0 ? fmt(taxSaved) : `${baseline.healthScore.overall}/100`, sub: incomeGained > 0 ? `+${fmt(incomeGained)} net` : baseline.healthScore.grade, icon: taxSaved > 0 ? <Sparkles size={14} /> : <Activity size={14} />, color: 'var(--accent-gold)' },
        ].map((m, i) => (
          <div key={i} style={{
            padding: '16px 18px', borderRadius: 14, background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: m.color }}>{m.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{m.label}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div>
            {m.sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: m.color, marginTop: 2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Income Slider ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={15} color="var(--accent-gold)" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Income Slider</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— drag to see cascading tax impact</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--accent-gold)' }}>
              {fmt(effectiveIncome)}
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="range"
              min={Math.max(10000, Math.round(currentGross * 0.25))}
              max={Math.round(currentGross * 3)}
              step={1000}
              value={effectiveIncome}
              onChange={e => setIncomeOverride(parseInt(e.target.value))}
              style={{
                width: '100%', height: 6, appearance: 'none', borderRadius: 3,
                background: `linear-gradient(to right, var(--accent-gold) ${((effectiveIncome - currentGross * 0.25) / (currentGross * 2.75)) * 100}%, var(--bg-surface) 0%)`,
                cursor: 'pointer', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtK(Math.round(currentGross * 0.25))}</span>
              {incomeOverride !== null && (
                <button onClick={() => setIncomeOverride(null)}
                  style={{ fontSize: 10, color: 'var(--accent-gold)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                  ↻ Reset to actual
                </button>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{fmtK(Math.round(currentGross * 3))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scenario Chips ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Toggle Scenarios
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {smartScenarios.map(scenario => {
            const isActive = activeScenarios.some(s => s.name === scenario.name)
            return (
              <button key={scenario.name} onClick={() => toggleScenario(scenario)}
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  border: `1px solid ${isActive ? 'rgba(212,168,67,0.4)' : 'var(--border-subtle)'}`,
                  background: isActive ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                  color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <span>{scenario.icon}</span>
                <span style={{ fontWeight: 500 }}>{scenario.name}</span>
              </button>
            )
          })}
          <button onClick={() => setShowCustom(!showCustom)}
            style={{
              padding: '8px 14px', borderRadius: 10, border: '1px dashed var(--border-medium)',
              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
              fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Plus size={13} /> Custom
          </button>
        </div>
      </div>

      {/* Custom scenario builder */}
      {showCustom && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Name:</span>
              <input style={{ ...inputStyle, maxWidth: 200 }} value={customName} onChange={e => setCustomName(e.target.value)} />
            </div>
            {customMods.map((mod, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span className="pill" style={{ fontSize: 10, minWidth: 80 }}>{mod.type.replace(/_/g, ' ')}</span>
                {(mod.type === 'add_income' || mod.type === 'modify_income') && (
                  <>
                    <input style={{ ...inputStyle, width: 140 }} placeholder="Name" value={mod.incomeName || ''} onChange={e => setCustomMods(prev => prev.map((m, j) => j === i ? { ...m, incomeName: e.target.value } : m))} />
                    <input style={{ ...inputStyle, width: 100 }} type="number" placeholder="Amount" value={mod.incomeAmount || ''} onChange={e => setCustomMods(prev => prev.map((m, j) => j === i ? { ...m, incomeAmount: parseFloat(e.target.value) || 0 } : m))} />
                  </>
                )}
                {mod.type === 'change_entity' && (
                  <select style={{ ...inputStyle, width: 180 }} value={mod.entityType} onChange={e => setCustomMods(prev => prev.map((m, j) => j === i ? { ...m, entityType: e.target.value as any } : m))}>
                    <option value="sole_prop">Sole Prop</option><option value="llc">LLC</option><option value="llc_scorp">LLC + S-Corp</option><option value="ccorp">C-Corp</option>
                  </select>
                )}
                {mod.type === 'add_deduction' && (
                  <>
                    <input style={{ ...inputStyle, width: 140 }} placeholder="Name" value={mod.deductionName || ''} onChange={e => setCustomMods(prev => prev.map((m, j) => j === i ? { ...m, deductionName: e.target.value } : m))} />
                    <input style={{ ...inputStyle, width: 100 }} type="number" placeholder="Amount" value={mod.deductionAmount || ''} onChange={e => setCustomMods(prev => prev.map((m, j) => j === i ? { ...m, deductionAmount: parseFloat(e.target.value) || 0 } : m))} />
                  </>
                )}
                {mod.type === 'change_state' && (
                  <input style={{ ...inputStyle, width: 80 }} placeholder="ST" value={mod.stateCode || ''} onChange={e => setCustomMods(prev => prev.map((m, j) => j === i ? { ...m, stateCode: e.target.value.toUpperCase() } : m))} />
                )}
                <button onClick={() => setCustomMods(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}><X size={14} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ ...inputStyle, width: 160 }} value={addModType} onChange={e => setAddModType(e.target.value as any)}>
                <option value="add_income">Add Income</option><option value="change_entity">Change Entity</option>
                <option value="add_deduction">Add Deduction</option><option value="add_expense">Add Expense</option><option value="change_state">Change State</option>
              </select>
              <button onClick={addCustomMod} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-medium)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>
                <Plus size={12} /> Add
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={saveCustomScenario} disabled={customMods.length === 0}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: customMods.length ? 'var(--accent-gold)' : 'var(--bg-surface)', color: customMods.length ? '#0c0e12' : 'var(--text-muted)', cursor: customMods.length ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                Run Scenario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0,
      }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: '10px 10px 0 0',
              border: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--accent-gold)' : '2px solid transparent',
              background: activeTab === tab.key ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-gold)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-body)',
              transition: 'all 0.2s',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: COMPARE ══════════════ */}
      {activeTab === 'compare' && (
        <>
          {results.length > 0 ? (
            <>
              {/* Stacked bar comparison */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><span className="card-title">Tax Burden Comparison</span></div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={Math.max(180, comparisonData.length * 60)}>
                    <BarChart data={comparisonData} layout="vertical" barCategoryGap="20%">
                      <XAxis type="number" tickFormatter={v => fmtK(v)} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: '#8b919e', fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
                      <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: number) => fmt(v)} />
                      <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Federal" stackId="tax" fill="#d4a843" />
                      <Bar dataKey="SE Tax" stackId="tax" fill="#a78bfa" />
                      <Bar dataKey="State" stackId="tax" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detail table */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><span className="card-title">Side-by-Side Analysis</span></div>
                <div className="card-body" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11 }}>Metric</th>
                        <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--accent-gold)', fontWeight: 500, fontSize: 11 }}>Current</th>
                        {results.map(r => (
                          <th key={r.name} style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontWeight: 500, fontSize: 11 }}>{r.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Gross Income', key: 'grossIncome', inv: false },
                        { label: 'Total Tax', key: 'totalTax', inv: true, hl: true },
                        { label: 'Federal Tax', key: 'federalIncomeTax', inv: true },
                        { label: 'SE Tax', key: 'selfEmploymentTax', inv: true },
                        { label: 'State Tax', key: 'stateTax', inv: true },
                        { label: 'Effective Rate', key: 'effectiveRate', inv: true, pct: true },
                        { label: 'After-Tax', key: 'afterTaxIncome', inv: false, hl: true, emerald: true },
                        { label: 'Health Score', key: '_health', inv: false },
                      ].map(row => {
                        const baseVal = row.key === '_health' ? baseline.healthScore.overall : (baseline.taxReport as any)[row.key]
                        return (
                          <tr key={row.key}>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-body)' }}>{row.label}</td>
                            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right', color: 'var(--text-primary)', fontWeight: row.hl ? 600 : 400 }}>
                              {row.pct ? pct(baseVal) : row.key === '_health' ? `${baseVal}/100` : fmt(baseVal)}
                            </td>
                            {results.map(r => {
                              const val = row.key === '_health' ? r.healthScore.overall : (r.taxReport as any)[row.key]
                              const diff = val - baseVal
                              const isBetter = row.inv ? diff < 0 : diff > 0
                              return (
                                <td key={r.name} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right' }}>
                                  <div style={{ color: row.hl ? (isBetter ? 'var(--accent-emerald)' : diff === 0 ? 'var(--text-primary)' : 'var(--accent-red)') : 'var(--text-primary)', fontWeight: row.hl ? 600 : 400 }}>
                                    {row.pct ? pct(val) : row.key === '_health' ? `${val}/100` : fmt(val)}
                                  </div>
                                  {diff !== 0 && (
                                    <div style={{ fontSize: 10, color: isBetter ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: 2 }}>
                                      {diff > 0 ? '+' : ''}{row.pct ? `${(diff * 100).toFixed(1)}%` : row.key === '_health' ? diff : fmt(diff)}
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <EmptyPrompt message="Select scenarios above to see side-by-side comparison" />
          )}
        </>
      )}

      {/* ══════════════ TAB: WATERFALL ══════════════ */}
      {activeTab === 'waterfall' && (
        <div style={{ display: 'grid', gridTemplateColumns: waterfallScenario ? '1fr 1fr' : '1fr', gap: 16 }}>
          <WaterfallCard title="Current" data={waterfallBaseline} report={baseline.taxReport} />
          {waterfallScenario && results.length > 0 && (
            <WaterfallCard title={results[results.length - 1].name} data={waterfallScenario} report={results[results.length - 1].taxReport} />
          )}
          {!waterfallScenario && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
              Toggle a scenario to see the comparison waterfall
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TAB: PROJECTIONS ══════════════ */}
      {activeTab === 'projections' && (
        <>
          {/* Config sliders */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <ConfigSlider label="Growth Rate" value={projConfig.annualGrowthRate} min={0} max={0.50} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setProjConfig(p => ({ ...p, annualGrowthRate: v }))} />
                <ConfigSlider label="Retirement %" value={projConfig.retirementContribRate} min={0} max={0.30} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setProjConfig(p => ({ ...p, retirementContribRate: v }))} />
                <ConfigSlider label="Return Rate" value={projConfig.retirementReturnRate} min={0.02} max={0.15} step={0.01}
                  format={v => `${(v * 100).toFixed(0)}%`} onChange={v => setProjConfig(p => ({ ...p, retirementReturnRate: v }))} />
                <ConfigSlider label="Years" value={projConfig.years} min={2} max={10} step={1}
                  format={v => `${v}yr`} onChange={v => setProjConfig(p => ({ ...p, years: v }))} />
              </div>
            </div>
          </div>

          {/* Income & Tax projection */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Income & Tax Trajectory</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={projChartData}>
                  <XAxis dataKey="year" tick={{ fill: '#8b919e', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtK(v)} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: number) => fmt(v)} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Current Path" fill="rgba(96,165,250,0.15)" stroke="#60a5fa" strokeWidth={2} />
                  {scenarioProjection && <Area type="monotone" dataKey="Optimized Path" fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth={2} />}
                  <Line type="monotone" dataKey="Current Tax" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                  {scenarioProjection && <Line type="monotone" dataKey="Optimized Tax" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Retirement accumulation */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Retirement Accumulation</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={projChartData}>
                  <XAxis dataKey="year" tick={{ fill: '#8b919e', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtK(v)} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: number) => fmt(v)} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Retirement (Current)" fill="rgba(167,139,250,0.2)" stroke="#a78bfa" strokeWidth={2} />
                  {scenarioProjection && <Area type="monotone" dataKey="Retirement (Opt)" fill="rgba(212,168,67,0.2)" stroke="#d4a843" strokeWidth={2} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cumulative summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {(() => {
              const last = baselineProjection[baselineProjection.length - 1]
              const lastOpt = scenarioProjection ? scenarioProjection[scenarioProjection.length - 1] : null
              return [
                { label: `${projConfig.years}-Year After-Tax`, current: last.cumulativeAfterTax, optimized: lastOpt?.cumulativeAfterTax },
                { label: `${projConfig.years}-Year Taxes Paid`, current: last.cumulativeTax, optimized: lastOpt?.cumulativeTax },
                { label: `Retirement at Year ${projConfig.years}`, current: last.retirementBalance, optimized: lastOpt?.retirementBalance },
              ].map((item, i) => (
                <div key={i} className="card">
                  <div className="card-body" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{item.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(item.current)}</div>
                    {item.optimized && item.optimized !== item.current && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: item.optimized > item.current ? (i === 1 ? 'var(--accent-red)' : 'var(--accent-emerald)') : (i === 1 ? 'var(--accent-emerald)' : 'var(--accent-red)'), marginTop: 4 }}>
                        Optimized: {fmt(item.optimized)}
                        <span style={{ fontSize: 10, marginLeft: 4 }}>
                          ({item.optimized > item.current ? '+' : ''}{fmt(item.optimized - item.current)})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            })()}
          </div>
        </>
      )}

      {/* ══════════════ TAB: SENSITIVITY ══════════════ */}
      {activeTab === 'sensitivity' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">Tax Rate vs Income</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={sensitivityCurve}>
                  <XAxis dataKey="income" tickFormatter={v => fmtK(v)} tick={{ fill: '#8b919e', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="pct" orientation="right" tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} domain={[0, 0.5]} />
                  <YAxis yAxisId="amt" tickFormatter={v => fmtK(v)} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    formatter={(v: number, name: string) => name.includes('Rate') ? `${(v * 100).toFixed(1)}%` : fmt(v)} />
                  <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="amt" type="monotone" dataKey="afterTax" name="After Tax" fill="rgba(16,185,129,0.12)" stroke="#10b981" strokeWidth={2} />
                  <Area yAxisId="amt" type="monotone" dataKey="totalTax" name="Total Tax" fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth={2} />
                  <Line yAxisId="pct" type="monotone" dataKey="effectiveRate" name="Effective Rate" stroke="#d4a843" strokeWidth={2} dot={false} />
                  <Line yAxisId="pct" type="monotone" dataKey="marginalRate" name="Marginal Rate" stroke="#a78bfa" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tax component breakdown */}
          <div className="card">
            <div className="card-header"><span className="card-title">Tax Component Breakdown by Income</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={sensitivityCurve}>
                  <XAxis dataKey="income" tickFormatter={v => fmtK(v)} tick={{ fill: '#8b919e', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => fmtK(v)} tick={{ fill: '#565c6a', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#181c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: number) => fmt(v)} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="federalTax" name="Federal" stackId="1" fill="rgba(212,168,67,0.5)" stroke="#d4a843" />
                  <Area type="monotone" dataKey="seTax" name="SE Tax" stackId="1" fill="rgba(167,139,250,0.5)" stroke="#a78bfa" />
                  <Area type="monotone" dataKey="stateTax" name="State" stackId="1" fill="rgba(96,165,250,0.5)" stroke="#60a5fa" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Current position marker */}
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            Your current income: <span style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(effectiveIncome)}</span>
            {' · '}Effective rate: <span style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{pct(baseline.taxReport.effectiveRate)}</span>
          </div>
        </>
      )}

      {/* ══════════════ TAB: REVERSE CALCULATOR ══════════════ */}
      {activeTab === 'reverse' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '24px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                <Target size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                How much do you need to <strong style={{ color: 'var(--accent-gold)' }}>earn</strong> to <strong style={{ color: 'var(--accent-emerald)' }}>keep</strong>...
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                <span style={{ fontSize: 32, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  value={reverseTarget}
                  onChange={e => setReverseTarget(parseInt(e.target.value) || 0)}
                  style={{
                    fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-emerald)',
                    background: 'transparent', border: 'none', borderBottom: '2px solid var(--accent-emerald)',
                    outline: 'none', width: 220, textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>after taxes</span>
              </div>

              <input
                type="range"
                min={25000} max={500000} step={5000}
                value={reverseTarget}
                onChange={e => setReverseTarget(parseInt(e.target.value))}
                style={{
                  width: '80%', height: 6, appearance: 'none', borderRadius: 3,
                  background: `linear-gradient(to right, var(--accent-emerald) ${((reverseTarget - 25000) / 475000) * 100}%, var(--bg-surface) 0%)`,
                  cursor: 'pointer', outline: 'none', marginBottom: 24,
                }}
              />

              {/* Results */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 600, margin: '0 auto' }}>
                <ResultBox label="You Must Earn" value={fmt(reverseResult.requiredGrossIncome)} color="var(--accent-gold)" size={22} />
                <ResultBox label="Tax Bill" value={fmt(reverseResult.totalTaxAtTarget)} color="var(--accent-red)" size={22} />
                <ResultBox label="Effective Rate" value={pct(reverseResult.effectiveRateAtTarget)} color="var(--accent-amber)" size={22} />
              </div>

              <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-surface)', borderRadius: 12, maxWidth: 500, margin: '20px auto 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Translation</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  To keep <strong style={{ color: 'var(--accent-emerald)' }}>{fmt(reverseTarget)}</strong> after all taxes,
                  you need to gross <strong style={{ color: 'var(--accent-gold)' }}>{fmt(reverseResult.requiredGrossIncome)}</strong>.
                  The government takes <strong style={{ color: 'var(--accent-red)' }}>{fmt(reverseResult.totalTaxAtTarget)}</strong> ({pct(reverseResult.effectiveRateAtTarget)}).
                  Your next dollar is taxed at <strong style={{ color: 'var(--accent-amber)' }}>{pct(reverseResult.marginalRateAtTarget)}</strong>.
                </div>
              </div>

              {/* Quick presets */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                {[50000, 75000, 100000, 150000, 200000, 300000].map(t => (
                  <button key={t} onClick={() => setReverseTarget(t)}
                    style={{
                      padding: '5px 12px', borderRadius: 8,
                      border: reverseTarget === t ? '1px solid var(--accent-emerald)' : '1px solid var(--border-subtle)',
                      background: reverseTarget === t ? 'rgba(16,185,129,0.1)' : 'transparent',
                      color: reverseTarget === t ? 'var(--accent-emerald)' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                    }}>
                    {fmtK(t)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-Components ──────────────────────────────────────────────

function WaterfallCard({ title, data, report }: { title: string; data: ReturnType<typeof generateWaterfall>; report: any }) {
  const maxVal = data[0]?.cumulative || 1

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="card-title">{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-emerald)' }}>Net: {fmt(report.afterTaxIncome)}</span>
      </div>
      <div className="card-body" style={{ padding: '12px 18px' }}>
        {data.map((seg, i) => {
          const barWidth = Math.max(3, (Math.abs(seg.amount) / maxVal) * 100)
          const isLast = i === data.length - 1
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 90, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>{seg.label}</div>
              <div style={{ flex: 1, position: 'relative', height: 22 }}>
                <div style={{
                  position: 'absolute',
                  left: isLast ? 0 : `${(seg.cumulative / maxVal) * 100}%`,
                  width: isLast ? `${(seg.amount / maxVal) * 100}%` : `${barWidth}%`,
                  height: '100%',
                  background: seg.color,
                  borderRadius: 4,
                  opacity: 0.85,
                  transform: seg.amount < 0 && !isLast ? `translateX(-${barWidth}%)` : undefined,
                  transition: 'all 0.3s ease',
                }} />
              </div>
              <div style={{ width: 75, fontSize: 11, fontFamily: 'var(--font-mono)', color: seg.type === 'net' ? 'var(--accent-emerald)' : seg.type === 'tax' ? 'var(--accent-red)' : seg.type === 'deduction' ? 'var(--accent-amber)' : 'var(--text-primary)', textAlign: 'right', fontWeight: isLast ? 600 : 400 }}>
                {seg.amount >= 0 ? '+' : ''}{fmtK(seg.amount)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConfigSlider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 600 }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%', height: 4, appearance: 'none', borderRadius: 2,
          background: `linear-gradient(to right, var(--accent-gold) ${((value - min) / (max - min)) * 100}%, var(--bg-surface) 0%)`,
          cursor: 'pointer', outline: 'none',
        }}
      />
    </div>
  )
}

function ResultBox({ label, value, color, size = 18 }: { label: string; value: string; color: string; size?: number }) {
  return (
    <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 12, border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: size, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function EmptyPrompt({ message }: { message: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: 48, background: 'var(--bg-elevated)', borderRadius: 14,
      border: '1px dashed var(--border-medium)',
    }}>
      <BarChart3 size={28} color="var(--text-muted)" style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>{message}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Toggle scenarios above, or build a custom one</div>
    </div>
  )
}
