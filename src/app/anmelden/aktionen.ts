'use server'

/**
 * An- und Abmeldung.
 *
 * Das Passwort liegt bei Supabase Auth und wird hier nur durchgereicht — diese
 * App speichert keins und prüft keins. Wer den Zugang hat, entscheidet danach
 * src/lib/anmeldung.ts anhand der Tabelle `benutzer`.
 *
 * Die Fehlermeldung ist mit Absicht unbestimmt: „E-Mail oder Passwort stimmt
 * nicht" verrät nicht, welche der beiden Angaben es war — und damit auch nicht,
 * welche Adressen es hier gibt.
 */

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { type Aktionszustand } from '../aktionszustand'

export async function anmelden(
  _zustand: Aktionszustand,
  formular: FormData,
): Promise<Aktionszustand> {
  const email = String(formular.get('email') ?? '')
    .trim()
    .toLowerCase()
  const passwort = String(formular.get('passwort') ?? '')

  if (email === '' || passwort === '') {
    return { art: 'fehler', meldung: 'E-Mail und Passwort werden beide gebraucht.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })

  if (error !== null) {
    // Netz weg heisst nicht falsches Passwort — und wer das verwechselt, tippt
    // im Lager dreimal dasselbe richtige Passwort ein und glaubt es irgendwann
    // selbst nicht mehr.
    if (error.status === undefined || error.status === 0) {
      return {
        art: 'fehler',
        meldung: 'Der Anmeldedienst ist gerade nicht erreichbar. Netz prüfen und erneut versuchen.',
      }
    }
    return { art: 'fehler', meldung: 'E-Mail oder Passwort stimmt nicht.' }
  }

  redirect('/')
}

/**
 * Abmelden.
 *
 * `scope: 'global'` beendet die Sitzung auch auf anderen Geräten. Für ein
 * Lager-Handy, das herumliegt, ist das die richtige Vorgabe: wer sich abmeldet,
 * meint das Konto und nicht dieses eine Fenster.
 */
export async function abmelden(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/anmelden')
}
