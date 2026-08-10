/**
 * Die Liste der Zählungen und der Weg in eine neue.
 *
 * Bewusst knapp gehalten — gebraucht wird sie, weil es sonst keinen Weg zu
 * einer `/zaehlung/[id]` gäbe, und nicht als eigenes Werkzeug.
 *
 * Die Aktion dahinter steht in ./aktionen.ts: die Startseite bietet denselben
 * Weg an, und die Regel "eine offene Zählung von heute wird fortgesetzt" darf
 * es nur einmal geben.
 */

import Link from 'next/link'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { alsDatumstext } from '@/lib/datum'
import { prisma } from '@/lib/prisma'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Leerzustand } from '@/ui/zustand'

import { Geruest } from '../geruest'
import { zaehlungBeginnen } from './aktionen'

// Ein Datenbankzugriff macht eine Seite nicht von allein dynamisch: ohne diese
// Zeile rendert der Build die Liste einmal und friert sie ein — die Zählung von
// gestern Abend stünde dann morgen früh noch immer nicht darin.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const betrieb = await aktuellerBetrieb()
  const zaehlungen = await prisma.zaehlung.findMany({
    where: { betriebId: betrieb.id },
    orderBy: { datum: 'desc' },
    take: 20,
    include: { _count: { select: { positionen: true } } },
  })

  return (
    // Das Gerüst steht hier an der Seite selbst und nicht in einem Layout:
    // unter /zaehlung/[id] wohnt die Vollbild-Maske, die es nicht tragen darf.
    <Geruest>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-0 md:py-8">
        {/* Die Aktion steht auf dem Desktop rechts neben dem Titel — dieselbe
            Kopfzeile wie im Artikelstamm. Auf dem Telefon liegt sie im festen
            Fuss weiter unten: dort liegt alles Auslösende über dem Daumen. */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold md:text-titel">Zählungen</h1>
          <form action={zaehlungBeginnen} className="hidden md:block">
            <Schaltflaeche type="submit">Zählung beginnen</Schaltflaeche>
          </form>
          <Modusumschalter className="md:hidden" />
        </div>

        {zaehlungen.length === 0 ? (
          <div className="mt-6">
            <Leerzustand
              titel="Noch keine Zählung."
              erklaerung="„Zählung beginnen“ legt die erste an — gezählt wird in fester Reihenfolge, dem Laufweg durch das Lager."
            />
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-tapgap">
            {zaehlungen.map((zaehlung) => (
              <li key={zaehlung.id}>
                {/* Eine abgeschlossene Zählung führt auf ihr Ergebnis, eine
                    offene in die Maske: an einer geschlossenen Zählung ist
                    nichts mehr zu zählen, und das Ergebnis ist das, wonach
                    jemand hier sucht. */}
                <Link
                  href={
                    zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN
                      ? `/zaehlung/${zaehlung.id}/abschluss`
                      : `/zaehlung/${zaehlung.id}`
                  }
                  className="tap flex h-tap items-center justify-between gap-3 rounded-ctl border border-border bg-surface px-4 focus-visible:fokus"
                >
                  <span className="tabular-nums">{alsDatumstext(zaehlung.datum)}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">
                      {zaehlung._count.positionen} Werte ·{' '}
                      {zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN ? 'abgeschlossen' : 'offen'}
                    </span>
                    {/* Der Winkel sagt, dass die Zeile ein Weg ist — dieselbe
                        Zusage wie in der Lieferungsliste. */}
                    <span aria-hidden className="shrink-0 text-text-muted">
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form
          action={zaehlungBeginnen}
          className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <Schaltflaeche type="submit" breit>
            Zählung beginnen
          </Schaltflaeche>
        </form>
        <div className="pb-4" />
      </main>
    </Geruest>
  )
}
