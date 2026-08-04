import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { LanguageProvider } from '@/lib/i18n'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div className="flex min-h-screen">
        <Suspense fallback={<div className="hidden md:block fixed left-0 top-0 h-screen w-52 bg-white border-r border-gather-200" />}>
          <Sidebar />
        </Suspense>
        {/* ml-52 only on desktop; pb-20 on mobile for bottom nav clearance */}
        <main className="flex-1 md:ml-52 min-h-screen pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </LanguageProvider>
  )
}
