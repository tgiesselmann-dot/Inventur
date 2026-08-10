/**
 * Reine Logik der Reklamations-Nachverfolgung: was eine Abweichung wert ist,
 * wie alt sie werden darf und was der Betrieb je Lieferant daraus lernt.
 *
 * Ohne React, ohne Prisma, ohne fetch — Muster wie src/lib/wareneingang.ts.
 * Gerechnet wird nichts doppelt: Warenwerte laufen über `wertGebindeCent`
 * (src/lib/einheiten.ts), die Preisdifferenz je Gebinde über
 * `preisabweichungCent` (src/lib/wareneingang.ts), Mengentexte über
 * `gebindeMenge` (src/lib/zaehlung.ts).
 *
 * Zwei Entscheidungen, die überall hier durchscheinen:
 *
 *   Sortiert und gruppiert wird nach Alter, nicht nach Betrag. Der Betrag
 *   entscheidet, wie hart man verhandelt; das Alter entscheidet, ob man
 *   überhaupt noch verhandeln darf.
 *
 *   Verworfen ist ein Endzustand, kein Löschen — aber es ist der eigene
 *   Zählfehler. In keine Summe und keine Lieferantenquote geht ein
 *   verworfener Vorgang ein.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { Abweichungsart, Abweichungsstatus } from '@/generated/prisma/enums'
import { wertGebindeCent, type BepreisterArtikel } from '@/lib/einheiten'
import { alsEuro, preisabweichungCent } from '@/lib/wareneingang'
import { dezimaltext, gebindeEinzahl, gebindeMenge } from '@/lib/zaehlung'

import type { Gebindeart } from '@/generated/prisma/enums'

/** Die Felder eines Artikels, die die Nachverfolgung braucht. */
export type Reklamationsartikel = BepreisterArtikel & {
  gebindeart: Gebindeart
}

/**
 * Ein Vorgang der Nachverfolgung: die Abweichung mit dem, was sich an ihr
 * rechnen lässt. Mengen als Dezimaltext mit Punkt, wie überall an der Grenze
 * zu Prismas Decimal.
 */
export type Vorgang = {
  art: Abweichungsart
  /** Betroffene Menge in Liefergebinden. Bei PREISABWEICHUNG 0. */
  anzahlGebinde: string
  /** Menge laut Lieferschein — die Bezugsmenge einer Preisabweichung. */
  anzahlGebindeLieferschein: string
  /** Preis je Liefergebinde laut Lieferschein, in Cent. null: nicht erfasst. */
  ekPreisCentLieferschein: number | null
  artikel: Reklamationsartikel
}

// ---------------------------------------------------------------------------
// Frist
// ---------------------------------------------------------------------------

/**
 * Nach so vielen Tagen ist eine Abweichung überfällig: darüber wird reklamiert
 * oder verworfen, sonst zahlt es der Betrieb. Die Zahl ist eine Hausregel des
 * Betriebs, keine Zusage eines Lieferanten — deshalb eine Konstante und kein
 * Feld je Lieferant.
 */
export const REKLAMATIONSFRIST_TAGE = 14

/**
 * Das Fenster der Übersichtskarten: Abweichungen und Lieferqualität der letzten
 * 30 Tage. Eine Anzeigeentscheidung wie die Frist darüber — die Überschriften
 * der Karten nennen die Zahl aus dieser Konstante, damit Fenster und
 * Beschriftung nicht auseinanderlaufen können.
 */
export const ABWEICHUNGSFENSTER_TAGE = 30

/** Der Kalendertag eines Zeitpunkts in der Zeit des Betriebs, als Mitternacht UTC. */
function betriebstag(zeitpunkt: Date): number {
  const tag = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(zeitpunkt)
  return new Date(`${tag}T00:00:00Z`).getTime()
}

/**
 * Kalendertage seit der Feststellung, in der Zeit des Betriebs: was gestern
 * Abend an der Rampe auffiel, ist am nächsten Morgen 1 Tag alt — nicht 0, nur
 * weil noch keine 24 Stunden vergangen sind. So zählt auch die Frist: am
 * 15.07. festgestellt ist am 08.08. seit 24 Tagen offen.
 *
 * Negativ wird das Alter nie — eine Feststellung in der Zukunft wäre ein
 * Datenfehler, aus dem hier kein Minuszeichen im Kopf der Liste werden darf.
 */
export function alterInTagen(festgestelltAm: Date, jetzt: Date): number {
  return Math.max(0, Math.round((betriebstag(jetzt) - betriebstag(festgestelltAm)) / 86_400_000))
}

/** Ob die Reklamationsfrist überschritten ist. */
export function fristUeberschritten(alterTage: number): boolean {
  return alterTage > REKLAMATIONSFRIST_TAGE
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Die Status, in denen ein Vorgang noch Arbeit ist. */
const AKTIV: ReadonlySet<Abweichungsstatus> = new Set([
  Abweichungsstatus.OFFEN,
  Abweichungsstatus.REKLAMIERT,
  Abweichungsstatus.GUTSCHRIFT_ERWARTET,
])

/** Ob der Vorgang noch offen ist — offen, reklamiert oder Gutschrift erwartet. */
export function istAktiv(status: Abweichungsstatus): boolean {
  return AKTIV.has(status)
}

/** Wie viele Segmente die Statusfolge zeigt. */
export const STATUSSTUFEN = 4

const STUFE: Record<Abweichungsstatus, number> = {
  [Abweichungsstatus.OFFEN]: 1,
  [Abweichungsstatus.REKLAMIERT]: 2,
  [Abweichungsstatus.GUTSCHRIFT_ERWARTET]: 3,
  [Abweichungsstatus.ERLEDIGT]: 4,
  // Kein Schritt auf dem Weg, sondern das Verlassen des Weges: alle Segmente
  // bleiben leer. Eine volle Folge hiesse "durchgefochten", und genau das ist
  // ein Zählfehler nicht.
  [Abweichungsstatus.VERWORFEN]: 0,
}

/**
 * Wie viele Segmente der Statusfolge gefüllt sind: offen 1 bis erledigt 4,
 * verworfen 0. Man liest daran ab, wie weit ein Vorgang ist, ohne die Zeile zu
 * öffnen — eine Ampel könnte das nicht.
 */
export function statusstufe(status: Abweichungsstatus): number {
  return STUFE[status]
}

const STATUS_TEXT: Record<Abweichungsstatus, string> = {
  [Abweichungsstatus.OFFEN]: 'offen',
  [Abweichungsstatus.REKLAMIERT]: 'reklamiert',
  [Abweichungsstatus.GUTSCHRIFT_ERWARTET]: 'Gutschrift erwartet',
  [Abweichungsstatus.ERLEDIGT]: 'erledigt',
  [Abweichungsstatus.VERWORFEN]: 'verworfen',
}

/** Der Status als Wort der Oberfläche. */
export function statustext(status: Abweichungsstatus): string {
  return STATUS_TEXT[status]
}

/**
 * Der nächste Schritt auf dem Weg, oder null, wo es keinen gibt.
 *
 * Von "Gutschrift erwartet" führt bewusst kein Schritt weiter: erledigt wird
 * ein Vorgang nur über die eingetragene Gutschrift, nicht über eine Taste, die
 * Erledigung behauptet.
 */
export function naechsterSchritt(status: Abweichungsstatus): Abweichungsstatus | null {
  switch (status) {
    case Abweichungsstatus.OFFEN:
      return Abweichungsstatus.REKLAMIERT
    case Abweichungsstatus.REKLAMIERT:
      return Abweichungsstatus.GUTSCHRIFT_ERWARTET
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------

const ART_TEXT: Record<Abweichungsart, string> = {
  [Abweichungsart.FEHLMENGE]: 'Fehlmenge',
  [Abweichungsart.UEBERLIEFERUNG]: 'Überlieferung',
  [Abweichungsart.BRUCH]: 'Bruch',
  // "Falscher Artikel" wäre ein Urteil — geliefert wurde etwas anderes, und
  // oft ist es der brauchbare Ersatz. Das Wort bleibt neutral wie seine Farbe.
  [Abweichungsart.FALSCHER_ARTIKEL]: 'Ersatzartikel',
  [Abweichungsart.PREISABWEICHUNG]: 'Preisabweichung',
}

/** Die Art als Wort der Oberfläche. */
export function arttext(art: Abweichungsart): string {
  return ART_TEXT[art]
}

/**
 * Welche Farbrolle die Art trägt. Die Art trägt die Farbe, die Zeile bleibt
 * weiss — fünf getönte Zeilen nebeneinander wären ein Warnbild ohne Aussage.
 *
 * `preis` ist die einzige Rolle ausserhalb der vier Grundrollen: Geld ohne
 * Warenbewegung ist weder Fehlbestand noch Hinweis. `neutral` für den
 * Ersatzartikel — geändert, aber nicht falsch.
 */
export type Artrolle = 'danger' | 'attention' | 'primary' | 'preis' | 'neutral'

const ART_ROLLE: Record<Abweichungsart, Artrolle> = {
  [Abweichungsart.FEHLMENGE]: 'danger',
  [Abweichungsart.BRUCH]: 'attention',
  [Abweichungsart.UEBERLIEFERUNG]: 'primary',
  [Abweichungsart.PREISABWEICHUNG]: 'preis',
  [Abweichungsart.FALSCHER_ARTIKEL]: 'neutral',
}

export function artrolle(art: Abweichungsart): Artrolle {
  return ART_ROLLE[art]
}

// ---------------------------------------------------------------------------
// Menge und Betrag
// ---------------------------------------------------------------------------

/** Kaufmännisch auf ganze Cent gerundet. */
function kaufmaennisch(wert: Decimal): number {
  return wert.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

/**
 * Die Menge, um die es geht: bei einer Preisabweichung die volle Menge laut
 * Lieferschein (ihre `anzahlGebinde` ist 0 — abgewichen ist der Preis, nicht
 * die Menge), sonst die betroffene Menge.
 */
function bezugsmenge(vorgang: Vorgang): string {
  return vorgang.art === Abweichungsart.PREISABWEICHUNG
    ? vorgang.anzahlGebindeLieferschein
    : vorgang.anzahlGebinde
}

/**
 * Die Menge mit Richtung: "−2 Fässer" fehlen, "+4 Kästen" zu viel, "3 Kästen"
 * Bruch. Das Vorzeichen steht nur da, wo die Richtung die Aussage ist.
 */
export function mengentext(vorgang: Vorgang): string {
  const menge = gebindeMenge(bezugsmenge(vorgang), vorgang.artikel.gebindeart)
  switch (vorgang.art) {
    case Abweichungsart.FEHLMENGE:
      return `−${menge}`
    case Abweichungsart.UEBERLIEFERUNG:
      return `+${menge}`
    default:
      return menge
  }
}

/**
 * Was der Vorgang wert ist, in Cent — der reklamierte Betrag der Übersicht
 * und der Detailansicht.
 *
 * Bewertet wird zum Preis laut Lieferschein: er ist das Papier, gegen das
 * reklamiert wird. Fehlt er, springt der hinterlegte Preis über
 * `wertGebindeCent` ein; fehlt auch der, ist der Vorgang nicht bewertbar —
 * `null`, ausdrücklich nicht 0.
 *
 * Bei einer Preisabweichung ist der Betrag die Differenz über die Menge laut
 * Lieferschein, als Betrag ohne Vorzeichen: auch ein zu billig berechneter
 * Kasten ist eine Abweichung, die geklärt werden will. Ein Ersatzartikel ist
 * vollzählig geliefert — es gibt keinen Warenwert zu reklamieren.
 */
export function reklamationsbetragCent(vorgang: Vorgang): number | null {
  switch (vorgang.art) {
    case Abweichungsart.FALSCHER_ARTIKEL:
      return null

    case Abweichungsart.PREISABWEICHUNG: {
      const jeGebinde = preisabweichungCent(vorgang)
      if (jeGebinde === null) return null
      return kaufmaennisch(
        new Decimal(dezimaltext(vorgang.anzahlGebindeLieferschein)).mul(jeGebinde).abs(),
      )
    }

    default: {
      const menge = dezimaltext(vorgang.anzahlGebinde)
      if (vorgang.ekPreisCentLieferschein !== null) {
        return kaufmaennisch(new Decimal(menge).mul(vorgang.ekPreisCentLieferschein))
      }
      return wertGebindeCent(vorgang.artikel, menge)
    }
  }
}

/**
 * Die Rechnung hinter dem Betrag, als Mono-Zeile der Detailansicht:
 * "2 Fässer × 89,20 EUR · Preis laut Lieferschein". Sie ist der Grund, warum
 * der Betrag sichtbar gerechnet ist und kein Eingabefeld — wer die Zeile
 * liest, kann die Zahl darüber nachrechnen.
 */
export function rechenzeile(vorgang: Vorgang): string | null {
  const menge = gebindeMenge(bezugsmenge(vorgang), vorgang.artikel.gebindeart)

  switch (vorgang.art) {
    case Abweichungsart.FALSCHER_ARTIKEL:
      return null

    case Abweichungsart.PREISABWEICHUNG: {
      const jeGebinde = preisabweichungCent(vorgang)
      if (jeGebinde === null) return null
      const richtung = jeGebinde > 0 ? 'zu viel' : 'zu wenig'
      return `${menge} × ${alsEuro(Math.abs(jeGebinde))} ${richtung} je ${gebindeEinzahl(vorgang.artikel.gebindeart)}`
    }

    default: {
      if (vorgang.ekPreisCentLieferschein !== null) {
        return `${menge} × ${alsEuro(vorgang.ekPreisCentLieferschein)} · Preis laut Lieferschein`
      }
      const stammJeGebinde = wertGebindeCent(vorgang.artikel, 1)
      if (stammJeGebinde === null) return null
      return `${menge} × ${alsEuro(stammJeGebinde)} · hinterlegter Preis`
    }
  }
}

/**
 * Der Satz unter den drei Mengen der Detailansicht: was auseinandergelaufen
 * ist, und ob Bestellung und Lieferschein dabei übereinstimmen. Zwischen
 * bestellt und Lieferschein streitet man mit dem Innendienst, zwischen
 * Lieferschein und tatsächlich mit dem Fahrer — der Satz sagt, welches
 * Gespräch ansteht.
 */
export function mengensatz(vorgang: Vorgang, bestellt: string | null): string {
  const menge = gebindeMenge(bezugsmenge(vorgang), vorgang.artikel.gebindeart)
  const einzahl = dezimaltext(bezugsmenge(vorgang)) === '1'

  const erste = (() => {
    switch (vorgang.art) {
      case Abweichungsart.FEHLMENGE:
        return `${menge} ${einzahl ? 'fehlt' : 'fehlen'} gegenüber dem Lieferschein.`
      case Abweichungsart.UEBERLIEFERUNG:
        return `${menge} mehr als auf dem Lieferschein.`
      case Abweichungsart.BRUCH:
        return `${menge} unbrauchbar angekommen.`
      case Abweichungsart.FALSCHER_ARTIKEL:
        return 'Anderer Artikel geliefert als bestellt.'
      case Abweichungsart.PREISABWEICHUNG:
        return 'Die Menge stimmt — abgewichen ist der Preis.'
      default: {
        const unbekannt: never = vorgang.art
        throw new Error(`Unbekannte Abweichungsart: ${String(unbekannt)}`)
      }
    }
  })()

  if (bestellt === null) return `${erste} Ohne Bestellbezug.`

  const stimmt = new Decimal(dezimaltext(bestellt)).equals(
    new Decimal(dezimaltext(vorgang.anzahlGebindeLieferschein)),
  )
  return stimmt
    ? `${erste} Bestellung und Lieferschein stimmen überein.`
    : `${erste} Auch Bestellung und Lieferschein weichen voneinander ab.`
}

/**
 * Was zwischen Gutschrift und gerechnetem Betrag liegt, in Cent — positiv,
 * wenn mehr gutgeschrieben wurde als gerechnet. `null`, solange eines von
 * beiden fehlt: an einer Differenz mit nur einer Seite ist nichts sichtbar.
 */
export function gutschriftdifferenzCent(
  betragCent: number | null,
  gutschriftCent: number | null,
): number | null {
  if (betragCent === null || gutschriftCent === null) return null
  return gutschriftCent - betragCent
}

// ---------------------------------------------------------------------------
// Kennzahlen der Übersicht
// ---------------------------------------------------------------------------

/** Ein aktiver Vorgang, soweit ihn die Kopfkarte braucht. */
export type OffenerEintrag = {
  status: Abweichungsstatus
  betragCent: number | null
  alterTage: number
}

export type OffeneUebersicht = {
  /** Summe der bewertbaren aktiven Vorgänge, in Cent. */
  summeCent: number
  anzahl: number
  /** Wie viele davon nicht bewertbar sind — sie fehlen in der Summe. */
  nichtBewertbar: number
  aeltesterTage: number | null
  /** Nur Status mit mindestens einem Vorgang, in Wegreihenfolge. */
  jeStatus: { status: Abweichungsstatus; anzahl: number }[]
}

/**
 * Die Kopfkarte "offener Reklamationsbetrag": Summe, Anzahl, ältester Vorgang
 * und die Verteilung auf die drei aktiven Status. Nicht bewertbare Vorgänge
 * werden gezählt statt mit 0 addiert — die Summe bleibt ehrlich, und die
 * Karte sagt dazu, was ihr fehlt.
 */
export function offeneUebersicht(eintraege: readonly OffenerEintrag[]): OffeneUebersicht {
  const aktive = eintraege.filter((eintrag) => istAktiv(eintrag.status))

  const jeStatus = [
    Abweichungsstatus.OFFEN,
    Abweichungsstatus.REKLAMIERT,
    Abweichungsstatus.GUTSCHRIFT_ERWARTET,
  ]
    .map((status) => ({
      status,
      anzahl: aktive.filter((eintrag) => eintrag.status === status).length,
    }))
    .filter((eintrag) => eintrag.anzahl > 0)

  return {
    summeCent: aktive.reduce((summe, eintrag) => summe + (eintrag.betragCent ?? 0), 0),
    anzahl: aktive.length,
    nichtBewertbar: aktive.filter((eintrag) => eintrag.betragCent === null).length,
    aeltesterTage: aktive.length === 0 ? null : Math.max(...aktive.map((e) => e.alterTage)),
    jeStatus,
  }
}

/**
 * Wie oft jede Art vorkommt, häufigste zuerst — die Aufschlüsselung der
 * 30-Tage-Karte. Arten ohne Vorkommen bleiben weg: eine Null in der Liste
 * wäre eine Zeile ohne Auskunft.
 */
export function artenzaehlung(
  arten: readonly Abweichungsart[],
): { art: Abweichungsart; anzahl: number }[] {
  const zaehler = new Map<Abweichungsart, number>()
  for (const art of arten) zaehler.set(art, (zaehler.get(art) ?? 0) + 1)

  return [...zaehler.entries()]
    .map(([art, anzahl]) => ({ art, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || arttext(a.art).localeCompare(arttext(b.art), 'de'))
}

// ---------------------------------------------------------------------------
// Übersicht je Lieferant
// ---------------------------------------------------------------------------

/** Eine Lieferung, soweit sie die Lieferantenübersicht braucht. */
export type Lieferantenlieferung = {
  lieferant: string
  geprueft: boolean
  abweichungen: readonly { status: Abweichungsstatus; betragCent: number | null }[]
}

export type Lieferantenzeile = {
  lieferant: string
  lieferungen: number
  /** Lieferungen mit Aussage: geprüft, oder ungeprüft mit Abweichungen. */
  beurteilt: number
  fehlerfrei: number
  /** Anteil fehlerfreier an den beurteilten Lieferungen. null ohne solche. */
  fehlerfreiAnteil: number | null
  /** Summe der bewertbaren, nicht verworfenen Abweichungen, in Cent. */
  summeCent: number
  /** Abweichungen ohne Betrag — sie fehlen in der Summe. */
  nichtBewertbar: number
}

/**
 * Die Übersicht je Lieferant: Anzahl Lieferungen, Anteil fehlerfreier, Summe
 * der Abweichungen. Sie zählt Lieferungen, nicht Abweichungen — zwölf
 * Lieferungen mit vier Vorfällen sind eine Quote, vier Vorfälle allein eine
 * Anekdote.
 *
 * Fehlerfrei kann nur eine geprüfte Lieferung sein: eine ungeprüfte hat noch
 * nichts gesagt, und sie als fehlerfrei zu zählen schönte die Quote genau
 * dann, wenn die Kontrolle liegen bleibt. Umgekehrt zählt eine ungeprüfte
 * Lieferung, an der schon Abweichungen stehen, sehr wohl in die Quote — als
 * fehlerhafte: die Kontrolle mag offen sein, ihr Befund ist es nicht. Sonst
 * stünde neben "100 % fehlerfrei" eine Abweichungssumme aus denselben
 * Lieferungen. Verworfene Abweichungen zählen nirgends — der eigene
 * Zählfehler ist kein Fehler des Lieferanten.
 *
 * Sortiert steht die schlechteste Quote oben: die Übersicht ist das Argument
 * im nächsten Gespräch mit dem Aussendienst, und das führt man zuerst dort,
 * wo es am nötigsten ist.
 */
export function lieferantenuebersicht(
  lieferungen: readonly Lieferantenlieferung[],
): Lieferantenzeile[] {
  const jeLieferant = new Map<string, Lieferantenlieferung[]>()
  for (const lieferung of lieferungen) {
    const liste = jeLieferant.get(lieferung.lieferant) ?? []
    liste.push(lieferung)
    jeLieferant.set(lieferung.lieferant, liste)
  }

  const zeilen = [...jeLieferant.entries()].map(([lieferant, liste]): Lieferantenzeile => {
    const zaehlend = liste.map((lieferung) => ({
      ...lieferung,
      abweichungen: lieferung.abweichungen.filter(
        (abweichung) => abweichung.status !== Abweichungsstatus.VERWORFEN,
      ),
    }))

    const beurteilt = zaehlend.filter(
      (lieferung) => lieferung.geprueft || lieferung.abweichungen.length > 0,
    )
    const fehlerfrei = beurteilt.filter(
      (lieferung) => lieferung.geprueft && lieferung.abweichungen.length === 0,
    )
    const abweichungen = zaehlend.flatMap((lieferung) => lieferung.abweichungen)

    return {
      lieferant,
      lieferungen: liste.length,
      beurteilt: beurteilt.length,
      fehlerfrei: fehlerfrei.length,
      fehlerfreiAnteil: beurteilt.length === 0 ? null : fehlerfrei.length / beurteilt.length,
      summeCent: abweichungen.reduce((summe, a) => summe + (a.betragCent ?? 0), 0),
      nichtBewertbar: abweichungen.filter((a) => a.betragCent === null).length,
    }
  })

  return zeilen.sort((a, b) => {
    const quoteA = a.fehlerfreiAnteil ?? Number.POSITIVE_INFINITY
    const quoteB = b.fehlerfreiAnteil ?? Number.POSITIVE_INFINITY
    if (quoteA !== quoteB) return quoteA - quoteB
    if (a.summeCent !== b.summeCent) return b.summeCent - a.summeCent
    return a.lieferant.localeCompare(b.lieferant, 'de')
  })
}

/**
 * Welche Rolle die Quote färbt. Die Schwellen sind Anzeigeentscheidung, keine
 * Naturkonstante: ab vier von fünf fehlerfreien Lieferungen ist der Lieferant
 * verlässlich, unter sieben von zehn ist die Quote selbst das Gesprächsthema.
 */
export function quotenstufe(anteil: number): 'confirm' | 'attention' | 'danger' {
  if (anteil >= 0.8) return 'confirm'
  if (anteil >= 0.7) return 'attention'
  return 'danger'
}

/**
 * Ein Anteil als ganze Prozent, die Zahl allein: 0.667 -> 67. Auch die Breite
 * eines Quotenbalkens kommt hierher — Balken und Zahl daneben sind dieselbe
 * Rundung, sonst zeigt der eine etwas anderes als die andere.
 */
export function prozentzahl(anteil: number): number {
  return Math.round(anteil * 100)
}

/** Ein Anteil als ganze Prozent: 0.667 -> "67 %". */
export function alsProzent(anteil: number): string {
  return `${prozentzahl(anteil)} %`
}

/**
 * Die Summe offener Reklamationsbeträge als Text. Eine Null, hinter der
 * unbewertbare Vorgänge stehen, ist keine Auskunft über den Betrag, sondern
 * über die Datenlage — dann steht hier "nicht bewertbar" statt 0,00 EUR.
 */
export function reklamationssummetext(stand: {
  summeCent: number
  nichtBewertbar: number
}): string {
  if (stand.summeCent === 0 && stand.nichtBewertbar > 0) return 'nicht bewertbar'
  return alsEuro(stand.summeCent)
}
