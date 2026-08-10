/**
 * Reine Logik der Zählmaske: was eine Taste am aktuellen Eingabetext bewirkt,
 * wie die Artikel in Abschnitte zerfallen, und wie weit die Zählung ist.
 *
 * Bewusst ohne React, ohne IndexedDB, ohne Prisma — die Regeln, an denen eine
 * Zählung im Lager scheitern kann (Komma im falschen Feld, ein übersehener
 * Artikel beim Abschluss), sollen ohne laufenden Browser prüfbar sein.
 *
 * Was hier NICHT steht: die Umrechnung von Gebinden in Einheiten. Die steht in
 * src/lib/einheiten.ts und nur dort; diese Datei reicht Artikel dorthin durch,
 * statt selbst zu multiplizieren. `tests/einheiten.test.ts` wacht darüber.
 *
 * Mengen werden als deutscher Text geführt ("2", "2,5", ""), nicht als number.
 * Der Ziffernblock baut Text auf, und ein leerer Text ist etwas anderes als 0:
 * "noch nicht angefasst" gegenüber "nachgesehen, Fach ist leer".
 */

import { Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import { gesamtEinheiten, type ZaehlbarerArtikel } from '@/lib/einheiten'

/**
 * Die Felder eines Artikels, die die Zählmaske braucht.
 *
 * Erweitert `ZaehlbarerArtikel` aus einheiten.ts, statt dessen Felder
 * abzuschreiben. Damit lässt sich ein Artikel dieser Maske direkt an
 * `gesamtEinheiten` reichen, und die Gebindegrösse wird hier weder benannt noch
 * angefasst — sie gehört der einen Rechenstelle.
 */
export type ZaehlArtikel = ZaehlbarerArtikel & {
  id: string
  name: string
  kategorie: string
  sortierung: number
  lieferGebindeText: string
  gebindeart: Gebindeart
  schwundfaehig: boolean
}

/**
 * Welches der beiden Mengenfelder gemeint ist. Die Namen entsprechen den
 * Spalten von Zaehlposition, damit zwischen Maske und Datenbank nichts
 * umbenannt werden muss.
 */
export type Feldname = 'anzahlGebinde' | 'anzahlEinzeln'

export type Feld = {
  name: Feldname
  /** Beschriftung unter dem Eingabefeld, z. B. "Kästen". */
  beschriftung: string
  /** Ob in diesem Feld ein Komma erlaubt ist. */
  dezimal: boolean
}

/** Der erfasste Stand eines Artikels, so wie er in der Maske steht. */
export type Zaehleingabe = {
  anzahlGebinde: string
  anzahlEinzeln: string
}

/** Decimal(10,2) in der Datenbank — mehr als zwei Nachkommastellen gingen verloren. */
const MAX_NACHKOMMA = 2

/**
 * Vier Vorkommastellen. Der grösste denkbare Bestand im Getränkelager liegt bei
 * einigen hundert Flaschen; die Grenze fängt den verrutschten Daumen ab, der
 * aus 12 eine 1212 macht, und hält den Wert zugleich in Decimal(10,2).
 */
const MAX_VORKOMMA = 4

const GEBINDE_BESCHRIFTUNG: Record<Gebindeart, string> = {
  [Gebindeart.KASTEN]: 'Kästen',
  [Gebindeart.KARTON]: 'Kartons',
  [Gebindeart.FASS]: 'Fässer',
  [Gebindeart.EINZELFLASCHE]: 'Flaschen',
}

const GEBINDE_EINZAHL: Record<Gebindeart, string> = {
  [Gebindeart.KASTEN]: 'Kasten',
  [Gebindeart.KARTON]: 'Karton',
  [Gebindeart.FASS]: 'Fass',
  [Gebindeart.EINZELFLASCHE]: 'Flasche',
}

/**
 * Wie das Liefergebinde in der Mehrzahl heisst — "Kästen", "Fässer".
 *
 * Exportiert, weil der Wareneingang dieselbe Beschriftung braucht: dort werden
 * ebenfalls Gebinde gezählt, nur an der Rampe statt im Regal. Zwei Listen
 * derselben vier Wörter würden auseinanderlaufen, sobald eine Gebindeart
 * dazukommt.
 */
export function gebindeBeschriftung(gebindeart: Gebindeart): string {
  return GEBINDE_BESCHRIFTUNG[gebindeart]
}

/**
 * Wie das Liefergebinde in der Einzahl heisst — "Kasten", "Fass".
 *
 * Gebraucht, wo eine Aussage je Gebinde gilt und nicht über eine Menge geht:
 * "0,40 EUR je Kasten zu viel berechnet". Ohne sie stünde an solchen Stellen
 * `gebindeMenge('1', art).slice(2)` — eine Eins erfinden, um sie gleich wieder
 * abzuschneiden.
 */
export function gebindeEinzahl(gebindeart: Gebindeart): string {
  return GEBINDE_EINZAHL[gebindeart]
}

const ZAEHLMODUS_TEXT: Record<Zaehlmodus, string> = {
  [Zaehlmodus.GEBINDE_PLUS_EINZELN]: 'Gebinde plus einzeln',
  [Zaehlmodus.EINZELN]: 'Nur einzeln',
  [Zaehlmodus.FASS]: 'Fass',
}

/**
 * Wie der Zählmodus in Liste, Maske und Importvorschau heisst. Steht hier bei
 * den übrigen Beschriftungen der Zählwelt — der Artikelstamm und der
 * Artikelimport brauchen dasselbe Wort, und artikelimport.ts darf
 * artikelstamm.ts nicht importieren (artikelstamm liest bereits von dort).
 */
export function zaehlmodusText(modus: Zaehlmodus): string {
  return ZAEHLMODUS_TEXT[modus]
}

/**
 * Eine Menge mit ihrem Gebinde: "1 Kasten", "2 Kästen", "0,5 Fässer".
 *
 * Nur die glatte Eins bekommt die Einzahl. "1,0" schreibt hier niemand, und ein
 * halbes Fass ist sprachlich eine Mehrzahl — dieselbe Regel wie im Deutschen
 * überall sonst.
 */
export function gebindeMenge(anzahl: string, gebindeart: Gebindeart): string {
  const einzahl = dezimaltext(anzahl) === '1'
  const wort = einzahl ? GEBINDE_EINZAHL[gebindeart] : GEBINDE_BESCHRIFTUNG[gebindeart]
  return `${alsEingabe(dezimaltext(anzahl))} ${wort}`
}

/**
 * Die Eingabefelder eines Artikels — eines oder zwei, je nach Zählmodus.
 *
 * Das Komma folgt dem Zählmodus, nicht dem Geschmack: ein halber Kasten ist im
 * Lager keine sinnvolle Angabe (die losen Flaschen gehören ins zweite Feld),
 * ein halbes Fass und eine halb volle Flasche dagegen schon.
 */
export function felder(artikel: Pick<ZaehlArtikel, 'zaehlmodus' | 'gebindeart'>): Feld[] {
  switch (artikel.zaehlmodus) {
    case Zaehlmodus.GEBINDE_PLUS_EINZELN:
      return [
        {
          name: 'anzahlGebinde',
          beschriftung: GEBINDE_BESCHRIFTUNG[artikel.gebindeart],
          dezimal: false,
        },
        { name: 'anzahlEinzeln', beschriftung: 'lose Flaschen', dezimal: true },
      ]

    case Zaehlmodus.EINZELN:
      return [{ name: 'anzahlEinzeln', beschriftung: 'Flaschen', dezimal: true }]

    case Zaehlmodus.FASS:
      return [{ name: 'anzahlGebinde', beschriftung: 'Fässer', dezimal: true }]

    default: {
      const unbekannt: never = artikel.zaehlmodus
      throw new Error(`Unbekannter Zählmodus: ${String(unbekannt)}`)
    }
  }
}

export type Taste =
  | { art: 'ziffer'; ziffer: string }
  | { art: 'komma' }
  | { art: 'loeschen' }

/**
 * Wendet einen Tastendruck auf den Eingabetext an und gibt den neuen Text
 * zurück. Eine unzulässige Taste lässt den Text unverändert, statt zu werfen —
 * am Ziffernblock ist ein gesperrtes Komma kein Fehlerfall, sondern ein
 * Knopf, der nichts tut.
 */
export function tasteAnwenden(aktuell: string, taste: Taste, dezimal: boolean): string {
  switch (taste.art) {
    case 'loeschen':
      return aktuell.slice(0, -1)

    case 'komma': {
      if (!dezimal || aktuell.includes(',')) return aktuell
      // Führendes Komma zu "0," ergänzen: "0,5" ist lesbar, ",5" ist eine
      // Zahl, bei der man zweimal hinsehen muss.
      return aktuell === '' ? '0,' : `${aktuell},`
    }

    case 'ziffer': {
      const [vor, nach] = aktuell.split(',')
      if (nach === undefined) {
        if (vor.length >= MAX_VORKOMMA) return aktuell
        // Eine führende Null verschwindet, sobald eine echte Ziffer kommt:
        // aus "0" wird "7" und nicht "07".
        return vor === '0' ? taste.ziffer : vor + taste.ziffer
      }
      if (nach.length >= MAX_NACHKOMMA) return aktuell
      return `${vor},${nach}${taste.ziffer}`
    }

    default: {
      const unbekannt: never = taste
      throw new Error(`Unbekannte Taste: ${JSON.stringify(unbekannt)}`)
    }
  }
}

/**
 * Zählt den Eingabetext um `delta` hoch oder runter, für die Plus- und
 * Minus-Schaltflächen. Unter null wird nicht gezählt: ein negativer Bestand ist
 * im Lager keine Aussage, und die Umrechnung in einheiten.ts weist ihn ohnehin
 * ab.
 *
 * Ein angefangener Wert ("2,") wird dabei zu seiner Zahl vervollständigt.
 */
export function schritt(aktuell: string, delta: number): string {
  const zahl = alsZahl(aktuell)
  const neu = Math.max(0, zahl + delta)
  return formatiere(neu)
}

/** Eingabetext als Zahl. Leer und angefangene Werte gelten als 0. */
function alsZahl(text: string): number {
  const zahl = Number(dezimaltext(text))
  return Number.isFinite(zahl) ? zahl : 0
}

/** Zahl als deutscher Text ohne nachlaufende Nullen: 2 -> "2", 2.5 -> "2,5". */
function formatiere(zahl: number): string {
  return zahl.toFixed(MAX_NACHKOMMA).replace(/\.?0+$/, '').replace('.', ',')
}

/**
 * Eingabetext als Dezimalzahl mit Punkt, wie ihn Prisma und JSON erwarten.
 * Leer und angefangene Eingaben ("2,") werden zu einer vollständigen Zahl —
 * wer "2," stehen lässt und weiterblättert, hat zwei gemeint.
 */
export function dezimaltext(text: string): string {
  if (text === '' || text === '0,') return '0'
  const mitPunkt = text.replace(',', '.')
  return mitPunkt.endsWith('.') ? mitPunkt.slice(0, -1) : mitPunkt
}

/**
 * Der umgekehrte Weg: ein gespeicherter Dezimaltext ("2.5") als Eingabetext
 * ("2,5"), damit ein bereits gezählter Artikel beim Zurückblättern so dasteht,
 * wie er eingetippt wurde.
 */
export function alsEingabe(dezimal: string): string {
  return dezimal.replace('.', ',')
}

/**
 * Die Eingabe eines Artikels in die beiden Spalten von Zaehlposition.
 *
 * Das im Zählmodus nicht vorgesehene Feld wird hart auf "0" gesetzt, statt den
 * dort vielleicht stehenden Text mitzuschicken: `gesamtEinheiten` weist eine
 * Zählung ab, die nicht zum Modus passt, und diese Zurückweisung soll nicht
 * erst beim Abschluss der Zählung auffallen.
 */
export function alsPosition(
  artikel: Pick<ZaehlArtikel, 'zaehlmodus' | 'gebindeart'>,
  eingabe: Zaehleingabe,
): { anzahlGebinde: string; anzahlEinzeln: string } {
  const erlaubt = new Set(felder(artikel).map((feld) => feld.name))
  return {
    anzahlGebinde: erlaubt.has('anzahlGebinde') ? dezimaltext(eingabe.anzahlGebinde) : '0',
    anzahlEinzeln: erlaubt.has('anzahlEinzeln') ? dezimaltext(eingabe.anzahlEinzeln) : '0',
  }
}

/**
 * Die Kontrollzeile unter den Eingabefeldern: was die Eingabe zusammengerechnet
 * bedeutet — "= 51 Flaschen", "= 1 Flasche", beim Fass "= 1,5 Fässer".
 *
 * `null` am unberührten Artikel: dort wäre "= 0" eine Aussage über einen
 * Bestand, den niemand gezählt hat. Gerechnet wird über `gesamtEinheiten`, das
 * Einheitenwort kommt aus der Gebindetabelle oben — beim FASS ist die Einheit
 * das Fass selbst, "3 Flaschen" für drei Fässer wäre eine falsche Auskunft.
 */
export function kontrolltext(artikel: ZaehlArtikel, eingabe: Zaehleingabe): string | null {
  if (eingabe.anzahlGebinde === '' && eingabe.anzahlEinzeln === '') return null

  const position = alsPosition(artikel, eingabe)
  const einheiten = gesamtEinheiten(artikel, position.anzahlGebinde, position.anzahlEinzeln)
  const fass = artikel.zaehlmodus === Zaehlmodus.FASS
  const wort = fass
    ? einheiten.equals(1)
      ? gebindeEinzahl(artikel.gebindeart)
      : gebindeBeschriftung(artikel.gebindeart)
    : einheiten.equals(1)
      ? 'Flasche'
      : 'Flaschen'

  return `= ${alsEingabe(einheiten.toString())} ${wort}`
}

/** Ein Abschnitt der Liste: ein zusammenhängender Block gleicher Kategorie. */
export type Abschnitt = {
  kategorie: string
  artikel: ZaehlArtikel[]
  /** Index des ersten Artikels dieses Abschnitts in der Gesamtliste. */
  ab: number
}

/** Artikel in Zählreihenfolge: aufsteigend nach `sortierung`. */
export function inZaehlreihenfolge(artikel: readonly ZaehlArtikel[]): ZaehlArtikel[] {
  return [...artikel].sort((a, b) => a.sortierung - b.sortierung)
}

/**
 * Zerlegt die Zählreihenfolge in Abschnitte.
 *
 * Ein Abschnitt ist ein Block *aufeinanderfolgender* Artikel derselben
 * Kategorie, nicht die Kategorie als Ganzes. Im Stadthafener Stamm zerfallen
 * 14 Kategorien so in 26 Blöcke — Softdrinks kommen viermal vor, Aperitif
 * viermal. Das ist kein Fehler in den Daten: `sortierung` bildet den Laufweg
 * durchs Lager ab, und an den Softdrinks kommt man auf diesem Weg mehrfach
 * vorbei. Würde man die Kategorien zusammenfassen, liefe der Zähler quer durch
 * den Raum und zurück.
 */
export function abschnitte(artikel: readonly ZaehlArtikel[]): Abschnitt[] {
  const sortiert = inZaehlreihenfolge(artikel)
  const blocks: Abschnitt[] = []

  sortiert.forEach((eintrag, index) => {
    const letzter = blocks.at(-1)
    if (letzter !== undefined && letzter.kategorie === eintrag.kategorie) {
      letzter.artikel.push(eintrag)
      return
    }
    blocks.push({ kategorie: eintrag.kategorie, artikel: [eintrag], ab: index })
  })

  return blocks
}

export type Fortschritt = {
  gezaehlt: number
  gesamt: number
}

/**
 * Wie weit die Zählung ist. `erfasst` enthält die Artikel-Ids, zu denen ein
 * Wert vorliegt — die blosse Existenz zählt, nicht ihre Höhe. Ein Artikel mit
 * 0 Kästen ist gezählt: jemand hat nachgesehen und das Fach war leer.
 */
export function fortschritt(
  artikel: readonly ZaehlArtikel[],
  erfasst: ReadonlySet<string>,
): Fortschritt {
  return {
    gezaehlt: artikel.filter((eintrag) => erfasst.has(eintrag.id)).length,
    gesamt: artikel.length,
  }
}

/**
 * Der Anteil der erfassten Artikel, 0 bis 1 — die Breite des Balkens unter dem
 * Kopf der Zählmaske.
 *
 * Steht hier und nicht in der Maske, weil auch eine Balkenbreite eine gerechnete
 * Zahl ist. Eine Zählung ohne Artikel gibt 0 statt NaN: der Balken bleibt dann
 * leer, statt aus dem Bild zu laufen.
 */
export function fortschrittsanteil(stand: Fortschritt): number {
  if (stand.gesamt === 0) return 0
  return stand.gezaehlt / stand.gesamt
}

/** Die noch nicht erfassten Artikel, in Zählreihenfolge. */
export function ungezaehlte(
  artikel: readonly ZaehlArtikel[],
  erfasst: ReadonlySet<string>,
): ZaehlArtikel[] {
  return inZaehlreihenfolge(artikel).filter((eintrag) => !erfasst.has(eintrag.id))
}

/**
 * Index des nächsten Artikels, den die "Weiter"-Schaltfläche ansteuert.
 *
 * Zunächst schlicht der folgende Artikel — der Zähler läuft den Laufweg ab und
 * will nicht, dass die Maske ihn überholt. Erst am Ende der Liste springt sie
 * zum ersten übersprungenen Artikel zurück, statt in eine Sackgasse zu laufen.
 * Ist alles erfasst, bleibt sie stehen und gibt `null` — dann übernimmt der
 * Abschluss.
 */
export function naechsterIndex(
  artikel: readonly ZaehlArtikel[],
  erfasst: ReadonlySet<string>,
  aktuell: number,
): number | null {
  const sortiert = inZaehlreihenfolge(artikel)
  if (aktuell + 1 < sortiert.length) return aktuell + 1

  const offen = sortiert.findIndex((eintrag) => !erfasst.has(eintrag.id))
  return offen === -1 ? null : offen
}
