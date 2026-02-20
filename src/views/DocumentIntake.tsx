import React, { useState } from 'react'
import { Camera, Image as ImageIcon, Check, TrendingDown, ArrowRight, RefreshCw, Loader2, AlertTriangle, FileText } from 'lucide-react'
import { useFortuna } from '../hooks/useFortuna'
import { MobileDocumentScanner } from '../components/MobileDocumentScanner'
import { processDocumentImage } from '../engine/vision-processor'
import { createBatch, processBatch } from '../engine/batch-intake'
import { type IntakeBatch, type DocumentRecord, type ReceiptRecord } from '../engine/storage'

type IntakeStage = 'idle' | 'scanning' | 'processing' | 'review' | 'done'

export function DocumentIntake() {
    const { state, updateState } = useFortuna()
    const [stage, setStage] = useState<IntakeStage>('idle')
    const [scannedDocuments, setScannedDocuments] = useState<DocumentRecord[]>([])
    const [currentBatch, setCurrentBatch] = useState<IntakeBatch | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [processingMessage, setProcessingMessage] = useState('Extracting receipt details...')
    const [backgroundProcessingCount, setBackgroundProcessingCount] = useState(0)
    const [expandedDocId, setExpandedDocId] = useState<string | null>(null)

    const handleStartScanning = () => {
        setError(null)
        setStage('scanning')
    }

    const handleImageCapture = async (base64Image: string) => {
        // In Turbo Mode, we stay in 'scanning' stage and process concurrently
        setBackgroundProcessingCount(prev => prev + 1)
        setError(null)

        try {
            // 1. Process via Vision AI
            const visionResult = await processDocumentImage(base64Image, state)

            if (!visionResult.success || !visionResult.document) {
                throw new Error(visionResult.error || "Failed to extract document data.")
            }

            const newDocument = visionResult.document

            // 2. Initialize or retrieve batch 
            let activeBatchId: string = ''
            if (!currentBatch) {
                const newBatch = createBatch('Mobile Scan Session')
                activeBatchId = newBatch.id
                updateState(s => ({ ...s, intakeBatches: [...s.intakeBatches, newBatch] }))
                setCurrentBatch(newBatch)
            } else {
                activeBatchId = currentBatch.id
            }

            // Link to batch
            // NOTE: Batch tracking for generic documents requires meta-model update.
            // For now, attaching loosely via metadata or letting the UI stage handle bulk commit.

            // Update local state
            setScannedDocuments(prev => [...prev, newDocument])

            // Push to respective arrays in global state based on classification
            updateState(s => {
                const draftState = { ...s }
                draftState.documents = [...draftState.documents, newDocument]

                // If the vision processor also returned receipt line items, bridge it into the receipts array
                if (visionResult.receiptItems) {
                    const receiptRecord: ReceiptRecord = {
                        id: newDocument.id, // share ID for easy linking
                        date: newDocument.metadata.documentDate || new Date().toISOString().split('T')[0],
                        merchantName: newDocument.metadata.merchantName || 'Unknown Vendor',
                        totalAmount: Number(newDocument.metadata.totalAmount) || 0,
                        taxAmount: Number(newDocument.metadata.taxAmount) || 0,
                        tipAmount: Number(newDocument.metadata.tipAmount) || 0,
                        status: 'needs_review' as const,
                        batchId: activeBatchId,
                        items: visionResult.receiptItems
                    }
                    draftState.receipts = [...draftState.receipts, receiptRecord]
                }

                // Also update the batch counts
                const batch = draftState.intakeBatches.find((b: IntakeBatch) => b.id === activeBatchId)
                if (batch) {
                    batch.totalCount = (batch.totalCount || 0) + 1
                    if (newDocument.documentType === 'receipt') {
                        batch.receiptIds = [...(batch.receiptIds || []), newDocument.id]
                    } else {
                        batch.documentIds = [...(batch.documentIds || []), newDocument.id]
                    }
                }

                return draftState
            })

        } catch (err: any) {
            console.error(err)
            // We don't want to throw a fatal error that breaks the scanning flow. Just log or show a passive toast.
            // For now, quietly fail the single scan and let the user re-scan.
        } finally {
            setBackgroundProcessingCount(prev => prev - 1)
        }
    }

    const handleProcessBatch = async () => {
        if (!currentBatch || scannedDocuments.length === 0) return

        setStage('processing')
        setProcessingMessage('Applying routing rules & entity assignment...')

        try {
            // 3. Run the heuristics and AI fallback across the collected batch
            const result = await processBatch(
                state,
                currentBatch.id,
                (progress) => { setProcessingMessage(`Processing: ${Math.round(progress * 100)}%`) },
                true // Enable AI resolution
            )

            setStage('done')
        } catch (err: any) {
            setError(err.message || "Batch processing failed.")
            setStage('review')
        }
    }

    const handleUpdateDocMetadata = (docId: string, field: string, value: any) => {
        setScannedDocuments(prev => prev.map(doc => {
            if (doc.id === docId) {
                return {
                    ...doc,
                    metadata: {
                        ...doc.metadata,
                        [field]: value
                    }
                }
            }
            return doc
        }))
    }

    const handleUpdateLineItem = (docId: string, itemId: string, field: string, value: any) => {
        setScannedDocuments(prev => prev.map(doc => {
            if (doc.id === docId) {
                const lineItems = doc.metadata.lineItems?.map((item: any) => {
                    if (item.id === itemId) {
                        return { ...item, [field]: value }
                    }
                    return item
                })
                return {
                    ...doc,
                    metadata: {
                        ...doc.metadata,
                        lineItems
                    }
                }
            }
            return doc
        }))
    }

    const resetSession = () => {
        setStage('idle')
        setScannedDocuments([])
        setCurrentBatch(null)
        setError(null)
    }

    return (
        <div style={{ padding: 32, maxWidth: 800, margin: '0 auto', minHeight: 'calc(100vh - 64px)' }}>

            <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <Camera size={28} style={{ color: 'var(--accent-gold)' }} />
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
                            Mobile Intake
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                        Auto-capture documents with your camera to extract data and categorize records.
                    </p>
                </div>

                {backgroundProcessingCount > 0 && stage !== 'scanning' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-gold-dim)', borderRadius: 20, color: 'var(--accent-gold)' }}>
                        <Loader2 size={16} className="spin" />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{backgroundProcessingCount} Extracting</span>
                    </div>
                )}
            </div>

            {/* Error Banner */}
            {error && (
                <div style={{
                    padding: 16, background: 'rgba(239,68,68,0.1)',
                    borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10,
                    border: '1px solid rgba(239,68,68,0.2)', marginBottom: 24,
                }}>
                    <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />
                    <span style={{ fontSize: 13, color: 'var(--accent-red)' }}>{error}</span>
                </div>
            )}

            {/* Stage: Idle */}
            {stage === 'idle' && (
                <div style={styles.card}>
                    <div style={styles.iconCircle}>
                        <ImageIcon size={32} style={{ color: 'var(--accent-gold)' }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Ready to scan
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, textAlign: 'center' }}>
                        Ensure good lighting and hold the camera steady over the document. The system will automatically capture when the image is stable.
                    </div>
                    <button onClick={handleStartScanning} style={styles.primaryButtonLarge}>
                        <Camera size={20} /> Launch Scanner
                    </button>
                </div>
            )}

            {/* Stage: Scanning (Fullscreen Overlay) */}
            {stage === 'scanning' && (
                <MobileDocumentScanner
                    onCapture={handleImageCapture}
                    onClose={() => setStage(scannedDocuments.length > 0 ? 'review' : 'idle')}
                />
            )}

            {/* Stage: Processing */}
            {stage === 'processing' && (
                <div style={styles.card}>
                    <Loader2 size={40} className="spin" style={{ color: 'var(--accent-gold)', marginBottom: 24 }} />
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Analyzing...
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                        {processingMessage}
                    </div>
                    <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* Stage: Review */}
            {stage === 'review' && (
                <div>
                    <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                            Scanned Documents ({scannedDocuments.length})
                        </div>
                        <button onClick={handleStartScanning} style={styles.secondaryButton}>
                            <Camera size={16} /> Scan More
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                        {scannedDocuments.map(doc => {
                            const isExpanded = expandedDocId === doc.id
                            return (
                                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <div
                                        onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                                        style={{ ...styles.receiptRow, cursor: 'pointer', borderBottomLeftRadius: isExpanded ? 0 : 12, borderBottomRightRadius: isExpanded ? 0 : 12 }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ ...styles.docIcon, background: doc.documentType === 'receipt' ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.06)' }}>
                                                {doc.documentType === 'receipt' ? <TrendingDown size={18} style={{ color: 'var(--accent-red)' }} /> : <FileText size={18} style={{ color: '#3b82f6' }} />}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                                    {doc.documentType} • {doc.metadata.merchantName || doc.metadata.agency || doc.metadata.subject || 'Document'}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(doc.dateAdded).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {doc.metadata.totalAmount ? `$${Number(doc.metadata.totalAmount).toFixed(2)}` : ''}
                                                {doc.metadata.amountDue ? `$${Number(doc.metadata.amountDue).toFixed(2)}` : ''}
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                <ArrowRight size={16} />
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div style={styles.expandedContent}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
                                                <div style={styles.inputGroup}>
                                                    <label style={styles.label}>Merchant / Name</label>
                                                    <input
                                                        style={styles.input}
                                                        value={doc.metadata.merchantName || doc.metadata.subject || ''}
                                                        onChange={(e) => handleUpdateDocMetadata(doc.id, doc.documentType === 'receipt' ? 'merchantName' : 'subject', e.target.value)}
                                                    />
                                                </div>
                                                <div style={styles.inputGroup}>
                                                    <label style={styles.label}>Total Amount</label>
                                                    <input
                                                        style={styles.input}
                                                        type="number"
                                                        value={doc.metadata.totalAmount || doc.metadata.amountDue || 0}
                                                        onChange={(e) => handleUpdateDocMetadata(doc.id, doc.metadata.totalAmount ? 'totalAmount' : 'amountDue', parseFloat(e.target.value))}
                                                    />
                                                </div>
                                            </div>

                                            {doc.metadata.lineItems && doc.metadata.lineItems.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                                                        Line Items ({doc.metadata.lineItems.length})
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {doc.metadata.lineItems.map((item: any) => (
                                                            <div key={item.id} style={styles.lineItemRow}>
                                                                <input
                                                                    style={{ ...styles.inputPlain, flex: 1 }}
                                                                    value={item.description}
                                                                    onChange={(e) => handleUpdateLineItem(doc.id, item.id, 'description', e.target.value)}
                                                                />
                                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                    <div style={styles.categoryBadge}>
                                                                        {item.inferredCategory || 'Misc'}
                                                                    </div>
                                                                    <input
                                                                        style={{ ...styles.inputPlain, width: 80, textAlign: 'right', fontWeight: 600 }}
                                                                        type="number"
                                                                        value={item.amount}
                                                                        onChange={(e) => handleUpdateLineItem(doc.id, item.id, 'amount', parseFloat(e.target.value))}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 24 }}>
                        <button onClick={resetSession} style={{ ...styles.secondaryButton, flex: 1, padding: 16 }}>
                            <RefreshCw size={18} /> Discard Batch
                        </button>
                        <button
                            onClick={handleProcessBatch}
                            disabled={backgroundProcessingCount > 0}
                            style={{ ...styles.primaryButtonLarge, flex: 2, padding: 16, opacity: backgroundProcessingCount > 0 ? 0.5 : 1 }}
                        >
                            {backgroundProcessingCount > 0 ? (
                                <><Loader2 size={18} className="spin" /> Waiting for extraction...</>
                            ) : (
                                <><Check size={18} /> Finalize Intake <ArrowRight size={18} /></>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Stage: Done */}
            {stage === 'done' && (
                <div style={styles.card}>
                    <div style={{ ...styles.iconCircle, background: 'rgba(16,185,129,0.15)' }}>
                        <Check size={40} style={{ color: 'var(--accent-emerald)' }} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Intake Complete
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, textAlign: 'center' }}>
                        {scannedDocuments.length} documents have been processed, routed to entities, and pushed to the ledger.
                    </div>
                    <button onClick={resetSession} style={styles.secondaryButton}>
                        Start New Batch
                    </button>
                </div>
            )}

        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    card: {
        background: 'var(--bg-elevated)',
        borderRadius: 16,
        border: '1px solid var(--border-subtle)',
        padding: 48,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 80, height: 80, borderRadius: '50%',
        background: 'var(--accent-gold-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
    },
    primaryButtonLarge: {
        padding: '16px 32px',
        borderRadius: 12, border: 'none',
        background: 'var(--accent-gold)', color: '#000',
        cursor: 'pointer', fontSize: 16, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        transition: 'all 0.2s',
    },
    secondaryButton: {
        padding: '10px 20px',
        borderRadius: 10, border: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        cursor: 'pointer', fontSize: 14, fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    receiptRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', borderRadius: 12,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    },
    docIcon: {
        width: 40, height: 40, borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    expandedContent: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border-subtle)',
        borderTop: 'none',
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        padding: 20,
        marginBottom: 8,
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    label: {
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    input: {
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '10px 12px',
        color: 'var(--text-primary)',
        fontSize: 14,
        outline: 'none',
    },
    inputPlain: {
        background: 'transparent',
        border: 'none',
        color: 'var(--text-primary)',
        fontSize: 14,
        outline: 'none',
        padding: '4px 0',
    },
    lineItemRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
    },
    categoryBadge: {
        fontSize: 10,
        fontWeight: 700,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'var(--accent-gold-dim)',
        color: 'var(--accent-gold)',
        textTransform: 'uppercase',
    }
}
