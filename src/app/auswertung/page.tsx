/**
 * Die Auswertung: Soll gegen Ist, und was dazwischen fehlt.
 *
 * Der Zeitraum wird von zwei abgeschlossenen Zählungen aufgespannt. Ohne zwei
 * gibt es keine Auswertung — eine einzelne Zählung sagt, was dasteht, aber
 * nicht, was fehlt.
 *
 * Die Reihenfolge auf dem Bildschirm ist die Reihenfolge des Zweifels: zuerst,
 * was die Zahlen darunter angreifbar macht (nicht zugeordnete Kassen-
 * bezeichnungen, fehlende Kassendaten), dann die Summen, dann die Zeilen. Ein
 * Hinweis auf eine Lücke gehört nach oben und nicht in eine Fussnote.
 */

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import {
  bestand,
  bestandswerttext,
  bewegt,
  schwundquote,
  schwundquotentext,
  schwundwerttext,
  summe,
  zeile,
  type Summe,
  type Zeile,
} from '@/lib/auswertung'
import { alsAnzeige } from '@/lib/auswertung-anzeige'
import { datenlage, letzterZeitraum, zeitraumZu } from '@/lib/auswertung-daten'
import { alsDatumstext } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { alsEuro } from '@/lib/wareneingang'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Hinweisseite } from '@/ui/hinweisseite'
import { Kennzahl } from '@/ui/kennzahl'
import { Modusumschalter } from '@/ui/modus'
import { Umschalter, Umschalterweg } from '@/ui/umschalter'
import { Wegflaeche } from '@/ui/wegflaeche'

import { Auswertungstabelle, type Tabellenfuss } from './tabelle'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: PageProps<'/auswertung'>) {
  const parameter = await searchParams
  const { betrieb } = await pflichtBetriebsleiter()

  // Ohne Parameter der jüngste Zeitraum — der Normalfall. Mit `bis` der
  // Zeitraum, der auf dieser Zählung endet: der Weg aus dem Verlauf in die
  // einzelne Woche. Eine unbekannte oder fremde Kennung führt auf den jüngsten
  // zurück, statt eine leere Seite zu zeigen.
  const gewaehlt = typeof parameter.bis === 'string' && istKennung(parameter.bis)
  const zeitraum =
    (gewaehlt ? await zeitraumZu(betrieb.id, parameter.bis as string) : null) ??
    (await letzterZeitraum(betrieb.id))

  if (zeitraum === null) {
    return (
      <Hinweisseite
        titel="Noch keine Auswertung möglich"
        text="Eine Auswertung braucht zwei abgeschlossene Zählungen — eine am Anfang und eine am Ende des Zeitraums. Eine einzelne Zählung sagt, was dasteht, aber nicht, was fehlt."
        weiter={{ ziel: '/zaehlung', text: 'Zu den Zählungen' }}
      />
    )
  }

  const lage = await datenlage(betrieb.id, zeitraum)
  const zeilen: Zeile[] = lage.artikel.map((artikel) =>
    zeile(artikel, lage.bewegungen.get(artikel.id)!),
  )
  // Gerechnet wird über alle Artikel, gezeigt werden die bewegten: ein Artikel,
  // der im Zeitraum nirgends vorkam, verwässert die Tabelle nur.
  const gezeigt = zeilen.filter(bewegt)
  const gesamt = summe(gezeigt)
  // Der Bestandswert kommt aus `bestand`, nicht aus der Summe: nur er weiss,
  // ob eine Null "nichts da" oder "niemand kann bewerten" heisst.
  const bestandslage = bestand(gezeigt)
  const quote = schwundquote(gesamt)
  const unbewegt = zeilen.length - gezeigt.length

  const von = alsDatumstext(zeitraum.von)
  const bis = alsDatumstext(zeitraum.bis)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4">
      {lage.ohneZuordnung.length > 0 && (
        // Die Leiste trägt eine auslösende Fläche — auf dem Telefon gehört die
        // ans untere Ende des Screens, auf dem Desktop bleibt sie beim Befund.
        <div className="order-last mt-4 md:order-none md:mt-0">
          <Hinweisleiste
            rolle="attention"
            titel={`${anzahl(lage.ohneZuordnung.length, 'Kassenbezeichnung ist', 'Kassenbezeichnungen sind')} keinem Artikel zugeordnet — die Auswertung ist unvollständig`}
            aktion={
              <span className="w-full sm:w-auto">
                <Wegflaeche href="/umsatz/zuordnung" art="sekundaer" rolle="attention" breit>
                  Zuordnung öffnen
                </Wegflaeche>
              </span>
            }
          >
            Ihre Verkäufe fehlen in der Rechnung. Der Schwund unten ist damit eher zu niedrig als zu
            hoch.
          </Hinweisleiste>
        </div>
      )}

      {!lage.mitUmsatzdaten && (
        <div className="mt-3">
          <Hinweisleiste rolle="attention" titel="Für diesen Zeitraum liegen keine Kassendaten vor">
            Ohne Verkäufe ist der Sollbestand nur Anfangsbestand plus Lieferungen — der ausgewiesene
            Schwund enthält dann alles, was verkauft wurde, und ist keine Aussage über Verluste.
          </Hinweisleiste>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-titel">Auswertung</h1>
              <p className="mt-1.5 text-sm text-text-muted">
                {von} bis {bis} · {zeitraum.tage} {zeitraum.tage === 1 ? 'Tag' : 'Tage'} ·{' '}
                {anzahl(gezeigt.length, 'bewegter Artikel', 'bewegte Artikel')}
              </p>
            </div>
            <Modusumschalter className="md:hidden" />
          </div>

          {/* Zwei Sichten auf dieselbe Rechnung: dieser Zeitraum, oder die
              Zeiträume nebeneinander. Der Verlauf ist eine eigene Seite und
              deshalb ein Weg, kein Schalter. */}
          <Umschalter beschriftung="Sicht auf die Auswertung">
            <Umschalterweg aktiv ziel="/auswertung">
              Zeitraum
            </Umschalterweg>
            <Umschalterweg aktiv={false} ziel="/auswertung/verlauf">
              Verlauf
            </Umschalterweg>
          </Umschalter>
        </div>

        {/* Auf dem Telefon untereinander: drei Beträge nebeneinander auf 390 px
            brechen mitten im Euro-Betrag um. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-stretch">
          <Kennzahl
            beschriftung="Schwund"
            wert={schwundwerttext(gesamt) ?? undefined}
            unterzeile={
              gesamt.bewertet === 0 && gesamt.ohnePreis > 0
                ? 'kein Artikel mit hinterlegtem Preis'
                : 'zum Einkaufspreis'
            }
            rolle={gesamt.schwundWertCent > 0 ? 'danger' : 'neutral'}
          />
          <Kennzahl
            beschriftung="Anteil am Wareneinsatz"
            wert={schwundquotentext(quote) ?? undefined}
            unterzeile={
              quote !== null
                ? `von ${alsEuro(gesamt.wareneinsatzCent)}`
                : gesamt.verkauftOhnePreis > 0
                  ? 'Verkäufe ohne hinterlegten Preis — nicht bewertbar'
                  : 'keine Verkäufe im Zeitraum'
            }
          />
          <Kennzahl
            beschriftung={`Bestandswert ${bis}`}
            wert={bestandswerttext(bestandslage) ?? undefined}
            unterzeile={
              bestandslage.wertCent === null && bestandslage.ohnePreis > 0
                ? 'gezählt, aber kein Preis hinterlegt'
                : 'gezählt und bewertet'
            }
          />
        </div>
      </div>

      <Auswertungstabelle
        zeilen={gezeigt.map(alsAnzeige)}
        zeitraum={{ von, bis }}
        fuss={tabellenfuss(gesamt, lage.ohneZuordnung.length)}
        wege={{ zaehlung: `/zaehlung/${zeitraum.bisZaehlungId}`, lieferungen: '/lieferungen' }}
      />

      <div className="mt-4 space-y-1 text-sm text-text-muted">
        {gesamt.ungezaehlt > 0 && (
          <p>
            {anzahl(gesamt.ungezaehlt, 'Artikel wurde', 'Artikel wurden')} am {bis} nicht gezählt —
            für sie gibt es keinen Istbestand.
          </p>
        )}
        {unbewegt > 0 && (
          <p>
            {anzahl(unbewegt, 'Artikel ohne Bewegung', 'Artikel ohne Bewegung')} im Zeitraum — weder
            Bestand noch Lieferung, Verkauf oder Zählung. Sie stehen nicht in der Tabelle.
          </p>
        )}
      </div>
    </main>
  )
}

/**
 * Was unter der Summe steht.
 *
 * Gezählt wird in src/lib/auswertung.ts, hier wird nur formuliert — aber
 * formuliert werden muss es: eine Summe ohne die Zahl der Artikel, die nicht in
 * ihr stehen, ist genau die Zahl, der in der Excel niemand mehr glaubte.
 */
function tabellenfuss(gesamt: Summe, ohneZuordnung: number): Tabellenfuss {
  const weitere: string[] = []
  if (gesamt.ohneSchwundrechnung > 0) {
    weitere.push(`${gesamt.ohneSchwundrechnung} Artikel ohne Schwundrechnung`)
  }
  if (ohneZuordnung > 0) {
    weitere.push(
      `${anzahl(ohneZuordnung, 'Kassenbezeichnung', 'Kassenbezeichnungen')} nicht zugeordnet`,
    )
  }

  return {
    titel: `Summe · ${anzahl(gesamt.bewertet, 'bewerteter Artikel', 'bewertete Artikel')}`,
    ohnePreis:
      gesamt.ohnePreis > 0
        ? `${anzahl(gesamt.ohnePreis, 'Artikel', 'Artikel')} ohne hinterlegten Preis, in der Summe nicht enthalten.`
        : null,
    weitere: weitere.length > 0 ? weitere.join(' · ') : null,
    // "—" statt einer Zahl, wo gar nichts zu summieren war: der Fuss einer
    // leeren Summe behauptet sonst 0,00 EUR Schwund.
    wert: schwundwerttext(gesamt) ?? '—',
    betont: gesamt.schwundWertCent > 0,
  }
}

function anzahl(wert: number, einzahl: string, mehrzahl: string): string {
  return `${wert} ${wert === 1 ? einzahl : mehrzahl}`
}
