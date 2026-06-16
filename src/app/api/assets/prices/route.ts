import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// pax-gold on CoinGecko: 1 PAXG = 1 troy oz gold, tracks XAU spot price exactly
const METALS_COINGECKO: Record<string, string> = {
  'GC=F': 'pax-gold',
}

async function fetchCoinGeckoPrices(ids: string[], currencies: string[]): Promise<Record<string, Record<string, number>>> {
  const vs = Array.from(new Set(currencies.map(c => c.toLowerCase()))).join(',')
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}`, {
    headers: { Accept: 'application/json' }, cache: 'no-store',
  })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  return res.json()
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: assets } = await supabase
    .from('admin_assets')
    .select('id, category, price_ticker, currency')
    .eq('user_id', user.id)
    .not('price_ticker', 'is', null)
    .neq('price_ticker', '')

  if (!assets || assets.length === 0) {
    const { data: allAssets } = await supabase
      .from('admin_assets').select('*').eq('user_id', user.id).order('category').order('name')
    return NextResponse.json({ updated: 0, assets: allAssets || [] })
  }

  const priceMap: Record<string, number> = {}

  const cryptoAssets = assets.filter(a => a.category === 'crypto')
  const metalsAssets = assets.filter(a => a.category === 'metals')

  // ── Crypto + metals both via CoinGecko ──
  const cgAssets = [
    ...cryptoAssets.map(a => ({ ...a, cgId: a.price_ticker! })),
    ...metalsAssets
      .map(a => ({ ...a, cgId: METALS_COINGECKO[a.price_ticker!.toUpperCase()] }))
      .filter(a => a.cgId),
  ]

  if (cgAssets.length > 0) {
    try {
      const ids = cgAssets.map(a => a.cgId)
      const currencies = cgAssets.map(a => a.currency)
      const data = await fetchCoinGeckoPrices(ids, currencies)
      for (const a of cgAssets) {
        const price = data[a.cgId]?.[a.currency.toLowerCase()]
        if (price !== undefined) priceMap[a.id] = price
      }
    } catch (e) { console.error('CoinGecko error:', e) }
  }

  // ── Update DB ──
  await Promise.all(
    Object.entries(priceMap).map(([id, current_price]) =>
      supabase.from('admin_assets').update({ current_price }).eq('id', id).eq('user_id', user.id)
    )
  )

  const { data: updated } = await supabase
    .from('admin_assets').select('*').eq('user_id', user.id).order('category').order('name')

  return NextResponse.json({ updated: Object.keys(priceMap).length, assets: updated || [] })
}
