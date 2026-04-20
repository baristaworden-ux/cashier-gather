'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Plus, Trash2, Search, PiggyBank, ChevronRight } from 'lucide-react'
import { AdminCategory, Vendor, Account, AccountBalance } from '@/types'
import { cn, formatCurrency, CURRENCIES } from '@/lib/utils'

const BANK_LABELS: Record<string, string> = {
  rabobank: 'Rabobank', wise: 'Wise', revolut: 'Revolut',
  ocbc: 'OCBC Indonesia', manual: 'Handmatig',
}
const BANK_COLORS: Record<string, string> = {
  rabobank: 'bg-orange-500', wise: 'bg-green-500', revolut: 'bg-violet-500',
  ocbc: 'bg-red-500', manual: 'bg-slate-400',
}

const DEFAULT_CATEGORIES = [
  { name: 'Wonen', type: 'expense' as const },
  { name: 'Eten & drinken', type: 'expense' as const },
  { name: 'Transport', type: 'expense' as const },
  { name: 'Gezondheid', type: 'expense' as const },
  { name: 'Inkomen', type: 'income' as const },
  { name: 'Belasting', type: 'expense' as const },
  { name: 'Zakelijk', type: 'expense' as const },
  { name: 'Abonnementen', type: 'expense' as const },
  { name: 'Overboekingen', type: 'expense' as const },
  { name: 'Overig', type: 'expense' as const },
  { name: 'Voorgeschoten kosten', type: 'advance' as const },
]

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  // Accounts & jars
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [newAccount, setNewAccount] = useState({ name: '', bank: 'rabobank', account_number: '' })
  const [newJar, setNewJar] = useState({ name: '', currency: 'EUR', linked_account_id: '' })
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingJar, setSavingJar] = useState(false)
  const [jarError, setJarError] = useState<string | null>(null)

  // Categories
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income' | 'advance'>('expense')
  const [newCatParent, setNewCatParent] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')
  const [savingSub, setSavingSub] = useState(false)

  // Vendors
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorSearch, setVendorSearch] = useState('')
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorCategory, setNewVendorCategory] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  async function loadData() {
    const [accRes, catRes, vendorRes] = await Promise.all([
      fetch('/api/accounts'),
      fetch('/api/categories'),
      fetch('/api/vendors'),
    ])
    if (accRes.ok) { const d = await accRes.json(); setAccounts(d.accounts || []); setBalances(d.balances || []) }
    if (catRes.ok) { const { categories } = await catRes.json(); setCategories(categories || []) }
    if (vendorRes.ok) { const { vendors } = await vendorRes.json(); setVendors(vendors || []) }
  }

  useEffect(() => { loadData() }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Accounts ──
  async function addAccount() {
    if (!newAccount.name.trim()) return
    setSavingAccount(true)
    const res = await fetch('/api/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newAccount, account_type: 'account' }),
    })
    if (res.ok) { setNewAccount({ name: '', bank: 'rabobank', account_number: '' }); await loadData() }
    setSavingAccount(false)
  }

  async function addJar() {
    if (!newJar.name.trim()) return
    setSavingJar(true)
    setJarError(null)
    const res = await fetch('/api/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newJar.name, bank: 'manual', account_type: 'jar', currency: newJar.currency, linked_account_id: newJar.linked_account_id || null }),
    })
    const data = await res.json()
    if (res.ok) {
      setNewJar({ name: '', currency: 'EUR', linked_account_id: '' })
      await loadData()
    } else {
      setJarError(data.error || 'Er is een fout opgetreden.')
    }
    setSavingJar(false)
  }

  async function deleteAccount(id: string, type: string) {
    if (!confirm(`${type === 'jar' ? 'Jar' : 'Rekening'} verwijderen? Alle transacties worden ook verwijderd.`)) return
    await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' })
    await loadData()
  }

  // ── Categories ──
  async function addCategory() {
    if (!newCatName.trim()) return
    setSavingCat(true)
    const res = await fetch('/api/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim(), type: newCatType, parent_id: newCatParent || null }),
    })
    if (res.ok) {
      const { category } = await res.json()
      setCategories(c => [...c, category].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCatName('')
      setNewCatParent('')
    }
    setSavingCat(false)
  }

  async function addSubCategory(parentId: string) {
    if (!newSubName.trim()) return
    setSavingSub(true)
    const parent = categories.find(c => c.id === parentId)
    const res = await fetch('/api/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSubName.trim(), type: parent?.type ?? 'expense', parent_id: parentId }),
    })
    if (res.ok) {
      const { category } = await res.json()
      setCategories(c => [...c, category].sort((a, b) => a.name.localeCompare(b.name)))
      setNewSubName('')
      setAddingSubFor(null)
    }
    setSavingSub(false)
  }

  async function deleteCategory(id: string) {
    await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
    setCategories(c => c.filter(x => x.id !== id))
  }

  async function seedDefaultCategories() {
    for (const cat of DEFAULT_CATEGORIES) {
      if (!categories.find(c => c.name === cat.name)) {
        const res = await fetch('/api/categories', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cat),
        })
        if (res.ok) { const { category } = await res.json(); setCategories(c => [...c, category]) }
      }
    }
  }

  // ── Vendors ──
  async function addVendor() {
    if (!newVendorName.trim()) return
    setSavingVendor(true)
    const res = await fetch('/api/vendors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newVendorName.trim(), category: newVendorCategory }),
    })
    if (res.ok) {
      const { vendor } = await res.json()
      setVendors(v => [...v, vendor].sort((a, b) => a.name.localeCompare(b.name)))
      setNewVendorName('')
      setNewVendorCategory('')
    }
    setSavingVendor(false)
  }

  async function deleteVendor(id: string) {
    await fetch(`/api/vendors?id=${id}`, { method: 'DELETE' })
    setVendors(v => v.filter(x => x.id !== id))
  }

  // ── Derived ──
  const regularAccounts = accounts.filter(a => a.account_type !== 'jar')
  const jars = accounts.filter(a => a.account_type === 'jar')
  const parentCategories = categories.filter(c => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name))
  const subCats = (parentId: string) => categories.filter(c => c.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name))
  const filteredVendors = vendors.filter(v =>
    !vendorSearch || v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    v.category?.toLowerCase().includes(vendorSearch.toLowerCase())
  )

  function AccountRow({ account }: { account: Account }) {
    const acctBalances = balances.filter(b => b.account_id === account.id)
    const isJar = account.account_type === 'jar'
    return (
      <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
            isJar ? 'bg-amber-100' : (BANK_COLORS[account.bank] || 'bg-slate-400'))}>
            {isJar
              ? <PiggyBank size={15} className="text-amber-600" />
              : <span className="text-white text-xs font-bold">{account.bank[0].toUpperCase()}</span>}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">{account.name}</p>
            <p className="text-xs text-slate-400">
              {isJar ? (
                <>
                  {account.currency || '—'}
                  {account.linked_account_id && (
                    <> · {accounts.find(a => a.id === account.linked_account_id)?.name ?? '?'}</>
                  )}
                </>
              ) : (
                `${BANK_LABELS[account.bank]}${account.account_number ? ` · ${account.account_number}` : ''}`
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 flex-wrap justify-end">
            {acctBalances.map(b => (
              <span key={b.id} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                {formatCurrency(b.balance, b.currency)}
              </span>
            ))}
          </div>
          <button onClick={() => deleteAccount(account.id, account.account_type)}
            className="text-slate-300 hover:text-red-400 transition-colors p-1 shrink-0">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Instellingen</h1>
        <p className="text-sm text-slate-500 mt-1">Beheer rekeningen, jars, categorieën en leveranciers.</p>
      </div>

      {/* ── Rekeningen ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Rekeningen</h2>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {regularAccounts.length > 0 && (
            <div className="px-4">
              {regularAccounts.map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          )}
          <div className={cn('flex gap-2 px-4 py-3', regularAccounts.length > 0 && 'border-t border-slate-100')}>
            <input type="text" placeholder="Naam rekening…" value={newAccount.name}
              onChange={e => setNewAccount(a => ({ ...a, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addAccount()}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
            <select value={newAccount.bank} onChange={e => setNewAccount(a => ({ ...a, bank: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
              {Object.entries(BANK_LABELS).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
            <button onClick={addAccount} disabled={!newAccount.name.trim() || savingAccount}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Jars ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Jars</h2>
        <p className="text-sm text-slate-500">
          Een jar is een spaarpotje of rekening in een specifieke valuta. Je kunt er transacties naartoe uploaden of overboeken.
        </p>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {jars.length > 0 && (
            <div className="px-4">
              {jars.map(a => <AccountRow key={a.id} account={a} />)}
            </div>
          )}
          <div className={cn('flex flex-wrap gap-2 px-4 py-3', jars.length > 0 && 'border-t border-slate-100')}>
            <input type="text" placeholder="Naam jar…" value={newJar.name}
              onChange={e => setNewJar(j => ({ ...j, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addJar()}
              className="flex-1 min-w-32 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
            <select value={newJar.currency} onChange={e => setNewJar(j => ({ ...j, currency: e.target.value }))}
              className="w-24 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={newJar.linked_account_id} onChange={e => setNewJar(j => ({ ...j, linked_account_id: e.target.value }))}
              className="flex-1 min-w-36 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
              <option value="">Geen gekoppelde rekening</option>
              {regularAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button onClick={addJar} disabled={!newJar.name.trim() || savingJar}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
              {savingJar ? '…' : <Plus size={14} />}
            </button>
          </div>
          {jarError && (
            <div className="px-4 pb-3 text-xs text-red-600">✗ {jarError}</div>
          )}
        </div>
      </section>

      {/* ── Categorieën ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Categorieën</h2>
          {categories.length === 0 && (
            <button onClick={seedDefaultCategories} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              Standaard categorieën laden
            </button>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {(() => {
            const parents = categories.filter(c => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name))
            const subs = (parentId: string) => categories.filter(c => c.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name))
            return parents.map((cat, i) => (
              <div key={cat.id} className={cn(i < parents.length - 1 && 'border-b border-slate-100')}>
                {/* Parent row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-semibold text-slate-900">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                      cat.type === 'income' ? 'bg-emerald-100 text-emerald-700' :
                      cat.type === 'advance' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-600')}>
                      {cat.type === 'income' ? 'Inkomsten' : cat.type === 'advance' ? 'Voorschot' : 'Uitgaven'}
                    </span>
                    <button
                      onClick={() => { setAddingSubFor(addingSubFor === cat.id ? null : cat.id); setNewSubName('') }}
                      className="text-slate-300 hover:text-indigo-500 transition-colors p-1" title="Subcategorie toevoegen">
                      <Plus size={14} />
                    </button>
                    <button onClick={() => deleteCategory(cat.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Subcategories */}
                {subs(cat.id).map(sub => (
                  <div key={sub.id} className="flex items-center justify-between pl-9 pr-4 py-2 border-t border-slate-50 bg-slate-50/50">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <ChevronRight size={12} className="text-slate-300 shrink-0" />
                      <span className="text-sm">{sub.name}</span>
                    </div>
                    <button onClick={() => deleteCategory(sub.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {/* Inline add subcategory */}
                {addingSubFor === cat.id && (
                  <div className="flex gap-2 pl-9 pr-4 py-2 border-t border-indigo-100 bg-indigo-50/40">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Naam subcategorie…"
                      value={newSubName}
                      onChange={e => setNewSubName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addSubCategory(cat.id)}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                    />
                    <button onClick={() => addSubCategory(cat.id)} disabled={!newSubName.trim() || savingSub}
                      className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))
          })()}

          {/* Add top-level category */}
          <div className={cn('flex gap-2 px-4 py-3', categories.length > 0 && 'border-t border-slate-100')}>
            <input type="text" placeholder="Nieuwe hoofdcategorie…" value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
            <select value={newCatType} onChange={e => setNewCatType(e.target.value as 'expense' | 'income' | 'advance')}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
              <option value="expense">Uitgaven</option>
              <option value="income">Inkomsten</option>
              <option value="advance">Voorschot</option>
            </select>
            <button onClick={addCategory} disabled={!newCatName.trim() || savingCat}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Leveranciers ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Leveranciers</h2>
        <p className="text-sm text-slate-500">
          Leveranciers worden automatisch herkend bij het uploaden van transacties en door de AI. De bijbehorende categorie wordt dan ook automatisch toegewezen.
        </p>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex gap-2 px-4 py-3 border-b border-slate-100">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Zoeken…" value={vendorSearch}
                onChange={e => setVendorSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
            </div>
          </div>
          {filteredVendors.length > 0 ? (
            <div>
              {filteredVendors.map((vendor, i) => (
                <div key={vendor.id} className={cn('flex items-center justify-between px-4 py-3', i < filteredVendors.length - 1 && 'border-b border-slate-50')}>
                  <span className="text-sm font-medium text-slate-900">{vendor.name}</span>
                  <div className="flex items-center gap-3">
                    {vendor.category && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{vendor.category}</span>
                    )}
                    <button onClick={() => deleteVendor(vendor.id)} className="text-slate-300 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic px-4 py-4">
              {vendorSearch ? 'Geen leveranciers gevonden.' : 'Nog geen leveranciers.'}
            </p>
          )}
          <div className="flex gap-2 px-4 py-3 border-t border-slate-100">
            <input type="text" placeholder="Naam leverancier…" value={newVendorName}
              onChange={e => setNewVendorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addVendor()}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400" />
            <select value={newVendorCategory} onChange={e => setNewVendorCategory(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 bg-white">
              <option value="">Categorie…</option>
              {parentCategories.map(p => {
                const subs = subCats(p.id)
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
            <button onClick={addVendor} disabled={!newVendorName.trim() || savingVendor}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Account ── */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Account</h2>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <button onClick={handleSignOut} disabled={signingOut}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            <LogOut size={15} />
            {signingOut ? 'Uitloggen…' : 'Uitloggen'}
          </button>
        </div>
      </section>
    </div>
  )
}
