/**
 * Die Rezepturansicht: was eine Kassenbuchung aus dem Lager nimmt, als lesbare
 * Karte statt als Faktor — und die Umkehrung, welche Getränke aus einem
 * Artikel zapfen.
 *
 * Gespeichert ist an der Zuordnung `einheitenProVerkauf` (0,06). Hier wird
 * daraus die Sprache der Theke: "6 cl Aperol", "0,25 l vom 50-l-Fass",
 * "1 Flasche". Die Literrechnung dahinter steht in src/lib/einheiten.ts
 * (`ausschankLiter`), die Fass-oder-Flasche-Weiche in
 * src/lib/kassenzuordnung-anzeige.ts (`zaehleinheit`) — diese Datei setzt nur
 * Wörter um beide herum und rechnet nichts doppelt.
 *
 * Reine Funktionen: keine Datenbank, kein Zustand. Die Maske
 * (src/app/rezepturen/page.tsx) reicht ihre Zeilen hierher und zeigt, was
 * zurückkommt.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { Gebindeart, type Zaehlmodus } from '@/generated/prisma/enums'
import { mengenangabeAusAnteil, type Menge } from '@/lib/einheiten'
import { zaehleinheit } from '@/lib/kassenzuordnung-anzeige'
import { gebindeMenge } from '@/lib/zaehlung'

/** Die Felder eines Artikels, die die Rezepturansicht braucht. */
export type Rezepturartikel = {
  name: string
  lieferGebindeText: string
  einheitsgroesseLiter: Menge
  zaehlmodus: Zaehlmodus
}

/** Ein Bestandteil, wie er an der Zuordnung hängt. */
export type Rezepturbestandteil = {
  artikel: Rezepturartikel
  einheitenProVerkauf: Menge
}

/** Eine Kassenbezeichnung mit dem, was sie abzieht. */
export type Rezepturzeile = {
  posBezeichnung: string
  /** false heisst: Vorschlag, noch nicht bestätigt — die Karte sagt das dazu. */
  bestaetigt: boolean
  bestandteile: readonly Rezepturbestandteil[]
}

/** Eine Zutat, fertig zum Zeigen: "6 cl" / "Aperol" / "aus der 1,0-l-Flasche". */
export type Zutatenzeile = {
  menge: string
  artikel: string
  herkunft: string
}

/** Eine Karte der Ansicht "Nach Getränk". */
export type Getraenkekarte = {
  posBezeichnung: string
  bestaetigt: boolean
  zutaten: readonly Zutatenzeile[]
}

/** Eine Zeile des Abschnitts "Flasche über die Theke". */
export type Flaschenzeile = {
  posBezeichnung: string
  bestaetigt: boolean
  /** "Coca Cola · 24 x 0,33" */
  artikelText: string
}

/** Eine Karte der Ansicht "Nach Artikel". */
export type Artikelkarte = {
  artikel: string
  gebindeText: string
  abnehmer: readonly {
    posBezeichnung: string
    menge: string
    bestaetigt: boolean
  }[]
  /** "10 Getränke zapfen aus diesem Artikel" */
  fusszeile: string
}

/**
 * Die Menge einer Zutat, wie die Theke sie sagt.
 *
 * Welche der drei Formen — ganze Einheiten ("1 Flasche", "2 Flaschen",
 * "1 Fass"), Zentiliter ("2 cl", "6 cl") oder Liter ("0,1 l", "0,25 l") —
 * entscheidet `mengenangabeAusAnteil` in src/lib/einheiten.ts; dieselbe
 * Weiche füllt auch das Mengenfeld der Zuordnungsmaske vor. Hier wird nur
 * noch das Wort dazu gesetzt: bei ganzen Einheiten das Gebindewort nach
 * Zählmodus, sonst die Einheit selbst.
 */
export function mengentext(artikel: Rezepturartikel, einheitenProVerkauf: Menge): string {
  const angabe = mengenangabeAusAnteil(artikel, { einheitenProVerkauf })
  if (angabe.einheit === 'einheit') {
    return gebindeMenge(angabe.wert.toString(), zaehleinheit(artikel))
  }
  return `${alsDeutsch(angabe.wert)} ${angabe.einheit}`
}

/**
 * Woher die Zutat kommt: "aus der 1,0-l-Flasche", "vom 30-l-Fass" — beim
 * vollen Gebinde der Liefertext selbst ("24 x 0,33"), denn dort ist die
 * Flaschengrösse schon Teil der Aussage.
 */
export function herkunftstext(artikel: Rezepturartikel, einheitenProVerkauf: Menge): string {
  const anteil = new Decimal(einheitenProVerkauf)
  if (anteil.greaterThanOrEqualTo(1) && anteil.isInteger()) {
    return artikel.lieferGebindeText
  }

  const groesse = alsDeutsch(new Decimal(artikel.einheitsgroesseLiter).toDecimalPlaces(2))
  return zaehleinheit(artikel) === Gebindeart.FASS
    ? `vom ${groesse}-l-Fass`
    : `aus der ${groesse}-l-Flasche`
}

/**
 * Ob eine Zeile in den Karten-Abschnitt "Ausschank und Mischung" gehört oder
 * in die Kompaktliste "Flasche über die Theke".
 *
 * Mischung ist alles, was mehr als einen Artikel anfasst oder nicht in vollen
 * Einheiten abgeht. Die Trennung ist Lesbarkeit, keine Wertung: hundert
 * Zeilen "eine Buchung, eine Flasche" würden die zwanzig Rezepturen begraben,
 * an denen tatsächlich etwas zu wissen ist.
 */
export function istMischung(bestandteile: readonly Rezepturbestandteil[]): boolean {
  if (bestandteile.length !== 1) return true
  const anteil = new Decimal(bestandteile[0].einheitenProVerkauf)
  return !(anteil.greaterThanOrEqualTo(1) && anteil.isInteger())
}

/** Die Ansicht "Nach Getränk": Karten und Kompaktzeilen, je alphabetisch. */
export function nachGetraenk(zeilen: readonly Rezepturzeile[]): {
  mischungen: Getraenkekarte[]
  flaschen: Flaschenzeile[]
} {
  const mitBestandteilen = zeilen.filter((zeile) => zeile.bestandteile.length > 0)
  const sortiert = [...mitBestandteilen].sort((a, b) =>
    a.posBezeichnung.localeCompare(b.posBezeichnung, 'de'),
  )

  const mischungen: Getraenkekarte[] = []
  const flaschen: Flaschenzeile[] = []

  for (const zeile of sortiert) {
    if (istMischung(zeile.bestandteile)) {
      mischungen.push({
        posBezeichnung: zeile.posBezeichnung,
        bestaetigt: zeile.bestaetigt,
        zutaten: zeile.bestandteile.map((teil) => ({
          menge: mengentext(teil.artikel, teil.einheitenProVerkauf),
          artikel: teil.artikel.name,
          herkunft: herkunftstext(teil.artikel, teil.einheitenProVerkauf),
        })),
      })
      continue
    }

    const teil = zeile.bestandteile[0]
    flaschen.push({
      posBezeichnung: zeile.posBezeichnung,
      bestaetigt: zeile.bestaetigt,
      artikelText: `${teil.artikel.name} · ${teil.artikel.lieferGebindeText}`,
    })
  }

  return { mischungen, flaschen }
}

/**
 * Die Ansicht "Nach Artikel": je Lagerartikel die Getränke, die aus ihm
 * zapfen — die Antwort auf die Schwundfrage "Wer verbraucht meinen Prosecco?".
 *
 * Artikel ohne Abnehmer erscheinen nicht: eine leere Karte wäre keine
 * Auskunft. Gruppiert wird über Name und Gebinde, denselben zwei Angaben, die
 * einen Artikel auch im Stamm unterscheiden.
 */
export function nachArtikel(zeilen: readonly Rezepturzeile[]): Artikelkarte[] {
  const karten = new Map<
    string,
    { artikel: Rezepturartikel; abnehmer: { posBezeichnung: string; menge: string; bestaetigt: boolean }[] }
  >()

  for (const zeile of zeilen) {
    for (const teil of zeile.bestandteile) {
      const schluessel = `${teil.artikel.name} · ${teil.artikel.lieferGebindeText}`
      const karte = karten.get(schluessel) ?? { artikel: teil.artikel, abnehmer: [] }
      karte.abnehmer.push({
        posBezeichnung: zeile.posBezeichnung,
        menge: mengentext(teil.artikel, teil.einheitenProVerkauf),
        bestaetigt: zeile.bestaetigt,
      })
      karten.set(schluessel, karte)
    }
  }

  return [...karten.values()]
    .map((karte) => ({
      artikel: karte.artikel.name,
      gebindeText: karte.artikel.lieferGebindeText,
      abnehmer: karte.abnehmer.sort((a, b) =>
        a.posBezeichnung.localeCompare(b.posBezeichnung, 'de'),
      ),
      fusszeile:
        karte.abnehmer.length === 1
          ? '1 Getränk zapft aus diesem Artikel'
          : `${karte.abnehmer.length} Getränke zapfen aus diesem Artikel`,
    }))
    .sort(
      (a, b) =>
        a.artikel.localeCompare(b.artikel, 'de') ||
        // Derselbe Name in zwei Gebinden (Cola als Kasten und als Literflasche)
        // braucht eine feste zweite Ordnung, sonst hinge sie an der Zeilenfolge
        // der Datenbank.
        a.gebindeText.localeCompare(b.gebindeText, 'de'),
    )
}

/** Dezimalzahl als deutscher Text: 0.25 -> "0,25", 2 -> "2". */
function alsDeutsch(wert: Decimal): string {
  return wert.toString().replace('.', ',')
}
