import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { optimizeEntities, analyzeIncomeThresholds, calculateReasonableSalary, type EntityScenario } from '../engine/entity-optimizer'
import {
  Building2, Award, TrendingDown, DollarSign, AlertTriangle,
  CheckCircle, ArrowRight, ChevronDown, ChevronUp, Scale, Sliders, Target
} from 'lucide-react'

export function EntityOptimizer() {
  const { state } = useFortuna()
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [customSalary, setCustomSalary] = useState<number | null>(null)
  const [showThresholds, setShowThresholds] = useState(false)

  const result = useMemo(() => optimizeEntities(state), [state])
  const thresholds = useMemo(() => {
    const seIncome = state.incomeStreams
      .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
      .reduce((sum, s) => sum + s.annualAmount, 0)
    const expenses = state.expenses.filter(e => e.isDeductible)
      .reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)
    return analyzeIncomeThresholds(Math.max(0, seIncome - expenses), state.profile.state || 'IL')
  }, [state])

  const activeScenario = result.scenarios.find(s => s.id === selectedScenario) || result.recommended

  const maxTaxBurden = Math.max(...result.scenarios.map(s => s.totalTaxBurden))

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Building2 size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            Entity Optimizer
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Automatically model optimal entity structures for your income mix
        </p>
      </div>

      {/* Summary Banner */}
      <div style={{
        padding: 24, background: 'var(--bg-elevated)', borderRadius: 16,
        border: '1px solid var(--border-subtle)', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Optimizer Recommendation
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              {result.recommended.label}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, maxWidth: 500 }}>
              {result.summary}
            </div>
          </div>

          {result.maxSavings > 0 && (
            <div style={{
              textAlign: 'center', padding: '14px 24px', background: 'rgba(16,185,129,0.08)',
              borderRadius: 14, border: '1px solid rgba(16,185,129,0.2)',
            }}>
              <div style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Annual Savings
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#10b981' }}>
                ${result.maxSavings.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>vs. sole proprietorship</div>
            </div>
          )}
        </div>
      </div>

      {/* Scenario Comparison Cards */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Scale size={16} style={{ color: 'var(--accent-gold)' }} />
          Structure Comparison
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(result.scenarios.length, 4)}, 1fr)`, gap: 12 }}>
          {result.scenarios.map(scenario => {
            const isSelected = activeScenario.id === scenario.id
            const barWidth = maxTaxBurden > 0 ? (scenario.totalTaxBurden / maxTaxBurden) * 100 : 0
            const barColor = scenario.isRecommended ? '#10b981' : isSelected ? 'var(--accent-gold)' : 'var(--text-muted)'

            return (
              <button
                key={scenario.id}
                onClick={() => setSelectedScenario(scenario.id)}
                style={{
                  textAlign: 'left', padding: 20, borderRadius: 14,
                  border: `2px solid ${isSelected ? 'var(--accent-gold)' : scenario.isRecommended ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`,
                  background: isSelected ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                  cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                }}
              >
                {scenario.isRecommended && (
                  <div style={{
                    position: 'absolute', top: -8, right: 12,
                    padding: '2px 10px', borderRadius: 6,
                    background: '#10b981', color: '#fff',
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  }}>
                    RECOMMENDED
                  </div>
                )}

                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {scenario.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 14, minHeight: 30 }}>
                  {scenario.description}
                </div>

                {/* Tax burden bar */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    <span>Total Tax Burden</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: barColor }}>
                      ${scenario.totalTaxBurden.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', width: `${barWidth}%`, background: barColor,
                      borderRadius: 3, transition: 'width 0.5s',
                    }} />
                  </div>
                </div>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>SE Tax</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      ${scenario.totalSETax.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Compliance</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      ${scenario.totalComplianceCost.toLocaleString()}/yr
                    </div>
                  </div>
                </div>

                {scenario.netSavings > 0 && (
                  <div style={{
                    marginTop: 10, padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(16,185,129,0.1)', fontSize: 12,
                    color: '#10b981', fontWeight: 600, fontFamily: 'var(--font-mono)',
                    display: 'inline-block',
                  }}>
                    ↓ Save ${scenario.netSavings.toLocaleString()}/yr
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Scenario Detail */}
      <div style={{
        padding: 24, background: 'var(--bg-elevated)', borderRadius: 16,
        border: '1px solid var(--border-subtle)', marginBottom: 24,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          {activeScenario.label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
          {activeScenario.reasoning}
        </div>

        {/* Entity breakdown */}
        {activeScenario.entities.map((entity, i) => (
          <div key={i} style={{
            padding: 16, background: 'var(--bg-primary)', borderRadius: 12,
            border: '1px solid var(--border-subtle)', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{entity.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Allocated: ${entity.allocatedIncome.toLocaleString()}
                </div>
              </div>
              {entity.reasonableSalary !== undefined && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Salary / Distributions</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    ${entity.reasonableSalary.toLocaleString()} / ${(entity.distributions || 0).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Pros & Cons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>Advantages</div>
            {activeScenario.pros.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <CheckCircle size={14} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
                {p}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>Considerations</div>
            {activeScenario.cons.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                {c}
              </div>
            ))}
          </div>
        </div>

        {activeScenario.breakEvenMonths > 0 && activeScenario.breakEvenMonths < 999 && (
          <div style={{
            marginTop: 16, padding: '10px 16px', background: 'var(--bg-primary)',
            borderRadius: 8, fontSize: 12, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Target size={14} style={{ color: 'var(--accent-gold)' }} />
            Break-even on formation costs in <strong style={{ color: 'var(--text-primary)' }}>
            {activeScenario.breakEvenMonths} month{activeScenario.breakEvenMonths !== 1 ? 's' : ''}</strong>
          </div>
        )}
      </div>

      {/* Reasonable Salary Analysis */}
      {result.salaryAnalysis && (
        <div style={{
          padding: 24, background: 'var(--bg-elevated)', borderRadius: 16,
          border: '1px solid var(--border-subtle)', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Sliders size={18} style={{ color: 'var(--accent-gold)' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Reasonable Salary Analysis
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recommended Salary</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--accent-gold)' }}>
                ${result.salaryAnalysis.recommendedSalary.toLocaleString()}
              </div>
            </div>
            <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Distributions</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#10b981' }}>
                ${result.salaryAnalysis.distributions.toLocaleString()}
              </div>
            </div>
            <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>SE Tax Savings</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>
                ${result.salaryAnalysis.seTaxSavings.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Salary range visualization */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Defensible Salary Range
            </div>
            <div style={{ position: 'relative', height: 32, background: 'var(--bg-primary)', borderRadius: 8 }}>
              {/* Range bar */}
              {(() => {
                const max = result.salaryAnalysis!.income
                const minPct = (result.salaryAnalysis!.salaryRange.min / max) * 100
                const maxPct = (result.salaryAnalysis!.salaryRange.max / max) * 100
                const recPct = (result.salaryAnalysis!.recommendedSalary / max) * 100
                return (
                  <>
                    <div style={{
                      position: 'absolute', left: `${minPct}%`, right: `${100 - maxPct}%`,
                      top: 8, height: 16, background: 'rgba(59,130,246,0.15)', borderRadius: 6,
                    }} />
                    <div style={{
                      position: 'absolute', left: `${recPct}%`, top: 4, width: 3, height: 24,
                      background: 'var(--accent-gold)', borderRadius: 2, transform: 'translateX(-50%)',
                    }} />
                    <div style={{
                      position: 'absolute', left: `${minPct}%`, top: 36, fontSize: 10,
                      color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    }}>
                      ${result.salaryAnalysis!.salaryRange.min.toLocaleString()}
                    </div>
                    <div style={{
                      position: 'absolute', left: `${maxPct}%`, top: 36, fontSize: 10,
                      color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', transform: 'translateX(-100%)',
                    }}>
                      ${result.salaryAnalysis!.salaryRange.max.toLocaleString()}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {result.salaryAnalysis.methodology}
          </div>

          {/* Risk indicator */}
          <div style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 8,
            background: result.salaryAnalysis.riskLevel === 'low' ? 'rgba(16,185,129,0.06)' : result.salaryAnalysis.riskLevel === 'moderate' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
            border: `1px solid ${result.salaryAnalysis.riskLevel === 'low' ? 'rgba(16,185,129,0.2)' : result.salaryAnalysis.riskLevel === 'moderate' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`,
            fontSize: 12,
            color: result.salaryAnalysis.riskLevel === 'low' ? '#10b981' : result.salaryAnalysis.riskLevel === 'moderate' ? '#f59e0b' : '#ef4444',
          }}>
            {result.salaryAnalysis.riskLevel === 'low' ? '✓' : '⚠'} {result.salaryAnalysis.riskNotes}
          </div>
        </div>
      )}

      {/* Income Thresholds */}
      <div style={{
        padding: 24, background: 'var(--bg-elevated)', borderRadius: 16,
        border: '1px solid var(--border-subtle)',
      }}>
        <button
          onClick={() => setShowThresholds(!showThresholds)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0,
          }}
        >
          <Target size={18} style={{ color: 'var(--accent-gold)' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>
            Income Thresholds & Milestones
          </div>
          {showThresholds ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </button>

        {showThresholds && (
          <div style={{ marginTop: 16 }}>
            {/* Current income indicator */}
            <div style={{
              padding: '10px 16px', background: 'var(--accent-gold-dim)', borderRadius: 8,
              fontSize: 12, color: 'var(--accent-gold)', fontWeight: 600, marginBottom: 16,
            }}>
              Your net SE income: ${thresholds.currentIncome.toLocaleString()}
            </div>

            {thresholds.thresholds.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                borderBottom: i < thresholds.thresholds.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                opacity: t.reached ? 1 : 0.5,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: t.reached ? '#10b981' : 'var(--bg-primary)',
                  color: t.reached ? '#fff' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, border: t.reached ? 'none' : '2px solid var(--border-subtle)',
                }}>
                  {t.reached ? <CheckCircle size={14} /> : <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {t.label} — ${t.income.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.description}</div>
                </div>

                {t.savings > 0 && (
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                    color: t.reached ? '#10b981' : 'var(--text-muted)',
                  }}>
                    ${t.savings.toLocaleString()}/yr
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
