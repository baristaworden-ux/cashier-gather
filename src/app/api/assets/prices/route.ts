import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function fetchCoinGeckoPrices(tickers: string[], currencies: string[]): Promise<Record<string, Record<string, number>>> {
  const ids = tickers.join(',')
  const vs = Array.from(new Set(currencies.map(c => c.toLowerCase()))).join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vs}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  return res.json()
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

async function fetchYahooSingle(ticker: string): Promise<{ price: number; currency: string } | null> {
  const path = `/v8/finance/chart/${ticker}?interval=1d&range=1d&includePrePost=false`
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(`https://${host}${path}`, { headers: YF_HEADERS, next: { revalidate: 0 } })
      if (!res.ok) continue
      const data = await res.json()
      const meta = data?.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice) return { price: meta.regularMarketPrice, currency: meta.currency ?? 'USD' }
    } catch { continue }
  }
  return null
}

async function fetchYahooPrices(symbols: string[]): Promise<Record<string, { price: number; currency: string }>> {
  const results = await Promise.all(symbols.map(async s => ({ s, r: await fetchYahooSingle(s) })))
  const out: Record<string, { price: number; currency: string }> = {}
  for (const { s, r } of results) if (r) out[s.toUpperCase()] = r
  return out
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
  const otherAssets  = assets.filter(a => a.category !== 'crypto')

  // ── Crypto via CoinGecko ──
  if (cryptoAssets.length > 0) {
    try {
      const tickers = cryptoAssets.map(a => a.price_ticker!)
      const currencies = cryptoAssets.map(a => a.currency)
      const data = await fetchCoinGeckoPrices(tickers, currencies)
      for (const asset of cryptoAssets) {
        const price = data[asset.price_ticker!.toLowerCase()]?.[asset.currency.toLowerCase()]
        if (price !== undefined) priceMap[asset.id] = price
      }
    } catch (e) {
      console.error('CoinGecko error:', e)
    }
  }

  // ── Stocks + Metals via Yahoo Finance ──
  if (otherAssets.length > 0) {
    try {
      const symbols = otherAssets.map(a => a.price_ticker!)
      const data = await fetchYahooPrices(symbols)
      for (const asset of otherAssets) {
        const entry = data[asset.price_ticker!.toUpperCase()]
        if (entry) priceMap[asset.id] = entry.price
      }
    } catch (e) {
      console.error('Yahoo Finance error:', e)
    }
  }

  // ── Update DB ──
  await Promise.all(
    Object.entries(priceMap).map(([id, current_price]) =>
      supabase
        .from('admin_assets')
        .update({ current_price })
        .eq('id', id)
        .eq('user_id', user.id)
    )
  )

  const { data: updated } = await supabase
    .from('admin_assets')
    .select('*')
    .eq('user_id', user.id)
    .order('category')
    .order('name')

  return NextResponse.json({ updated: Object.keys(priceMap).length, assets: updated || [] })
}
