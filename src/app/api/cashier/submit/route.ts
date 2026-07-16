import { NextRequest, NextResponse } from 'next/server'
import { appendToSheet, logFeedback } from '@/lib/google'

function n(v: unknown): number {
  return parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')) || 0
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fields = JSON.parse(formData.get('fields') as string)

    // Drive upload disabled — service accounts have no Drive storage quota.
    // Fix: set up a Shared Drive and share it with the service account.
    const driveLink = ''
    const driveError = ''

    // Only petty cash expenses affect the petty cash balance.
    const pettyCashExpenses = Array.isArray(fields.expenses)
      ? fields.expenses
          .filter((e: { paid_by?: string }) => {
            const pb = (e.paid_by ?? '').trim().toLowerCase()
            const isBCA = pb === 'bca / bank transfer' || pb === 'edc bca' || pb === 'bca' || pb === 'bank transfer' || pb === 'transfer'
            return !isBCA
          })
          .reduce((s: number, e: { amount: unknown }) => s + n(e.amount), 0)
      : 0

    // Per-method totals (cafe + wild muse + tip)
    const cashTotal        = n(fields.cash_cafe)         + n(fields.cash_wild_muse)         + n(fields.cash_tip)
    const edcBcaTotal      = n(fields.edc_bca_cafe)      + n(fields.edc_bca_wild_muse)      + n(fields.edc_bca_tip)
    const edcMandiriTotal  = n(fields.edc_mandiri_cafe)  + n(fields.edc_mandiri_wild_muse)  + n(fields.edc_mandiri_tip)
    const qrisBcaTotal     = n(fields.qris_bca_cafe)     + n(fields.qris_bca_wild_muse)     + n(fields.qris_bca_tip)
    const qrisMandiriTotal = n(fields.qris_mandiri_cafe) + n(fields.qris_mandiri_wild_muse) + n(fields.qris_mandiri_tip)

    // Total of ALL expenses (petty cash + BCA/bank transfer)
    const totalAllExpenses = Array.isArray(fields.expenses)
      ? fields.expenses.reduce((s: number, e: { amount: unknown }) => s + n(e.amount), 0)
      : 0

    // App fills all columns A–AL (38 values, no sheet formulas needed).
    // Columns:
    // A  Date
    // B  Name
    // C  Opening Petty Cash
    // D  Petty Cash Received
    // E  Opening Cashier (Modal)
    // F  Sales dining in             (computed: all in-person payment totals)
    // G  Sales online                (computed: Grab + Gojek)
    // H  Total sales                 (computed: F + G)
    // I  Cash-Cafe
    // J  Cash-Wild Muse
    // K  Cash-Tip
    // L  Cash-Total
    // M  EDC BCA-Cafe
    // N  EDC BCA-Wild Muse
    // O  EDC BCA-Tip
    // P  EDC BCA-Total
    // Q  EDC Mandiri-Cafe
    // R  EDC Mandiri-Wild Muse
    // S  EDC Mandiri-Tip
    // T  EDC Mandiri-Total
    // U  QRIS BCA-Cafe
    // V  QRIS BCA-Wild Muse
    // W  QRIS BCA-Tip
    // X  QRIS BCA-Total
    // Y  QRIS Mandiri-Cafe
    // Z  QRIS Mandiri-Wild Muse
    // AA QRIS Mandiri-Tip
    // AB QRIS Mandiri-Total
    // AC Grab
    // AD Gojek
    // AE Money from Cash Sales
    // AF Total Expenses (Petty Cash only)
    // AG Total All Expenses (Petty Cash + BCA)
    // AH Actual Petty Cash Counted
    // AI Notes
    // AJ Expected Cash Remaining       (computed by app)
    // AK Total cash sales (cash - tipping) (computed by app)
    // AL Cash Difference               (computed by app)
    const salesDiningIn = cashTotal + edcBcaTotal + edcMandiriTotal + qrisBcaTotal + qrisMandiriTotal
    const salesOnline = n(fields.grab) + n(fields.gojek)
    const totalSales = salesDiningIn + salesOnline
    const expectedCashRemaining = n(fields.opening_petty_cash) + n(fields.petty_cash_received) + n(fields.money_from_cash_sales) - pettyCashExpenses
    // Cash that should remain after staff takes all tips (cash + digital) from the drawer
    const totalCashSalesMinusTipping = cashTotal
      - n(fields.cash_tip)
      - n(fields.edc_bca_tip)
      - n(fields.edc_mandiri_tip)
      - n(fields.qris_bca_tip)
      - n(fields.qris_mandiri_tip)
    const cashDifference = n(fields.actual_petty_cash_counted) - expectedCashRemaining
    const row: (string | number)[] = [
      fields.date ?? '',              // A
      fields.name ?? '',              // B
      n(fields.opening_petty_cash),   // C
      n(fields.petty_cash_received),  // D
      n(fields.opening_cashier_modal),// E
      salesDiningIn,                  // F
      salesOnline,                    // G
      totalSales,                     // H
      n(fields.cash_cafe),            // I
      n(fields.cash_wild_muse),       // J
      n(fields.cash_tip),             // K
      cashTotal,                      // L
      n(fields.edc_bca_cafe),         // M
      n(fields.edc_bca_wild_muse),    // N
      n(fields.edc_bca_tip),          // O
      edcBcaTotal,                    // P
      n(fields.edc_mandiri_cafe),     // Q
      n(fields.edc_mandiri_wild_muse),// R
      n(fields.edc_mandiri_tip),      // S
      edcMandiriTotal,                // T
      n(fields.qris_bca_cafe),        // U
      n(fields.qris_bca_wild_muse),   // V
      n(fields.qris_bca_tip),         // W
      qrisBcaTotal,                   // X
      n(fields.qris_mandiri_cafe),    // Y
      n(fields.qris_mandiri_wild_muse),// Z
      n(fields.qris_mandiri_tip),     // AA
      qrisMandiriTotal,               // AB
      n(fields.grab),                 // AC
      n(fields.gojek),                // AD
      n(fields.money_from_cash_sales),// AE
      pettyCashExpenses,              // AF
      totalAllExpenses,               // AG
      n(fields.actual_petty_cash_counted), // AH
      fields.notes ?? '',             // AI
      expectedCashRemaining,          // AJ
      totalCashSalesMinusTipping,     // AK
      cashDifference,                 // AL
    ]

    await appendToSheet(row)

    // Diff AI extraction vs corrected — log to Feedback sheet (non-fatal)
    try {
      const aiRaw = formData.get('aiExtraction')
      if (aiRaw) {
        const ai = JSON.parse(aiRaw as string)
        const diffs: { field: string; ai: string; corrected: string }[] = []

        // Numeric fields
        const numericFields = [
          'opening_petty_cash','petty_cash_received','opening_cashier_modal',
          'cash_cafe','cash_wild_muse','cash_tip',
          'edc_bca_cafe','edc_bca_wild_muse','edc_bca_tip',
          'edc_mandiri_cafe','edc_mandiri_wild_muse','edc_mandiri_tip',
          'qris_bca_cafe','qris_bca_wild_muse','qris_bca_tip',
          'qris_mandiri_cafe','qris_mandiri_wild_muse','qris_mandiri_tip',
          'grab','gojek','money_from_cash_sales','actual_petty_cash_counted',
        ]
        for (const f of numericFields) {
          if (n(ai[f]) !== n(fields[f])) {
            diffs.push({ field: f, ai: String(ai[f] ?? ''), corrected: String(fields[f] ?? '') })
          }
        }

        // Text fields
        if ((ai.name ?? '') !== (fields.name ?? '')) {
          diffs.push({ field: 'name', ai: ai.name ?? '', corrected: fields.name ?? '' })
        }
        if ((ai.date ?? '') !== (fields.date ?? '')) {
          diffs.push({ field: 'date', ai: ai.date ?? '', corrected: fields.date ?? '' })
        }

        // Expense descriptions and payment methods
        const aiExpenses: { description?: string; amount?: unknown; paid_by?: string }[] = Array.isArray(ai.expenses) ? ai.expenses : []
        const corrExpenses: { description: string; amount: string; paid_by: string }[] = Array.isArray(fields.expenses) ? fields.expenses : []
        const maxExp = Math.max(aiExpenses.length, corrExpenses.length)
        for (let i = 0; i < maxExp; i++) {
          const aiExp = aiExpenses[i]
          const corrExp = corrExpenses[i]
          if (aiExp && corrExp) {
            if ((aiExp.description ?? '') !== (corrExp.description ?? '')) {
              diffs.push({ field: `expense[${i}].description`, ai: aiExp.description ?? '', corrected: corrExp.description })
            }
            if (n(aiExp.amount) !== n(corrExp.amount)) {
              diffs.push({ field: `expense[${i}].amount`, ai: String(aiExp.amount ?? ''), corrected: corrExp.amount })
            }
          }
        }

        await logFeedback(fields.date ?? '', diffs)
      }
    } catch (e) {
      console.error('Feedback log failed:', e)
    }

    return NextResponse.json({ success: true, driveLink, driveError })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
