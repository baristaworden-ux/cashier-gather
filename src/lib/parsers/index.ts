import { BankSource } from '@/types'

export interface ParsedTransaction {
  date: string
  description: string
  amount: number
  currency: string
  type: 'income' | 'expense' | 'transfer'
  import_hash: string
}

function hash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

// ─── Rabobank CSV ────────────────────────────────────────────────────────────
// Datum,Naam/Omschrijving,Rekening,Tegenrekening,Code,Af/Bij,Bedrag,Mutatiesoort,Mededelingen
export function parseRabobank(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split('\n').slice(1)
  return lines.filter(Boolean).map(line => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const [date, desc, , , , direction, rawAmount] = cols
    const amount = parseFloat(rawAmount.replace(',', '.'))
    const type = direction === 'Bij' ? 'income' : 'expense'
    return {
      date: date.slice(0, 10),
      description: desc,
      amount: Math.abs(amount),
      currency: 'EUR',
      type,
      import_hash: hash(`rabobank-${date}-${desc}-${amount}`),
    }
  })
}

// ─── Wise CSV ────────────────────────────────────────────────────────────────
// TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance,Exchange From,Exchange To,Exchange Rate,Payer Name,Payee Name,Payee Account Number,Merchant,Card Last Four Digits,Card Holder Full Name,Attachment,Note,Total fees,Exchange To Amount
export function parseWise(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split('\n')
  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const dateIdx = header.findIndex(h => h === 'Date' || h === 'Date Time')
  const amountIdx = header.indexOf('Amount')
  const currencyIdx = header.indexOf('Currency')
  const descIdx = header.indexOf('Description')

  return lines.slice(1).filter(Boolean).map(line => {
    const cols = parseCsvLine(line)
    const amount = parseFloat(cols[amountIdx])
    const rawDate = cols[dateIdx]?.slice(0, 10) ?? ''
    const date = normalizeDate(rawDate)
    const desc = cols[descIdx] ?? ''
    const currency = cols[currencyIdx] ?? 'EUR'
    return {
      date,
      description: desc,
      amount: Math.abs(amount),
      currency,
      type: amount >= 0 ? 'income' : 'expense',
      import_hash: hash(`wise-${date}-${desc}-${amount}-${currency}`),
    }
  })
}

// ─── Revolut CSV ─────────────────────────────────────────────────────────────
// Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
export function parseRevolut(csv: string): ParsedTransaction[] {
  const lines = csv.trim().split('\n')
  const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const startedIdx = header.indexOf('Started Date')
  const dateIdx = header.indexOf('Completed Date')
  const amountIdx = header.indexOf('Amount')
  const currencyIdx = header.indexOf('Currency')
  const descIdx = header.indexOf('Description')
  const stateIdx = header.indexOf('State')
  const balanceIdx = header.indexOf('Balance')

  return lines.slice(1).filter(Boolean).map(line => {
    const cols = parseCsvLine(line)
    if (cols[stateIdx] !== 'COMPLETED') return null
    const amount = parseFloat(cols[amountIdx])
    const date = normalizeDate(cols[dateIdx]?.slice(0, 10) ?? '')
    const started = cols[startedIdx] ?? ''
    const desc = cols[descIdx] ?? ''
    const currency = cols[currencyIdx] ?? 'EUR'
    const balance = cols[balanceIdx] ?? ''
    return {
      date,
      description: desc,
      amount: Math.abs(amount),
      currency,
      type: amount >= 0 ? 'income' : 'expense',
      import_hash: hash(`revolut-${started}-${date}-${desc}-${amount}-${currency}-${balance}`),
    }
  }).filter(Boolean) as ParsedTransaction[]
}

// ─── OCBC Indonesia CSV ───────────────────────────────────────────────────────
// Date,Description,Withdrawals (IDR),Deposits (IDR),Balance (IDR)
// Also handles USD accounts with same structure
export function parseOCBC(csv: string, currency = 'IDR'): ParsedTransaction[] {
  const lines = csv.trim().split('\n').slice(1)
  return lines.filter(Boolean).map(line => {
    const cols = parseCsvLine(line)
    const date = cols[0]?.trim() ?? ''
    const desc = cols[1]?.trim() ?? ''
    const withdrawal = parseFloat((cols[2] ?? '0').replace(/[,\s]/g, '')) || 0
    const deposit = parseFloat((cols[3] ?? '0').replace(/[,\s]/g, '')) || 0
    const amount = withdrawal > 0 ? withdrawal : deposit
    const type = deposit > 0 ? 'income' : 'expense'
    return {
      date: normalizeDate(date),
      description: desc,
      amount,
      currency,
      type,
      import_hash: hash(`ocbc-${date}-${desc}-${amount}-${currency}`),
    }
  })
}

// ─── OCBC Indonesia PDF ───────────────────────────────────────────────────────
// Parses text extracted from OCBC Indonesia bank statement PDFs.
// Expected row format: "DD Mon YYYY  Description  [Withdrawal]  [Deposit]  Balance"
export function parseOCBCPdf(text: string, currency = 'IDR'): ParsedTransaction[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const results: ParsedTransaction[] = []

  const datePattern = /^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  const amountPattern = /[\d,]+\.\d{2}/g
  const monthMap: Record<string, string> = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
  }

  function parseOCBCDate(dateStr: string): string {
    const m = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/i)
    if (m) return `${m[3]}-${monthMap[m[2].toLowerCase()] ?? '01'}-${m[1].padStart(2, '0')}`
    return normalizeDate(dateStr)
  }

  let prevBalance: number | null = null

  for (const line of lines) {
    const dateMatch = line.match(datePattern)
    if (!dateMatch) continue

    const dateStr = dateMatch[1]

    // Skip opening balance / header rows
    if (/opening\s*balance|brought\s*forward|saldo\s*awal/i.test(line)) {
      const amounts = Array.from(line.matchAll(amountPattern)).map(m => parseFloat(m[0].replace(/,/g, '')))
      if (amounts.length > 0) prevBalance = amounts[amounts.length - 1]
      continue
    }

    const amounts = Array.from(line.matchAll(amountPattern)).map(m => parseFloat(m[0].replace(/,/g, '')))
    if (amounts.length === 0) continue

    const balance = amounts[amounts.length - 1]

    // Transaction amount is second-to-last, or derived from balance delta
    let amount: number
    if (amounts.length >= 2) {
      amount = amounts[amounts.length - 2]
    } else if (prevBalance !== null) {
      amount = Math.abs(balance - prevBalance)
    } else {
      prevBalance = balance
      continue
    }

    if (amount === 0) { prevBalance = balance; continue }

    const type: 'income' | 'expense' = (prevBalance !== null && balance > prevBalance) ? 'income' : 'expense'

    // Description = everything between date and first amount
    const firstAmountPos = line.search(/[\d,]+\.\d{2}/)
    const desc = line.slice(dateMatch[0].length, firstAmountPos > 0 ? firstAmountPos : undefined).trim() || 'OCBC Transactie'

    const normalizedDate = parseOCBCDate(dateStr)
    prevBalance = balance

    results.push({
      date: normalizedDate,
      description: desc,
      amount,
      currency,
      type,
      import_hash: hash(`ocbc-pdf-${normalizedDate}-${desc}-${amount}-${currency}`),
    })
  }

  return results
}

// ─── Auto-detect bank ────────────────────────────────────────────────────────
export function detectBank(csv: string): BankSource | null {
  const header = csv.slice(0, 300).toLowerCase()
  if (header.includes('mutatiesoort') || header.includes('tegenrekening')) return 'rabobank'
  if (header.includes('transferwise') || header.includes('transfer reference')) return 'wise'
  if (header.includes('revolut') || header.includes('started date')) return 'revolut'
  if (header.includes('withdrawals') && header.includes('deposits')) return 'ocbc'
  return null
}

export function parseCSV(csv: string, bank: BankSource, currency?: string): ParsedTransaction[] {
  switch (bank) {
    case 'rabobank': return parseRabobank(csv)
    case 'wise':     return parseWise(csv)
    case 'revolut':  return parseRevolut(csv)
    case 'ocbc':     return parseOCBC(csv, currency)
    default:         return []
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += char }
  }
  result.push(current)
  return result.map(s => s.trim())
}

function normalizeDate(date: string): string {
  // Handle DD/MM/YYYY or DD-MM-YYYY → YYYY-MM-DD
  const m = date.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return date.slice(0, 10)
}
