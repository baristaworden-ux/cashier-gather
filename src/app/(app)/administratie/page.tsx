'use client'

import { useEffect, useState } from 'react'
import { Account, AccountBalance, Transaction, CategoryRule } from '@/types'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Plus, Upload, Sparkles, Trash2, X, Settings, ChevronDown, ChevronUp, Search, ArrowUpDown } from 'lucide-react'

const BANK_LABELS: Record<string, string> = {
  rabobank: 'Rabobank',
  wise: 'Wise',
  revolut: 'Revolut',
  ocbc: 'OCBC Indonesia',
  manual: 'Handmatig',
}

const BANK_COLORS: Record<string, string> = {
  rabobank: 'bg-orange-500',
  wise: 'bg-green-500',
  revolut: 'bg-violet-500',
  ocbc: 'bg-red-500',
  manual: 'bg-slate-400',
}

const CATEGORIES = [
  'Wonen', 'Eten & drinken', 'Transport', 'Gezondheid',
  'Inkomen', 'Belasting', 'Zakelijk', 'Abonnementen', 'Overig',
]

const CATEGORY_COLORS: Record<string, string> = {
  'Wonen': 'bg-blue-100 text-blue-700',
  'Eten & drinken': 'bg-orange-100 text-orange-700',
  'Transport': 'bg-violet-100 text-violet-700',
  'Gezondheid': 'bg-emerald-100 text-emerald-700',
  'Inkomen': 'bg-green-100 text-green-700',
  'Belasting': 'bg-red-100 text-red-700',
  'Zakelijk': 'bg-indigo-100 text-indigo-700',
  'Abonnementen': 'bg-pink-100 text-pink-700',
  'Overig': 'bg-slate-100 text-slate-700',
}

type Tab = 'overzicht' | 'transacties' | 'uploaden' | 'overboeking'
type SettingsTab = 'rekeningen' | 'categorieen'
type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export default function AdministratiePage() {
  const [tab, setTab] = useState<Tab>('overzicht')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [categorizing, setCategorizing] = useState(false)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('rekeningen')

  // Category rules
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [newRuleCategory, setNewRuleCategory] = useState(CATEGORIES[0])
  const [newRuleKeyword, setNewRuleKeyword] = useState('')
  const [savingRule, setSavingRule] = useState(false)

  // Transaction filters
  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadAccount, setUploadAccount] = useState('')
  const [uploadCurrency, setUploadCurrency] = useState('EUR')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Transfer state
  const [transfer, setTransfer] = useState({
    from_account_id: '', to_account_id: '',
    from_currency: 'EUR', to_currency: 'IDR',
    from_amount: '', to_amount: '',
    fee_amount: '', description: '', date: new Date().toISOString().slice(0, 10),
  })
  const [transferring, setTransferring] = useState(false)
  const [transferResult, setTransferResult] = useState<{ exchange_rate: number; from: string; to: string } | null>(null)

  // New account form
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', bank: 'rabobank', account_number: '' })
  const [savingAccount, setSavingAccount] = useState(false)

  async function loadData() {
    setLoading(true)
    const [accRes, txRes, rulesRes] = await Promise.all([
      fetch('/api/accounts'),
      fetch('/api/transactions?limit=500'),
      fetch('/api/category-rules'),
    ])
    if (accRes.ok) {
      const { accounts, balances } = await accRes.json()
      setAccounts(accounts || [])
      setBalances(balances || [])
    }
    if (txRes.ok) {
      const { transactions } = await txRes.json()
      setTransactions(transactions || [])
      setUncategorizedCount((transactions || []).filter((t: Transaction) => !t.category).length)
    }
    if (rulesRes.ok) {
      const { rules } = await rulesRes.json()
      setRules(rules || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function createAccount() {
    setSavingAccount(true)
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAccount),
    })
    setSavingAccount(false)
    if (res.ok) {
      setShowAccountForm(false)
      setNewAccount({ name: '', bank: 'rabobank', account_number: '' })
      await loadData()
    }
  }

  async function deleteAccount(id: string) {
    await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  async function addRule() {
    if (!newRuleKeyword.trim()) return
    setSavingRule(true)
    const res = await fetch('/api/category-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newRuleCategory, keyword: newRuleKeyword }),
    })
    if (res.ok) {
      const { rule } = await res.json()
      setRules(r => [...r, rule])
      setNewRuleKeyword('')
    }
    setSavingRule(false)
  }

  async function deleteRule(id: string) {
    await fetch(`/api/category-rules?id=${id}`, { method: 'DELETE' })
    setRules(r => r.filter(x => x.id !== id))
  }

  async function handleTransfer() {
    if (!transfer.from_account_id || !transfer.to_account_id || !transfer.from_amount || !transfer.to_amount) return
    setTransferring(true)
    setTransferResult(null)
    const res = await fetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...transfer,
        from_amount: parseFloat(transfer.from_amount),
        to_amount: parseFloat(transfer.to_amount),
        fee_amount: transfer.fee_amount ? parseFloat(transfer.fee_amount) : 0,
      }),
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
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('account_id', uploadAccount)
    formData.append('currency', uploadCurrency)
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (res.ok) {
      setUploadResult(data)
      await loadData()
    } else {
      setUploadError(data.error || 'Er is een fout opgetreden.')
    }
    setUploading(false)
  }

  async function categorizeAll() {
    setCategorizing(true)
    const uncategorized = transactions.filter(t => !t.category).map(t => t.id)
    if (uncategorized.length > 0) {
      await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: uncategorized }),
      })
      await loadData()
    }
    setCategorizing(false)
  }

  // ── Overview calculations ──────────────────────────────────────────────────
  const balancesByCurrency = balances.reduce((acc, b) => {
    acc[b.currency] = (acc[b.currency] || 0) + b.balance
    return acc
  }, {} as Record<string, number>)

  const spendingByCategory = transactions
    .filter(t => t.type === 'expense' && t.category)
    .reduce((acc, t) => {
      acc[t.category!] = (acc[t.category!] || 0) + t.amount
      return acc
    }, {} as Record<string, number>)

  const topCategories = Object.entries(spendingByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  // ── Filtered + sorted transactions ─────────────────────────────────────────
  const filtered = transactions.filter(t => {
    if (filterAccount && t.account_id !== filterAccount) return false
    if (filterType && t.type !== filterType) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (search) {
      const q = search.toLowerCase()
      if (!t.description.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    switch (sortKey) {
      case 'date_desc': return b.date.localeCompare(a.date)
      case 'date_asc':  return a.date.localeCompare(b.date)
      case 'amount_desc': return b.amount - a.amount
      case 'amount_asc':  return a.amount - b.amount
    }
  })

  // ── Category rules grouped by category ─────────────────────────────────────
  const rulesByCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = rules.filter(r => r.category === cat)
    return acc
  }, {} as Record<string, CategoryRule[]>)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'transacties', label: 'Transacties' },
    { key: 'uploaden', label: 'Uploaden' },
    { key: 'overboeking', label: 'Overboeking' },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administratie</h1>
          <p className="text-sm text-slate-500 mt-1">Bankrekeningen, transacties & overzichten.</p>
        </div>
        <div className="flex items-center gap-2">
          {uncategorizedCount > 0 && (
            <button
              onClick={categorizeAll}
              disabled={categorizing}
              className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
            >
              <Sparkles size={15} />
              {categorizing ? 'Categoriseren…' : `${uncategorizedCount} categoriseren`}
            </button>
          )}
          <button
            onClick={() => setShowSettings(s => !s)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors',
              showSettings
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            )}
          >
            <Settings size={15} />
            Instellingen
            {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex border-b border-slate-100">
            {(['rekeningen', 'categorieen'] as SettingsTab[]).map(st => (
              <button
                key={st}
                onClick={() => setSettingsTab(st)}
                className={cn(
                  'px-6 py-3 text-sm font-medium transition-colors',
                  settingsTab === st
                    ? 'border-b-2 border-indigo-500 text-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {st === 'rekeningen' ? 'Rekeningen' : 'Categorieën & leveranciers'}
              </button>
            ))}
          </div>

          {/* Rekeningen */}
          {settingsTab === 'rekeningen' && (
            <div className="p-6 space-y-3">
              {accounts.map(account => {
                const acctBalances = balances.filter(b => b.account_id === account.id)
                return (
                  <div key={account.id} className="flex items-center justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl ${BANK_COLORS[account.bank] || 'bg-slate-400'} flex items-center justify-center shrink-0`}>
                        <span className="text-white text-xs font-bold">{account.bank[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{account.name}</p>
                        <p className="text-xs text-slate-400">{BANK_LABELS[account.bank]}{account.account_number ? ` · ${account.account_number}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {acctBalances.map(b => (
                          <span key={b.id} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                            {formatCurrency(b.balance, b.currency)}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => { if (confirm('Rekening verwijderen? Alle transacties worden ook verwijderd.')) deleteAccount(account.id) }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {showAccountForm ? (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 mt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-slate-900 text-sm">Nieuwe rekening</h3>
                    <button onClick={() => setShowAccountForm(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Naam (bijv. Rabobank Zakelijk)"
                    value={newAccount.name}
                    onChange={e => setNewAccount(a => ({ ...a, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                  />
                  <select
                    value={newAccount.bank}
                    onChange={e => setNewAccount(a => ({ ...a, bank: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    {Object.entries(BANK_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Rekeningnummer (optioneel)"
                    value={newAccount.account_number}
                    onChange={e => setNewAccount(a => ({ ...a, account_number: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={createAccount}
                    disabled={!newAccount.name || savingAccount}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                  >
                    {savingAccount ? 'Opslaan…' : 'Rekening toevoegen'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAccountForm(true)}
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-1"
                >
                  <Plus size={14} />
                  Rekening toevoegen
                </button>
              )}
            </div>
          )}

          {/* Categorieën */}
          {settingsTab === 'categorieen' && (
            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-500">
                Voeg leveranciers of trefwoorden toe per categorie. Transacties die deze trefwoorden bevatten worden automatisch gecategoriseerd bij het uploaden.
              </p>

              {/* Add new rule */}
              <div className="flex gap-2">
                <select
                  value={newRuleCategory}
                  onChange={e => setNewRuleCategory(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Leverancier of trefwoord…"
                  value={newRuleKeyword}
                  onChange={e => setNewRuleKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRule()}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                />
                <button
                  onClick={addRule}
                  disabled={!newRuleKeyword.trim() || savingRule}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Rules per category */}
              <div className="space-y-4">
                {CATEGORIES.map(cat => {
                  const catRules = rulesByCategory[cat] || []
                  if (catRules.length === 0) return null
                  return (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{cat}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {catRules.map(rule => (
                          <span
                            key={rule.id}
                            className={cn('inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full', CATEGORY_COLORS[cat] || CATEGORY_COLORS['Overig'])}
                          >
                            {rule.keyword}
                            <button onClick={() => deleteRule(rule.id)} className="opacity-60 hover:opacity-100 ml-0.5">
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {rules.length === 0 && (
                  <p className="text-sm text-slate-400 italic">Nog geen regels ingesteld.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main tabs ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-16 text-center">Laden…</div>
      ) : (
        <>
          {/* ── OVERZICHT ── */}
          {tab === 'overzicht' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(balancesByCurrency).map(([currency, total]) => (
                  <div key={currency} className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-xs text-slate-500 font-medium">{currency}</p>
                    <p className="text-2xl font-semibold text-slate-900 mt-1">
                      {formatCurrency(total, currency)}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="text-sm font-semibold text-slate-700 mb-3">Per rekening</h2>
                <div className="space-y-2">
                  {accounts.map(account => {
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
                        <div className="text-right">
                          {acctBalances.length === 0 ? (
                            <span className="text-xs text-slate-400">Geen saldo</span>
                          ) : (
                            acctBalances.map(b => (
                              <p key={b.id} className="text-sm font-semibold text-slate-900">
                                {formatCurrency(b.balance, b.currency)}
                              </p>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {topCategories.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-slate-700 mb-3">Uitgaven per categorie</h2>
                  <div className="space-y-2">
                    {topCategories.map(([cat, amount]) => {
                      const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
                      return (
                        <div key={cat} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', CATEGORY_COLORS[cat] || CATEGORY_COLORS['Overig'])}>
                              {cat}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">
                              {formatCurrency(amount, 'EUR')}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-indigo-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
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
              {/* Search + filters + sort */}
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Zoeken…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 w-48"
                  />
                </div>
                <select
                  value={filterAccount}
                  onChange={e => setFilterAccount(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                >
                  <option value="">Alle rekeningen</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                >
                  <option value="">Alles</option>
                  <option value="income">Inkomsten</option>
                  <option value="expense">Uitgaven</option>
                  <option value="transfer">Overboekingen</option>
                </select>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                >
                  <option value="">Alle categorieën</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <div className="relative ml-auto">
                  <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={sortKey}
                    onChange={e => setSortKey(e.target.value as SortKey)}
                    className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="date_desc">Datum nieuwste eerst</option>
                    <option value="date_asc">Datum oudste eerst</option>
                    <option value="amount_desc">Bedrag hoog → laag</option>
                    <option value="amount_asc">Bedrag laag → hoog</option>
                  </select>
                </div>
              </div>

              <p className="text-xs text-slate-400">{filtered.length} transacties</p>

              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-12">Geen transacties gevonden.</p>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Datum</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Omschrijving</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Categorie</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bedrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 200).map(tx => (
                        <tr key={tx.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                          <td className="px-4 py-3 text-slate-800 max-w-xs truncate">{tx.description}</td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {tx.category ? (
                              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Overig'])}>
                                {tx.category}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Niet gecategoriseerd</span>
                            )}
                          </td>
                          <td className={cn(
                            'px-4 py-3 text-right font-semibold whitespace-nowrap',
                            tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-red-500' : 'text-slate-500'
                          )}>
                            {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                            {formatCurrency(tx.amount, tx.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length > 200 && (
                    <p className="text-xs text-slate-400 text-center py-3">
                      Toont 200 van {filtered.length} transacties — gebruik filters om te verfijnen
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── UPLOADEN ── */}
          {tab === 'uploaden' && (
            <div className="max-w-lg space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-slate-900">Bank statement uploaden</h2>
                <p className="text-sm text-slate-500">
                  Ondersteunde banken: Rabobank, Wise, Revolut, OCBC Indonesia. Upload een CSV-bestand — het systeem detecteert automatisch welke bank het is.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Rekening <span className="text-red-400">*</span></label>
                  <select
                    value={uploadAccount}
                    onChange={e => setUploadAccount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="">Kies een rekening…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Valuta (voor OCBC)</label>
                  <select
                    value={uploadCurrency}
                    onChange={e => setUploadCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="IDR">IDR</option>
                    <option value="GBP">GBP</option>
                    <option value="SGD">SGD</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">CSV-bestand <span className="text-red-400">*</span></label>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>

                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || !uploadAccount || uploading}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  <Upload size={15} />
                  {uploading ? 'Uploaden…' : 'Importeren'}
                </button>

                {uploadResult && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                    ✓ <strong>{uploadResult.imported}</strong> transacties geïmporteerd
                    {uploadResult.skipped > 0 && `, ${uploadResult.skipped} duplicaten overgeslagen`}
                  </div>
                )}
                {uploadError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    ✗ {uploadError}
                  </div>
                )}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                <strong>Tip:</strong> Stel leveranciers in via Instellingen → Categorieën zodat transacties automatisch worden gecategoriseerd. Resterende transacties kun je met AI categoriseren (knop rechtsboven).
              </div>
            </div>
          )}

          {/* ── OVERBOEKING ── */}
          {tab === 'overboeking' && (
            <div className="max-w-lg space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="font-semibold text-slate-900">Overboeking tussen rekeningen</h2>
                <p className="text-sm text-slate-500">
                  Vul in hoeveel je verstuurd hebt en hoeveel je ontvangen hebt. Het systeem berekent automatisch de wisselkoers.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Van rekening</label>
                    <select value={transfer.from_account_id} onChange={e => setTransfer(t => ({ ...t, from_account_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      <option value="">Kies rekening…</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Naar rekening</label>
                    <select value={transfer.to_account_id} onChange={e => setTransfer(t => ({ ...t, to_account_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      <option value="">Kies rekening…</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
                      <input type="number" placeholder="0.00" value={transfer.from_amount}
                        onChange={e => setTransfer(t => ({ ...t, from_amount: e.target.value }))}
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
                      <input type="number" placeholder="0.00" value={transfer.to_amount}
                        onChange={e => setTransfer(t => ({ ...t, to_amount: e.target.value }))}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                </div>

                {transfer.from_amount && transfer.to_amount && parseFloat(transfer.from_amount) > 0 && (
                  <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
                    <span className="font-medium">Berekende koers: </span>
                    1 {transfer.from_currency} = {(parseFloat(transfer.to_amount) / (parseFloat(transfer.from_amount) - (parseFloat(transfer.fee_amount || '0')))).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} {transfer.to_currency}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Kosten / wisselkoerskosten ({transfer.from_currency})</label>
                  <input type="number" placeholder="0.00 (optioneel)" value={transfer.fee_amount}
                    onChange={e => setTransfer(t => ({ ...t, fee_amount: e.target.value }))}
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
                    <input type="text" placeholder="Overboeking naar…" value={transfer.description}
                      onChange={e => setTransfer(t => ({ ...t, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={transferring || !transfer.from_account_id || !transfer.to_account_id || !transfer.from_amount || !transfer.to_amount}
                  className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                >
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
