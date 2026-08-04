import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getExpenseCategoryList, getSupplierCategoryMap, findInSupplierMap } from '@/lib/google'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { expenses } = await req.json() as {
      expenses: { description: string; amount: number }[]
    }
    if (!expenses?.length) return NextResponse.json({ suggestions: [] })

    const [categories, supplierMap] = await Promise.all([
      getExpenseCategoryList(),
      getSupplierCategoryMap(),
    ])

    // First pass: direct lookup from supplier map, validated against known categories
    const results: ({ category: string; odoo_account_code: string; odoo_account_name: string } | null)[] =
      expenses.map(e => {
        const match = findInSupplierMap(supplierMap, e.description)
        if (match) {
          const cat = categories.find(c =>
            (match.category && c.category === match.category) ||
            (match.odoo_code && c.odoo_code === match.odoo_code)
          )
          if (cat) {
            return {
              category: cat.category,
              odoo_account_code: cat.odoo_code,
              odoo_account_name: cat.odoo_name,
            }
          }
        }
        return null
      })

    // Second pass: AI for anything not found in the map
    const needsAI = results.map((r, i) => r === null ? i : -1).filter(i => i !== -1)

    if (needsAI.length > 0 && categories.length > 0) {
      const catList = categories.map(c => `- ${c.category}${c.odoo_code ? ` (${c.odoo_code})` : ''}`).join('\n')
      const prompt = `Categorize these restaurant expenses. Choose from the list below.

Categories:
${catList}

Expenses:
${needsAI.map((i, n) => `${n + 1}. "${expenses[i].description}" IDR ${expenses[i].amount}`).join('\n')}

Return ONLY a JSON array with exactly ${needsAI.length} objects: {"category": "...", "odoo_code": "..."}`

      try {
        const client = new Anthropic()
        const message = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        })
        const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '[]'
        const match = text.match(/\[[\s\S]*\]/)
        const raw = match ? (JSON.parse(match[0]) as { category: string; odoo_code: string }[]) : []

        raw.forEach((s, n) => {
          const idx = needsAI[n]
          if (idx !== undefined) {
            const cat = categories.find(c => c.category === s.category || c.odoo_code === s.odoo_code)
            results[idx] = {
              category: cat?.category ?? s.category ?? '',
              odoo_account_code: cat?.odoo_code ?? s.odoo_code ?? '',
              odoo_account_name: cat?.odoo_name ?? '',
            }
          }
        })
      } catch {
        // AI failed — leave as null (will show empty in UI)
      }
    }

    const suggestions = results.map(r => r ?? { category: '', odoo_account_code: '', odoo_account_name: '' })
    return NextResponse.json({ suggestions })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg, suggestions: [] }, { status: 500 })
  }
}
