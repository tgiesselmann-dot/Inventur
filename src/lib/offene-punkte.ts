/**
 * Was zwischen dem Betrieb und einer belastbaren Auswertung steht.
 *
 * Drei Lücken machen jede Schwundzahl angreifbar, und alle drei sind still:
 * fehlende Kassendaten (der Sollbestand kennt die Verkäufe nicht), nicht
 * zugeordnete Kassenbezeichnungen (die gebuchten Mengen gehen in keinen
 * Sollbestand ein) und eine angelegte, aber nie erfasste Lieferung (der Zugang
 * fehlt). Keine davon fällt in der Auswertung auf — dort steht am Ende nur eine
 * Zahl, die auch stimmen könnte.
 *
 * Bis hierher stand jede dieser Aussagen als Nebenrechnung in der Maske, die
 * sie zufällig brauchte: die Zuordnungszählung in umsatz/page.tsx, der
 * Kontrollstand in lieferungen/page.tsx. Die Startseite fragt dieselben Dinge
 * noch einmal, und die Zahlen an den Bereichszeilen ("2 offen") sind dieselben
 * Punkte, nur gezählt. Zwei Stellen, dieselbe Frage — genau das Muster, das
 * diese App aus der Tabellenkalkulation herausholen soll.
 *
 * Der Wortlaut gehört mit hierher. Ein Satz wie "Umsatzdaten seit 3 Tagen nicht
 * importiert" ist die Aussage einer Rechnung und keine Gestaltung; in zwei
 * Masken geschrieben wäre er in einer davon irgendwann falsch.
 *
 * Rein: keine Datenbank, keine Prisma-Typen. Die Abfragen stehen in
 * src/lib/offene-punkte-daten.ts.
 */

import { alsKurzdatum } from '@/lib/datum'

/** Die vier Bereiche der App — die Einstiege unter dem Zählungsband. */
export type Bereichsschluessel = 'artikel' | 'lieferungen' | 'umsatz' | 'rezepturen' | 'auswertung'

export type Bereich = {
  schluessel: Bereichsschluessel
  name: string
  ziel: string
}

/**
 * Die Reihenfolge ist der Weg der Ware: Artikel gibt es, dann kommen sie an,
 * dann gehen sie über die Theke, dann wird gerechnet.
 */
export const BEREICHE: readonly Bereich[] = [
  { schluessel: 'artikel', name: 'Artikel', ziel: '/artikel' },
  { schluessel: 'lieferungen', name: 'Lieferungen', ziel: '/lieferungen' },
  { schluessel: 'umsatz', name: 'Umsatz', ziel: '/umsatz' },
  // Nach dem Umsatz, denn dort entstehen sie: die Rezepturen sind die
  // Leseansicht der bestätigten Zuordnungen.
  { schluessel: 'rezepturen', name: 'Rezepturen', ziel: '/rezepturen' },
  { schluessel: 'auswertung', name: 'Auswertung', ziel: '/auswertung' },
]

/**
 * Ab wie vielen Tagen Rückstand die Kassendaten als offener Punkt gelten.
 *
 * Zwei: der Kassenexport kommt am Morgen für den Vortag, ein Tag Rückstand ist
 * deshalb der Normalzustand und keine Meldung. Erst wenn ein ganzer Tag in
 * keinem Import steht, fehlt der Auswertung etwas.
 */
const RUECKSTAND_TAGE = 2

/** Eine angelegte Lieferung, zu der keine einzige Position erfasst wurde. */
export type LeereLieferung = {
  id: string
  datum: Date
  lieferant: string
}

/**
 * Eine offene Preisabweichung, ein Eintrag je Abweichung. Gruppiert wird hier,
 * nicht in der Abfrage — wie viele Abweichungen ein Punkt je Lieferung sind,
 * ist eine Regel, keine Datenbankfrage.
 */
export type OffenePreisabweichung = {
  lieferungId: string
  lieferant: string
}

/** Die Rohwerte, aus denen die Punkte entstehen. */
export type Offenlage = {
  heute: Date
  /**
   * Der letzte Tag, den ein Umsatzimport abdeckt. `null`, wenn noch nie
   * importiert wurde — das ist ein anderer Fall als "seit Tagen nicht mehr".
   */
  umsatzBis: Date | null
  /** Kassenbezeichnungen, die noch niemand bestätigt hat. */
  ohneZuordnung: number
  lieferungenOhnePositionen: readonly LeereLieferung[]
  /** Offene Preisabweichungen aus der Wareneingangskontrolle. */
  preisabweichungen: readonly OffenePreisabweichung[]
}

export type OffenerPunkt = {
  /** Kurzzeichen der Zeile, eindeutig innerhalb einer Liste. */
  id: string
  /** Der Satz selbst: "2 Kassenbezeichnungen ohne Zuordnung". */
  titel: string
  /** Woher er kommt: "Zuletzt 04.08.", "Dörlemann". Ohne den Bereichsnamen. */
  unterzeile: string
  bereich: Bereichsschluessel
  /** Der Weg an die zuständige Stelle. */
  ziel: string
  /** Die Aufschrift dieses Wegs, wo Platz für sie ist: "Umsatz importieren". */
  aktion: string
}

const TAG_IN_MS = 86_400_000

/**
 * Tage zwischen zwei Zeitpunkten, in Kalendertagen gerechnet.
 *
 * `umsatzBis` trägt den letzten Augenblick seines Tages (23:59:59.999), `heute`
 * dessen Mitternacht. Eine Differenz in Millisekunden wäre deshalb immer um
 * einen Wimpernschlag daneben — gezählt werden die Tagesnummern.
 */
function tageZwischen(von: Date, bis: Date): number {
  return Math.floor(bis.getTime() / TAG_IN_MS) - Math.floor(von.getTime() / TAG_IN_MS)
}

/**
 * Die offenen Punkte, dringlichster zuerst.
 *
 * Die Reihenfolge ist die des Schadens: ohne Kassendaten steht der Sollbestand
 * überhaupt nicht, eine fehlende Zuordnung verfälscht ihn, eine nicht erfasste
 * Lieferung betrifft eine Handvoll Artikel.
 *
 * Eine leere Liste ist eine Aussage: dann ist nichts offen.
 */
export function offenePunkte(lage: Offenlage): OffenerPunkt[] {
  const punkte: OffenerPunkt[] = []

  if (lage.umsatzBis === null) {
    punkte.push({
      id: 'umsatz-nie',
      titel: 'Noch keine Umsatzdaten importiert',
      unterzeile: 'Ohne Verkäufe gibt es keinen Sollbestand',
      bereich: 'umsatz',
      ziel: '/umsatz',
      aktion: 'Umsatz importieren',
    })
  } else {
    const rueckstand = tageZwischen(lage.umsatzBis, lage.heute)
    if (rueckstand >= RUECKSTAND_TAGE) {
      punkte.push({
        id: 'umsatz-rueckstand',
        titel: `Umsatzdaten seit ${rueckstand} Tagen nicht importiert`,
        unterzeile: `Zuletzt ${alsKurzdatum(lage.umsatzBis)}`,
        bereich: 'umsatz',
        ziel: '/umsatz',
        aktion: 'Umsatz importieren',
      })
    }
  }

  if (lage.ohneZuordnung > 0) {
    punkte.push({
      id: 'zuordnung',
      titel:
        lage.ohneZuordnung === 1
          ? '1 Kassenbezeichnung ohne Zuordnung'
          : `${lage.ohneZuordnung} Kassenbezeichnungen ohne Zuordnung`,
      unterzeile: 'Umsatz zählt nicht auf Artikel',
      bereich: 'umsatz',
      ziel: '/umsatz/zuordnung',
      aktion: 'Zuordnen',
    })
  }

  for (const lieferung of lage.lieferungenOhnePositionen) {
    punkte.push({
      id: `lieferung-${lieferung.id}`,
      // Nie "0 Positionen": die Null wäre die Aussage "nachgesehen, es kam
      // nichts", und die hat hier niemand getroffen.
      titel: `Lieferung vom ${alsKurzdatum(lieferung.datum)} ohne Positionen`,
      unterzeile: lieferung.lieferant,
      bereich: 'lieferungen',
      ziel: `/lieferungen/${lieferung.id}`,
      aktion: 'Positionen erfassen',
    })
  }

  // Ein Punkt je Lieferung, nicht je Abweichung: geklärt wird am selben
  // Bildschirm, und fünf Zeilen desselben Lieferscheins wären fünfmal derselbe
  // Weg. Die Reihenfolge der Abfrage bleibt erhalten.
  const jeLieferung = new Map<string, { lieferant: string; anzahl: number }>()
  for (const abweichung of lage.preisabweichungen) {
    const stand = jeLieferung.get(abweichung.lieferungId)
    if (stand === undefined) {
      jeLieferung.set(abweichung.lieferungId, { lieferant: abweichung.lieferant, anzahl: 1 })
    } else {
      stand.anzahl += 1
    }
  }
  for (const [lieferungId, stand] of jeLieferung) {
    punkte.push({
      id: `preise-${lieferungId}`,
      titel:
        stand.anzahl === 1
          ? '1 Preisabweichung zu klären'
          : `${stand.anzahl} Preisabweichungen zu klären`,
      unterzeile: stand.lieferant,
      bereich: 'lieferungen',
      ziel: `/lieferungen/${lieferungId}/preise`,
      aktion: 'Preise klären',
    })
  }

  return punkte
}

/**
 * Wie viele Punkte auf jeden Bereich entfallen — die Zahl an der Bereichszeile
 * und der Punkt in der Seitennavigation.
 *
 * Aus derselben Liste gezählt und nicht neu abgefragt: eine Bereichszeile, die
 * "2 offen" sagt, während die Liste darüber drei Sätze zeigt, ist genau der
 * Widerspruch, wegen dem niemand mehr einer der beiden Zahlen glaubt.
 */
export function punkteJeBereich(
  punkte: readonly OffenerPunkt[],
): Record<Bereichsschluessel, number> {
  const stand: Record<Bereichsschluessel, number> = {
    artikel: 0,
    lieferungen: 0,
    umsatz: 0,
    rezepturen: 0,
    auswertung: 0,
  }
  for (const punkt of punkte) stand[punkt.bereich] += 1
  return stand
}

/**
 * Der Zusatz an einer Bereichszeile: "2 offen". `undefined`, wo nichts offen
 * ist — eine "0 offen" wäre eine Meldung über das Ausbleiben einer Meldung.
 */
export function offenText(anzahl: number): string | undefined {
  return anzahl > 0 ? `${anzahl} offen` : undefined
}
