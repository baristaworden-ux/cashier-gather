import { NextRequest, NextResponse } from 'next/server'

// ECB daily reference rates XML — simple, always accessible from servers
// Rates are expressed as "XAU per EUR" (inverse), so gold price = 1/rate
const ECB_METALS: Record<string, string> = {
  'GC=F': 'XAU',
  'SI=F': 'XAG',
}

async function fetchECBMetalPrice(currencyCode: string): Promise<number | null> {
  try {
    const res = await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', {
      headers: { Accept: 'application/xml, text/xml, */*' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const xml = await res.text()
    const match = xml.match(new RegExp(`<Cube currency="${currencyCode}" rate="([^"]+)"`))
    if (!match) return null
    const rate = parseFloat(match[1])
    if (isNaN(rate) || rate <= 0) return null
    // Rate is oz-per-EUR, invert to get EUR-per-oz
    return Math.round((1 / rate) * 100) / 100
  } catch { return null }
}

async function fetchCoinGeckoPrice(ticker: string, currency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ticker)}&vs_currencies=${currency.toLowerCase()}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    )
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
      const price = await fetchCoinGeckoPrice(ticker, currency)
      if (price === null) return NextResponse.json({ error: 'Ticker niet gevonden' }, { status: 404 })
      return NextResponse.json({ price })
    }

    if (category === 'metals') {
      const ecbCode = ECB_METALS[ticker.toUpperCase()]
      if (ecbCode) {
        const price = await fetchECBMetalPrice(ecbCode)
        if (price !== null) return NextResponse.json({ price })
      }
      return NextResponse.json({ error: 'Prijs niet beschikbaar' }, { status: 404 })
    }

    return NextResponse.json({ error: 'Vul prijs handmatig in' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
