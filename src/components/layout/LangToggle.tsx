'use client'

import { useLang } from '@/lib/i18n'

export function LangToggle() {
  const { lang, setLang } = useLang()
  return (
    <div className="flex items-center gap-1 bg-gather-100 rounded-lg p-1 text-xs font-medium select-none">
      <button
        onClick={() => setLang('en')}
        className={`px-2.5 py-1 rounded-md transition-colors ${
          lang === 'en'
            ? 'bg-white text-gather-900 shadow-sm'
            : 'text-gather-500 hover:text-gather-700'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLang('id')}
        className={`px-2.5 py-1 rounded-md transition-colors ${
          lang === 'id'
            ? 'bg-white text-gather-900 shadow-sm'
            : 'text-gather-500 hover:text-gather-700'
        }`}
      >
        ID
      </button>
    </div>
  )
}
