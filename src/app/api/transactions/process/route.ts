import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, revert } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: tx, error: fetchErr } = await supabase
    .from('admin_transactions')
    .select('account_id, currency, amount, type, transfer_group_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  const newStatus = revert ? 'draft' : 'processed'

  const { error } = await supabase
    .from('admin_transactions')
    .update({ status: newStatus })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For linked transfer pairs: find the sibling to determine direction.
  // If the sibling is on a DIFFERENT account, this transaction is the receiving leg → inflow.
  let transferInflow = false
  if (tx.type === 'transfer' && tx.transfer_group_id) {
    const { data: sibling } = await supabase
      .from('admin_transactions')
      .select('account_id')
      .eq('transfer_group_id', tx.transfer_group_id)
      .neq('id', id)
      .eq('user_id', user.id)
      .single()
    if (sibling && sibling.account_id !== tx.account_id) {
      transferInflow = true
    }
  }

  // Recalculate balance based only on processed transactions
  const { data: processedTxs } = await supabase
    .from('admin_transactions')
    .select('id, amount, type, transfer_group_id')
    .eq('account_id', tx.account_id)
    .eq('currency', tx.currency)
    .eq('status', 'processed')

  if (processedTxs) {
    // For each processed transfer, check if it's the receiving leg (sibling on different account)
    const transferGroupIds = processedTxs
      .filter(t => t.type === 'transfer' && t.transfer_group_id)
      .map(t => t.transfer_group_id as string)

    let inboundTransferIds = new Set<string>()
    if (transferGroupIds.length > 0) {
      const { data: siblings } = await supabase
        .from('admin_transactions')
        .select('transfer_group_id, account_id')
        .in('transfer_group_id', transferGroupIds)
        .neq('account_id', tx.account_id)
        .eq('user_id', user.id)
      if (siblings) {
        inboundTransferIds = new Set(siblings.map(s => s.transfer_group_id as string))
      }
    }

    const balance = processedTxs.reduce((sum: number, t: { id: string; amount: number; type: string; transfer_group_id: string | null }) => {
      if (t.type === 'income') return sum + t.amount
      if (t.type === 'transfer' && t.transfer_group_id && inboundTransferIds.has(t.transfer_group_id)) return sum + t.amount
      return sum - t.amount
    }, 0)

    await supabase
      .from('admin_account_balances')
      .upsert(
        { account_id: tx.account_id, user_id: user.id, currency: tx.currency, balance, updated_at: new Date().toISOString() },
        { onConflict: 'account_id,currency' }
      )
  }

  return NextResponse.json({ success: true, transferInflow })
}
