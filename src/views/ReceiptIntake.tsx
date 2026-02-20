import React, { useState } from 'react'
import { Camera, Image as ImageIcon, Check, TrendingDown, ArrowRight, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { useFortuna } from '../hooks/useFortuna'
import { MobileReceiptScanner } from '../components/MobileReceiptScanner'
import { processReceiptImage } from '../engine/vision-processor'
import { createBatch, processBatch, type BatchIntakeJob } from '../engine/batch-intake'
import type { ReceiptRecord } from '../types'

type IntakeStage = 'idle' | 'scanning' | 'processing' | 'review' | 'done'

export function ReceiptIntake() {
    const { state, updateState } = useFortuna()
    const [stage, setStage] = useState<IntakeStage>('idle')
    const [scannedReceipts, setScannedReceipts] = useState<ReceiptRecord[]>([])
    const [currentBatch, setCurrentBatch] = useState<BatchIntakeJob | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [processingMessage, setProcessingMessage] = useState('Extracting receipt details...')
    const [backgroundProcessingCount, setBackgroundProcessingCount] = useState(0)

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
            const visionResult = await processReceiptImage(base64Image, state)

            if (!visionResult.success || !visionResult.receipt) {
                throw new Error(visionResult.error || "Failed to extract receipt data.")
            }

            const newReceipt = visionResult.receipt

            // 2. Initialize or retrieve batch (need functional state update to avoid race conditions with concurrent scans)
            setCurrentBatch(prevBatch => {
                let activeBatch = prevBatch
                if (!activeBatch) {
                    activeBatch = createBatch('mobile_scan', 'Mobile Scan Session')
                    updateState(s => ({ ...s, batchJobs: [...s.batchJobs, activeBatch!] }))
                }
                newReceipt.batchId = activeBatch.id
                return activeBatch
            })

            // Update local state
            setScannedReceipts(prev => [...prev, newReceipt])
            updateState(s => ({ ...s, receipts: [...s.receipts, newReceipt] }))

        } catch (err: any) {
            console.error(err)
            // We don't want to throw a fatal error that breaks the scanning flow. Just log or show a passive toast.
            // For now, quietly fail the single scan and let the user re-scan.
        } finally {
            setBackgroundProcessingCount(prev => prev - 1)
        }
    }

    const handleProcessBatch = async () => {
        if (!currentBatch || scannedReceipts.length === 0) return

        setStage('processing')
        setProcessingMessage('Applying tax rules & entity assignment...')

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

    const resetSession = () => {
        setStage('idle')
        setScannedReceipts([])
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
                        Auto-capture receipts with your camera to extract data and categorize expenses.
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
                        Ensure good lighting and hold the camera steady over the receipt. The system will automatically capture when the image is stable.
                    </div>
                    <button onClick={handleStartScanning} style={styles.primaryButtonLarge}>
                        <Camera size={20} /> Launch Scanner
                    </button>
                </div>
            )}

            {/* Stage: Scanning (Fullscreen Overlay) */}
            {stage === 'scanning' && (
                <MobileReceiptScanner
                    onCapture={handleImageCapture}
                    onClose={() => setStage(scannedReceipts.length > 0 ? 'review' : 'idle')}
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
                            Scanned Items ({scannedReceipts.length})
                        </div>
                        <button onClick={handleStartScanning} style={styles.secondaryButton}>
                            <Camera size={16} /> Scan More
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                        {scannedReceipts.map(receipt => (
                            <div key={receipt.id} style={styles.receiptRow}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={styles.receiptIcon}>
                                        <TrendingDown size={18} style={{ color: 'var(--accent-red)' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{receipt.merchantName}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{receipt.date} • {receipt.items.length} items</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    ${receipt.totalAmount.toFixed(2)}
                                </div>
                            </div>
                        ))}
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
                        {scannedReceipts.length} receipts have been processed, routed to entities, and pushed to the ledger.
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
    receiptIcon: {
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(239,68,68,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    }
}
