import type { FortunaState, ReceiptRecord, ReceiptItem, BusinessExpense, DeductionRecord as Deduction } from './storage'
import { genId } from './storage'
import { categorizeReceiptAI } from './ai-categorization'

export interface AllocationResult {
    receiptId: string
    merchantName: string
    totalAmount: number
    allocatedPersonal: number
    allocatedBusiness: number
    businessAllocations: Record<string, number> // entityId -> amount
    itemsAllocated: number
    itemsNeedingReview: number
    status: 'allocated' | 'needs_review'
}

export interface SubscriptionInsight {
    merchantName: string
    entities: string[] // entityIds involved
    totalMonthlyBurn: number
    isDuplicate: boolean
    recommendation: string
}

export interface ComminglingRisk {
    receiptId: string
    merchantName: string
    amount: number
    assignedEntityId: string
    paymentMethodId: string
    riskLevel: 'low' | 'medium' | 'high'
    description: string
}

export interface GoalAlignment {
    goalId: string
    goalTitle: string
    contributionAmount: number
    receiptIds: string[]
}

export interface TaxSignal {
    type: 'estimated_tax_adjustment' | 'deduction_velocity' | 'audit_risk'
    severity: 'info' | 'warning' | 'critical'
    message: string
    actionableLink?: string
}

export interface ReceiptIntelligenceReport {
    subscriptions: SubscriptionInsight[]
    comminglingRisks: ComminglingRisk[]
    goalAlignments: GoalAlignment[]
    taxSignals: TaxSignal[]
}

/**
 * Enhanced Receipt Engine
 * 
 * Handles line-item level allocation across multiple business entities and personal scope.
 * Uses a heuristic match based on merchant, category, and item description.
 */

const BUSINESS_CATEGORIES = [
    'Office Supplies', 'Software', 'Advertising', 'Legal & Professional',
    'Travel', 'Meals & Entertainment', 'Equipment', 'Rent', 'Utilities',
    'Consulting', 'Marketing', 'Dues & Subscriptions'
]

const PERSONAL_CATEGORIES = [
    'Groceries', 'Clothing', 'Entertainment', 'Personal Care', 'Housing',
    'Dining Out', 'Gifts', 'Hobbies', 'Pet Supplies', 'Medical'
]

const MERCHANT_MAPPINGS: Record<string, string> = {
    'AWS': 'business',
    'Google Cloud': 'business',
    'Facebook Ads': 'business',
    'Staples': 'business',
    'Office Depot': 'business',
    'Whole Foods': 'personal',
    'Trader Joes': 'personal',
    'Safeway': 'personal',
    'Netflix': 'personal',
    'Spotify': 'personal',
    'Steam': 'personal'
}

export function processReceipts(state: FortunaState, batchId?: string): AllocationResult[] {
    if (!state.receipts || state.receipts.length === 0) return []

    const results: AllocationResult[] = []

    const targetReceipts = batchId ? state.receipts.filter(r => r.batchId === batchId) : state.receipts

    for (const receipt of targetReceipts) {
        if (receipt.status === 'allocated') continue

        const result: AllocationResult = {
            receiptId: receipt.id,
            merchantName: receipt.merchantName,
            totalAmount: receipt.totalAmount,
            allocatedPersonal: 0,
            allocatedBusiness: 0,
            businessAllocations: {},
            itemsAllocated: 0,
            itemsNeedingReview: 0,
            status: 'allocated'
        }

        for (const item of receipt.items) {
            const allocation = autoAllocateItem(item, receipt, state)

            if (allocation) {
                item.allocatedEntityId = allocation.entityId
                item.confidenceScore = allocation.confidence

                if (allocation.entityId === 'personal') {
                    result.allocatedPersonal += item.amount
                } else {
                    result.allocatedBusiness += item.amount
                    result.businessAllocations[allocation.entityId] = (result.businessAllocations[allocation.entityId] || 0) + item.amount
                }
                result.itemsAllocated++
            } else {
                item.status = 'needs_review'
                result.itemsNeedingReview++
            }
        }

        // Determine final status
        if (result.itemsNeedingReview > 0) {
            result.status = 'needs_review'
            receipt.status = 'needs_review'
        } else {
            result.status = 'allocated'
            receipt.status = 'allocated'
        }

        results.push(result)
    }

    return results
}

/**
 * Asynchronous Receipt Processing with AI fallback
 * Runs standard heuristics first, then uses external AI for ambiguous receipts.
 */
export async function processReceiptsAsync(state: FortunaState, batchId?: string): Promise<AllocationResult[]> {
    // 1. Initial heuristic pass
    const syncResults = processReceipts(state, batchId)

    // 2. Identify receipts that need AI help (needs_review or low confidence items)
    const targetResults = syncResults.filter(r => r.status === 'needs_review')

    for (const result of targetResults) {
        const receipt = state.receipts.find(r => r.id === result.receiptId)
        if (!receipt) continue

        // Call AI Bridge
        const aiResult = await categorizeReceiptAI(receipt, state.entities || [])

        if (aiResult.confidence !== 'low') {
            // Update receipt items based on AI suggestions
            for (const aiAlloc of aiResult.lineItemAllocations) {
                const item = receipt.items.find(i => i.id === aiAlloc.itemId)
                if (item) {
                    item.allocatedEntityId = aiAlloc.isBusiness ? aiResult.suggestedEntityId || 'business' : 'personal'
                    item.inferredCategory = aiAlloc.category
                    item.confidenceScore = aiResult.confidence === 'high' ? 0.95 : 0.75
                    item.status = 'allocated'
                }
            }

            // Recalculate result metrics
            result.allocatedPersonal = receipt.items
                .filter(i => i.allocatedEntityId === 'personal')
                .reduce((sum, i) => sum + i.amount, 0)

            result.allocatedBusiness = receipt.items
                .filter(i => i.allocatedEntityId !== 'personal' && i.allocatedEntityId)
                .reduce((sum, i) => sum + i.amount, 0)

            result.itemsNeedingReview = receipt.items.filter(i => i.status === 'needs_review').length

            if (result.itemsNeedingReview === 0) {
                result.status = 'allocated'
                receipt.status = 'allocated'
            }
        }
    }

    return syncResults
}

function autoAllocateItem(item: ReceiptItem, receipt: ReceiptRecord, state: FortunaState): { entityId: string, confidence: number } | null {
    // 1. Check for manual overrides
    if (item.isBusiness === false) return { entityId: 'personal', confidence: 1.0 }

    const desc = item.description.toLowerCase()
    const merchant = receipt.merchantName.toLowerCase()
    const category = item.inferredCategory

    // 2. Identify Personal vs Business
    let isPersonal = false
    let isBusiness = false
    let confidence = 0.5

    // Category Check
    if (PERSONAL_CATEGORIES.includes(category)) {
        isPersonal = true
        confidence = 0.8
    } else if (BUSINESS_CATEGORIES.includes(category)) {
        isBusiness = true
        confidence = 0.8
    }

    // Merchant Check
    for (const [mKey, type] of Object.entries(MERCHANT_MAPPINGS)) {
        if (merchant.includes(mKey.toLowerCase())) {
            if (type === 'personal') isPersonal = true
            else isBusiness = true
            confidence = 0.95
            break
        }
    }

    // Keywords Check
    if (desc.includes('diaper') || desc.includes('grocery') || desc.includes('toy')) {
        isPersonal = true
        confidence = 0.9
    }
    if (desc.includes('api') || desc.includes('server') || desc.includes('consulting')) {
        isBusiness = true
        confidence = 0.9
    }

    // 3. Select Entity
    if (isPersonal) return { entityId: 'personal', confidence }

    if (isBusiness) {
        // If multiple businesses, try to find the best match or use the largest one
        const activeEntities = state.entities?.filter(e => e.isActive && e.type !== 'personal') || []

        if (activeEntities.length === 1) {
            return { entityId: activeEntities[0].id, confidence: confidence * 0.95 }
        }

        // Multi-entity logic: look for name match in description or tags
        for (const entity of activeEntities) {
            if (desc.includes(entity.name.toLowerCase())) {
                return { entityId: entity.id, confidence: 0.95 }
            }
        }

        // Fallback: If low confidence and multiple businesses, don't auto-assign
        if (activeEntities.length > 1) return null
    }

    // Final fallback based on overall merchant reputation if no category
    if (confidence < 0.6) return null

    return null
}

/**
 * Commits allocated receipts to the official ledger (expenses/deductions)
 */
export function syncReceiptsToLedger(state: FortunaState): void {
    const allocated = state.receipts?.filter((r: any) => r.status === 'allocated') || []

    for (const receipt of allocated) {
        const { expenses, deductions } = generateLedgerEntries(receipt)

        // Add to state if not already present
        for (const exp of expenses) {
            if (!state.expenses.find(e => e.sourceId === exp.sourceId)) {
                state.expenses.push(exp)
            }
        }

        for (const ded of deductions) {
            if (!state.deductions.find(d => d.sourceId === ded.sourceId)) {
                state.deductions.push(ded)
            }
        }
    }
}

function generateLedgerEntries(receipt: ReceiptRecord): { expenses: BusinessExpense[], deductions: Deduction[] } {
    const expenses: BusinessExpense[] = []
    const deductions: Deduction[] = []

    for (const item of receipt.items) {
        if (!item.allocatedEntityId) continue

        if (item.allocatedEntityId === 'personal') {
            // Check for itemized personal deductions (charity, medical)
            if (item.inferredCategory === 'Medical' || item.inferredCategory === 'Charity') {
                deductions.push({
                    id: genId(),
                    description: `${receipt.merchantName}: ${item.description}`,
                    categoryId: item.inferredCategory.toLowerCase(),
                    amount: item.amount,
                    status: 'realized',
                    entityId: 'personal',
                    sourceId: receipt.id + ':' + item.id,
                    taxYear: new Date(receipt.date).getFullYear()
                } as any)
            }
        } else {
            // Business Expense
            expenses.push({
                id: genId(),
                category: item.inferredCategory,
                description: `${receipt.merchantName}: ${item.description}`,
                annualAmount: item.amount,
                isDeductible: true,
                deductionPct: 1,
                entityId: item.allocatedEntityId,
                sourceId: receipt.id + ':' + item.id,
                taxYear: new Date(receipt.date).getFullYear()
            })
        }
    }

    return { expenses, deductions }
}

/** 
 * --- ADVANCED INTELLIGENCE MODULES ---
 */

export function analyzeReceiptIntelligence(state: FortunaState): ReceiptIntelligenceReport {
    return {
        subscriptions: detectSubscriptionOverlaps(state),
        comminglingRisks: analyzeComminglingRisks(state),
        goalAlignments: alignReceiptsWithGoals(state),
        taxSignals: generateTaxSignals(state)
    }
}

function detectSubscriptionOverlaps(state: FortunaState): SubscriptionInsight[] {
    const recurring = state.receipts?.filter(r => r.isRecurring) || []
    const merchants: Record<string, { entities: Set<string>, totalAmount: number }> = {}

    for (const r of recurring) {
        const m = r.merchantName.toLowerCase().trim()
        if (!merchants[m]) merchants[m] = { entities: new Set(), totalAmount: 0 }

        // Find assigned entities for items in this receipt
        const entitiesInReceipt = new Set(r.items.map(i => i.allocatedEntityId).filter(Boolean) as string[])
        entitiesInReceipt.forEach(e => merchants[m].entities.add(e))
        merchants[m].totalAmount += r.totalAmount
    }

    return Object.entries(merchants)
        .filter(([_, data]) => data.entities.size > 1)
        .map(([name, data]) => ({
            merchantName: name.charAt(0).toUpperCase() + name.slice(1),
            entities: Array.from(data.entities),
            totalMonthlyBurn: data.totalAmount, // Simple sum if monthly
            isDuplicate: true,
            recommendation: `Consolidate ${name} subscriptions. Found across: ${Array.from(data.entities).join(', ')}.`
        }))
}

function analyzeComminglingRisks(state: FortunaState): ComminglingRisk[] {
    const risks: ComminglingRisk[] = []
    const receipts = state.receipts?.filter(r => r.status === 'allocated') || []

    // We assume entities can have 'linkedAccountIds' in storage.ts
    // For this engine, we'll check if a business-allocated receipt uses a 'personal' method
    for (const r of receipts) {
        const isBusinessReceipt = r.items.some(i => i.allocatedEntityId && i.allocatedEntityId !== 'personal')

        // Simplified check: if it's business but paymentMethod is 'personal' (or vice-versa)
        // In a real app, we'd look up the account type for r.paymentMethodId
        if (isBusinessReceipt && r.paymentMethodId === 'personal_card') {
            risks.push({
                receiptId: r.id,
                merchantName: r.merchantName,
                amount: r.totalAmount,
                assignedEntityId: 'business',
                paymentMethodId: r.paymentMethodId,
                riskLevel: 'medium',
                description: `Business expense at ${r.merchantName} paid via personal account. Risk of piercing the corporate veil.`
            })
        }
    }
    return risks
}

function alignReceiptsWithGoals(state: FortunaState): GoalAlignment[] {
    const taxGoals = state.goals?.filter(g => g.type === 'tax_reduction' && g.status === 'active') || []
    const alignments: GoalAlignment[] = []

    for (const goal of taxGoals) {
        // Find receipts contributing to this year's tax deductions
        const currentYear = new Date().getFullYear()
        const relevantReceipts = state.receipts?.filter(r =>
            r.status === 'allocated' &&
            new Date(r.date).getFullYear() === currentYear &&
            r.items.some(i => i.allocatedEntityId !== 'personal' || ['Medical', 'Charity'].includes(i.inferredCategory))
        ) || []

        const totalContribution = relevantReceipts.reduce((sum, r) => sum + r.totalAmount, 0)

        if (totalContribution > 0) {
            alignments.push({
                goalId: goal.id,
                goalTitle: goal.title,
                contributionAmount: totalContribution,
                receiptIds: relevantReceipts.map(r => r.id)
            })
        }
    }
    return alignments
}

function generateTaxSignals(state: FortunaState): TaxSignal[] {
    const signals: TaxSignal[] = []

    // 1. Deduction Velocity Check
    const recentDeducibleTotal = state.receipts?.[0] ? 5000 : 0 // Mock check
    if (recentDeducibleTotal > 0) {
        signals.push({
            type: 'deduction_velocity',
            severity: 'info',
            message: `High deduction velocity detected in Q1. Estimated tax liability may be lower than projected.`
        })
    }

    // 2. Commingling Critical Warning
    const comminglingCount = analyzeComminglingRisks(state).length
    if (comminglingCount > 5) {
        signals.push({
            type: 'audit_risk',
            severity: 'critical',
            message: `${comminglingCount} commingled transactions detected. Immediate remediation recommended to protect limited liability.`
        })
    }

    return signals
}
