import { useState, useCallback, useRef, useMemo } from 'react'
import { useFortuna, genId } from '../hooks/useFortuna'
import { importFromFile, type ImportResult, type CategorizedTransaction } from '../engine/data-import'
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, RefreshCw } from 'lucide-react'

type ImportStage = 'upload' | 'review' | 'confirm' | 'done'

export function DataImport() {
  const { state, updateState } = useFortuna()
  const [stage, setStage] = useState<ImportStage>('upload')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set())
  const [importedCount, setImportedCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  
  const handleFile = useCallback((file: File) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (!content) {
        setError('Could not read file')
        return
      }
      
      const importResult = importFromFile(content)
      if ('error' in importResult) {
        setError(importResult.error)
        return
      }
      
      setResult(importResult)
      // Pre-select all business transactions
      const selected = new Set<number>()
      importResult.transactions.forEach((tx, i) => {
        if (tx.autoCategory !== 'transfer' && tx.autoCategory !== 'personal' && tx.confidence > 0.3) {
          selected.add(i)
        }
      })
      setSelectedTransactions(selected)
      setStage('review')
    }
    reader.readAsText(file)
  }, [])
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])
  
  const handleImport = useCallback(() => {
    if (!result) return
    
    updateState(prev => {
      const newIncome = [...prev.incomeStreams]
      const newExpenses = [...prev.expenses]
      
      // Add suggested income streams
      for (const stream of result.suggestedIncomeStreams) {
        if (stream.annualAmount && stream.annualAmount > 0) {
          newIncome.push({
            id: genId(),
            name: stream.name || 'Imported Income',
            type: stream.type || 'other',
            annualAmount: stream.annualAmount,
            isActive: true,
          })
        }
      }
      
      // Add suggested expenses
      for (const exp of result.suggestedExpenses) {
        if (exp.annualAmount && exp.annualAmount > 0) {
          newExpenses.push({
            id: genId(),
            category: exp.category || 'Uncategorized',
            description: exp.description || 'Imported Expense',
            annualAmount: exp.annualAmount,
            isDeductible: exp.isDeductible ?? true,
            deductionPct: exp.deductionPct ?? 100,
          })
        }
      }
      
      return { ...prev, incomeStreams: newIncome, expenses: newExpenses }
    })
    
    setImportedCount(
      (result.suggestedIncomeStreams.length || 0) + (result.suggestedExpenses.length || 0)
    )
    setStage('done')
  }, [result, updateState])
  
  const reset = () => {
    setStage('upload')
    setResult(null)
    setError(null)
    setSelectedTransactions(new Set())
  }
  
  const categoryColors: Record<string, string> = {
    business_income: '#10b981', freelance_income: '#10b981', salary: '#3b82f6',
    investment_income: '#8b5cf6', rental_income: '#f59e0b', other_income: '#6b7280',
    software_subscriptions: '#ec4899', advertising: '#f97316', travel: '#06b6d4',
    meals: '#ef4444', vehicle: '#78716c', office_supplies: '#a855f7', equipment: '#6366f1',
    professional_services: '#0ea5e9', utilities: '#64748b', education: '#14b8a6',
    charitable: '#f43f5e', health_medical: '#22c55e', personal: '#9ca3af',
    transfer: '#475569', unknown: '#6b7280', insurance: '#3b82f6',
    bank_fees: '#ef4444', taxes_paid: '#dc2626', rent_lease: '#a78bfa',
  }
  
  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Upload size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            Data Import
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Import bank statements (CSV, OFX, QFX) for automatic categorization and integration
        </p>
      </div>
      
      {/* Stage: Upload */}
      {stage === 'upload' && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              padding: 64,
              border: `2px dashed ${dragOver ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
              borderRadius: 16,
              background: dragOver ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
              background: 'var(--accent-gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileSpreadsheet size={28} style={{ color: 'var(--accent-gold)' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Drop your bank statement here
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              or click to browse files
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Supports CSV, OFX, QFX formats
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.ofx,.qfx,.txt"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
          
          {error && (
            <div style={{
              marginTop: 16, padding: 16, background: 'rgba(239,68,68,0.1)',
              borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--accent-red)' }} />
              <span style={{ fontSize: 13, color: 'var(--accent-red)' }}>{error}</span>
            </div>
          )}
          
          {/* Supported formats info */}
          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {[
              { format: 'CSV', desc: 'Most banks offer CSV export from transaction history', sources: 'Chase, Bank of America, Wells Fargo, Capital One' },
              { format: 'OFX/QFX', desc: 'Open Financial Exchange — direct bank download format', sources: 'Quicken, many online banking portals' },
              { format: 'Auto-Categorize', desc: 'AI categorizes transactions into income types & expense categories', sources: '60+ merchant/vendor patterns recognized' },
            ].map(info => (
              <div key={info.format} style={{
                padding: 20, background: 'var(--bg-elevated)', borderRadius: 12,
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 6 }}>
                  {info.format}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                  {info.desc}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {info.sources}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Stage: Review */}
      {stage === 'review' && result && (
        <div>
          {/* Import Summary */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24,
          }}>
            {[
              { label: 'Transactions', value: result.summary.totalTransactions.toLocaleString(), color: 'var(--text-primary)' },
              { label: 'Total Income', value: `$${Math.round(result.summary.totalIncome).toLocaleString()}`, color: 'var(--accent-emerald)' },
              { label: 'Total Expenses', value: `$${Math.round(result.summary.totalExpenses).toLocaleString()}`, color: 'var(--accent-red)' },
              { label: 'Unclassified', value: result.summary.unclassified.toString(), color: result.summary.unclassified > 10 ? 'var(--accent-gold)' : 'var(--text-muted)' },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: 16, background: 'var(--bg-elevated)', borderRadius: 12,
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
          
          {/* Date range */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
            Date range: {result.summary.dateRange.start} to {result.summary.dateRange.end}
          </div>
          
          {/* Suggested income streams */}
          {result.suggestedIncomeStreams.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} />
                Detected Income Streams ({result.suggestedIncomeStreams.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.suggestedIncomeStreams.map((stream, i) => (
                  <div key={i} style={{
                    padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 10,
                    border: '1px solid rgba(16,185,129,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{stream.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Type: {stream.type}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                      ${stream.annualAmount?.toLocaleString()}/yr
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Suggested expenses */}
          {result.suggestedExpenses.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-red)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingDown size={16} />
                Detected Expense Categories ({result.suggestedExpenses.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.suggestedExpenses.map((exp, i) => (
                  <div key={i} style={{
                    padding: '12px 16px', background: 'rgba(239,68,68,0.04)', borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{exp.category}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {exp.isDeductible ? `${exp.deductionPct}% deductible` : 'Not deductible'}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      ${exp.annualAmount?.toLocaleString()}/yr
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Top categories chart */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              Category Breakdown
            </div>
            {result.summary.topCategories.slice(0, 8).map(cat => {
              const maxAmount = result.summary.topCategories[0]?.amount || 1
              const pct = (cat.amount / maxAmount) * 100
              return (
                <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 140, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                    {cat.category.replace(/_/g, ' ')}
                  </div>
                  <div style={{ flex: 1, height: 20, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 4,
                      background: categoryColors[cat.category] || '#6b7280',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ width: 80, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    ${Math.round(cat.amount).toLocaleString()}
                  </div>
                  <div style={{ width: 30, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    ×{cat.count}
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
            <button onClick={reset} style={{
              padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <RefreshCw size={14} /> Import Different File
            </button>
            <button onClick={handleImport} style={{
              padding: '10px 32px', borderRadius: 10, border: 'none',
              background: 'var(--accent-gold)', color: '#0c0e12', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Check size={14} /> Import {result.suggestedIncomeStreams.length + result.suggestedExpenses.length} Items
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
      
      {/* Stage: Done */}
      {stage === 'done' && (
        <div style={{
          textAlign: 'center', padding: 64,
          background: 'var(--bg-elevated)', borderRadius: 16,
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
            background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={32} style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            Import Complete
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
            {importedCount} items added to your financial profile
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={reset} style={{
              padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
            }}>
              Import More Data
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
