/**
 * Die Rechnung, wegen der es diese App gibt.
 *
 * Je Artikel und Zeitraum gilt:
 *
 *   Anfangsbestand + Lieferungen − Verkäufe = Sollbestand
 *   Sollbestand − Istbestand                = Schwund
 *
 * Positiver Schwund heisst: es fehlt etwas, das niemand verkauft hat. Negativer
 * Schwund heisst, dass mehr im Lager steht als möglich — kein Grund zur Freude,
 * sondern ein Hinweis auf eine nicht erfasste Lieferung oder einen Zählfehler.
 *
 * Alle Mengen laufen in Einheiten, nicht in Gebinden: die Kasse bucht
 * Einzelverkäufe, die Zählung zählt Flaschen, und nur in Einheiten sind die
 * drei Quellen überhaupt vergleichbar. Die Umrechnungen dorthin stehen
 * sämtlich in src/lib/einheiten.ts — hier wird keine einzige Multiplikation mit
 * einer Gebindegrösse vorgenommen.
 *
 * Drei Fälle darf diese Datei nicht verwischen, weil sie in der Excel genau
 * deshalb untergegangen sind:
 *  1. Artikel ohne Einkaufspreis sind gezählt, aber nicht bewertbar. Ihr Wert
 *     ist `null` und niemals 0.
 *  2. Portioniert verkaufte Artikel (`schwundfaehig = false`) werden gezählt,
 *     aber nicht auf Schwund geprüft: die Kasse zählt Gläser, und eine
 *     Umrechnung auf Flaschen wäre geraten.
 *  3. Ein nicht gezählter Artikel hat keinen Istbestand. Sein Schwund ist
 *     unbekannt, nicht null.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { wertCent, type BepreisterArtikel } from '@/lib/einheiten'
import { alsEuro } from '@/lib/wareneingang'

/** Die Felder eines Artikels, die die Auswertung braucht. */
export type AuswertungsArtikel = BepreisterArtikel & {
  id: string
  name: string
  kategorie: string
  lieferGebindeText: string
  /** false für portioniert verkaufte Artikel — sie bekommen keine Schwundrechnung. */
  schwundfaehig: boolean
}

/**
 * Ein Beleg hinter einer Zahl: welche Zählung, welche Lieferung, welcher
 * Kassenimport. Die Herleitung einer Zeile besteht aus diesen Einträgen — ohne
 * sie wäre die Auswertung eine Behauptung.
 */
export type Beleg = {
  /** Kurzzeichen, z. B. "LS-4711" oder "Zählung 31.07." */
  ref: string
  text: string
  /** Menge in Einheiten, als Text. */
  menge: string
}

/** Was für einen Artikel im Zeitraum zusammengekommen ist — alles in Einheiten. */
export type Bewegungen = {
  /** Bestand aus der Zählung am Anfang des Zeitraums. */
  anfang: Decimal
  lieferungen: Decimal
  verkaeufe: Decimal
  /** Bestand aus der Zählung am Ende. `null`, wenn dieser Artikel nicht gezählt wurde. */
  ist: Decimal | null
  belege: {
    anfang: Beleg[]
    lieferungen: Beleg[]
    verkaeufe: Beleg[]
    ist: Beleg[]
  }
}

export type Zeile = {
  artikel: AuswertungsArtikel
  anfang: Decimal
  lieferungen: Decimal
  verkaeufe: Decimal
  soll: Decimal
  ist: Decimal | null
  /** `null`, wenn nicht gezählt oder nicht schwundfähig. */
  schwund: Decimal | null
  /** Wert des Schwunds in Cent. `null`, wenn nicht bewertbar oder kein Schwund gerechnet wird. */
  schwundWertCent: number | null
  /** Wert des gezählten Bestands in Cent. `null` ohne hinterlegten Preis. */
  bestandWertCent: number | null
  belege: Bewegungen['belege']
}

/**
 * Sollbestand: was nach Papierlage im Lager stehen müsste.
 *
 * Nimmt nur die drei Mengen und nicht die ganzen `Bewegungen`, damit auch der
 * Bestellvorschlag damit rechnen kann: dort wird der gezählte Bestand bis heute
 * fortgeschrieben, und das ist dieselbe Rechnung — Anfang plus Zugänge minus
 * Abgänge. Zwei Additionen dafür wären zwei Stellen, an denen jemand ein
 * Vorzeichen dreht.
 */
export function sollbestand(
  bewegungen: Pick<Bewegungen, 'anfang' | 'lieferungen' | 'verkaeufe'>,
): Decimal {
  return bewegungen.anfang.plus(bewegungen.lieferungen).minus(bewegungen.verkaeufe)
}

/**
 * Wert einer Differenz in Cent — anders als eine erfasste Menge darf sie
 * negativ sein.
 *
 * `wertCent` weist negative Mengen zu Recht ab: eine gezählte Menge unter null
 * ist immer ein Fehler. Ein Schwund ist aber keine Menge, sondern ein
 * Unterschied zwischen zweien, und "mehr da als möglich" ist ein Befund, den
 * die Auswertung zeigen muss. Bewertet wird deshalb der Betrag, das Vorzeichen
 * kommt danach zurück.
 */
function wertDerDifferenz(artikel: AuswertungsArtikel, menge: Decimal): number | null {
  const betrag = wertCent(artikel, menge.abs())
  if (betrag === null) return null
  return menge.isNegative() ? -betrag : betrag
}

/**
 * Rechnet eine Zeile der Auswertung.
 *
 * Der Schwund bleibt `null`, wo er keine Aussage wäre — bei nicht gezählten und
 * bei portioniert verkauften Artikeln. Eine 0 stünde dort für "kein Schwund"
 * und wäre gelogen.
 */
export function zeile(artikel: AuswertungsArtikel, bewegungen: Bewegungen): Zeile {
  const soll = sollbestand(bewegungen)
  const gerechnet = bewegungen.ist !== null && artikel.schwundfaehig
  const schwund = gerechnet ? soll.minus(bewegungen.ist!) : null

  return {
    artikel,
    anfang: bewegungen.anfang,
    lieferungen: bewegungen.lieferungen,
    verkaeufe: bewegungen.verkaeufe,
    soll,
    ist: bewegungen.ist,
    schwund,
    schwundWertCent: schwund === null ? null : wertDerDifferenz(artikel, schwund),
    bestandWertCent: bewegungen.ist === null ? null : wertCent(artikel, bewegungen.ist),
    belege: bewegungen.belege,
  }
}

/**
 * Was an gezähltem Bestand zusammenkommt — über alles oder über eine Kategorie.
 *
 * `wertCent` ist `null` und nicht 0, wenn keine einzige gezählte Zeile einen
 * Preis trägt. Der Unterschied ist der ganze Punkt: eine Kategorie, in der
 * ausschliesslich Artikel ohne Einkaufspreis stehen, hat keinen Wert von null —
 * ihr Wert ist unbekannt. Eine 0 an dieser Stelle wäre dieselbe Lüge wie in der
 * Excel, nur ordentlicher gesetzt.
 *
 * `einheiten` steht davon unberührt da: gezählt wurde, auch wo niemand bewerten
 * kann.
 */
export type Bestand = {
  /** Gezählte Einheiten. */
  einheiten: Decimal
  /** Wert der bewerteten Zeilen in Cent. `null`, wenn keine bewertbar ist. */
  wertCent: number | null
  /** Gezählte Zeilen. */
  artikel: number
  /** Gezählte Zeilen ohne hinterlegten Preis — im Wert nicht enthalten. */
  ohnePreis: number
}

/**
 * Summiert den gezählten Bestand.
 *
 * Nicht gezählte Zeilen bleiben draussen, und zwar ganz: ein Artikel ohne
 * Istbestand ist keine Null im Regal, sondern eine offene Frage. Er zählt weder
 * in `artikel` noch in `ohnePreis` — sonst stünde neben dem Bestandswert eine
 * Zahl, die Preislücken behauptet, wo in Wirklichkeit die Zählung fehlt.
 */
export function bestand(zeilen: readonly Zeile[]): Bestand {
  let einheiten = new Decimal(0)
  let wert = 0
  let bewertet = 0
  let ohnePreis = 0
  let artikel = 0

  for (const eintrag of zeilen) {
    if (eintrag.ist === null) continue
    artikel += 1
    einheiten = einheiten.plus(eintrag.ist)

    if (eintrag.bestandWertCent === null) {
      ohnePreis += 1
      continue
    }
    wert += eintrag.bestandWertCent
    bewertet += 1
  }

  return { einheiten, wertCent: bewertet === 0 ? null : wert, artikel, ohnePreis }
}

/** Ein Bestand mit dem Namen seiner Kategorie und ihrem Gewicht im Ganzen. */
export type Kategoriebestand = Bestand & {
  kategorie: string
  /**
   * Anteil am gesamten Bestandswert, 0 bis 1 — die Breite des Balkens.
   * `null`, wo die Kategorie keinen bekannten Wert hat oder das Ganze keinen.
   */
  anteil: number | null
}

/**
 * Der gezählte Bestand je Kategorie, wertvollste zuerst.
 *
 * Kategorien ohne bekannten Wert stehen hinten — aus demselben Grund wie die
 * Zeilen ohne Schwundwert in `nachSchwund`: sie sind keine besonders billige
 * Kategorie, sondern eine unbeantwortete Frage, und gehören nicht zwischen die
 * Beträge. Ihre Einheiten stehen trotzdem da.
 *
 * Eine Kategorie, in der nichts gezählt wurde, kommt nicht vor. Die Zeile
 * "0 Einheiten · —" sagt nichts, was das Fehlen der Zeile nicht auch sagt.
 */
export function jeKategorie(zeilen: readonly Zeile[]): Kategoriebestand[] {
  const gesamt = bestand(zeilen).wertCent
  const gruppen = new Map<string, Zeile[]>()

  for (const eintrag of zeilen) {
    if (eintrag.ist === null) continue
    const vorhanden = gruppen.get(eintrag.artikel.kategorie)
    if (vorhanden === undefined) gruppen.set(eintrag.artikel.kategorie, [eintrag])
    else vorhanden.push(eintrag)
  }

  return [...gruppen.entries()]
    .map(([kategorie, eintraege]) => {
      const lage = bestand(eintraege)
      return {
        ...lage,
        kategorie,
        anteil:
          gesamt === null || gesamt <= 0 || lage.wertCent === null ? null : lage.wertCent / gesamt,
      }
    })
    .sort((a, b) => {
      if (a.wertCent === null && b.wertCent === null) {
        return a.kategorie.localeCompare(b.kategorie, 'de')
      }
      if (a.wertCent === null) return 1
      if (b.wertCent === null) return -1
      if (a.wertCent === b.wertCent) return a.kategorie.localeCompare(b.kategorie, 'de')
      return b.wertCent - a.wertCent
    })
}

export type Summe = {
  /** Wert des Schwunds über alle bewertbaren Zeilen, in Cent. */
  schwundWertCent: number
  /** Wert des gezählten Bestands am Ende, in Cent. */
  bestandWertCent: number
  /** Wert der Verkäufe zu Einkaufspreisen — die Bezugsgrösse für die Schwundquote. */
  wareneinsatzCent: number
  /** Zeilen, die in die Summe eingehen. */
  bewertet: number
  /** Zeilen mit Menge, aber ohne hinterlegten Preis. */
  ohnePreis: number
  /** Zeilen, für die kein Schwund gerechnet wird. */
  ohneSchwundrechnung: number
  /** Zeilen ohne Istbestand — nicht gezählt. */
  ungezaehlt: number
  /**
   * Zeilen mit Verkäufen, aber ohne hinterlegten Preis — sie fehlen im
   * Wareneinsatz. Unterscheidet "keine Verkäufe" von "Verkäufe, die niemand
   * bewerten kann": eine Quote von `null` hat zwei mögliche Gründe, und die
   * Anzeige soll den richtigen nennen.
   */
  verkauftOhnePreis: number
}

/**
 * Summiert die Zeilen.
 *
 * Was nicht bewertbar ist, wird gezählt und nicht addiert. Die Summe darf nie
 * so tun, als sei ein unbekannter Preis eine Null — in der Excel ist genau das
 * passiert, und der fehlende Wein tauchte nirgends auf.
 */
export function summe(zeilen: readonly Zeile[]): Summe {
  let schwundWert = 0
  let wareneinsatz = 0
  let bewertet = 0
  let ohnePreis = 0
  let verkauftOhnePreis = 0

  // Der Bestandswert kommt aus `bestand` und wird hier nicht ein zweites Mal
  // aufaddiert. Er trägt dort die feinere Auskunft (`null`, wo nichts bewertbar
  // ist); in einer Summe über den ganzen Betrieb wäre sie unbrauchbar — wer
  // Beträge addiert, braucht eine Zahl. Deshalb hier 0, aber nur hier.
  const bestandWert = bestand(zeilen).wertCent ?? 0

  for (const eintrag of zeilen) {
    const einsatz = wertCent(eintrag.artikel, eintrag.verkaeufe)
    if (einsatz !== null) wareneinsatz += einsatz
    else if (!eintrag.verkaeufe.isZero()) verkauftOhnePreis += 1

    if (eintrag.schwund === null) continue
    if (eintrag.schwundWertCent === null) {
      ohnePreis += 1
      continue
    }
    schwundWert += eintrag.schwundWertCent
    bewertet += 1
  }

  return {
    schwundWertCent: schwundWert,
    bestandWertCent: bestandWert,
    wareneinsatzCent: wareneinsatz,
    bewertet,
    ohnePreis,
    ohneSchwundrechnung: zeilen.filter(
      (eintrag) => eintrag.ist !== null && !eintrag.artikel.schwundfaehig,
    ).length,
    ungezaehlt: zeilen.filter((eintrag) => eintrag.ist === null).length,
    verkauftOhnePreis,
  }
}

/**
 * Schwund im Verhältnis zum Wareneinsatz, in Prozent mit einer Nachkommastelle.
 *
 * Bezugsgrösse ist der Einkaufswert der Verkäufe, nicht der Umsatz: Verkaufs-
 * preise stehen nicht im Datenmodell, und eine Quote gegen einen geschätzten
 * Umsatz wäre eine erfundene Zahl. Gegen den Wareneinsatz gerechnet ist sie
 * belastbar — und für die Frage "wie viel von dem, was durchs Lager ging, ist
 * verschwunden" ohnehin die passendere.
 *
 * `null`, solange nichts verkauft wurde: durch null zu teilen ergibt keine
 * Quote, sondern eine Ausrede.
 */
export function schwundquote(gesamt: Summe): number | null {
  if (gesamt.wareneinsatzCent <= 0) return null
  return Math.round((gesamt.schwundWertCent / gesamt.wareneinsatzCent) * 1000) / 10
}

/**
 * Die Schwundquote als deutscher Text: 3.2 -> "3,2 %". `null` bleibt `null` —
 * die Kennzahl zeigt dann den Gedankenstrich, und der Grund steht in ihrer
 * Unterzeile.
 *
 * Startseite und Auswertung zeigen dieselbe Quote; ihr Format steht deshalb
 * genau einmal hier.
 */
export function schwundquotentext(quote: number | null): string | null {
  if (quote === null) return null
  return `${quote.toString().replace('.', ',')} %`
}

/**
 * Der Schwundwert, wie ihn die Kennzahl nennt. Dieselbe Vorsicht wie überall:
 * konnte keine einzige Zeile bewertet werden, ist der Schwund nicht 0,00 EUR,
 * sondern unbekannt — und wo gar kein Schwund zu rechnen war, steht der
 * Gedankenstrich statt einer Zahl ohne Aussage.
 */
export function schwundwerttext(gesamt: Summe): string | null {
  if (gesamt.bewertet > 0) return alsEuro(gesamt.schwundWertCent)
  if (gesamt.ohnePreis > 0) return 'nicht bewertbar'
  return null
}

/**
 * Der Bestandswert, wie ihn die Kennzahl nennt — aus `bestand`, das die feinere
 * Auskunft trägt: `null` im Wert heisst dort "gezählt, aber niemand kann es
 * bewerten", und genau das sagt der Text dann auch. Nichts gezählt heisst
 * Gedankenstrich.
 */
export function bestandswerttext(lage: Pick<Bestand, 'wertCent' | 'ohnePreis'>): string | null {
  if (lage.wertCent !== null) return alsEuro(lage.wertCent)
  if (lage.ohnePreis > 0) return 'nicht bewertbar'
  return null
}

/**
 * Ob im Zeitraum überhaupt etwas mit diesem Artikel passiert ist.
 *
 * Ein Artikel ohne Anfangsbestand, ohne Lieferung, ohne Verkauf und ohne
 * Zählung sagt nichts — er stand nicht im Lager und stand nie zur Frage. Solche
 * Zeilen gehören nicht in die Tabelle, sonst verschwinden die vier
 * interessanten zwischen neunzig leeren.
 *
 * Ein Artikel mit Anfangsbestand, der am Ende nicht gezählt wurde, ist dagegen
 * ausdrücklich bewegt: da stand etwas, und jetzt weiss niemand, wo es ist.
 */
export function bewegt(eintrag: Zeile): boolean {
  return (
    !eintrag.anfang.isZero() ||
    !eintrag.lieferungen.isZero() ||
    !eintrag.verkaeufe.isZero() ||
    eintrag.ist !== null
  )
}

/** Sortierung der Tabelle: grösster Schwundwert zuerst. */
export function nachSchwund(zeilen: readonly Zeile[]): Zeile[] {
  return [...zeilen].sort((a, b) => {
    // Zeilen ohne Wert stehen hinten — sie sind keine kleine Abweichung,
    // sondern eine unbeantwortete Frage, und gehören nicht zwischen die Zahlen.
    if (a.schwundWertCent === null && b.schwundWertCent === null) {
      return a.artikel.name.localeCompare(b.artikel.name, 'de')
    }
    if (a.schwundWertCent === null) return 1
    if (b.schwundWertCent === null) return -1
    return b.schwundWertCent - a.schwundWertCent
  })
}

/** Menge in Einheiten als deutscher Text, ohne nachlaufende Nullen. */
export function alsMenge(wert: Decimal | null): string {
  if (wert === null) return '—'
  return wert.toDecimalPlaces(2).toString().replace('.', ',')
}

/** In welche Richtung eine Zeile abweicht — für die Farbe der Anzeige. */
export type Richtung = 'fehlt' | 'zuviel' | 'genau'

/**
 * Eine Zeile, wie sie die Anzeige braucht: alle Mengen als Text.
 *
 * `Decimal` ist eine Klasse und überquert die Grenze zur Client-Komponente
 * nicht. Das ist keine bloss technische Hürde, sondern die richtige Trennung:
 * gerechnet wird auf dem Server mit Decimal, angezeigt wird Text. Wer in der
 * Anzeige rechnen wollte, müsste erst wieder parsen — und genau dabei entstünde
 * die zweite Rechenstelle.
 */
export type ZeileText = {
  artikel: {
    id: string
    name: string
    kategorie: string
    lieferGebindeText: string
    schwundfaehig: boolean
    /** Nur die Auskunft, ob ein Preis hinterlegt ist — nicht der Preis selbst. */
    mitPreis: boolean
  }
  anfang: string
  lieferungen: string
  verkaeufe: string
  soll: string
  ist: string | null
  schwund: string | null
  richtung: Richtung | null
  schwundWertCent: number | null
  bestandWertCent: number | null
  belege: Bewegungen['belege']
}

export function alsText(eintrag: Zeile): ZeileText {
  return {
    artikel: {
      id: eintrag.artikel.id,
      name: eintrag.artikel.name,
      kategorie: eintrag.artikel.kategorie,
      lieferGebindeText: eintrag.artikel.lieferGebindeText,
      schwundfaehig: eintrag.artikel.schwundfaehig,
      mitPreis: eintrag.artikel.ekPreisCent !== null,
    },
    anfang: alsMenge(eintrag.anfang),
    lieferungen: alsMenge(eintrag.lieferungen),
    verkaeufe: alsMenge(eintrag.verkaeufe),
    soll: alsMenge(eintrag.soll),
    ist: eintrag.ist === null ? null : alsMenge(eintrag.ist),
    schwund: eintrag.schwund === null ? null : alsMenge(eintrag.schwund),
    richtung:
      eintrag.schwund === null
        ? null
        : eintrag.schwund.greaterThan(0)
          ? 'fehlt'
          : eintrag.schwund.isNegative()
            ? 'zuviel'
            : 'genau',
    schwundWertCent: eintrag.schwundWertCent,
    bestandWertCent: eintrag.bestandWertCent,
    belege: eintrag.belege,
  }
}
