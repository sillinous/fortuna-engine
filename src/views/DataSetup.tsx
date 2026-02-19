import { useState } from 'react'
import { useFortuna, genId } from '../hooks/useFortuna'
import type { IncomeStream, BusinessExpense, LegalEntity, Deduction, FinancialProfile } from '../engine/storage'
import { STATE_TAX_RATES, calculateSelfEmploymentTax, calculateSCorpSavings, calculateMaxSEPIRA, calculateMaxSolo401k, calculateFederalIncomeTax, calculateStateTax, calculateQBIDeduction } from '../engine/tax-calculator'
import {
  User, DollarSign, Building2, Receipt, ChevronRight, ChevronLeft,
  Plus, Trash2, CheckCircle2, ArrowRight, Sparkles, Edit3,
  Lightbulb, TrendingUp, Shield, AlertTriangle, Zap, Target, PiggyBank, Calculator,
} from 'lucide-react'

const STEPS = ['Profile', 'Income', 'Entities', 'Expenses', 'Deductions', 'Review']
const INCOME_TYPES = ['business', 'w2', 'freelance', 'investment', 'rental', 'passive', 'other'] as const
const ENTITY_TYPES = ['sole_prop', 'llc', 'llc_scorp', 'scorp', 'ccorp', 'partnership', 'trust'] as const
const DEDUCTION_CATS = ['home_office', 'vehicle', 'retirement', 'health', 'education', 'charitable', 'business', 'other'] as const

// ─── Deduction Templates ──────────────────────────────────────────────

interface DeductionTemplate {
  id: string
  label: string
  emoji: string
  items: Omit<Deduction, 'id'>[]
}

const DEDUCTION_TEMPLATES: DeductionTemplate[] = [
  {
    id: 'self-employed',
    label: 'Self-Employed',
    emoji: '🏢',
    items: [
      { name: 'SEP-IRA contribution', category: 'retirement', amount: 0, isItemized: false },
      { name: 'Solo 401(k) employee deferral', category: 'retirement', amount: 0, isItemized: false },
      { name: 'Solo 401(k) employer contribution', category: 'retirement', amount: 0, isItemized: false },
      { name: 'SE health insurance premiums', category: 'health', amount: 0, isItemized: false },
      { name: 'SE tax deduction (50% of SE tax)', category: 'business', amount: 0, isItemized: false },
      { name: 'Qualified Business Income (QBI) deduction', category: 'business', amount: 0, isItemized: false },
    ],
  },
  {
    id: 'w2-itemized',
    label: 'W-2 Itemized',
    emoji: '💼',
    items: [
      { name: 'Traditional IRA contribution', category: 'retirement', amount: 0, isItemized: false },
      { name: 'Roth IRA contribution', category: 'retirement', amount: 0, isItemized: false, notes: 'Not deductible but tracks contribution for planning' },
      { name: 'HSA contribution', category: 'health', amount: 0, isItemized: false },
      { name: 'Mortgage interest', category: 'other', amount: 0, isItemized: true },
      { name: 'State & local taxes (SALT)', category: 'other', amount: 0, isItemized: true, notes: 'Capped at $10,000' },
      { name: 'Charitable donations (cash)', category: 'charitable', amount: 0, isItemized: true },
      { name: 'Charitable donations (non-cash)', category: 'charitable', amount: 0, isItemized: true },
    ],
  },
  {
    id: 'student-educator',
    label: 'Student / Educator',
    emoji: '📚',
    items: [
      { name: 'Student loan interest', category: 'education', amount: 0, isItemized: false, notes: 'Up to $2,500 above-the-line' },
      { name: 'Educator expenses', category: 'education', amount: 0, isItemized: false, notes: 'Up to $300 for K-12 educators' },
      { name: 'Tuition & fees', category: 'education', amount: 0, isItemized: false },
    ],
  },
]

// ─── Expense Templates ────────────────────────────────────────────────

interface ExpenseTemplate {
  id: string
  label: string
  description: string
  emoji: string
  items: Omit<BusinessExpense, 'id'>[]
}

const EXPENSE_TEMPLATES: ExpenseTemplate[] = [
  {
    id: 'w2-individual',
    label: 'W-2 Employee',
    description: 'Standard employee with wage income',
    emoji: '💼',
    items: [
      { category: 'education', description: 'Professional development / courses', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Union dues / professional memberships', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Work tools & supplies (unreimbursed)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
    ],
  },
  {
    id: 'single-llc',
    label: 'Single-Member LLC',
    description: 'Schedule C business expenses',
    emoji: '🏢',
    items: [
      { category: 'home_office', description: 'Home office (simplified: $5/sqft × sqft)', annualAmount: 1500, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Internet service', annualAmount: 1200, isDeductible: true, deductionPct: 50 },
      { category: 'business', description: 'Cell phone', annualAmount: 1200, isDeductible: true, deductionPct: 40 },
      { category: 'business', description: 'Software & SaaS subscriptions', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Professional services (CPA, legal)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Business insurance (liability, E&O)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Marketing & advertising', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Office supplies & equipment', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'vehicle', description: 'Vehicle / mileage (business use)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Business meals', annualAmount: 0, isDeductible: true, deductionPct: 50 },
      { category: 'business', description: 'Travel (flights, hotels, transport)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'education', description: 'Education & training / conferences', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'health', description: 'Health insurance premiums (SE deduction)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Bank & payment processing fees', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Contractor / subcontractor payments', annualAmount: 0, isDeductible: true, deductionPct: 100 },
    ],
  },
  {
    id: 'multi-llc',
    label: 'Multi-Member LLC Partner',
    description: 'Unreimbursed partner expenses',
    emoji: '🤝',
    items: [
      { category: 'home_office', description: 'Home office (partnership use)', annualAmount: 1500, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Internet service (partnership use)', annualAmount: 1200, isDeductible: true, deductionPct: 50 },
      { category: 'business', description: 'Cell phone (partnership use)', annualAmount: 1200, isDeductible: true, deductionPct: 40 },
      { category: 'business', description: 'Unreimbursed partner expenses (UPE)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'vehicle', description: 'Vehicle / mileage (partnership business)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Professional services (CPA, legal)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Travel for partnership business', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'education', description: 'Education & training (partnership role)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
    ],
  },
  {
    id: 'combined',
    label: 'W-2 + LLC Owner',
    description: 'Employee with side business',
    emoji: '⚡',
    items: [
      { category: 'home_office', description: 'Home office (business use)', annualAmount: 1500, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Internet service', annualAmount: 1200, isDeductible: true, deductionPct: 50 },
      { category: 'business', description: 'Cell phone', annualAmount: 1200, isDeductible: true, deductionPct: 40 },
      { category: 'business', description: 'Software & SaaS subscriptions', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Professional services (CPA, legal)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Business insurance', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Marketing & advertising', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Office supplies & equipment', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'vehicle', description: 'Vehicle / mileage (business use only)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Business meals', annualAmount: 0, isDeductible: true, deductionPct: 50 },
      { category: 'health', description: 'Health insurance premiums (if not via employer)', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Bank & payment processing fees', annualAmount: 0, isDeductible: true, deductionPct: 100 },
      { category: 'business', description: 'Contractor / subcontractor payments', annualAmount: 0, isDeductible: true, deductionPct: 100 },
    ],
  },
]

const entityLabels: Record<string, string> = {
  sole_prop: 'Sole Proprietorship', llc: 'LLC', llc_scorp: 'LLC + S-Corp',
  scorp: 'S-Corporation', ccorp: 'C-Corporation', partnership: 'Partnership', trust: 'Trust / Estate',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-medium)',
  background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
  fontSize: 13, outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block',
}

interface DataSetupProps {
  onComplete: () => void
  editMode?: boolean
}

// ─── Strategy Hint Component ──────────────────────────────────────────

function StrategyHint({ icon, color, title, children }: {
  icon: JSX.Element; color: string; title: string; children: React.ReactNode
}) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10, marginBottom: 14,
      background: `${color}08`, border: `1px solid ${color}18`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ color, flexShrink: 0 }}>{icon}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

// ─── Live Strategy Stack Preview ──────────────────────────────────────

interface StrategyItem {
  icon: string
  title: string
  description: string
  impact: string
  color: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

function computeStrategyPreview(
  profile: FinancialProfile,
  incomes: IncomeStream[],
  entities: LegalEntity[],
  expenses: BusinessExpense[],
  deductions: Deduction[],
): StrategyItem[] {
  const strategies: StrategyItem[] = []
  const totalIncome = incomes.reduce((s, i) => s + i.annualAmount, 0)
  const businessIncome = incomes.filter(i => i.type === 'business' || i.type === 'freelance').reduce((s, i) => s + i.annualAmount, 0)
  const w2Income = incomes.filter(i => i.type === 'w2').reduce((s, i) => s + i.annualAmount, 0)
  const totalExpenses = expenses.filter(e => e.isDeductible).reduce((s, e) => s + (e.annualAmount * e.deductionPct / 100), 0)
  const netSE = Math.max(0, businessIncome - totalExpenses)
  const hasEntities = entities.length > 0
  const hasSCorpEntity = entities.some(e => e.type === 'scorp' || e.type === 'llc_scorp')
  const retirementDeds = deductions.filter(d => d.category === 'retirement')
  const totalRetirement = retirementDeds.reduce((s, d) => s + d.amount, 0)
  const stateRate = STATE_TAX_RATES[profile.state]?.rate || 0

  // S-Corp election analysis
  if (netSE > 50000 && !hasSCorpEntity) {
    const savings = calculateSCorpSavings(netSE, profile.state)
    if (savings.annualSavings > 2000) {
      strategies.push({
        icon: '🏛️', title: 'S-Corp Election',
        description: `Your $${Math.round(netSE).toLocaleString()} net self-employment income is above the S-Corp sweet spot. Electing S-Corp status lets you split income into salary (subject to payroll tax) and distributions (not), reducing self-employment tax significantly.`,
        impact: `~$${Math.round(savings.annualSavings).toLocaleString()}/yr savings`,
        color: '#10b981', priority: 'critical',
      })
    }
  }

  // Self-employment tax awareness
  if (netSE > 0 && !hasSCorpEntity) {
    const seTax = calculateSelfEmploymentTax(netSE)
    strategies.push({
      icon: '💰', title: 'Self-Employment Tax',
      description: `As a self-employed individual, you pay both the employer and employee portions of FICA — that's 15.3% on the first $176,100 of net earnings. Your estimated SE tax: $${Math.round(seTax.totalSETax).toLocaleString()}. The 50% deduction for the employer half helps, but this is often the biggest surprise for new business owners.`,
      impact: `$${Math.round(seTax.totalSETax).toLocaleString()} SE tax`,
      color: '#ef4444', priority: 'high',
    })
  }

  // Retirement contribution gaps
  if (netSE > 30000) {
    const sepMax = calculateMaxSEPIRA(netSE)
    const solo = calculateMaxSolo401k(netSE, profile.age)
    const maxAvailable = Math.max(sepMax, solo.total)
    if (totalRetirement < maxAvailable * 0.5) {
      const gap = maxAvailable - totalRetirement
      const taxSaved = gap * (0.22 + stateRate) // rough marginal rate estimate
      strategies.push({
        icon: '🏦', title: 'Retirement Tax Shield',
        description: `Self-employed retirement accounts (SEP-IRA up to $${Math.round(sepMax).toLocaleString()}, Solo 401(k) up to $${Math.round(solo.total).toLocaleString()}) are the most powerful deduction available to you — every dollar contributed reduces your taxable income dollar-for-dollar. ${totalRetirement > 0 ? `You're contributing $${totalRetirement.toLocaleString()}, but could contribute up to $${Math.round(maxAvailable).toLocaleString()}.` : 'You haven\'t entered retirement contributions yet — this is likely your single biggest tax-saving opportunity.'}`,
        impact: `Up to $${Math.round(taxSaved).toLocaleString()} tax saved`,
        color: '#8b5cf6', priority: totalRetirement === 0 ? 'critical' : 'high',
      })
    }
  } else if (w2Income > 30000) {
    const has401k = deductions.some(d => d.name.toLowerCase().includes('401k') || d.name.toLowerCase().includes('ira'))
    if (!has401k) {
      strategies.push({
        icon: '🏦', title: 'Retirement Contributions',
        description: 'If your employer offers a 401(k) match, contributing at least enough to get the full match is essentially free money. Traditional IRA contributions (up to $7,000, or $8,000 if 50+) may also be deductible depending on your income and filing status.',
        impact: 'Free employer match + tax deduction',
        color: '#8b5cf6', priority: 'medium',
      })
    }
  }

  // QBI Deduction
  if (netSE > 0) {
    const qbi = calculateQBIDeduction(netSE, totalIncome - totalExpenses, profile.filingStatus)
    if (qbi > 0) {
      strategies.push({
        icon: '📋', title: 'QBI Deduction (Section 199A)',
        description: `As a pass-through business owner, you may qualify for a 20% deduction on qualified business income. Based on your data, that's approximately $${Math.round(qbi).toLocaleString()} — a significant above-the-line deduction that reduces your federal taxable income without itemizing.`,
        impact: `~$${Math.round(qbi).toLocaleString()} deduction`,
        color: '#3b82f6', priority: 'high',
      })
    }
  }

  // State tax optimization
  if (stateRate > 0.05 && totalIncome > 100000) {
    strategies.push({
      icon: '🗺️', title: 'State Tax Impact',
      description: `${STATE_TAX_RATES[profile.state]?.name} has a ${(stateRate * 100).toFixed(1)}% state income tax rate. On $${Math.round(totalIncome).toLocaleString()} income, that's roughly $${Math.round(totalIncome * stateRate).toLocaleString()} in state tax alone. Fortuna's State Arbitrage module can compare your tax burden across all 50 states if relocation is ever on the table.`,
      impact: `$${Math.round(totalIncome * stateRate).toLocaleString()}/yr state tax`,
      color: '#f59e0b', priority: 'medium',
    })
  } else if (stateRate === 0) {
    strategies.push({
      icon: '🗺️', title: 'No State Income Tax',
      description: `${STATE_TAX_RATES[profile.state]?.name} has no state income tax — that's a significant structural advantage. You're saving thousands compared to high-tax states. Fortuna will still optimize your federal position and look for other opportunities.`,
      impact: 'Already optimized',
      color: '#10b981', priority: 'low',
    })
  }

  // Multi-entity strategy
  if (entities.length >= 2) {
    strategies.push({
      icon: '🏗️', title: 'Multi-Entity Structure',
      description: 'Multiple entities create opportunities for income splitting, liability isolation, and tax optimization through management fees, shared services agreements, and strategic allocation of expenses. Fortuna\'s Entity Design module will analyze whether your current structure is optimal.',
      impact: 'Structure optimization available',
      color: '#06b6d4', priority: 'medium',
    })
  }

  // Partnership-specific
  if (entities.some(e => e.type === 'partnership')) {
    strategies.push({
      icon: '🤝', title: 'Partnership K-1 Strategy',
      description: 'As a partner in a multi-member LLC, your distributive share of income is subject to self-employment tax. Key strategies: negotiate guaranteed payments vs. profit distributions, track unreimbursed partner expenses (UPE) carefully, and consider whether the partnership should elect S-Corp status.',
      impact: 'K-1 optimization available',
      color: '#ec4899', priority: 'medium',
    })
  }

  // Expense completeness check
  if (businessIncome > 0 && totalExpenses < businessIncome * 0.1) {
    strategies.push({
      icon: '🔍', title: 'Expense Gap Detected',
      description: `Your business expenses ($${Math.round(totalExpenses).toLocaleString()}) are less than 10% of business income ($${Math.round(businessIncome).toLocaleString()}). Most self-employed individuals have deductible expenses of 20-40% of revenue. Common missed deductions: home office, vehicle mileage, professional development, software subscriptions, and the health insurance premium deduction.`,
      impact: 'Likely missing deductions',
      color: '#f59e0b', priority: 'high',
    })
  }

  // Filing status optimization
  if (profile.filingStatus === 'single' && profile.dependents > 0) {
    strategies.push({
      icon: '👨‍👧', title: 'Head of Household Filing',
      description: 'You have dependents but are filing Single. If you qualify for Head of Household status (unmarried, paying >50% of household costs, with a qualifying dependent), you get a higher standard deduction ($22,500 vs $15,700) and wider tax brackets. This could save $1,000-3,000+ depending on income.',
      impact: 'Potential bracket + deduction savings',
      color: '#10b981', priority: 'critical',
    })
  }

  // Estimated tax payments
  if (netSE > 20000) {
    strategies.push({
      icon: '📅', title: 'Quarterly Estimated Taxes',
      description: 'Self-employment income doesn\'t have automatic withholding. The IRS expects quarterly estimated payments (1040-ES) due Apr 15, Jun 15, Sep 15, Jan 15. Underpayment triggers penalties. Fortuna tracks deadlines and can generate your 1040-ES vouchers with the correct amounts.',
      impact: 'Avoid underpayment penalty',
      color: '#ef4444', priority: 'high',
    })
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  return strategies.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

export function DataSetup({ onComplete, editMode }: DataSetupProps) {
  const { state, updateState, save } = useFortuna()
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<FinancialProfile>({ ...state.profile })
  const [incomes, setIncomes] = useState<IncomeStream[]>(
    state.incomeStreams.length > 0 ? [...state.incomeStreams] : []
  )
  const [entities, setEntities] = useState<LegalEntity[]>(
    state.entities.length > 0 ? [...state.entities] : []
  )
  const [expenses, setExpenses] = useState<BusinessExpense[]>(
    state.expenses.length > 0 ? [...state.expenses] : []
  )
  const [deductions, setDeductions] = useState<Deduction[]>(
    state.deductions.length > 0 ? [...state.deductions] : []
  )

  const handleFinish = async () => {
    updateState(prev => ({
      ...prev,
      profile,
      incomeStreams: incomes,
      entities,
      expenses,
      deductions,
      onboardingComplete: true,
    }))
    setTimeout(async () => {
      await save()
      onComplete()
    }, 100)
  }

  const addIncome = () => setIncomes(prev => [...prev, {
    id: genId(), name: '', type: 'business', annualAmount: 0, isActive: true,
  }])
  const addEntity = () => setEntities(prev => [...prev, {
    id: genId(), name: '', type: 'llc', state: profile.state, annualCost: 0, isActive: true,
  }])
  const addExpense = () => setExpenses(prev => [...prev, {
    id: genId(), category: 'business', description: '', annualAmount: 0, isDeductible: true, deductionPct: 100,
  }])

  const applyExpenseTemplate = (template: ExpenseTemplate) => {
    const newExpenses = template.items.map(item => ({
      ...item,
      id: genId(),
    }))
    // Merge: add template items that don't already exist (by description match)
    const existingDescs = new Set(expenses.map(e => e.description.toLowerCase()))
    const toAdd = newExpenses.filter(e => !existingDescs.has(e.description.toLowerCase()))
    if (toAdd.length === 0) return // all already present
    setExpenses(prev => [...prev, ...toAdd])
  }
  const addDeduction = () => setDeductions(prev => [...prev, {
    id: genId(), name: '', category: 'business', amount: 0, isItemized: false,
  }])

  const applyDeductionTemplate = (template: DeductionTemplate) => {
    const newDeds = template.items.map(item => ({ ...item, id: genId() }))
    const existingNames = new Set(deductions.map(d => d.name.toLowerCase()))
    const toAdd = newDeds.filter(d => !existingNames.has(d.name.toLowerCase()))
    if (toAdd.length === 0) return
    setDeductions(prev => [...prev, ...toAdd])
  }

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <StrategyHint icon={<Lightbulb size={14} />} color="#f59e0b" title="Why This Matters">
            Your state, filing status, and age directly control which tax brackets, deductions, and strategies apply to you.
            For example, <strong>filing status</strong> determines your standard deduction ($15,700 single vs. $31,400 MFJ for 2025)
            and bracket widths. <strong>State</strong> determines whether you pay 0% or 13%+ in state income tax.
            <strong> Age</strong> affects retirement contribution limits (catch-up provisions at 50+). Get these right and everything downstream is accurate.
          </StrategyHint>
          <div className="grid-2" style={{ gap: 16 }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="Your name" />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <select style={selectStyle} value={profile.state} onChange={e => setProfile(p => ({ ...p, state: e.target.value }))}>
                {Object.entries(STATE_TAX_RATES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, s]) => (
                  <option key={code} value={code}>{s.name} ({(s.rate * 100).toFixed(1)}%)</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Filing Status</label>
              <select style={selectStyle} value={profile.filingStatus} onChange={e => setProfile(p => ({ ...p, filingStatus: e.target.value as any }))}>
                <option value="single">Single</option>
                <option value="married_joint">Married Filing Jointly</option>
                <option value="married_separate">Married Filing Separately</option>
                <option value="head_of_household">Head of Household</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Age</label>
              <input style={inputStyle} type="number" value={profile.age} onChange={e => setProfile(p => ({ ...p, age: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label style={labelStyle}>Dependents</label>
              <input style={inputStyle} type="number" min={0} value={profile.dependents} onChange={e => setProfile(p => ({ ...p, dependents: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label style={labelStyle}>Health Insurance</label>
              <select style={selectStyle} value={profile.hasHealthInsurance ? 'yes' : 'no'} onChange={e => setProfile(p => ({ ...p, hasHealthInsurance: e.target.value === 'yes' }))}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          {/* Spouse section for joint/separate filers */}
          {(profile.filingStatus === 'married_joint' || profile.filingStatus === 'married_separate') && (
            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(167,139,250,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>👤</span>
                Spouse Information
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>— for accurate joint return calculations</span>
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div>
                  <label style={labelStyle}>Spouse Name</label>
                  <input style={inputStyle} value={(state as any).household?.members?.find((m: any) => m.role === 'spouse')?.name || ''} placeholder="Spouse name" onChange={e => {
                    const name = e.target.value
                    updateState(prev => {
                      const h = prev.household || { members: [{ id: 'primary', name: prev.profile.name, role: 'primary' as const }], dependents: [], filingStatus: prev.profile.filingStatus }
                      const hasSpouse = h.members.some(m => m.role === 'spouse')
                      return {
                        ...prev,
                        household: {
                          ...h,
                          members: hasSpouse
                            ? h.members.map(m => m.role === 'spouse' ? { ...m, name } : m)
                            : [...h.members, { id: 'spouse', name, role: 'spouse' as const }],
                        },
                      }
                    })
                  }} />
                </div>
                <div>
                  <label style={labelStyle}>Spouse Age</label>
                  <input style={inputStyle} type="number" value={(state as any).household?.members?.find((m: any) => m.role === 'spouse')?.age || ''} placeholder="Age" onChange={e => {
                    const age = parseInt(e.target.value) || 0
                    updateState(prev => {
                      const h = prev.household || { members: [{ id: 'primary', name: prev.profile.name, role: 'primary' as const }], dependents: [], filingStatus: prev.profile.filingStatus }
                      return {
                        ...prev,
                        household: {
                          ...h,
                          members: h.members.map(m => m.role === 'spouse' ? { ...m, dateOfBirth: `${new Date().getFullYear() - age}-01-01` } : m),
                        },
                      }
                    })
                  }} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Add spouse W-2 and income in the Income tab — mark them as belonging to your spouse.
              </p>
            </div>
          )}
        </div>
      )

      case 1: return (
        <div>
          <StrategyHint icon={<TrendingUp size={14} />} color="#3b82f6" title="The Strategic Stack: How Income Type Drives Your Tax Strategy">
            Not all income is taxed the same. <strong>W-2 wages</strong> have payroll taxes split with your employer, withholding handled automatically, but limited deduction options.
            <strong> Business / freelance income</strong> (Schedule C) is subject to 15.3% self-employment tax on top of income tax — but you unlock the full range of business deductions, QBI deduction (20% of qualified income), and self-employed retirement accounts.
            <strong> Investment income</strong> may qualify for lower capital gains rates. <strong>Rental income</strong> has unique depreciation advantages.
            Adding each income type helps Fortuna build your complete strategic stack.
          </StrategyHint>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Add all income sources — W-2 jobs, businesses, freelance, investments, etc.</p>
          {incomes.map((inc, i) => (
            <div key={inc.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {inc.type === 'w2' ? '💼 W-2 Employment' : `Income Stream #${i + 1}`}
                </span>
                <button onClick={() => setIncomes(prev => prev.filter(x => x.id !== inc.id))} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid-3" style={{ gap: 12 }}>
                <div>
                  <label style={labelStyle}>{inc.type === 'w2' ? 'Employer / Job Title' : 'Name'}</label>
                  <input style={inputStyle} value={inc.name} placeholder={inc.type === 'w2' ? 'e.g. Acme Corp — Software Engineer' : 'e.g. Web Dev Business'} onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, name: e.target.value } : x))} />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select style={selectStyle} value={inc.type} onChange={e => {
                    const newType = e.target.value as any
                    setIncomes(prev => prev.map(x => x.id === inc.id ? {
                      ...x, type: newType,
                      // Initialize W-2 sub-object when switching to w2
                      w2: newType === 'w2' ? (x.w2 || {}) : x.w2,
                      entityId: newType === 'w2' ? undefined : x.entityId, // W-2 never assigned to entity
                    } : x))
                  }}>
                    {INCOME_TYPES.map(t => <option key={t} value={t}>
                      {t === 'w2' ? 'W-2 Employment' : t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
                    </option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{inc.type === 'w2' ? 'Annual Wages (Box 1)' : 'Annual Amount ($)'}</label>
                  <input style={inputStyle} type="number" value={inc.annualAmount || ''} placeholder="0" onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, annualAmount: parseFloat(e.target.value) || 0 } : x))} />
                </div>
              </div>
              {/* Entity assignment (non-W2 income only) */}
              {inc.type !== 'w2' && entities.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Belongs to</label>
                  <select style={{ ...selectStyle, maxWidth: 260 }} value={inc.entityId || 'personal'} onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, entityId: e.target.value === 'personal' ? undefined : e.target.value } : x))}>
                    <option value="personal">Personal (no entity)</option>
                    {entities.filter(e => e.isActive).map(e => <option key={e.id} value={e.id}>{e.name} ({e.type.replace('_', ' ')})</option>)}
                  </select>
                </div>
              )}

              {/* W-2 Specific Fields */}
              {inc.type === 'w2' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-blue)', fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(96,165,250,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>📋</span>
                    W-2 Details <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— for accurate tax picture (optional)</span>
                  </div>

                  {/* Row 1: Gross salary + employer name */}
                  <div className="grid-2" style={{ gap: 10, marginBottom: 8 }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>Gross Salary (total comp)</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.grossSalary || ''} placeholder={inc.annualAmount ? String(inc.annualAmount) : 'Before pre-tax deductions'}
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, grossSalary: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>Employer Name</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} value={inc.w2?.employerName || ''} placeholder="Company name"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, employerName: e.target.value } } : x))} />
                    </div>
                  </div>

                  {/* Row 2: Withholding */}
                  <div className="grid-3" style={{ gap: 10, marginBottom: 8 }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>Federal Withheld</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.federalWithholding || ''} placeholder="Box 2"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, federalWithholding: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>State Withheld</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.stateWithholding || ''} placeholder="Box 17"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, stateWithholding: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>FICA Withheld</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.ficaWithheld || ''} placeholder={inc.annualAmount ? `~${Math.round(inc.annualAmount * 0.0765).toLocaleString()}` : 'Box 4+6'}
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, ficaWithheld: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                  </div>

                  {/* Row 3: Pre-tax deductions */}
                  <div className="grid-4" style={{ gap: 10 }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>401(k) Pre-tax</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.pretax401k || ''} placeholder="0"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, pretax401k: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>Health Ins.</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.pretaxHealthInsurance || ''} placeholder="0"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, pretaxHealthInsurance: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>HSA</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.pretaxHSA || ''} placeholder="0"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, pretaxHSA: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: 11 }}>Employer 401k Match</label>
                      <input style={{ ...inputStyle, fontSize: 12 }} type="number" value={inc.w2?.employerMatch401k || ''} placeholder="0"
                        onChange={e => setIncomes(prev => prev.map(x => x.id === inc.id ? { ...x, w2: { ...x.w2, employerMatch401k: parseFloat(e.target.value) || 0 } } : x))} />
                    </div>
                  </div>

                  {/* W-2 Validation Warnings */}
                  {inc.annualAmount > 0 && (() => {
                    const warnings: string[] = []
                    const w = inc.w2 || {}
                    if (w.pretax401k && w.pretax401k > 23500) warnings.push(`401(k) contribution $${w.pretax401k.toLocaleString()} exceeds 2025 limit of $23,500 (or $31,000 if age 50+)`)
                    if (w.pretaxHSA && w.pretaxHSA > 4300 && profile.filingStatus === 'single') warnings.push(`HSA contribution $${w.pretaxHSA.toLocaleString()} exceeds 2025 single limit of $4,300`)
                    if (w.pretaxHSA && w.pretaxHSA > 8550 && profile.filingStatus !== 'single') warnings.push(`HSA contribution $${w.pretaxHSA.toLocaleString()} exceeds 2025 family limit of $8,550`)
                    if (w.federalWithholding && w.federalWithholding > 0 && w.federalWithholding < inc.annualAmount * 0.05 && inc.annualAmount > 20000) warnings.push(`Federal withholding is only ${((w.federalWithholding / inc.annualAmount) * 100).toFixed(1)}% of wages — may result in a large tax bill`)
                    if (w.federalWithholding && w.federalWithholding > inc.annualAmount * 0.40) warnings.push(`Federal withholding is ${((w.federalWithholding / inc.annualAmount) * 100).toFixed(0)}% of wages — unusually high, verify W-4`)
                    if (w.ficaWithheld && w.ficaWithheld > 0 && inc.annualAmount > 176100 && w.ficaWithheld > 176100 * 0.0765 + (inc.annualAmount - 176100) * 0.0145 + 500) warnings.push(`FICA withholding seems high — Social Security caps at $176,100 wage base for 2025`)
                    if (w.grossSalary && w.grossSalary > 0 && inc.annualAmount > w.grossSalary) warnings.push(`W-2 Box 1 ($${inc.annualAmount.toLocaleString()}) is higher than gross salary ($${w.grossSalary.toLocaleString()}) — Box 1 should be ≤ gross`)
                    if (warnings.length === 0) return null
                    return (
                      <div style={{ marginTop: 8 }}>
                        {warnings.map((warn, wi) => (
                          <div key={wi} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '6px 10px', marginBottom: 4,
                            borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 11, color: '#f59e0b', lineHeight: 1.4 }}>
                            <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span> {warn}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* W-2 Summary */}
                  {inc.annualAmount > 0 && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)', fontSize: 11, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Employer FICA (their half):</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>~${Math.round(inc.annualAmount * 0.0765).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Your FICA (withheld):</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{inc.w2?.ficaWithheld ? `$${inc.w2.ficaWithheld.toLocaleString()}` : `~$${Math.round(inc.annualAmount * 0.0765).toLocaleString()}`}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-blue)' }}>
                        <span>Total employer cost:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                          ~${Math.round(inc.annualAmount + inc.annualAmount * 0.0765 + (inc.w2?.employerMatch401k || 0) + (inc.w2?.pretaxHealthInsurance || 0) * 0.7).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => setIncomes(prev => [...prev, {
              id: genId(), name: '', type: 'w2', annualAmount: 0, isActive: true, w2: {},
            }])} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 12 }}>
              <Plus size={14} /> Add W-2 Job
            </button>
            <button onClick={addIncome} className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 12 }}>
              <Plus size={14} /> Add Other Income
            </button>
          </div>
        </div>
      )

      case 2: return (
        <div>
          <StrategyHint icon={<Building2 size={14} />} color="#8b5cf6" title="Entity Structure = Tax Architecture">
            Your legal entity choice is one of the highest-impact tax decisions you'll make. Here's the quick framework:
            {'\n\n'}• <strong>Sole Proprietorship</strong> — simplest, no filing cost, but you pay full 15.3% SE tax on all net profit and have no liability protection.
            {'\n'}• <strong>Single-Member LLC</strong> — same taxes as sole prop (disregarded entity), but adds liability protection. Low annual cost ($50-800 depending on state).
            {'\n'}• <strong>LLC + S-Corp election</strong> — the "sweet spot" for most self-employed above ~$50-60k net profit. You pay yourself a reasonable salary (payroll tax applies), then take remaining profit as distributions (no SE tax). Typical savings: $3,000-15,000+/yr.
            {'\n'}• <strong>Multi-Member LLC (Partnership)</strong> — each partner's share flows to their K-1. Can also elect S-Corp status. Key: track unreimbursed partner expenses and guaranteed payments.
            {'\n'}• <strong>C-Corp</strong> — flat 21% corporate rate, but profits are taxed twice (corporate + dividend). Rarely optimal for small businesses unless retaining significant earnings.
          </StrategyHint>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Add your legal entities (LLCs, corps, etc.) — or skip if you're a sole proprietor.</p>
          {entities.map((ent, i) => (
            <div key={ent.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Entity #{i + 1}</span>
                <button onClick={() => setEntities(prev => prev.filter(x => x.id !== ent.id))} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid-3" style={{ gap: 12 }}>
                <div>
                  <label style={labelStyle}>Entity Name</label>
                  <input style={inputStyle} value={ent.name} placeholder="e.g. My Business LLC" onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, name: e.target.value } : x))} />
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select style={selectStyle} value={ent.type} onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, type: e.target.value as any } : x))}>
                    {ENTITY_TYPES.map(t => <option key={t} value={t}>{entityLabels[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Annual Cost ($)</label>
                  <input style={inputStyle} type="number" value={ent.annualCost || ''} placeholder="0" onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, annualCost: parseFloat(e.target.value) || 0 } : x))} />
                </div>
              </div>
              {/* S-Corp / C-Corp: officer salary + ownership */}
              {['llc_scorp', 'scorp', 'ccorp'].includes(ent.type) && (
                <div className="grid-3" style={{ gap: 12, marginTop: 10 }}>
                  <div>
                    <label style={labelStyle}>Officer Salary ($)</label>
                    <input style={inputStyle} type="number" value={ent.officerSalary || ''} placeholder="Reasonable compensation" onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, officerSalary: parseFloat(e.target.value) || 0 } : x))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ownership %</label>
                    <input style={inputStyle} type="number" min={0} max={100} value={ent.ownershipPct ?? 100} onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, ownershipPct: parseInt(e.target.value) || 100 } : x))} />
                  </div>
                  <div>
                    <label style={labelStyle}>EIN</label>
                    <input style={inputStyle} value={ent.einNumber || ''} placeholder="XX-XXXXXXX" onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, einNumber: e.target.value } : x))} />
                  </div>
                </div>
              )}
              {/* Partnership: ownership % */}
              {ent.type === 'partnership' && (
                <div style={{ marginTop: 10, maxWidth: 200 }}>
                  <label style={labelStyle}>Your Ownership %</label>
                  <input style={inputStyle} type="number" min={0} max={100} value={ent.ownershipPct ?? 100} onChange={e => setEntities(prev => prev.map(x => x.id === ent.id ? { ...x, ownershipPct: parseInt(e.target.value) || 100 } : x))} />
                </div>
              )}
            </div>
          ))}
          <button onClick={addEntity} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: 12 }}>
            <Plus size={14} /> Add Entity
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
            No entities? That's fine — the engine will analyze whether you should form one.
          </div>
        </div>
      )

      case 3: return (
        <div>
          <StrategyHint icon={<Shield size={14} />} color="#10b981" title="Every Dollar Captured = Tax Saved">
            Business expenses directly reduce your taxable income AND your self-employment tax base. At a combined marginal rate of 30-40%+, a $1,000 deduction you missed is $300-400 more in taxes you didn't need to pay.
            Key nuances: <strong>Home office</strong> can be simplified ($5/sqft, max $1,500) or actual (% of rent/mortgage + utilities).
            <strong> Meals</strong> are 50% deductible when business-related. <strong>Vehicle</strong> can use standard mileage (67¢/mile) or actual costs.
            <strong> Health insurance premiums</strong> for self-employed individuals are an above-the-line deduction — often overlooked.
            Use the templates below as a checklist, then adjust amounts to match your actual spending.
          </StrategyHint>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Add recurring business expenses that may be deductible.</p>

          {/* Expense Templates */}
          {expenses.length === 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Quick Start — choose your situation
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EXPENSE_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyExpenseTemplate(tmpl)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 14px', borderRadius: 10,
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-surface)', cursor: 'pointer',
                      textAlign: 'left', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.background = 'var(--accent-gold-dim, rgba(245,158,11,0.06))' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
                  >
                    <span style={{ fontSize: 22 }}>{tmpl.emoji}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tmpl.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tmpl.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add more templates when expenses already exist */}
          {expenses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Sparkles size={12} style={{ color: 'var(--accent-gold)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Add common expenses for:</span>
                {EXPENSE_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyExpenseTemplate(tmpl)}
                    style={{
                      padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500,
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.color = 'var(--accent-gold)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                  >
                    {tmpl.emoji} {tmpl.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tip for template users */}
          {expenses.length > 0 && expenses.some(e => e.annualAmount === 0) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 12, borderRadius: 8,
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
              fontSize: 11, color: 'var(--accent-gold)',
            }}>
              <Edit3 size={12} />
              Fill in the amounts that apply to you — leave $0 items and they'll be ignored. Delete any that don't apply.
            </div>
          )}

          {expenses.map((exp, i) => (
            <div key={exp.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Expense #{i + 1}</span>
                <button onClick={() => setExpenses(prev => prev.filter(x => x.id !== exp.id))} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid-3" style={{ gap: 12 }}>
                <div>
                  <label style={labelStyle}>Description</label>
                  <input style={inputStyle} value={exp.description} placeholder="e.g. Software subscriptions" onChange={e => setExpenses(prev => prev.map(x => x.id === exp.id ? { ...x, description: e.target.value } : x))} />
                </div>
                <div>
                  <label style={labelStyle}>Annual Amount ($)</label>
                  <input style={inputStyle} type="number" value={exp.annualAmount || ''} placeholder="0" onChange={e => setExpenses(prev => prev.map(x => x.id === exp.id ? { ...x, annualAmount: parseFloat(e.target.value) || 0 } : x))} />
                </div>
                <div>
                  <label style={labelStyle}>Deductible %</label>
                  <input style={inputStyle} type="number" min={0} max={100} value={exp.deductionPct} onChange={e => setExpenses(prev => prev.map(x => x.id === exp.id ? { ...x, deductionPct: parseInt(e.target.value) || 0 } : x))} />
                </div>
              </div>
              {entities.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Belongs to</label>
                  <select style={{ ...selectStyle, maxWidth: 260 }} value={exp.entityId || 'personal'} onChange={e => setExpenses(prev => prev.map(x => x.id === exp.id ? { ...x, entityId: e.target.value === 'personal' ? undefined : e.target.value } : x))}>
                    <option value="personal">Personal (no entity)</option>
                    {entities.filter(e => e.isActive).map(e => <option key={e.id} value={e.id}>{e.name} ({e.type.replace('_', ' ')})</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          <button onClick={addExpense} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: 12 }}>
            <Plus size={14} /> Add Expense
          </button>
        </div>
      )

      case 4: return (
        <div>
          <StrategyHint icon={<PiggyBank size={14} />} color="#ec4899" title="Above-the-Line vs. Itemized: Know the Difference">
            <strong>Above-the-line deductions</strong> (retirement contributions, SE health insurance, student loan interest, 50% of SE tax, QBI deduction) reduce your AGI regardless of whether you itemize — they're always valuable.
            <strong> Itemized deductions</strong> (mortgage interest, SALT up to $10k, charitable gifts) only help if they exceed your standard deduction (${profile.filingStatus === 'married_joint' ? '$31,400 MFJ' : profile.filingStatus === 'head_of_household' ? '$22,500 HoH' : '$15,700 single'} for 2025).
            The biggest self-employed deductions: <strong>SEP-IRA</strong> (up to 25% of net SE income, max $70,000) or <strong>Solo 401(k)</strong> ($23,500 employee + 25% employer, up to $70,000 total). These are often the single largest tax-saving move available.
          </StrategyHint>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Add any specific deductions you're already taking (retirement contributions, home office, etc.)</p>

          {/* Deduction Templates */}
          {deductions.length === 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Quick Start — common deduction categories
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {DEDUCTION_TEMPLATES.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyDeductionTemplate(tmpl)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: 10,
                      border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-surface)', cursor: 'pointer',
                      textAlign: 'left', transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.background = 'var(--accent-gold-dim, rgba(245,158,11,0.06))' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-surface)' }}
                  >
                    <span style={{ fontSize: 18 }}>{tmpl.emoji}</span>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{tmpl.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Compact template add when deductions exist */}
          {deductions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Sparkles size={12} style={{ color: 'var(--accent-gold)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Add:</span>
              {DEDUCTION_TEMPLATES.map(tmpl => (
                <button
                  key={tmpl.id}
                  onClick={() => applyDeductionTemplate(tmpl)}
                  style={{
                    padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.color = 'var(--accent-gold)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {tmpl.emoji} {tmpl.label}
                </button>
              ))}
            </div>
          )}

          {/* Tip for template users */}
          {deductions.length > 0 && deductions.some(d => d.amount === 0) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 12, borderRadius: 8,
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
              fontSize: 11, color: 'var(--accent-gold)',
            }}>
              <Edit3 size={12} />
              Fill in your actual amounts — delete any that don't apply. $0 items will be ignored in calculations.
            </div>
          )}

          {deductions.map((ded, i) => (
            <div key={ded.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Deduction #{i + 1}</span>
                <button onClick={() => setDeductions(prev => prev.filter(x => x.id !== ded.id))} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid-3" style={{ gap: 12 }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input style={inputStyle} value={ded.name} placeholder="e.g. SEP-IRA contribution" onChange={e => setDeductions(prev => prev.map(x => x.id === ded.id ? { ...x, name: e.target.value } : x))} />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select style={selectStyle} value={ded.category} onChange={e => setDeductions(prev => prev.map(x => x.id === ded.id ? { ...x, category: e.target.value as any } : x))}>
                    {DEDUCTION_CATS.map(c => <option key={c} value={c}>{c.replace('_', ' ').charAt(0).toUpperCase() + c.replace('_', ' ').slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Annual Amount ($)</label>
                  <input style={inputStyle} type="number" value={ded.amount || ''} placeholder="0" onChange={e => setDeductions(prev => prev.map(x => x.id === ded.id ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} />
                </div>
              </div>
              {entities.length > 0 && ['business', 'home_office', 'vehicle', 'retirement', 'health'].includes(ded.category) && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Belongs to</label>
                  <select style={{ ...selectStyle, maxWidth: 260 }} value={ded.entityId || 'personal'} onChange={e => setDeductions(prev => prev.map(x => x.id === ded.id ? { ...x, entityId: e.target.value === 'personal' ? undefined : e.target.value } : x))}>
                    <option value="personal">Personal</option>
                    {entities.filter(e => e.isActive).map(e => <option key={e.id} value={e.id}>{e.name} ({e.type.replace('_', ' ')})</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          <button onClick={addDeduction} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: 12 }}>
            <Plus size={14} /> Add Deduction
          </button>
        </div>
      )

      case 5: {
        const totalIncome = incomes.reduce((s, i) => s + i.annualAmount, 0)
        const totalExpenses = expenses.reduce((s, e) => s + e.annualAmount, 0)
        const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0)
        const strategies = computeStrategyPreview(profile, incomes, entities, expenses, deductions)
        const criticalCount = strategies.filter(s => s.priority === 'critical').length
        const highCount = strategies.filter(s => s.priority === 'high').length

        // Quick tax estimate
        const businessIncome = incomes.filter(i => i.type === 'business' || i.type === 'freelance').reduce((s, i) => s + i.annualAmount, 0)
        const deductibleExpenses = expenses.filter(e => e.isDeductible).reduce((s, e) => s + (e.annualAmount * e.deductionPct / 100), 0)
        const netSE = Math.max(0, businessIncome - deductibleExpenses)
        const seTax = netSE > 0 ? calculateSelfEmploymentTax(netSE) : { totalSETax: 0 }
        const estAGI = Math.max(0, totalIncome - deductibleExpenses - totalDeductions - seTax.totalSETax * 0.5)
        const fedTax = calculateFederalIncomeTax(Math.max(0, estAGI - (profile.filingStatus === 'married_joint' ? 31400 : profile.filingStatus === 'head_of_household' ? 22500 : 15700)), profile.filingStatus)
        const stateTax = calculateStateTax(estAGI, profile.state)
        const totalTax = fedTax + stateTax + seTax.totalSETax
        const effectiveRate = totalIncome > 0 ? (totalTax / totalIncome) * 100 : 0
        const netIncome = totalIncome - totalTax

        return (
          <div>
            <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.08), rgba(52,211,153,0.04))', border: '1px solid rgba(212,168,67,0.15)', borderRadius: 14, padding: 24, marginBottom: 20, textAlign: 'center' }}>
              <Sparkles size={24} color="var(--accent-gold)" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--accent-gold)', marginBottom: 4 }}>Ready to Analyze</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Fortuna detected <strong style={{ color: '#ef4444' }}>{criticalCount} critical</strong> and <strong style={{ color: '#f59e0b' }}>{highCount} high-priority</strong> strategies from your data.
              </div>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Profile</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{profile.name || 'Not set'} · {STATE_TAX_RATES[profile.state]?.name} · {profile.filingStatus.replace('_', ' ')}</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Income Streams</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500 }}>{incomes.length} streams · ${totalIncome.toLocaleString()}</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Legal Entities</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500 }}>{entities.length || 'Sole Proprietor'}</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>Expenses & Deductions</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500 }}>${(totalExpenses + totalDeductions).toLocaleString()}</div>
              </div>
            </div>

            {/* Tax Estimate Preview */}
            {totalIncome > 0 && (
              <div style={{
                background: 'var(--bg-surface)', borderRadius: 12, padding: 16,
                border: '1px solid var(--border-subtle)', marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calculator size={12} /> Preliminary Tax Estimate
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Federal', value: `$${Math.round(fedTax).toLocaleString()}`, color: '#3b82f6' },
                    { label: 'State', value: `$${Math.round(stateTax).toLocaleString()}`, color: '#8b5cf6' },
                    { label: 'SE Tax', value: `$${Math.round(seTax.totalSETax).toLocaleString()}`, color: '#f59e0b' },
                    { label: 'Total Tax', value: `$${Math.round(totalTax).toLocaleString()}`, color: '#ef4444' },
                  ].map(item => (
                    <div key={item.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10,
                  borderTop: '1px solid var(--border-subtle)', fontSize: 12,
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Effective Rate: </span>
                    <span style={{ fontWeight: 600, color: effectiveRate > 30 ? '#ef4444' : effectiveRate > 20 ? '#f59e0b' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                      {effectiveRate.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Estimated Net: </span>
                    <span style={{ fontWeight: 600, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      ${Math.round(netIncome).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Keep Rate: </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                  This is a preliminary estimate. Full analysis with bracket optimization, AMT, and credits runs after launch.
                </div>
              </div>
            )}

            {/* Strategy Stack Preview */}
            {strategies.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={12} /> Strategy Stack — {strategies.length} strategies detected
                </div>
                {strategies.map((strat, i) => (
                  <div key={i} style={{
                    padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                    background: `${strat.color}06`, border: `1px solid ${strat.color}15`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>{strat.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{strat.title}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            background: strat.priority === 'critical' ? 'rgba(239,68,68,0.12)' :
                              strat.priority === 'high' ? 'rgba(245,158,11,0.12)' : 'rgba(107,114,128,0.12)',
                            color: strat.priority === 'critical' ? '#ef4444' :
                              strat.priority === 'high' ? '#f59e0b' : 'var(--text-muted)',
                          }}>
                            {strat.priority}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: strat.color }}>{strat.impact}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, paddingLeft: 24 }}>
                      {strat.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    }
  }

  return (
    <div className="view-enter" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 className="section-title">{editMode ? 'Edit Financial Profile' : 'Set Up Your Financial Profile'}</h1>
        <p className="section-subtitle">{editMode ? 'Update your data — the engine will recalculate everything automatically' : 'Enter your financial data and the Fortuna Engine will do the rest'}</p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, cursor: 'pointer' }} onClick={() => setStep(i)}>
            <div style={{
              height: 4, borderRadius: 2, marginBottom: 8,
              background: i <= step ? 'var(--accent-gold)' : 'var(--bg-surface)',
              transition: 'background 0.3s',
            }} />
            <div style={{
              fontSize: 11, fontWeight: i === step ? 600 : 400,
              color: i <= step ? 'var(--accent-gold)' : 'var(--text-muted)',
              textAlign: 'center',
            }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {step === 0 && <User size={18} />}
            {step === 1 && <DollarSign size={18} />}
            {step === 2 && <Building2 size={18} />}
            {step === 3 && <Receipt size={18} />}
            {step === 4 && <Receipt size={18} />}
            {step === 5 && <CheckCircle2 size={18} color="var(--accent-emerald)" />}
            {STEPS[step]}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Step {step + 1} of {STEPS.length}</span>
        </div>
        <div className="card-body">
          {renderStep()}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} style={{ opacity: step === 0 ? 0.3 : 1 }}>
          <ChevronLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Continue <ChevronRight size={14} />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleFinish}>
            <Sparkles size={14} /> {editMode ? 'Save & Recalculate' : 'Launch Fortuna Engine'}
          </button>
        )}
      </div>
    </div>
  )
}
