import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const account_id = searchParams.get('account_id')
  const limit = parseInt(searchParams.get('limit') || '200')

  let query = supabase
    .from('admin_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(limit)

  if (account_id) query = query.eq('account_id', account_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions: data || [] })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...body } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('admin_transactions')
    .update(body)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: tx } = await supabase
    .from('admin_transactions')
    .select('id, account_id, currency, status, type, transfer_group_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('admin_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculate balance after delete (only processed transactions affect balance)
  if (tx.status === 'processed') {
    const { data: processedTxs } = await supabase
      .from('admin_transactions')
      .select('id, amount, type, transfer_group_id')
      .eq('account_id', tx.account_id)
      .eq('currency', tx.currency)
      .eq('status', 'processed')

    if (processedTxs) {
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

      const balance = processedTxs.reduce((sum, t) => {
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
  }

  return NextResponse.json({ success: true })
}
