import { sendAIMessage, type ProviderId } from './ai-providers'
import { type DocumentType, type DocumentRecord, type ReceiptItem, genId } from './storage'

export interface VisionDocumentResult {
    success: boolean
    document?: DocumentRecord
    receiptItems?: ReceiptItem[] // Included if documentType === 'receipt'
    fullImage?: string           // The original high-res image
    isContinuation: boolean      // Whether this image belongs to the previous document
    error?: string
    confidence: number
}

const VISION_SYSTEM_PROMPT = `You are a financial data extraction AI.
The user will provide an image of a document.
If 'previousContext' is provided, determine if this image is a continuation (next page) of that document or a brand new document.

Auto-classify the document into ONE of these types: "receipt", "invoice", "tax_notice", "contract", "identity", or "not_applicable" (for blurry/irrelevant images).
Extract the relevant data and respond ONLY with a JSON object matching this schema:
{
  "isContinuation": boolean, // REQUIRED: true if this is Page 2+ of the previous document
  "documentType": "receipt|invoice|tax_notice|contract|identity|not_applicable",
  "documentDate": "YYYY-MM-DD",
  "summary": "Brief 1-sentence summary of the document",
  "confidenceScore": "number between 0 and 1",
  "deductionSignals": ["list of potential tax deductions found, e.g. home office, vehicle, travel"],
  "metadata": {
     // IF documentType === 'receipt' OR 'invoice':
     "merchantName": "string",
     "totalAmount": "number",
     "taxAmount": "number or 0",
     "tipAmount": "number or 0",
     "lineItems": [
       { "description": "string", "amount": "number", "category": "best guess business category (e.g. Dining, Travel, Supplies)" }
     ],
     ...
  }
}
Do not include any conversational text outside the JSON block.`

/** Generates a low-res thumbnail from base64 image */
export async function createThumbnail(base64: string, maxWidth = 200): Promise<string> {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') return resolve('') // Node environment safety
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            const ratio = img.height / img.width
            canvas.width = maxWidth
            canvas.height = maxWidth * ratio
            const ctx = canvas.getContext('2d')
            if (!ctx) return resolve(base64.substring(0, 100)) 
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            resolve(canvas.toDataURL('image/jpeg', 0.6))
        }
        img.onerror = () => resolve('')
        img.src = base64
    })
}

export async function processDocumentImage(
    base64Image: string,
    provider: ProviderId = 'openrouter',
    model: string = 'google/gemini-2.0-flash-001',
    previousContext?: { summary: string; type: string; merchant?: string }
): Promise<VisionDocumentResult> {
    try {
        const thumbnailPromise = createThumbnail(base64Image)

        const contextText = previousContext
            ? `\nPREVIOUS DOCUMENT CONTEXT:\nType: ${previousContext.type}\nMerchant: ${previousContext.merchant || 'N/A'}\nSummary: ${previousContext.summary}\nDoes this new image look like the next page of the document described above?`
            : "This is the first document in the current stream."

        const response = await sendAIMessage(
            [
                { 
                    role: 'user', 
                    content: [
                        { type: 'text', text: `Extract the document details from this image. ${contextText}` },
                        { type: 'image_url', image_url: { url: base64Image } }
                    ]
                }
            ],
            VISION_SYSTEM_PROMPT,
            {
                mode: 'proxy',
                provider,
                model,
                clientKeys: {}
            }
        )

        const thumbnail = await thumbnailPromise
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("AI failed to return valid JSON structure.")

        const data = JSON.parse(jsonMatch[0])
        const docId = genId()
        const documentType = (data.documentType as DocumentType) || 'other'
        const isReceiptLike = documentType === 'receipt' || documentType === 'invoice'

        const documentRecord: DocumentRecord = {
            id: docId,
            documentType,
            dateAdded: new Date().toISOString(),
            pages: [`blob:${docId}`],
            pageThumbnails: [thumbnail],
            pageCount: 1,
            summary: data.summary || 'Unclassified Document',
            status: 'needs_review',
            metadata: {
                ...(data.metadata || {}),
                deductionSignals: data.deductionSignals || []
            },
            batchId: undefined
        }

        let receiptItems: ReceiptItem[] | undefined = undefined;
        if (isReceiptLike && data.metadata && Array.isArray(data.metadata.lineItems)) {
            receiptItems = data.metadata.lineItems.map((item: any) => ({
                id: genId(),
                description: item.description || 'Item',
                amount: Number(item.amount) || 0,
                inferredCategory: item.category || 'Uncategorized',
                status: 'pending'
            }))
        }

        return {
            success: true,
            document: documentRecord,
            receiptItems,
            fullImage: base64Image,
            isContinuation: !!data.isContinuation,
            confidence: Number(data.confidenceScore) || 0.5
        }

    } catch (error: any) {
        console.error("Vision Processing Error:", error)
        return {
            success: false,
            error: error.message || "Failed to process document image.",
            isContinuation: false,
            confidence: 0
        }
    }
}
