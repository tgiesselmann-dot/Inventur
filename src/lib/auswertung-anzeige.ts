/**
 * Was die Auswertung über eine Zeile hinaus zum Zeigen braucht: ihre Stufe und
 * ihre Ordnung.
 *
 * Getrennt von src/lib/auswertung.ts, weil dort die Rechnung steht, wegen der
 * es die App gibt. Hier steht keine Menge und kein Betrag zur Debatte — hier
 * wird nur entschieden, welche der fertig gerechneten Zahlen eine Farbe trägt
 * und in welcher Reihenfolge sie stehen.
 *
 * Beides gehört trotzdem nach src/lib und nicht ins JSX: eine Schwelle ist eine
 * Rechnung, auch wenn sie nur über eine Farbe entscheidet, und eine Sortierung,
 * die an zwei Stellen steht, ist an einer davon irgendwann falsch.
 */

import type { Decimal } from '@prisma/client/runtime/client'

import { alsText, type Zeile, type ZeileText } from '@/lib/auswertung'

/**
 * Wie eine Zeile auffällt.
 *
 *  - `zuviel`   — es steht mehr im Lager, als möglich wäre. Das ist kein
 *                 Verlust, sondern ein Zählfehler oder eine nicht erfasste
 *                 Lieferung, und deshalb bernsteinfarben und nicht rot: die
 *                 Frage ist eine andere, und wer sie mit Fehlbestand in einen
 *                 Topf wirft, sucht am falschen Ende.
 *  - `auffaellig` — Schwund über einer der beiden Schwellen. Rot.
 *  - `neutral`  — Schwund vorhanden, aber klein. Keine Farbe: eine Tabelle, in
 *                 der jede Zeile rot ist, sagt nichts mehr.
 *  - `ohne`     — es wird kein Schwund gerechnet, weil der Artikel portioniert
 *                 verkauft oder nicht gezählt wurde.
 */
export type Schwundstufe = 'neutral' | 'auffaellig' | 'zuviel' | 'ohne'

/**
 * Ab welchem Anteil der verkauften Menge ein Schwund auffällt.
 *
 * Bei zwölf von vierhundert verkauften Flaschen fragt niemand nach; bei zwölf
 * von dreissig schon. Die Schwelle bezieht sich deshalb auf den Durchsatz und
 * nicht auf die blosse Menge.
 */
export const ANTEIL_AUFFAELLIG = 0.03

/**
 * Ab welchem Wert ein Schwund unabhängig vom Anteil auffällt.
 *
 * Zwei Flaschen Champagner sind ein Prozent des Durchsatzes und trotzdem
 * vierundsechzig Euro. Die zweite Schwelle fängt genau die Zeilen, die
 * prozentual unauffällig und in Geld gerechnet teuer sind.
 */
const WERT_AUFFAELLIG_CENT = 1000

/**
 * Die Stufe einer gerechneten Zeile.
 *
 * Nimmt die `Zeile` mit ihren Decimal-Mengen und nicht die Textfassung: der
 * Anteil am Verkauf lässt sich aus „12,5" nicht rechnen, ohne den Text wieder
 * zu zerlegen — und damit wäre die zweite Rechenstelle da, die diese App gerade
 * abschafft.
 */
export function schwundstufe(eintrag: Zeile): Schwundstufe {
  const schwund = eintrag.schwund
  if (schwund === null) return 'ohne'
  if (schwund.isNegative()) return 'zuviel'
  if (schwund.isZero()) return 'neutral'

  const wert = eintrag.schwundWertCent
  if (wert !== null && wert >= WERT_AUFFAELLIG_CENT) return 'auffaellig'

  // Ohne Verkäufe gibt es keinen Durchsatz, auf den sich ein Anteil beziehen
  // könnte. Dann entscheidet allein der Wert — und wo auch der fehlt, bleibt
  // die Zeile neutral, statt eine Schwelle zu erfinden.
  if (eintrag.verkaeufe.lessThanOrEqualTo(0)) return 'neutral'

  return anteil(schwund, eintrag.verkaeufe) >= ANTEIL_AUFFAELLIG ? 'auffaellig' : 'neutral'
}

function anteil(schwund: Decimal, verkaeufe: Decimal): number {
  return schwund.dividedBy(verkaeufe).toNumber()
}

/** Eine Zeile, wie die Anzeige sie bekommt: Text plus Stufe. */
export type Anzeigezeile = ZeileText & { stufe: Schwundstufe }

export function alsAnzeige(eintrag: Zeile): Anzeigezeile {
  return { ...alsText(eintrag), stufe: schwundstufe(eintrag) }
}

/** Wonach die Tabelle geordnet ist. */
export type Sortierung = 'schwund-ab' | 'schwund-auf' | 'name'

export const SORTIERUNGEN: { wert: Sortierung; text: string; pfeil: string }[] = [
  { wert: 'schwund-ab', text: 'Nach Schwund, grösster zuerst', pfeil: '▼' },
  { wert: 'schwund-auf', text: 'Nach Schwund, kleinster zuerst', pfeil: '▲' },
  { wert: 'name', text: 'Nach Artikel, A–Z', pfeil: '↕' },
]

/**
 * Ordnet die Zeilen.
 *
 * Zeilen ohne Schwundwert stehen in beiden Schwundrichtungen hinten — auch in
 * der aufsteigenden. Sie sind keine besonders kleine Abweichung, sondern eine
 * unbeantwortete Frage, und gehören nicht zwischen die Zahlen. Genau deshalb
 * ist das Umdrehen der Liste keine Sortierung: ein `reverse()` der absteigenden
 * Ordnung stellte die offenen Fragen nach vorn.
 */
export function sortiert<T extends Anzeigezeile>(
  zeilen: readonly T[],
  sortierung: Sortierung,
): T[] {
  const liste = [...zeilen]

  if (sortierung === 'name') {
    return liste.sort((a, b) => nachName(a, b))
  }

  const richtung = sortierung === 'schwund-auf' ? -1 : 1
  return liste.sort((a, b) => {
    if (a.schwundWertCent === null && b.schwundWertCent === null) return nachName(a, b)
    if (a.schwundWertCent === null) return 1
    if (b.schwundWertCent === null) return -1
    if (a.schwundWertCent === b.schwundWertCent) return nachName(a, b)
    return richtung * (b.schwundWertCent - a.schwundWertCent)
  })
}

function nachName(a: Anzeigezeile, b: Anzeigezeile): number {
  return a.artikel.name.localeCompare(b.artikel.name, 'de')
}
