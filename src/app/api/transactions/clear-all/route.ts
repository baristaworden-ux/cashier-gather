import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error: txError } = await supabase
    .from('admin_transactions')
    .delete()
    .eq('user_id', user.id)

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

  const { error: balError } = await supabase
    .from('admin_account_balances')
    .update({ balance: 0, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (balError) return NextResponse.json({ error: balError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

