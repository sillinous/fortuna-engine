import { useState, useMemo } from 'react'
import { useFortuna, genId } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import {
  generateDepreciationSummary, analyzeVehicleDeduction, analyzeHomeOffice,
  ASSET_CLASSES, SECTION_179_LIMIT_2024, STANDARD_MILEAGE_RATE_2024, BONUS_DEPRECIATION_RATES,
  type BusinessAsset, type DepreciationSummary,
} from '../engine/depreciation-engine'
import {
  Plus, Trash2, Calculator, Car, Home, Package, AlertTriangle, Lightbulb, Info,
  ChevronDown, DollarSign, Clock,
} from 'lucide-react'

interface DepreciationViewProps {
  onNavigate: (view: ViewKey) => void
}

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString()

export function DepreciationView({ onNavigate }: DepreciationViewProps) {
  const { state, updateState } = useFortuna()

  // Adapt storage DepreciationAssets → engine BusinessAssets on load
  const storageAssets = (state.depreciationAssets || []).map(da => ({
    id: da.id,
    name: da.name,
    classId: da.category || 'computer',
    purchaseDate: da.purchaseDate,
    cost: da.purchasePrice,
    businessUsePercent: da.businessUsePct,
    section179Elected: da.method === 'section_179',
    bonusDepreciation: da.method === 'bonus',
    salvageValue: da.salvageValue || 0,
  })) as BusinessAsset[]
  const [assets, _setAssets] = useState<BusinessAsset[]>(storageAssets)

  // Persist to FortunaState whenever assets change
  const setAssets: typeof _setAssets = (update) => {
    _setAssets(prev => {
      const next = typeof update === 'function' ? update(prev) : update
      // Convert back to storage DepreciationAsset format
      updateState(s => ({
        ...s,
        depreciationAssets: next.map(a => ({
          id: a.id,
          name: a.name,
          category: (a.classId === 'computer' ? 'computer' : a.classId === 'vehicle' ? 'vehicle' : a.classId === 'furniture' ? 'furniture' : a.classId === 'building' ? 'building' : 'equipment') as any,
          purchaseDate: a.purchaseDate,
          purchasePrice: a.cost,
          method: a.section179Elected ? 'section_179' as const : a.bonusDepreciation ? 'bonus' as const : 'macrs' as const,
          usefulLifeYears: ASSET_CLASSES.find(c => c.id === a.classId)?.macrsLife || 5,
          businessUsePct: a.businessUsePercent,
          salvageValue: a.salvageValue,
          isActive: true,
          entityId: (a as any).entityId || 'personal',
          memberId: 'primary',
          taxYear: new Date().getFullYear(),
          tags: [],
        })),
      }))
      return next
    })
  }
  const [activeTab, setActiveTab] = useState<'assets' | 'vehicle' | 'homeoffice' | 'timing'>('assets')
  const [showAddForm, setShowAddForm] = useState(false)

  // Asset form state
  const [newAsset, setNewAsset] = useState<Partial<BusinessAsset>>({
    classId: 'computer', cost: 0, businessUsePercent: 100,
    section179Elected: true, bonusDepreciation: true, salvageValue: 0,
    purchaseDate: new Date().toISOString().slice(0, 10),
  })

  // Vehicle form state
  const [vehicle, setVehicle] = useState({
    annualMiles: 15000, businessMiles: 10000, cost: 35000,
    fuel: 3000, insurance: 1800, maintenance: 1200, parking: 600,
  })

  // Home office form state
  const [homeOffice, setHomeOffice] = useState({
    homeSqFt: 1500, officeSqFt: 150, rentMortgage: 18000,
    utilities: 3600, insurance: 1800, homeValue: 250000, isOwner: true,
  })

  const summary = useMemo(
    () => generateDepreciationSummary(state, assets),
    [state, assets],
  )

  const vehicleAnalysis = useMemo(
    () => analyzeVehicleDeduction(
      vehicle.annualMiles, vehicle.businessMiles, vehicle.cost,
      vehicle.fuel, vehicle.insurance, vehicle.maintenance, vehicle.parking,
      summary.assetResults[0]?.taxSavingsFirstYear ? 0.24 : 0.22,
    ),
    [vehicle, summary],
  )

  const homeOfficeAnalysis = useMemo(
    () => analyzeHomeOffice(
      homeOffice.homeSqFt, homeOffice.officeSqFt,
      homeOffice.rentMortgage, homeOffice.utilities, homeOffice.insurance,
      homeOffice.homeValue, homeOffice.isOwner, 0.24,
    ),
    [homeOffice],
  )

  const addAsset = () => {
    if (!newAsset.name || !newAsset.cost) return
    setAssets(prev => [...prev, {
      id: genId(),
      name: newAsset.name || 'New Asset',
      classId: newAsset.classId || 'computer',
      purchaseDate: newAsset.purchaseDate || new Date().toISOString().slice(0, 10),
      cost: newAsset.cost || 0,
      businessUsePercent: newAsset.businessUsePercent || 100,
      section179Elected: newAsset.section179Elected ?? true,
      bonusDepreciation: newAsset.bonusDepreciation ?? true,
      salvageValue: newAsset.salvageValue || 0,
    }])
    setNewAsset({ classId: 'computer', cost: 0, businessUsePercent: 100, section179Elected: true, bonusDepreciation: true, salvageValue: 0, purchaseDate: new Date().toISOString().slice(0, 10) })
    setShowAddForm(false)
  }

  const removeAsset = (id: string) => setAssets(prev => prev.filter(a => a.id !== id))

  const bonusRate = BONUS_DEPRECIATION_RATES[new Date().getFullYear()] ?? 0

  const tabs = [
    { id: 'assets' as const, label: 'Assets & §179', icon: <Package size={14} /> },
    { id: 'vehicle' as const, label: 'Vehicle', icon: <Car size={14} /> },
    { id: 'homeoffice' as const, label: 'Home Office', icon: <Home size={14} /> },
    { id: 'timing' as const, label: 'Purchase Timing', icon: <Clock size={14} /> },
  ]

  return (
    <div className="view-container" style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 className="view-title" style={{ marginBottom: 4 }}>Depreciation & Asset Strategy</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Section 179, bonus depreciation, MACRS schedules, vehicle & home office deductions</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>This Year Deductions</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>{fmt(summary.currentYearDeduction)}</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Tax Savings</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{fmt(summary.totalTaxSavingsThisYear)}</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>§179 Remaining</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(summary.section179Remaining)}</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Bonus Depr. Rate</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: bonusRate > 0.5 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>{(bonusRate * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── ASSETS TAB ── */}
      {activeTab === 'assets' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Business Assets ({assets.length})</div>
            <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Add Asset
            </button>
          </div>

          {showAddForm && (
            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Asset Name</label>
                  <input className="input" value={newAsset.name || ''} onChange={e => setNewAsset({ ...newAsset, name: e.target.value })} placeholder="MacBook Pro" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Asset Class</label>
                  <select className="input" value={newAsset.classId} onChange={e => setNewAsset({ ...newAsset, classId: e.target.value })}>
                    {ASSET_CLASSES.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.macrsLife}-yr)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Purchase Date</label>
                  <input className="input" type="date" value={newAsset.purchaseDate || ''} onChange={e => setNewAsset({ ...newAsset, purchaseDate: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Cost ($)</label>
                  <input className="input" type="number" value={newAsset.cost || ''} onChange={e => setNewAsset({ ...newAsset, cost: +e.target.value })} placeholder="2500" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Business Use %</label>
                  <input className="input" type="number" min={0} max={100} value={newAsset.businessUsePercent || 100} onChange={e => setNewAsset({ ...newAsset, businessUsePercent: +e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Salvage Value ($)</label>
                  <input className="input" type="number" value={newAsset.salvageValue || 0} onChange={e => setNewAsset({ ...newAsset, salvageValue: +e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newAsset.section179Elected} onChange={e => setNewAsset({ ...newAsset, section179Elected: e.target.checked })} />
                  Section 179 Expensing
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newAsset.bonusDepreciation} onChange={e => setNewAsset({ ...newAsset, bonusDepreciation: e.target.checked })} />
                  Bonus Depreciation ({bonusRate * 100}%)
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={addAsset}>Add Asset</button>
                <button className="btn" onClick={() => setShowAddForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Asset results */}
          {summary.assetResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {summary.assetResults.map(result => (
                <div key={result.asset.id} className="glass-card" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {result.asset.name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span className="badge gold">{result.assetClass.name}</span>
                        <span className="badge muted">{result.method}</span>
                        <span className="badge emerald">1st yr: {fmt(result.firstYearDeduction)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                          {fmt(result.taxSavingsFirstYear)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>1st yr tax savings</div>
                      </div>
                      <button onClick={() => removeAsset(result.asset.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Depreciation schedule */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {result.schedule.map(yr => (
                        <div key={yr.year} style={{
                          padding: '6px 10px', borderRadius: 8, background: 'var(--bg-surface)',
                          textAlign: 'center', minWidth: 80,
                        }}>
                          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{yr.year}</div>
                          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: yr.totalDepreciation > 0 ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                            {fmt(yr.totalDepreciation)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
              <Package size={36} color="var(--text-muted)" style={{ marginBottom: 12 }} />
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Add business assets to calculate depreciation schedules and tax savings.</p>
            </div>
          )}
        </div>
      )}

      {/* ── VEHICLE TAB ── */}
      {activeTab === 'vehicle' && (
        <div>
          <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 14 }}>Vehicle Deduction Calculator</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Annual Miles', key: 'annualMiles', val: vehicle.annualMiles },
                { label: 'Business Miles', key: 'businessMiles', val: vehicle.businessMiles },
                { label: 'Vehicle Cost ($)', key: 'cost', val: vehicle.cost },
                { label: 'Annual Fuel ($)', key: 'fuel', val: vehicle.fuel },
                { label: 'Annual Insurance ($)', key: 'insurance', val: vehicle.insurance },
                { label: 'Maintenance ($)', key: 'maintenance', val: vehicle.maintenance },
                { label: 'Parking/Tolls ($)', key: 'parking', val: vehicle.parking },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input className="input" type="number" value={f.val} onChange={e => setVehicle({ ...vehicle, [f.key]: +e.target.value })} />
                </div>
              ))}
            </div>
          </div>

          {/* Comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="glass-card" style={{
              padding: 20,
              border: vehicleAnalysis.recommendation === 'standard_mileage' ? '1px solid var(--accent-emerald)' : undefined,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Standard Mileage</div>
                {vehicleAnalysis.recommendation === 'standard_mileage' && <span className="badge emerald">✓ RECOMMENDED</span>}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', marginBottom: 8 }}>
                {fmt(vehicleAnalysis.standardMileage.annualDeduction)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {vehicleAnalysis.standardMileage.calculation}
              </div>
            </div>
            <div className="glass-card" style={{
              padding: 20,
              border: vehicleAnalysis.recommendation === 'actual_expense' ? '1px solid var(--accent-emerald)' : undefined,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Actual Expense</div>
                {vehicleAnalysis.recommendation === 'actual_expense' && <span className="badge emerald">✓ RECOMMENDED</span>}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', marginBottom: 8 }}>
                {fmt(vehicleAnalysis.actualExpense.annualDeduction)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {vehicleAnalysis.actualExpense.calculation}
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 16, marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-gold)', marginBottom: 8 }}>
              Difference: {fmt(vehicleAnalysis.difference)}/year more with {vehicleAnalysis.recommendation === 'standard_mileage' ? 'Standard Mileage' : 'Actual Expense'}
            </div>
            {vehicleAnalysis.notes.map((n, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Info size={12} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 2 }} /> {n}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── HOME OFFICE TAB ── */}
      {activeTab === 'homeoffice' && (
        <div>
          <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 14 }}>Home Office Deduction Calculator</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Total Home (sq ft)', key: 'homeSqFt', val: homeOffice.homeSqFt },
                { label: 'Office (sq ft)', key: 'officeSqFt', val: homeOffice.officeSqFt },
                { label: 'Rent/Mortgage ($/yr)', key: 'rentMortgage', val: homeOffice.rentMortgage },
                { label: 'Utilities ($/yr)', key: 'utilities', val: homeOffice.utilities },
                { label: 'Insurance ($/yr)', key: 'insurance', val: homeOffice.insurance },
                { label: 'Home Value ($)', key: 'homeValue', val: homeOffice.homeValue },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input className="input" type="number" value={f.val} onChange={e => setHomeOffice({ ...homeOffice, [f.key]: +e.target.value })} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ownership</label>
                <select className="input" value={homeOffice.isOwner ? 'own' : 'rent'} onChange={e => setHomeOffice({ ...homeOffice, isOwner: e.target.value === 'own' })}>
                  <option value="own">Own</option>
                  <option value="rent">Rent</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="glass-card" style={{
              padding: 20,
              border: homeOfficeAnalysis.recommendation === 'simplified' ? '1px solid var(--accent-emerald)' : undefined,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Simplified Method</div>
                {homeOfficeAnalysis.recommendation === 'simplified' && <span className="badge emerald">✓ RECOMMENDED</span>}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', marginBottom: 8 }}>
                {fmt(homeOfficeAnalysis.simplified.deduction)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{homeOfficeAnalysis.simplified.calculation}</div>
            </div>
            <div className="glass-card" style={{
              padding: 20,
              border: homeOfficeAnalysis.recommendation === 'regular' ? '1px solid var(--accent-emerald)' : undefined,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Regular Method</div>
                {homeOfficeAnalysis.recommendation === 'regular' && <span className="badge emerald">✓ RECOMMENDED</span>}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', marginBottom: 8 }}>
                {fmt(homeOfficeAnalysis.regular.deduction)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{homeOfficeAnalysis.regular.calculation}</div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 16, marginTop: 14, fontSize: 12, color: 'var(--accent-gold)' }}>
            Difference: {fmt(homeOfficeAnalysis.difference)}/year more with {homeOfficeAnalysis.recommendation === 'simplified' ? 'Simplified' : 'Regular'} method
          </div>
        </div>
      )}

      {/* ── PURCHASE TIMING TAB ── */}
      {activeTab === 'timing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {summary.purchaseTimingInsights.map((ins, i) => {
            const cfg: Record<string, { icon: React.ReactNode; color: string }> = {
              warning: { icon: <AlertTriangle size={16} />, color: 'var(--accent-amber)' },
              opportunity: { icon: <Lightbulb size={16} />, color: 'var(--accent-emerald)' },
              info: { icon: <Info size={16} />, color: 'var(--accent-blue)' },
            }
            const c = cfg[ins.type] || cfg.info

            return (
              <div key={i} className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.color,
                }}>{c.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{ins.title}</div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{ins.detail}</p>
                </div>
                {ins.impact != null && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: c.color }}>{fmt(ins.impact)}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
