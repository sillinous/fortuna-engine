/**
 * FORTUNA ENGINE — Contextual Help System (Phase 2 UX Fix)
 *
 * "Why is this important?" expandable sections for every concept.
 * Provides plain-English explanations of tax concepts in context.
 * Supports both inline hints and expandable detail panels.
 */

import { useState, type ReactNode } from 'react'
import { HelpCircle, ChevronDown, Lightbulb, ExternalLink } from 'lucide-react'

// ─── Help Content Registry ──────────────────────────────────────────

export interface HelpEntry {
  title: string
  short: string          // One-line inline hint
  detail: string         // 2-3 sentence expandable explanation
  example?: string       // Concrete example with numbers
  learnMore?: string     // External URL
}

export const HELP_CONTENT: Record<string, HelpEntry> = {
  // Filing & Profile
  filing_status: {
    title: 'Filing Status',
    short: 'Determines your standard deduction and bracket widths.',
    detail: 'Your filing status affects nearly everything — your standard deduction, tax bracket thresholds, eligibility for credits, and phase-out limits. Married Filing Jointly generally gives the most favorable rates.',
    example: 'A single filer hits the 24% bracket at $100,525, but a married joint filer doesn\'t hit it until $201,050.',
  },
  standard_deduction: {
    title: 'Standard Deduction',
    short: 'The amount you subtract from income before taxes are calculated.',
    detail: 'Most taxpayers take the standard deduction rather than itemizing. It\'s $14,600 for single filers and $29,200 for married filing jointly in 2024. You only itemize if your total deductions exceed this.',
  },
  effective_rate: {
    title: 'Effective Tax Rate',
    short: 'Your actual percentage of total income paid in taxes.',
    detail: 'This is your total tax divided by your total income. It\'s always lower than your marginal rate because only income above each bracket threshold is taxed at the higher rate. This is the number that actually matters for planning.',
    example: 'On $100K income, your marginal rate is 24% but your effective rate is closer to 17%.',
  },
  marginal_rate: {
    title: 'Marginal Tax Rate',
    short: 'The rate applied to your last dollar of income.',
    detail: 'This is the bracket your top dollar falls in. It matters for decisions about earning more income or taking deductions — every additional dollar earned is taxed at this rate, and every deduction saves you this percentage.',
    example: 'If you\'re in the 24% bracket, a $1,000 deduction saves you $240.',
  },
  
  // Self-Employment
  se_tax: {
    title: 'Self-Employment Tax',
    short: '15.3% on net SE income — the biggest surprise for freelancers.',
    detail: 'When you\'re self-employed, you pay both the employee AND employer halves of Social Security (12.4%) and Medicare (2.9%). This 15.3% is on top of income tax. The deductible half reduces your AGI, but it\'s still a significant cost.',
    example: 'On $100K net SE income, SE tax is about $14,130. Half ($7,065) is deductible.',
  },
  qbi_deduction: {
    title: 'QBI Deduction (§199A)',
    short: 'Deduct up to 20% of qualified business income.',
    detail: 'Pass-through business owners (sole props, LLCs, S-Corps) can deduct up to 20% of their qualified business income. There are income limits and restrictions for specified service businesses, but it\'s one of the largest deductions available.',
    example: 'On $120K of QBI, the deduction could be up to $24,000 — saving $5,280 at the 22% bracket.',
  },
  
  // Entity Structure
  s_corp_salary: {
    title: 'S-Corp Reasonable Salary',
    short: 'Only your salary is subject to SE tax — distributions are not.',
    detail: 'S-Corp owners must pay themselves a "reasonable salary" subject to payroll taxes. Any remaining profit can be taken as distributions, which avoid the 15.3% SE tax. The IRS watches for unreasonably low salaries.',
    example: 'On $150K profit, paying $80K salary + $70K distributions saves ~$10,710 in SE tax vs. sole prop.',
  },
  entity_comparison: {
    title: 'Entity Structure',
    short: 'Your business type affects how income is taxed.',
    detail: 'Sole proprietorships are simple but pay full SE tax. LLCs provide liability protection. S-Corps let you split income between salary and distributions. C-Corps have a flat 21% rate but face double taxation on dividends.',
  },
  
  // Retirement
  solo_401k: {
    title: 'Solo 401(k)',
    short: 'The most powerful retirement vehicle for the self-employed.',
    detail: 'A Solo 401(k) lets you contribute as both employee ($23,000 in 2024) and employer (25% of compensation), up to $69,000 total. Every dollar contributed reduces your taxable income dollar-for-dollar.',
    example: 'Contributing $69,000 at a 32% marginal rate saves $22,080 in federal taxes alone.',
  },
  sep_ira: {
    title: 'SEP-IRA',
    short: 'Simple retirement savings — up to 25% of net SE income.',
    detail: 'A SEP-IRA lets self-employed people contribute up to 25% of net self-employment income, up to $69,000. It\'s simpler to administer than a Solo 401(k) but doesn\'t allow employee contributions.',
  },
  hsa: {
    title: 'Health Savings Account',
    short: 'Triple tax advantage — deduction, growth, and withdrawals.',
    detail: 'An HSA is the only account with triple tax benefits: contributions are deductible, investments grow tax-free, and withdrawals for medical expenses are tax-free. You need a high-deductible health plan. Max: $4,150 single / $8,300 family in 2024.',
  },
  
  // Crypto & Investments
  cost_basis: {
    title: 'Cost Basis',
    short: 'What you paid — determines your gain or loss when you sell.',
    detail: 'Cost basis is your original investment amount plus any fees. When you sell, your gain or loss is the sale price minus cost basis. Different methods (FIFO, LIFO, Specific ID) can dramatically change your tax bill.',
    example: 'Bought 1 BTC at $20K, sold at $60K. Cost basis: $20K. Taxable gain: $40K.',
  },
  tax_loss_harvesting: {
    title: 'Tax-Loss Harvesting',
    short: 'Sell losing investments to offset gains and reduce taxes.',
    detail: 'Selling investments at a loss creates a capital loss that offsets capital gains dollar-for-dollar. If losses exceed gains, you can deduct up to $3,000 against ordinary income, with unlimited carryforward.',
    example: 'You have $10K in gains and $15K in losses. Net: $5K loss. Deduct $3K this year, carry $2K forward.',
  },
  wash_sale: {
    title: 'Wash Sale Rule',
    short: 'Can\'t claim a loss if you rebuy the same security within 30 days.',
    detail: 'If you sell a security at a loss and buy a "substantially identical" security within 30 days before or after, the loss is disallowed. The disallowed loss gets added to the new shares\' cost basis. Note: crypto is currently exempt from this rule.',
  },
  
  // Deductions
  home_office: {
    title: 'Home Office Deduction',
    short: 'Deduct a portion of rent, utilities, and internet for your workspace.',
    detail: 'If you use part of your home exclusively and regularly for business, you can deduct that proportion of housing costs. The simplified method allows $5/sq ft up to 300 sq ft ($1,500). The actual expense method often yields more.',
    example: 'Home office is 200 sq ft of a 1,500 sq ft home (13.3%). Rent $2,000/mo → $3,200/year deduction.',
  },
  section_179: {
    title: '§179 Expensing',
    short: 'Deduct the full cost of business equipment in year one.',
    detail: 'Instead of depreciating equipment over years, §179 lets you deduct the full purchase price in the year you buy it, up to $1,220,000 in 2024. This can dramatically accelerate deductions.',
    example: 'Buy a $10,000 computer for business. §179 lets you deduct $10,000 this year instead of $2,000/year for 5 years.',
  },
  
  // Risk & Audit
  audit_risk: {
    title: 'Audit Risk Score',
    short: 'How likely the IRS is to examine your return.',
    detail: 'The IRS uses a DIF (Discriminant Index Function) score to flag returns for audit. High deductions relative to income, large charitable gifts, cash-heavy businesses, and inconsistencies with W-2/1099 data all increase risk.',
  },
  estimated_payments: {
    title: 'Estimated Tax Payments',
    short: 'Pay-as-you-go quarterly to avoid the underpayment penalty.',
    detail: 'If you\'ll owe $1,000+ when filing, the IRS expects quarterly estimated payments (April 15, June 15, September 15, January 15). Safe harbor: pay 100% of last year\'s tax (110% if AGI > $150K).',
    example: 'Last year\'s tax: $40K. Safe harbor quarterly payment: $10K/quarter ($11K if AGI > $150K).',
  },
  
  // State Tax
  state_income_tax: {
    title: 'State Income Tax',
    short: 'Varies from 0% (TX, FL, NV) to 13.3% (CA).',
    detail: 'Nine states have no income tax. Others range from flat rates (like IL at 4.95%) to highly progressive rates (CA tops at 13.3%). Your state tax often represents 20-40% of your total tax burden.',
  },
  salt_cap: {
    title: 'SALT Deduction Cap',
    short: 'State and local tax deduction capped at $10,000.',
    detail: 'The Tax Cuts and Jobs Act capped the state and local tax (SALT) deduction at $10,000. This primarily impacts taxpayers in high-tax states like CA, NY, and NJ who itemize deductions.',
  },
  
  // Multi-Entity
  cascade_flow: {
    title: 'Entity Cascade',
    short: 'How income flows between related business entities.',
    detail: 'Multi-entity structures can route income through different entities to optimize tax treatment. For example, an S-Corp management company can pay fees to a C-Corp holding intellectual property, splitting income between different tax regimes.',
  },
}

// ─── Inline Help Tooltip ────────────────────────────────────────────

export function HelpTip({ topic, children }: { topic: string; children?: ReactNode }) {
  const entry = HELP_CONTENT[topic]
  if (!entry) return <>{children}</>

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}
      <span
        title={entry.short}
        style={{ cursor: 'help', display: 'inline-flex', color: 'var(--text-muted)' }}
        aria-label={`Help: ${entry.short}`}
      >
        <HelpCircle size={13} />
      </span>
    </span>
  )
}

// ─── Expandable Help Section ────────────────────────────────────────

export function HelpSection({ topic, compact }: { topic: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const entry = HELP_CONTENT[topic]
  if (!entry) return null

  if (compact) {
    return (
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)',
          padding: '4px 0', transition: 'color 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-gold)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        aria-expanded={open}
      >
        <HelpCircle size={12} />
        {open ? 'Hide explanation' : 'Why does this matter?'}
        <ChevronDown size={11} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '10px 14px', borderRadius: 10,
          background: open ? 'var(--accent-gold-dim)' : 'var(--bg-surface)',
          border: `1px solid ${open ? 'rgba(212,168,67,0.2)' : 'var(--border-subtle)'}`,
          cursor: 'pointer', transition: 'all 0.2s',
          textAlign: 'left',
        }}
      >
        <Lightbulb size={14} color={open ? 'var(--accent-gold)' : 'var(--text-muted)'} />
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 500,
          color: open ? 'var(--accent-gold)' : 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
        }}>
          Why is this important?
        </span>
        <ChevronDown
          size={14}
          color={open ? 'var(--accent-gold)' : 'var(--text-muted)'}
          style={{ transition: 'transform 0.2s var(--ease-out)', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div style={{
          padding: '14px 16px', marginTop: 6, borderRadius: 10,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          animation: 'fadeInDown 0.2s ease-out',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: entry.example ? 12 : 0 }}>
            {entry.detail}
          </div>

          {entry.example && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)',
              marginBottom: entry.learnMore ? 10 : 0,
            }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>
                Example
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
                {entry.example}
              </div>
            </div>
          )}

          {entry.learnMore && (
            <a href={entry.learnMore} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: 'var(--accent-blue)', textDecoration: 'none',
            }}>
              Learn more <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Info Banner ────────────────────────────────────────────────────

export function InfoBanner({ topic, dismissible }: { topic: string; dismissible?: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const entry = HELP_CONTENT[topic]
  if (!entry || dismissed) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px', borderRadius: 10,
      background: 'rgba(96,165,250,0.06)',
      border: '1px solid rgba(96,165,250,0.15)',
      marginBottom: 16,
    }}
    role="note"
    aria-label={entry.title}
    >
      <Lightbulb size={16} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
          {entry.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {entry.short}
        </div>
      </div>
      {dismissible && (
        <button onClick={() => setDismissed(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2,
        }} aria-label="Dismiss">×</button>
      )}
    </div>
  )
}
