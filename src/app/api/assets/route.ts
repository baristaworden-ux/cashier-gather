import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('admin_assets')
    .select('*')
    .eq('user_id', user.id)
    .order('category')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, symbol, category, units, current_price, currency, purchase_price, purchase_date, notes } = body
  if (!name || !category) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('admin_assets')
    .insert({
      user_id: user.id,
      name: name.trim(),
      symbol: symbol?.trim() || null,
      category,
      units: parseFloat(units) || 0,
      current_price: parseFloat(current_price) || 0,
      currency: currency || 'EUR',
      purchase_price: parseFloat(purchase_price) || null,
      purchase_date: purchase_date || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...body } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name.trim()
  if (body.symbol !== undefined) updateData.symbol = body.symbol?.trim() || null
  if (body.category !== undefined) updateData.category = body.category
  if (body.units !== undefined) updateData.units = parseFloat(body.units) || 0
  if (body.current_price !== undefined) updateData.current_price = parseFloat(body.current_price) || 0
  if (body.currency !== undefined) updateData.currency = body.currency
  if (body.purchase_price !== undefined) updateData.purchase_price = parseFloat(body.purchase_price) || null
  if (body.purchase_date !== undefined) updateData.purchase_date = body.purchase_date || null
  if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null

  const { data, error } = await supabase
    .from('admin_assets')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('admin_assets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
