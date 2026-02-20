import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processReceiptsAsync } from './receipt-engine'
import { categorizeReceiptAI } from './ai-categorization'
import type { FortunaState } from './storage'

// Mock the AI Bridge
vi.mock('./ai-categorization', () => ({
    categorizeReceiptAI: vi.fn()
}))

describe('AI-Driven Categorization', () => {
    let mockState: FortunaState

    beforeEach(() => {
        mockState = {
            receipts: [
                {
                    id: 'ambiguous-1',
                    merchantName: 'Home Depot',
                    date: '2026-02-15',
                    totalAmount: 45.00,
                    status: 'scanned',
                    items: [
                        { id: 'item-1', description: 'Hammer', amount: 45.00, status: 'scanned' }
                    ]
                }
            ],
            entities: [
                { id: 'biz-1', name: 'Real Estate LLC', type: 'business', notes: 'Rental property management', isActive: true }
            ],
            expenses: [],
            deductions: [],
            intakeBatches: []
        } as any
    })

    it('should use AI fallback when heuristics fail', async () => {
        // Setup AI mock response
        (categorizeReceiptAI as any).mockResolvedValue({
            receiptId: 'ambiguous-1',
            confidence: 'high',
            isBusiness: true,
            category: 'Equipment',
            suggestedEntityId: 'biz-1',
            reasoning: 'Tools for rental property maintenance',
            lineItemAllocations: [
                { itemId: 'item-1', category: 'Equipment', isBusiness: true }
            ]
        })

        const results = await processReceiptsAsync(mockState)
        
        expect(categorizeReceiptAI).toHaveBeenCalled()
        const receipt = mockState.receipts.find(r => r.id === 'ambiguous-1')
        expect(receipt?.status).toBe('allocated')
        expect(receipt?.items[0].allocatedEntityId).toBe('biz-1')
        expect(receipt?.items[0].inferredCategory).toBe('Equipment')
    })
})
