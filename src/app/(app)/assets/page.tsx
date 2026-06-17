'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, X, TrendingUp, RefreshCw } from 'lucide-react'
import { formatCurrency, cn, CURRENCIES } from '@/lib/utils'


interface Wallet {
  id: string
  asset_id: string
  name: string
  units: number
  notes?: string
  created_at: string
}

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
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [investedTotal, setInvestedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  // Wallet UI state
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set())
  const [addingWalletFor, setAddingWalletFor] = useState<string | null>(null)
  const [walletForm, setWalletForm] = useState({ name: '', units: '' })
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)
  const [editingWallet, setEditingWallet] = useState({ name: '', units: '' })
  const [savingWallet, setSavingWallet] = useState(false)

  const [form, setForm] = useState(EMPTY_FORM)
  const [formWallets, setFormWallets] = useState<{ name: string; units: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [lookingUpPrice, setLookingUpPrice] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const tickerLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<typeof EMPTY_FORM>>({})

  // Bank account cash balances (from administration module)
  const [bankCashByCurrency, setBankCashByCurrency] = useState<Record<string, { native: number; eur: number }>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    const [assetsRes, walletsRes, txRes, accountsRes] = await Promise.all([
      fetch('/api/assets'),
      fetch('/api/assets/wallets'),
      fetch('/api/transactions?limit=2000'),
      fetch('/api/accounts'),
    ])
    let loadedAssets: Asset[] = []
    if (assetsRes.ok) { const d = await assetsRes.json(); loadedAssets = d.assets || []; setAssets(loadedAssets) }
    if (walletsRes.ok) { const d = await walletsRes.json(); setWallets(d.wallets || []) }
    if (txRes.ok) {
      const d = await txRes.json()
      const txs: { type: string; status: string; amount: number; currency: string }[] = d.transactions || []
      setInvestedTotal(txs.filter(t => t.status === 'processed' && t.type === 'investment' && t.currency === 'EUR').reduce((s, t) => s + t.amount, 0))
    }
    if (accountsRes.ok) {
      const d = await accountsRes.json()
      const allAccounts: { id: string; account_type: string }[] = d.accounts || []
      const allBalances: { account_id: string; currency: string; balance: number }[] = d.balances || []
      const allOpening: { account_id: string; currency: string; amount: number }[] = d.opening_balances || []
      const regularIds = new Set(allAccounts.filter(a => a.account_type !== 'jar').map(a => a.id))
      // Net balance per currency across all regular accounts
      const netByCur: Record<string, number> = {}
      for (const b of allBalances) {
        if (!regularIds.has(b.account_id)) continue
        const ob = allOpening.find(o => o.account_id === b.account_id && o.currency === b.currency)
        netByCur[b.currency] = (netByCur[b.currency] || 0) + b.balance + (ob?.amount ?? 0)
      }
      // Fetch EUR rates for non-EUR currencies
      const today = new Date().toISOString().slice(0, 10)
      const rates: Record<string, number> = { EUR: 1 }
      const FIAT = ['USD', 'GBP', 'IDR', 'SGD', 'AUD', 'CHF', 'JPY']
      await Promise.all(
        Object.keys(netByCur).filter(c => c !== 'EUR' && FIAT.includes(c)).map(async c => {
          try {
            const r = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${today}/v1/currencies/${c.toLowerCase()}.json`)
            if (r.ok) { const data = await r.json(); const rate = data[c.toLowerCase()]?.eur; if (rate) rates[c] = rate }
          } catch { /* use 0 if unavailable */ }
        })
      )
      const breakdown: Record<string, { native: number; eur: number }> = {}
      for (const [cur, native] of Object.entries(netByCur)) {
        if (native <= 0) continue
        breakdown[cur] = { native, eur: native * (rates[cur] ?? 0) }
      }
      setBankCashByCurrency(breakdown)
    }
    setLoading(false)
    return loadedAssets
  }, [])

  // Auto-refresh prices on mount
  const refreshPrices = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch('/api/assets/prices', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        if (data.assets && data.assets.length > 0) setAssets(data.assets)
        setLastRefreshed(new Date())
      } else {
        setRefreshError('Prijzen ophalen mislukt')
      }
    } catch {
      setRefreshError('Verbindingsfout')
    }
    if (!silent) setRefreshing(false)
  }, [])

  // Fetch stock/ETF prices via edge API route (bypasses Yahoo Finance IP block)
  const refreshStockPrices = useCallback(async (stockList: Asset[]) => {
    const toFetch = stockList.filter(a => a.category === 'stocks' && a.price_ticker)
    if (toFetch.length === 0) return

    const updates: { id: string; price: number }[] = []
    await Promise.all(toFetch.map(async a => {
      try {
        const res = await fetch(`/api/assets/stock-price?ticker=${encodeURIComponent(a.price_ticker!)}`)
        if (!res.ok) return
        const data = await res.json()
        if (typeof data.price === 'number') updates.push({ id: a.id, price: data.price })
      } catch { /* skip on error */ }
    }))

    if (updates.length === 0) return
    setAssets(prev => prev.map(a => { const u = updates.find(x => x.id === a.id); return u ? { ...a, current_price: u.price } : a }))
    await Promise.all(updates.map(u => fetch('/api/assets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, current_price: u.price }) })))
  }, [])

  useEffect(() => {
    loadData().then(loaded => {
      refreshPrices(true)
      refreshStockPrices(loaded)
    })
  }, [loadData, refreshPrices, refreshStockPrices])

  function handleTickerChange(ticker: string, category?: string) {
    const cat = category ?? form.category
    setForm(f => ({ ...f, price_ticker: ticker }))
    setLookupError(null)
    if (tickerLookupTimer.current) clearTimeout(tickerLookupTimer.current)
    if (!ticker.trim()) return
    tickerLookupTimer.current = setTimeout(async () => {
      setLookingUpPrice(true)
      try {
        // Stocks/ETFs: via edge API route (Cloudflare IPs not blocked by Yahoo Finance)
        if (cat === 'stocks') {
          const res = await fetch(`/api/assets/stock-price?ticker=${encodeURIComponent(ticker.trim())}`)
          const data = await res.json()
          if (res.ok && typeof data.price === 'number') {
            setForm(f => ({ ...f, current_price: String(data.price) }))
            setLookupError(null)
          } else {
            setLookupError('Vul prijs handmatig in')
          }
          setLookingUpPrice(false)
          return
        }
        // Crypto / metals: via server-side API route (CoinGecko)
        const res = await fetch(`/api/assets/price-lookup?ticker=${encodeURIComponent(ticker.trim())}&category=${cat}&currency=${form.currency}`)
        const data = await res.json()
        if (res.ok && data.price !== undefined) {
          setForm(f => ({ ...f, current_price: String(data.price) }))
          setLookupError(null)
        } else {
          setLookupError(data.error || 'Ticker niet herkend')
        }
      } catch {
        setLookupError('Verbindingsfout')
      }
      setLookingUpPrice(false)
    }, 600)
  }

  async function addAsset() {
    if (!form.name.trim() || !form.category) return
    setSaving(true); setFormError(null)

    const validWallets = formWallets.filter(w => w.name.trim())
    const walletTotal = validWallets.reduce((s, w) => s + (parseFloat(w.units) || 0), 0)
    const submitForm = validWallets.length > 0 ? { ...form, units: String(walletTotal) } : form

    const res = await fetch('/api/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitForm),
    })
    const data = await res.json()
    if (res.ok) {
      const newAsset = data.asset
      if (validWallets.length > 0) {
        await Promise.all(validWallets.map(w => fetch('/api/assets/wallets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset_id: newAsset.id, name: w.name, units: w.units }),
        }).then(r => r.json()).then(d => { if (d.wallet) setWallets(ws => [...ws, d.wallet]) })))
      }
      setAssets(a => [...a, newAsset].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)))
      setForm(EMPTY_FORM)
      setFormWallets([])
      if (submitForm.price_ticker.trim()) refreshPrices(true)
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

  // ── Wallet functions ──
  // After any wallet change, sync admin_assets.units to the new wallet sum so the
  // asset total stays consistent with what's displayed (effectiveUnits uses wallet sum).
  async function syncAssetUnitsFromWallets(assetId: string, updatedWallets: typeof wallets) {
    const sum = updatedWallets.filter(w => w.asset_id === assetId).reduce((s, w) => s + w.units, 0)
    await fetch('/api/assets', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: assetId, units: String(sum) }),
    })
    setAssets(a => a.map(x => x.id === assetId ? { ...x, units: sum } : x))
  }

  async function addWallet(assetId: string) {
    if (!walletForm.name.trim()) return
    setSavingWallet(true)
    const res = await fetch('/api/assets/wallets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_id: assetId, name: walletForm.name, units: walletForm.units }),
    })
    if (res.ok) {
      const { wallet } = await res.json()
      const newWallets = [...wallets, wallet]
      setWallets(newWallets)
      await syncAssetUnitsFromWallets(assetId, newWallets)
      setWalletForm({ name: '', units: '' })
      setAddingWalletFor(null)
    }
    setSavingWallet(false)
  }

  async function saveWallet(id: string) {
    const res = await fetch('/api/assets/wallets', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editingWallet.name, units: editingWallet.units }),
    })
    if (res.ok) {
      const { wallet } = await res.json()
      const newWallets = wallets.map(x => x.id === id ? wallet : x)
      setWallets(newWallets)
      await syncAssetUnitsFromWallets(wallet.asset_id, newWallets)
    }
    setEditingWalletId(null)
  }

  async function deleteWallet(id: string) {
    const wallet = wallets.find(w => w.id === id)
    await fetch(`/api/assets/wallets?id=${id}`, { method: 'DELETE' })
    const newWallets = wallets.filter(x => x.id !== id)
    setWallets(newWallets)
    if (wallet) await syncAssetUnitsFromWallets(wallet.asset_id, newWallets)
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

  const assetWallets = (assetId: string) => wallets.filter(w => w.asset_id === assetId)
  const effectiveUnits = (a: Asset) => {
    const aw = assetWallets(a.id)
    return aw.length > 0 ? aw.reduce((s, w) => s + w.units, 0) : a.units
  }
  const assetValue = (a: Asset) => effectiveUnits(a) * a.current_price
  const formatUnits = (a: Asset) => {
    const n = effectiveUnits(a)
    const str = n % 1 === 0 ? n.toString() : n.toFixed(6).replace(/\.?0+$/, '')
    return a.unit ? `${str} ${a.unit}` : str
  }

  const bankCashTotal = Object.values(bankCashByCurrency).reduce((s, v) => s + v.eur, 0)
  const catTotals = ALL_CATEGORIES.reduce((acc, cat) => {
    if (cat === 'cash') {
      // Prefer live bank account balances; fall back to manually entered cash assets
      acc[cat] = bankCashTotal > 0
        ? bankCashTotal
        : assets.filter(a => a.category === cat).reduce((s, a) => s + assetValue(a), 0)
    } else {
      acc[cat] = assets.filter(a => a.category === cat).reduce((s, a) => s + assetValue(a), 0)
    }
    return acc
  }, {} as Record<AssetCategory, number>)

  const portfolioTotal = Object.values(catTotals).reduce((s, v) => s + v, 0)
  const chartSegments = ALL_CATEGORIES
    .map(cat => ({ category: cat, value: catTotals[cat], pct: portfolioTotal > 0 ? catTotals[cat] / portfolioTotal : 0 }))
    .filter(s => s.value > 0)

  // Cash breakdown: bank balances take priority over manually entered cash assets
  const cashByCurrency: Record<string, { units: number; eur: number }> = bankCashTotal > 0
    ? Object.fromEntries(Object.entries(bankCashByCurrency).map(([cur, { native, eur }]) => [cur, { units: native, eur }]))
    : assets.filter(a => a.category === 'cash').reduce((acc, a) => {
        const cur = a.currency
        if (!acc[cur]) acc[cur] = { units: 0, eur: 0 }
        acc[cur].units += effectiveUnits(a)
        acc[cur].eur += assetValue(a)
        return acc
      }, {} as Record<string, { units: number; eur: number }>)

  function formatNative(amount: number, currency: string): string {
    const ISO_CURRENCIES = ['EUR', 'USD', 'GBP', 'IDR', 'SGD', 'AUD', 'CHF', 'JPY']
    if (ISO_CURRENCIES.includes(currency)) {
      try { return new Intl.NumberFormat('nl-NL', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) }
      catch { /* fall through */ }
    }
    return `${amount.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} ${currency}`
  }

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
                  {/* Currency breakdown for cash */}
                  {cat === 'cash' && Object.keys(cashByCurrency).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                      {Object.entries(cashByCurrency)
                        .sort(([, a], [, b]) => b.eur - a.eur)
                        .map(([cur, { units, eur }]) => {
                          const pct = catTotals.cash > 0 ? eur / catTotals.cash * 100 : 0
                          return (
                            <div key={cur} className="flex items-center justify-between gap-1">
                              <span className="text-xs font-medium text-slate-600 shrink-0">{cur}</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs text-slate-400 truncate">{formatNative(units, cur)}</span>
                                <span className="text-xs text-slate-300">·</span>
                                <span className="text-xs font-medium text-slate-500 shrink-0">{pct.toFixed(0)}%</span>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Chart + invested */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-4 lg:col-span-2">
                <p className="text-sm font-semibold text-slate-700 self-start">Verdeling</p>
                {chartSegments.length > 0 ? (
                  <div className="w-full flex flex-col lg:flex-row items-center gap-6">
                    <div className="w-40 h-40 shrink-0"><DonutChart segments={chartSegments} /></div>
                    <div className="w-full space-y-1">
                      {chartSegments.map(seg => {
                        const catAssets = assets
                          .filter(a => a.category === seg.category)
                          .map(a => ({ ...a, val: assetValue(a) }))
                          .sort((a, b) => b.val - a.val)
                        return (
                          <div key={seg.category}>
                            {/* Category row */}
                            <div className="flex items-center justify-between py-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[seg.category] }} />
                                <span className="text-sm font-semibold text-slate-800">{CATEGORY_LABELS[seg.category]}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{formatCurrency(seg.value, 'EUR')}</span>
                                <span className="text-sm font-semibold text-slate-800 w-12 text-right">{(seg.pct * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                            {/* Per-asset rows */}
                            {catAssets.map(a => {
                              const pct = portfolioTotal > 0 ? a.val / portfolioTotal * 100 : 0
                              return (
                                <div key={a.id} className="flex items-center justify-between pl-5 py-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs shrink-0" style={{ color: CHART_COLORS[seg.category] }}>↳</span>
                                    <span className="text-xs text-slate-500">{a.name}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-400">{formatCurrency(a.val, 'EUR')}</span>
                                    <span className="text-xs text-slate-500 w-12 text-right">{pct.toFixed(1)}%</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
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
                          const units = effectiveUnits(asset)
                          const cost = asset.purchase_price ? units * asset.purchase_price : null
                          const pnl = cost !== null ? total - cost : null
                          const pnlPct = cost && cost > 0 ? ((total - cost) / cost * 100) : null
                          const aw = assetWallets(asset.id)
                          const walletExpanded = expandedWallets.has(asset.id)
                          return (
                            <>
                              <tr key={asset.id} className={cn('border-b border-slate-50', i % 2 === 1 && 'bg-slate-50/40')}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-slate-900">{asset.name}</span>
                                    {hasAutoPrice(asset) && (
                                      <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-mono">{asset.price_ticker}</span>
                                    )}
                                    {aw.length > 0 && (
                                      <button
                                        onClick={() => setExpandedWallets(s => { const n = new Set(s); if (walletExpanded) n.delete(asset.id); else n.add(asset.id); return n })}
                                        className="text-xs text-orange-600 bg-orange-50 hover:bg-orange-100 px-1.5 py-0.5 rounded transition-colors">
                                        {aw.length} wallet{aw.length > 1 ? 's' : ''} {walletExpanded ? '▲' : '▼'}
                                      </button>
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
                              {walletExpanded && aw.map(w => (
                                <tr key={w.id} className="bg-orange-50/40 border-b border-orange-100/60 last:border-0">
                                  <td className="pl-8 pr-4 py-2 text-xs text-slate-600" colSpan={2}>
                                    <span className="text-orange-400 mr-2">↳</span>{w.name}
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-500">
                                    {w.units % 1 === 0 ? w.units : w.units.toFixed(6).replace(/\.?0+$/, '')} {asset.unit}
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-400">{formatCurrency(asset.current_price, asset.currency)}</td>
                                  <td className="px-4 py-2 text-right text-xs font-medium tabular-nums text-slate-600">{formatCurrency(w.units * asset.current_price, asset.currency)}</td>
                                  {hasPnl && <td />}
                                </tr>
                              ))}
                            </>
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
                    <select value={form.category} onChange={e => { const cat = e.target.value as AssetCategory; setForm(f => ({ ...f, category: cat, unit: UNIT_DEFAULTS[cat] })); if (cat !== 'crypto') setFormWallets([]) }}
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Aantal units
                      {form.category === 'crypto' && formWallets.filter(w => w.name.trim()).length > 0 && (
                        <span className="ml-2 font-normal text-orange-500">· som van wallets</span>
                      )}
                    </label>
                    {form.category === 'crypto' && formWallets.filter(w => w.name.trim()).length > 0 ? (
                      <div className="w-full px-3 py-2 text-sm border border-slate-100 rounded-lg bg-slate-50 text-slate-500 tabular-nums">
                        {formWallets.reduce((s, w) => s + (parseFloat(w.units) || 0), 0).toFixed(6).replace(/\.?0+$/, '') || '0'} {form.unit}
                      </div>
                    ) : (
                      <input type="number" step="any" placeholder="1.0" value={form.units}
                        onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Huidige prijs / unit
                      {form.price_ticker.trim() && !lookingUpPrice && !lookupError && form.current_price && (
                        <span className="ml-2 font-normal text-emerald-600">· opgehaald ✓</span>
                      )}
                    </label>
                    <input type="number" step="any"
                      placeholder={form.price_ticker.trim() ? 'Wordt automatisch opgehaald…' : '0.00'}
                      value={form.current_price}
                      onChange={e => setForm(f => ({ ...f, current_price: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                </div>

                {/* Inline wallet builder for crypto */}
                {form.category === 'crypto' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-600">Wallets <span className="font-normal text-slate-400">(optioneel)</span></label>
                      <button type="button"
                        onClick={() => setFormWallets(w => [...w, { name: '', units: '' }])}
                        className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors">
                        <Plus size={11} /> Wallet toevoegen
                      </button>
                    </div>
                    {formWallets.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="text" placeholder="Wallet naam (bijv. Ledger)"
                          value={w.name}
                          onChange={e => setFormWallets(ws => ws.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          className="flex-1 px-2.5 py-2 text-sm border border-orange-200 rounded-lg outline-none focus:border-orange-400 bg-orange-50/30" />
                        <input type="number" step="any" placeholder="Hoeveelheid"
                          value={w.units}
                          onChange={e => setFormWallets(ws => ws.map((x, j) => j === i ? { ...x, units: e.target.value } : x))}
                          className="w-36 px-2.5 py-2 text-sm border border-orange-200 rounded-lg outline-none focus:border-orange-400 bg-orange-50/30" />
                        <span className="text-xs text-slate-400 shrink-0">{form.unit || 'coins'}</span>
                        <button type="button" onClick={() => setFormWallets(ws => ws.filter((_, j) => j !== i))}
                          className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {form.category === 'metals' && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 space-y-2">
                    <p className="text-xs font-medium text-amber-700">Kies een edelmetaal</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: 'Goud', ticker: 'GC=F', symbol: 'XAU', unit: 'oz' },
                        { name: 'Zilver', ticker: 'SI=F', symbol: 'XAG', unit: 'oz' },
                        { name: 'Platina', ticker: 'PL=F', symbol: 'XPT', unit: 'oz' },
                        { name: 'Palladium', ticker: 'PA=F', symbol: 'XPD', unit: 'oz' },
                      ].map(m => (
                        <button key={m.ticker} type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, name: f.name || m.name, symbol: m.symbol, price_ticker: m.ticker, unit: m.unit }))
                            handleTickerChange(m.ticker)
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.price_ticker === m.ticker ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200 hover:border-amber-400'}`}>
                          {m.name} <span className="font-mono opacity-60">{m.ticker}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-amber-600/70">Of type een andere ticker handmatig in het veld hieronder</p>
                  </div>
                )}

                {form.category === 'stocks' && (
                  <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                    <p className="text-xs font-medium text-slate-600 mb-2">Snelle selectie</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: 'FWRA', ticker: 'FWRA.MI', label: 'iShares MSCI World' },
                        { name: 'JEDI', ticker: 'JEDI.MI', label: 'JPMorgan Global Equity' },
                        { name: 'RBOT', ticker: 'RBOT.MI', label: 'Robo Global Robotics' },
                        { name: 'SCHD', ticker: 'SCHD', label: 'Schwab US Dividend' },
                        { name: 'SCHG', ticker: 'SCHG', label: 'Schwab US Large-Cap Growth' },
                      ].map(etf => (
                        <button key={etf.ticker} type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, name: f.name || etf.name, symbol: etf.ticker, price_ticker: etf.ticker }))
                            handleTickerChange(etf.ticker)
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${form.price_ticker === etf.ticker ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-indigo-700 border-indigo-200 hover:border-indigo-400'}`}>
                          {etf.name} <span className="font-mono opacity-60">{etf.ticker}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 pt-1">Of vul handmatig een ticker in via het veld hieronder</p>
                  </div>
                )}

                {form.category === 'crypto' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs text-slate-500 font-medium mb-1">Crypto ticker (CoinGecko ID)</p>
                    <p className="text-xs text-slate-400">{TICKER_HINTS.crypto}</p>
                  </div>
                )}

                {form.category !== 'cash' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Prijs-ticker
                      {lookingUpPrice && <span className="ml-2 font-normal text-slate-400">· prijs ophalen…</span>}
                      {!lookingUpPrice && lookupError && <span className="ml-2 font-normal text-red-500">· {lookupError}</span>}
                    </label>
                    <input type="text" placeholder={
                      form.category === 'crypto' ? 'bijv: bitcoin' :
                      form.category === 'metals' ? 'bijv: GC=F' : 'bijv: AAPL'
                    } value={form.price_ticker}
                      onChange={e => handleTickerChange(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-mono" />
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
                          <>
                            <div className="flex items-center justify-between px-4 py-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-900">{asset.name}</p>
                                  {asset.symbol && <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{asset.symbol}</span>}
                                  {asset.price_ticker && <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{asset.price_ticker}</span>}
                                  {asset.category === 'crypto' && assetWallets(asset.id).length > 0 && (
                                    <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded font-medium">
                                      {assetWallets(asset.id).length} wallet{assetWallets(asset.id).length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {formatUnits(asset)} · {formatCurrency(asset.current_price, asset.currency)} / {asset.unit || 'unit'}
                                  {asset.purchase_date && ` · gekocht ${asset.purchase_date}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-semibold text-slate-800">{formatCurrency(assetValue(asset), asset.currency)}</p>
                                <div className="flex items-center gap-0.5">
                                  {asset.category === 'crypto' && (
                                    <button
                                      onClick={() => { setAddingWalletFor(addingWalletFor === asset.id ? null : asset.id); setWalletForm({ name: '', units: '' }) }}
                                      title="Wallet toevoegen"
                                      className="flex items-center gap-1 px-2 py-1 text-xs text-orange-600 bg-orange-50 hover:bg-orange-100 rounded transition-colors font-medium mr-1">
                                      <Plus size={11} /> Wallet
                                    </button>
                                  )}
                                  <button onClick={() => openEdit(asset)} className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil size={13} /></button>
                                  <button onClick={() => deleteAsset(asset.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                                </div>
                              </div>
                            </div>

                            {/* Wallet list */}
                            {assetWallets(asset.id).map(w => (
                              <div key={w.id} className="border-t border-orange-100 bg-orange-50/30">
                                {editingWalletId === w.id ? (
                                  <div className="flex items-center gap-2 pl-8 pr-4 py-2">
                                    <input type="text" value={editingWallet.name}
                                      onChange={e => setEditingWallet(x => ({ ...x, name: e.target.value }))}
                                      onKeyDown={e => e.key === 'Enter' && saveWallet(w.id)}
                                      className="flex-1 px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400" />
                                    <input type="number" step="any" value={editingWallet.units}
                                      onChange={e => setEditingWallet(x => ({ ...x, units: e.target.value }))}
                                      onKeyDown={e => e.key === 'Enter' && saveWallet(w.id)}
                                      className="w-32 px-2.5 py-1.5 text-sm border border-indigo-200 rounded-lg outline-none focus:border-indigo-400"
                                      placeholder="Hoeveelheid" />
                                    <span className="text-xs text-slate-400 shrink-0">{asset.unit}</span>
                                    <button onClick={() => saveWallet(w.id)} className="p-1.5 text-indigo-600 hover:text-indigo-800 transition-colors"><Check size={13} /></button>
                                    <button onClick={() => setEditingWalletId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><X size={13} /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between pl-8 pr-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-orange-300 text-xs">↳</span>
                                      <p className="text-sm text-slate-700">{w.name}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <p className="text-sm text-slate-600 tabular-nums">
                                        {w.units % 1 === 0 ? w.units : w.units.toFixed(6).replace(/\.?0+$/, '')} {asset.unit}
                                      </p>
                                      <div className="flex gap-0.5">
                                        <button onClick={() => { setEditingWalletId(w.id); setEditingWallet({ name: w.name, units: String(w.units) }) }}
                                          className="p-1 text-slate-300 hover:text-indigo-500 transition-colors"><Pencil size={12} /></button>
                                        <button onClick={() => deleteWallet(w.id)}
                                          className="p-1 text-slate-300 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Add wallet form */}
                            {addingWalletFor === asset.id && (
                              <div className="flex items-center gap-2 pl-8 pr-4 py-2.5 border-t border-orange-100 bg-orange-50/50">
                                <input type="text" placeholder="Wallet naam (bijv. Ledger)" value={walletForm.name}
                                  onChange={e => setWalletForm(f => ({ ...f, name: e.target.value }))}
                                  autoFocus
                                  onKeyDown={e => e.key === 'Enter' && addWallet(asset.id)}
                                  className="flex-1 px-2.5 py-1.5 text-sm border border-orange-200 rounded-lg outline-none focus:border-orange-400 bg-white" />
                                <input type="number" step="any" placeholder="Hoeveelheid" value={walletForm.units}
                                  onChange={e => setWalletForm(f => ({ ...f, units: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && addWallet(asset.id)}
                                  className="w-32 px-2.5 py-1.5 text-sm border border-orange-200 rounded-lg outline-none focus:border-orange-400 bg-white" />
                                <span className="text-xs text-slate-400 shrink-0">{asset.unit}</span>
                                <button onClick={() => addWallet(asset.id)} disabled={!walletForm.name.trim() || savingWallet}
                                  className="p-1.5 text-orange-600 hover:text-orange-800 disabled:opacity-40 transition-colors"><Check size={14} /></button>
                                <button onClick={() => setAddingWalletFor(null)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"><X size={14} /></button>
                              </div>
                            )}
                          </>
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
