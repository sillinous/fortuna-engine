/**
 * Fortuna Engine — QuickBooks + Tax Return Import View
 *
 * Supports:
 *   QuickBooks / Bank:  .iif  .qbo  .ofx  .qfx  .qif
 *   Tax returns:        .pdf  (digitally generated — TurboTax, H&R Block, IRS e-file)
 *
 * @view QuickBooksImport
 */

import * as React from 'react'
import { useState, useCallback, useRef } from 'react'
import { useFortuna, genId } from '../hooks/useFortuna'
import { parseIIF, type IIFParseResult } from '../engine/qb-iif-parser'
import { parseOFX as parseOFXFile, parseQIF, type OFXParseResult, type QIFParseResult } from '../engine/qb-ofx-parser'
import {
  mapAllAccounts, generateFortunaStatePatch,
  type AccountMapping, type QBImportSummary,
  trnsTypeToFlow,
} from '../engine/qb-coa-mapper'
import { categorizeTransactions, type CategorizedTransaction, normalizeDate } from '../engine/data-import'
import { importTaxReturn, preFillFortunaFromReturn, type ExtractedReturn } from '../engine/tax-return-import'
import type { BankTransaction, IncomeStream, BusinessExpense, FortunaState } from '../engine/storage'

type ImportPhase = 'upload' | 'preview' | 'mapping' | 'confirm' | 'complete'
type FileKind = 'iif' | 'ofx' | 'qif' | 'pdf' | ''

// ─── OFX → FortunaState helpers ──────────────────────────────────────────────

function ofxTransactionsToFortuna(
  categorized: CategorizedTransaction[],
  accountId: string,
  existingTxnKeys: Set<string>,
): {
  newIncomeStreams: Partial<IncomeStream>[]
  newExpenses: Partial<BusinessExpense>[]
  newBankTxns: BankTransaction[]
} {
  const incomeMap = new Map<string, number>()
  const expenseMap = new Map<string, { total: number; isDeductible: boolean; deductionPct: number }>()
  const newBankTxns: BankTransaction[] = []

  for (const tx of categorized) {
    const key = `${tx.date}|${tx.description}|${tx.amount}`
    if (existingTxnKeys.has(key)) continue

    // Add to audit history
    newBankTxns.push({
      id: genId(),
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: tx.autoCategory,
      isReconciled: false,
      accountName: accountId,
      entityId: 'personal',
    } as BankTransaction)

    if (tx.autoCategory === 'transfer') continue

    if (tx.isIncome) {
      const type = tx.suggestedType || 'other'
      incomeMap.set(type, (incomeMap.get(type) || 0) + tx.amount)
    } else {
      const cat = tx.suggestedExpenseCategory || 'Uncategorized'
      const existing = expenseMap.get(cat)
      const isPct50 = cat.includes('Meals')
      expenseMap.set(cat, {
        total: (existing?.total || 0) + Math.abs(tx.amount),
        isDeductible: cat !== 'Personal (Non-Deductible)' && cat !== 'Transfer (Non-Deductible)',
        deductionPct: isPct50 ? 50 : (cat.includes('Non-Deductible') ? 0 : 100),
      })
    }
  }

  const newIncomeStreams: Partial<IncomeStream>[] = Array.from(incomeMap.entries())
    .filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({
      id: genId(),
      name: `Imported ${type.charAt(0).toUpperCase() + type.slice(1)} Income`,
      type: type as IncomeStream['type'],
      annualAmount: Math.round(amount * 100) / 100,
      isActive: true,
      notes: 'OFX/QBO Import',
      entityId: 'personal',
      isTaxable: true,
    }))

  const newExpenses: Partial<BusinessExpense>[] = Array.from(expenseMap.entries())
    .filter(([, d]) => d.total > 0)
    .map(([category, d]) => ({
      id: genId(),
      category,
      description: `Imported: ${category}`,
      annualAmount: Math.round(d.total * 100) / 100,
      isDeductible: d.isDeductible,
      deductionPct: d.deductionPct,
      entityId: 'personal',
    }))

  return { newIncomeStreams, newExpenses, newBankTxns }
}

// ─── Tax Return → FortunaState helper ────────────────────────────────────────

function applyTaxReturnToState(
  result: ExtractedReturn,
  existingIncomeStreams: IncomeStream[],
): {
  profilePatch: Partial<FinancialProfile>
  newIncomeStreams: Partial<IncomeStream>[]
  newExpenses: Partial<BusinessExpense>[]
  taxYearPatch: number | null
} {
  const prefill = preFillFortunaFromReturn(result)
  const profilePatch: Partial<FinancialProfile> = {}
  const newIncomeStreams: Partial<IncomeStream>[] = []
  const newExpenses: Partial<BusinessExpense>[] = []

  if (prefill.filingStatus) profilePatch.filingStatus = prefill.filingStatus

  // W-2 wages
  if (prefill.w2Income && prefill.w2Income > 0) {
    const exists = existingIncomeStreams.some(
      s => s.type === 'w2' && Math.abs(s.annualAmount - prefill.w2Income) / prefill.w2Income < 0.01
    )
    if (!exists) {
      newIncomeStreams.push({
        id: genId(),
        name: 'W-2 Income (Tax Return)',
        type: 'w2',
        annualAmount: prefill.w2Income,
        isActive: true,
        notes: `Imported from ${result.taxYear ?? 'prior'} tax return`,
        isTaxable: true,
        entityId: 'personal',
        taxYear: result.taxYear ?? undefined,
        w2: prefill.priorYearWithholding ? { federalWithholding: prefill.priorYearWithholding } : undefined,
      })
    }
  }

  // Schedule C business income
  if (prefill.scheduleCIncome && prefill.scheduleCIncome > 0) {
    const exists = existingIncomeStreams.some(
      s => s.type === 'business' && Math.abs(s.annualAmount - prefill.scheduleCIncome) / prefill.scheduleCIncome < 0.01
    )
    if (!exists) {
      newIncomeStreams.push({
        id: genId(),
        name: 'Schedule C Business Income',
        type: 'business',
        annualAmount: prefill.scheduleCIncome,
        isActive: true,
        notes: `Imported from ${result.taxYear ?? 'prior'} tax return`,
        isTaxable: true,
        entityId: 'personal',
        taxYear: result.taxYear ?? undefined,
      })
    }
  }

  // Capital gains (net, if non-zero)
  const capGains = (prefill.shortTermCapGains || 0) + (prefill.longTermCapGains || 0)
  if (capGains !== 0) {
    newIncomeStreams.push({
      id: genId(),
      name: `Capital Gains (${result.taxYear ?? 'Prior Year'})`,
      type: 'investment',
      annualAmount: capGains,
      isActive: false, // prior year — mark inactive
      notes: `Short-term: $${prefill.shortTermCapGains ?? 0}, Long-term: $${prefill.longTermCapGains ?? 0}`,
      isTaxable: true,
      entityId: 'personal',
      taxYear: result.taxYear ?? undefined,
    })
  }

  // Schedule C expenses
  if (prefill.businessExpenses && prefill.businessExpenses > 0) {
    newExpenses.push({
      id: genId(),
      category: 'business',
      description: `Schedule C Expenses (${result.taxYear ?? 'Prior Year'} Return)`,
      annualAmount: prefill.businessExpenses,
      isDeductible: true,
      deductionPct: 100,
      entityId: 'personal',
    })
  }

  return {
    profilePatch,
    newIncomeStreams,
    newExpenses,
    taxYearPatch: result.taxYear,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuickBooksImport() {
  const { state, updateState } = useFortuna()
  const [phase, setPhase] = useState<ImportPhase>('upload')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [fileKind, setFileKind] = useState<FileKind>('')

  // Parse results
  const [iifResult, setIifResult] = useState<IIFParseResult | null>(null)
  const [ofxResult, setOfxResult] = useState<OFXParseResult | null>(null)
  const [qifResult, setQifResult] = useState<QIFParseResult | null>(null)
  const [taxResult, setTaxResult] = useState<ExtractedReturn | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  // OFX categorized cache
  const [ofxCategorized, setOfxCategorized] = useState<CategorizedTransaction[]>([])

  // IIF mapping + import
  const [accountMappings, setAccountMappings] = useState<Map<string, AccountMapping>>(new Map())
  const [importSummary, setImportSummary] = useState<QBImportSummary | null>(null)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'accounts' | 'transactions' | 'mapping'>('overview')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── File Handling ──────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setPhase('upload')
    setIifResult(null)
    setOfxResult(null)
    setQifResult(null)
    setTaxResult(null)
    setOfxCategorized([])
    setImportSummary(null)
    setFileName('')
    setFileKind('')
    setSelectedTab('overview')
  }, [])

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    setFileName(file.name)

    if (ext === 'iif') {
      const text = await file.text()
      setFileKind('iif')
      const result = parseIIF(text)
      setIifResult(result)
      const mappings = mapAllAccounts(result.accounts)
      setAccountMappings(mappings)
      const { summary } = generateFortunaStatePatch(result.accounts, result.transactions, result.vendors, result.classes)
      setImportSummary(summary)
      setPhase('preview')

    } else if (['ofx', 'qbo', 'qfx'].includes(ext)) {
      const text = await file.text()
      setFileKind('ofx')
      const result = parseOFXFile(text)
      setOfxResult(result)
      // Pre-categorize all transactions so the import button can use them
      const allTxns = result.statements.flatMap(s => s.transactions).map(tx => ({
        date: tx.dateISO,
        description: tx.name || tx.memo || `${tx.type} transaction`,
        amount: tx.amount,
        memo: tx.memo,
        fitId: tx.fitId,
      }))
      const categorized = categorizeTransactions(allTxns)
      setOfxCategorized(categorized)
      setPhase('preview')

    } else if (ext === 'qif') {
      const text = await file.text()
      setFileKind('qif')
      const result = parseQIF(text)
      setQifResult(result)
      const txns = result.transactions.map(tx => ({
        date: normalizeDate(tx.date),
        description: tx.payee || tx.memo || 'QIF Transaction',
        amount: tx.amount,
        category: tx.category,
        memo: tx.memo,
      }))
      const categorized = categorizeTransactions(txns)
      setOfxCategorized(categorized) // reuse same state slot
      setPhase('preview')

    } else if (ext === 'pdf') {
      setFileKind('pdf')
      setPdfLoading(true)
      setPhase('preview')
      try {
        const result = await importTaxReturn(file)
        setTaxResult(result)
      } catch (err) {
        setTaxResult({
          taxYear: null, filingStatus: null, forms: [],
          summary: {
            grossIncome: null, agi: null, taxableIncome: null, totalTax: null,
            totalPayments: null, refundOrOwed: null, filingStatus: null,
            businessIncome: null, businessExpenses: null, netBusinessProfit: null,
            shortTermGainLoss: null, longTermGainLoss: null,
            selfEmploymentTax: null, wagesTotal: null, federalWithheld: null,
            estimatedMarginalRate: null, estimatedEffectiveRate: null,
          },
          rawText: '',
          confidence: 0,
          warnings: [`PDF processing failed: ${err instanceof Error ? err.message : String(err)}`],
        })
      } finally {
        setPdfLoading(false)
      }

    } else {
      alert(`Unsupported file type: .${ext}\n\nSupported: .iif, .qbo, .ofx, .qfx, .qif, .pdf`)
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

  // ─── IIF Import ─────────────────────────────────────────────────────────────

  const executeIIFImport = useCallback(() => {
    if (!iifResult) return
    const { patch } = generateFortunaStatePatch(
      iifResult.accounts, iifResult.transactions, iifResult.vendors, iifResult.classes,
    )
    updateState((prev: FortunaState) => ({
      ...prev,
      incomeStreams: [...(prev.incomeStreams || []), ...(patch.incomeStreams || [])],
      expenses: [...(prev.expenses || []), ...(patch.expenses || [])],
      entities: [...(prev.entities || []), ...(patch.entities || [])],
      auditHistory: [...(prev.auditHistory || []), ...(patch.auditHistory || [])],
    }))
    setPhase('complete')
  }, [iifResult, updateState])

  // ─── OFX / QIF Import ───────────────────────────────────────────────────────

  const executeOFXImport = useCallback(() => {
    if (ofxCategorized.length === 0) return

    // Build dedup key set from existing audit history
    const existingKeys = new Set<string>(
      (state.auditHistory || []).map((t: BankTransaction) => `${normalizeDate(t.date)}|${t.description}|${t.amount}`)
    )

    const accountId = ofxResult
      ? (ofxResult.statements[0]?.bankAccount?.accountId ||
        ofxResult.statements[0]?.creditCardAccount?.accountId ||
        'bank')
      : (qifResult?.accountName || 'bank')

    const { newIncomeStreams, newExpenses, newBankTxns } = ofxTransactionsToFortuna(
      ofxCategorized, accountId, existingKeys,
    )

    // Deduplicate income streams vs existing (by type + amount within 1%)
    const filteredIncome = newIncomeStreams.filter((ns: Partial<IncomeStream>) => {
      if (!ns.annualAmount || ns.annualAmount <= 0) return false
      return !state.incomeStreams.some(
        (ex: IncomeStream) => ex.type === ns.type &&
          Math.abs(ex.annualAmount - ns.annualAmount!) / Math.max(1, ns.annualAmount!) < 0.01
      )
    })

    const filteredExpenses = newExpenses.filter((ne: Partial<BusinessExpense>) => {
      if (!ne.annualAmount || ne.annualAmount <= 0) return false
      return !state.expenses.some(
        (ex: BusinessExpense) => ex.category === ne.category &&
          Math.abs(ex.annualAmount - ne.annualAmount!) / Math.max(1, ne.annualAmount!) < 0.01
      )
    })

    updateState((prev: FortunaState) => ({
      ...prev,
      incomeStreams: [...prev.incomeStreams, ...filteredIncome as IncomeStream[]],
      expenses: [...prev.expenses, ...filteredExpenses as BusinessExpense[]],
      auditHistory: [...(prev.auditHistory || []), ...newBankTxns],
    }))

    setPhase('complete')
  }, [ofxCategorized, ofxResult, qifResult, state, updateState])

  // ─── Tax PDF Apply ───────────────────────────────────────────────────────────

  const applyTaxReturn = useCallback(() => {
    if (!taxResult) return

    const { profilePatch, newIncomeStreams, newExpenses, taxYearPatch } =
      applyTaxReturnToState(taxResult, state.incomeStreams)

    updateState((prev: FortunaState) => {
      const newProfile = { ...prev.profile, ...profilePatch }
      const newHousehold = profilePatch.filingStatus
        ? { ...prev.household, filingStatus: profilePatch.filingStatus as any }
        : prev.household

      return {
        ...prev,
        profile: newProfile,
        household: newHousehold,
        taxYear: taxYearPatch ?? prev.taxYear,
        incomeStreams: [...prev.incomeStreams, ...newIncomeStreams as IncomeStream[]],
        expenses: [...prev.expenses, ...newExpenses as BusinessExpense[]],
      }
    })

    setPhase('complete')
  }, [taxResult, state.incomeStreams, updateState])

  // ─── Styles ──────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', borderRadius: 12,
    border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 16,
  }
  const stat: React.CSSProperties = { textAlign: 'center' as const, padding: 12 }
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
  const importBtn: React.CSSProperties = {
    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none',
    color: '#fff', cursor: 'pointer',
  }

  // ─── Upload Phase ─────────────────────────────────────────────────────────────

  if (phase === 'upload') {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
          📗 QuickBooks & Tax Return Import
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          Import QuickBooks data or a tax return PDF directly into Fortuna. All formats auto-detected.
        </p>

        {/* Drop Zone */}
        <div
          onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }}
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
            Drop your file here
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            QuickBooks export or tax return PDF — or click to browse
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[
              { ext: '.iif', label: 'IIF', desc: 'QB Desktop full export' },
              { ext: '.qbo', label: 'QBO', desc: 'QB Online / Web Connect' },
              { ext: '.ofx', label: 'OFX', desc: 'Open Financial Exchange' },
              { ext: '.qfx', label: 'QFX', desc: 'Quicken Web Connect' },
              { ext: '.qif', label: 'QIF', desc: 'Quicken legacy format' },
              { ext: '.pdf', label: 'PDF', desc: 'Tax return (1040, W-2, Sched C…)' },
            ].map(f => (
              <div key={f.ext} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 10,
                background: 'var(--bg-hover)', color: 'var(--text-secondary)',
              }}>
                <span style={{ fontWeight: 700, color: f.ext === '.pdf' ? '#a78bfa' : 'var(--accent)' }}>{f.ext}</span> — {f.desc}
              </div>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".iif,.qbo,.ofx,.qfx,.qif,.pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* How-to Guide */}
        <div style={{ ...card, marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--text-primary)' }}>
            How to export your data
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>QuickBooks Desktop (.iif)</div>
              <div>File → Utilities → Export → IIF Files</div>
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
                Richest QB format — includes chart of accounts, classes, and all transactions mapped to tax categories
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>QuickBooks Online (.qbo/.ofx)</div>
              <div>Banking → Download transactions → QBO format</div>
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
                Bank transactions with auto-categorization for income & deductible expenses
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Tax Return (.pdf)</div>
              <div>From TurboTax, H&R Block, or IRS — download the PDF version of your filed return</div>
              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>
                Extracts 1040, W-2, Schedule C/D/SE and populates your profile instantly
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── PDF Loading Spinner ──────────────────────────────────────────────────────

  if (phase === 'preview' && fileKind === 'pdf' && pdfLoading) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Reading {fileName}…
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Loading PDF.js and extracting tax form data
        </div>
      </div>
    )
  }

  // ─── Tax Return Preview ───────────────────────────────────────────────────────

  if (phase === 'preview' && fileKind === 'pdf' && taxResult) {
    const s = taxResult.summary
    const canApply = taxResult.confidence >= 40
    const confidenceColor = taxResult.confidence >= 70 ? '#22c55e' : taxResult.confidence >= 40 ? '#f59e0b' : '#ef4444'

    return (
      <div style={{ padding: '24px 32px', maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              📄 {fileName}
            </h1>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Tax Year: <strong>{taxResult.taxYear ?? 'Unknown'}</strong> ·
              Filing Status: <strong>{taxResult.filingStatus ?? 'Unknown'}</strong> ·
              Forms detected: <strong>{taxResult.forms.map(f => f.formType.replace('_', ' ').toUpperCase()).join(', ') || 'None'}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={reset}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← New File
            </button>
            <button
              onClick={applyTaxReturn}
              disabled={!canApply}
              style={{
                ...importBtn,
                opacity: canApply ? 1 : 0.4,
                cursor: canApply ? 'pointer' : 'not-allowed',
              }}
              title={!canApply ? 'Confidence too low to auto-apply — check warnings' : ''}
            >
              ✓ Apply to Profile
            </button>
          </div>
        </div>

        {/* Confidence */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: confidenceColor }}>
            {taxResult.confidence}%
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Extraction Confidence</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {taxResult.confidence >= 70 ? 'High confidence — safe to apply' :
                taxResult.confidence >= 40 ? 'Medium confidence — review values before applying' :
                  'Low confidence — PDF may be scanned or handwritten'}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)' }}>
              <div style={{ height: '100%', width: `${taxResult.confidence}%`, borderRadius: 3, background: confidenceColor, transition: 'width 0.5s' }} />
            </div>
          </div>
        </div>

        {/* Extracted values grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Gross Income', value: s.grossIncome },
            { label: 'AGI', value: s.agi },
            { label: 'Taxable Income', value: s.taxableIncome },
            { label: 'Total Tax', value: s.totalTax },
            { label: 'W-2 Wages', value: s.wagesTotal },
            { label: 'Business Income', value: s.netBusinessProfit },
            { label: 'Business Expenses', value: s.businessExpenses },
            { label: 'SE Tax', value: s.selfEmploymentTax },
            { label: 'Fed Withheld', value: s.federalWithheld },
            { label: 'Refund / Owed', value: s.refundOrOwed },
          ].map(row => row.value !== null && row.value !== undefined ? (
            <div key={row.label} style={{ ...card, ...stat, marginBottom: 0 }}>
              <div style={statValue}>${(row.value as number).toLocaleString()}</div>
              <div style={statLabel}>{row.label}</div>
            </div>
          ) : null)}
        </div>

        {/* What will be imported */}
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px', color: 'var(--text-primary)' }}>
            📋 What will be applied to your profile
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            {taxResult.filingStatus && <div>✅ Filing status → <strong>{taxResult.filingStatus}</strong></div>}
            {s.wagesTotal ? <div>✅ New income stream: <strong>W-2 Income</strong> — ${s.wagesTotal.toLocaleString()}/yr</div> : null}
            {s.netBusinessProfit && s.netBusinessProfit > 0 ? <div>✅ New income stream: <strong>Schedule C Business</strong> — ${s.netBusinessProfit.toLocaleString()}/yr</div> : null}
            {(s.shortTermGainLoss || s.longTermGainLoss) ? <div>✅ New income stream: <strong>Capital Gains</strong> (prior year, inactive)</div> : null}
            {s.businessExpenses && s.businessExpenses > 0 ? <div>✅ New expense: <strong>Schedule C Expenses</strong> — ${s.businessExpenses.toLocaleString()}/yr</div> : null}
            {taxResult.taxYear ? <div>✅ Tax year updated to <strong>{taxResult.taxYear}</strong></div> : null}
            {!taxResult.filingStatus && !s.wagesTotal && !s.netBusinessProfit && (
              <div style={{ color: 'var(--text-muted)' }}>— No actionable data extracted. Check warnings below.</div>
            )}
          </div>
        </div>

        {/* Warnings */}
        {taxResult.warnings.length > 0 && (
          <div style={{ ...card, background: 'rgba(245, 158, 11, 0.06)' }}>
            {taxResult.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#f59e0b', marginBottom: 4 }}>⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── OFX/QIF Preview ─────────────────────────────────────────────────────────

  if (phase === 'preview' && (fileKind === 'ofx' || fileKind === 'qif')) {
    const txns = ofxCategorized
    const income = txns.filter(t => t.isIncome)
    const expenses = txns.filter(t => !t.isIncome && t.autoCategory !== 'transfer')
    const totalIncome = income.reduce((s, t) => s + t.amount, 0)
    const totalExpenses = Math.abs(expenses.reduce((s, t) => s + t.amount, 0))
    const unclassified = txns.filter(t => t.confidence < 0.5 && t.autoCategory !== 'transfer').length

    return (
      <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              💳 {fileName}
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {fileKind === 'ofx' ? `${ofxResult?.statements[0]?.flavor?.toUpperCase() || 'OFX'} File` : 'QIF File'} — {txns.length} transactions
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← New File
            </button>
            <button onClick={executeOFXImport} style={importBtn}>
              ✓ Import into Fortuna
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Transactions', value: txns.length, color: undefined },
            { label: 'Total Income', value: `$${Math.round(totalIncome).toLocaleString()}`, color: '#22c55e' },
            { label: 'Total Expenses', value: `$${Math.round(totalExpenses).toLocaleString()}`, color: '#ef4444' },
            { label: 'Unclassified', value: unclassified, color: unclassified > 10 ? '#f59e0b' : undefined },
          ].map(s => (
            <div key={s.label} style={{ ...card, ...stat, marginBottom: 0 }}>
              <div style={{ ...statValue, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
              <div style={statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* What will be imported */}
        <div style={card}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px', color: 'var(--text-primary)' }}>
            📋 What will be imported
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>✅ {income.length} income transactions → aggregated income streams</div>
            <div>✅ {expenses.length} expense transactions → categorized expense entries</div>
            <div>✅ All {txns.length} transactions → audit history (bank ledger)</div>
            <div>🔒 Duplicate transactions will be skipped automatically</div>
          </div>
        </div>

        {/* Transaction preview table */}
        <div style={card}>
          <div style={{ overflowX: 'auto', maxHeight: 400 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Date', 'Description', 'Amount', 'Category', 'Confidence'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.slice(0, 100).map((tx, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>{tx.date}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: tx.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={badge(tx.isIncome ? '#22c55e' : tx.autoCategory === 'transfer' ? '#6366f1' : '#f59e0b')}>
                        {tx.autoCategory.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ height: 6, width: 60, background: 'var(--bg-hover)', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${Math.round((tx.confidence || 0) * 100)}%`, background: (tx.confidence || 0) > 0.7 ? '#22c55e' : '#f59e0b', borderRadius: 3 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {txns.length > 100 && (
              <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                Showing 100 of {txns.length} transactions
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── IIF Preview ─────────────────────────────────────────────────────────────

  if (phase === 'preview' && fileKind === 'iif' && iifResult) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              📗 {fileName}
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              IIF File — {iifResult.stats.transactionCount} transactions, {iifResult.stats.accountCount} accounts
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← New File
            </button>
            <button onClick={executeIIFImport} style={importBtn}>
              ✓ Import into Fortuna
            </button>
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
        {selectedTab === 'overview' && (
          <>
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

            {importSummary && (
              <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--text-primary)' }}>📊 Tax Impact Preview</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div style={stat}>
                    <div style={{ ...statValue, color: '#22c55e' }}>${importSummary.taxImpact.estimatedGrossIncome.toLocaleString()}</div>
                    <div style={statLabel}>Gross Income Detected</div>
                  </div>
                  <div style={stat}>
                    <div style={{ ...statValue, color: '#f59e0b' }}>${importSummary.taxImpact.estimatedDeductions.toLocaleString()}</div>
                    <div style={statLabel}>Deductions Detected</div>
                  </div>
                  <div style={stat}>
                    <div style={statValue}>${importSummary.taxImpact.estimatedTaxableIncome.toLocaleString()}</div>
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

        {/* Accounts Tab */}
        {selectedTab === 'accounts' && (
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
                        <td style={{ padding: '6px 10px', fontWeight: 500, color: 'var(--text-primary)' }}>{acct.name}</td>
                        <td style={{ padding: '6px 10px' }}><span style={badge('#6366f1')}>{acct.accountType}</span></td>
                        <td style={{ padding: '6px 10px' }}><span style={badge(catColor)}>{mapping?.fortunaCategory || '—'}</span></td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 10 }}>{mapping?.scheduleRef || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>{mapping?.isDeductible ? <span style={badge('#22c55e')}>✓</span> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {selectedTab === 'transactions' && (
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
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 10 }}>{txn.header.date}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={badge(flow === 'income' ? '#22c55e' : flow === 'expense' ? '#ef4444' : '#6366f1')}>{txn.header.trnsType}</span>
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{txn.header.account}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{txn.header.name || '—'}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: txn.header.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                          {txn.header.amount >= 0 ? '+' : ''}{txn.header.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.header.memo || '—'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>{txn.balanced ? '✓' : <span style={{ color: '#ef4444' }}>✗</span>}</td>
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

        {/* Mapping Tab */}
        {selectedTab === 'mapping' && importSummary && (
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--text-primary)' }}>🔗 Account → Tax Category Mapping</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Fortuna automatically mapped {importSummary.accountsMapped} accounts to tax categories.
              {importSummary.unmappedAccounts.length > 0 && ` ${importSummary.unmappedAccounts.length} accounts need manual review.`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>✅ Income Streams ({importSummary.incomeStreamsCreated})</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Revenue sources mapped to Schedule C/E/B categories</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>✅ Deductible Expenses ({importSummary.expensesCreated})</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Business expenses mapped to specific Schedule C/E line items</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>✅ Entities ({importSummary.entitiesDetected})</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Business entities detected from QB Classes</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>✅ 1099 Vendors ({importSummary.vendors1099})</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Contractors flagged for 1099 reporting</div>
              </div>
            </div>
            {importSummary.unmappedAccounts.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>⚠️ Unmapped Accounts ({importSummary.unmappedAccounts.length})</div>
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

  // ─── Complete Phase ───────────────────────────────────────────────────────────

  if (phase === 'complete') {
    const isIIF = fileKind === 'iif'
    const isPDF = fileKind === 'pdf'
    const isOFX = fileKind === 'ofx' || fileKind === 'qif'

    return (
      <div style={{ padding: '24px 32px', maxWidth: 900, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          {isPDF ? 'Tax Return Applied to Profile' : 'Data Imported Successfully'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          {isIIF && importSummary && (
            <>{importSummary.incomeStreamsCreated} income streams, {importSummary.expensesCreated} expenses, and {importSummary.entitiesDetected} entities merged into your Fortuna profile.</>
          )}
          {isOFX && <>Bank transactions categorized and merged into income streams, expenses, and audit history. Duplicates were skipped.</>}
          {isPDF && taxResult && (
            <>Filing status, income streams, and expenses extracted from your {taxResult.taxYear ?? ''} return and applied to your profile.</>
          )}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <button onClick={reset}
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Import Another File
          </button>
        </div>
      </div>
    )
  }

  return null
}
