import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useFortuna, genId } from '../hooks/useFortuna'
import { generateTaxReport } from '../engine/tax-calculator'
import { calculateReasonableSalary } from '../engine/entity-optimizer'
import type { LegalEntity, IncomeStream, FortunaState } from '../engine/storage'
import {
  Building2, ArrowDown, DollarSign, User, Landmark, Wallet,
  Shield, Zap, Plus, X, Trash2, GripVertical,
  ChevronRight, Check, AlertTriangle, Link2, Unlink,
  Brain, Sparkles, ChevronDown, ChevronUp, Target, Info, Calculator
} from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<string, string> = {
  sole_prop: 'Sole Proprietorship', llc: 'LLC (Disregarded)',
  llc_scorp: 'LLC (S-Corp Election)', scorp: 'S-Corporation',
  ccorp: 'C-Corporation', partnership: 'Partnership',
}
const ENTITY_TYPES = Object.entries(ENTITY_TYPE_LABELS)

const INCOME_COLORS: Record<string, string> = {
  business: '#d4a843', freelance: '#a78bfa', w2: '#60a5fa',
  investment: '#34d399', rental: '#fbbf24', passive: '#f472b6', other: '#94a3b8',
}

// ─── Labor Income Intelligence Engine ──────────────────────────────────

interface LaborRecommendation {
  incomeId: string; incomeName: string; currentEntityId?: string
  recommendedEntityId?: string; recommendedEntityType: string
  reason: string; estimatedSavings: number
  priority: 'high' | 'medium' | 'low'; action: string
  math?: { // Show-your-work breakdown
    currentTax?: number
    proposedTax?: number
    currentSETax?: number
    proposedSETax?: number
    complianceCost?: number
    netBenefit?: number
    breakdown?: string[] // Line-by-line explanation
  }
}

function analyzeLaborPlacement(state: FortunaState): LaborRecommendation[] {
  const recs: LaborRecommendation[] = []
  const activeEntities = state.entities.filter(e => e.isActive)
  const activeStreams = state.incomeStreams.filter(s => s.isActive && s.annualAmount > 0)

  for (const stream of activeStreams) {
    const assigned = activeEntities.find(e => e.id === stream.entityId)

    if (stream.type === 'w2') {
      if (stream.entityId) {
        recs.push({ incomeId: stream.id, incomeName: stream.name || 'W-2 Income',
          currentEntityId: stream.entityId, recommendedEntityType: 'none',
          reason: 'W-2 income is employer-paid and shouldn\'t flow through your entities. Employer handles payroll taxes.',
          estimatedSavings: 0, priority: 'medium', action: 'Unassign from entity' })
      }
      continue
    }

    if (stream.type === 'business' || stream.type === 'freelance') {
      const seIncome = stream.annualAmount
      const scorps = activeEntities.filter(e => e.type === 'llc_scorp' || e.type === 'scorp')

      if (seIncome > 50000 && scorps.length > 0 && !scorps.find(e => e.id === stream.entityId)) {
        const sa = calculateReasonableSalary(seIncome)
        const currentSE = Math.round(seIncome * 0.9235 * 0.153)
        const scorpFICA = Math.round(sa.recommendedSalary * 0.153)
        recs.push({ incomeId: stream.id, incomeName: stream.name || stream.type,
          currentEntityId: stream.entityId, recommendedEntityId: scorps[0].id, recommendedEntityType: 'S-Corp',
          reason: `At $${seIncome.toLocaleString()}/yr, routing through S-Corp splits into ~$${sa.recommendedSalary.toLocaleString()} salary + ~$${sa.distributions.toLocaleString()} distributions. Distributions bypass FICA.`,
          estimatedSavings: sa.seTaxSavings, priority: 'high', action: `Assign to ${scorps[0].name || 'S-Corp'}`,
          math: {
            currentSETax: currentSE, proposedSETax: scorpFICA,
            complianceCost: 0, netBenefit: sa.seTaxSavings,
            breakdown: [
              `Current: $${seIncome.toLocaleString()} × 92.35% × 15.3% = $${currentSE.toLocaleString()} SE tax`,
              `S-Corp salary: $${sa.recommendedSalary.toLocaleString()} × 15.3% = $${scorpFICA.toLocaleString()} FICA`,
              `S-Corp distributions: $${sa.distributions.toLocaleString()} × 0% FICA = $0`,
              `Annual FICA savings: $${currentSE.toLocaleString()} − $${scorpFICA.toLocaleString()} = $${sa.seTaxSavings.toLocaleString()}`
            ]
          }
        })
      } else if (seIncome > 50000 && scorps.length === 0 && !assigned) {
        const sa = calculateReasonableSalary(seIncome)
        const currentSE = Math.round(seIncome * 0.9235 * 0.153)
        const scorpFICA = Math.round(sa.recommendedSalary * 0.153)
        const compliance = 2500
        recs.push({ incomeId: stream.id, incomeName: stream.name || stream.type,
          recommendedEntityType: 'llc_scorp',
          reason: `$${seIncome.toLocaleString()}/yr SE income exceeds S-Corp breakeven. Creating LLC w/ S-Corp election saves ~$${(sa.seTaxSavings - compliance).toLocaleString()}/yr net after compliance.`,
          estimatedSavings: sa.seTaxSavings - compliance, priority: 'high', action: 'Create S-Corp entity',
          math: {
            currentSETax: currentSE, proposedSETax: scorpFICA,
            complianceCost: compliance, netBenefit: sa.seTaxSavings - compliance,
            breakdown: [
              `Current SE tax: $${seIncome.toLocaleString()} × 92.35% × 15.3% = $${currentSE.toLocaleString()}/yr`,
              `S-Corp salary FICA: $${sa.recommendedSalary.toLocaleString()} × 15.3% = $${scorpFICA.toLocaleString()}/yr`,
              `Gross FICA savings: $${currentSE.toLocaleString()} − $${scorpFICA.toLocaleString()} = $${sa.seTaxSavings.toLocaleString()}/yr`,
              `S-Corp compliance: payroll processing, 1120-S filing, etc. ≈ −$${compliance.toLocaleString()}/yr`,
              `Net annual benefit: $${sa.seTaxSavings.toLocaleString()} − $${compliance.toLocaleString()} = $${(sa.seTaxSavings - compliance).toLocaleString()}/yr`
            ]
          }
        })
      } else if (seIncome > 0 && seIncome <= 50000 && !assigned) {
        recs.push({ incomeId: stream.id, incomeName: stream.name || stream.type,
          recommendedEntityType: 'llc',
          reason: `At $${seIncome.toLocaleString()}/yr, an S-Corp may not offset compliance costs yet, but an LLC (~$300/yr) provides liability protection.`,
          estimatedSavings: 0, priority: 'low', action: 'Create LLC for protection' })
      } else if (assigned && (assigned.type === 'llc_scorp' || assigned.type === 'scorp') && seIncome < 30000) {
        recs.push({ incomeId: stream.id, incomeName: stream.name || stream.type,
          currentEntityId: assigned.id, recommendedEntityType: 'llc',
          reason: `At $${seIncome.toLocaleString()}/yr, S-Corp compliance costs (~$2,500/yr) likely exceed FICA savings. Consider simple LLC.`,
          estimatedSavings: -1500, priority: 'medium', action: 'Downgrade to LLC' })
      }
    }

    if (stream.type === 'rental' && !stream.entityId && stream.annualAmount > 12000) {
      recs.push({ incomeId: stream.id, incomeName: stream.name || 'Rental Income',
        recommendedEntityType: 'llc',
        reason: 'Rental properties should be in separate LLC for asset protection against premises liability.',
        estimatedSavings: 0, priority: 'medium', action: 'Create property-holding LLC' })
    }

    if ((stream.type === 'investment' || stream.type === 'passive') && stream.entityId) {
      recs.push({ incomeId: stream.id, incomeName: stream.name || stream.type,
        currentEntityId: stream.entityId, recommendedEntityType: 'none',
        reason: 'Investment/passive income is simpler held personally. Entity pass-through adds complexity without benefit.',
        estimatedSavings: 0, priority: 'low', action: 'Unassign from entity' })
    }
  }

  return recs.sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 }
    return (p[a.priority] - p[b.priority]) || (b.estimatedSavings - a.estimatedSavings)
  })
}

// ─── Main Component ────────────────────────────────────────────────────

type PanelMode = 'closed' | 'entity' | 'income' | 'labor-intelligence' | 'add-entity'

export function EntityFlow() {
  const { state, updateState, taxReport } = useFortuna()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('closed')
  const [panelData, setPanelData] = useState<any>(null)
  const [dropHighlight, setDropHighlight] = useState<string | null>(null)
  const [showRecs, setShowRecs] = useState(false)
  const [expandedMath, setExpandedMath] = useState<string | null>(null)

  const hasData = state.incomeStreams.length > 0
  const activeStreams = state.incomeStreams.filter(s => s.isActive && s.annualAmount > 0)
  const activeEntities = state.entities.filter(e => e.isActive)
  const totalRevenue = activeStreams.reduce((s, r) => s + r.annualAmount, 0)

  const laborRecs = useMemo(() => analyzeLaborPlacement(state), [state])
  const highCount = laborRecs.filter(r => r.priority === 'high').length

  // ─── Entity/Income maps ──────────────────────────────────────────────

  const { entityIncomeMap, unassignedStreams, entitySummaries } = useMemo(() => {
    const map: Record<string, IncomeStream[]> = {}
    const unassigned: IncomeStream[] = []
    for (const e of activeEntities) map[e.id] = []
    for (const s of activeStreams) {
      if (s.entityId && map[s.entityId]) map[s.entityId].push(s)
      else unassigned.push(s)
    }
    const summaries = activeEntities.map(entity => {
      const streams = map[entity.id] || []
      const totalIncome = streams.reduce((s, r) => s + r.annualAmount, 0)
      const isScorp = entity.type === 'llc_scorp' || entity.type === 'scorp'
      const salary = isScorp && totalIncome > 0 ? calculateReasonableSalary(totalIncome) : null
      return { entity, streams, totalIncome, isScorp, salary }
    })
    return { entityIncomeMap: map, unassignedStreams: unassigned, entitySummaries: summaries }
  }, [activeStreams, activeEntities])

  // ─── Actions ─────────────────────────────────────────────────────────

  const fmt = (n: number) => `$${n.toLocaleString()}`
  const fmtK = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `$${n.toLocaleString()}`

  const onDragStart = useCallback((e: React.DragEvent, incomeId: string) => {
    e.dataTransfer.setData('text/plain', incomeId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent, targetEntityId: string | undefined) => {
    e.preventDefault()
    const incomeId = e.dataTransfer.getData('text/plain')
    if (!incomeId) return
    updateState(prev => ({
      ...prev,
      incomeStreams: prev.incomeStreams.map(s =>
        s.id === incomeId ? { ...s, entityId: targetEntityId } : s
      ),
    }))
    setDropHighlight(null)
  }, [updateState])

  const openEntityPanel = useCallback((entity: LegalEntity) => {
    setPanelData({ ...entity }); setPanelMode('entity'); setSelectedNodeId(`entity-${entity.id}`)
  }, [])

  const openIncomePanel = useCallback((stream: IncomeStream) => {
    setPanelData({ ...stream }); setPanelMode('income'); setSelectedNodeId(`income-${stream.id}`)
  }, [])

  const saveEntity = useCallback((entity: LegalEntity) => {
    updateState(prev => ({ ...prev, entities: prev.entities.map(e => e.id === entity.id ? entity : e) }))
    setPanelMode('closed')
  }, [updateState])

  const deleteEntity = useCallback((entityId: string) => {
    updateState(prev => ({
      ...prev, entities: prev.entities.filter(e => e.id !== entityId),
      incomeStreams: prev.incomeStreams.map(s => s.entityId === entityId ? { ...s, entityId: undefined } : s),
      expenses: prev.expenses.map(x => x.entityId === entityId ? { ...x, entityId: undefined } : x),
    }))
    setPanelMode('closed')
  }, [updateState])

  const addEntity = useCallback((entity: Omit<LegalEntity, 'id'>, linkIncomeId?: string) => {
    const id = genId()
    updateState(prev => ({
      ...prev, entities: [...prev.entities, { ...entity, id }],
      incomeStreams: linkIncomeId
        ? prev.incomeStreams.map(s => s.id === linkIncomeId ? { ...s, entityId: id } : s)
        : prev.incomeStreams,
    }))
    setPanelMode('closed')
  }, [updateState])

  const saveIncome = useCallback((stream: IncomeStream) => {
    updateState(prev => ({ ...prev, incomeStreams: prev.incomeStreams.map(s => s.id === stream.id ? stream : s) }))
    setPanelMode('closed')
  }, [updateState])

  const unlinkIncome = useCallback((incomeId: string) => {
    updateState(prev => ({
      ...prev, incomeStreams: prev.incomeStreams.map(s => s.id === incomeId ? { ...s, entityId: undefined } : s),
    }))
  }, [updateState])

  const applyRec = useCallback((rec: LaborRecommendation) => {
    if (rec.recommendedEntityId) {
      updateState(prev => ({
        ...prev, incomeStreams: prev.incomeStreams.map(s =>
          s.id === rec.incomeId ? { ...s, entityId: rec.recommendedEntityId } : s),
      }))
    } else if (rec.action.startsWith('Unassign')) {
      updateState(prev => ({
        ...prev, incomeStreams: prev.incomeStreams.map(s =>
          s.id === rec.incomeId ? { ...s, entityId: undefined } : s),
      }))
    } else if (rec.action.startsWith('Create')) {
      setPanelData({ suggestedType: rec.recommendedEntityType,
        suggestedName: rec.incomeName ? `${rec.incomeName} ${rec.recommendedEntityType === 'llc' ? 'LLC' : 'S-Corp'}` : '',
        linkIncomeId: rec.incomeId })
      setPanelMode('add-entity')
    }
  }, [updateState])

  // ─── Empty state ─────────────────────────────────────────────────────

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <Building2 size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Entity Flow</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add financial data to visualize and manage your entity structure.</p>
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="view-enter" style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <h1 className="section-title">Entity Flow</h1>
            <span className="pill gold"><Building2 size={11} /> Interactive</span>
            {highCount > 0 && (
              <button onClick={() => { setPanelMode('labor-intelligence'); setShowRecs(true) }}
                className="pill" style={{ background: 'var(--accent-gold-dim)', color: 'var(--accent-gold)', cursor: 'pointer', border: 'none' }}>
                <Brain size={11} /> {highCount} optimization{highCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <p className="section-subtitle">Click any node to manage · Drag income sources onto entities to reassign · Add entities with +</p>
        </div>

        {/* Summary */}
        <div className="grid-4 stagger" style={{ marginBottom: 28 }}>
          <div className="metric-card glow-gold">
            <span className="metric-label">Gross Revenue</span>
            <div className="metric-value">{fmt(totalRevenue)}</div>
          </div>
          <div className="metric-card">
            <span className="metric-label">Total Tax</span>
            <div className="metric-value" style={{ color: 'var(--accent-red)' }}>-{fmt(taxReport.totalTax)}</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(taxReport.effectiveRate * 100).toFixed(1)}% effective</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Net Retained</span>
            <div className="metric-value" style={{ color: 'var(--accent-emerald)' }}>{fmt(taxReport.afterTaxIncome)}</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalRevenue > 0 ? ((taxReport.afterTaxIncome / totalRevenue) * 100).toFixed(0) : 0}% kept</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Entities</span>
            <div className="metric-value" style={{ color: 'var(--accent-blue)' }}>{activeEntities.length}</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unassignedStreams.length} unassigned</span>
          </div>
        </div>

        {/* ── LAYER 1: Income Sources ────────────────────────────────── */}
        <LayerHeader label="Revenue Sources" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {activeStreams.map(stream => {
            const isW2 = stream.type === 'w2'
            const isAssigned = !!stream.entityId && activeEntities.some(e => e.id === stream.entityId)
            const assignedEnt = activeEntities.find(e => e.id === stream.entityId)
            const sel = selectedNodeId === `income-${stream.id}`
            const col = INCOME_COLORS[stream.type] || '#888'
            const w2Withheld = isW2 ? (stream.w2?.federalWithholding || 0) + (stream.w2?.stateWithholding || 0) : 0
            return (
              <div key={stream.id} draggable={!isW2} onDragStart={isW2 ? undefined : (e => onDragStart(e, stream.id))}
                onClick={() => openIncomePanel(stream)}
                style={{
                  background: sel ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  border: `1px solid ${sel ? col : 'var(--border-subtle)'}`,
                  borderRadius: 12, padding: '12px 16px', cursor: isW2 ? 'pointer' : 'grab',
                  minWidth: 170, transition: 'all 0.2s', position: 'relative',
                  boxShadow: sel ? `0 0 20px ${col}22` : 'none',
                }}>
                {!isW2 && <div style={{ position: 'absolute', top: 6, right: 6, opacity: 0.3 }}><GripVertical size={12} /></div>}
                {isW2 && <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(96,165,250,0.15)', color: 'var(--accent-blue)', fontWeight: 500 }}>W-2</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `${col}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: col }}>
                    <DollarSign size={14} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2 }}>{stream.name || (isW2 ? (stream.w2?.employerName || 'W-2 Job') : stream.type)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isW2 ? (stream.w2?.employerName ? 'W-2 Employment' : 'w2') : stream.type}</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: col, marginBottom: 4 }}>{fmt(stream.annualAmount)}</div>
                {isW2 ? (
                  <div style={{ fontSize: 10, color: w2Withheld > 0 ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                    {w2Withheld > 0 ? `${fmt(w2Withheld)} withheld` : 'Employer-managed'}
                  </div>
                ) : isAssigned
                  ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent-emerald)' }}><Link2 size={10} /> {assignedEnt?.name || 'Entity'}</div>
                  : <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}><Unlink size={10} /> Unassigned</div>
                }
              </div>
            )
          })}
        </div>

        <FlowArrow />

        {/* ── LAYER 2: Entities ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>Legal Entities</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <button onClick={() => { setPanelData({ suggestedType: 'llc', suggestedName: '' }); setPanelMode('add-entity') }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
              background: 'var(--accent-gold-dim)', border: '1px solid var(--accent-gold-glow)',
              color: 'var(--accent-gold)', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>
            <Plus size={12} /> Add Entity
          </button>
        </div>

        {activeEntities.length === 0 ? (
          <div onDragOver={e => { e.preventDefault(); setDropHighlight('none') }} onDragLeave={() => setDropHighlight(null)}
            onDrop={e => onDrop(e, undefined)}
            style={{ border: `2px dashed ${dropHighlight === 'none' ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
              borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 8,
              background: dropHighlight === 'none' ? 'var(--accent-gold-dim)' : 'transparent', transition: 'all 0.2s' }}>
            <Building2 size={24} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No entities — all income is pass-through</div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            {entitySummaries.map(({ entity, streams, totalIncome, isScorp, salary }) => {
              const sel = selectedNodeId === `entity-${entity.id}`
              const isDrop = dropHighlight === entity.id
              return (
                <div key={entity.id} onClick={() => openEntityPanel(entity)}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropHighlight(entity.id) }}
                  onDragLeave={() => setDropHighlight(null)} onDrop={e => onDrop(e, entity.id)}
                  style={{
                    background: isDrop ? 'var(--accent-gold-dim)' : sel ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                    border: `${isDrop ? '2px dashed' : '1px solid'} ${isDrop ? 'var(--accent-gold)' : sel ? '#d4a843' : 'var(--border-subtle)'}`,
                    borderRadius: 14, padding: '16px 20px', cursor: 'pointer',
                    minWidth: 240, maxWidth: 380, flex: '1 1 280px', transition: 'all 0.2s',
                    boxShadow: sel ? '0 0 24px rgba(212,168,67,0.12)' : 'none',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: isScorp ? 'var(--accent-gold-dim)' : 'var(--accent-blue-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: isScorp ? 'var(--accent-gold)' : 'var(--accent-blue)' }}>
                      <Building2 size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{entity.name || ENTITY_TYPE_LABELS[entity.type]}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ENTITY_TYPE_LABELS[entity.type]} · {entity.state}</div>
                    </div>
                    <ChevronRight size={14} color="var(--text-muted)" />
                  </div>

                  {streams.length === 0 ? (
                    <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-hover)',
                      border: '1px dashed var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                      Drop income streams here
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {streams.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: 'var(--bg-hover)', fontSize: 11 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: INCOME_COLORS[s.type] || '#888' }} />
                          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{s.name || s.type}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: INCOME_COLORS[s.type] }}>{fmtK(s.annualAmount)}</span>
                          <button onClick={e => { e.stopPropagation(); unlinkIncome(s.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', display: 'flex' }} title="Unlink">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: '#d4a843' }}>{fmt(totalIncome)}</span>
                  </div>

                  {isScorp && totalIncome > 0 && salary && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-void)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>S-CORP SPLIT</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--accent-blue)', marginBottom: 2 }}>Salary</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--accent-blue)' }}>{fmtK(salary.recommendedSalary)}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>FICA: {fmtK(salary.seTaxOnSalary)}</div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-subtle)' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--accent-emerald)', marginBottom: 2 }}>Distributions</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--accent-emerald)' }}>{fmtK(salary.distributions)}</div>
                          <div style={{ fontSize: 9, color: 'var(--accent-emerald)' }}>No FICA ✓</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, textAlign: 'center', fontSize: 10, color: 'var(--accent-gold)' }}>
                        <Sparkles size={10} /> Saves ~{fmt(salary.seTaxSavings)}/yr in FICA
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {unassignedStreams.length > 0 && (
              <div onDragOver={e => { e.preventDefault(); setDropHighlight('unassigned') }}
                onDragLeave={() => setDropHighlight(null)} onDrop={e => onDrop(e, undefined)}
                style={{ background: dropHighlight === 'unassigned' ? 'rgba(96,165,250,0.08)' : 'var(--bg-elevated)',
                  border: `1px ${dropHighlight === 'unassigned' ? 'dashed' : 'solid'} ${dropHighlight === 'unassigned' ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  borderRadius: 14, padding: '16px 20px', minWidth: 200, maxWidth: 280, flex: '0 1 240px', opacity: 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <User size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Personal / Unassigned</span>
                </div>
                {unassignedStreams.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 5, background: 'var(--bg-hover)', fontSize: 11, marginBottom: 3 }}>
                    <div style={{ width: 5, height: 5, borderRadius: 3, background: INCOME_COLORS[s.type] || '#888' }} />
                    <span style={{ flex: 1, color: 'var(--text-muted)' }}>{s.name || s.type}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{fmtK(s.annualAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <FlowArrow color="var(--accent-red)" />

        {/* ── LAYER 3: Taxes ─────────────────────────────────────────── */}
        <LayerHeader label="Tax Obligations" />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {taxReport.federalIncomeTax > 0 && <TaxNode label="Federal Income Tax" sublabel={`${(taxReport.effectiveRate * 100).toFixed(1)}% effective`} amount={taxReport.federalIncomeTax} color="#f87171" icon={<Landmark size={14} />} />}
          {taxReport.selfEmploymentTax > 0 && <TaxNode label={entitySummaries.some(e => e.isScorp) ? 'FICA (salary only)' : 'Self-Employment Tax'} sublabel={entitySummaries.some(e => e.isScorp) ? 'Reduced via S-Corp' : '15.3% of SE income'} amount={taxReport.selfEmploymentTax} color="#a78bfa" icon={<Shield size={14} />} />}
          {taxReport.stateTax > 0 && <TaxNode label={`${state.profile.state} State Tax`} amount={taxReport.stateTax} color="#fbbf24" icon={<Landmark size={14} />} />}
        </div>

        <FlowArrow color="var(--accent-emerald)" />

        {/* ── LAYER 4: Net ───────────────────────────────────────────── */}
        <LayerHeader label="Net to You" />
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-emerald-dim)',
          borderRadius: 14, padding: '16px 24px', display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-emerald-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-emerald)' }}>
            <Wallet size={20} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>After-Tax Income</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent-emerald)' }}>{fmt(taxReport.afterTaxIncome)}</div>
          </div>
          <div style={{ marginLeft: 16, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Retention</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600 }}>{totalRevenue > 0 ? ((taxReport.afterTaxIncome / totalRevenue) * 100).toFixed(1) : 0}%</div>
          </div>
        </div>

        {/* ── Labor Intelligence ──────────────────────────────────────── */}
        {laborRecs.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowRecs(!showRecs)}>
              <span className="card-title"><Brain size={16} /> Labor Income Intelligence</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>{laborRecs.length} rec{laborRecs.length > 1 ? 's' : ''}</span>
                {showRecs ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
              </div>
            </div>
            {showRecs && (
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {laborRecs.map((rec, i) => (
                  <div key={i} style={{ padding: '12px 16px', borderRadius: 10,
                    background: rec.priority === 'high' ? 'var(--accent-gold-dim)' : 'var(--bg-hover)',
                    border: `1px solid ${rec.priority === 'high' ? 'var(--accent-gold-glow)' : 'var(--border-subtle)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        background: rec.priority === 'high' ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: rec.priority === 'high' ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                        {rec.priority === 'high' ? <Zap size={14} /> : rec.priority === 'medium' ? <Info size={14} /> : <Target size={14} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{rec.incomeName}</span>
                          <span className="pill" style={{ fontSize: 9, padding: '1px 6px',
                            background: rec.priority === 'high' ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                            color: rec.priority === 'high' ? 'var(--accent-gold)' : 'var(--text-muted)' }}>{rec.priority}</span>
                          {rec.estimatedSavings > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>+{fmt(rec.estimatedSavings)}/yr</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{rec.reason}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => applyRec(rec)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6,
                              background: rec.priority === 'high' ? 'var(--accent-gold)' : 'var(--bg-elevated)',
                              color: rec.priority === 'high' ? '#0c0e12' : 'var(--text-primary)',
                              border: rec.priority === 'high' ? 'none' : '1px solid var(--border-subtle)',
                              fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            <Sparkles size={11} /> {rec.action}
                          </button>
                          {rec.math?.breakdown && rec.math.breakdown.length > 0 && (
                            <button onClick={() => setExpandedMath(expandedMath === rec.incomeId ? null : rec.incomeId)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6,
                                background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
                                fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                              <Calculator size={10} /> {expandedMath === rec.incomeId ? 'Hide Math' : 'Show Math'}
                            </button>
                          )}
                        </div>
                        {/* Math transparency breakdown */}
                        {expandedMath === rec.incomeId && rec.math?.breakdown && (
                          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8,
                            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-gold)', textTransform: 'uppercase',
                              letterSpacing: '0.08em', marginBottom: 8 }}>Calculation Breakdown</div>
                            {rec.math.breakdown.map((line, j) => (
                              <div key={j} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: 'var(--font-mono)',
                                paddingLeft: 8, borderLeft: `2px solid ${j === rec.math!.breakdown!.length - 1 ? 'var(--accent-emerald)' : 'var(--border-subtle)'}` }}>
                                {line}
                              </div>
                            ))}
                            {rec.math.netBenefit !== undefined && (
                              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6,
                                background: rec.math.netBenefit > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,107,107,0.08)',
                                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)',
                                color: rec.math.netBenefit > 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                                Net: {rec.math.netBenefit > 0 ? '+' : ''}{fmt(rec.math.netBenefit)}/yr
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tax Waterfall + Structure Analysis */}
        <div className="grid-2" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Tax Waterfall</span></div>
            <div className="card-body">
              {[
                { label: 'Gross Revenue', amount: totalRevenue, color: 'var(--accent-gold)' },
                { label: 'Deductions', amount: -(totalRevenue - taxReport.taxableIncome - taxReport.selfEmploymentTax * 0.5), color: 'var(--accent-blue)' },
                { label: 'Federal Tax', amount: -taxReport.federalIncomeTax, color: 'var(--accent-red)' },
                { label: 'SE/FICA', amount: -taxReport.selfEmploymentTax, color: 'var(--accent-purple)' },
                { label: `${state.profile.state} State`, amount: -taxReport.stateTax, color: 'var(--accent-amber)' },
                ...((taxReport.w2FederalWithheld > 0 || taxReport.w2StateWithheld > 0) ? [
                  { label: 'W-2 Withheld', amount: taxReport.w2FederalWithheld + taxReport.w2StateWithheld, color: 'var(--accent-blue)' },
                  { label: taxReport.netTaxOwed <= 0 ? 'Est. Refund' : 'Net Still Owed', amount: taxReport.netTaxOwed <= 0 ? Math.abs(taxReport.netTaxOwed) : -taxReport.netTaxOwed, color: taxReport.netTaxOwed <= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' },
                ] : []),
                { label: 'Net Income', amount: taxReport.afterTaxIncome, color: 'var(--accent-emerald)' },
              ].map((item, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ width: 4, height: 22, borderRadius: 2, background: item.color }} />
                  <span style={{ flex: 1, fontSize: 13, color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === arr.length - 1 ? 600 : 400 }}>{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: item.amount < 0 ? 'var(--accent-red)' : item.color }}>
                    {item.amount < 0 ? '-' : ''}{fmt(Math.abs(item.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Structure Analysis</span></div>
            <div className="card-body">
              {entitySummaries.map(({ entity, totalIncome, isScorp, salary, streams }) => (
                <div key={entity.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-hover)', marginBottom: 8, cursor: 'pointer' }}
                  onClick={() => openEntityPanel(entity)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Building2 size={13} color={isScorp ? 'var(--accent-gold)' : 'var(--accent-blue)'} />
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{entity.name || ENTITY_TYPE_LABELS[entity.type]}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-gold)' }}>{fmt(totalIncome)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {streams.length} stream{streams.length !== 1 ? 's' : ''} · {ENTITY_TYPE_LABELS[entity.type]}
                    {isScorp && salary && <span style={{ color: 'var(--accent-emerald)' }}> · Saves {fmt(salary.seTaxSavings)}/yr</span>}
                  </div>
                </div>
              ))}
              {activeEntities.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No entities — all pass-through.</div>
              )}
              <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-surface)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>Flow Efficiency</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Retained</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                    {totalRevenue > 0 ? ((taxReport.afterTaxIncome / totalRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="progress-bar" style={{ height: 6, borderRadius: 3 }}>
                  <div className="progress-fill" style={{ width: `${totalRevenue > 0 ? (taxReport.afterTaxIncome / totalRevenue) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, #f87171 0%, #fbbf24 40%, #34d399 80%)', borderRadius: 3 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SLIDE-OUT PANEL ──────────────────────────────────────────── */}
      {panelMode !== 'closed' && (
        <div style={{ width: 380, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-primary)',
          overflowY: 'auto', padding: '20px 24px', flexShrink: 0, animation: 'slideInRight 0.2s ease-out' }}>
          {panelMode === 'entity' && panelData && (
            <EntityPanel entity={panelData} streams={entityIncomeMap[panelData.id] || []}
              entities={activeEntities} onSave={saveEntity} onDelete={deleteEntity}
              onClose={() => { setPanelMode('closed'); setSelectedNodeId(null) }} fmt={fmt} fmtK={fmtK} />
          )}
          {panelMode === 'income' && panelData && (
            <IncomePanel stream={panelData} entities={activeEntities}
              onSave={saveIncome} onClose={() => { setPanelMode('closed'); setSelectedNodeId(null) }}
              onAssign={entityId => {
                updateState(prev => ({ ...prev, incomeStreams: prev.incomeStreams.map(s => s.id === panelData.id ? { ...s, entityId } : s) }))
                setPanelData((p: any) => ({ ...p, entityId }))
              }} fmt={fmt} />
          )}
          {panelMode === 'add-entity' && (
            <AddEntityPanel suggestedType={panelData?.suggestedType} suggestedName={panelData?.suggestedName}
              linkIncomeId={panelData?.linkIncomeId} profileState={state.profile.state}
              onAdd={addEntity} onClose={() => { setPanelMode('closed'); setSelectedNodeId(null) }} />
          )}
          {panelMode === 'labor-intelligence' && (
            <div>
              <PanelHeader title="Labor Intelligence" onClose={() => setPanelMode('closed')} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                Fortuna analyzed your income streams and entity structure for optimal labor income routing.
              </p>
              {laborRecs.map((rec, i) => (
                <div key={i} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{rec.incomeName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>{rec.reason}</div>
                  {rec.estimatedSavings > 0 && <div style={{ fontSize: 12, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>+{fmt(rec.estimatedSavings)}/yr</div>}
                  <button onClick={() => applyRec(rec)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none',
                    background: 'var(--accent-gold)', color: '#0c0e12', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{rec.action}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes slideInRight { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  )
}

// ─── Shared Sub-Components ──────────────────────────────────────────────

function LayerHeader({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  )
}

function FlowArrow({ color }: { color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 2, height: 16, background: color || 'var(--border-medium)' }} />
        <ArrowDown size={14} color={color || 'var(--text-muted)'} />
      </div>
    </div>
  )
}

function TaxNode({ label, sublabel, amount, color, icon }: { label: string; sublabel?: string; amount: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 16px', minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
          {sublabel && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sublabel}</div>}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color }}>-${amount.toLocaleString()}</div>
    </div>
  )
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{title}</h3>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
    </div>
  )
}

function PanelInput({ label, value, onChange, ...props }: { label: string; value: string | number; onChange: (v: string) => void; [k: string]: any }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} {...props} />
    </div>
  )
}

// ─── Entity Detail Panel ────────────────────────────────────────────────

function EntityPanel({ entity, streams, entities, onSave, onDelete, onClose, fmt, fmtK }: {
  entity: LegalEntity; streams: IncomeStream[]; entities: LegalEntity[]
  onSave: (e: LegalEntity) => void; onDelete: (id: string) => void; onClose: () => void
  fmt: (n: number) => string; fmtK: (n: number) => string
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(entity)
  const [confirmDel, setConfirmDel] = useState(false)
  const totalIncome = streams.reduce((s, r) => s + r.annualAmount, 0)
  const isScorp = form.type === 'llc_scorp' || form.type === 'scorp'

  useEffect(() => { setForm(entity); setEditing(false); setConfirmDel(false) }, [entity])

  const upd = (partial: Partial<LegalEntity>) => { setForm(prev => ({ ...prev, ...partial })); setEditing(true) }

  return (
    <div>
      <PanelHeader title="Entity Details" onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <PanelInput label="Entity Name" value={form.name} onChange={v => upd({ name: v })} placeholder="Entity name" />
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Entity Type</label>
          <select value={form.type} onChange={e => { upd({ type: e.target.value as any }) }}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            {ENTITY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><PanelInput label="State" value={form.state} onChange={v => upd({ state: v.toUpperCase().slice(0, 2) })} maxLength={2} /></div>
          <div style={{ flex: 1 }}><PanelInput label="Annual Cost" value={form.annualCost} onChange={v => upd({ annualCost: Number(v) })} type="number" /></div>
        </div>
        <PanelInput label="EIN" value={form.einNumber || ''} onChange={v => upd({ einNumber: v })} placeholder="XX-XXXXXXX" />
        <PanelInput label="Formation Date" value={form.formationDate || ''} onChange={v => upd({ formationDate: v })} type="date" />
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 500 }}>Income Streams ({streams.length})</div>
      {streams.length === 0
        ? <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12, background: 'var(--bg-hover)', borderRadius: 8, textAlign: 'center', marginBottom: 12 }}>No income assigned.</div>
        : <div style={{ marginBottom: 12 }}>
            {streams.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-hover)', marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: INCOME_COLORS[s.type] }} />
                <span style={{ flex: 1, fontSize: 12 }}>{s.name || s.type}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{fmt(s.annualAmount)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Total</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent-gold)' }}>{fmt(totalIncome)}</span>
            </div>
          </div>
      }

      {isScorp && totalIncome > 0 && (() => {
        const sa = calculateReasonableSalary(totalIncome)
        return (
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 600 }}><Zap size={11} /> S-Corp Analysis</div>
            {[
              { l: 'Reasonable Salary', v: sa.recommendedSalary, c: 'var(--accent-blue)' },
              { l: 'Distributions', v: sa.distributions, c: 'var(--accent-emerald)' },
              { l: 'FICA on Salary', v: -sa.seTaxOnSalary, c: 'var(--accent-red)' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{r.l}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: r.c }}>{r.v < 0 ? '-' : ''}{fmt(Math.abs(r.v))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 6, marginTop: 4 }}>
              <span style={{ fontWeight: 500, color: 'var(--accent-emerald)' }}>Annual FICA Savings</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-emerald)' }}>+{fmt(sa.seTaxSavings)}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              Risk: <span style={{ color: sa.riskLevel === 'low' ? 'var(--accent-emerald)' : sa.riskLevel === 'moderate' ? 'var(--accent-amber)' : 'var(--accent-red)' }}>{sa.riskLevel}</span>
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 8 }}>
        {editing && (
          <button onClick={() => onSave(form)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none',
            background: 'var(--accent-gold)', color: '#0c0e12', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Check size={14} /> Save</button>
        )}
        {!confirmDel
          ? <button onClick={() => setConfirmDel(true)} style={{ padding: '10px 16px', borderRadius: 8,
              background: 'var(--accent-red-dim)', border: '1px solid rgba(239,107,107,0.2)', color: 'var(--accent-red)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Trash2 size={14} /> Delete</button>
          : <button onClick={() => onDelete(entity.id)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none',
              background: 'var(--accent-red)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><AlertTriangle size={14} /> Confirm Delete</button>
        }
      </div>
    </div>
  )
}

// ─── Income Detail Panel ────────────────────────────────────────────────

function IncomePanel({ stream, entities, onSave, onClose, onAssign, fmt }: {
  stream: IncomeStream; entities: LegalEntity[]; onSave: (s: IncomeStream) => void
  onClose: () => void; onAssign: (id: string | undefined) => void; fmt: (n: number) => string
}) {
  const [form, setForm] = useState(stream)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setForm(stream); setEditing(false) }, [stream])
  const upd = (partial: Partial<IncomeStream>) => { setForm(prev => ({ ...prev, ...partial })); setEditing(true) }

  return (
    <div>
      <PanelHeader title="Income Stream" onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <PanelInput label="Name" value={form.name} onChange={v => upd({ name: v })} />
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Type</label>
          <select value={form.type} onChange={e => { upd({ type: e.target.value as any }) }}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            {['business', 'w2', 'freelance', 'investment', 'rental', 'passive', 'other'].map(t =>
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <PanelInput label="Annual Amount" value={form.annualAmount} onChange={v => upd({ annualAmount: Number(v) })} type="number" />

        {/* W-2 specific fields */}
        {form.type === 'w2' && (
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, color: 'var(--accent-blue)', fontWeight: 500, marginBottom: 10 }}>W-2 Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PanelInput label="Employer Name" value={form.w2?.employerName || ''} onChange={v => upd({ w2: { ...form.w2, employerName: v } })} placeholder="Company" />
              <PanelInput label="Gross Salary" value={form.w2?.grossSalary || ''} onChange={v => upd({ w2: { ...form.w2, grossSalary: Number(v) } })} type="number" placeholder="Total comp before deductions" />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><PanelInput label="Fed. Withheld" value={form.w2?.federalWithholding || ''} onChange={v => upd({ w2: { ...form.w2, federalWithholding: Number(v) } })} type="number" placeholder="Box 2" /></div>
                <div style={{ flex: 1 }}><PanelInput label="State Withheld" value={form.w2?.stateWithholding || ''} onChange={v => upd({ w2: { ...form.w2, stateWithholding: Number(v) } })} type="number" placeholder="Box 17" /></div>
              </div>
              <PanelInput label="FICA Withheld" value={form.w2?.ficaWithheld || ''} onChange={v => upd({ w2: { ...form.w2, ficaWithheld: Number(v) } })} type="number" placeholder={form.annualAmount ? `~${Math.round(form.annualAmount * 0.0765)}` : 'Box 4+6'} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><PanelInput label="401(k)" value={form.w2?.pretax401k || ''} onChange={v => upd({ w2: { ...form.w2, pretax401k: Number(v) } })} type="number" /></div>
                <div style={{ flex: 1 }}><PanelInput label="Health Ins." value={form.w2?.pretaxHealthInsurance || ''} onChange={v => upd({ w2: { ...form.w2, pretaxHealthInsurance: Number(v) } })} type="number" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><PanelInput label="HSA" value={form.w2?.pretaxHSA || ''} onChange={v => upd({ w2: { ...form.w2, pretaxHSA: Number(v) } })} type="number" /></div>
                <div style={{ flex: 1 }}><PanelInput label="Employer Match" value={form.w2?.employerMatch401k || ''} onChange={v => upd({ w2: { ...form.w2, employerMatch401k: Number(v) } })} type="number" /></div>
              </div>
            </div>
            {form.annualAmount > 0 && (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
                Est. employer FICA: ~{fmt(Math.round(form.annualAmount * 0.0765))} · Your FICA: ~{fmt(form.w2?.ficaWithheld || Math.round(form.annualAmount * 0.0765))}
              </div>
            )}
          </div>
        )}

        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notes</label>
          <textarea value={form.notes || ''} onChange={e => upd({ notes: e.target.value })} rows={3}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, resize: 'vertical', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 500 }}>Entity Assignment</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        <EntityAssignBtn selected={!form.entityId} onClick={() => onAssign(undefined)} label="Personal / Unassigned" icon={<User size={14} />} />
        {entities.map(e => (
          <EntityAssignBtn key={e.id} selected={form.entityId === e.id} onClick={() => onAssign(e.id)}
            label={e.name || ENTITY_TYPE_LABELS[e.type]} sublabel={ENTITY_TYPE_LABELS[e.type]} icon={<Building2 size={14} />} />
        ))}
      </div>

      {editing && (
        <button onClick={() => onSave(form)} style={{ width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
          background: 'var(--accent-gold)', color: '#0c0e12', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Check size={14} /> Save</button>
      )}
    </div>
  )
}

function EntityAssignBtn({ selected, onClick, label, sublabel, icon }: {
  selected: boolean; onClick: () => void; label: string; sublabel?: string; icon: React.ReactNode
}) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
      border: `1px solid ${selected ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
      background: selected ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
      cursor: 'pointer', color: 'var(--text-primary)', fontSize: 12, textAlign: 'left' as const }}>
      {icon} <span style={{ flex: 1 }}>{label}</span>
      {sublabel && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sublabel}</span>}
      {selected && <Check size={14} color="var(--accent-gold)" />}
    </button>
  )
}

// ─── Add Entity Panel ───────────────────────────────────────────────────

function AddEntityPanel({ suggestedType, suggestedName, linkIncomeId, profileState, onAdd, onClose }: {
  suggestedType?: string; suggestedName?: string; linkIncomeId?: string; profileState: string
  onAdd: (entity: Omit<LegalEntity, 'id'>, linkIncomeId?: string) => void; onClose: () => void
}) {
  const costs: Record<string, number> = { sole_prop: 0, llc: 300, llc_scorp: 2500, scorp: 2500, ccorp: 3000, partnership: 500 }
  const [form, setForm] = useState({
    name: suggestedName || '', type: (suggestedType || 'llc') as LegalEntity['type'],
    state: profileState || 'IL', einNumber: '', formationDate: '',
    annualCost: costs[suggestedType || 'llc'] || 300, isActive: true,
  })

  return (
    <div>
      <PanelHeader title="New Entity" onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <PanelInput label="Entity Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="My Business LLC" autoFocus />
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Entity Type</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ENTITY_TYPES.map(([v, l]) => (
              <EntityAssignBtn key={v} selected={form.type === v} onClick={() => setForm(f => ({ ...f, type: v as any, annualCost: costs[v] || 300 }))}
                label={l} icon={<Building2 size={14} color={form.type === v ? 'var(--accent-gold)' : 'var(--text-muted)'} />} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><PanelInput label="State" value={form.state} onChange={v => setForm(f => ({ ...f, state: v.toUpperCase().slice(0, 2) }))} maxLength={2} /></div>
          <div style={{ flex: 1 }}><PanelInput label="Est. Annual Cost" value={form.annualCost} onChange={v => setForm(f => ({ ...f, annualCost: Number(v) }))} type="number" /></div>
        </div>
      </div>
      <button onClick={() => onAdd(form, linkIncomeId)}
        style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: 'none', background: 'var(--accent-gold)', color: '#0c0e12',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Plus size={16} /> Create Entity
      </button>
      {linkIncomeId && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-emerald)', textAlign: 'center' }}><Link2 size={11} /> Will auto-link income stream</div>
      )}
    </div>
  )
}
