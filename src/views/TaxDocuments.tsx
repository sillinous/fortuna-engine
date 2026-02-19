import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  generate1040ES,
  generateFormationChecklist,
  generateScheduleC,
  generateAuditDocChecklist,
  type EstimatedPaymentVoucher,
  type EntityFormationChecklist,
  type ScheduleCWorksheet,
  type AuditDocItem,
} from '../engine/tax-documents'
import {
  FileText, Building2, Calculator, Shield, ChevronDown,
  Download, Copy, CheckCircle, ExternalLink, AlertTriangle,
  ClipboardCheck,
} from 'lucide-react'

type DocTab = 'vouchers' | 'formation' | 'schedule-c' | 'audit-docs'

export function TaxDocuments() {
  const { state } = useFortuna()
  const [activeTab, setActiveTab] = useState<DocTab>('vouchers')
  const [expandedVoucher, setExpandedVoucher] = useState<number | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const [formationType, setFormationType] = useState<'llc' | 'llc_scorp' | 'scorp' | 'ccorp'>('llc_scorp')

  // Generate documents
  const estimatedPayments = useMemo(() => generate1040ES(state), [state])
  const formation = useMemo(() => generateFormationChecklist(formationType, state.profile.state), [formationType, state.profile.state])
  const scheduleC = useMemo(() => generateScheduleC(state), [state])
  const auditDocs = useMemo(() => generateAuditDocChecklist(state), [state])

  const hasSEIncome = state.incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive)

  // Copy helper
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(label)
      setTimeout(() => setCopyFeedback(''), 2000)
    } catch { /* fallback */ }
  }

  // Download helper
  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Styles
  const card: React.CSSProperties = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 14, padding: 24,
  }
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: active ? 'var(--accent-gold-dim)' : 'transparent',
    color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
    cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13,
    fontWeight: active ? 600 : 400, transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 6,
  })
  const actionBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-surface)', color: 'var(--text-secondary)',
    cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12,
    transition: 'all 0.2s',
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 6 }}>
          Tax Documents
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Ready-to-use tax worksheets, payment vouchers, and formation checklists generated from your financial data.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
        <button style={tabBtn(activeTab === 'vouchers')} onClick={() => setActiveTab('vouchers')}>
          <Calculator size={14} /> 1040-ES Vouchers
        </button>
        <button style={tabBtn(activeTab === 'formation')} onClick={() => setActiveTab('formation')}>
          <Building2 size={14} /> Formation Checklist
        </button>
        {hasSEIncome && (
          <button style={tabBtn(activeTab === 'schedule-c')} onClick={() => setActiveTab('schedule-c')}>
            <FileText size={14} /> Schedule C Draft
          </button>
        )}
        <button style={tabBtn(activeTab === 'audit-docs')} onClick={() => setActiveTab('audit-docs')}>
          <Shield size={14} /> Audit Doc Checklist
        </button>
      </div>

      {/* ═══ 1040-ES VOUCHERS ═══ */}
      {activeTab === 'vouchers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary card */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Estimated Annual Tax
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 600, color: 'var(--accent-gold)' }}>
                  ${estimatedPayments.totalEstimated.toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Quarterly payment: ${Math.ceil(estimatedPayments.safeHarborAmount / 4).toLocaleString()} (safe harbor)
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={actionBtn}
                  onClick={() => {
                    const all = estimatedPayments.vouchers.map(v => v.formContent).join('\n\n')
                    copyText(all, 'All vouchers')
                  }}
                >
                  {copyFeedback === 'All vouchers' ? <CheckCircle size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  Copy All
                </button>
                <button
                  style={actionBtn}
                  onClick={() => {
                    const all = estimatedPayments.vouchers.map(v => v.formContent).join('\n\n')
                    downloadText(all, `1040-ES-${new Date().getFullYear()}.txt`)
                  }}
                >
                  <Download size={13} /> Download
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          {estimatedPayments.notes.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'var(--accent-blue-dim)', border: '1px solid var(--accent-blue)22', borderRadius: 10 }}>
              {estimatedPayments.notes.map((note, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--accent-blue)', lineHeight: 1.6 }}>
                  • {note}
                </div>
              ))}
            </div>
          )}

          {/* Quarter cards */}
          {estimatedPayments.vouchers.map(v => (
            <div key={v.quarter} style={card}>
              <button
                onClick={() => setExpandedVoucher(expandedVoucher === v.quarter ? null : v.quarter)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, fontFamily: 'var(--font-body)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--accent-gold-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent-gold)',
                  }}>
                    Q{v.quarter}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                      ${v.paymentAmount.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Due {v.dueDate}</div>
                  </div>
                </div>
                <ChevronDown size={16} color="var(--text-muted)" style={{
                  transition: 'transform 0.2s',
                  transform: expandedVoucher === v.quarter ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </button>

              {expandedVoucher === v.quarter && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button style={actionBtn} onClick={() => copyText(v.formContent, `Q${v.quarter}`)}>
                      {copyFeedback === `Q${v.quarter}` ? <CheckCircle size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                      Copy
                    </button>
                    <a
                      href="https://www.irs.gov/payments"
                      target="_blank"
                      rel="noopener"
                      style={{ ...actionBtn, textDecoration: 'none', color: 'var(--accent-blue)' }}
                    >
                      <ExternalLink size={13} /> Pay Online (IRS)
                    </a>
                  </div>
                  <pre style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5,
                    color: 'var(--text-secondary)', background: 'var(--bg-primary)',
                    padding: 16, borderRadius: 10, overflow: 'auto', whiteSpace: 'pre',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    {v.formContent}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══ FORMATION CHECKLIST ═══ */}
      {activeTab === 'formation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Entity type selector */}
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                {formation.entityType} in {formation.stateName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Est. cost: {formation.totalEstimatedCost} · Timeline: {formation.totalTimeline}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['llc', 'llc_scorp', 'scorp', 'ccorp'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFormationType(t)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none',
                    background: formationType === t ? 'var(--accent-gold-dim)' : 'var(--bg-surface)',
                    color: formationType === t ? 'var(--accent-gold)' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  }}
                >
                  {t === 'llc_scorp' ? 'LLC+S' : t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {formation.warnings.map((w, i) => (
            <div key={i} style={{
              padding: '10px 16px', borderRadius: 10,
              background: 'var(--accent-red-dim)', border: '1px solid var(--accent-red)22',
              fontSize: 12, color: 'var(--accent-red)', lineHeight: 1.5,
              display: 'flex', gap: 8,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              {w}
            </div>
          ))}

          {/* Steps */}
          {formation.steps.map((step, i) => (
            <div key={i} style={card}>
              <button
                onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                style={{
                  display: 'flex', gap: 12, width: '100%', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'var(--accent-gold-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-gold)',
                }}>
                  {step.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {step.title}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cost: {step.estimatedCost}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Time: {step.timeline}</span>
                  </div>
                </div>
                <ChevronDown size={14} color="var(--text-muted)" style={{
                  transition: 'transform 0.2s',
                  transform: expandedStep === i ? 'rotate(180deg)' : 'rotate(0)',
                }} />
              </button>

              {expandedStep === i && (
                <div style={{ marginTop: 12, marginLeft: 40 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {step.description}
                  </div>
                  {step.resource && (
                    <div style={{ fontSize: 11, color: 'var(--accent-blue)', marginTop: 8 }}>
                      🔗 {step.resource}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Tips */}
          {formation.tips.length > 0 && (
            <div style={{ ...card, background: 'var(--bg-primary)', border: '1px dashed var(--border-subtle)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                💡 Tips
              </div>
              {formation.tips.map((tip, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 4 }}>
                  • {tip}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ SCHEDULE C DRAFT ═══ */}
      {activeTab === 'schedule-c' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Receipts</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
                      ${scheduleC.grossReceipts.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Expenses</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: 'var(--accent-red)' }}>
                      −${scheduleC.totalExpenses.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Profit</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: scheduleC.netProfit >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                      ${scheduleC.netProfit.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  SE Tax: ${scheduleC.seTaxEstimate.toLocaleString()} · SE Deduction: ${scheduleC.seDeduction.toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={actionBtn} onClick={() => copyText(scheduleC.formContent, 'Schedule C')}>
                  {copyFeedback === 'Schedule C' ? <CheckCircle size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
                  Copy
                </button>
                <button style={actionBtn} onClick={() => downloadText(scheduleC.formContent, `schedule-c-draft-${scheduleC.taxYear}.txt`)}>
                  <Download size={13} /> Download
                </button>
              </div>
            </div>
          </div>

          {/* Expense breakdown */}
          {scheduleC.partII.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Expense Breakdown (Part II)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scheduleC.partII.map((line, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>
                        Line {line.line}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{line.label}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      ${line.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full worksheet */}
          <details>
            <summary style={{ fontSize: 13, color: 'var(--accent-gold)', cursor: 'pointer', padding: '8px 0' }}>
              View Full Schedule C Worksheet
            </summary>
            <pre style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5,
              color: 'var(--text-secondary)', background: 'var(--bg-primary)',
              padding: 16, borderRadius: 10, overflow: 'auto', whiteSpace: 'pre',
              border: '1px solid var(--border-subtle)', marginTop: 8,
            }}>
              {scheduleC.formContent}
            </pre>
          </details>
        </div>
      )}

      {/* ═══ AUDIT DOCUMENTATION CHECKLIST ═══ */}
      {activeTab === 'audit-docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '10px 16px', borderRadius: 10,
            background: 'var(--accent-gold)10', border: '1px solid var(--accent-gold)22',
            fontSize: 12, color: 'var(--accent-gold)', lineHeight: 1.5,
          }}>
            <ClipboardCheck size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
            Organize these documents proactively. Having them ready reduces audit stress and strengthens your position.
          </div>

          {auditDocs.map((category, ci) => (
            <div key={ci} style={card}>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 16 }}>
                {category.category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {category.items.map((item, ii) => {
                  const prColor = item.priority === 'essential' ? 'var(--accent-red)'
                    : item.priority === 'recommended' ? 'var(--accent-gold)' : 'var(--text-muted)'
                  return (
                    <div key={ii} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '8px 12px', borderRadius: 8,
                      background: 'var(--bg-primary)',
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: 3, marginTop: 6,
                        background: prColor, flexShrink: 0,
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {item.description}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {item.scheduleRef} · {item.priority}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
