/**
 * Die Anmeldeseite — und die Sackgasse für Konten ohne Zugang.
 *
 * Drei Fälle, die alle hier landen können: niemand angemeldet (Formular),
 * angemeldet mit Zugang (weiter zum Start, hier gibt es nichts zu tun), und
 * angemeldet ohne Zugang. Der dritte ist der unangenehme: ein gültiges
 * Supabase-Konto, das in der Zugangsliste dieses Betriebs nicht steht. Ein
 * zweites Anmeldeformular hülfe da nicht — es sagt, was fehlt, und bietet den
 * Weg heraus.
 */

import { redirect } from 'next/navigation'

import { zugang } from '@/lib/anmeldung'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { abmelden } from './aktionen'
import { Anmeldemaske } from './maske'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const stand = await zugang()

  if (stand.art === 'angemeldet') redirect('/')
  if (stand.art === 'erstinbetriebnahme') redirect('/einrichtung')

  if (stand.art === 'kein-zugang') {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 p-4">
        <p className="mt-8 text-abschnitt text-text-muted uppercase">Inventur</p>
        <h1 className="mt-2 text-titel">Kein Zugang für dieses Konto</h1>
        <p className="mt-3 text-base text-text-muted">
          Das Konto <span className="text-text">{stand.email}</span> ist angemeldet, steht aber
          nicht in der Zugangsliste dieses Betriebs. Wer den Betrieb betreut, kann den Zugang
          eintragen.
        </p>
        <form action={abmelden} className="mt-6">
          <Schaltflaeche type="submit" art="sekundaer" breit>
            Abmelden
          </Schaltflaeche>
        </form>
      </main>
    )
  }

  return <Anmeldemaske />
}
