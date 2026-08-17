/**
 * Der Bestellvorschlag: was fehlt, damit das Lager die nächsten Wochen trägt.
 *
 * Je Artikel gilt:
 *
 *   Verbrauch je Tag = Verkäufe im Referenzfenster / belegte Tage
 *   Bedarf           = Verbrauch je Tag × Reichweite × Saisonfaktor
 *   Verfügbar        = Bestand heute + unterwegs
 *   Fehlmenge        = Bedarf − Verfügbar
 *   Bestellmenge     = aufrunden( Fehlmenge in Gebinden )
 *
 * Der Sollbestand ist damit gerechnet und nicht hinterlegt. Neunundneunzig von
 * Hand gepflegte Zielmengen wären genau die Krankheit der Excel, die diese App
 * ablöst: sie stehen einmal richtig da und veralten dann still. Was der Betrieb
 * verbraucht, weiss die Kasse ohnehin besser als eine Zahl von vorletztem Jahr.
 *
 * Drei Dinge rechnet diese Datei nicht selbst:
 *  - Bestand heute ist `sollbestand` aus src/lib/auswertung.ts — Zählung plus
 *    Zugänge minus Abgänge ist dieselbe Rechnung wie dort, nur mit "heute" als
 *    Ende statt der nächsten Zählung.
 *  - Gebinde in Einheiten und zurück laufen über src/lib/einheiten.ts.
 *  - Bewertet wird mit `wertGebindeCent`, weil bestellt wird, was der Lieferant
 *    bringt: ganze Gebinde.
 *
 * Zwei Fälle bleiben ausdrücklich offen statt auf 0 gerundet zu werden, weil
 * eine 0 hier eine Behauptung wäre:
 *  1. Ein Artikel ohne Kassenzuordnung hat keinen belegten Verbrauch. Sein
 *     Bedarf ist unbekannt, nicht null — er gehört von Hand auf die Bestellung.
 *  2. Ein Artikel, der bei der letzten Zählung fehlte, hat keinen Bestand. Der
 *     Vorschlag deckt dann den ganzen Bedarf, und die Zeile sagt das.
 *
 * Reine Funktionen: keine DB-Zugriffe, kein Zustand. Muster wie
 * src/lib/auswertung.ts.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { BestellStatus, type Gebindeart } from '@/generated/prisma/enums'
import { alsMenge, sollbestand } from '@/lib/auswertung'
import { alsEuro } from '@/lib/wareneingang'
import {
  einheitenAusGebinden,
  gebindeFuerEinheiten,
  wertGebindeCent,
  type BepreisterArtikel,
} from '@/lib/einheiten'
import { gebindeMenge } from '@/lib/zaehlung'

/**
 * Die Felder eines Artikels, die der Bestellvorschlag braucht.
 *
 * Erweitert `BepreisterArtikel`, statt dessen Felder abzuschreiben — so lässt
 * sich eine Zeile direkt an `wertGebindeCent` und `gebindeFuerEinheiten`
 * reichen, und die Gebindegrösse wird hier nirgends benannt.
 */
export type BestellArtikel = BepreisterArtikel & {
  id: string
  name: string
  kategorie: string
  lieferGebindeText: string
  gebindeart: Gebindeart
}

/**
 * Die drei Zahlen, die den Bedarf aufspannen. Sie gelten für die ganze
 * Bestellung und nicht je Artikel: eine Reichweite von vier Wochen ist eine
 * Entscheidung über die Bestellung, keine Eigenschaft der Cola.
 */
export type Bedarfsrahmen = {
  /**
   * Tage, über die der Verbrauch belegt ist — der Divisor. Nicht die Länge des
   * angefragten Fensters: wer 28 Tage anfragt und nur 14 importiert hat, teilt
   * durch 14. Sonst wäre der Tagesverbrauch halb so hoch und die Bestellung zu
   * klein.
   */
  verbrauchTage: number
  /** Tage, für die die Bestellung reichen soll. */
  reichweiteTage: number
  /**
   * Zuschlag für die Hochsaison, als Dezimaltext mit Punkt. "1" heisst kein
   * Zuschlag. Am Kanal ist der August ein anderer Betrieb als der November, und
   * ein Vorschlag aus dem Novemberverbrauch trägt kein Sommerwochenende.
   */
  saisonfaktor: string
}

/** Was über einen Artikel bekannt ist, bevor gerechnet wird — alles in Einheiten. */
export type Lage = {
  /** Verkäufe im Referenzfenster. */
  verbrauch: Decimal
  /**
   * Ob überhaupt eine Kassenbezeichnung auf diesen Artikel zeigt. Ohne
   * Zuordnung ist `verbrauch` 0, sagt aber nichts.
   */
  zugeordnet: boolean
  /** Bestand aus der letzten abgeschlossenen Zählung. `null`: nicht gezählt. */
  gezaehlt: Decimal | null
  /** Geprüfte Lieferungen seit der Zählung. */
  zugaenge: Decimal
  /** Verkäufe seit der Zählung. */
  abgaenge: Decimal
  /** Bestellt, aber noch nicht geliefert — sonst bestellt man zweimal. */
  unterwegs: Decimal
}

/** Fortgeschriebener Bestand in Einheiten. `null`, wenn nicht gezählt wurde. */
export function bestand(lage: Lage): Decimal | null {
  if (lage.gezaehlt === null) return null
  return sollbestand({
    anfang: lage.gezaehlt,
    lieferungen: lage.zugaenge,
    verkaeufe: lage.abgaenge,
  })
}

/** Verbrauch je Tag in Einheiten. */
export function verbrauchJeTag(lage: Lage, rahmen: Bedarfsrahmen): Decimal {
  if (!Number.isFinite(rahmen.verbrauchTage) || rahmen.verbrauchTage < 1) {
    throw new Error(
      `verbrauchTage muss mindestens 1 sein, ist aber ${String(rahmen.verbrauchTage)} — ohne belegte Tage gibt es keinen Tagesverbrauch, nur eine Division durch null`,
    )
  }
  return lage.verbrauch.div(rahmen.verbrauchTage)
}

/** Bedarf für die Reichweite in Einheiten, mit Saisonzuschlag. */
export function bedarf(lage: Lage, rahmen: Bedarfsrahmen): Decimal {
  return verbrauchJeTag(lage, rahmen)
    .times(rahmen.reichweiteTage)
    .times(new Decimal(rahmen.saisonfaktor))
}

/**
 * Was zum Bedarf fehlt, in Einheiten. Nie negativ: ein voller Keller ist keine
 * negative Bestellung, sondern eine Zeile, die nicht auf den Lieferschein
 * gehört.
 *
 * Ein nicht gezählter Artikel wird wie ein leeres Regal behandelt — der
 * Vorschlag deckt den ganzen Bedarf. Das ist eine Annahme, und `Zeile.ohneBestand`
 * trägt sie sichtbar mit; stillschweigend wäre sie eine Falle.
 */
export function fehlmenge(lage: Lage, rahmen: Bedarfsrahmen): Decimal {
  const verfuegbar = (bestand(lage) ?? new Decimal(0)).plus(lage.unterwegs)
  return Decimal.max(0, bedarf(lage, rahmen).minus(verfuegbar))
}

export type Zeile = {
  artikel: BestellArtikel
  /** Fortgeschriebener Bestand in Einheiten. `null`: nicht gezählt. */
  bestand: Decimal | null
  unterwegs: Decimal
  verbrauchJeTag: Decimal
  bedarf: Decimal
  fehlmenge: Decimal
  /** Gerechneter Vorschlag in ganzen Liefergebinden. */
  vorschlagGebinde: number
  /** Was bestellt wird — der Vorschlag oder ein Handeingriff. */
  mengeGebinde: number
  handeingriff: boolean
  /**
   * Einheiten, die die bestellte Menge über den Bedarf hinaus bringt. Bei der
   * Aufrundung auf ganze Gebinde entsteht sie zwangsläufig; sie gehört in die
   * Zeile, damit die Aufrundung nicht überrascht. Negativ, wenn ein
   * Handeingriff unter den Bedarf geht.
   */
  ueberdeckung: Decimal
  /** Wert der Position in Cent. `null` ohne hinterlegten Preis. */
  wertCent: number | null
  /** Kein Kassenbezug: der Bedarf ist unbekannt, nicht null. */
  ohneVerbrauch: boolean
  /** Bei der letzten Zählung nicht gezählt: der Bestand ist unbekannt. */
  ohneBestand: boolean
}

/**
 * Rechnet eine Zeile des Vorschlags.
 *
 * `menge` überschreibt den Vorschlag. `null` heisst "nimm den Vorschlag" — und
 * ist etwas anderes als 0, das eine bewusst gestrichene Zeile ist. Ob ein
 * Handeingriff vorliegt, wird deshalb nicht gespeichert, sondern verglichen:
 * eine Menge, die vom gerechneten Vorschlag abweicht, ist einer.
 */
export function zeile(
  artikel: BestellArtikel,
  lage: Lage,
  rahmen: Bedarfsrahmen,
  menge: number | null = null,
): Zeile {
  const luecke = fehlmenge(lage, rahmen)
  const vorschlagGebinde = gebindeFuerEinheiten(artikel, luecke)
  const mengeGebinde = menge ?? vorschlagGebinde

  return {
    artikel,
    bestand: bestand(lage),
    unterwegs: lage.unterwegs,
    verbrauchJeTag: verbrauchJeTag(lage, rahmen),
    bedarf: bedarf(lage, rahmen),
    fehlmenge: luecke,
    vorschlagGebinde,
    mengeGebinde,
    handeingriff: mengeGebinde !== vorschlagGebinde,
    ueberdeckung: einheitenAusGebinden(artikel, mengeGebinde).minus(luecke),
    wertCent: wertGebindeCent(artikel, mengeGebinde),
    ohneVerbrauch: !lage.zugeordnet,
    ohneBestand: lage.gezaehlt === null,
  }
}

/** Zeilen, die tatsächlich bestellt werden. */
export function zuBestellen(zeilen: readonly Zeile[]): Zeile[] {
  return zeilen.filter((eintrag) => eintrag.mengeGebinde > 0)
}

export type Summe = {
  /** Zeilen mit Menge über 0. */
  positionen: number
  gebinde: number
  /** Wert der bewertbaren Positionen in Cent. */
  wertCent: number
  /** Positionen mit Menge, aber ohne hinterlegten Preis — nicht in der Summe. */
  ohnePreis: number
  handeingriffe: number
  /** Artikel ohne Kassenbezug — für sie gibt es keinen Vorschlag. */
  ohneVerbrauch: number
  /** Artikel, die bei der letzten Zählung fehlten. */
  ohneBestand: number
}

/**
 * Summiert den Vorschlag.
 *
 * Was keinen Preis trägt, wird gezählt und nicht addiert — dieselbe Regel wie in
 * der Auswertung. Eine Bestellsumme, die einen unbekannten Preis als 0 mitnimmt,
 * ist beim Wareneingang die Zahl, gegen die niemand mehr prüfen kann.
 *
 * `ohneVerbrauch` und `ohneBestand` zählen über alle Zeilen, nicht nur über die
 * bestellten: sie sind Lücken in der Datenlage und verschwinden nicht dadurch,
 * dass ihre Zeile leer bleibt. Im Gegenteil — dass sie leer bleibt, ist der
 * Punkt.
 */
export function summe(zeilen: readonly Zeile[]): Summe {
  let wert = 0
  let ohnePreis = 0
  let gebinde = 0

  const bestellt = zuBestellen(zeilen)
  for (const eintrag of bestellt) {
    gebinde += eintrag.mengeGebinde
    if (eintrag.wertCent === null) ohnePreis += 1
    else wert += eintrag.wertCent
  }

  return {
    positionen: bestellt.length,
    gebinde,
    wertCent: wert,
    ohnePreis,
    handeingriffe: zeilen.filter((eintrag) => eintrag.handeingriff).length,
    ohneVerbrauch: zeilen.filter((eintrag) => eintrag.ohneVerbrauch).length,
    ohneBestand: zeilen.filter((eintrag) => eintrag.ohneBestand).length,
  }
}

/** Wie dringend eine Zeile ist — für die Farbe der Anzeige. */
export type Dringlichkeit = 'leer' | 'knapp' | 'gedeckt'

/**
 * Ob der Bestand ohne diese Bestellung reicht.
 *
 * `leer` heisst: der Bestand deckt den Bedarf nicht mehr für ein Viertel der
 * Reichweite — hier wird es eng, bevor die nächste Lieferung kommt. Die Schwelle
 * ist eine Anzeigefrage und keine Rechengrösse; die Bestellmenge hängt nicht
 * daran.
 */
export function dringlichkeit(eintrag: Zeile, rahmen: Bedarfsrahmen): Dringlichkeit {
  if (eintrag.fehlmenge.isZero()) return 'gedeckt'
  if (eintrag.verbrauchJeTag.isZero()) return 'knapp'

  const verfuegbar = (eintrag.bestand ?? new Decimal(0)).plus(eintrag.unterwegs)
  const reichtTage = verfuegbar.div(eintrag.verbrauchJeTag)
  return reichtTage.lessThan(rahmen.reichweiteTage / 4) ? 'leer' : 'knapp'
}

/**
 * Eine Zeile, wie sie die Anzeige braucht: alle Mengen als Text.
 *
 * `Decimal` ist eine Klasse und überquert die Grenze zur Client-Komponente
 * nicht — dieselbe Trennung wie in der Auswertung. Gerechnet wird auf dem
 * Server, angezeigt wird Text. Nur die Gebindemengen bleiben Zahlen: sie werden
 * in der Maske hoch- und heruntergezählt, und dafür sind sie ganze Zahlen.
 *
 * Der Artikel geht als ganzes Objekt mit, damit die Maske den Positionswert
 * einer geänderten Menge über `wertGebindeCent` rechnen kann statt über einen
 * mitgeschickten Gebindepreis. Ein Preis mal einer Menge in der Anzeige wäre die
 * zweite Stelle, an der Geld gerechnet wird — genau das, was diese App
 * vermeidet. Dieselbe Übergabe wie beim Artikelstamm in der Prüfmaske.
 */
export type ZeileText = {
  artikel: BestellArtikel
  artikelId: string
  name: string
  kategorie: string
  lieferGebindeText: string
  /** "4 Kästen", "1 Fass" — die Menge in der Sprache des Gebindes. */
  mengeText: string
  bestand: string | null
  /** `null`, wenn nichts unterwegs ist. */
  unterwegs: string | null
  /**
   * Die drei gerechneten Mengen. `null` bei einem Artikel ohne Kassenbezug: dort
   * ist der Bedarf unbekannt, und eine 0 in dieser Spalte hiesse "wir brauchen
   * nichts". Genau diese Verwechslung soll die Anzeige nicht anbieten.
   */
  verbrauchJeTag: string | null
  bedarf: string | null
  fehlmenge: string | null
  vorschlagGebinde: number
  mengeGebinde: number
  handeingriff: boolean
  /** `null` bei glatter Deckung. */
  ueberdeckung: string | null
  wertCent: number | null
  /** Nur die Auskunft, ob ein Preis hinterlegt ist — nicht der Preis selbst. */
  mitPreis: boolean
  ohneVerbrauch: boolean
  ohneBestand: boolean
  dringlichkeit: Dringlichkeit
}

/**
 * `mitUmsatzdaten: false` heisst: im Referenzfenster liegt gar kein
 * Kassenimport. Verbrauch, Bedarf und Fehlmenge rechnen sich dann zwar zu 0,
 * aber die 0 wäre die Behauptung "wir brauchen nichts" — die drei Spalten
 * zeigen deshalb den Strich, aus demselben Grund wie bei `ohneVerbrauch`.
 */
export function alsText(
  eintrag: Zeile,
  rahmen: Bedarfsrahmen,
  mitUmsatzdaten: boolean = true,
): ZeileText {
  const ohneGrundlage = eintrag.ohneVerbrauch || !mitUmsatzdaten
  return {
    artikel: eintrag.artikel,
    artikelId: eintrag.artikel.id,
    name: eintrag.artikel.name,
    kategorie: eintrag.artikel.kategorie,
    lieferGebindeText: eintrag.artikel.lieferGebindeText,
    mengeText: gebindeMenge(String(eintrag.mengeGebinde), eintrag.artikel.gebindeart),
    bestand: eintrag.bestand === null ? null : alsMenge(eintrag.bestand),
    unterwegs: eintrag.unterwegs.isZero() ? null : alsMenge(eintrag.unterwegs),
    verbrauchJeTag: ohneGrundlage ? null : alsMenge(eintrag.verbrauchJeTag),
    bedarf: ohneGrundlage ? null : alsMenge(eintrag.bedarf),
    fehlmenge: ohneGrundlage ? null : alsMenge(eintrag.fehlmenge),
    vorschlagGebinde: eintrag.vorschlagGebinde,
    mengeGebinde: eintrag.mengeGebinde,
    handeingriff: eintrag.handeingriff,
    ueberdeckung: eintrag.ueberdeckung.isZero() ? null : alsMenge(eintrag.ueberdeckung),
    wertCent: eintrag.wertCent,
    mitPreis: eintrag.artikel.ekPreisCent !== null,
    ohneVerbrauch: eintrag.ohneVerbrauch,
    ohneBestand: eintrag.ohneBestand,
    dringlichkeit: dringlichkeit(eintrag, rahmen),
  }
}

// ---------------------------------------------------------------------------
// Positionen einer gespeicherten Bestellung
// ---------------------------------------------------------------------------

/**
 * Eine Zeile der gespeicherten Bestellung, wie die Positionsmaske sie braucht.
 *
 * Eigener Typ neben `ZeileText`, weil hier eine andere Frage ansteht: dort geht
 * es um den Bedarf, hier um das, was bestellt ist. Der Vorschlag kommt trotzdem
 * mit, aber als Vergleichswert und nicht als Vorgabe — und er darf fehlen, denn
 * eine Bestellung lässt sich lange nach der Zählung noch ändern.
 */
export type Bestellzeile = {
  artikel: BestellArtikel
  artikelId: string
  name: string
  kategorie: string
  lieferGebindeText: string
  /** Gespeicherte Bestellmenge in Gebinden. 0 heisst: steht nicht in der Bestellung. */
  mengeGebinde: number
  /** Bereits geliefert, in Gebinden. `null`, wenn auf diese Zeile nichts kam. */
  geliefert: string | null
  /**
   * Zeile mit Lieferung. Sie lässt sich nicht mehr streichen — die
   * Lieferposition zeigt darauf, und die Datenbank weist das Löschen mit
   * onDelete: Restrict ohnehin ab. Ihre Menge bleibt änderbar: was bestellt war,
   * kann sich geändert haben, auch nachdem der erste Teil ankam.
   */
  gesperrt: boolean
  /**
   * Was der Vorschlag heute rechnen würde. `null` ohne Rechengrundlage — ohne
   * abgeschlossene Zählung gibt es keinen Vergleichswert, und 0 wäre einer.
   */
  vorschlagGebinde: number | null
  /**
   * Fortgeschriebener Bestand von heute — Zählung plus geprüfte Lieferungen
   * minus Verkäufe — als Text in **Liefergebinden**, ungerundet ("2,63" Kästen):
   * dieselbe Sprache wie Bestellmenge und Vorschlag daneben. Die Vorschlagsseite
   * zeigt denselben Bestand in Einheiten, weil dort die ganze Tabelle in
   * Einheiten rechnet. `null` ohne Rechengrundlage oder wenn der Artikel bei der
   * letzten Zählung fehlte: der Strich sagt "unbekannt", eine 0 behauptete ein
   * leeres Regal.
   */
  bestand: string | null
}

/**
 * Summe über die Mengen, wie eine Maske sie gerade zeigt.
 *
 * Steht hier und nicht in den beiden Masken, weil beide dieselbe Summe brauchen
 * — die eine über den Vorschlag, die andere über die gespeicherte Bestellung.
 * Zwei Schleifen mit je eigener Behandlung des fehlenden Preises wären zwei
 * Gelegenheiten, ihn als 0 mitzuzählen.
 */
export function mengensumme<T extends { artikel: BepreisterArtikel }>(
  zeilen: readonly T[],
  menge: (zeile: T) => number,
): { positionen: number; gebinde: number; wertCent: number; ohnePreis: number } {
  let positionen = 0
  let gebinde = 0
  let wertCent = 0
  let ohnePreis = 0

  for (const zeile of zeilen) {
    const anzahl = menge(zeile)
    if (anzahl <= 0) continue

    positionen += 1
    gebinde += anzahl

    const cent = wertGebindeCent(zeile.artikel, anzahl)
    if (cent === null) ohnePreis += 1
    else wertCent += cent
  }

  return { positionen, gebinde, wertCent, ohnePreis }
}

/**
 * Die Bestellsumme, wie eine Anzeige sie nennt. Dieselbe Vorsicht wie
 * `warenwerttext` am Wareneingang: eine Null aus lauter unbewertbaren
 * Positionen ist kein Wert von 0,00 EUR, sondern ein unbekannter — Liste,
 * Vorschlag und Bestellblatt sagen das, statt eine Zahl zu behaupten, die
 * niemand geprüft hat.
 */
export function bestellwerttext(gesamt: { wertCent: number; ohnePreis: number }): string {
  if (gesamt.wertCent === 0 && gesamt.ohnePreis > 0) return 'nicht bewertbar'
  return alsEuro(gesamt.wertCent)
}

/**
 * Ob sich die Positionen einer Bestellung in diesem Stand noch ändern lassen.
 *
 * Auch nach dem Abschicken — und das ist eine bewusste Entscheidung gegen die
 * Reinheit des Belegs: wer beim Lieferanten anruft und zwei Kästen dazunimmt,
 * muss das hier nachtragen können. Sonst zeigt der Wareneingang bei jeder
 * Lieferung eine Bestellabweichung, die es nicht gibt, und eine Spalte, die
 * dauernd falschen Alarm gibt, liest nach drei Wochen niemand mehr.
 *
 * Abgeschlossen und storniert sind zu: dort erwartet niemand mehr Ware, und eine
 * Änderung wäre nur noch eine Verfälschung der Vergangenheit.
 */
export function positionenAenderbar(status: BestellStatus): boolean {
  return status === BestellStatus.ENTWURF || status === BestellStatus.VERSENDET
}

/**
 * Der Rahmen aus den Feldern des Kopfformulars. Unbrauchbare Eingaben fallen auf
 * den Vorgabewert zurück statt die Seite zu sprengen: eine leere Reichweite ist
 * ein halb getippter Gedanke und kein Fehler.
 */
export const VORGABE = { referenzTage: 28, reichweiteTage: 28, saisonfaktor: '1' } as const

export function ausEingabe(werte: {
  referenzTage?: string | null
  reichweiteTage?: string | null
  saisonfaktor?: string | null
}): { referenzTage: number; reichweiteTage: number; saisonfaktor: string } {
  return {
    referenzTage: ganzeTage(werte.referenzTage, VORGABE.referenzTage),
    reichweiteTage: ganzeTage(werte.reichweiteTage, VORGABE.reichweiteTage),
    saisonfaktor: faktor(werte.saisonfaktor),
  }
}

function ganzeTage(text: string | null | undefined, vorgabe: number): number {
  const zahl = Number(text ?? '')
  if (!Number.isInteger(zahl) || zahl < 1 || zahl > 365) return vorgabe
  return zahl
}

function faktor(text: string | null | undefined): string {
  if (text === null || text === undefined || text.trim() === '') return VORGABE.saisonfaktor
  let wert: Decimal
  try {
    wert = new Decimal(text.trim().replace(',', '.'))
  } catch {
    return VORGABE.saisonfaktor
  }
  // Obergrenze 5: ein Faktor darüber ist ein Tippfehler, und die Bestellung
  // wäre ein Lastwagen.
  if (!wert.isFinite() || wert.lessThanOrEqualTo(0) || wert.greaterThan(5)) {
    return VORGABE.saisonfaktor
  }
  return wert.toString()
}

/** Faktor als deutscher Text: "1.6" -> "1,6". */
export function alsFaktor(saisonfaktor: string): string {
  return saisonfaktor.replace('.', ',')
}

// ---------------------------------------------------------------------------
// Stand einer Bestellung
// ---------------------------------------------------------------------------

/**
 * Wohin eine Bestellung von ihrem Stand aus wechseln darf.
 *
 * Der Weg ist einbahnig, und das ist Absicht: ein Entwurf, der beim Lieferanten
 * liegt, lässt sich nicht wieder einsammeln. Wer die Menge ändern will, storniert
 * und rechnet neu — dann steht in der Datenbank, was wirklich passiert ist, und
 * nicht eine Bestellung, die zweimal etwas anderes war.
 *
 * `ABGESCHLOSSEN` heisst nicht "vollständig geliefert", sondern "wir erwarten
 * keine Restmenge mehr". Ob geliefert wurde, sagen die Lieferpositionen.
 */
export function naechsteStati(status: BestellStatus): BestellStatus[] {
  switch (status) {
    case BestellStatus.ENTWURF:
      return [BestellStatus.VERSENDET, BestellStatus.STORNIERT]

    case BestellStatus.VERSENDET:
      return [BestellStatus.ABGESCHLOSSEN, BestellStatus.STORNIERT]

    case BestellStatus.ABGESCHLOSSEN:
    case BestellStatus.STORNIERT:
      return []

    default: {
      const unbekannt: never = status
      throw new Error(`Unbekannter Bestellstand: ${String(unbekannt)}`)
    }
  }
}

export function wechselErlaubt(von: BestellStatus, nach: BestellStatus): boolean {
  return naechsteStati(von).includes(nach)
}

/** Aufschrift des Stands in der Oberfläche. */
export function statusText(status: BestellStatus): string {
  switch (status) {
    case BestellStatus.ENTWURF:
      return 'Entwurf'
    case BestellStatus.VERSENDET:
      return 'abgeschickt'
    case BestellStatus.ABGESCHLOSSEN:
      return 'abgeschlossen'
    case BestellStatus.STORNIERT:
      return 'storniert'
    default: {
      const unbekannt: never = status
      throw new Error(`Unbekannter Bestellstand: ${String(unbekannt)}`)
    }
  }
}

/**
 * Wie weit eine Bestellung geliefert ist.
 *
 * Gerechnet und nicht gespeichert — deshalb kennt `BestellStatus` kein
 * TEILWEISE_GELIEFERT. Verglichen werden Gebinde mit Gebinden, ohne Umrechnung:
 * bestellt wurden Kästen, geliefert wurden Kästen.
 *
 * `vollstaendig` heisst "auf jede Zeile ist mindestens die bestellte Menge
 * gekommen". Eine Überlieferung macht daraus keinen Sonderfall: mehr als bestellt
 * ist gekommen, offen ist trotzdem nichts.
 */
export type Lieferstand = 'nichts' | 'teilweise' | 'vollstaendig'

/**
 * Gelieferte Gebinde einer Bestellposition.
 *
 * Nur geprüfte Lieferungen zählen: was niemand gegen den Lieferschein gehalten
 * hat, ist ein Papier und kein Zugang. Die Regel steht hier und nicht in den
 * Ansichten — Liste und Detailseite einer Bestellung zählten sie sonst je auf
 * eigene Art, und ein "auch ungeprüfte zählen mit" käme nur zur Hälfte an.
 *
 * `null`, wenn keine geprüfte Lieferung auf die Position zeigt: auf sie kam
 * nichts, und das ist etwas anderes als eine geprüfte Lieferung über 0 Gebinde.
 */
export function gelieferteGebinde(
  lieferpositionen: readonly {
    anzahlGebindeTatsaechlich: Decimal
    lieferung: { geprueftAm: Date | null }
  }[],
): Decimal | null {
  const geprueft = lieferpositionen.filter((position) => position.lieferung.geprueftAm !== null)
  if (geprueft.length === 0) return null

  return geprueft.reduce(
    (summe, position) => summe.plus(position.anzahlGebindeTatsaechlich),
    new Decimal(0),
  )
}

export function lieferstand(
  positionen: readonly { bestellt: Decimal; geliefert: Decimal }[],
): Lieferstand {
  if (positionen.length === 0) return 'nichts'

  const offene = positionen.filter((position) => position.geliefert.lessThan(position.bestellt))
  if (offene.length === 0) return 'vollstaendig'
  if (offene.length === positionen.length && positionen.every((p) => p.geliefert.isZero())) {
    return 'nichts'
  }
  return 'teilweise'
}

/** Aufschrift der Taste, die in diesen Stand wechselt. */
export function wechselText(nach: BestellStatus): string {
  switch (nach) {
    case BestellStatus.VERSENDET:
      return 'Bestellung abschicken'
    case BestellStatus.ABGESCHLOSSEN:
      return 'Bestellung abschliessen'
    case BestellStatus.STORNIERT:
      return 'Stornieren'
    case BestellStatus.ENTWURF:
      return 'Zurück in den Entwurf'
    default: {
      const unbekannt: never = nach
      throw new Error(`Unbekannter Bestellstand: ${String(unbekannt)}`)
    }
  }
}
