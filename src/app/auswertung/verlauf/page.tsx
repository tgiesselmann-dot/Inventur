/**
 * Der Verlauf: die Zeiträume nebeneinander.
 *
 * Die Wochenauswertung beantwortet „was ist letzte Woche verschwunden". Diese
 * Seite beantwortet die Frage dahinter: „wird es mehr". Eine einzelne Quote
 * trägt diese Aussage nicht — 2,1 % sind gut oder schlecht, je nachdem, was
 * davor stand.
 *
 * Zwei Abschnitte, und die Reihenfolge ist die des Blicks: erst der Betrieb als
 * Ganzes (eine Zeile je Zeitraum, mit Balken), dann die Kategorien darunter.
 * Der Betrieb sagt, ob etwas los ist; die Kategorien sagen, wo.
 *
 * Jede Zeile ist ein Weg in ihre Wochenauswertung — sonst wäre der Verlauf eine
 * Sackgasse: er zeigt, dass die vorletzte Woche auffällt, und dann müsste man
 * suchen gehen.
 *
 * Gerechnet wird hier nichts. Quoten, Stufen, Balkenlängen und Veränderungen
 * kommen aus src/lib/verlauf.ts, die Daten aus src/lib/verlauf-daten.ts.
 */

import Link from 'next/link'

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { schwundquotentext } from '@/lib/auswertung'
import { alsDatumstext, alsKurzdatum } from '@/lib/datum'
import {
  balkenanteil,
  hoechsteQuote,
  kategorien as alleKategorien,
  quotenstufe,
  veraenderung,
  veraenderungstext,
  type Quotenstufe,
  type Verlaufspunkt,
} from '@/lib/verlauf'
import { VERLAUFSGRENZE, verlaufslage } from '@/lib/verlauf-daten'
import { alsEuro } from '@/lib/wareneingang'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Hinweisseite } from '@/ui/hinweisseite'
import { Modusumschalter } from '@/ui/modus'
import { ROLLEN } from '@/ui/rollen'
import { Umschalter, Umschalterweg } from '@/ui/umschalter'

export const dynamic = 'force-dynamic'

/**
 * Die Rolle einer Quotenstufe.
 *
 * Fachbegriff → Rolle, nicht → Klassen: die Klassen stehen in src/ui/rollen.ts.
 * `ohne` bleibt neutral — keine Quote ist kein Befund.
 */
const STUFENROLLE: Record<Quotenstufe, 'danger' | 'attention' | 'neutral'> = {
  auffaellig: 'danger',
  zuviel: 'attention',
  neutral: 'neutral',
  ohne: 'neutral',
}

/** Die Spalten der Desktop-Liste — Kopf und Zeilen tragen dieselben. */
const SPALTEN =
  'md:grid md:grid-cols-[132px_72px_minmax(0,1fr)_104px_120px_128px] md:items-center md:gap-x-4'

export default async function Page() {
  const betrieb = await aktuellerBetrieb()
  const lage = await verlaufslage(betrieb.id)

  if (lage.punkte.length === 0) {
    return (
      <Hinweisseite
        titel="Noch kein Verlauf"
        text="Ein Verlauf braucht mindestens zwei abgeschlossene Zählungen — erst zwischen ihnen liegt ein Zeitraum, für den sich Schwund rechnen lässt."
        weiter={{ ziel: '/zaehlung', text: 'Zu den Zählungen' }}
      />
    )
  }

  const hoechste = hoechsteQuote(lage.punkte)
  const kategorien = alleKategorien(lage.punkte)
  const geschnitten = lage.gesamt > lage.punkte.length
  const ohneKassendaten = lage.punkte.filter((punkt) => !punkt.mitUmsatzdaten).length

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4">
      {ohneKassendaten > 0 && (
        <div className="order-last mt-4 md:order-none md:mt-0">
          <Hinweisleiste
            rolle="attention"
            titel={`${ohneKassendaten === 1 ? 'Ein Zeitraum hat' : `${ohneKassendaten} Zeiträume haben`} keine Kassendaten`}
          >
            Ohne Verkäufe ist der Sollbestand nur Anfangsbestand plus Lieferungen — der Schwund
            dieser Zeiträume enthält dann alles, was verkauft wurde, und lässt sich mit den übrigen
            nicht vergleichen. Sie stehen mit einem Gedankenstrich statt einer Quote.
          </Hinweisleiste>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-titel">Verlauf</h1>
            <p className="mt-1.5 text-sm text-text-muted">
              {lage.punkte.length === 1
                ? 'Ein Zeitraum'
                : `${lage.punkte.length} Zeiträume`}
              {geschnitten && ` von ${lage.gesamt}`} ·{' '}
              {alsDatumstext(lage.punkte[lage.punkte.length - 1].zeitraum.von)} bis{' '}
              {alsDatumstext(lage.punkte[0].zeitraum.bis)}
            </p>
          </div>
          <Modusumschalter className="md:hidden" />
        </div>

        <Umschalter beschriftung="Sicht auf die Auswertung">
          <Umschalterweg aktiv={false} ziel="/auswertung">
            Zeitraum
          </Umschalterweg>
          <Umschalterweg aktiv ziel="/auswertung/verlauf">
            Verlauf
          </Umschalterweg>
        </Umschalter>
      </div>

      {lage.punkte.length === 1 && (
        <div className="mt-4">
          <Hinweisleiste rolle="neutral" titel="Erst ein Zeitraum">
            Eine Reihe entsteht ab der dritten abgeschlossenen Zählung. Bis dahin steht hier
            dieselbe Zahl wie in der Wochenauswertung — nur noch ohne etwas, womit man sie
            vergleichen könnte.
          </Hinweisleiste>
        </div>
      )}

      <section className="mt-6 flex flex-col gap-2">
        <h2 className="text-abschnitt text-text-muted uppercase">Schwund je Zeitraum</h2>

        {/* Der Spaltenkopf gehört zum Desktop: auf dem Telefon trägt jede Karte
            ihre Beschriftungen selbst. */}
        <div
          className={`hidden px-4 pb-1 text-beschriftung text-text-muted uppercase ${SPALTEN} md:grid`}
        >
          <span>Zeitraum</span>
          <span>Tage</span>
          {/* Ohne eigene Beschriftung: der Balken ist die Quote rechts daneben,
              und zwei Überschriften für eine Zahl lesen sich wie zwei Zahlen. */}
          <span aria-hidden />
          <span className="text-right">Anteil am Wareneinsatz</span>
          <span className="text-right">Veränderung</span>
          <span className="text-right">Schwund</span>
        </div>

        <ul className="flex flex-col gap-tapgap">
          {lage.punkte.map((punkt, stelle) => (
            <li key={punkt.zeitraum.bisZaehlungId}>
              <Zeitraumzeile
                punkt={punkt}
                hoechste={hoechste}
                wechsel={veraenderung(lage.punkte, stelle)}
              />
            </li>
          ))}
        </ul>

        {geschnitten && (
          <p className="mt-1 text-sm text-text-muted">
            Gezeigt werden die {VERLAUFSGRENZE} jüngsten Zeiträume von {lage.gesamt}. Die älteren
            stehen weiterhin in ihren Zählungen.
          </p>
        )}
      </section>

      <section className="mt-8 flex flex-col gap-2">
        <h2 className="text-abschnitt text-text-muted uppercase">Kategorien über die Zeiträume</h2>
        <p className="max-w-[70ch] text-sm text-text-muted">
          Je Kategorie der Anteil am eigenen Wareneinsatz. Eine Kategorie ohne Verkäufe in einem
          Zeitraum steht mit einem Gedankenstrich — nicht mit null.
        </p>

        <Kategorientafel punkte={lage.punkte} kategorien={kategorien} />
      </section>
    </main>
  )
}

/**
 * Eine Zeile des Verlaufs — auf dem Telefon eine Karte, auf dem Desktop eine
 * Rasterzeile.
 *
 * Dieselbe Auszeichnung für beide Breiten, nur anders angeordnet: zwei Listen
 * wären zwei Gelegenheiten, eine Spalte zu vergessen.
 */
function Zeitraumzeile({
  punkt,
  hoechste,
  wechsel,
}: {
  punkt: Verlaufspunkt
  hoechste: number
  wechsel: number | null
}) {
  const stufe = quotenstufe(punkt.quote)
  const rolle = ROLLEN[STUFENROLLE[stufe]]
  const anteil = balkenanteil(punkt.quote, hoechste)
  const quote = schwundquotentext(punkt.quote)

  return (
    <Link
      href={`/auswertung?bis=${punkt.zeitraum.bisZaehlungId}`}
      className={`tap flex min-h-tap flex-col justify-center gap-2 rounded-ctl border border-border bg-surface px-4 py-3 focus-visible:fokus md:py-2.5 ${SPALTEN}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-base tabular-nums">
          {alsKurzdatum(punkt.zeitraum.von)} – {alsKurzdatum(punkt.zeitraum.bis)}
        </span>
        <span className="block text-xs text-text-muted md:hidden">
          {punkt.zeitraum.tage} {punkt.zeitraum.tage === 1 ? 'Tag' : 'Tage'}
        </span>
      </span>

      <span className="hidden text-sm text-text-muted tabular-nums md:block">
        {punkt.zeitraum.tage}
      </span>

      {/* Der Balken trägt seine Aussage nie allein: die Quote steht daneben. */}
      <span className="flex items-center gap-3">
        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
          {anteil !== null && (
            <span
              className={`block h-full rounded-full ${rolle.punkt}`}
              style={{ width: `${Math.max(2, anteil * 100)}%` }}
            />
          )}
        </span>
        <span className={`text-base tabular-nums md:hidden ${rolle.text}`}>{quote ?? '—'}</span>
      </span>

      <span className={`hidden text-right text-base tabular-nums md:block ${rolle.text}`}>
        {quote ?? '—'}
      </span>

      <span className="flex items-center justify-between gap-3 text-sm text-text-muted tabular-nums md:justify-end md:text-right">
        <span className="md:hidden">Veränderung</span>
        <span>{veraenderungstext(wechsel) ?? '—'}</span>
      </span>

      <span className="flex items-center justify-between gap-3 text-sm tabular-nums md:justify-end md:text-right">
        <span className="text-text-muted md:hidden">Schwund</span>
        <span className={punkt.gesamt.bewertet === 0 ? 'text-text-muted' : 'text-text'}>
          {punkt.gesamt.bewertet === 0 ? '—' : alsEuro(punkt.gesamt.schwundWertCent)}
        </span>
      </span>
    </Link>
  )
}

/**
 * Die Kategorien über die Zeiträume.
 *
 * Auf dem Desktop ein Raster: Zeile je Kategorie, Spalte je Zeitraum, jüngster
 * links — dieselbe Richtung wie die Liste darüber. Auf dem Telefon je Kategorie
 * eine Karte mit ihren Zeiträumen als Liste; ein waagerecht geschobenes Raster
 * mit zwölf Spalten wäre auf 390 px keine Tafel, sondern ein Suchspiel.
 */
function Kategorientafel({
  punkte,
  kategorien,
}: {
  punkte: Verlaufspunkt[]
  kategorien: string[]
}) {
  const jeKategorie = kategorien.map((kategorie) => ({
    kategorie,
    zellen: punkte.map((punkt) => ({
      schluessel: punkt.zeitraum.bisZaehlungId,
      bis: punkt.zeitraum.bis,
      eintrag: punkt.kategorien.find((zeile) => zeile.kategorie === kategorie) ?? null,
    })),
  }))

  return (
    <>
      {/* Desktop: ein Raster, waagerecht scrollend, wenn zwölf Spalten nicht
          nebeneinanderpassen — die Seite selbst scrollt dabei nie quer. */}
      <div className="mt-2 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-bg px-3 py-2 text-left text-beschriftung font-normal text-text-muted uppercase">
                Kategorie
              </th>
              {punkte.map((punkt) => (
                <th
                  key={punkt.zeitraum.bisZaehlungId}
                  className="px-3 py-2 text-right text-beschriftung font-normal text-text-muted uppercase tabular-nums"
                >
                  {alsKurzdatum(punkt.zeitraum.bis)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jeKategorie.map((zeile) => (
              <tr key={zeile.kategorie} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 bg-bg px-3 py-2 text-left font-normal text-text"
                >
                  {zeile.kategorie}
                </th>
                {zeile.zellen.map((zelle) => (
                  <Zelle key={zelle.schluessel} quote={zelle.eintrag?.quote ?? null} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Telefon: je Kategorie eine Karte. */}
      <ul className="mt-2 flex flex-col gap-tapgap md:hidden">
        {jeKategorie.map((zeile) => (
          <li
            key={zeile.kategorie}
            className="rounded-ctl border border-border bg-surface px-4 py-3"
          >
            <p className="text-base">{zeile.kategorie}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {zeile.zellen.map((zelle) => {
                const rolle = ROLLEN[STUFENROLLE[quotenstufe(zelle.eintrag?.quote ?? null)]]
                return (
                  <li
                    key={zelle.schluessel}
                    className="flex items-baseline justify-between gap-3 text-sm tabular-nums"
                  >
                    <span className="text-text-muted">{alsKurzdatum(zelle.bis)}</span>
                    <span className={rolle.text}>
                      {schwundquotentext(zelle.eintrag?.quote ?? null) ?? '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Eine Zelle der Tafel: die Quote in der Farbe ihrer Stufe. */
function Zelle({ quote }: { quote: number | null }) {
  const rolle = ROLLEN[STUFENROLLE[quotenstufe(quote)]]
  const text = schwundquotentext(quote)

  return (
    <td className={`px-3 py-2 text-right tabular-nums ${text === null ? 'text-text-muted' : rolle.text}`}>
      {text ?? '—'}
    </td>
  )
}
