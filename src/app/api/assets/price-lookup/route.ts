import { NextRequest, NextResponse } from 'next/server'

// Stooq ticker mapping for metals (returns USD futures price)
const METALS_MAP: Record<string, string> = {
  'GC=F': 'gc.f',  // Gold
  'SI=F': 'si.f',  // Silver
  'PL=F': 'pl.f',  // Platinum
  'PA=F': 'pa.f',  // Palladium
}

async function fetchStooqPrice(ticker: string): Promise<number | null> {
  const sym = METALS_MAP[ticker.toUpperCase()] ?? ticker.replace('=F', '.f').toLowerCase()
  const url = `https://stooq.com/q/l/?s=${sym}&f=sd2t2ohlcv&h&e=csv`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const cols = lines[1].split(',')
    const close = parseFloat(cols[6])
    return isNaN(close) || close <= 0 ? null : close
  } catch { return null }
}

async function convertToEur(usdPrice: number): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { next: { revalidate: 3600 } })
    if (!res.ok) return usdPrice * 0.92
    const data = await res.json()
    const rate: number = data?.rates?.EUR ?? 0.92
    return usdPrice * rate
  } catch { return usdPrice * 0.92 }
}

async function fetchCoinGeckoPrice(ticker: string, currency: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ticker)}&vs_currencies=${currency}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data[ticker.toLowerCase()]?.[currency.toLowerCase()] ?? null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')?.trim()
  const category = searchParams.get('category') || 'stocks'
  const currency = (searchParams.get('currency') || 'EUR').toUpperCase()

  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 })

  try {
    if (category === 'crypto') {
      const price = await fetchCoinGeckoPrice(ticker, currency.toLowerCase())
      if (price === null) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price })
    }

    if (category === 'metals') {
      const usdPrice = await fetchStooqPrice(ticker)
      if (usdPrice === null) return NextResponse.json({ error: 'Prijs niet beschikbaar' }, { status: 404 })
      const price = currency === 'EUR' ? await convertToEur(usdPrice) : usdPrice
      return NextResponse.json({ price: Math.round(price * 100) / 100 })
    }

    // Stocks: try Stooq first (add .us for US stocks if no exchange suffix)
    const sym = ticker.includes('.') ? ticker.toLowerCase() : `${ticker.toLowerCase()}.us`
    const usdPrice = await fetchStooqPrice(sym)
    if (usdPrice !== null) {
      const price = currency === 'EUR' ? await convertToEur(usdPrice) : usdPrice
      return NextResponse.json({ price: Math.round(price * 100) / 100 })
    }

    return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
