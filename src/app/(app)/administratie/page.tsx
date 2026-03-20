'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Account, AccountBalance, Transaction, Vendor, AdminCategory } from '@/types'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Upload, Sparkles, Search, ArrowUpDown, Link2, Unlink, PiggyBank } from 'lucide-react'

const BANK_LABELS: Record<string, string> = {
  rabobank: 'Rabobank', wise: 'Wise', revolut: 'Revolut',
  ocbc: 'OCBC Indonesia', manual: 'Handmatig',
}
const BANK_COLORS: Record<string, string> = {
  rabobank: 'bg-orange-500', wise: 'bg-green-500', revolut: 'bg-violet-500',
  ocbc: 'bg-red-500', manual: 'bg-slate-400',
}

type Tab = 'overzicht' | 'transacties' | 'uploaden' | 'overboeking'
type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

interface CellDropdown {
  txId: string
  field: 'vendor' | 'category'
  top: number
  left: number
}

export default function AdministratiePage() {
  const [tab, setTab] = useState<Tab>('overzicht')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [categorizing, setCategorizing] = useState(false)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)

  // Transaction filters
  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')

  // Inline cell edit
  const [cellDropdown, setCellDropdown] = useState<CellDropdown | null>(null)
  const [cellSearch, setCellSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Linking
  const [linkingTx, setLinkingTx] = useState<Transaction | null>(null)
  const [linkCandidates, setLinkCandidates] = useState<Transaction[]>([])
  const linkRef = useRef<HTMLDivElement>(null)

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadAccount, setUploadAccount] = useState('')
  const [uploadCurrency, setUploadCurrency] = useState('EUR')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Transfer
  const [transfer, setTransfer] = useState({
    from_account_id: '', to_account_id: '',
    from_currency: 'EUR', to_currency: 'IDR',
    from_amount: '', to_amount: '',
    fee_amount: '', description: '', date: new Date().toISOString().slice(0, 10),
  })
  const [transferring, setTransferring] = useState(false)
  const [transferResult, setTransferResult] = useState<{ exchange_rate: number; from: string; to: string } | null>(null)


  async function loadData() {
    setLoading(true)
    const [accRes, txRes, vendorRes, catRes] = await Promise.all([
      fetch('/api/accounts'),
      fetch('/api/transactions?limit=500'),
      fetch('/api/vendors'),
      fetch('/api/categories'),
    ])
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []) }
    if (txRes.ok) {
      const d = await txRes.json()
      setTransactions(d.transactions || [])
      setUncategorizedCount((d.transactions || []).filter((t: Transaction) => !t.category).length)
    }
    if (vendorRes.ok) { const d = await vendorRes.json(); setVendors(d.vendors || []) }
    if (catRes.ok) { const d = await catRes.json(); setCategories(d.categories || []) }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setCellDropdown(null)
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setLinkingTx(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Cell inline edit ────────────────────────────────────────────────────────
  function openCellDropdown(tx: Transaction, field: 'vendor' | 'category', e: React.MouseEvent) {
    e.stopPropagation()
    if (cellDropdown?.txId === tx.id && cellDropdown.field === field) { setCellDropdown(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setCellDropdown({ txId: tx.id, field, top: rect.bottom + 4, left: rect.left })
    setCellSearch('')
  }

  const updateCellValue = useCallback(async (txId: string, field: 'vendor' | 'category', value: string) => {
    const update: Record<string, string | null> = { [field]: value || null }
    if (field === 'vendor' && value) {
      const vendor = vendors.find(v => v.name === value)
      if (vendor?.category) update.category = vendor.category
    }
    await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: txId, ...update }),
    })
    setTransactions(txs => txs.map(t => t.id === txId ? { ...t, ...update } : t))
    setCellDropdown(null)
  }, [vendors])

  const categoryNames = categories.map(c => c.name)
  const vendorNames = vendors.map(v => v.name)

  const dropdownOptions: string[] = cellDropdown?.field === 'vendor' ? vendorNames : categoryNames
  const filteredDropdownOptions = dropdownOptions.filter(o =>
    !cellSearch || o.toLowerCase().includes(cellSearch.toLowerCase())
  )

  // ── Linking ─────────────────────────────────────────────────────────────────
  function openLinkPanel(tx: Transaction) {
    if (linkingTx?.id === tx.id) { setLinkingTx(null); return }
    const txDate = new Date(tx.date).getTime()
    const candidates = transactions.filter(t =>
      t.id !== tx.id && t.type === 'transfer' && !t.transfer_group_id &&
      t.account_id !== tx.account_id &&
      Math.abs(new Date(t.date).getTime() - txDate) <= 7 * 24 * 3600 * 1000
    ).sort((a, b) =>
      Math.abs(new Date(a.date).getTime() - txDate) - Math.abs(new Date(b.date).getTime() - txDate)
    ).slice(0, 8)
    setLinkCandidates(candidates)
    setLinkingTx(tx)
  }

  async function linkTransactions(id_b: string) {
    if (!linkingTx) return
    const res = await fetch('/api/transactions/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_a: linkingTx.id, id_b }),
    })
    if (res.ok) {
      const { transfer_group_id } = await res.json()
      setTransactions(txs => txs.map(t =>
        t.id === linkingTx.id || t.id === id_b ? { ...t, transfer_group_id } : t
      ))
      setLinkingTx(null)
    }
  }

  async function unlinkTransaction(tx: Transaction) {
    await fetch(`/api/transactions/link?id=${tx.id}`, { method: 'DELETE' })
    const groupId = tx.transfer_group_id
    setTransactions(txs => txs.map(t => t.transfer_group_id === groupId ? { ...t, transfer_group_id: undefined } : t))
  }

  async function handleTransfer() {
    if (!transfer.from_account_id || !transfer.to_account_id || !transfer.from_amount || !transfer.to_amount) return
    setTransferring(true); setTransferResult(null)
    const res = await fetch('/api/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...transfer, from_amount: parseFloat(transfer.from_amount), to_amount: parseFloat(transfer.to_amount), fee_amount: transfer.fee_amount ? parseFloat(transfer.fee_amount) : 0 }),
    })
    if (res.ok) {
      const data = await res.json()
      setTransferResult({ exchange_rate: data.exchange_rate, from: transfer.from_currency, to: transfer.to_currency })
      setTransfer(t => ({ ...t, from_amount: '', to_amount: '', fee_amount: '', description: '' }))
      await loadData()
    }
    setTransferring(false)
  }

  async function handleUpload() {
    if (!uploadFile || !uploadAccount) return
    setUploading(true); setUploadResult(null); setUploadError(null)
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('account_id', uploadAccount)
    formData.append('currency', uploadCurrency)
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (res.ok) { setUploadResult(data); await loadData() }
    else setUploadError(data.error || 'Er is een fout opgetreden.')
    setUploading(false)
  }

  async function categorizeAll() {
    setCategorizing(true)
    const ids = transactions.filter(t => !t.category).map(t => t.id)
    if (ids.length > 0) {
      await fetch('/api/categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_ids: ids }) })
      await loadData()
    }
    setCategorizing(false)
  }


  // ── Derived data ─────────────────────────────────────────────────────────────
  const regularAccounts = accounts.filter(a => a.account_type !== 'jar')
  const jars = accounts.filter(a => a.account_type === 'jar')
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

  const balancesByCurrency = balances
    .filter(b => regularAccounts.some(a => a.id === b.account_id))
    .reduce((acc, b) => { acc[b.currency] = (acc[b.currency] || 0) + b.balance; return acc }, {} as Record<string, number>)

  const jarBalancesByCurrency = balances
    .filter(b => jars.some(a => a.id === b.account_id))
    .reduce((acc, b) => { acc[b.currency] = (acc[b.currency] || 0) + b.balance; return acc }, {} as Record<string, number>)

  const spendingByCategory = transactions.filter(t => t.type === 'expense' && t.category)
    .reduce((acc, t) => { acc[t.category!] = (acc[t.category!] || 0) + t.amount; return acc }, {} as Record<string, number>)
  const topCategories = Object.entries(spendingByCategory).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const filtered = transactions.filter(t => {
    if (filterAccount && t.account_id !== filterAccount) return false
    if (filterType && t.type !== filterType) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (filterVendor && t.vendor !== filterVendor) return false
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    switch (sortKey) {
      case 'date_desc': return b.date.localeCompare(a.date)
      case 'date_asc':  return a.date.localeCompare(b.date)
      case 'amount_desc': return b.amount - a.amount
      case 'amount_asc':  return a.amount - b.amount
    }
  })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'transacties', label: 'Transacties' },
    { key: 'uploaden', label: 'Uploaden' },
    { key: 'overboeking', label: 'Overboeking' },
  ]

  const CATEGORY_COLORS: Record<string, string> = {
    'Wonen': 'bg-blue-100 text-blue-700', 'Eten & drinken': 'bg-orange-100 text-orange-700',
    'Transport': 'bg-violet-100 text-violet-700', 'Gezondheid': 'bg-emerald-100 text-emerald-700',
    'Inkomen': 'bg-green-100 text-green-700', 'Belasting': 'bg-red-100 text-red-700',
    'Zakelijk': 'bg-indigo-100 text-indigo-700', 'Abonnementen': 'bg-pink-100 text-pink-700',
    'Overig': 'bg-slate-100 text-slate-700',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administratie</h1>
          <p className="text-sm text-slate-500 mt-1">Bankrekeningen, transacties & overzichten.</p>
        </div>
        {uncategorizedCount > 0 && (
          <button onClick={categorizeAll} disabled={categorizing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60">
            <Sparkles size={15} />
            {categorizing ? 'Categoriseren…' : `${uncategorizedCount} categoriseren met AI`}
          </button>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-sm text-slate-400 py-16 text-center">Laden…</div> : (
        <>
          {/* ── OVERZICHT ── */}
          {tab === 'overzicht' && (
            <div className="space-y-8">
              {Object.keys(balancesByCurrency).length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Totaal saldo</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(balancesByCurrency).map(([currency, total]) => (
                      <div key={currency} className="bg-white border border-slate-200 rounded-2xl p-4">
                        <p className="text-xs text-slate-500 font-medium">{currency}</p>
                        <p className="text-2xl font-semibold text-slate-900 mt-1">{formatCurrency(total, currency)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regularAccounts.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Rekeningen</h2>
                  <div className="space-y-2">
                    {regularAccounts.map(account => {
                      const acctBalances = balances.filter(b => b.account_id === account.id)
                      return (
                        <div key={account.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg ${BANK_COLORS[account.bank] || 'bg-slate-400'} flex items-center justify-center`}>
                              <span className="text-white text-xs font-bold">{account.bank[0].toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{account.name}</p>
                              <p className="text-xs text-slate-400">{BANK_LABELS[account.bank]}{account.account_number ? ` · ${account.account_number}` : ''}</p>
                            </div>
                          </div>
                          <div className="text-right space-y-0.5">
                            {acctBalances.length === 0 ? <span className="text-xs text-slate-400">Geen saldo</span>
                              : acctBalances.map(b => <p key={b.id} className="text-sm font-semibold">{formatCurrency(b.balance, b.currency)}</p>)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {jars.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Jars</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {jars.map(jar => {
                      const jarBalances = balances.filter(b => b.account_id === jar.id)
                      return (
                        <div key={jar.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                              <PiggyBank size={15} className="text-amber-600" />
                            </div>
                            <p className="text-sm font-semibold text-slate-900 truncate">{jar.name}</p>
                          </div>
                          {jarBalances.length === 0 ? <p className="text-xs text-slate-400">Geen saldo</p>
                            : jarBalances.map(b => (
                              <div key={b.id}>
                                <p className="text-xl font-semibold text-slate-900">{formatCurrency(b.balance, b.currency)}</p>
                                <p className="text-xs text-amber-600 font-medium mt-0.5">{b.currency}</p>
                              </div>
                            ))}
                        </div>
                      )
                    })}
                  </div>
                  {Object.keys(jarBalancesByCurrency).length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">Totaal in jars: {Object.entries(jarBalancesByCurrency).map(([c, v]) => formatCurrency(v, c)).join(' · ')}</p>
                  )}
                </div>
              )}

              {topCategories.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Uitgaven per categorie</h2>
                  <div className="space-y-2">
                    {topCategories.map(([cat, amount]) => {
                      const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
                      return (
                        <div key={cat} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', CATEGORY_COLORS[cat] || 'bg-slate-100 text-slate-700')}>{cat}</span>
                            <span className="text-sm font-semibold">{formatCurrency(amount, 'EUR')}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TRANSACTIES ── */}
          {tab === 'transacties' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" placeholder="Zoeken…" value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 w-44" />
                </div>
                <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alle rekeningen</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alles</option>
                  <option value="income">Inkomsten</option>
                  <option value="expense">Uitgaven</option>
                  <option value="transfer">Overboekingen</option>
                </select>
                <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alle leveranciers</option>
                  {vendorNames.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alle categorieën</option>
                  {categoryNames.map(c => <option key={c}>{c}</option>)}
                </select>
                <div className="relative ml-auto">
                  <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                    className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                    <option value="date_desc">Datum nieuwste eerst</option>
                    <option value="date_asc">Datum oudste eerst</option>
                    <option value="amount_desc">Bedrag hoog → laag</option>
                    <option value="amount_asc">Bedrag laag → hoog</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-400">{filtered.length} transacties</p>

              {filtered.length === 0
                ? <p className="text-sm text-slate-400 italic text-center py-12">Geen transacties gevonden.</p>
                : (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" ref={linkRef}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Datum</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36 hidden md:table-cell">Leverancier</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Omschrijving</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Categorie</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell w-32">Koppeling</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bedrag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 200).map(tx => {
                          const isLinking = linkingTx?.id === tx.id
                          const linkedTx = tx.transfer_group_id
                            ? transactions.find(t => t.id !== tx.id && t.transfer_group_id === tx.transfer_group_id)
                            : null
                          return (
                            <>
                              <tr key={tx.id} className={cn('border-b border-slate-50 transition-colors', isLinking ? 'bg-indigo-50' : 'hover:bg-slate-50')}>
                                <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>

                                {/* Leverancier — clickable */}
                                <td className="px-4 py-2.5 hidden md:table-cell">
                                  <button
                                    onClick={e => openCellDropdown(tx, 'vendor', e)}
                                    className={cn(
                                      'text-xs px-2 py-1 rounded-lg border transition-colors text-left w-full truncate max-w-[130px]',
                                      cellDropdown?.txId === tx.id && cellDropdown.field === 'vendor'
                                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                        : tx.vendor
                                          ? 'border-transparent hover:border-slate-200 text-slate-800 font-medium'
                                          : 'border-transparent hover:border-slate-200 text-slate-400 italic'
                                    )}
                                  >
                                    {tx.vendor || '—'}
                                  </button>
                                </td>

                                <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate text-xs">{tx.description}</td>

                                {/* Categorie — clickable */}
                                <td className="px-4 py-2.5 hidden md:table-cell">
                                  <button
                                    onClick={e => openCellDropdown(tx, 'category', e)}
                                    className={cn(
                                      'text-xs font-medium px-2 py-0.5 rounded-full border transition-colors',
                                      cellDropdown?.txId === tx.id && cellDropdown.field === 'category'
                                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                        : tx.category
                                          ? cn('border-transparent', CATEGORY_COLORS[tx.category] || 'bg-slate-100 text-slate-700')
                                          : 'border-slate-200 text-slate-400 italic'
                                    )}
                                  >
                                    {tx.category || 'Categorie…'}
                                  </button>
                                </td>

                                {/* Koppeling */}
                                <td className="px-4 py-2.5 hidden lg:table-cell">
                                  {tx.type === 'transfer' && (
                                    linkedTx ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 truncate max-w-[100px]">
                                          <Link2 size={10} className="shrink-0" />
                                          {accountMap[linkedTx.account_id]?.name ?? '—'}
                                        </span>
                                        <button onClick={() => unlinkTransaction(tx)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0"><Unlink size={12} /></button>
                                      </div>
                                    ) : (
                                      <button onClick={() => openLinkPanel(tx)}
                                        className={cn('flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors',
                                          isLinking ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600')}>
                                        <Link2 size={10} />Koppelen
                                      </button>
                                    )
                                  )}
                                </td>

                                <td className={cn('px-4 py-2.5 text-right font-semibold whitespace-nowrap text-sm',
                                  tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-red-500' : 'text-slate-500')}>
                                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                                  {formatCurrency(tx.amount, tx.currency)}
                                </td>
                              </tr>

                              {/* Link panel */}
                              {isLinking && (
                                <tr key={`${tx.id}-link`} className="bg-indigo-50 border-b border-indigo-100">
                                  <td colSpan={6} className="px-4 py-3">
                                    <p className="text-xs font-semibold text-indigo-700 mb-2">Koppel aan tegenpost:</p>
                                    {linkCandidates.length === 0
                                      ? <p className="text-xs text-slate-400 italic">Geen kandidaten gevonden binnen 7 dagen op andere rekeningen.</p>
                                      : (
                                        <div className="flex flex-wrap gap-2">
                                          {linkCandidates.map(c => (
                                            <button key={c.id} onClick={() => linkTransactions(c.id)}
                                              className="flex items-center gap-2 text-xs bg-white border border-indigo-200 hover:bg-indigo-100 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                                              <span className="font-medium">{formatDate(c.date)}</span>
                                              <span className="text-slate-400">{accountMap[c.account_id]?.name ?? '—'}</span>
                                              <span className={cn('font-semibold', c.type === 'income' ? 'text-emerald-600' : 'text-red-500')}>
                                                {c.type === 'income' ? '+' : '-'}{formatCurrency(c.amount, c.currency)}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                    {filtered.length > 200 && (
                      <p className="text-xs text-slate-400 text-center py-3">Toont 200 van {filtered.length} — gebruik filters om te verfijnen</p>
                    )}
                  </div>
                )}

              {/* Cell edit dropdown (fixed overlay) */}
              {cellDropdown && (
                <div
                  ref={dropdownRef}
                  style={{ position: 'fixed', top: cellDropdown.top, left: cellDropdown.left, zIndex: 200 }}
                  className="bg-white border border-slate-200 rounded-xl shadow-xl w-60 overflow-hidden"
                >
                  <div className="p-2 border-b border-slate-100">
                    <input
                      autoFocus
                      type="text"
                      placeholder={cellDropdown.field === 'vendor' ? 'Leverancier zoeken…' : 'Categorie zoeken…'}
                      value={cellSearch}
                      onChange={e => setCellSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {cellDropdown.field === 'vendor' && (
                      <button
                        onClick={() => updateCellValue(cellDropdown.txId, 'vendor', '')}
                        className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-50 transition-colors border-b border-slate-50"
                      >
                        — Geen leverancier
                      </button>
                    )}
                    {filteredDropdownOptions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic px-3 py-3">Geen resultaten.</p>
                    ) : filteredDropdownOptions.map(opt => (
                      <button
                        key={opt}
                        onClick={() => updateCellValue(cellDropdown.txId, cellDropdown.field, opt)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── UPLOADEN ── */}
          {tab === 'uploaden' && (
            <div className="max-w-lg space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-slate-900">Bank statement uploaden</h2>
                <p className="text-sm text-slate-500">Ondersteunde banken: Rabobank, Wise, Revolut, OCBC Indonesia.</p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Rekening of jar <span className="text-red-400">*</span></label>
                  <select value={uploadAccount} onChange={e => setUploadAccount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                    <option value="">Kies een rekening of jar…</option>
                    {regularAccounts.length > 0 && <optgroup label="Rekeningen">{regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                    {jars.length > 0 && <optgroup label="Jars">{jars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Valuta (voor OCBC / jar)</label>
                  <select value={uploadCurrency} onChange={e => setUploadCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                    {['EUR','USD','IDR','GBP','SGD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">CSV-bestand <span className="text-red-400">*</span></label>
                  <input type="file" accept=".csv,.txt" onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>
                <button onClick={handleUpload} disabled={!uploadFile || !uploadAccount || uploading}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                  <Upload size={15} />
                  {uploading ? 'Uploaden…' : 'Importeren'}
                </button>
                {uploadResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                    ✓ <strong>{uploadResult.imported}</strong> transacties geïmporteerd
                    {uploadResult.skipped > 0 && `, ${uploadResult.skipped} duplicaten overgeslagen`}
                  </div>
                )}
                {uploadError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">✗ {uploadError}</div>}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                <strong>Tip:</strong> Stel leveranciers in via <a href="/settings" className="underline">Instellingen</a> voor automatische categorisering bij het uploaden.
              </div>
            </div>
          )}

          {/* ── OVERBOEKING ── */}
          {tab === 'overboeking' && (
            <div className="max-w-lg">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-slate-900">Overboeking tussen rekeningen</h2>
                <p className="text-sm text-slate-500">Vul verstuurd en ontvangen bedrag in. Wisselkoers wordt automatisch berekend.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Van</label>
                    <select value={transfer.from_account_id} onChange={e => setTransfer(t => ({ ...t, from_account_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      <option value="">Kies…</option>
                      {regularAccounts.length > 0 && <optgroup label="Rekeningen">{regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                      {jars.length > 0 && <optgroup label="Jars">{jars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Naar</label>
                    <select value={transfer.to_account_id} onChange={e => setTransfer(t => ({ ...t, to_account_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      <option value="">Kies…</option>
                      {regularAccounts.length > 0 && <optgroup label="Rekeningen">{regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                      {jars.length > 0 && <optgroup label="Jars">{jars.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Verstuurd bedrag</label>
                    <div className="flex gap-1.5">
                      <select value={transfer.from_currency} onChange={e => setTransfer(t => ({ ...t, from_currency: e.target.value }))}
                        className="w-20 px-2 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                        {['EUR','USD','IDR','GBP','SGD'].map(c => <option key={c}>{c}</option>)}
                      </select>
                      <input type="number" placeholder="0.00" value={transfer.from_amount} onChange={e => setTransfer(t => ({ ...t, from_amount: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Ontvangen bedrag</label>
                    <div className="flex gap-1.5">
                      <select value={transfer.to_currency} onChange={e => setTransfer(t => ({ ...t, to_currency: e.target.value }))}
                        className="w-20 px-2 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                        {['IDR','EUR','USD','GBP','SGD'].map(c => <option key={c}>{c}</option>)}
                      </select>
                      <input type="number" placeholder="0.00" value={transfer.to_amount} onChange={e => setTransfer(t => ({ ...t, to_amount: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                </div>
                {transfer.from_amount && transfer.to_amount && parseFloat(transfer.from_amount) > 0 && (
                  <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
                    <span className="font-medium">Berekende koers: </span>
                    1 {transfer.from_currency} = {(parseFloat(transfer.to_amount) / (parseFloat(transfer.from_amount) - parseFloat(transfer.fee_amount || '0'))).toLocaleString('nl-NL', { maximumFractionDigits: 4 })} {transfer.to_currency}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Kosten ({transfer.from_currency}, optioneel)</label>
                  <input type="number" placeholder="0.00" value={transfer.fee_amount} onChange={e => setTransfer(t => ({ ...t, fee_amount: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Datum</label>
                    <input type="date" value={transfer.date} onChange={e => setTransfer(t => ({ ...t, date: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Omschrijving (optioneel)</label>
                    <input type="text" placeholder="Overboeking naar…" value={transfer.description} onChange={e => setTransfer(t => ({ ...t, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                </div>
                <button onClick={handleTransfer}
                  disabled={transferring || !transfer.from_account_id || !transfer.to_account_id || !transfer.from_amount || !transfer.to_amount}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                  {transferring ? 'Verwerken…' : 'Overboeking registreren'}
                </button>
                {transferResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                    ✓ Overboeking geregistreerd · Koers: 1 {transferResult.from} = {transferResult.exchange_rate.toLocaleString('nl-NL', { maximumFractionDigits: 4 })} {transferResult.to}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
