import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const CATEGORIES = [
  'Wonen', 'Eten & drinken', 'Transport', 'Gezondheid', 'Inkomen',
  'Belasting', 'Zakelijk', 'Abonnementen', 'Verzekeringen', 'Sparen',
  'Entertainment', 'Kleding', 'Reizen', 'Opleiding', 'Familie',
  'Overboekingen', 'Overig',
]

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { transaction_ids } = await req.json()
  if (!transaction_ids?.length) return NextResponse.json({ error: 'No transaction_ids' }, { status: 400 })

  const { data: transactions } = await supabase
    .from('admin_transactions')
    .select('id, description, amount, currency, type')
    .in('id', transaction_ids)
    .eq('user_id', user.id)

  if (!transactions?.length) return NextResponse.json({ categorized: 0 })

  // Batch in groups of 50
  const BATCH = 50
  let totalCategorized = 0

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH)

    const prompt = `Categoriseer de volgende banktransacties. Geef voor elke transactie één categorie terug uit deze lijst:
${CATEGORIES.join(', ')}

Transacties (JSON array met id, description, amount, currency, type):
${JSON.stringify(batch)}

Geef je antwoord ALLEEN als een JSON array in dit formaat:
[{"id": "...", "category": "...", "subcategory": "..."}]

Regels:
- Gebruik altijd een categorie uit de lijst
- subcategory is optioneel (vrij tekst, max 30 tekens)
- Voor inkomsten: gebruik "Inkomen" of "Overboekingen"
- Voor spaaroverdrachten: gebruik "Sparen"
- Antwoord ALLEEN met de JSON array, geen uitleg`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue
      const results: { id: string; category: string; subcategory?: string }[] = JSON.parse(jsonMatch[0])

      for (const result of results) {
        await supabase
          .from('admin_transactions')
          .update({ category: result.category, subcategory: result.subcategory || null, ai_categorized: true })
          .eq('id', result.id)
          .eq('user_id', user.id)
        totalCategorized++
      }
    } catch {
      // skip batch on parse error
    }
  }

  return NextResponse.json({ categorized: totalCategorized })
}
