import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import { runMultiYearAnalysis, type YearProjection, type IncomeShiftScenario, type MultiYearInsight } from '../engine/multi-year-tax'
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Info,
  ChevronRight, Calendar, DollarSign, BarChart3, Zap, Shield,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'

interface MultiYearTaxViewProps {
  onNavigate: (view: ViewKey) => void
}

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString()
const pct = (n: number) => (n * 100).toFixed(1) + '%'

export function MultiYearTaxView({ onNavigate }: MultiYearTaxViewProps) {
  const { state } = useFortuna()
  const [horizonYears, setHorizonYears] = useState(5)
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'projection' | 'scenarios' | 'brackets' | 'insights'>('projection')

  const analysis = useMemo(
    () => runMultiYearAnalysis(state, horizonYears),
    [state, horizonYears],
  )

  const hasData = state.incomeStreams.some(s => s.isActive && s.annualAmount > 0)

  if (!hasData) {
    return (
      <div className="view-container" style={{ padding: 32 }}>
        <h2 className="view-title">Multi-Year Tax Projection</h2>
        <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
          <Calendar size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <p style={{ color: 'var(--text-secondary)' }}>Add income streams to generate multi-year projections.</p>
          <button className="btn btn-primary" onClick={() => onNavigate('setup')} style={{ marginTop: 16 }}>Set Up Income →</button>
        </div>
      </div>
    )
  }

  const baseline = analysis.baseline
  const totalTax = baseline.reduce((s, y) => s + y.totalTax, 0)
  const totalIncome = baseline.reduce((s, y) => s + y.grossIncome, 0)
  const maxAfterTax = Math.max(...baseline.map(y => y.afterTax))
  const hasTcjaSunset = baseline.some(y => y.bracketRegime === 'pre_tcja')

  const tabs = [
    { id: 'projection' as const, label: 'Projection', icon: <TrendingUp size={14} /> },
    { id: 'scenarios' as const, label: `Scenarios (${analysis.scenarios.length})`, icon: <Zap size={14} /> },
    { id: 'brackets' as const, label: 'Brackets', icon: <BarChart3 size={14} /> },
    { id: 'insights' as const, label: `Insights (${analysis.insights.length})`, icon: <Lightbulb size={14} /> },
  ]

  return (
    <div className="view-container" style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h2 className="view-title" style={{ marginBottom: 4 }}>Multi-Year Tax Projection</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{horizonYears}-year forecast with TCJA sunset modeling and income shifting optimization</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[3, 5].map(n => (
            <button
              key={n}
              onClick={() => setHorizonYears(n)}
              className={`tab-btn ${horizonYears === n ? 'active' : ''}`}
              style={{ padding: '6px 14px', fontSize: 12 }}
            >{n} Years</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{horizonYears}-Yr Total Tax</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>{fmt(totalTax)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>on {fmt(totalIncome)} income</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Blended Rate</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{pct(totalTax / totalIncome)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>effective across {horizonYears} years</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Bracket Headroom</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>{fmt(analysis.bracketHeadroom)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>before next rate jump</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px', border: hasTcjaSunset ? '1px solid var(--accent-red-dim)' : undefined }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>TCJA Sunset Impact</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: analysis.tcjaSunsetImpact > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
            {analysis.tcjaSunsetImpact > 0 ? `+${fmt(analysis.tcjaSunsetImpact)}` : 'N/A'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hasTcjaSunset ? 'annual tax increase' : 'within projection window'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ── PROJECTION TAB ── */}
      {activeTab === 'projection' && (
        <div>
          {/* Bar chart visualization */}
          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 20 }}>Income & Tax Trajectory</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 200 }}>
              {baseline.map(yr => {
                const incomeH = (yr.grossIncome / (maxAfterTax * 1.3)) * 180
                const taxH = (yr.totalTax / (maxAfterTax * 1.3)) * 180
                const isSunset = yr.bracketRegime === 'pre_tcja'

                return (
                  <div key={yr.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>{fmt(yr.afterTax)}</div>
                    <div style={{ position: 'relative', width: '100%', display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <div style={{
                        width: '40%', height: incomeH, borderRadius: '6px 6px 0 0',
                        background: 'linear-gradient(180deg, var(--accent-gold), #b8912e)',
                        opacity: 0.8,
                      }} />
                      <div style={{
                        width: '40%', height: taxH, borderRadius: '6px 6px 0 0',
                        background: isSunset
                          ? 'linear-gradient(180deg, var(--accent-red), #c0392b)'
                          : 'linear-gradient(180deg, rgba(239,107,107,0.6), rgba(239,107,107,0.3))',
                      }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                      }}>{yr.year}</div>
                      {isSunset && (
                        <div style={{ fontSize: 8, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>POST-TCJA</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent-gold)' }} /> Gross Income
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent-red)', opacity: 0.6 }} /> Total Tax
              </div>
            </div>
          </div>

          {/* Year-by-year table */}
          <div className="glass-card" style={{ padding: 20, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Year', 'Gross Income', 'Growth', 'Federal', 'SE Tax', 'State', 'Total Tax', 'Eff. Rate', 'Marginal', 'After Tax'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baseline.map((yr, i) => (
                  <tr key={yr.year} style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: yr.bracketRegime === 'pre_tcja' ? 'rgba(239,107,107,0.04)' : undefined,
                  }}>
                    <td style={{ padding: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: yr.bracketRegime === 'pre_tcja' ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                      {yr.year} {yr.bracketRegime === 'pre_tcja' && '⚠️'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(yr.grossIncome)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: yr.growthRate > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                      {i === 0 ? '—' : `+${(yr.growthRate * 100).toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(yr.federalTax)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(yr.seTax)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{fmt(yr.stateTax)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-red)' }}>{fmt(yr.totalTax)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{pct(yr.effectiveRate)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: yr.marginalRate >= 0.32 ? 'var(--accent-red)' : 'var(--text-primary)' }}>{pct(yr.marginalRate)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-emerald)' }}>{fmt(yr.afterTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SCENARIOS TAB ── */}
      {activeTab === 'scenarios' && (
        <div>
          {analysis.scenarios.length === 0 ? (
            <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>No income shifting opportunities identified at current income levels.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {analysis.scenarios.map(sc => {
                const isOpen = selectedScenario === sc.id
                const recColors: Record<string, string> = {
                  strong: 'var(--accent-emerald)', moderate: 'var(--accent-gold)',
                  neutral: 'var(--text-muted)', avoid: 'var(--accent-red)',
                }
                return (
                  <div key={sc.id} className="glass-card" style={{
                    padding: '18px 20px', cursor: 'pointer',
                    border: isOpen ? '1px solid var(--border-glow)' : undefined,
                  }}
                  onClick={() => setSelectedScenario(isOpen ? null : sc.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: `${recColors[sc.recommendation]}15`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Zap size={16} color={recColors[sc.recommendation]} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{sc.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${sc.recommendation === 'strong' ? 'emerald' : sc.recommendation === 'moderate' ? 'gold' : 'muted'}`}>
                              {sc.recommendation}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sc.shifts.length} year{sc.shifts.length !== 1 ? 's' : ''} affected</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                          {fmt(sc.totalTaxSavings)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>tax savings</div>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{sc.description}</p>
                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-surface)', marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 8 }}>REASONING</div>
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sc.reasoning}</p>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>Income Shifts:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {sc.shifts.map((sh, i) => (
                            <div key={i} style={{
                              padding: '6px 12px', borderRadius: 8,
                              background: sh.shiftAmount > 0 ? 'var(--accent-emerald-dim)' : 'var(--accent-red-dim)',
                              fontSize: 12, fontFamily: 'var(--font-mono)',
                              color: sh.shiftAmount > 0 ? 'var(--accent-emerald)' : 'var(--accent-red)',
                            }}>
                              {sh.year}: {sh.shiftAmount > 0 ? '+' : ''}{fmt(sh.shiftAmount)} ({sh.shiftType.replace(/_/g, ' ')})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── BRACKETS TAB ── */}
      {activeTab === 'brackets' && baseline.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(baseline.length, 5)}, 1fr)`, gap: 14 }}>
            {baseline.map(yr => (
              <div key={yr.year} className="glass-card" style={{ padding: 16 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)',
                  color: yr.bracketRegime === 'pre_tcja' ? 'var(--accent-red)' : 'var(--text-primary)',
                  marginBottom: 12,
                }}>
                  {yr.year} {yr.bracketRegime === 'pre_tcja' && '⚠️'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {yr.bracketUtilization.filter(b => b.capacity < 400000).map((b, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 2 }}>
                        <span>{(b.rate * 100).toFixed(0)}%</span>
                        <span>{b.utilization > 0 ? fmt(b.filled) : '—'}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${Math.min(100, b.utilization * 100)}%`,
                          background: b.utilization >= 0.9 ? 'var(--accent-red)'
                            : b.utilization >= 0.5 ? 'var(--accent-gold)'
                            : 'var(--accent-emerald)',
                          transition: 'width 0.5s ease-out',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  Marginal: <span style={{ color: yr.marginalRate >= 0.32 ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: 600 }}>{pct(yr.marginalRate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── INSIGHTS TAB ── */}
      {activeTab === 'insights' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {analysis.insights.map((ins, i) => {
            const typeConfig: Record<string, { icon: React.ReactNode; color: string }> = {
              warning: { icon: <AlertTriangle size={16} />, color: 'var(--accent-red)' },
              opportunity: { icon: <Lightbulb size={16} />, color: 'var(--accent-emerald)' },
              info: { icon: <Info size={16} />, color: 'var(--accent-blue)' },
            }
            const cfg = typeConfig[ins.type] || typeConfig.info

            return (
              <div key={i} className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: `${cfg.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: cfg.color,
                }}>
                  {cfg.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{ins.title}</div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{ins.detail}</p>
                </div>
                {ins.impact != null && ins.impact > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)', color: cfg.color }}>{fmt(ins.impact)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>impact</div>
                  </div>
                )}
                {ins.actionView && (
                  <button
                    onClick={e => { e.stopPropagation(); onNavigate(ins.actionView as ViewKey) }}
                    style={{
                      background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6,
                      padding: '5px 10px', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    View <ChevronRight size={11} style={{ verticalAlign: 'middle' }} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
