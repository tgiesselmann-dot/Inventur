import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Greift für alle Pfade außer:
     * - _next/static (statische Dateien)
     * - _next/image (Bildoptimierung)
     * - favicon.ico
     * - gängige Bildformate
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
