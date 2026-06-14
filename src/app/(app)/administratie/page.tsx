'use client'

import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Account, AccountBalance, OpeningBalance, Transaction, TransactionType, Vendor, AdminCategory, Loan } from '@/types'
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

type Tab = 'overzicht' | 'transacties' | 'uploaden' | 'overboeking' | 'rapport'
type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'vendor_asc' | 'vendor_desc' | 'description_asc' | 'description_desc' | 'category_asc' | 'category_desc' | 'type_asc' | 'type_desc' | 'bank_asc' | 'bank_desc'
type ReportSort = 'category_asc' | 'category_desc' | 'income_desc' | 'income_asc' | 'expense_desc' | 'expense_asc'

interface CellDropdown {
  txId: string
  field: 'vendor' | 'category'
  top?: number
  bottom?: number
  left: number
}

export default function AdministratiePage() {
  return <Suspense fallback={<div className="text-sm text-slate-400 py-16 text-center">Laden…</div>}><AdministratieInner /></Suspense>
}

function AdministratieInner() {
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') || 'overzicht') as Tab
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [categorizing, setCategorizing] = useState(false)
  const [simplifying, setSimplifying] = useState(false)
  const [uncategorizedCount, setUncategorizedCount] = useState(0)

  // Transaction filters
  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [visibleCount, setVisibleCount] = useState(200)
  const [txTab, setTxTab] = useState<'draft' | 'processed'>('draft')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const aiPromptDismissed = useRef(false)

  // Inline cell edit
  const [cellDropdown, setCellDropdown] = useState<CellDropdown | null>(null)
  const [cellSearch, setCellSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Linking
  const [linkingTx, setLinkingTx] = useState<Transaction | null>(null)
  const [linkCandidates, setLinkCandidates] = useState<Transaction[]>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const linkRef = useRef<HTMLDivElement>(null)

  // Drag-to-link
  const [draggingTxId, setDraggingTxId] = useState<string | null>(null)
  const [dragOverTxId, setDragOverTxId] = useState<string | null>(null)

  // AI match popup
  const [aiMatches, setAiMatches] = useState<Record<string, string>>({})
  const [matchPopup, setMatchPopup] = useState<{ txId: string; matchId: string; fromAmount: number; toAmount: number } | null>(null)
  const [matchPopupSearch, setMatchPopupSearch] = useState('')
  const [matchPickerOpen, setMatchPickerOpen] = useState(false)
  const matchPopupRef = useRef<HTMLDivElement>(null)

  // Transaction detail popup
  const [detailTx, setDetailTx] = useState<Transaction | null>(null)
  const [detailEdits, setDetailEdits] = useState<{ description?: string; vendor?: string; category?: string; notes?: string; type?: TransactionType; date?: string; loan_id?: string | null }>({})
  const [savingDetail, setSavingDetail] = useState(false)
  const [detailLinkOpen, setDetailLinkOpen] = useState(false)
  const [detailLinkAccount, setDetailLinkAccount] = useState('')
  const [detailLinkSearch, setDetailLinkSearch] = useState('')
  const [detailVendorOpen, setDetailVendorOpen] = useState(false)
  const [detailVendorSearch, setDetailVendorSearch] = useState('')
  const [detailCategoryOpen, setDetailCategoryOpen] = useState(false)
  const [detailCategorySearch, setDetailCategorySearch] = useState('')

  // Upload
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadFileAccounts, setUploadFileAccounts] = useState<Record<number, string>>({})
  const [uploadFileDetected, setUploadFileDetected] = useState<Record<number, string>>({})
  const [detecting, setDetecting] = useState(false)
  const [uploadAccount, setUploadAccount] = useState('')
  const [uploadCurrency, setUploadCurrency] = useState('EUR')
  const [uploadCurrencyOverride, setUploadCurrencyOverride] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadCurrentFile, setUploadCurrentFile] = useState(0)
  type SkippedDetail = { date: string; description: string; amount: number; currency: string; account_id: string }
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number; skippedDetails?: SkippedDetail[]; routed?: Record<string, string> } | null>(null)
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

  // Report
  const [reportFrom, setReportFrom] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [reportCurrency, setReportCurrency] = useState('EUR')
  const [reportSort] = useState<ReportSort>('expense_desc')
  const [reportCompare, setReportCompare] = useState(false)
  const [expandedBankIds, setExpandedBankIds] = useState<Set<string>>(new Set())
  const [accountTxPanel, setAccountTxPanel] = useState<string | null>(null)
  const [categoryTxPanel, setCategoryTxPanel] = useState<string | null>(null)
  const [categoryTxSearch, setCategoryTxSearch] = useState('')
  const [categoryTxFrom, setCategoryTxFrom] = useState('')
  const [categoryTxTo, setCategoryTxTo] = useState('')
  const [reportCmpFrom, setReportCmpFrom] = useState('')
  const [reportCmpTo, setReportCmpTo] = useState('')


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
    const [accRes, txRes, vendorRes, catRes, loanRes] = await Promise.all([
      fetch('/api/accounts'),
      fetch('/api/transactions?limit=500'),
      fetch('/api/vendors'),
      fetch('/api/categories'),
      fetch('/api/loans'),
    ])
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []); setOpeningBalances(d.opening_balances || []) }
    if (txRes.ok) {
      const d = await txRes.json()
      setTransactions(d.transactions || [])
      setUncategorizedCount((d.transactions || []).filter((t: Transaction) => !t.category).length)
    }
    if (vendorRes.ok) { const d = await vendorRes.json(); setVendors(d.vendors || []) }
    if (catRes.ok) { const d = await catRes.json(); setCategories(d.categories || []) }
    if (loanRes.ok) { const d = await loanRes.json(); setLoans(d.loans || []) }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (tab === 'transacties' && uncategorizedCount > 0 && !aiPromptDismissed.current) {
      setShowAiPrompt(true)
    }
    if (tab === 'rapport') {
      const now = new Date()
      setReportFrom(`${now.getFullYear()}-01-01`)
      setReportTo(now.toISOString().slice(0, 10))
      loadData()
    }
  }, [tab, uncategorizedCount])

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
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = 260 // max-h-52 + search bar
    const openUp = spaceBelow < dropdownHeight
    setCellDropdown({
      txId: tx.id, field, left: rect.left,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
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
    setDetailVendorOpen(false)
    setDetailVendorSearch('')
    setDetailCategoryOpen(false)
    setDetailCategorySearch('')
  }

  async function saveDetail() {
    if (!detailTx || Object.keys(detailEdits).length === 0) { setDetailTx(null); return }
    setSavingDetail(true)

    const newCategory = detailEdits.category
    const vendorName = detailEdits.vendor ?? detailTx.vendor
    if (vendorName) {
      const existingVendor = vendors.find(v => v.name === vendorName)
      if (existingVendor) {
        // Update category on existing vendor if it changed
        if (newCategory && existingVendor.category !== newCategory) {
          await fetch('/api/vendors', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existingVendor.id, category: newCategory }),
          })
          setVendors(vs => vs.map(v => v.id === existingVendor.id ? { ...v, category: newCategory } : v))
        }
      } else if (detailEdits.vendor) {
        // New vendor typed in detail modal — persist to vendor list
        const category = newCategory || detailTx.category || ''
        const res = await fetch('/api/vendors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: vendorName, category }),
        })
        if (res.ok) { const d = await res.json(); setVendors(vs => [...vs, d.vendor]) }
      }
    }

    const patchRes = await fetch('/api/transactions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: detailTx.id, ...detailEdits }),
    })
    const patchData = await patchRes.json()
    if (!patchRes.ok) {
      setSavingDetail(false)
      alert(`Opslaan mislukt: ${patchData.error ?? patchRes.status}`)
      return
    }
    // Use the server-returned transaction to ensure local state matches DB
    const saved: Transaction = patchData.transaction
    setTransactions(txs => txs.map(t => t.id === saved.id ? saved : t))
    setSavingDetail(false)
    setDetailTx(null)
  }

  const vendorNames = vendors.map(v => v.name)

  // Grouped categories: top-level parents with their subcategories
  const parentCategories = categories.filter(c => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name))
  const subCategories = (parentId: string) => categories.filter(c => c.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name))
  // Flat list for the inline cell dropdown (includes all, subcategories shown as "Parent > Sub")
  const allCategoryOptions = parentCategories.flatMap(p => [
    p.name,
    ...subCategories(p.id).map(s => s.name),
  ])

  const TYPE_LABELS: Record<string, string> = {
    expense: 'uitgaven', income: 'inkomen', investment: 'investering', advance: 'voorschot', transfer: 'overboeking', terugboeking: 'terugboeking',
  }
  function catTypeLabel(name: string) {
    const cat = categories.find(c => c.name === name)
    if (!cat) return null
    // For subcategories, use parent's type
    const type = cat.parent_id ? (categories.find(p => p.id === cat.parent_id)?.type ?? cat.type) : cat.type
    return TYPE_LABELS[type] ?? null
  }

  const dropdownOptions: string[] = cellDropdown?.field === 'vendor' ? vendorNames : allCategoryOptions
  const filteredDropdownOptions = dropdownOptions.filter(o =>
    !cellSearch || o.toLowerCase().includes(cellSearch.toLowerCase())
  )

  // ── Linking ─────────────────────────────────────────────────────────────────
  async function openLinkPanel(tx: Transaction) {
    if (linkingTx?.id === tx.id) { setLinkingTx(null); return }
    setLinkingTx(tx)
    setLinkCandidates([])
    setLinkLoading(true)

    const txDate = new Date(tx.date).getTime()
    const txDateStr = tx.date.slice(0, 10)

    const pool = transactions.filter(t =>
      t.id !== tx.id &&
      !t.transfer_group_id &&
      t.account_id !== tx.account_id &&
      Math.abs(new Date(t.date).getTime() - txDate) <= 14 * 24 * 3600 * 1000
    )

    // Fetch exchange rates for cross-currency pairs
    const rateCache: Record<string, number> = {}
    const toFetch = new Set<string>()
    for (const t of pool) {
      if (t.currency !== tx.currency) {
        toFetch.add(`${txDateStr}|${tx.currency.toLowerCase()}|${t.currency.toLowerCase()}`)
      }
    }
    await Promise.all(Array.from(toFetch).map(async key => {
      const [date, from, to] = key.split('|')
      try {
        const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${from}.json`)
        if (res.ok) {
          const data = await res.json()
          const rate = data[from]?.[to]
          if (rate) rateCache[key] = rate
        }
      } catch { /* ignore */ }
    }))

    const scored = pool.map(t => {
      const daysDiff = Math.abs(new Date(t.date).getTime() - txDate) / (24 * 3600 * 1000)
      let amountDiff: number
      if (tx.currency === t.currency) {
        amountDiff = Math.abs(t.amount - tx.amount) / Math.max(tx.amount, 0.01)
      } else {
        const fwdKey = `${txDateStr}|${tx.currency.toLowerCase()}|${t.currency.toLowerCase()}`
        const revKey = `${txDateStr}|${t.currency.toLowerCase()}|${tx.currency.toLowerCase()}`
        const rate = rateCache[fwdKey] ?? (rateCache[revKey] ? 1 / rateCache[revKey] : null)
        if (rate === null) {
          amountDiff = 0.5
        } else {
          const converted = tx.amount * rate
          amountDiff = Math.abs(t.amount - converted) / Math.max(Math.max(t.amount, converted), 0.01)
        }
      }
      // Same-day transactions always rank first, then sort by amount match
      const sameDayBonus = daysDiff < 1 ? 0 : 1
      return { t, score: sameDayBonus + amountDiff * 0.6 + (daysDiff / 14) * 0.4, amountDiff }
    }).sort((a, b) => a.score - b.score).slice(0, 10)

    setLinkCandidates(scored.map(s => s.t))
    setLinkLoading(false)
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

  async function dragLink(id_a: string, id_b: string) {
    const res = await fetch('/api/transactions/link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_a, id_b }),
    })
    if (res.ok) {
      const { transfer_group_id } = await res.json()
      setTransactions(txs => txs.map(t => t.id === id_a || t.id === id_b ? { ...t, transfer_group_id } : t))
    }
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
    const linked = tx.transfer_group_id
      ? transactions.find(t => t.id !== tx.id && t.transfer_group_id === tx.transfer_group_id && t.status === 'draft')
      : null

    const ids = [tx.id, ...(linked ? [linked.id] : [])]
    await Promise.all(ids.map(id => fetch('/api/transactions/process', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })))

    setTransactions(txs => txs.map(t => ids.includes(t.id) ? { ...t, status: 'processed' } : t))
    const [accRes, loanRes] = await Promise.all([fetch('/api/accounts'), fetch('/api/loans')])
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []); setOpeningBalances(d.opening_balances || []) }
    if (loanRes.ok) { const d = await loanRes.json(); setLoans(d.loans || []) }
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
      if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []); setOpeningBalances(d.opening_balances || []) }
    }
  }

  async function deleteTransaction(tx: Transaction) {
    const res = await fetch(`/api/transactions?id=${tx.id}`, { method: 'DELETE' })
    if (res.ok) {
      setTransactions(txs => txs.filter(t => t.id !== tx.id))
    }
  }

  async function bulkProcess() {
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map(id =>
      fetch('/api/transactions/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    ))
    setTransactions(txs => txs.map(t => selectedIds.has(t.id) ? { ...t, status: 'processed' } : t))
    setSelectedIds(new Set())
    const [accRes, loanRes] = await Promise.all([fetch('/api/accounts'), fetch('/api/loans')])
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []); setOpeningBalances(d.opening_balances || []) }
    if (loanRes.ok) { const d = await loanRes.json(); setLoans(d.loans || []) }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds)
    const results = await Promise.all(ids.map(id => fetch(`/api/transactions?id=${id}`, { method: 'DELETE' }).then(r => ({ id, ok: r.ok }))))
    const deleted = new Set(results.filter(r => r.ok).map(r => r.id))
    setTransactions(txs => txs.filter(t => !deleted.has(t.id)))
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
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []); setOpeningBalances(d.opening_balances || []) }
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
    if (uploadFiles.length === 0) return
    if (uploadFiles.length === 1 && !uploadAccount) return
    if (uploadFiles.length > 1 && uploadFiles.some((_, i) => !uploadFileAccounts[i])) return
    setUploading(true); setUploadResult(null); setUploadError(null)

    let totalImported = 0, totalSkipped = 0
    let combinedRouted: Record<string, string> = {}
    let combinedSkipped: SkippedDetail[] = []
    const errors: string[] = []

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i]
      setUploadCurrentFile(i)
      setUploadProgress(0)

      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      const interval = setInterval(() => {
        setUploadProgress(p => {
          const ceiling = isPdf ? 82 : 70
          if (p >= ceiling) return p
          return Math.min(p + (p < 30 ? 4 : p < 60 ? 2 : 0.5), ceiling)
        })
      }, isPdf ? 400 : 200)

      const fileAccount = uploadFileAccounts[i] || uploadAccount
      const formData = new FormData()
      formData.append('file', file)
      formData.append('account_id', fileAccount)
      formData.append('currency', uploadCurrency)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      clearInterval(interval)
      setUploadProgress(100)

      if (res.ok) {
        totalImported += data.imported || 0
        totalSkipped += data.skipped || 0
        if (data.routed) combinedRouted = { ...combinedRouted, ...data.routed }
        if (data.skippedDetails) combinedSkipped = [...combinedSkipped, ...data.skippedDetails]
      } else {
        errors.push(`${file.name}: ${data.error || 'Fout'}`)
      }
      await new Promise(r => setTimeout(r, 300))
    }

    await loadData()
    setUploadResult({ imported: totalImported, skipped: totalSkipped, skippedDetails: combinedSkipped, routed: combinedRouted })
    if (errors.length > 0) setUploadError(errors.join('\n'))
    setTimeout(() => { setUploading(false); setUploadProgress(0); setUploadCurrentFile(0) }, 600)
  }

  async function detectPdfAccounts(files: File[]) {
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return
    setDetecting(true)
    const detectedNames: Record<number, string> = {}
    const autoAssigned: Record<number, string> = {}
    await Promise.all(pdfs.map(async (file) => {
      const idx = files.indexOf(file)
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/detect-pdf-account', { method: 'POST', body: fd })
      if (!res.ok) return
      const { name } = await res.json()
      if (!name) return
      detectedNames[idx] = name
      // Match against jar/account names (case-insensitive substring)
      const lower = name.toLowerCase()
      const match = accounts.find(a =>
        lower.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(lower)
      )
      if (match) autoAssigned[idx] = match.id
    }))
    setUploadFileDetected(detectedNames)
    setUploadFileAccounts(autoAssigned)
    setDetecting(false)
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
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []); setOpeningBalances(d.opening_balances || []) }
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


  async function categorizeAndSimplify() {
    setShowAiPrompt(false)
    aiPromptDismissed.current = true
    await categorizeAll()
    await simplifyDescriptions()
  }

  async function simplifyDescriptions() {
    setSimplifying(true)
    // All transactions that have an original_description (raw bank text) stored
    const ids = transactions.filter(t => t.original_description).map(t => t.id)
    if (ids.length > 0) {
      await fetch('/api/simplify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_ids: ids }),
      })
      const txRes = await fetch('/api/transactions?limit=500')
      if (txRes.ok) {
        const d = await txRes.json()
        setTransactions(d.transactions || [])
      }
    }
    setSimplifying(false)
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const regularAccounts = accounts.filter(a => a.account_type !== 'jar')
  const jars = accounts.filter(a => a.account_type === 'jar')
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

  // Group jars under their linked parent account
  const accountsWithJars = regularAccounts.map(acc => ({
    account: acc,
    jars: jars.filter(j => j.linked_account_id === acc.id),
  }))
  const orphanJars = jars.filter(j => !j.linked_account_id)

  const balancesByCurrency = balances
    .filter(b => regularAccounts.some(a => a.id === b.account_id))
    .reduce((acc, b) => {
      const ob = openingBalances.find(o => o.account_id === b.account_id && o.currency === b.currency)
      acc[b.currency] = (acc[b.currency] || 0) + b.balance + (ob?.amount ?? 0)
      return acc
    }, {} as Record<string, number>)


  const advanceCategoryNames = new Set(categories.filter(c => c.type === 'advance').map(c => c.name))
  const spendingByCategory = transactions.filter(t => (t.type === 'expense' || t.type === 'investment') && t.category && !advanceCategoryNames.has(t.category))
    .reduce((acc, t) => { acc[t.category!] = (acc[t.category!] || 0) + t.amount; return acc }, {} as Record<string, number>)
  const topCategories = Object.entries(spendingByCategory).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const totalExpenses = transactions.filter(t => (t.type === 'expense' || t.type === 'investment') && !advanceCategoryNames.has(t.category ?? '')).reduce((s, t) => s + t.amount, 0)

  const draftCount = transactions.filter(t => t.status === 'draft').length

  // ── Report derived ────────────────────────────────────────────────────────
  const reportTxs = transactions.filter(t =>
    t.status === 'processed' &&
    t.date >= reportFrom && t.date <= reportTo &&
    t.currency === reportCurrency
  )
  const reportCmpTxs = (reportCompare && reportCmpFrom && reportCmpTo)
    ? transactions.filter(t =>
        t.status === 'processed' &&
        t.date >= reportCmpFrom && t.date <= reportCmpTo &&
        t.currency === reportCurrency
      )
    : []

  function buildReportRows(txs: Transaction[]) {
    const catTypeMap = new Map(categories.map(c => [c.name, c.type]))
    const byCategory: Record<string, { income: number; expense: number; investment: number }> = {}
    for (const t of txs) {
      // Skip internal transfers — they are not income or expenses
      if (t.type === 'transfer') continue
      const cat = t.category || 'Zonder categorie'
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0, investment: 0 }
      const catType = catTypeMap.get(cat)
      const effectiveType = catType === 'investment' ? 'investment'
        : catType === 'income' ? 'income'
        : t.type
      if (t.type === 'terugboeking') byCategory[cat].income -= t.amount
      else if (effectiveType === 'income') byCategory[cat].income += t.amount
      else if (effectiveType === 'investment') byCategory[cat].investment += t.amount
      else byCategory[cat].expense += t.amount
    }
    return byCategory
  }

  const reportMain = buildReportRows(reportTxs)
  const reportCmp = buildReportRows(reportCmpTxs)
  const allReportCats = Array.from(new Set([...Object.keys(reportMain), ...Object.keys(reportCmp)]))

  const reportRows = allReportCats.map(cat => ({
    cat,
    income: reportMain[cat]?.income ?? 0,
    expense: reportMain[cat]?.expense ?? 0,
    investment: reportMain[cat]?.investment ?? 0,
    cmpIncome: reportCmp[cat]?.income ?? 0,
    cmpExpense: reportCmp[cat]?.expense ?? 0,
    cmpInvestment: reportCmp[cat]?.investment ?? 0,
  })).sort((a, b) => {
    switch (reportSort) {
      case 'category_asc':  return a.cat.localeCompare(b.cat)
      case 'category_desc': return b.cat.localeCompare(a.cat)
      case 'income_desc':   return b.income - a.income
      case 'income_asc':    return a.income - b.income
      case 'expense_desc':  return b.expense - a.expense
      case 'expense_asc':   return a.expense - b.expense
    }
  })

  const reportTotalIncome     = reportRows.reduce((s, r) => s + r.income, 0)
  const reportTotalExpense    = reportRows.reduce((s, r) => s + r.expense, 0)
  const reportTotalInvestment = reportRows.reduce((s, r) => s + r.investment, 0)

  const reportIncomeRows     = reportRows.filter(r => r.income !== 0).sort((a, b) => b.income - a.income)
  const reportExpenseRows    = reportRows.filter(r => r.expense > 0 && r.investment === 0).sort((a, b) => b.expense - a.expense)
  const reportInvestmentRows = reportRows.filter(r => r.investment > 0).sort((a, b) => b.investment - a.investment)

  // Bank balances: own balance per currency + jars as sub-items (no summation to avoid double counting)
  const regularAccounts2 = accounts.filter(a => a.account_type !== 'jar')
  const reportAccountBalances = regularAccounts2.map(acc => {
    const linkedJars = accounts.filter(a => a.account_type === 'jar' && a.linked_account_id === acc.id)
    const ownBalances = balances.filter(b => b.account_id === acc.id)
    const jarBalances = linkedJars.map(jar => ({
      jar,
      balances: balances.filter(b => b.account_id === jar.id),
    })).filter(j => j.balances.length > 0)
    return { account: acc, ownBalances, jarBalances }
  }).filter(r => r.ownBalances.length > 0 || r.jarBalances.length > 0)

  function setReportPreset(preset: 'this_month' | 'last_month' | 'this_quarter' | 'this_year') {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    if (preset === 'this_month') {
      setReportFrom(`${y}-${String(m + 1).padStart(2, '0')}-01`)
      setReportTo(now.toISOString().slice(0, 10))
    } else if (preset === 'last_month') {
      const lm = m === 0 ? 12 : m, ly = m === 0 ? y - 1 : y
      const lastDay = new Date(ly, lm, 0).getDate()
      setReportFrom(`${ly}-${String(lm).padStart(2, '0')}-01`)
      setReportTo(`${ly}-${String(lm).padStart(2, '0')}-${lastDay}`)
    } else if (preset === 'this_quarter') {
      const qStart = Math.floor(m / 3) * 3
      setReportFrom(`${y}-${String(qStart + 1).padStart(2, '0')}-01`)
      setReportTo(now.toISOString().slice(0, 10))
    } else if (preset === 'this_year') {
      setReportFrom(`${y}-01-01`)
      setReportTo(now.toISOString().slice(0, 10))
    }
  }

  // Reset visible count whenever filters/tab/sort change
  useEffect(() => { setVisibleCount(200) }, [txTab, filterAccount, filterType, filterCategory, filterDateFrom, filterDateTo, sortKey, search])

  const filtered = transactions.filter(t => {
    if ((t.status || 'processed') !== txTab) return false
    if (filterAccount && t.account_id !== filterAccount) return false
    if (filterType && t.type !== filterType) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (filterVendor && t.vendor !== filterVendor) return false
    if (filterDateFrom && t.date < filterDateFrom) return false
    if (filterDateTo && t.date > filterDateTo) return false
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }).sort((a, b) => {
    switch (sortKey) {
      case 'date_desc': return b.date.localeCompare(a.date)
      case 'date_asc':  return a.date.localeCompare(b.date)
      case 'amount_desc': return b.amount - a.amount
      case 'amount_asc':  return a.amount - b.amount
      case 'vendor_asc':  return (a.vendor ?? '').localeCompare(b.vendor ?? '')
      case 'vendor_desc': return (b.vendor ?? '').localeCompare(a.vendor ?? '')
      case 'description_asc':  return a.description.localeCompare(b.description)
      case 'description_desc': return b.description.localeCompare(a.description)
      case 'category_asc':  return (a.category ?? '').localeCompare(b.category ?? '')
      case 'category_desc': return (b.category ?? '').localeCompare(a.category ?? '')
      case 'type_asc':  return a.type.localeCompare(b.type)
      case 'type_desc': return b.type.localeCompare(a.type)
      case 'bank_asc':  return a.source.localeCompare(b.source)
      case 'bank_desc': return b.source.localeCompare(a.source)
    }
  })

  const TAB_LABELS: Record<Tab, string> = {
    overzicht: 'Overzicht', transacties: 'Transacties', uploaden: 'Uploaden',
    overboeking: 'Overboeking', rapport: 'Rapport',
  }

  const CATEGORY_COLORS: Record<string, string> = {
    'Wonen': 'bg-blue-100 text-blue-700', 'Eten & drinken': 'bg-orange-100 text-orange-700',
    'Transport': 'bg-violet-100 text-violet-700', 'Gezondheid': 'bg-emerald-100 text-emerald-700',
    'Inkomen': 'bg-green-100 text-green-700', 'Belasting': 'bg-red-100 text-red-700',
    'Zakelijk': 'bg-indigo-100 text-indigo-700', 'Abonnementen': 'bg-pink-100 text-pink-700',
    'Overig': 'bg-slate-100 text-slate-700',
  }

  return (
    <div className="space-y-6">
      {/* AI prompt modal */}
      {showAiPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div>
              <p className="font-semibold text-slate-800 text-base">Er zijn nieuwe transacties toegevoegd</p>
              <p className="text-sm text-slate-500 mt-1">Wil je deze categoriseren en omschrijvingen vereenvoudigen?</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={categorizeAndSimplify}
                disabled={categorizing || simplifying}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                Categoriseren + omschrijvingen vereenvoudigen
              </button>
              <button
                onClick={() => { setShowAiPrompt(false); aiPromptDismissed.current = true; categorizeAll() }}
                disabled={categorizing || simplifying}
                className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                Alleen categoriseren
              </button>
              <button
                onClick={() => { setShowAiPrompt(false); aiPromptDismissed.current = true }}
                className="w-full px-4 py-2.5 text-slate-400 hover:text-slate-600 rounded-lg text-sm transition-colors">
                Nee dankje
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{TAB_LABELS[tab]}</h1>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'transacties' && transactions.some(t => t.original_description) && (
            <button onClick={simplifyDescriptions} disabled={simplifying || categorizing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60">
              <Sparkles size={15} />
              {simplifying ? 'Vereenvoudigen…' : 'Omschrijvingen vereenvoudigen'}
            </button>
          )}
          {tab === 'transacties' && uncategorizedCount > 0 && (
            <button onClick={categorizeAll} disabled={categorizing || simplifying}
              className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60">
              <Sparkles size={15} />
              {categorizing ? 'Categoriseren…' : `${uncategorizedCount} categoriseren met AI`}
            </button>
          )}
        </div>
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

              {(regularAccounts.length > 0 || jars.length > 0) && (
                <div>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Rekeningen</h2>
                  <div className="space-y-2">
                    {accountsWithJars.map(({ account, jars: linkedJars }) => {
                      const acctBalances = balances.filter(b => b.account_id === account.id)
                      return (
                        <div key={account.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                          <div className="px-4 py-3 flex items-center justify-between">
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
                                : acctBalances.map(b => {
                                    const ob = openingBalances.find(o => o.account_id === account.id && o.currency === b.currency)
                                    return <p key={b.id} className="text-sm font-semibold">{formatCurrency(b.balance + (ob?.amount ?? 0), b.currency)}</p>
                                  })}
                            </div>
                          </div>
                          {linkedJars.map(jar => {
                            const jarBals = balances.filter(b => b.account_id === jar.id)
                            return (
                              <div key={jar.id} className="flex items-center justify-between pl-8 pr-4 py-2.5 border-t border-slate-100 bg-amber-50/40">
                                <div className="flex items-center gap-2">
                                  <ChevronRight size={12} className="text-slate-300 shrink-0" />
                                  <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                    <PiggyBank size={12} className="text-amber-600" />
                                  </div>
                                  <p className="text-sm font-medium text-slate-700">{jar.name}</p>
                                  {jar.currency && <span className="text-xs text-amber-600 font-medium">{jar.currency}</span>}
                                </div>
                                <div className="text-right">
                                  {jarBals.length === 0 ? <span className="text-xs text-slate-400">Geen saldo</span>
                                    : jarBals.map(b => {
                                        const ob = openingBalances.find(o => o.account_id === jar.id && o.currency === b.currency)
                                        return <p key={b.id} className="text-sm font-semibold text-slate-800">{formatCurrency(b.balance + (ob?.amount ?? 0), b.currency)}</p>
                                      })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                    {orphanJars.map(jar => {
                      const jarBals = balances.filter(b => b.account_id === jar.id)
                      return (
                        <div key={jar.id} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                              <PiggyBank size={14} className="text-amber-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{jar.name}</p>
                              {jar.currency && <p className="text-xs text-amber-600 font-medium">{jar.currency}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            {jarBals.length === 0 ? <span className="text-xs text-slate-400">Geen saldo</span>
                              : jarBals.map(b => {
                                  const ob = openingBalances.find(o => o.account_id === jar.id && o.currency === b.currency)
                                  return <p key={b.id} className="text-sm font-semibold">{formatCurrency(b.balance + (ob?.amount ?? 0), b.currency)}</p>
                                })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
                  {accountsWithJars.map(({ account, jars: aj }) => aj.length > 0 ? (
                    <optgroup key={account.id} label={account.name}>
                      <option value={account.id}>{account.name}</option>
                      {aj.map(j => <option key={j.id} value={j.id}>↳ {j.name}</option>)}
                    </optgroup>
                  ) : (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                  {orphanJars.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alles</option>
                  <option value="income">Inkomsten</option>
                  <option value="expense">Uitgaven</option>
                  <option value="transfer">Overboekingen</option>
                  <option value="investment">Investeringen</option>
                  <option value="advance">Voorschot</option>
                </select>
                <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alle leveranciers</option>
                  {vendorNames.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                  <option value="">Alle categorieën</option>
                  {parentCategories.map(p => {
                    const subs = subCategories(p.id)
                    return subs.length > 0 ? (
                      <optgroup key={p.id} label={p.name}>
                        <option value={p.name}>{p.name}</option>
                        {subs.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </optgroup>
                    ) : (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    )
                  })}
                </select>
                <div className="flex items-center gap-1">
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-slate-600"
                    title="Van datum" />
                  <span className="text-slate-300 text-xs">—</span>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-slate-600"
                    title="Tot datum" />
                  {(filterDateFrom || filterDateTo) && (
                    <button onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}
                      className="p-1.5 text-slate-300 hover:text-slate-500 transition-colors" title="Datum filter wissen">
                      <X size={13} />
                    </button>
                  )}
                </div>
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
                      <>
                        <button onClick={bulkProcess} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors">
                          <Plus size={11} />Toevoegen
                        </button>
                        <span className="text-slate-600">·</span>
                        <button onClick={bulkDelete} className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors">
                          <Trash2 size={11} />Verwijderen
                        </button>
                      </>
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
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto" ref={linkRef}>
                    <table className="w-full min-w-[500px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="w-8 px-2 py-2.5">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-500 cursor-pointer"
                              checked={filtered.length > 0 && filtered.slice(0, visibleCount).every(t => selectedIds.has(t.id))}
                              onChange={e => {
                                const ids = filtered.slice(0, visibleCount).map(t => t.id)
                                setSelectedIds(e.target.checked ? new Set(ids) : new Set())
                              }}
                            />
                          </th>
                          {(() => {
                            const SortTh = ({ label, asc, desc, className = '', right = false }: { label: string; asc: SortKey; desc: SortKey; className?: string; right?: boolean }) => {
                              const active = sortKey === asc || sortKey === desc
                              const toggle = () => setSortKey(sortKey === asc ? desc : asc)
                              return (
                                <th onClick={toggle} className={cn('px-2 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none group', right ? 'text-right' : 'text-left', active ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800', className)}>
                                  <span className="inline-flex items-center gap-1">
                                    {!right && label}
                                    <span className="opacity-50 group-hover:opacity-100">{sortKey === asc ? '↑' : sortKey === desc ? '↓' : '↕'}</span>
                                    {right && label}
                                  </span>
                                </th>
                              )
                            }
                            return (
                              <>
                                <SortTh label="Type" asc="type_asc" desc="type_desc" className="w-24" />
                                <SortTh label="Datum" asc="date_asc" desc="date_desc" className="w-20" />
                                <SortTh label="Omschrijving" asc="description_asc" desc="description_desc" />
                                <SortTh label="Categorie" asc="category_asc" desc="category_desc" className="w-32" />
                                <SortTh label="Bedrag" asc="amount_asc" desc="amount_desc" right className="w-28" />
                                <th className="w-16 pr-2" />
                              </>
                            )
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, visibleCount).map(tx => {
                          const isLinking = linkingTx?.id === tx.id
                          const linkedTx = tx.transfer_group_id
                            ? transactions.find(t => t.id !== tx.id && t.transfer_group_id === tx.transfer_group_id)
                            : null
                          const isDragging = draggingTxId === tx.id
                          const draggingTx = draggingTxId ? transactions.find(t => t.id === draggingTxId) : null
                          const isValidDropTarget = !!draggingTxId && tx.id !== draggingTxId && tx.account_id !== draggingTx?.account_id && !tx.transfer_group_id && !draggingTx?.transfer_group_id
                          const isDragOver = dragOverTxId === tx.id && isValidDropTarget
                          return (
                            <>
                              <tr
                                key={tx.id}
                                draggable
                                onDragStart={() => setDraggingTxId(tx.id)}
                                onDragEnd={() => { setDraggingTxId(null); setDragOverTxId(null) }}
                                onDragOver={e => { if (isValidDropTarget) { e.preventDefault(); setDragOverTxId(tx.id) } }}
                                onDragLeave={() => setDragOverTxId(null)}
                                onDrop={e => { e.preventDefault(); if (isValidDropTarget && draggingTxId) { dragLink(draggingTxId, tx.id); setDraggingTxId(null); setDragOverTxId(null) } }}
                                className={cn('border-b border-slate-50 transition-colors relative',
                                  isDragOver ? 'bg-indigo-100 outline outline-2 outline-indigo-400' :
                                  isDragging ? 'opacity-40' :
                                  draggingTxId && isValidDropTarget ? 'bg-indigo-50/50 hover:bg-indigo-100 cursor-copy' :
                                  draggingTxId ? 'opacity-50' :
                                  isLinking ? 'bg-indigo-50' :
                                  selectedIds.has(tx.id) ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                                )}
                              >
                                <td className="w-8 px-2 py-2">
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

                                {/* Type + bank dot */}
                                <td className="px-2 py-2 w-24">
                                  {(() => {
                                    const isTransferCredit = tx.type === 'income' && !!tx.transfer_group_id
                                    const displayType = isTransferCredit ? 'transfer' : tx.type
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', BANK_COLORS[tx.source] ?? 'bg-slate-400')} />
                                        <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap',
                                          displayType === 'income' ? 'bg-emerald-50 text-emerald-700' :
                                          displayType === 'expense' ? 'bg-red-50 text-red-600' :
                                          displayType === 'transfer' ? 'bg-slate-100 text-slate-500' :
                                          displayType === 'investment' ? 'bg-blue-50 text-blue-600' :
                                          displayType === 'advance' ? 'bg-amber-50 text-amber-600' :
                                          displayType === 'aflossing' ? 'bg-rose-50 text-rose-600' :
                                          displayType === 'terugboeking' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500')}>
                                          {displayType === 'income' ? 'Inkomen' : displayType === 'expense' ? 'Uitgave' : displayType === 'transfer' ? 'Overboeking' : displayType === 'investment' ? 'Investering' : displayType === 'advance' ? 'Voorschot' : displayType === 'aflossing' ? 'Aflossing' : displayType === 'terugboeking' ? 'Terugboeking' : displayType}
                                        </span>
                                      </div>
                                    )
                                  })()}
                                </td>

                                <td className="px-2 py-2 text-xs text-slate-500 whitespace-nowrap w-20">{formatDate(tx.date)}</td>

                                {/* Omschrijving + leverancier als subtekst */}
                                <td className="px-2 py-2">
                                  {isDragOver ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded-full">
                                      <Link2 size={10} />Koppelen
                                    </span>
                                  ) : (
                                    <div className="min-w-0">
                                      <button onClick={() => openDetail(tx)} className="text-xs text-slate-700 truncate max-w-full block text-left hover:text-indigo-600 transition-colors" title={`${tx.description}${tx.counterparty ? ` · ${tx.counterparty}` : ''}`}>
                                        {tx.description}
                                        {tx.counterparty && <span className="text-slate-400 ml-1">· {tx.counterparty}</span>}
                                      </button>
                                      <button
                                        onClick={e => openCellDropdown(tx, 'vendor', e)}
                                        className={cn(
                                          'text-xs transition-colors text-left truncate max-w-full block',
                                          cellDropdown?.txId === tx.id && cellDropdown.field === 'vendor'
                                            ? 'text-indigo-600'
                                            : tx.vendor
                                              ? 'text-slate-400 hover:text-slate-600'
                                              : 'text-slate-300 italic hover:text-slate-400'
                                        )}
                                      >
                                        {tx.vendor || 'leverancier…'}
                                      </button>
                                    </div>
                                  )}
                                </td>

                                {/* Categorie — clickable */}
                                <td className="px-2 py-2 w-32">
                                  <button
                                    onClick={e => openCellDropdown(tx, 'category', e)}
                                    className={cn(
                                      'text-xs font-medium px-1.5 py-0.5 rounded-full border transition-colors whitespace-nowrap',
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

                                {/* Bedrag + koppeling inline */}
                                <td className={cn('px-2 py-2 text-right w-28',
                                  tx.type === 'income' ? 'text-emerald-600' : tx.type === 'expense' ? 'text-red-500' : tx.type === 'investment' ? 'text-blue-600' : tx.type === 'advance' ? 'text-amber-600' : tx.type === 'aflossing' ? 'text-rose-600' : tx.type === 'terugboeking' ? 'text-orange-500' : 'text-slate-500')}>
                                  <div className="font-semibold whitespace-nowrap text-sm">
                                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : tx.type === 'investment' ? '↗' : tx.type === 'advance' ? '⟳' : tx.type === 'aflossing' ? '↘' : tx.type === 'terugboeking' ? '-' : ''}
                                    {formatCurrency(tx.amount, tx.currency)}
                                  </div>
                                  {/* Koppeling onder bedrag */}
                                  {linkedTx ? (
                                    <div className="flex items-center justify-end gap-0.5 mt-0.5">
                                      <span className="text-xs text-indigo-500 flex items-center gap-0.5 truncate max-w-[90px]">
                                        <Link2 size={9} className="shrink-0" />
                                        {accountMap[linkedTx.account_id]?.name ?? '—'}
                                      </span>
                                      <button onClick={() => unlinkTransaction(tx)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0"><Unlink size={10} /></button>
                                    </div>
                                  ) : aiMatches[tx.id] ? (
                                    <div className="flex items-center justify-end gap-0.5 mt-0.5">
                                      <button onClick={() => openMatchPopup(tx)}
                                        className="flex items-center gap-0.5 text-xs font-medium text-amber-600 hover:text-amber-700">
                                        <Sparkles size={9} />Match
                                      </button>
                                      <button onClick={() => setAiMatches(m => { const next = { ...m }; const mid = m[tx.id]; delete next[tx.id]; if (mid) delete next[mid]; return next })}
                                        className="text-slate-300 hover:text-slate-500 transition-colors"><X size={10} /></button>
                                    </div>
                                  ) : tx.type === 'transfer' ? (
                                    <button onClick={() => openLinkPanel(tx)}
                                      className={cn('flex items-center justify-end gap-0.5 text-xs mt-0.5 w-full',
                                        isLinking ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-500')}>
                                      <Link2 size={9} />Koppelen
                                    </button>
                                  ) : null}
                                </td>
                                <td className="pl-1 pr-2 py-2 w-16">
                                  <div className="flex items-center gap-1 justify-end">
                                    {txTab === 'draft' ? (
                                      <>
                                        <button
                                          onClick={() => processTransaction(tx)}
                                          className="flex items-center gap-0.5 text-xs font-semibold px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors whitespace-nowrap"
                                        >
                                          <Plus size={11} />Add
                                        </button>
                                        <button
                                          onClick={() => deleteTransaction(tx)}
                                          className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Verwijderen"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => revertTransaction(tx)}
                                        className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                        title="Terugzetten naar draft"
                                      >
                                        <RotateCcw size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Link panel */}
                              {isLinking && (
                                <tr key={`${tx.id}-link`} className="bg-indigo-50 border-b border-indigo-100">
                                  <td colSpan={10} className="px-4 py-3">
                                    <p className="text-xs font-semibold text-indigo-700 mb-2">Koppel aan tegenpost:</p>
                                    {linkLoading ? (
                                      <p className="text-xs text-slate-400 italic">Zoeken…</p>
                                    ) : linkCandidates.length === 0 ? (
                                      <p className="text-xs text-slate-400 italic">Geen kandidaten gevonden binnen 14 dagen op andere rekeningen.</p>
                                    ) : (
                                      <div className="flex flex-wrap gap-2">
                                        {linkCandidates.map(c => {
                                          const sameCurrency = c.currency === tx.currency
                                          const pctDiff = sameCurrency
                                            ? Math.round(Math.abs(c.amount - tx.amount) / Math.max(tx.amount, 0.01) * 100)
                                            : null
                                          return (
                                            <button key={c.id} onClick={() => linkTransactions(c.id)}
                                              className="flex items-center gap-2 text-xs bg-white border border-indigo-200 hover:bg-indigo-100 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                                              <span className="font-medium">{formatDate(c.date)}</span>
                                              <span className="text-slate-400">{accountMap[c.account_id]?.name ?? '—'}</span>
                                              <span className={cn('font-semibold', c.type === 'income' ? 'text-emerald-600' : c.type === 'investment' ? 'text-blue-600' : 'text-red-500')}>
                                                {c.type === 'income' ? '+' : c.type === 'investment' ? '↗' : '-'}{formatCurrency(c.amount, c.currency)}
                                              </span>
                                              {pctDiff !== null && (
                                                <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                                                  pctDiff === 0 ? 'bg-emerald-100 text-emerald-700' :
                                                  pctDiff <= 5 ? 'bg-green-50 text-green-600' :
                                                  pctDiff <= 15 ? 'bg-amber-50 text-amber-600' :
                                                  'bg-slate-100 text-slate-500')}>
                                                  {pctDiff === 0 ? 'exact' : `±${pctDiff}%`}
                                                </span>
                                              )}
                                              {!sameCurrency && (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600">
                                                  {c.currency}
                                                </span>
                                              )}
                                            </button>
                                          )
                                        })}
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
                    {filtered.length > visibleCount && (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <p className="text-xs text-slate-400">Toont {visibleCount} van {filtered.length}</p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setVisibleCount(c => c + 200)}
                            className="px-4 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            Laad 200 meer
                          </button>
                          <button
                            onClick={() => setVisibleCount(filtered.length)}
                            className="px-4 py-1.5 text-sm font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            Alles tonen ({filtered.length})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Match popup */}
              {matchPopup && (() => {
                const tx = transactions.find(t => t.id === matchPopup.txId)
                const matchTx = transactions.find(t => t.id === matchPopup.matchId)
                if (!tx || !matchTx) return null
                const pickerOptions = transactions
                  .filter(t =>
                    t.id !== matchPopup.txId &&
                    (!matchPopupSearch || t.description.toLowerCase().includes(matchPopupSearch.toLowerCase()) ||
                      (accountMap[t.account_id]?.name ?? '').toLowerCase().includes(matchPopupSearch.toLowerCase()) ||
                      formatCurrency(t.amount, t.currency).includes(matchPopupSearch))
                  )
                  .sort((a, b) => {
                    if (matchPopupSearch) return 0
                    const refAmount = tx.amount
                    const refDate = new Date(tx.date).getTime()
                    const daysDiffA = Math.abs(new Date(a.date).getTime() - refDate) / (24 * 3600 * 1000)
                    const daysDiffB = Math.abs(new Date(b.date).getTime() - refDate) / (24 * 3600 * 1000)
                    const diffA = Math.abs(a.amount - refAmount) / Math.max(refAmount, 0.01)
                    const diffB = Math.abs(b.amount - refAmount) / Math.max(refAmount, 0.01)
                    const scoreA = (daysDiffA < 1 ? 0 : 1) + diffA * 0.6 + (daysDiffA / 30) * 0.4
                    const scoreB = (daysDiffB < 1 ? 0 : 1) + diffB * 0.6 + (daysDiffB / 30) * 0.4
                    return scoreA - scoreB
                  })
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
                  style={{ position: 'fixed', top: cellDropdown.top, bottom: cellDropdown.bottom, left: cellDropdown.left, zIndex: 200 }}
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
                    {filteredDropdownOptions.length === 0 && !(cellDropdown.field === 'vendor' && cellSearch) && (
                      <p className="text-xs text-slate-400 italic px-3 py-3">Geen resultaten.</p>
                    )}
                    {filteredDropdownOptions.map(opt => {
                      const typeLabel = cellDropdown.field === 'category' ? catTypeLabel(opt) : null
                      const isChild = cellDropdown.field === 'category' && !!categories.find(c => c.name === opt)?.parent_id
                      return (
                        <button
                          key={opt}
                          onClick={() => updateCellValue(cellDropdown.txId, cellDropdown.field, opt)}
                          className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center justify-between gap-2',
                            isChild ? 'pl-5' : '')}
                        >
                          <span className="text-slate-800">{isChild && <span className="text-slate-300 mr-1">›</span>}{opt}</span>
                          {typeLabel && <span className="text-xs text-slate-400 shrink-0">{typeLabel}</span>}
                        </button>
                      )
                    })}
                    {cellDropdown.field === 'vendor' && cellSearch && !vendorNames.find(v => v.toLowerCase() === cellSearch.toLowerCase()) && (
                      <button
                        onClick={() => { updateCellValue(cellDropdown.txId, 'vendor', cellSearch); setCellDropdown(null) }}
                        className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-slate-100 flex items-center gap-1.5"
                      >
                        <Plus size={12} />
                        &quot;{cellSearch}&quot; toevoegen als leverancier
                      </button>
                    )}
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
                  <label className="text-xs font-medium text-slate-600">Bestanden (CSV of meerdere PDF&apos;s) <span className="text-red-400">*</span></label>
                  <input type="file" accept=".csv,.txt,.pdf" multiple
                    onChange={e => {
                      const files = e.target.files ? Array.from(e.target.files) : []
                      setUploadFiles(files)
                      setUploadFileAccounts({})
                      setUploadFileDetected({})
                      if (files.length > 1) detectPdfAccounts(files)
                    }}
                    className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                </div>

                {/* Per-file account assignment (multiple files) or single selector */}
                {uploadFiles.length > 1 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">Wijs elk bestand toe aan een rekening of jar</p>
                    {detecting && <span className="text-xs text-indigo-500 animate-pulse">Herkennen…</span>}
                  </div>
                    {uploadFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-0.5', uploading && i === uploadCurrentFile ? 'bg-indigo-500' : uploading && i < uploadCurrentFile ? 'bg-emerald-400' : 'bg-slate-300')} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <p className="text-xs text-slate-500 truncate">{f.name}</p>
                            {uploadFileDetected[i] && (
                              <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium shrink-0', uploadFileAccounts[i] ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                                {uploadFileAccounts[i] ? '✓' : '?'} {uploadFileDetected[i]}
                              </span>
                            )}
                          </div>
                          <select
                            value={uploadFileAccounts[i] ?? ''}
                            onChange={e => setUploadFileAccounts(prev => ({ ...prev, [i]: e.target.value }))}
                            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                            <option value="">Kies jar of rekening…</option>
                            {accountsWithJars.map(({ account, jars: aj }) => aj.length > 0 ? (
                              <optgroup key={account.id} label={account.name}>
                                <option value={account.id}>{account.name}</option>
                                {aj.map(j => <option key={j.id} value={j.id}>↳ {j.name}</option>)}
                              </optgroup>
                            ) : (
                              <option key={account.id} value={account.id}>{account.name}</option>
                            ))}
                            {orphanJars.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Rekening of jar <span className="text-red-400">*</span></label>
                    <select value={uploadAccount} onChange={e => setUploadAccount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      <option value="">Kies een rekening of jar…</option>
                      {accountsWithJars.map(({ account, jars: aj }) => aj.length > 0 ? (
                        <optgroup key={account.id} label={account.name}>
                          <option value={account.id}>{account.name}</option>
                          {aj.map(j => <option key={j.id} value={j.id}>↳ {j.name}</option>)}
                        </optgroup>
                      ) : (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                      {orphanJars.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <button type="button" onClick={() => setUploadCurrencyOverride(v => !v)}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                    {uploadCurrencyOverride ? '▾ Valuta verbergen' : '▸ Valuta overschrijven (alleen voor OCBC CSV)'}
                  </button>
                  {uploadCurrencyOverride && (
                    <select value={uploadCurrency} onChange={e => setUploadCurrency(e.target.value)}
                      className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </div>

                <button onClick={handleUpload}
                  disabled={uploadFiles.length === 0 || uploading ||
                    (uploadFiles.length === 1 && !uploadAccount) ||
                    (uploadFiles.length > 1 && uploadFiles.some((_, i) => !uploadFileAccounts[i]))
                  }
                  className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
                  <Upload size={15} />
                  {uploading ? `Verwerken ${uploadCurrentFile + 1}/${uploadFiles.length}…` : uploadFiles.length > 1 ? `${uploadFiles.length} bestanden importeren` : 'Importeren'}
                </button>
                {uploading && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{uploadProgress < 100 ? `${uploadFiles[uploadCurrentFile]?.name ?? ''} — PDF verwerken via AI…` : 'Klaar!'}</span>
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
                  <div className="space-y-2">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 space-y-1">
                      <p>✓ <strong>{uploadResult.imported}</strong> transacties geïmporteerd{uploadResult.skipped > 0 && `, ${uploadResult.skipped} duplicaten overgeslagen`}</p>
                      {uploadResult.routed && Object.keys(uploadResult.routed).length > 1 && (
                        <div className="text-xs text-emerald-600 space-y-0.5 pt-0.5">
                          {Object.entries(uploadResult.routed).map(([cur, accId]) => (
                            <p key={cur}>· {cur} → {accountMap[accId]?.name ?? accId}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    {uploadResult.skippedDetails && uploadResult.skippedDetails.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-2">
                        <p className="font-medium">Overgeslagen duplicaten — staan nog in de database:</p>
                        <div className="space-y-0.5 max-h-48 overflow-y-auto">
                          {uploadResult.skippedDetails.map((t, i) => (
                            <div key={i} className="flex justify-between text-xs text-amber-700 gap-4">
                              <span className="text-amber-500 shrink-0">{t.date}</span>
                              <span className="flex-1 truncate">{t.description}</span>
                              <span className="shrink-0 font-medium">{t.amount.toFixed(2)} {t.currency}</span>
                              <span className="shrink-0 text-amber-400">{accountMap[t.account_id]?.name ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-amber-600">Verwijder deze transacties eerst als je ze opnieuw wilt importeren.</p>
                      </div>
                    )}
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
                      {accountsWithJars.map(({ account, jars: aj }) => aj.length > 0 ? (
                        <optgroup key={account.id} label={account.name}>
                          <option value={account.id}>{account.name}</option>
                          {aj.map(j => <option key={j.id} value={j.id}>↳ {j.name}</option>)}
                        </optgroup>
                      ) : <option key={account.id} value={account.id}>{account.name}</option>)}
                      {orphanJars.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Naar</label>
                    <select value={transfer.to_account_id} onChange={e => setTransfer(t => ({ ...t, to_account_id: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      <option value="">Kies…</option>
                      {accountsWithJars.map(({ account, jars: aj }) => aj.length > 0 ? (
                        <optgroup key={account.id} label={account.name}>
                          <option value={account.id}>{account.name}</option>
                          {aj.map(j => <option key={j.id} value={j.id}>↳ {j.name}</option>)}
                        </optgroup>
                      ) : <option key={account.id} value={account.id}>{account.name}</option>)}
                      {orphanJars.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
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

          {/* ── RAPPORT ── */}
          {tab === 'rapport' && (
            <div className="space-y-6">
              {/* Period controls */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">Periode</h2>
                  <div className="flex items-center gap-1.5">
                    {(['this_month', 'last_month', 'this_quarter', 'this_year'] as const).map(p => (
                      <button key={p} onClick={() => setReportPreset(p)}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                        {p === 'this_month' ? 'Deze maand' : p === 'last_month' ? 'Vorige maand' : p === 'this_quarter' ? 'Dit kwartaal' : 'Dit jaar'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Van</label>
                    <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Tot</label>
                    <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Valuta</label>
                    <select value={reportCurrency} onChange={e => setReportCurrency(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <button onClick={() => {
                    setReportCompare(v => !v)
                    if (!reportCompare && !reportCmpFrom) {
                      const d = new Date(reportFrom)
                      d.setMonth(d.getMonth() - 1)
                      const lm = d.getMonth() + 1, ly = d.getFullYear()
                      const lastDay = new Date(ly, lm, 0).getDate()
                      setReportCmpFrom(`${ly}-${String(lm).padStart(2, '0')}-01`)
                      setReportCmpTo(`${ly}-${String(lm).padStart(2, '0')}-${lastDay}`)
                    }
                  }}
                    className={cn('px-3 py-1.5 text-sm rounded-lg border transition-colors font-medium',
                      reportCompare ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                    Vergelijk
                  </button>
                </div>
                {reportCompare && (
                  <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-medium self-center w-full">Vergelijkingsperiode</p>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">Van</label>
                      <input type="date" value={reportCmpFrom} onChange={e => setReportCmpFrom(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">Tot</label>
                      <input type="date" value={reportCmpTo} onChange={e => setReportCmpTo(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* Bank accounts */}
              {reportAccountBalances.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">Bankrekeningen</h3>
                  </div>
                  {reportAccountBalances.map((r, i) => {
                    const isExpanded = expandedBankIds.has(r.account.id)
                    const hasJars = r.jarBalances.length > 0
                    return (
                      <div key={r.account.id} className={cn(i < reportAccountBalances.length - 1 && 'border-b border-slate-100')}>
                        {/* Main account row */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={cn('w-2 h-2 rounded-full shrink-0', BANK_COLORS[r.account.bank] ?? 'bg-slate-400')} />
                            <button onClick={() => setAccountTxPanel(r.account.id)} className="text-sm font-medium text-slate-800 hover:text-indigo-600 hover:underline transition-colors text-left">{r.account.name}</button>
                            {hasJars && (
                              <button
                                onClick={() => setExpandedBankIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(r.account.id)) next.delete(r.account.id)
                                  else next.add(r.account.id)
                                  return next
                                })}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                <ChevronRight size={14} className={cn('transition-transform', isExpanded && 'rotate-90')} />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-3">
                            {r.ownBalances.map(b => (
                              <span key={b.currency} className={cn('text-sm font-semibold tabular-nums', b.balance >= 0 ? 'text-slate-800' : 'text-red-500')}>
                                {formatCurrency(b.balance, b.currency)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Jars (expanded) */}
                        {isExpanded && r.jarBalances.map(({ jar, balances: jarBals }) => (
                          <div key={jar.id} className="flex items-center justify-between pl-9 pr-4 py-2 border-t border-slate-50 bg-slate-50/50">
                            <div className="flex items-center gap-2 text-slate-500">
                              <PiggyBank size={11} className="text-amber-500 shrink-0" />
                              <button onClick={() => setAccountTxPanel(jar.id)} className="text-xs hover:text-indigo-600 hover:underline transition-colors">{jar.name}</button>
                            </div>
                            <div className="flex gap-3">
                              {jarBals.map(b => (
                                <span key={b.currency} className={cn('text-xs font-medium tabular-nums', b.balance >= 0 ? 'text-amber-700' : 'text-red-500')}>
                                  {formatCurrency(b.balance, b.currency)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {reportRows.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-10">Geen verwerkte transacties in deze periode.</p>
              ) : (
                <>
                  {/* Inkomen */}
                  {reportIncomeRows.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/50">
                        <h3 className="text-sm font-semibold text-emerald-800">Inkomen</h3>
                      </div>
                      {reportIncomeRows.map((row, i) => (
                        <button key={row.cat} onClick={() => { setCategoryTxPanel(row.cat); setCategoryTxSearch(''); setCategoryTxFrom(reportFrom); setCategoryTxTo(reportTo) }} className={cn('w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors', i < reportIncomeRows.length - 1 && 'border-b border-slate-50')}>
                          <span className="text-sm text-slate-700">{row.cat}</span>
                          <span className="text-sm font-medium text-emerald-600 tabular-nums">{formatCurrency(row.income, reportCurrency)}</span>
                        </button>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Totaal</span>
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(reportTotalIncome, reportCurrency)}</span>
                      </div>
                    </div>
                  )}

                  {/* Uitgaven */}
                  {reportExpenseRows.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-red-50/50">
                        <h3 className="text-sm font-semibold text-red-800">Uitgaven</h3>
                      </div>
                      {reportExpenseRows.map((row, i) => (
                        <button key={row.cat} onClick={() => { setCategoryTxPanel(row.cat); setCategoryTxSearch(''); setCategoryTxFrom(reportFrom); setCategoryTxTo(reportTo) }} className={cn('w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors', i < reportExpenseRows.length - 1 && 'border-b border-slate-50')}>
                          <span className="text-sm text-slate-700">{row.cat}</span>
                          <span className="text-sm font-medium text-red-500 tabular-nums">{formatCurrency(row.expense, reportCurrency)}</span>
                        </button>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Totaal</span>
                        <span className="text-sm font-bold text-red-600 tabular-nums">{formatCurrency(reportExpenseRows.reduce((s, r) => s + r.expense, 0), reportCurrency)}</span>
                      </div>
                    </div>
                  )}

                  {/* Investeringen */}
                  {reportInvestmentRows.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-blue-50/50">
                        <h3 className="text-sm font-semibold text-blue-800">Investeringen</h3>
                      </div>
                      {reportInvestmentRows.map((row, i) => (
                        <button key={row.cat} onClick={() => { setCategoryTxPanel(row.cat); setCategoryTxSearch(''); setCategoryTxFrom(reportFrom); setCategoryTxTo(reportTo) }} className={cn('w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors', i < reportInvestmentRows.length - 1 && 'border-b border-slate-50')}>
                          <span className="text-sm text-slate-700">{row.cat}</span>
                          <span className="text-sm font-medium text-blue-600 tabular-nums">{formatCurrency(row.investment, reportCurrency)}</span>
                        </button>
                      ))}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Totaal</span>
                        <span className="text-sm font-bold text-blue-700 tabular-nums">{formatCurrency(reportTotalInvestment, reportCurrency)}</span>
                      </div>
                    </div>
                  )}

                  {/* Samenvatting */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-900">Samenvatting</h3>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                      <span className="text-sm text-slate-600">Inkomen</span>
                      <span className="text-sm font-medium text-emerald-600 tabular-nums">+{formatCurrency(reportTotalIncome, reportCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                      <span className="text-sm text-slate-600">Uitgaven</span>
                      <span className="text-sm font-medium text-red-500 tabular-nums">-{formatCurrency(reportTotalExpense, reportCurrency)}</span>
                    </div>
                    {reportTotalInvestment > 0 && (
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50">
                        <span className="text-sm text-slate-600">Investeringen</span>
                        <span className="text-sm font-medium text-blue-600 tabular-nums">-{formatCurrency(reportTotalInvestment, reportCurrency)}</span>
                      </div>
                    )}
                    <div className={cn('flex items-center justify-between px-4 py-3.5 border-t border-slate-200',
                      reportTotalIncome - reportTotalExpense - reportTotalInvestment >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
                      <span className="text-sm font-semibold text-slate-800">Totaal verschil</span>
                      <span className={cn('text-base font-bold tabular-nums',
                        reportTotalIncome - reportTotalExpense - reportTotalInvestment >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                        {formatCurrency(reportTotalIncome - reportTotalExpense - reportTotalInvestment, reportCurrency)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── CATEGORY TRANSACTIONS PANEL ── */}
      {categoryTxPanel && (() => {
        const q = categoryTxSearch.toLowerCase()
        const catTxs = transactions
          .filter(t =>
            (t.category || 'Zonder categorie') === categoryTxPanel &&
            t.status === 'processed' &&
            t.date >= (categoryTxFrom || reportFrom) && t.date <= (categoryTxTo || reportTo) &&
            t.currency === reportCurrency &&
            (!q || t.description.toLowerCase().includes(q) || (t.vendor ?? '').toLowerCase().includes(q))
          )
          .sort((a, b) => b.date.localeCompare(a.date))
        const total = catTxs.reduce((s, t) =>
          s + (t.type === 'income' ? t.amount : -t.amount), 0)
        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setCategoryTxPanel(null)}>
            <div className="bg-white w-full max-w-md h-full flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{categoryTxPanel}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{reportCurrency}</p>
                </div>
                <button onClick={() => setCategoryTxPanel(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              </div>
              {/* Search + date filters */}
              <div className="px-5 py-3 border-b border-slate-100 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Zoeken…"
                    value={categoryTxSearch}
                    onChange={e => setCategoryTxSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" value={categoryTxFrom} onChange={e => setCategoryTxFrom(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                  <span className="text-xs text-slate-400">–</span>
                  <input type="date" value={categoryTxTo} onChange={e => setCategoryTxTo(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {catTxs.length === 0 && (
                  <p className="text-sm text-slate-400 italic text-center py-10">Geen transacties gevonden.</p>
                )}
                {catTxs.map(tx => (
                  <button key={tx.id} onClick={() => { setCategoryTxPanel(null); openDetail(tx) }}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs text-slate-400 tabular-nums">{formatDate(tx.date)} · {accountMap[tx.account_id]?.name ?? '—'}</p>
                      <p className="text-sm font-medium text-slate-800 truncate">{tx.description}</p>
                      {tx.vendor && <p className="text-xs text-slate-400 truncate">{tx.vendor}</p>}
                    </div>
                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums',
                      tx.type === 'income' ? 'text-emerald-600' :
                      tx.type === 'investment' ? 'text-blue-600' :
                      tx.type === 'terugboeking' ? 'text-orange-500' :
                      'text-red-500')}>
                      {tx.type === 'income' ? '+' : tx.type === 'investment' ? '↗' : '-'}
                      {formatCurrency(tx.amount, tx.currency)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-400">{catTxs.length} transactie{catTxs.length !== 1 ? 's' : ''}</span>
                <span className={cn('text-sm font-bold tabular-nums', total >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                  {formatCurrency(Math.abs(total), reportCurrency)}
                </span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── ACCOUNT TRANSACTIONS PANEL ── */}
      {accountTxPanel && (() => {
        const acc = accounts.find(a => a.id === accountTxPanel)
        const accBals = balances.filter(b => b.account_id === accountTxPanel)
        const accTxs = transactions
          .filter(t => t.account_id === accountTxPanel)
          .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setAccountTxPanel(null)}>
            <div className="bg-white w-full max-w-md h-full flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', BANK_COLORS[acc?.bank ?? ''] ?? 'bg-slate-400')} />
                    <h2 className="text-base font-semibold text-slate-900">{acc?.name ?? '—'}</h2>
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    {accBals.map(b => (
                      <span key={b.currency} className={cn('text-sm font-medium tabular-nums', b.balance >= 0 ? 'text-slate-600' : 'text-red-500')}>
                        {formatCurrency(b.balance, b.currency)}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setAccountTxPanel(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              </div>
              {/* Transaction list */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {accTxs.length === 0 && (
                  <p className="text-sm text-slate-400 italic text-center py-10">Geen transacties gevonden.</p>
                )}
                {accTxs.map(tx => (
                  <button key={tx.id} onClick={() => { setAccountTxPanel(null); openDetail(tx) }}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-xs text-slate-400 tabular-nums">{formatDate(tx.date)}</p>
                      <p className="text-sm font-medium text-slate-800 truncate">{tx.description}</p>
                      {tx.category && <p className="text-xs text-slate-400 truncate">{tx.category}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn('text-sm font-semibold tabular-nums',
                        tx.type === 'income' ? 'text-emerald-600' :
                        tx.type === 'investment' ? 'text-blue-600' :
                        tx.type === 'terugboeking' ? 'text-orange-500' :
                        tx.type === 'advance' ? 'text-amber-600' :
                        'text-red-500')}>
                        {tx.type === 'income' ? '+' : tx.type === 'investment' ? '↗' : tx.type === 'advance' ? '⟳' : '-'}
                        {formatCurrency(tx.amount, tx.currency)}
                      </p>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full',
                        tx.status === 'processed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                        {tx.status === 'processed' ? 'verwerkt' : 'concept'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
                {accTxs.length} transactie{accTxs.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── TRANSACTION DETAIL MODAL ── */}
      {detailTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailTx(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-400 mb-1">{formatDate(detailEdits.date ?? detailTx.date)} · {accountMap[detailTx.account_id]?.name ?? '—'} · {detailTx.currency}</p>
                <p className={cn('text-2xl font-bold',
                  detailTx.type === 'income' ? 'text-emerald-600' : detailTx.type === 'investment' ? 'text-blue-600' : detailTx.type === 'advance' ? 'text-amber-600' : detailTx.type === 'expense' ? 'text-red-500' : detailTx.type === 'terugboeking' ? 'text-orange-500' : 'text-slate-500')}>
                  {detailTx.type === 'income' ? '+' : detailTx.type === 'investment' ? '↗' : detailTx.type === 'advance' ? '⟳' : detailTx.type === 'expense' ? '-' : detailTx.type === 'terugboeking' ? '-' : ''}{formatCurrency(detailTx.amount, detailTx.currency)}
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
                    <option value="terugboeking">Terugboeking</option>
                    <option value="transfer">Overboeking</option>
                    <option value="investment">Investering</option>
                    <option value="advance">Voorschot</option>
                    <option value="aflossing">Aflossing</option>
                  </select>
                </div>
              </div>

              {/* Lening koppelen (alleen bij type aflossing) */}
              {(detailEdits.type ?? detailTx?.type) === 'aflossing' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Lening</label>
                  <select
                    value={detailEdits.loan_id !== undefined ? (detailEdits.loan_id ?? '') : (detailTx?.loan_id ?? '')}
                    onChange={e => setDetailEdits(d => ({ ...d, loan_id: e.target.value || null }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="">— Geen lening —</option>
                    {loans.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name}{l.lender ? ` (${l.lender})` : ''} · {l.currency} {l.outstanding_amount.toLocaleString('nl-NL', { minimumFractionDigits: 2 })} open
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Leverancier */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Leverancier</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setDetailVendorOpen(o => !o); setDetailVendorSearch('') }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-left flex items-center justify-between hover:border-indigo-400 transition-colors"
                    >
                      <span className={detailEdits.vendor ?? detailTx.vendor ? 'text-slate-800' : 'text-slate-400'}>
                        {detailEdits.vendor ?? detailTx.vendor ?? '—'}
                      </span>
                      <Search size={13} className="text-slate-300 shrink-0" />
                    </button>
                    {detailVendorOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Leverancier zoeken…"
                            value={detailVendorSearch}
                            onChange={e => setDetailVendorSearch(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <button
                            onClick={() => { setDetailEdits(d => ({ ...d, vendor: '' })); setDetailVendorOpen(false) }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-50 transition-colors border-b border-slate-50"
                          >
                            — Geen leverancier
                          </button>
                          {vendorNames
                            .filter(v => !detailVendorSearch || v.toLowerCase().includes(detailVendorSearch.toLowerCase()))
                            .map(v => (
                              <button key={v} onClick={() => { setDetailEdits(d => ({ ...d, vendor: v })); setDetailVendorOpen(false) }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                                {v}
                              </button>
                            ))}
                          {detailVendorSearch && !vendorNames.find(v => v.toLowerCase() === detailVendorSearch.toLowerCase()) && (
                            <button
                              onClick={() => { setDetailEdits(d => ({ ...d, vendor: detailVendorSearch })); setDetailVendorOpen(false) }}
                              className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-slate-50">
                              + &quot;{detailVendorSearch}&quot; toevoegen
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Categorie */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Categorie</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setDetailCategoryOpen(o => !o); setDetailCategorySearch('') }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-left flex items-center justify-between hover:border-indigo-400 transition-colors"
                    >
                      <span className={detailEdits.category ?? detailTx.category ? 'text-slate-800' : 'text-slate-400'}>
                        {detailEdits.category ?? detailTx.category ?? '— geen —'}
                      </span>
                      <Search size={13} className="text-slate-300 shrink-0" />
                    </button>
                    {detailCategoryOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Categorie zoeken…"
                            value={detailCategorySearch}
                            onChange={e => setDetailCategorySearch(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <button
                            onClick={() => { setDetailEdits(d => ({ ...d, category: '' })); setDetailCategoryOpen(false) }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-50 transition-colors border-b border-slate-50"
                          >
                            — Geen categorie
                          </button>
                          {allCategoryOptions
                            .filter(c => !detailCategorySearch || c.toLowerCase().includes(detailCategorySearch.toLowerCase()))
                            .map(c => {
                              const isChild = !!categories.find(cat => cat.name === c)?.parent_id
                              const typeLabel = catTypeLabel(c)
                              return (
                                <button key={c} onClick={() => { setDetailEdits(d => ({ ...d, category: c })); setDetailCategoryOpen(false) }}
                                  className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center justify-between gap-2',
                                    isChild ? 'pl-6' : '')}>
                                  <span className={isChild ? 'text-slate-600' : 'text-slate-800 font-medium'}>
                                    {isChild && <span className="text-slate-300 mr-1">›</span>}{c}
                                  </span>
                                  {typeLabel && <span className="text-xs text-slate-400 shrink-0">{typeLabel}</span>}
                                </button>
                              )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
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
                            <p className="text-xs text-indigo-400">{accountMap[linked.account_id]?.name ?? '—'} · {formatDate(linked.date)} · {linked.type === 'income' ? '+' : linked.type === 'investment' ? '↗' : '-'}{formatCurrency(linked.amount, linked.currency)}</p>
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
                            <p className="text-xs text-amber-500">{accountMap[aiMatchTx.account_id]?.name ?? '—'} · {formatDate(aiMatchTx.date)} · {aiMatchTx.type === 'income' ? '+' : aiMatchTx.type === 'investment' ? '↗' : '-'}{formatCurrency(aiMatchTx.amount, aiMatchTx.currency)}</p>
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
                                  <span className={cn('font-semibold ml-2 shrink-0', t.type === 'income' ? 'text-emerald-600' : t.type === 'investment' ? 'text-blue-600' : 'text-red-500')}>
                                    {t.type === 'income' ? '+' : t.type === 'investment' ? '↗' : '-'}{formatCurrency(t.amount, t.currency)}
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
