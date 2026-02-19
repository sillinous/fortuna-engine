/**
 * Fortuna Engine — QuickBooks Import View
 * Drag-and-drop IIF, QBO, OFX, QFX, and QIF file import with
 * intelligent account mapping, preview, and merge into Fortuna state.
 *
 * @view QuickBooksImport
 */

import { useState, useCallback, useRef } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { parseIIF, type IIFParseResult } from '../engine/qb-iif-parser'
import { parseOFX, parseQIF, type OFXParseResult, type QIFParseResult } from '../engine/qb-ofx-parser'
import {
  mapAllAccounts, generateFortunaStatePatch,
  type AccountMapping, type QBImportSummary, type FortunaTaxCategory,
  TRNS_TYPE_DESCRIPTIONS, trnsTypeToFlow,
} from '../engine/qb-coa-mapper'

type ImportPhase = 'upload' | 'preview' | 'mapping' | 'confirm' | 'complete'

export default function QuickBooksImport() {
  const { state, updateState } = useFortuna()
  const [phase, setPhase] = useState<ImportPhase>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState<'iif' | 'ofx' | 'qif' | ''>('')

  // Parse results
  const [iifResult, setIifResult] = useState<IIFParseResult | null>(null)
  const [ofxResult, setOfxResult] = useState<OFXParseResult | null>(null)
  const [qifResult, setQifResult] = useState<QIFParseResult | null>(null)

  // Mapping + import
  const [accountMappings, setAccountMappings] = useState<Map<string, AccountMapping>>(new Map())
  const [importSummary, setImportSummary] = useState<QBImportSummary | null>(null)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'accounts' | 'transactions' | 'mapping'>('overview')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── File Handling ────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    const text = await file.text()
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    setFileName(file.name)

    if (ext === 'iif') {
      setFileType('iif')
      const result = parseIIF(text)
      setIifResult(result)
      const mappings = mapAllAccounts(result.accounts)
      setAccountMappings(mappings)

      // Generate import summary
      const { summary } = generateFortunaStatePatch(
        result.accounts, result.transactions, result.vendors, result.classes,
      )
      setImportSummary(summary)
      setPhase('preview')

    } else if (['ofx', 'qbo', 'qfx'].includes(ext)) {
      setFileType('ofx')
      const result = parseOFX(text)
      setOfxResult(result)
      setPhase('preview')

    } else if (ext === 'qif') {
      setFileType('qif')
      const result = parseQIF(text)
      setQifResult(result)
      setPhase('preview')

    } else {
      alert(`Unsupported file type: .${ext}\n\nSupported: .iif, .qbo, .ofx, .qfx, .qif`)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  // ─── Import Execution ─────────────────────────────────────────────────

  const executeImport = useCallback(() => {
    if (!iifResult) return

    const { patch } = generateFortunaStatePatch(
      iifResult.accounts, iifResult.transactions, iifResult.vendors, iifResult.classes,
    )

    // Merge into existing state
    updateState((prev) => ({
      ...prev,
      incomeStreams: [...(prev.incomeStreams || []), ...(patch.incomeStreams || [])],
      expenses: [...(prev.expenses || []), ...(patch.expenses || [])],
      entities: [...(prev.entities || []), ...(patch.entities || [])],
      bankTransactions: [...(prev.bankTransactions || []), ...(patch.bankTransactions || [])],
    }))

    setPhase('complete')
  }, [iifResult, state, updateState])

  // ─── Styles ───────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', borderRadius: 12,
    border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 16,
  }

  const stat: React.CSSProperties = {
    textAlign: 'center' as const, padding: 12,
  }

  const statValue: React.CSSProperties = {
    fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
  }

  const statLabel: React.CSSProperties = {
    fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', marginTop: 4,
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#0a0e1a' : 'var(--text-secondary)',
    border: active ? 'none' : '1px solid var(--border-subtle)',
    cursor: 'pointer',
  })

  const badge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 10, fontWeight: 600, background: `${color}20`, color,
  })

  // ─── Upload Phase ─────────────────────────────────────────────────────

  if (phase === 'upload') {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          📗 QuickBooks Import
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          Import your QuickBooks data directly into Fortuna. Supports all major QB file formats.
        </p>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: 16, padding: '60px 40px', textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.2s',
            background: dragOver ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-card)',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Drop QuickBooks file here
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            or click to browse
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[
              { ext: '.iif', label: 'IIF', desc: 'Intuit Interchange (Desktop)' },
              { ext: '.qbo', label: 'QBO', desc: 'Web Connect (Desktop + Online)' },
              { ext: '.ofx', label: 'OFX', desc: 'Open Financial Exchange' },
              { ext: '.qfx', label: 'QFX', desc: 'Quicken Web Connect' },
              { ext: '.qif', label: 'QIF', desc: 'Quicken Interchange (Legacy)' },
            ].map(f => (
              <div key={f.ext} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 10,
                background: 'var(--bg-hover)', color: 'var(--text-secondary)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{f.ext}</span> — {f.desc}
              </div>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".iif,.qbo,.ofx,.qfx,.qif"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* How-to Guide */}
        <div style={{ ...card, marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--text-primary)' }}>
            How to export from QuickBooks
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>QuickBooks Desktop (.iif)</div>
              <div>File → Utilities → Export → IIF Files</div>
              <div>Select: Chart of Accounts, Customers, Vendors</div>
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
                IIF gives the richest data — includes full chart of accounts, classes, and all transaction details mapped to tax categories
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>QuickBooks Online (.qbo/.ofx)</div>
              <div>Banking → Download transactions → QBO format</div>
              <div>Or: Bank website → Download → OFX/QBO</div>
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
                QBO/OFX imports bank transactions — good for reconciliation and catching uncategorized items
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Preview Phase ────────────────────────────────────────────────────

  if (phase === 'preview' || phase === 'mapping') {
    const isIIF = fileType === 'iif' && iifResult
    const isOFX = fileType === 'ofx' && ofxResult
    const isQIF = fileType === 'qif' && qifResult

    return (
      <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              📗 {fileName}
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {isIIF && `IIF File — ${iifResult.stats.transactionCount} transactions, ${iifResult.stats.accountCount} accounts`}
              {isOFX && `${ofxResult.statements[0]?.flavor.toUpperCase()} File — ${ofxResult.stats.transactionCount} transactions`}
              {isQIF && `QIF File — ${qifResult.transactions.length} transactions`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setPhase('upload'); setIifResult(null); setOfxResult(null); setQifResult(null) }}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← New File
            </button>
            {isIIF && (
              <button onClick={executeImport}
                style={{ padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', color: '#fff', cursor: 'pointer' }}>
                ✓ Import into Fortuna
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['overview', 'accounts', 'transactions', 'mapping'] as const).map(tab => (
            <button key={tab} onClick={() => setSelectedTab(tab)} style={tabBtn(selectedTab === tab)}>
              {tab === 'overview' ? '📊 Overview' : tab === 'accounts' ? '📒 Accounts' : tab === 'transactions' ? '💳 Transactions' : '🔗 Tax Mapping'}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {selectedTab === 'overview' && isIIF && (
          <>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { value: iifResult.stats.transactionCount, label: 'Transactions' },
                { value: iifResult.stats.accountCount, label: 'Accounts' },
                { value: iifResult.stats.customerCount, label: 'Customers' },
                { value: iifResult.stats.vendorCount, label: 'Vendors' },
                { value: iifResult.stats.employeeCount, label: 'Employees' },
                { value: iifResult.stats.classCount, label: 'Classes' },
                { value: iifResult.stats.balancedCount, label: 'Balanced' },
                { value: iifResult.stats.errorCount, label: 'Errors', color: iifResult.stats.errorCount > 0 ? '#ef4444' : undefined },
              ].map(s => (
                <div key={s.label} style={{ ...card, ...stat }}>
                  <div style={{ ...statValue, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                  <div style={statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Import Summary */}
            {importSummary && (
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--text-primary)' }}>
                  📊 Tax Impact Preview
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div style={stat}>
                    <div style={{ ...statValue, color: '#22c55e' }}>
                      ${importSummary.taxImpact.estimatedGrossIncome.toLocaleString()}
                    </div>
                    <div style={statLabel}>Gross Income Detected</div>
                  </div>
                  <div style={stat}>
                    <div style={{ ...statValue, color: '#f59e0b' }}>
                      ${importSummary.taxImpact.estimatedDeductions.toLocaleString()}
                    </div>
                    <div style={statLabel}>Deductions Detected</div>
                  </div>
                  <div style={stat}>
                    <div style={statValue}>
                      ${importSummary.taxImpact.estimatedTaxableIncome.toLocaleString()}
                    </div>
                    <div style={statLabel}>Est. Taxable Income</div>
                  </div>
                </div>

                {importSummary.warnings.length > 0 && (
                  <div style={{ marginTop: 12, padding: 12, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 8 }}>
                    {importSummary.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#f59e0b', marginBottom: 4 }}>⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Date Range */}
            {iifResult.stats.dateRange && (
              <div style={card}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  📅 Date Range: <strong>{iifResult.stats.dateRange.earliest}</strong> → <strong>{iifResult.stats.dateRange.latest}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Debits: ${iifResult.stats.totalDebits.toLocaleString()} | Credits: ${iifResult.stats.totalCredits.toLocaleString()}
                </div>
              </div>
            )}
          </>
        )}

        {selectedTab === 'overview' && isOFX && (
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div style={stat}>
                <div style={statValue}>{ofxResult.stats.transactionCount}</div>
                <div style={statLabel}>Transactions</div>
              </div>
              <div style={stat}>
                <div style={{ ...statValue, color: '#22c55e' }}>${ofxResult.stats.totalInflow.toLocaleString()}</div>
                <div style={statLabel}>Total Inflow</div>
              </div>
              <div style={stat}>
                <div style={{ ...statValue, color: '#ef4444' }}>${ofxResult.stats.totalOutflow.toLocaleString()}</div>
                <div style={statLabel}>Total Outflow</div>
              </div>
              <div style={stat}>
                <div style={statValue}>{ofxResult.stats.uniquePayees}</div>
                <div style={statLabel}>Unique Payees</div>
              </div>
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        {selectedTab === 'accounts' && isIIF && (
          <div style={card}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Account Name', 'QB Type', 'Tax Category', 'Schedule', 'Deductible'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {iifResult.accounts.map((acct, i) => {
                    const mapping = accountMappings.get(acct.name)
                    const catColor = mapping?.fortunaCategory === 'uncategorized' ? '#ef4444'
                      : mapping?.isDeductible ? '#22c55e' : 'var(--text-secondary)'
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {acct.name}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={badge('#6366f1')}>{acct.accountType}</span>
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={badge(catColor)}>{mapping?.fortunaCategory || '—'}</span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 10 }}>
                          {mapping?.scheduleRef || '—'}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          {mapping?.isDeductible ? <span style={badge('#22c55e')}>✓</span> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {selectedTab === 'transactions' && isIIF && (
          <div style={card}>
            <div style={{ overflowX: 'auto', maxHeight: 500 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Date', 'Type', 'Account', 'Name', 'Amount', 'Memo', '✓'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {iifResult.transactions.slice(0, 100).map((txn, i) => {
                    const flow = trnsTypeToFlow(txn.header.trnsType)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 10 }}>
                          {txn.header.date}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={badge(flow === 'income' ? '#22c55e' : flow === 'expense' ? '#ef4444' : '#6366f1')}>
                            {txn.header.trnsType}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{txn.header.account}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{txn.header.name || '—'}</td>
                        <td style={{
                          padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600,
                          color: txn.header.amount >= 0 ? '#22c55e' : '#ef4444',
                        }}>
                          {txn.header.amount >= 0 ? '+' : ''}{txn.header.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.header.memo || '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          {txn.balanced ? '✓' : <span style={{ color: '#ef4444' }}>✗</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {iifResult.transactions.length > 100 && (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                  Showing 100 of {iifResult.transactions.length} transactions
                </div>
              )}
            </div>
          </div>
        )}

        {selectedTab === 'transactions' && isOFX && (
          <div style={card}>
            <div style={{ overflowX: 'auto', maxHeight: 500 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Date', 'Type', 'Payee', 'Amount', 'Memo', 'Fit ID'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ofxResult.statements.flatMap(s => s.transactions).slice(0, 100).map((txn, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{txn.dateISO}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={badge(txn.amount >= 0 ? '#22c55e' : '#ef4444')}>{txn.type}</span>
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{txn.name || '—'}</td>
                      <td style={{
                        padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600,
                        color: txn.amount >= 0 ? '#22c55e' : '#ef4444',
                      }}>
                        {txn.amount >= 0 ? '+' : ''}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 10 }}>{txn.memo || '—'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>{txn.fitId?.substring(0, 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mapping Tab */}
        {selectedTab === 'mapping' && isIIF && importSummary && (
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--text-primary)' }}>
              🔗 Account → Tax Category Mapping
            </h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Fortuna automatically mapped {importSummary.accountsMapped} accounts to tax categories.
              {importSummary.unmappedAccounts.length > 0 && ` ${importSummary.unmappedAccounts.length} accounts need manual review.`}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  ✅ Income Streams ({importSummary.incomeStreamsCreated})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Revenue sources detected and mapped to Schedule C/E/B categories
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  ✅ Deductible Expenses ({importSummary.expensesCreated})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Business expenses mapped to specific Schedule C/E line items
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  ✅ Entities ({importSummary.entitiesDetected})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Business entities detected from QB Classes
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  ✅ 1099 Vendors ({importSummary.vendors1099})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Contractors flagged for 1099 reporting
                </div>
              </div>
            </div>

            {importSummary.unmappedAccounts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>
                  ⚠️ Unmapped Accounts ({importSummary.unmappedAccounts.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {importSummary.unmappedAccounts.map(a => (
                    <span key={a} style={badge('#ef4444')}>{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Complete Phase ───────────────────────────────────────────────────

  if (phase === 'complete') {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          QuickBooks Data Imported Successfully
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          {importSummary && (
            <>
              {importSummary.incomeStreamsCreated} income streams, {importSummary.expensesCreated} expenses,
              and {importSummary.entitiesDetected} entities merged into your Fortuna profile.
            </>
          )}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <button onClick={() => { setPhase('upload'); setIifResult(null); setOfxResult(null); setQifResult(null) }}
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Import Another File
          </button>
        </div>
      </div>
    )
  }

  return null
}
