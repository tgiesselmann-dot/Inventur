import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
  await supabase.auth.getClaims()

  // Hier später den Auth-Guard ergänzen, z. B.:
  //   const { data } = await supabase.auth.getClaims()
  //   if (!data?.claims && !request.nextUrl.pathname.startsWith('/login')) {
  //     const url = request.nextUrl.clone()
  //     url.pathname = '/login'
  //     return NextResponse.redirect(url)
  //   }

  // WICHTIG: supabaseResponse muss unverändert zurückgegeben werden. Wer eine
  // eigene Response baut, muss den Request durchreichen (NextResponse.next({ request }))
  // und die Cookies übernehmen (myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())).
  // Andernfalls laufen Browser und Server auseinander und die Session bricht vorzeitig ab.
  return supabaseResponse
}
