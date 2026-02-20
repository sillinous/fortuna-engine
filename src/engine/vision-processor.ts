import { sendAIMessage, type ProviderId } from './ai-providers'
import { processBatch, type BatchProcessingResult } from './batch-intake'
import { genId, type FortunaState } from '../hooks/useFortuna'

export interface VisionReceiptResult {
    success: boolean
    receipt?: any // Parsed receipt record
    error?: string
    confidence: number
}

// Ensure the prompt guides the AI to output strictly structured JSON
const VISION_SYSTEM_PROMPT = `You are a financial data extraction AI.
The user will provide an image of a receipt.
Extract the data and respond ONLY with a JSON object matching this schema:
{
  "merchantName": "string",
  "date": "YYYY-MM-DD",
  "totalAmount": "number format (e.g. 15.40)",
  "taxAmount": "number or 0",
  "tipAmount": "number or 0",
  "lineItems": [
    {
      "description": "string",
      "amount": "number",
      "category": "string (best guess business category, e.g. Meals, Supplies, Travel)"
    }
  ],
  "confidenceScore": "number between 0 and 1"
}
Do not include any conversational text or markdown formatting outside of the JSON block.`

export async function processReceiptImage(
    base64Image: string,
    state: FortunaState,
    provider: ProviderId = 'openrouter',
    model: string = 'google/gemini-2.0-flash-001' // Defaulting to a strong vision model
): Promise<VisionReceiptResult> {
    try {
        const response = await sendAIMessage(
            [
                { 
                    role: 'user', 
                    content: [
                        { type: 'text', text: 'Extract the receipt details from this image.' },
                        { type: 'image_url', image_url: { url: base64Image } }
                    ]
                }
            ],
            VISION_SYSTEM_PROMPT,
            {
                mode: 'proxy', // Always prefer proxy for server keys
                provider,
                model,
                clientKeys: {}
            }
        )

        // Parse the JSON
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error("AI failed to return valid JSON structure.")
        }

        const data = JSON.parse(jsonMatch[0])
        
        // Convert to Fortuna ReceiptRecord format
        const receiptRecord = {
            id: genId(),
            date: data.date || new Date().toISOString().split('T')[0],
            merchantName: data.merchantName || 'Unknown Vendor',
            totalAmount: Number(data.totalAmount) || 0,
            taxAmount: Number(data.taxAmount) || 0,
            tip: Number(data.tipAmount) || 0,
            status: 'needs_review', // Default to review for safety
            category: 'Uncategorized', // Let the heuristic/AI bridge handle final categorization
            batchId: 'mobile-capture-session', // Temporary batch ID
            items: (data.lineItems || []).map((item: any) => ({
                id: genId(),
                description: item.description || 'Item',
                amount: Number(item.amount) || 0,
                inferredCategory: item.category || 'Uncategorized',
                status: 'pending'
            }))
        }

        return {
            success: true,
            receipt: receiptRecord,
            confidence: Number(data.confidenceScore) || 0.5
        }

    } catch (error: any) {
        console.error("Vision Processing Error:", error)
        return {
            success: false,
            error: error.message || "Failed to process receipt image.",
            confidence: 0
        }
    }
}
