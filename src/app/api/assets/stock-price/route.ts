import { NextRequest, NextResponse } from 'next/server'

// Edge runtime runs on Cloudflare's network — different IPs than Vercel serverless (AWS).
// Yahoo Finance blocks AWS Lambda IPs but not Cloudflare edge nodes.
export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const ticker = new URL(req.url).searchParams.get('ticker')?.trim()
  if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 })

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      }
    )

    if (!res.ok) return NextResponse.json({ error: 'Prijs niet gevonden' }, { status: 404 })

    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    const currency = data?.chart?.result?.[0]?.meta?.currency

    if (typeof price !== 'number') return NextResponse.json({ error: 'Prijs niet gevonden' }, { status: 404 })
    return NextResponse.json({ price, currency: currency ?? 'USD' })
  } catch {
    return NextResponse.json({ error: 'Verbindingsfout' }, { status: 502 })
  }
}
