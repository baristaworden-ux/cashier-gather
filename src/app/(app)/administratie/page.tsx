'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Account, AccountBalance, Transaction, TransactionType, Vendor, AdminCategory } from '@/types'
import { formatCurrency, formatDate, cn, CURRENCIES } from '@/lib/utils'
import { Upload, Sparkles, Search, ArrowUpDown, Link2, Unlink, PiggyBank, ChevronRight, X, Plus, Trash2, RotateCcw } from 'lucide-react'

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
  const [txTab, setTxTab] = useState<'draft' | 'processed'>('draft')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Inline cell edit
  const [cellDropdown, setCellDropdown] = useState<CellDropdown | null>(null)
  const [cellSearch, setCellSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Linking
  const [linkingTx, setLinkingTx] = useState<Transaction | null>(null)
  const [linkCandidates, setLinkCandidates] = useState<Transaction[]>([])
  const linkRef = useRef<HTMLDivElement>(null)

  // AI match popup
  const [aiMatches, setAiMatches] = useState<Record<string, string>>({})
  const [matchPopup, setMatchPopup] = useState<{ txId: string; matchId: string; fromAmount: number; toAmount: number } | null>(null)
  const [matchPopupSearch, setMatchPopupSearch] = useState('')
  const [matchPickerOpen, setMatchPickerOpen] = useState(false)
  const matchPopupRef = useRef<HTMLDivElement>(null)

  // Transaction detail popup
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [detailEdits, setDetailEdits] = useState<{ description?: string; vendor?: string; category?: string; notes?: string; type?: TransactionType; date?: string }>({})
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailLinkOpen, setDetailLinkOpen] = useState(false)
  const [detailLinkAccount, setDetailLinkAccount] = useState('')
  const [detailLinkSearch, setDetailLinkSearch] = useState('')

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadAccount, setUploadAccount] = useState('')
  const [uploadCurrency, setUploadCurrency] = useState('EUR')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
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


  async function findAutoMatches(txList: Transaction[]): Promise<Record<string, string>> {
    const unlinked = txList.filter(t => !t.transfer_group_id)
    const matched = new Set<string>()
    const result: Record<string, string> = {}

    // Collect unique currency pairs we need exchange rates for
    const rateCache: Record<string, number> = {} // "date|from|to" → rate
    const toFetch = new Set<string>()
    for (const tx of unlinked) {
      const txDate = tx.date.slice(0, 10)
      for (const c of unlinked) {
        if (c.id === tx.id || c.account_id === tx.account_id) continue
        if (c.date.slice(0, 10) !== txDate) continue
        if (tx.currency !== c.currency) {
          toFetch.add(`${txDate}|${tx.currency.toLowerCase()}|${c.currency.toLowerCase()}`)
        }
      }
    }

    // Fetch all needed rates in parallel
    await Promise.all(Array.from(toFetch).map(async key => {
      const [date, from, to] = key.split('|')
      try {
        const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${from}.json`)
        if (res.ok) {
          const data = await res.json()
          const rate = data[from]?.[to]
          if (rate) rateCache[key] = rate
        }
      } catch { /* ignore network errors */ }
    }))

    for (const tx of unlinked) {
      if (matched.has(tx.id)) continue
      const txDate = tx.date.slice(0, 10)

      const scored = unlinked
        .filter(t =>
          t.id !== tx.id &&
          !matched.has(t.id) &&
          t.account_id !== tx.account_id &&
          t.date.slice(0, 10) === txDate && // same day
          // must be opposite types: one income, one expense
          ((tx.type === 'expense' && t.type === 'income') || (tx.type === 'income' && t.type === 'expense'))
        )
        .map(t => {
          let diff: number
          if (tx.currency === t.currency) {
            diff = Math.abs(t.amount - tx.amount) / Math.max(tx.amount, 0.01)
          } else {
            const fwd = `${txDate}|${tx.currency.toLowerCase()}|${t.currency.toLowerCase()}`
            const rev = `${txDate}|${t.currency.toLowerCase()}|${tx.currency.toLowerCase()}`
            const rate = rateCache[fwd] ?? (rateCache[rev] ? 1 / rateCache[rev] : null)
            if (rate === null) return { t, diff: Infinity }
            const converted = tx.amount * rate
            diff = Math.abs(t.amount - converted) / Math.max(Math.max(t.amount, converted), 0.01)
          }
          return { t, diff }
        })
        .filter(s => s.diff < 0.15)
        .sort((a, b) => a.diff - b.diff)

      if (scored.length === 0) continue
      const best = scored[0].t
      result[tx.id] = best.id
      result[best.id] = tx.id
      matched.add(tx.id)
      matched.add(best.id)
    }
    return result
  }

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
      if (matchPopupRef.current && !matchPopupRef.current.contains(e.target as Node)) { setMatchPopup(null); setMatchPickerOpen(false) }
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
    const tx = transactions.find(t => t.id === txId)

    // When category changes, update the vendor record so future imports learn from it
    if (field === 'category' && value && tx?.vendor) {
      const existingVendor = vendors.find(v => v.name === tx.vendor)
      if (existingVendor && existingVendor.category !== value) {
        await fetch('/api/vendors', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existingVendor.id, category: value }),
        })
        setVendors(vs => vs.map(v => v.id === existingVendor.id ? { ...v, category: value } : v))
      }
    }

    if (field === 'vendor' && value) {
      const existingVendor = vendors.find(v => v.name === value)
      if (existingVendor?.category) {
        update.category = existingVendor.category
      } else if (!existingVendor) {
        // Auto-save new vendor with whatever category the transaction has (current or just-set)
        const category = tx?.category ?? null
        if (category) {
          const res = await fetch('/api/vendors', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: value, category }),
          })
          if (res.ok) {
            const d = await res.json()
            setVendors(vs => [...vs, d.vendor])
          }
        }
        // Apply vendor+category to other transactions whose description contains the vendor name
        const vendorLower = value.toLowerCase()
        const category2 = update.category ?? tx?.category ?? null
        const matches = transactions.filter(t =>
          t.id !== txId &&
          !t.vendor &&
          t.description.toLowerCase().includes(vendorLower)
        )
        if (matches.length > 0) {
          const batchUpdate: Record<string, string | null> = { vendor: value }
          if (category2) batchUpdate.category = category2
          await Promise.all(matches.map(t =>
            fetch('/api/transactions', {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: t.id, ...batchUpdate }),
            })
          ))
          setTransactions(txs => txs.map(t =>
            matches.some(m => m.id === t.id) ? { ...t, ...batchUpdate } : t
          ))
        }
      }
    }

    await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: txId, ...update }),
    })
    setTransactions(txs => txs.map(t => t.id === txId ? { ...t, ...update } : t))
    setCellDropdown(null)
  }, [vendors, transactions])

  function openDetail(tx: Transaction) {
    setDetailTx(tx)
    setDetailEdits({})
    setDetailLinkOpen(false)
    setDetailLinkAccount('')
    setDetailLinkSearch('')
  }

  async function saveDetail() {
    if (!detailTx || Object.keys(detailEdits).length === 0) { setDetailTx(null); return }
    setSavingDetail(true)

    // If category changed and transaction has a vendor, update the vendor record
    const newCategory = detailEdits.category
    const vendorName = detailEdits.vendor ?? detailTx.vendor
    if (newCategory && vendorName) {
      const existingVendor = vendors.find(v => v.name === vendorName)
      if (existingVendor && existingVendor.category !== newCategory) {
        await fetch('/api/vendors', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existingVendor.id, category: newCategory }),
        })
        setVendors(vs => vs.map(v => v.id === existingVendor.id ? { ...v, category: newCategory } : v))
      }
    }

    await fetch('/api/transactions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: detailTx.id, ...detailEdits }),
    })
    setTransactions(txs => txs.map(t => t.id === detailTx.id ? { ...t, ...detailEdits } : t))
    setSavingDetail(false)
    setDetailTx(null)
  }

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

  async function linkFromDetail(targetId: string) {
    if (!detailTx) return
    const res = await fetch('/api/transactions/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_a: detailTx.id, id_b: targetId }),
    })
    if (res.ok) {
      const { transfer_group_id } = await res.json()
      setTransactions(txs => txs.map(t =>
        t.id === detailTx.id || t.id === targetId ? { ...t, transfer_group_id } : t
      ))
      setDetailTx(tx => tx ? { ...tx, transfer_group_id } : null)
      setAiMatches(m => {
        const next = { ...m }
        const matchId = m[detailTx.id]
        delete next[detailTx.id]
        if (matchId) delete next[matchId]
        return next
      })
      setDetailLinkOpen(false)
    }
  }

  async function processTransaction(tx: Transaction) {
    const res = await fetch('/api/transactions/process', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tx.id }),
    })
    if (res.ok) {
      setTransactions(txs => txs.map(t => t.id === tx.id ? { ...t, status: 'processed' } : t))
      const accRes = await fetch('/api/accounts')
      if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []) }
    }
  }

  async function revertTransaction(tx: Transaction) {
    const res = await fetch('/api/transactions/process', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tx.id, revert: true }),
    })
    if (res.ok) {
      setTransactions(txs => txs.map(t => t.id === tx.id ? { ...t, status: 'draft' } : t))
      setTxTab('draft')
      const accRes = await fetch('/api/accounts')
      if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []) }
    }
  }

  async function deleteTransaction(tx: Transaction) {
    const res = await fetch(`/api/transactions?id=${tx.id}`, { method: 'DELETE' })
    if (res.ok) {
      setTransactions(txs => txs.filter(t => t.id !== tx.id))
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(id => fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })))
    setTransactions(txs => txs.filter(t => !selectedIds.has(t.id)))
    setSelectedIds(new Set())
  }

  async function bulkRevert() {
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(id =>
      fetch('/api/transactions/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, revert: true }),
      })
    ))
    setTransactions(txs => txs.map(t => selectedIds.has(t.id) ? { ...t, status: 'draft' } : t))
    setSelectedIds(new Set())
    setTxTab('draft')
    const accRes = await fetch('/api/accounts')
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []) }
  }

  function openMatchPopup(tx: Transaction) {
    const matchId = aiMatches[tx.id]
    if (!matchId) return
    const matchTx = transactions.find(t => t.id === matchId)
    if (!matchTx) return
    setMatchPopup({ txId: tx.id, matchId, fromAmount: tx.amount, toAmount: matchTx.amount })
    setMatchPopupSearch('')
    setMatchPickerOpen(false)
  }

  async function confirmMatch() {
    if (!matchPopup) return
    const tx = transactions.find(t => t.id === matchPopup.txId)
    const matchTx = transactions.find(t => t.id === matchPopup.matchId)
    if (!tx || !matchTx) return

    const updates: Promise<void>[] = []
    if (matchPopup.fromAmount !== tx.amount) {
      updates.push(fetch('/api/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: tx.id, amount: matchPopup.fromAmount }) }).then(() => {}))
    }
    if (matchPopup.toAmount !== matchTx.amount) {
      updates.push(fetch('/api/transactions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: matchTx.id, amount: matchPopup.toAmount }) }).then(() => {}))
    }
    await Promise.all(updates)

    const res = await fetch('/api/transactions/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_a: matchPopup.txId, id_b: matchPopup.matchId }),
    })
    if (res.ok) {
      const { transfer_group_id } = await res.json()
      setTransactions(txs => txs.map(t => {
        if (t.id === matchPopup.txId) return { ...t, transfer_group_id, amount: matchPopup.fromAmount }
        if (t.id === matchPopup.matchId) return { ...t, transfer_group_id, amount: matchPopup.toAmount }
        return t
      }))
      setAiMatches(m => { const next = { ...m }; delete next[matchPopup.txId]; delete next[matchPopup.matchId]; return next })
      setMatchPopup(null)
    }
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
    setUploading(true); setUploadResult(null); setUploadError(null); setUploadProgress(0)

    // Simulate progress: crawl to 85% while waiting for the API
    const isPdf = uploadFile.name.toLowerCase().endsWith('.pdf')
    const interval = setInterval(() => {
      setUploadProgress(p => {
        const ceiling = isPdf ? 82 : 70
        if (p >= ceiling) return p
        const step = p < 30 ? 4 : p < 60 ? 2 : 0.5
        return Math.min(p + step, ceiling)
      })
    }, isPdf ? 400 : 200)

    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('account_id', uploadAccount)
    formData.append('currency', uploadCurrency)
    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()

    clearInterval(interval)
    setUploadProgress(100)

    if (res.ok) { setUploadResult(data); await loadData() }
    else setUploadError(data.error || 'Er is een fout opgetreden.')

    setTimeout(() => { setUploading(false); setUploadProgress(0) }, 600)
  }

  async function categorizeAll() {
    setCategorizing(true)
    const ids = transactions.filter(t => !t.category).map(t => t.id)
    if (ids.length > 0) {
      await fetch('/api/categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_ids: ids }) })
    }
    // Reload all data fresh, then compute matches on the new transaction list
    const [accRes, txRes, vendorRes, catRes] = await Promise.all([
      fetch('/api/accounts'),
      fetch('/api/transactions?limit=500'),
      fetch('/api/vendors'),
      fetch('/api/categories'),
    ])
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []) }
    if (txRes.ok) {
      const d = await txRes.json()
      const freshTxs: Transaction[] = d.transactions || []
      setTransactions(freshTxs)
      setUncategorizedCount(freshTxs.filter(t => !t.category).length)
      setAiMatches(await findAutoMatches(freshTxs))
    }
    if (vendorRes.ok) { const d = await vendorRes.json(); setVendors(d.vendors || []) }
    if (catRes.ok) { const d = await catRes.json(); setCategories(d.categories || []) }
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

  const advanceCategoryNames = new Set(categories.filter(c => c.type === 'advance').map(c => c.name))
  const spendingByCategory = transactions.filter(t => t.type === 'expense' && t.category && !advanceCategoryNames.has(t.category))
    .reduce((acc, t) => { acc[t.category!] = (acc[t.category!] || 0) + t.amount; return acc }, {} as Record<string, number>)
  const topCategories = Object.entries(spendingByCategory).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const totalExpenses = transactions.filter(t => t.type === 'expense' && !advanceCategoryNames.has(t.category ?? '')).reduce((s, t) => s + t.amount, 0)

  const draftCount = transactions.filter(t => t.status === 'draft').length

  const filtered = transactions.filter(t => {
    if ((t.status || 'processed') !== txTab) return false
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
              {/* Draft / Processed sub-tabs */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                <button
                  onClick={() => { setTxTab('draft'); setSelectedIds(new Set()) }}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    txTab === 'draft' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
                >
                  New (draft)
                  {draftCount > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">{draftCount}</span>
                  )}
                </button>
                <button
                  onClick={() => { setTxTab('processed'); setSelectedIds(new Set()) }}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    txTab === 'processed' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
                >
                  Processed
                </button>
              </div>

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
              <div className="flex items-center justify-between min-h-[28px]">
                <p className="text-xs text-slate-400">{filtered.length} transacties</p>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-medium">
                    <span className="text-slate-300">{selectedIds.size} geselecteerd</span>
                    <span className="text-slate-600">·</span>
                    {txTab === 'draft' ? (
                      <button onClick={bulkDelete} className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 size={11} />Verwijderen
                      </button>
                    ) : (
                      <button onClick={bulkRevert} className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors">
                        <RotateCcw size={11} />Terugzetten naar draft
                      </button>
                    )}
                    <span className="text-slate-600">·</span>
                    <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>

              {filtered.length === 0
                ? <p className="text-sm text-slate-400 italic text-center py-12">Geen transacties gevonden.</p>
                : (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" ref={linkRef}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="w-10 px-3 py-3">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-500 cursor-pointer"
                              checked={filtered.length > 0 && filtered.slice(0, 200).every(t => selectedIds.has(t.id))}
                              onChange={e => {
                                const ids = filtered.slice(0, 200).map(t => t.id)
                                setSelectedIds(e.target.checked ? new Set(ids) : new Set())
                              }}
                            />
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Datum</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36 hidden md:table-cell">Leverancier</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Omschrijving</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Categorie</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell w-32">Koppeling</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bedrag</th>
                          <th className="w-24" />
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
                              <tr key={tx.id} className={cn('border-b border-slate-50 transition-colors', isLinking ? 'bg-indigo-50' : selectedIds.has(tx.id) ? 'bg-indigo-50/60' : 'hover:bg-slate-50')}>
                                <td className="w-10 px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-indigo-500 cursor-pointer"
                                    checked={selectedIds.has(tx.id)}
                                    onChange={e => setSelectedIds(prev => {
                                      const next = new Set(prev)
                                      if (e.target.checked) { next.add(tx.id) } else { next.delete(tx.id) }
                                      return next
                                    })}
                                  />
                                </td>
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

                                <td className="px-4 py-2.5 max-w-xs">
                                  <button onClick={() => openDetail(tx)} className="text-xs text-slate-700 truncate max-w-full block text-left hover:text-indigo-600 transition-colors" title={tx.description}>
                                    {tx.description}
                                  </button>
                                </td>

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
                                  {linkedTx ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 truncate max-w-[100px]">
                                        <Link2 size={10} className="shrink-0" />
                                        {accountMap[linkedTx.account_id]?.name ?? '—'}
                                      </span>
                                      <button onClick={() => unlinkTransaction(tx)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0"><Unlink size={12} /></button>
                                    </div>
                                  ) : aiMatches[tx.id] ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => openMatchPopup(tx)}
                                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100">
                                        <Sparkles size={10} />Found match
                                      </button>
                                      <button
                                        onClick={() => setAiMatches(m => { const next = { ...m }; const mid = m[tx.id]; delete next[tx.id]; if (mid) delete next[mid]; return next })}
                                        className="text-slate-300 hover:text-slate-500 transition-colors" title="Verwijderen">
                                        <X size={11} />
                                      </button>
                                    </div>
                                  ) : tx.type === 'transfer' ? (
                                    <button onClick={() => openLinkPanel(tx)}
                                      className={cn('flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors',
                                        isLinking ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600')}>
                                      <Link2 size={10} />Koppelen
                                    </button>
                                  ) : null}
                                </td>

                                <td className={cn('px-4 py-2.5 text-right font-semibold whitespace-nowrap text-sm',
                                  tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-red-500' : 'text-slate-500')}>
                                  {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                                  {formatCurrency(tx.amount, tx.currency)}
                                </td>
                                <td className="px-2 py-2.5">
                                  <div className="flex items-center gap-1 justify-end">
                                    {txTab === 'draft' ? (
                                      <>
                                        <button
                                          onClick={() => processTransaction(tx)}
                                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors whitespace-nowrap"
                                        >
                                          <Plus size={11} />Add
                                        </button>
                                        <button
                                          onClick={() => deleteTransaction(tx)}
                                          className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Verwijderen"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => revertTransaction(tx)}
                                        className="flex items-center gap-1 text-xs px-2 py-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                                        title="Terugzetten naar draft"
                                      >
                                        <RotateCcw size={11} />Terugzetten
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Link panel */}
                              {isLinking && (
                                <tr key={`${tx.id}-link`} className="bg-indigo-50 border-b border-indigo-100">
                                  <td colSpan={8} className="px-4 py-3">
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

              {/* Match popup */}
              {matchPopup && (() => {
                const tx = transactions.find(t => t.id === matchPopup.txId)
                const matchTx = transactions.find(t => t.id === matchPopup.matchId)
                if (!tx || !matchTx) return null
                const pickerOptions = transactions.filter(t =>
                  t.id !== matchPopup.txId &&
                  (!matchPopupSearch || t.description.toLowerCase().includes(matchPopupSearch.toLowerCase()) ||
                    (accountMap[t.account_id]?.name ?? '').toLowerCase().includes(matchPopupSearch.toLowerCase()) ||
                    formatCurrency(t.amount, t.currency).includes(matchPopupSearch))
                )
                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div ref={matchPopupRef} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Sparkles size={15} className="text-amber-500" />
                          <span className="font-semibold text-slate-900 text-sm">Gevonden koppeling</span>
                        </div>
                        <button onClick={() => setMatchPopup(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                          <X size={16} />
                        </button>
                      </div>

                      <div className="p-5 space-y-3">
                        {/* Source transaction */}
                        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{accountMap[tx.account_id]?.name ?? '—'}</p>
                              <p className="text-sm text-slate-800 font-medium mt-0.5 truncate max-w-[240px]">{tx.description}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{formatDate(tx.date)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-400 mb-1">Bedrag</p>
                              <input
                                type="number"
                                value={matchPopup.fromAmount}
                                onChange={e => setMatchPopup(p => p ? { ...p, fromAmount: parseFloat(e.target.value) || 0 } : null)}
                                className="w-28 text-right px-2 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                              />
                              <p className="text-xs text-slate-400 mt-0.5">{tx.currency}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-center text-slate-300">
                          <Link2 size={14} />
                        </div>

                        {/* Matched transaction */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{accountMap[matchTx.account_id]?.name ?? '—'}</p>
                                <button
                                  onClick={() => { setMatchPickerOpen(o => !o); setMatchPopupSearch('') }}
                                  className="flex items-center gap-0.5 text-xs text-amber-600 hover:text-amber-800 transition-colors font-medium"
                                >
                                  <ChevronRight size={12} />wijzigen
                                </button>
                              </div>
                              <p className="text-sm text-slate-800 font-medium mt-0.5 truncate max-w-[200px]">{matchTx.description}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{formatDate(matchTx.date)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-400 mb-1">Bedrag</p>
                              <input
                                type="number"
                                value={matchPopup.toAmount}
                                onChange={e => setMatchPopup(p => p ? { ...p, toAmount: parseFloat(e.target.value) || 0 } : null)}
                                className="w-28 text-right px-2 py-1.5 text-sm font-semibold border border-amber-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                              />
                              <p className="text-xs text-slate-400 mt-0.5">{matchTx.currency}</p>
                            </div>
                          </div>

                          {/* Transaction picker dropdown */}
                          {matchPickerOpen && (
                            <div className="mt-2 border border-amber-200 rounded-xl overflow-hidden bg-white">
                              <div className="p-2 border-b border-slate-100">
                                <div className="relative">
                                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Transactie zoeken…"
                                    value={matchPopupSearch}
                                    onChange={e => setMatchPopupSearch(e.target.value)}
                                    className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                                  />
                                </div>
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {pickerOptions.length === 0
                                  ? <p className="text-xs text-slate-400 italic px-3 py-3">Geen transacties gevonden.</p>
                                  : pickerOptions.slice(0, 50).map(t => (
                                    <button
                                      key={t.id}
                                      onClick={() => {
                                        setMatchPopup(p => p ? { ...p, matchId: t.id, toAmount: t.amount } : null)
                                        setMatchPickerOpen(false)
                                      }}
                                      className={cn(
                                        'w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-indigo-50 transition-colors text-left border-b border-slate-50 last:border-0',
                                        t.id === matchPopup.matchId && 'bg-amber-50'
                                      )}
                                    >
                                      <div className="min-w-0">
                                        <span className="font-medium text-slate-700 block truncate max-w-[200px]">{t.description}</span>
                                        <span className="text-slate-400">{formatDate(t.date)} · {accountMap[t.account_id]?.name ?? '—'}</span>
                                      </div>
                                      <span className={cn('font-semibold ml-2 shrink-0', t.type === 'income' ? 'text-emerald-600' : 'text-red-500')}>
                                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount, t.currency)}
                                      </span>
                                    </button>
                                  ))
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                        <button onClick={() => setMatchPopup(null)}
                          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
                          Annuleren
                        </button>
                        <button onClick={confirmMatch}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors">
                          <Link2 size={14} />Koppelen
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}

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
                <p className="text-sm text-slate-500">Ondersteunde banken: Rabobank, Wise, Revolut (CSV) en OCBC Indonesia (PDF of CSV).</p>
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
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Bestand (CSV of PDF) <span className="text-red-400">*</span></label>
                  <input type="file" accept=".csv,.txt,.pdf" onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>
                <button onClick={handleUpload} disabled={!uploadFile || !uploadAccount || uploading}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                  <Upload size={15} />
                  {uploading ? 'Uploaden…' : 'Importeren'}
                </button>
                {uploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{uploadProgress < 100 ? (uploadFile?.name.toLowerCase().endsWith('.pdf') ? 'PDF verwerken via AI…' : 'Bestand verwerken…') : 'Klaar!'}</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
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
                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
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
                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
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

      {/* ── TRANSACTION DETAIL MODAL ── */}
      {detailTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailTx(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-400 mb-1">{formatDate(detailEdits.date ?? detailTx.date)} · {accountMap[detailTx.account_id]?.name ?? '—'} · {detailTx.currency}</p>
                <p className={cn('text-2xl font-bold', detailTx.type === 'income' ? 'text-emerald-600' : 'text-red-500')}>
                  {detailTx.type === 'income' ? '+' : '-'}{formatCurrency(detailTx.amount, detailTx.currency)}
                </p>
              </div>
              <button onClick={() => setDetailTx(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Fields */}
            <div className="p-6 space-y-4">
              {/* Bankbeschrijving (readonly) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Bankbeschrijving</label>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 break-words">{detailTx.original_description || detailTx.description}</p>
              </div>

              {/* Omschrijving (editable) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Omschrijving</label>
                <input
                  type="text"
                  value={detailEdits.description ?? detailTx.description}
                  onChange={e => setDetailEdits(d => ({ ...d, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Datum */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Datum</label>
                  <input
                    type="date"
                    value={detailEdits.date ?? detailTx.date}
                    onChange={e => setDetailEdits(d => ({ ...d, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                  />
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Type</label>
                  <select
                    value={detailEdits.type ?? detailTx.type}
                    onChange={e => setDetailEdits(d => ({ ...d, type: e.target.value as TransactionType }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="expense">Uitgave</option>
                    <option value="income">Inkomsten</option>
                    <option value="transfer">Overboeking</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Leverancier */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Leverancier</label>
                  <input
                    type="text"
                    list="detail-vendors"
                    value={detailEdits.vendor ?? detailTx.vendor ?? ''}
                    onChange={e => setDetailEdits(d => ({ ...d, vendor: e.target.value }))}
                    placeholder="—"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                  />
                  <datalist id="detail-vendors">{vendorNames.map(v => <option key={v} value={v} />)}</datalist>
                </div>

                {/* Categorie */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Categorie</label>
                  <select
                    value={detailEdits.category ?? detailTx.category ?? ''}
                    onChange={e => setDetailEdits(d => ({ ...d, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="">— geen —</option>
                    {categoryNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Notities */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Notities</label>
                <textarea
                  rows={3}
                  value={detailEdits.notes ?? detailTx.notes ?? ''}
                  onChange={e => setDetailEdits(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Voeg een notitie toe…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 resize-none"
                />
              </div>

              {/* Koppeling */}
              {(() => {
                const linked = detailTx.transfer_group_id
                  ? transactions.find(t => t.id !== detailTx.id && t.transfer_group_id === detailTx.transfer_group_id)
                  : null
                const aiMatchId = aiMatches[detailTx.id]
                const aiMatchTx = aiMatchId ? transactions.find(t => t.id === aiMatchId) : null
                return (
                  <div className="space-y-2 pt-1">
                    <label className="text-xs font-medium text-slate-600">Koppeling</label>
                    {linked ? (
                      <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Link2 size={13} className="text-indigo-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-indigo-700 truncate">{linked.description}</p>
                            <p className="text-xs text-indigo-400">{accountMap[linked.account_id]?.name ?? '—'} · {formatDate(linked.date)} · {linked.type === 'income' ? '+' : '-'}{formatCurrency(linked.amount, linked.currency)}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { unlinkTransaction(detailTx); setDetailTx(tx => tx ? { ...tx, transfer_group_id: undefined } : null) }}
                          className="text-slate-300 hover:text-red-400 transition-colors shrink-0 ml-2" title="Ontkoppelen">
                          <Unlink size={13} />
                        </button>
                      </div>
                    ) : aiMatchTx ? (
                      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles size={13} className="text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-amber-700 truncate">{aiMatchTx.description}</p>
                            <p className="text-xs text-amber-500">{accountMap[aiMatchTx.account_id]?.name ?? '—'} · {formatDate(aiMatchTx.date)} · {aiMatchTx.type === 'income' ? '+' : '-'}{formatCurrency(aiMatchTx.amount, aiMatchTx.currency)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <button onClick={() => linkFromDetail(aiMatchTx.id)}
                            className="text-xs font-medium px-2 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors">
                            Koppelen
                          </button>
                          <button
                            onClick={() => setAiMatches(m => { const next = { ...m }; delete next[detailTx.id]; if (aiMatchId) delete next[aiMatchId]; return next })}
                            className="text-slate-300 hover:text-slate-500 transition-colors" title="Verwijderen">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Geen koppeling</p>
                    )}

                    {!linked && (
                      <button onClick={() => setDetailLinkOpen(o => !o)}
                        className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 transition-colors font-medium">
                        <Link2 size={11} />
                        {detailLinkOpen ? 'Zoeker sluiten' : 'Handmatig koppelen…'}
                      </button>
                    )}

                    {detailLinkOpen && !linked && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="flex gap-2 p-2 border-b border-slate-100">
                          <select value={detailLinkAccount} onChange={e => setDetailLinkAccount(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white shrink-0">
                            <option value="">Alle rekeningen</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <div className="relative flex-1">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Transactie zoeken…"
                              value={detailLinkSearch}
                              onChange={e => setDetailLinkSearch(e.target.value)}
                              className="w-full pl-6 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {(() => {
                            const opts = transactions.filter(t =>
                              t.id !== detailTx.id &&
                              (!detailLinkAccount || t.account_id === detailLinkAccount) &&
                              (!detailLinkSearch ||
                                t.description.toLowerCase().includes(detailLinkSearch.toLowerCase()) ||
                                (accountMap[t.account_id]?.name ?? '').toLowerCase().includes(detailLinkSearch.toLowerCase()) ||
                                formatCurrency(t.amount, t.currency).includes(detailLinkSearch))
                            )
                            return opts.length === 0
                              ? <p className="text-xs text-slate-400 italic px-3 py-3">Geen transacties gevonden.</p>
                              : opts.slice(0, 50).map(t => (
                                <button key={t.id} onClick={() => linkFromDetail(t.id)}
                                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-indigo-50 transition-colors text-left border-b border-slate-50 last:border-0">
                                  <div className="min-w-0">
                                    <span className="font-medium text-slate-700 block truncate max-w-[220px]">{t.description}</span>
                                    <span className="text-slate-400">{formatDate(t.date)} · {accountMap[t.account_id]?.name ?? '—'}</span>
                                  </div>
                                  <span className={cn('font-semibold ml-2 shrink-0', t.type === 'income' ? 'text-emerald-600' : 'text-red-500')}>
                                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount, t.currency)}
                                  </span>
                                </button>
                              ))
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setDetailTx(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
                Annuleren
              </button>
              <button
                onClick={saveDetail}
                disabled={savingDetail || Object.keys(detailEdits).length === 0}
                className="px-5 py-2 text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                {savingDetail ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
