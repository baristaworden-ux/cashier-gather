import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST { id_a, id_b } — link two transfer transactions together
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id_a, id_b } = await req.json()
  if (!id_a || !id_b) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

  const transfer_group_id = crypto.randomUUID()

  const { error } = await supabase
    .from('admin_transactions')
    .update({ transfer_group_id, type: 'transfer' })
    .in('id', [id_a, id_b])
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
