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

/**
 * Die Felder eines Artikels, die für die Bewertung gebraucht werden.
 * `ekPreisCent` darf null sein — dann ist der Preis nicht bekannt.
 */
export type BepreisterArtikel = {
  ekPreisCent: number | null
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

function preisCent(artikel: { ekPreisCent: number | null }): number | null {
  const { ekPreisCent } = artikel
  if (ekPreisCent === null) return null
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
 * Einheiten in einer Anzahl Liefergebinde.
 *
 * Anders als `gesamtEinheiten` rechnet diese Funktion über die Lieferung und
 * nicht über die Zählung: ein Karton Wein sind sechs Flaschen, auch wenn Wein
 * im Regal EINZELN gezählt wird. Am Wareneingang steht die Palette, nicht das
 * Regal — dort ist die Gebindegrösse die einzige Frage, und der Zählmodus geht
 * niemanden etwas an.
 *
 * Deshalb steht sie hier und nicht im Wareneingang: eine Multiplikation mit der
 * Gebindegrösse gehört in diese Datei, egal aus welcher Richtung sie kommt.
 */
export function einheitenAusGebinden(
  artikel: { einheitenProGebinde: number },
  anzahlGebinde: Menge,
): Decimal {
  return zuDecimal(anzahlGebinde, 'anzahlGebinde').times(gebindegroesse(artikel))
}

/**
 * Wie viele ganze Liefergebinde nötig sind, um `einheiten` Einheiten zu decken.
 *
 * Die Gegenrichtung zu `einheitenAusGebinden` und deshalb hier: es ist dieselbe
 * Gebindegrösse, nur als Divisor. Eine eigene Division in der Bestellung wäre
 * genau die zweite Rechenstelle, die diese Datei verhindert.
 *
 * Aufgerundet, ausnahmslos. Der Lieferant bringt keine halben Kästen, und ein
 * abgerundeter Bedarf ist eine Bestellung, die zu klein ist — bei einer
 * Reichweite von vier Wochen fällt das erst auf, wenn das Regal leer ist. Wer
 * wissen will, wie viel die Aufrundung über den Bedarf hinaus bringt, rechnet
 * mit `einheitenAusGebinden` zurück.
 */
export function gebindeFuerEinheiten(
  artikel: { einheitenProGebinde: number },
  einheiten: Menge,
): number {
  return zuDecimal(einheiten, 'einheiten')
    .div(gebindegroesse(artikel))
    .toDecimalPlaces(0, Decimal.ROUND_CEIL)
    .toNumber()
}

/**
 * Einheiten als Bruchteil von Liefergebinden — ungerundet.
 *
 * Für die Auskunft, nicht für die Bestellung: "Bestand 2,6 Kästen" neben einer
 * Bestellmenge in Kästen. `gebindeFuerEinheiten` rundet auf, weil niemand halbe
 * Kästen liefert — ein aufgerundeter Bestand behauptete dagegen einen Kasten,
 * der nicht da ist. Beim Einzelflaschen-Artikel ist das Ergebnis die
 * Flaschenzahl selbst.
 */
export function gebindeAusEinheiten(
  artikel: { einheitenProGebinde: number },
  einheiten: Menge,
): Decimal {
  return zuDecimal(einheiten, 'einheiten').div(gebindegroesse(artikel))
}

/** Die Felder einer Kassenzuordnung, die für die Umrechnung gebraucht werden. */
export type Verkaufszuordnung = {
  /** Wie viele Artikel-Einheiten ein Verkauf abbucht. */
  einheitenProVerkauf: Menge
}

/**
 * Einheiten, die eine Anzahl Kassenbuchungen vom Bestand abzieht.
 *
 * Die Kasse zählt Verkäufe, nicht Flaschen: 120 Buchungen "Gin Tonic" sind
 * 7,2 Flaschen Gin, wenn je Glas 0,06 Flaschen abgehen. Ohne diese Umrechnung
 * stünde die Kassenmenge unvermittelt neben der gezählten Menge.
 *
 * Steht hier und nicht in der Auswertung, aus demselben Grund wie alles andere
 * in dieser Datei: eine Umrechnung zwischen zwei Mengenbegriffen gehört an genau
 * eine Stelle.
 */
export function einheitenAusVerkauf(zuordnung: Verkaufszuordnung, menge: Menge): Decimal {
  const anzahl = zuDecimal(menge, 'menge')
  const jeVerkauf = zuDecimal(zuordnung.einheitenProVerkauf, 'einheitenProVerkauf')
  return anzahl.times(jeVerkauf)
}

/**
 * Welcher Anteil einer Einheit ein Ausschank von `ausschankLiter` ist — der Wert,
 * der als `einheitenProVerkauf` an einer Zuordnung steht. Ein 0,3-l-Glas aus der
 * Literflasche sind 0,3 Einheiten, ein 2-cl-Schnaps aus der 0,7er sind rund 0,029.
 *
 * Steht hier, weil auch das eine Umrechnung zwischen zwei Mengenbegriffen ist.
 * In der Zuordnungsmaske wäre sie ein Vorschlag mit eigener Formel — und damit
 * die zweite Stelle, an der die Grösse eines Gebindes ausgerechnet wird.
 *
 * Das Ergebnis ist auf drei Nachkommastellen gerundet, passend zur Spalte
 * `einheiten_pro_verkauf`. Es ist ein Vorschlag: was ein Verkauf wirklich aus dem
 * Lager nimmt, weiss der Betrieb und nicht die Flaschengrösse — beim Cocktail
 * mit zwei Zutaten stimmt die Rechnung ohnehin nur für eine davon.
 */
export function anteilJeAusschank(
  artikel: { einheitsgroesseLiter: Menge },
  ausschankLiter: Menge,
): Decimal {
  const inhalt = zuDecimal(artikel.einheitsgroesseLiter, 'einheitsgroesseLiter')
  if (inhalt.lessThanOrEqualTo(0)) {
    throw new EinheitenFehler(`einheitsgroesseLiter muss > 0 sein, ist aber ${inhalt.toString()}`)
  }
  return zuDecimal(ausschankLiter, 'ausschankLiter').div(inhalt).toDecimalPlaces(3)
}

/**
 * Die Ausschankgrösse in Litern, die zu einem Einheiten-Anteil gehört — die
 * Gegenrichtung zu `anteilJeAusschank`, mit derselben Flaschengrösse als
 * Faktor statt als Divisor. Gespeichert ist 0,06; die Rezepturansicht sagt
 * "6 cl". Wer das eine aus dem anderen macht, rechnet über diese beiden
 * Funktionen und nie selbst.
 *
 * Ungerundet: das Ergebnis ist eine Zahl zum Weiterreichen an den Anzeigetext
 * (src/lib/rezeptur.ts), und der rundet passend zu seiner Einheit — ein
 * 2-cl-Schnaps aus der 0,7er ist gespeichert 0,029 und wäre nach einer
 * Rundung hier keine 2 cl mehr.
 */
export function ausschankLiter(
  artikel: { einheitsgroesseLiter: Menge },
  zuordnung: Verkaufszuordnung,
): Decimal {
  const inhalt = zuDecimal(artikel.einheitsgroesseLiter, 'einheitsgroesseLiter')
  if (inhalt.lessThanOrEqualTo(0)) {
    throw new EinheitenFehler(`einheitsgroesseLiter muss > 0 sein, ist aber ${inhalt.toString()}`)
  }
  return zuDecimal(zuordnung.einheitenProVerkauf, 'einheitenProVerkauf').times(inhalt)
}

/**
 * Worin eine Menge je Verkauf angegeben wird: Zentiliter, Liter oder ganze
 * Zähleinheiten (Flasche beziehungsweise Fass — welches Wort, entscheidet der
 * Zählmodus des Artikels, nicht diese Datei).
 */
export type Ausschankeinheit = 'cl' | 'l' | 'einheit'

/** Eine Menge je Verkauf, wie die Theke sie sagt: 4 cl, 0,3 l, 1 Flasche. */
export type Mengenangabe = { wert: Decimal; einheit: Ausschankeinheit }

/**
 * Ab dieser Ausschankgrösse wird in Litern statt in Zentilitern gesprochen.
 *
 * Die Grenze ist die der Getränkekarte: Schnaps und Likör stehen dort in
 * Zentilitern (2 cl, 6 cl), alles ab dem kleinen Glas in Litern (0,1 l
 * Prosecco, 0,3 l Cola). Eine einzige Einheit für beides gäbe entweder
 * "0,02 l" oder "30 cl" — beides liest an der Theke niemand so.
 */
const LITER_AB = new Decimal('0.1')

/**
 * Der Einheiten-Anteil, der zu einer Mengenangabe gehört — was als
 * `einheitenProVerkauf` an der Zuordnung steht, wenn jemand "4 cl" sagt.
 *
 * Zentiliter und Liter laufen über `anteilJeAusschank` und tragen dessen
 * Rundung auf drei Nachkommastellen; ganze Einheiten gehen unverändert durch,
 * denn sie sind schon der Anteil. Die cl-zu-l-Teilung durch 100 steht hier und
 * nirgendwo sonst — sie ist eine Umrechnung zwischen zwei Mengenbegriffen wie
 * alles andere in dieser Datei.
 */
export function anteilAusMengenangabe(
  artikel: { einheitsgroesseLiter: Menge },
  wert: Menge,
  einheit: Ausschankeinheit,
): Decimal {
  const menge = zuDecimal(wert, 'wert')
  switch (einheit) {
    case 'einheit':
      return menge
    case 'cl':
      return anteilJeAusschank(artikel, menge.div(100))
    case 'l':
      return anteilJeAusschank(artikel, menge)
    default: {
      const unbekannt: never = einheit
      throw new EinheitenFehler(`Unbekannte Ausschankeinheit: ${String(unbekannt)}`)
    }
  }
}

/**
 * Die Gegenrichtung: welche Mengenangabe einen gespeicherten Anteil am
 * lesbarsten sagt. Ganze Einheiten bleiben ganze Einheiten ("1 Flasche"),
 * unter der Litergrenze wird in Zentilitern gesprochen, darüber in Litern.
 *
 * Gerundet auf ganze Zehntel-cl beziehungsweise drei Nachkommastellen im
 * Liter — die Auflösung der gespeicherten drei Nachkommastellen des Anteils.
 * Die Angabe ist damit das, was Karte und Eingabefeld zeigen: aus 0,029 der
 * 0,7er werden wieder "2 cl", und wer die 2 cl unverändert speichert, landet
 * wieder bei 0,029.
 */
export function mengenangabeAusAnteil(
  artikel: { einheitsgroesseLiter: Menge },
  zuordnung: Verkaufszuordnung,
): Mengenangabe {
  const anteil = zuDecimal(zuordnung.einheitenProVerkauf, 'einheitenProVerkauf')
  if (anteil.greaterThanOrEqualTo(1) && anteil.isInteger()) {
    return { wert: anteil, einheit: 'einheit' }
  }

  const liter = ausschankLiter(artikel, zuordnung)
  // Erst runden, dann die Grenze prüfen: 0,1 l Prosecco stehen gespeichert
  // als 0,133 der 0,75er und sind exakt 0,09975 l — ungerundet fielen sie
  // als "10 cl" auf die falsche Seite der eigenen Grenze.
  if (liter.toDecimalPlaces(2).lessThan(LITER_AB)) {
    return { wert: liter.times(100).toDecimalPlaces(1), einheit: 'cl' }
  }
  return { wert: liter.toDecimalPlaces(3), einheit: 'l' }
}

/**
 * Wert einer Anzahl Liefergebinde in Cent. `null`, wenn der Artikel keinen
 * Preis hinterlegt hat — dieselbe Regel wie bei `wertCent`: nicht bewertbar
 * ist nicht 0.
 *
 * Gedacht für den Wareneingang, wo Fehlmengen in Gebinden auffallen ("ein
 * Kasten fehlt") und in Euro reklamiert werden.
 */
export function wertGebindeCent(artikel: BepreisterArtikel, anzahlGebinde: Menge): number | null {
  return wertCent(artikel, einheitenAusGebinden(artikel, anzahlGebinde))
}

/**
 * Einkaufspreis einer einzelnen Einheit in Cent, kaufmännisch gerundet.
 * `null`, wenn der Artikel keinen Preis hinterlegt hat.
 *
 * Der gerundete Wert ist zur Anzeige gedacht. Für Bestandswerte `wertCent`
 * verwenden — das rechnet ungerundet weiter und vermeidet, dass sich der halbe
 * Cent je Einheit über den Bestand summiert.
 */
export function ekProEinheitCent(artikel: BepreisterArtikel): number | null {
  const preis = preisCent(artikel)
  if (preis === null) return null

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
 * Der Stammpreis, der zu einem Preis je Liefergebinde gehört — die Gegenrichtung
 * zu `wertGebindeCent`, und deshalb hier: es ist dieselbe Gebindegrösse, nur als
 * Divisor. Wer einen Lieferscheinpreis in den Artikelstamm übernimmt, rechnet
 * über diese Funktion, nicht selbst.
 *
 * Bei `PRO_GEBINDE` ist der Gebindepreis der Stammpreis und geht unverändert
 * durch. Bei `PRO_EINHEIT` wird er auf die Einheiten verteilt und kaufmännisch
 * gerundet — ein 24er-Kasten zu 17,99 EUR wird zu 75 Cent je Flasche. Der
 * Rundungsrest (75 × 24 = 1800, ein Cent über dem Gebindepreis) ist der Preis
 * des Einheitsbezugs und kein Fehler dieser Funktion; `wertCent` rechnet mit dem
 * gerundeten Stammpreis weiter.
 */
export function ekPreisCentAusGebindepreis(
  artikel: Pick<BepreisterArtikel, 'ekPreisBezug' | 'einheitenProGebinde'>,
  gebindepreisCent: number,
): number {
  if (!Number.isInteger(gebindepreisCent) || gebindepreisCent < 0) {
    throw new EinheitenFehler(
      `gebindepreisCent muss eine ganze Zahl >= 0 sein (Cent, nie Euro als Kommazahl), ist aber ${String(gebindepreisCent)}`,
    )
  }

  switch (artikel.ekPreisBezug) {
    case EkPreisBezug.PRO_GEBINDE:
      return gebindepreisCent

    case EkPreisBezug.PRO_EINHEIT:
      return kaufmaennisch(new Decimal(gebindepreisCent).div(gebindegroesse(artikel)))

    default: {
      const unbekannt: never = artikel.ekPreisBezug
      throw new EinheitenFehler(`Unbekannter Preisbezug: ${String(unbekannt)}`)
    }
  }
}

/**
 * Wert einer Menge Einheiten in Cent. `null`, wenn der Artikel keinen Preis
 * hinterlegt hat — dieser Bestand ist gezählt, aber nicht bewertbar. Summen über
 * mehrere Artikel müssen den Fall benennen, statt ihn als 0 mitzuzählen.
 *
 * Bei `PRO_GEBINDE` wird der Gebindepreis ungerundet auf die Einheiten verteilt
 * und erst das Ergebnis gerundet. Ein voller 24er-Kasten zu 17,99 EUR ist damit
 * wieder exakt 1799 Cent wert — über `ekProEinheitCent` (75) gerechnet wären es
 * 1800, und dieser Cent wüchse mit jedem Kasten im Lager.
 */
export function wertCent(artikel: BepreisterArtikel, einheiten: Menge): number | null {
  const preis = preisCent(artikel)
  const menge = zuDecimal(einheiten, 'einheiten')
  if (preis === null) return null

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
