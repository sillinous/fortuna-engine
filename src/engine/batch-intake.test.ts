import { describe, it, expect } from 'vitest'
import { processBatch, autoRouteBatch } from './batch-intake'
import { createDefaultState } from './storage'
import type { FortunaState } from './storage'

describe('Batch Receipt Intake', () => {
    const mockState: FortunaState = {
        ...createDefaultState(),
        receipts: [
            {
                id: 'existing-1',
                merchantName: 'Starbucks',
                date: '2026-02-10',
                totalAmount: 5.50,
                items: [],
                status: 'allocated'
            } as any
        ],
        intakeBatches: [
            {
                id: 'batch-123',
                name: 'Trip to Seattle',
                status: 'uploading',
                receiptIds: ['new-1', 'new-2'],
                defaultEntityId: 'business-abc'
            } as any
        ]
    }

    it('should detect duplicates against history and mark them for review', async () => {
        const state = { 
            ...mockState, 
            receipts: [
                ...mockState.receipts!,
                {
                    id: 'new-1',
                    merchantName: 'Starbucks', // Duplicate
                    date: '2026-02-10',
                    totalAmount: 5.50,
                    batchId: 'batch-123',
                    status: 'scanned',
                    items: []
                } as any
            ]
        } as FortunaState

        const { draft, result } = await processBatch(state, 'batch-123')
        expect(result.duplicatesFound).toBe(1)
        expect(draft.receipts.find(r => r.id === 'new-1')?.status).toBe('needs_review')
    })

    it('should auto-route receipts to the batch default entity', () => {
        const state = {
            ...mockState,
            receipts: [
                {
                    id: 'new-2',
                    merchantName: 'Uber',
                    date: '2026-02-11',
                    totalAmount: 25.00,
                    batchId: 'batch-123',
                    status: 'scanned',
                    items: [{ id: 'i1', amount: 25.00, description: 'Ride' }]
                } as any
            ]
        } as FortunaState

        autoRouteBatch(state, 'batch-123')
        const receipt = state.receipts.find(r => r.id === 'new-2')
        expect(receipt?.items[0].allocatedEntityId).toBe('business-abc')
    })

    it('should detect total mismatches as conflicts', () => {
        const state = {
            ...mockState,
            receipts: [
                {
                    id: 'new-3',
                    merchantName: 'OfficeMax',
                    totalAmount: 100.00,
                    batchId: 'batch-123',
                    items: [
                        { id: 'i1', amount: 50.00, description: 'Paper' } // Only 50%
                    ]
                } as any
            ]
        } as FortunaState

        const conflicts = autoRouteBatch(state, 'batch-123')
        expect(conflicts.some(c => c.type === 'total_mismatch')).toBe(true)
        expect(state.receipts.find(r => r.id === 'new-3')?.status).toBe('needs_review')
    })
})
