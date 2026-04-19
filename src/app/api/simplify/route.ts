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

  const BATCH = 50
  let totalSimplified = 0

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH).map(t => ({
      id: t.id,
      raw: t.original_description || t.description,
      vendor: t.vendor || null,
      type: t.type,
    }))

    const prompt = `Vereenvoudig de ruwe bankbeschrijvingen hieronder naar korte, begrijpelijke Nederlandse omschrijvingen (max ~45 tekens).
- Vervang cryptische bankcodes, IBAN-nummers en ID's door iets leesbaars
- Gebruik de leveranciersnaam als die bekend is
- Hou het bondig: "Boodschappen Albert Heijn", "Huur januari", "Salaris", "Netflix abonnement"
- Voor inkomsten: beschrijf de bron. Voor uitgaven: beschrijf waarvoor.

Transacties:
${JSON.stringify(batch)}

Geef ALLEEN een JSON array terug:
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
