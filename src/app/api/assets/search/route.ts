import { NextRequest, NextResponse } from 'next/server'

const TYPE_MAP: Record<string, string> = {
  EQUITY: 'Aandeel', ETF: 'ETF', MUTUALFUND: 'Fonds',
  CRYPTOCURRENCY: 'Crypto', FUTURE: 'Future', INDEX: 'Index',
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q')
  if (!q || q.trim().length < 2) return NextResponse.json({ results: [] })

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) return NextResponse.json({ results: [] })

    const data = await res.json()
    const results = (data.quotes ?? [])
      .filter((q: { quoteType?: string }) =>
        ['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY', 'FUTURE'].includes(q.quoteType ?? '')
      )
      .slice(0, 8)
      .map((q: { symbol: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange ?? '',
        type: TYPE_MAP[q.quoteType ?? ''] ?? q.quoteType ?? '',
      }))

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
