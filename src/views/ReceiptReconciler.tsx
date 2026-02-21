import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { 
    Link, CheckCircle2, AlertCircle, Search, 
    ArrowRight, Clock, DollarSign, ExternalLink,
    Filter
} from 'lucide-react'

export function ReceiptReconciler() {
    const { state, updateState } = useFortuna()
    const [filter, setFilter] = useState<'all' | 'unmatched' | 'matched'>('unmatched')
    const [searchQuery, setSearchQuery] = useState('')

    // Unreconciled bank transactions (auditHistory)
    const transactions = useMemo(() => {
        return state.auditHistory.filter(tx => {
            const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase())
            const isExpense = tx.amount < 0
            return matchesSearch && isExpense
        })
    }, [state.auditHistory, searchQuery])

    // Current scanned receipts
    const receipts = useMemo(() => {
        return state.receipts.filter(r => r.status === 'needs_review' || r.status === 'scanned')
    }, [state.receipts])

    // Auto-matching logic
    const suggestions = useMemo(() => {
        const matches: Record<string, string> = {}
        receipts.forEach(receipt => {
            const possibleTx = transactions.find(tx => {
                const txAmount = Math.abs(tx.amount)
                const amountDiff = Math.abs(txAmount - receipt.totalAmount)
                const isAmountMatch = amountDiff < txAmount * 0.05 // 5% tolerance for tips/fees
                const isDateMatch = Math.abs(new Date(tx.date).getTime() - new Date(receipt.date).getTime()) < 3 * 24 * 60 * 60 * 1000 // 3 day window
                return isAmountMatch && isDateMatch
            })
            if (possibleTx) matches[receipt.id] = possibleTx.id
        })
        return matches
    }, [receipts, transactions])

    const handleMatch = (receiptId: string, transactionId: string) => {
        updateState(s => {
            const newState = { ...s }
            const receipt = newState.receipts.find(r => r.id === receiptId)
            const tx = newState.auditHistory.find(t => t.id === transactionId)
            
            if (receipt && tx) {
                receipt.status = 'allocated' // Mark as reconciled
                tx.status = 'verified'
                tx.metadata = { ...tx.metadata, receiptId: receipt.id }
            }
            return newState
        })
    }

    // Styles
    const card: React.CSSProperties = {
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 14, padding: 20, marginBottom: 12
    }

    return (
        <div style={{ padding: '32px 40px', maxWidth: 1000 }}>
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 8 }}>
                    Receipt Reconciler
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Match your scanned receipts with bank transactions to create an immutable audit trail.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Receipts Column */}
                <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Pending Receipts ({receipts.length})
                    </h3>
                    {receipts.map(receipt => {
                        const suggestedTxId = suggestions[receipt.id]
                        const suggestedTx = transactions.find(t => t.id === suggestedTxId)

                        return (
                            <div key={receipt.id} style={card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{receipt.merchantName}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{receipt.date}</div>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-gold)' }}>
                                        ${receipt.totalAmount.toFixed(2)}
                                    </div>
                                </div>

                                {suggestedTx ? (
                                    <div style={{ background: 'var(--accent-emerald-dim)', border: '1px solid var(--accent-emerald)22', borderRadius: 10, padding: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <CheckCircle2 size={12} /> Probable Match Found
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600 }}>{suggestedTx.description}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{suggestedTx.date} · ${Math.abs(suggestedTx.amount).toFixed(2)}</div>
                                            </div>
                                            <button 
                                                onClick={() => handleMatch(receipt.id, suggestedTx.id)}
                                                style={{ padding: '6px 12px', background: 'var(--accent-emerald)', border: 'none', borderRadius: 6, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Confirm
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        No auto-match found. Search transactions manually...
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    {receipts.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, border: '2px dashed var(--border-subtle)', borderRadius: 14 }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>All receipts reconciled!</div>
                        </div>
                    )}
                </div>

                {/* Transactions Column */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                            Bank Transactions
                        </h3>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input 
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{ padding: '6px 10px 6px 30px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {transactions.map(tx => (
                            <div key={tx.id} style={{ ...card, padding: '12px 16px', background: tx.status === 'verified' ? 'rgba(16,185,129,0.05)' : 'var(--bg-elevated)', opacity: tx.status === 'verified' ? 0.6 : 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: tx.status === 'verified' ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                                            {tx.description}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.date}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            ${Math.abs(tx.amount).toFixed(2)}
                                        </div>
                                        {tx.status === 'verified' && <div style={{ fontSize: 9, color: 'var(--accent-emerald)', fontWeight: 700 }}>VERIFIED</div>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
