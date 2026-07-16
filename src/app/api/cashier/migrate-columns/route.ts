import { NextResponse } from 'next/server'
import { migrateColumns } from '@/lib/google'

export async function POST() {
  try {
    const result = await migrateColumns()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
