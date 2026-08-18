/**
 * Reine Logik der Wareneingangskontrolle: was drei Mengen über eine Lieferung
 * aussagen und wann ihre Aufschlüsselung stimmig ist.
 *
 * Ohne React, ohne Prisma, ohne fetch — die Regeln, an denen eine Kontrolle an
 * der Rampe scheitern kann, sollen ohne laufenden Browser prüfbar sein. Muster
 * wie src/lib/zaehlung.ts.
 *
 * Drei Mengen stehen je Position nebeneinander:
 *
 *   bestellt      was beim Lieferanten bestellt wurde (fehlt ohne Bestellung)
 *   Lieferschein  was auf dem Papier des Fahrers steht
 *   tatsächlich   was brauchbar auf der Palette stand
 *
 * Daraus entstehen zwei verschiedene Aussagen, die diese Datei bewusst
 * auseinanderhält, weil sie verschiedene Folgen haben:
 *
 *   bestellt − Lieferschein  Der Lieferant hat anders geliefert als bestellt.
 *                            Eine Sache fürs Büro und für die nächste Bestellung.
 *   Lieferschein − tatsächlich  Wir bekommen weniger, als uns berechnet wird.
 *                            Muss sofort auf den Lieferschein und vom Fahrer
 *                            gegengezeichnet werden, sonst ist der Anspruch weg.
 *
 * Gerechnet wird nicht hier: Gebinde werden über `einheitenAusGebinden` in
 * Einheiten und über `wertGebindeCent` in Cent überführt, beide aus
 * src/lib/einheiten.ts. Eine eigene Multiplikation mit der Gebindegrösse gehört
 * an keine andere Stelle des Projekts — `tests/einheiten.test.ts` wacht darüber.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { Abweichungsart, Gebindeart } from '@/generated/prisma/enums'
import { alsDatumstext } from '@/lib/datum'
import { einheitenAusGebinden, wertGebindeCent, type BepreisterArtikel } from '@/lib/einheiten'
import { alsEingabe, dezimaltext, gebindeMenge } from '@/lib/zaehlung'

/**
 * Die Felder eines Artikels, die der Wareneingang braucht.
 *
 * Erweitert `BepreisterArtikel` aus einheiten.ts, statt dessen Felder
 * abzuschreiben — damit lässt sich eine Position direkt an `wertGebindeCent`
 * reichen, und die Gebindegrösse wird hier weder benannt noch angefasst.
 */
export type WareneingangArtikel = BepreisterArtikel & {
  id: string
  name: string
  kategorie: string
  lieferGebindeText: string
  gebindeart: Gebindeart
}

/**
 * Ein Teil der Mengendifferenz mit seinem Grund.
 *
 * `anzahlGebinde` ist immer positiv: die Richtung steckt in der Art, nicht im
 * Vorzeichen. Eine als negative Menge eingetragene Fehlmenge wäre in jeder
 * Summe eine Falle, und die Datenbank weist sie über einen CHECK ohnehin ab.
 */
export type Abweichungseingabe = {
  art: Abweichungsart
  /** Dezimaltext mit Punkt, wie ihn die API erwartet. */
  anzahlGebinde: string
}

/** Eine Zeile der Prüfliste. */
export type PruefPosition = {
  id: string
  artikel: WareneingangArtikel
  /** Bestellte Menge, oder null ohne Bestellbezug. */
  bestellt: string | null
  /**
   * Die Bestellzeile, auf die diese Position antwortet. Muss bei jedem Speichern
   * mitgehen: ohne sie verliert die Lieferung ihren Bezug zur Bestellung, und
   * die Spalte "bestellt" wäre beim nächsten Laden leer.
   */
  bestellpositionId: string | null
  /**
   * Der Artikel, der bestellt war — nur gesetzt, wenn ein anderer geliefert
   * wurde. Beim Ersatzartikel trägt `artikel` das Gelieferte und dieses Feld
   * das Bestellte; beide bleiben sichtbar, sonst wäre die Bestellung nicht mehr
   * nachvollziehbar.
   */
  bestellterArtikel: { id: string; name: string; lieferGebindeText: string } | null
  lieferschein: string
  /**
   * Brauchbar übernommene Menge. Startet auf dem Wert des Lieferscheins — wer
   * nichts anfasst, bestätigt damit das Papier. Genau darauf beruht die Zusage,
   * dass eine fehlerfreie Lieferung zwei Berührungen kostet.
   */
  tatsaechlich: string
  /** Preis je Liefergebinde laut Lieferschein, in Cent. null heisst: nicht erfasst. */
  ekPreisCentLieferschein: number | null
  /** Zugesagtes Nachlieferdatum als ISO-Text, oder null ohne Zusage. */
  nachlieferungZugesagtBis: string | null
  abweichungen: Abweichungseingabe[]
}

/**
 * Nur die Mengen einer Zeile, ohne Artikel und ohne Bestellbezug.
 *
 * Alles, was Differenz und Aufschlüsselung angeht, kommt damit aus — auch auf
 * dem Server, der dieselbe Stimmigkeit prüft wie die Maske, aber keinen
 * Stammsatz dafür laden soll.
 */
export type Mengenstand = Pick<PruefPosition, 'lieferschein' | 'tatsaechlich' | 'abweichungen'>

/** Arten, die Ware kosten — sie mindern, was wir bekommen haben. */
const MINDERND: ReadonlySet<Abweichungsart> = new Set([
  Abweichungsart.FEHLMENGE,
  Abweichungsart.BRUCH,
])

/**
 * Arten, die überhaupt etwas über die Menge sagen.
 *
 * Die Trennung ist der Grund, warum PREISABWEICHUNG und FALSCHER_ARTIKEL die
 * Stimmigkeitsprüfung nicht sprengen: sie beschreiben einen Sachverhalt, keine
 * fehlende Ware. Ein Ersatzartikel ist vollzählig geliefert, er ist nur der
 * falsche; ein zu teuer berechneter Kasten steht auf der Palette. Beide gehen
 * deshalb nicht in `aufgeschluesselt` ein — täten sie es, müsste die Maske
 * Mengen erfinden, damit die Rechnung wieder aufgeht.
 */
const MENGENWIRKSAM: ReadonlySet<Abweichungsart> = new Set([
  Abweichungsart.FEHLMENGE,
  Abweichungsart.BRUCH,
  Abweichungsart.UEBERLIEFERUNG,
])

function zahl(text: string): Decimal {
  return new Decimal(dezimaltext(text))
}

/**
 * Was auf der Palette fehlt: Lieferschein minus tatsächlich.
 *
 * Positiv heisst, es fehlt etwas. Negativ heisst Überlieferung — auch die will
 * gesehen werden, denn ungeprüft wandert sie als Geschenk ins Lager und macht
 * beim nächsten Schwund niemanden klüger.
 */
export function differenz(position: Mengenstand): Decimal {
  return zahl(position.lieferschein).minus(zahl(position.tatsaechlich))
}

/**
 * Was der Lieferant gegenüber der Bestellung nicht geliefert hat. `null` ohne
 * Bestellbezug — dann prüft die Maske zweiwegig, und diese Aussage gibt es
 * schlicht nicht.
 */
export function bestellabweichung(position: PruefPosition): Decimal | null {
  if (position.bestellt === null) return null
  return zahl(position.bestellt).minus(zahl(position.lieferschein))
}

export type Zeilenstand = 'stimmt' | 'fehlmenge' | 'ueberlieferung'

/** Wie die Zeile in der Liste erscheint. */
export function zeilenstand(position: Mengenstand): Zeilenstand {
  const abweichung = differenz(position)
  if (abweichung.isZero()) return 'stimmt'
  return abweichung.greaterThan(0) ? 'fehlmenge' : 'ueberlieferung'
}

/**
 * Wie viel die eingetragenen Abweichungen zusammen erklären, in derselben
 * Richtung wie `differenz`: Mindernde zählen positiv, Überlieferung negativ.
 */
export function aufgeschluesselt(position: Mengenstand): Decimal {
  return position.abweichungen
    .filter((eintrag) => MENGENWIRKSAM.has(eintrag.art))
    .reduce((summe, eintrag) => {
      const menge = zahl(eintrag.anzahlGebinde)
      return MINDERND.has(eintrag.art) ? summe.plus(menge) : summe.minus(menge)
    }, new Decimal(0))
}

/**
 * Was die Abweichungen noch nicht erklären. 0 heisst stimmig.
 *
 * Die Mengendifferenz selbst wird nirgends gespeichert — sie ist aus den drei
 * Mengen jederzeit ausrechenbar. Gespeichert wird ihre Aufschlüsselung, und die
 * ist neue Information: fehlen von zwei Kästen einer und ist einer zerbrochen,
 * sagt das keine Differenz der Welt. Deshalb müssen beide zusammenpassen, und
 * deshalb prüfen Maske und Server dasselbe.
 */
export function luecke(position: Mengenstand): Decimal {
  return differenz(position).minus(aufgeschluesselt(position))
}

/** Ob Differenz und Aufschlüsselung zusammenpassen. */
export function stimmig(position: Mengenstand): boolean {
  return luecke(position).isZero()
}

/**
 * Die Abweichung, die sich aus der Mengendifferenz von selbst ergibt.
 *
 * Der Regelfall an der Rampe: eine Menge weicht ab, der Grund ist "fehlt" oder
 * "zu viel", und niemand will dafür ein Formular ausfüllen. Ein Bruch wird
 * davon abgezweigt, weil er anders reklamiert wird — siehe `mitBruch`.
 */
export function vorschlag(position: Mengenstand): Abweichungseingabe[] {
  const abweichung = differenz(position)
  if (abweichung.isZero()) return []
  return [
    {
      art: abweichung.greaterThan(0) ? Abweichungsart.FEHLMENGE : Abweichungsart.UEBERLIEFERUNG,
      anzahlGebinde: abweichung.abs().toString(),
    },
  ]
}

/**
 * Teilt eine Fehlmenge in beschädigte und schlicht fehlende Ware.
 *
 * Beides mindert den Bestand gleich, wird aber verschieden reklamiert: Bruch
 * ist angekommen und unbrauchbar, eine Fehlmenge war nie da. Mehr Bruch als
 * Differenz gibt es nicht — die Zahl wird gekappt statt abgelehnt, damit ein
 * verrutschter Daumen an der Rampe keinen Fehlerdialog auslöst.
 */
export function mitBruch(position: Mengenstand, bruchGebinde: string): Abweichungseingabe[] {
  const abweichung = differenz(position)
  if (!abweichung.greaterThan(0)) return vorschlag(position)

  const bruch = Decimal.min(zahl(bruchGebinde), abweichung)
  const rest = abweichung.minus(bruch)

  // greaterThan(0) und nicht isPositive(): Decimal zählt die Null zu den
  // positiven Zahlen, und eine Abweichung über 0 Gebinde ist keine.
  const eintraege: Abweichungseingabe[] = []
  if (rest.greaterThan(0)) {
    eintraege.push({ art: Abweichungsart.FEHLMENGE, anzahlGebinde: rest.toString() })
  }
  if (bruch.greaterThan(0)) {
    eintraege.push({ art: Abweichungsart.BRUCH, anzahlGebinde: bruch.toString() })
  }
  return eintraege
}

/**
 * Eine Position mit vorbelegter tatsächlicher Menge — der Ausgangszustand jeder
 * Zeile, bevor jemand sie anfasst.
 */
export function vorbelegt(
  werte: Pick<PruefPosition, 'id' | 'artikel' | 'bestellt' | 'lieferschein'> &
    Partial<
      Pick<PruefPosition, 'bestellterArtikel' | 'bestellpositionId' | 'ekPreisCentLieferschein'>
    >,
): PruefPosition {
  return {
    bestellterArtikel: null,
    bestellpositionId: null,
    ekPreisCentLieferschein: null,
    ...werte,
    tatsaechlich: werte.lieferschein,
    nachlieferungZugesagtBis: null,
    abweichungen: [],
  }
}

/**
 * Setzt die tatsächliche Menge und zieht die Abweichungen nach.
 *
 * Die beiden gehören zusammen: eine geänderte Menge ohne passende
 * Aufschlüsselung wäre eine Position, die der Server zurückweist. Ein bereits
 * eingetragener Bruch bleibt erhalten, soweit die neue Differenz ihn noch
 * trägt.
 */
export function mengeSetzen(position: PruefPosition, tatsaechlich: string): PruefPosition {
  return nachfuehren({ ...position, tatsaechlich: dezimaltext(tatsaechlich) })
}

// ---------------------------------------------------------------------------
// Sachverhalte neben der Menge
// ---------------------------------------------------------------------------

/**
 * Ob ein anderer Artikel geliefert wurde als bestellt.
 *
 * Der Ersatzartikel ist kein Mengenproblem: die Palette ist voll, nur mit dem
 * Falschen. Ob der Betrieb das annimmt, entscheidet er selbst — festgehalten
 * wird es in jedem Fall.
 */
export function istErsatzartikel(position: PruefPosition): boolean {
  return position.bestellterArtikel !== null && position.bestellterArtikel.id !== position.artikel.id
}

/**
 * Abweichung des Lieferscheinpreises vom hinterlegten Einkaufspreis, in Cent je
 * Liefergebinde. Positiv heisst: der Lieferant berechnet mehr als vereinbart.
 *
 * `null`, wenn kein Lieferscheinpreis erfasst ist oder der Artikel keinen Preis
 * im Stamm trägt — ohne Vergleichswert gibt es keine Abweichung, und ein
 * fehlender Preis ist ausdrücklich nicht 0.
 */
export function preisabweichungCent(position: {
  artikel: BepreisterArtikel
  ekPreisCentLieferschein: number | null
}): number | null {
  const laut = position.ekPreisCentLieferschein
  const stamm = position.artikel.ekPreisCent
  if (laut === null || stamm === null) return null

  // Der Stammpreis kann je Einheit gelten, der Lieferschein rechnet immer je
  // Gebinde. Über wertGebindeCent wird beides vergleichbar, ohne dass hier eine
  // zweite Umrechnung entsteht.
  const stammJeGebinde = wertGebindeCent(position.artikel, 1)
  if (stammJeGebinde === null) return null

  const unterschied = laut - stammJeGebinde
  return unterschied === 0 ? null : unterschied
}

/**
 * Ab welchem Anteil des hinterlegten Gebindepreises eine Preisabweichung nicht
 * mehr nach Preispflege aussieht, sondern nach einem Irrtum auf dem Papier.
 *
 * Ein Viertel: eine Preiserhöhung um ein paar Prozent ist Alltag und wird nach
 * der Rampe im Stamm geklärt; 38 % mehr auf dem Lieferschein sind eher ein
 * vertauschter Artikel oder ein Tippfehler des Lieferanten — und der Fahrer,
 * den man dazu fragen kann, steht genau jetzt noch da.
 */
export const PREIS_UNPLAUSIBEL_ANTEIL = 0.25

/**
 * Die Preisabweichung als Anteil des hinterlegten Gebindepreises: 0.12 heisst
 * 12 % zu viel, negativ heisst günstiger. `null`, wo es keine Abweichung gibt
 * oder der hinterlegte Preis 0 ist — an einem Preis von nichts gibt es keinen
 * Anteil, nur die Abweichung selbst.
 */
export function preisabweichungAnteil(position: PruefPosition): number | null {
  const unterschied = preisabweichungCent(position)
  if (unterschied === null) return null

  const stammJeGebinde = wertGebindeCent(position.artikel, 1)
  if (stammJeGebinde === null || stammJeGebinde === 0) return null

  return unterschied / stammJeGebinde
}

export type Preisabweichungsstufe = 'keine' | 'klaeren' | 'nachfragen'

/**
 * Die eine Stelle, die den Ton einer Preisabweichung entscheidet.
 *
 * `klaeren` ist der Regelfall: festhalten, weiterprüfen, nach der Rampe in Ruhe
 * in den Stamm übernehmen oder verwerfen. `nachfragen` ist die unplausible
 * Abweichung ab `PREIS_UNPLAUSIBEL_ANTEIL` — in beide Richtungen, denn auch ein
 * Viertel zu billig ist eher ein Irrtum als ein Geschenk. Lässt sich kein
 * Anteil bilden (hinterlegter Preis 0), bleibt es bei `klaeren`: eine Stufe,
 * die niemand ausrechnen kann, darf nicht die lautere sein.
 */
export function preisabweichungsstufe(position: PruefPosition): Preisabweichungsstufe {
  if (preisabweichungCent(position) === null) return 'keine'
  const anteil = preisabweichungAnteil(position)
  if (anteil !== null && Math.abs(anteil) >= PREIS_UNPLAUSIBEL_ANTEIL) return 'nachfragen'
  return 'klaeren'
}

/**
 * Berechnet alle Abweichungen einer Position neu.
 *
 * Eine Stelle für alle Arten, weil sie sonst auseinanderlaufen: die
 * mengenwirksamen folgen der Differenz, die dokumentierenden dem Zustand der
 * Zeile. Erhalten bleibt einzig die Aufteilung des Bruchs — sie ist der einzige
 * Handeingriff, den niemand sonst kennt.
 */
export function nachfuehren(position: PruefPosition): PruefPosition {
  const bruch = position.abweichungen.find((eintrag) => eintrag.art === Abweichungsart.BRUCH)
  const mengen = bruch === undefined ? vorschlag(position) : mitBruch(position, bruch.anzahlGebinde)

  const weitere: Abweichungseingabe[] = []
  if (istErsatzartikel(position)) {
    // Die Menge dokumentiert, wie viel vom Falschen kam; mengenwirksam ist sie
    // nicht, sonst ginge die Stimmigkeitsrechnung nicht mehr auf.
    weitere.push({ art: Abweichungsart.FALSCHER_ARTIKEL, anzahlGebinde: position.tatsaechlich })
  }
  if (preisabweichungCent(position) !== null) {
    // Bei der Preisabweichung ist der Preis die Abweichung, nicht die Menge.
    weitere.push({ art: Abweichungsart.PREISABWEICHUNG, anzahlGebinde: '0' })
  }

  return { ...position, abweichungen: [...mengen, ...weitere] }
}

/** Setzt den Preis laut Lieferschein. `null` löscht ihn wieder. */
export function preisSetzen(position: PruefPosition, cent: number | null): PruefPosition {
  return nachfuehren({ ...position, ekPreisCentLieferschein: cent })
}

/**
 * Stellt die Zeile auf einen anderen Artikel um — den, der tatsächlich auf der
 * Palette steht. Der bestellte wird dabei festgehalten, nicht überschrieben.
 */
export function artikelSetzen(
  position: PruefPosition,
  geliefert: WareneingangArtikel,
): PruefPosition {
  const bestellt =
    position.bestellterArtikel ??
    (position.bestellt === null
      ? null
      : {
          id: position.artikel.id,
          name: position.artikel.name,
          lieferGebindeText: position.artikel.lieferGebindeText,
        })

  return nachfuehren({ ...position, artikel: geliefert, bestellterArtikel: bestellt })
}

/**
 * Hält die Zusage des Fahrers fest, den Rest nachzuliefern. `null` nimmt sie
 * zurück.
 */
export function nachlieferungSetzen(
  position: PruefPosition,
  zugesagtBis: string | null,
): PruefPosition {
  return { ...position, nachlieferungZugesagtBis: zugesagtBis }
}

/** Ob für diese Zeile eine Nachlieferung zugesagt ist. */
export function mitNachlieferung(position: PruefPosition): boolean {
  return position.nachlieferungZugesagtBis !== null
}

/**
 * Setzt die Menge laut Lieferschein und zieht die tatsächliche mit.
 *
 * Ohne Bestellbezug wird der Lieferschein an der Rampe abgetippt, Zeile für
 * Zeile. Solange eine Zeile unberührt ist — tatsächliche Menge gleich
 * Lieferschein, keine Abweichung — bedeutet eine neue Lieferscheinmenge, dass
 * auch so viel angekommen ist. Erst wer die tatsächliche Menge eigens
 * korrigiert, löst die beiden voneinander.
 */
export function lieferscheinSetzen(position: PruefPosition, lieferschein: string): PruefPosition {
  // Auf mengenwirksame Abweichungen prüfen, nicht auf alle: eine Zeile mit
  // Preisabweichung ist der Menge nach unberührt.
  const unberuehrt =
    differenz(position).isZero() &&
    !position.abweichungen.some((eintrag) => MENGENWIRKSAM.has(eintrag.art))
  const neu = { ...position, lieferschein: dezimaltext(lieferschein) }

  return nachfuehren(unberuehrt ? { ...neu, tatsaechlich: neu.lieferschein } : neu)
}

/**
 * Was eine Position kostet, in Cent. `null`, wenn der Artikel keinen Preis
 * hinterlegt hat — dieser Bestand ist geprüft, aber nicht bewertbar, und darf
 * nicht als 0 in eine Reklamationssumme wandern.
 *
 * Gezählt wird nur, was uns Ware kostet: Fehlmenge und Bruch. Eine
 * Überlieferung ist kein Guthaben des Betriebs, sondern eine Frage an den
 * Lieferanten, und gehört in keine Forderungssumme.
 */
export function fehlbetragCent(position: PruefPosition): number | null {
  const mindernd = position.abweichungen.filter((eintrag) => {
    if (!MINDERND.has(eintrag.art)) return false
    // Eine zugesagte Nachlieferung ist keine Forderung, sondern ein Termin. Der
    // Bruch bleibt trotzdem einer: was zerbrochen ankam, liefert niemand nach.
    if (eintrag.art === Abweichungsart.FEHLMENGE && mitNachlieferung(position)) return false
    return true
  })
  if (mindernd.length === 0) return 0

  const gebinde = mindernd.reduce(
    (summe, eintrag) => summe.plus(zahl(eintrag.anzahlGebinde)),
    new Decimal(0),
  )
  return wertGebindeCent(position.artikel, gebinde)
}

// ---------------------------------------------------------------------------
// Klartext
// ---------------------------------------------------------------------------

/**
 * Die Abweichung einer Zeile als Satz: "1 Kasten fehlt · 18,59 EUR · mit Bruch".
 *
 * `null`, solange Palette und Lieferschein übereinstimmen — dann steht unter der
 * Zeile nichts, und das ist der Normalfall.
 *
 * Der Satz gehört hierher und nicht in die Maske, weil jeder seiner Teile eine
 * gerechnete Aussage ist: die Menge kommt aus `differenz`, der Betrag aus
 * `fehlbetragCent`, und ob "fehlt" oder "fehlen" richtig ist, entscheidet
 * dieselbe Zahl. In der Komponente wäre das eine zweite Stelle, an der die
 * Differenz gebildet wird.
 *
 * Ein fehlender Preis wird benannt und nicht auf 0,00 EUR gerundet; ein Betrag
 * von 0 — eine Überlieferung, eine zugesagte Nachlieferung — bleibt weg, denn
 * er ist keine Forderung.
 *
 * `mitBetrag = false` ist die Fassung für Rollen ohne Preissicht
 * (darfPreiseSehen in src/lib/berechtigungen.ts): der Satz nennt die Menge und
 * schweigt über Geld — auch über "nicht bewertbar", denn das wäre die Meldung
 * einer Lücke, die diese Rolle gar nicht sehen soll.
 */
export function abweichungstext(position: PruefPosition, mitBetrag = true): string | null {
  const abweichung = differenz(position)
  if (abweichung.isZero()) return null

  const menge = gebindeMenge(abweichung.abs().toString(), position.artikel.gebindeart)
  const teile = [
    abweichung.greaterThan(0)
      ? `${menge} ${abweichung.equals(1) ? 'fehlt' : 'fehlen'}`
      : `${menge} zu viel`,
  ]

  if (mitBetrag) {
    const betrag = fehlbetragCent(position)
    if (betrag === null) teile.push('nicht bewertbar')
    else if (betrag > 0) teile.push(alsEuro(betrag))
  }

  if (position.abweichungen.some((eintrag) => eintrag.art === Abweichungsart.BRUCH)) {
    teile.push('mit Bruch')
  }

  const zugesagt = position.nachlieferungZugesagtBis
  if (zugesagt !== null) {
    teile.push(`Nachlieferung bis ${alsDatumstext(new Date(`${zugesagt}T00:00:00Z`))}`)
  }

  return teile.join(' · ')
}

/**
 * Der Anteil als Richtungsangabe: "38 % mehr", "26 % weniger". Gerundet auf
 * ganze Prozent — die Aussage ist "das ist zu viel, um zu stimmen", keine
 * Nachkommastelle.
 */
function anteilstext(anteil: number): string {
  const prozent = Math.round(Math.abs(anteil) * 100)
  return `${prozent} % ${anteil > 0 ? 'mehr' : 'weniger'}`
}

/**
 * Die Preisabweichung als Satz, oder `null`, wenn es keine gibt.
 *
 * Beide Preise stehen im Satz, denn beide sind die Aussage: was das Papier
 * sagt und was der Stamm sagt. Der Nachsatz trägt die Stufe — "später klären"
 * ist die Zusage, dass die Rampe hier nichts entscheiden muss; "jetzt
 * nachfragen" ist die eine Ausnahme, in der der Fahrer die schnellere Klärung
 * ist als jedes Büro.
 *
 * Die Aussage gilt je Gebinde; der hinterlegte Preis kommt deshalb über
 * `wertGebindeCent` auf das Liefergebinde, egal ob er je Einheit gilt.
 */
export function preisabweichungstext(position: PruefPosition): string | null {
  const unterschied = preisabweichungCent(position)
  const laut = position.ekPreisCentLieferschein
  if (unterschied === null || laut === null) return null

  const stammJeGebinde = wertGebindeCent(position.artikel, 1)
  if (stammJeGebinde === null) return null

  const preise = `Preis ${alsEuro(laut)} statt ${alsEuro(stammJeGebinde)}`
  const anteil = preisabweichungAnteil(position)
  if (preisabweichungsstufe(position) === 'nachfragen' && anteil !== null) {
    return `${preise} · ${anteilstext(anteil)} — jetzt nachfragen`
  }
  return `${preise} · später klären`
}

/**
 * Die beiden Preise einer Abweichung, wie sie die Seite "Preise klären" zeigt:
 * hinterlegt und laut Lieferschein als fertige Beträge, dazu der Hinweis, wenn
 * die Abweichung unplausibel ist — wer einen 38 % höheren Preis in den Stamm
 * übernimmt, soll das nicht aus Versehen tun.
 *
 * `null`, wo es nichts zu vergleichen gibt. Beide Beträge gelten je
 * Liefergebinde, wie auf dem Lieferschein.
 */
export type Preisvergleich = {
  hinterlegt: string
  lieferschein: string
  /** "38 % mehr als hinterlegt", oder null bei einer stillen Abweichung. */
  hinweis: string | null
}

export function preisvergleich(position: PruefPosition): Preisvergleich | null {
  const laut = position.ekPreisCentLieferschein
  if (preisabweichungCent(position) === null || laut === null) return null

  const stammJeGebinde = wertGebindeCent(position.artikel, 1)
  if (stammJeGebinde === null) return null

  const anteil = preisabweichungAnteil(position)
  return {
    hinterlegt: alsEuro(stammJeGebinde),
    lieferschein: alsEuro(laut),
    hinweis:
      preisabweichungsstufe(position) === 'nachfragen' && anteil !== null
        ? `${anteilstext(anteil)} als hinterlegt`
        : null,
  }
}

export type Zusammenfassung = {
  positionen: number
  /** Zeilen, deren Ware von ihrem Lieferschein abweicht. */
  abweichende: number
  /** Summe der Fehlbeträge in Cent, ohne zugesagte Nachlieferungen. */
  fehlbetragCent: number
  /** Zeilen mit Abweichung, deren Artikel keinen Preis trägt. */
  unbewertbar: number
  /** Zeilen, deren Aufschlüsselung nicht zur Differenz passt. */
  unstimmig: number
  /** Zeilen mit zugesagter Nachlieferung. */
  zugesagt: number
  /** Zeilen, auf denen ein anderer Preis berechnet wurde als hinterlegt. */
  preisabweichungen: number
  /** Zeilen, auf denen ein anderer Artikel steht als bestellt. */
  ersatzartikel: number
}

/**
 * Der Kopf der Maske und die Aufschrift der Bestätigungstaste.
 *
 * Einen Fortschritt "14 von 18 geprüft" gibt es bewusst nicht: durch die
 * Vorbelegung ist jede unberührte Zeile bereits eine Aussage — nämlich die,
 * dass der Lieferschein stimmt. Ein Zähler, der etwas anderes behauptet, würde
 * zu Arbeit auffordern, die diese Maske gerade abschaffen soll.
 */
export function zusammenfassung(positionen: readonly PruefPosition[]): Zusammenfassung {
  let fehlbetrag = 0
  let unbewertbar = 0

  for (const position of positionen) {
    const betrag = fehlbetragCent(position)
    if (betrag === null) unbewertbar += 1
    else fehlbetrag += betrag
  }

  return {
    positionen: positionen.length,
    abweichende: positionen.filter((position) => zeilenstand(position) !== 'stimmt').length,
    fehlbetragCent: fehlbetrag,
    unbewertbar,
    unstimmig: positionen.filter((position) => !stimmig(position)).length,
    zugesagt: positionen.filter(mitNachlieferung).length,
    preisabweichungen: positionen.filter((position) => preisabweichungCent(position) !== null)
      .length,
    ersatzartikel: positionen.filter(istErsatzartikel).length,
  }
}

/**
 * Was der Kopf der Maske rechts oben sagt: "5 Positionen · 2 Leergut".
 *
 * Das Leergut zählt zum Umfang, seit seine Zeilen dieselben Tippflächen sind
 * wie die Ware — ein Kopf, der nur die Warenzeilen nennt, würde behaupten, der
 * Leergut-Block sei keine Prüfarbeit.
 */
export function umfangtext(summe: Zusammenfassung, leergut?: Leergutzusammenfassung): string {
  const positionen =
    summe.positionen === 1 ? '1 Position' : `${summe.positionen} Positionen`
  if (leergut === undefined || leergut.zeilen === 0) return positionen
  return `${positionen} · ${leergut.zeilen} Leergut`
}

/**
 * Was der Kopf der Maske rechts unter der Positionszahl sagt.
 *
 * Der Betrag steht nur da, wo er eine Forderung ist. Sind alle Abweichungen
 * unbewertbar, sagt der Kopf genau das — 0,00 EUR wäre die Behauptung, es koste
 * nichts. Eine reine Überlieferung kostet wirklich nichts, dort bleibt der
 * Betrag deshalb ganz weg.
 *
 * Mit `leergut` zählt offenes Pfand zum Betrag — genau einmal, hier und in
 * `fehlbetragtext` aus derselben Summe. Weicht nur das Leergut ab, nennt der
 * Kopf es beim Namen statt "ohne Abweichung" zu behaupten.
 *
 * `mitBetrag = false` für Rollen ohne Preissicht: die Zahl der Abweichungen
 * bleibt — sie ist Prüfarbeit, kein Geld —, jeder Betrag und jedes "nicht
 * bewertbar" fällt weg.
 */
export function bilanztext(
  summe: Zusammenfassung,
  leergut?: Leergutzusammenfassung,
  mitBetrag = true,
): string {
  const pfandCent = leergut?.offenesPfandCent ?? 0
  const pfandUnbewertbar = leergut?.pfandUnbewertbar ?? 0
  const betrag = summe.fehlbetragCent + pfandCent

  if (summe.abweichende === 0) {
    if (pfandCent > 0) return mitBetrag ? `Leergut · ${alsEuro(pfandCent)}` : 'Leergut weicht ab'
    if (pfandUnbewertbar > 0) return mitBetrag ? 'Leergut · nicht bewertbar' : 'Leergut weicht ab'
    return 'ohne Abweichung'
  }

  const zahl =
    summe.abweichende === 1 ? '1 Abweichung' : `${summe.abweichende} Abweichungen`

  if (!mitBetrag) return zahl
  if (betrag > 0) return `${zahl} · ${alsEuro(betrag)}`
  return summe.unbewertbar > 0 || pfandUnbewertbar > 0 ? `${zahl} · nicht bewertbar` : zahl
}

/**
 * Ob der Kopf seine Bilanz hervorhebt. Nur wo Geld fehlt: eine Überlieferung,
 * ein Ersatzartikel, eine namenlose Leergutzeile sind Arbeit, aber keine
 * Forderung — Rot ist für berechnete Beträge reserviert, sonst sagt es bald
 * nichts mehr.
 */
export function bilanzbetont(summe: Zusammenfassung, leergut?: Leergutzusammenfassung): boolean {
  return summe.fehlbetragCent + (leergut?.offenesPfandCent ?? 0) > 0
}

/**
 * Der Fehlbetrag der ganzen Lieferung, wie ihn die Bestätigung zeigt.
 *
 * Dieselbe Vorsicht wie in `bilanztext`, nur ohne den Rest des Satzes: eine
 * Summe von null ist zweierlei. Entweder ist nichts zu fordern — dann stimmt
 * 0,00 EUR. Oder alle Abweichungen betreffen Artikel ohne hinterlegten Preis —
 * dann ist die Forderung nicht null, sondern unbekannt, und der Bildschirm
 * sagt das, statt eine Zahl zu behaupten, die niemand geprüft hat.
 *
 * Mit `leergut` steht das offene Pfand mit im Betrag — aus derselben Summe wie
 * in `bilanztext`, damit Kopf und Bestätigung nie zwei Zahlen nennen.
 */
export function fehlbetragtext(summe: Zusammenfassung, leergut?: Leergutzusammenfassung): string {
  const betrag = summe.fehlbetragCent + (leergut?.offenesPfandCent ?? 0)
  const unbewertbar = summe.unbewertbar + (leergut?.pfandUnbewertbar ?? 0)
  if (betrag === 0 && unbewertbar > 0) return 'nicht bewertbar'
  return alsEuro(betrag)
}

/**
 * Welche Rolle die Fehlbetrags-Kennzahl trägt: Rot, wo Geld fehlt, Bernstein,
 * wo die Forderung unbekannt ist, sonst neutral.
 *
 * Aus denselben Summen wie `bilanzbetont` und `fehlbetragtext` — Text und Farbe
 * derselben Zahl dürfen nicht aus zwei Rechnungen kommen, sonst nennt der Kopf
 * einen anderen Ernst als die Bestätigung.
 */
export function fehlbetragsrolle(
  summe: Zusammenfassung,
  leergut?: Leergutzusammenfassung,
): 'danger' | 'attention' | 'neutral' {
  if (bilanzbetont(summe, leergut)) return 'danger'
  if (summe.unbewertbar + (leergut?.pfandUnbewertbar ?? 0) > 0) return 'attention'
  return 'neutral'
}

/**
 * Die vier Fassungen des Fusses.
 *
 * `art` sagt, welche Fassung gilt, nicht welche Farbe sie trägt — die Farbe ist
 * Sache der Maske. Gesperrt sind `leer` und `unerklaert`, und beide nennen in
 * ihrer Aufschrift den Grund: ein graues Feld ohne Aussage ist eine Sackgasse.
 *
 * Die Reihenfolge der Prüfungen ist die Reihenfolge der Hindernisse. Ohne
 * Position gibt es nichts zu bestätigen, und das steht vor der Frage, ob die
 * Abweichungen erklärt sind.
 */
export type Abschlussstand = {
  art: 'leer' | 'unerklaert' | 'stimmig' | 'abweichend'
  text: string
}

export function abschlussstand(
  summe: Zusammenfassung,
  leergut?: Leergutzusammenfassung,
): Abschlussstand {
  if (summe.positionen === 0) {
    return { art: 'leer', text: 'Noch keine Position erfasst' }
  }
  if (summe.unstimmig > 0) {
    return {
      art: 'unerklaert',
      text:
        summe.unstimmig === 1
          ? '1 Position ohne Erklärung'
          : `${summe.unstimmig} Positionen ohne Erklärung`,
    }
  }
  // Die namenlose Leergutzeile sperrt wie eine unerklärte Abweichung: sie ist
  // nicht abrechenbar, und still verworfen würde sie später auf keiner
  // Pfandrechnung fehlen dürfen.
  const ohneBezeichnung = leergut?.ohneBezeichnung ?? 0
  if (ohneBezeichnung > 0) {
    return {
      art: 'unerklaert',
      text:
        ohneBezeichnung === 1
          ? '1 Leergut ohne Bezeichnung'
          : `${ohneBezeichnung} Leergut ohne Bezeichnung`,
    }
  }
  const leergutOffen =
    leergut !== undefined && (leergut.offenesPfandCent > 0 || leergut.pfandUnbewertbar > 0)
  if (summe.abweichende === 0) {
    if (leergutOffen) {
      return { art: 'abweichend', text: 'Wareneingang bestätigen · Leergut weicht ab' }
    }
    return { art: 'stimmig', text: 'Alles stimmt — Wareneingang bestätigen' }
  }
  return {
    art: 'abweichend',
    text: `Wareneingang bestätigen · ${
      summe.abweichende === 1 ? '1 Abweichung' : `${summe.abweichende} Abweichungen`
    }`,
  }
}

/**
 * Der Kontrollstand einer Lieferung, wie ihn die Übersicht rechts in der Zeile
 * zeigt.
 *
 * Abgeleitet und nirgends gepflegt: ungeprüft heisst `geprueftAm = null`, und ob
 * eine geprüfte Lieferung etwas gekostet hat, sagen ihre Abweichungen. Ein
 * Statusfeld dafür wäre eine zweite Wahrheit und beim ersten vergessenen Update
 * falsch.
 *
 * Die Aussage kommt in Teilen zurück und nicht als fertiger Satz, weil nur einer
 * ihrer Teile Farbe trägt: die Abweichung, denn dort liegt Geld. Der Rest bleibt
 * ruhiger Text — er behauptet keine Pflege.
 */
export type Kontrollstand = {
  pruefung: 'ungeprüft' | 'geprüft'
  /** Was rechts daneben steht: "3 Positionen", "ohne Positionen", "1 Abweichung". */
  umfang: string
  /** Ob der Umfang hervorgehoben gehört. Nur Abweichungen tun das. */
  betont: boolean
}

/**
 * "ungeprüft · ohne Positionen" ist der Stand, der jede Auswertung verfälscht:
 * die Lieferung ist angelegt, aber nie erfasst worden. Er darf nie zu
 * "0 Positionen" werden — die Null wäre die Aussage "nachgesehen, es kam
 * nichts", und die hat niemand getroffen.
 */
export function kontrollstand(lieferung: {
  geprueftAm: Date | null
  positionen: number
  abweichungen: number
}): Kontrollstand {
  const pruefung = lieferung.geprueftAm === null ? 'ungeprüft' : 'geprüft'

  if (lieferung.positionen === 0) {
    return { pruefung, umfang: 'ohne Positionen', betont: false }
  }

  const zeilen =
    lieferung.positionen === 1 ? '1 Position' : `${lieferung.positionen} Positionen`

  // Vor der Kontrolle sagt die Zahl der Abweichungen nichts: es hat noch niemand
  // hingesehen. Erst die geprüfte Lieferung nennt sie statt ihrer Positionen.
  if (pruefung === 'ungeprüft' || lieferung.abweichungen === 0) {
    return { pruefung, umfang: zeilen, betont: false }
  }

  return {
    pruefung,
    umfang:
      lieferung.abweichungen === 1
        ? '1 Abweichung'
        : `${lieferung.abweichungen} Abweichungen`,
    betont: true,
  }
}

/** Betrag in Cent als deutscher Text: 1859 -> "18,59 EUR". */
export function alsEuro(cent: number): string {
  return `${(cent / 100).toFixed(2).replace('.', ',')} EUR`
}

/** Cent als Eingabetext ohne Währung: 1859 -> "18,59". Leer bei null. */
export function alsPreiseingabe(cent: number | null): string {
  return cent === null ? '' : (cent / 100).toFixed(2).replace('.', ',')
}

/**
 * Eingabetext als Cent: "18,59" -> 1859. Leer ergibt null, nicht 0 — ein nicht
 * erfasster Preis ist etwas anderes als ein Preis von null Cent.
 */
export function centAusEingabe(text: string): number | null {
  if (text.trim() === '') return null
  const euro = Number(dezimaltext(text))
  if (!Number.isFinite(euro) || euro < 0) return null
  return Math.round(euro * 100)
}

// ---------------------------------------------------------------------------
// Erfassung am Lieferschein entlang
// ---------------------------------------------------------------------------

/**
 * Ein Artikel der Erfassungsmaske: der Wareneingangsartikel samt Inhalt einer
 * Einheit in Litern — als Dezimaltext, weil Prismas Decimal die Grenze zur
 * Client-Komponente nicht überquert. Gebraucht wird der Inhalt nur für die
 * abgeleitete Literzeile eines Fasses; die Prüfmaske kommt ohne ihn aus.
 */
export type ErfassungsArtikel = WareneingangArtikel & {
  einheitsgroesseLiter: string
}

/**
 * Eine Zeile der Erfassung: dieselbe Prüfposition, nur trägt ihr Artikel den
 * Inhalt in Litern mit. Damit laufen die Zeilen durch `vorbelegt` und
 * `lieferscheinSetzen` wie in der Kontrolle, und eine Zeile, die dort schon
 * Abweichungen trägt, wird beim Nachbessern in der Erfassung nicht überschrieben.
 */
export type ErfassungsPosition = Omit<PruefPosition, 'artikel'> & { artikel: ErfassungsArtikel }

/**
 * Liter mit genau einer Nachkommastelle: "90,0". Anders als die Literangabe im
 * Artikelstamm (dort "0,33", mit dem Inhalt einer Flasche) steht hier die Summe
 * einer Lieferung — ganze Fässer, bei denen die zweite Stelle nichts sagt.
 */
function literzahl(wert: Decimal): string {
  return wert.toFixed(1).replace('.', ',')
}

/**
 * Die abgeleitete Einheitenspalte der Erfassung: "= 96 Flaschen", "= 1 Flasche",
 * beim Fass "= 90,0 Liter".
 *
 * Gerechnet wird über `einheitenAusGebinden` aus einheiten.ts — die Rampe fragt
 * nach der Gebindegrösse, nicht nach dem Zählmodus. Das Fass wird in Litern
 * gesagt, weil "3 Fässer = 3 Fässer" keine Auskunft wäre: seine Einheit ist das
 * Fass selbst, und die abgeleitete Angabe ist sein Inhalt.
 */
export function einheitenzeile(artikel: ErfassungsArtikel, anzahlGebinde: string): string {
  const einheiten = einheitenAusGebinden(artikel, zahl(anzahlGebinde))

  if (artikel.gebindeart === Gebindeart.FASS) {
    const liter = einheiten.times(new Decimal(artikel.einheitsgroesseLiter))
    return `= ${literzahl(liter)} Liter`
  }
  return `= ${alsEingabe(einheiten.toString())} ${einheiten.equals(1) ? 'Flasche' : 'Flaschen'}`
}

/**
 * Der Wert einer Erfassungszeile als abgeleiteter Text: "= 148,72 EUR".
 * `null` ohne hinterlegten Preis — die Maske schreibt dann "nicht bewertbar",
 * nie 0,00 EUR.
 */
export function positionswerttext(
  artikel: BepreisterArtikel,
  anzahlGebinde: string,
): string | null {
  const cent = wertGebindeCent(artikel, zahl(anzahlGebinde))
  return cent === null ? null : `= ${alsEuro(cent)}`
}

export type Erfassungssumme = {
  positionen: number
  /** Warenwert der bewertbaren Zeilen in Cent, nach der Menge laut Lieferschein. */
  warenwertCent: number
  /** Zeilen ohne hinterlegten Preis — sie fehlen in der Summe und werden benannt. */
  unbewertbar: number
}

/**
 * Der Fuss der Erfassungsmaske. Summiert wird die Menge laut Lieferschein, denn
 * sie ist es, die hier abgetippt wird; was davon tatsächlich ankam, ist die
 * Frage der Kontrolle und nicht dieser Summe.
 */
export function erfassungssumme(zeilen: readonly PruefPosition[]): Erfassungssumme {
  let warenwertCent = 0
  let unbewertbar = 0

  for (const zeile of zeilen) {
    const wert = wertGebindeCent(zeile.artikel, zahl(zeile.lieferschein))
    if (wert === null) unbewertbar += 1
    else warenwertCent += wert
  }

  return { positionen: zeilen.length, warenwertCent, unbewertbar }
}

/**
 * Der Warenwert, wie ihn der Fuss zeigt. Dieselbe Vorsicht wie `fehlbetragtext`:
 * eine Summe von null aus lauter unbewertbaren Zeilen ist kein Wert von
 * 0,00 EUR, sondern ein unbekannter — und der Bildschirm sagt das.
 */
export function warenwerttext(summe: Erfassungssumme): string {
  if (summe.warenwertCent === 0 && summe.unbewertbar > 0) return 'nicht bewertbar'
  return alsEuro(summe.warenwertCent)
}

// ---------------------------------------------------------------------------
// Leergut
// ---------------------------------------------------------------------------

/**
 * Eine Zeile des Leergut-Blocks.
 *
 * Leergut geht in die Gegenrichtung: es verlässt den Betrieb. Die beiden Mengen
 * bedeuten deshalb "laut Lieferschein zurückgegeben" und "tatsächlich
 * mitgegeben" — dieselbe Unterscheidung wie bei der Ware, nur umgekehrt
 * gerichtet.
 *
 * Die Bezeichnung ist Freitext, weil Leergut keinen Artikelstamm hat: ein
 * "Kasten 24er" ist kein Artikel, sondern eine Hülle, die zu vielen passt.
 */
export type Leergutzeile = {
  id: string
  bezeichnung: string
  lieferschein: string
  tatsaechlich: string
  /** Pfand je Einheit in Cent. null heisst: nicht bekannt. */
  pfandCentJeEinheit: number | null
}

/** Differenz einer Leergutzeile: laut Papier minus tatsächlich mitgegeben. */
export function leergutDifferenz(zeile: Leergutzeile): Decimal {
  return zahl(zeile.lieferschein).minus(zahl(zeile.tatsaechlich))
}

/**
 * Was die Leergutdifferenz an Pfand kostet, in Cent. `null` ohne hinterlegtes
 * Pfand — auch hier gilt: unbekannt ist nicht 0.
 *
 * Positiv heisst, es wurde weniger zurückgegeben als gutgeschrieben; dieses
 * Pfand bleibt beim Lieferanten liegen.
 */
export function leergutPfandCent(zeile: Leergutzeile): number | null {
  if (zeile.pfandCentJeEinheit === null) return null
  const differenz = leergutDifferenz(zeile)
  if (differenz.isZero()) return 0
  return Math.round(differenz.times(zeile.pfandCentJeEinheit).toNumber())
}

export type Leergutzustand = 'stimmt' | 'weniger' | 'mehr' | 'fehler'

/**
 * Wie eine Leergutzeile in der Liste erscheint.
 *
 * `fehler` ist die Zeile mit Menge, aber ohne Bezeichnung: sie lässt sich
 * keinem Pfand zuordnen und auf keinem Lieferschein wiederfinden — nicht
 * abrechenbar, und deshalb lauter als jede Differenz. `weniger` ist Geld, das
 * beim Lieferanten liegen bleibt; `mehr` ist eine Frage, keine Forderung.
 */
export function leergutzustand(zeile: Leergutzeile): Leergutzustand {
  const differenz = leergutDifferenz(zeile)
  if (
    zeile.bezeichnung.trim() === '' &&
    (!zahl(zeile.lieferschein).isZero() || !zahl(zeile.tatsaechlich).isZero())
  ) {
    return 'fehler'
  }
  if (differenz.isZero()) return 'stimmt'
  return differenz.greaterThan(0) ? 'weniger' : 'mehr'
}

/**
 * Der Satz unter einer Leergutzeile, oder `null`, wo nichts zu sagen ist.
 *
 * Steht hier und nicht in der Liste, weil jeder seiner Teile eine gerechnete
 * Aussage ist: die Menge kommt aus `leergutDifferenz`, der Betrag aus
 * `leergutPfandCent`. In der Komponente zusammengesetzt wäre er die zweite
 * Stelle, an der die Differenz gebildet wird.
 *
 * "mehr zurück" nennt keinen Betrag: zu viel zurückgegebenes Leergut ist keine
 * Forderung, sondern eine Zeile, die auf dem Lieferschein fehlt.
 */
export function leerguttext(zeile: Leergutzeile): string | null {
  switch (leergutzustand(zeile)) {
    case 'stimmt':
      return null

    case 'fehler':
      return 'Ohne Bezeichnung nicht abrechenbar — Zeile antippen'

    case 'mehr': {
      const menge = alsEingabe(leergutDifferenz(zeile).abs().toString())
      return `${menge} mehr zurück, nicht auf dem Lieferschein`
    }

    case 'weniger': {
      const menge = alsEingabe(leergutDifferenz(zeile).toString())
      const satz = `${menge} weniger zurück als gutgeschrieben`
      const pfand = leergutPfandCent(zeile)
      if (pfand === null) return `${satz} · Pfand nicht hinterlegt`
      return pfand > 0 ? `${satz} · ${alsEuro(pfand)} Pfand` : satz
    }
  }
}

export type Leergutzusammenfassung = {
  zeilen: number
  /** Pfand, das beim Lieferanten liegen bleibt, in Cent. Nur Forderungen. */
  offenesPfandCent: number
  /** Zeilen mit fehlendem Leergut, deren Pfand niemand kennt. */
  pfandUnbewertbar: number
  /** Zeilen mit Menge, aber ohne Bezeichnung — sie sperren den Abschluss. */
  ohneBezeichnung: number
}

/**
 * Was der Leergut-Block zu Kopf und Fuss der Maske beiträgt.
 *
 * In die Forderung geht nur positives Pfand ein: "mehr zurück" ist kein
 * Guthaben, das eine Fehlmenge verrechnen dürfte, sondern eine offene Frage —
 * dieselbe Regel wie bei der Überlieferung von Ware.
 */
export function leergutzusammenfassung(zeilen: readonly Leergutzeile[]): Leergutzusammenfassung {
  let offenesPfandCent = 0
  let pfandUnbewertbar = 0
  let ohneBezeichnung = 0

  for (const zeile of zeilen) {
    const zustand = leergutzustand(zeile)
    if (zustand === 'fehler') ohneBezeichnung += 1

    const pfand = leergutPfandCent(zeile)
    if (pfand !== null && pfand > 0) offenesPfandCent += pfand
    if (zustand === 'weniger' && zeile.pfandCentJeEinheit === null) pfandUnbewertbar += 1
  }

  return { zeilen: zeilen.length, offenesPfandCent, pfandUnbewertbar, ohneBezeichnung }
}
