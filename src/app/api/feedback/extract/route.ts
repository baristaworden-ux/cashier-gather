import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const PROMPT = `You are extracting data from a printed guest feedback form for "Gather", a restaurant in Bali.

The form is printed with checkboxes (□). The guest fills it in by ticking/checking one checkbox (✓ or ☑) per question and writing text in the open fields. Return ONLY a valid JSON object with exactly these keys. No markdown, no explanation.

FORM LAYOUT AND EXTRACTION RULES:

DATE: Written by hand at the top of the form (e.g. "13 June 2026"). Convert to YYYY-MM-DD.
Key: date

QUESTION 1 — "HOW DID YOU LIKE GATHERING WITH US?"
Five checkboxes in a row, each labelled: Delicious | Good | Average | Fair | Tasteless
Look for the checkbox that has a tick/checkmark inside it. That is the answer.
Key: q1_rating — one of: "Delicious" | "Good" | "Average" | "Fair" | "Tasteless" | "" if unclear

QUESTION 2 — "Was there anything you didn't like? tell us more!"
Handwritten open answer in a dotted box below this question.
Key: q2_dislike — transcribe exactly. Use "" if the box is blank or the guest wrote "nothing" / "—".

QUESTION 3 — "Anything you'd love to see on our sharing menu in the future?"
Handwritten open answer in a dotted box below this question.
Key: q3_menu_suggestion — transcribe exactly. Use "" if blank.

QUESTION 4 — "Any other feedback you'd like to share with us?"
Handwritten open answer in a dotted box below this question.
Key: q4_other_feedback — transcribe exactly. Use "" if blank.

QUESTION 5 — "HOW YOU KNOW ABOUT US?"
Six checkboxes in a row: Passing by | Google maps | Instagram | TikTok | Recommendation | Other
Look for the checkbox that has a tick/checkmark inside it.
Key: q5_how_heard — one of: "Passing by" | "Google Maps" | "Instagram" | "TikTok" | "Recommendation" | "Other"
Key: q5_how_heard_other — if "Other" is ticked AND the guest wrote something in the blank next to it, transcribe it. Otherwise "".

Return this exact JSON structure:
{
  "date": "YYYY-MM-DD",
  "q1_rating": "...",
  "q2_dislike": "...",
  "q3_menu_suggestion": "...",
  "q4_other_feedback": "...",
  "q5_how_heard": "...",
  "q5_how_heard_other": ""
}`

function extractJSON(text: string): string | null {
  try { JSON.parse(text); return text } catch {}
  let searchFrom = 0
  while (true) {
    const start = text.indexOf('{', searchFrom)
    if (start === -1) return null
    let depth = 0, inString = false, escape = false, end = -1
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (escape) { escape = false; continue }
      if (ch === '\\' && inString) { escape = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (!inString) {
        if (ch === '{') depth++
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break } }
      }
    }
    if (end === -1) return null
    const candidate = text.slice(start, end + 1)
    try { JSON.parse(candidate); return candidate } catch {}
    searchFrom = start + 1
  }
}

type SupportedMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const SUPPORTED_MIMES: SupportedMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function detectMime(buf: Uint8Array): SupportedMime | null {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  return null
}

async function fileToImageBlock(file: File) {
  const bytes = await file.arrayBuffer()
  const mediaType = detectMime(new Uint8Array(bytes.slice(0, 12)))
    ?? (SUPPORTED_MIMES.includes(file.type as SupportedMime) ? file.type as SupportedMime : null)
  if (!mediaType) throw new Error(`Unsupported image format (${file.type || 'unknown'}). Please use JPEG, PNG, or WebP.`)
  return {
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: mediaType, data: Buffer.from(bytes).toString('base64') },
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const imageBlock = await fileToImageBlock(file)
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: [imageBlock, { type: 'text', text: PROMPT }] }],
    })

    const raw = message.content.find(b => b.type === 'text')?.type === 'text'
      ? (message.content.find(b => b.type === 'text') as { type: 'text'; text: string }).text.trim()
      : ''

    const jsonStr = extractJSON(raw)
    if (!jsonStr) return NextResponse.json({ error: 'Could not read form', raw: raw.slice(0, 300) }, { status: 422 })

    return NextResponse.json(JSON.parse(jsonStr))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
