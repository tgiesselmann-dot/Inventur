/**
 * Die Kassenumsätze: hochladen, sehen was da ist, weiter zur Zuordnung.
 *
 * Der Kassenexport ist die dritte der drei Quellen der Auswertung — neben der
 * Zählung und dem Wareneingang. Ohne ihn ist der Sollbestand nur Anfangsbestand
 * plus Lieferungen, und der ausgewiesene Schwund enthält alles, was verkauft
 * wurde.
 *
 * Die Reihenfolge auf dem Schirm ist die Reihenfolge der Dringlichkeit: was
 * jetzt zu tun ist (nicht zugeordnete Bezeichnungen), dann der Import, dann die
 * Kette der bisherigen Importe mit ihren Nahtstellen. Ein Anschluss steht an
 * der Zeile, die ihn aufreisst, und nicht als Gesamtmeldung oben — sonst weiss
 * niemand, welche Datei nachzuziehen ist.
 *
 * Gerechnet wird auch hier nichts: die Nahtstellen kommen aus
 * src/lib/importkette.ts, die Zahlen des Imports aus src/lib/kassenimport.ts.
 */

import Link from 'next/link'

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { alsDatumstext, alsKurzdatum } from '@/lib/datum'
import { alsAnschlussanzeige, kette, naechsterTag } from '@/lib/importkette'
import { prisma } from '@/lib/prisma'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { Wegflaeche } from '@/ui/wegflaeche'

import { Anschlussmarke, type Kettenbalken } from './anschlussleiste'
import { importLoeschen } from './aktionen'
import { Importmaske } from './importmaske'

export const dynamic = 'force-dynamic'

/** Wie viele Importe die Liste zeigt. Ältere stehen weiter in der Datenbank. */
const IMPORTE_GEZEIGT = 12

/** Wie viele Importe die Balkenreihe im Prüfschritt zeigt. */
const BALKEN_GEZEIGT = 6

export default async function Page() {
  const betrieb = await aktuellerBetrieb()

  const [importe, offen, uebergangen, zugeordnet] = await Promise.all([
    prisma.umsatzimport.findMany({
      where: { betriebId: betrieb.id },
      orderBy: { zeitraumVon: 'desc' },
      include: { _count: { select: { positionen: true } } },
    }),
    prisma.kassenartikel.count({ where: { betriebId: betrieb.id, bestaetigt: false } }),
    prisma.kassenartikel.count({
      where: { betriebId: betrieb.id, bestaetigt: true, bestandteile: { none: {} } },
    }),
    prisma.kassenartikel.count({
      where: { betriebId: betrieb.id, bestandteile: { some: {} } },
    }),
  ])

  // Die Kette läuft vom ältesten zum jüngsten, damit jede Naht an dem Import
  // hängt, der sie aufreisst. Gezeigt wird sie andersherum: der letzte Import
  // ist der, an den die nächste Datei anschliessen muss.
  const glieder = kette(
    importe.map((eintrag) => ({
      ...eintrag,
      von: eintrag.zeitraumVon,
      bis: eintrag.zeitraumBis,
    })),
  ).reverse()

  const naechster = naechsterTag(
    importe.map((eintrag) => ({ von: eintrag.zeitraumVon, bis: eintrag.zeitraumBis })),
  )

  // Die letzten Importe als Balkenreihe für den Prüfschritt: Lücken stehen als
  // eigene Fläche zwischen den Importen, die sie aufreissen.
  const balken: Kettenbalken[] = glieder
    .slice(0, BALKEN_GEZEIGT)
    .reverse()
    .flatMap((glied) => [
      ...(glied.naht?.art === 'luecke'
        ? [
            {
              art: 'luecke' as const,
              beschriftung: `${glied.naht.tage} ${glied.naht.tage === 1 ? 'Tag' : 'Tage'}`,
              tage: glied.naht.tage,
            },
          ]
        : []),
      {
        art: 'import' as const,
        beschriftung: alsKurzdatum(glied.eintrag.zeitraumVon),
        tage: glied.tage,
      },
    ])
  const luecken = glieder.filter((glied) => glied.naht?.art === 'luecke').length
  const doppelte = glieder.filter((glied) => glied.naht?.art === 'ueberschneidung').length

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-titel">Verkaufszahlen aus der Kasse</h1>
          <p className="mt-1 max-w-[90ch] text-base text-text-muted">
            Der Sollbestand entsteht aus Anfangsbestand, Lieferungen und diesen Verkäufen. Deshalb
            entscheidet hier eine Frage alles: liegt zwischen zwei Importen ein Tag, der in keinem
            von beiden steht — oder einer, der in beiden steht.
          </p>
        </div>
        <Modusumschalter className="md:hidden" />
      </div>

      {offen > 0 && (
        // Die Leiste trägt eine auslösende Fläche — auf dem Telefon gehört die
        // ans untere Ende des Screens, auf dem Desktop bleibt sie beim Befund.
        <div className="order-last mt-4 md:order-none">
          <Hinweisleiste
            rolle="attention"
            titel={`${offen} ${offen === 1 ? 'Kassenbezeichnung ist' : 'Kassenbezeichnungen sind'} keinem Artikel zugeordnet`}
            aktion={
              <Wegflaeche href="/umsatz/zuordnung">Zuordnung öffnen</Wegflaeche>
            }
          >
            Ihre gebuchten Mengen liegen in der App, gehen aber in keinen Sollbestand ein — der
            Schwund fällt dadurch zu niedrig aus. Die Zuordnung wirkt rückwirkend auf alle Importe.
          </Hinweisleiste>
        </div>
      )}

      <Importmaske
        naechsterTag={naechster === null ? null : alsDatumstext(naechster)}
        letztesEnde={importe.length === 0 ? null : alsDatumstext(importe[0].zeitraumBis)}
        balken={balken}
      />

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-zeile">Bisherige Importe</h2>
            <p className="mt-1 max-w-[80ch] text-sm text-text-muted">
              Jede Zeile nennt ihren Anschluss an die Zeile darunter. Solange hier eine Lücke oder
              eine Überschneidung steht, ist jede Schwundrechnung falsch, die über sie hinweggeht.
            </p>
          </div>
          <p className="text-sm text-text-muted">
            {importe.length === 0
              ? 'Noch kein Import'
              : `${importe.length} ${importe.length === 1 ? 'Import' : 'Importe'} · ${luecken} ${luecken === 1 ? 'Lücke' : 'Lücken'} · ${doppelte} ${doppelte === 1 ? 'Überschneidung' : 'Überschneidungen'}`}
          </p>
        </div>

        {importe.length === 0 ? (
          <p className="mt-3 rounded-ctl border border-border p-4 text-sm text-text-muted">
            Noch kein Kassenexport importiert. Bis dahin rechnet die Auswertung ohne Verkäufe, und
            was aus dem Lager gegangen ist, erscheint dort vollständig als Schwund.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-ctl border border-border">
            {glieder.slice(0, IMPORTE_GEZEIGT).map((glied) => {
              const eintrag = glied.eintrag
              const anschluss = glied.naht === null ? null : alsAnschlussanzeige(glied.naht)

              return (
                <li
                  key={eintrag.id}
                  className="grid items-center gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[210px_minmax(0,1fr)_100px_minmax(0,1.3fr)_auto]"
                >
                  <span className="text-zeile">
                    {alsDatumstext(eintrag.zeitraumVon)} – {alsDatumstext(eintrag.zeitraumBis)}
                  </span>
                  <span className="truncate font-mono text-sm text-text-muted">
                    {eintrag.dateiname}
                  </span>
                  <span className="text-sm text-text-muted lg:text-right">
                    {eintrag._count.positionen} Zeilen
                  </span>
                  {anschluss === null ? (
                    <span className="text-sm text-text-muted">ältester Import</span>
                  ) : (
                    <Anschlussmarke anschluss={anschluss} />
                  )}
                  <form action={importLoeschen}>
                    <input type="hidden" name="id" value={eintrag.id} />
                    <button
                      type="submit"
                      className="tap min-h-tap rounded-ctl px-3 text-sm font-medium text-danger-text focus-visible:fokus"
                    >
                      Löschen
                    </button>
                  </form>
                </li>
              )
            })}
            {importe.length > IMPORTE_GEZEIGT && (
              <li className="bg-bg px-4 py-3 text-sm text-text-muted">
                {IMPORTE_GEZEIGT} von {importe.length} Importen · ältere bleiben in der Auswertung
                gerechnet
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-zeile">Zuordnung</h2>
          <Link
            href="/umsatz/zuordnung"
            className="tap -mr-2 inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium text-primary-text focus-visible:fokus"
          >
            {offen > 0 ? `${offen} offen bearbeiten` : 'Ansehen'}
          </Link>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          {zugeordnet} zugeordnet · {uebergangen} übergangen ·{' '}
          <span className={offen > 0 ? 'text-attention-text' : ''}>{offen} offen</span>
        </p>
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-zeile">Entscheidungen</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Entscheidung titel="Der Anschluss steht an jeder Zeile">
            Nicht als Gesamtmeldung oben, sondern an dem Import, der die Lücke aufreisst. So ist
            klar, welche Datei nachzuziehen ist.
          </Entscheidung>
          <Entscheidung titel="Lücke hält nicht auf, Überschneidung schon">
            Eine Lücke lässt sich später mit einer weiteren Datei schliessen. Doppelte Tage lassen
            sich nachträglich nicht mehr trennen — dort bleibt der Import gesperrt, bis der
            vorhandene ersetzt wird.
          </Entscheidung>
          <Entscheidung titel="Der Zeitraum ist kein Eingabefeld">
            Er kommt aus dem Kopfblock der Datei. Ein von Hand vorgezogener Anfang behauptet
            Verkaufstage, die in keinem Export stehen — und der Schwund wäre still falsch.
          </Entscheidung>
          <Entscheidung titel="Unbekanntes hält den Import nicht auf">
            Die Mengen kommen zuerst herein, die Zuordnung folgt und wirkt rückwirkend. Andernfalls
            würde eine neue Cocktailkarte den Import blockieren.
          </Entscheidung>
        </div>
      </section>
    </main>
  )
}

function Entscheidung({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-ctl border border-border p-3">
      <p className="text-sm font-semibold">{titel}</p>
      <p className="mt-1 text-sm text-text-muted">{children}</p>
    </div>
  )
}
