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
  const dateIdx = header.indexOf('Date')
  const amountIdx = header.indexOf('Amount')
  const currencyIdx = header.indexOf('Currency')
  const descIdx = header.indexOf('Description')

  return lines.slice(1).filter(Boolean).map(line => {
    const cols = parseCsvLine(line)
    const amount = parseFloat(cols[amountIdx])
    const date = cols[dateIdx]?.slice(0, 10) ?? ''
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
  const dateIdx = header.indexOf('Completed Date')
  const amountIdx = header.indexOf('Amount')
  const currencyIdx = header.indexOf('Currency')
  const descIdx = header.indexOf('Description')
  const stateIdx = header.indexOf('State')

  return lines.slice(1).filter(Boolean).map(line => {
    const cols = parseCsvLine(line)
    if (cols[stateIdx] !== 'COMPLETED') return null
    const amount = parseFloat(cols[amountIdx])
    const date = cols[dateIdx]?.slice(0, 10) ?? ''
    const desc = cols[descIdx] ?? ''
    const currency = cols[currencyIdx] ?? 'EUR'
    return {
      date,
      description: desc,
      amount: Math.abs(amount),
      currency,
      type: amount >= 0 ? 'income' : 'expense',
      import_hash: hash(`revolut-${date}-${desc}-${amount}-${currency}`),
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
