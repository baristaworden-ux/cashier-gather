import { NextRequest, NextResponse } from 'next/server'

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
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}&fields=regularMarketPrice,currency`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        next: { revalidate: 0 },
      })
      if (!res.ok) return NextResponse.json({ error: 'Yahoo Finance fout' }, { status: 502 })
      const data = await res.json()
      const quote = data?.quoteResponse?.result?.[0]
      if (!quote?.regularMarketPrice) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price: quote.regularMarketPrice, priceCurrency: quote.currency ?? 'USD' })
    }
  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
