/**
 * Die Einrichtung: der eine Schritt vor allem anderen.
 *
 * Alles in dieser App — Artikel, Zählungen, Lieferungen, Umsätze — hängt an
 * einem Betrieb. Solange keiner angelegt ist, zeigten sechs Seiten bisher
 * dieselbe Sackgasse mit einem Terminal-Befehl. Jetzt führen sie hierher, und
 * hier gibt es die eine Handlung, die weiterbringt.
 *
 * Die Seite legt genau einen Betrieb an. Eine Betriebsverwaltung ist sie nicht:
 * gibt es schon einen, führt sie auf die Startseite, statt einen zweiten
 * anzubieten.
 *
 * Sie legt zugleich den ersten Zugang an — den des Angemeldeten. Das ist der
 * einzige Moment, in dem sich jemand selbst eintragen darf, und er ist an eine
 * harte Bedingung geknüpft: es gibt noch keinen Betrieb. Danach ist die
 * Zugangsliste geschlossen und wächst nur über `npm run benutzer`.
 */

import { redirect } from 'next/navigation'

import { zugang } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Schaltflaeche } from '@/ui/schaltflaeche'

export const dynamic = 'force-dynamic'

async function betriebAnlegen(formular: FormData) {
  'use server'

  // Nur aus der Erstinbetriebnahme heraus: dieser Zustand setzt voraus, dass es
  // weder Betrieb noch Zugangsliste gibt. Jeder andere Zustand hat hier nichts
  // zu suchen — sonst trüge das Formular den Weg in einen fremden Betrieb.
  const stand = await zugang()
  if (stand.art !== 'erstinbetriebnahme') redirect('/')

  const name = String(formular.get('name') ?? '').trim()
  // Sichtbar scheitern statt still: `required` lässt Leerzeichen durch. Die
  // Aktion hat keinen useActionState-Vertrag — die Meldung reist als Parameter.
  if (name === '') redirect('/einrichtung?fehler=name')

  // Betrieb und erster Zugang in einer Transaktion: ein Betrieb ohne jeden
  // Zugang wäre von aussen nicht mehr zu betreten, und die Einrichtung liefe
  // nie wieder an — sie greift nur, solange es keinen Betrieb gibt.
  await prisma.betrieb.create({
    data: {
      name,
      benutzer: {
        create: {
          email: stand.email,
          authId: stand.authId,
          rolle: 'betriebsleiter',
        },
      },
    },
  })

  redirect('/')
}

export default async function Page({ searchParams }: PageProps<'/einrichtung'>) {
  const parameter = await searchParams

  const stand = await zugang()
  if (stand.art === 'angemeldet') redirect('/')
  if (stand.art !== 'erstinbetriebnahme') redirect('/anmelden')

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <p className="mt-8 text-abschnitt text-text-muted uppercase">Einrichtung</p>
      <h1 className="mt-2 text-titel">Zuerst den Betrieb anlegen</h1>
      <p className="mt-3 max-w-[60ch] text-base text-text-muted">
        Alles in dieser App — Artikel, Zählungen, Lieferungen, Umsätze — gehört zu einem Betrieb.
        Er wird einmal angelegt und trägt danach jede Zahl.
      </p>
      <p className="mt-3 max-w-[60ch] text-base text-text-muted">
        Sie sind als <span className="text-text">{stand.email}</span> angemeldet und werden mit
        diesem Schritt der erste Zugang des Betriebs. Weitere Zugänge kommen danach über{' '}
        <code className="font-mono">npm run benutzer</code> dazu.
      </p>

      {parameter.fehler === 'name' && (
        <div className="mt-4">
          <Hinweisleiste rolle="attention" titel="Es wurde kein Betrieb angelegt">
            Ohne Namen gibt es keinen Betrieb — Leerzeichen zählen nicht als Eingabe.
          </Hinweisleiste>
        </div>
      )}

      <form action={betriebAnlegen} className="mt-6 flex flex-col gap-tapgap sm:flex-row">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-beschriftung text-text-muted uppercase">Name des Betriebs</span>
          <input
            name="name"
            required
            autoComplete="organization"
            placeholder="Stadthafen Recklinghausen"
            className="h-tap w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-3 text-zeile text-text placeholder:text-text-muted focus:outline-2 focus:-outline-offset-1 focus:outline-focus"
          />
        </label>
        <div className="shrink-0 self-end">
          <Schaltflaeche type="submit">Betrieb anlegen</Schaltflaeche>
        </div>
      </form>

      <p className="mt-6 max-w-[60ch] text-sm text-text-muted">
        Wer mit den Beispieldaten der Vorlage starten will, kann stattdessen auf dem Rechner{' '}
        <code className="font-mono">npm run db:seed</code> ausführen — das legt Betrieb und
        Artikelstamm in einem Schritt an. Danach gehört noch{' '}
        <code className="font-mono">npm run benutzer</code> dazu: der Seed legt keinen Zugang an,
        und ein Betrieb ohne Zugang lässt niemanden mehr herein.
      </p>
    </main>
  )
}
