import { createClient } from '@/lib/supabase/server'

export async function recalculateOutstanding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  loan_id: string,
  user_id: string
) {
  const { data: loan } = await supabase
    .from('admin_loans')
    .select('original_amount')
    .eq('id', loan_id)
    .eq('user_id', user_id)
    .single()

  if (!loan) return

  const { data: payments } = await supabase
    .from('admin_transactions')
    .select('amount')
    .eq('loan_id', loan_id)
    .eq('type', 'aflossing')
    .eq('status', 'processed')
    .eq('user_id', user_id)

  const paid = (payments || []).reduce((s: number, t: { amount: number }) => s + t.amount, 0)
  const outstanding_amount = Math.max(0, loan.original_amount - paid)

  await supabase
    .from('admin_loans')
    .update({ outstanding_amount, updated_at: new Date().toISOString() })
    .eq('id', loan_id)
    .eq('user_id', user_id)

  return outstanding_amount
}
