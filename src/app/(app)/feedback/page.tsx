'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Upload, ChevronDown, ChevronRight, RefreshCw, Sparkles, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeedbackRow {
  date: string
  submitted_by: string
  q1_rating: string
  q2_dislike: string
  q3_menu_suggestion: string
  q4_other_feedback: string
  q5_how_heard: string
  q5_how_heard_other: string
}

interface Insights {
  rating_summary: Record<string, number>
  top_dish_suggestions: string[]
  top_complaints: string[]
  other_highlights: string
}

interface DraftForm {
  date: string
  submitted_by: string
  q1_rating: string
  q2_dislike: string
  q3_menu_suggestion: string
  q4_other_feedback: string
  q5_how_heard: string
  q5_how_heard_other: string
}

type Step = 'list' | 'upload' | 'processing' | 'review'

const RATINGS = ['Delicious', 'Good', 'Average', 'Fair', 'Tasteless'] as const
const HOW_HEARD = ['Passing by', 'Google Maps', 'Instagram', 'TikTok', 'Recommendation', 'Other'] as const
const RATING_COLOR: Record<string, string> = {
  Delicious: 'bg-green-100 text-green-700',
  Good: 'bg-lime-100 text-lime-700',
  Average: 'bg-yellow-100 text-yellow-700',
  Fair: 'bg-orange-100 text-orange-700',
  Tasteless: 'bg-red-100 text-red-700',
}
const inputCls = 'w-full px-3 py-2 text-sm border border-gather-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gather-500 bg-white'
const textareaCls = inputCls + ' resize-none'

function fmtDate(raw: string): string {
  if (!raw) return '—'
  const d = new Date(raw + 'T00:00:00')
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const SUPPORTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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
        if (w > h) { h = Math.round(h * MAX / w); w = MAX } else { w = Math.round(w * MAX / h); h = MAX }
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

const emptyDraft = (): DraftForm => ({
  date: today(),
  submitted_by: '',
  q1_rating: '',
  q2_dislike: '',
  q3_menu_suggestion: '',
  q4_other_feedback: '',
  q5_how_heard: '',
  q5_how_heard_other: '',
})

export default function FeedbackPage() {
  const [step, setStep] = useState<Step>('list')
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  // Upload / review state
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftForm>(emptyDraft())
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Insights state
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [showInsights, setShowInsights] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/feedback')
      if (!res.ok) throw new Error('Failed to load feedback')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadFile(file: File) {
    if (!file.type.startsWith('image/') && file.type !== '') {
      setExtractError('Please upload an image file.')
      return
    }
    const normalized = await normalizeToJpeg(file)
    setImageFile(normalized)
    setImagePreview(URL.createObjectURL(normalized))
    setExtractError(null)
  }

  async function handleExtract() {
    if (!imageFile) return
    setStep('processing')
    setExtractError(null)
    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      const res = await fetch('/api/feedback/extract', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setExtractError(data.error ?? 'Extraction failed'); setStep('upload'); return }
      setDraft({
        date: data.date ?? today(),
        submitted_by: '',
        q1_rating: data.q1_rating ?? '',
        q2_dislike: data.q2_dislike ?? '',
        q3_menu_suggestion: data.q3_menu_suggestion ?? '',
        q4_other_feedback: data.q4_other_feedback ?? '',
        q5_how_heard: data.q5_how_heard ?? '',
        q5_how_heard_other: data.q5_how_heard_other ?? '',
      })
      setStep('review')
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Unknown error')
      setStep('upload')
    }
  }

  async function handleSave() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Save failed') }
      setStep('list')
      setImageFile(null)
      setImagePreview(null)
      setDraft(emptyDraft())
      await load()
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAnalyze() {
    setLoadingInsights(true); setInsightsError(null); setShowInsights(true)
    try {
      const res = await fetch('/api/feedback/analyze', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setInsights(data)
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoadingInsights(false)
    }
  }

  function toggleDate(d: string) {
    setExpandedDates(prev => { const s = new Set(prev); if (s.has(d)) s.delete(d); else s.add(d); return s })
  }

  // Group rows by date
  const byDate = rows.reduce((acc, r) => {
    const d = r.date || '—'
    if (!acc[d]) acc[d] = []
    acc[d].push(r)
    return acc
  }, {} as Record<string, FeedbackRow[]>)
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  // "How did you hear" chart data
  const hearCounts = rows.reduce((acc, r) => {
    const k = r.q5_how_heard || 'Unknown'
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const totalHear = rows.length || 1
  const hearSorted = Object.entries(hearCounts).sort((a, b) => b[1] - a[1])

  // ── Upload step ─────────────────────────────────────────
  if (step === 'upload' || step === 'processing') {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => { setStep('list'); setImageFile(null); setImagePreview(null); setExtractError(null) }}
            className="p-1.5 text-gather-500 hover:text-gather-800 rounded-lg hover:bg-gather-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gather-900">Add feedback form</h1>
        </div>

        {extractError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{extractError}</div>
        )}

        {!imagePreview ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gather-300 rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer hover:border-gather-500 hover:bg-gather-50 transition-colors"
          >
            <Upload size={32} className="text-gather-400" />
            <p className="text-sm text-gather-600 text-center">Tap to photograph or upload a feedback form</p>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = '' }} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-gather-200">
              <img src={imagePreview} alt="Form preview" className="w-full object-contain max-h-96" />
            </div>
            <button onClick={() => { setImageFile(null); setImagePreview(null) }}
              className="text-xs text-gather-400 hover:text-gather-600 underline">
              Choose a different photo
            </button>
            <button
              onClick={handleExtract}
              disabled={step === 'processing'}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium bg-gather-800 text-gather-50 rounded-xl hover:bg-gather-900 disabled:opacity-60 transition-colors"
            >
              {step === 'processing'
                ? <><Loader2 size={15} className="animate-spin" />Reading form…</>
                : <><Sparkles size={15} />Extract with AI</>}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Review step ──────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('upload')}
            className="p-1.5 text-gather-500 hover:text-gather-800 rounded-lg hover:bg-gather-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-semibold text-gather-900">Review & save</h1>
        </div>

        {imagePreview && (
          <div className="rounded-xl overflow-hidden border border-gather-200">
            <img src={imagePreview} alt="Form" className="w-full object-contain max-h-48" />
          </div>
        )}

        {extractError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{extractError}</div>
        )}

        <div className="space-y-4">
          {/* Date + submitted by */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gather-400 mb-1">Date</label>
              <input type="date" className={inputCls} value={draft.date}
                onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gather-400 mb-1">Submitted by</label>
              <input type="text" className={inputCls} placeholder="Staff name" value={draft.submitted_by}
                onChange={e => setDraft(d => ({ ...d, submitted_by: e.target.value }))} />
            </div>
          </div>

          {/* Q1 Rating */}
          <div>
            <label className="block text-[10px] font-medium text-gather-400 mb-2">How did they like it?</label>
            <div className="flex rounded-lg border border-gather-200 overflow-hidden text-xs">
              {RATINGS.map(r => (
                <button key={r} type="button" onClick={() => setDraft(d => ({ ...d, q1_rating: r }))}
                  className={cn('flex-1 py-2 font-medium transition-colors',
                    draft.q1_rating === r ? 'bg-gather-800 text-gather-50' : 'bg-white text-gather-600 hover:bg-gather-50')}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Q2 Dislike */}
          <div>
            <label className="block text-[10px] font-medium text-gather-400 mb-1">Anything they didn&apos;t like?</label>
            <textarea className={textareaCls} rows={2} value={draft.q2_dislike}
              onChange={e => setDraft(d => ({ ...d, q2_dislike: e.target.value }))} />
          </div>

          {/* Q3 Menu suggestion */}
          <div>
            <label className="block text-[10px] font-medium text-gather-400 mb-1">Menu suggestion</label>
            <textarea className={textareaCls} rows={2} value={draft.q3_menu_suggestion}
              onChange={e => setDraft(d => ({ ...d, q3_menu_suggestion: e.target.value }))} />
          </div>

          {/* Q4 Other feedback */}
          <div>
            <label className="block text-[10px] font-medium text-gather-400 mb-1">Other feedback</label>
            <textarea className={textareaCls} rows={2} value={draft.q4_other_feedback}
              onChange={e => setDraft(d => ({ ...d, q4_other_feedback: e.target.value }))} />
          </div>

          {/* Q5 How heard */}
          <div>
            <label className="block text-[10px] font-medium text-gather-400 mb-2">How did they hear about us?</label>
            <div className="grid grid-cols-3 gap-1.5">
              {HOW_HEARD.map(opt => (
                <button key={opt} type="button" onClick={() => setDraft(d => ({ ...d, q5_how_heard: opt, q5_how_heard_other: opt === 'Other' ? d.q5_how_heard_other : '' }))}
                  className={cn('py-2 px-1 text-xs font-medium rounded-lg border transition-colors',
                    draft.q5_how_heard === opt ? 'bg-gather-800 text-gather-50 border-gather-800' : 'bg-white text-gather-600 border-gather-200 hover:bg-gather-50')}>
                  {opt}
                </button>
              ))}
            </div>
            {draft.q5_how_heard === 'Other' && (
              <input type="text" className={cn(inputCls, 'mt-2')} placeholder="Please specify…"
                value={draft.q5_how_heard_other}
                onChange={e => setDraft(d => ({ ...d, q5_how_heard_other: e.target.value }))} />
            )}
          </div>

          <button onClick={handleSave} disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium bg-gather-800 text-gather-50 rounded-xl hover:bg-gather-900 disabled:opacity-60 transition-colors">
            {submitting ? <><Loader2 size={14} className="animate-spin" />Saving…</> : 'Save feedback'}
          </button>
        </div>
      </div>
    )
  }

  // ── List step ────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gather-900">Feedback</h1>
          {rows.length > 0 && <p className="text-sm text-gather-500 mt-0.5">{rows.length} forms collected</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 text-gather-500 border border-gather-200 rounded-lg hover:bg-gather-50 disabled:opacity-50 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setStep('upload'); setImageFile(null); setImagePreview(null); setExtractError(null) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gather-800 text-gather-50 rounded-lg hover:bg-gather-900 transition-colors">
            <Upload size={14} />
            Add form
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="text-gather-500 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-24 text-gather-400 text-sm">No feedback forms yet — add the first one</div>
      ) : (
        <>
          {/* ── How did you hear about us? ─────────── */}
          <div className="bg-white border border-gather-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gather-800">How guests find us</h2>
            <div className="space-y-2">
              {hearSorted.map(([label, count]) => {
                const pct = Math.round((count / totalHear) * 100)
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-gather-600 w-28 shrink-0">{label}</span>
                    <div className="flex-1 h-5 bg-gather-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gather-700 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-gather-500 w-10 text-right">{pct}%</span>
                    <span className="text-xs text-gather-400 w-6">({count})</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── AI Insights ───────────────────────── */}
          <div className="bg-white border border-gather-200 rounded-xl overflow-hidden">
            <button onClick={() => showInsights ? setShowInsights(false) : handleAnalyze()}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gather-50 transition-colors">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-gather-600" />
                <span className="text-sm font-semibold text-gather-800">AI insights</span>
              </div>
              <div className="flex items-center gap-2">
                {loadingInsights && <Loader2 size={13} className="animate-spin text-gather-400" />}
                {showInsights ? <ChevronDown size={15} className="text-gather-400" /> : <ChevronRight size={15} className="text-gather-400" />}
              </div>
            </button>

            {showInsights && (
              <div className="border-t border-gather-100 px-5 py-4 space-y-4">
                {insightsError && <p className="text-sm text-red-600">{insightsError}</p>}
                {loadingInsights && <p className="text-sm text-gather-400">Analyzing {rows.length} feedback forms…</p>}
                {insights && !loadingInsights && (
                  <>
                    {/* Rating summary */}
                    <div>
                      <p className="text-[10px] font-medium text-gather-400 mb-2 uppercase tracking-wide">Rating breakdown</p>
                      <div className="flex gap-2 flex-wrap">
                        {RATINGS.map(r => {
                          const n = insights.rating_summary[r] ?? 0
                          if (!n) return null
                          return (
                            <span key={r} className={cn('text-xs px-2.5 py-1 rounded-full font-medium', RATING_COLOR[r] ?? 'bg-gather-100 text-gather-600')}>
                              {r} · {n}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    {/* Dish suggestions */}
                    {insights.top_dish_suggestions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-gather-400 mb-1.5 uppercase tracking-wide">Top menu suggestions</p>
                        <ul className="space-y-1">
                          {insights.top_dish_suggestions.map((s, i) => (
                            <li key={i} className="text-sm text-gather-700 flex gap-2">
                              <span className="text-gather-300 shrink-0">·</span>{s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Complaints */}
                    {insights.top_complaints.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-gather-400 mb-1.5 uppercase tracking-wide">Areas to improve</p>
                        <ul className="space-y-1">
                          {insights.top_complaints.map((c, i) => (
                            <li key={i} className="text-sm text-gather-700 flex gap-2">
                              <span className="text-gather-300 shrink-0">·</span>{c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Highlights */}
                    {insights.other_highlights && (
                      <div>
                        <p className="text-[10px] font-medium text-gather-400 mb-1 uppercase tracking-wide">Highlights</p>
                        <p className="text-sm text-gather-700">{insights.other_highlights}</p>
                      </div>
                    )}

                    <button onClick={handleAnalyze} className="text-xs text-gather-400 hover:text-gather-600 underline">
                      Refresh analysis
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Feedback history ──────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gather-500 px-1">All feedback</p>
            {sortedDates.map(date => {
              const dayRows = byDate[date]
              const isOpen = expandedDates.has(date)
              const ratingCounts = dayRows.reduce((acc, r) => { if (r.q1_rating) acc[r.q1_rating] = (acc[r.q1_rating] ?? 0) + 1; return acc }, {} as Record<string, number>)
              return (
                <div key={date} className="bg-white border border-gather-200 rounded-xl overflow-hidden">
                  <button onClick={() => toggleDate(date)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gather-50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      {isOpen ? <ChevronDown size={14} className="text-gather-400 shrink-0" /> : <ChevronRight size={14} className="text-gather-400 shrink-0" />}
                      <span className="text-sm font-medium text-gather-800">{fmtDate(date)}</span>
                      <span className="text-xs text-gather-400">{dayRows.length} form{dayRows.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-1">
                      {Object.entries(ratingCounts).map(([r, n]) => (
                        <span key={r} className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', RATING_COLOR[r] ?? 'bg-gather-100 text-gather-600')}>
                          {r} ×{n}
                        </span>
                      ))}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gather-100 divide-y divide-gather-50">
                      {dayRows.map((row, i) => (
                        <div key={i} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            {row.q1_rating && (
                              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', RATING_COLOR[row.q1_rating] ?? 'bg-gather-100 text-gather-600')}>
                                {row.q1_rating}
                              </span>
                            )}
                            <span className="text-[10px] text-gather-400 ml-auto">
                              via {row.q5_how_heard}{row.q5_how_heard_other ? ` (${row.q5_how_heard_other})` : ''}
                            </span>
                          </div>
                          {row.q2_dislike && <p className="text-xs text-gather-600"><span className="text-gather-400">Dislike: </span>{row.q2_dislike}</p>}
                          {row.q3_menu_suggestion && <p className="text-xs text-gather-600"><span className="text-gather-400">Menu: </span>{row.q3_menu_suggestion}</p>}
                          {row.q4_other_feedback && <p className="text-xs text-gather-600"><span className="text-gather-400">Other: </span>{row.q4_other_feedback}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
