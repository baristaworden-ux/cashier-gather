import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function recalculateOutstanding(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, loan_id: string, user_id: string) {
  const { data: loan } = await supabase
    .from('admin_loans')
    .select('original_amount')
    .eq('id', loan_id)
    .eq('user_id', user_id)
    .single()

  if (!loan) return

  const { data: payments } = await supabase
    .from('admin_transactions')
    .select('amount')
    .eq('loan_id', loan_id)
    .eq('type', 'aflossing')
    .eq('status', 'processed')
    .eq('user_id', user_id)

  const paid = (payments || []).reduce((s: number, t: { amount: number }) => s + t.amount, 0)
  const outstanding_amount = Math.max(0, loan.original_amount - paid)

  await supabase
    .from('admin_loans')
    .update({ outstanding_amount, updated_at: new Date().toISOString() })
    .eq('id', loan_id)
    .eq('user_id', user_id)

  return outstanding_amount
}

export { recalculateOutstanding }

export async function GET(req: NextRequest) {
  void req
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: loans, error } = await supabase
    .from('admin_loans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ loans: loans || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, lender, original_amount, currency, start_date, notes } = await req.json()
  if (!name || !original_amount) return NextResponse.json({ error: 'Naam en bedrag zijn verplicht' }, { status: 400 })

  const { data: loan, error } = await supabase
    .from('admin_loans')
    .insert({
      user_id: user.id,
      name,
      lender: lender || null,
      original_amount: parseFloat(original_amount),
      outstanding_amount: parseFloat(original_amount),
      currency: currency || 'EUR',
      start_date: start_date || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ loan })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...body } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: loan, error } = await supabase
    .from('admin_loans')
    .update(body)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ loan })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Unlink any transactions
  await supabase
    .from('admin_transactions')
    .update({ loan_id: null })
    .eq('loan_id', id)
    .eq('user_id', user.id)

  const { error } = await supabase
    .from('admin_loans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
