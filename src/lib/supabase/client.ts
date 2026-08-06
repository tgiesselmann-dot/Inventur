import { createBrowserClient } from '@supabase/ssr'

// createBrowserClient nutzt intern ein Singleton — dieser Aufruf ist beliebig oft billig.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
