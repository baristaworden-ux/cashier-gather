import { NextRequest, NextResponse } from 'next/server'

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

async function fetchYahooPrice(ticker: string): Promise<{ price: number; currency: string } | null> {
  // Do NOT encodeURIComponent — futures like GC=F need the literal = in the path
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')?.trim()
  const category = searchParams.get('category') || 'stocks'
  const currency = (searchParams.get('currency') || 'EUR').toLowerCase()

  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 })

  try {
    if (category === 'crypto') {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ticker)}&vs_currencies=${currency}`
      const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } })
      if (!res.ok) return NextResponse.json({ error: 'CoinGecko fout' }, { status: 502 })
      const data = await res.json()
      const price = data[ticker.toLowerCase()]?.[currency]
      if (price === undefined) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price })
    } else {
      const result = await fetchYahooPrice(ticker)
      if (!result) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price: result.price, priceCurrency: result.currency })
    }
  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
