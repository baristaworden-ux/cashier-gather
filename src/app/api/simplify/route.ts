import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { transaction_ids } = await req.json()
  if (!transaction_ids?.length) return NextResponse.json({ error: 'No transaction_ids' }, { status: 400 })

  const { data: transactions } = await supabase
    .from('admin_transactions')
    .select('id, description, original_description, amount, currency, type, vendor')
    .in('id', transaction_ids)
    .eq('user_id', user.id)

  if (!transactions?.length) return NextResponse.json({ simplified: 0 })

  // Strip "Card transaction of X.XX CUR issued by " prefix before sending to AI
  function preStrip(raw: string): string {
    return raw.replace(/^Card transaction of [\d,.]+ [A-Z]{3} issued by /i, '').trim()
  }

  const BATCH = 50
  let totalSimplified = 0

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH).map(t => ({
      id: t.id,
      raw: preStrip(t.original_description || t.description),
      vendor: t.vendor || null,
      type: t.type,
    }))

    const prompt = `Extract the merchant or business name from each raw bank transaction description. Return only the clean name — nothing else.

Rules:
- Strip all prefixes like "Pos Sales Debit", "Post Sales Debit", "POS Purchase", "Card Payment", "Direct Debit", "SEPA", "iDEAL", transaction codes, dates, IBAN numbers, city names, and reference numbers
- Return just the merchant name as it appears, e.g. "PUTRI FRESH ORGANIC", "Albert Heijn", "Netflix", "Spotify"
- If the vendor field is already set, use that as the description
- If it's a salary or wage transfer and no merchant is obvious, return "Salaris"
- If it's a transfer between own accounts, return "Overboeking"
- If truly nothing useful remains, return the shortest meaningful part of the raw text
- Max 50 characters

Examples:
"Pos Sales Debit/Post Sales Debit - 2630 PUTRI FRESH ORGANIC Badung (Kab)" → "PUTRI FRESH ORGANIC"
"iDEAL betaling aan Albert Heijn 123456" → "Albert Heijn"
"SEPA Overboeking NL12RABO0123456789 omschrijving: huur" → "Overboeking"
"Netflix International BV AMSTERDAM" → "Netflix"
"Mid*Tokopedia www.tokopedia" → "Mid*Tokopedia www.tokopedia"

Transactions:
${JSON.stringify(batch)}

Return ONLY a JSON array:
[{"id": "...", "description": "..."}]`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue
      const results: { id: string; description: string }[] = JSON.parse(jsonMatch[0])

      for (const result of results) {
        if (!result.description) continue
        await supabase
          .from('admin_transactions')
          .update({ description: result.description })
          .eq('id', result.id)
          .eq('user_id', user.id)
        totalSimplified++
      }
    } catch {
      // skip batch on parse error
    }
  }

  return NextResponse.json({ simplified: totalSimplified })
}
