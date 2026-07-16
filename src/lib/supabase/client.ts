import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!url.startsWith('http')) return null as any
  return createBrowserClient(url, key)
}
