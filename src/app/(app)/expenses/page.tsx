'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle, ChevronDown, ChevronRight, RefreshCw, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExpenseRow {
  date: string
  supplier: string
  category: string
  description: string
  amount: number
  payment_source: string
  receipt_link: string
  notes: string
  invoice_number: string
  internal_id: string
  status: string
  created_by: string
  odoo_account_code: string
  odoo_account_name: string
  receipt_file_name: string
  sheetRowIndex: number
}

interface ExpenseCategory {
  category: string
  odoo_code: string
  odoo_name: string
}

interface PendingEdit {
  supplier: string
  payment_source: string
  category: string
  odoo_account_code: string
  odoo_account_name: string
}

function fmtIDR(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}
function fmtDate(raw: string): string {
  if (!raw) return '—'
  const d = new Date(raw + 'T00:00:00')
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gather-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gather-500 bg-white'

export default function ExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categorizing, setCategorizing] = useState(false)
  const [pendingEdits, setPendingEdits] = useState<Map<number, PendingEdit>>(new Map())
  const [confirming, setConfirming] = useState<Set<number>>(new Set())
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  const pendingRows = rows.filter(r => (r.status ?? '').toLowerCase() === 'pending review')
  const confirmedRows = rows.filter(r => (r.status ?? '').toLowerCase() !== 'pending review')

  const confirmedByDate = confirmedRows.reduce((acc, r) => {
    const d = r.date || '—'
    if (!acc[d]) acc[d] = []
    acc[d].push(r)
    return acc
  }, {} as Record<string, ExpenseRow[]>)
  const sortedDates = Object.keys(confirmedByDate).sort((a, b) => b.localeCompare(a))

  const pendingByDate = pendingRows.reduce((acc, r) => {
    const d = r.date || '—'
    if (!acc[d]) acc[d] = []
    acc[d].push(r)
    return acc
  }, {} as Record<string, ExpenseRow[]>)
  const pendingDates = Object.keys(pendingByDate).sort((a, b) => b.localeCompare(a))

  async function autoCategorize(allRows: ExpenseRow[]) {
    const pending = allRows.filter(r => (r.status ?? '').toLowerCase() === 'pending review')
    if (!pending.length) return

    // Initialize edits for all pending rows
    setPendingEdits(prev => {
      const next = new Map(prev)
      pending.forEach(row => {
        if (!next.has(row.sheetRowIndex)) {
          next.set(row.sheetRowIndex, {
            supplier: row.supplier,
            payment_source: row.payment_source || 'Petty Cash',
            category: row.category,
            odoo_account_code: row.odoo_account_code,
            odoo_account_name: row.odoo_account_name,
          })
        }
      })
      return next
    })

    const needsCat = pending.filter(r => !r.category)
    if (!needsCat.length) return

    setCategorizing(true)
    try {
      const res = await fetch('/api/expenses/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenses: needsCat.map(r => ({ description: r.supplier, amount: r.amount }))
        }),
      })
      const data = await res.json()
      if (data.suggestions) {
        setPendingEdits(prev => {
          const next = new Map(prev)
          needsCat.forEach((row, i) => {
            const s = data.suggestions[i]
            if (s) {
              const cur = next.get(row.sheetRowIndex)!
              next.set(row.sheetRowIndex, {
                ...cur,
                category: s.category ?? '',
                odoo_account_code: s.odoo_account_code ?? '',
                odoo_account_name: s.odoo_account_name ?? '',
              })
            }
          })
          return next
        })
      }
    } catch (e) {
      console.warn('Auto-categorize failed:', e)
    } finally {
      setCategorizing(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [expRes, listRes] = await Promise.all([
        fetch('/api/expenses'),
        fetch('/api/cashier/lists'),
      ])
      if (!expRes.ok) throw new Error('Failed to load expenses')
      const expData = await expRes.json()
      if (expData.error) throw new Error(expData.error)
      const allRows: ExpenseRow[] = [...expData].reverse()
      setRows(allRows)

      const listData = await listRes.json()
      if (listData.categories) setCategories(listData.categories)

      return allRows
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().then(r => autoCategorize(r))
  }, [load])

  function getEdit(row: ExpenseRow): PendingEdit {
    return pendingEdits.get(row.sheetRowIndex) ?? {
      supplier: row.supplier,
      payment_source: row.payment_source || 'Petty Cash',
      category: row.category,
      odoo_account_code: row.odoo_account_code,
      odoo_account_name: row.odoo_account_name,
    }
  }

  function updateEdit(sheetRowIndex: number, patch: Partial<PendingEdit>) {
    setPendingEdits(prev => {
      const next = new Map(prev)
      const row = rows.find(r => r.sheetRowIndex === sheetRowIndex)
      const defaults: PendingEdit = row
        ? { supplier: row.supplier, payment_source: row.payment_source || 'Petty Cash', category: row.category, odoo_account_code: row.odoo_account_code, odoo_account_name: row.odoo_account_name }
        : { supplier: '', payment_source: 'Petty Cash', category: '', odoo_account_code: '', odoo_account_name: '' }
      next.set(sheetRowIndex, { ...(next.get(sheetRowIndex) ?? defaults), ...patch })
      return next
    })
  }

  function setEditCategory(sheetRowIndex: number, catName: string) {
    const cat = categories.find(c => c.category === catName)
    updateEdit(sheetRowIndex, {
      category: catName,
      odoo_account_code: cat?.odoo_code ?? '',
      odoo_account_name: cat?.odoo_name ?? '',
    })
  }

  async function confirmRow(row: ExpenseRow) {
    const edit = getEdit(row)
    setConfirming(prev => new Set(prev).add(row.sheetRowIndex))
    try {
      await fetch('/api/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetRowIndex: row.sheetRowIndex,
          supplier: edit.supplier,
          payment_source: edit.payment_source,
          category: edit.category,
          odoo_account_code: edit.odoo_account_code,
          odoo_account_name: edit.odoo_account_name,
          status: 'Approved',
        }),
      })
      setRows(prev => prev.map(r =>
        r.sheetRowIndex === row.sheetRowIndex
          ? { ...r, ...edit, status: 'Approved' }
          : r
      ))
    } catch (e) {
      console.error('Confirm failed:', e)
    } finally {
      setConfirming(prev => { const s = new Set(prev); s.delete(row.sheetRowIndex); return s })
    }
  }

  async function confirmAll() {
    await Promise.all(pendingRows.map(r => confirmRow(r)))
  }

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const s = new Set(prev)
      if (s.has(date)) s.delete(date); else s.add(date)
      return s
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gather-900">Uitgaven</h1>
          {pendingRows.length > 0 && (
            <p className="text-sm text-amber-600 mt-0.5">{pendingRows.length} te bevestigen</p>
          )}
        </div>
        <button
          onClick={() => load().then(r => autoCategorize(r))}
          disabled={loading}
          className="p-2 text-gather-500 border border-gather-200 rounded-lg hover:bg-gather-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-gather-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Pending Review ───────────────────────────── */}
          {pendingRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                    Te bevestigen · {pendingRows.length}
                  </span>
                  {categorizing && (
                    <span className="flex items-center gap-1 text-xs text-gather-400">
                      <Loader2 size={11} className="animate-spin" />
                      AI categoriseert…
                    </span>
                  )}
                </div>
                <button
                  onClick={confirmAll}
                  disabled={confirming.size > 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gather-800 text-gather-50 rounded-lg hover:bg-gather-900 disabled:opacity-60 transition-colors"
                >
                  <CheckCheck size={13} />
                  Bevestig alles
                </button>
              </div>

              {pendingDates.map(date => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-medium text-gather-500 px-1">{fmtDate(date)}</p>
                  {pendingByDate[date].map(row => {
                    const edit = getEdit(row)
                    const isConfirming = confirming.has(row.sheetRowIndex)
                    const isBCA = edit.payment_source.toLowerCase().includes('bca') || edit.payment_source.toLowerCase().includes('bank')

                    return (
                      <div key={row.sheetRowIndex} className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">
                        {/* Amount + payment badge */}
                        <div className="flex items-center justify-between">
                          <span className="text-base font-mono font-semibold text-gather-900">
                            {fmtIDR(row.amount)}
                          </span>
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium',
                            isBCA ? 'bg-blue-50 text-blue-600' : 'bg-gather-100 text-gather-600'
                          )}>
                            {isBCA ? 'BCA / Bank' : 'Petty Cash'}
                          </span>
                        </div>

                        {/* Supplier */}
                        <div>
                          <label className="block text-[10px] font-medium text-gather-400 mb-1">Leverancier</label>
                          <input
                            type="text"
                            className={inputCls}
                            value={edit.supplier}
                            onChange={e => updateEdit(row.sheetRowIndex, { supplier: e.target.value })}
                          />
                        </div>

                        {/* Payment method toggle */}
                        <div>
                          <label className="block text-[10px] font-medium text-gather-400 mb-1">Betaalmethode</label>
                          <div className="flex rounded-lg border border-gather-200 overflow-hidden text-sm">
                            {(['Petty Cash', 'BCA / Bank Transfer'] as const).map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => updateEdit(row.sheetRowIndex, { payment_source: opt })}
                                className={cn(
                                  'flex-1 py-2 font-medium transition-colors',
                                  edit.payment_source === opt
                                    ? 'bg-gather-800 text-gather-50'
                                    : 'bg-white text-gather-600 hover:bg-gather-50'
                                )}
                              >
                                {opt === 'Petty Cash' ? 'Petty Cash' : 'BCA / Bank'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Category */}
                        <div>
                          <label className="block text-[10px] font-medium text-gather-400 mb-1">Categorie (Accountant)</label>
                          <select
                            className={inputCls}
                            value={edit.category}
                            onChange={e => setEditCategory(row.sheetRowIndex, e.target.value)}
                          >
                            <option value="">— selecteer —</option>
                            {categories.map(c => (
                              <option key={c.category} value={c.category}>
                                {c.category}{c.odoo_code ? ` (${c.odoo_code})` : ''}
                              </option>
                            ))}
                          </select>
                          {edit.odoo_account_code && (
                            <p className="mt-1 text-[10px] font-mono text-gather-400">
                              {edit.odoo_account_code}{edit.odoo_account_name ? ` · ${edit.odoo_account_name}` : ''}
                            </p>
                          )}
                        </div>

                        {/* Confirm */}
                        <button
                          onClick={() => confirmRow(row)}
                          disabled={isConfirming}
                          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-gather-800 text-gather-50 rounded-lg hover:bg-gather-900 disabled:opacity-60 transition-colors"
                        >
                          {isConfirming
                            ? <Loader2 size={14} className="animate-spin" />
                            : <CheckCircle size={14} />}
                          {isConfirming ? 'Opslaan…' : 'Bevestig'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}

              <div className="h-px bg-gather-200 mt-2" />
            </div>
          )}

          {/* ── History ──────────────────────────────────── */}
          {rows.length === 0 ? (
            <div className="text-center py-24 text-gather-400 text-sm">Nog geen uitgaven</div>
          ) : confirmedRows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gather-500 px-1">Geschiedenis</p>
              {sortedDates.map(date => {
                const dayRows = confirmedByDate[date]
                const dayTotal = dayRows.reduce((s, r) => s + r.amount, 0)
                const isOpen = expandedDates.has(date)
                return (
                  <div key={date} className="bg-white border border-gather-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleDate(date)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gather-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {isOpen
                          ? <ChevronDown size={14} className="text-gather-400 shrink-0" />
                          : <ChevronRight size={14} className="text-gather-400 shrink-0" />}
                        <span className="text-sm font-medium text-gather-800">{fmtDate(date)}</span>
                        <span className="text-xs text-gather-400">{dayRows.length} items</span>
                      </div>
                      <span className="text-sm font-mono text-gather-700 shrink-0">{fmtIDR(dayTotal)}</span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gather-100 divide-y divide-gather-50">
                        {dayRows.map((row, i) => {
                          const isBCA = row.payment_source.toLowerCase().includes('bca') || row.payment_source.toLowerCase().includes('bank')
                          return (
                            <div key={i} className="flex items-center justify-between px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gather-800 truncate">{row.supplier || '—'}</p>
                                {row.category ? (
                                  <p className="text-[10px] text-gather-400 mt-0.5">
                                    {row.category}{row.odoo_account_code ? ` · ${row.odoo_account_code}` : ''}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-amber-400 mt-0.5">geen categorie</p>
                                )}
                              </div>
                              <div className="text-right ml-3 shrink-0">
                                <p className="text-sm font-mono text-gather-800">{fmtIDR(row.amount)}</p>
                                <p className={cn('text-[10px]', isBCA ? 'text-blue-500' : 'text-gather-400')}>
                                  {isBCA ? 'BCA' : 'Petty Cash'}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
