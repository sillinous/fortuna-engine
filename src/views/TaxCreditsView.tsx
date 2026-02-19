import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import { analyzeTaxCredits, type TaxCredit, type CreditOptimization, type TaxCreditSummary } from '../engine/tax-credits'
import {
  CheckCircle2, XCircle, AlertTriangle, Lightbulb,
  DollarSign, Users, GraduationCap, Zap, Heart, Briefcase,
  ChevronRight, ChevronDown, ArrowUpRight,
} from 'lucide-react'

interface TaxCreditsViewProps {
  onNavigate: (view: ViewKey) => void
}

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString()
const pct = (n: number) => (n * 100).toFixed(2) + '%'

const categoryIcons: Record<string, React.ReactNode> = {
  family: <Users size={16} />,
  education: <GraduationCap size={16} />,
  energy: <Zap size={16} />,
  retirement: <DollarSign size={16} />,
  business: <Briefcase size={16} />,
  health: <Heart size={16} />,
}

const categoryColors: Record<string, string> = {
  family: 'var(--accent-purple)',
  education: 'var(--accent-blue)',
  energy: 'var(--accent-emerald)',
  retirement: 'var(--accent-gold)',
  business: 'var(--accent-amber)',
  health: 'var(--accent-red)',
}

export function TaxCreditsView({ onNavigate }: TaxCreditsViewProps) {
  const { state } = useFortuna()
  const [expandedCredit, setExpandedCredit] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'credits' | 'optimizations'>('credits')

  const summary = useMemo(() => analyzeTaxCredits(state), [state])

  const eligibleCredits = summary.credits.filter(c => c.eligible)
  const ineligibleCredits = summary.credits.filter(c => !c.eligible)

  return (
    <div className="view-container" style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 className="view-title" style={{ marginBottom: 4 }}>Tax Credit Optimizer</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Identifies all available federal tax credits with eligibility analysis and optimization strategies</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Active Credits</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>{fmt(summary.totalCredits)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{eligibleCredits.length} credits qualify</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Tax Reduction</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{fmt(summary.taxLiabilityReduction)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>applied to liability</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Refundable</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{fmt(summary.totalRefundable)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>cash back potential</div>
        </div>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Optimization Potential</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
            {fmt(summary.optimizations.reduce((s, o) => s + o.additionalCredits, 0))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{summary.optimizations.length} opportunities</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button onClick={() => setActiveTab('credits')} className={`tab-btn ${activeTab === 'credits' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
          <DollarSign size={14} /> Credits ({summary.credits.length})
        </button>
        <button onClick={() => setActiveTab('optimizations')} className={`tab-btn ${activeTab === 'optimizations' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
          <Lightbulb size={14} /> Optimizations ({summary.optimizations.length})
        </button>
      </div>

      {/* ── CREDITS TAB ── */}
      {activeTab === 'credits' && (
        <div>
          {/* Eligible credits */}
          {eligibleCredits.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                ✓ Eligible Credits
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {eligibleCredits.map(credit => (
                  <CreditCard key={credit.id} credit={credit} expanded={expandedCredit === credit.id}
                    onToggle={() => setExpandedCredit(expandedCredit === credit.id ? null : credit.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Ineligible credits */}
          {ineligibleCredits.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                Credits to Explore
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ineligibleCredits.map(credit => (
                  <CreditCard key={credit.id} credit={credit} expanded={expandedCredit === credit.id}
                    onToggle={() => setExpandedCredit(expandedCredit === credit.id ? null : credit.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── OPTIMIZATIONS TAB ── */}
      {activeTab === 'optimizations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {summary.optimizations.length === 0 ? (
            <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
              <CheckCircle2 size={36} color="var(--accent-emerald)" style={{ marginBottom: 12 }} />
              <p style={{ color: 'var(--text-secondary)' }}>You're maximizing available credits. No additional optimizations found.</p>
            </div>
          ) : (
            summary.optimizations.map((opt, i) => {
              const diffColors: Record<string, string> = {
                easy: 'var(--accent-emerald)', moderate: 'var(--accent-gold)', complex: 'var(--accent-purple)',
              }
              return (
                <div key={i} className="glass-card" style={{ padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: `${diffColors[opt.difficulty]}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: diffColors[opt.difficulty],
                  }}>
                    <ArrowUpRight size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{opt.title}</span>
                      <span className={`badge ${opt.difficulty === 'easy' ? 'emerald' : opt.difficulty === 'moderate' ? 'gold' : 'purple'}`}>
                        {opt.difficulty}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{opt.description}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                      +{fmt(opt.additionalCredits)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>potential credit</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Credit Card Component ──
function CreditCard({ credit, expanded, onToggle }: { credit: TaxCredit; expanded: boolean; onToggle: () => void }) {
  const color = categoryColors[credit.category] || 'var(--text-muted)'
  const icon = categoryIcons[credit.category] || <DollarSign size={16} />

  return (
    <div className="glass-card" style={{
      padding: '16px 20px', cursor: 'pointer',
      opacity: credit.eligible ? 1 : 0.7,
      border: expanded ? '1px solid var(--border-glow)' : undefined,
    }}
    onClick={onToggle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color,
          }}>{icon}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{credit.name}</span>
              {credit.eligible
                ? <CheckCircle2 size={14} color="var(--accent-emerald)" />
                : <XCircle size={14} color="var(--text-muted)" />
              }
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{credit.eligibilityReason}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {credit.eligible && credit.amount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                {fmt(credit.amount)}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className={`badge ${credit.type === 'refundable' ? 'purple' : credit.type === 'partially_refundable' ? 'gold' : 'muted'}`} style={{ fontSize: 9 }}>
                  {credit.type.replace(/_/g, ' ')}
                </span>
                {credit.phaseoutApplied && <span className="badge amber" style={{ fontSize: 9 }}>phaseout</span>}
              </div>
            </div>
          )}
          {!credit.eligible && credit.fullAmount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                {fmt(credit.fullAmount)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>not eligible</div>
            </div>
          )}
          <ChevronDown size={14} color="var(--text-muted)" style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }} />
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          {credit.requirements.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Requirements</div>
              {credit.requirements.map((req, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>•</span> {req}
                </div>
              ))}
            </div>
          )}

          {credit.actionItems.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent-gold)', marginBottom: 6 }}>Action Items</div>
              {credit.actionItems.map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-primary)', padding: '2px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--accent-gold)' }}>→</span> {item}
                </div>
              ))}
            </div>
          )}

          {credit.notes.length > 0 && (
            <div style={{
              padding: 12, borderRadius: 8, background: 'var(--bg-surface)',
              fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              {credit.notes.map((n, i) => (
                <div key={i} style={{ padding: '2px 0' }}>{n}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
