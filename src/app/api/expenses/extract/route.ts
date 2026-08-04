import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getSupplierList, getExpenseCategoryList } from '@/lib/google'

export const maxDuration = 60

const PROMPT = `You are extracting data from a photo of a receipt or invoice for Gather, a restaurant in Bali.

Return ONLY a valid JSON object with these exact keys. No markdown, no explanation.

{
  "date": "YYYY-MM-DD",
  "supplier_name": "name of the supplier or vendor",
  "category": "Food & Beverages",
  "total_amount": 150000,
  "description": "what was purchased (1 short line)",
  "payment_source": "Petty Cash",
  "invoice_number": "",
  "notes": ""
}

Rules:
- date: convert any date format to YYYY-MM-DD. If not visible, use null.
- total_amount: integer in IDR. Strip "Rp", dots, commas. E.g. "Rp 1.500.000" → 1500000.
- payment_source: MUST be exactly "Petty Cash" or "BCA / Bank Transfer". Default to "Petty Cash" if unclear.
- description: brief summary of what was bought (e.g. "Vegetables and ingredients", "Kitchen supplies").
- invoice_number: the invoice or receipt number printed on the document. Empty string if not visible.
- notes: any relevant notes or payment reference. Empty string if none.
- category: choose the BEST match from the category list provided below. Use the exact category name from the list.`

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const [bytes, suppliers, categories] = await Promise.all([
      file.arrayBuffer(),
      getSupplierList(),
      getExpenseCategoryList(),
    ])

    const imageBlock = {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: Buffer.from(bytes).toString('base64'),
      },
    }

    const categorySection = categories.length > 0
      ? `\n\nEXPENSE CATEGORIES — choose the best match for the "category" field:\n${categories.map(c => `- ${c.category}${c.odoo_code ? ` (${c.odoo_code})` : ''}`).join('\n')}\nUse the exact category name from this list.`
      : ''

    const supplierSection = suppliers.length > 0
      ? `\n\nSUPPLIER MATCHING — THIS IS MANDATORY:
The canonical supplier list is:
${suppliers.map(s => `- ${s}`).join('\n')}

Rules:
1. ALWAYS prefer a name from the list over what is printed on the receipt.
2. Match on ANY single significant word in common.
3. Only use the printed text as-is if you find absolutely no match.`
      : ''

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [imageBlock, { type: 'text', text: PROMPT + categorySection + supplierSection }],
      }],
    })

    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : ''
    const jsonStr = extractJSON(raw)
    if (!jsonStr) return NextResponse.json({ error: 'Could not read the receipt', raw: raw.slice(0, 400) }, { status: 422 })

    return NextResponse.json(JSON.parse(jsonStr))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
