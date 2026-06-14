import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: accounts }, { data: balances }, { data: openingBalances }] = await Promise.all([
    supabase.from('admin_accounts').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('admin_account_balances').select('*').eq('user_id', user.id),
    supabase.from('admin_opening_balances').select('*').eq('user_id', user.id),
  ])

  return NextResponse.json({ accounts: accounts || [], balances: balances || [], opening_balances: openingBalances || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, bank, account_number, account_type, currency, linked_account_id } = await req.json()
  if (!name || !bank) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const color = COLORS[Math.floor(Math.random() * COLORS.length)]

  const { data, error } = await supabase
    .from('admin_accounts')
    .insert({ name, bank, account_number: account_number || null, account_type: account_type || 'account', currency: currency || null, linked_account_id: linked_account_id || null, color, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For jars with a known currency, create a 0-balance record so they appear in the overview immediately
  if (data && account_type === 'jar' && currency) {
    await supabase.from('admin_account_balances').upsert(
      { account_id: data.id, user_id: user.id, currency, balance: 0, updated_at: new Date().toISOString() },
      { onConflict: 'account_id,currency' }
    )
  }

  return NextResponse.json({ account: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('admin_accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
