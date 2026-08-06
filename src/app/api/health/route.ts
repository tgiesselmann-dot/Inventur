import { createClient } from '@/lib/supabase/server'

type CheckResult = { ok: true; detail: string } | { ok: false; error: string }

// Prisma verpackt Treiberfehler; die eigentliche Ursache
// ("password authentication failed", "ENOTFOUND", …) steckt oft in `cause`.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  return cause instanceof Error ? `${error.message}: ${cause.message}` : error.message
}

// Prüft die Data API (Auth-Service über den publishable key).
async function checkDataApi(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL oder _PUBLISHABLE_KEY fehlt' }
  }

  try {
    // Der Server-Client wird mitgebaut, damit auch die Cookie-Verdrahtung anschlägt.
    await createClient()

    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: 'no-store',
    })

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status} von /auth/v1/health` }
    }

    return { ok: true, detail: `Auth-Service erreichbar (HTTP ${response.status})` }
  } catch (error) {
    return { ok: false, error: describeError(error) }
  }
}

// Prüft die direkte Postgres-Verbindung über den Pooler.
async function checkPostgres(): Promise<CheckResult> {
  try {
    // Erst hier importieren: das Modul wirft beim Laden, wenn DATABASE_URL fehlt.
    const { prisma } = await import('@/lib/prisma')
    const rows = await prisma.$queryRaw<{ version: string }[]>`select version()`

    return { ok: true, detail: rows[0]?.version ?? 'unbekannte Version' }
  } catch (error) {
    return { ok: false, error: describeError(error) }
  }
}

export async function GET() {
  const [dataApi, postgres] = await Promise.all([checkDataApi(), checkPostgres()])
  const ok = dataApi.ok && postgres.ok

  return Response.json({ ok, dataApi, postgres }, { status: ok ? 200 : 503 })
}
