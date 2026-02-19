/**
 * Fortuna Engine v5 - Data Import Pipeline
 * CSV/OFX bank statement parsing with intelligent auto-categorization.
 * Bridges the gap between manual entry and real financial data.
 */

import { genId, type IncomeStream, type BusinessExpense } from './storage'

// ==================== Types ====================

export interface RawTransaction {
  date: string
  description: string
  amount: number // positive = credit/income, negative = debit/expense
  category?: string
  memo?: string
  checkNumber?: string
  fitId?: string
}

export interface CategorizedTransaction extends RawTransaction {
  autoCategory: TransactionCategory
  confidence: number // 0-1
  isIncome: boolean
  suggestedType?: IncomeStream['type'] | 'expense'
  suggestedExpenseCategory?: string
}

export type TransactionCategory =
  | 'business_income' | 'freelance_income' | 'salary' | 'investment_income' | 'rental_income' | 'other_income'
  | 'office_supplies' | 'software_subscriptions' | 'advertising' | 'travel' | 'meals' | 'vehicle' | 'insurance'
  | 'professional_services' | 'utilities' | 'rent_lease' | 'equipment' | 'education' | 'charitable'
  | 'health_medical' | 'bank_fees' | 'taxes_paid' | 'personal' | 'transfer' | 'unknown'

export interface ImportResult {
  transactions: CategorizedTransaction[]
  summary: {
    totalTransactions: number
    totalIncome: number
    totalExpenses: number
    dateRange: { start: string; end: string }
    topCategories: { category: string; amount: number; count: number }[]
    unclassified: number
  }
  suggestedIncomeStreams: Partial<IncomeStream>[]
  suggestedExpenses: Partial<BusinessExpense>[]
}

// ==================== CSV Parser ====================

export function parseCSV(csvContent: string): RawTransaction[] {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) return []
  
  // Detect header format
  const header = lines[0].toLowerCase()
  const transactions: RawTransaction[] = []
  
  // Common CSV formats from banks
  let dateCol = -1, descCol = -1, amountCol = -1, debitCol = -1, creditCol = -1, memoCol = -1, categoryCol = -1
  
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  
  headers.forEach((h, i) => {
    if (/^(date|posted|trans.*date|posting.*date)$/.test(h)) dateCol = i
    else if (/^(description|desc|payee|merchant|name|transaction)$/.test(h)) descCol = i
    else if (/^(amount|total|net)$/.test(h)) amountCol = i
    else if (/^(debit|withdrawal|charge)$/.test(h)) debitCol = i
    else if (/^(credit|deposit|payment)$/.test(h)) creditCol = i
    else if (/^(memo|note|reference)$/.test(h)) memoCol = i
    else if (/^(category|type|class)$/.test(h)) categoryCol = i
  })
  
  // Fallback: assume Date, Description, Amount
  if (dateCol === -1 && headers.length >= 3) { dateCol = 0; descCol = 1; amountCol = 2 }
  if (dateCol === -1 || descCol === -1) return []
  
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 2) continue
    
    const dateStr = cols[dateCol]?.trim()
    const desc = cols[descCol]?.trim()
    if (!dateStr || !desc) continue
    
    let amount = 0
    if (amountCol >= 0 && cols[amountCol]) {
      amount = parseAmount(cols[amountCol])
    } else if (debitCol >= 0 || creditCol >= 0) {
      const debit = debitCol >= 0 && cols[debitCol] ? parseAmount(cols[debitCol]) : 0
      const credit = creditCol >= 0 && cols[creditCol] ? parseAmount(cols[creditCol]) : 0
      amount = credit - Math.abs(debit)
    }
    
    transactions.push({
      date: normalizeDate(dateStr),
      description: desc,
      amount,
      category: categoryCol >= 0 ? cols[categoryCol]?.trim() : undefined,
      memo: memoCol >= 0 ? cols[memoCol]?.trim() : undefined,
    })
  }
  
  return transactions
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseAmount(str: string): number {
  const cleaned = str.replace(/[$,\s"]/g, '').replace(/\((.+)\)/, '-$1')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function normalizeDate(dateStr: string): string {
  // Try common formats
  const formats = [
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, // MM/DD/YYYY
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/, // YYYY-MM-DD
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,  // MM/DD/YY
  ]
  
  let match = dateStr.match(formats[0])
  if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
  
  match = dateStr.match(formats[1])
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  
  match = dateStr.match(formats[2])
  if (match) {
    const year = parseInt(match[3]) + (parseInt(match[3]) > 50 ? 1900 : 2000)
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
  }
  
  // Try Date.parse as last resort
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  
  return dateStr
}

// ==================== OFX/QFX Parser ====================

export function parseOFX(content: string): RawTransaction[] {
  const transactions: RawTransaction[] = []
  
  // OFX uses SGML-like tags
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match
  
  while ((match = stmtTrnRegex.exec(content)) !== null) {
    const block = match[1]
    
    const date = extractOFXField(block, 'DTPOSTED')
    const amount = extractOFXField(block, 'TRNAMT')
    const name = extractOFXField(block, 'NAME') || extractOFXField(block, 'MEMO')
    const memo = extractOFXField(block, 'MEMO')
    const fitId = extractOFXField(block, 'FITID')
    const checkNum = extractOFXField(block, 'CHECKNUM')
    
    if (date && amount && name) {
      transactions.push({
        date: formatOFXDate(date),
        description: name.trim(),
        amount: parseFloat(amount),
        memo: memo?.trim(),
        fitId,
        checkNumber: checkNum,
      })
    }
  }
  
  return transactions
}

function extractOFXField(block: string, field: string): string | null {
  // OFX can use either <TAG>value or <TAG>value</TAG>
  const regex1 = new RegExp(`<${field}>([^<\\n]+)`, 'i')
  const regex2 = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, 'i')
  const match = block.match(regex2) || block.match(regex1)
  return match ? match[1].trim() : null
}

function formatOFXDate(dateStr: string): string {
  // OFX dates: YYYYMMDD or YYYYMMDDHHMMSS
  if (dateStr.length >= 8) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
  }
  return dateStr
}

// ==================== Intelligent Auto-Categorization ====================

const CATEGORY_PATTERNS: { pattern: RegExp; category: TransactionCategory; type: string }[] = [
  // Income patterns
  { pattern: /\b(payroll|salary|direct deposit|ach credit|employer)\b/i, category: 'salary', type: 'w2' },
  { pattern: /\b(stripe|paypal|square|venmo.*business|invoice)\b/i, category: 'business_income', type: 'business' },
  { pattern: /\b(upwork|fiverr|freelanc|contract.*pay|1099)\b/i, category: 'freelance_income', type: 'freelance' },
  { pattern: /\b(dividend|interest.*earned|capital.*gain|etrade|schwab|vanguard|fidelity)\b/i, category: 'investment_income', type: 'investment' },
  { pattern: /\b(rent.*received|tenant|airbnb.*host|rental.*income)\b/i, category: 'rental_income', type: 'rental' },
  
  // Expense patterns - Software/Tech
  { pattern: /\b(github|aws|azure|google cloud|digitalocean|heroku|vercel|netlify|cloudflare)\b/i, category: 'software_subscriptions', type: 'expense' },
  { pattern: /\b(adobe|figma|canva|slack|zoom|microsoft 365|notion|asana|trello)\b/i, category: 'software_subscriptions', type: 'expense' },
  { pattern: /\b(openai|anthropic|copilot|chatgpt)\b/i, category: 'software_subscriptions', type: 'expense' },
  
  // Expense patterns - Office/Supplies
  { pattern: /\b(office depot|staples|amazon.*office|newegg|b&h photo)\b/i, category: 'office_supplies', type: 'expense' },
  { pattern: /\b(apple\.com|dell|lenovo|hp store)\b/i, category: 'equipment', type: 'expense' },
  
  // Expense patterns - Advertising/Marketing
  { pattern: /\b(google ads|facebook ads|meta ads|linkedin ads|twitter ads|mailchimp|sendinblue|constant contact)\b/i, category: 'advertising', type: 'expense' },
  
  // Expense patterns - Travel
  { pattern: /\b(airline|united|delta|american air|southwest|jetblue|hotel|marriott|hilton|airbnb|booking\.com|expedia)\b/i, category: 'travel', type: 'expense' },
  { pattern: /\b(uber|lyft|taxi|car rental|hertz|enterprise|national)\b/i, category: 'travel', type: 'expense' },
  
  // Expense patterns - Meals
  { pattern: /\b(restaurant|doordash|grubhub|ubereats|cafe|coffee|starbucks|dunkin)\b/i, category: 'meals', type: 'expense' },
  
  // Expense patterns - Vehicle
  { pattern: /\b(gas station|shell|exxon|chevron|bp|auto repair|jiffy lube|oil change|car wash)\b/i, category: 'vehicle', type: 'expense' },
  
  // Expense patterns - Insurance
  { pattern: /\b(insurance|geico|state farm|allstate|progressive|aetna|cigna|blue cross|united health)\b/i, category: 'insurance', type: 'expense' },
  
  // Expense patterns - Professional services
  { pattern: /\b(attorney|lawyer|legal|accountant|cpa|bookkeep|tax prep|consulting fee)\b/i, category: 'professional_services', type: 'expense' },
  
  // Expense patterns - Utilities
  { pattern: /\b(electric|power|gas.*utility|water.*utility|internet|comcast|verizon|at&t|t-mobile|spectrum)\b/i, category: 'utilities', type: 'expense' },
  
  // Expense patterns - Education
  { pattern: /\b(udemy|coursera|linkedin learning|pluralsight|o'reilly|book|tuition|seminar|conference|workshop)\b/i, category: 'education', type: 'expense' },
  
  // Expense patterns - Charitable
  { pattern: /\b(donation|charity|nonprofit|red cross|salvation army|church|tithe|offering)\b/i, category: 'charitable', type: 'expense' },
  
  // Expense patterns - Health
  { pattern: /\b(pharmacy|cvs|walgreens|doctor|hospital|medical|dental|vision|copay)\b/i, category: 'health_medical', type: 'expense' },
  
  // Expense patterns - Bank
  { pattern: /\b(bank fee|service charge|overdraft|wire fee|atm fee|monthly maintenance)\b/i, category: 'bank_fees', type: 'expense' },
  
  // Expense patterns - Taxes
  { pattern: /\b(irs|tax payment|estimated tax|state tax|1040-es|eftps)\b/i, category: 'taxes_paid', type: 'expense' },
  
  // Transfers (not income or expense)
  { pattern: /\b(transfer|xfer|zelle|venmo(?!.*business)|cash app(?!.*business))\b/i, category: 'transfer', type: 'transfer' },
]

export function categorizeTransactions(transactions: RawTransaction[]): CategorizedTransaction[] {
  return transactions.map(tx => {
    const isIncome = tx.amount > 0
    let bestMatch: { category: TransactionCategory; type: string; confidence: number } = {
      category: isIncome ? 'other_income' : 'unknown',
      type: isIncome ? 'other' : 'expense',
      confidence: 0.2,
    }
    
    // Try existing category if present
    if (tx.category) {
      const catLower = tx.category.toLowerCase()
      const mappedCat = mapBankCategory(catLower)
      if (mappedCat) {
        bestMatch = { category: mappedCat.category, type: mappedCat.type, confidence: 0.7 }
      }
    }
    
    // Try pattern matching on description
    for (const pattern of CATEGORY_PATTERNS) {
      if (pattern.pattern.test(tx.description)) {
        const confidence = 0.85
        if (confidence > bestMatch.confidence) {
          bestMatch = { category: pattern.category, type: pattern.type, confidence }
        }
        break
      }
    }
    
    // Also check memo
    if (tx.memo && bestMatch.confidence < 0.7) {
      for (const pattern of CATEGORY_PATTERNS) {
        if (pattern.pattern.test(tx.memo)) {
          bestMatch = { category: pattern.category, type: pattern.type, confidence: 0.65 }
          break
        }
      }
    }
    
    return {
      ...tx,
      autoCategory: bestMatch.category,
      confidence: bestMatch.confidence,
      isIncome: isIncome && bestMatch.type !== 'transfer',
      suggestedType: bestMatch.type === 'expense' ? 'expense' : bestMatch.type as IncomeStream['type'],
      suggestedExpenseCategory: !isIncome ? categoryToExpenseCategory(bestMatch.category) : undefined,
    }
  })
}

function mapBankCategory(cat: string): { category: TransactionCategory; type: string } | null {
  const mappings: Record<string, { category: TransactionCategory; type: string }> = {
    'income': { category: 'business_income', type: 'business' },
    'payroll': { category: 'salary', type: 'w2' },
    'food': { category: 'meals', type: 'expense' },
    'dining': { category: 'meals', type: 'expense' },
    'travel': { category: 'travel', type: 'expense' },
    'transportation': { category: 'vehicle', type: 'expense' },
    'shopping': { category: 'office_supplies', type: 'expense' },
    'entertainment': { category: 'personal', type: 'expense' },
    'health': { category: 'health_medical', type: 'expense' },
    'education': { category: 'education', type: 'expense' },
    'bills': { category: 'utilities', type: 'expense' },
    'transfer': { category: 'transfer', type: 'transfer' },
    'fee': { category: 'bank_fees', type: 'expense' },
  }
  
  for (const [key, val] of Object.entries(mappings)) {
    if (cat.includes(key)) return val
  }
  return null
}

function categoryToExpenseCategory(cat: TransactionCategory): string {
  const map: Record<string, string> = {
    office_supplies: 'Office Supplies',
    software_subscriptions: 'Software & Subscriptions',
    advertising: 'Advertising & Marketing',
    travel: 'Travel',
    meals: 'Meals & Entertainment',
    vehicle: 'Vehicle & Transportation',
    insurance: 'Insurance',
    professional_services: 'Professional Services',
    utilities: 'Utilities',
    rent_lease: 'Rent & Lease',
    equipment: 'Equipment',
    education: 'Education & Training',
    charitable: 'Charitable Contributions',
    health_medical: 'Health & Medical',
    bank_fees: 'Bank Fees',
    taxes_paid: 'Taxes Paid',
    personal: 'Personal (Non-Deductible)',
    transfer: 'Transfer (Non-Deductible)',
  }
  return map[cat] || 'Uncategorized'
}

// ==================== Import Result Builder ====================

export function processImport(transactions: RawTransaction[]): ImportResult {
  const categorized = categorizeTransactions(transactions)
  
  // Summary stats
  const incomeTransactions = categorized.filter(t => t.isIncome)
  const expenseTransactions = categorized.filter(t => !t.isIncome && t.autoCategory !== 'transfer')
  
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = Math.abs(expenseTransactions.reduce((sum, t) => sum + t.amount, 0))
  
  const dates = categorized.map(t => t.date).filter(Boolean).sort()
  
  // Category summary
  const categoryTotals = new Map<string, { amount: number; count: number }>()
  for (const tx of categorized) {
    if (tx.autoCategory === 'transfer') continue
    const existing = categoryTotals.get(tx.autoCategory) || { amount: 0, count: 0 }
    existing.amount += Math.abs(tx.amount)
    existing.count++
    categoryTotals.set(tx.autoCategory, existing)
  }
  
  const topCategories = Array.from(categoryTotals.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
  
  // Suggest income streams (aggregate by category)
  const incomeByType = new Map<string, number>()
  for (const tx of incomeTransactions) {
    const type = tx.suggestedType || 'other'
    incomeByType.set(type, (incomeByType.get(type) || 0) + tx.amount)
  }
  
  const suggestedIncomeStreams: Partial<IncomeStream>[] = Array.from(incomeByType.entries())
    .filter(([_, amount]) => amount > 500)
    .map(([type, amount]) => ({
      id: genId(),
      name: `Imported ${type.charAt(0).toUpperCase() + type.slice(1)} Income`,
      type: type as IncomeStream['type'],
      annualAmount: Math.round(amount * (12 / Math.max(1, getMonthSpan(dates)))),
      isActive: true,
    }))
  
  // Suggest expenses (aggregate by category)
  const expenseByCategory = new Map<string, number>()
  for (const tx of expenseTransactions) {
    const cat = tx.suggestedExpenseCategory || 'Uncategorized'
    expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + Math.abs(tx.amount))
  }
  
  const suggestedExpenses: Partial<BusinessExpense>[] = Array.from(expenseByCategory.entries())
    .filter(([cat, amount]) => amount > 100 && cat !== 'Personal (Non-Deductible)' && cat !== 'Transfer (Non-Deductible)')
    .map(([category, amount]) => ({
      id: genId(),
      category,
      description: `Imported: ${category}`,
      annualAmount: Math.round(amount * (12 / Math.max(1, getMonthSpan(dates)))),
      isDeductible: !category.includes('Non-Deductible'),
      deductionPct: category.includes('Meals') ? 50 : category.includes('Non-Deductible') ? 0 : 100,
    }))
  
  return {
    transactions: categorized,
    summary: {
      totalTransactions: categorized.length,
      totalIncome,
      totalExpenses,
      dateRange: { start: dates[0] || '', end: dates[dates.length - 1] || '' },
      topCategories,
      unclassified: categorized.filter(t => t.autoCategory === 'unknown' || t.confidence < 0.5).length,
    },
    suggestedIncomeStreams,
    suggestedExpenses,
  }
}

function getMonthSpan(sortedDates: string[]): number {
  if (sortedDates.length < 2) return 1
  const start = new Date(sortedDates[0])
  const end = new Date(sortedDates[sortedDates.length - 1])
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (30.44 * 86400000)))
}

// ==================== File Detection ====================

export function detectFileFormat(content: string): 'csv' | 'ofx' | 'unknown' {
  const trimmed = content.trim()
  if (trimmed.includes('<OFX>') || trimmed.includes('OFXHEADER:') || trimmed.includes('<STMTTRN>')) {
    return 'ofx'
  }
  // Check for CSV-like structure
  const firstLine = trimmed.split('\n')[0]
  if (firstLine.includes(',') && trimmed.split('\n').length > 1) {
    return 'csv'
  }
  return 'unknown'
}

export function importFromFile(content: string): ImportResult | { error: string } {
  const format = detectFileFormat(content)
  
  if (format === 'unknown') {
    return { error: 'Unrecognized file format. Please upload a CSV or OFX/QFX file.' }
  }
  
  const rawTransactions = format === 'csv' ? parseCSV(content) : parseOFX(content)
  
  if (rawTransactions.length === 0) {
    return { error: 'No transactions found in file. Check the file format and try again.' }
  }
  
  return processImport(rawTransactions)
}
