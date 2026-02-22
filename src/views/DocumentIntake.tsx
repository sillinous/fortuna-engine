import React, { useState, useMemo, useRef } from 'react'
import { Camera, X, Check, Loader2, ArrowRight, TrendingDown, FileText, ImageIcon, Ban, RefreshCw, Trash2, AlertTriangle, Shield, AlertCircle } from 'lucide-react'
import { useFortuna } from '../hooks/useFortuna'
import { MobileDocumentScanner } from '../components/MobileDocumentScanner'
import { processDocumentImage } from '../engine/vision-processor'
import { createBatch, processBatch } from '../engine/batch-intake'
import { BlobStore } from '../engine/blob-store'
import { type IntakeBatch, type DocumentRecord, type ReceiptRecord, type FortunaState } from '../engine/storage'

type IntakeStage = 'idle' | 'scanning' | 'processing' | 'review' | 'done'

export function DocumentIntake() {
    const { state, updateState } = useFortuna()
    const [stage, setStage] = useState<IntakeStage>('idle')
    const [error, setError] = useState<string | null>(null)
    const [processingMessage, setProcessingMessage] = useState('Initializing...')
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
    const [backgroundProcessingCount, setBackgroundProcessingCount] = useState(0)
    const [expandedDocId, setExpandedDocId] = useState<string | null>(null)

    // REACTIVE STATE: Derive current session data directly from global state
    // This solves multi-device sync and button-not-firing issues
    const currentBatch = useMemo(() => {
        if (!state.intakeBatches) return null
        return state.intakeBatches.find(b => b.status === 'uploading') || null
    }, [state.intakeBatches])

    const [activeSessionBatchId, setActiveSessionBatchId] = useState<string | null>(null)

    // Sync activeBatchId with currentBatch
    React.useEffect(() => {
        if (currentBatch?.id) {
            setActiveSessionBatchId(currentBatch.id)
        }
    }, [currentBatch?.id])

    const scannedDocuments = useMemo(() => {
        const bid = activeSessionBatchId || currentBatch?.id
        if (!bid) return []
        return state.documents.filter(d => d.batchId === bid)
    }, [state.documents, currentBatch, activeSessionBatchId])

    const scannedImageCount = scannedDocuments.length

    // Auto-advance to review if we have a recovered or active session
    useMemo(() => {
        if (stage === 'idle' && scannedDocuments.length > 0) {
            setStage('review')
        }
    }, [scannedDocuments.length, stage])

    const stats = useMemo(() => {
        const result = {
            totalCount: scannedDocuments.length,
            notApplicableCount: 0,
            notApplicableTotal: 0,
            categorizedCount: 0,
            totalAmount: 0,
            byTypeCount: {} as Record<string, number>,
            byTypeTotal: {} as Record<string, number>,
            receipts: [] as { merchant: string; amount: number; items: any[] }[]
        }

        scannedDocuments.forEach((doc: DocumentRecord) => {
            const type = doc.documentType
            const amount = Number(doc.metadata.totalAmount || doc.metadata.amountDue || 0)

            if (type === 'not_applicable') {
                result.notApplicableCount++
                result.notApplicableTotal += amount
            } else {
                result.categorizedCount++
                result.totalAmount += amount

                result.byTypeCount[type] = (result.byTypeCount[type] || 0) + 1
                result.byTypeTotal[type] = (result.byTypeTotal[type] || 0) + amount

                if (type === 'receipt') {
                    result.receipts.push({
                        merchant: doc.metadata.merchantName || 'Receipt',
                        amount,
                        items: doc.metadata.lineItems || []
                    })
                }
            }
        })

        return result
    }, [scannedDocuments])

    const handleStartScanning = () => {
        setError(null)
        setStage('scanning')
    }

    const handleImageCapture = async (base64Image: string) => {
        setBackgroundProcessingCount((prev: number) => prev + 1)
        setError(null)

        try {
            // 0. Provide context for multi-page grouping
            // Find the last document in the current active batch for context
            const activeBatch = state.intakeBatches.find(b => b.status === 'uploading')
            const lastDoc = activeBatch
                ? [...state.documents].reverse().find(d => d.batchId === activeBatch.id)
                : null

            const previousContext = lastDoc ? {
                summary: lastDoc.summary || '',
                type: lastDoc.documentType,
                merchant: lastDoc.metadata.merchantName || lastDoc.metadata.agency
            } : undefined

            // 1. Process via Vision AI
            const visionResult = await processDocumentImage(base64Image, 'openrouter', 'google/gemini-2.0-flash-001', previousContext)

            if (!visionResult.success || !visionResult.document) {
                throw new Error(visionResult.error || "Failed to extract document data.")
            }

            const newImageData = visionResult.document
            const { isContinuation } = visionResult

            // 1.5 Save full image to BlobStore (always use the new ID generated by vision-processor for the blob)
            if (visionResult.fullImage) {
                await BlobStore.save(newImageData.id, visionResult.fullImage)
            }

            // 2. Update global state atomically
            updateState((s: FortunaState) => {
                const draft: FortunaState = { ...s }
                let batch = draft.intakeBatches.find((b: IntakeBatch) => b.status === 'uploading')

                if (!batch) {
                    batch = createBatch('Mobile Scan Session')
                    draft.intakeBatches = [...draft.intakeBatches, batch]
                }

                const activeBatchId = batch.id

                // If it's a continuation, append to the last document instead of creating a new one
                const existingDoc = isContinuation
                    ? draft.documents.find((d: DocumentRecord) => d.id === lastDoc?.id)
                    : null

                if (existingDoc) {
                    // APPEND PAGE
                    existingDoc.pages = [...existingDoc.pages, `blob:${newImageData.id}`]
                    existingDoc.pageThumbnails = [...existingDoc.pageThumbnails, newImageData.pageThumbnails[0]]
                    existingDoc.pageCount = (existingDoc.pageCount || 1) + 1

                    // Also update receipt if applicable (appending to the items list?)
                    if (visionResult.receiptItems && visionResult.receiptItems.length > 0) {
                        const existingReceipt = draft.receipts.find((r: ReceiptRecord) => r.id === existingDoc.id)
                        if (existingReceipt) {
                            existingReceipt.items = [...existingReceipt.items, ...visionResult.receiptItems]
                            // Sum up totals if they were extracted from this page too (optional complexity)
                            if (newImageData.metadata.totalAmount) {
                                existingReceipt.totalAmount = (existingReceipt.totalAmount || 0) + Number(newImageData.metadata.totalAmount)
                            }
                        }
                    }
                } else {
                    // NEW DOCUMENT
                    const documentWithBatch: DocumentRecord = { ...newImageData, batchId: activeBatchId }
                    draft.documents = [...draft.documents, documentWithBatch]

                    // Handle Receipts
                    if (visionResult.receiptItems) {
                        const receiptRecord: ReceiptRecord = {
                            id: newImageData.id,
                            date: newImageData.metadata.documentDate || new Date().toISOString().split('T')[0],
                            merchantName: newImageData.metadata.merchantName || 'Unknown Vendor',
                            totalAmount: Number(newImageData.metadata.totalAmount) || 0,
                            taxAmount: Number(newImageData.metadata.taxAmount) || 0,
                            tipAmount: Number(newImageData.metadata.tipAmount) || 0,
                            status: 'needs_review' as const,
                            batchId: activeBatchId,
                            items: visionResult.receiptItems
                        }
                        draft.receipts = [...draft.receipts, receiptRecord]
                    }

                    // Update batch counts for new document
                    batch.totalCount = (batch.totalCount || 0) + 1
                    if (newImageData.documentType === 'receipt') {
                        batch.receiptIds = [...(batch.receiptIds || []), newImageData.id]
                    } else {
                        batch.documentIds = [...(batch.documentIds || []), newImageData.id]
                    }
                }

                return draft
            })



        } catch (err: any) {
            console.error(err)
            setError(err.message || "Failed to process image.")
        } finally {
            setBackgroundProcessingCount((prev: number) => prev - 1)
        }
    }

    // Use a ref to keep track of the batch ID even if the state is overwritten by sync
    const lastSeenBatchId = useRef<string | null>(null)
    if (currentBatch) lastSeenBatchId.current = currentBatch.id

    const handleProcessBatch = async () => {
        // Find the batch to process - be extremely robust
        const targetBatch = state.intakeBatches.find(b => b.status === 'uploading') ||
            state.intakeBatches.find(b => b.id === (activeSessionBatchId || currentBatch?.id)) ||
            state.intakeBatches[state.intakeBatches.length - 1] // Fallback to last batch if lost

        if (!targetBatch || (scannedDocuments.length === 0 && !targetBatch.totalCount)) {
            console.error("No active batch found for processing. State batches:", state.intakeBatches)
            setError("Scanning session expired or was lost. Please capture an image to resume.")
            return
        }

        setStage('processing')
        setProcessingMessage('Applying routing rules & entity assignment...')

        try {
            const { draft } = await processBatch(
                state,
                targetBatch.id,
                (progress: number) => { setProcessingMessage(`Processing: ${Math.round(progress)}%`) },
                true
            )

            updateState((currentGlobal: FortunaState) => {
                // Merge the processed batch results into the latest global state
                // This prevents overwriting other concurrent state changes
                const final = { ...currentGlobal }
                final.intakeBatches = final.intakeBatches.map(b =>
                    b.id === draft.intakeBatches.find(db => db.id === b.id)?.id
                        ? draft.intakeBatches.find(db => db.id === b.id)!
                        : b
                )
                final.documents = [...final.documents]
                draft.documents.forEach(dd => {
                    const idx = final.documents.findIndex(fd => fd.id === dd.id)
                    if (idx >= 0) {
                        final.documents[idx] = dd
                    } else if (dd.batchId === targetBatch.id) {
                        final.documents.push(dd)
                    }
                })

                final.receipts = [...final.receipts]
                draft.receipts.forEach(dr => {
                    const idx = final.receipts.findIndex(fr => fr.id === dr.id)
                    if (idx >= 0) {
                        final.receipts[idx] = dr
                    } else if (dr.id === targetBatch.id || dr.batchId === targetBatch.id) {
                        final.receipts.push(dr)
                    }
                })

                return final
            })
            setStage('done')
        } catch (err: any) {
            console.error("Batch processing failed:", err)
            setError(err.message || "Batch processing failed.")
            setStage('review')
        }
    }

    const handleUpdateDocMetadata = (docId: string, field: string, value: any) => {
        updateState((draft: FortunaState) => {
            draft.documents = draft.documents.map(d => {
                if (d.id === docId) {
                    return { ...d, metadata: { ...d.metadata, [field]: value } }
                }
                return d
            })
            // If it's a receipt, also update the receipt record
            draft.receipts = draft.receipts.map(r => {
                if (r.id === docId) {
                    const rField = field === 'merchantName' ? 'merchantName' : field === 'totalAmount' ? 'totalAmount' : field
                    return { ...r, [rField]: value }
                }
                return r
            })
            return draft
        })
    }

    const handleUpdateLineItem = (docId: string, itemId: string, field: string, value: any) => {
        updateState((draft: FortunaState) => {
            draft.receipts = draft.receipts.map(r => {
                if (r.id === docId) {
                    const items = r.items?.map(i => i.id === itemId ? { ...i, [field]: value } : i)
                    return { ...r, items }
                }
                return r
            })
            return draft
        })
    }

    const resetSession = () => {
        setStage('idle')
        setError(null)
        // Mark current batch as cancelled or just clear status to stop recovery
        if (currentBatch) {
            updateState(draft => {
                const batch = draft.intakeBatches.find(b => b.id === currentBatch.id)
                if (batch) batch.status = 'completed' // or a dynamic 'cancelled' if we add it
                return draft
            })
        }
    }

    return (
        <div style={{ padding: '20px 16px 120px 16px', maxWidth: 800, margin: '0 auto', minHeight: 'calc(100vh - 64px)' }}>

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
                    onClose={() => setStage(scannedImageCount > 0 ? 'review' : 'idle')}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
                                Scanned Documents ({scannedDocuments.length})
                            </div>
                            {scannedDocuments.length > 0 && (
                                <button
                                    onClick={() => {
                                        const allIds = scannedDocuments.map(d => d.id)
                                        setSelectedDocIds(allIds.length === selectedDocIds.length ? [] : allIds)
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                                >
                                    {selectedDocIds.length === scannedDocuments.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {selectedDocIds.length > 0 && (
                                <button
                                    onClick={() => {
                                        const idsToRemove = [...selectedDocIds]
                                        setScannedDocuments(prev => prev.filter(d => !idsToRemove.includes(d.id)))
                                        setSelectedDocIds([])

                                        // Sync deletion to global state
                                        updateState((s: FortunaState) => ({
                                            ...s,
                                            documents: s.documents.filter(d => !idsToRemove.includes(d.id)),
                                            receipts: s.receipts.filter(r => !idsToRemove.includes(r.id))
                                        }))
                                    }}
                                    style={{ ...styles.secondaryButton, color: 'var(--accent-red)', borderColor: 'var(--accent-red)44' }}
                                >
                                    <Trash2 size={16} /> Delete ({selectedDocIds.length})
                                </button>
                            )}
                            <button onClick={handleStartScanning} style={styles.secondaryButton}>
                                <Camera size={16} /> Scan More
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                        {scannedDocuments.map(doc => {
                            const isExpanded = expandedDocId === doc.id
                            const isSelected = selectedDocIds.includes(doc.id)
                            const isLowConfidence = (doc.metadata.confidenceScore || 1) < 0.7
                            return (
                                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 1, position: 'relative' }}>
                                    <div
                                        style={{ position: 'absolute', left: -32, top: 20, zIndex: 1 }}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedDocIds(prev => prev.includes(doc.id) ? prev.filter(id => id !== doc.id) : [...prev, doc.id])
                                        }}
                                    >
                                        <div style={{
                                            width: 18, height: 18, borderRadius: 4,
                                            border: `2px solid ${isSelected ? 'var(--accent-gold)' : 'var(--border-medium)'}`,
                                            background: isSelected ? 'var(--accent-gold)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer'
                                        }}>
                                            {isSelected && <Check size={12} color="#000" strokeWidth={3} />}
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                                        style={{ ...styles.receiptRow, cursor: 'pointer', borderBottomLeftRadius: isExpanded ? 0 : 12, borderBottomRightRadius: isExpanded ? 0 : 12 }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ display: 'flex', position: 'relative', width: 44, height: 44 }}>
                                                {doc.pageThumbnails && doc.pageThumbnails.length > 0 ? (
                                                    doc.pageThumbnails.slice(0, 2).map((thumb, idx) => (
                                                        <img
                                                            key={idx}
                                                            src={thumb}
                                                            style={{
                                                                width: 40, height: 40, borderRadius: 8, objectFit: 'cover',
                                                                border: '1px solid var(--border-subtle)',
                                                                position: 'absolute',
                                                                left: idx * 4,
                                                                top: idx * 4,
                                                                zIndex: 10 - idx,
                                                                opacity: 1 - (idx * 0.3)
                                                            }}
                                                            alt="doc"
                                                        />
                                                    ))
                                                ) : (
                                                    <div style={{ ...styles.docIcon, background: doc.documentType === 'receipt' ? 'rgba(239,68,68,0.06)' : doc.documentType === 'not_applicable' ? 'rgba(107,114,128,0.1)' : 'rgba(59,130,246,0.06)' }}>
                                                        {doc.documentType === 'receipt' ? (
                                                            <TrendingDown size={18} style={{ color: 'var(--accent-red)' }} />
                                                        ) : doc.documentType === 'not_applicable' ? (
                                                            <Ban size={18} style={{ color: 'var(--text-muted)' }} />
                                                        ) : (
                                                            <FileText size={18} style={{ color: '#3b82f6' }} />
                                                        )}
                                                    </div>
                                                )}
                                                {doc.pageCount > 1 && (
                                                    <div style={{
                                                        position: 'absolute', bottom: -4, right: -4,
                                                        background: 'var(--accent-gold)', color: '#000',
                                                        fontSize: 9, fontWeight: 800, padding: '1px 4px',
                                                        borderRadius: 4, zIndex: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                                    }}>
                                                        {doc.pageCount}P
                                                    </div>
                                                )}
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
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                                                <div style={styles.inputGroup}>
                                                    <label style={{ ...styles.label, color: isLowConfidence && !doc.metadata.merchantName ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                                                        Merchant / Name {isLowConfidence && <AlertCircle size={10} style={{ marginLeft: 4 }} />}
                                                    </label>
                                                    <input
                                                        style={{ ...styles.input, borderColor: isLowConfidence ? 'var(--accent-gold)55' : 'var(--border-subtle)' }}
                                                        value={doc.metadata.merchantName || doc.metadata.subject || ''}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateDocMetadata(doc.id, doc.metadata.merchantName ? 'merchantName' : doc.metadata.agency ? 'agency' : 'subject', e.target.value)}
                                                    />
                                                </div>
                                                <div style={styles.inputGroup}>
                                                    <label style={{ ...styles.label, color: isLowConfidence && !doc.metadata.totalAmount ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                                                        Total Amount {isLowConfidence && <AlertCircle size={10} style={{ marginLeft: 4 }} />}
                                                    </label>
                                                    <input
                                                        style={{ ...styles.input, borderColor: isLowConfidence ? 'var(--accent-gold)55' : 'var(--border-subtle)' }}
                                                        type="number"
                                                        value={doc.metadata.totalAmount || doc.metadata.amountDue || 0}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateDocMetadata(doc.id, doc.metadata.totalAmount ? 'totalAmount' : 'amountDue', parseFloat(e.target.value))}
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
                                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateLineItem(doc.id, item.id, 'description', e.target.value)}
                                                                />
                                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                    <div style={styles.categoryBadge}>
                                                                        {item.inferredCategory || 'Misc'}
                                                                    </div>
                                                                    <input
                                                                        style={{ ...styles.inputPlain, width: 80, textAlign: 'right', fontWeight: 600 }}
                                                                        type="number"
                                                                        value={item.amount}
                                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateLineItem(doc.id, item.id, 'amount', parseFloat(e.target.value))}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {doc.metadata.deductionSignals && doc.metadata.deductionSignals.length > 0 && (
                                                <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-gold-dim)', border: '1px solid var(--accent-gold)22' }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                                        <Shield size={12} /> Tax Intelligence Signals
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                        {doc.metadata.deductionSignals.map((sig: string, idx: number) => (
                                                            <span key={idx} style={{ fontSize: 11, color: 'var(--text-primary)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 6 }}>
                                                                {sig}
                                                            </span>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 24 }}>
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
                <div style={{ ...styles.card, maxWidth: 600, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
                    <div style={styles.successIcon}>
                        <Check size={32} color="#000" />
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, textAlign: 'center' }}>
                        Processing Complete
                    </h2>
                    {stats.categorizedCount} documents processed from {scannedImageCount} captures. {stats.notApplicableCount} marked as not applicable.

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
                        {/* Summary Totals */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Categorized</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-gold)' }}>${stats.totalAmount.toFixed(2)}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{stats.categorizedCount} items</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Not Applicable</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)' }}>${stats.notApplicableTotal.toFixed(2)}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{stats.notApplicableCount} items</div>
                            </div>
                        </div>

                        {/* Breakdown per Type */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breakdown by Type</div>
                            {Object.entries(stats.byTypeCount).map(([type, count]) => (
                                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                                    <div style={{ textTransform: 'capitalize', fontSize: 14, fontWeight: 500 }}>{type} ({count})</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${stats.byTypeTotal[type].toFixed(2)}</div>
                                </div>
                            ))}
                        </div>

                        {/* Line Items for Receipts */}
                        {stats.receipts.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receipt Details</div>
                                {stats.receipts.map((r, i) => (
                                    <div key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontWeight: 600 }}>{r.merchant}</span>
                                            <span style={{ color: 'var(--accent-gold)' }}>${r.amount.toFixed(2)}</span>
                                        </div>
                                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {r.items.map((item: any, j: number) => (
                                                <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                                    <span style={{ color: 'var(--text-secondary)' }}>{item.description}</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>${Number(item.amount).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button onClick={resetSession} style={{ ...styles.primaryButtonLarge, width: '100%' }}>
                        Start New Batch <ArrowRight size={18} />
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
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    successIcon: {
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--accent-gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
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
