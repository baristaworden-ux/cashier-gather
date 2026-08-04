'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, CheckCircle, ArrowLeft, ExternalLink, Camera, Download, Plus, Trash2, Sparkles, Wallet, CreditCard, Receipt, Calculator, LayoutList, Save } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

type Step = 'upload' | 'processing' | 'review' | 'success'

interface ExpenseItem { description: string; amount: string; paid_by: string }

interface Fields {
  date: string
  name: string
  opening_petty_cash: string
  petty_cash_received: string
  opening_cashier_modal: string
  cash_cafe: string;        cash_wild_muse: string;        cash_tip: string
  edc_bca_cafe: string;     edc_bca_wild_muse: string;     edc_bca_tip: string
  edc_mandiri_cafe: string; edc_mandiri_wild_muse: string; edc_mandiri_tip: string
  qris_bca_cafe: string;    qris_bca_wild_muse: string;    qris_bca_tip: string
  qris_mandiri_cafe: string; qris_mandiri_wild_muse: string; qris_mandiri_tip: string
  grab: string
  gojek: string
  expenses: ExpenseItem[]
  money_from_cash_sales: string
  actual_petty_cash_counted: string
  notes: string
}

const EMPTY: Fields = {
  date: '', name: '',
  opening_petty_cash: '', petty_cash_received: '', opening_cashier_modal: '',
  cash_cafe: '', cash_wild_muse: '', cash_tip: '',
  edc_bca_cafe: '', edc_bca_wild_muse: '', edc_bca_tip: '',
  edc_mandiri_cafe: '', edc_mandiri_wild_muse: '', edc_mandiri_tip: '',
  qris_bca_cafe: '', qris_bca_wild_muse: '', qris_bca_tip: '',
  qris_mandiri_cafe: '', qris_mandiri_wild_muse: '', qris_mandiri_tip: '',
  grab: '', gojek: '',
  expenses: [{ description: '', amount: '', paid_by: '' }],
  money_from_cash_sales: '',
  actual_petty_cash_counted: '',
  notes: '',
}

const BREAKDOWN_METHODS = [
  { key: 'cash',         label: 'Cash' },
  { key: 'edc_bca',     label: 'EDC BCA' },
  { key: 'edc_mandiri', label: 'EDC Mandiri' },
  { key: 'qris_bca',    label: 'QRIS BCA' },
  { key: 'qris_mandiri', label: 'QRIS Mandiri' },
] as const

function n(s: string | null | undefined): number {
  return parseFloat(String(s ?? '').replace(/[^\d.-]/g, '')) || 0
}
function fmtIDR(val: number): string {
  return new Intl.NumberFormat('id-ID').format(val)
}
function fmtInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return new Intl.NumberFormat('id-ID').format(parseInt(digits, 10))
}

function isPettyCash(paid_by: string): boolean {
  const s = paid_by.trim().toLowerCase()
  return s === '' || s === 'cash' || s === 'petty cash' || s === 'pcc' || s === 'petty cash cashier' || s === 'petty'
}

function isBCA(paid_by: string): boolean {
  const s = paid_by.trim().toLowerCase()
  return s === 'bca' || s === 'bca / bank transfer' || s === 'edc bca' || s === 'bank transfer' || s === 'transfer'
}

const cell = 'w-full px-2 py-1.5 text-sm border border-gather-200 rounded focus:outline-none focus:ring-1 focus:ring-gather-400 bg-white'
const inputCls = 'w-full px-3 py-2 text-sm border border-gather-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gather-500 bg-white'

function NumInput({ value, onChange, className, placeholder = '0' }: {
  value: string; onChange: (raw: string) => void; className?: string; placeholder?: string
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      value={fmtInput(value)}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
    />
  )
}

export default function CashierPage() {
  const t = useT()
  const [step, setStep] = useState<Step>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile2, setImageFile2] = useState<File | null>(null)
  const [imagePreview2, setImagePreview2] = useState<string | null>(null)
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [aiExtraction, setAiExtraction] = useState<Partial<Fields> | null>(null)
  const [driveLink, setDriveLink] = useState('')
  const [driveError, setDriveError] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInput2Ref = useRef<HTMLInputElement>(null)
  const [cashiers, setCashiers] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])

  function fetchLists() {
    fetch('/api/cashier/lists')
      .then(r => r.json())
      .then(d => {
        setCashiers(d.cashiers ?? [])
        setSuppliers(d.suppliers ?? [])
        if (d.error) console.warn('Lists API error:', d.error)
      })
      .catch(e => console.warn('fetchLists failed:', e))
  }

  useEffect(() => { fetchLists() }, [])
  useEffect(() => { if (step === 'review') fetchLists() }, [step])

  function set<K extends keyof Fields>(k: K, v: Fields[K]) {
    setFields(prev => ({ ...prev, [k]: v }))
  }

  const breakdownTotals = BREAKDOWN_METHODS.map(m => {
    const cafe     = n(fields[`${m.key}_cafe` as keyof Fields] as string)
    const wildMuse = n(fields[`${m.key}_wild_muse` as keyof Fields] as string)
    const tip      = n(fields[`${m.key}_tip` as keyof Fields] as string)
    return { key: m.key, label: m.label, cafe, wildMuse, tip, total: cafe + wildMuse + tip }
  })
  const grabTotal  = n(fields.grab)
  const gojekTotal = n(fields.gojek)
  const totalEarnings = breakdownTotals.reduce((s, m) => s + m.total, 0) + grabTotal + gojekTotal

  const cashSalesTotal = n(fields.cash_cafe) + n(fields.cash_wild_muse)

  const totalExpenses = fields.expenses.reduce((s, e) => s + n(e.amount), 0)

  const pettyCashExpenses = fields.expenses
    .filter(e => isPettyCash(e.paid_by))
    .reduce((s, e) => s + n(e.amount), 0)

  const bcaExpenses = fields.expenses
    .filter(e => isBCA(e.paid_by))
    .reduce((s, e) => s + n(e.amount), 0)

  const expectedCashRemaining =
    n(fields.opening_petty_cash) + n(fields.petty_cash_received) + n(fields.money_from_cash_sales) - pettyCashExpenses

  const actualCounted = n(fields.actual_petty_cash_counted)
  const cashDifference = actualCounted - expectedCashRemaining

  const SUPPORTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  // Convert any image (incl. HEIC from iOS) to JPEG via canvas.
  // Falls back to original file if canvas fails.
  async function normalizeToJpeg(file: File): Promise<File> {
    if (SUPPORTED.includes(file.type) && file.size < 4 * 1024 * 1024) return file
    return new Promise(resolve => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        let w = img.naturalWidth, h = img.naturalHeight
        const MAX = 3000
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else { w = Math.round(w * MAX / h); h = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(file); return }
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.92)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  async function loadFile(file: File) {
    if (!file.type.startsWith('image/') && file.type !== '') {
      setError('Please upload an image file (JPEG, PNG, or WebP).')
      return
    }
    try {
      const normalized = await normalizeToJpeg(file)
      setImageFile(normalized)
      setImagePreview(URL.createObjectURL(normalized))
    } catch {
      setError('Could not load image. Please try a JPEG or PNG file.')
    }
  }

  async function loadFile2(file: File) {
    if (!file.type.startsWith('image/') && file.type !== '') return
    try {
      const normalized = await normalizeToJpeg(file)
      setImageFile2(normalized)
      setImagePreview2(URL.createObjectURL(normalized))
    } catch {
      // silently ignore second image failures
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) void loadFile(f)
  }

  async function handleExtract() {
    if (!imageFile) return
    setStep('processing')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      if (imageFile2) fd.append('image2', imageFile2)
      const res = await fetch('/api/cashier/extract', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error((data.error ?? 'Extraction failed') + (data.stopReason ? ` [stop: ${data.stopReason}]` : '') + (data.contentTypes ? ` [blocks: ${JSON.stringify(data.contentTypes)}]` : '') + (data.raw ? `\n\nAI said: ${data.raw.slice(0, 400)}` : ''))
      const str = (v: unknown) => v != null ? String(v) : ''
      setAiExtraction(data)
      setFields({
        date: data.date ?? '', name: data.name ?? '',
        opening_petty_cash:    str(data.opening_petty_cash),
        petty_cash_received:   str(data.petty_cash_received),
        opening_cashier_modal: str(data.opening_cashier_modal),
        cash_cafe:             str(data.cash_cafe),
        cash_wild_muse:        str(data.cash_wild_muse),
        cash_tip:              str(data.cash_tip),
        edc_bca_cafe:          str(data.edc_bca_cafe),
        edc_bca_wild_muse:     str(data.edc_bca_wild_muse),
        edc_bca_tip:           str(data.edc_bca_tip),
        edc_mandiri_cafe:      str(data.edc_mandiri_cafe),
        edc_mandiri_wild_muse: str(data.edc_mandiri_wild_muse),
        edc_mandiri_tip:       str(data.edc_mandiri_tip),
        qris_bca_cafe:         str(data.qris_bca_cafe),
        qris_bca_wild_muse:    str(data.qris_bca_wild_muse),
        qris_bca_tip:          str(data.qris_bca_tip),
        qris_mandiri_cafe:     str(data.qris_mandiri_cafe),
        qris_mandiri_wild_muse: str(data.qris_mandiri_wild_muse),
        qris_mandiri_tip:      str(data.qris_mandiri_tip),
        grab:                  str(data.grab),
        gojek:                 str(data.gojek),
        expenses: Array.isArray(data.expenses) && data.expenses.length
          ? data.expenses.map((e: { description?: string; amount?: unknown; paid_by?: string }) => ({
              description: e.description ?? '',
              amount: str(e.amount),
              paid_by: e.paid_by ?? '',
            }))
          : [{ description: '', amount: '', paid_by: '' }],
        money_from_cash_sales:      str(data.money_from_cash_sales),
        actual_petty_cash_counted:  str(data.actual_petty_cash_counted),
        notes: data.notes ?? '',
      })
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setStep('upload')
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('fields', JSON.stringify(fields))
      if (aiExtraction) fd.append('aiExtraction', JSON.stringify(aiExtraction))
      if (imageFile) fd.append('image', imageFile)
      const res = await fetch('/api/cashier/submit', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setDriveLink(data.driveLink ?? '')
      setDriveError(data.driveError ?? '')
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setStep('upload'); setImageFile(null); setImagePreview(null)
    setImageFile2(null); setImagePreview2(null)
    setFields(EMPTY); setAiExtraction(null); setDriveLink(''); setDriveError(''); setError(null)
  }

  /* ─── Upload ─────────────────────────────────────────────────────────── */
  if (step === 'upload') return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-gather-900">{t('upload_title')}</h1>
        <p className="text-sm text-gather-500 mt-1">{t('upload_subtitle')}</p>
      </div>
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Page 1 */}
      <div>
        <p className="text-xs font-medium text-gather-500 mb-1.5">{t('upload_page1')}</p>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn('border-2 border-dashed rounded-2xl p-6 md:p-8 text-center cursor-pointer transition-colors',
            isDragging ? 'border-gather-400 bg-gather-100' : 'border-gather-200 hover:border-gather-300 hover:bg-gather-50')}
        >
          {imagePreview ? (
            <div className="space-y-3">
              <img src={imagePreview} alt="Page 1" className="max-h-56 mx-auto rounded-lg object-contain" />
              <p className="text-sm text-gather-500">{imageFile?.name}</p>
              <p className="text-xs text-gather-500">{t('upload_click_replace')}</p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="w-16 h-16 rounded-2xl bg-gather-100 flex items-center justify-center mx-auto">
                <Camera size={28} className="text-gather-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gather-700">{t('upload_drag')}</p>
                <p className="text-xs text-gather-400 mt-1">{t('upload_drag_sub')}</p>
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void loadFile(f) }} />
        </div>
      </div>

      {/* Page 2 — optional */}
      <div>
        <p className="text-xs font-medium text-gather-500 mb-1.5">
          {t('upload_page2')} <span className="text-gather-400 font-normal">({t('upload_page2_hint')})</span>
        </p>
        <div
          onClick={() => fileInput2Ref.current?.click()}
          className="border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-colors border-gather-200 hover:border-gather-300 hover:bg-gather-50"
        >
          {imagePreview2 ? (
            <div className="space-y-2">
              <img src={imagePreview2} alt="Page 2" className="max-h-36 mx-auto rounded-lg object-contain" />
              <p className="text-sm text-gather-500">{imageFile2?.name}</p>
              <button
                onClick={e => { e.stopPropagation(); setImageFile2(null); setImagePreview2(null) }}
                className="text-xs text-red-400 hover:text-red-600"
              >{t('upload_remove_page2')}</button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-gather-400 py-2">
              <Plus size={16} />
              <span className="text-sm">{t('upload_add_page2')}</span>
            </div>
          )}
          <input ref={fileInput2Ref} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void loadFile2(f) }} />
        </div>
      </div>

      <button onClick={handleExtract} disabled={!imageFile}
        className={cn(
          'w-full py-4 md:py-3 px-4 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2',
          imageFile
            ? 'bg-gather-800 text-gather-50 active:bg-gather-900 cursor-pointer'
            : 'bg-gather-200 text-gather-400 cursor-not-allowed'
        )}>
        <Sparkles size={16} />
        {t('upload_analyse')}
      </button>
      <Link href="/cashier/template" className="flex items-center justify-center gap-2 text-sm text-gather-500 hover:text-gather-800 underline underline-offset-4 transition-colors py-1">
        <Download size={14} />
        {t('upload_template')}
      </Link>
    </div>
  )

  /* ─── Processing ─────────────────────────────────────────────────────── */
  if (step === 'processing') return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-72 gap-4">
      <Loader2 size={36} className="text-gather-600 animate-spin" />
      <div className="text-center">
        <p className="font-medium text-gather-800">{t('processing_title')}</p>
        <p className="text-sm text-gather-500 mt-1">{t('processing_sub')}</p>
      </div>
    </div>
  )

  /* ─── Review ─────────────────────────────────────────────────────────── */
  if (step === 'review') return (
    <div className="max-w-3xl mx-auto space-y-12">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('upload')} className="p-1.5 rounded-lg hover:bg-gather-100 transition-colors">
          <ArrowLeft size={18} className="text-gather-500" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gather-900">{t('review_title')}</h1>
          <p className="text-sm text-gather-500 mt-0.5">{t('review_subtitle')}</p>
        </div>
        {imagePreview && (
          <img src={imagePreview} alt="Form" className="ml-auto rounded-lg border border-gather-200 object-contain"
            style={{ maxHeight: 80, maxWidth: 80 }} />
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Date + Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gather-500 mb-1">{t('review_date')}</label>
          <input type="date" className={inputCls} value={fields.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gather-500 mb-1">{t('review_name')}</label>
          {cashiers.length > 0 ? (
            <select className={inputCls} value={fields.name} onChange={e => set('name', e.target.value)}>
              <option value="">{t('review_cashier_placeholder')}</option>
              {cashiers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input type="text" className={inputCls} value={fields.name} onChange={e => set('name', e.target.value)} placeholder={t('review_cashier_placeholder')} />
          )}
        </div>
      </div>

      {/* Opening */}
      <div>
        <SectionHeader icon={Wallet}>{t('review_opening')}</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            [t('review_opening_petty'), 'opening_petty_cash'],
            [t('review_petty_received'), 'petty_cash_received'],
            [t('review_modal'), 'opening_cashier_modal'],
          ] as [string, keyof Fields][]).map(([label, key]) => (
            <div key={key as string}>
              <label className="block text-xs font-medium text-gather-500 mb-1">{label}</label>
              <NumInput className={inputCls} value={fields[key] as string} onChange={v => set(key, v as Fields[typeof key])} />
            </div>
          ))}
        </div>
      </div>

      {/* Sales table */}
      <div>
        <SectionHeader icon={CreditCard}>{t('review_sales')}</SectionHeader>

        {/* ── Mobile: stacked cards ───────────────────── */}
        <div className="sm:hidden space-y-2">
          {BREAKDOWN_METHODS.map((m, i) => {
            const mt = breakdownTotals[i]
            return (
              <div key={m.key} className="bg-white rounded-xl border border-gather-200 p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-semibold text-gather-800">{m.label}</span>
                  <span className="text-xs font-mono text-gather-500 bg-gather-50 px-2 py-0.5 rounded-full">{fmtIDR(mt.total)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['cafe', 'wild_muse', 'tip'] as const).map(src => {
                    const k = `${m.key}_${src}` as keyof Fields
                    const colLabel = src === 'cafe' ? t('review_cafe') : src === 'wild_muse' ? t('review_wildmuse') : t('review_tip')
                    return (
                      <div key={src}>
                        <p className="text-[10px] font-medium text-gather-400 mb-1 text-center">{colLabel}</p>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <NumInput className={cell} value={fields[k] as string} onChange={v => set(k, v as any)} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {([['Grab', 'grab', grabTotal], ['Gojek', 'gojek', gojekTotal]] as [string, keyof Fields, number][]).map(([label, key, total]) => (
            <div key={key as string} className="bg-white rounded-xl border border-gather-200 p-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm font-semibold text-gather-800">{label}</span>
                <span className="text-xs font-mono text-gather-500 bg-gather-50 px-2 py-0.5 rounded-full">{fmtIDR(total)}</span>
              </div>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <NumInput className={cell} value={fields[key] as string} onChange={v => set(key, v as any)} />
            </div>
          ))}
          <div className="bg-gather-800 text-gather-50 rounded-xl p-3 flex justify-between items-center">
            <span className="text-sm font-semibold">{t('review_total_earnings')}</span>
            <span className="font-bold font-mono text-base">{fmtIDR(totalEarnings)}</span>
          </div>
        </div>

        {/* ── Tablet / Desktop: table ─────────────────── */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gather-200">
                <th className="text-left pb-2 pr-3 font-medium text-gather-500 w-32"></th>
                <th className="text-center pb-2 px-2 font-medium text-gather-500">{t('review_cafe')}</th>
                <th className="text-center pb-2 px-2 font-medium text-gather-500">{t('review_wildmuse')}</th>
                <th className="text-center pb-2 px-2 font-medium text-gather-500">{t('review_tip')}</th>
                <th className="text-right pb-2 pl-3 font-medium text-gather-400 text-xs">{t('review_total')}</th>
              </tr>
            </thead>
            <tbody>
              {BREAKDOWN_METHODS.map((m, i) => {
                const mt = breakdownTotals[i]
                return (
                  <tr key={m.key} className="border-b border-gather-100">
                    <td className="py-2 pr-3 font-medium text-gather-700">{m.label}</td>
                    {(['cafe', 'wild_muse', 'tip'] as const).map(src => {
                      const k = `${m.key}_${src}` as keyof Fields
                      return (
                        <td key={src} className="py-2 px-2">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <NumInput className={cell} value={fields[k] as string} onChange={v => set(k, v as any)} />
                        </td>
                      )
                    })}
                    <td className="py-2 pl-3 text-right text-gather-500 font-mono text-xs">{fmtIDR(mt.total)}</td>
                  </tr>
                )
              })}
              <tr className="border-b border-gather-100">
                <td className="py-2 pr-3 font-medium text-gather-700">Grab</td>
                <td className="py-2 px-2" colSpan={3}>
                  <NumInput className={cell} value={fields.grab} onChange={v => set('grab', v)} />
                </td>
                <td className="py-2 pl-3 text-right text-gather-500 font-mono text-xs">{fmtIDR(grabTotal)}</td>
              </tr>
              <tr className="border-b border-gather-100">
                <td className="py-2 pr-3 font-medium text-gather-700">Gojek</td>
                <td className="py-2 px-2" colSpan={3}>
                  <NumInput className={cell} value={fields.gojek} onChange={v => set('gojek', v)} />
                </td>
                <td className="py-2 pl-3 text-right text-gather-500 font-mono text-xs">{fmtIDR(gojekTotal)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gather-300">
                <td className="pt-2 pr-3 font-semibold text-gather-700">{t('review_total_earnings')}</td>
                <td colSpan={3} />
                <td className="pt-2 pl-3 text-right font-semibold text-gather-800 font-mono">{fmtIDR(totalEarnings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Expenses */}
      <div>
        <SectionHeader icon={Receipt}>{t('review_expenses')}</SectionHeader>
        <div className="space-y-3">
          {/* Desktop column headers */}
          <div className="hidden sm:flex gap-2 text-xs font-medium text-gather-400 px-1">
            <span className="flex-1">{t('review_supplier')}</span>
            <span className="w-32">{t('review_amount')}</span>
            <span className="w-40">{t('review_payment')}</span>
            <span className="w-7" />
          </div>
          {fields.expenses.map((exp, i) => (
            <div key={i}>
              {/* Mobile: stacked */}
              <div className="sm:hidden space-y-2 bg-white rounded-xl border border-gather-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gather-400">{t('review_supplier')}</span>
                  {fields.expenses.length > 1 && (
                    <button onClick={() => set('expenses', fields.expenses.filter((_, j) => j !== i))}
                      className="p-1 text-gather-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <SupplierInput
                  value={exp.description}
                  options={suppliers}
                  placeholder={t('review_supplier')}
                  onChange={v => {
                    const exps = [...fields.expenses]
                    exps[i] = { ...exps[i], description: v }
                    set('expenses', exps)
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-medium text-gather-400 mb-1">{t('review_amount')}</p>
                    <NumInput className={inputCls} value={exp.amount}
                      onChange={v => {
                        const exps = [...fields.expenses]
                        exps[i] = { ...exps[i], amount: v }
                        set('expenses', exps)
                      }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-gather-400 mb-1">{t('review_payment')}</p>
                    <select
                      className={inputCls}
                      value={isBCA(exp.paid_by) ? 'BCA / Bank Transfer' : 'Petty Cash'}
                      onChange={e => {
                        const exps = [...fields.expenses]
                        exps[i] = { ...exps[i], paid_by: e.target.value }
                        set('expenses', exps)
                      }}
                    >
                      <option value="Petty Cash">Petty Cash</option>
                      <option value="BCA / Bank Transfer">BCA / Bank Transfer</option>
                    </select>
                  </div>
                </div>
              </div>
              {/* Desktop: single row */}
              <div className="hidden sm:flex gap-2 items-center">
                <SupplierInput
                  value={exp.description}
                  options={suppliers}
                  placeholder={t('review_supplier')}
                  onChange={v => {
                    const exps = [...fields.expenses]
                    exps[i] = { ...exps[i], description: v }
                    set('expenses', exps)
                  }}
                />
                <NumInput className={cn(inputCls, 'w-32')} value={exp.amount}
                  onChange={v => {
                    const exps = [...fields.expenses]
                    exps[i] = { ...exps[i], amount: v }
                    set('expenses', exps)
                  }} />
                <select
                  className={cn(inputCls, 'w-40')}
                  value={isBCA(exp.paid_by) ? 'BCA / Bank Transfer' : 'Petty Cash'}
                  onChange={e => {
                    const exps = [...fields.expenses]
                    exps[i] = { ...exps[i], paid_by: e.target.value }
                    set('expenses', exps)
                  }}
                >
                  <option value="Petty Cash">Petty Cash</option>
                  <option value="BCA / Bank Transfer">BCA / Bank Transfer</option>
                </select>
                {fields.expenses.length > 1 && (
                  <button onClick={() => set('expenses', fields.expenses.filter((_, j) => j !== i))}
                    className="p-2 text-gather-400 hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => set('expenses', [...fields.expenses, { description: '', amount: '', paid_by: '' }])}
            className="flex items-center gap-2 text-sm text-gather-600 hover:text-gather-800 transition-colors">
            <Plus size={15} />{t('review_add_expense')}
          </button>
        </div>
        <div className="mt-3 pt-3 border-t border-gather-200 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gather-500">{t('review_total_all')}</span>
            <span className="font-mono text-gather-600">{fmtIDR(totalExpenses)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gather-600">{t('review_total_bca')}</span>
            <span className="font-mono text-gather-700">{fmtIDR(bcaExpenses)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gather-700">
              {t('review_total_petty')}
              <span className="ml-1.5 text-xs font-normal text-gather-400">({t('review_petty_calc_hint')})</span>
            </span>
            <span className="font-semibold font-mono text-gather-800">{fmtIDR(pettyCashExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Petty cash calculation */}
      <div>
        <SectionHeader icon={Calculator}>{t('review_petty_calc')}</SectionHeader>
        <div className="bg-gather-50 rounded-xl p-4 space-y-2 text-sm border border-gather-100">
          <CalcLine label={t('review_opening_petty')}  value={n(fields.opening_petty_cash)}  op="" />
          <CalcLine label={t('review_petty_received')} value={n(fields.petty_cash_received)} op="+" />
          <div className="flex items-center gap-3">
            <span className="w-4 text-gather-400 font-mono">+</span>
            <span className="flex-1 text-gather-600">
              {t('review_money_cash_sales')} <span className="text-gather-400 text-xs">({t('review_money_cash_sales_hint')})</span>
            </span>
            <input type="text" inputMode="numeric"
              className="w-40 px-2 py-1 text-sm border border-gather-200 rounded focus:outline-none focus:ring-1 focus:ring-gather-400 bg-white text-right font-mono"
              value={fmtInput(fields.money_from_cash_sales)} onChange={e => set('money_from_cash_sales', e.target.value.replace(/\D/g, ''))} />
          </div>
          <CalcLine label={t('review_total_exp_petty')} value={pettyCashExpenses} op="−" negative />

          <div className="border-t border-gather-200 pt-2 mt-1 flex items-center gap-3">
            <span className="w-4 text-gather-600 font-mono font-bold">=</span>
            <span className="flex-1 text-gather-600">{t('review_expected')}</span>
            <span className="font-mono text-gather-700">{fmtIDR(expectedCashRemaining)}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-4" />
            <span className="flex-1 text-gather-600">{t('review_actual')}</span>
            <input type="text" inputMode="numeric"
              className="w-40 px-2 py-1 text-sm border border-gather-200 rounded focus:outline-none focus:ring-1 focus:ring-gather-400 bg-white text-right font-mono"
              value={fmtInput(fields.actual_petty_cash_counted)}
              onChange={e => set('actual_petty_cash_counted', e.target.value.replace(/\D/g, ''))} />
          </div>

          {fields.actual_petty_cash_counted !== '' && (
            <div className={cn(
              'border-t pt-2 mt-1 flex items-center gap-3 rounded-lg px-2 py-1.5',
              cashDifference === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            )}>
              <span className="w-4" />
              <span className={cn('flex-1 font-semibold', cashDifference === 0 ? 'text-emerald-700' : 'text-red-700')}>
                {cashDifference === 0 ? t('review_balanced') : t('review_difference')}
              </span>
              <span className={cn('font-bold font-mono', cashDifference === 0 ? 'text-emerald-700' : 'text-red-700')}>
                {cashDifference > 0 ? '+' : ''}{fmtIDR(cashDifference)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gather-500 mb-1">{t('review_notes')}</label>
        <textarea className={cn(inputCls, 'resize-none h-20')} value={fields.notes}
          onChange={e => set('notes', e.target.value)} placeholder={t('review_notes_placeholder')} />
      </div>

      {/* Final Cash Overview */}
      <div>
        <SectionHeader icon={LayoutList}>{t('review_overview')}</SectionHeader>
        <div className="bg-white border border-gather-200 rounded-2xl overflow-hidden">
          <div className="divide-y divide-gather-100">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gather-800">{t('review_cash_sales')}</p>
                <p className="text-xs text-gather-400 mt-0.5">{fields.date || '—'} · {t('review_cafe')} + {t('review_wildmuse')}</p>
              </div>
              <span className="font-bold font-mono text-gather-900 text-lg">{fmtIDR(cashSalesTotal)}</span>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gather-800">{t('review_total_petty_cash')}</p>
                {fields.actual_petty_cash_counted !== '' && (
                  <p className={cn('text-xs mt-0.5', cashDifference === 0 ? 'text-emerald-600' : 'text-red-500')}>
                    {cashDifference === 0 ? t('review_balanced_short') : `${t('review_difference')}: ${cashDifference > 0 ? '+' : ''}${fmtIDR(cashDifference)}`}
                  </p>
                )}
              </div>
              <span className="font-bold font-mono text-gather-900 text-lg">{fmtIDR(actualCounted)}</span>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-gather-800">{t('review_modal_cash')}</p>
              <span className="font-bold font-mono text-gather-900 text-lg">{fmtIDR(n(fields.opening_cashier_modal))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSubmit} disabled={submitting}
          className={cn(
            'group flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
            submitting
              ? 'bg-gather-200 text-gather-400 cursor-not-allowed'
              : 'bg-gather-800 text-gather-50 hover:bg-gather-900 cursor-pointer'
          )}>
          {submitting
            ? <Loader2 size={15} className="animate-spin" />
            : <Save size={15} className="opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all duration-200" />
          }
          {t('review_save')}
        </button>
        <button onClick={reset}
          className="px-4 py-2.5 text-sm text-gather-600 border border-gather-200 rounded-lg hover:bg-gather-50 transition-colors">
          {t('review_start_over')}
        </button>
      </div>
    </div>
  )

  /* ─── Success ─────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-72 gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
        <CheckCircle size={32} className="text-emerald-500" />
      </div>
      <div>
        <p className="text-xl font-semibold text-gather-900">{t('success_title')}</p>
        <p className="text-sm text-gather-500 mt-1">{t('success_sub')}</p>
      </div>
      {driveLink && (
        <a href={driveLink} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-gather-600 hover:text-gather-800">
          <ExternalLink size={15} />{t('success_drive')}
        </a>
      )}
      {driveError && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Drive upload failed: {driveError}
        </p>
      )}
      <button onClick={reset}
        className="mt-2 py-2.5 px-6 bg-gather-800 text-gather-50 text-sm font-medium rounded-lg hover:bg-gather-900 transition-colors">
        {t('success_new')}
      </button>
    </div>
  )
}

function SupplierInput({ value, options, placeholder, onChange }: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim() === ''
    ? options
    : options.filter(o => o.toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        className={cn(inputCls, 'w-full')}
        placeholder={placeholder}
        value={open ? query : value}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={e => {
          setQuery(e.target.value)
          onChange(e.target.value)
          setOpen(true)
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gather-200 rounded-lg shadow-lg z-50 max-h-52 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-gather-700 hover:bg-gather-50 transition-colors first:rounded-t-lg last:rounded-b-lg"
              onMouseDown={e => {
                e.preventDefault()
                setQuery(s)
                onChange(s)
                setOpen(false)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ children, icon: Icon }: { children: React.ReactNode; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <Icon size={17} className="text-gather-500 shrink-0" />
      <h2 className="text-base font-semibold text-gather-900 underline underline-offset-4 decoration-gather-300 whitespace-nowrap">{children}</h2>
      <div className="flex-1 h-px bg-gather-200" />
    </div>
  )
}

function CalcLine({ label, value, op, negative }: { label: string; value: number; op: string; negative?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-4 text-gather-400 font-mono">{op}</span>
      <span className="flex-1 text-gather-600">{label}</span>
      <span className={cn('font-mono', negative ? 'text-red-500' : 'text-gather-700')}>{fmtIDR(value)}</span>
    </div>
  )
}
