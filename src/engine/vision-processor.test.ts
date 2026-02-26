import { describe, it, expect, vi } from 'vitest'
import { createThumbnail, processDocumentImage } from './vision-processor'
import * as aiProviders from './ai-providers'

vi.mock('./ai-providers', () => ({
  sendAIMessage: vi.fn()
}))

describe('vision-processor', () => {
  describe('createThumbnail', () => {
    it('should return a placeholder for invalid input', async () => {
      // In a real environment, this might use canvas-mock, but here we check the logic
      const thumb = await createThumbnail('')
      expect(thumb).toBeDefined()
    })
  })

  describe('processDocumentImage', () => {
    it('should include thumbnails in the result', async () => {
      vi.mocked(aiProviders.sendAIMessage).mockResolvedValue({
        text: JSON.stringify({
          documentType: 'receipt',
          summary: 'Test Receipt',
          confidenceScore: 0.9,
          metadata: { merchantName: 'Test Corp', totalAmount: 100 }
        })
      } as any)

      const mockState = { profile: {}, entities: [] } as any
      const result = await processDocumentImage('data:image/png;base64,mock', mockState)
      
      expect(result.document?.pageThumbnails).toBeDefined()
      expect(result.document?.pageThumbnails.length).toBeGreaterThan(0)
    })
  })
})
