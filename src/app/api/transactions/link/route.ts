import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST { id_a, id_b } — link two transfer transactions together
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id_a, id_b } = await req.json()
  if (!id_a || !id_b) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

  // Fetch both transactions to determine direction
  const { data: txs } = await supabase
    .from('admin_transactions')
    .select('id, type')
    .in('id', [id_a, id_b])
    .eq('user_id', user.id)

  if (!txs || txs.length !== 2) return NextResponse.json({ error: 'Transactions not found' }, { status: 404 })

  const transfer_group_id = crypto.randomUUID()

  // Preserve direction: one leg must be 'income' (+) and the other 'transfer' (-).
  // If the data already has one income side, keep it. Otherwise treat id_b as the receiving leg.
  const hasIncome = txs.find(t => t.type === 'income')
  const hasSending = txs.find(t => t.type !== 'income')

  if (hasIncome && hasSending) {
    // Clear direction — keep existing types, just link them
    const { error } = await supabase
      .from('admin_transactions')
      .update({ transfer_group_id })
      .in('id', [id_a, id_b])
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Both have same type (both expense/transfer, or both income).
    // Treat id_a as outflow (transfer) and id_b as inflow (income).
    const { error: errA } = await supabase
      .from('admin_transactions')
      .update({ transfer_group_id, type: 'transfer' })
      .eq('id', id_a)
      .eq('user_id', user.id)
    if (errA) return NextResponse.json({ error: errA.message }, { status: 500 })

    const { error: errB } = await supabase
      .from('admin_transactions')
      .update({ transfer_group_id, type: 'income' })
      .eq('id', id_b)
      .eq('user_id', user.id)
    if (errB) return NextResponse.json({ error: errB.message }, { status: 500 })
  }

  return NextResponse.json({ transfer_group_id })
}

// DELETE ?id=<transaction_id> — unlink a transaction (clears the whole group)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Find the group
  const { data: tx } = await supabase
    .from('admin_transactions')
    .select('transfer_group_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!tx?.transfer_group_id) return NextResponse.json({ success: true })

  // Clear the whole group
  const { error } = await supabase
    .from('admin_transactions')
    .update({ transfer_group_id: null })
    .eq('transfer_group_id', tx.transfer_group_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
