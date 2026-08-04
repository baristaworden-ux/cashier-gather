import { NextResponse } from 'next/server'
import { applyExpensesConditionalFormatting } from '@/lib/google'

export async function GET() {
  try {
    await applyExpensesConditionalFormatting()
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
