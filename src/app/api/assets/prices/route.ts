import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const METALS_MAP: Record<string, string> = {
  'GC=F': 'gc.f', 'SI=F': 'si.f', 'PL=F': 'pl.f', 'PA=F': 'pa.f',
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

async function fetchStooqPrice(ticker: string): Promise<number | null> {
  const sym = METALS_MAP[ticker.toUpperCase()] ?? (ticker.includes('.') ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`)
  try {
    const res = await fetch(`https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`, { cache: 'no-store' })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const close = parseFloat(lines[1].split(',')[6])
    return isNaN(close) || close <= 0 ? null : close
  } catch { return null }
}

async function getUsdToEur(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { next: { revalidate: 3600 } })
    if (!res.ok) return 0.92
    const data = await res.json()
    return data?.rates?.EUR ?? 0.92
  } catch { return 0.92 }
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
  const stockAssets  = assets.filter(a => a.category === 'stocks')

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

  // ── Metals via Stooq + USD→EUR conversion ──
  if (metalsAssets.length > 0) {
    const usdToEur = await getUsdToEur()
    await Promise.all(metalsAssets.map(async a => {
      const usd = await fetchStooqPrice(a.price_ticker!)
      if (usd !== null) {
        priceMap[a.id] = a.currency === 'EUR' ? Math.round(usd * usdToEur * 100) / 100 : usd
      }
    }))
  }

  // ── Stocks via Stooq ──
  if (stockAssets.length > 0) {
    const usdToEur = await getUsdToEur()
    await Promise.all(stockAssets.map(async a => {
      const usd = await fetchStooqPrice(a.price_ticker!)
      if (usd !== null) {
        priceMap[a.id] = a.currency === 'EUR' ? Math.round(usd * usdToEur * 100) / 100 : usd
      }
    }))
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
