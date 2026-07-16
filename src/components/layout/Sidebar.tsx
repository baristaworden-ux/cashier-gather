'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CreditCard, Receipt, Printer, ClipboardList } from 'lucide-react'
import { LangToggle } from './LangToggle'
import { useT } from '@/lib/i18n'

export function Sidebar() {
  const pathname = usePathname()
  const t = useT()

  const NAV = [
    { label: t('nav_daily_report'), href: '/cashier',         icon: CreditCard },
    { label: t('nav_records'),      href: '/records',          icon: ClipboardList },
    { label: t('nav_template'),     href: '/cashier/template', icon: Printer },
    { label: 'Expenses',            href: '/expenses',         icon: Receipt, soon: true },
  ]

  return (
    <aside className="fixed left-0 top-0 h-screen w-52 flex flex-col bg-gather-50 border-r border-gather-200 z-20">
      {/* Logo */}
      <div className="h-20 flex items-center px-5 border-b border-gather-200 shrink-0">
        <Link href="/" className="logo-text text-4xl text-gather-900 tracking-tight hover:text-gather-700 transition-colors">gather.</Link>
      </div>

      <nav className="flex-1 py-5 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {NAV.map(({ label, href, icon: Icon, soon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                {soon ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm opacity-40 cursor-not-allowed text-gather-700">
                    <Icon size={16} className="shrink-0" />
                    <span className="flex items-center gap-2">
                      {label}
                      <span className="text-xs bg-gather-200 text-gather-500 px-1.5 py-0.5 rounded">{t('nav_soon')}</span>
                    </span>
                  </div>
                ) : (
                  <Link href={href} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    active
                      ? 'bg-gather-800 text-gather-50 font-medium'
                      : 'text-gather-700 hover:bg-gather-100 hover:text-gather-900'
                  )}>
                    <Icon size={16} className="shrink-0" />
                    <span>{label}</span>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Language toggle */}
      <div className="px-4 py-4 border-t border-gather-200 shrink-0">
        <LangToggle />
      </div>
    </aside>
  )
}
