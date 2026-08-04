import { NextRequest, NextResponse } from 'next/server'
import { getExpenseRows, appendExpenseRows, updateExpenseRow } from '@/lib/google'

export const maxDuration = 60

export async function GET() {
  try {
    const rows = await getExpenseRows()
    return NextResponse.json(rows)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      sheetRowIndex: number
      supplier?: string
      category?: string
      payment_source?: string
      amount?: number
      odoo_account_code?: string
      odoo_account_name?: string
      status?: string
    }
    if (!body.sheetRowIndex) return NextResponse.json({ error: 'sheetRowIndex required' }, { status: 400 })
    await updateExpenseRow(body.sheetRowIndex, body)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { date, supplier, category, description, amount, payment_source, notes, invoice_number, odoo_account_code, odoo_account_name, created_by, receipt_file_name } = body
    if (!date || !amount) {
      return NextResponse.json({ error: 'date and amount are required' }, { status: 400 })
    }
    await appendExpenseRows([{
      date,
      supplier: supplier ?? '',
      category: category ?? '',
      description: description ?? '',
      amount: parseFloat(String(amount).replace(/\D/g, '')) || 0,
      payment_source: payment_source ?? 'Petty Cash',
      receipt_link: '',
      notes: notes ?? '',
      invoice_number: invoice_number ?? '',
      internal_id: '',
      status: 'Draft',
      created_by: created_by ?? '',
      odoo_account_code: odoo_account_code ?? '',
      odoo_account_name: odoo_account_name ?? '',
      receipt_file_name: receipt_file_name ?? '',
    }])
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
