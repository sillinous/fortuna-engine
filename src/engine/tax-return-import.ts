/**
 * FORTUNA ENGINE — Tax Return Import v1
 * 
 * Extracts structured data from tax return PDFs (digitally-generated).
 * Uses PDF.js text layer extraction + pattern matching for:
 *   - Form 1040 (lines 1-37, AGI, taxable income, total tax)
 *   - Schedule C (business income/expenses)
 *   - Schedule D (capital gains summary)
 *   - Schedule SE (self-employment tax)
 *   - W-2 (wage statements)
 *   - Schedule 1 (additional income/adjustments)
 *
 * Note: This handles digitally-generated PDFs (TurboTax, H&R Block, 
 * IRS e-file). For scanned paper returns, OCR (Tesseract) would be
 * needed — that's a Phase 2 enhancement.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExtractedReturn {
  taxYear: number | null
  filingStatus: string | null
  forms: ExtractedForm[]
  summary: ReturnSummary
  rawText: string
  confidence: number // 0-100
  warnings: string[]
}

export interface ExtractedForm {
  formType: FormType
  fields: Record<string, ExtractedField>
  pageNumbers: number[]
  confidence: number
}

export interface ExtractedField {
  label: string
  value: string | number | null
  line?: string       // e.g., "Line 11" 
  confidence: number  // 0-100
  rawText?: string
}

export type FormType = '1040' | 'schedule_c' | 'schedule_d' | 'schedule_se' | 'w2' | 'schedule_1' | 'schedule_e' | '8949'

export interface ReturnSummary {
  // From 1040
  grossIncome: number | null
  agi: number | null
  taxableIncome: number | null
  totalTax: number | null
  totalPayments: number | null
  refundOrOwed: number | null
  filingStatus: string | null
  // From Schedule C
  businessIncome: number | null
  businessExpenses: number | null
  netBusinessProfit: number | null
  // From Schedule D
  shortTermGainLoss: number | null
  longTermGainLoss: number | null
  // From Schedule SE
  selfEmploymentTax: number | null
  // From W-2
  wagesTotal: number | null
  federalWithheld: number | null
  // Computed
  estimatedMarginalRate: number | null
  estimatedEffectiveRate: number | null
}

// ─── PDF Text Extraction (uses pdf.js) ──────────────────────────────────────

export async function extractTextFromPDF(file: File): Promise<{ pages: string[]; fullText: string }> {
  // Dynamic import of pdf.js from CDN
  const pdfjsLib = await loadPDFJS()
  
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    pages.push(pageText)
  }
  
  return { pages, fullText: pages.join('\n--- PAGE BREAK ---\n') }
}

async function loadPDFJS(): Promise<any> {
  // Check if already loaded
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.onload = () => {
      const lib = (window as any).pdfjsLib
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      resolve(lib)
    }
    script.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(script)
  })
}

// ─── Pattern Matching Engine ────────────────────────────────────────────────

function extractNumber(text: string, ...patterns: RegExp[]): { value: number | null; confidence: number; raw: string } {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const raw = match[1] || match[0]
      const cleaned = raw.replace(/[$,\s()]/g, '').replace(/^\((.+)\)$/, '-$1')
      const num = parseFloat(cleaned)
      if (!isNaN(num)) {
        return { value: num, confidence: 85, raw }
      }
    }
  }
  return { value: null, confidence: 0, raw: '' }
}

function extractString(text: string, ...patterns: RegExp[]): { value: string | null; confidence: number } {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return { value: (match[1] || match[0]).trim(), confidence: 80 }
  }
  return { value: null, confidence: 0 }
}

// ─── Form 1040 Parser ───────────────────────────────────────────────────────

function parse1040(text: string): ExtractedForm | null {
  // Detect if this is a 1040
  if (!text.match(/Form\s*1040|U\.?S\.?\s*Individual\s*Income\s*Tax\s*Return|Department of the Treasury/i)) {
    return null
  }

  const fields: Record<string, ExtractedField> = {}

  // Filing status
  const statusPatterns: [RegExp, string][] = [
    [/Single/i, 'single'],
    [/Married\s*filing\s*jointly/i, 'mfj'],
    [/Married\s*filing\s*separately/i, 'mfs'],
    [/Head\s*of\s*household/i, 'hoh'],
    [/Qualifying\s*(surviving\s*)?spouse/i, 'qss'],
  ]
  for (const [pattern, status] of statusPatterns) {
    if (text.match(pattern)) {
      fields.filingStatus = { label: 'Filing Status', value: status, confidence: 75 }
      break
    }
  }

  // Tax year
  const yearMatch = text.match(/(?:Tax\s*Year|for\s*the\s*year)\s*(\d{4})/i) || text.match(/20(2[0-9])\s*(?:Form|1040)/i)
  if (yearMatch) {
    const yr = yearMatch[1].length === 2 ? 2000 + parseInt(yearMatch[1]) : parseInt(yearMatch[1])
    fields.taxYear = { label: 'Tax Year', value: yr, confidence: 90 }
  }

  // Key 1040 lines
  const linePatterns: [string, string, RegExp[]][] = [
    ['line1', 'Wages, salaries, tips (Line 1)', [/(?:Line\s*1[a-z]?\b|Wages,?\s*salaries)[\s.:]*\$?\s*([\d,]+\.?\d*)/i, /1[a-z]?\s+[\w\s]+\$?\s*([\d,]+\.?\d*)/]],
    ['line2b', 'Taxable interest (Line 2b)', [/(?:Line\s*2b|Taxable\s*interest)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line3b', 'Qualified dividends (Line 3b)', [/(?:Line\s*3b|Qualified\s*dividends)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line7', 'Capital gain/loss (Line 7)', [/(?:Line\s*7|Capital\s*gain)[\s.:]*\$?\s*-?([\d,]+\.?\d*)/i]],
    ['line8', 'Other income (Line 8)', [/(?:Line\s*8[^0-9]|Other\s*income.*Schedule\s*1)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line9', 'Total income (Line 9)', [/(?:Line\s*9|Total\s*income)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line10', 'Adjustments (Line 10)', [/(?:Line\s*10|Adjustments\s*to\s*income)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line11', 'AGI (Line 11)', [/(?:Line\s*11|Adjusted\s*gross\s*income)[\s.:]*\$?\s*([\d,]+\.?\d*)/i, /AGI[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line12', 'Standard/Itemized deduction (Line 12)', [/(?:Line\s*12|Standard\s*deduction|Itemized\s*deduction)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line13', 'QBI deduction (Line 13)', [/(?:Line\s*13|Qualified\s*business\s*income)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line15', 'Taxable income (Line 15)', [/(?:Line\s*15|Taxable\s*income)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line16', 'Tax (Line 16)', [/(?:Line\s*16\b)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line24', 'Total tax (Line 24)', [/(?:Line\s*24|Total\s*tax)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line25d', 'Federal tax withheld (Line 25d)', [/(?:Line\s*25d|Federal.*withheld|tax\s*withheld)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line33', 'Total payments (Line 33)', [/(?:Line\s*33|Total\s*payments)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line34', 'Overpaid/Refund (Line 34)', [/(?:Line\s*34|Overpaid|Amount.*refunded)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['line37', 'Amount owed (Line 37)', [/(?:Line\s*37|Amount.*owe)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
  ]

  for (const [key, label, patterns] of linePatterns) {
    const result = extractNumber(text, ...patterns)
    if (result.value !== null) {
      fields[key] = { label, value: result.value, line: key, confidence: result.confidence, rawText: result.raw }
    }
  }

  const fieldCount = Object.keys(fields).length
  if (fieldCount < 3) return null // Not enough data to be a valid 1040

  return {
    formType: '1040',
    fields,
    pageNumbers: [1, 2],
    confidence: Math.min(95, 50 + fieldCount * 5),
  }
}

// ─── Schedule C Parser ──────────────────────────────────────────────────────

function parseScheduleC(text: string): ExtractedForm | null {
  if (!text.match(/Schedule\s*C|Profit\s*or\s*Loss\s*[Ff]rom\s*Business/i)) return null

  const fields: Record<string, ExtractedField> = {}

  const patterns: [string, string, RegExp[]][] = [
    ['grossReceipts', 'Gross receipts (Line 1)', [/(?:Line\s*1|Gross\s*receipts)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['grossIncome', 'Gross income (Line 7)', [/(?:Line\s*7|Gross\s*income)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['totalExpenses', 'Total expenses (Line 28)', [/(?:Line\s*28|Total\s*expenses)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['netProfit', 'Net profit/loss (Line 31)', [/(?:Line\s*31|Net\s*profit|Net\s*loss)[\s.:]*\$?\s*-?([\d,]+\.?\d*)/i]],
    ['advertising', 'Advertising (Line 8)', [/(?:Line\s*8|Advertising)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['carExpense', 'Car/truck expenses (Line 9)', [/(?:Line\s*9|Car.*expense|Vehicle)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['depreciation', 'Depreciation (Line 13)', [/(?:Line\s*13|Depreciation)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['insurance', 'Insurance (Line 15)', [/(?:Line\s*15\b|Insurance.*business)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['officeExpense', 'Office expense (Line 18)', [/(?:Line\s*18|Office\s*expense)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['rent', 'Rent/lease (Line 20b)', [/(?:Line\s*20|Rent|Lease)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['utilities', 'Utilities (Line 25)', [/(?:Line\s*25|Utilities)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['homeOffice', 'Home office (Line 30)', [/(?:Line\s*30|business\s*use\s*of\s*home|Home\s*office)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['businessName', 'Business name', [/(?:Business\s*name|Name\s*of\s*proprietor)[\s.:]*([A-Za-z][\w\s&.,'-]+)/i]],
  ]

  for (const [key, label, pats] of patterns) {
    const result = key === 'businessName' ? { value: extractString(text, ...pats).value, confidence: 70 } : (() => { const r = extractNumber(text, ...pats); return { value: r.value, confidence: r.confidence } })()
    if (result.value !== null) {
      fields[key] = { label, value: result.value, confidence: result.confidence }
    }
  }

  if (Object.keys(fields).length < 2) return null

  return { formType: 'schedule_c', fields, pageNumbers: [], confidence: Math.min(90, 40 + Object.keys(fields).length * 6) }
}

// ─── Schedule D Parser ──────────────────────────────────────────────────────

function parseScheduleD(text: string): ExtractedForm | null {
  if (!text.match(/Schedule\s*D|Capital\s*Gains\s*and\s*Losses/i)) return null

  const fields: Record<string, ExtractedField> = {}

  const patterns: [string, string, RegExp[]][] = [
    ['shortTermGL', 'Short-term gain/loss (Line 7)', [/(?:Line\s*7|Net\s*short.?term)[\s.:]*\$?\s*\(?([\d,]+\.?\d*)\)?/i]],
    ['longTermGL', 'Long-term gain/loss (Line 15)', [/(?:Line\s*15|Net\s*long.?term)[\s.:]*\$?\s*\(?([\d,]+\.?\d*)\)?/i]],
    ['totalGL', 'Total capital gain/loss (Line 16)', [/(?:Line\s*16\b)[\s.:]*\$?\s*\(?([\d,]+\.?\d*)\)?/i]],
    ['form8949ST', 'Form 8949 short-term total', [/8949.*short.?term.*\$?\s*\(?([\d,]+\.?\d*)\)?/i]],
    ['form8949LT', 'Form 8949 long-term total', [/8949.*long.?term.*\$?\s*\(?([\d,]+\.?\d*)\)?/i]],
  ]

  for (const [key, label, pats] of patterns) {
    const result = extractNumber(text, ...pats)
    if (result.value !== null) {
      fields[key] = { label, value: result.value, confidence: result.confidence }
    }
  }

  if (Object.keys(fields).length < 1) return null
  return { formType: 'schedule_d', fields, pageNumbers: [], confidence: Math.min(85, 40 + Object.keys(fields).length * 10) }
}

// ─── Schedule SE Parser ─────────────────────────────────────────────────────

function parseScheduleSE(text: string): ExtractedForm | null {
  if (!text.match(/Schedule\s*SE|Self.?Employment\s*Tax/i)) return null

  const fields: Record<string, ExtractedField> = {}

  const patterns: [string, string, RegExp[]][] = [
    ['netEarnings', 'Net SE earnings (Line 4)', [/(?:Line\s*4|Net\s*earnings|net\s*self.?employment)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['seTax', 'Self-employment tax (Line 12)', [/(?:Line\s*12|Self.?employment\s*tax)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['deductibleHalf', 'Deductible half (Line 13)', [/(?:Line\s*13|Deductible\s*part|one.?half)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
  ]

  for (const [key, label, pats] of patterns) {
    const result = extractNumber(text, ...pats)
    if (result.value !== null) {
      fields[key] = { label, value: result.value, confidence: result.confidence }
    }
  }

  if (Object.keys(fields).length < 1) return null
  return { formType: 'schedule_se', fields, pageNumbers: [], confidence: Math.min(85, 40 + Object.keys(fields).length * 12) }
}

// ─── W-2 Parser ─────────────────────────────────────────────────────────────

function parseW2(text: string): ExtractedForm | null {
  if (!text.match(/Form\s*W.?2|Wage\s*and\s*Tax\s*Statement/i)) return null

  const fields: Record<string, ExtractedField> = {}

  const patterns: [string, string, RegExp[]][] = [
    ['wages', 'Wages (Box 1)', [/(?:Box\s*1|Wages,?\s*tips)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['fedWithheld', 'Federal tax withheld (Box 2)', [/(?:Box\s*2|Federal.*withheld)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['ssWages', 'Social security wages (Box 3)', [/(?:Box\s*3|Social\s*security\s*wages)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['ssTax', 'SS tax withheld (Box 4)', [/(?:Box\s*4|Social\s*security\s*tax)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['medicareWages', 'Medicare wages (Box 5)', [/(?:Box\s*5|Medicare\s*wages)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['medicareTax', 'Medicare tax (Box 6)', [/(?:Box\s*6|Medicare\s*tax)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['stateWages', 'State wages (Box 16)', [/(?:Box\s*16|State\s*wages)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['stateWithheld', 'State tax withheld (Box 17)', [/(?:Box\s*17|State.*tax.*withheld)[\s.:]*\$?\s*([\d,]+\.?\d*)/i]],
    ['employer', 'Employer name', [/(?:Employer.?s?\s*name|[Bb]ox\s*[Cc])[\s.:]*([A-Za-z][\w\s&.,'-]+)/i]],
  ]

  for (const [key, label, pats] of patterns) {
    const result = key === 'employer' ? { value: extractString(text, ...pats).value, confidence: 70 } : (() => { const r = extractNumber(text, ...pats); return { value: r.value, confidence: r.confidence } })()
    if (result.value !== null) {
      fields[key] = { label, value: result.value, confidence: result.confidence }
    }
  }

  if (Object.keys(fields).length < 2) return null
  return { formType: 'w2', fields, pageNumbers: [], confidence: Math.min(90, 40 + Object.keys(fields).length * 6) }
}

// ─── Main Import Orchestrator ───────────────────────────────────────────────

export async function importTaxReturn(file: File): Promise<ExtractedReturn> {
  const warnings: string[] = []
  
  // Extract text from PDF
  let pages: string[] = []
  let fullText = ''
  
  try {
    const extracted = await extractTextFromPDF(file)
    pages = extracted.pages
    fullText = extracted.fullText
  } catch (err) {
    return {
      taxYear: null, filingStatus: null, forms: [],
      summary: emptySummary(),
      rawText: '', confidence: 0,
      warnings: [`Failed to extract text from PDF: ${err instanceof Error ? err.message : String(err)}. This may be a scanned document — OCR support coming in Phase 2.`],
    }
  }

  if (fullText.trim().length < 50) {
    return {
      taxYear: null, filingStatus: null, forms: [],
      summary: emptySummary(),
      rawText: fullText, confidence: 0,
      warnings: ['PDF contains very little text. This may be a scanned image — OCR support coming in Phase 2.'],
    }
  }

  // Parse each form type
  const forms: ExtractedForm[] = []
  
  const f1040 = parse1040(fullText)
  if (f1040) forms.push(f1040)
  
  const schC = parseScheduleC(fullText)
  if (schC) forms.push(schC)
  
  const schD = parseScheduleD(fullText)
  if (schD) forms.push(schD)
  
  const schSE = parseScheduleSE(fullText)
  if (schSE) forms.push(schSE)
  
  const w2 = parseW2(fullText)
  if (w2) forms.push(w2)

  if (forms.length === 0) {
    warnings.push('Could not identify any standard tax forms in this PDF. Ensure this is a US federal tax return.')
  }

  // Build summary
  const summary = buildSummary(forms)
  
  // Extract tax year
  const taxYear = f1040?.fields.taxYear?.value as number | null ||
    (() => { const m = fullText.match(/20(2[0-9])/); return m ? 2000 + parseInt(m[1]) : null })()

  const filingStatus = f1040?.fields.filingStatus?.value as string | null

  const overallConfidence = forms.length > 0
    ? Math.round(forms.reduce((s, f) => s + f.confidence, 0) / forms.length)
    : 0

  return {
    taxYear,
    filingStatus,
    forms,
    summary,
    rawText: fullText,
    confidence: overallConfidence,
    warnings,
  }
}

// ─── Summary Builder ────────────────────────────────────────────────────────

function buildSummary(forms: ExtractedForm[]): ReturnSummary {
  const f1040 = forms.find(f => f.formType === '1040')
  const schC = forms.find(f => f.formType === 'schedule_c')
  const schD = forms.find(f => f.formType === 'schedule_d')
  const schSE = forms.find(f => f.formType === 'schedule_se')
  const w2 = forms.find(f => f.formType === 'w2')

  const val = (form: ExtractedForm | undefined, key: string): number | null => {
    const v = form?.fields[key]?.value
    return typeof v === 'number' ? v : null
  }

  const grossIncome = val(f1040, 'line9')
  const agi = val(f1040, 'line11')
  const taxableIncome = val(f1040, 'line15')
  const totalTax = val(f1040, 'line24')

  const estimatedMarginalRate = taxableIncome && taxableIncome > 0
    ? estimateMarginalRate(taxableIncome)
    : null

  const estimatedEffectiveRate = grossIncome && totalTax && grossIncome > 0
    ? Math.round((totalTax / grossIncome) * 10000) / 10000
    : null

  return {
    grossIncome,
    agi,
    taxableIncome,
    totalTax,
    totalPayments: val(f1040, 'line33'),
    refundOrOwed: val(f1040, 'line34') || val(f1040, 'line37'),
    filingStatus: f1040?.fields.filingStatus?.value as string | null,
    businessIncome: val(schC, 'grossReceipts'),
    businessExpenses: val(schC, 'totalExpenses'),
    netBusinessProfit: val(schC, 'netProfit'),
    shortTermGainLoss: val(schD, 'shortTermGL'),
    longTermGainLoss: val(schD, 'longTermGL'),
    selfEmploymentTax: val(schSE, 'seTax'),
    wagesTotal: val(w2, 'wages') || val(f1040, 'line1'),
    federalWithheld: val(w2, 'fedWithheld') || val(f1040, 'line25d'),
    estimatedMarginalRate,
    estimatedEffectiveRate,
  }
}

function estimateMarginalRate(taxableIncome: number): number {
  // 2024 single brackets
  if (taxableIncome <= 11600) return 0.10
  if (taxableIncome <= 47150) return 0.12
  if (taxableIncome <= 100525) return 0.22
  if (taxableIncome <= 191950) return 0.24
  if (taxableIncome <= 243725) return 0.32
  if (taxableIncome <= 609350) return 0.35
  return 0.37
}

function emptySummary(): ReturnSummary {
  return {
    grossIncome: null, agi: null, taxableIncome: null, totalTax: null,
    totalPayments: null, refundOrOwed: null, filingStatus: null,
    businessIncome: null, businessExpenses: null, netBusinessProfit: null,
    shortTermGainLoss: null, longTermGainLoss: null,
    selfEmploymentTax: null, wagesTotal: null, federalWithheld: null,
    estimatedMarginalRate: null, estimatedEffectiveRate: null,
  }
}

// ─── Fortuna Pre-fill Helper ────────────────────────────────────────────────

export function preFillFortunaFromReturn(result: ExtractedReturn): Record<string, any> {
  const s = result.summary
  const prefill: Record<string, any> = {}
  
  if (s.filingStatus) prefill.filingStatus = s.filingStatus
  if (s.wagesTotal) prefill.w2Income = s.wagesTotal
  if (s.netBusinessProfit) prefill.scheduleCIncome = s.netBusinessProfit
  if (s.businessExpenses) prefill.businessExpenses = s.businessExpenses
  if (s.shortTermGainLoss !== null) prefill.shortTermCapGains = s.shortTermGainLoss
  if (s.longTermGainLoss !== null) prefill.longTermCapGains = s.longTermGainLoss
  if (s.selfEmploymentTax) prefill.priorYearSETax = s.selfEmploymentTax
  if (s.totalTax) prefill.priorYearTotalTax = s.totalTax
  if (s.agi) prefill.priorYearAGI = s.agi
  if (s.federalWithheld) prefill.priorYearWithholding = s.federalWithheld
  if (result.taxYear) prefill.priorTaxYear = result.taxYear
  
  return prefill
}
