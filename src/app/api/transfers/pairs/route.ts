import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET — return all linked transfer pairs with account info
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: txs } = await supabase
    .from('admin_transactions')
    .select('id, account_id, date, description, amount, currency, type, transfer_group_id, status')
    .eq('user_id', user.id)
    .not('transfer_group_id', 'is', null)
    .order('date', { ascending: false })

  const { data: accounts } = await supabase
    .from('admin_accounts')
    .select('id, name')
    .eq('user_id', user.id)

  if (!txs || !accounts) return NextResponse.json({ pairs: [] })

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]))

  // Group by transfer_group_id
  const groups: Record<string, typeof txs> = {}
  for (const tx of txs) {
    const g = tx.transfer_group_id!
    if (!groups[g]) groups[g] = []
    groups[g].push(tx)
  }

  const pairs = Object.entries(groups)
    .filter(([, legs]) => legs.length === 2 && legs[0].account_id !== legs[1].account_id)
    .map(([group_id, legs]) => {
      const [a, b] = legs
      const bothTransfer = a.type === 'transfer' && b.type === 'transfer'
      const bothIncome = a.type === 'income' && b.type === 'income'
      const broken = bothTransfer || bothIncome
      return {
        group_id,
        broken,
        legs: legs.map(tx => ({
          id: tx.id,
          account_id: tx.account_id,
          account_name: accountMap[tx.account_id] ?? tx.account_id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type,
          status: tx.status,
        })),
      }
    })
    .sort((a, b) => (a.broken === b.broken ? 0 : a.broken ? -1 : 1)) // broken first

  return NextResponse.json({ pairs })
}

// PATCH { group_id } — swap which leg is income vs transfer
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { group_id } = await req.json()
  if (!group_id) return NextResponse.json({ error: 'Missing group_id' }, { status: 400 })

  const { data: txs } = await supabase
    .from('admin_transactions')
    .select('id, type')
    .eq('transfer_group_id', group_id)
    .eq('user_id', user.id)

  if (!txs || txs.length !== 2) return NextResponse.json({ error: 'Pair not found' }, { status: 404 })

  const [a, b] = txs
  // Swap: whichever was income becomes transfer, and vice versa
  const newTypeA = a.type === 'income' ? 'transfer' : 'income'
  const newTypeB = b.type === 'income' ? 'transfer' : 'income'

  await supabase.from('admin_transactions').update({ type: newTypeA }).eq('id', a.id).eq('user_id', user.id)
  await supabase.from('admin_transactions').update({ type: newTypeB }).eq('id', b.id).eq('user_id', user.id)

  // Recalculate balances for both accounts
  const recalc = async (account_id: string, currency: string) => {
    const { data } = await supabase
      .from('admin_transactions')
      .select('amount, type')
      .eq('account_id', account_id)
      .eq('currency', currency)
      .eq('user_id', user.id)
      .eq('status', 'processed')
    if (!data) return
    const balance = data.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0)
    await supabase.from('admin_account_balances').upsert(
      { account_id, user_id: user.id, currency, balance, updated_at: new Date().toISOString() },
      { onConflict: 'account_id,currency' }
    )
  }

  // Fetch full tx info for recalc
  const { data: fullTxs } = await supabase
    .from('admin_transactions')
    .select('account_id, currency')
    .eq('transfer_group_id', group_id)
    .eq('user_id', user.id)

  if (fullTxs) {
    await Promise.all(fullTxs.map(t => recalc(t.account_id, t.currency)))
  }

  return NextResponse.json({ success: true, types: { [a.id]: newTypeA, [b.id]: newTypeB } })
}
