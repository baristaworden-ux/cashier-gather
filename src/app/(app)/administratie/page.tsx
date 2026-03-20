'use client'

import { useEffect, useState } from 'react'
import { Account, AccountBalance, Transaction } from '@/types'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Plus, Upload, Sparkles, Trash2, X } from 'lucide-react'

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

type Tab = 'overzicht' | 'transacties' | 'uploaden' | 'rekeningen' | 'overboeking'

export default function AdministratiePage() {
  const [tab, setTab] = useState<Tab>('overzicht')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [categorizing, setCategorizing] = useState(false)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)

  // Filters
  const [filterAccount, setFilterAccount] = useState('')
  const [filterType, setFilterType] = useState('')

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadAccount, setUploadAccount] = useState('')
  const [uploadCurrency, setUploadCurrency] = useState('EUR')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number } | null>(null)

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
    const [accRes, txRes] = await Promise.all([
      fetch('/api/accounts'),
      fetch('/api/transactions?limit=200'),
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
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('account_id', uploadAccount)
    formData.append('currency', uploadCurrency)
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setUploadResult(data)
      await loadData()
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

  // Filtered transactions
  const filtered = transactions.filter(t => {
    if (filterAccount && t.account_id !== filterAccount) return false
    if (filterType && t.type !== filterType) return false
    return true
  })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'transacties', label: 'Transacties' },
    { key: 'uploaden', label: 'Uploaden' },
    { key: 'overboeking', label: 'Overboeking' },
    { key: 'rekeningen', label: 'Rekeningen' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administratie</h1>
          <p className="text-sm text-slate-500 mt-1">Bankrekeningen, transacties & overzichten.</p>
        </div>
        {uncategorizedCount > 0 && (
          <button
            onClick={categorizeAll}
            disabled={categorizing}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            <Sparkles size={15} />
            {categorizing ? 'Categoriseren…' : `${uncategorizedCount} categoriseren met AI`}
          </button>
        )}
      </div>

      {/* Tabs */}
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
              {/* Balance cards per currency */}
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

              {/* Per account */}
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

              {/* Top categories */}
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
              <div className="flex gap-2 flex-wrap">
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
              </div>

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
                      {filtered.slice(0, 100).map(tx => (
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
                  {filtered.length > 100 && (
                    <p className="text-xs text-slate-400 text-center py-3">
                      {filtered.length - 100} meer transacties — gebruik filters om te verfijnen
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
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                <strong>Tip:</strong> Na het importeren kun je alle niet-gecategoriseerde transacties in één klik laten categoriseren met AI (knop rechtsboven).
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

                {/* Calculated rate preview */}
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
                  <p className="text-xs text-slate-400">Dit bedrag is inbegrepen in het verstuurd bedrag en wordt als aparte kostenpost geregistreerd.</p>
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

          {/* ── REKENINGEN ── */}
          {tab === 'rekeningen' && (
            <div className="space-y-4 max-w-lg">
              {accounts.map(account => {
                const acctBalances = balances.filter(b => b.account_id === account.id)
                return (
                  <div key={account.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl ${BANK_COLORS[account.bank] || 'bg-slate-400'} flex items-center justify-center shrink-0`}>
                        <span className="text-white text-sm font-bold">{account.bank[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{account.name}</p>
                        <p className="text-xs text-slate-400">{BANK_LABELS[account.bank]}{account.account_number ? ` · ${account.account_number}` : ''}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {acctBalances.map(b => (
                            <span key={b.id} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                              {formatCurrency(b.balance, b.currency)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { if (confirm('Rekening verwijderen? Alle transacties worden ook verwijderd.')) deleteAccount(account.id) }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}

              {/* Add account form */}
              {showAccountForm ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
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
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-200 rounded-2xl py-4 text-sm text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
                >
                  <Plus size={15} />
                  Rekening toevoegen
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
