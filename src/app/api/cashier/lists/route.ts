import { NextResponse } from 'next/server'
import { getSupplierList, getCashierList, getExpenseCategoryList } from '@/lib/google'

export async function GET() {
  try {
    const [suppliers, cashiers, categories] = await Promise.all([
      getSupplierList(),
      getCashierList(),
      getExpenseCategoryList(),
    ])
    return NextResponse.json({ suppliers, cashiers, categories })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ suppliers: [], cashiers: [], categories: [], error: msg })
  }
}
