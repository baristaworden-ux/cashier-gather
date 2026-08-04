import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getFeedbackRows } from '@/lib/google'

export const maxDuration = 30

export async function POST() {
  try {
    const rows = await getFeedbackRows()
    if (!rows.length) return NextResponse.json({ error: 'No feedback data yet' }, { status: 400 })

    const formatted = rows.map((r, i) =>
      `#${i + 1} [${r.date}] Rating: ${r.q1_rating || '?'} | Dislike: ${r.q2_dislike || '—'} | Menu suggestion: ${r.q3_menu_suggestion || '—'} | Other feedback: ${r.q4_other_feedback || '—'} | Found us via: ${r.q5_how_heard}${r.q5_how_heard_other ? ` (${r.q5_how_heard_other})` : ''}`
    ).join('\n')

    const prompt = `You are analyzing guest feedback for Gather, a sharing-plates restaurant in Bali.

Here is all the feedback collected so far (${rows.length} forms):

${formatted}

Based on this feedback, return ONLY a valid JSON object with these keys:

{
  "rating_summary": { "Delicious": 0, "Good": 0, "Average": 0, "Fair": 0, "Tasteless": 0 },
  "top_dish_suggestions": ["...", "...", "..."],
  "top_complaints": ["...", "..."],
  "other_highlights": "..."
}

Rules:
- rating_summary: count exact occurrences of each rating. Use 0 for any not present.
- top_dish_suggestions: list the most requested menu additions, deduplicated and specific. Max 5 items. Use [] if none.
- top_complaints: list the most common complaints or negatives, deduplicated. Max 5 items. Use [] if none or all positive.
- other_highlights: 1-2 sentence summary of notable positive feedback or patterns worth knowing. Empty string if nothing notable.`

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content.find(b => b.type === 'text')?.type === 'text'
      ? (message.content.find(b => b.type === 'text') as { type: 'text'; text: string }).text.trim()
      : ''

    // Extract JSON from response
    let jsonStr: string | null = null
    try { JSON.parse(raw); jsonStr = raw } catch {}
    if (!jsonStr) {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) { try { JSON.parse(match[0]); jsonStr = match[0] } catch {} }
    }
    if (!jsonStr) return NextResponse.json({ error: 'AI analysis failed', raw: raw.slice(0, 300) }, { status: 422 })

    return NextResponse.json(JSON.parse(jsonStr))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
