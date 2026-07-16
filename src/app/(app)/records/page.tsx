'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface Row {
  rowIndex: number
  values: string[]
}

const COL = {
  date: 0,   // A
  name: 1,   // B
  notes: 34, // AI (shifted +3 by new F/G/H columns)
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

export default function RecordsPage() {
  const t = useT()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [confirmRow, setConfirmRow] = useState<Row | null>(null)

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
                <th className="text-left px-4 py-3 font-medium text-gather-500 hidden sm:table-cell">{t('records_notes')}</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.rowIndex} className={cn(
                  'border-b border-gather-100 last:border-0',
                  deleting === row.rowIndex ? 'opacity-40' : 'hover:bg-gather-50'
                )}>
                  <td className="px-5 py-3 font-medium text-gather-800 whitespace-nowrap">
                    {fmtDate(row.values[COL.date])}
                  </td>
                  <td className="px-4 py-3 text-gather-700">
                    {row.values[COL.name] || '—'}
                  </td>
                  <td className="px-4 py-3 text-gather-500 hidden sm:table-cell max-w-xs truncate">
                    {extractNotes(row.values) || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deleting === row.rowIndex ? (
                      <Loader2 size={15} className="animate-spin text-gather-400 ml-auto" />
                    ) : (
                      <button
                        onClick={() => setConfirmRow(row)}
                        className="p-1.5 text-gather-300 hover:text-red-500 transition-colors rounded"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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
