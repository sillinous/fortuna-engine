import { useFortuna } from '../hooks/useFortuna'
import { Building2, Check, X, Sparkles, Shield, ArrowRight } from 'lucide-react'

const entityDetails: Record<string, { pros: string[]; cons: string[] }> = {
  sole_prop: {
    pros: ['Simplest setup', 'No formation costs', 'Direct tax filing'],
    cons: ['Unlimited personal liability', 'Full SE tax on all profit', 'No asset protection'],
  },
  llc: {
    pros: ['Personal asset protection', 'Pass-through taxation', 'Flexible management'],
    cons: ['Still pays full SE tax', 'Annual state fees', 'Some paperwork required'],
  },
  llc_scorp: {
    pros: ['SE tax savings via salary split', 'Asset protection', 'QBI deduction eligible', 'Professional credibility'],
    cons: ['Requires reasonable salary', 'Payroll setup needed', 'More bookkeeping'],
  },
  ccorp: {
    pros: ['21% flat corporate rate', 'Stock compensation options', 'Retained earnings'],
    cons: ['Double taxation risk', 'Higher compliance costs', 'Not ideal for pass-through income'],
  },
}

export function EntityDesign() {
  const { state, entityComparison, taxReport } = useFortuna()
  const hasEntities = state.entities.some(e => e.isActive)
  const currentType = state.entities.find(e => e.isActive)?.type || 'sole_prop'
  const bestEntity = entityComparison[0]

  return (
    <div className="view-enter">
      <div style={{ marginBottom: 32 }}>
        <h1 className="section-title">Entity Architecture</h1>
        <p className="section-subtitle">Computed entity comparison based on your ${taxReport.grossIncome > 0 ? `$${taxReport.grossIncome.toLocaleString()} income` : 'financial profile'}</p>
      </div>

      {bestEntity && bestEntity.type !== currentType && bestEntity.score > 60 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(212,168,67,0.06), rgba(52,211,153,0.04))',
          border: '1px solid rgba(212,168,67,0.12)',
          borderRadius: 14, padding: 24, marginBottom: 28,
          display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Sparkles size={16} color="var(--accent-gold)" />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-gold)' }}>Entity Restructure Recommended</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Switching from your current structure to <strong style={{ color: 'var(--text-primary)' }}>{bestEntity.label}</strong> could save{' '}
              <span style={{ color: 'var(--accent-emerald)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                ${Math.max(0, taxReport.totalTax - bestEntity.totalTax).toLocaleString()}/year
              </span> in taxes while providing {bestEntity.liabilityProtection ? 'personal asset protection' : 'simplified operations'}.
            </p>
          </div>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 28 }}>
        {entityComparison.map((entity, i) => {
          const isCurrent = entity.type === currentType
          const isBest = i === 0
          const details = entityDetails[entity.type] || { pros: [], cons: [] }

          return (
            <div key={entity.type} className="card" style={{
              borderColor: isBest ? 'rgba(212,168,67,0.3)' : 'var(--border-subtle)',
              position: 'relative',
            }}>
              {isBest && (
                <div style={{ position: 'absolute', top: -1, left: 20, right: 20, height: 3, background: 'linear-gradient(90deg, var(--accent-gold), #e0b84d)', borderRadius: '0 0 3px 3px' }} />
              )}
              {isCurrent && (
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <span className="pill blue" style={{ fontSize: 10 }}>Current</span>
                </div>
              )}
              {isBest && !isCurrent && (
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <span className="pill gold" style={{ fontSize: 10 }}><Sparkles size={10} /> Best Fit</span>
                </div>
              )}

              <div style={{ padding: '20px 20px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Building2 size={16} color={isBest ? 'var(--accent-gold)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{entity.label}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Score:</span>
                  <div style={{ flex: 1 }}>
                    <div className="progress-bar" style={{ height: 4 }}>
                      <div className="progress-fill" style={{
                        width: `${entity.score}%`,
                        background: entity.score >= 80 ? 'var(--accent-emerald)' : entity.score >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)',
                      }} />
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: entity.score >= 80 ? 'var(--accent-emerald)' : entity.score >= 60 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
                    {entity.score}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Total Tax', `$${entity.totalTax.toLocaleString()}`],
                    ['Effective Rate', `${(entity.effectiveRate * 100).toFixed(1)}%`],
                    ['SE Tax', `$${entity.seTax.toLocaleString()}`],
                    ['Net After Tax', `$${entity.netAfterTax.toLocaleString()}`],
                    ['Annual Cost', `$${entity.annualCost.toLocaleString()}`],
                    ['Liability', entity.liabilityProtection ? 'Limited ✓' : 'Unlimited ✗'],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                {details.pros.slice(0, 3).map((pro, j) => (
                  <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <Check size={11} color="var(--accent-emerald)" />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pro}</span>
                  </div>
                ))}
                {details.cons.slice(0, 2).map((con, j) => (
                  <div key={j} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                    <X size={11} color="var(--accent-red)" />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{con}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
