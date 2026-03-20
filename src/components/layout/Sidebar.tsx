'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutGrid, Calculator, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/', icon: LayoutGrid, label: 'Hub' },
  { href: '/administratie', icon: Calculator, label: 'Administratie' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-56 flex flex-col bg-white border-r border-slate-200 z-20">
      <div className="h-14 flex items-center px-4 border-b border-slate-200 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">A</span>
        </div>
        <span className="ml-3 font-semibold text-sm hidden lg:block">Admin OS</span>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                    active
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="hidden lg:block">{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="py-4 px-2 border-t border-slate-200 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-2 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Settings size={18} className="shrink-0" />
          <span className="hidden lg:block">Instellingen</span>
        </Link>
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
