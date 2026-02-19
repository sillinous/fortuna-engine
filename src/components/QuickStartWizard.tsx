/**
 * FORTUNA ENGINE — Quick Start Wizard (Phase 1 UX Fix)
 *
 * Interview-style onboarding: one question per screen, friendly copy,
 * instant tax estimate after 5 questions. Replaces dense DataSetup
 * for first-time users. DataSetup remains for detailed editing.
 */

import { useState, useCallback } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { ViewKey } from '../App'
import {
  ArrowRight, ArrowLeft, Sparkles, DollarSign, Building2,
  MapPin, Briefcase, Users, Flame, CheckCircle2, TrendingUp,
  Zap, ChevronRight, SkipForward,
} from 'lucide-react'

// ─── Step Definitions ───────────────────────────────────────────────

interface WizardStep {
  id: string
  question: string
  subtitle: string
  type: 'choice' | 'input' | 'multi' | 'result'
  field?: string
  options?: { value: string; label: string; description?: string; icon: React.ReactNode }[]
  inputType?: 'currency' | 'text'
  placeholder?: string
  skipLabel?: string
}

const STEPS: WizardStep[] = [
  {
    id: 'welcome',
    question: 'What brings you to Fortuna?',
    subtitle: 'This helps us personalize your experience. You can always change this later.',
    type: 'choice',
    field: 'goal',
    options: [
      { value: 'minimize_taxes', label: 'Reduce my tax bill', description: 'Find deductions and optimize my structure', icon: <DollarSign size={22} /> },
      { value: 'track_crypto', label: 'Track crypto taxes', description: 'Cost basis, DeFi, and IRS reporting', icon: <TrendingUp size={22} /> },
      { value: 'plan_entity', label: 'Choose a business structure', description: 'LLC vs S-Corp vs sole prop comparison', icon: <Building2 size={22} /> },
      { value: 'general', label: 'Just exploring', description: 'Show me everything Fortuna can do', icon: <Sparkles size={22} /> },
    ],
  },
  {
    id: 'filing',
    question: 'How do you file your taxes?',
    subtitle: 'This determines your standard deduction and tax brackets.',
    type: 'choice',
    field: 'filingStatus',
    options: [
      { value: 'single', label: 'Single', icon: <Users size={22} /> },
      { value: 'married_joint', label: 'Married, filing jointly', icon: <Users size={22} /> },
      { value: 'married_separate', label: 'Married, filing separately', icon: <Users size={22} /> },
      { value: 'head_of_household', label: 'Head of household', icon: <Users size={22} /> },
    ],
  },
  {
    id: 'state',
    question: 'Which state do you live in?',
    subtitle: 'State taxes can vary from 0% to 13.3%. This matters a lot.',
    type: 'input',
    field: 'state',
    inputType: 'text',
    placeholder: 'e.g. Illinois, California, Texas...',
    skipLabel: 'Skip for now',
  },
  {
    id: 'income',
    question: 'Roughly, what\'s your annual income?',
    subtitle: 'A ballpark is fine. This helps us estimate your tax bracket and find relevant strategies.',
    type: 'choice',
    field: 'incomeRange',
    options: [
      { value: '25000', label: 'Under $50K', icon: <DollarSign size={22} /> },
      { value: '75000', label: '$50K - $100K', icon: <DollarSign size={22} /> },
      { value: '150000', label: '$100K - $200K', icon: <DollarSign size={22} /> },
      { value: '300000', label: '$200K+', icon: <DollarSign size={22} /> },
    ],
  },
  {
    id: 'work_type',
    question: 'How do you earn most of your income?',
    subtitle: 'Self-employment income is taxed differently and has more optimization opportunities.',
    type: 'multi',
    field: 'incomeTypes',
    options: [
      { value: 'w2', label: 'W-2 Employee', description: 'Salary or hourly wages', icon: <Briefcase size={22} /> },
      { value: 'self_employed', label: 'Self-employed / Freelance', description: '1099, contracts, gig work', icon: <Zap size={22} /> },
      { value: 'business_owner', label: 'Business owner', description: 'LLC, S-Corp, or partnership', icon: <Building2 size={22} /> },
      { value: 'investments', label: 'Investments / Crypto', description: 'Stocks, crypto, rental income', icon: <TrendingUp size={22} /> },
    ],
  },
  {
    id: 'result',
    question: '',
    subtitle: '',
    type: 'result',
  },
]

// ─── US State lookup ────────────────────────────────────────────────

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
}

function resolveState(input: string): string {
  const lower = input.trim().toLowerCase()
  if (lower.length === 2) return lower.toUpperCase()
  return STATE_CODES[lower] || input.trim().slice(0, 2).toUpperCase()
}

// ─── Quick tax estimate ─────────────────────────────────────────────

function quickEstimate(answers: Record<string, string | string[]>): { estimatedTax: number; effectiveRate: number; potentialSavings: number } {
  const income = parseInt(answers.incomeRange as string) || 75000
  const isSelfEmployed = (answers.incomeTypes as string[] || []).includes('self_employed') || (answers.incomeTypes as string[] || []).includes('business_owner')
  const filing = answers.filingStatus as string || 'single'

  // Simplified federal estimate
  const standardDeduction = filing === 'married_joint' ? 29200 : 14600
  const taxable = Math.max(0, income - standardDeduction)
  let fedTax = 0
  const brackets = filing === 'married_joint'
    ? [[23850, 0.10], [73100, 0.12], [109650, 0.22], [167350, 0.24], [209450, 0.32], [250550, 0.35], [Infinity, 0.37]]
    : [[11925, 0.10], [36550, 0.12], [54925, 0.22], [93950, 0.24], [53225, 0.32], [375825, 0.35], [Infinity, 0.37]]
  let remaining = taxable
  for (const [width, rate] of brackets) {
    const amount = Math.min(remaining, width as number)
    fedTax += amount * (rate as number)
    remaining -= amount
    if (remaining <= 0) break
  }

  const seTax = isSelfEmployed ? income * 0.9235 * 0.153 : 0
  const totalTax = fedTax + seTax

  // Potential savings estimate based on common missed deductions
  let savings = 0
  if (isSelfEmployed) {
    savings += Math.min(income * 0.2, 20000) // QBI deduction potential
    savings += 3000 // Home office
    savings += 2000 // Business expenses
  }
  savings += 1500 // Average missed deductions

  return {
    estimatedTax: Math.round(totalTax),
    effectiveRate: Math.round((totalTax / income) * 1000) / 10,
    potentialSavings: Math.round(savings),
  }
}

// ─── Component ──────────────────────────────────────────────────────

interface QuickStartProps {
  onComplete: (navigateTo?: ViewKey) => void
  onSkipToFull: () => void
}

export function QuickStartWizard({ onComplete, onSkipToFull }: QuickStartProps) {
  const { state, updateState } = useFortuna()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [stateInput, setStateInput] = useState('')

  const step = STEPS[currentStep]
  const totalSteps = STEPS.length
  const isResult = step.type === 'result'

  const setAnswer = useCallback((field: string, value: string) => {
    setAnswers(prev => ({ ...prev, [field]: value }))
  }, [])

  const toggleMulti = useCallback((field: string, value: string) => {
    setAnswers(prev => {
      const current = (prev[field] as string[]) || []
      return {
        ...prev,
        [field]: current.includes(value) ? current.filter(v => v !== value) : [...current, value],
      }
    })
  }, [])

  const canProceed = useCallback((): boolean => {
    if (!step.field) return true
    if (step.type === 'input') return true // Input steps are always skippable
    const val = answers[step.field]
    if (step.type === 'multi') return Array.isArray(val) && val.length > 0
    return !!val
  }, [step, answers])

  const goNext = useCallback(() => {
    if (currentStep < totalSteps - 1) setCurrentStep(prev => prev + 1)
  }, [currentStep, totalSteps])

  const goBack = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }, [currentStep])

  const finishWizard = useCallback((navigateTo?: ViewKey) => {
    // Apply answers to Fortuna state
    const income = parseInt(answers.incomeRange as string) || 75000
    const isSE = (answers.incomeTypes as string[] || []).includes('self_employed') || (answers.incomeTypes as string[] || []).includes('business_owner')
    const resolvedState = stateInput ? resolveState(stateInput) : 'IL'

    updateState(prev => ({
      ...prev,
      filingStatus: (answers.filingStatus as string) || 'single',
      stateCode: resolvedState,
      onboardingComplete: true,
      w2Income: !isSE ? income : (prev.w2Income || 0),
      selfEmploymentIncome: isSE ? income : (prev.selfEmploymentIncome || 0),
      incomeStreams: prev.incomeStreams.length > 0 ? prev.incomeStreams : [
        {
          id: 'qs-income-1',
          name: isSE ? 'Self-Employment Income' : 'W-2 Salary',
          type: isSE ? 'freelance' : 'w2',
          annualAmount: income,
          isActive: true,
          taxWithheld: !isSE ? Math.round(income * 0.22) : 0,
        } as any,
      ],
    }))

    onComplete(navigateTo)
  }, [answers, stateInput, updateState, onComplete])

  // ─── Result Screen ──────────────────────────────────────────────

  if (isResult) {
    const estimate = quickEstimate(answers)
    return (
      <div className="wizard-container" style={{ paddingTop: 40 }}>
        {/* Animated success icon */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(212,168,67,0.3)',
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            <Flame size={36} color="#0c0e12" />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--text-primary)', marginBottom: 8 }}>
            Here's your snapshot
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
            Based on what you've told us, here's a quick look at your tax situation.
          </div>
        </div>

        {/* Estimate cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Estimated Tax', value: `$${estimate.estimatedTax.toLocaleString()}`, color: 'var(--accent-blue)' },
            { label: 'Effective Rate', value: `${estimate.effectiveRate}%`, color: 'var(--accent-gold)' },
            { label: 'Potential Savings', value: `$${estimate.potentialSavings.toLocaleString()}`, color: 'var(--accent-emerald)' },
          ].map(card => (
            <div key={card.label} style={{
              padding: 20, borderRadius: 14, background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>{card.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 32, lineHeight: 1.6 }}>
          This is a rough estimate. Add more details in your profile to get precise calculations with state taxes, deductions, and credits.
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, margin: '0 auto' }}>
          <button onClick={() => finishWizard('dashboard')} className="wizard-btn-next" style={{ justifyContent: 'center', width: '100%', padding: '14px 24px', fontSize: 15 }}>
            <Sparkles size={18} />
            Explore My Dashboard
          </button>
          <button onClick={() => finishWizard('deductions')} style={{
            padding: '12px 24px', borderRadius: 10, border: '1px solid var(--accent-emerald)',
            background: 'rgba(52,211,153,0.08)', color: 'var(--accent-emerald)',
            cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
          }}>
            <DollarSign size={18} />
            Find My Deductions
          </button>
          <button onClick={onSkipToFull} style={{
            padding: '10px', background: 'transparent', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
            fontFamily: 'var(--font-body)', transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
            Enter detailed data instead
          </button>
        </div>
      </div>
    )
  }

  // ─── Question Screens ─────────────────────────────────────────────

  return (
    <div className="wizard-container">
      {/* Progress bar */}
      <div className="wizard-progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps} aria-label={`Step ${currentStep + 1} of ${totalSteps - 1}`}>
        {STEPS.slice(0, -1).map((_, i) => (
          <div key={i} className={`wizard-step-dot ${i < currentStep ? 'complete' : ''} ${i === currentStep ? 'active' : ''}`} />
        ))}
      </div>

      {/* Question */}
      <h2 className="wizard-question">{step.question}</h2>
      <p className="wizard-subtitle">{step.subtitle}</p>

      {/* Choice options */}
      {step.type === 'choice' && step.options && (
        <div className="wizard-options" role="radiogroup" aria-label={step.question}>
          {step.options.map(opt => (
            <button
              key={opt.value}
              className={`wizard-option ${answers[step.field!] === opt.value ? 'selected' : ''}`}
              onClick={() => { setAnswer(step.field!, opt.value); setTimeout(goNext, 200) }}
              role="radio"
              aria-checked={answers[step.field!] === opt.value}
            >
              <div className="wizard-option-icon" style={{ background: answers[step.field!] === opt.value ? 'var(--accent-gold-dim)' : 'var(--bg-hover)', color: answers[step.field!] === opt.value ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
                {opt.icon}
              </div>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{opt.label}</div>
                {opt.description && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{opt.description}</div>}
              </div>
              {answers[step.field!] === opt.value && <CheckCircle2 size={20} color="var(--accent-gold)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}

      {/* Multi-select options */}
      {step.type === 'multi' && step.options && (
        <div className="wizard-options" role="group" aria-label={step.question}>
          {step.options.map(opt => {
            const selected = ((answers[step.field!] as string[]) || []).includes(opt.value)
            return (
              <button
                key={opt.value}
                className={`wizard-option ${selected ? 'selected' : ''}`}
                onClick={() => toggleMulti(step.field!, opt.value)}
                role="checkbox"
                aria-checked={selected}
              >
                <div className="wizard-option-icon" style={{ background: selected ? 'var(--accent-gold-dim)' : 'var(--bg-hover)', color: selected ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
                  {opt.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>{opt.label}</div>
                  {opt.description && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{opt.description}</div>}
                </div>
                {selected && <CheckCircle2 size={20} color="var(--accent-gold)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}

      {/* Text input */}
      {step.type === 'input' && (
        <div style={{ marginBottom: 32 }}>
          <input
            type="text"
            value={stateInput}
            onChange={e => setStateInput(e.target.value)}
            placeholder={step.placeholder}
            autoFocus
            className="form-input"
            style={{ width: '100%', fontSize: 16, padding: '14px 18px' }}
            aria-label={step.question}
            onKeyDown={e => { if (e.key === 'Enter') goNext() }}
          />
        </div>
      )}

      {/* Navigation */}
      <div className="wizard-nav">
        <div>
          {currentStep > 0 && (
            <button className="wizard-btn-back" onClick={goBack} aria-label="Go back">
              <ArrowLeft size={16} style={{ marginRight: 6 }} />
              Back
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {step.skipLabel && (
            <button className="wizard-btn-back" onClick={goNext}>
              {step.skipLabel} <SkipForward size={14} style={{ marginLeft: 4 }} />
            </button>
          )}
          {(step.type === 'multi' || step.type === 'input') && (
            <button className="wizard-btn-next" onClick={goNext} disabled={step.type === 'multi' && !canProceed()}>
              Continue <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Skip to full setup */}
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <button onClick={onSkipToFull} style={{
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)',
          display: 'inline-flex', alignItems: 'center', gap: 4, transition: 'color 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
          I'd prefer to enter detailed data <ChevronRight size={12} />
        </button>
      </div>
    </div>
  )
}
