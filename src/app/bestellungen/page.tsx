/**
 * Die Bestellungen und der Weg in einen neuen Vorschlag.
 *
 * Der Lieferstand jeder Zeile wird gerechnet, nicht gespeichert: bestellte
 * Gebinde gegen die, die auf sie geliefert wurden. Ein Statusfeld dafür wäre
 * eine zweite Wahrheit und beim ersten vergessenen Update falsch — dieselbe
 * Regel wie beim Kontrollstand der Lieferungen.
 */

import { Decimal } from '@prisma/client/runtime/client'
import Link from 'next/link'

import { BestellStatus } from '@/generated/prisma/enums'
import {
  bestellwerttext,
  gelieferteGebinde,
  lieferstand,
  mengensumme,
  statusText,
  type Lieferstand,
} from '@/lib/bestellung'
import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { alsDatumstext } from '@/lib/datum'
import { prisma } from '@/lib/prisma'
import { Modusumschalter } from '@/ui/modus'
import { Wegflaeche } from '@/ui/wegflaeche'
import { Leerzustand } from '@/ui/zustand'

export const dynamic = 'force-dynamic'

/** Was in der Zeile rechts steht. */
function stand(bestellung: {
  status: BestellStatus
  positionen: {
    anzahlGebinde: Decimal
    lieferpositionen: {
      anzahlGebindeTatsaechlich: Decimal
      lieferung: { geprueftAm: Date | null }
    }[]
  }[]
}): string {
  const positionen = bestellung.positionen.length
  const zeilen = positionen === 1 ? '1 Position' : `${positionen} Positionen`

  // Vor dem Abschicken gibt es keine Lieferung, auf die sich ein Lieferstand
  // beziehen könnte; nach dem Stornieren erwartet niemand mehr eine.
  if (bestellung.status !== BestellStatus.VERSENDET) {
    return `${statusText(bestellung.status)} · ${zeilen}`
  }

  const geliefert: Lieferstand = lieferstand(
    bestellung.positionen.map((position) => ({
      bestellt: position.anzahlGebinde,
      geliefert: gelieferteGebinde(position.lieferpositionen) ?? new Decimal(0),
    })),
  )

  switch (geliefert) {
    case 'nichts':
      return `abgeschickt · ${zeilen} · Lieferung steht aus`
    case 'teilweise':
      return `abgeschickt · ${zeilen} · teilweise geliefert`
    case 'vollstaendig':
      return `abgeschickt · ${zeilen} · vollständig geliefert`
  }
}

export default async function Page() {
  const { betrieb } = await pflichtBetriebsleiter()
  const bestellungen = await prisma.bestellung.findMany({
    where: { betriebId: betrieb.id },
    orderBy: { datum: 'desc' },
    take: 20,
    include: {
      positionen: {
        include: {
          artikel: { omit: { einheitsgroesseLiter: true } },
          // Ungefiltert: ob eine Lieferung als Zugang zählt, entscheidet
          // `gelieferteGebinde` — die Regel "nur geprüfte" steht dort, nicht
          // in dieser Abfrage.
          lieferpositionen: {
            select: {
              anzahlGebindeTatsaechlich: true,
              lieferung: { select: { geprueftAm: true } },
            },
          },
        },
      },
    },
  })

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-0 md:py-8">
      {/* Die Aktion steht auf dem Desktop rechts neben dem Titel — dieselbe
          Kopfzeile wie im Artikelstamm. Auf dem Telefon liegt sie im festen
          Fuss weiter unten: dort liegt alles Auslösende über dem Daumen. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-titel">Bestellungen</h1>
        <span className="hidden md:inline-flex">
          <Wegflaeche href="/bestellungen/vorschlag">Bestellvorschlag rechnen</Wegflaeche>
        </span>
        <Modusumschalter className="md:hidden" />
      </div>

      {bestellungen.length === 0 ? (
        <div className="mt-6">
          <Leerzustand
            titel="Noch keine Bestellung."
            erklaerung="Der Vorschlag entsteht aus der letzten Zählung und dem Verbrauch der letzten Wochen — gerechnet wird er über „Bestellvorschlag rechnen“."
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-tapgap">
          {bestellungen.map((bestellung) => {
            // Dieselbe Summe wie in Positionsmaske und Vorschlag — ein Beleg,
            // ein Betrag. Ein fehlender Preis wird benannt, nie als 0 mitgezählt.
            const gesamt = mengensumme(bestellung.positionen, (position) =>
              Number(position.anzahlGebinde),
            )

            return (
              <li key={bestellung.id}>
                {/* Auf dem Telefon steht der Stand unter der Beschriftung: neben
                    ihr drückt sein langer Text ("abgeschickt · 4 Positionen ·
                    Lieferung steht aus") Datum, Lieferant und Betrag auf null
                    Breite. */}
                <Link
                  href={`/bestellungen/${bestellung.id}`}
                  className="tap flex min-h-tap flex-col justify-center gap-1 rounded-ctl border border-border bg-surface px-4 py-3 focus-visible:fokus md:h-tap md:flex-row md:items-center md:justify-between md:gap-3 md:py-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base">
                      <span className="tabular-nums">{alsDatumstext(bestellung.datum)}</span> ·{' '}
                      {bestellung.lieferant}
                    </span>
                    <span className="block truncate text-xs text-text-muted tabular-nums">
                      {bestellwerttext(gesamt)}
                      {gesamt.wertCent > 0 &&
                        gesamt.ohnePreis > 0 &&
                        ` · ${gesamt.ohnePreis} ohne Preis`}
                    </span>
                  </span>
                  <span className="text-sm text-text-muted md:shrink-0 md:text-right">
                    {stand(bestellung)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <Wegflaeche href="/bestellungen/vorschlag" breit>
          Bestellvorschlag rechnen
        </Wegflaeche>
      </div>
      <div className="pb-4" />
    </main>
  )
}
