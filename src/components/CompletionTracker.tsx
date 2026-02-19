/**
 * FORTUNA ENGINE — Profile Completion Tracker (Phase 2 UX Fix)
 *
 * Shows "Your tax profile is 73% complete" with specific missing items.
 * Motivates users to fill in data to unlock better recommendations.
 * Can appear as a banner, sidebar widget, or full panel.
 */

import { useFortuna } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import { CheckCircle2, Circle, ArrowRight, Sparkles } from 'lucide-react'

// ─── Completion Criteria ────────────────────────────────────────────

interface CompletionItem {
  id: string
  label: string
  description: string
  check: (state: any) => boolean
  navigateTo: ViewKey
  weight: number // importance: 1-3
}

const COMPLETION_ITEMS: CompletionItem[] = [
  {
    id: 'filing_status',
    label: 'Filing status',
    description: 'Determines your standard deduction and tax brackets',
    check: (s) => !!s.filingStatus && s.filingStatus !== 'single',
    navigateTo: 'setup',
    weight: 3,
  },
  {
    id: 'state',
    label: 'State of residence',
    description: 'Needed for state tax calculations',
    check: (s) => !!s.stateCode && s.stateCode.length === 2,
    navigateTo: 'setup',
    weight: 3,
  },
  {
    id: 'income',
    label: 'At least one income source',
    description: 'Needed for any tax calculations',
    check: (s) => s.incomeStreams?.some((i: any) => i.isActive && i.annualAmount > 0),
    navigateTo: 'setup',
    weight: 3,
  },
  {
    id: 'expenses',
    label: 'Business expenses',
    description: 'Reduces your taxable income',
    check: (s) => s.expenses?.length > 0,
    navigateTo: 'setup',
    weight: 2,
  },
  {
    id: 'dependents',
    label: 'Dependents',
    description: 'May qualify you for child tax credit and lower rates',
    check: (s) => s.profile?.dependents !== undefined,
    navigateTo: 'setup',
    weight: 1,
  },
  {
    id: 'entity_type',
    label: 'Business entity type',
    description: 'Affects how your business income is taxed',
    check: (s) => s.entities?.length > 0 || !!s.entityType,
    navigateTo: 'entity',
    weight: 2,
  },
  {
    id: 'retirement',
    label: 'Retirement accounts',
    description: 'Unlock retirement optimization strategies',
    check: (s) => s.retirementAccounts?.length > 0 || s.deductions?.some((d: any) => d.category === 'retirement'),
    navigateTo: 'retirement',
    weight: 2,
  },
  {
    id: 'crypto',
    label: 'Crypto or investment data',
    description: 'Enables cost basis tracking and tax-loss harvesting',
    check: (s) => s.cryptoTransactions?.length > 0 || s.investments?.length > 0,
    navigateTo: 'import',
    weight: 1,
  },
  {
    id: 'estimated_payments',
    label: 'Estimated tax payments',
    description: 'Avoids underpayment penalty',
    check: (s) => s.estimatedPayments?.length > 0 || s.profile?.estimatedPayments > 0,
    navigateTo: 'setup',
    weight: 1,
  },
  {
    id: 'goals',
    label: 'Financial goals',
    description: 'Personalizes recommendations to your priorities',
    check: (s) => s.goals?.length > 0,
    navigateTo: 'goals',
    weight: 1,
  },
]

// ─── Compute Completion ─────────────────────────────────────────────

export interface CompletionResult {
  percentage: number
  completed: CompletionItem[]
  missing: CompletionItem[]
  topPriority: CompletionItem | null
}

export function computeCompletion(state: any): CompletionResult {
  const completed = COMPLETION_ITEMS.filter(item => item.check(state))
  const missing = COMPLETION_ITEMS.filter(item => !item.check(state))

  const totalWeight = COMPLETION_ITEMS.reduce((s, i) => s + i.weight, 0)
  const completedWeight = completed.reduce((s, i) => s + i.weight, 0)
  const percentage = Math.round((completedWeight / totalWeight) * 100)

  // Top priority = highest weight among missing
  const topPriority = missing.sort((a, b) => b.weight - a.weight)[0] || null

  return { percentage, completed, missing, topPriority }
}

// ─── Banner Component ───────────────────────────────────────────────

export function CompletionBanner({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state } = useFortuna()
  const { percentage, missing, topPriority } = computeCompletion(state)

  if (percentage >= 100) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px', borderRadius: 12,
      background: 'var(--accent-gold-dim)',
      border: '1px solid rgba(212,168,67,0.15)',
      marginBottom: 16,
    }}
    role="status"
    aria-label={`Profile ${percentage}% complete`}
    >
      {/* Circular progress */}
      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={22} cy={22} r={18} fill="none" stroke="var(--bg-surface)" strokeWidth={3} />
          <circle cx={22} cy={22} r={18} fill="none" stroke="var(--accent-gold)" strokeWidth={3}
            strokeDasharray={`${(percentage / 100) * 113.1} 113.1`}
            strokeLinecap="round"
          />
        </svg>
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)',
        }}>
          {percentage}%
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          Your tax profile is {percentage}% complete
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {missing.length} item{missing.length !== 1 ? 's' : ''} remaining.
          {topPriority && ` Next: ${topPriority.label}`}
        </div>
      </div>

      {topPriority && (
        <button
          onClick={() => onNavigate(topPriority.navigateTo)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8,
            background: 'var(--accent-gold)', color: 'var(--bg-primary)',
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
        >
          Add {topPriority.label} <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Detailed Checklist ─────────────────────────────────────────────

export function CompletionChecklist({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { state } = useFortuna()
  const { percentage, completed, missing } = computeCompletion(state)

  return (
    <div style={{
      padding: 20, borderRadius: 14,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>Profile Completion</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            More data = better recommendations
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600,
          color: percentage >= 80 ? 'var(--accent-emerald)' : percentage >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)',
        }}>
          {percentage}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} style={{ marginBottom: 16 }}>
        <div className="progress-fill" style={{
          width: `${percentage}%`,
          background: percentage >= 80 ? 'linear-gradient(90deg, var(--accent-emerald), #2dd4bf)'
            : percentage >= 50 ? 'linear-gradient(90deg, var(--accent-gold), #e0b84d)'
            : 'linear-gradient(90deg, var(--accent-red), #f87171)',
        }} />
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[...missing, ...completed].map(item => {
          const done = completed.includes(item)
          return (
            <button
              key={item.id}
              onClick={() => !done && onNavigate(item.navigateTo)}
              disabled={done}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: 'transparent', border: 'none',
                cursor: done ? 'default' : 'pointer',
                textAlign: 'left', width: '100%',
                opacity: done ? 0.5 : 1,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!done) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {done
                ? <CheckCircle2 size={16} color="var(--accent-emerald)" />
                : <Circle size={16} color="var(--text-muted)" />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: done ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: done ? 400 : 500 }}>
                  {item.label}
                </div>
                {!done && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{item.description}</div>
                )}
              </div>
              {!done && <ArrowRight size={14} color="var(--text-muted)" />}
            </button>
          )
        })}
      </div>

      {percentage >= 100 && (
        <div style={{ textAlign: 'center', padding: '16px 0 8px', color: 'var(--accent-emerald)' }}>
          <Sparkles size={20} style={{ marginBottom: 6 }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Profile complete! All engines are fully powered.</div>
        </div>
      )}
    </div>
  )
}
