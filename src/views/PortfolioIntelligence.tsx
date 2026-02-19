// ─── Portfolio Intelligence ─────────────────────────────────────────────────
// UIF-powered context bridge for importing/exporting financial context across
// the AEGIS ecosystem. Handles crypto positions, speculative assets, opportunity
// pipeline, and structured analysis import from external sources.
//
// UIF Layer Mapping:
//   L1 UIE Envelopes → Standardized financial context containers
//   L2 API           → Import (paste/upload) + Export (JSON/clipboard)
//   L3 Shared Svc    → Asset valuation, tax classification, risk scoring
//   L4 Events        → Position changes, TGE alerts, tax triggers
//   L5 AI Orch       → Auto-classify, strategy detection, tax implications

import { useState, useEffect, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  Briefcase, Plus, Trash2, Upload, Download, Copy, Check,
  TrendingUp, TrendingDown, AlertTriangle, Zap, Globe, Shield,
  DollarSign, Clock, Tag, ChevronDown, ChevronRight, Search,
  FileText, Link2, ArrowRightLeft, Sparkles, Target, Eye,
  Wallet, PiggyBank, BarChart3, RefreshCw, ExternalLink, FileUp,
  Table2, CheckCircle2, XCircle, Loader2, Info,
} from 'lucide-react'
import { STATE_TAX_RATES, calculateFederalIncomeTax, calculateSelfEmploymentTax } from '../engine/tax-calculator'
import {
  importCSV, detectFormat, autoMapColumns, SUPPORTED_FORMATS,
  type ImportResult, type SupportedFormat, type ColumnMapping, type ImportedPosition, type ImportedTaxEvent,
} from '../engine/csv-import'

// ─── UIE Envelope Types ─────────────────────────────────────────────────────

interface UIEEnvelope {
  _format: 'uie-financial-context'
  _version: 1
  _created: string
  _source: string
  _sourceRef?: string // link to originating chat/analysis
  positions: PortfolioPosition[]
  opportunities: OpportunityAnalysis[]
  taxEvents: TaxEvent[]
  contextNotes: string
}

type AssetClass = 'crypto' | 'defi' | 'nft' | 'equity' | 'commodity' | 'real_estate' | 'speculative' | 'other'
type PositionStatus = 'active' | 'pending' | 'exited' | 'locked' | 'staking'
type TaxTreatment = 'ordinary_income' | 'short_term_cg' | 'long_term_cg' | 'mining_income' | 'airdrop' | 'staking_reward' | 'unknown'

interface PortfolioPosition {
  id: string
  name: string
  ticker?: string
  assetClass: AssetClass
  status: PositionStatus
  quantity: number
  costBasis: number           // total cost basis in USD
  currentValue: number        // current estimated value in USD
  acquiredDate?: string
  notes: string
  taxTreatment: TaxTreatment
  tags: string[]
  riskScore: number           // 1-10
  // Crypto-specific
  chain?: string
  wallet?: string
  isLocked?: boolean
  unlockDate?: string
  // Source tracking (UIF L1)
  sourceEnvelope?: string     // which import envelope brought this in
}

interface OpportunityAnalysis {
  id: string
  title: string
  summary: string
  status: 'watching' | 'researching' | 'ready' | 'active' | 'exited' | 'passed'
  estimatedValue: number
  confidence: number          // 0-100
  timeHorizon: string
  taxImplications: string
  actionItems: string[]
  sourceRef?: string          // URL or chat link
  created: string
  tags: string[]
}

interface TaxEvent {
  id: string
  type: 'airdrop' | 'tge' | 'vest' | 'sale' | 'conversion' | 'staking_reward' | 'mining' | 'income' | 'loss'
  description: string
  estimatedAmount: number
  taxTreatment: TaxTreatment
  expectedDate?: string
  realized: boolean
  positionId?: string
  notes: string
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fortuna:portfolio-intelligence'

interface PortfolioData {
  positions: PortfolioPosition[]
  opportunities: OpportunityAnalysis[]
  taxEvents: TaxEvent[]
  envelopeHistory: { imported: string; source: string; positionCount: number; date: string }[]
}

function loadPortfolio(): PortfolioData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return { positions: [], opportunities: [], taxEvents: [], envelopeHistory: [] }
}

function savePortfolio(data: PortfolioData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function genId() { return Math.random().toString(36).slice(2, 10) }

// ─── Asset Class Config ─────────────────────────────────────────────────────

const ASSET_CLASSES: Record<AssetClass, { label: string; emoji: string; color: string }> = {
  crypto:       { label: 'Cryptocurrency',   emoji: '₿',  color: '#f7931a' },
  defi:         { label: 'DeFi Position',    emoji: '🔗', color: '#627eea' },
  nft:          { label: 'NFT',              emoji: '🖼️', color: '#e040fb' },
  equity:       { label: 'Equity / Stock',   emoji: '📈', color: '#10b981' },
  commodity:    { label: 'Commodity',         emoji: '🥇', color: '#fbbf24' },
  real_estate:  { label: 'Real Estate',      emoji: '🏠', color: '#8b5cf6' },
  speculative:  { label: 'Speculative',      emoji: '🎯', color: '#ef4444' },
  other:        { label: 'Other',            emoji: '📦', color: '#6b7280' },
}

const TAX_TREATMENTS: Record<TaxTreatment, { label: string; description: string }> = {
  ordinary_income:  { label: 'Ordinary Income',    description: 'Taxed at marginal income tax rate' },
  short_term_cg:    { label: 'Short-Term Cap Gain', description: 'Held < 1 year, taxed as ordinary income' },
  long_term_cg:     { label: 'Long-Term Cap Gain',  description: 'Held > 1 year, 0%/15%/20% rate' },
  mining_income:    { label: 'Mining Income',        description: 'FMV at receipt = ordinary income + SE tax' },
  airdrop:          { label: 'Airdrop',              description: 'FMV at receipt = ordinary income' },
  staking_reward:   { label: 'Staking Reward',       description: 'FMV at receipt = ordinary income' },
  unknown:          { label: 'Unknown / TBD',        description: 'Tax treatment not yet determined' },
}

const POSITION_STATUSES: Record<PositionStatus, { label: string; color: string }> = {
  active:  { label: 'Active',  color: '#10b981' },
  pending: { label: 'Pending', color: '#f59e0b' },
  exited:  { label: 'Exited',  color: '#6b7280' },
  locked:  { label: 'Locked',  color: '#ef4444' },
  staking: { label: 'Staking', color: '#8b5cf6' },
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PortfolioIntelligence() {
  const { state, updateState } = useFortuna()

  // Hydrate from FortunaState investments, fall back to localStorage for migration
  const initPortfolio = (): PortfolioData => {
    // If FortunaState has investments, use those as source of truth
    if (state.investments && state.investments.length > 0) {
      const positions: PortfolioPosition[] = state.investments.map(inv => ({
        id: inv.id,
        name: inv.name,
        ticker: inv.symbol,
        assetClass: (inv.type === 'crypto' ? 'crypto' : inv.type === 'real_estate' ? 'real_estate' : inv.type === 'stock' || inv.type === 'etf' ? 'equity' : 'other') as AssetClass,
        quantity: inv.quantity,
        costBasis: inv.costBasis,
        currentValue: inv.currentValue || 0,
        acquiredDate: inv.acquisitionDate,
        status: 'active' as PositionStatus,
        taxTreatment: (inv.isLongTerm ? 'long_term_cg' : 'short_term_cg') as TaxTreatment,
        wallet: '',
        notes: '',
        tags: [],
        riskScore: 5,
      }))
      return {
        positions,
        opportunities: state.portfolioOpportunities || [],
        taxEvents: state.portfolioTaxEvents || [],
        envelopeHistory: [],
      }
    }
    // Migrate from localStorage
    return loadPortfolio()
  }

  const [data, setData] = useState<PortfolioData>(initPortfolio)
  const [activeTab, setActiveTab] = useState<'positions' | 'opportunities' | 'taxevents' | 'bridge' | 'import'>('positions')
  
  // CSV Import state
  const [csvStep, setCsvStep] = useState<'select' | 'upload' | 'map' | 'preview' | 'done'>('select')
  const [csvFormat, setCsvFormat] = useState<SupportedFormat | null>(null)
  const [csvResult, setCsvResult] = useState<ImportResult | null>(null)
  const [csvMapping, setCsvMapping] = useState<ColumnMapping>({})
  const [csvRawText, setCsvRawText] = useState('')
  const [csvDragOver, setCsvDragOver] = useState(false)

  // CSV import processor
  const processImport = (text: string) => {
    const result = importCSV(text, csvFormat || undefined)
    setCsvResult(result)
    if (result.format === 'custom' && result.positions.length === 0 && result.taxEvents.length === 0) {
      setCsvMapping(autoMapColumns(result.rawHeaders))
      setCsvStep('map')
    } else {
      setCsvStep('preview')
    }
  }

  const confirmImport = () => {
    if (!csvResult) return
    const newPositions = csvResult.positions.map(pos => ({
      id: genId(),
      name: pos.name,
      ticker: pos.ticker,
      assetClass: pos.assetClass,
      status: 'active' as const,
      quantity: pos.quantity,
      costBasis: pos.costBasis,
      currentValue: pos.currentValue,
      acquiredDate: pos.acquiredDate,
      notes: pos.notes,
      taxTreatment: pos.taxTreatment,
      tags: pos.tags,
      riskScore: pos.riskScore,
      chain: pos.chain,
      wallet: pos.wallet,
      sourceEnvelope: `csv-import:${csvResult.source}:${new Date().toISOString()}`,
    }))
    const newTaxEvents = csvResult.taxEvents.map(evt => ({
      id: genId(),
      type: evt.type,
      description: evt.description,
      estimatedAmount: evt.estimatedAmount,
      taxTreatment: evt.taxTreatment,
      expectedDate: evt.expectedDate,
      realized: evt.realized,
      notes: evt.notes,
    }))
    setData(prev => ({
      ...prev,
      positions: [...prev.positions, ...newPositions],
      taxEvents: [...prev.taxEvents, ...newTaxEvents],
      envelopeHistory: [...prev.envelopeHistory, {
        imported: `CSV Import: ${csvResult.source}`,
        source: csvResult.format,
        positionCount: newPositions.length,
        date: new Date().toISOString(),
      }],
    }))
    setCsvStep('done')
  }
  const [importMode, setImportMode] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null)
  const [copiedExport, setCopiedExport] = useState(false)

  // Persist on change
  useEffect(() => {
    savePortfolio(data) // keep localStorage as backup
    // Sync to FortunaState.investments for cloud persistence + cross-engine access
    const investments = data.positions.map(p => ({
      id: p.id,
      symbol: p.ticker || p.name,
      name: p.name,
      type: (p.assetClass === 'crypto' ? 'crypto' : p.assetClass === 'real_estate' ? 'real_estate' : p.assetClass === 'equity' ? 'stock' : 'other') as 'stock' | 'etf' | 'mutual_fund' | 'bond' | 'crypto' | 'real_estate' | 'other',
      quantity: p.quantity,
      costBasis: p.costBasis,
      currentValue: p.currentValue,
      acquisitionDate: p.acquiredDate || new Date().toISOString(),
      isLongTerm: p.taxTreatment === 'long_term_cg',
      entityId: 'personal',
      memberId: 'primary' as const,
      taxYear: new Date().getFullYear(),
      tags: [] as string[],
    }))
    updateState(s => ({ ...s, investments, portfolioOpportunities: data.opportunities, portfolioTaxEvents: data.taxEvents }))
  }, [data])

  // ─── Computed Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activePositions = data.positions.filter(p => p.status !== 'exited')
    const totalValue = activePositions.reduce((s, p) => s + p.currentValue, 0)
    const totalCostBasis = activePositions.reduce((s, p) => s + p.costBasis, 0)
    const totalGainLoss = totalValue - totalCostBasis
    const unrealizedTaxEvents = data.taxEvents.filter(e => !e.realized)
    const estimatedTaxableEvents = unrealizedTaxEvents.reduce((s, e) => s + e.estimatedAmount, 0)
    const watchingOpps = data.opportunities.filter(o => o.status === 'watching' || o.status === 'researching')

    // Estimate tax impact using user's profile
    const marginalRate = 0.24 + (STATE_TAX_RATES[state.profile.state]?.rate || 0)
    const estimatedTaxLiability = estimatedTaxableEvents * marginalRate

    // Risk distribution
    const highRisk = activePositions.filter(p => p.riskScore >= 7).length
    const medRisk = activePositions.filter(p => p.riskScore >= 4 && p.riskScore < 7).length
    const lowRisk = activePositions.filter(p => p.riskScore < 4).length

    return {
      activePositions: activePositions.length, totalValue, totalCostBasis, totalGainLoss,
      unrealizedEvents: unrealizedTaxEvents.length, estimatedTaxableEvents,
      estimatedTaxLiability, watchingOpps: watchingOpps.length,
      highRisk, medRisk, lowRisk, marginalRate,
    }
  }, [data, state.profile.state])

  // ─── UIE Import ─────────────────────────────────────────────────────
  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText.trim())

      if (parsed._format === 'uie-financial-context') {
        // Full UIE envelope import
        const envelope = parsed as UIEEnvelope
        const newPositions = (envelope.positions || []).map(p => ({ ...p, id: genId(), sourceEnvelope: envelope._source }))
        const newOpps = (envelope.opportunities || []).map(o => ({ ...o, id: genId() }))
        const newEvents = (envelope.taxEvents || []).map(e => ({ ...e, id: genId() }))

        setData(prev => ({
          ...prev,
          positions: [...prev.positions, ...newPositions],
          opportunities: [...prev.opportunities, ...newOpps],
          taxEvents: [...prev.taxEvents, ...newEvents],
          envelopeHistory: [...prev.envelopeHistory, {
            imported: envelope._source,
            source: envelope._sourceRef || 'Manual import',
            positionCount: newPositions.length,
            date: new Date().toISOString(),
          }],
        }))

        setImportResult(`✅ Imported ${newPositions.length} positions, ${newOpps.length} opportunities, ${newEvents.length} tax events from "${envelope._source}"`)
      } else if (Array.isArray(parsed)) {
        // Array of positions
        const newPositions = parsed.map((p: any) => ({
          id: genId(),
          name: p.name || p.title || 'Unnamed',
          ticker: p.ticker || p.symbol || '',
          assetClass: p.assetClass || p.type || 'speculative' as AssetClass,
          status: p.status || 'active' as PositionStatus,
          quantity: p.quantity || p.amount || 0,
          costBasis: p.costBasis || 0,
          currentValue: p.currentValue || p.value || 0,
          notes: p.notes || '',
          taxTreatment: p.taxTreatment || 'unknown' as TaxTreatment,
          tags: p.tags || [],
          riskScore: p.riskScore || 5,
        }))
        setData(prev => ({ ...prev, positions: [...prev.positions, ...newPositions] }))
        setImportResult(`✅ Imported ${newPositions.length} positions`)
      } else if (parsed.name || parsed.title) {
        // Single position
        const pos: PortfolioPosition = {
          id: genId(),
          name: parsed.name || parsed.title,
          ticker: parsed.ticker || parsed.symbol || '',
          assetClass: parsed.assetClass || 'speculative',
          status: parsed.status || 'active',
          quantity: parsed.quantity || parsed.amount || 0,
          costBasis: parsed.costBasis || 0,
          currentValue: parsed.currentValue || parsed.value || 0,
          notes: parsed.notes || parsed.summary || '',
          taxTreatment: parsed.taxTreatment || 'unknown',
          tags: parsed.tags || [],
          riskScore: parsed.riskScore || 5,
        }
        setData(prev => ({ ...prev, positions: [...prev.positions, pos] }))
        setImportResult(`✅ Imported position: ${pos.name}`)
      } else {
        setImportResult('⚠️ Unrecognized format. Use UIE envelope, position array, or single position object.')
      }
    } catch {
      setImportResult('❌ Invalid JSON. Paste a UIE envelope, position array, or single position object.')
    }

    setTimeout(() => setImportResult(null), 5000)
  }

  // ─── UIE Export ─────────────────────────────────────────────────────
  const generateExportEnvelope = (): UIEEnvelope => {
    return {
      _format: 'uie-financial-context',
      _version: 1,
      _created: new Date().toISOString(),
      _source: 'Fortuna Engine — Portfolio Intelligence',
      positions: data.positions,
      opportunities: data.opportunities,
      taxEvents: data.taxEvents,
      contextNotes: `Financial profile: ${state.profile.name}, ${STATE_TAX_RATES[state.profile.state]?.name}, ${state.profile.filingStatus}. ` +
        `Total income: $${state.incomeStreams.reduce((s, i) => s + i.annualAmount, 0).toLocaleString()}. ` +
        `Entities: ${state.entities.map(e => e.name || e.type).join(', ') || 'None'}. ` +
        `Portfolio: ${data.positions.filter(p => p.status !== 'exited').length} active positions, ` +
        `$${stats.totalValue.toLocaleString()} estimated value, ` +
        `${stats.unrealizedEvents} pending tax events ($${Math.round(stats.estimatedTaxableEvents).toLocaleString()} est. taxable).`,
    }
  }

  const handleExport = () => {
    const envelope = generateExportEnvelope()
    navigator.clipboard.writeText(JSON.stringify(envelope, null, 2))
    setCopiedExport(true)
    setTimeout(() => setCopiedExport(false), 3000)
  }

  // ─── Filtering ──────────────────────────────────────────────────────
  const filteredPositions = data.positions.filter(p =>
    !searchTerm ||
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // ─── Add Helpers ────────────────────────────────────────────────────
  const addPosition = () => {
    setData(prev => ({
      ...prev,
      positions: [...prev.positions, {
        id: genId(), name: '', assetClass: 'crypto', status: 'active',
        quantity: 0, costBasis: 0, currentValue: 0, notes: '',
        taxTreatment: 'unknown', tags: [], riskScore: 5,
      }],
    }))
  }

  const addOpportunity = () => {
    setData(prev => ({
      ...prev,
      opportunities: [...prev.opportunities, {
        id: genId(), title: '', summary: '', status: 'watching',
        estimatedValue: 0, confidence: 50, timeHorizon: '',
        taxImplications: '', actionItems: [], created: new Date().toISOString(), tags: [],
      }],
    }))
  }

  const addTaxEvent = () => {
    setData(prev => ({
      ...prev,
      taxEvents: [...prev.taxEvents, {
        id: genId(), type: 'airdrop', description: '', estimatedAmount: 0,
        taxTreatment: 'ordinary_income', realized: false, notes: '',
      }],
    }))
  }

  const updatePosition = (id: string, updates: Partial<PortfolioPosition>) => {
    setData(prev => ({
      ...prev,
      positions: prev.positions.map(p => p.id === id ? { ...p, ...updates } : p),
    }))
  }

  const removePosition = (id: string) => {
    setData(prev => ({ ...prev, positions: prev.positions.filter(p => p.id !== id) }))
  }

  const updateOpportunity = (id: string, updates: Partial<OpportunityAnalysis>) => {
    setData(prev => ({
      ...prev,
      opportunities: prev.opportunities.map(o => o.id === id ? { ...o, ...updates } : o),
    }))
  }

  const removeOpportunity = (id: string) => {
    setData(prev => ({ ...prev, opportunities: prev.opportunities.filter(o => o.id !== id) }))
  }

  const updateTaxEvent = (id: string, updates: Partial<TaxEvent>) => {
    setData(prev => ({
      ...prev,
      taxEvents: prev.taxEvents.map(e => e.id === id ? { ...e, ...updates } : e),
    }))
  }

  const removeTaxEvent = (id: string) => {
    setData(prev => ({ ...prev, taxEvents: prev.taxEvents.filter(e => e.id !== id) }))
  }

  // ─── Styles ─────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
    fontSize: 12, outline: 'none',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="view-enter" style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Briefcase size={22} />
          Portfolio Intelligence
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', marginLeft: 4 }}>UIF BRIDGE</span>
        </h1>
        <p className="section-subtitle">Import context from external analyses, track positions & opportunities, and export financial context for cross-solution strategy.</p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Portfolio Value', value: `$${Math.round(stats.totalValue).toLocaleString()}`, color: '#10b981', icon: <Wallet size={14} /> },
          { label: 'Gain / Loss', value: `${stats.totalGainLoss >= 0 ? '+' : ''}$${Math.round(stats.totalGainLoss).toLocaleString()}`, color: stats.totalGainLoss >= 0 ? '#10b981' : '#ef4444', icon: stats.totalGainLoss >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} /> },
          { label: 'Pending Tax Events', value: `${stats.unrealizedEvents}`, color: '#f59e0b', icon: <Clock size={14} /> },
          { label: 'Est. Tax Impact', value: `$${Math.round(stats.estimatedTaxLiability).toLocaleString()}`, color: '#ef4444', icon: <DollarSign size={14} /> },
          { label: 'Watching', value: `${stats.watchingOpps} opps`, color: '#8b5cf6', icon: <Eye size={14} /> },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: 'var(--bg-surface)', borderRadius: 10, padding: '12px 14px',
            border: '1px solid var(--border-subtle)', textAlign: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--text-muted)', marginBottom: 4 }}>
              {kpi.icon}
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{kpi.label}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: kpi.color, fontFamily: 'var(--font-mono)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* UIF Context Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 20,
        borderRadius: 10, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
      }}>
        <Link2 size={14} style={{ color: '#8b5cf6', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
          <strong style={{ color: '#8b5cf6' }}>UIF Context Bridge</strong> — Import analysis from any conversation or tool as UIE envelopes. Export your full financial context for use in AEGIS, IdeaForge, or any ecosystem solution.
        </span>
        <button onClick={() => setImportMode(!importMode)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}>
          <Upload size={12} /> Import
        </button>
        <button onClick={handleExport} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', gap: 4 }}>
          {copiedExport ? <Check size={12} /> : <Download size={12} />}
          {copiedExport ? 'Copied!' : 'Export'}
        </button>
      </div>

      {/* Import Panel */}
      {importMode && (
        <div className="card" style={{ marginBottom: 20, border: '1px solid rgba(139,92,246,0.2)' }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Upload size={16} /> Import UIE Envelope or Position Data
            </span>
            <button onClick={() => setImportMode(false)} className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}>Close</button>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                Paste a <strong>UIE envelope</strong> (full context from another solution), a <strong>JSON array</strong> of positions,
                or a <strong>single position object</strong>. The bridge will auto-detect the format and merge new data.
              </div>
              <textarea
                style={{ ...inputStyle, height: 140, fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical' }}
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={`// Example UIE Envelope:
{
  "_format": "uie-financial-context",
  "_version": 1,
  "_source": "DeNet Opportunity Analysis",
  "positions": [{
    "name": "$WN Tokens",
    "assetClass": "crypto",
    "quantity": 100000000,
    "currentValue": 0,
    "taxTreatment": "airdrop",
    "riskScore": 8,
    "tags": ["pre-TGE", "DeNet", "peaq"]
  }],
  "opportunities": [],
  "taxEvents": [{
    "type": "tge",
    "description": "DeNet TGE — $WN → $DENET conversion",
    "estimatedAmount": 0,
    "taxTreatment": "airdrop"
  }]
}`}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={handleImport} className="btn btn-primary" style={{ fontSize: 12, padding: '8px 16px' }} disabled={!importText.trim()}>
                <Zap size={13} /> Import & Merge
              </button>
              {importResult && (
                <span style={{ fontSize: 12, color: importResult.startsWith('✅') ? '#10b981' : importResult.startsWith('⚠️') ? '#f59e0b' : '#ef4444' }}>
                  {importResult}
                </span>
              )}
            </div>

            {/* Quick-import templates */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Quick Import Templates</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: '₿ Crypto Position', data: { name: '', assetClass: 'crypto', status: 'active', quantity: 0, costBasis: 0, currentValue: 0, taxTreatment: 'unknown', riskScore: 7, tags: ['crypto'] } },
                  { label: '🔗 DeFi / LP', data: { name: '', assetClass: 'defi', status: 'staking', quantity: 0, costBasis: 0, currentValue: 0, taxTreatment: 'staking_reward', riskScore: 8, tags: ['defi', 'yield'] } },
                  { label: '🎯 Pre-TGE Token', data: { name: '', assetClass: 'speculative', status: 'locked', quantity: 0, costBasis: 0, currentValue: 0, taxTreatment: 'airdrop', riskScore: 9, tags: ['pre-TGE', 'locked'], isLocked: true } },
                  { label: '📈 Equity', data: { name: '', assetClass: 'equity', status: 'active', quantity: 0, costBasis: 0, currentValue: 0, taxTreatment: 'long_term_cg', riskScore: 4, tags: ['equity'] } },
                ].map(tmpl => (
                  <button key={tmpl.label} onClick={() => setImportText(JSON.stringify(tmpl.data, null, 2))}
                    className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg-surface)', borderRadius: 10, padding: 3, border: '1px solid var(--border-subtle)' }}>
        {([
          { key: 'positions', label: 'Positions', icon: <BarChart3 size={13} />, count: data.positions.length },
          { key: 'opportunities', label: 'Opportunities', icon: <Target size={13} />, count: data.opportunities.length },
          { key: 'taxevents', label: 'Tax Events', icon: <AlertTriangle size={13} />, count: data.taxEvents.length },
          { key: 'bridge', label: 'Context Bridge', icon: <ArrowRightLeft size={13} /> },
          { key: 'import', label: 'CSV Import', icon: <FileUp size={13} /> },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 400, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: activeTab === tab.key ? 'var(--bg-elevated, rgba(255,255,255,0.08))' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-gold)' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
            {tab.icon} {tab.label}
            {'count' in tab && (tab as any).count > 0 && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(212,168,67,0.12)', color: 'var(--accent-gold)' }}>
                {(tab as any).count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── POSITIONS TAB ─────────────────────────────────────────────── */}
      {activeTab === 'positions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
              <input style={{ ...inputStyle, paddingLeft: 30 }} placeholder="Search positions, tickers, tags..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <button onClick={addPosition} className="btn btn-primary" style={{ fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap' }}>
              <Plus size={13} /> Add Position
            </button>
          </div>

          {/* Risk Distribution Bar */}
          {data.positions.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Risk Distribution</div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                {stats.lowRisk > 0 && <div style={{ flex: stats.lowRisk, background: '#10b981', borderRadius: 3 }} />}
                {stats.medRisk > 0 && <div style={{ flex: stats.medRisk, background: '#f59e0b', borderRadius: 3 }} />}
                {stats.highRisk > 0 && <div style={{ flex: stats.highRisk, background: '#ef4444', borderRadius: 3 }} />}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                <span style={{ color: '#10b981' }}>Low ({stats.lowRisk})</span>
                <span style={{ color: '#f59e0b' }}>Medium ({stats.medRisk})</span>
                <span style={{ color: '#ef4444' }}>High ({stats.highRisk})</span>
              </div>
            </div>
          )}

          {filteredPositions.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <Briefcase size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>No positions yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Add positions manually or import via UIE envelope from external analyses.</div>
            </div>
          )}

          {filteredPositions.map(pos => {
            const gainLoss = pos.currentValue - pos.costBasis
            const gainPct = pos.costBasis > 0 ? ((gainLoss / pos.costBasis) * 100) : 0
            const isExpanded = expandedPosition === pos.id
            const acConfig = ASSET_CLASSES[pos.assetClass]
            const statusConfig = POSITION_STATUSES[pos.status]

            return (
              <div key={pos.id} style={{
                background: 'var(--bg-surface)', borderRadius: 12, marginBottom: 10,
                border: `1px solid ${isExpanded ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                transition: 'border-color 0.2s',
              }}>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
                  onClick={() => setExpandedPosition(isExpanded ? null : pos.id)}>
                  <span style={{ fontSize: 18 }}>{acConfig.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {pos.name || '(Untitled)'}
                      </span>
                      {pos.ticker && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', background: 'var(--bg-elevated, rgba(255,255,255,0.05))', padding: '1px 5px', borderRadius: 3 }}>{pos.ticker}</span>}
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${statusConfig.color}18`, color: statusConfig.color, fontWeight: 600 }}>
                        {statusConfig.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                      <span>{acConfig.label}</span>
                      <span>·</span>
                      <span>{TAX_TREATMENTS[pos.taxTreatment].label}</span>
                      {pos.tags.length > 0 && <>
                        <span>·</span>
                        {pos.tags.map(t => <span key={t} style={{ color: 'var(--accent-gold)' }}>#{t}</span>)}
                      </>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 100 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      ${pos.currentValue.toLocaleString()}
                    </div>
                    {pos.costBasis > 0 && (
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: gainLoss >= 0 ? '#10b981' : '#ef4444' }}>
                        {gainLoss >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Risk indicator */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      background: pos.riskScore >= 7 ? 'rgba(239,68,68,0.12)' : pos.riskScore >= 4 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                      color: pos.riskScore >= 7 ? '#ef4444' : pos.riskScore >= 4 ? '#f59e0b' : '#10b981',
                    }}>
                      {pos.riskScore}
                    </div>
                    {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>

                {/* Expanded Editor */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12 }}>
                      <div>
                        <label style={labelStyle}>Name</label>
                        <input style={inputStyle} value={pos.name} onChange={e => updatePosition(pos.id, { name: e.target.value })} placeholder="Asset name" />
                      </div>
                      <div>
                        <label style={labelStyle}>Ticker / Symbol</label>
                        <input style={inputStyle} value={pos.ticker || ''} onChange={e => updatePosition(pos.id, { ticker: e.target.value })} placeholder="$WN, NODL, BTC..." />
                      </div>
                      <div>
                        <label style={labelStyle}>Asset Class</label>
                        <select style={selectStyle} value={pos.assetClass} onChange={e => updatePosition(pos.id, { assetClass: e.target.value as AssetClass })}>
                          {Object.entries(ASSET_CLASSES).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Status</label>
                        <select style={selectStyle} value={pos.status} onChange={e => updatePosition(pos.id, { status: e.target.value as PositionStatus })}>
                          {Object.entries(POSITION_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
                      <div>
                        <label style={labelStyle}>Quantity</label>
                        <input style={inputStyle} type="number" value={pos.quantity || ''} onChange={e => updatePosition(pos.id, { quantity: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Cost Basis ($)</label>
                        <input style={inputStyle} type="number" value={pos.costBasis || ''} onChange={e => updatePosition(pos.id, { costBasis: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Current Value ($)</label>
                        <input style={inputStyle} type="number" value={pos.currentValue || ''} onChange={e => updatePosition(pos.id, { currentValue: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Tax Treatment</label>
                        <select style={selectStyle} value={pos.taxTreatment} onChange={e => updatePosition(pos.id, { taxTreatment: e.target.value as TaxTreatment })}>
                          {Object.entries(TAX_TREATMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 10, marginTop: 10 }}>
                      <div>
                        <label style={labelStyle}>Notes</label>
                        <input style={inputStyle} value={pos.notes} onChange={e => updatePosition(pos.id, { notes: e.target.value })} placeholder="Strategy notes, source reference..." />
                      </div>
                      <div>
                        <label style={labelStyle}>Risk (1-10)</label>
                        <input style={inputStyle} type="number" min={1} max={10} value={pos.riskScore} onChange={e => updatePosition(pos.id, { riskScore: parseInt(e.target.value) || 5 })} />
                      </div>
                      <div>
                        <label style={labelStyle}>Tags (comma separated)</label>
                        <input style={inputStyle} value={pos.tags.join(', ')} onChange={e => updatePosition(pos.id, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="pre-TGE, DeFi, peaq..." />
                      </div>
                    </div>
                    {/* Tax Impact Preview */}
                    {pos.currentValue > 0 && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
                        fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16,
                      }}>
                        <span>💡 <strong>Tax Impact if realized:</strong></span>
                        {pos.taxTreatment === 'long_term_cg' ? (
                          <span>~${Math.round(gainLoss * 0.15).toLocaleString()} at 15% LTCG rate</span>
                        ) : pos.taxTreatment === 'airdrop' || pos.taxTreatment === 'mining_income' || pos.taxTreatment === 'staking_reward' ? (
                          <span>~${Math.round(pos.currentValue * stats.marginalRate).toLocaleString()} as ordinary income at {(stats.marginalRate * 100).toFixed(0)}% marginal rate</span>
                        ) : (
                          <span>~${Math.round(Math.max(0, gainLoss) * stats.marginalRate).toLocaleString()} at {(stats.marginalRate * 100).toFixed(0)}% marginal rate</span>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                      <button onClick={() => removePosition(pos.id)} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--accent-red)', gap: 4 }}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── OPPORTUNITIES TAB ─────────────────────────────────────────── */}
      {activeTab === 'opportunities' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={addOpportunity} className="btn btn-primary" style={{ fontSize: 12, padding: '8px 14px' }}>
              <Plus size={13} /> Add Opportunity
            </button>
          </div>

          {data.opportunities.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <Target size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>No opportunities tracked yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Import opportunity analyses from conversations or add them manually.</div>
            </div>
          )}

          {data.opportunities.map(opp => (
            <div key={opp.id} className="card" style={{ marginBottom: 12 }}>
              <div className="card-body" style={{ padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 120px', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Title</label>
                    <input style={inputStyle} value={opp.title} onChange={e => updateOpportunity(opp.id, { title: e.target.value })} placeholder="e.g. DeNet $WN TGE Opportunity" />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={selectStyle} value={opp.status} onChange={e => updateOpportunity(opp.id, { status: e.target.value as any })}>
                      {['watching', 'researching', 'ready', 'active', 'exited', 'passed'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Est. Value ($)</label>
                    <input style={inputStyle} type="number" value={opp.estimatedValue || ''} onChange={e => updateOpportunity(opp.id, { estimatedValue: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Confidence %</label>
                    <input style={inputStyle} type="number" min={0} max={100} value={opp.confidence} onChange={e => updateOpportunity(opp.id, { confidence: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Summary</label>
                    <input style={inputStyle} value={opp.summary} onChange={e => updateOpportunity(opp.id, { summary: e.target.value })} placeholder="Brief analysis summary..." />
                  </div>
                  <div>
                    <label style={labelStyle}>Tax Implications</label>
                    <input style={inputStyle} value={opp.taxImplications} onChange={e => updateOpportunity(opp.id, { taxImplications: e.target.value })} placeholder="e.g. Airdrop = ordinary income at FMV..." />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Source / Reference</label>
                    <input style={inputStyle} value={opp.sourceRef || ''} onChange={e => updateOpportunity(opp.id, { sourceRef: e.target.value })} placeholder="URL or chat reference" />
                  </div>
                  <div>
                    <label style={labelStyle}>Tags</label>
                    <input style={inputStyle} value={opp.tags.join(', ')} onChange={e => updateOpportunity(opp.id, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="DeFi, pre-TGE, DePIN..." />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={() => removeOpportunity(opp.id)} className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--accent-red)', width: '100%', justifyContent: 'center' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── TAX EVENTS TAB ────────────────────────────────────────────── */}
      {activeTab === 'taxevents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
              {stats.unrealizedEvents} pending events · ~${Math.round(stats.estimatedTaxLiability).toLocaleString()} estimated tax impact
            </div>
            <button onClick={addTaxEvent} className="btn btn-primary" style={{ fontSize: 12, padding: '8px 14px' }}>
              <Plus size={13} /> Add Tax Event
            </button>
          </div>

          {data.taxEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <Clock size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <div style={{ fontSize: 13 }}>No tax events tracked</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Add upcoming taxable events (TGEs, vest dates, airdrops, sales) to plan for their impact.</div>
            </div>
          )}

          {data.taxEvents.map(evt => (
            <div key={evt.id} className="card" style={{ marginBottom: 10, borderLeft: `3px solid ${evt.realized ? '#10b981' : '#f59e0b'}` }}>
              <div className="card-body" style={{ padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px 80px', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input style={inputStyle} value={evt.description} onChange={e => updateTaxEvent(evt.id, { description: e.target.value })} placeholder="e.g. DeNet TGE airdrop" />
                  </div>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select style={selectStyle} value={evt.type} onChange={e => updateTaxEvent(evt.id, { type: e.target.value as any })}>
                      {['airdrop', 'tge', 'vest', 'sale', 'conversion', 'staking_reward', 'mining', 'income', 'loss'].map(t => (
                        <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Est. Amount ($)</label>
                    <input style={inputStyle} type="number" value={evt.estimatedAmount || ''} onChange={e => updateTaxEvent(evt.id, { estimatedAmount: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Tax Treatment</label>
                    <select style={selectStyle} value={evt.taxTreatment} onChange={e => updateTaxEvent(evt.id, { taxTreatment: e.target.value as TaxTreatment })}>
                      {Object.entries(TAX_TREATMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Realized?</label>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="checkbox" checked={evt.realized} onChange={e => updateTaxEvent(evt.id, { realized: e.target.checked })} />
                      <button onClick={() => removeTaxEvent(evt.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: 2 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── CONTEXT BRIDGE TAB ────────────────────────────────────────── */}
      {activeTab === 'bridge' && (
        <div>
          {/* UIF Architecture Diagram */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link2 size={16} /> Universal Integration Framework — Financial Context Layer
              </span>
            </div>
            <div className="card-body">
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
                The UIF Context Bridge enables bidirectional data flow between Fortuna and any AEGIS ecosystem solution.
                Financial context (positions, tax events, income data, entity structures) is packaged into UIE envelopes
                that any solution can produce or consume.
              </div>

              {/* Layer visualization */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { layer: 'L5', name: 'AI Orchestration', desc: 'Auto-classify imported data, detect strategies, project tax impact', color: '#8b5cf6', active: true },
                  { layer: 'L4', name: 'Events', desc: 'TGE alerts, position changes, tax deadline triggers, vest notifications', color: '#ec4899', active: true },
                  { layer: 'L3', name: 'Shared Services', desc: 'Tax calculator, risk scoring, asset valuation, marginal rate engine', color: '#3b82f6', active: true },
                  { layer: 'L2', name: 'API', desc: 'Import (paste/upload) + Export (JSON/clipboard) — UIE envelope format', color: '#10b981', active: true },
                  { layer: 'L1', name: 'UIE Envelopes', desc: 'Standardized financial context containers: positions, events, opportunities', color: '#f59e0b', active: true },
                ].map(layer => (
                  <div key={layer.layer} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 8, background: `${layer.color}08`, border: `1px solid ${layer.color}15`,
                  }}>
                    <div style={{
                      width: 32, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      background: `${layer.color}15`, color: layer.color,
                    }}>
                      {layer.layer}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{layer.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{layer.desc}</div>
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4,
                      background: layer.active ? layer.color : 'var(--text-muted)',
                      boxShadow: layer.active ? `0 0 6px ${layer.color}40` : 'none',
                    }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Protocol Mapping */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title"><Sparkles size={16} /> AEGIS Protocol Mapping</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { protocol: 'UCP', name: 'Unified Communication', mapping: 'Financial context envelopes, portfolio state broadcasts, cross-solution messaging', color: '#3b82f6' },
                  { protocol: 'MCP', name: 'Model Context', mapping: 'Tax calculator tools, risk scoring models, strategy detection engine', color: '#10b981' },
                  { protocol: 'A2A', name: 'Agent-to-Agent', mapping: 'Portfolio monitoring agents, tax event watchers, opportunity scouts', color: '#8b5cf6' },
                  { protocol: 'ACP', name: 'Autonomous Commerce', mapping: 'Revenue tracking from positions, LP fee income, staking rewards', color: '#f59e0b' },
                ].map(p => (
                  <div key={p.protocol} style={{
                    padding: 12, borderRadius: 10, background: `${p.color}06`, border: `1px solid ${p.color}12`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: p.color, marginBottom: 2 }}>{p.protocol}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.mapping}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Compatible Solutions */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title"><Globe size={16} /> Compatible Ecosystem Solutions</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { name: 'Fortuna Engine', desc: 'Tax strategy & financial planning', emoji: '⚡', status: 'Active' },
                  { name: 'AEGIS Framework', desc: 'Autonomous revenue & governance', emoji: '🛡️', status: 'Compatible' },
                  { name: 'IdeaForge', desc: 'Opportunity ideation pipeline', emoji: '💡', status: 'Compatible' },
                  { name: 'RESONANCE', desc: 'Revenue tracking from content', emoji: '🔊', status: 'Planned' },
                  { name: 'LaunchFlow', desc: 'Service delivery revenue', emoji: '🚀', status: 'Planned' },
                  { name: 'Claude Conversations', desc: 'Analysis import via paste', emoji: '💬', status: 'Active' },
                ].map(sol => (
                  <div key={sol.name} style={{
                    padding: '10px 12px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>{sol.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{sol.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sol.desc}</div>
                    </div>
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                      background: sol.status === 'Active' ? 'rgba(16,185,129,0.12)' : sol.status === 'Compatible' ? 'rgba(59,130,246,0.12)' : 'rgba(107,114,128,0.12)',
                      color: sol.status === 'Active' ? '#10b981' : sol.status === 'Compatible' ? '#3b82f6' : '#6b7280',
                    }}>
                      {sol.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Import History */}
          {data.envelopeHistory.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title"><FileText size={16} /> Import History</span>
              </div>
              <div className="card-body">
                {data.envelopeHistory.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < data.envelopeHistory.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <Upload size={12} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{entry.imported}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>{entry.positionCount} positions</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(entry.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── CSV IMPORT TAB ────────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div>
          {/* Progress Steps */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {(['select', 'upload', 'map', 'preview', 'done'] as const).map((step, i) => {
              const labels = ['Select Source', 'Upload CSV', 'Map Columns', 'Preview & Confirm', 'Complete']
              const icons = [<Globe size={12} key="g" />, <FileUp size={12} key="f" />, <Table2 size={12} key="t" />, <Eye size={12} key="e" />, <CheckCircle2 size={12} key="c" />]
              const stepOrder = ['select', 'upload', 'map', 'preview', 'done'] as const
              const currentIdx = stepOrder.indexOf(csvStep)
              const isActive = step === csvStep
              const isPast = i < currentIdx
              return (
                <div key={step} style={{
                  flex: 1, padding: '8px 6px', borderRadius: 8, textAlign: 'center', fontSize: 10, cursor: isPast ? 'pointer' : 'default',
                  background: isActive ? 'rgba(212,168,67,0.12)' : isPast ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)',
                  color: isActive ? 'var(--accent-gold)' : isPast ? '#10b981' : 'var(--text-muted)',
                  border: `1px solid ${isActive ? 'var(--accent-gold)' : isPast ? 'rgba(16,185,129,0.2)' : 'var(--border-subtle)'}`,
                  fontWeight: isActive ? 600 : 400, transition: 'all 0.2s',
                }} onClick={() => isPast && setCsvStep(step)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    {isPast ? <Check size={12} /> : icons[i]} {labels[i]}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Step 1: Select Source */}
          {csvStep === 'select' && (
            <div>
              <div className="card">
                <div className="card-header">
                  <span className="card-title"><Globe size={16} /> Select Data Source</span>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                    Choose the platform your CSV export came from. Fortuna will automatically detect column layouts and transaction types for supported platforms.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {SUPPORTED_FORMATS.map(fmt => (
                      <button key={fmt.id} onClick={() => { setCsvFormat(fmt.id); setCsvStep('upload') }}
                        style={{
                          padding: '14px 16px', borderRadius: 10, border: `1px solid ${csvFormat === fmt.id ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                          background: csvFormat === fmt.id ? 'rgba(212,168,67,0.08)' : 'var(--bg-surface)',
                          cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                        }}
                        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent-gold)')}
                        onMouseOut={e => (e.currentTarget.style.borderColor = csvFormat === fmt.id ? 'var(--accent-gold)' : 'var(--border-subtle)')}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{fmt.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmt.description}</div>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: '#3b82f6' }} />
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>Auto-detect available:</strong> You can also skip this step — upload any CSV and Fortuna will attempt to automatically identify the format from the column headers.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload CSV */}
          {csvStep === 'upload' && (
            <div>
              <div className="card">
                <div className="card-header">
                  <span className="card-title"><FileUp size={16} /> Upload {csvFormat ? SUPPORTED_FORMATS.find(f => f.id === csvFormat)?.label : ''} CSV</span>
                  <button onClick={() => setCsvStep('select')} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>← Back</button>
                </div>
                <div className="card-body">
                  {/* Drag & Drop Zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setCsvDragOver(true) }}
                    onDragLeave={() => setCsvDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setCsvDragOver(false)
                      const file = e.dataTransfer.files[0]
                      if (file) {
                        const reader = new FileReader()
                        reader.onload = ev => {
                          const text = ev.target?.result as string
                          setCsvRawText(text)
                          processImport(text)
                        }
                        reader.readAsText(file)
                      }
                    }}
                    style={{
                      padding: 40, borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                      border: `2px dashed ${csvDragOver ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                      background: csvDragOver ? 'rgba(212,168,67,0.06)' : 'transparent',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.csv,.txt,.tsv'
                      input.onchange = (e: any) => {
                        const file = e.target?.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onload = ev => {
                            const text = ev.target?.result as string
                            setCsvRawText(text)
                            processImport(text)
                          }
                          reader.readAsText(file)
                        }
                      }
                      input.click()
                    }}>
                    <FileUp size={40} style={{ color: csvDragOver ? 'var(--accent-gold)' : 'var(--text-muted)', marginBottom: 12 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                      Drop your CSV file here, or click to browse
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Supports .csv, .txt, and .tsv files up to 50MB
                    </div>
                  </div>

                  {/* Or Paste */}
                  <div style={{ textAlign: 'center', margin: '16px 0', fontSize: 11, color: 'var(--text-muted)' }}>— or paste CSV data directly —</div>
                  <textarea
                    placeholder="Paste your CSV data here..."
                    value={csvRawText}
                    onChange={e => setCsvRawText(e.target.value)}
                    style={{
                      width: '100%', minHeight: 120, padding: 12, borderRadius: 8, fontSize: 11, fontFamily: 'monospace',
                      border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      resize: 'vertical',
                    }}
                  />
                  {csvRawText && (
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      <button onClick={() => processImport(csvRawText)} style={{
                        flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'var(--accent-gold)', color: '#1a1a1a', fontWeight: 600, fontSize: 13,
                      }}>
                        <Zap size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Parse & Import
                      </button>
                      <button onClick={() => { setCsvRawText(''); setCsvResult(null) }} style={{
                        padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                        background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
                      }}>Clear</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Column Mapping (for custom CSV) */}
          {csvStep === 'map' && csvResult && (
            <div>
              <div className="card">
                <div className="card-header">
                  <span className="card-title"><Table2 size={16} /> Map Columns</span>
                  <button onClick={() => setCsvStep('upload')} style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>← Back</button>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                    Fortuna couldn't auto-detect your CSV format. Please map the columns below. Only <strong>Asset</strong> is required — other fields are recommended for accuracy.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {(['date', 'asset', 'type', 'quantity', 'price', 'total', 'fee', 'notes'] as const).map(field => {
                      const labels: Record<string, string> = { date: 'Date', asset: 'Asset / Ticker *', type: 'Transaction Type', quantity: 'Quantity', price: 'Price per Unit', total: 'Total Value', fee: 'Fee', notes: 'Notes / Memo' }
                      return (
                        <div key={field}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{labels[field]}</label>
                          <select
                            value={csvMapping[field] ?? ''}
                            onChange={e => setCsvMapping(prev => ({ ...prev, [field]: e.target.value === '' ? undefined : parseInt(e.target.value) }))}
                            style={{
                              width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 6, fontSize: 12,
                              border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
                            }}>
                            <option value="">— Skip —</option>
                            {csvResult.rawHeaders.map((h, i) => (
                              <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={() => {
                    const result = importCSV(csvRawText, 'custom', csvMapping)
                    setCsvResult(result)
                    setCsvStep('preview')
                  }} style={{
                    marginTop: 16, width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
                    cursor: 'pointer', background: 'var(--accent-gold)', color: '#1a1a1a', fontWeight: 600, fontSize: 13,
                  }}>
                    Apply Mapping & Preview →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Preview & Confirm */}
          {csvStep === 'preview' && csvResult && (
            <div>
              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Source', value: csvResult.source, icon: <Globe size={14} />, color: '#3b82f6' },
                  { label: 'Positions', value: csvResult.positions.length.toString(), icon: <BarChart3 size={14} />, color: '#10b981' },
                  { label: 'Tax Events', value: csvResult.taxEvents.length.toString(), icon: <AlertTriangle size={14} />, color: '#f59e0b' },
                  { label: 'Rows Parsed', value: `${csvResult.totalRows - csvResult.skippedRows}/${csvResult.totalRows}`, icon: <Table2 size={14} />, color: '#8b5cf6' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span style={{ color: s.color }}>{s.icon}</span> {s.label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {csvResult.warnings.length > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  {csvResult.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#f59e0b', display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}>
                      <AlertTriangle size={11} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Position Preview */}
              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-header">
                  <span className="card-title"><BarChart3 size={16} /> Positions to Import ({csvResult.positions.length})</span>
                </div>
                <div className="card-body">
                  {csvResult.positions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--text-muted)' }}>No positions extracted</div>
                  ) : (
                    <div style={{ maxHeight: 300, overflow: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            {['Asset', 'Class', 'Qty', 'Cost Basis', 'Value', 'G/L', 'Tax Treatment', 'Risk'].map(h => (
                              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvResult.positions.map((pos, i) => {
                            const gl = pos.currentValue - pos.costBasis
                            const glPct = pos.costBasis > 0 ? (gl / pos.costBasis) * 100 : 0
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{pos.ticker || pos.name}</td>
                                <td style={{ padding: '6px 8px' }}>{ASSET_CLASSES[pos.assetClass]?.emoji} {ASSET_CLASSES[pos.assetClass]?.label}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>${pos.costBasis.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>${pos.currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: gl >= 0 ? '#10b981' : '#ef4444' }}>
                                  {gl >= 0 ? '+' : ''}{glPct.toFixed(1)}%
                                </td>
                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{TAX_TREATMENTS[pos.taxTreatment]?.label}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pos.riskScore <= 3 ? '#10b981' : pos.riskScore <= 6 ? '#f59e0b' : '#ef4444', marginRight: 4 }} />
                                  {pos.riskScore}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Tax Events Preview */}
              {csvResult.taxEvents.length > 0 && (
                <div className="card" style={{ marginBottom: 14 }}>
                  <div className="card-header">
                    <span className="card-title"><AlertTriangle size={16} /> Tax Events Detected ({csvResult.taxEvents.length})</span>
                  </div>
                  <div className="card-body">
                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                      {csvResult.taxEvents.slice(0, 20).map((evt, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 11 }}>
                          <span style={{ fontSize: 14 }}>
                            {evt.type === 'sale' ? '💰' : evt.type === 'staking_reward' ? '🥩' : evt.type === 'airdrop' ? '🎁' : evt.type === 'mining' ? '⛏️' : evt.type === 'conversion' ? '🔄' : evt.type === 'income' ? '💵' : '📋'}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{evt.description}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{TAX_TREATMENTS[evt.taxTreatment]?.label}{evt.expectedDate ? ` • ${evt.expectedDate}` : ''}</div>
                          </div>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: evt.type === 'loss' ? '#ef4444' : 'var(--accent-gold)' }}>
                            ${evt.estimatedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                      {csvResult.taxEvents.length > 20 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>
                          + {csvResult.taxEvents.length - 20} more events
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Confirm Button */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCsvStep('upload')} style={{
                  padding: '12px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
                }}>← Re-upload</button>
                <button onClick={() => confirmImport()} style={{
                  flex: 1, padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 600, fontSize: 14,
                  boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
                }}>
                  <CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                  Import {csvResult.positions.length} Positions & {csvResult.taxEvents.length} Tax Events
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Done */}
          {csvStep === 'done' && csvResult && (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
                <CheckCircle2 size={48} style={{ color: '#10b981', marginBottom: 16 }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Import Complete!</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
                  Successfully imported <strong style={{ color: '#10b981' }}>{csvResult.positions.length} positions</strong> and <strong style={{ color: '#f59e0b' }}>{csvResult.taxEvents.length} tax events</strong> from {csvResult.source}.
                  <br />All data has been merged into your Portfolio Intelligence module and is now flowing into the tax calculator, strategy detector, proactive alerts, and AI advisor.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button onClick={() => { setActiveTab('positions') }} style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'var(--accent-gold)', color: '#1a1a1a', fontWeight: 600, fontSize: 13,
                  }}>
                    <BarChart3 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    View Positions
                  </button>
                  <button onClick={() => {
                    setCsvStep('select'); setCsvFormat(null); setCsvResult(null); setCsvRawText('')
                  }} style={{
                    padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                    background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
                  }}>
                    <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Import Another Source
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
