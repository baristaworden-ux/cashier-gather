'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutGrid, Calculator, LogOut, Settings,
  Home, List, Upload, ArrowLeftRight, BarChart2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const adminSubItems = [
  { tab: '',             label: 'Overzicht',   icon: Home,           href: '/administratie' },
  { tab: 'transacties',  label: 'Transacties',  icon: List,           href: '/administratie?tab=transacties' },
  { tab: 'uploaden',     label: 'Uploaden',     icon: Upload,         href: '/administratie?tab=uploaden' },
  { tab: 'overboeking',  label: 'Overboeking',  icon: ArrowLeftRight, href: '/administratie?tab=overboeking' },
  { tab: 'rapport',      label: 'Rapport',      icon: BarChart2,      href: '/administratie?tab=rapport' },
  { tab: 'instellingen', label: 'Instellingen', icon: Settings,       href: '/settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const currentTab = searchParams.get('tab') ?? ''
  const onAdmin = pathname.startsWith('/administratie') || pathname === '/settings'

  function isSubActive(item: typeof adminSubItems[number]) {
    if (item.tab === 'instellingen') return pathname === '/settings'
    if (!pathname.startsWith('/administratie')) return false
    return item.tab === currentTab
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-56 flex flex-col bg-white border-r border-slate-200 z-20">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-slate-200 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">A</span>
        </div>
        <span className="ml-3 font-semibold text-sm hidden lg:block">Admin OS</span>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {/* Hub */}
          <li>
            <Link
              href="/"
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                pathname === '/'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <LayoutGrid size={18} className="shrink-0" />
              <span className="hidden lg:block">Hub</span>
            </Link>
          </li>

          {/* Administratie parent */}
          <li>
            <Link
              href="/administratie"
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                onAdmin
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Calculator size={18} className="shrink-0" />
              <span className="hidden lg:block">Administratie</span>
            </Link>

            {/* Sub-items — only show labels on lg, icons always */}
            {onAdmin && (
              <ul className="mt-0.5 space-y-0.5">
                {adminSubItems.map(item => {
                  const active = isSubActive(item)
                  const Icon = item.icon
                  return (
                    <li key={item.tab}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 pl-3 lg:pl-7 pr-2 py-1.5 rounded-md text-sm transition-colors',
                          active
                            ? 'text-indigo-700 font-medium bg-indigo-50/60'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        )}
                      >
                        {/* Indent indicator — visible on lg */}
                        <span className="hidden lg:flex items-center shrink-0">
                          <span className={cn('w-px h-3 rounded mr-1', active ? 'bg-indigo-400' : 'bg-slate-200')} />
                        </span>
                        <Icon size={15} className="shrink-0 lg:hidden" />
                        <span className="hidden lg:block">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        </ul>
      </nav>

      {/* Sign out */}
      <div className="py-4 px-2 border-t border-slate-200">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <LogOut size={18} className="shrink-0" />
          <span className="hidden lg:block">Uitloggen</span>
        </button>
      </div>
    </aside>
  )
}
