import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectBank, parseCSV } from '@/lib/parsers'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const account_id = formData.get('account_id') as string
  const currency = (formData.get('currency') as string) || 'EUR'

  if (!file || !account_id) return NextResponse.json({ error: 'Missing file or account_id' }, { status: 400 })

  const csv = await file.text()
  const bank = detectBank(csv)
  if (!bank) return NextResponse.json({ error: 'Kon de bank niet herkennen. Controleer of het een geldig CSV-bestand is van Rabobank, Wise, Revolut of OCBC.' }, { status: 422 })

  const parsed = parseCSV(csv, bank, currency)
  if (parsed.length === 0) return NextResponse.json({ error: 'Geen transacties gevonden in het bestand.' }, { status: 422 })

  // Get existing hashes to detect duplicates
  const { data: existing } = await supabase
    .from('admin_transactions')
    .select('import_hash')
    .eq('account_id', account_id)

  const existingHashes = new Set((existing || []).map((r: { import_hash: string }) => r.import_hash))

  const toInsert = parsed
    .filter(t => !existingHashes.has(t.import_hash))
    .map(t => ({
      ...t,
      account_id,
      user_id: user.id,
      original_description: t.description,
      source: bank,
      ai_categorized: false,
    }))

  const skipped = parsed.length - toInsert.length

  if (toInsert.length > 0) {
    const { error } = await supabase.from('admin_transactions').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update account balance from most recent transaction's running balance if available
  // (For now, we compute it from transactions)
  await updateAccountBalance(supabase, account_id, user.id, currency)

  return NextResponse.json({ imported: toInsert.length, skipped, bank })
}

async function updateAccountBalance(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, account_id: string, user_id: string, currency: string) {
  const { data } = await supabase
    .from('admin_transactions')
    .select('amount, type')
    .eq('account_id', account_id)
    .eq('currency', currency)

  if (!data) return

  const balance = data.reduce((sum: number, t: { amount: number; type: string }) => {
    return sum + (t.type === 'income' ? t.amount : -t.amount)
  }, 0)

  await supabase
    .from('admin_account_balances')
    .upsert(
      { account_id, user_id, currency, balance, updated_at: new Date().toISOString() },
      { onConflict: 'account_id,currency' }
    )
}
