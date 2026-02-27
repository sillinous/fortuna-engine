/**
 * Fortuna Engine — Four Financial Statements Wizard
 *
 * A step-by-step wizard that collects the minimum inputs needed
 * from a business owner and produces all four core financial statements:
 *
 *   1. Income Statement (P&L)
 *   2. Balance Sheet
 *   3. Cash Flow Statement
 *   4. Statement of Owner's Equity
 */

import { useState, useCallback } from 'react'
import {
  generateFinancialStatements,
  type FinancialStatementsInput,
  type FinancialStatements,
  type LineItem,
  type BusinessType,
} from '../engine/financial-statements-generator'
import {
  ChevronRight, ChevronLeft, FileText, BarChart3,
  TrendingUp, ArrowDownUp, CheckCircle2, AlertCircle,
  Printer, RotateCcw, Building2, DollarSign, Lightbulb,
} from 'lucide-react'

// ===================================================================
//  FORMATTING HELPERS
// ===================================================================

function fmt(n: number, showNegative = true): string {
  if (showNegative && n < 0) return `($${Math.abs(n).toLocaleString()})`
  return `$${Math.abs(n).toLocaleString()}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

// ===================================================================
//  SHARED COMPONENTS
// ===================================================================

function Field({
  label,
  hint,
  value,
  onChange,
  type = 'number',
  placeholder,
  required,
}: {
  label: string
  hint?: string
  value: string | number
  onChange: (v: string) => void
  type?: 'text' | 'number' | 'select'
  placeholder?: string
  required?: boolean
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{hint}</div>}
      <input
        type={type === 'select' ? 'text' : type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={0}
        style={{
          width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)',
          fontSize: 14, fontFamily: type === 'number' ? 'var(--font-mono)' : 'inherit',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function SelectField({
  label, hint, value, onChange, options,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>{hint}</div>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)',
          fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--accent-gold)', marginBottom: 12, marginTop: 20, paddingBottom: 6,
      borderBottom: '1px solid rgba(212,168,67,0.2)',
    }}>
      {children}
    </div>
  )
}

// ===================================================================
//  STATEMENT DISPLAY COMPONENTS
// ===================================================================

function StatementRow({ item }: { item: LineItem }) {
  const isSubtotal = item.isSubtotal
  const isTotal = item.isTotal
  const indent = (item.indent ?? 0) * 20

  return (
    <tr style={{
      fontWeight: isTotal ? 700 : isSubtotal ? 600 : 400,
      borderTop: isSubtotal ? '1px solid var(--border-subtle)' : undefined,
      borderBottom: isTotal ? '2px solid var(--text-muted)' : undefined,
    }}>
      <td style={{
        padding: '7px 12px',
        paddingLeft: 12 + indent,
        color: isTotal ? 'var(--text-primary)' : isSubtotal ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontSize: isTotal || isSubtotal ? 14 : 13,
      }}>
        {item.label}
        {item.note && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontStyle: 'italic' }}>
            ({item.note})
          </span>
        )}
      </td>
      <td style={{
        padding: '7px 12px', textAlign: 'right',
        fontFamily: 'var(--font-mono)', fontSize: 13,
        color: item.amount < 0 ? '#ef4444' : isTotal ? 'var(--accent-gold)' : 'var(--text-secondary)',
      }}>
        {fmt(item.amount)}
      </td>
    </tr>
  )
}

function TotalRow({ label, amount, color }: { label: string; amount: number; color?: string }) {
  return (
    <tr style={{ fontWeight: 700, background: 'rgba(255,255,255,0.03)', borderTop: '2px solid var(--border-subtle)' }}>
      <td style={{ padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)' }}>{label}</td>
      <td style={{
        padding: '10px 12px', textAlign: 'right',
        fontFamily: 'var(--font-mono)', fontSize: 14,
        color: color ?? (amount < 0 ? '#ef4444' : '#22c55e'),
      }}>
        {fmt(amount)}
      </td>
    </tr>
  )
}

function SeparatorRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={2} style={{
        padding: '10px 12px 4px',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--accent-gold)', borderBottom: '1px solid rgba(212,168,67,0.2)',
      }}>
        {label}
      </td>
    </tr>
  )
}

function StatementTable({ children }: { children: React.ReactNode }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '65%' }} />
        <col style={{ width: '35%' }} />
      </colgroup>
      <tbody>{children}</tbody>
    </table>
  )
}

function StatementCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, overflow: 'hidden', marginBottom: 24,
    }}>
      <div style={{
        padding: '14px 16px', background: 'rgba(212,168,67,0.07)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ color: 'var(--accent-gold)' }}>{icon}</div>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ padding: 0 }}>{children}</div>
    </div>
  )
}

// ===================================================================
//  STATEMENT RENDERERS
// ===================================================================

function IncomeStatementView({ stmt }: { stmt: FinancialStatements['incomeStatement'] }) {
  return (
    <StatementCard title="Income Statement (Profit & Loss)" icon={<TrendingUp size={18} />}>
      <StatementTable>
        <SeparatorRow label="Revenue" />
        {stmt.revenueItems.map((it, i) => <StatementRow key={i} item={it} />)}
        <TotalRow label="Total Revenue" amount={stmt.totalRevenue} color="var(--text-primary)" />

        {stmt.cogsItems.length > 0 && <>
          <SeparatorRow label="Cost of Goods Sold" />
          {stmt.cogsItems.map((it, i) => <StatementRow key={i} item={it} />)}
          <TotalRow label="Total COGS" amount={-stmt.totalCOGS} />
          <TotalRow label="Gross Profit" amount={stmt.grossProfit} />
        </>}

        <SeparatorRow label="Operating Expenses" />
        {stmt.opexItems.map((it, i) => <StatementRow key={i} item={it} />)}
        <TotalRow label="Total Operating Expenses" amount={-stmt.totalOpex} />

        <TotalRow label={`Operating Income  (${fmtPct(stmt.operatingMarginPct)} margin)`} amount={stmt.operatingIncome} />

        {stmt.nonOperatingItems.length > 0 && <>
          <SeparatorRow label="Non-Operating Items" />
          {stmt.nonOperatingItems.map((it, i) => <StatementRow key={i} item={it} />)}
        </>}

        <TotalRow label="Income Before Tax" amount={stmt.preTaxIncome} color="var(--text-primary)" />
        <StatementRow item={{ label: 'Income Tax Expense', amount: -stmt.taxExpense }} />
        <TotalRow label={`Net Income  (${fmtPct(stmt.netMarginPct)} margin)`} amount={stmt.netIncome} />
      </StatementTable>
    </StatementCard>
  )
}

function BalanceSheetView({ stmt }: { stmt: FinancialStatements['balanceSheet'] }) {
  return (
    <StatementCard title="Balance Sheet" icon={<BarChart3 size={18} />}>
      <StatementTable>
        <SeparatorRow label="Current Assets" />
        {stmt.currentAssets.map((it, i) => <StatementRow key={i} item={it} />)}
        <TotalRow label="Total Current Assets" amount={stmt.totalCurrentAssets} color="var(--text-primary)" />

        {stmt.fixedAssets.length > 0 && <>
          <SeparatorRow label="Fixed Assets" />
          {stmt.fixedAssets.map((it, i) => <StatementRow key={i} item={it} />)}
          <TotalRow label="Net Fixed Assets" amount={stmt.totalFixedAssets} color="var(--text-primary)" />
        </>}

        <TotalRow label="TOTAL ASSETS" amount={stmt.totalAssets} color="var(--accent-gold)" />

        <SeparatorRow label="Current Liabilities" />
        {stmt.currentLiabilities.map((it, i) => <StatementRow key={i} item={it} />)}
        <TotalRow label="Total Current Liabilities" amount={stmt.totalCurrentLiabilities} color="var(--text-primary)" />

        {stmt.longTermLiabilities.length > 0 && <>
          <SeparatorRow label="Long-Term Liabilities" />
          {stmt.longTermLiabilities.map((it, i) => <StatementRow key={i} item={it} />)}
          <TotalRow label="Total Long-Term Liabilities" amount={stmt.totalLongTermLiabilities} color="var(--text-primary)" />
        </>}

        <TotalRow label="Total Liabilities" amount={stmt.totalLiabilities} color="#ef4444" />

        <SeparatorRow label="Owner's Equity" />
        {stmt.equityItems.map((it, i) => <StatementRow key={i} item={it} />)}
        <TotalRow label="Total Owner's Equity" amount={stmt.totalEquity} color="#22c55e" />

        <TotalRow label="TOTAL LIABILITIES & EQUITY" amount={stmt.liabilitiesAndEquity} color="var(--accent-gold)" />
      </StatementTable>
      {!stmt.isBalanced && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12 }}>
          Balance sheet does not balance — check for missing asset or liability entries.
        </div>
      )}
    </StatementCard>
  )
}

function CashFlowView({ stmt }: { stmt: FinancialStatements['cashFlowStatement'] }) {
  return (
    <StatementCard title="Statement of Cash Flows (Indirect Method)" icon={<ArrowDownUp size={18} />}>
      <StatementTable>
        <SeparatorRow label="Operating Activities" />
        {stmt.operatingItems.map((it, i) => <StatementRow key={i} item={it} />)}
        <TotalRow label="Net Cash from Operating Activities" amount={stmt.netCashFromOperations} />

        <SeparatorRow label="Investing Activities" />
        {stmt.investingItems.length > 0
          ? stmt.investingItems.map((it, i) => <StatementRow key={i} item={it} />)
          : <StatementRow item={{ label: 'No investing activity this period', amount: 0 }} />
        }
        <TotalRow label="Net Cash from Investing Activities" amount={stmt.netCashFromInvesting} />

        <SeparatorRow label="Financing Activities" />
        {stmt.financingItems.length > 0
          ? stmt.financingItems.map((it, i) => <StatementRow key={i} item={it} />)
          : <StatementRow item={{ label: 'No financing activity this period', amount: 0 }} />
        }
        <TotalRow label="Net Cash from Financing Activities" amount={stmt.netCashFromFinancing} />

        <TotalRow label="Net Change in Cash" amount={stmt.netChangeInCash} color="var(--text-primary)" />
        <StatementRow item={{ label: 'Beginning Cash', amount: stmt.beginningCash }} />
        <TotalRow label="Ending Cash" amount={stmt.endingCash} color="var(--accent-gold)" />
      </StatementTable>
      {!stmt.reconciles && stmt.beginningCash > 0 && (
        <div style={{ padding: '10px 16px', background: 'rgba(234,179,8,0.08)', color: '#eab308', fontSize: 12 }}>
          Cash flow does not fully reconcile. Provide prior-period working capital balances for a complete reconciliation.
        </div>
      )}
    </StatementCard>
  )
}

function OwnerEquityView({ stmt }: { stmt: FinancialStatements['ownerEquityStatement'] }) {
  return (
    <StatementCard title="Statement of Owner's Equity" icon={<Building2 size={18} />}>
      <StatementTable>
        {stmt.lineItems.map((it, i) => <StatementRow key={i} item={it} />)}
      </StatementTable>
    </StatementCard>
  )
}

function MetricPill({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ===================================================================
//  WIZARD FORM STATE
// ===================================================================

const DEFAULT_INPUT: Partial<FinancialStatementsInput> = {
  businessName: '',
  period: String(new Date().getFullYear()),
  businessType: 'service',
  primaryRevenue: 0,
  otherRevenue: 0,
  costOfGoodsSold: 0,
  laborExpenses: 0,
  facilitiesExpenses: 0,
  marketingExpenses: 0,
  professionalServices: 0,
  technologyExpenses: 0,
  insuranceExpenses: 0,
  depreciationExpense: undefined,
  otherOperatingExpenses: 0,
  interestExpense: 0,
  nonOperatingIncome: 0,
  incomeTaxExpense: undefined,
  endingCash: 0,
  beginningCash: undefined,
  accountsReceivable: 0,
  inventory: 0,
  prepaidAndOther: 0,
  fixedAssetsGross: 0,
  accumulatedDepreciation: undefined,
  accountsPayable: 0,
  accruedLiabilities: 0,
  shortTermDebt: 0,
  longTermDebt: 0,
  beginningEquity: undefined,
  capitalContributions: 0,
  ownerDraws: 0,
  capitalExpenditures: 0,
  newBorrowings: 0,
  debtRepayments: 0,
}

type FormInput = Partial<FinancialStatementsInput>

function num(v: string | number | undefined): number {
  if (v === undefined || v === '' || v === null) return 0
  return parseFloat(String(v)) || 0
}

function optNum(v: string | number | undefined): number | undefined {
  if (v === undefined || v === '' || v === null) return undefined
  const n = parseFloat(String(v))
  return isNaN(n) ? undefined : n
}

function buildInput(f: FormInput): FinancialStatementsInput {
  return {
    businessName: String(f.businessName || 'My Business'),
    period: String(f.period || String(new Date().getFullYear())),
    businessType: (f.businessType as BusinessType) || 'service',
    primaryRevenue: num(f.primaryRevenue),
    otherRevenue: num(f.otherRevenue) || undefined,
    costOfGoodsSold: num(f.costOfGoodsSold) || undefined,
    laborExpenses: num(f.laborExpenses),
    facilitiesExpenses: num(f.facilitiesExpenses) || undefined,
    marketingExpenses: num(f.marketingExpenses) || undefined,
    professionalServices: num(f.professionalServices) || undefined,
    technologyExpenses: num(f.technologyExpenses) || undefined,
    insuranceExpenses: num(f.insuranceExpenses) || undefined,
    depreciationExpense: optNum(f.depreciationExpense),
    otherOperatingExpenses: num(f.otherOperatingExpenses) || undefined,
    interestExpense: num(f.interestExpense) || undefined,
    nonOperatingIncome: num(f.nonOperatingIncome) || undefined,
    incomeTaxExpense: optNum(f.incomeTaxExpense),
    endingCash: num(f.endingCash),
    beginningCash: optNum(f.beginningCash),
    accountsReceivable: num(f.accountsReceivable) || undefined,
    inventory: num(f.inventory) || undefined,
    prepaidAndOther: num(f.prepaidAndOther) || undefined,
    fixedAssetsGross: num(f.fixedAssetsGross) || undefined,
    accumulatedDepreciation: optNum(f.accumulatedDepreciation),
    accountsPayable: num(f.accountsPayable) || undefined,
    accruedLiabilities: num(f.accruedLiabilities) || undefined,
    shortTermDebt: num(f.shortTermDebt) || undefined,
    longTermDebt: num(f.longTermDebt) || undefined,
    beginningEquity: optNum(f.beginningEquity),
    capitalContributions: num(f.capitalContributions) || undefined,
    ownerDraws: num(f.ownerDraws) || undefined,
    capitalExpenditures: num(f.capitalExpenditures) || undefined,
    newBorrowings: num(f.newBorrowings) || undefined,
    debtRepayments: num(f.debtRepayments) || undefined,
  }
}

// ===================================================================
//  WIZARD STEPS
// ===================================================================

const STEPS = [
  { id: 'basics',    label: 'Business Basics',     icon: Building2 },
  { id: 'revenue',   label: 'Revenue',              icon: TrendingUp },
  { id: 'expenses',  label: 'Expenses',             icon: DollarSign },
  { id: 'position',  label: 'Financial Position',   icon: BarChart3 },
]

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {STEPS.map((s, i) => {
        const Icon = s.icon
        const done = i < step
        const active = i === step
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? 'var(--accent-gold)' : active ? 'rgba(212,168,67,0.15)' : 'var(--bg-card)',
              border: `2px solid ${done ? 'var(--accent-gold)' : active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
              color: done ? '#0c0e12' : active ? 'var(--accent-gold)' : 'var(--text-muted)',
              flexShrink: 0,
            }}>
              {done ? <CheckCircle2 size={16} /> : <Icon size={14} />}
            </div>
            <span style={{
              fontSize: 11, fontWeight: active ? 700 : 500,
              color: active ? 'var(--text-primary)' : done ? 'var(--text-secondary)' : 'var(--text-muted)',
              display: 'none', // hidden on small screens (label only on wider)
            }}>
              {s.label}
            </span>
            {i < total - 1 && (
              <div style={{ width: 24, height: 2, background: i < step ? 'var(--accent-gold)' : 'var(--border-subtle)', borderRadius: 1 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ===================================================================
//  MAIN COMPONENT
// ===================================================================

export function FinancialStatementsWizard() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormInput>({ ...DEFAULT_INPUT })
  const [statements, setStatements] = useState<FinancialStatements | null>(null)
  const [activeTab, setActiveTab] = useState(0)

  const set = useCallback((field: keyof FormInput, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
  }, [])

  const isProductBusiness = form.businessType === 'product' || form.businessType === 'mixed'

  // ── Validation per step ─────────────────────────────────────────
  const canAdvance = (): boolean => {
    if (step === 0) return !!form.businessName && !!form.period
    if (step === 1) return num(form.primaryRevenue) > 0
    return true
  }

  const handleGenerate = () => {
    const input = buildInput(form)
    const result = generateFinancialStatements(input)
    setStatements(result)
  }

  const handleReset = () => {
    setStatements(null)
    setStep(0)
    setForm({ ...DEFAULT_INPUT })
    setActiveTab(0)
  }

  // ── Render statements view ──────────────────────────────────────
  if (statements) {
    const tabs = [
      { label: 'Income Statement', component: <IncomeStatementView stmt={statements.incomeStatement} /> },
      { label: 'Balance Sheet', component: <BalanceSheetView stmt={statements.balanceSheet} /> },
      { label: 'Cash Flow', component: <CashFlowView stmt={statements.cashFlowStatement} /> },
      { label: "Owner's Equity", component: <OwnerEquityView stmt={statements.ownerEquityStatement} /> },
    ]

    const m = statements.metrics

    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
              {form.businessName || 'My Business'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Financial Statements · {form.period}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.print()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
              }}
            >
              <Printer size={15} /> Print
            </button>
            <button
              onClick={handleReset}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
              }}
            >
              <RotateCcw size={15} /> New
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <MetricPill label="Net Margin" value={fmtPct(m.netMarginPct)} sub="Net Income / Revenue" />
          <MetricPill label="Gross Margin" value={fmtPct(m.grossMarginPct)} sub="Gross Profit / Revenue" />
          <MetricPill label="Current Ratio" value={m.currentRatio === 999 ? 'N/A' : `${m.currentRatio}x`} sub="Current Assets / Liabilities" />
          <MetricPill label="Debt-to-Equity" value={`${m.debtToEquityRatio}x`} sub="Total Debt / Equity" />
          <MetricPill label="Return on Equity" value={fmtPct(m.returnOnEquityPct)} sub="Net Income / Equity" />
        </div>

        {/* Insights */}
        {statements.insights.length > 0 && (
          <div style={{
            background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Lightbulb size={15} color="var(--accent-gold)" />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold)' }}>Insights</span>
            </div>
            {statements.insights.map((ins, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6,
                fontSize: 13, color: 'var(--text-secondary)',
              }}>
                <span style={{ color: 'var(--accent-gold)', flexShrink: 0, marginTop: 1 }}>·</span>
                {ins}
              </div>
            ))}
          </div>
        )}

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
          {tabs.map((t, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: activeTab === i ? 'rgba(212,168,67,0.12)' : 'var(--bg-card)',
                color: activeTab === i ? 'var(--accent-gold)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: activeTab === i ? 600 : 400,
                borderColor: activeTab === i ? 'rgba(212,168,67,0.4)' : 'var(--border-subtle)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Active statement */}
        {tabs[activeTab].component}

        {/* Consistency badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: statements.isConsistent ? '#22c55e' : '#eab308',
          marginTop: 8,
        }}>
          {statements.isConsistent
            ? <><CheckCircle2 size={13} /> All four statements are internally consistent</>
            : <><AlertCircle size={13} /> Statements may be incomplete — see insights above for details</>
          }
        </div>
      </div>
    )
  }

  // ── Render wizard ───────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={22} color="var(--accent-gold)" />
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Financial Statements Generator
          </span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Answer a few questions to generate all four core financial statements.
        </div>
      </div>

      <StepIndicator step={step} total={STEPS.length} />

      {/* Step content */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 14, padding: '24px 28px',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {STEPS[step].label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {step === 0 && 'Tell us about your business and the reporting period.'}
          {step === 1 && 'Enter your revenue. Only primary revenue is required.'}
          {step === 2 && 'Break down your operating costs. Every field is optional — enter what you know.'}
          {step === 3 && 'Snapshot of your current financial position to complete the balance sheet and cash flow statement.'}
        </div>

        {/* ── Step 0: Basics ── */}
        {step === 0 && (
          <>
            <Field
              label="Business Name" required
              value={form.businessName ?? ''}
              onChange={v => set('businessName', v)}
              type="text"
              placeholder="e.g. Acme Consulting LLC"
            />
            <Field
              label="Reporting Period" required
              hint='e.g. "2025", "Q1 2025", "FY 2025", "Jan–Jun 2025"'
              value={form.period ?? ''}
              onChange={v => set('period', v)}
              type="text"
              placeholder={String(new Date().getFullYear())}
            />
            <SelectField
              label="Business Type"
              hint="Affects how revenue and COGS appear on the income statement."
              value={(form.businessType as string) ?? 'service'}
              onChange={v => set('businessType', v)}
              options={[
                { value: 'service', label: 'Service (consulting, software, professional services)' },
                { value: 'product', label: 'Product (retail, manufacturing, e-commerce)' },
                { value: 'mixed', label: 'Mixed (products + services)' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </>
        )}

        {/* ── Step 1: Revenue ── */}
        {step === 1 && (
          <>
            <SectionHeading>Primary Revenue</SectionHeading>
            <Field
              label={isProductBusiness ? 'Gross Sales / Product Revenue' : 'Service Revenue'} required
              hint="Total revenue earned during the period before any deductions."
              value={form.primaryRevenue ?? ''}
              onChange={v => set('primaryRevenue', v)}
              placeholder="0"
            />
            <Field
              label="Other Revenue"
              hint="Commissions, royalties, rental income, or other secondary income."
              value={form.otherRevenue ?? ''}
              onChange={v => set('otherRevenue', v)}
              placeholder="0"
            />
            {isProductBusiness && (
              <>
                <SectionHeading>Cost of Goods Sold</SectionHeading>
                <Field
                  label="Cost of Goods Sold (COGS)"
                  hint="Direct material, manufacturing, and fulfilment costs tied to products sold."
                  value={form.costOfGoodsSold ?? ''}
                  onChange={v => set('costOfGoodsSold', v)}
                  placeholder="0"
                />
              </>
            )}
          </>
        )}

        {/* ── Step 2: Expenses ── */}
        {step === 2 && (
          <>
            <SectionHeading>Labor</SectionHeading>
            <Field
              label="Wages, Salaries & Contractor Pay"
              hint="Total compensation paid to employees and contractors."
              value={form.laborExpenses ?? ''}
              onChange={v => set('laborExpenses', v)}
              placeholder="0"
            />

            <SectionHeading>Overhead</SectionHeading>
            <Field label="Rent & Facilities" value={form.facilitiesExpenses ?? ''} onChange={v => set('facilitiesExpenses', v)} placeholder="0" />
            <Field label="Marketing & Advertising" value={form.marketingExpenses ?? ''} onChange={v => set('marketingExpenses', v)} placeholder="0" />
            <Field label="Technology & Software" value={form.technologyExpenses ?? ''} onChange={v => set('technologyExpenses', v)} placeholder="0" />
            <Field label="Professional Services (accounting, legal)" value={form.professionalServices ?? ''} onChange={v => set('professionalServices', v)} placeholder="0" />
            <Field label="Insurance" value={form.insuranceExpenses ?? ''} onChange={v => set('insuranceExpenses', v)} placeholder="0" />
            <Field
              label="Depreciation"
              hint="Leave blank to auto-estimate at 10% of fixed assets."
              value={form.depreciationExpense ?? ''}
              onChange={v => set('depreciationExpense', v)}
              placeholder="auto-estimate"
            />
            <Field label="Other Operating Expenses" value={form.otherOperatingExpenses ?? ''} onChange={v => set('otherOperatingExpenses', v)} placeholder="0" />

            <SectionHeading>Non-Operating</SectionHeading>
            <Field label="Interest Expense (on business loans)" value={form.interestExpense ?? ''} onChange={v => set('interestExpense', v)} placeholder="0" />
            <Field label="Non-Operating Income (interest earned, gains)" value={form.nonOperatingIncome ?? ''} onChange={v => set('nonOperatingIncome', v)} placeholder="0" />
            <Field
              label="Income Tax Expense"
              hint="Leave blank to auto-estimate at 21% of pre-tax income."
              value={form.incomeTaxExpense ?? ''}
              onChange={v => set('incomeTaxExpense', v)}
              placeholder="auto-estimate"
            />
          </>
        )}

        {/* ── Step 3: Financial Position ── */}
        {step === 3 && (
          <>
            <SectionHeading>Cash</SectionHeading>
            <Field label="Ending Cash Balance" required hint="Cash in all business accounts at end of period." value={form.endingCash ?? ''} onChange={v => set('endingCash', v)} placeholder="0" />
            <Field label="Beginning Cash Balance" hint="Cash at start of period (used to reconcile cash flow)." value={form.beginningCash ?? ''} onChange={v => set('beginningCash', v)} placeholder="same as ending if unknown" />

            <SectionHeading>Other Assets</SectionHeading>
            <Field label="Accounts Receivable" hint="Invoices sent but not yet collected." value={form.accountsReceivable ?? ''} onChange={v => set('accountsReceivable', v)} placeholder="0" />
            <Field label="Inventory" value={form.inventory ?? ''} onChange={v => set('inventory', v)} placeholder="0" />
            <Field label="Fixed Assets — Gross Value" hint="Original cost of equipment, vehicles, furniture, etc." value={form.fixedAssetsGross ?? ''} onChange={v => set('fixedAssetsGross', v)} placeholder="0" />
            <Field label="Accumulated Depreciation" hint="Total depreciation taken to date. Leave blank to use this period's depreciation." value={form.accumulatedDepreciation ?? ''} onChange={v => set('accumulatedDepreciation', v)} placeholder="auto" />

            <SectionHeading>Liabilities</SectionHeading>
            <Field label="Accounts Payable" hint="Vendor bills received but not yet paid." value={form.accountsPayable ?? ''} onChange={v => set('accountsPayable', v)} placeholder="0" />
            <Field label="Accrued Liabilities" hint="Wages earned but unpaid, unpaid interest, etc." value={form.accruedLiabilities ?? ''} onChange={v => set('accruedLiabilities', v)} placeholder="0" />
            <Field label="Short-Term Debt (due within 12 months)" value={form.shortTermDebt ?? ''} onChange={v => set('shortTermDebt', v)} placeholder="0" />
            <Field label="Long-Term Debt (beyond 12 months)" value={form.longTermDebt ?? ''} onChange={v => set('longTermDebt', v)} placeholder="0" />

            <SectionHeading>Owner's Equity & Capital Activity</SectionHeading>
            <Field label="Beginning Owner's Equity" hint="Leave blank to derive from the balance sheet equation." value={form.beginningEquity ?? ''} onChange={v => set('beginningEquity', v)} placeholder="auto-derive" />
            <Field label="Capital Contributions This Period" hint="New money you invested in the business." value={form.capitalContributions ?? ''} onChange={v => set('capitalContributions', v)} placeholder="0" />
            <Field label="Owner Draws / Distributions" hint="Cash or assets you took out of the business." value={form.ownerDraws ?? ''} onChange={v => set('ownerDraws', v)} placeholder="0" />

            <SectionHeading>Cash Flow Detail (optional)</SectionHeading>
            <Field label="Capital Expenditures (asset purchases this period)" value={form.capitalExpenditures ?? ''} onChange={v => set('capitalExpenditures', v)} placeholder="0" />
            <Field label="New Borrowings This Period" value={form.newBorrowings ?? ''} onChange={v => set('newBorrowings', v)} placeholder="0" />
            <Field label="Debt Repayments This Period" value={form.debtRepayments ?? ''} onChange={v => set('debtRepayments', v)} placeholder="0" />
          </>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 8,
              border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
              color: step === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: step === 0 ? 'not-allowed' : 'pointer', fontSize: 14,
            }}
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', borderRadius: 8,
                background: canAdvance() ? 'var(--accent-gold)' : 'rgba(212,168,67,0.3)',
                border: 'none',
                color: canAdvance() ? '#0c0e12' : 'rgba(255,255,255,0.3)',
                cursor: canAdvance() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 700,
              }}
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 22px', borderRadius: 8,
                background: 'var(--accent-gold)', border: 'none',
                color: '#0c0e12', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              }}
            >
              <FileText size={16} /> Generate Statements
            </button>
          )}
        </div>
      </div>

      {/* Progress note */}
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        Step {step + 1} of {STEPS.length} · All fields are optional except Business Name, Period, and Revenue
      </div>
    </div>
  )
}
