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
          text: `This is a bank statement PDF. The primary currency is likely ${currencyHint}.

Return a single JSON object — no markdown, no code fences. Format:
{
  "bank": "<one of: wise, rabobank, revolut, ocbc, manual>",
  "transactions": [ ... ]
}

Identify "bank" from the institution name on the statement (e.g. Wise → "wise", OCBC → "ocbc", Rabobank → "rabobank", Revolut → "revolut", anything else → "manual").

Each transaction object must have:
- date: "YYYY-MM-DD" (convert from any date format you find)
- description: string (the transaction description/merchant name)
- amount: number (always a positive number)
- type: "income" if money came IN (deposit/credit/kredit), "expense" if money went OUT (withdrawal/debit/debet)
- currency: the currency code (e.g. "EUR", "IDR", "CHF"). Use the section currency if multiple sections exist, otherwise use "${currencyHint}".

Rules:
- If the statement has multiple currency sections (e.g. "Currency Code : EUR"), extract ALL sections.
- Skip rows that are: opening/closing balance, interest charges, tax rows, or rows where both debit and credit are 0.
- For OCBC statements: use KREDIT column for income, DEBET column for expenses.
- For any other bank: use whatever credit/debit columns are present.

If no transactions are found, return { "bank": "manual", "transactions": [] }.`,
        },
      ],
    }],
  })

  const raw = (message.content[0] as { text: string }).text.trim()
  const objMatch = raw.match(/\{[\s\S]*\}/)
  if (!objMatch) return { transactions: [], bank: 'manual' }

  let parsed: { bank?: string; transactions?: { date: string; description: string; amount: number; type: string; currency?: string }[] }
  try {
    parsed = JSON.parse(objMatch[0])
  } catch {
    return { transactions: [], bank: 'manual' }
  }

  const detectedBank = parsed.bank ?? 'manual'
  const rows = parsed.transactions ?? []

  return {
    bank: detectedBank,
    transactions: rows
      .filter(r => r.date && r.amount > 0)
      .map(r => {
        const cur = r.currency || currencyHint
        return {
          date: r.date,
          description: r.description || '—',
          amount: Math.abs(r.amount),
          currency: cur,
          type: r.type === 'income' ? 'income' : 'expense',
          import_hash: hash(`pdf-${r.date}-${r.description}-${r.amount}-${cur}`),
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

    // Build currency → account_id routing map.
    // For PDF uploads: search all user jars by currency (not just same-bank),
    // so a Wise EUR jar stored as 'manual' still gets matched.
    // The selected account_id is the fallback for unmatched currencies.
    const currencyToAccount: Record<string, string> = { [currency]: account_id }
    if (isPdf) {
      const { data: allAccounts } = await supabase
        .from('admin_accounts')
        .select('id, currency, account_type')
        .eq('user_id', user.id)
      // Prefer jars over regular accounts when matching by currency
      const jars = (allAccounts || []).filter(a => a.account_type === 'jar')
      const regular = (allAccounts || []).filter(a => a.account_type !== 'jar')
      for (const acc of [...regular, ...jars]) {
        if (acc.currency) currencyToAccount[acc.currency] = acc.id
      }
    }

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

    for (const [targetAccountId, txs] of Object.entries(byAccount)) {
      const { data: existing } = await supabase
        .from('admin_transactions')
        .select('import_hash')
        .eq('account_id', targetAccountId)

      const existingHashes = new Set((existing || []).map((r: { import_hash: string }) => r.import_hash))

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
            ai_categorized: false,
            status: 'draft',
          }
        })

      totalSkipped += txs.length - toInsert.length

      if (toInsert.length > 0) {
        const { error } = await supabase.from('admin_transactions').insert(toInsert)
        if (error) {
          // Duplicate key means these were already imported — count as skipped, not an error
          if (error.message.includes('duplicate key') || error.code === '23505') {
            totalSkipped += toInsert.length
          } else {
            return NextResponse.json({ error: error.message }, { status: 500 })
          }
        } else {
          totalImported += toInsert.length
        }
      }
    }

    return NextResponse.json({ imported: totalImported, skipped: totalSkipped, bank, routed: routedTo })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: `Serverfout: ${msg}` }, { status: 500 })
  }
}
