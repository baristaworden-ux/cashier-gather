import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div className="fixed left-0 top-0 h-screen w-16 lg:w-56 bg-white border-r border-slate-200" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 ml-16 lg:ml-56 min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
