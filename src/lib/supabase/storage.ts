/**
 * Ablage der Wareneingangs-Belege in Supabase Storage: das Foto des
 * Lieferscheins und die Unterschrift des Fahrers.
 *
 * Nur vom Server importieren — Route-Handler und Server Actions. Der Zugriff
 * läuft über SUPABASE_SECRET_KEY, und der ist ein reines Server-Geheimnis: in
 * einer 'use client'-Datei wäre er im Bundle jedes Browsers. Das Projekt hat
 * keine Benutzeranmeldung; was in den Bucket darf, entscheiden die
 * Route-Handler mit ihren eigenen Prüfungen, nicht eine Storage-Policy.
 *
 * Der Bucket "belege" ist privat und wird einmalig im Dashboard angelegt
 * (Storage → New bucket, "Public bucket" aus). In der Datenbank stehen nur die
 * Pfade (Lieferung.lieferscheinBildPfad / unterschriftBildPfad), nie die
 * Bilder selbst.
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'belege'

/**
 * Der Pfad eines Belegs im Bucket. Betrieb und Lieferung gliedern die Ablage,
 * der Name sagt, was es ist ("lieferschein.jpg", "unterschrift.png") — je
 * Lieferung gibt es von beidem genau eines, ein Zeitstempel im Namen würde nur
 * Waisen erzeugen, wenn eine Aufnahme ersetzt wird.
 */
export function belegpfad(betriebId: string, lieferungId: string, name: string): string {
  return `${betriebId}/${lieferungId}/${name}`
}

/**
 * Legt einen Beleg im Bucket ab. Ersetzt eine vorhandene Datei unter demselben
 * Pfad — der zweite Anlauf nach einem Netzfehler soll keinen Konflikt auslösen.
 *
 * Wirft mit sprechender Meldung, wenn der Schlüssel fehlt oder Storage ablehnt;
 * die Route macht daraus ihre Fehlerantwort, ohne den Abschluss zu bestätigen.
 */
export async function belegHochladen(
  pfad: string,
  datei: Blob,
  contentType: string,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const schluessel = process.env.SUPABASE_SECRET_KEY
  if (url === undefined || url === '' || schluessel === undefined || schluessel === '') {
    throw new Error(
      'Belege lassen sich nicht ablegen: SUPABASE_SECRET_KEY fehlt in .env (siehe .env.example)',
    )
  }

  // Je Aufruf ein frischer Client statt eines Singletons: der Handler läuft
  // selten, und ein beim Start gebauter Client würde einen fehlenden Schlüssel
  // erst beim ersten Upload melden, aber mit unverständlicher Meldung.
  const supabase = createClient(url, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pfad, datei, { contentType, upsert: true })

  if (error !== null) {
    throw new Error(`Beleg konnte nicht abgelegt werden (Bucket "${BUCKET}"): ${error.message}`)
  }
}

/**
 * Holt einen Beleg aus dem Bucket, für die Nachverfolgung einer Abweichung:
 * dort sind Foto und Unterschrift der Grund, warum die Reklamation Bestand
 * hat. `null`, wenn es unter dem Pfad nichts gibt — die Route macht daraus
 * ihr 404, ein leeres Bild wäre keine Auskunft.
 *
 * Ausgeliefert wird über einen Route-Handler und nie über eine signierte URL:
 * der Bucket bleibt privat, und was hinaus darf, entscheidet der Server.
 */
export async function belegLaden(pfad: string): Promise<Blob | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const schluessel = process.env.SUPABASE_SECRET_KEY
  if (url === undefined || url === '' || schluessel === undefined || schluessel === '') {
    throw new Error(
      'Belege lassen sich nicht laden: SUPABASE_SECRET_KEY fehlt in .env (siehe .env.example)',
    )
  }

  const supabase = createClient(url, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.storage.from(BUCKET).download(pfad)
  if (error !== null) {
    // Storage meldet "Object not found" als Fehler; für die Route ist das kein
    // Ausfall, sondern die Auskunft "diesen Beleg gibt es nicht".
    if (/not.?found/i.test(error.message)) return null
    throw new Error(`Beleg konnte nicht geladen werden (Bucket "${BUCKET}"): ${error.message}`)
  }
  return data
}
