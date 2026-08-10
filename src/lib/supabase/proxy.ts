import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { istOffenerPfad } from '@/lib/zugangswege'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Mit Fluid Compute diesen Client nicht in einer globalen Variable ablegen.
  // Immer pro Request neu erzeugen.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // Zwischen createServerClient und getClaims() keinen Code einfügen — sonst
  // werden Nutzer scheinbar zufällig ausgeloggt und der Fehler ist kaum auffindbar.

  // WICHTIG: Ohne getClaims() können bei serverseitigem Rendering mit dem
  // Supabase-Client Nutzer zufällig ausgeloggt werden.
  //
  // getClaims() prüft die Signatur des Tokens, getSession() liest nur ein
  // Cookie. Im Servercode ist allein das erste eine Aussage.
  //
  // Wirft der Aufruf (Auth-Dienst nicht erreichbar), gilt das hier als „nicht
  // angemeldet": ein Token, dessen Signatur niemand prüfen konnte, ist kein
  // Ausweis. Für das Lager ist das verkraftbar — ohne Netz zur Datenbank
  // könnte die Seite ohnehin nichts zeigen, und die begonnene Zählung liegt
  // im Gerät, nicht in der Sitzung.
  const claims = await gepruefteClaims(supabase)

  if (claims === null && !istOffenerPfad(request.nextUrl.pathname)) {
    // Für die API keine Umleitung: die Warteschlange der Zählmaske schickt
    // `fetch`, und eine Anmeldeseite mit Status 200 sähe sie als geglückte
    // Übertragung an — die Werte wären still weg. 401 lässt den Stapel liegen
    // und die Maske ihren Sende-Fehler zeigen.
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return mitCookies(
        NextResponse.json({ fehler: 'Nicht angemeldet' }, { status: 401 }),
        supabaseResponse,
      )
    }

    const url = request.nextUrl.clone()
    url.pathname = '/anmelden'
    url.search = ''
    return mitCookies(NextResponse.redirect(url), supabaseResponse)
  }

  // WICHTIG: supabaseResponse muss unverändert zurückgegeben werden. Wer eine
  // eigene Response baut, muss den Request durchreichen (NextResponse.next({ request }))
  // und die Cookies übernehmen (myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())).
  // Andernfalls laufen Browser und Server auseinander und die Session bricht vorzeitig ab.
  return supabaseResponse
}

async function gepruefteClaims(supabase: ReturnType<typeof createServerClient>) {
  try {
    const { data } = await supabase.auth.getClaims()
    return data?.claims ?? null
  } catch {
    return null
  }
}

/**
 * Übernimmt die Sitzungs-Cookies in eine eigene Antwort.
 *
 * Ohne das verliert eine Umleitung das gerade erneuerte Token, und die nächste
 * Anfrage kommt wieder ohne Anmeldung an — die Sitzung bricht dann in
 * unregelmässigen Abständen ab, was von aussen wie Zufall aussieht.
 */
function mitCookies(antwort: NextResponse, quelle: NextResponse): NextResponse {
  quelle.cookies.getAll().forEach((keks) => antwort.cookies.set(keks))
  return antwort
}
