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
    .select('account_id, currency, amount, type, transfer_group_id, loan_id')
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

  // Recalculate balance based only on processed transactions.
  // Direction is encoded in type: income = +, everything else (expense/transfer/investment…) = −.
  // The link route ensures the receiving leg of a linked transfer has type='income'.
  const { data: processedTxs } = await supabase
    .from('admin_transactions')
    .select('amount, type')
    .eq('account_id', tx.account_id)
    .eq('currency', tx.currency)
    .eq('status', 'processed')

  if (processedTxs) {
    const balance = processedTxs.reduce((sum: number, t: { amount: number; type: string }) =>
      sum + (t.type === 'income' ? t.amount : -t.amount), 0)

    await supabase
      .from('admin_account_balances')
      .upsert(
        { account_id: tx.account_id, user_id: user.id, currency: tx.currency, balance, updated_at: new Date().toISOString() },
        { onConflict: 'account_id,currency' }
      )
  }

  // Recalculate loan outstanding when an aflossing is processed or reverted
  if (tx.type === 'aflossing' && tx.loan_id) {
    const { recalculateOutstanding } = await import('@/lib/loans')
    await recalculateOutstanding(supabase, tx.loan_id, user.id)
  }

  return NextResponse.json({ success: true })
}
