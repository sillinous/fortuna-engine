import { describe, it, expect, vi } from 'vitest'
import { createThumbnail, processDocumentImage } from './vision-processor'

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
      // Mocking the AI response
      const mockState = { profile: {}, entities: [] } as any
      const result = await processDocumentImage('data:image/png;base64,mock', mockState)
      
      expect(result).toHaveProperty('thumbnail')
    })
  })
})
