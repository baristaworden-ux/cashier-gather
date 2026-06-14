'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, X, TrendingUp } from 'lucide-react'
import { formatCurrency, cn, CURRENCIES } from '@/lib/utils'

type AssetCategory = 'cash' | 'metals' | 'crypto' | 'stocks'

interface Asset {
  id: string
  name: string
  symbol?: string
  category: AssetCategory
  units: number
  current_price: number
  currency: string
  purchase_price?: number
  purchase_date?: string
  notes?: string
  created_at: string
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: 'Cash',
  metals: 'Edelmetalen',
  crypto: 'Crypto',
  stocks: 'Aandelen',
}
const CATEGORY_COLORS: Record<AssetCategory, string> = {
  cash:    'bg-blue-100 text-blue-700',
  metals:  'bg-amber-100 text-amber-700',
  crypto:  'bg-orange-100 text-orange-700',
  stocks:  'bg-emerald-100 text-emerald-700',
}
const CHART_COLORS: Record<AssetCategory, string> = {
  cash:   '#6366f1',
  metals: '#f59e0b',
  crypto: '#f97316',
  stocks: '#10b981',
}

const ALL_CATEGORIES: AssetCategory[] = ['cash', 'metals', 'crypto', 'stocks']

function DonutChart({ segments }: { segments: { category: AssetCategory; value: number; pct: number }[] }) {
  const r = 54
  const cx = 80
  const cy = 80
  const circumference = 2 * Math.PI * r
  let cumPct = 0

  return (
    <svg viewBox="0 0 160 160" className="w-full h-full">
      {segments.filter(s => s.pct > 0).map((seg) => {
        const startPct = cumPct
        cumPct += seg.pct
        const dashLen = circumference * seg.pct
        return (
          <circle
            key={seg.category}
            r={r}
            cx={cx}
            cy={cy}
            fill="none"
            stroke={CHART_COLORS[seg.category]}
            strokeWidth={22}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={-circumference * startPct + circumference * 0.25}
            style={{ transform: `rotate(-90deg)`, transformOrigin: `${cx}px ${cy}px` }}
          />
        )
      })}
      {/* Center hole fill */}
      <circle r={43} cx={cx} cy={cy} fill="white" />
    </svg>
  )
}

export default function AssetsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400 py-16 text-center">Laden…</div>}>
      <AssetsInner />
    </Suspense>
  )
}

function AssetsInner() {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'overzicht'

  const [assets, setAssets] = useState<Asset[]>([])
  const [investedTotal, setInvestedTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Instellingen form
  const [form, setForm] = useState({
    name: '', symbol: '', category: 'stocks' as AssetCategory,
    units: '', current_price: '', currency: 'EUR',
    purchase_price: '', purchase_date: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<typeof form>>({})

  async function loadData() {
    setLoading(true)
    const [assetsRes, accRes, txRes] = await Promise.all([
      fetch('/api/assets'),
      fetch('/api/accounts'),
      fetch('/api/transactions?limit=2000'),
    ])
    if (assetsRes.ok) { const d = await assetsRes.json(); setAssets(d.assets || []) }
    if (!accRes.ok) console.warn('accounts fetch failed')
    if (txRes.ok) {
      const d = await txRes.json()
      const txs: { type: string; status: string; amount: number; currency: string }[] = d.transactions || []
      const total = txs
        .filter(t => t.status === 'processed' && t.type === 'investment' && t.currency === 'EUR')
        .reduce((s, t) => s + t.amount, 0)
      setInvestedTotal(total)
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function addAsset() {
    if (!form.name.trim() || !form.category) return
    setSaving(true); setFormError(null)
    const res = await fetch('/api/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (res.ok) {
      setAssets(a => [...a, data.asset].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
      setForm({ name: '', symbol: '', category: 'stocks', units: '', current_price: '', currency: 'EUR', purchase_price: '', purchase_date: '', notes: '' })
    } else {
      setFormError(data.error || 'Opslaan mislukt.')
    }
    setSaving(false)
  }

  async function saveEdit(id: string) {
    const res = await fetch('/api/assets', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editForm }),
    })
    if (res.ok) {
      const { asset } = await res.json()
      setAssets(a => a.map(x => x.id === id ? asset : x))
    }
    setEditingId(null)
  }

  async function deleteAsset(id: string) {
    await fetch(`/api/assets?id=${id}`, { method: 'DELETE' })
    setAssets(a => a.filter(x => x.id !== id))
  }

  function openEdit(asset: Asset) {
    setEditingId(asset.id)
    setEditForm({
      name: asset.name,
      symbol: asset.symbol || '',
      category: asset.category,
      units: String(asset.units),
      current_price: String(asset.current_price),
      currency: asset.currency,
      purchase_price: String(asset.purchase_price || ''),
      purchase_date: asset.purchase_date || '',
      notes: asset.notes || '',
    })
  }

  // ── Derived ──
  // Total value per asset
  const assetValue = (a: Asset) => a.units * a.current_price

  // Category totals (EUR only for chart — mixed currencies are summed as-is)
  const catTotals = ALL_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = assets.filter(a => a.category === cat).reduce((s, a) => s + assetValue(a), 0)
    return acc
  }, {} as Record<AssetCategory, number>)

  const portfolioTotal = Object.values(catTotals).reduce((s, v) => s + v, 0)

  const chartSegments = ALL_CATEGORIES.map(cat => ({
    category: cat,
    value: catTotals[cat],
    pct: portfolioTotal > 0 ? catTotals[cat] / portfolioTotal : 0,
  })).filter(s => s.value > 0)

  return (
    <div className="space-y-6">
      {/* Header + tabs */}
      <div>
        <h1 className="text-2xl font-semibold">Assets</h1>
        <div className="flex gap-1 mt-4 bg-slate-100 rounded-xl p-1 w-fit">
          {(['overzicht', 'instellingen'] as const).map(t => (
            <a key={t} href={`/assets${t === 'overzicht' ? '' : `?tab=${t}`}`}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize',
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
              {t === 'overzicht' ? 'Overzicht' : 'Instellingen'}
            </a>
          ))}
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-400 py-16 text-center">Laden…</div> : (

        <>
          {/* ── OVERZICHT ── */}
          {tab === 'overzicht' && (
            <div className="space-y-8">

              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 col-span-2 lg:col-span-1">
                  <p className="text-xs text-slate-500 font-medium">Totaal portfolio</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(portfolioTotal, 'EUR')}</p>
                </div>
                {ALL_CATEGORIES.map(cat => (
                  <div key={cat} className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-500 font-medium">{CATEGORY_LABELS[cat]}</p>
                    <p className="text-xl font-semibold text-slate-900 mt-1">{formatCurrency(catTotals[cat], 'EUR')}</p>
                    {portfolioTotal > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">{(catTotals[cat] / portfolioTotal * 100).toFixed(1)}%</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Chart + breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Donut chart */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-4">
                  <p className="text-sm font-semibold text-slate-700 self-start">Verdeling</p>
                  {chartSegments.length > 0 ? (
                    <>
                      <div className="w-40 h-40 relative">
                        <DonutChart segments={chartSegments} />
                      </div>
                      <div className="w-full space-y-2">
                        {chartSegments.map(seg => (
                          <div key={seg.category} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[seg.category] }} />
                              <span className="text-slate-600">{CATEGORY_LABELS[seg.category]}</span>
                            </div>
                            <span className="font-medium text-slate-800">{(seg.pct * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Nog geen assets toegevoegd</p>
                  )}
                </div>

                {/* Invested from Administratie */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-3">
                  <p className="text-sm font-semibold text-slate-700">Geïnvesteerd via Administratie</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                      <TrendingUp size={18} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-slate-900">{formatCurrency(investedTotal, 'EUR')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Verwerkte investment-transacties (EUR)</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Asset tables per category */}
              {ALL_CATEGORIES.map(cat => {
                const catAssets = assets.filter(a => a.category === cat)
                if (catAssets.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{CATEGORY_LABELS[cat]}</h2>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', CATEGORY_COLORS[cat])}>
                        {formatCurrency(catTotals[cat], 'EUR')}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Naam</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Symbool</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Units</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Huidige prijs</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Totaal</th>
                            {catAssets.some(a => a.purchase_price) && (
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">P&L</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {catAssets.map((asset, i) => {
                            const total = assetValue(asset)
                            const cost = asset.purchase_price ? asset.units * asset.purchase_price : null
                            const pnl = cost !== null ? total - cost : null
                            return (
                              <tr key={asset.id} className={cn('border-b border-slate-50 last:border-0', i % 2 === 1 && 'bg-slate-50/40')}>
                                <td className="px-4 py-3 font-medium text-slate-900">{asset.name}</td>
                                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{asset.symbol || '—'}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{asset.units % 1 === 0 ? asset.units : asset.units.toFixed(4)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(asset.current_price, asset.currency)}</td>
                                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(total, asset.currency)}</td>
                                {catAssets.some(a => a.purchase_price) && (
                                  <td className="px-4 py-3 text-right tabular-nums">
                                    {pnl !== null ? (
                                      <span className={pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, asset.currency)}
                                      </span>
                                    ) : '—'}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}

              {assets.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm">Nog geen assets. Voeg ze toe via <a href="/assets?tab=instellingen" className="text-indigo-500 hover:underline">Instellingen</a>.</p>
                </div>
              )}
            </div>
          )}

          {/* ── INSTELLINGEN ── */}
          {tab === 'instellingen' && (
            <div className="max-w-2xl space-y-8">

              {/* Add form */}
              <section className="space-y-4">
                <h2 className="text-base font-semibold text-slate-900">Asset toevoegen</h2>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Naam *</label>
                      <input type="text" placeholder="Bitcoin" value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Symbool / Ticker</label>
                      <input type="text" placeholder="BTC" value={form.symbol}
                        onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Categorie *</label>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as AssetCategory }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                        {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Valuta</label>
                      <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Aantal units</label>
                      <input type="number" step="any" placeholder="1.0" value={form.units}
                        onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Huidige prijs per unit</label>
                      <input type="number" step="any" placeholder="0.00" value={form.current_price}
                        onChange={e => setForm(f => ({ ...f, current_price: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Aankoopprijs per unit</label>
                      <input type="number" step="any" placeholder="0.00" value={form.purchase_price}
                        onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Aankoopdatum</label>
                      <input type="date" value={form.purchase_date}
                        onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notities</label>
                    <input type="text" placeholder="Optionele opmerking…" value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                  {formError && <p className="text-xs text-red-600">✗ {formError}</p>}
                  <button onClick={addAsset} disabled={!form.name.trim() || saving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    <Plus size={15} />
                    {saving ? 'Opslaan…' : 'Asset toevoegen'}
                  </button>
                </div>
              </section>

              {/* Asset list grouped by category */}
              {ALL_CATEGORIES.map(cat => {
                const catAssets = assets.filter(a => a.category === cat)
                if (catAssets.length === 0) return null
                return (
                  <section key={cat} className="space-y-3">
                    <h2 className="text-base font-semibold text-slate-900">{CATEGORY_LABELS[cat]}</h2>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      {catAssets.map((asset, i) => (
                        <div key={asset.id} className={cn(i > 0 && 'border-t border-slate-100')}>
                          {editingId === asset.id ? (
                            <div className="p-4 space-y-3 bg-indigo-50/40">
                              <div className="grid grid-cols-2 gap-2">
                                <input type="text" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                  placeholder="Naam" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                                <input type="text" value={editForm.symbol || ''} onChange={e => setEditForm(f => ({ ...f, symbol: e.target.value }))}
                                  placeholder="Symbool" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 font-mono" />
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <input type="number" step="any" value={editForm.units || ''} onChange={e => setEditForm(f => ({ ...f, units: e.target.value }))}
                                  placeholder="Units" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                                <input type="number" step="any" value={editForm.current_price || ''} onChange={e => setEditForm(f => ({ ...f, current_price: e.target.value }))}
                                  placeholder="Prijs" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                                <select value={editForm.currency || 'EUR'} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                                  className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input type="number" step="any" value={editForm.purchase_price || ''} onChange={e => setEditForm(f => ({ ...f, purchase_price: e.target.value }))}
                                  placeholder="Aankoopprijs" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                                <input type="date" value={editForm.purchase_date || ''} onChange={e => setEditForm(f => ({ ...f, purchase_date: e.target.value }))}
                                  className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => saveEdit(asset.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-colors">
                                  <Check size={13} /> Opslaan
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
                                  <X size={13} /> Annuleren
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between px-4 py-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-900">{asset.name}</p>
                                  {asset.symbol && <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{asset.symbol}</span>}
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {asset.units % 1 === 0 ? asset.units : asset.units.toFixed(4)} units
                                  {' · '}{formatCurrency(asset.current_price, asset.currency)} / unit
                                  {asset.purchase_date && ` · gekocht ${asset.purchase_date}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-semibold text-slate-800">{formatCurrency(assetValue(asset), asset.currency)}</p>
                                <div className="flex gap-0.5">
                                  <button onClick={() => openEdit(asset)} className="p-1 text-slate-300 hover:text-indigo-500 transition-colors">
                                    <Pencil size={13} />
                                  </button>
                                  <button onClick={() => deleteAsset(asset.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}

              {assets.length === 0 && (
                <p className="text-sm text-slate-400">Nog geen assets toegevoegd.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
