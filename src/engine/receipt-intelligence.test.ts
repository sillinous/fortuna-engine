import { describe, it, expect } from 'vitest'
import { analyzeReceiptIntelligence } from './receipt-engine'
import type { FortunaState } from './storage'

describe('Receipt Intelligence', () => {
    const mockState: Partial<FortunaState> = {
        goals: [
            { id: 'goal-1', title: 'Reduce Tax Liability', type: 'tax_reduction', status: 'active' } as any
        ],
        receipts: [
            {
                id: 'r1',
                merchantName: 'Zoom',
                isRecurring: true,
                totalAmount: 14.99,
                date: '2026-02-15',
                status: 'allocated',
                paymentMethodId: 'personal_card',
                items: [
                    { id: 'i1', description: 'Zoom Pro', amount: 14.99, allocatedEntityId: 'personal' }
                ]
            } as any,
            {
                id: 'r2',
                merchantName: 'Zoom',
                isRecurring: true,
                totalAmount: 14.99,
                date: '2026-02-16',
                status: 'allocated',
                paymentMethodId: 'personal_card',
                items: [
                    { id: 'i1', description: 'Zoom Business', amount: 14.99, allocatedEntityId: 'entity-123' }
                ]
            } as any,
            {
                id: 'r3',
                merchantName: 'Best Buy',
                isRecurring: false,
                totalAmount: 1200.00,
                date: '2026-02-20',
                status: 'allocated',
                paymentMethodId: 'personal_card',
                items: [
                    { id: 'i3', description: 'Laptop', amount: 1200.00, allocatedEntityId: 'entity-123' }
                ]
            } as any
        ]
    }

    it('should detect subscription overlaps across entities', () => {
        const report = analyzeReceiptIntelligence(mockState as FortunaState)
        const zoomInsight = report.subscriptions.find(s => s.merchantName === 'Zoom')
        expect(zoomInsight).toBeDefined()
        expect(zoomInsight?.entities).toContain('personal')
        expect(zoomInsight?.entities).toContain('entity-123')
        expect(zoomInsight?.isDuplicate).toBe(true)
    })

    it('should identify commingling risks (business expense on personal card)', () => {
        const report = analyzeReceiptIntelligence(mockState as FortunaState)
        const commingling = report.comminglingRisks.find(r => r.merchantName === 'Best Buy')
        expect(commingling).toBeDefined()
        expect(commingling?.riskLevel).toBe('medium')
    })

    it('should align deductible receipts with active tax goals', () => {
        const report = analyzeReceiptIntelligence(mockState as FortunaState)
        const goalMatch = report.goalAlignments.find(a => a.goalTitle === 'Reduce Tax Liability')
        expect(goalMatch).toBeDefined()
        // Best Buy (1200) + Zoom Business (14.99)
        expect(goalMatch?.contributionAmount).toBeGreaterThan(1200)
    })
})
