/**
 * Anzeige- und Formularlogik des Artikelstamms: was die Liste und die
 * Detailmaske zeigen, und wie aus einem Formular ein Stammsatz wird.
 *
 * Hier wird nicht neu gerechnet: jede Umrechnung zwischen Gebinden, Einheiten
 * und Preisen läuft über src/lib/einheiten.ts. Diese Datei setzt die fertigen
 * Zahlen nur in Sätze — "18,59 EUR je Kasten = 0,77 EUR je Flasche" — und
 * liest Formulareingaben. Die einzige eigene Rechnung ist der Literpreis einer
 * Einzelflasche, und der steht deshalb hier und nirgendwo sonst.
 *
 * `einheitenProGebinde` wird hier gesetzt und durchgereicht, nie multipliziert
 * oder geteilt — tests/einheiten.test.ts wacht darüber, wie beim Artikelimport.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { EkPreisBezug, Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import { euroInCent, type Artikelstammsatz } from '@/lib/artikelimport'
import { passtZurSuche } from '@/lib/artikelsuche'
import { deutscheZahl } from '@/lib/csv'
import {
  einheitenAusGebinden,
  ekProEinheitCent,
  wertGebindeCent,
  type BepreisterArtikel,
  type Menge,
} from '@/lib/einheiten'
import { alsEuro, alsPreiseingabe } from '@/lib/wareneingang'
import { gebindeEinzahl, zaehlmodusText } from '@/lib/zaehlung'

/** Die Felder eines Artikels, die diese Datei zum Zeigen braucht. */
export type StammArtikel = BepreisterArtikel & {
  gebindeart: Gebindeart
  zaehlmodus: Zaehlmodus
  einheitsgroesseLiter: Menge
  lieferGebindeText: string
}

// ---------------------------------------------------------------------------
// Beschriftungen
// ---------------------------------------------------------------------------

/**
 * Die drei Auswahlkarten der Detailmaske. Das Beispiel sagt, wie eine Zählung
 * in diesem Modus aussieht — das erklärt mehr als jede Definition. Die Titel
 * kommen aus zaehlung.ts, wo alle Beschriftungen der Zählwelt stehen.
 */
export const ZAEHLMODUS_AUSWAHL: { wert: Zaehlmodus; titel: string; beispiel: string }[] = [
  {
    wert: Zaehlmodus.GEBINDE_PLUS_EINZELN,
    titel: zaehlmodusText(Zaehlmodus.GEBINDE_PLUS_EINZELN),
    beispiel: '6 Kästen und 4 Flaschen',
  },
  { wert: Zaehlmodus.EINZELN, titel: zaehlmodusText(Zaehlmodus.EINZELN), beispiel: '37 Flaschen' },
  {
    wert: Zaehlmodus.FASS,
    titel: zaehlmodusText(Zaehlmodus.FASS),
    beispiel: 'volle und angebrochene Fässer',
  },
]

/** Die Gebindearten für das Auswahlfeld, beschriftet mit ihrer Einzahl. */
export const GEBINDEART_AUSWAHL: { wert: Gebindeart; text: string }[] = [
  Gebindeart.KASTEN,
  Gebindeart.KARTON,
  Gebindeart.EINZELFLASCHE,
  Gebindeart.FASS,
].map((wert) => ({ wert, text: gebindeEinzahl(wert) }))

// ---------------------------------------------------------------------------
// Abgeleitete Angaben
// ---------------------------------------------------------------------------

/**
 * Liter mit mindestens zwei Nachkommastellen: "0,33", "7,92", "1,00". Die
 * dritte Stelle bleibt stehen, wo sie gebraucht wird (0,375-l-Flasche); "1"
 * würde neben "0,33" wie eine andere Sorte Angabe aussehen.
 */
function literZahl(wert: Decimal): string {
  const stellen = Math.min(3, Math.max(2, wert.decimalPlaces()))
  return wert.toFixed(stellen).replace('.', ',')
}

/**
 * Die Literzeile der Lieferung: "24 × 0,33 l = 7,92 l je Kasten".
 *
 * Die Menge je Gebinde kommt aus `einheitenAusGebinden` — die Multiplikation
 * mit der Gebindegrösse gehört einheiten.ts, auch wenn sie hier nur einen
 * Anzeigetext füttert.
 */
export function literJeGebindeText(
  artikel: Pick<StammArtikel, 'gebindeart' | 'einheitsgroesseLiter'> & {
    einheitenProGebinde: number
  },
): string {
  const inhalt = new Decimal(artikel.einheitsgroesseLiter)
  const jeGebinde = einheitenAusGebinden(artikel, 1).times(inhalt)
  const anzahl = einheitenAusGebinden(artikel, 1).toString()
  return `${anzahl} × ${literZahl(inhalt)} l = ${literZahl(jeGebinde)} l je ${gebindeEinzahl(artikel.gebindeart)}`
}

/**
 * Der Rechenweg des Preises: die eingegebene Zahl mit ihrem Bezug, darunter
 * die abgeleitete Angabe. `null`, wenn kein Preis hinterlegt ist — dieser Fall
 * heisst in der Oberfläche "Preis nicht bekannt" und nie 0,00 EUR.
 */
export type Preisrechenweg = {
  /** Die eingegebene Zahl mit ihrem Bezug: "18,59 EUR je Kasten". */
  haupt: string
  /** Die abgeleitete Zeile: "= 0,77 EUR je Flasche". null, wo es nichts abzuleiten gibt. */
  abgeleitet: string | null
}

/**
 * Literpreis einer Einzelflasche oder eines Fasses, kaufmännisch gerundet.
 *
 * Nur für Artikel mit einer Einheit je Gebinde: dort ist der eingegebene Preis
 * je Gebinde und je Einheit dieselbe Zahl, und die einzig interessante
 * Ableitung ist der Liter. Die Division durch den Inhalt steht hier und nicht
 * in einer Komponente.
 */
function preisJeLiterCent(preisJeEinheitCent: number, inhaltLiter: Decimal): number | null {
  if (inhaltLiter.lessThanOrEqualTo(0)) return null
  return new Decimal(preisJeEinheitCent)
    .div(inhaltLiter)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber()
}

export function preisRechenweg(artikel: StammArtikel): Preisrechenweg | null {
  if (artikel.ekPreisCent === null) return null

  const gebinde = gebindeEinzahl(artikel.gebindeart)
  const mehrereJeGebinde = einheitenAusGebinden(artikel, 1).greaterThan(1)

  if (mehrereJeGebinde) {
    // Kasten und Karton: die Einheit darin ist die Flasche.
    if (artikel.ekPreisBezug === EkPreisBezug.PRO_GEBINDE) {
      const jeEinheit = ekProEinheitCent(artikel)
      return {
        haupt: `${alsEuro(artikel.ekPreisCent)} je ${gebinde}`,
        abgeleitet: jeEinheit === null ? null : `= ${alsEuro(jeEinheit)} je Flasche`,
      }
    }
    const jeGebinde = wertGebindeCent(artikel, 1)
    return {
      haupt: `${alsEuro(artikel.ekPreisCent)} je Flasche`,
      abgeleitet: jeGebinde === null ? null : `= ${alsEuro(jeGebinde)} je ${gebinde}`,
    }
  }

  // Eine Einheit je Gebinde: beide Bezüge sind dieselbe Zahl, abgeleitet wird
  // der Liter — die Angabe, mit der sich eine 0,7er mit einer 1,0er vergleicht.
  const jeLiter = preisJeLiterCent(artikel.ekPreisCent, new Decimal(artikel.einheitsgroesseLiter))
  return {
    haupt: `${alsEuro(artikel.ekPreisCent)} je ${gebinde}`,
    abgeleitet: jeLiter === null ? null : `= ${alsEuro(jeLiter)} je Liter`,
  }
}

/**
 * Wie der Artikel im Zählbildschirm auftaucht: Gebindetext und Zählmodus.
 * Preis und Schwund-Schalter kommen dort bewusst nicht vor.
 */
export function zaehlZeile(artikel: Pick<StammArtikel, 'lieferGebindeText' | 'zaehlmodus'>): string {
  return `${artikel.lieferGebindeText} · ${zaehlmodusText(artikel.zaehlmodus)}`
}

// ---------------------------------------------------------------------------
// Abbildungen für die Client-Grenze
// ---------------------------------------------------------------------------
//
// Liste und Maske sind Client-Komponenten; über die Grenze gehen nur einfache
// Werte. Die beiden Abbildungen stehen hier und nicht in den Seiten, damit
// Decimal-Felder und die Gebindegrösse den Server nie verlassen — die
// Komponenten bekommen fertige Texte und zeigen sie nur.

/** Eine Zeile der Artikelliste, fertig zum Zeigen und Filtern. */
export type Listenzeile = {
  id: string
  name: string
  lieferGebindeText: string
  kategorie: string
  sortierung: number
  aktiv: boolean
  /** Der Zählmodus als Wort: "Gebinde plus einzeln". */
  modus: string
  /** null heisst "nicht bewertbar" — es ist kein Preis hinterlegt. */
  preis: Preisrechenweg | null
}

export function alsListenzeile(
  artikel: StammArtikel & {
    id: string
    name: string
    kategorie: string
    sortierung: number
    aktiv: boolean
  },
): Listenzeile {
  return {
    id: artikel.id,
    name: artikel.name,
    lieferGebindeText: artikel.lieferGebindeText,
    kategorie: artikel.kategorie,
    sortierung: artikel.sortierung,
    aktiv: artikel.aktiv,
    modus: zaehlmodusText(artikel.zaehlmodus),
    preis: preisRechenweg(artikel),
  }
}

/** Die Vorbelegung der Maske: alle Zahlen als Eingabetexte in deutscher Schreibweise. */
export type Formularwerte = {
  name: string
  kategorie: string
  sortierung: string
  gebindeart: Gebindeart
  zaehlmodus: Zaehlmodus
  lieferGebindeText: string
  einheiten: string
  inhalt: string
  /** Leer heisst "Preis nicht bekannt" — nie "0,00". */
  preis: string
  ekPreisBezug: EkPreisBezug
  schwundfaehig: boolean
  aktiv: boolean
}

export function alsFormularwerte(
  artikel: StammArtikel & {
    name: string
    kategorie: string
    sortierung: number
    schwundfaehig: boolean
    aktiv: boolean
  },
): Formularwerte {
  return {
    name: artikel.name,
    kategorie: artikel.kategorie,
    sortierung: String(artikel.sortierung),
    gebindeart: artikel.gebindeart,
    zaehlmodus: artikel.zaehlmodus,
    lieferGebindeText: artikel.lieferGebindeText,
    einheiten: einheitenAusGebinden(artikel, 1).toString(),
    inhalt: new Decimal(artikel.einheitsgroesseLiter).toString().replace('.', ','),
    preis: alsPreiseingabe(artikel.ekPreisCent),
    ekPreisBezug: artikel.ekPreisBezug,
    schwundfaehig: artikel.schwundfaehig,
    aktiv: artikel.aktiv,
  }
}

/**
 * Die Vorbelegung eines neuen Artikels. Kasten mit Zählung "Gebinde plus
 * einzeln" und Preis je Gebinde ist der häufigste Fall im Getränkelager;
 * schwundfähig ist die Vorgabe des Schemas.
 */
export const NEUER_ARTIKEL: Formularwerte = {
  name: '',
  kategorie: '',
  sortierung: '',
  gebindeart: Gebindeart.KASTEN,
  zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
  lieferGebindeText: '',
  einheiten: '',
  inhalt: '',
  preis: '',
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  schwundfaehig: true,
  aktiv: true,
}

// ---------------------------------------------------------------------------
// Live-Ableitung im Formular
// ---------------------------------------------------------------------------

/** Die rohen Eingabetexte, aus denen die Maske ihre berechneten Karten füllt. */
export type Entwurfseingaben = {
  gebindeart: Gebindeart
  /** Einheiten je Gebinde, wie eingetippt: "24". */
  einheiten: string
  /** Inhalt je Einheit in Litern, wie eingetippt: "0,33". */
  inhalt: string
  /** Einkaufspreis in Euro, wie eingetippt: "18,59". Leer heisst nicht bekannt. */
  preis: string
  bezug: EkPreisBezug
}

function ganzeZahl(text: string): number | null {
  const zahl = Number(text.trim())
  return Number.isInteger(zahl) && zahl >= 1 && text.trim() !== '' ? zahl : null
}

function dezimal(text: string): Decimal | null {
  try {
    const zahl = deutscheZahl(text)
    return zahl === null ? null : new Decimal(zahl)
  } catch {
    return null
  }
}

/**
 * Die Literzeile zu den aktuellen Eingaben. `null`, solange die Zahlen nicht
 * lesbar sind — eine halb getippte Eingabe ist kein Fehler, nur noch keine
 * Aussage.
 */
export function literAbleitung(eingaben: Entwurfseingaben): string | null {
  const einheiten = ganzeZahl(eingaben.einheiten)
  const inhalt = dezimal(eingaben.inhalt)
  if (einheiten === null || inhalt === null || inhalt.lessThanOrEqualTo(0)) return null
  return literJeGebindeText({
    gebindeart: eingaben.gebindeart,
    einheitenProGebinde: einheiten,
    einheitsgroesseLiter: inhalt,
  })
}

/**
 * Der Preis-Rechenweg zu den aktuellen Eingaben.
 *
 *  - `'unbekannt'` — das Feld ist leer. Die Maske zeigt die Karte
 *    "Preis nicht bekannt", nicht 0,00 EUR.
 *  - `null` — eine der Zahlen ist (noch) nicht lesbar; die Maske zeigt nichts.
 */
export function preisAbleitung(eingaben: Entwurfseingaben): Preisrechenweg | 'unbekannt' | null {
  if (eingaben.preis.trim() === '') return 'unbekannt'

  const einheiten = ganzeZahl(eingaben.einheiten)
  const inhalt = dezimal(eingaben.inhalt)
  let cent: number | null
  try {
    cent = euroInCent(eingaben.preis)
  } catch {
    return null
  }
  if (einheiten === null || inhalt === null || cent === null) return null

  return preisRechenweg({
    gebindeart: eingaben.gebindeart,
    // Der Zählmodus spielt für den Preis keine Rolle; StammArtikel verlangt ihn.
    zaehlmodus: Zaehlmodus.EINZELN,
    einheitenProGebinde: einheiten,
    einheitsgroesseLiter: inhalt,
    lieferGebindeText: '',
    ekPreisCent: cent,
    ekPreisBezug: eingaben.bezug,
  })
}

// ---------------------------------------------------------------------------
// Formular lesen
// ---------------------------------------------------------------------------

/** Ein gelesenes Formular: der Stammsatz plus der Aktiv-Schalter. */
export type Artikelsatz = Artikelstammsatz & { aktiv: boolean }

function pflichttext(formular: FormData, feld: string, name: string): string {
  const wert = String(formular.get(feld) ?? '').trim()
  if (wert === '') throw new Error(`${name} fehlt`)
  return wert
}

function schalter(formular: FormData, feld: string): boolean {
  return String(formular.get(feld) ?? '') === 'ja'
}

/**
 * Liest das Artikelformular in einen schreibfertigen Satz. Wirft bei
 * unbrauchbaren Werten eine Meldung, die so in der Maske stehen kann.
 *
 * Ein leeres Preisfeld wird zu `ekPreisCent: null` — "Preis nicht bekannt".
 * Es wird ausdrücklich nicht als 0 gespeichert: eine 0 wäre die Behauptung,
 * der Artikel koste nichts, und verfälschte jede Bewertung.
 */
export function leseArtikelformular(formular: FormData): Artikelsatz {
  const name = pflichttext(formular, 'name', 'Der Name')
  const kategorie = pflichttext(formular, 'kategorie', 'Die Kategorie')
  const lieferGebindeText = pflichttext(formular, 'lieferGebindeText', 'Der Anzeigetext des Gebindes')

  const sortierungstext = pflichttext(formular, 'sortierung', 'Die Sortiernummer')
  const sortierung = Number(sortierungstext)
  if (!Number.isInteger(sortierung) || sortierung < 0) {
    throw new Error(`Die Sortiernummer muss eine ganze Zahl sein, ist aber "${sortierungstext}"`)
  }

  const gebindeartText = String(formular.get('gebindeart') ?? '')
  if (!(gebindeartText in Gebindeart)) {
    throw new Error(`Unbekannte Gebindeart: "${gebindeartText}"`)
  }
  const zaehlmodusWert = String(formular.get('zaehlmodus') ?? '')
  if (!(zaehlmodusWert in Zaehlmodus)) {
    throw new Error(`Unbekannter Zählmodus: "${zaehlmodusWert}"`)
  }
  const bezugText = String(formular.get('ekPreisBezug') ?? '')
  if (!(bezugText in EkPreisBezug)) {
    throw new Error(`Unbekannter Preisbezug: "${bezugText}"`)
  }

  const einheitentext = pflichttext(formular, 'einheiten', 'Einheiten je Gebinde')
  const einheiten = ganzeZahl(einheitentext)
  if (einheiten === null) {
    throw new Error(`Einheiten je Gebinde muss eine ganze Zahl ab 1 sein, ist aber "${einheitentext}"`)
  }

  const inhaltstext = pflichttext(formular, 'inhalt', 'Der Inhalt je Einheit')
  const inhalt = dezimal(inhaltstext)
  if (inhalt === null || inhalt.lessThanOrEqualTo(0)) {
    throw new Error(`Der Inhalt je Einheit muss eine Zahl über 0 sein, ist aber "${inhaltstext}"`)
  }

  const preistext = String(formular.get('preis') ?? '')
  let ekPreisCent: number | null
  try {
    ekPreisCent = euroInCent(preistext)
  } catch {
    throw new Error(`Der Einkaufspreis ist keine Zahl: "${preistext}"`)
  }
  if (ekPreisCent !== null && ekPreisCent < 0) {
    throw new Error('Der Einkaufspreis darf nicht negativ sein')
  }

  return {
    name,
    kategorie,
    sortierung,
    lieferGebindeText,
    einheitenProGebinde: einheiten,
    einheitsgroesseLiter: inhalt,
    gebindeart: gebindeartText as Gebindeart,
    zaehlmodus: zaehlmodusWert as Zaehlmodus,
    ekPreisCent,
    ekPreisBezug: bezugText as EkPreisBezug,
    schwundfaehig: schalter(formular, 'schwundfaehig'),
    aktiv: schalter(formular, 'aktiv'),
  }
}

// ---------------------------------------------------------------------------
// Filter der Liste
// ---------------------------------------------------------------------------

export type Standfilter = 'alle' | 'aktiv' | 'stillgelegt'

export type Listenfilter = {
  /** Sucht in Name und Liefergebindetext — der Schlüssel ist beides zusammen. */
  suche: string
  /** Leer heisst: alle Kategorien. */
  kategorie: string
  stand: Standfilter
}

type Filterbar = { name: string; lieferGebindeText: string; kategorie: string; aktiv: boolean }

/**
 * Filtert die Liste. Die Trefferregel selbst steht in src/lib/artikelsuche.ts —
 * die Zählliste im Lager sucht mit derselben, und zwei Fassungen davon würden
 * bei derselben Eingabe Verschiedenes finden.
 */
export function gefiltert<T extends Filterbar>(liste: readonly T[], filter: Listenfilter): T[] {
  return liste.filter((artikel) => {
    if (filter.stand === 'aktiv' && !artikel.aktiv) return false
    if (filter.stand === 'stillgelegt' && artikel.aktiv) return false
    if (filter.kategorie !== '' && artikel.kategorie !== filter.kategorie) return false

    return passtZurSuche(artikel, filter.suche)
  })
}

/** Die Zähler der drei Stand-Segmente, unabhängig vom gewählten Stand. */
export function standzahlen(liste: readonly { aktiv: boolean }[]): {
  alle: number
  aktiv: number
  stillgelegt: number
} {
  const aktiv = liste.filter((artikel) => artikel.aktiv).length
  return { alle: liste.length, aktiv, stillgelegt: liste.length - aktiv }
}

/** Die Kategorien in der Reihenfolge ihres ersten Auftretens im Laufweg. */
export function kategorien(liste: readonly { kategorie: string }[]): string[] {
  return [...new Set(liste.map((artikel) => artikel.kategorie))]
}
