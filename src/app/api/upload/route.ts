import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { detectBank, parseCSV } from '@/lib/parsers'
import type { ParsedTransaction } from '@/lib/parsers'

function hash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

// Extract currency hint from filename e.g. "statement_123_EUR_2026-01-01.pdf" → "EUR"
function currencyFromFilename(filename: string): string | null {
  const m = filename.match(/[_\-]([A-Z]{3})[_\-\.]/)
  return m ? m[1] : null
}

function extractJson(raw: string): { bank?: string; transactions?: unknown[] } | unknown[] | null {
  // Strip markdown code fences
  const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim()

  // Try object format first { bank, transactions }
  const objStart = cleaned.indexOf('{')
  const objEnd = cleaned.lastIndexOf('}')
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1))
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj
    } catch {}
  }

  // Fallback: plain array
  const arrStart = cleaned.indexOf('[')
  const arrEnd = cleaned.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) } catch {}
  }

  return null
}

async function extractFromPdf(buffer: Buffer, fallbackCurrency: string, filename: string): Promise<{ transactions: ParsedTransaction[]; bank: string }> {
  const client = new Anthropic()
  const base64 = buffer.toString('base64')
  const currencyHint = currencyFromFilename(filename) || fallbackCurrency

  const message = await client.beta.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    betas: ['pdfs-2024-09-25'],
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        {
          type: 'text',
          text: `Extract all transactions from this bank statement PDF.

Return ONLY this JSON structure, no markdown, no explanation:
{"bank":"wise","transactions":[{"date":"YYYY-MM-DD","description":"...","amount":1.23,"type":"expense","currency":"EUR","tx_id":"BALANCE-1234567"}]}

Rules:
- "bank": detect from institution name → "wise", "rabobank", "revolut", "ocbc", or "manual"
- "date": convert any date format to YYYY-MM-DD
- "description": the counterparty name + first meaningful description line (e.g. "OOM HOLDING NV Premie polis 7323035")
- "amount": always a positive number
- "type": determined per-bank rules below; default "income" if Credit column has value, "expense" if Debit column has value
- "currency": use ${currencyHint} unless the statement shows a different currency per transaction
- "tx_id": the transaction reference/payment ref shown below the description — omit if not present

For Rabobank PDFs specifically:
- Each transaction row starts with a date and a two-letter type code (e.g. "02-01 ei ...", "04-01 cb ...")
- Use the type code as the PRIMARY indicator of income vs expense — it is more reliable than column position:
  - INCOME type codes (money coming IN to your account): cb, sb, st, te, we, wr
  - EXPENSE type codes (money going OUT of your account): ei, eb, id, db, bc, ec, bg, bv, ga, gb, kh, ok, sp, tb, wb
  - Exception: if description contains "Retour" or "retour", always use "income" regardless of type code
- Extract the "tx_id" from "Payment ref." line (e.g. "OO9T005416714232", "44041691568", "NP8A000282380387")
- "description": counterparty Name + first meaningful description line (e.g. "OOM HOLDING NV Premie polis 7323035", "Rabobank Rabo TotaalPakket", "P.H.M. Leblanc Aanbetaling Vinmec", "Wise TW Payment 1953936882")
- Skip opening/closing balance summary rows

For Wise PDFs specifically:
- The table has columns: Description | Incoming | Outgoing | Amount (running balance)
- Use the Incoming/Outgoing values — NOT the Amount column (that is just the balance)
- Include ALL rows: "Moved X from/to EUR", "Topped up account", "Cashback" — everything counts
- Outgoing values may appear as negative numbers (e.g. -11.00) — treat them as positive expense amounts
- Currency is ${currencyHint}

For OCBC PDFs:
- Sections start with "Currency Code : XXX" — extract all sections with their respective currency
- KREDIT = income, DEBET = expense

Skip: opening/closing balance rows, interest/tax rows, rows where both columns are 0.`,
        },
      ],
    }],
  })

  const raw = (message.content[0] as { text: string }).text.trim()
  const parsed = extractJson(raw)
  if (!parsed) return { transactions: [], bank: 'manual' }

  type TxRow = { date: string; description: string; amount: number; type: string; currency?: string; tx_id?: string }
  const INCOME_TYPES = new Set(['income', 'credit', 'cr', 'bij', 'kredit', 'deposit', 'inkomsten'])
  const resolveType = (r: TxRow): 'income' | 'expense' | 'transfer' => {
    if (r.type === 'transfer' || r.description?.toLowerCase().startsWith('moved ')) return 'transfer'
    if (INCOME_TYPES.has(r.type?.toLowerCase())) return 'income'
    return 'expense'
  }
  let detectedBank = 'manual'
  let rows: TxRow[] = []

  if (Array.isArray(parsed)) {
    rows = parsed as TxRow[]
  } else {
    const obj = parsed as { bank?: string; transactions?: TxRow[] }
    detectedBank = obj.bank ?? 'manual'
    rows = obj.transactions ?? []
  }

  return {
    bank: detectedBank,
    transactions: rows
      .filter(r => r.date && r.amount !== 0)
      .map(r => {
        const cur = r.currency || currencyHint
        const hashKey = r.tx_id ? `pdf-${r.tx_id}-${cur}` : `pdf-${r.date}-${r.description}-${r.amount}-${cur}`
        return {
          date: r.date,
          description: r.description || '—',
          amount: Math.abs(r.amount),
          currency: cur,
          type: resolveType(r),
          import_hash: hash(hashKey),
        }
      }),
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const account_id = formData.get('account_id') as string
    const currency = (formData.get('currency') as string) || 'EUR'

    if (!file || !account_id) return NextResponse.json({ error: 'Missing file or account_id' }, { status: 400 })

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    let parsed: ParsedTransaction[]
    let bank: string

    if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await extractFromPdf(buffer, currency, file.name)
      parsed = result.transactions
      bank = result.bank
      if (parsed.length === 0) return NextResponse.json({ error: 'Geen transacties gevonden in het PDF-bestand. Controleer of het een geldig bankafschrift is.' }, { status: 422 })
    } else {
      const csv = await file.text()
      const detectedBank = detectBank(csv)
      if (!detectedBank) return NextResponse.json({ error: 'Kon de bank niet herkennen. Controleer of het een geldig CSV-bestand is van Rabobank, Wise, Revolut of OCBC.' }, { status: 422 })
      bank = detectedBank
      parsed = parseCSV(csv, detectedBank, currency)
    }

    if (parsed.length === 0) return NextResponse.json({ error: 'Geen transacties gevonden in het bestand.' }, { status: 422 })

    const { data: vendorData } = await supabase
      .from('admin_vendors')
      .select('name, category')
      .eq('user_id', user.id)
    const vendors: { name: string; category: string }[] = vendorData || []

    const matchVendor = (description: string): { vendor: string; category: string } | null => {
      const lower = description.toLowerCase()
      for (const v of vendors) {
        if (lower.includes(v.name.toLowerCase())) return { vendor: v.name, category: v.category }
      }
      return null
    }

    // Build currency → account_id routing map for multi-currency PDFs.
    // The user-selected account_id always wins for the primary currency —
    // Auto-routing by currency only applies to OCBC PDFs, which embed multiple
    // currency sections in a single file. For all other banks every transaction
    // belongs to the account the user explicitly selected.
    const currencyToAccount: Record<string, string> = {}
    if (isPdf && bank === 'ocbc') {
      const { data: allAccounts } = await supabase
        .from('admin_accounts')
        .select('id, currency, account_type')
        .eq('user_id', user.id)
      const jars = (allAccounts || []).filter(a => a.account_type === 'jar')
      const regular = (allAccounts || []).filter(a => a.account_type !== 'jar')
      for (const acc of [...regular, ...jars]) {
        if (acc.currency) currencyToAccount[acc.currency] = acc.id
      }
    }
    // Selected account always wins
    currencyToAccount[currency] = account_id

    // Group parsed transactions by their target account
    const byAccount: Record<string, typeof parsed> = {}
    for (const tx of parsed) {
      const targetId = currencyToAccount[tx.currency] ?? account_id
      if (!byAccount[targetId]) byAccount[targetId] = []
      byAccount[targetId].push(tx)
    }

    let totalImported = 0
    let totalSkipped = 0
    const routedTo: Record<string, string> = {}
    type SkippedDetail = { date: string; description: string; amount: number; currency: string; account_id: string; reason: 'exists_in_db' }
    const skippedDetails: SkippedDetail[] = []

    for (const [targetAccountId, txs] of Object.entries(byAccount)) {
      const { data: existing } = await supabase
        .from('admin_transactions')
        .select('import_hash')
        .eq('account_id', targetAccountId)

      const existingHashes = new Set((existing || []).map((r: { import_hash: string }) => r.import_hash))

      const skippedHere = txs.filter(t => existingHashes.has(t.import_hash))
      skippedDetails.push(...skippedHere.map(t => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        account_id: targetAccountId,
        reason: 'exists_in_db' as const,
      })))

      const toInsert = txs
        .filter(t => !existingHashes.has(t.import_hash))
        .map(t => {
          const match = matchVendor(t.description)
          routedTo[t.currency] = targetAccountId
          return {
            ...t,
            account_id: targetAccountId,
            user_id: user.id,
            original_description: t.description,
            source: bank,
            vendor: match?.vendor ?? undefined,
            category: match?.category ?? undefined,
            counterparty: t.counterparty ?? undefined,
            ai_categorized: false,
            status: 'draft',
          }
        })

      totalSkipped += txs.length - toInsert.length

      if (toInsert.length > 0) {
        const { error } = await supabase.from('admin_transactions').insert(toInsert)
        if (error) {
          if (error.message.includes('duplicate key') || error.code === '23505') {
            // Batch had duplicates — insert one-by-one to find which ones
            for (const row of toInsert) {
              const { error: rowErr } = await supabase.from('admin_transactions').insert(row)
              if (rowErr) {
                totalSkipped++
                skippedDetails.push({ date: row.date, description: row.description, amount: row.amount, currency: row.currency, account_id: targetAccountId, reason: 'exists_in_db' })
              } else {
                totalImported++
              }
            }
          } else {
            return NextResponse.json({ error: error.message }, { status: 500 })
          }
        } else {
          totalImported += toInsert.length
        }
      }
    }

    return NextResponse.json({ imported: totalImported, skipped: totalSkipped, bank, routed: routedTo, skippedDetails })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: `Serverfout: ${msg}` }, { status: 500 })
  }
}
