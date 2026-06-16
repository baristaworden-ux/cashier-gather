import { NextRequest, NextResponse } from 'next/server'

// Map Yahoo Finance metal tickers to CoinGecko token IDs
// pax-gold = PAX Gold: 1 PAXG = 1 troy oz gold, tracks spot XAU exactly
const METALS_COINGECKO: Record<string, string> = {
  'GC=F': 'pax-gold',      // PAX Gold: 1 PAXG = 1 troy oz gold
  'SI=F': 'kinesis-silver', // Kinesis Silver: 1 KAG = 1 troy oz silver
}

async function fetchCoinGeckoPrice(id: string, currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${currency.toLowerCase()}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data[id]?.[currency.toLowerCase()] ?? null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')?.trim()
  const category = searchParams.get('category') || 'stocks'
  const currency = (searchParams.get('currency') || 'EUR').toUpperCase()

  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 })

  try {
    // Crypto: direct CoinGecko lookup
    if (category === 'crypto') {
      const price = await fetchCoinGeckoPrice(ticker, currency)
      if (price === null) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price })
    }

    // Metals: map to CoinGecko equivalent (gold = pax-gold)
    if (category === 'metals') {
      const cgId = METALS_COINGECKO[ticker.toUpperCase()]
      if (cgId) {
        const price = await fetchCoinGeckoPrice(cgId, currency)
        if (price !== null) return NextResponse.json({ price })
      }
      // Silver/Platinum/Palladium: no reliable free source — enter manually
      return NextResponse.json({ error: 'Vul prijs handmatig in' }, { status: 404 })
    }

    // Stocks: no reliable free keyless source
    return NextResponse.json({ error: 'Vul prijs handmatig in' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
