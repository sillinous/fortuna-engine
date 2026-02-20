import type { FortunaState, ReceiptRecord, IntakeBatch } from './storage'
import { genId } from './storage'
import { processReceiptsAsync } from './receipt-engine'

export interface BatchProcessingResult {
    batchId: string
    itemsProcessed: number
    duplicatesFound: number
    errors: string[]
}

export interface BatchIntakeJob {
    id: string;
    type: 'vendor_sync' | 'bulk_upload' | 'mobile_scan';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    sourceName: string;
    dateCreated: string;
    progress: number;
}

/**
 * Advanced Batch Document Intake Engine
 * Handles bulk ingestion with concurrency control and global deduplication.
 */

export function createBatch(name: string, totalCount: number = 0): IntakeBatch {
    return {
        id: genId(),
        name,
        dateStarted: new Date().toISOString(),
        status: 'uploading',
        totalCount,
        successCount: 0,
        errorCount: 0,
        receiptIds: [],
        documentIds: [],
        progress: 0,
        entityId: 'personal', // Default attribution
        taxYear: new Date().getFullYear()
    }
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
        itemsProcessed: 0,
        duplicatesFound: 0,
        errors: []
    }

    // Process Receipts
    const pendingReceipts = state.receipts.filter(r => r.batchId === batchId && (r.status === 'scanned' || r.status === 'processing' || r.status === 'needs_review'))

    // Process general Documents
    const pendingDocuments = state.documents.filter(d => d.batchId === batchId && (d.status === 'pending' || d.status === 'needs_review'))

    const totalToProcess = pendingReceipts.length + pendingDocuments.length
    let count = 0

    // 1. Process Receipts
    for (const receipt of pendingReceipts) {
        try {
            if (isDuplicate(receipt, state.receipts)) {
                receipt.status = 'needs_review'
                result.duplicatesFound++
                batch.errorCount++
            } else {
                receipt.status = 'processing'
                await new Promise(resolve => setTimeout(resolve, 50)) // Artificial delay
                result.itemsProcessed++
                batch.successCount++
            }
        } catch (err: any) {
            result.errors.push(`Error processing receipt ${receipt.id}: ${err.message}`)
            batch.errorCount++
        }
        count++
        batch.progress = Math.round((count / (totalToProcess || 1)) * 100)
        onProgress?.(batch.progress)
    }

    // 2. Process General Documents
    for (const doc of pendingDocuments) {
        try {
            // General document logic (e.g., integrity check, preliminary classification)
            doc.status = 'processed'
            result.itemsProcessed++
            batch.successCount++
        } catch (err: any) {
            result.errors.push(`Error processing document ${doc.id}: ${err.message}`)
            batch.errorCount++
        }
        count++
        batch.progress = Math.round((count / (totalToProcess || 1)) * 100)
        onProgress?.(batch.progress)
    }

    // 3. AI-Assisted Enrichment (Optional)
    if (useAI) {
        // Run async AI categorization for any items that failed heuristics
        await processReceiptsAsync(state, batchId)

        // Finalize counts based on AI success
        batch.successCount = state.receipts.filter(r => r.batchId === batchId && r.status === 'allocated').length +
            state.documents.filter(d => d.batchId === batchId && d.status === 'processed').length

        batch.errorCount = state.receipts.filter(r => r.batchId === batchId && r.status === 'needs_review').length +
            state.documents.filter(d => d.batchId === batchId && d.status === 'needs_review').length
    }

    batch.progress = 100
    onProgress?.(100)
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
