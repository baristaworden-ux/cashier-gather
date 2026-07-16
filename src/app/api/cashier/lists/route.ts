import { NextResponse } from 'next/server'
import { getSupplierList, getCashierList } from '@/lib/google'

export async function GET() {
  try {
    const [suppliers, cashiers] = await Promise.all([getSupplierList(), getCashierList()])
    return NextResponse.json({ suppliers, cashiers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ suppliers: [], cashiers: [], error: msg })
  }
}
