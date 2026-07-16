import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getSupplierList, getRecentFeedback } from '@/lib/google'

export const maxDuration = 60 // seconds — needed for slow vision calls on Vercel

const PROMPT = `You are extracting data from a handwritten "Gather Cashier Daily Report" form.

IMPORTANT — THE PHOTO MAY CONTAIN MULTIPLE DOCUMENTS:
The cashier often photographs the whole table at once, so the image may also contain EDC machine printouts, bank receipts, envelopes, loose cash, or other papers. You must IGNORE all of those completely.
Extract data ONLY from the handwritten notebook/form that has "Gather Cashier Daily Report" (or "Cashier Daily Report") as its heading. If you see two pages of that form side by side, read both as one form.

IMPORTANT — INK BLEED-THROUGH:
The notebook paper is thin. You will often see text and numbers bleeding through from the OTHER side of the page. These bleed-through values appear faded, reversed, or mirrored. You must IGNORE all bleed-through text entirely — only read values that are clearly written on the front of the visible page.

Return ONLY a valid JSON object with the exact keys below. No markdown, no explanation.

--- VALUE RULES ---
- All monetary amounts are in Indonesian Rupiah (IDR).
- Strip any "Rp", "Rp.", currency symbols, and thousand-separator dots or commas. Return plain integers (e.g. "Rp 1.500.000" → 1500000).
- If a field is blank or illegible, use null. For the expenses array, use [] if empty.
- Extract ONLY the values the cashier wrote in the input fields of the Gather form. Ignore any pre-printed "Total" or calculated columns.

--- FIELDS TO EXTRACT (from the Gather Cashier Daily Report form only) ---

HEADER:
  date   — convert to YYYY-MM-DD (e.g. "7 July 2026" → "2026-07-07")
  name   — the cashier's name written on the form

OPENING section:
  opening_petty_cash      — "Opening Petty Cash"
  petty_cash_received     — "Petty Cash Received"
  opening_cashier_modal   — "Opening Cashier (Modal)"

CASH PER PAYMENT METHOD section — the table has columns: Cafe | Wild Muse | Tip | Total
Extract ONLY the Cafe, Wild Muse, and Tip input columns. Do NOT extract the Total column (it is auto-calculated).
  cash_cafe,          cash_wild_muse,          cash_tip
  edc_bca_cafe,       edc_bca_wild_muse,       edc_bca_tip
  edc_mandiri_cafe,   edc_mandiri_wild_muse,   edc_mandiri_tip
  qris_bca_cafe,      qris_bca_wild_muse,      qris_bca_tip
  qris_mandiri_cafe,  qris_mandiri_wild_muse,  qris_mandiri_tip
  grab    — single value written next to "Grab"
  gojek   — single value written next to "Gojek"

IMPORTANT — HOW CASHIERS FILL IN THE TABLE:
- Sometimes a cashier writes only ONE number per payment method row (e.g. "Cash: Rp 2.043.600"). In that case put the number in the _cafe field and leave _wild_muse and _tip as null.
- Sometimes a cashier writes TWO numbers — one under Cafe and one under Wild Muse (e.g. "EDC BCA: Rp 965.000 [cafe] + Rp 300.000 [wildmuse]"). In that case extract each number into the correct field (_cafe and _wild_muse).
- Only extract the Tip column if there is clearly a number written under the Tip heading.
- A dash (—), (-), or a blank cell means the value is zero/empty → use null.
- If a value is crossed out, ignore it completely and use the replacement value written nearby, or null if no replacement.
- Do NOT extract pre-printed "Total" column values or the "Total Sales" / "Total Expenses" summary lines at the bottom of sections — these are calculated, not input fields.

EXPENSES section — extract each filled row as an object:
  expenses: [ { description: string, amount: number, paid_by: string }, ... ]
  For paid_by, normalize to one of exactly two values:
  - "Petty Cash"          → if written as "Petty Cash", "PCC", "Petty Cash Cashier", "PC", "cash", or left blank
  - "BCA / Bank Transfer" → if written as "EDC BCA", "BCA", "Bank Transfer", "Transfer BCA", or any bank/card reference
  Default to "Petty Cash" when unclear.

PETTY CASH CALCULATION section (often on the SECOND / BACK page of the form):
  This section is titled "Petty Cash Calculation" and lists:
  opening_petty_cash        — "Opening Petty Cash"
  petty_cash_received       — "+ Petty Cash Received"  (also labelled "Petty Cash Received")
  money_from_cash_sales     — "Money from Cash Sales"
  actual_petty_cash_counted — "= Actual Petty Cash Counted"
  If you see TWO images, the second image likely contains this section — read it.

NOTES section (same page as Petty Cash Calculation):
  notes — any handwritten notes below the petty cash section (e.g. settlement notes, discrepancy explanations). Empty string if blank.`

async function fileToImageBlock(file: File) {
  const bytes = await file.arrayBuffer()
  return {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      data: Buffer.from(bytes).toString('base64'),
    },
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file1 = formData.get('image') as File | null
    const file2 = formData.get('image2') as File | null
    if (!file1) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const [imageBlocks, suppliers, feedback] = await Promise.all([
      Promise.all([file1, file2].filter(Boolean).map(f => fileToImageBlock(f!))),
      getSupplierList(),
      getRecentFeedback(),
    ])

    const supplierSection = suppliers.length > 0
      ? `\n\nSUPPLIER MATCHING — THIS IS MANDATORY:
The canonical supplier list is:
${suppliers.map(s => `- ${s}`).join('\n')}

Rules for matching expense descriptions to this list:
1. ALWAYS prefer a name from the list over what the cashier wrote.
2. Match on ANY single significant word in common (e.g. "Turtle" matches "Bali Turtle Farm", "Indo" matches "Indo Supplies Bali").
3. Ignore abbreviations, missing words, different word order, typos, or shortened versions.
4. If you are even 50% confident there is a match, use the canonical name.
5. Only use the handwritten text as-is if you find absolutely no match in the list.

Known handwriting variations seen in practice (use the canonical list name if it exists):
- "Cazyhand Bakery" / "Gay Hands Battery" / "Gazyhand" → likely the same supplier, match to list
- "Agung Mart" / "Ag Mart" → Agung Mart
- "Budi Dharma" / "B. Dharma" → Budi Dharma
- "Baliseger" / "Baliseger" → same supplier
- "Meat Mart" → Meat Mart
- "PCA" / "PCA (Gas)" → PCA or match closest in list
- "Bedugul" → match to list (may appear multiple times in one day)
- "Cumbung Pongan" / "Cumbung" → match to list`
      : ''

    const feedbackSection = feedback.length > 0
      ? `\n\nRECENT CORRECTIONS (fields where you extracted the wrong value — learn from these):\n${feedback.map(f => `- ${f.field}: you extracted "${f.ai}", correct value was "${f.corrected}"`).join('\n')}\n\nPay extra attention to these fields and avoid repeating these mistakes.`
      : ''

    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: PROMPT + supplierSection + feedbackSection },
        ],
      }],
    })

    const stopReason = message.stop_reason
    console.log('Claude stop_reason:', stopReason)
    const textBlock = message.content.find(b => b.type === 'text')
    const raw = textBlock?.type === 'text' ? textBlock.text.trim() : ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI could not recognise the form', raw: raw.slice(0, 500), stopReason }, { status: 422 })

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
