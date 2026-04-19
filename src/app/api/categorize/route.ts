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

    const prompt = `Analyseer de volgende banktransacties. Geef voor elke transactie:
1. vendor — naam van het bedrijf of persoon. Gebruik een bekende leverancier als die overeenkomt, anders een korte herkenbare naam.
2. category — kies uit: ${categories.join(', ')}
3. description — een korte, leesbare omschrijving in het Nederlands (max ~40 tekens). Vervang de cryptische bankcode door iets begrijpelijks, bijv. "Boodschappen Albert Heijn", "Huur januari", "Salaris", "Netflix abonnement".
${vendorHint}

Transacties:
${JSON.stringify(batch)}

Geef je antwoord ALLEEN als een JSON array:
[{"id": "...", "vendor": "...", "category": "...", "description": "..."}]

Regels:
- vendor: korte naam. Leeg string als echt onbekend.
- category: altijd een waarde uit de lijst
- description: kort en begrijpelijk, geen bankcodes of ID's
- Voor inkomsten: category "Inkomen" of "Overboekingen"
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
      const results: { id: string; vendor: string; category: string; description?: string }[] = JSON.parse(jsonMatch[0])

      for (const result of results) {
        const update: Record<string, string | boolean | null> = {
          vendor: result.vendor || null,
          category: result.category,
          ai_categorized: true,
        }
        if (result.description) update.description = result.description
        await supabase
          .from('admin_transactions')
          .update(update)
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
