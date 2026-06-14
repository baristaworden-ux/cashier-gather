'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, X, TrendingUp, RefreshCw } from 'lucide-react'
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
  unit?: string
  price_ticker?: string
  created_at: string
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: 'Cash', metals: 'Edelmetalen', crypto: 'Crypto', stocks: 'Aandelen',
}
const CATEGORY_COLORS: Record<AssetCategory, string> = {
  cash:   'bg-blue-100 text-blue-700',
  metals: 'bg-amber-100 text-amber-700',
  crypto: 'bg-orange-100 text-orange-700',
  stocks: 'bg-emerald-100 text-emerald-700',
}
const CHART_COLORS: Record<AssetCategory, string> = {
  cash: '#6366f1', metals: '#f59e0b', crypto: '#f97316', stocks: '#10b981',
}
const TICKER_HINTS: Record<AssetCategory, string> = {
  cash:   '',
  metals: 'Yahoo Finance: GC=F (goud), SI=F (zilver), PL=F (platina)',
  crypto: 'CoinGecko ID: bitcoin, ethereum, solana, cardano',
  stocks: 'Yahoo Finance: AAPL, ASML.AS, MSFT, GOOGL, TSLA',
}
const UNIT_DEFAULTS: Record<AssetCategory, string> = {
  cash: 'EUR', metals: 'oz', crypto: 'coins', stocks: 'aandelen',
}

const ALL_CATEGORIES: AssetCategory[] = ['cash', 'metals', 'crypto', 'stocks']

function DonutChart({ segments }: { segments: { category: AssetCategory; value: number; pct: number }[] }) {
  const r = 54, cx = 80, cy = 80
  const circumference = 2 * Math.PI * r
  let cumPct = 0
  return (
    <svg viewBox="0 0 160 160" className="w-full h-full">
      {segments.filter(s => s.pct > 0).map(seg => {
        const startPct = cumPct
        cumPct += seg.pct
        const dashLen = circumference * seg.pct
        return (
          <circle key={seg.category} r={r} cx={cx} cy={cy} fill="none"
            stroke={CHART_COLORS[seg.category]} strokeWidth={22}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={-circumference * startPct + circumference * 0.25}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }} />
        )
      })}
      <circle r={43} cx={cx} cy={cy} fill="white" />
    </svg>
  )
}

const EMPTY_FORM = {
  name: '', symbol: '', category: 'stocks' as AssetCategory,
  units: '', current_price: '', currency: 'EUR',
  purchase_price: '', purchase_date: '', notes: '',
  unit: '', price_ticker: '',
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
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<typeof EMPTY_FORM>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    const [assetsRes, txRes] = await Promise.all([
      fetch('/api/assets'),
      fetch('/api/transactions?limit=2000'),
    ])
    if (assetsRes.ok) { const d = await assetsRes.json(); setAssets(d.assets || []) }
    if (txRes.ok) {
      const d = await txRes.json()
      const txs: { type: string; status: string; amount: number; currency: string }[] = d.transactions || []
      setInvestedTotal(txs.filter(t => t.status === 'processed' && t.type === 'investment' && t.currency === 'EUR').reduce((s, t) => s + t.amount, 0))
    }
    setLoading(false)
  }, [])

  // Auto-refresh prices on mount
  const refreshPrices = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch('/api/assets/prices', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.assets) {
        setAssets(data.assets)
        setLastRefreshed(new Date())
      } else {
        setRefreshError('Prijzen ophalen mislukt')
      }
    } catch {
      setRefreshError('Verbindingsfout')
    }
    if (!silent) setRefreshing(false)
  }, [])

  useEffect(() => {
    loadData().then(() => refreshPrices(true))
  }, [loadData, refreshPrices])

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
      setForm(EMPTY_FORM)
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
      name: asset.name, symbol: asset.symbol || '', category: asset.category,
      units: String(asset.units), current_price: String(asset.current_price),
      currency: asset.currency, purchase_price: String(asset.purchase_price || ''),
      purchase_date: asset.purchase_date || '', notes: asset.notes || '',
      unit: asset.unit || '', price_ticker: asset.price_ticker || '',
    })
  }

  const assetValue = (a: Asset) => a.units * a.current_price
  const formatUnits = (a: Asset) => {
    const n = a.units % 1 === 0 ? a.units.toString() : a.units.toFixed(6).replace(/\.?0+$/, '')
    return a.unit ? `${n} ${a.unit}` : n
  }

  const catTotals = ALL_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = assets.filter(a => a.category === cat).reduce((s, a) => s + assetValue(a), 0)
    return acc
  }, {} as Record<AssetCategory, number>)

  const portfolioTotal = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const chartSegments = ALL_CATEGORIES
    .map(cat => ({ category: cat, value: catTotals[cat], pct: portfolioTotal > 0 ? catTotals[cat] / portfolioTotal : 0 }))
    .filter(s => s.value > 0)

  const hasAutoPrice = (a: Asset) => !!a.price_ticker

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Assets</h1>
        <div className="flex gap-1 mt-4 bg-slate-100 rounded-xl p-1 w-fit">
          {(['overzicht', 'instellingen'] as const).map(t => (
            <a key={t} href={`/assets${t === 'overzicht' ? '' : `?tab=${t}`}`}
              className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
              {t === 'overzicht' ? 'Overzicht' : 'Instellingen'}
            </a>
          ))}
        </div>
      </div>

      {loading ? <div className="text-sm text-slate-400 py-16 text-center">Laden…</div> : (<>

        {/* ── OVERZICHT ── */}
        {tab === 'overzicht' && (
          <div className="space-y-8">

            {/* Refresh bar */}
            <div className="flex items-center gap-3">
              <button onClick={() => refreshPrices(false)} disabled={refreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-sm text-slate-600 transition-colors disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Prijzen ophalen…' : 'Prijzen vernieuwen'}
              </button>
              {lastRefreshed && !refreshing && (
                <span className="text-xs text-slate-400">
                  Bijgewerkt {lastRefreshed.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {refreshError && <span className="text-xs text-red-500">{refreshError}</span>}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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

            {/* Chart + invested */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-4">
                <p className="text-sm font-semibold text-slate-700 self-start">Verdeling</p>
                {chartSegments.length > 0 ? (<>
                  <div className="w-40 h-40"><DonutChart segments={chartSegments} /></div>
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
                </>) : (
                  <p className="text-sm text-slate-400">Nog geen assets</p>
                )}
              </div>

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
              const hasPnl = catAssets.some(a => a.purchase_price)
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
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Aantal</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Prijs / unit</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Totaal</th>
                          {hasPnl && <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">P&L</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {catAssets.map((asset, i) => {
                          const total = assetValue(asset)
                          const cost = asset.purchase_price ? asset.units * asset.purchase_price : null
                          const pnl = cost !== null ? total - cost : null
                          const pnlPct = cost && cost > 0 ? ((total - cost) / cost * 100) : null
                          return (
                            <tr key={asset.id} className={cn('border-b border-slate-50 last:border-0', i % 2 === 1 && 'bg-slate-50/40')}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-900">{asset.name}</span>
                                  {hasAutoPrice(asset) && (
                                    <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-mono">{asset.price_ticker}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500 font-mono text-xs">{asset.symbol || '—'}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatUnits(asset)}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(asset.current_price, asset.currency)}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(total, asset.currency)}</td>
                              {hasPnl && (
                                <td className="px-4 py-3 text-right tabular-nums">
                                  {pnl !== null ? (
                                    <div>
                                      <span className={pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl, asset.currency)}
                                      </span>
                                      {pnlPct !== null && (
                                        <p className={cn('text-xs', pnl >= 0 ? 'text-emerald-500' : 'text-red-400')}>
                                          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                        </p>
                                      )}
                                    </div>
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Categorie *</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as AssetCategory, unit: UNIT_DEFAULTS[e.target.value as AssetCategory] }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Symbool / Ticker</label>
                    <input type="text" placeholder="BTC" value={form.symbol}
                      onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Eenheid (unit)</label>
                    <input type="text" placeholder={UNIT_DEFAULTS[form.category]} value={form.unit}
                      onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Huidige prijs / unit</label>
                    <input type="number" step="any" placeholder="0.00" value={form.current_price}
                      onChange={e => setForm(f => ({ ...f, current_price: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                </div>

                {form.category !== 'cash' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Automatische prijs-ticker
                    </label>
                    <input type="text" placeholder={
                      form.category === 'crypto' ? 'bijv: bitcoin' :
                      form.category === 'metals' ? 'bijv: GC=F' : 'bijv: AAPL'
                    } value={form.price_ticker}
                      onChange={e => setForm(f => ({ ...f, price_ticker: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-mono" />
                    <p className="text-xs text-slate-400 mt-1">{TICKER_HINTS[form.category]}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aankoopprijs / unit</label>
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

            {/* Asset list */}
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
                            <div className="grid grid-cols-4 gap-2">
                              <input type="number" step="any" value={editForm.units || ''} onChange={e => setEditForm(f => ({ ...f, units: e.target.value }))}
                                placeholder="Units" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                              <input type="text" value={editForm.unit || ''} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                                placeholder="Eenheid (oz)" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                              <input type="number" step="any" value={editForm.current_price || ''} onChange={e => setEditForm(f => ({ ...f, current_price: e.target.value }))}
                                placeholder="Prijs" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                              <select value={editForm.currency || 'EUR'} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                                className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" value={editForm.price_ticker || ''} onChange={e => setEditForm(f => ({ ...f, price_ticker: e.target.value }))}
                                placeholder="Prijs-ticker (bijv: GC=F)" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400 font-mono" />
                              <input type="number" step="any" value={editForm.purchase_price || ''} onChange={e => setEditForm(f => ({ ...f, purchase_price: e.target.value }))}
                                placeholder="Aankoopprijs" className="px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
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
                                {asset.price_ticker && <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{asset.price_ticker}</span>}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {formatUnits(asset)} · {formatCurrency(asset.current_price, asset.currency)} / {asset.unit || 'unit'}
                                {asset.purchase_date && ` · gekocht ${asset.purchase_date}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="text-sm font-semibold text-slate-800">{formatCurrency(assetValue(asset), asset.currency)}</p>
                              <div className="flex gap-0.5">
                                <button onClick={() => openEdit(asset)} className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil size={13} /></button>
                                <button onClick={() => deleteAsset(asset.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
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
          </div>
        )}
      </>)}
    </div>
  )
}
