'use client'

import Link from 'next/link'
import { CreditCard, Receipt } from 'lucide-react'
import { useT } from '@/lib/i18n'

export default function HomePage() {
  const t = useT()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10">
      <div className="text-center">
        <h1 className="logo-text text-7xl text-gather-900">gather.</h1>
        <p className="text-sm text-gather-500 mt-6">{t('home_subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-md">
        <Link
          href="/cashier"
          className="group bg-white border border-gather-200 rounded-2xl p-8 flex flex-col items-center gap-4 hover:border-gather-400 hover:shadow-lg transition-all"
        >
          <div className="w-14 h-14 rounded-xl bg-gather-800 flex items-center justify-center group-hover:bg-gather-900 transition-colors">
            <CreditCard size={24} className="text-gather-50" />
          </div>
          <div className="text-center">
            <h2 className="font-semibold text-gather-900 text-base group-hover:text-gather-700 transition-colors">{t('home_add_report')}</h2>
            <p className="text-xs text-gather-500 mt-1">{t('home_add_report_sub')}</p>
          </div>
        </Link>

        <div className="bg-gather-50 border border-dashed border-gather-200 rounded-2xl p-8 flex flex-col items-center gap-4 opacity-50 cursor-not-allowed">
          <div className="w-14 h-14 rounded-xl bg-gather-200 flex items-center justify-center">
            <Receipt size={24} className="text-gather-400" />
          </div>
          <div className="text-center">
            <h2 className="font-semibold text-gather-600 text-base">{t('home_add_expenses')}</h2>
            <p className="text-xs text-gather-400 mt-1">{t('home_coming_soon')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
