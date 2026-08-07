/**
 * Umrechnung zwischen Liefergebinden und Zähleinheiten — und die einzige Stelle
 * im Projekt, die das tut.
 *
 * Die Tabellenkalkulation, die diese App ablöst, rechnet dieselbe Umrechnung an
 * mehreren Stellen mit jeweils eigener Formel; sobald eine Gebindegrösse sich
 * ändert, driften die Blätter auseinander. Deshalb gilt hier: wer Gebinde in
 * Einheiten umrechnet, ruft `gesamtEinheiten` auf. Eine Division durch
 * `einheitenProGebinde` gehört an keine andere Stelle des Projekts —
 * `tests/einheiten.test.ts` prüft das nach.
 *
 * Gerechnet wird über `zaehlmodus`, nicht über `gebindeart`: wie ein Artikel
 * geliefert wird, sagt nichts darüber, wie er gezählt wird. Wein kommt im
 * KARTON, steht aber als Einzelflaschen im Regal und wird EINZELN gezählt.
 *
 * Reine Funktionen: keine DB-Zugriffe, kein Zustand, keine Seiteneffekte.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { EkPreisBezug, Zaehlmodus } from '@/generated/prisma/enums'

// Decimal kommt bewusst aus der Prisma-Runtime statt aus dem generierten Client:
// es ist dieselbe Klasse, die Prisma für Decimal-Spalten liefert, aber der Import
// zieht weder den Datenbank-Client noch dessen Node-Interna nach. Damit bleibt
// diese Datei auch in einer Client-Komponente verwendbar.

/** Mengenangabe, wie sie aus der DB (Decimal), einem Formular (string) oder Code (number) kommt. */
export type Menge = Decimal | number | string

/** Die Felder eines Artikels, die für die Zählung gebraucht werden. */
export type ZaehlbarerArtikel = {
  zaehlmodus: Zaehlmodus
  einheitenProGebinde: number
}

/** Die Felder eines Artikels, die für die Bewertung gebraucht werden. */
export type BepreisterArtikel = {
  ekPreisCent: number
  ekPreisBezug: EkPreisBezug
  einheitenProGebinde: number
}

/**
 * Fehler in den Eingangsdaten einer Umrechnung — eine Zählung, die zum Zählmodus
 * nicht passt, oder ein Stammsatz mit unbrauchbarer Gebindegrösse. Eigene Klasse,
 * damit Aufrufer diese Fälle von echten Programmfehlern unterscheiden können.
 */
export class EinheitenFehler extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EinheitenFehler'
  }
}

function zuDecimal(wert: Menge, feld: string): Decimal {
  let dezimal: Decimal
  try {
    dezimal = new Decimal(wert)
  } catch {
    throw new EinheitenFehler(`${feld} ist keine gültige Zahl: ${String(wert)}`)
  }
  if (!dezimal.isFinite()) {
    throw new EinheitenFehler(`${feld} ist keine endliche Zahl: ${String(wert)}`)
  }
  if (dezimal.isNegative()) {
    throw new EinheitenFehler(`${feld} darf nicht negativ sein: ${dezimal.toString()}`)
  }
  return dezimal
}

/**
 * Gebindegrösse aus dem Stammsatz. Wird nur dort geprüft, wo tatsächlich damit
 * gerechnet wird — ein Fassartikel darf 1 stehen haben, ohne dass es stört.
 */
function gebindegroesse(artikel: { einheitenProGebinde: number }): number {
  const { einheitenProGebinde } = artikel
  if (!Number.isInteger(einheitenProGebinde) || einheitenProGebinde < 1) {
    throw new EinheitenFehler(
      `einheitenProGebinde muss eine ganze Zahl >= 1 sein, ist aber ${String(einheitenProGebinde)}`,
    )
  }
  return einheitenProGebinde
}

function preisCent(artikel: { ekPreisCent: number }): number {
  const { ekPreisCent } = artikel
  if (!Number.isInteger(ekPreisCent) || ekPreisCent < 0) {
    throw new EinheitenFehler(
      `ekPreisCent muss eine ganze Zahl >= 0 sein (Cent, nie Euro als Kommazahl), ist aber ${String(ekPreisCent)}`,
    )
  }
  return ekPreisCent
}

/** Kaufmännisch runden: bei genau 0,5 wird von der Null weg aufgerundet. */
function kaufmaennisch(wert: Decimal): number {
  return wert.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

/**
 * Gezählte Menge in Einheiten, unabhängig davon, wie der Artikel geliefert wird.
 *
 * - `GEBINDE_PLUS_EINZELN`: volle Gebinde mal Gebindegrösse plus lose Einheiten.
 * - `EINZELN`: nur lose Einheiten; `anzahlGebinde` muss 0 sein.
 * - `FASS`: nur Gebinde, Dezimalwerte erlaubt (0,5 = angebrochenes Fass);
 *   `anzahlEinzeln` muss 0 sein.
 *
 * Die beiden Nullprüfungen sind Absicht: ein Wert am falschen Feld ist eine
 * Fehlerfassung. Würde er stillschweigend verworfen, fehlte er später im
 * Bestand, ohne dass jemand die Ursache noch findet.
 */
export function gesamtEinheiten(
  artikel: ZaehlbarerArtikel,
  anzahlGebinde: Menge,
  anzahlEinzeln: Menge,
): Decimal {
  const gebinde = zuDecimal(anzahlGebinde, 'anzahlGebinde')
  const einzeln = zuDecimal(anzahlEinzeln, 'anzahlEinzeln')

  switch (artikel.zaehlmodus) {
    case Zaehlmodus.GEBINDE_PLUS_EINZELN:
      return gebinde.times(gebindegroesse(artikel)).plus(einzeln)

    case Zaehlmodus.EINZELN:
      if (!gebinde.isZero()) {
        throw new EinheitenFehler(
          `Zählmodus EINZELN kennt keine Gebinde, anzahlGebinde muss 0 sein (ist ${gebinde.toString()})`,
        )
      }
      return einzeln

    case Zaehlmodus.FASS:
      if (!einzeln.isZero()) {
        throw new EinheitenFehler(
          `Zählmodus FASS kennt keine losen Einheiten, anzahlEinzeln muss 0 sein (ist ${einzeln.toString()})`,
        )
      }
      return gebinde

    default: {
      // Fängt einen künftig ergänzten Enum-Wert beim Kompilieren ab, statt hier
      // still 0 zurückzugeben.
      const unbekannt: never = artikel.zaehlmodus
      throw new EinheitenFehler(`Unbekannter Zählmodus: ${String(unbekannt)}`)
    }
  }
}

/**
 * Einkaufspreis einer einzelnen Einheit in Cent, kaufmännisch gerundet.
 *
 * Der gerundete Wert ist zur Anzeige gedacht. Für Bestandswerte `wertCent`
 * verwenden — das rechnet ungerundet weiter und vermeidet, dass sich der halbe
 * Cent je Einheit über den Bestand summiert.
 */
export function ekProEinheitCent(artikel: BepreisterArtikel): number {
  const preis = preisCent(artikel)

  switch (artikel.ekPreisBezug) {
    case EkPreisBezug.PRO_EINHEIT:
      return preis

    case EkPreisBezug.PRO_GEBINDE:
      return kaufmaennisch(new Decimal(preis).div(gebindegroesse(artikel)))

    default: {
      const unbekannt: never = artikel.ekPreisBezug
      throw new EinheitenFehler(`Unbekannter Preisbezug: ${String(unbekannt)}`)
    }
  }
}

/**
 * Wert einer Menge Einheiten in Cent.
 *
 * Bei `PRO_GEBINDE` wird der Gebindepreis ungerundet auf die Einheiten verteilt
 * und erst das Ergebnis gerundet. Ein voller 24er-Kasten zu 17,99 EUR ist damit
 * wieder exakt 1799 Cent wert — über `ekProEinheitCent` (75) gerechnet wären es
 * 1800, und dieser Cent wüchse mit jedem Kasten im Lager.
 */
export function wertCent(artikel: BepreisterArtikel, einheiten: Menge): number {
  const preis = preisCent(artikel)
  const menge = zuDecimal(einheiten, 'einheiten')

  switch (artikel.ekPreisBezug) {
    case EkPreisBezug.PRO_EINHEIT:
      return kaufmaennisch(new Decimal(preis).times(menge))

    case EkPreisBezug.PRO_GEBINDE:
      return kaufmaennisch(new Decimal(preis).times(menge).div(gebindegroesse(artikel)))

    default: {
      const unbekannt: never = artikel.ekPreisBezug
      throw new EinheitenFehler(`Unbekannter Preisbezug: ${String(unbekannt)}`)
    }
  }
}
