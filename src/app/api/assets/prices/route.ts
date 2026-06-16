import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ECB reference rates for gold (XAU) and silver (XAG) — always accessible from servers
const ECB_METALS: Record<string, string> = {
  'GC=F': 'XAU',
  'SI=F': 'XAG',
}

async function fetchECBPrice(metalCode: string): Promise<number | null> {
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${metalCode}.EUR.SP00.A?lastNObservations=1&format=jsondata`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    const series = Object.values(data?.dataSets?.[0]?.series ?? {})[0] as { observations: Record<string, number[]> } | undefined
    const obs = series?.observations
    if (!obs) return null
    const lastKey = Object.keys(obs).sort((a, b) => Number(b) - Number(a))[0]
    const val = obs[lastKey]?.[0]
    if (typeof val !== 'number' || val <= 0) return null
    return val > 1 ? val : 1 / val
  } catch { return null }
}

async function fetchCoinGeckoPrices(tickers: string[], currencies: string[]): Promise<Record<string, Record<string, number>>> {
  const ids = tickers.join(',')
  const vs = Array.from(new Set(currencies.map(c => c.toLowerCase()))).join(',')
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`, {
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

  // ── Crypto via CoinGecko ──
  if (cryptoAssets.length > 0) {
    try {
      const data = await fetchCoinGeckoPrices(cryptoAssets.map(a => a.price_ticker!), cryptoAssets.map(a => a.currency))
      for (const a of cryptoAssets) {
        const price = data[a.price_ticker!.toLowerCase()]?.[a.currency.toLowerCase()]
        if (price !== undefined) priceMap[a.id] = price
      }
    } catch (e) { console.error('CoinGecko error:', e) }
  }

  // ── Metals via ECB (XAU/XAG) ──
  for (const a of metalsAssets) {
    const ecbCode = ECB_METALS[a.price_ticker!.toUpperCase()]
    if (!ecbCode) continue
    const price = await fetchECBPrice(ecbCode)
    if (price !== null) priceMap[a.id] = Math.round(price * 100) / 100
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
