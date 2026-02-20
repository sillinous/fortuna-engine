import type { ReceiptRecord, LegalEntity } from './storage'
import { sendAIMessage } from './ai-providers'

export interface AICategorizationResult {
    receiptId: string
    confidence: 'high' | 'medium' | 'low'
    isBusiness: boolean
    category: string // IRS Schedule C category
    suggestedEntityId?: string
    reasoning: string
    lineItemAllocations: Array<{
        itemId: string
        category: string
        isBusiness: boolean
    }>
}

/**
 * AI Categorization Bridge
 * Uses external LLMs to analyze receipt context against the user's business entities.
 */
export async function categorizeReceiptAI(
    receipt: ReceiptRecord,
    entities: LegalEntity[]
): Promise<AICategorizationResult> {
    const entityContext = entities.map(e => `${e.name} (${e.type}) - ${e.notes || 'No description'}`).join('\n')

    const systemPrompt = `
You are a Tax Strategist and CPA Assistant. 
Your goal is to categorize receipt data into IRS Schedule C categories and determine if they belong to a specific business entity or personal expenses.

Context of Business Entities:
${entityContext}

Output MUST be valid JSON.
`

    const userPrompt = `
Receipt JSON:
${JSON.stringify(receipt, null, 2)}

Analyze this receipt. 
1. Determine if it is likely a Business Expense (isBusiness: true/false).
2. Assign an IRS Category (e.g., "Office Supplies", "Meals & Entertainment", "Travel", "Utilities", "Professional Services").
3. Suggest the most likely Business Entity ID from the context if it matches a business purpose.
4. Provide a brief reasoning.

JSON Schema:
{
    "confidence": "high|medium|low",
    "isBusiness": boolean,
    "category": "string",
    "suggestedEntityId": "string",
    "reasoning": "string",
    "lineItemAllocations": [
        { "itemId": "string", "category": "string", "isBusiness": boolean }
    ]
}
`

    try {
        const response = await sendAIMessage([{ role: 'user', content: userPrompt }], systemPrompt)

        // Find JSON block in response
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON found in AI response")

        const result = JSON.parse(jsonMatch[0])

        return {
            receiptId: receipt.id,
            ...result
        }
    } catch (err) {
        console.error("AI Categorization Failed:", err)
        // Fallback to minimal result
        return {
            receiptId: receipt.id,
            confidence: 'low',
            isBusiness: false,
            category: 'Uncategorized',
            reasoning: 'AI analysis failed' + (err instanceof Error ? ': ' + err.message : ''),
            lineItemAllocations: []
        }
    }
}
