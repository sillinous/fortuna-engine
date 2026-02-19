/**
 * FORTUNA ENGINE — Document Vault v1
 * 
 * Secure document storage and organization:
 *   - Receipt/invoice upload with preview
 *   - Automatic categorization by type
 *   - Tax-relevant metadata extraction
 *   - Schedule C expense line mapping
 *   - Audit-ready folder structure
 *   - Search across all documents
 *   - Retention policy management
 *   - Export for CPA handoff
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VaultDocument {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  thumbnailDataUrl?: string   // base64 preview
  fullDataUrl?: string        // base64 full (for small files)
  category: DocumentCategory
  subcategory: string
  taxYear: number
  amount?: number
  vendor?: string
  date?: string               // transaction date
  uploadDate: string
  description: string
  tags: string[]
  scheduleCLine?: string      // e.g., "18" for office expense
  isDeductible: boolean
  deductionType?: 'business' | 'medical' | 'charitable' | 'education' | 'other'
  ocrText?: string            // extracted text
  notes: string
  archived: boolean
}

export type DocumentCategory =
  | 'receipt'
  | 'invoice'
  | 'tax_form'
  | 'bank_statement'
  | 'contract'
  | 'insurance'
  | 'medical'
  | 'property'
  | 'vehicle'
  | 'home_office'
  | 'education'
  | 'charitable'
  | 'retirement'
  | 'crypto'
  | 'other'

export interface VaultFolder {
  name: string
  category: DocumentCategory
  icon: string
  count: number
  totalAmount: number
}

export interface VaultStats {
  totalDocuments: number
  totalSize: number
  byCategory: Record<DocumentCategory, number>
  byYear: Record<number, number>
  totalDeductibleAmount: number
  untaggedCount: number
}

export interface VaultSearchResult {
  document: VaultDocument
  matchScore: number
  matchedFields: string[]
}

// ─── Category Metadata ──────────────────────────────────────────────────────

export const CATEGORY_META: Record<DocumentCategory, { label: string; icon: string; scheduleCLines: string[]; retentionYears: number }> = {
  receipt:        { label: 'Receipts',          icon: '🧾', scheduleCLines: ['8','9','10','17','18','21','22','25','27a'], retentionYears: 7 },
  invoice:        { label: 'Invoices',          icon: '📄', scheduleCLines: ['1'],           retentionYears: 7 },
  tax_form:       { label: 'Tax Forms',         icon: '📋', scheduleCLines: [],              retentionYears: 7 },
  bank_statement: { label: 'Bank Statements',   icon: '🏦', scheduleCLines: [],              retentionYears: 7 },
  contract:       { label: 'Contracts',         icon: '📝', scheduleCLines: ['11','17'],     retentionYears: 10 },
  insurance:      { label: 'Insurance',         icon: '🛡️', scheduleCLines: ['15'],          retentionYears: 7 },
  medical:        { label: 'Medical',           icon: '🏥', scheduleCLines: [],              retentionYears: 7 },
  property:       { label: 'Property',          icon: '🏠', scheduleCLines: ['20b','13'],    retentionYears: 10 },
  vehicle:        { label: 'Vehicle',           icon: '🚗', scheduleCLines: ['9'],           retentionYears: 7 },
  home_office:    { label: 'Home Office',       icon: '🖥️', scheduleCLines: ['30'],          retentionYears: 7 },
  education:      { label: 'Education',         icon: '🎓', scheduleCLines: [],              retentionYears: 7 },
  charitable:     { label: 'Charitable',        icon: '💝', scheduleCLines: [],              retentionYears: 7 },
  retirement:     { label: 'Retirement',        icon: '🏦', scheduleCLines: ['19'],          retentionYears: 10 },
  crypto:         { label: 'Crypto Records',    icon: '₿', scheduleCLines: [],              retentionYears: 7 },
  other:          { label: 'Other',             icon: '📁', scheduleCLines: [],              retentionYears: 7 },
}

// ─── Auto-Categorization ────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: [DocumentCategory, RegExp][] = [
  ['tax_form', /\b(W-?2|1099|1040|Schedule\s*[A-Z]|K-?1|8949|5498|1095)\b/i],
  ['receipt', /\b(receipt|purchase|order|transaction|paid|amount due)\b/i],
  ['invoice', /\b(invoice|bill|statement.*due|amount owed|pay by)\b/i],
  ['bank_statement', /\b(bank statement|account summary|beginning balance|ending balance)\b/i],
  ['insurance', /\b(insurance|policy|premium|coverage|deductible|claim)\b/i],
  ['medical', /\b(medical|health|doctor|hospital|pharmacy|prescription|copay|diagnosis)\b/i],
  ['vehicle', /\b(auto|vehicle|car|mileage|gas|fuel|oil change|repair.*vehicle)\b/i],
  ['home_office', /\b(home office|internet bill|utility|electric|water bill)\b/i],
  ['property', /\b(property tax|mortgage|deed|lease|rent.*office|real estate)\b/i],
  ['charitable', /\b(donation|charitable|501\(c\)|tax.?deductible.*contribution|nonprofit)\b/i],
  ['education', /\b(tuition|course|certification|training|conference|seminar|1098-T)\b/i],
  ['retirement', /\b(401k|IRA|pension|retirement|contribution.*retirement|5500)\b/i],
  ['crypto', /\b(bitcoin|ethereum|crypto|blockchain|wallet|exchange|staking|airdrop|token)\b/i],
  ['contract', /\b(agreement|contract|terms|engagement letter|scope of work|NDA)\b/i],
]

export function autoCategorizeDcoument(filename: string, ocrText?: string): { category: DocumentCategory; confidence: number } {
  const text = `${filename} ${ocrText || ''}`.toLowerCase()
  
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) {
      return { category, confidence: 75 }
    }
  }

  // File extension hints
  if (filename.match(/\.(pdf|PDF)$/)) return { category: 'other', confidence: 30 }
  if (filename.match(/\.(jpg|jpeg|png|webp|heic)/i)) return { category: 'receipt', confidence: 40 }

  return { category: 'other', confidence: 10 }
}

// ─── Amount Extraction ──────────────────────────────────────────────────────

export function extractAmount(text: string): number | null {
  // Look for total/amount patterns
  const patterns = [
    /(?:total|amount|due|paid|charge|grand total|balance)[\s:]*\$?\s*([\d,]+\.?\d{0,2})/i,
    /\$\s*([\d,]+\.\d{2})/,
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const num = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(num) && num > 0 && num < 10000000) return num
    }
  }
  return null
}

// ─── Vendor Extraction ──────────────────────────────────────────────────────

export function extractVendor(text: string): string | null {
  // Look for common vendor patterns
  const patterns = [
    /(?:from|merchant|vendor|payee|company)[\s:]*([A-Z][\w\s&.,'-]{2,40})/i,
    /^([A-Z][\w\s&.,'-]{2,30})\s*(?:\n|receipt|invoice|statement)/im,
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

// ─── Date Extraction ────────────────────────────────────────────────────────

export function extractDate(text: string): string | null {
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,              // MM/DD/YYYY
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,              // YYYY-MM-DD
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2}),?\s+(\d{4})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const d = new Date(match[0])
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
      } catch { /* continue */ }
    }
  }
  return null
}

// ─── Document Vault Manager ─────────────────────────────────────────────────

const VAULT_STORAGE_KEY = 'fortuna:document-vault'

export class DocumentVault {
  private documents: VaultDocument[] = []

  constructor() {
    this.load()
  }

  // ─── CRUD ─────────────────────────────────────────────────────────

  async addDocument(file: File, overrides?: Partial<VaultDocument>): Promise<VaultDocument> {
    const dataUrl = await this.fileToDataUrl(file)
    const thumbnail = file.type.startsWith('image/') ? await this.generateThumbnail(dataUrl) : undefined

    // Extract text for categorization (images would need OCR - placeholder)
    const ocrText = overrides?.ocrText || ''
    const { category, confidence } = autoCategorizeDcoument(file.name, ocrText)
    const amount = extractAmount(ocrText)
    const vendor = extractVendor(ocrText)
    const date = extractDate(ocrText)

    const doc: VaultDocument = {
      id: 'doc_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      thumbnailDataUrl: thumbnail,
      fullDataUrl: file.size < 5 * 1024 * 1024 ? dataUrl : undefined, // store < 5MB inline
      category: overrides?.category || category,
      subcategory: overrides?.subcategory || '',
      taxYear: overrides?.taxYear || new Date().getFullYear(),
      amount: overrides?.amount ?? amount ?? undefined,
      vendor: overrides?.vendor ?? vendor ?? undefined,
      date: overrides?.date ?? date ?? undefined,
      uploadDate: new Date().toISOString(),
      description: overrides?.description || file.name,
      tags: overrides?.tags || [],
      scheduleCLine: overrides?.scheduleCLine,
      isDeductible: overrides?.isDeductible ?? (confidence > 50),
      deductionType: overrides?.deductionType,
      ocrText,
      notes: overrides?.notes || '',
      archived: false,
    }

    this.documents.push(doc)
    this.save()
    return doc
  }

  updateDocument(id: string, updates: Partial<VaultDocument>) {
    const idx = this.documents.findIndex(d => d.id === id)
    if (idx >= 0) {
      this.documents[idx] = { ...this.documents[idx], ...updates }
      this.save()
    }
  }

  deleteDocument(id: string) {
    this.documents = this.documents.filter(d => d.id !== id)
    this.save()
  }

  getDocument(id: string): VaultDocument | undefined {
    return this.documents.find(d => d.id === id)
  }

  getAllDocuments(): VaultDocument[] {
    return [...this.documents].sort((a, b) => b.uploadDate.localeCompare(a.uploadDate))
  }

  // ─── Search ───────────────────────────────────────────────────────

  search(query: string): VaultSearchResult[] {
    const terms = query.toLowerCase().split(/\s+/)
    
    return this.documents
      .map(doc => {
        let matchScore = 0
        const matchedFields: string[] = []
        const searchable = [
          doc.filename, doc.description, doc.vendor || '', doc.notes,
          doc.ocrText || '', doc.tags.join(' '), doc.category,
        ].join(' ').toLowerCase()

        for (const term of terms) {
          if (searchable.includes(term)) {
            matchScore += 10
            if (doc.filename.toLowerCase().includes(term)) matchedFields.push('filename')
            if (doc.vendor?.toLowerCase().includes(term)) matchedFields.push('vendor')
            if (doc.description.toLowerCase().includes(term)) matchedFields.push('description')
            if (doc.ocrText?.toLowerCase().includes(term)) matchedFields.push('content')
          }
        }

        return { document: doc, matchScore, matchedFields }
      })
      .filter(r => r.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)
  }

  // ─── Filtering ────────────────────────────────────────────────────

  getByCategory(category: DocumentCategory): VaultDocument[] {
    return this.documents.filter(d => d.category === category && !d.archived)
  }

  getByYear(year: number): VaultDocument[] {
    return this.documents.filter(d => d.taxYear === year && !d.archived)
  }

  getDeductibleDocuments(year: number): VaultDocument[] {
    return this.documents.filter(d => d.isDeductible && d.taxYear === year && !d.archived)
  }

  getByScheduleCLine(line: string): VaultDocument[] {
    return this.documents.filter(d => d.scheduleCLine === line && !d.archived)
  }

  // ─── Stats ────────────────────────────────────────────────────────

  getStats(): VaultStats {
    const active = this.documents.filter(d => !d.archived)
    const byCategory: Record<string, number> = {}
    const byYear: Record<number, number> = {}
    let totalDeductible = 0
    let untagged = 0

    for (const doc of active) {
      byCategory[doc.category] = (byCategory[doc.category] || 0) + 1
      byYear[doc.taxYear] = (byYear[doc.taxYear] || 0) + 1
      if (doc.isDeductible && doc.amount) totalDeductible += doc.amount
      if (doc.tags.length === 0 && doc.category === 'other') untagged++
    }

    return {
      totalDocuments: active.length,
      totalSize: active.reduce((s, d) => s + d.sizeBytes, 0),
      byCategory: byCategory as Record<DocumentCategory, number>,
      byYear,
      totalDeductibleAmount: totalDeductible,
      untaggedCount: untagged,
    }
  }

  // ─── Folders View ─────────────────────────────────────────────────

  getFolders(year?: number): VaultFolder[] {
    const docs = year ? this.getByYear(year) : this.documents.filter(d => !d.archived)
    const folders: Record<string, VaultFolder> = {}

    for (const [cat, meta] of Object.entries(CATEGORY_META)) {
      const catDocs = docs.filter(d => d.category === cat)
      if (catDocs.length > 0 || ['receipt', 'tax_form', 'invoice'].includes(cat)) {
        folders[cat] = {
          name: meta.label,
          category: cat as DocumentCategory,
          icon: meta.icon,
          count: catDocs.length,
          totalAmount: catDocs.reduce((s, d) => s + (d.amount || 0), 0),
        }
      }
    }

    return Object.values(folders).sort((a, b) => b.count - a.count)
  }

  // ─── Audit Export ─────────────────────────────────────────────────

  generateAuditReport(year: number): string {
    const docs = this.getByYear(year)
    const lines: string[] = [
      `FORTUNA ENGINE — DOCUMENT VAULT AUDIT REPORT`,
      `Tax Year: ${year}`,
      `Generated: ${new Date().toISOString()}`,
      `Total Documents: ${docs.length}`,
      ``,
    ]

    // Group by category
    for (const [cat, meta] of Object.entries(CATEGORY_META)) {
      const catDocs = docs.filter(d => d.category === cat)
      if (catDocs.length === 0) continue

      lines.push(`═══ ${meta.icon} ${meta.label} (${catDocs.length} documents) ═══`)
      const total = catDocs.reduce((s, d) => s + (d.amount || 0), 0)
      if (total > 0) lines.push(`    Total Amount: $${total.toLocaleString()}`)

      for (const doc of catDocs.sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
        lines.push(`  • ${doc.filename}`)
        if (doc.date) lines.push(`    Date: ${doc.date}`)
        if (doc.vendor) lines.push(`    Vendor: ${doc.vendor}`)
        if (doc.amount) lines.push(`    Amount: $${doc.amount.toLocaleString()}`)
        if (doc.scheduleCLine) lines.push(`    Schedule C Line: ${doc.scheduleCLine}`)
        if (doc.notes) lines.push(`    Notes: ${doc.notes}`)
        lines.push('')
      }
    }

    // Schedule C summary
    const schedCDocs = docs.filter(d => d.scheduleCLine && d.isDeductible)
    if (schedCDocs.length > 0) {
      lines.push(`═══ SCHEDULE C EXPENSE DOCUMENTATION ═══`)
      const byLine: Record<string, VaultDocument[]> = {}
      for (const d of schedCDocs) {
        const line = d.scheduleCLine!
        if (!byLine[line]) byLine[line] = []
        byLine[line].push(d)
      }
      for (const [line, lineDocs] of Object.entries(byLine).sort()) {
        const total = lineDocs.reduce((s, d) => s + (d.amount || 0), 0)
        lines.push(`  Line ${line}: ${lineDocs.length} documents, $${total.toLocaleString()}`)
      }
    }

    return lines.join('\n')
  }

  // ─── Retention Check ──────────────────────────────────────────────

  getExpiredDocuments(): VaultDocument[] {
    const now = new Date()
    return this.documents.filter(d => {
      const retention = CATEGORY_META[d.category]?.retentionYears || 7
      const expiry = new Date(d.uploadDate)
      expiry.setFullYear(expiry.getFullYear() + retention)
      return now > expiry
    })
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private async fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('File read failed'))
      reader.readAsDataURL(file)
    })
  }

  private async generateThumbnail(dataUrl: string, maxSize: number = 200): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = () => resolve('')
      img.src = dataUrl
    })
  }

  private save() {
    try {
      // Don't store fullDataUrl in localStorage (too large)
      const forStorage = this.documents.map(d => ({ ...d, fullDataUrl: undefined }))
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(forStorage))
    } catch (e) {
      console.warn('[Vault] Storage quota exceeded — consider archiving old documents')
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(VAULT_STORAGE_KEY)
      if (raw) this.documents = JSON.parse(raw)
    } catch { this.documents = [] }
  }
}

// ─── Type Adapters: VaultDocument ↔ DocumentRecord ──────────────────────────

import type { DocumentRecord } from './storage'

const CATEGORY_TO_DOC_TYPE: Record<string, DocumentRecord['type']> = {
  income: '1099',
  w2: 'w2',
  receipt: 'receipt',
  contract: 'contract',
  tax_return: 'tax_return',
  bank: 'bank_statement',
  invoice: 'invoice',
}

/** Convert VaultDocument → storable DocumentRecord */
export function vaultDocToRecord(doc: VaultDocument): DocumentRecord {
  return {
    id: doc.id,
    name: doc.filename,
    type: CATEGORY_TO_DOC_TYPE[doc.category] || 'other',
    category: doc.subcategory || doc.category,
    uploadDate: doc.uploadDate,
    fileSize: doc.sizeBytes,
    mimeType: doc.mimeType,
    storageKey: doc.id,
    notes: doc.description,
    entityId: (doc as any).entityId || 'personal',
    memberId: 'primary',
    taxYear: doc.taxYear,
    tags: doc.tags,
  }
}

/** Convert DocumentRecord → VaultDocument (for vault operations) */
export function recordToVaultDoc(record: DocumentRecord): Partial<VaultDocument> {
  const reverseMap: Record<string, DocumentCategory> = {
    '1099': 'income',
    w2: 'income',
    receipt: 'expense',
    contract: 'legal',
    tax_return: 'tax',
    bank_statement: 'bank',
    invoice: 'expense',
    other: 'other',
  }
  return {
    id: record.id,
    filename: record.name,
    mimeType: record.mimeType || 'application/octet-stream',
    sizeBytes: record.fileSize || 0,
    category: reverseMap[record.type] || 'other' as DocumentCategory,
    subcategory: record.category || '',
    taxYear: record.taxYear || new Date().getFullYear(),
    uploadDate: record.uploadDate,
    description: record.notes || '',
    tags: record.tags || [],
  }
}

/** Sync vault documents → FortunaState.documents[] */
export function syncVaultToState(vault: DocumentVault): DocumentRecord[] {
  return vault.getAllDocuments().map(vaultDocToRecord)
}
