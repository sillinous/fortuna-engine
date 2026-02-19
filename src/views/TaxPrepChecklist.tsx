import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateTaxPrepChecklist, type TaxPrepSection, type TaxPrepItem } from '../engine/tax-prep'
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, Circle, MinusCircle,
  ChevronDown, ChevronUp, DollarSign, FileText, Download, Calendar
} from 'lucide-react'

function fmt(n: number): string { return `$${Math.round(n).toLocaleString()}` }

const STATUS_CONFIG: Record<string, { color: string; icon: JSX.Element; label: string }> = {
  complete: { color: 'var(--accent-emerald)', icon: <CheckCircle2 size={14} />, label: 'Complete' },
  partial: { color: 'var(--accent-gold)', icon: <AlertTriangle size={14} />, label: 'Partial' },
  missing: { color: 'var(--accent-red)', icon: <Circle size={14} />, label: 'Missing' },
  na: { color: 'var(--text-muted)', icon: <MinusCircle size={14} />, label: 'N/A' },
}

export function TaxPrepChecklist() {
  const { state } = useFortuna()
  const checklist = useMemo(() => generateTaxPrepChecklist(state), [state])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(checklist.sections.map(s => s.title)))

  const toggleSection = (title: string) => {
    const next = new Set(expandedSections)
    next.has(title) ? next.delete(title) : next.add(title)
    setExpandedSections(next)
  }

  const hasData = state.incomeStreams.length > 0

  if (!hasData) {
    return (
      <div className="view-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <ClipboardCheck size={32} color="var(--accent-gold)" style={{ marginBottom: 12 }} />
          <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Tax Prep Checklist</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add your financial profile to generate a comprehensive filing checklist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-enter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="section-title">Tax Prep Checklist</h1>
          <p className="section-subtitle">Filing preparation for {checklist.filingYear} · Due {checklist.filingDeadline}</p>
        </div>
      </div>

      {/* Top Summary Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Overall Completion */}
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 56, height: 56 }}>
              <svg width={56} height={56} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={28} cy={28} r={24} fill="none" stroke="var(--bg-hover)" strokeWidth={4} />
                <circle cx={28} cy={28} r={24} fill="none"
                  stroke={checklist.overallCompletion >= 80 ? 'var(--accent-emerald)' : checklist.overallCompletion >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)'}
                  strokeWidth={4} strokeDasharray={`${checklist.overallCompletion * 1.508} 999`} strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>
                {checklist.overallCompletion}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>Filing Readiness</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {checklist.criticalMissing.length === 0 ? 'All critical items complete' : `${checklist.criticalMissing.length} items need attention`}
              </div>
            </div>
          </div>
        </div>

        {/* Refund / Owed */}
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Estimated {checklist.isRefund ? 'Refund' : 'Balance Due'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600, color: checklist.isRefund ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
            {checklist.isRefund ? '+' : '-'}{fmt(checklist.estimatedRefundOrOwed)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            Tax: {fmt(checklist.summary.totalTax)} · Withheld: {fmt(checklist.summary.totalWithheld)}
          </div>
        </div>

        {/* Filing Summary */}
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tax Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Total Income', value: fmt(checklist.summary.totalIncome) },
              { label: 'Deductions', value: fmt(checklist.summary.totalDeductions) },
              { label: 'Total Tax', value: fmt(checklist.summary.totalTax) },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical Missing Items */}
      {checklist.criticalMissing.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-red)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> {checklist.criticalMissing.length} Critical Items Needed
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {checklist.criticalMissing.slice(0, 8).map(item => (
              <span key={item.id} style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', fontSize: 11, color: 'var(--text-secondary)' }}>
                {item.form}: {item.description.substring(0, 40)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {checklist.sections.map(section => (
        <div key={section.title} className="card" style={{ marginBottom: 12 }}>
          <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => toggleSection(section.title)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{section.icon}</span>
              <div>
                <span className="card-title">{section.title}</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{section.items.length} items</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Completion bar */}
              <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-hover)' }}>
                  <div style={{ width: `${section.completionPct}%`, height: '100%', borderRadius: 2,
                    background: section.completionPct === 100 ? 'var(--accent-emerald)' : section.completionPct >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', minWidth: 30 }}>{section.completionPct}%</span>
              </div>
              {expandedSections.has(section.title) ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
            </div>
          </div>

          {expandedSections.has(section.title) && (
            <div className="card-body" style={{ padding: '0 16px 12px' }}>
              {section.items.map(item => (
                <ChecklistItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Filing Timeline */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header"><span className="card-title"><Calendar size={14} /> Key Filing Dates</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { date: `January 31, ${checklist.filingYear + 1}`, event: 'W-2s and 1099s due from employers/clients', done: false },
              { date: `March 15, ${checklist.filingYear + 1}`, event: 'S-Corp/Partnership returns due (or extension)', done: false },
              { date: `April 15, ${checklist.filingYear + 1}`, event: 'Personal return due (Form 1040) · Q1 estimated tax due', done: false },
              { date: `June 15, ${checklist.filingYear + 1}`, event: 'Q2 estimated tax payment due', done: false },
              { date: `September 15, ${checklist.filingYear + 1}`, event: 'Extended S-Corp/Partnership due · Q3 estimated tax due', done: false },
              { date: `October 15, ${checklist.filingYear + 1}`, event: 'Extended personal return due', done: false },
            ].map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-primary)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0,
                  background: d.done ? 'var(--accent-emerald)' : 'var(--border-medium)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{d.date}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{d.event}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChecklistItem({ item }: { item: TaxPrepItem }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[item.status]

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ color: cfg.color, marginTop: 1, flexShrink: 0 }}>{cfg.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{item.description}</span>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {item.form}
            </span>
            {item.priority === 'required' && item.status !== 'complete' && (
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)' }}>Required</span>
            )}
          </div>
          {item.amount !== undefined && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{fmt(item.amount)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.dueDate && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.dueDate}</span>
          )}
          {expanded ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginLeft: 24, marginTop: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-primary)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {item.notes}
        </div>
      )}
    </div>
  )
}
