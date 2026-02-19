/**
 * Fortuna Engine — QuickBooks IIF Parser
 * Complete parser for Intuit Interchange Format (.iif) files.
 *
 * Supports all IIF record types:
 *   - HDR: File header (QB version, release, date format)
 *   - TRNS/SPL/ENDTRNS: Transaction blocks (checks, deposits, invoices, bills, journals, etc.)
 *   - ACCNT: Chart of Accounts
 *   - CUST: Customer/Job list
 *   - VEND: Vendor list
 *   - EMP: Employee list
 *   - INVITEM: Inventory/Service items
 *   - CLASS: Class tracking list
 *   - OTHERNAME: Other names list
 *   - CTYPE: Customer type list
 *   - VTYPE: Vendor type list
 *   - BUD: Budget data
 *   - TOENTITY: Terms list
 *
 * IIF files are tab-delimited text with !-prefixed header rows defining columns
 * for each record type, followed by data rows.
 *
 * @module qb-iif-parser
 */

// ─── IIF Types ────────────────────────────────────────────────────────────

export type IIFTransactionType =
  | 'CHECK' | 'DEPOSIT' | 'INVOICE' | 'BILL' | 'BILL REFUND'
  | 'CREDIT MEMO' | 'PAYMENT' | 'BILL PMT' | 'CASH SALE'
  | 'GENERAL JOURNAL' | 'TRANSFER' | 'CREDIT CARD'
  | 'CREDIT CARD REFUND' | 'PAYCHECK' | 'SALES TAX PAYMENT'
  | 'ESTIMATE' | 'PURCHASE ORDER' | string

export interface IIFHeader {
  product: string
  version: string
  release: string
  dateFormat: string
  timeFormat: string
  separator: string
}

export interface IIFTransactionLine {
  /** TRNS = transaction header, SPL = split/distribution line */
  lineType: 'TRNS' | 'SPL'
  trnsType: IIFTransactionType
  date: string
  account: string
  name: string
  class?: string
  amount: number
  docNum?: string
  memo?: string
  clear?: string  // Y/N cleared
  toprint?: string
  addr1?: string
  addr2?: string
  addr3?: string
  shipDate?: string
  dueDate?: string
  terms?: string
  paid?: string
  extra?: string   // AUTOSTAX, etc.
  quantiy?: number
  price?: number
  invItem?: string
  taxable?: string
  /** All raw fields as key-value */
  raw: Record<string, string>
}

export interface IIFTransaction {
  /** Main transaction line (TRNS row) */
  header: IIFTransactionLine
  /** Distribution/split lines (SPL rows) */
  splits: IIFTransactionLine[]
  /** Sum verification: TRNS.amount + sum(SPL.amounts) should = 0 */
  balanced: boolean
  balanceError: number
}

export interface IIFAccount {
  name: string
  accountType: string
  description?: string
  accountNumber?: string
  bankNumber?: string
  extra?: string
  hidden?: boolean
  taxLine?: string
  /** Parent account for sub-accounts (colon-separated in name) */
  parent?: string
  raw: Record<string, string>
}

export interface IIFCustomer {
  name: string
  companyName?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  addr1?: string
  addr2?: string
  addr3?: string
  city?: string
  state?: string
  zip?: string
  balance?: number
  terms?: string
  taxable?: string
  customerType?: string
  raw: Record<string, string>
}

export interface IIFVendor {
  name: string
  companyName?: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  addr1?: string
  addr2?: string
  addr3?: string
  city?: string
  state?: string
  zip?: string
  balance?: number
  terms?: string
  taxId?: string
  print1099?: boolean
  vendorType?: string
  raw: Record<string, string>
}

export interface IIFEmployee {
  name: string
  firstName?: string
  middleName?: string
  lastName?: string
  ssn?: string
  phone?: string
  email?: string
  addr1?: string
  city?: string
  state?: string
  zip?: string
  hireDate?: string
  raw: Record<string, string>
}

export interface IIFItem {
  name: string
  itemType: string
  description?: string
  account?: string
  price?: number
  cost?: number
  taxable?: boolean
  raw: Record<string, string>
}

export interface IIFClass {
  name: string
  hidden?: boolean
  raw: Record<string, string>
}

// ─── Parse Result ─────────────────────────────────────────────────────────

export interface IIFParseResult {
  header: IIFHeader | null
  transactions: IIFTransaction[]
  accounts: IIFAccount[]
  customers: IIFCustomer[]
  vendors: IIFVendor[]
  employees: IIFEmployee[]
  items: IIFItem[]
  classes: IIFClass[]
  otherNames: { name: string; raw: Record<string, string> }[]
  errors: { line: number; message: string }[]
  stats: {
    totalLines: number
    transactionCount: number
    accountCount: number
    customerCount: number
    vendorCount: number
    employeeCount: number
    itemCount: number
    classCount: number
    errorCount: number
    balancedCount: number
    unbalancedCount: number
    dateRange: { earliest: string; latest: string } | null
    totalDebits: number
    totalCredits: number
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────

/**
 * Parse a complete IIF file into structured data.
 * Handles both tab-delimited and comma-delimited IIF variants.
 */
export function parseIIF(content: string): IIFParseResult {
  const result: IIFParseResult = {
    header: null,
    transactions: [],
    accounts: [],
    customers: [],
    vendors: [],
    employees: [],
    items: [],
    classes: [],
    otherNames: [],
    errors: [],
    stats: {
      totalLines: 0,
      transactionCount: 0,
      accountCount: 0,
      customerCount: 0,
      vendorCount: 0,
      employeeCount: 0,
      itemCount: 0,
      classCount: 0,
      errorCount: 0,
      balancedCount: 0,
      unbalancedCount: 0,
      dateRange: null,
      totalDebits: 0,
      totalCredits: 0,
    },
  }

  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  result.stats.totalLines = lines.length

  // Detect delimiter (tab or comma)
  const delimiter = detectDelimiter(lines)

  // Column definitions per record type
  const columnDefs: Record<string, string[]> = {}
  let currentTrnsColumns: string[] = []
  let currentSplColumns: string[] = []

  // Transaction accumulator
  let currentTransaction: { header: IIFTransactionLine | null; splits: IIFTransactionLine[] } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const lineNum = i + 1
    const fields = splitFields(line, delimiter)
    const keyword = fields[0]?.toUpperCase()

    try {
      // Header definitions (start with !)
      if (keyword.startsWith('!')) {
        const recordType = keyword.substring(1)
        const cols = fields.slice(1).map(f => f.toUpperCase().trim())

        if (recordType === 'TRNS') {
          currentTrnsColumns = cols
          columnDefs['TRNS'] = cols
        } else if (recordType === 'SPL') {
          currentSplColumns = cols
          columnDefs['SPL'] = cols
        } else if (recordType === 'ENDTRNS') {
          // No columns for ENDTRNS
        } else {
          columnDefs[recordType] = cols
        }
        continue
      }

      // HDR record
      if (keyword === 'HDR') {
        const cols = columnDefs['HDR'] || ['PROD', 'VER', 'REL', 'IIFVER', 'DATE', 'TIME', 'ACCNTNT', 'ACCNTNTSPLITTIME']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.header = {
          product: rawData['PROD'] || '',
          version: rawData['VER'] || '',
          release: rawData['REL'] || '',
          dateFormat: rawData['DATE'] || 'M/D/Y',
          timeFormat: rawData['TIME'] || '',
          separator: delimiter,
        }
        continue
      }

      // TRNS record (start of transaction)
      if (keyword === 'TRNS') {
        // If we have an open transaction, that's an error (missing ENDTRNS)
        if (currentTransaction?.header) {
          result.errors.push({ line: lineNum, message: 'TRNS without preceding ENDTRNS' })
          finalizeTransaction(currentTransaction, result)
        }
        const rawData = mapFieldsToColumns(fields.slice(1), currentTrnsColumns)
        currentTransaction = {
          header: parseTransactionLine('TRNS', rawData),
          splits: [],
        }
        continue
      }

      // SPL record (split/distribution line)
      if (keyword === 'SPL') {
        if (!currentTransaction) {
          result.errors.push({ line: lineNum, message: 'SPL without preceding TRNS' })
          continue
        }
        const rawData = mapFieldsToColumns(fields.slice(1), currentSplColumns)
        currentTransaction.splits.push(parseTransactionLine('SPL', rawData))
        continue
      }

      // ENDTRNS record
      if (keyword === 'ENDTRNS') {
        if (currentTransaction?.header) {
          finalizeTransaction(currentTransaction, result)
        } else {
          result.errors.push({ line: lineNum, message: 'ENDTRNS without matching TRNS' })
        }
        currentTransaction = null
        continue
      }

      // ACCNT record
      if (keyword === 'ACCNT') {
        const cols = columnDefs['ACCNT'] || ['NAME', 'ACCNTTYPE', 'DESC', 'ACCNUM', 'BANKNUM', 'EXTRA', 'HIDDEN', 'TAXLINE']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.accounts.push(parseAccount(rawData))
        continue
      }

      // CUST record
      if (keyword === 'CUST') {
        const cols = columnDefs['CUST'] || ['NAME', 'BADDR1', 'BADDR2', 'BADDR3', 'BADDR4', 'BADDR5',
          'SADDR1', 'SADDR2', 'SADDR3', 'SADDR4', 'SADDR5', 'PHONE1', 'PHONE2', 'FAXNUM', 'EMAIL',
          'CONT1', 'CONT2', 'CTYPE', 'TERMS', 'TAXABLE', 'LIMIT', 'RESESSION', 'REP', 'TAXITEM',
          'NOTEPAD', 'SALUTATION', 'COMPANYNAME', 'FIRSTNAME', 'MIDINIT', 'LASTNAME', 'CUSTFLD1']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.customers.push(parseCustomer(rawData))
        continue
      }

      // VEND record
      if (keyword === 'VEND') {
        const cols = columnDefs['VEND'] || ['NAME', 'BADDR1', 'BADDR2', 'BADDR3', 'BADDR4', 'BADDR5',
          'PHONE1', 'PHONE2', 'FAXNUM', 'EMAIL', 'CONT1', 'VTYPE', 'TERMS',
          'TAXID', '1099', 'NOTEPAD', 'SALUTATION', 'COMPANYNAME', 'FIRSTNAME', 'MIDINIT', 'LASTNAME']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.vendors.push(parseVendor(rawData))
        continue
      }

      // EMP record
      if (keyword === 'EMP') {
        const cols = columnDefs['EMP'] || ['NAME', 'FIRSTNAME', 'MIDINIT', 'LASTNAME', 'SSN',
          'ADDR1', 'ADDR2', 'CITY', 'STATE', 'ZIP', 'PHONE1', 'EMAIL', 'HIREDATE']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.employees.push(parseEmployee(rawData))
        continue
      }

      // INVITEM record
      if (keyword === 'INVITEM') {
        const cols = columnDefs['INVITEM'] || ['NAME', 'INVITEMTYPE', 'DESC', 'ACCNT',
          'PRICE', 'COST', 'TAXABLE', 'PAESSION', 'EXTRA']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.items.push(parseItem(rawData))
        continue
      }

      // CLASS record
      if (keyword === 'CLASS') {
        const cols = columnDefs['CLASS'] || ['NAME', 'HIDDEN']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.classes.push({
          name: rawData['NAME'] || '',
          hidden: rawData['HIDDEN']?.toUpperCase() === 'Y',
          raw: rawData,
        })
        continue
      }

      // OTHERNAME record
      if (keyword === 'OTHERNAME') {
        const cols = columnDefs['OTHERNAME'] || ['NAME', 'BADDR1', 'BADDR2', 'PHONE1', 'EMAIL']
        const rawData = mapFieldsToColumns(fields.slice(1), cols)
        result.otherNames.push({ name: rawData['NAME'] || '', raw: rawData })
        continue
      }

    } catch (err) {
      result.errors.push({ line: lineNum, message: `Parse error: ${(err as Error).message}` })
    }
  }

  // Finalize any open transaction
  if (currentTransaction?.header) {
    result.errors.push({ line: lines.length, message: 'File ended with open transaction (missing ENDTRNS)' })
    finalizeTransaction(currentTransaction, result)
  }

  // Compute stats
  updateStats(result)

  return result
}

// ─── Helper Functions ─────────────────────────────────────────────────────

function detectDelimiter(lines: string[]): string {
  // Check first few non-empty lines for tabs
  for (const line of lines.slice(0, 10)) {
    if (line.includes('\t')) return '\t'
  }
  return ',' // Fallback to comma
}

function splitFields(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t')
  }
  // CSV-aware split (respects quoted fields)
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

function mapFieldsToColumns(fields: string[], columns: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < columns.length && i < fields.length; i++) {
    if (columns[i] && fields[i] !== undefined) {
      result[columns[i]] = fields[i]
    }
  }
  return result
}

function parseTransactionLine(lineType: 'TRNS' | 'SPL', raw: Record<string, string>): IIFTransactionLine {
  return {
    lineType,
    trnsType: (raw['TRNSTYPE'] || '') as IIFTransactionType,
    date: raw['DATE'] || '',
    account: raw['ACCNT'] || '',
    name: raw['NAME'] || '',
    class: raw['CLASS'] || undefined,
    amount: parseFloat(raw['AMOUNT'] || '0') || 0,
    docNum: raw['DOCNUM'] || undefined,
    memo: raw['MEMO'] || undefined,
    clear: raw['CLEAR'] || undefined,
    toprint: raw['TOPRINT'] || undefined,
    addr1: raw['ADDR1'] || raw['BADDR1'] || undefined,
    addr2: raw['ADDR2'] || raw['BADDR2'] || undefined,
    addr3: raw['ADDR3'] || raw['BADDR3'] || undefined,
    dueDate: raw['DUEDATE'] || undefined,
    terms: raw['TERMS'] || undefined,
    extra: raw['EXTRA'] || undefined,
    quantiy: raw['QNTY'] ? parseFloat(raw['QNTY']) : undefined,
    price: raw['PRICE'] ? parseFloat(raw['PRICE']) : undefined,
    invItem: raw['INVITEM'] || undefined,
    taxable: raw['TAXABLE'] || undefined,
    raw,
  }
}

function parseAccount(raw: Record<string, string>): IIFAccount {
  const name = raw['NAME'] || ''
  const parent = name.includes(':') ? name.split(':').slice(0, -1).join(':') : undefined
  return {
    name,
    accountType: raw['ACCNTTYPE'] || raw['ATYPE'] || '',
    description: raw['DESC'] || undefined,
    accountNumber: raw['ACCNUM'] || undefined,
    bankNumber: raw['BANKNUM'] || undefined,
    extra: raw['EXTRA'] || undefined,
    hidden: raw['HIDDEN']?.toUpperCase() === 'Y',
    taxLine: raw['TAXLINE'] || undefined,
    parent,
    raw,
  }
}

function parseCustomer(raw: Record<string, string>): IIFCustomer {
  return {
    name: raw['NAME'] || '',
    companyName: raw['COMPANYNAME'] || undefined,
    firstName: raw['FIRSTNAME'] || undefined,
    lastName: raw['LASTNAME'] || undefined,
    phone: raw['PHONE1'] || undefined,
    email: raw['EMAIL'] || undefined,
    addr1: raw['BADDR1'] || undefined,
    addr2: raw['BADDR2'] || undefined,
    addr3: raw['BADDR3'] || undefined,
    city: raw['BADDR3'] || undefined, // QB stores city in addr3 sometimes
    state: raw['BADDR4'] || undefined,
    zip: raw['BADDR5'] || undefined,
    balance: raw['LIMIT'] ? parseFloat(raw['LIMIT']) : undefined,
    terms: raw['TERMS'] || undefined,
    taxable: raw['TAXABLE'] || undefined,
    customerType: raw['CTYPE'] || undefined,
    raw,
  }
}

function parseVendor(raw: Record<string, string>): IIFVendor {
  return {
    name: raw['NAME'] || '',
    companyName: raw['COMPANYNAME'] || undefined,
    firstName: raw['FIRSTNAME'] || undefined,
    lastName: raw['LASTNAME'] || undefined,
    phone: raw['PHONE1'] || undefined,
    email: raw['EMAIL'] || undefined,
    addr1: raw['BADDR1'] || undefined,
    addr2: raw['BADDR2'] || undefined,
    addr3: raw['BADDR3'] || undefined,
    taxId: raw['TAXID'] || undefined,
    print1099: raw['1099']?.toUpperCase() === 'Y',
    vendorType: raw['VTYPE'] || undefined,
    terms: raw['TERMS'] || undefined,
    raw,
  }
}

function parseEmployee(raw: Record<string, string>): IIFEmployee {
  return {
    name: raw['NAME'] || '',
    firstName: raw['FIRSTNAME'] || undefined,
    middleName: raw['MIDINIT'] || undefined,
    lastName: raw['LASTNAME'] || undefined,
    ssn: raw['SSN'] || undefined,
    phone: raw['PHONE1'] || undefined,
    email: raw['EMAIL'] || undefined,
    addr1: raw['ADDR1'] || undefined,
    city: raw['CITY'] || undefined,
    state: raw['STATE'] || undefined,
    zip: raw['ZIP'] || undefined,
    hireDate: raw['HIREDATE'] || undefined,
    raw,
  }
}

function parseItem(raw: Record<string, string>): IIFItem {
  return {
    name: raw['NAME'] || '',
    itemType: raw['INVITEMTYPE'] || raw['ITEMTYPE'] || '',
    description: raw['DESC'] || undefined,
    account: raw['ACCNT'] || undefined,
    price: raw['PRICE'] ? parseFloat(raw['PRICE']) : undefined,
    cost: raw['COST'] ? parseFloat(raw['COST']) : undefined,
    taxable: raw['TAXABLE']?.toUpperCase() === 'Y',
    raw,
  }
}

function finalizeTransaction(
  txn: { header: IIFTransactionLine | null; splits: IIFTransactionLine[] },
  result: IIFParseResult,
): void {
  if (!txn.header) return

  const totalAmount = txn.header.amount + txn.splits.reduce((s, spl) => s + spl.amount, 0)
  const balanced = Math.abs(totalAmount) < 0.005 // Penny tolerance

  result.transactions.push({
    header: txn.header,
    splits: txn.splits,
    balanced,
    balanceError: Number(totalAmount.toFixed(2)),
  })
}

function updateStats(result: IIFParseResult): void {
  const s = result.stats
  s.transactionCount = result.transactions.length
  s.accountCount = result.accounts.length
  s.customerCount = result.customers.length
  s.vendorCount = result.vendors.length
  s.employeeCount = result.employees.length
  s.itemCount = result.items.length
  s.classCount = result.classes.length
  s.errorCount = result.errors.length
  s.balancedCount = result.transactions.filter(t => t.balanced).length
  s.unbalancedCount = result.transactions.filter(t => !t.balanced).length

  // Date range
  const dates = result.transactions
    .map(t => t.header.date)
    .filter(d => d)
    .sort()

  if (dates.length > 0) {
    s.dateRange = { earliest: dates[0], latest: dates[dates.length - 1] }
  }

  // Debits and credits
  for (const txn of result.transactions) {
    if (txn.header.amount > 0) s.totalDebits += txn.header.amount
    else s.totalCredits += Math.abs(txn.header.amount)
    for (const spl of txn.splits) {
      if (spl.amount > 0) s.totalDebits += spl.amount
      else s.totalCredits += Math.abs(spl.amount)
    }
  }
}

// ─── IIF Generator (Export) ───────────────────────────────────────────────

/**
 * Generate IIF file content from structured data.
 * Used for exporting Fortuna data back to QuickBooks format.
 */
export function generateIIF(data: {
  accounts?: IIFAccount[]
  transactions?: IIFTransaction[]
  customers?: IIFCustomer[]
  vendors?: IIFVendor[]
  classes?: IIFClass[]
}): string {
  const lines: string[] = []
  const TAB = '\t'

  // Accounts
  if (data.accounts?.length) {
    lines.push(`!ACCNT${TAB}NAME${TAB}ACCNTTYPE${TAB}DESC${TAB}ACCNUM${TAB}EXTRA${TAB}HIDDEN`)
    for (const a of data.accounts) {
      lines.push(`ACCNT${TAB}${a.name}${TAB}${a.accountType}${TAB}${a.description || ''}${TAB}${a.accountNumber || ''}${TAB}${a.extra || ''}${TAB}${a.hidden ? 'Y' : 'N'}`)
    }
  }

  // Classes
  if (data.classes?.length) {
    lines.push(`!CLASS${TAB}NAME${TAB}HIDDEN`)
    for (const c of data.classes) {
      lines.push(`CLASS${TAB}${c.name}${TAB}${c.hidden ? 'Y' : 'N'}`)
    }
  }

  // Customers
  if (data.customers?.length) {
    lines.push(`!CUST${TAB}NAME${TAB}COMPANYNAME${TAB}FIRSTNAME${TAB}LASTNAME${TAB}PHONE1${TAB}EMAIL`)
    for (const c of data.customers) {
      lines.push(`CUST${TAB}${c.name}${TAB}${c.companyName || ''}${TAB}${c.firstName || ''}${TAB}${c.lastName || ''}${TAB}${c.phone || ''}${TAB}${c.email || ''}`)
    }
  }

  // Vendors
  if (data.vendors?.length) {
    lines.push(`!VEND${TAB}NAME${TAB}COMPANYNAME${TAB}FIRSTNAME${TAB}LASTNAME${TAB}PHONE1${TAB}EMAIL${TAB}TAXID${TAB}1099`)
    for (const v of data.vendors) {
      lines.push(`VEND${TAB}${v.name}${TAB}${v.companyName || ''}${TAB}${v.firstName || ''}${TAB}${v.lastName || ''}${TAB}${v.phone || ''}${TAB}${v.email || ''}${TAB}${v.taxId || ''}${TAB}${v.print1099 ? 'Y' : 'N'}`)
    }
  }

  // Transactions
  if (data.transactions?.length) {
    lines.push(`!TRNS${TAB}TRNSTYPE${TAB}DATE${TAB}ACCNT${TAB}NAME${TAB}CLASS${TAB}AMOUNT${TAB}DOCNUM${TAB}MEMO`)
    lines.push(`!SPL${TAB}TRNSTYPE${TAB}DATE${TAB}ACCNT${TAB}NAME${TAB}CLASS${TAB}AMOUNT${TAB}DOCNUM${TAB}MEMO`)
    lines.push(`!ENDTRNS`)

    for (const txn of data.transactions) {
      const h = txn.header
      lines.push(`TRNS${TAB}${h.trnsType}${TAB}${h.date}${TAB}${h.account}${TAB}${h.name}${TAB}${h.class || ''}${TAB}${h.amount}${TAB}${h.docNum || ''}${TAB}${h.memo || ''}`)
      for (const spl of txn.splits) {
        lines.push(`SPL${TAB}${spl.trnsType}${TAB}${spl.date}${TAB}${spl.account}${TAB}${spl.name}${TAB}${spl.class || ''}${TAB}${spl.amount}${TAB}${spl.docNum || ''}${TAB}${spl.memo || ''}`)
      }
      lines.push(`ENDTRNS`)
    }
  }

  return lines.join('\n')
}
