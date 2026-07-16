import { NextRequest, NextResponse } from 'next/server'
import { getSheetRows, deleteSheetRow } from '@/lib/google'

export async function GET() {
  try {
    const rows = await getSheetRows()
    return NextResponse.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { rowIndex } = await req.json()
    if (typeof rowIndex !== 'number') {
      return NextResponse.json({ error: 'rowIndex required' }, { status: 400 })
    }
    await deleteSheetRow(rowIndex)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
