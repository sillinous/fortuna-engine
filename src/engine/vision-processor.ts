import { sendAIMessage, type ProviderId } from './ai-providers'
import { type DocumentType, type DocumentRecord, type ReceiptItem, genId } from './storage'

export interface VisionDocumentResult {
    success: boolean
    document?: DocumentRecord
    receiptItems?: ReceiptItem[] // Included if documentType === 'receipt'
    error?: string
    confidence: number
}

// Ensure the prompt guides the AI to output strictly structured JSON
// Pass 1: We combine categorization and extraction in a single prompt for latency/cost efficiency.
const VISION_SYSTEM_PROMPT = `You are a financial data extraction AI.
The user will provide an image of a document.
Auto-classify the document into ONE of these types: "receipt", "invoice", "tax_notice", "contract", "identity", or "not_applicable" (for blurry/irrelevant images).
Extract the relevant data and respond ONLY with a JSON object matching this schema:
{
  "documentType": "receipt|invoice|tax_notice|contract|identity|not_applicable",
  "documentDate": "YYYY-MM-DD",
  "summary": "Brief 1-sentence summary of the document",
  "confidenceScore": "number between 0 and 1",
  "metadata": {
     // IF documentType === 'receipt' OR 'invoice':
     "merchantName": "string",
     "totalAmount": "number",
     "taxAmount": "number or 0",
     "tipAmount": "number or 0",
     "lineItems": [
       { "description": "string", "amount": "number", "category": "best guess business category (e.g. Dining, Travel, Supplies)" }
     ],

     // IF documentType === 'tax_notice':
     "agency": "string (e.g., IRS, State Dept of Revenue)",
     "noticeNumber": "string",
     "taxYear": "string",
     "amountDue": "number",
     "actionRequired": "boolean",

     // IF documentType === 'contract' OR 'other':
     "keyParties": ["string"],
     "subject": "string"
  }
}
Do not include any conversational text or markdown formatting outside of the JSON block.`

export async function processDocumentImage(
    base64Image: string,
    provider: ProviderId = 'openrouter',
    model: string = 'google/gemini-2.0-flash-001' // Defaulting to a strong vision model
): Promise<VisionDocumentResult> {
    try {
        const response = await sendAIMessage(
            [
                { 
                    role: 'user', 
                    content: [
                        { type: 'text', text: 'Extract the document details from this image.' },
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
        
        // Convert to Fortuna DocumentRecord format
        const docId = genId()
        const documentType = (data.documentType as DocumentType) || 'other'
        const isReceiptLike = documentType === 'receipt' || documentType === 'invoice'

        const documentRecord: DocumentRecord = {
            id: docId,
            documentType,
            dateAdded: new Date().toISOString(),
            sourceFile: base64Image.substring(0, 50) + '...[truncated]', // We don't want to store full base64 in local state typically, but for this demo workflow, we handle it upstream
            summary: data.summary || 'Unclassified Document',
            status: 'needs_review',
            metadata: data.metadata || {}
        }

        // If it's a receipt/invoice, construct the line items array that `BatchProcessor` expects
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
            confidence: Number(data.confidenceScore) || 0.5
        }

    } catch (error: any) {
        console.error("Vision Processing Error:", error)
        return {
            success: false,
            error: error.message || "Failed to process document image.",
            confidence: 0
        }
    }
}
