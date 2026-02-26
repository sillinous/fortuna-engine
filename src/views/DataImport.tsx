import { useState, useCallback, useRef, useEffect } from 'react'
import { useFortuna, genId } from '../hooks/useFortuna'
import { importFromFile, type ImportResult } from '../engine/data-import'
import { Upload, FileSpreadsheet, Check, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, RefreshCw } from 'lucide-react'

type ImportStage = 'upload' | 'review' | 'confirm' | 'done'

export function DataImport() {
  const { updateState } = useFortuna()
  const [stage, setStage] = useState<ImportStage>('upload')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set())
  const [importedCount, setImportedCount] = useState(0)
  const [animationTrigger, setAnimationTrigger] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  
  // Trigger entry animations whenever stage changes
  useEffect(() => {
    setAnimationTrigger(prev => prev + 1)
  }, [stage])

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
    <div style={{ padding: '32px 16px', maxWidth: 1000, margin: '0 auto', animation: 'fadeUpIn 0.5s ease-out' }} key={animationTrigger}>
      {/* Dynamic Keyframes injected into the page */}
      <style>{`
        @keyframes fadeUpIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(250, 204, 21, 0); }
          100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
        }
        .stagger-1 { animation: fadeUpIn 0.5s ease-out 0.05s both; }
        .stagger-2 { animation: fadeUpIn 0.5s ease-out 0.1s both; }
        .stagger-3 { animation: fadeUpIn 0.5s ease-out 0.15s both; }
        .stagger-4 { animation: fadeUpIn 0.5s ease-out 0.2s both; }
        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 24px -6px rgba(0, 0, 0, 0.2);
        }
        .file-drop-zone {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .file-drop-zone:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 40px -10px rgba(250, 204, 21, 0.15);
        }
        .file-drop-zone.drag-active {
          transform: scale(1.02);
          border-color: var(--accent-gold);
          background: rgba(250, 204, 21, 0.05);
          animation: pulseGlow 2s infinite;
        }
      `}</style>

      {/* Header */}
      <div className="stagger-1" style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={22} style={{ color: 'var(--accent-gold)' }} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Data Import
          </h1>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16, margin: 0, maxWidth: 600, lineHeight: 1.5 }}>
          Import bank statements (CSV, OFX, QFX) for automatic categorization and seamless engine integration.
        </p>
      </div>
      
      {/* Stage: Upload */}
      {stage === 'upload' && (
        <div className="stagger-2">
          <div
            className={`glass-panel file-drop-zone ${dragOver ? 'drag-active' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              padding: '72px 32px',
              borderStyle: 'dashed',
              borderWidth: 2,
              borderRadius: 20,
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 72, height: 72, borderRadius: 20, margin: '0 auto 24px',
              background: dragOver ? 'var(--accent-gold)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.3s ease',
            }}>
              <FileSpreadsheet size={32} style={{ color: dragOver ? '#000' : 'var(--text-primary)' }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Drop your bank statement here
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 16 }}>
              or click to browse local files
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 20, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              <span>Supports CSV, OFX, QFX</span>
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
            <div className="stagger-3" style={{
              marginTop: 24, padding: '16px 20px', background: 'rgba(239,68,68,0.1)',
              borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <AlertTriangle size={20} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{error}</span>
            </div>
          )}
          
          {/* Supported formats info */}
          <div className="stagger-4" style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {[
              { format: 'CSV Export', desc: 'Most major banks offer direct CSV exports from your transaction history view.', sources: 'Chase, Bank of America, Wells Fargo' },
              { format: 'OFX / QFX', desc: 'Direct open financial exchange formats natively supported without conversion.', sources: 'Quicken, Online Banking Portals' },
              { format: 'AI Categorization', desc: 'The engine automatically recognizes patterns and maps them to intelligent tax categories.', sources: '100+ vendor patterns tracked' },
            ].map((info) => (
              <div key={info.format} className="glass-panel" style={{ padding: 24, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-gold)' }}></div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {info.format}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {info.desc}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginTop: 'auto', paddingTop: 8 }}>
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
          <div className="stagger-2" style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32,
          }}>
            {[
              { label: 'Transactions Found', value: result.summary.totalTransactions.toLocaleString(), color: 'var(--text-primary)' },
              { label: 'Identified Income', value: `$${Math.round(result.summary.totalIncome).toLocaleString()}`, color: 'var(--accent-emerald)' },
              { label: 'Identified Expenses', value: `$${Math.round(result.summary.totalExpenses).toLocaleString()}`, color: 'var(--accent-red)' },
              { label: 'Unclassified Items', value: result.summary.unclassified.toString(), color: result.summary.unclassified > 10 ? 'var(--accent-gold)' : 'var(--text-muted)' },
            ].map(stat => (
              <div key={stat.label} className="glass-panel" style={{ padding: '20px 24px', borderRadius: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
          
          {/* Date range */}
          <div className="stagger-2" style={{ display: 'inline-flex', padding: '8px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 32 }}>
            Statement Period: <span style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{result.summary.dateRange.start}</span> <ArrowRight size={14} style={{ margin: '0 8px', opacity: 0.5 }} /> <span style={{ color: 'var(--text-primary)' }}>{result.summary.dateRange.end}</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Suggested income streams */}
              {result.suggestedIncomeStreams.length > 0 && (
                <div className="stagger-3 glass-panel" style={{ borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14, fontWeight: 600, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TrendingUp size={18} />
                    Detected Income Streams ({result.suggestedIncomeStreams.length})
                  </div>
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.suggestedIncomeStreams.map((stream, i) => (
                      <div key={i} className="tactile-button" style={{
                        padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 12,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        cursor: 'pointer', border: '1px solid rgba(255,255,255,0.02)'
                      }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(0,0,0,0.2)' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{stream.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>{(stream.type || 'other').replace('_', ' ')} Income</div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                          ${stream.annualAmount?.toLocaleString()}<span style={{ fontSize: 11, opacity: 0.7 }}>/yr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested expenses */}
              {result.suggestedExpenses.length > 0 && (
                <div className="stagger-3 glass-panel" style={{ borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 14, fontWeight: 600, color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TrendingDown size={18} />
                    Detected Expense Categories ({result.suggestedExpenses.length})
                  </div>
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.suggestedExpenses.map((exp, i) => (
                      <div key={i} className="tactile-button" style={{
                        padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 12,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        cursor: 'pointer', border: '1px solid rgba(255,255,255,0.02)'
                      }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(0,0,0,0.3)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(0,0,0,0.2)' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{(exp.category || 'Uncategorized').replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {exp.isDeductible ? <span style={{ color: 'var(--accent-gold)' }}>{exp.deductionPct}% deductible</span> : 'Not deductible'}
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          ${exp.annualAmount?.toLocaleString()}<span style={{ fontSize: 11, opacity: 0.7 }}>/yr</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Top categories chart */}
            <div className="stagger-4 glass-panel" style={{ borderRadius: 16, padding: 24, alignSelf: 'start' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
                Transaction Breakdown
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {result.summary.topCategories.slice(0, 10).map((cat, idx) => {
                  const maxAmount = result.summary.topCategories[0]?.amount || 1
                  const pct = (cat.amount / maxAmount) * 100
                  return (
                    <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 130, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0, textTransform: 'capitalize' }}>
                        {cat.category.replace(/_/g, ' ')}
                      </div>
                      <div style={{ flex: 1, height: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: 0, borderRadius: 6, // Starting at 0 for animation
                          background: categoryColors[cat.category] || '#6b7280',
                          animation: `growBar 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + (idx * 0.05)}s forwards`,
                        }} />
                      </div>
                      <div style={{ width: 80, fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>
                        ${Math.round(cat.amount).toLocaleString()}
                      </div>
                      <style>{`@keyframes growBar { from { width: 0; } to { width: ${pct}%; } }`}</style>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="stagger-4" style={{ display: 'flex', gap: 16, marginTop: 40, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)', justifyContent: 'flex-end' }}>
            <button className="tactile-button" onClick={reset} style={{
              padding: '14px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: 'pointer',
              fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10,
            }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
              <RefreshCw size={16} /> Discard & Start Over
            </button>
            <button className="tactile-button" onClick={handleImport} style={{
              padding: '14px 36px', borderRadius: 12, border: 'none',
              background: 'var(--accent-gold)', color: '#000', cursor: 'pointer',
              fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 14px rgba(250, 204, 21, 0.3)',
            }}>
              <Check size={18} /> Import Profile Data
            </button>
          </div>
        </div>
      )}
      
      {/* Stage: Done */}
      {stage === 'done' && (
        <div className="stagger-1 glass-panel" style={{
          textAlign: 'center', padding: '80px 40px',
          background: 'rgba(16,185,129,0.03)', borderRadius: 24,
          border: '1px solid rgba(16,185,129,0.1)', margin: '0 auto', maxWidth: 640
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
            background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 10px rgba(16,185,129,0.1), 0 0 0 20px rgba(16,185,129,0.05)',
            animation: 'pulseGlow 2s infinite',
          }}>
            <Check size={40} style={{ color: '#000' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
            Import Successful
          </div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{importedCount}</span> sophisticated financial items were woven into your profile schema.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="tactile-button" onClick={reset} style={{
              padding: '16px 32px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: 'pointer',
              fontSize: 16, fontWeight: 600,
            }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
              Import More Statements
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
