import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { LanguageProvider } from '@/lib/i18n'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="flex min-h-screen">
        <Suspense fallback={<div className="fixed left-0 top-0 h-screen w-52 bg-white border-r border-gather-200" />}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 ml-52 min-h-screen">
          <div className="max-w-6xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </LanguageProvider>
  )
}
