'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface Row {
  rowIndex: number
  values: string[]
}

const COL = {
  date: 0,
  name: 1,
  openingPettyCash: 2,
  pettyCashReceived: 3,
  openingModal: 4,
  salesDiningIn: 5,
  salesOnline: 6,
  totalSales: 7,
  cashCafe: 8,
  cashWildMuse: 9,
  cashTip: 10,
  cashTotal: 11,
  edcBcaCafe: 12,
  edcBcaWildMuse: 13,
  edcBcaTip: 14,
  edcBcaTotal: 15,
  edcMandiriCafe: 16,
  edcMandiriWildMuse: 17,
  edcMandiriTip: 18,
  edcMandiriTotal: 19,
  qrisBcaCafe: 20,
  qrisBcaWildMuse: 21,
  qrisBcaTip: 22,
  qrisBcaTotal: 23,
  qrisMandiriCafe: 24,
  qrisMandiriWildMuse: 25,
  qrisMandiriTip: 26,
  qrisMandiriTotal: 27,
  grab: 28,
  gojek: 29,
  moneyCashSales: 30,
  totalExpensesPettyCash: 31,
  totalAllExpenses: 32,
  actualPettyCash: 33,
  notes: 34,
  expectedCash: 35,
  cashSalesMinusTip: 36,
  cashDifference: 37,
}

function v(values: string[], col: number): string {
  return values[col] ?? ''
}
function num(values: string[], col: number): number {
  return parseFloat(v(values, col)) || 0
}
function fmtIDR(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}
function fmtDate(raw: string | undefined): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function extractNotes(values: string[]): string {
  const raw = (values[COL.notes] ?? '').trim()
  if (!raw || /^\d+(\.\d+)?$/.test(raw)) return ''
  return raw
}

function DiffBadge({ values }: { values: string[] }) {
  const diff = num(values, COL.cashDifference)
  const actual = v(values, COL.actualPettyCash)
  if (!actual) return <span className="text-gather-300 text-xs">—</span>
  if (diff === 0) return <span className="text-emerald-600 font-mono text-sm font-semibold">✓ 0</span>
  const color = diff > 0 ? 'text-amber-600' : 'text-red-600'
  return (
    <span className={cn('font-mono text-sm font-semibold', color)}>
      {diff > 0 ? '+' : ''}{fmtIDR(diff)}
    </span>
  )
}

function DetailPanel({ values }: { values: string[] }) {
  const notes = extractNotes(values)
  const diff = num(values, COL.cashDifference)
  const actual = v(values, COL.actualPettyCash)

  const methods = [
    { label: 'Cash',          cafe: COL.cashCafe,          wm: COL.cashWildMuse,          tip: COL.cashTip,          total: COL.cashTotal },
    { label: 'EDC BCA',       cafe: COL.edcBcaCafe,        wm: COL.edcBcaWildMuse,        tip: COL.edcBcaTip,        total: COL.edcBcaTotal },
    { label: 'EDC Mandiri',   cafe: COL.edcMandiriCafe,    wm: COL.edcMandiriWildMuse,    tip: COL.edcMandiriTip,    total: COL.edcMandiriTotal },
    { label: 'QRIS BCA',      cafe: COL.qrisBcaCafe,       wm: COL.qrisBcaWildMuse,       tip: COL.qrisBcaTip,       total: COL.qrisBcaTotal },
    { label: 'QRIS Mandiri',  cafe: COL.qrisMandiriCafe,   wm: COL.qrisMandiriWildMuse,   tip: COL.qrisMandiriTip,   total: COL.qrisMandiriTotal },
  ]

  return (
    <div className="px-5 pb-5 pt-1 bg-gather-50 border-t border-gather-100 space-y-5">

      {/* Opening */}
      <div className="grid grid-cols-3 gap-3 pt-2">
        {([
          ['Opening Petty Cash', COL.openingPettyCash],
          ['Petty Cash Received', COL.pettyCashReceived],
          ['Opening Modal', COL.openingModal],
        ] as [string, number][]).map(([label, col]) => (
          <div key={col} className="bg-white rounded-lg border border-gather-200 px-3 py-2">
            <p className="text-xs text-gather-400 mb-0.5">{label}</p>
            <p className="font-mono text-sm font-medium text-gather-800">{fmtIDR(num(values, col))}</p>
          </div>
        ))}
      </div>

      {/* Sales table */}
      <div>
        <p className="text-xs font-semibold text-gather-500 uppercase tracking-wide mb-2">Sales per Payment Method</p>
        <div className="overflow-x-auto rounded-lg border border-gather-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gather-100 bg-gather-50 text-xs text-gather-400">
                <th className="text-left px-3 py-2 font-medium"></th>
                <th className="text-right px-3 py-2 font-medium">Cafe</th>
                <th className="text-right px-3 py-2 font-medium">Wild Muse</th>
                <th className="text-right px-3 py-2 font-medium">Tip</th>
                <th className="text-right px-3 py-2 font-medium text-gather-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {methods.map(m => {
                const cafe = num(values, m.cafe)
                const wm   = num(values, m.wm)
                const tip  = num(values, m.tip)
                const tot  = num(values, m.total)
                if (cafe === 0 && wm === 0 && tip === 0) return null
                return (
                  <tr key={m.label} className="border-b border-gather-50 last:border-0">
                    <td className="px-3 py-2 text-gather-700 font-medium">{m.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-gather-600">{cafe ? fmtIDR(cafe) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gather-600">{wm  ? fmtIDR(wm)   : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-gather-600">{tip ? fmtIDR(tip)  : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-gather-800">{fmtIDR(tot)}</td>
                  </tr>
                )
              })}
              {num(values, COL.grab) > 0 && (
                <tr className="border-b border-gather-50">
                  <td className="px-3 py-2 text-gather-700 font-medium">Grab</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-right font-mono font-semibold text-gather-800">{fmtIDR(num(values, COL.grab))}</td>
                </tr>
              )}
              {num(values, COL.gojek) > 0 && (
                <tr className="border-b border-gather-50">
                  <td className="px-3 py-2 text-gather-700 font-medium">Gojek</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2 text-right font-mono font-semibold text-gather-800">{fmtIDR(num(values, COL.gojek))}</td>
                </tr>
              )}
              <tr className="bg-gather-50 border-t-2 border-gather-200">
                <td className="px-3 py-2 font-bold text-gather-900" colSpan={4}>Total Sales</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-gather-900">{fmtIDR(num(values, COL.totalSales))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Petty cash calculation */}
      <div>
        <p className="text-xs font-semibold text-gather-500 uppercase tracking-wide mb-2">Petty Cash Calculation</p>
        <div className="bg-white rounded-lg border border-gather-200 divide-y divide-gather-50 text-sm">
          {([
            ['Opening Petty Cash',     COL.openingPettyCash,        ''],
            ['+ Petty Cash Received',  COL.pettyCashReceived,       ''],
            ['+ Money from Cash Sales',COL.moneyCashSales,          ''],
            ['− Expenses (Petty Cash)',COL.totalExpensesPettyCash,  'red'],
          ] as [string, number, string][]).map(([label, col, color]) => (
            <div key={col} className="flex items-center justify-between px-4 py-2">
              <span className="text-gather-600">{label}</span>
              <span className={cn('font-mono', color === 'red' ? 'text-red-600' : 'text-gather-700')}>
                {fmtIDR(num(values, col))}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2 bg-gather-50">
            <span className="font-semibold text-gather-700">= Expected Remaining</span>
            <span className="font-mono font-semibold text-gather-800">{fmtIDR(num(values, COL.expectedCash))}</span>
          </div>
          {actual && (
            <>
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-gather-600">Actual Petty Cash Counted</span>
                <span className="font-mono text-gather-700">{fmtIDR(num(values, COL.actualPettyCash))}</span>
              </div>
              <div className={cn(
                'flex items-center justify-between px-4 py-2.5 font-semibold rounded-b-lg',
                diff === 0 ? 'bg-emerald-50' : diff > 0 ? 'bg-amber-50' : 'bg-red-50'
              )}>
                <span className={diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-amber-700' : 'text-red-700'}>
                  {diff === 0 ? '✓ Balanced' : 'Difference'}
                </span>
                <span className={cn('font-mono', diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-amber-700' : 'text-red-700')}>
                  {diff > 0 ? '+' : ''}{fmtIDR(diff)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notes */}
      {notes && (
        <div>
          <p className="text-xs font-semibold text-gather-500 uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm text-gather-700 bg-white border border-gather-200 rounded-lg px-3 py-2">{notes}</p>
        </div>
      )}
    </div>
  )
}

export default function RecordsPage() {
  const t = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmRow, setConfirmRow] = useState<Row | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/cashier/records')
      if (!res.ok) throw new Error('Failed to load records')
      const data: Row[] = await res.json()
      setRows([...data].reverse())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(row: Row) {
    setDeleting(row.rowIndex)
    setConfirmRow(null)
    try {
      const res = await fetch('/api/cashier/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: row.rowIndex }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Delete failed')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gather-900">{t('records_title')}</h1>
          <p className="text-sm text-gather-500 mt-1">{t('records_sub')}</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gather-600 border border-gather-200 rounded-lg hover:bg-gather-50 disabled:opacity-50 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('records_refresh')}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-gather-500 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-gather-400 text-sm">{t('records_empty')}</div>
      ) : (
        <div className="bg-white border border-gather-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gather-200 bg-gather-50">
                <th className="text-left px-5 py-3 font-medium text-gather-500">{t('records_date')}</th>
                <th className="text-left px-4 py-3 font-medium text-gather-500">{t('records_cashier')}</th>
                <th className="text-right px-4 py-3 font-medium text-gather-500 hidden md:table-cell">Total Sales</th>
                <th className="text-right px-4 py-3 font-medium text-gather-500">Verschil</th>
                <th className="text-left px-4 py-3 font-medium text-gather-500 hidden lg:table-cell">{t('records_notes')}</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isExpanded = expanded === row.rowIndex
                return (
                  <>
                    <tr
                      key={row.rowIndex}
                      onClick={() => setExpanded(isExpanded ? null : row.rowIndex)}
                      className={cn(
                        'border-b border-gather-100 cursor-pointer transition-colors',
                        deleting === row.rowIndex ? 'opacity-40' : isExpanded ? 'bg-gather-50' : 'hover:bg-gather-50',
                        !isExpanded && 'last:border-0'
                      )}
                    >
                      <td className="px-5 py-3 font-medium text-gather-800 whitespace-nowrap">
                        {fmtDate(row.values[COL.date])}
                      </td>
                      <td className="px-4 py-3 text-gather-700">
                        {row.values[COL.name] || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gather-700 hidden md:table-cell">
                        {num(row.values, COL.totalSales) ? fmtIDR(num(row.values, COL.totalSales)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DiffBadge values={row.values} />
                      </td>
                      <td className="px-4 py-3 text-gather-500 hidden lg:table-cell max-w-xs truncate">
                        {extractNotes(row.values) || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {deleting === row.rowIndex ? (
                            <Loader2 size={15} className="animate-spin text-gather-400" />
                          ) : (
                            <>
                              {isExpanded
                                ? <ChevronUp size={15} className="text-gather-400" />
                                : <ChevronDown size={15} className="text-gather-400" />
                              }
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmRow(row) }}
                                className="p-1.5 text-gather-300 hover:text-red-500 transition-colors rounded"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`detail-${row.rowIndex}`} className="border-b border-gather-100 last:border-0">
                        <td colSpan={6} className="p-0">
                          <DetailPanel values={row.values} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gather-900">{t('records_delete_title')}</p>
                <p className="text-sm text-gather-500 mt-1">
                  <span className="font-medium">{fmtDate(confirmRow.values[COL.date])}</span>
                  {' · '}{confirmRow.values[COL.name] || 'Unknown cashier'}
                </p>
                <p className="text-xs text-gather-400 mt-2">{t('records_delete_sub')}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmRow)}
                className="flex-1 py-2 px-4 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                {t('records_delete_confirm')}
              </button>
              <button
                onClick={() => setConfirmRow(null)}
                className="flex-1 py-2 px-4 text-sm text-gather-600 border border-gather-200 rounded-lg hover:bg-gather-50 transition-colors"
              >
                {t('records_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
