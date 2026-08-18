/**
 * Die Startseite: der erste Bildschirm nach dem Öffnen.
 *
 * Sie beantwortet drei Fragen, und die Reihenfolge ist die Rangfolge:
 *
 *  1. Muss ich jetzt zählen? Die Antwort ist eine Fläche, keine Auskunft.
 *  2. Was ist offen? Konkrete Sätze, jeder mit dem Weg an die zuständige
 *     Stelle — nicht "3 Hinweise", sondern "Lieferung vom 04.08. ohne
 *     Positionen".
 *  3. Wie stand es zuletzt? Drei Zahlen der letzten abgeschlossenen Zählung.
 *
 * Auf dem Telefon liegt die auslösende Fläche im festen Fuss, im unteren
 * Drittel. Die Zeilen darüber sind Wege und keine Handlungen — sie führen
 * weiter, sie lösen nichts aus. Auf dem Desktop wandert derselbe Einstieg als
 * Band nach oben, und aus den Bereichszeilen wird die Seitennavigation.
 *
 * Gerechnet wird hier nichts. Die offenen Punkte samt ihrem Wortlaut kommen aus
 * src/lib/offene-punkte.ts, die Kennzahlen aus src/lib/auswertung-daten.ts, der
 * Fortschritt aus src/lib/zaehlung.ts, Datum und Kalenderwoche aus
 * src/lib/datum.ts.
 */

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { pflichtBenutzer } from '@/lib/anmeldung'
import { istBetriebsleiter, punkteFuerRolle, sichtbareBereiche } from '@/lib/berechtigungen'
import { bestandswerttext, schwundquotentext } from '@/lib/auswertung'
import { letzteKennzahlen, type Letztestand } from '@/lib/auswertung-daten'
import { alsDatumstext, alsKurzdatum, alsLangdatum, heute, kalenderwoche } from '@/lib/datum'
import {
  BEREICHE,
  offenePunkte,
  offenText,
  punkteJeBereich,
  type Bereichsschluessel,
  type OffenerPunkt,
} from '@/lib/offene-punkte'
import { offenlage } from '@/lib/offene-punkte-daten'
import { prisma } from '@/lib/prisma'
import { fortschrittsanteil, type Fortschritt } from '@/lib/zaehlung'
import { Synczeile } from '@/offline/synczeile'
import { Fortschrittsbalken } from '@/ui/fortschrittsbalken'
import { Kennzahl } from '@/ui/kennzahl'
import { Listenzeile } from '@/ui/listenzeile'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Seitennavigation } from '@/ui/seitennavigation'
import { Wegflaeche } from '@/ui/wegflaeche'
import { Leerzustand } from '@/ui/zustand'

import { abmelden } from './anmelden/aktionen'
import { zaehlungBeginnen } from './zaehlung/aktionen'
import { ZaehlungVerwerfen } from './zaehlung/verwerfen'

// Ohne diese Zeile rendert der Build die Seite einmal und friert sie ein — der
// Stand von gestern Abend stünde dann morgen früh noch immer da.
export const dynamic = 'force-dynamic'

/** Die Überschrift eines Abschnitts: Versalien, leiser als das darunter. */
const ABSCHNITT = 'text-abschnitt uppercase text-text-muted'

/**
 * Ein Stapel Listenzeilen: 8 px Abstand, jede Zeile ihre eigene Karte — die
 * Zeilen sind Berührflächen, und zwischen zwei auslösenden Flächen liegt nie
 * weniger (gap-tapgap). Die Anzeige der Karte trägt die Listenzeile selbst.
 * Der Nehmer setzt das Display davor: `flex` — oder `hidden`/`md:flex`, wo
 * die Liste nur eine Breite betrifft.
 */
const LISTE = 'flex-col gap-tapgap'

export default async function Page() {
  const benutzer = await pflichtBenutzer()
  const betrieb = benutzer.betrieb
  // Bestandswert und Schwund sind Geld — sie erscheinen nur der
  // Betriebsleitung. Der Mitarbeiter sieht Zählstand, offene Punkte seiner
  // Bereiche und den Weg in die Zählung.
  const mitWerten = istBetriebsleiter(benutzer.rolle)

  const [laufende, artikelzahl, letzte, lage] = await Promise.all([
    // Die jüngste offene Zählung, nicht nur die von heute: eine gestern
    // begonnene und nicht abgeschlossene Zählung ist das Erste, was diese Seite
    // sagen muss — sonst läge sie unauffindbar in der Datenbank, während oben
    // "Zählung beginnen" steht.
    prisma.zaehlung.findFirst({
      where: { betriebId: betrieb.id, status: ZaehlungStatus.OFFEN },
      orderBy: { datum: 'desc' },
      include: { _count: { select: { positionen: true } } },
    }),
    prisma.artikel.count({ where: { betriebId: betrieb.id, aktiv: true } }),
    letzteKennzahlen(betrieb.id),
    offenlage(betrieb.id),
  ])

  const punkte = punkteFuerRolle(offenePunkte(lage), benutzer.rolle)
  const jeBereich = punkteJeBereich(punkte)
  const bereiche = sichtbareBereiche(benutzer.rolle)
  const heutigesDatum = heute()

  const stand: Zaehlstand =
    laufende === null
      ? { art: 'keine', letztesDatum: letzte?.datum ?? null, artikelzahl }
      : {
          art: 'laeuft',
          zaehlungId: laufende.id,
          datum: laufende.datum,
          fortschritt: { gezaehlt: laufende._count.positionen, gesamt: artikelzahl },
        }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Seitennavigation
        betrieb={betrieb.name}
        bereiche={bereiche}
        jeBereich={jeBereich}
        artikelzahl={artikelzahl}
        aktiv="start"
        angemeldet={{ email: benutzer.email, abmelden }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-end justify-between gap-3 border-b border-border bg-surface px-4 pt-2 pb-3.5 md:hidden">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate text-xl font-semibold">{betrieb.name}</h1>
            <p className="text-sm text-text-muted">{alsLangdatum(heutigesDatum)}</p>
          </div>
          <Modusumschalter className="-mr-2 -mb-1.5" />
        </header>

        <main className="flex flex-1 flex-col gap-5 p-4 md:gap-8 md:px-11 md:py-9">
          <div className="hidden items-baseline justify-between md:flex">
            <h1 className="text-titel">{alsLangdatum(heutigesDatum)}</h1>
            <p className="text-base text-text-muted">KW {kalenderwoche(heutigesDatum)}</p>
          </div>

          <div className="hidden md:block">
            <Zaehlband stand={stand} />
          </div>

          <div
            className={`flex flex-col gap-5 md:items-start md:gap-7 ${
              mitWerten ? 'md:grid md:grid-cols-[1.3fr_1fr]' : ''
            }`}
          >
            <section className="flex flex-col gap-2">
              <h2 className={ABSCHNITT}>Offen</h2>
              {punkte.length === 0 ? (
                <Leerzustand
                  titel="Nichts offen"
                  erklaerung="Die Kassendaten sind aktuell, jede Bezeichnung ist zugeordnet, und keine Lieferung wartet auf ihre Positionen."
                />
              ) : (
                <>
                  {/* Zweimal dieselbe Liste: auf dem Telefon steht rechts der
                      Winkel, auf dem Desktop das, was der Weg tut ("Zuordnen").
                      Der Satz auf 390 px trägt beides nicht nebeneinander. */}
                  <div className={`flex ${LISTE} md:hidden`}>
                    <Offenliste punkte={punkte} />
                  </div>
                  <div className={`hidden ${LISTE} md:flex`}>
                    <Offenliste punkte={punkte} mitAktion />
                  </div>
                </>
              )}
            </section>

            {mitWerten && (
              <section className="flex flex-col gap-2">
                <h2 className={ABSCHNITT}>Letzte abgeschlossene Zählung</h2>
                <Letztekennzahlen stand={letzte} />
              </section>
            )}
          </div>

          {/* Die Bereiche stehen auf dem Telefon hier; auf dem Desktop sind sie
              die Seitennavigation links und wären hier ein zweites Menü. */}
          <section className="flex flex-col gap-2 md:hidden">
            <h2 className={ABSCHNITT}>Bereiche</h2>
            <div className={`flex ${LISTE}`}>
              {bereiche.map((bereich) => (
                <Listenzeile
                  key={bereich.schluessel}
                  titel={bereich.name}
                  wert={
                    bereich.schluessel === 'artikel'
                      ? String(artikelzahl)
                      : offenText(jeBereich[bereich.schluessel])
                  }
                  punkt={jeBereich[bereich.schluessel] > 0 ? 'attention' : undefined}
                  ziel={bereich.ziel}
                />
              ))}
            </div>
          </section>

          {/* Nur auf dem Telefon: auf dem Desktop steht beides am Fuss der
              Seitennavigation. Der Weg hinaus gehört ans Ende der Seite — er
              ist das Letzte, was jemand sucht, und darf keinem Bereich im Weg
              stehen. */}
          <section className="flex flex-col gap-2 md:hidden">
            <h2 className={ABSCHNITT}>Angemeldet</h2>
            <p className="truncate text-sm text-text-muted">{benutzer.email}</p>
            <form action={abmelden} className="mt-1">
              <Schaltflaeche type="submit" art="sekundaer" breit>
                Abmelden
              </Schaltflaeche>
            </form>
          </section>
        </main>

        <Zaehlfuss stand={stand} mitAuswertung={mitWerten} />
      </div>
    </div>
  )
}

/**
 * Der Stand der Zählung, wie ihn Fuss und Band brauchen.
 *
 * Zwei Fälle, die verschiedene Dinge sagen — deshalb zwei Formen und kein
 * Bündel aus lauter `null`-Feldern: es läuft eine Zählung, oder es läuft keine.
 */
type Zaehlstand =
  | { art: 'laeuft'; zaehlungId: string; datum: Date; fortschritt: Fortschritt }
  | { art: 'keine'; letztesDatum: Date | null; artikelzahl: number }

/** "47 von 99 gezählt" — der Stand als Satz. */
function gezaehltText(stand: Fortschritt): string {
  return `${stand.gezaehlt} von ${stand.gesamt} gezählt`
}

/**
 * Der Einstieg als Band über der Seite — die Desktop-Fassung des Fusses.
 *
 * Auf der laufenden Zählung getönt (primary-soft): sie ist der Zustand, der
 * gerade gilt, und der Blick soll zuerst dorthin. Ohne offene Zählung bleibt
 * die Karte ruhig — dann ist nichts im Gange, das jemanden drängt.
 */
function Zaehlband({ stand }: { stand: Zaehlstand }) {
  if (stand.art === 'laeuft') {
    return (
      <div className="flex items-center gap-8 rounded-xl border border-primary bg-primary-soft px-7 py-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <p className="text-xl font-semibold text-primary-soft-on">Zählung läuft</p>
            <p className="text-base text-primary-soft-on">
              begonnen am {alsDatumstext(stand.datum)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Fortschrittsbalken anteil={fortschrittsanteil(stand.fortschritt)} />
            </div>
            <p className="shrink-0 text-base font-medium text-primary-soft-on">
              {stand.fortschritt.gezaehlt} / {stand.fortschritt.gesamt}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Wegflaeche href={`/zaehlung/${stand.zaehlungId}`}>Zählung fortsetzen</Wegflaeche>
          {/* Leise unter dem Weg zurück in die Maske: der Ausweg aus einem
              Fehlstart, mit Rückfrage in der Komponente. */}
          <ZaehlungVerwerfen zaehlungId={stand.zaehlungId} gezaehlt={stand.fortschritt.gezaehlt} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-8 rounded-xl border border-border bg-surface px-7 py-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-xl font-semibold">Keine offene Zählung</p>
        <p className="text-base text-text-muted">
          {stand.letztesDatum === null
            ? 'Noch keine Zählung abgeschlossen'
            : `Zuletzt abgeschlossen am ${alsDatumstext(stand.letztesDatum)}`}{' '}
          · {stand.artikelzahl} Artikel in fester Reihenfolge
        </p>
      </div>
      <form action={zaehlungBeginnen} className="shrink-0">
        <Schaltflaeche type="submit">Zählung beginnen</Schaltflaeche>
      </form>
    </div>
  )
}

/**
 * Der feste Fuss auf dem Telefon: alles Auslösende im unteren Drittel.
 *
 * `sticky` statt `fixed`, damit der Fuss die Seite nicht überdeckt, sondern an
 * ihrem Ende steht und beim Scrollen unten bleibt. Der Zuschlag unten ist die
 * Randzone des Geräts — ohne ihn läge die Fläche unter der Wischleiste.
 */
function Zaehlfuss({ stand, mitAuswertung }: { stand: Zaehlstand; mitAuswertung: boolean }) {
  return (
    <footer className="sticky bottom-0 z-10 flex flex-col gap-2.5 border-t border-border bg-surface px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:hidden">
      {stand.art === 'laeuft' ? (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-text-muted">
                Zählung vom {alsKurzdatum(stand.datum)}
              </p>
              <p className="text-sm font-medium">
                {stand.fortschritt.gezaehlt} / {stand.fortschritt.gesamt}
              </p>
            </div>
            <Fortschrittsbalken anteil={fortschrittsanteil(stand.fortschritt)} />
            {/* Liegen noch Werte auf dem Gerät, gehört das hierher — neben den
                Weg zurück in die Maske, nicht in sie versteckt. */}
            <Synczeile zaehlungId={stand.zaehlungId} />
          </div>
          <Wegflaeche href={`/zaehlung/${stand.zaehlungId}`} gross breit>
            <span className="flex flex-col items-center">
              Zählung fortsetzen
              <span className="text-sm font-normal">{gezaehltText(stand.fortschritt)}</span>
            </span>
          </Wegflaeche>
          <ZaehlungVerwerfen zaehlungId={stand.zaehlungId} gezaehlt={stand.fortschritt.gezaehlt} />
        </>
      ) : (
        <>
          <p className="text-sm text-text-muted">
            {stand.letztesDatum === null
              ? 'Noch keine Zählung abgeschlossen'
              : `Keine offene Zählung · zuletzt ${alsKurzdatum(stand.letztesDatum)}`}
          </p>
          <form action={zaehlungBeginnen}>
            <Schaltflaeche type="submit" breit gross>
              Zählung beginnen
            </Schaltflaeche>
          </form>
          {/* Der Weg in die Auswertung führt zu Geldzahlen — er erscheint nur
              der Betriebsleitung. */}
          {mitAuswertung && (
            <Wegflaeche href="/auswertung" art="sekundaer" breit>
              Letzte Auswertung ansehen
            </Wegflaeche>
          )}
        </>
      )}
    </footer>
  )
}

/** Die offenen Punkte als Liste. */
function Offenliste({ punkte, mitAktion }: { punkte: readonly OffenerPunkt[]; mitAktion?: boolean }) {
  return (
    <>
      {punkte.map((punkt) => (
        <Listenzeile
          key={punkt.id}
          titel={punkt.titel}
          unterzeile={
            mitAktion ? punkt.unterzeile : `${punkt.unterzeile} · ${bereichsname(punkt.bereich)}`
          }
          wert={mitAktion ? punkt.aktion : undefined}
          punkt="attention"
          ziel={punkt.ziel}
          mehrzeilig
        />
      ))}
    </>
  )
}

/** Wie der Bereich heisst, in den ein Punkt gehört. */
function bereichsname(schluessel: Bereichsschluessel): string {
  return BEREICHE.find((bereich) => bereich.schluessel === schluessel)!.name
}

/**
 * Die drei Zahlen der letzten abgeschlossenen Zählung.
 *
 * Der Schwund steht als Gedankenstrich da, wo er keine Aussage wäre — nach der
 * allerersten Zählung gibt es keinen Zeitraum, über den er zu rechnen wäre. Der
 * Bestandswert steht trotzdem, denn den gibt es.
 */
function Letztekennzahlen({ stand }: { stand: Letztestand | null }) {
  if (stand === null) {
    return (
      <Leerzustand
        titel="Noch keine Zählung abgeschlossen"
        erklaerung="Nach der ersten abgeschlossenen Zählung stehen hier Bestandswert und Datum, nach der zweiten auch der Schwund."
      />
    )
  }

  return (
    // Untereinander und nicht nebeneinander, auch auf dem Telefon: drei Beträge
    // auf 390 px brechen mitten im Euro-Betrag um. Dieselbe Entscheidung wie in
    // der Auswertung.
    <div className="flex flex-col gap-2">
      <Kennzahl
        wert={
          bestandswerttext({ wertCent: stand.bestandWertCent, ohnePreis: stand.ohnePreis }) ??
          undefined
        }
        beschriftung="Bestandswert"
        unterzeile={
          stand.ohnePreis > 0
            ? `${stand.ohnePreis} ${stand.ohnePreis === 1 ? 'gezählter Artikel' : 'gezählte Artikel'} ohne Preis, nicht enthalten`
            : 'gezählt und bewertet'
        }
      />
      <Kennzahl
        wert={schwundquotentext(stand.schwundProzent) ?? undefined}
        beschriftung="Schwund"
        // Ein Gedankenstrich braucht seinen Grund: ohne Vorgängerzählung fehlt
        // der Zeitraum, ohne Verkäufe die Bezugsgrösse — und Verkäufe ohne
        // Preis sind wieder etwas anderes. Nichts davon heisst "kein Schwund".
        unterzeile={
          !stand.mitVorgaenger
            ? 'braucht zwei Zählungen'
            : stand.schwundProzent !== null
              ? 'zum Wareneinsatz'
              : stand.verkauftOhnePreis > 0
                ? 'Verkäufe ohne hinterlegten Preis — nicht bewertbar'
                : 'keine Verkäufe im Zeitraum'
        }
        rolle={stand.schwundProzent !== null && stand.schwundProzent > 0 ? 'attention' : 'neutral'}
      />
      <Kennzahl
        wert={alsDatumstext(stand.datum)}
        beschriftung="Datum"
        unterzeile={`KW ${kalenderwoche(stand.datum)}`}
      />
    </div>
  )
}

