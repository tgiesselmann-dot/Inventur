/**
 * Holt die vier Quellen der Auswertung zusammen und rechnet sie in Einheiten um.
 *
 * Getrennt von src/lib/auswertung.ts, weil dort die Rechnung steht und hier der
 * Datenbankzugriff: die Rechnung soll ohne Datenbank prüfbar bleiben.
 *
 * Der Zeitraum wird von zwei abgeschlossenen Zählungen aufgespannt. Alles
 * dazwischen zählt: Lieferungen nach dem Datum der ersten bis einschliesslich
 * der zweiten, Kassenumsätze im selben Fenster.
 *
 * `verkaeufeJeArtikel` steht hier zwar für die Auswertung, wird aber auch vom
 * Bestellvorschlag benutzt — dieselbe Frage über ein anderes Fenster. Eine
 * zweite Schleife über die Umsatzpositionen soll es nicht geben.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import {
  bestand,
  einheitenJeArtikel,
  jeKategorie,
  schwundquote,
  summe,
  zeile,
  type AuswertungsArtikel,
  type Beleg,
  type Bestand,
  type Bewegungen,
  type Kategoriebestand,
  type Zeile,
} from '@/lib/auswertung'
import { schwundstufe } from '@/lib/auswertung-anzeige'
import { einheitenAusGebinden, einheitenAusVerkauf, gesamtEinheiten } from '@/lib/einheiten'
import { alsDatumstext, dauertext } from '@/lib/datum'
import { prisma } from '@/lib/prisma'

export type Zeitraum = {
  vonZaehlungId: string
  bisZaehlungId: string
  von: Date
  bis: Date
  tage: number
}

export type Datenlage = {
  zeitraum: Zeitraum
  artikel: AuswertungsArtikel[]
  bewegungen: Map<string, Bewegungen>
  /** Kassenbezeichnungen ohne Artikelzuordnung — ihre Verkäufe fehlen in der Rechnung. */
  ohneZuordnung: { bezeichnung: string; menge: string }[]
  /** Ob im Zeitraum überhaupt Kassendaten vorliegen. */
  mitUmsatzdaten: boolean
}

/** Die beiden jüngsten abgeschlossenen Zählungen — der übliche Zeitraum. */
export async function letzterZeitraum(betriebId: string): Promise<Zeitraum | null> {
  const zaehlungen = await prisma.zaehlung.findMany({
    where: { betriebId, status: ZaehlungStatus.ABGESCHLOSSEN },
    orderBy: { datum: 'desc' },
    take: 2,
  })
  if (zaehlungen.length < 2) return null

  const [bis, von] = zaehlungen
  return {
    vonZaehlungId: von.id,
    bisZaehlungId: bis.id,
    von: von.datum,
    bis: bis.datum,
    tage: Math.round((bis.datum.getTime() - von.datum.getTime()) / 86_400_000),
  }
}

/**
 * Der Zeitraum, der auf einer bestimmten Zählung endet.
 *
 * Für den Weg aus dem Verlauf in eine einzelne Woche. Gesucht wird die Zählung
 * davor und nicht die zweitjüngste im Betrieb: dieser Weg wird auch Wochen
 * später aufgerufen, und dann muss der Zeitraum der sein, der zu dieser Zählung
 * gehört. `null`, wenn es die Zählung nicht gibt, sie einem anderen Betrieb
 * gehört oder keine Vorgängerzählung existiert.
 */
export async function zeitraumZu(
  betriebId: string,
  bisZaehlungId: string,
): Promise<Zeitraum | null> {
  const bis = await prisma.zaehlung.findFirst({
    where: { id: bisZaehlungId, betriebId, status: ZaehlungStatus.ABGESCHLOSSEN },
  })
  if (bis === null) return null

  const von = await prisma.zaehlung.findFirst({
    where: { betriebId, status: ZaehlungStatus.ABGESCHLOSSEN, datum: { lt: bis.datum } },
    orderBy: { datum: 'desc' },
  })
  if (von === null) return null

  return {
    vonZaehlungId: von.id,
    bisZaehlungId: bis.id,
    von: von.datum,
    bis: bis.datum,
    tage: Math.round((bis.datum.getTime() - von.datum.getTime()) / 86_400_000),
  }
}

/**
 * Was die Kasse in einem Zeitraum aus dem Lager genommen hat, je Artikel.
 *
 * Eigene Funktion, weil zwei Seiten dieselbe Frage stellen: die Auswertung für
 * den Zeitraum zwischen zwei Zählungen, der Bestellvorschlag für die letzten
 * Wochen. Zwei Schleifen über die Umsatzpositionen wären zwei Gelegenheiten,
 * einen Bestandteil zu vergessen — und ein vergessener Bestandteil ist genau
 * der Fehler, wegen dem es diese App gibt.
 */
export type Verkaufslage = {
  /** Verkaufte Einheiten je Artikel-Id, mit ihren Belegen. */
  jeArtikel: Map<string, { menge: Decimal; belege: Beleg[] }>
  /** Kassenbezeichnungen ohne Artikelzuordnung — ihre Verkäufe fehlen. */
  ohneZuordnung: { bezeichnung: string; menge: string }[]
  /** Ob im Zeitraum überhaupt Kassendaten vorliegen. */
  mitUmsatzdaten: boolean
  /**
   * Tage, die die gefundenen Importe tatsächlich abdecken — nicht die Länge des
   * abgefragten Fensters. Wer 28 Tage anfragt und nur 14 importiert hat, darf
   * den Verbrauch nicht durch 28 teilen: der Tagesverbrauch wäre halb so hoch,
   * und die Bestellung entsprechend zu klein. 0, wenn keine Importe vorliegen.
   */
  abgedeckteTage: number
}

export async function verkaeufeJeArtikel(
  betriebId: string,
  von: Date,
  bis: Date,
): Promise<Verkaufslage> {
  const [umsatzpositionen, kassenartikel] = await Promise.all([
    prisma.umsatzposition.findMany({
      where: {
        betriebId,
        umsatzimport: {
          zeitraumVon: { gte: von },
          // Ein Import endet am letzten Tag um Mitternacht; ohne diese Grenze
          // fiele der Schlussabend aus dem Fenster.
          zeitraumBis: { lte: naechsterTag(bis) },
        },
      },
      include: { umsatzimport: true },
    }),
    prisma.kassenartikel.findMany({ where: { betriebId }, include: { bestandteile: true } }),
  ])

  return verkaufslageAus(umsatzpositionen, kassenartikel)
}

/** Eine Umsatzposition mit ihrem Import, wie die Rechnung sie braucht. */
export type Umsatzzeile = {
  posBezeichnung: string
  abrechnungsart: string
  menge: Decimal
  umsatzimport: { dateiname: string; zeitraumVon: Date; zeitraumBis: Date }
}

/** Eine Kassenbezeichnung mit ihren Bestandteilen. */
export type Kassenzeile = {
  posBezeichnung: string
  bestaetigt: boolean
  bestandteile: { artikelId: string; einheitenProVerkauf: Decimal }[]
}

/**
 * Rechnet Umsatzpositionen in Lagerbewegungen um — ohne Datenbank.
 *
 * Eigene Funktion, weil zwei Zugriffswege dieselbe Umrechnung brauchen: die
 * Auswertung holt die Positionen eines Zeitraums, der Verlauf holt die vieler
 * Zeiträume auf einmal und teilt sie hier auf. Die Regel, welcher Verkauf
 * welchen Artikel wie stark mindert, darf es nur einmal geben.
 */
export function verkaufslageAus(
  umsatzpositionen: readonly Umsatzzeile[],
  kassenartikel: readonly Kassenzeile[],
): Verkaufslage {
  const zuordnung = new Map(kassenartikel.map((eintrag) => [eintrag.posBezeichnung, eintrag]))
  const jeArtikel = new Map<string, { menge: Decimal; belege: Beleg[] }>()
  const fehlend = new Map<string, Decimal>()

  for (const position of umsatzpositionen) {
    const kasse = zuordnung.get(position.posBezeichnung)

    if (kasse === undefined || (kasse.bestandteile.length === 0 && !kasse.bestaetigt)) {
      // Nicht zugeordnet: diese Verkäufe fehlen in der Rechnung, und der Schwund
      // fällt dadurch zu niedrig aus. Die Seite muss das oben sagen.
      //
      // Eine bestätigte Bezeichnung ohne Bestandteil ist dagegen erledigt: jemand
      // hat entschieden, dass sie das Getränkelager nicht berührt. Sie hier
      // mitzuzählen hiesse, tausend Speisen dauerhaft als offene Aufgabe zu
      // führen — und die vier echten Lücken darin verschwinden zu lassen.
      fehlend.set(
        position.posBezeichnung,
        (fehlend.get(position.posBezeichnung) ?? new Decimal(0)).plus(position.menge),
      )
      continue
    }

    // Ein Verkauf kann mehrere Artikel anfassen: der Aperol Spritz nimmt Aperol
    // und Prosecco. Jeder Bestandteil bucht seine eigene Menge ab.
    for (const bestandteil of kasse.bestandteile) {
      const menge = einheitenAusVerkauf(bestandteil, position.menge)
      const eintrag = jeArtikel.get(bestandteil.artikelId) ?? { menge: new Decimal(0), belege: [] }
      eintrag.menge = eintrag.menge.plus(menge)
      eintrag.belege.push(
        beleg(
          position.umsatzimport.dateiname,
          // Die Abrechnungsart gehört in den Beleg: eine Menge aus "Bruch Im
          // Haus" ist kein Verkauf, auch wenn sie den Bestand genauso mindert.
          `${position.posBezeichnung} · ${position.abrechnungsart}`,
          menge,
        ),
      )
      jeArtikel.set(bestandteil.artikelId, eintrag)
    }
  }

  return {
    jeArtikel,
    ohneZuordnung: [...fehlend.entries()]
      .map(([bezeichnung, menge]) => ({ bezeichnung, menge: menge.toString() }))
      .sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, 'de')),
    mitUmsatzdaten: umsatzpositionen.length > 0,
    abgedeckteTage: abgedeckteTage(umsatzpositionen.map((position) => position.umsatzimport)),
  }
}

/**
 * Spanne der tatsächlich gefundenen Importe in ganzen Tagen. Überschneiden sich
 * zwei Importe, wird die Spanne nicht doppelt gezählt — dafür wird eine Lücke
 * zwischen zwei Importen mitgezählt, denn an diesen Tagen war der Betrieb offen
 * und hat verkauft. Zu wenig Verbrauch wäre die schlechtere Annahme.
 */
function abgedeckteTage(importe: readonly { zeitraumVon: Date; zeitraumBis: Date }[]): number {
  if (importe.length === 0) return 0
  const von = Math.min(...importe.map((eintrag) => eintrag.zeitraumVon.getTime()))
  const bis = Math.max(...importe.map((eintrag) => eintrag.zeitraumBis.getTime()))
  return Math.max(1, Math.round((bis - von) / 86_400_000))
}

function leer(): Bewegungen {
  return {
    anfang: new Decimal(0),
    lieferungen: new Decimal(0),
    verkaeufe: new Decimal(0),
    ist: null,
    belege: { anfang: [], lieferungen: [], verkaeufe: [], ist: [] },
  }
}

/**
 * Trägt alle Bewegungen des Zeitraums je Artikel zusammen.
 *
 * Die Artikel kommen vollständig, nicht nur die bewegten: ein Artikel, der
 * weder geliefert noch verkauft noch gezählt wurde, ist eine Aussage für sich —
 * und wenn er im Anfangsbestand stand, fehlt er jetzt.
 */
export async function datenlage(betriebId: string, zeitraum: Zeitraum): Promise<Datenlage> {
  // Ohne `select`, damit der Feldname der Gebindegrösse in dieser Datei nicht
  // vorkommt — die Umrechnung gehört nach src/lib/einheiten.ts, und der Wächter
  // in tests/einheiten.test.ts prüft das über den blossen Namen.
  const [stamm, anfangszaehlung, endzaehlung, lieferpositionen, verkaeufe] = await Promise.all([
    prisma.artikel.findMany({
      where: { betriebId },
      omit: { einheitsgroesseLiter: true },
      orderBy: [{ kategorie: 'asc' }, { sortierung: 'asc' }],
    }),
    prisma.zaehlposition.findMany({
      where: { zaehlungId: zeitraum.vonZaehlungId },
      include: {
        artikel: { omit: { einheitsgroesseLiter: true } },
        // Der Ortsname wandert in die Belegzeile der Auswertung.
        lagerort: { select: { name: true } },
      },
    }),
    prisma.zaehlposition.findMany({
      where: { zaehlungId: zeitraum.bisZaehlungId },
      include: {
        artikel: { omit: { einheitsgroesseLiter: true } },
        // Der Ortsname wandert in die Belegzeile der Auswertung.
        lagerort: { select: { name: true } },
      },
    }),
    prisma.lieferposition.findMany({
      where: {
        betriebId,
        // Nur geprüfte Lieferungen zählen: was niemand gegen den Lieferschein
        // gehalten hat, ist kein belegter Zugang.
        lieferung: {
          geprueftAm: { not: null },
          datum: { gt: zeitraum.von, lte: zeitraum.bis },
        },
      },
      include: {
        lieferung: true,
        artikel: { omit: { einheitsgroesseLiter: true } },
      },
    }),
    verkaeufeJeArtikel(betriebId, zeitraum.von, zeitraum.bis),
  ])

  return datenlageAus(zeitraum, {
    stamm,
    anfangszaehlung,
    endzaehlung,
    lieferpositionen,
    verkaeufe,
  })
}

/**
 * Eine gezählte Zeile, wie die Zusammenstellung sie braucht.
 *
 * Der Artikeltyp kommt von der Umrechnungsfunktion selbst und wird hier nicht
 * nachgebaut: was `gesamtEinheiten` an Feldern braucht, entscheidet
 * src/lib/einheiten.ts — und ändert es sich dort, meldet sich der Compiler
 * hier, statt dass eine zweite Aufzählung still veraltet.
 */
export type Zaehlzeile = {
  artikelId: string
  anzahlGebinde: Decimal
  anzahlEinzeln: Decimal
  artikel: Parameters<typeof gesamtEinheiten>[0]
  /**
   * Wo gezählt wurde. Fehlt bei Aufrufern, die den Ort nicht mitladen — dann
   * steht im Beleg nur „gezählt".
   */
  lagerort?: { name: string } | null
}

/** Eine gelieferte Zeile mit ihrem Beleg. */
export type Lieferzeile = {
  artikelId: string
  anzahlGebindeTatsaechlich: Decimal
  artikel: Parameters<typeof einheitenAusGebinden>[0]
  lieferung: { belegNr: string; lieferant: string }
}

/** Die vier Quellen eines Zeitraums, fertig geladen. */
export type Rohdaten = {
  stamm: AuswertungsArtikel[]
  anfangszaehlung: readonly Zaehlzeile[]
  endzaehlung: readonly Zaehlzeile[]
  lieferpositionen: readonly Lieferzeile[]
  verkaeufe: Verkaufslage
}

/**
 * Trägt die Bewegungen eines Zeitraums zusammen — ohne Datenbank.
 *
 * Getrennt vom Laden, weil der Verlauf über zwölf Zeiträume dieselbe
 * Zusammenstellung braucht, aber nicht zwölfmal dieselben Artikel holen soll.
 * Er lädt einmal breit und ruft diese Funktion je Zeitraum mit dem passenden
 * Ausschnitt. Zwei Zusammenstellungen wären zwei Gelegenheiten, eine Lieferung
 * zu vergessen.
 */
export function datenlageAus(zeitraum: Zeitraum, roh: Rohdaten): Datenlage {
  const { stamm, anfangszaehlung, endzaehlung, lieferpositionen, verkaeufe } = roh

  const artikel: AuswertungsArtikel[] = stamm
  const bewegungen = new Map<string, Bewegungen>(stamm.map((eintrag) => [eintrag.id, leer()]))

  // Je Position ein Beleg, und die Belege nennen den Ort: ein Artikel steht an
  // mehreren Orten, und im Schwund-Detail ist „12 an der Theke, 30 im
  // Kühlcontainer" die Auskunft, mit der sich eine auffällige Zahl nachprüfen
  // lässt. Die Summe selbst bleibt eine je Artikel — der Ort ist eine Herkunft,
  // kein eigener Bestand.
  for (const position of anfangszaehlung) {
    const eintrag = bewegungen.get(position.artikelId)
    if (eintrag === undefined) continue
    const menge = gesamtEinheiten(position.artikel, position.anzahlGebinde, position.anzahlEinzeln)
    eintrag.anfang = eintrag.anfang.plus(menge)
    eintrag.belege.anfang.push(
      beleg(`Zählung ${alsDatumstext(zeitraum.von)}`, gezaehltText(position), menge),
    )
  }

  for (const position of endzaehlung) {
    const eintrag = bewegungen.get(position.artikelId)
    if (eintrag === undefined) continue
    const menge = gesamtEinheiten(position.artikel, position.anzahlGebinde, position.anzahlEinzeln)
    eintrag.ist = (eintrag.ist ?? new Decimal(0)).plus(menge)
    eintrag.belege.ist.push(
      beleg(`Zählung ${alsDatumstext(zeitraum.bis)}`, gezaehltText(position), menge),
    )
  }

  for (const position of lieferpositionen) {
    const eintrag = bewegungen.get(position.artikelId)
    if (eintrag === undefined) continue
    // Die tatsächlich angenommene Menge, nie die vom Lieferschein.
    const menge = einheitenAusGebinden(position.artikel, position.anzahlGebindeTatsaechlich)
    eintrag.lieferungen = eintrag.lieferungen.plus(menge)
    eintrag.belege.lieferungen.push(
      beleg(position.lieferung.belegNr, position.lieferung.lieferant, menge),
    )
  }

  for (const [artikelId, verkauf] of verkaeufe.jeArtikel) {
    const eintrag = bewegungen.get(artikelId)
    if (eintrag === undefined) continue
    eintrag.verkaeufe = eintrag.verkaeufe.plus(verkauf.menge)
    eintrag.belege.verkaeufe.push(...verkauf.belege)
  }

  return {
    zeitraum,
    artikel,
    bewegungen,
    ohneZuordnung: verkaeufe.ohneZuordnung,
    mitUmsatzdaten: verkaeufe.mitUmsatzdaten,
  }
}

/**
 * Wie es bei der letzten abgeschlossenen Zählung stand — die drei Zahlen der
 * Startseite.
 *
 * `null`, solange keine Zählung abgeschlossen wurde.
 */
export type Letztestand = {
  zaehlungId: string
  datum: Date
  /**
   * Wert des gezählten Bestands in Cent. `null`, wenn keine gezählte Zeile
   * bewertbar ist — dann ist der Wert nicht 0, sondern unbekannt, und die
   * Startseite sagt das statt 0,00 EUR.
   */
  bestandWertCent: number | null
  /** Gezählte Artikel ohne hinterlegten Preis — sie fehlen im Bestandswert. */
  ohnePreis: number
  /** Verkaufte Artikel ohne Preis — sie fehlen im Wareneinsatz der Quote. */
  verkauftOhnePreis: number
  /**
   * Schwund in Prozent des Wareneinsatzes. `null`, wo die Zahl keine Aussage
   * wäre: ohne Vorgängerzählung gibt es keinen Zeitraum, und ohne Verkäufe
   * keine Bezugsgrösse.
   */
  schwundProzent: number | null
  /** Ob es eine Vorgängerzählung gibt — sonst ist der Schwund nicht zu rechnen. */
  mitVorgaenger: boolean
}

/**
 * Die Kennzahlen der letzten abgeschlossenen Zählung.
 *
 * Zwei Fälle, und der zweite ist der Grund für diese Funktion: nach der
 * allerersten Zählung gibt es noch keinen Zeitraum und damit keinen Schwund —
 * der Bestandswert steht aber sehr wohl da. Ihn dann zu verschweigen (oder
 * schlimmer: als 0 zu zeigen) wäre falsch.
 *
 * Gerechnet wird in beiden Fällen mit `zeile` und `summe` aus
 * src/lib/auswertung.ts. Eine eigene Summe über bewertete Bestände hier wäre
 * die zweite Rechenstelle, wegen der es diese App gibt.
 */
export async function letzteKennzahlen(betriebId: string): Promise<Letztestand | null> {
  const zeitraum = await letzterZeitraum(betriebId)

  if (zeitraum !== null) {
    const lage = await datenlage(betriebId, zeitraum)
    const zeilen = lage.artikel.map((artikel) => zeile(artikel, lage.bewegungen.get(artikel.id)!))
    const gesamt = summe(zeilen)
    const bestandslage = bestand(zeilen)

    return {
      zaehlungId: zeitraum.bisZaehlungId,
      datum: zeitraum.bis,
      bestandWertCent: bestandslage.wertCent,
      ohnePreis: bestandslage.ohnePreis,
      verkauftOhnePreis: gesamt.verkauftOhnePreis,
      schwundProzent: schwundquote(gesamt),
      mitVorgaenger: true,
    }
  }

  const zaehlung = await prisma.zaehlung.findFirst({
    where: { betriebId, status: ZaehlungStatus.ABGESCHLOSSEN },
    orderBy: { datum: 'desc' },
  })
  if (zaehlung === null) return null

  const zeilen = await zeilenAusZaehlung(zaehlung.id)
  const bestandslage = bestand(zeilen)

  return {
    zaehlungId: zaehlung.id,
    datum: zaehlung.datum,
    bestandWertCent: bestandslage.wertCent,
    ohnePreis: bestandslage.ohnePreis,
    verkauftOhnePreis: 0,
    schwundProzent: null,
    mitVorgaenger: false,
  }
}

/**
 * Die Zeilen einer einzelnen Zählung, ohne Zeitraum drumherum.
 *
 * Nur der Istbestand ist bekannt: kein Anfang, keine Lieferungen, keine
 * Verkäufe. `zeile` rechnet daraus zwangsläufig einen negativen Schwund ("mehr
 * da als möglich") — der ist in diesem Fall keine Aussage und wird von den
 * Aufrufern nicht gelesen. Der Bestandswert einer Zeile hängt allein am Ist und
 * ist davon unberührt.
 */
async function zeilenAusZaehlung(zaehlungId: string): Promise<Zeile[]> {
  const positionen = await prisma.zaehlposition.findMany({
    where: { zaehlungId },
    include: { artikel: { omit: { einheitsgroesseLiter: true } } },
  })

  // Eine Zeile je Artikel, nicht je Position: derselbe Artikel steht an der
  // Theke und im Kühlcontainer und hat dann zwei Zählzeilen. Ohne dieses
  // Zusammenfassen erschiene er im Ergebnis mehrfach, jedes Mal mit einem
  // Teilbestand — und die Summe darüber wäre in jeder Anzeige eine andere.
  // Gerechnet wird in src/lib/auswertung.ts, hier wird nur zugeordnet.
  const summen = einheitenJeArtikel(positionen)
  const stamm = new Map(positionen.map((position) => [position.artikelId, position.artikel]))

  return [...summen].map(([artikelId, ist]) => zeile(stamm.get(artikelId)!, { ...leer(), ist }))
}

/**
 * Das Ergebnis einer abgeschlossenen Zählung — der Bildschirm danach.
 *
 * Zwei Fälle, wie bei `letzteKennzahlen`: mit Vorgängerzählung lässt sich der
 * Schwund rechnen, ohne sie nicht. Ohne sie bleibt `auffaelligerSchwund` `null`
 * und der Bildschirm sagt, warum — eine 0 hiesse "nachgesehen, nichts fehlt",
 * und nachgesehen hat niemand.
 */
export type Zaehlungsergebnis = {
  zaehlungId: string
  datum: Date
  abgeschlossen: boolean
  /** Gezählte Artikel und aktive Artikel im Stamm — "99 von 99". */
  gezaehlt: number
  aktiv: number
  /** Von der ersten bis zur letzten Erfassung. `null`, solange nichts erfasst ist. */
  dauer: string | null
  bestand: Bestand
  kategorien: Kategoriebestand[]
  /** Die gezählten Artikel ohne hinterlegten Preis — sie fehlen im Bestandswert. */
  ohnePreis: { id: string; name: string; kategorie: string }[]
  /** Artikel mit auffälligem Schwund. `null` ohne Vorgängerzählung. */
  auffaelligerSchwund: number | null
}

export async function zaehlungsergebnis(
  betriebId: string,
  zaehlungId: string,
): Promise<Zaehlungsergebnis | null> {
  // Über beide Schlüssel gesucht: die Zählung eines fremden Betriebs ist damit
  // schlicht nicht gefunden, und die Seite zeigt ihr gewohntes „gibt es nicht".
  // Eine verworfene ebenso — ihr Ergebnis wäre das eines Fehlstarts.
  const zaehlung = await prisma.zaehlung.findFirst({
    where: {
      id: zaehlungId,
      betriebId,
      status: { in: [ZaehlungStatus.OFFEN, ZaehlungStatus.ABGESCHLOSSEN] },
    },
  })
  if (zaehlung === null) return null

  const [vorgaenger, aktiv, gezaehlt, spanne] = await Promise.all([
    // Die Zählung davor, nicht die zweitjüngste im Betrieb: dieser Bildschirm
    // wird auch Wochen später aus der Liste geöffnet, und dann muss der
    // Zeitraum der sein, der zu dieser Zählung gehört.
    prisma.zaehlung.findFirst({
      where: {
        betriebId: zaehlung.betriebId,
        status: ZaehlungStatus.ABGESCHLOSSEN,
        datum: { lt: zaehlung.datum },
      },
      orderBy: { datum: 'desc' },
    }),
    prisma.artikel.count({ where: { betriebId: zaehlung.betriebId, aktiv: true } }),
    // Gezählte *Artikel*, nicht gezählte Zeilen: ein Artikel, der an drei Orten
    // steht, ist ein gezählter Artikel und nicht drei. Ohne `distinct` stünde
    // hier „137 von 99".
    prisma.zaehlposition
      .findMany({ where: { zaehlungId }, select: { artikelId: true }, distinct: ['artikelId'] })
      .then((zeilen) => zeilen.length),
    prisma.zaehlposition.aggregate({
      where: { zaehlungId },
      _min: { gezaehltAm: true },
      _max: { gezaehltAm: true },
    }),
  ])

  let zeilen: Zeile[]
  let auffaelligerSchwund: number | null = null

  if (vorgaenger === null) {
    zeilen = await zeilenAusZaehlung(zaehlung.id)
  } else {
    const lage = await datenlage(zaehlung.betriebId, {
      vonZaehlungId: vorgaenger.id,
      bisZaehlungId: zaehlung.id,
      von: vorgaenger.datum,
      bis: zaehlung.datum,
      tage: Math.round((zaehlung.datum.getTime() - vorgaenger.datum.getTime()) / 86_400_000),
    })
    zeilen = lage.artikel.map((artikel) => zeile(artikel, lage.bewegungen.get(artikel.id)!))
    auffaelligerSchwund = zeilen.filter((eintrag) => schwundstufe(eintrag) === 'auffaellig').length
  }

  const von = spanne._min.gezaehltAm
  const bis = spanne._max.gezaehltAm

  return {
    zaehlungId: zaehlung.id,
    datum: zaehlung.datum,
    abgeschlossen: zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN,
    gezaehlt,
    aktiv,
    dauer: von === null || bis === null ? null : dauertext(von, bis),
    bestand: bestand(zeilen),
    kategorien: jeKategorie(zeilen),
    ohnePreis: zeilen
      .filter((eintrag) => eintrag.ist !== null && eintrag.bestandWertCent === null)
      .map((eintrag) => ({
        id: eintrag.artikel.id,
        name: eintrag.artikel.name,
        kategorie: eintrag.artikel.kategorie,
      }))
      .sort(
        (a, b) =>
          a.kategorie.localeCompare(b.kategorie, 'de') || a.name.localeCompare(b.name, 'de'),
      ),
    auffaelligerSchwund,
  }
}

/**
 * Die Herkunft einer Zählzeile im Beleg: „gezählt · Kühlcontainer".
 *
 * Ohne Ort bleibt es beim blossen „gezählt" — so wie vor den Lagerorten und so
 * wie bei Aufrufern, die den Ort nicht mitladen.
 */
function gezaehltText(position: Zaehlzeile): string {
  return position.lagerort == null ? 'gezählt' : `gezählt · ${position.lagerort.name}`
}

function beleg(ref: string, text: string, menge: Decimal): Beleg {
  return { ref, text, menge: menge.toDecimalPlaces(2).toString().replace('.', ',') }
}

/** Der Tag nach einem Datum — die Umsatzimporte laufen bis Mitternacht. */
function naechsterTag(datum: Date): Date {
  return new Date(datum.getTime() + 86_400_000)
}
