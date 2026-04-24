import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    from_account_id,
    to_account_id,
    from_currency,
    to_currency,
    from_amount,      // total amount sent (including fees)
    to_amount,        // total amount received
    fee_amount,       // fees in from_currency (subset of from_amount)
    description,
    date,
  } = await req.json()

  if (!from_account_id || !to_account_id || !from_amount || !to_amount || !from_currency || !to_currency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Calculate exchange rate: how much to_currency per 1 from_currency (after fees)
  const net_sent = from_amount - (fee_amount || 0)
  const exchange_rate = net_sent > 0 ? parseFloat((to_amount / net_sent).toFixed(6)) : 0

  const txDate = date || new Date().toISOString().slice(0, 10)
  const desc = description || `Overboeking ${from_currency} → ${to_currency}`
  const hash = `transfer-${from_account_id}-${to_account_id}-${from_amount}-${txDate}-${Date.now()}`
  const transfer_group_id = crypto.randomUUID()

  // Debit on source account
  const { error: err1 } = await supabase.from('admin_transactions').insert({
    user_id: user.id,
    account_id: from_account_id,
    date: txDate,
    description: desc,
    original_description: desc,
    amount: from_amount,
    currency: from_currency,
    type: 'transfer',
    category: 'Overboekingen',
    notes: fee_amount ? `Kosten: ${fee_amount} ${from_currency} · Koers: 1 ${from_currency} = ${exchange_rate} ${to_currency}` : `Koers: 1 ${from_currency} = ${exchange_rate} ${to_currency}`,
    ai_categorized: false,
    status: 'processed',
    source: 'manual',
    import_hash: `${hash}-out`,
    transfer_group_id,
  })
  if (err1) return NextResponse.json({ error: err1.message }, { status: 500 })

  // Credit on destination account — type 'income' so updateBalance adds it correctly
  const { error: err2 } = await supabase.from('admin_transactions').insert({
    user_id: user.id,
    account_id: to_account_id,
    date: txDate,
    description: desc,
    original_description: desc,
    amount: to_amount,
    currency: to_currency,
    type: 'income',
    category: 'Overboekingen',
    notes: `Koers: 1 ${from_currency} = ${exchange_rate} ${to_currency}`,
    ai_categorized: false,
    status: 'processed',
    source: 'manual',
    import_hash: `${hash}-in`,
    transfer_group_id,
  })
  if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })

  // Update balances
  await updateBalance(supabase, from_account_id, user.id, from_currency)
  await updateBalance(supabase, to_account_id, user.id, to_currency)

  return NextResponse.json({ success: true, exchange_rate })
}

async function updateBalance(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  account_id: string,
  user_id: string,
  currency: string
) {
  const { data } = await supabase
    .from('admin_transactions')
    .select('amount, type')
    .eq('account_id', account_id)
    .eq('currency', currency)
    .eq('status', 'processed')

  if (!data) return
  const balance = data.reduce((sum: number, t: { amount: number; type: string }) =>
    sum + (t.type === 'income' ? t.amount : -t.amount), 0)

  await supabase.from('admin_account_balances').upsert(
    { account_id, user_id, currency, balance, updated_at: new Date().toISOString() },
    { onConflict: 'account_id,currency' }
  )
}
