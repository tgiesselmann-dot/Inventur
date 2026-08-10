/**
 * Der Anschluss zwischen zwei Kassenimporten.
 *
 * Der Sollbestand entsteht aus Anfangsbestand, Lieferungen und den verkauften
 * Mengen. Die Verkäufe kommen in Stücken herein — je Datei ein Zeitraum — und
 * nur wenn diese Stücke lückenlos aneinanderstossen, deckt ihre Summe den
 * Zeitraum einer Auswertung ab.
 *
 * Beide Richtungen sind still tödlich:
 *
 *  - Ein Tag, der in keinem Import steht, fehlt als Verkauf. Die Ware ist aus
 *    dem Lager, der Sollbestand weiss nichts davon, und der Schwund fällt um
 *    genau diese Menge zu hoch aus.
 *  - Ein Tag, der in zwei Importen steht, wird zweimal abgezogen. Der
 *    Sollbestand rutscht unter den wahren Stand, und der Schwund fällt zu
 *    niedrig aus — im Extremfall ins Negative, wo er dann als Zählfehler
 *    gelesen wird.
 *
 * Keiner der beiden Fälle fällt in der Auswertung noch auf: dort steht nur eine
 * Zahl, die auch stimmen könnte. Deshalb wird hier gerechnet und beim Import
 * gezeigt.
 *
 * Rein: keine Datenbank, keine Prisma-Typen. Herein kommen Zeitfenster, heraus
 * kommt ein Urteil samt dem Satz, der es auf der Seite trägt. Der Satz gehört
 * mit hierher — der Wortlaut einer Lücke ist eine Aussage über eine Rechnung
 * und keine Gestaltung, und in zwei Masken geschrieben wäre er in einer davon
 * irgendwann falsch.
 */

import { alsDatumstext, alsKurzdatum } from '@/lib/datum'

/**
 * Der Zeitraum eines Imports: erster Tag ab Mitternacht, letzter Tag bis
 * Mitternacht — so, wie ihn src/lib/kassenimport.ts aus dem Kopfblock liest und
 * in `Umsatzimport` ablegt.
 */
export type Zeitfenster = {
  von: Date
  bis: Date
}

const TAG_IN_MS = 86_400_000

/**
 * Die Tagesnummer eines Zeitpunkts.
 *
 * Gerechnet wird in ganzen Tagen und nicht in Millisekunden: `bis` trägt den
 * letzten Augenblick des Tages (23:59:59.999), `von` seine Mitternacht. Eine
 * Differenz in Millisekunden wäre deshalb immer um einen Wimpernschlag daneben,
 * und aus „schliesst an" würde „überschneidet sich um 0 Tage".
 */
function tagesnummer(zeitpunkt: Date): number {
  return Math.floor(zeitpunkt.getTime() / TAG_IN_MS)
}

/** Mitternacht des Tages, auf dem dieser Zeitpunkt liegt. */
function tagesanfang(zeitpunkt: Date): Date {
  return new Date(tagesnummer(zeitpunkt) * TAG_IN_MS)
}

/** Die Naht zwischen einem Import und dem, der ihm folgt. */
export type Naht =
  | {
      art: 'lueckenlos'
      /** Immer 0 — der Fall ist der, in dem kein Tag strittig ist. */
      tage: 0
      vorherBis: Date
      danachVon: Date
    }
  | {
      art: 'luecke'
      /** Tage, die in keinem der beiden Importe stehen. Mindestens 1. */
      tage: number
      vorherBis: Date
      danachVon: Date
      /** Erster und letzter Tag, der niemandem gehört. */
      ersterFehltag: Date
      letzterFehltag: Date
    }
  | {
      art: 'ueberschneidung'
      /** Tage, die in beiden Importen stehen. Mindestens 1. */
      tage: number
      vorherBis: Date
      danachVon: Date
    }

/**
 * Der Anschluss eines Zeitraums an das, was schon da ist.
 *
 * `erster` ist kein Mangel: der erste Import eines Betriebs hat nichts, woran
 * er anschliessen könnte, und eine Warnung an dieser Stelle wäre eine, die
 * niemand abstellen kann.
 */
export type Anschluss = { art: 'erster' } | Naht

/**
 * Die Naht zwischen zwei Zeiträumen.
 *
 * `vorher` und `danach` sind so benannt, wie sie in der Kette stehen, nicht wie
 * sie hereingereicht werden: `danach` darf früher beginnen als `vorher` endet —
 * das ist genau der Fall der Überschneidung.
 */
export function naht(vorher: Zeitfenster, danach: Zeitfenster): Naht {
  const letzterBelegt = tagesnummer(vorher.bis)
  const ersterNeu = tagesnummer(danach.von)
  const abstand = ersterNeu - letzterBelegt

  if (abstand === 1) {
    return { art: 'lueckenlos', tage: 0, vorherBis: vorher.bis, danachVon: danach.von }
  }

  if (abstand > 1) {
    return {
      art: 'luecke',
      // Der letzte belegte und der erste neue Tag gehören je einem Import; was
      // fehlt, ist der Raum zwischen ihnen. Bei „endet am 01., beginnt am 04."
      // sind das der 02. und der 03. — zwei Tage, nicht drei.
      tage: abstand - 1,
      vorherBis: vorher.bis,
      danachVon: danach.von,
      ersterFehltag: new Date((letzterBelegt + 1) * TAG_IN_MS),
      letzterFehltag: new Date((ersterNeu - 1) * TAG_IN_MS),
    }
  }

  // Doppelt sind die Tage, die in beiden stehen — der Schnitt der beiden
  // Zeiträume, nicht der Abstand ihrer Ränder. Beide Grenzen müssen von Fall zu
  // Fall entschieden werden: liegt der zweite Zeitraum ganz im ersten, endet
  // die Doppelung an seinem eigenen letzten Tag; umschliesst er den ersten,
  // beginnt sie an dessen erstem.
  const ersterGemeinsam = Math.max(tagesnummer(vorher.von), ersterNeu)
  const letzterGemeinsam = Math.min(letzterBelegt, tagesnummer(danach.bis))
  return {
    art: 'ueberschneidung',
    tage: Math.max(1, letzterGemeinsam - ersterGemeinsam + 1),
    vorherBis: vorher.bis,
    danachVon: danach.von,
  }
}

/** Überschneiden sich zwei Zeitfenster an mindestens einem Tag? */
function ueberschneidetSich(a: Zeitfenster, b: Zeitfenster): boolean {
  return tagesnummer(a.von) <= tagesnummer(b.bis) && tagesnummer(a.bis) >= tagesnummer(b.von)
}

/**
 * Wie ein neuer Zeitraum an die vorhandenen anschliesst.
 *
 * Eine Überschneidung schlägt eine Lücke: wer denselben Tag zweimal einliest,
 * hat ein Problem, das sich später nicht mehr auflösen lässt, und das gehört
 * zuerst auf den Schirm. Gemeldet wird die schwerste — bei gleicher Schwere die
 * frühere, weil die Kette von vorn aufgeräumt wird.
 *
 * Ohne Überschneidung entscheidet der unmittelbare Vorgänger, also der Import
 * mit dem spätesten Ende vor diesem Zeitraum. Ein späterer Import macht diesen
 * hier nicht zum Nachzügler — ein Nachtrag mitten in die Kette ist ein normaler
 * Vorgang, und seine zweite Naht steht in der Liste der bisherigen Importe.
 */
export function anschluss(neu: Zeitfenster, vorhandene: readonly Zeitfenster[]): Anschluss {
  const doppelt = vorhandene
    .filter((fenster) => ueberschneidetSich(fenster, neu))
    .map((fenster) => naht(fenster, neu))
  if (doppelt.length > 0) {
    return doppelt.reduce((schwerste, kandidat) =>
      kandidat.tage > schwerste.tage ? kandidat : schwerste,
    )
  }

  const vorgaenger = vorhandene
    .filter((fenster) => tagesnummer(fenster.bis) < tagesnummer(neu.von))
    .reduce<Zeitfenster | null>(
      (spaetester, kandidat) =>
        spaetester === null || kandidat.bis.getTime() > spaetester.bis.getTime()
          ? kandidat
          : spaetester,
      null,
    )

  if (vorgaenger === null) return { art: 'erster' }
  return naht(vorgaenger, neu)
}

/** Ein Import in der Kette, mit seiner Naht zu dem davor. */
export type Kettenglied<T extends Zeitfenster> = {
  eintrag: T
  /** `null` beim ältesten Import: vor ihm ist nichts, woran er anschliessen müsste. */
  naht: Naht | null
  /** Abgedeckte Tage, beide Ränder eingeschlossen — die Breite eines Balkens. */
  tage: number
}

/** Wie viele Tage ein Zeitfenster abdeckt, beide Ränder eingeschlossen. */
export function tage(fenster: Zeitfenster): number {
  return tagesnummer(fenster.bis) - tagesnummer(fenster.von) + 1
}

/**
 * Die ganze Kette, ältester zuerst, jeder mit seiner Naht zum Vorgänger.
 *
 * Damit steht der Anschluss an der Zeile, die ihn aufreisst, und nicht als
 * Gesamtmeldung über der Liste: die sagt zwar, dass etwas fehlt, aber nicht,
 * welche Datei nachzuziehen ist.
 */
export function kette<T extends Zeitfenster>(fenster: readonly T[]): Kettenglied<T>[] {
  const sortiert = [...fenster].sort(
    (a, b) => a.von.getTime() - b.von.getTime() || a.bis.getTime() - b.bis.getTime(),
  )
  return sortiert.map((eintrag, index) => ({
    eintrag,
    naht: index === 0 ? null : naht(sortiert[index - 1], eintrag),
    tage: tage(eintrag),
  }))
}

/** Wie ernst eine Naht ist — die Rolle, in der sie auf der Seite steht. */
export type Anschlussstufe = 'confirm' | 'attention' | 'danger' | 'neutral'

/** Der Anschluss in Worten, fertig für die Anzeige. */
export type Anschlussanzeige = {
  art: Anschluss['art']
  stufe: Anschlussstufe
  /** Strittige Tage: fehlend bei einer Lücke, doppelt bei einer Überschneidung. */
  tage: number
  /** Die kurze Form für eine Listenzeile: „lückenlos", „2 Tage fehlen …". */
  titel: string
  /** Der Satz darunter: was das für die Rechnung heisst. */
  erklaerung: string
}

/**
 * Der Anschluss als Text.
 *
 * Die Lücke ist rot und die Überschneidung bernstein, nicht umgekehrt: eine
 * Lücke lässt sich mit einer weiteren Datei schliessen, doppelte Tage lassen
 * sich nachträglich nicht mehr trennen. Bernstein heisst in diesem Produkt
 * „stimmt noch nicht" — für die Überschneidung ist das die Aufforderung, den
 * vorhandenen Import zu ersetzen, und die steht in derselben Maske.
 */
export function alsAnschlussanzeige(befund: Anschluss): Anschlussanzeige {
  switch (befund.art) {
    case 'erster':
      return {
        art: 'erster',
        stufe: 'neutral',
        tage: 0,
        titel: 'Erster Import',
        erklaerung:
          'Vor diesem Zeitraum liegt kein Kassenimport. Ab hier zählt jeder weitere Import gegen das Ende dieses hier.',
      }

    case 'lueckenlos':
      return {
        art: 'lueckenlos',
        stufe: 'confirm',
        tage: 0,
        titel: 'Lückenlos',
        erklaerung: `Schliesst direkt an den Import bis ${alsDatumstext(befund.vorherBis)} an. Kein Tag fehlt, kein Tag doppelt.`,
      }

    case 'luecke':
      return {
        art: 'luecke',
        stufe: 'danger',
        tage: befund.tage,
        titel: `${befund.tage} ${befund.tage === 1 ? 'Tag fehlt' : 'Tage fehlen'} zwischen ${alsKurzdatum(befund.vorherBis)} und ${alsKurzdatum(befund.danachVon)}`,
        erklaerung: `Der Import davor endet am ${alsDatumstext(befund.vorherBis)}, dieser beginnt am ${alsDatumstext(befund.danachVon)}. ${fehltage(befund.ersterFehltag, befund.letzterFehltag, befund.tage)} in keinem Import — der Schwund fällt um genau diese Verkäufe zu hoch aus.`,
      }

    case 'ueberschneidung':
      return {
        art: 'ueberschneidung',
        stufe: 'attention',
        tage: befund.tage,
        titel: `${befund.tage} ${befund.tage === 1 ? 'Tag steht' : 'Tage stehen'} in zwei Importen`,
        erklaerung: `Der Import davor reicht bis ${alsDatumstext(befund.vorherBis)}, dieser beginnt schon am ${alsDatumstext(befund.danachVon)}. Die Verkäufe dieser Tage werden zweimal vom Bestand abgezogen — der Schwund fällt zu niedrig aus.`,
      }
  }
}

/** „Der 02.08.2026 steht" / „Die Tage vom 02.08.2026 bis 03.08.2026 stehen". */
function fehltage(erster: Date, letzter: Date, tage: number): string {
  if (tage === 1) return `Der ${alsDatumstext(erster)} steht`
  return `Die Tage vom ${alsDatumstext(erster)} bis ${alsDatumstext(letzter)} stehen`
}

/**
 * Der erste Tag, an dem ein Import lückenlos anschlösse.
 *
 * Für den Satz, der sagt, welcher Export als nächstes zu ziehen ist. `null`,
 * solange es keinen Import gibt — dann gibt es keinen Tag, der sich aus der
 * Kette ergäbe.
 */
export function naechsterTag(vorhandene: readonly Zeitfenster[]): Date | null {
  if (vorhandene.length === 0) return null
  const letztesEnde = vorhandene.reduce((spaetestes, fenster) =>
    fenster.bis.getTime() > spaetestes.bis.getTime() ? fenster : spaetestes,
  ).bis
  return new Date(tagesanfang(letztesEnde).getTime() + TAG_IN_MS)
}
