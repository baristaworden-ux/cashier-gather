import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectBank, parseCSV, parseOCBCPdf } from '@/lib/parsers'
import type { ParsedTransaction } from '@/lib/parsers'

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

  const password = (formData.get('password') as string) || ''
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

  let parsed: ParsedTransaction[]
  let bank: string

  if (isPdf) {
    // PDF upload — only OCBC statements are PDFs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: { password?: string }) => Promise<{ text: string }>
    const buffer = Buffer.from(await file.arrayBuffer())
    let text: string
    try {
      const result = await pdfParse(buffer, password ? { password } : undefined)
      text = result.text
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypted')) {
        return NextResponse.json({ error: 'Het PDF-bestand is beveiligd. Vul het juiste wachtwoord in.' }, { status: 422 })
      }
      return NextResponse.json({ error: `Kon het PDF-bestand niet lezen: ${msg}` }, { status: 422 })
    }
    parsed = parseOCBCPdf(text, currency)
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

  // Get existing hashes to detect duplicates
  const { data: existing } = await supabase
    .from('admin_transactions')
    .select('import_hash')
    .eq('account_id', account_id)

  const existingHashes = new Set((existing || []).map((r: { import_hash: string }) => r.import_hash))

  // Load vendors for auto-matching
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

  const toInsert = parsed
    .filter(t => !existingHashes.has(t.import_hash))
    .map(t => {
      const match = matchVendor(t.description)
      return {
        ...t,
        account_id,
        user_id: user.id,
        original_description: t.description,
        source: bank,
        vendor: match?.vendor ?? undefined,
        category: match?.category ?? undefined,
        ai_categorized: false,
        status: 'draft',
      }
    })

  const skipped = parsed.length - toInsert.length

  if (toInsert.length > 0) {
    const { error } = await supabase.from('admin_transactions').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Balance is only updated when transactions are moved from draft → processed
  return NextResponse.json({ imported: toInsert.length, skipped, bank })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: `Serverfout: ${msg}` }, { status: 500 })
  }
}
