/**
 * Fortuna Engine — Transaction Review View
 *
 * Tax-enriched transaction review for end users:
 *   - View all imported transactions with enrichment details
 *   - Filter by category, deductibility, date, amount, review status
 *   - Override/confirm tax categorizations
 *   - Bulk approve or re-categorize
 *   - Deduction discovery dashboard
 *   - Recurring stream summary
 *   - Export reviewed transactions
 *
 * @module TransactionReview
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import type { BankTransaction, FortunaState } from '../engine/storage'

// ─── Local enrichment type (compatible with bridge output) ────────────────

interface ReviewableTransaction extends BankTransaction {
  enrichment?: {
    fortunaCategory: string
    scheduleRef?: string
    isDeductible: boolean
    deductionPct: number
    isTaxPayment: boolean
    is1099Reportable: boolean
    confidence: number
    needsReview: boolean
    merchantName?: string
  }
  userOverride?: {
    category: string
    isDeductible: boolean
    deductionPct: number
    approved: boolean
  }
}

type FilterMode = 'all' | 'needs_review' | 'deductible' | 'tax_payments' | 'high_value' | 'approved'
type SortField = 'date' | 'amount' | 'category' | 'confidence'

// ─── Tax Categories for Override ──────────────────────────────────────────

const TAX_CATEGORIES = [
  { value: 'advertising', label: 'Advertising (Sch C L8)', deductible: true, pct: 100 },
  { value: 'auto', label: 'Auto / Vehicle (Sch C L9)', deductible: true, pct: 100 },
  { value: 'bank_fees', label: 'Bank Fees (Sch C L27a)', deductible: true, pct: 100 },
  { value: 'charitable', label: 'Charitable (Sch A L12)', deductible: true, pct: 100 },
  { value: 'consulting', label: 'Consulting (Sch C L17)', deductible: true, pct: 100 },
  { value: 'education', label: 'Education (Sch C L27a)', deductible: true, pct: 100 },
  { value: 'health_insurance', label: 'Health Insurance', deductible: true, pct: 100 },
  { value: 'hsa', label: 'HSA Contribution', deductible: true, pct: 100 },
  { value: 'insurance', label: 'Insurance (Sch C L15)', deductible: true, pct: 100 },
  { value: 'legal', label: 'Legal / Professional (Sch C L17)', deductible: true, pct: 100 },
  { value: 'meals', label: 'Meals (Sch C L24b — 50%)', deductible: true, pct: 50 },
  { value: 'medical', label: 'Medical (Sch A L1)', deductible: true, pct: 100 },
  { value: 'mortgage_interest', label: 'Mortgage Interest (Sch A L8a)', deductible: true, pct: 100 },
  { value: 'office_supplies', label: 'Office Supplies (Sch C L18)', deductible: true, pct: 100 },
  { value: 'rent', label: 'Rent (Sch C L20b)', deductible: true, pct: 100 },
  { value: 'retirement', label: 'Retirement Contribution', deductible: true, pct: 100 },
  { value: 'software', label: 'Software / Tech (Sch C L27a)', deductible: true, pct: 100 },
  { value: 'travel', label: 'Travel (Sch C L24a)', deductible: true, pct: 100 },
  { value: 'utilities', label: 'Utilities (Sch C L25)', deductible: true, pct: 100 },
  { value: 'income', label: 'Income (not deductible)', deductible: false, pct: 0 },
  { value: 'transfer', label: 'Transfer (not deductible)', deductible: false, pct: 0 },
  { value: 'personal', label: 'Personal (not deductible)', deductible: false, pct: 0 },
  { value: 'tax_payment', label: 'Tax Payment', deductible: false, pct: 0 },
  { value: 'uncategorized', label: 'Uncategorized', deductible: false, pct: 0 },
]

export default function TransactionReview() {
  const { state, updateState } = useFortuna()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [showStats, setShowStats] = useState(true)

  // Build reviewable transactions from state
  const transactions: ReviewableTransaction[] = useMemo(() => {
    return (state.bankTransactions || []).map(txn => ({
      ...txn,
      enrichment: (txn as any).enrichment || {
        fortunaCategory: txn.category || 'uncategorized',
        isDeductible: false,
        deductionPct: 0,
        isTaxPayment: false,
        is1099Reportable: false,
        confidence: 0.5,
        needsReview: !txn.isReconciled,
      },
      userOverride: (txn as any).userOverride,
    }))
  }, [state.bankTransactions])

  // Stats
  const stats = useMemo(() => {
    let deductibleCount = 0, deductibleAmount = 0
    let taxPayments = 0, taxPaymentAmount = 0
    let needsReview = 0, approved = 0
    const byCategory: Record<string, { count: number; amount: number }> = {}

    for (const txn of transactions) {
      const cat = txn.userOverride?.category || txn.enrichment?.fortunaCategory || 'uncategorized'
      if (!byCategory[cat]) byCategory[cat] = { count: 0, amount: 0 }
      byCategory[cat].count++
      byCategory[cat].amount += Math.abs(txn.amount)

      const isDeductible = txn.userOverride?.isDeductible ?? txn.enrichment?.isDeductible
      if (isDeductible && txn.amount < 0) {
        deductibleCount++
        const pct = txn.userOverride?.deductionPct ?? txn.enrichment?.deductionPct ?? 100
        deductibleAmount += Math.abs(txn.amount) * (pct / 100)
      }
      if (txn.enrichment?.isTaxPayment) { taxPayments++; taxPaymentAmount += Math.abs(txn.amount) }
      if (txn.enrichment?.needsReview && !txn.userOverride?.approved) needsReview++
      if (txn.userOverride?.approved || txn.isReconciled) approved++
    }

    return {
      total: transactions.length, deductibleCount, deductibleAmount: Math.round(deductibleAmount),
      taxPayments, taxPaymentAmount: Math.round(taxPaymentAmount),
      needsReview, approved,
      topCategories: Object.entries(byCategory)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 8),
    }
  }, [transactions])

  // Filter + sort + search
  const filtered = useMemo(() => {
    let result = [...transactions]

    // Filter
    switch (filter) {
      case 'needs_review': result = result.filter(t => (t.enrichment?.needsReview && !t.userOverride?.approved)); break
      case 'deductible': result = result.filter(t => t.userOverride?.isDeductible ?? t.enrichment?.isDeductible); break
      case 'tax_payments': result = result.filter(t => t.enrichment?.isTaxPayment); break
      case 'high_value': result = result.filter(t => Math.abs(t.amount) >= 500); break
      case 'approved': result = result.filter(t => t.userOverride?.approved || t.isReconciled); break
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.description.toLowerCase().includes(q) ||
        (t.enrichment?.merchantName || '').toLowerCase().includes(q) ||
        (t.enrichment?.fortunaCategory || '').includes(q),
      )
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'date': cmp = a.date.localeCompare(b.date); break
        case 'amount': cmp = Math.abs(a.amount) - Math.abs(b.amount); break
        case 'category': cmp = (a.enrichment?.fortunaCategory || '').localeCompare(b.enrichment?.fortunaCategory || ''); break
        case 'confidence': cmp = (a.enrichment?.confidence || 0) - (b.enrichment?.confidence || 0); break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [transactions, filter, sortField, sortAsc, searchQuery])

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleOverride = useCallback((txnId: string, category: string) => {
    const catInfo = TAX_CATEGORIES.find(c => c.value === category)
    updateState((prev: FortunaState) => ({
      ...prev,
      bankTransactions: (prev.bankTransactions || []).map(t =>
        t.id === txnId ? {
          ...t,
          category,
          isReconciled: true,
          userOverride: {
            category,
            isDeductible: catInfo?.deductible || false,
            deductionPct: catInfo?.pct || 0,
            approved: true,
          },
        } as any : t,
      ),
    }))
    setEditingId(null)
  }, [updateState])

  const handleBulkApprove = useCallback(() => {
    if (selectedIds.size === 0) return
    updateState((prev: FortunaState) => ({
      ...prev,
      bankTransactions: (prev.bankTransactions || []).map(t =>
        selectedIds.has(t.id)
          ? { ...t, isReconciled: true, userOverride: { ...((t as any).userOverride || {}), approved: true } } as any
          : t,
      ),
    }))
    setSelectedIds(new Set())
  }, [selectedIds, updateState])

  const handleBulkCategorize = useCallback(() => {
    if (selectedIds.size === 0 || !bulkCategory) return
    const catInfo = TAX_CATEGORIES.find(c => c.value === bulkCategory)
    updateState((prev: FortunaState) => ({
      ...prev,
      bankTransactions: (prev.bankTransactions || []).map(t =>
        selectedIds.has(t.id) ? {
          ...t, category: bulkCategory, isReconciled: true,
          userOverride: { category: bulkCategory, isDeductible: catInfo?.deductible || false, deductionPct: catInfo?.pct || 0, approved: true },
        } as any : t,
      ),
    }))
    setSelectedIds(new Set())
    setBulkCategory('')
  }, [selectedIds, bulkCategory, updateState])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  // ── Styles ────────────────────────────────────────────────────────────

  const card: React.CSSProperties = { background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a4a', padding: 20 }
  const btn = (color: string, small = false): React.CSSProperties => ({
    background: color, color: '#fff', border: 'none', borderRadius: 8,
    padding: small ? '5px 10px' : '8px 16px', cursor: 'pointer',
    fontSize: small ? 11 : 13, fontWeight: 600,
  })
  const filterBtn = (active: boolean): React.CSSProperties => ({
    ...btn(active ? '#6366f1' : '#2a2a4a', true), opacity: active ? 1 : 0.7,
  })
  const badge = (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 7px', borderRadius: 10,
    fontSize: 10, fontWeight: 600, color: '#fff', background: color,
  })
  const thStyle: React.CSSProperties = {
    padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5,
    cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid #2a2a4a',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #1a1a2e',
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, color: '#e5e7eb' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#fff' }}>Transaction Review</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9ca3af' }}>
            Review tax categorizations, confirm deductions, and approve transactions
          </p>
        </div>
        <button style={btn(showStats ? '#4b5563' : '#6366f1', true)} onClick={() => setShowStats(!showStats)}>
          {showStats ? 'Hide Stats' : 'Show Stats'}
        </button>
      </div>

      {/* Stats Dashboard */}
      {showStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', value: stats.total, color: '#e5e7eb' },
            { label: 'Deductible', value: `$${stats.deductibleAmount.toLocaleString()}`, color: '#22c55e' },
            { label: 'Tax Payments', value: `$${stats.taxPaymentAmount.toLocaleString()}`, color: '#f59e0b' },
            { label: 'Needs Review', value: stats.needsReview, color: stats.needsReview > 0 ? '#ef4444' : '#22c55e' },
            { label: 'Approved', value: stats.approved, color: '#22c55e' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#1a1a2e', borderRadius: 10, border: '1px solid #2a2a4a', padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top Categories */}
      {showStats && stats.topCategories.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#9ca3af' }}>Top Categories</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.topCategories.map(([cat, { count, amount }]) => {
              const catInfo = TAX_CATEGORIES.find(c => c.value === cat)
              return (
                <div key={cat} style={{
                  padding: '6px 12px', background: '#0d0d1a', borderRadius: 8, border: '1px solid #2a2a4a',
                  fontSize: 12, display: 'flex', gap: 6, alignItems: 'center',
                }}>
                  <span style={{ color: catInfo?.deductible ? '#22c55e' : '#6b7280' }}>
                    {catInfo?.deductible ? '✓' : '○'}
                  </span>
                  <span style={{ color: '#e5e7eb', fontWeight: 500 }}>{cat.replace(/_/g, ' ')}</span>
                  <span style={{ color: '#6b7280' }}>{count}</span>
                  <span style={{ color: '#9ca3af', fontWeight: 600 }}>${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters + Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            ['all', 'All'],
            ['needs_review', `Review (${stats.needsReview})`],
            ['deductible', 'Deductible'],
            ['tax_payments', 'Tax Payments'],
            ['high_value', '$500+'],
            ['approved', 'Approved'],
          ] as [FilterMode, string][]).map(([f, label]) => (
            <button key={f} style={filterBtn(filter === f)} onClick={() => setFilter(f)}>{label}</button>
          ))}
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search transactions..."
          style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid #3a3a5a',
            background: '#0d0d1a', color: '#e5e7eb', fontSize: 13, width: 220, outline: 'none',
          }}
        />
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: '8px 16px', background: '#1a1a3e', borderRadius: 10, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #6366f1',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#a5b4fc' }}>{selectedIds.size} selected</span>
          <button style={btn('#22c55e', true)} onClick={handleBulkApprove}>✓ Approve All</button>
          <select
            value={bulkCategory}
            onChange={e => setBulkCategory(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 6, background: '#0d0d1a', color: '#e5e7eb', border: '1px solid #3a3a5a', fontSize: 12 }}
          >
            <option value="">Categorize as...</option>
            {TAX_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {bulkCategory && <button style={btn('#6366f1', true)} onClick={handleBulkCategorize}>Apply</button>}
          <button style={btn('#4b5563', true)} onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {/* Transaction Table */}
      {filtered.length > 0 ? (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0d0d1a' }}>
                  <th style={{ ...thStyle, width: 30 }}>
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th style={thStyle} onClick={() => handleSort('date')}>Date {sortField === 'date' ? (sortAsc ? '↑' : '↓') : ''}</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle} onClick={() => handleSort('category')}>Category {sortField === 'category' ? (sortAsc ? '↑' : '↓') : ''}</th>
                  <th style={thStyle} onClick={() => handleSort('amount')}>Amount {sortField === 'amount' ? (sortAsc ? '↑' : '↓') : ''}</th>
                  <th style={thStyle}>Tax Status</th>
                  <th style={{ ...thStyle, width: 60 }} onClick={() => handleSort('confidence')}>Conf</th>
                  <th style={{ ...thStyle, width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map(txn => {
                  const cat = txn.userOverride?.category || txn.enrichment?.fortunaCategory || 'uncategorized'
                  const isDeductible = txn.userOverride?.isDeductible ?? txn.enrichment?.isDeductible
                  const needsReview = txn.enrichment?.needsReview && !txn.userOverride?.approved
                  const isApproved = txn.userOverride?.approved || txn.isReconciled
                  const confidence = txn.enrichment?.confidence || 0

                  return (
                    <tr key={txn.id} style={{
                      background: selectedIds.has(txn.id) ? 'rgba(99,102,241,0.08)' : needsReview ? 'rgba(245,158,11,0.04)' : 'transparent',
                    }}>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={selectedIds.has(txn.id)} onChange={() => toggleSelect(txn.id)} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12, color: '#9ca3af' }}>{txn.date}</td>
                      <td style={{ ...tdStyle, maxWidth: 260 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {txn.enrichment?.merchantName || txn.description}
                        </div>
                        {txn.accountName && <div style={{ fontSize: 10, color: '#4b5563' }}>{txn.accountName}</div>}
                      </td>
                      <td style={tdStyle}>
                        {editingId === txn.id ? (
                          <select
                            value={editCategory || cat}
                            onChange={e => { setEditCategory(e.target.value); handleOverride(txn.id, e.target.value) }}
                            style={{ padding: '3px 6px', borderRadius: 6, background: '#0d0d1a', color: '#e5e7eb', border: '1px solid #6366f1', fontSize: 11 }}
                            autoFocus
                            onBlur={() => setEditingId(null)}
                          >
                            {TAX_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        ) : (
                          <span
                            style={{ ...badge(isDeductible ? '#166534' : '#4b5563'), cursor: 'pointer' }}
                            onClick={() => { setEditingId(txn.id); setEditCategory(cat) }}
                            title="Click to change category"
                          >
                            {cat.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td style={{
                        ...tdStyle, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: txn.amount >= 0 ? '#22c55e' : '#ef4444',
                      }}>
                        {txn.amount >= 0 ? '+' : ''}{txn.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {isDeductible && <span style={badge('#22c55e')}>DEDUCT</span>}
                          {txn.enrichment?.isTaxPayment && <span style={badge('#f59e0b')}>TAX PMT</span>}
                          {txn.enrichment?.is1099Reportable && <span style={badge('#8b5cf6')}>1099</span>}
                          {isApproved && <span style={badge('#3b82f6')}>✓</span>}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%', display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                          background: confidence >= 0.8 ? '#166534' : confidence >= 0.6 ? '#854d0e' : '#7f1d1d',
                          color: '#fff',
                        }}>
                          {Math.round(confidence * 100)}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {!isApproved ? (
                          <button
                            style={btn('#22c55e', true)}
                            onClick={() => handleOverride(txn.id, cat)}
                          >✓</button>
                        ) : (
                          <span style={{ fontSize: 11, color: '#22c55e' }}>Done</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 && (
            <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
              Showing 200 of {filtered.length} transactions
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <h3 style={{ color: '#fff', margin: '0 0 8px' }}>No transactions to review</h3>
          <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 400, margin: '0 auto' }}>
            {transactions.length === 0
              ? 'Connect a bank account or import transactions to start reviewing tax categorizations.'
              : `No transactions match the "${filter}" filter. Try a different filter.`}
          </p>
        </div>
      )}

      {/* Footer: Deduction summary */}
      {stats.deductibleAmount > 0 && (
        <div style={{ marginTop: 16, padding: '12px 20px', background: 'rgba(34,197,94,0.08)', borderRadius: 10, border: '1px solid #22c55e33' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                💰 Identified Deductions: ${stats.deductibleAmount.toLocaleString()}
              </span>
              <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                across {stats.deductibleCount} transactions
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Estimated tax savings: ~${Math.round(stats.deductibleAmount * 0.25).toLocaleString()} (at 25% marginal rate)
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
