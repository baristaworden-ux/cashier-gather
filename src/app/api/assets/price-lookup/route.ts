import { NextRequest, NextResponse } from 'next/server'

// ECB publishes XAU and XAG reference rates (EUR per troy oz)
const ECB_METALS: Record<string, string> = {
  'GC=F': 'XAU',  // Gold
  'SI=F': 'XAG',  // Silver
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
    // ECB can return EUR/oz (>100) or oz/EUR (<0.01) depending on convention — normalise
    return val > 1 ? val : 1 / val
  } catch { return null }
}

async function fetchCoinGeckoPrice(ticker: string, currency: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ticker)}&vs_currencies=${currency.toLowerCase()}`
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
    // ── Crypto: CoinGecko ──
    if (category === 'crypto') {
      const price = await fetchCoinGeckoPrice(ticker, currency)
      if (price === null) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price })
    }

    // ── Metals: ECB reference rates (XAU/XAG) ──
    if (category === 'metals') {
      const ecbCode = ECB_METALS[ticker.toUpperCase()]
      if (ecbCode) {
        const price = await fetchECBPrice(ecbCode)
        if (price !== null) return NextResponse.json({ price: Math.round(price * 100) / 100 })
      }
      return NextResponse.json({ error: 'Prijs niet beschikbaar' }, { status: 404 })
    }

    // ── Stocks: no reliable free server-side source yet ──
    return NextResponse.json({ error: 'Vul prijs handmatig in' }, { status: 404 })

  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
