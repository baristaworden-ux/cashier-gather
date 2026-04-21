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

async function extractOCBCFromPdf(buffer: Buffer, currency: string): Promise<ParsedTransaction[]> {
  const client = new Anthropic()
  const base64 = buffer.toString('base64')

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
          text: `This is an OCBC Indonesia bank statement. It may contain multiple currency sections (e.g. IDR, EUR, CHF), each starting with "Currency Code : XXX".

Extract ALL transactions from ALL currency sections. Return ONLY a raw JSON array — no markdown, no code fences, no explanation. Start with [ and end with ].

Each object must have:
- date: "YYYY-MM-DD" (convert from DD/MM/YYYY format)
- description: string (main description line; append the "Berita:" note if present, separated by " - ")
- amount: number (always positive; use the non-zero value from DEBET or KREDIT column)
- type: "income" if KREDIT > 0, "expense" if DEBET > 0
- currency: the currency code for that section ("IDR", "EUR", "CHF", etc.)

Skip these rows: Beginning Balance, closing balance summary, JASA REKENING/ACCOUNT INTEREST, PAJAK/TAX, and any row where both DEBET and KREDIT are 0.00.`,
        },
      ],
    }],
  })

  const raw = (message.content[0] as { text: string }).text.trim()
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const rows: { date: string; description: string; amount: number; type: string; currency?: string }[] = JSON.parse(jsonMatch[0])

  return rows.map(r => ({
    date: r.date,
    description: r.description,
    amount: Math.abs(r.amount),
    currency: r.currency || currency,
    type: r.type === 'income' ? 'income' : 'expense',
    import_hash: hash(`ocbc-pdf-${r.date}-${r.description}-${r.amount}-${r.currency || currency}`),
  }))
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

    const name = file.name.toLowerCase()
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf'

    let parsed: ParsedTransaction[]
    let bank: string

    if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer())
      parsed = await extractOCBCFromPdf(buffer, currency)
      bank = 'ocbc'
      if (parsed.length === 0) return NextResponse.json({ error: 'Geen transacties gevonden in het PDF-bestand. Controleer of het een geldig OCBC-afschrift is.' }, { status: 422 })
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

    // For PDF uploads: auto-route transactions to matching accounts/jars by currency.
    // Load all user accounts for this bank and build a currency → account_id map.
    const currencyToAccount: Record<string, string> = { [currency]: account_id }
    if (isPdf) {
      const { data: allAccounts } = await supabase
        .from('admin_accounts')
        .select('id, currency')
        .eq('user_id', user.id)
        .eq('bank', bank)
      for (const acc of allAccounts || []) {
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
    const routedTo: Record<string, string> = {} // currency → account_id, for response info

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
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        totalImported += toInsert.length
      }
    }

    return NextResponse.json({ imported: totalImported, skipped: totalSkipped, bank, routed: routedTo })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: `Serverfout: ${msg}` }, { status: 500 })
  }
}
