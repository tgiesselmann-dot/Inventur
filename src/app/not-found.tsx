/**
 * Die Seite hinter jedem notFound(): eine Zählung, Lieferung oder Bestellung,
 * die es unter dieser Adresse nicht (mehr) gibt — etwa ein alter Verlauf oder
 * ein vertippter Link.
 *
 * Sie sagt das in einem Satz und bietet genau einen Weg an. Ohne diese Datei
 * endet der Aufruf auf der englischen Standardseite von Next.js, und die kennt
 * weder die Sprache noch die Rollen dieser App.
 */

import { Wegflaeche } from '@/ui/wegflaeche'

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2.5 p-4 text-center">
      <p className="text-abschnitt text-text-muted uppercase">Nicht gefunden</p>
      <h1 className="text-titel">Diese Seite gibt es nicht</h1>
      <p className="max-w-[44ch] text-base text-text-muted">
        Was hier stand, wurde vielleicht abgeschlossen oder der Link stimmt nicht mehr. Die
        Startseite zeigt, was gerade offen ist.
      </p>
      <div className="mt-4">
        <Wegflaeche href="/">Zur Startseite</Wegflaeche>
      </div>
    </main>
  )
}
