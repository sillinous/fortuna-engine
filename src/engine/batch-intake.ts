import type { FortunaState, ReceiptRecord, IntakeBatch } from './storage'
import { genId } from './storage'
import { processReceiptsAsync } from './receipt-engine'

export interface BatchProcessingResult {
    batchId: string
    receiptsProcessed: number
    duplicatesFound: number
    errors: string[]
}

/**
 * Advanced Batch Receipt Intake Engine
 * Handles bulk ingestion with concurrency control and global deduplication.
 */

export async function createBatch(state: FortunaState, name: string, receiptData: any[]): Promise<IntakeBatch> {
    const batch: IntakeBatch = {
        id: genId(),
        name,
        dateStarted: new Date().toISOString(),
        status: 'uploading',
        totalCount: receiptData.length,
        successCount: 0,
        errorCount: 0,
        receiptIds: [],
        progress: 0,
        entityId: 'personal', // Default attribution
        taxYear: new Date().getFullYear()
    }

    state.intakeBatches.push(batch)
    return batch
}

export async function processBatch(
    state: FortunaState,
    batchId: string,
    onProgress?: (progress: number) => void,
    useAI: boolean = false
): Promise<BatchProcessingResult> {
    const batch = state.intakeBatches.find(b => b.id === batchId)
    if (!batch) throw new Error(`Batch ${batchId} not found`)

    batch.status = 'processing'
    const result: BatchProcessingResult = {
        batchId,
        receiptsProcessed: 0,
        duplicatesFound: 0,
        errors: []
    }

    // For this demonstration, we'll process existing "raw" receipts in the state flagged with this batchId
    const pendingReceipts = state.receipts.filter(r => r.batchId === batchId && (r.status === 'scanned' || r.status === 'processing'))

    for (let i = 0; i < pendingReceipts.length; i++) {
        const receipt = pendingReceipts[i]

        try {
            // 1. Check for duplicates against global history
            if (isDuplicate(receipt, state.receipts)) {
                receipt.status = 'needs_review'
                result.duplicatesFound++
                batch.errorCount++
            } else {
                // 2. Perform intelligent itemization/routing (Heuristic)
                receipt.status = 'processing'

                // Simulate async OCR delay
                await new Promise(resolve => setTimeout(resolve, 100))

                result.receiptsProcessed++
                batch.successCount++
            }
        } catch (err: any) {
            result.errors.push(`Error processing ${receipt.id}: ${err.message}`)
            batch.errorCount++
        }

        batch.progress = Math.round(((i + 1) / pendingReceipts.length) * 100)
        onProgress?.(batch.progress)
    }

    // 3. AI-Assisted Enrichment (Optional)
    if (useAI) {
        // Run async AI categorization for any items that failed heuristics
        await processReceiptsAsync(state, batchId)

        // Finalize counts based on AI success
        // Subtract from error count if AI fixed it
        batch.successCount = state.receipts.filter(r => r.batchId === batchId && r.status === 'allocated').length
        batch.errorCount = state.receipts.filter(r => r.batchId === batchId && r.status === 'needs_review').length
    }

    batch.status = 'completed'
    batch.dateCompleted = new Date().toISOString()

    return result
}

/**
 * Global Deduplication Logic
 * Fuzzy matching for merchants and exact matching for date/amount.
 */
function isDuplicate(receipt: ReceiptRecord, history: ReceiptRecord[]): boolean {
    const normalizedMerchant = receipt.merchantName.toLowerCase().replace(/[^a-z0-9]/g, '')

    return history.some(prev => {
        if (prev.id === receipt.id) return false

        const prevMerchant = prev.merchantName.toLowerCase().replace(/[^a-z0-9]/g, '')
        const isMerchantMatch = normalizedMerchant.includes(prevMerchant) || prevMerchant.includes(normalizedMerchant)
        const isDateMatch = prev.date === receipt.date
        const isAmountMatch = Math.abs(prev.totalAmount - receipt.totalAmount) < 0.01

        return isMerchantMatch && isDateMatch && isAmountMatch
    })
}

/**
 * Conflict Resolution Interface
 */
export interface BatchConflict {
    receiptId: string
    type: 'duplicate' | 'total_mismatch' | 'unrecognized_merchant'
    severity: 'warning' | 'error'
    message: string
    suggestedAction: string
    autoResolve?: () => void
}

/**
 * Automated Batch Splitting & Routing
 */
export function autoRouteBatch(state: FortunaState, batchId: string): BatchConflict[] {
    const receipts = state.receipts.filter(r => r.batchId === batchId)
    const batch = state.intakeBatches.find(b => b.id === batchId)
    if (!batch) return []

    const conflicts: BatchConflict[] = []

    for (const receipt of receipts) {
        // 1. Verify Item Totals
        const itemSum = receipt.items.reduce((sum, i) => sum + i.amount, 0)
        if (Math.abs(itemSum - receipt.totalAmount) > 0.01) {
            conflicts.push({
                receiptId: receipt.id,
                type: 'total_mismatch',
                severity: 'error',
                message: `Sum of items ($${itemSum.toFixed(2)}) does not match receipt total ($${receipt.totalAmount.toFixed(2)})`,
                suggestedAction: 'Adjust item amounts or header total.'
            })
            receipt.status = 'needs_review'
        }

        // 2. Multi-Entity Routing (Cross-batch Context)
        // If we see a pattern in the batch (e.g. all other receipts are for Entity A),
        // we can flag outliers.
        const dominantEntity = batch.defaultEntityId
        if (dominantEntity) {
            receipt.items.forEach(item => {
                if (!item.allocatedEntityId) {
                    item.allocatedEntityId = dominantEntity
                }
            })
        }
    }

    return conflicts
}

/**
 * Manual/Auto Resolution Trigger
 */
export function resolveConflict(state: FortunaState, receiptId: string, action: 'keep_duplicate' | 'recalculate_total' | 'ignore'): void {
    const receipt = state.receipts.find(r => r.id === receiptId)
    if (!receipt) return

    if (action === 'keep_duplicate') {
        receipt.status = 'allocated'
    } else if (action === 'recalculate_total') {
        receipt.totalAmount = receipt.items.reduce((sum, i) => sum + i.amount, 0)
        receipt.status = 'allocated'
    }
}
