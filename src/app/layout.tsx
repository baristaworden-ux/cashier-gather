import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Admin OS',
  description: 'Your personal admin hub',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="antialiased">{children}</body>
    </html>
  )
}
