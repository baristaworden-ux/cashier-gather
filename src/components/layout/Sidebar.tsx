'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CreditCard, Receipt, Printer, ClipboardList } from 'lucide-react'
import { LangToggle } from './LangToggle'
import { useT } from '@/lib/i18n'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NAV_ITEMS = (t: (k: any) => string) => [
  { label: t('nav_daily_report'), href: '/cashier',         icon: CreditCard },
  { label: t('nav_records'),      href: '/records',          icon: ClipboardList },
  { label: 'Expenses',            href: '/expenses',         icon: Receipt },
  { label: t('nav_template'),     href: '/cashier/template', icon: Printer },
]

export function Sidebar() {
  const pathname = usePathname()
  const t = useT()
  const NAV = NAV_ITEMS(t)

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-52 flex-col bg-gather-50 border-r border-gather-200 z-20">
        <div className="h-16 flex items-center px-5 border-b border-gather-200 shrink-0">
          <Link href="/" className="logo-text text-4xl text-gather-900 tracking-tight hover:text-gather-700 transition-colors">gather.</Link>
        </div>

        <nav className="flex-1 py-5 overflow-y-auto">
          <ul className="space-y-0.5 px-3">
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <li key={href}>
                  <Link href={href} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    active
                      ? 'bg-gather-800 text-gather-50 font-medium'
                      : 'text-gather-700 hover:bg-gather-100 hover:text-gather-900'
                  )}>
                    <Icon size={16} className="shrink-0" />
                    <span>{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="px-4 py-4 border-t border-gather-200 shrink-0">
          <LangToggle />
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gather-200 safe-area-bottom">
        <ul className="flex">
          {NAV.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href} className="flex-1">
                <Link href={href} className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 transition-colors',
                  active ? 'text-gather-900' : 'text-gather-400'
                )}>
                  <Icon size={20} className={active ? 'text-gather-800' : ''} />
                  <span className={cn('text-[10px] leading-tight text-center', active ? 'font-semibold text-gather-800' : '')}>
                    {label.length > 10 ? label.split(' ')[0] : label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
