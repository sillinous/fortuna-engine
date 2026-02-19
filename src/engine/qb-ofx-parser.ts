/**
 * Fortuna Engine — QBO/OFX/QFX Parser
 * Parses Open Financial Exchange format files used by QuickBooks Desktop
 * (Web Connect) and QuickBooks Online for bank transaction imports.
 *
 * Supports:
 *   - .qbo (QuickBooks Web Connect) — QB Desktop + QB Online
 *   - .ofx (Open Financial Exchange) — Universal
 *   - .qfx (Quicken Web Connect) — Quicken-flavored OFX
 *
 * All three share the OFX/SGML specification with minor header differences.
 * Transaction data structure is identical across all three.
 *
 * @module qb-ofx-parser
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type OFXTransactionType =
  | 'DEBIT' | 'CREDIT' | 'INT' | 'DIV' | 'FEE' | 'SRVCHG'
  | 'DEP' | 'ATM' | 'POS' | 'XFER' | 'CHECK' | 'PAYMENT'
  | 'CASH' | 'DIRECTDEP' | 'DIRECTDEBIT' | 'REPEATPMT'
  | 'OTHER' | string

export interface OFXTransaction {
  type: OFXTransactionType
  datePosted: string       // YYYYMMDD or YYYYMMDDHHMMSS
  dateUser?: string
  amount: number
  fitId: string           // Financial institution transaction ID (unique)
  checkNum?: string
  refNum?: string
  name?: string           // Payee name
  memo?: string
  sic?: string            // Standard Industrial Classification
  payeeId?: string
  /** Parsed date as ISO string */
  dateISO: string
}

export interface OFXBankAccount {
  bankId: string          // Routing number
  accountId: string       // Account number (may be masked)
  accountType: 'CHECKING' | 'SAVINGS' | 'MONEYMRKT' | 'CREDITLINE' | string
}

export interface OFXCreditCardAccount {
  accountId: string
}

export interface OFXStatement {
  currency: string
  bankAccount?: OFXBankAccount
  creditCardAccount?: OFXCreditCardAccount
  transactions: OFXTransaction[]
  ledgerBalance?: { amount: number; dateOf: string }
  availableBalance?: { amount: number; dateOf: string }
  dateStart?: string
  dateEnd?: string
  /** OFX/QBO/QFX flavor detected */
  flavor: 'ofx' | 'qbo' | 'qfx'
}

export interface OFXParseResult {
  statements: OFXStatement[]
  signOnResponse?: {
    status: string
    dtServer: string
    language: string
    org?: string
    fid?: string
  }
  errors: { message: string }[]
  stats: {
    transactionCount: number
    statementCount: number
    totalInflow: number
    totalOutflow: number
    dateRange: { earliest: string; latest: string } | null
    uniquePayees: number
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────

/**
 * Parse an OFX/QBO/QFX file.
 * OFX uses SGML-like tags (not well-formed XML) — requires custom parsing.
 */
export function parseOFX(content: string): OFXParseResult {
  const result: OFXParseResult = {
    statements: [],
    errors: [],
    stats: {
      transactionCount: 0,
      statementCount: 0,
      totalInflow: 0,
      totalOutflow: 0,
      dateRange: null,
      uniquePayees: 0,
    },
  }

  try {
    // Detect flavor from headers
    const flavor = detectFlavor(content)

    // Strip SGML headers (everything before first <OFX> or <ofx>)
    const ofxStart = content.search(/<OFX>/i)
    if (ofxStart === -1) {
      result.errors.push({ message: 'No <OFX> tag found — invalid OFX/QBO/QFX file' })
      return result
    }

    const ofxContent = content.substring(ofxStart)

    // Parse sign-on response
    result.signOnResponse = parseSignOn(ofxContent)

    // Parse bank statements (STMTTRNRS)
    const bankStatements = extractBlocks(ofxContent, 'STMTTRNRS')
    for (const block of bankStatements) {
      const stmt = parseBankStatement(block, flavor)
      if (stmt) result.statements.push(stmt)
    }

    // Parse credit card statements (CCSTMTTRNRS)
    const ccStatements = extractBlocks(ofxContent, 'CCSTMTTRNRS')
    for (const block of ccStatements) {
      const stmt = parseCCStatement(block, flavor)
      if (stmt) result.statements.push(stmt)
    }

    // Compute stats
    const allTxns = result.statements.flatMap(s => s.transactions)
    result.stats.transactionCount = allTxns.length
    result.stats.statementCount = result.statements.length
    result.stats.totalInflow = allTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    result.stats.totalOutflow = allTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    result.stats.uniquePayees = new Set(allTxns.map(t => t.name).filter(Boolean)).size

    const dates = allTxns.map(t => t.dateISO).filter(Boolean).sort()
    if (dates.length > 0) {
      result.stats.dateRange = { earliest: dates[0], latest: dates[dates.length - 1] }
    }

  } catch (err) {
    result.errors.push({ message: `OFX parse error: ${(err as Error).message}` })
  }

  return result
}

// ─── Internal Parsing Helpers ─────────────────────────────────────────────

function detectFlavor(content: string): 'ofx' | 'qbo' | 'qfx' {
  const upper = content.substring(0, 2000).toUpperCase()
  if (upper.includes('INTUIT') || upper.includes('QBO')) return 'qbo'
  if (upper.includes('QUICKEN') || upper.includes('QFX')) return 'qfx'
  return 'ofx'
}

function extractTagValue(block: string, tag: string): string | undefined {
  // OFX SGML style: <TAG>value (no closing tag for simple values)
  // Also handle XML style: <TAG>value</TAG>
  const patterns = [
    new RegExp(`<${tag}>([^<\\n]+)`, 'i'),
    new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match) return match[1].trim()
  }
  return undefined
}

function extractBlocks(content: string, tag: string): string[] {
  const blocks: string[] = []
  const openTag = `<${tag}>`
  const closeTag = `</${tag}>`

  let pos = 0
  while (true) {
    const start = content.indexOf(openTag, pos)
    if (start === -1) break
    const end = content.indexOf(closeTag, start)
    if (end === -1) {
      // No closing tag — take rest of content
      blocks.push(content.substring(start))
      break
    }
    blocks.push(content.substring(start, end + closeTag.length))
    pos = end + closeTag.length
  }

  return blocks
}

function parseOFXDate(dateStr: string): string {
  if (!dateStr) return ''
  // Format: YYYYMMDDHHMMSS or YYYYMMDD or YYYYMMDDHHMMSS[timezone]
  const clean = dateStr.replace(/\[.*\]/, '').trim()
  const year = clean.substring(0, 4)
  const month = clean.substring(4, 6)
  const day = clean.substring(6, 8)
  if (!year || !month || !day) return dateStr
  return `${year}-${month}-${day}`
}

function parseSignOn(content: string): OFXParseResult['signOnResponse'] {
  const block = extractBlocks(content, 'SONRS')[0]
  if (!block) return undefined
  return {
    status: extractTagValue(block, 'CODE') || '',
    dtServer: extractTagValue(block, 'DTSERVER') || '',
    language: extractTagValue(block, 'LANGUAGE') || 'ENG',
    org: extractTagValue(block, 'ORG'),
    fid: extractTagValue(block, 'FID'),
  }
}

function parseTransactions(block: string): OFXTransaction[] {
  const txns: OFXTransaction[] = []
  const tranBlocks = extractBlocks(block, 'STMTTRN')

  for (const tb of tranBlocks) {
    const datePosted = extractTagValue(tb, 'DTPOSTED') || ''
    const amount = parseFloat(extractTagValue(tb, 'TRNAMT') || '0')
    const fitId = extractTagValue(tb, 'FITID') || ''

    txns.push({
      type: (extractTagValue(tb, 'TRNTYPE') || 'OTHER') as OFXTransactionType,
      datePosted,
      dateUser: extractTagValue(tb, 'DTUSER'),
      amount,
      fitId,
      checkNum: extractTagValue(tb, 'CHECKNUM'),
      refNum: extractTagValue(tb, 'REFNUM'),
      name: extractTagValue(tb, 'NAME'),
      memo: extractTagValue(tb, 'MEMO'),
      sic: extractTagValue(tb, 'SIC'),
      payeeId: extractTagValue(tb, 'PAYEEID'),
      dateISO: parseOFXDate(datePosted),
    })
  }

  return txns
}

function parseBankStatement(block: string, flavor: 'ofx' | 'qbo' | 'qfx'): OFXStatement | null {
  const stmtBlock = extractBlocks(block, 'STMTRS')[0] || block
  const transactions = parseTransactions(stmtBlock)

  const bankAcct: OFXBankAccount = {
    bankId: extractTagValue(stmtBlock, 'BANKID') || '',
    accountId: extractTagValue(stmtBlock, 'ACCTID') || '',
    accountType: (extractTagValue(stmtBlock, 'ACCTTYPE') || 'CHECKING') as OFXBankAccount['accountType'],
  }

  const currency = extractTagValue(stmtBlock, 'CURDEF') || 'USD'

  // Balances
  const ledgerAmt = extractTagValue(stmtBlock, 'BALAMT')
  const ledgerDate = extractTagValue(stmtBlock, 'DTASOF')

  return {
    currency,
    bankAccount: bankAcct,
    transactions,
    ledgerBalance: ledgerAmt ? {
      amount: parseFloat(ledgerAmt),
      dateOf: parseOFXDate(ledgerDate || ''),
    } : undefined,
    dateStart: parseOFXDate(extractTagValue(stmtBlock, 'DTSTART') || ''),
    dateEnd: parseOFXDate(extractTagValue(stmtBlock, 'DTEND') || ''),
    flavor,
  }
}

function parseCCStatement(block: string, flavor: 'ofx' | 'qbo' | 'qfx'): OFXStatement | null {
  const stmtBlock = extractBlocks(block, 'CCSTMTRS')[0] || block
  const transactions = parseTransactions(stmtBlock)

  const ccAcct: OFXCreditCardAccount = {
    accountId: extractTagValue(stmtBlock, 'ACCTID') || '',
  }

  return {
    currency: extractTagValue(stmtBlock, 'CURDEF') || 'USD',
    creditCardAccount: ccAcct,
    transactions,
    dateStart: parseOFXDate(extractTagValue(stmtBlock, 'DTSTART') || ''),
    dateEnd: parseOFXDate(extractTagValue(stmtBlock, 'DTEND') || ''),
    flavor,
  }
}

// ─── QIF Parser (Legacy Quicken format) ───────────────────────────────────

export interface QIFTransaction {
  date: string
  amount: number
  payee?: string
  memo?: string
  category?: string
  checkNum?: string
  cleared?: string
  address?: string[]
  splits?: { category: string; memo?: string; amount: number }[]
}

export interface QIFParseResult {
  accountType: string
  accountName?: string
  transactions: QIFTransaction[]
}

/**
 * Parse QIF (Quicken Interchange Format) files.
 * Older format still used by some banks and legacy Quicken exports.
 */
export function parseQIF(content: string): QIFParseResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const result: QIFParseResult = {
    accountType: '',
    transactions: [],
  }

  let currentTxn: Partial<QIFTransaction> = {}
  let currentSplits: { category: string; memo?: string; amount: number }[] = []
  let splitCategory = ''
  let splitMemo = ''

  for (const line of lines) {
    if (!line.trim()) continue

    const code = line[0]
    const value = line.substring(1).trim()

    switch (code) {
      case '!':
        // Account type declaration
        if (value.startsWith('Type:') || value.startsWith('type:')) {
          result.accountType = value.split(':')[1]?.trim() || ''
        } else if (value.startsWith('Account')) {
          // Account header block follows
        }
        break
      case 'D': currentTxn.date = value; break
      case 'T': currentTxn.amount = parseFloat(value.replace(/,/g, '')) || 0; break
      case 'U': /* Duplicate amount - ignore */ break
      case 'P': currentTxn.payee = value; break
      case 'M': currentTxn.memo = value; break
      case 'L': currentTxn.category = value; break
      case 'N': currentTxn.checkNum = value; break
      case 'C': currentTxn.cleared = value; break
      case 'A': {
        if (!currentTxn.address) currentTxn.address = []
        currentTxn.address.push(value)
        break
      }
      case 'S': {
        // Split category
        if (splitCategory) {
          currentSplits.push({ category: splitCategory, memo: splitMemo || undefined, amount: 0 })
        }
        splitCategory = value
        splitMemo = ''
        break
      }
      case 'E': splitMemo = value; break
      case '$': {
        if (splitCategory) {
          currentSplits.push({
            category: splitCategory,
            memo: splitMemo || undefined,
            amount: parseFloat(value.replace(/,/g, '')) || 0,
          })
          splitCategory = ''
          splitMemo = ''
        }
        break
      }
      case '^': {
        // End of transaction
        if (splitCategory) {
          currentSplits.push({ category: splitCategory, memo: splitMemo || undefined, amount: 0 })
        }
        if (currentTxn.date || currentTxn.amount !== undefined) {
          result.transactions.push({
            date: currentTxn.date || '',
            amount: currentTxn.amount || 0,
            payee: currentTxn.payee,
            memo: currentTxn.memo,
            category: currentTxn.category,
            checkNum: currentTxn.checkNum,
            cleared: currentTxn.cleared,
            address: currentTxn.address,
            splits: currentSplits.length > 0 ? currentSplits : undefined,
          })
        }
        currentTxn = {}
        currentSplits = []
        splitCategory = ''
        splitMemo = ''
        break
      }
    }
  }

  return result
}
