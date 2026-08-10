/**
 * Der Verlauf: dieselbe Rechnung wie die Auswertung, nur über viele Zeiträume.
 *
 * Die Auswertung beantwortet „was ist letzte Woche verschwunden". Diese Datei
 * beantwortet die Frage, wegen der die Excel überhaupt geführt wurde: „wird es
 * mehr". Eine einzelne Wochenquote sagt das nicht — 2,1 % sind gut oder
 * schlecht, je nachdem, was davor stand.
 *
 * Gerechnet wird hier nichts neu. Schwund, Wareneinsatz und Quote kommen aus
 * src/lib/auswertung.ts, Zeile für Zeile wie in der Wochenauswertung; hier
 * werden sie gruppiert und nebeneinandergelegt. Eine zweite Schwundformel für
 * den Verlauf wäre genau die zweite Wahrheit, die diese App abschafft.
 *
 * Kein Datenbankzugriff: der steht in src/lib/verlauf-daten.ts. `Zeitraum` wird
 * nur als Typ geholt, damit diese Datei ohne Datenbank prüfbar bleibt.
 */

import { ANTEIL_AUFFAELLIG } from '@/lib/auswertung-anzeige'
import {
  bestand,
  schwundquote,
  summe,
  type Bestand,
  type Summe,
  type Zeile,
} from '@/lib/auswertung'
import type { Zeitraum } from '@/lib/auswertung-daten'

/** Eine Zählung, soweit der Verlauf sie kennen muss. */
export type Zaehlpunkt = { id: string; datum: Date }

/**
 * Bildet aus abgeschlossenen Zählungen die Zeiträume dazwischen.
 *
 * Aus n Zählungen werden n−1 Zeiträume: jede Zählung ist zugleich Ende des
 * einen und Anfang des nächsten. Die Reihenfolge ist die der Eingabe, jüngste
 * zuerst — so steht die letzte Woche oben, dort, wo zuerst hingesehen wird.
 *
 * `hoechstens` schneidet hinten ab, nicht vorne: bei einer Grenze von 12 sind
 * es die zwölf jüngsten Zeiträume. Wer schneidet, muss es sagen — deshalb gibt
 * `verlaufsgrenze` daneben zurück, wie viele es insgesamt gäbe.
 */
export function zeitraeumeAus(
  zaehlungen: readonly Zaehlpunkt[],
  hoechstens: number,
): Zeitraum[] {
  const zeitraeume: Zeitraum[] = []

  for (let i = 0; i + 1 < zaehlungen.length; i += 1) {
    const bis = zaehlungen[i]
    const von = zaehlungen[i + 1]
    zeitraeume.push({
      vonZaehlungId: von.id,
      bisZaehlungId: bis.id,
      von: von.datum,
      bis: bis.datum,
      tage: Math.round((bis.datum.getTime() - von.datum.getTime()) / 86_400_000),
    })
  }

  return zeitraeume.slice(0, Math.max(0, hoechstens))
}

/** Wie viele Zeiträume es insgesamt gäbe — für den Satz „von 27 gezeigt". */
export function zeitraumzahl(zaehlungen: readonly Zaehlpunkt[]): number {
  return Math.max(0, zaehlungen.length - 1)
}

/**
 * Wie eine Quote auffällt.
 *
 *  - `zuviel`     — negativer Schwund: es steht mehr da, als möglich wäre. Kein
 *                   Verlust, sondern ein Zählfehler oder eine nicht erfasste
 *                   Lieferung.
 *  - `auffaellig` — über der Schwelle, ab der in der Wochenauswertung eine
 *                   einzelne Zeile rot wird. Dieselbe Schwelle, damit nicht
 *                   zwei Bildschirme verschieden streng sind.
 *  - `neutral`    — Schwund vorhanden, aber im Rahmen.
 *  - `ohne`       — keine Quote zu rechnen: nichts verkauft oder nichts
 *                   bewertbar. Ein Gedankenstrich, keine Null.
 */
export type Quotenstufe = 'neutral' | 'auffaellig' | 'zuviel' | 'ohne'

/** Ab welcher Quote in Prozent ein Zeitraum auffällt — 3 %, wie die Zeile. */
export const QUOTE_AUFFAELLIG = ANTEIL_AUFFAELLIG * 100

export function quotenstufe(quote: number | null): Quotenstufe {
  if (quote === null) return 'ohne'
  if (quote < 0) return 'zuviel'
  return quote >= QUOTE_AUFFAELLIG ? 'auffaellig' : 'neutral'
}

/** Der Schwund einer Kategorie in einem Zeitraum. */
export type Kategoriequote = {
  kategorie: string
  schwundWertCent: number
  /** Einkaufswert der Verkäufe dieser Kategorie — die Bezugsgrösse der Quote. */
  wareneinsatzCent: number
  /** `null`, wo nichts verkauft wurde: durch null zu teilen ergibt keine Quote. */
  quote: number | null
  /** Zeilen mit Schwund, aber ohne hinterlegten Preis — sie fehlen im Betrag. */
  ohnePreis: number
}

/**
 * Der Schwund je Kategorie, alphabetisch.
 *
 * Alphabetisch und nicht nach Betrag: die Kategorien stehen im Verlauf
 * untereinander über mehrere Wochen hinweg, und eine Zeile, die je Woche ihren
 * Platz wechselt, lässt sich nicht mit dem Auge verfolgen.
 *
 * Gerechnet wird mit `summe` — derselben Funktion wie für den ganzen Betrieb,
 * nur auf die Zeilen einer Kategorie angewandt.
 */
export function schwundJeKategorie(zeilen: readonly Zeile[]): Kategoriequote[] {
  const gruppen = new Map<string, Zeile[]>()

  for (const eintrag of zeilen) {
    const vorhanden = gruppen.get(eintrag.artikel.kategorie)
    if (vorhanden === undefined) gruppen.set(eintrag.artikel.kategorie, [eintrag])
    else vorhanden.push(eintrag)
  }

  return [...gruppen.entries()]
    .map(([kategorie, eintraege]) => {
      const gesamt = summe(eintraege)
      return {
        kategorie,
        schwundWertCent: gesamt.schwundWertCent,
        wareneinsatzCent: gesamt.wareneinsatzCent,
        quote: schwundquote(gesamt),
        ohnePreis: gesamt.ohnePreis,
      }
    })
    .sort((a, b) => a.kategorie.localeCompare(b.kategorie, 'de'))
}

/** Ein Zeitraum mit allem, was der Verlauf über ihn zeigt. */
export type Verlaufspunkt = {
  zeitraum: Zeitraum
  gesamt: Summe
  /** Der gezählte Bestand am Ende des Zeitraums. */
  bestand: Bestand
  quote: number | null
  /** Ob im Zeitraum überhaupt Kassendaten vorliegen — sonst ist der Schwund keiner. */
  mitUmsatzdaten: boolean
  kategorien: Kategoriequote[]
}

/**
 * Fasst einen Zeitraum zusammen.
 *
 * Die Zeilen kommen fertig gerechnet herein (aus `zeile` in
 * src/lib/auswertung.ts) — diese Funktion summiert nur noch.
 */
export function verlaufspunkt(
  zeitraum: Zeitraum,
  zeilen: readonly Zeile[],
  mitUmsatzdaten: boolean,
): Verlaufspunkt {
  const gesamt = summe(zeilen)
  return {
    zeitraum,
    gesamt,
    bestand: bestand(zeilen),
    quote: schwundquote(gesamt),
    mitUmsatzdaten,
    kategorien: schwundJeKategorie(zeilen),
  }
}

/**
 * Alle Kategorien, die in irgendeinem Zeitraum vorkommen — die Zeilen der
 * Kategorientafel.
 *
 * Über alle Zeiträume gebildet und nicht je Zeitraum: eine Kategorie, die in
 * der aktuellen Woche fehlt, muss trotzdem ihre Zeile behalten, sonst
 * verschieben sich die Spalten unter dem Auge.
 */
export function kategorien(punkte: readonly Verlaufspunkt[]): string[] {
  const namen = new Set<string>()
  for (const punkt of punkte) {
    for (const eintrag of punkt.kategorien) namen.add(eintrag.kategorie)
  }
  return [...namen].sort((a, b) => a.localeCompare(b, 'de'))
}

/**
 * Die Höhe eines Balkens, 0 bis 1.
 *
 * Bezugsgrösse ist die grösste Quote der Reihe, nicht ein fester Wert: bei
 * durchweg kleinen Quoten wäre eine feste Skala eine Reihe unsichtbarer
 * Striche, und gerade der Unterschied zwischen 0,4 % und 1,2 % ist die
 * Aussage. Negative Quoten (mehr da als möglich) zählen mit ihrem Betrag —
 * ihre Richtung trägt die Farbe, nicht die Länge.
 *
 * `null` bleibt ohne Balken: nichts zu zeigen ist etwas anderes als null.
 */
export function balkenanteil(quote: number | null, hoechste: number): number | null {
  if (quote === null) return null
  if (hoechste <= 0) return 0
  return Math.min(1, Math.abs(quote) / hoechste)
}

/** Die grösste Quote einer Reihe, dem Betrag nach. 0, wenn es keine gibt. */
export function hoechsteQuote(punkte: readonly Verlaufspunkt[]): number {
  let hoechste = 0
  for (const punkt of punkte) {
    if (punkt.quote === null) continue
    hoechste = Math.max(hoechste, Math.abs(punkt.quote))
  }
  return hoechste
}

/**
 * Die Veränderung gegenüber dem Zeitraum davor, in Prozentpunkten.
 *
 * `null`, wo einer der beiden keine Quote hat — eine Veränderung gegenüber
 * einer unbekannten Grösse ist keine Zahl. Der jüngste Zeitraum steht vorn,
 * der Vorgänger ist also der nächste in der Reihe.
 */
export function veraenderung(
  punkte: readonly Verlaufspunkt[],
  stelle: number,
): number | null {
  const jetzt = punkte[stelle]?.quote
  const davor = punkte[stelle + 1]?.quote
  if (jetzt === undefined || davor === undefined || jetzt === null || davor === null) return null
  return Math.round((jetzt - davor) * 10) / 10
}

/**
 * Die Veränderung als deutscher Text mit Vorzeichen: 0.7 -> "+0,7 Pp".
 *
 * „Pp" für Prozentpunkte, nicht „%": der Unterschied zwischen 2 % und 3 % ist
 * ein Prozentpunkt und keine einprozentige Steigerung. Wer das verwechselt,
 * rechnet sich den Schwund schön.
 */
export function veraenderungstext(wert: number | null): string | null {
  if (wert === null) return null
  if (wert === 0) return 'unverändert'
  // Derselbe Strich wie in den übrigen Zahlen dieser App (schwundwerttext,
  // alsEuro): das typografisch richtige Minus stünde in einer Zeile neben
  // ihnen und sähe aus wie ein anderes Zeichen für dieselbe Sache.
  const zahl = Math.abs(wert).toString().replace('.', ',')
  return `${wert > 0 ? '+' : '-'}${zahl} Pp`
}
