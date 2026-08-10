/**
 * Der Nachbildschirm "Preise klären": die an der Rampe festgehaltenen
 * Preisabweichungen einer Lieferung, jede mit ihrer Entscheidung.
 *
 * Ein eigener Bildschirm und kein Dialog in der Prüfmaske, weil die
 * Entscheidung nicht an die Rampe gehört: dort steht der Fahrer und wartet,
 * hier geht es um den Artikelstamm. Die Prüfmaske führt nach der Bestätigung
 * hierher, und die offenen Punkte der Startseite kennen den Weg auch — wer
 * "später" drückt, verliert nichts.
 *
 * Gerechnet wird nichts: die Beträge und der Plausibilitäts-Hinweis kommen
 * fertig aus `preisvergleich` in src/lib/wareneingang.ts, die Übernahme in den
 * Stamm rechnet src/lib/einheiten.ts in der Serveraktion.
 */

import { notFound } from 'next/navigation'

import { Abweichungsart, Abweichungsstatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { alsDatumstext } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'
import { preisvergleich, type PruefPosition } from '@/lib/wareneingang'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss, Vollbild } from '@/ui/vollbild'
import { Wegflaeche } from '@/ui/wegflaeche'
import { Leerzustand } from '@/ui/zustand'

import { preisBehalten, preisUebernehmen } from './aktionen'

export default async function Page({ params }: PageProps<'/lieferungen/[id]/preise'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  // Über Id und Betrieb gesucht: eine fremde Lieferung ist damit nicht gefunden.
  const betrieb = await aktuellerBetrieb()
  const lieferung = await prisma.lieferung.findFirst({
    where: { id, betriebId: betrieb.id },
    select: { id: true, lieferant: true, belegNr: true, datum: true },
  })
  if (lieferung === null) notFound()

  const offene = await prisma.abweichung.findMany({
    where: {
      art: Abweichungsart.PREISABWEICHUNG,
      status: Abweichungsstatus.OFFEN,
      lieferposition: { lieferungId: id },
    },
    orderBy: { festgestelltAm: 'asc' },
    include: { lieferposition: { include: { artikel: true } } },
  })

  const zeilen = offene.map((abweichung) => {
    // Für den Vergleich reicht eine Position aus Artikel und
    // Lieferscheinpreis — mehr schaut `preisvergleich` nicht an. Die Mengen
    // dieser Lieferung sind hier keine Frage mehr.
    const position: PruefPosition = {
      id: abweichung.id,
      artikel: abweichung.lieferposition.artikel,
      bestellt: null,
      bestellpositionId: null,
      bestellterArtikel: null,
      lieferschein: '0',
      tatsaechlich: '0',
      ekPreisCentLieferschein: abweichung.lieferposition.ekPreisCentLieferschein,
      nachlieferungZugesagtBis: null,
      abweichungen: [],
    }
    return {
      id: abweichung.id,
      artikel: abweichung.lieferposition.artikel,
      vergleich: preisvergleich(position),
    }
  })

  return (
    <Vollbild>
      <header className="shrink-0 border-b border-border bg-surface px-4 pt-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-zeile font-semibold">Preise klären</h1>
            <p className="text-sm text-text-muted">
              {lieferung.lieferant} ·{' '}
              <span className="whitespace-nowrap">
                Beleg{' '}
                <span className="font-mono font-normal tracking-normal">{lieferung.belegNr}</span>
              </span>{' '}
              · {alsDatumstext(lieferung.datum)}
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto bg-surface">
        {zeilen.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <Leerzustand
              titel="Keine offene Preisabweichung"
              erklaerung="Für diese Lieferung ist nichts mehr zu klären."
            />
          </div>
        ) : (
          <ul>
            {zeilen.map((zeile) => (
              <li key={zeile.id} className="border-b border-border px-4 py-4">
                <p className="text-zeile font-semibold">{zeile.artikel.name}</p>
                <p className="text-sm text-text-muted">{zeile.artikel.lieferGebindeText}</p>

                {zeile.vergleich === null ? (
                  <>
                    {/* Der Stammpreis hat sich seit der Rampe geändert — es
                        gibt nichts mehr zu übernehmen, nur noch zu schliessen. */}
                    <p className="mt-2 text-base text-text-muted">
                      Der Preis stimmt inzwischen mit dem Stamm überein.
                    </p>
                    <form action={preisBehalten} className="mt-3">
                      <input type="hidden" name="abweichungId" value={zeile.id} />
                      <Schaltflaeche type="submit" art="sekundaer" breit>
                        Abweichung schliessen
                      </Schaltflaeche>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-base tabular-nums">
                      <span className="text-text-muted">hinterlegt {zeile.vergleich.hinterlegt}</span>{' '}
                      <span aria-hidden>→</span>{' '}
                      <span className="font-semibold">
                        Lieferschein {zeile.vergleich.lieferschein}
                      </span>
                    </p>
                    {zeile.vergleich.hinweis !== null && (
                      <p className="mt-1 text-sm font-semibold text-attention-text">
                        {zeile.vergleich.hinweis}
                      </p>
                    )}
                    <div className="mt-3 flex gap-tapgap">
                      <form action={preisUebernehmen} className="flex-1">
                        <input type="hidden" name="abweichungId" value={zeile.id} />
                        <Schaltflaeche type="submit" breit>
                          {zeile.vergleich.lieferschein} übernehmen
                        </Schaltflaeche>
                      </form>
                      <form action={preisBehalten} className="flex-1">
                        <input type="hidden" name="abweichungId" value={zeile.id} />
                        <Schaltflaeche type="submit" art="sekundaer" breit>
                          {zeile.vergleich.hinterlegt} behalten
                        </Schaltflaeche>
                      </form>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <Maskenfuss>
        {/* "später" ist ein voller Ausgang, keine Strafe: die offenen Punkte
            der Startseite führen wieder hierher. */}
        <Wegflaeche href="/lieferungen" art="sekundaer" breit>
          {zeilen.length === 0 ? 'Zu den Lieferungen' : 'später'}
        </Wegflaeche>
      </Maskenfuss>
    </Vollbild>
  )
}
