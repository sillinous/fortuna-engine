/**
 * Fortuna Engine — AI Document Generation
 *
 * Connects the AI advisor to the document generator to produce
 * intelligent, personalized financial documents. This is the
 * "last mile" that turns data + AI into deliverables.
 *
 * Document types:
 *  - CPA Summary Letter — handoff package for accountant
 *  - Entity Recommendation — S-Corp / LLC analysis memo
 *  - Year-End Tax Plan — strategic action plan
 *  - Scenario Comparison — side-by-side narrative
 *  - Tax Strategy Brief — executive summary of position
 *  - Quarterly Review — progress + adjustments
 */

import type { FortunaState } from './storage'
import { generateTaxReport, calculateSCorpSavings, calculateMaxSEPIRA, calculateMaxSolo401k, type TaxReport } from './tax-calculator'
import { generateProactiveAlerts, getFinancialPulse, getQuarterContext } from './proactive-intelligence'
import { detectStrategies, analyzeRisks, calculateHealthScore } from './strategy-detector'
import { sendAIMessage, getAISettings, type ChatMessage, type AIResponse } from './ai-providers'

// ─── Types ────────────────────────────────────────────────────────────

export interface AIDocumentTemplate {
  id: string
  title: string
  description: string
  icon: string
  category: 'tax' | 'entity' | 'planning' | 'cpa' | 'strategy'
  estimatedMinutes: number
}

export interface GeneratedAIDocument {
  id: string
  templateId: string
  title: string
  content: string           // HTML content
  generatedAt: string
  aiProvider: string
  aiModel: string
  tokensUsed?: number
}

export type DocGenStatus = 'idle' | 'building-context' | 'generating' | 'complete' | 'error'

// ─── Available Templates ──────────────────────────────────────────────

export const AI_DOC_TEMPLATES: AIDocumentTemplate[] = [
  {
    id: 'cpa-letter',
    title: 'CPA Summary Letter',
    description: 'Professional handoff letter for your accountant with full financial snapshot, entity structure, strategy recommendations, and open questions.',
    icon: '📋',
    category: 'cpa',
    estimatedMinutes: 1,
  },
  {
    id: 'entity-memo',
    title: 'Entity Recommendation Memo',
    description: 'Detailed analysis comparing your current structure vs. alternatives (S-Corp, LLC, C-Corp) with specific dollar savings and compliance costs.',
    icon: '🏛️',
    category: 'entity',
    estimatedMinutes: 1,
  },
  {
    id: 'year-end-plan',
    title: 'Year-End Tax Action Plan',
    description: 'Prioritized list of tax-saving moves to execute before December 31, with deadlines, dollar impacts, and step-by-step instructions.',
    icon: '📅',
    category: 'planning',
    estimatedMinutes: 1,
  },
  {
    id: 'tax-brief',
    title: 'Tax Position Executive Brief',
    description: 'One-page executive summary of your tax position: income breakdown, effective rates, risk areas, and top optimization opportunities.',
    icon: '📊',
    category: 'tax',
    estimatedMinutes: 1,
  },
  {
    id: 'quarterly-review',
    title: 'Quarterly Financial Review',
    description: 'Review of the current quarter\'s financial performance, progress against goals, and recommended adjustments for the next quarter.',
    icon: '📈',
    category: 'strategy',
    estimatedMinutes: 1,
  },
  {
    id: 'scenario-comparison',
    title: 'Scenario Comparison Report',
    description: 'Plain-English comparison of your current financial path vs. optimized scenarios, with clear recommendations and trade-offs.',
    icon: '⚖️',
    category: 'strategy',
    estimatedMinutes: 1,
  },
]

// ─── Context Builder ──────────────────────────────────────────────────

function buildFinancialContext(state: FortunaState): string {
  const report = generateTaxReport(state)
  const alerts = generateProactiveAlerts(state)
  const pulse = getFinancialPulse(state)
  const ctx = getQuarterContext()
  const strategies = detectStrategies(state)
  const risks = analyzeRisks(state)
  const health = calculateHealthScore(state)

  const { profile, incomeStreams, expenses, deductions, entities } = state
  const activeIncome = incomeStreams.filter(s => s.isActive)
  const activeEntities = entities.filter(e => e.isActive)
  const activeExpenses = expenses.filter(e => e.isDeductible)

  const selfEmployment = activeIncome
    .filter(s => ['business', 'freelance'].includes(s.type))
    .reduce((s, i) => s + i.annualAmount, 0)

  const totalIncome = activeIncome.reduce((s, i) => s + i.annualAmount, 0)

  // S-Corp analysis if relevant
  let scorpAnalysis = ''
  if (selfEmployment > 40000) {
    const salary = Math.round(Math.max(selfEmployment * 0.5, Math.min(selfEmployment * 0.7, 80000)))
    const savings = calculateSCorpSavings(selfEmployment, salary)
    const maxSEP = calculateMaxSEPIRA(selfEmployment)
    const max401k = calculateMaxSolo401k(selfEmployment, profile.age)
    scorpAnalysis = `
S-CORP ANALYSIS:
  Current SE tax: $${savings.currentSETax.toLocaleString()}
  S-Corp SE tax (salary $${salary.toLocaleString()}): $${savings.sCorpSETax.toLocaleString()}
  Annual savings: $${savings.savings.toLocaleString()}
  Max SEP-IRA: $${Math.round(maxSEP).toLocaleString()}
  Max Solo 401(k): $${Math.round(max401k.total).toLocaleString()} (employee: $${Math.round(max401k.employeeDeferral).toLocaleString()} + employer: $${Math.round(max401k.employerContribution).toLocaleString()})`
  }

  return `
TAXPAYER PROFILE:
  Name: ${profile.name || 'Not specified'}
  Filing Status: ${profile.filingStatus}
  State: ${profile.state}
  Age: ${profile.age}
  Dependents: ${profile.dependents}

INCOME STREAMS (${activeIncome.length} active):
${activeIncome.map(s => `  - ${s.name}: $${s.annualAmount.toLocaleString()}/yr (${s.type})`).join('\n') || '  None entered'}

ENTITIES (${activeEntities.length} active):
${activeEntities.map(e => `  - ${e.name}: ${e.type} (${e.state})`).join('\n') || '  None — operating as sole proprietor'}

DEDUCTIONS:
${deductions.map(d => `  - ${d.name}: $${d.amount.toLocaleString()} (${d.category})`).join('\n') || '  None entered'}

DEDUCTIBLE EXPENSES:
${activeExpenses.map(e => `  - ${e.name}: $${e.annualAmount.toLocaleString()}/yr @ ${e.deductionPct}% deductible`).join('\n') || '  None entered'}

TAX CALCULATION:
  Gross Income: $${Math.round(report.grossIncome).toLocaleString()}
  AGI: $${Math.round(report.agi).toLocaleString()}
  Taxable Income: $${Math.round(report.taxableIncome).toLocaleString()}
  Federal Tax: $${Math.round(report.totalFederalTax).toLocaleString()}
  State Tax: $${Math.round(report.stateTax).toLocaleString()}
  SE Tax: $${Math.round(report.selfEmploymentTax).toLocaleString()}
  Total Tax: $${Math.round(report.totalTax).toLocaleString()}
  Effective Rate: ${report.effectiveRate.toFixed(1)}%
  Marginal Rate: ${report.marginalRate}%
  Net Income: $${Math.round(report.netIncome).toLocaleString()}
  Keep Rate: ${(100 - report.effectiveRate).toFixed(1)}%
${scorpAnalysis}

QUARTER CONTEXT:
  Current: Q${ctx.quarter} ${new Date().getFullYear()}
  Days left in quarter: ${ctx.daysLeftInQuarter}
  Days left in year: ${ctx.daysLeftInYear}
  Year progress: ${Math.round(ctx.yearProgress * 100)}%

HEALTH SCORE: ${health.score}/100 (${health.grade})
  ${health.factors.map(f => `${f.label}: ${f.score}/${f.maxScore}`).join(', ')}

FINANCIAL PULSE:
  ${pulse.headline}
  ${pulse.subheadline}
  Urgent alerts: ${pulse.urgentCount}
  Opportunities: ${pulse.opportunityCount}
  Estimated savings available: $${Math.round(pulse.estimatedSavingsAvailable).toLocaleString()}
  ${pulse.nextDeadline ? `Next deadline: ${pulse.nextDeadline.name} in ${pulse.nextDeadline.daysUntil} days` : ''}

ACTIVE ALERTS:
${alerts.slice(0, 8).map(a => `  [${a.severity.toUpperCase()}] ${a.title}: ${a.message.substring(0, 120)}...`).join('\n') || '  None'}

DETECTED STRATEGIES:
${strategies.slice(0, 6).map(s => `  [${s.priority}] ${s.title}: ${s.description.substring(0, 100)}...`).join('\n') || '  None detected'}

RISK FACTORS:
${risks.slice(0, 5).map(r => `  [${r.severity}] ${r.title}: ${r.description.substring(0, 100)}...`).join('\n') || '  None detected'}
`.trim()
}

// ─── Document Prompts ─────────────────────────────────────────────────

const DOC_PROMPTS: Record<string, (ctx: string) => { system: string; user: string }> = {
  'cpa-letter': (ctx) => ({
    system: `You are a senior tax strategist writing a professional letter to a CPA on behalf of a client. Write in a clear, professional tone that assumes the CPA is knowledgeable. Include specific numbers, actionable items, and flag anything that needs the CPA's expert judgment. Format the output as clean HTML with professional styling. Use <h2>, <h3>, <p>, <ul>, <li>, <table> tags as needed. Do NOT include <html>, <head>, or <body> tags — just the content div.`,
    user: `Write a comprehensive CPA handoff letter based on this client's financial data. Include:

1. Executive summary of the client's tax position
2. Income breakdown by source and type
3. Current entity structure and any recommended changes
4. Key deductions and potential gaps
5. Estimated tax liability and quarterly payment schedule
6. Top 3-5 strategy recommendations with dollar impacts
7. Risk areas that need CPA review
8. Open questions for the CPA to address

CLIENT DATA:
${ctx}

Format as a professional letter with sections. Include specific dollar amounts and percentages throughout.`,
  }),

  'entity-memo': (ctx) => ({
    system: `You are a tax advisory firm writing an internal analysis memo. Be precise with numbers, compare options objectively, and provide a clear recommendation. Include setup costs, ongoing compliance burden, and break-even timeline. Format as clean HTML content.`,
    user: `Write a detailed entity structure recommendation memo based on this client's data. Include:

1. Current structure analysis — what they have, how it's taxed
2. Option comparison table: Sole Prop vs LLC (disregarded) vs LLC (S-Corp) vs C-Corp
   - For each: total tax, SE/payroll tax, compliance cost, liability protection
3. Recommended structure with specific reasoning
4. Implementation timeline and steps
5. Ongoing compliance requirements
6. Risk factors and caveats
7. Dollar savings analysis for recommended structure vs. current

CLIENT DATA:
${ctx}

Be specific with dollar amounts. If S-Corp makes sense, specify the recommended reasonable salary and show the math.`,
  }),

  'year-end-plan': (ctx) => ({
    system: `You are a proactive financial planner creating an actionable year-end tax strategy document. Every item should have a specific deadline, dollar impact, and clear instructions. Prioritize by impact. Format as clean HTML content.`,
    user: `Create a year-end tax action plan based on this client's current position. Include:

1. Executive summary: Current position and total potential savings
2. Priority actions (ordered by impact):
   - For each: What to do, deadline, estimated tax savings, how to execute
3. Retirement contribution strategy before year-end
4. Deduction acceleration opportunities
5. Income deferral possibilities
6. Equipment/asset purchase analysis (Section 179)
7. Entity elections or changes to consider
8. Calendar view of remaining deadlines
9. Documents and information to gather

CLIENT DATA:
${ctx}

Be specific and actionable. Every recommendation should have a dollar amount and a deadline.`,
  }),

  'tax-brief': (ctx) => ({
    system: `You are writing a one-page executive brief for a busy business owner. Be concise, visual, and focus on the numbers that matter. Use tables and clean formatting. This should be scannable in under 2 minutes. Format as clean HTML content.`,
    user: `Create a one-page tax position executive brief based on this client's data. Include:

1. Financial snapshot: income, taxes, effective rate, net keep
2. Key metrics in a summary table
3. Biggest risk (one sentence)
4. Biggest opportunity (one sentence with dollar amount)
5. Next action item (specific, with deadline)
6. Health score and what's dragging it down
7. Quarter context — what needs attention NOW

CLIENT DATA:
${ctx}

Keep it to what fits on one page. Prioritize impact over completeness.`,
  }),

  'quarterly-review': (ctx) => ({
    system: `You are a CFO-level advisor writing a quarterly financial review. Be analytical, forward-looking, and tie everything back to actionable adjustments. Format as clean HTML content.`,
    user: `Write a quarterly financial review based on this client's current data. Include:

1. Quarter summary — where things stand
2. Income performance vs. annual trajectory
3. Tax liability tracking — on pace, ahead, or behind
4. Strategy implementation status — what's been done, what hasn't
5. Retirement savings progress
6. Risk factors that emerged or changed
7. Recommended adjustments for next quarter
8. Key deadlines in the upcoming quarter

CLIENT DATA:
${ctx}

Frame this as a periodic check-in. Highlight what changed and what needs attention.`,
  }),

  'scenario-comparison': (ctx) => ({
    system: `You are writing a clear, balanced comparison report. Present both current path and optimized path with specific numbers. Use tables for side-by-side comparison. Help the reader make an informed decision. Format as clean HTML content.`,
    user: `Write a scenario comparison report based on this client's data. Compare:

Scenario A: Current Path (status quo — no changes)
Scenario B: Optimized Path (implementing top recommended strategies)

Include for each scenario:
1. Total annual tax
2. Effective tax rate
3. Net take-home
4. Compliance costs
5. Risk level

Then:
6. Delta analysis — exact dollar difference
7. Break-even timeline for any upfront costs
8. Implementation complexity rating
9. Clear recommendation with reasoning
10. What they're leaving on the table if they stay on current path

CLIENT DATA:
${ctx}

Use a comparison table as the centerpiece. Make the savings crystal clear.`,
  }),
}

// ─── Document Styling ─────────────────────────────────────────────────

const DOC_STYLES = `
<style>
  .ai-doc { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a2e; line-height: 1.6; max-width: 800px; }
  .ai-doc h1 { font-size: 22px; color: #0a0e1a; border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-top: 0; }
  .ai-doc h2 { font-size: 17px; color: #1e293b; margin-top: 24px; margin-bottom: 8px; }
  .ai-doc h3 { font-size: 14px; color: #334155; margin-top: 16px; margin-bottom: 6px; }
  .ai-doc p { margin: 8px 0; font-size: 13px; }
  .ai-doc ul, .ai-doc ol { margin: 8px 0; padding-left: 20px; font-size: 13px; }
  .ai-doc li { margin-bottom: 4px; }
  .ai-doc table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
  .ai-doc th { text-align: left; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-weight: 600; color: #475569; }
  .ai-doc td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  .ai-doc tr:hover td { background: #fefce8; }
  .ai-doc .highlight { background: rgba(245,158,11,0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 0 6px 6px 0; margin: 12px 0; }
  .ai-doc .metric { display: inline-block; background: #f8fafc; padding: 3px 8px; border-radius: 4px; font-weight: 600; font-size: 13px; }
  .ai-doc .urgent { color: #dc2626; font-weight: 600; }
  .ai-doc .savings { color: #059669; font-weight: 600; }
  .ai-doc .generated-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
</style>`

// ─── Generate Document ────────────────────────────────────────────────

export async function generateAIDocument(
  templateId: string,
  state: FortunaState,
  onStatus?: (status: DocGenStatus) => void,
): Promise<GeneratedAIDocument> {
  const template = AI_DOC_TEMPLATES.find(t => t.id === templateId)
  if (!template) throw new Error(`Unknown template: ${templateId}`)

  const promptBuilder = DOC_PROMPTS[templateId]
  if (!promptBuilder) throw new Error(`No prompt defined for: ${templateId}`)

  // Phase 1: Build context
  onStatus?.('building-context')
  const financialContext = buildFinancialContext(state)

  // Phase 2: Build prompts
  const { system, user } = promptBuilder(financialContext)

  // Phase 3: Generate via AI
  onStatus?.('generating')
  const messages: ChatMessage[] = [{ role: 'user', content: user }]

  const response: AIResponse = await sendAIMessage(messages, system)

  // Phase 4: Wrap in styled document
  onStatus?.('complete')

  const now = new Date()
  const footer = `
    <div class="generated-footer">
      Generated by Fortuna Engine AI • ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      • Provider: ${response.provider}/${response.model}
      ${response.usage ? `• Tokens: ${(response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)}` : ''}
    </div>`

  const content = `${DOC_STYLES}<div class="ai-doc">${response.text}${footer}</div>`

  return {
    id: `aidoc-${templateId}-${Date.now()}`,
    templateId,
    title: `${template.title} — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    content,
    generatedAt: now.toISOString(),
    aiProvider: response.provider,
    aiModel: response.model,
    tokensUsed: response.usage
      ? (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0)
      : undefined,
  }
}

// ─── Storage ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'fortuna:ai-documents'

export function saveAIDocument(doc: GeneratedAIDocument): void {
  const docs = getAIDocuments()
  docs.unshift(doc)
  // Keep last 50
  if (docs.length > 50) docs.length = 50
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
}

export function getAIDocuments(): GeneratedAIDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function deleteAIDocument(id: string): void {
  const docs = getAIDocuments().filter(d => d.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
}
