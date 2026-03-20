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

  // Load user's categories and vendors
  const [{ data: catData }, { data: vendorData }] = await Promise.all([
    supabase.from('admin_categories').select('name, type').eq('user_id', user.id).order('name'),
    supabase.from('admin_vendors').select('name, category').eq('user_id', user.id).order('name'),
  ])

  const categories = catData?.map(c => c.name) ?? [
    'Wonen', 'Eten & drinken', 'Transport', 'Gezondheid', 'Inkomen',
    'Belasting', 'Zakelijk', 'Abonnementen', 'Overboekingen', 'Overig',
  ]
  const vendors: { name: string; category: string }[] = vendorData || []

  const { data: transactions } = await supabase
    .from('admin_transactions')
    .select('id, description, amount, currency, type')
    .in('id', transaction_ids)
    .eq('user_id', user.id)

  if (!transactions?.length) return NextResponse.json({ categorized: 0 })

  const BATCH = 50
  let totalCategorized = 0

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH)

    const vendorHint = vendors.length > 0
      ? `\nBekende leveranciers (naam → standaard categorie):\n${vendors.map(v => `- ${v.name} → ${v.category}`).join('\n')}`
      : ''

    const prompt = `Analyseer de volgende banktransacties. Identificeer voor elke transactie:
1. De leverancier (vendor) — de naam van het bedrijf of persoon in de omschrijving. Gebruik een van de bekende leveranciers als die overeenkomt, anders een korte herkenbare naam.
2. De categorie — kies uit: ${categories.join(', ')}
${vendorHint}

Transacties:
${JSON.stringify(batch)}

Geef je antwoord ALLEEN als een JSON array:
[{"id": "...", "vendor": "...", "category": "..."}]

Regels:
- vendor: korte naam, bijv. "Albert Heijn", "NS", "Spotify". Leeg string als echt onbekend.
- category: altijd een waarde uit de lijst
- Voor inkomsten: gebruik "Inkomen" of "Overboekingen"
- Antwoord ALLEEN met de JSON array`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue
      const results: { id: string; vendor: string; category: string }[] = JSON.parse(jsonMatch[0])

      for (const result of results) {
        await supabase
          .from('admin_transactions')
          .update({
            vendor: result.vendor || null,
            category: result.category,
            ai_categorized: true,
          })
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
