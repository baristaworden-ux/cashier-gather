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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { account_id, date, description, amount, currency, type, category, status,
          investment_asset_id, investment_wallet_id, investment_units } = body
  if (!account_id || !date || !description || amount === undefined || !currency || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Unique hash for dedup (manual entries are always unique via timestamp)
  const import_hash = `manual:${user.id}:${account_id}:${date}:${description}:${amount}:${currency}:${Date.now()}`

  const { data: tx, error } = await supabase
    .from('admin_transactions')
    .insert({
      user_id: user.id,
      account_id,
      date,
      description: description.trim(),
      original_description: description.trim(),
      amount: parseFloat(amount),
      currency,
      type,
      category: category?.trim() || null,
      status: status || 'processed',
      source: 'manual',
      import_hash,
      ai_categorized: false,
      ...(investment_asset_id ? { investment_asset_id } : {}),
      ...(investment_wallet_id ? { investment_wallet_id } : {}),
      ...(investment_units !== undefined ? { investment_units: parseFloat(investment_units) } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Increment the existing balance. Fetch ALL balance records for this account so we
  // can pick the right one regardless of whether currency is null or 'EUR'.
  if (tx && (status === 'processed' || !status)) {
    const parsedAmount = parseFloat(amount)
    const delta = type === 'income' ? parsedAmount : -parsedAmount

    const { data: records } = await supabase
      .from('admin_account_balances')
      .select('id, balance, currency, user_id')
      .eq('account_id', account_id)

    // Exact currency match only — no cross-currency fallback (that caused double-deduction bugs)
    const existing = records?.find(r => r.user_id === user.id && r.currency === currency)
      ?? records?.find(r => r.currency === currency)

    if (existing) {
      await supabase.from('admin_account_balances')
        .update({ balance: existing.balance + delta, user_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('admin_account_balances')
        .insert({ account_id, user_id: user.id, currency, balance: delta, updated_at: new Date().toISOString() })
    }
  }

  return NextResponse.json({ transaction: tx })
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
    .select('id, account_id, currency, status, type, transfer_group_id, investment_asset_id, investment_wallet_id, investment_units')
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

  // Reverse asset/wallet units for investment transactions
  if (tx.type === 'investment' && tx.investment_asset_id && tx.investment_units) {
    const { data: currentAsset } = await supabase
      .from('admin_assets').select('units').eq('id', tx.investment_asset_id).eq('user_id', user.id).single()
    if (currentAsset) {
      await supabase.from('admin_assets')
        .update({ units: currentAsset.units - tx.investment_units })
        .eq('id', tx.investment_asset_id).eq('user_id', user.id)
    }
    if (tx.investment_wallet_id) {
      const { data: currentWallet } = await supabase
        .from('admin_asset_wallets').select('units').eq('id', tx.investment_wallet_id).eq('user_id', user.id).single()
      if (currentWallet) {
        await supabase.from('admin_asset_wallets')
          .update({ units: currentWallet.units - tx.investment_units })
          .eq('id', tx.investment_wallet_id).eq('user_id', user.id)
      }
    }
  }

  // Recalculate balances for ALL currencies on this account from remaining processed transactions.
  // This prevents phantom balance records from past currency mismatches staying wrong.
  if (tx.status === 'processed') {
    const { data: remainingTxs } = await supabase
      .from('admin_transactions')
      .select('id, amount, type, currency, transfer_group_id')
      .eq('account_id', tx.account_id)
      .eq('status', 'processed')

    if (remainingTxs) {
      const transferGroupIds = remainingTxs
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

      // Group net balance by currency
      const balanceByCurrency: Record<string, number> = {}
      for (const t of remainingTxs) {
        const cur = t.currency
        balanceByCurrency[cur] = (balanceByCurrency[cur] ?? 0)
          + (t.type === 'income' ? t.amount
            : (t.type === 'transfer' && t.transfer_group_id && inboundTransferIds.has(t.transfer_group_id)) ? t.amount
            : -t.amount)
      }

      // Upsert each currency that still has transactions
      await Promise.all(
        Object.entries(balanceByCurrency).map(([cur, bal]) =>
          supabase.from('admin_account_balances').upsert(
            { account_id: tx.account_id, user_id: user.id, currency: cur, balance: bal, updated_at: new Date().toISOString() },
            { onConflict: 'account_id,currency' }
          )
        )
      )

      // Zero out ALL existing balance records for this account that have no remaining transactions
      // (catches phantom records from past currency mismatches)
      const { data: existingRecords } = await supabase
        .from('admin_account_balances')
        .select('id, currency')
        .eq('account_id', tx.account_id)
        .eq('user_id', user.id)

      const phantomIds = (existingRecords || [])
        .filter(r => !(r.currency in balanceByCurrency))
        .map(r => r.id)

      if (phantomIds.length > 0) {
        await supabase.from('admin_account_balances')
          .update({ balance: 0, updated_at: new Date().toISOString() })
          .in('id', phantomIds)
      }
    }
  }

  return NextResponse.json({ success: true })
}
