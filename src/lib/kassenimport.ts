/**
 * Import des Kassenumsatzes aus dem Bericht "Umsatz nach Artikel und
 * Abrechnungsart".
 *
 * Der Bericht ist keine Tabelle, sondern eine gedruckte Liste in CSV-Form: ein
 * Kopfblock mit dem Zeitraum, dann je Artikel eine Kopfzeile mit PLU, darunter
 * eine Zeile je Abrechnungsart und — nur wenn es mehr als eine gibt — eine
 * Summenzeile. Ein Artikelname kann unter mehreren PLUs auftauchen.
 *
 *   Name;;PLU;Anzahl;Preis;Rabatt;Netto;MwSt;Brutto
 *   Aperol Spritz;;2210;;7,90;;;;          <- Kopfzeile, Anzahl leer
 *   ;Bar Im Haus;;146x;7,90;;969,44;...    <- Menge
 *   ;Debitor Im Haus;;12x;7,90;;79,68;...  <- Menge
 *   Aperol Spritz;;;294x;;;1952,16;...     <- Summenzeile, PLU leer
 *
 * Diese Datei liest den Bericht und schreibt ihn. Wie in src/lib/artikelimport.ts
 * ist das Lesen rein und ohne Datenbank; der PrismaClient kommt als Parameter
 * herein, damit die Abbildung ohne Verbindung prüfbar bleibt.
 *
 * Was hier ausdrücklich nicht passiert: eine Zuordnung zu Lagerartikeln. Der
 * Import legt für jede neue Bezeichnung einen unbearbeiteten `Kassenartikel` an
 * und hört dort auf. Wer eine Zuordnung errät, hat sie am Monatsende trotzdem
 * nicht geprüft — die Vorschläge dafür stehen in src/lib/kassenzuordnung.ts und
 * werden von Hand bestätigt.
 */

import { Decimal } from '@prisma/client/runtime/client'

import type { PrismaClient } from '@/generated/prisma/client'
import { alsMenge } from '@/lib/auswertung'
import { deutscheZahl, parseCsv } from '@/lib/csv'
import { alsDatumstext, ausDatumstext, tagesende } from '@/lib/datum'
import { alsAnschlussanzeige, anschluss, tage, type Anschlussanzeige } from '@/lib/importkette'
import type { Zeilenfehler, Zeilenhinweis } from '@/lib/artikelimport'

export type { Zeilenfehler, Zeilenhinweis }

/** Spaltennummern des Berichts. Der Bericht hat neun Spalten, wir brauchen vier. */
const SPALTE = {
  name: 0,
  abrechnungsart: 1,
  plu: 2,
  anzahl: 3,
} as const

/** Zeilen des Kopfblocks, an denen der Zeitraum hängt. */
const VON_FELD = 'Vom'
const BIS_FELD = 'Bis'

/**
 * Die Zeile, ab der die Daten beginnen. Sie wird über ihren Inhalt gesucht und
 * nicht über eine feste Zeilennummer: der Kopfblock trägt eine Filterzeile, die
 * je nach Einstellung im Kassensystem länger oder kürzer ausfällt.
 */
function istKopfzeile(zeile: string[]): boolean {
  return zeile[SPALTE.name]?.trim() === 'Name' && zeile[SPALTE.plu]?.trim() === 'PLU'
}

/** Eine gelesene Menge, noch ohne Bezug zu einem Lagerartikel. */
export type Umsatzzeile = {
  posBezeichnung: string
  /** Text aus der Kasse, z. B. "Bar Im Haus" oder "Bruch Im Haus". */
  abrechnungsart: string
  menge: Decimal
}

export type Kassenzeitraum = {
  /** Erster Tag des Berichts, Mitternacht UTC. */
  von: Date
  /** Letzter Augenblick des letzten Tages. */
  bis: Date
}

export type Kassenumsatzlesung = {
  /** `null`, wenn der Kopfblock keinen brauchbaren Zeitraum trug. */
  zeitraum: Kassenzeitraum | null
  /** Je Bezeichnung und Abrechnungsart eine Zeile, Mengen zusammengezählt. */
  zeilen: Umsatzzeile[]
  /** Zahl der unterschiedlichen Bezeichnungen. */
  bezeichnungen: number
  fehler: Zeilenfehler[]
  hinweise: Zeilenhinweis[]
}

/** Menge aus einem Feld der Form "146x". */
function anzahl(text: string): Decimal {
  const treffer = /^(-?[\d.,]+)\s*x$/i.exec(text.trim())
  if (treffer === null) throw new Error(`Anzahl "${text}" hat nicht die Form "146x"`)

  const zahl = deutscheZahl(treffer[1])
  if (zahl === null) throw new Error(`Anzahl "${text}" enthält keine Zahl`)
  return new Decimal(zahl)
}

/** Liest "Vom" und "Bis" aus dem Kopfblock. */
function leseZeitraum(kopfblock: string[][]): { zeitraum: Kassenzeitraum | null; fehler: string[] } {
  const fehler: string[] = []
  const feld = (name: string): string | undefined =>
    kopfblock.find((zeile) => zeile[SPALTE.name]?.trim() === name)?.[1]?.trim()

  const vonText = feld(VON_FELD)
  const bisText = feld(BIS_FELD)
  if (vonText === undefined || bisText === undefined) {
    fehler.push(`Kopfblock ohne "${VON_FELD}" und "${BIS_FELD}" — das ist kein Umsatzbericht`)
    return { zeitraum: null, fehler }
  }

  const von = ausDatumstext(vonText)
  const bis = ausDatumstext(bisText)
  if (von === null) fehler.push(`"${VON_FELD}" ist kein Datum: ${vonText}`)
  if (bis === null) fehler.push(`"${BIS_FELD}" ist kein Datum: ${bisText}`)
  if (von === null || bis === null) return { zeitraum: null, fehler }

  if (bis.getTime() < von.getTime()) {
    fehler.push(`Zeitraum läuft rückwärts: ${alsDatumstext(von)} bis ${alsDatumstext(bis)}`)
    return { zeitraum: null, fehler }
  }

  // Der Bericht nennt seinen letzten Tag, meint aber alles bis Mitternacht.
  return { zeitraum: { von, bis: tagesende(bis) }, fehler }
}

/**
 * Liest den Kassenbericht. Rein: kein Dateizugriff, kein Datenbankzugriff.
 *
 * Unbrauchbare Zeilen landen in `fehler` und werden übersprungen, statt den
 * ganzen Lauf zu werfen — bei fünftausend Zeilen wäre "Fehler in Zeile 812" als
 * einzige Auskunft eine Zumutung.
 *
 * Mengen werden je Bezeichnung und Abrechnungsart zusammengezählt. Das ist nicht
 * bloss Aufräumen: derselbe Artikelname steht im Bericht regelmässig unter
 * mehreren PLUs, weil er an mehreren Kassen angelegt wurde. Getrennt gelassen
 * wären das zwei Zeilen, die dieselbe Sache meinen, und jede Zuordnung müsste
 * doppelt gepflegt werden.
 */
export function leseKassenumsatz(csvText: string): Kassenumsatzlesung {
  const zeilen = parseCsv(csvText)
  const fehler: Zeilenfehler[] = []
  const hinweise: Zeilenhinweis[] = []

  const kopfzeileIndex = zeilen.findIndex(istKopfzeile)
  if (kopfzeileIndex === -1) {
    return {
      zeitraum: null,
      zeilen: [],
      bezeichnungen: 0,
      fehler: [
        {
          zeile: 1,
          meldung: 'Keine Kopfzeile "Name;;PLU;Anzahl;…" gefunden — das ist kein Umsatzbericht',
        },
      ],
      hinweise,
    }
  }

  const zeitraumLesung = leseZeitraum(zeilen.slice(0, kopfzeileIndex))
  for (const meldung of zeitraumLesung.fehler) fehler.push({ zeile: 1, meldung })

  // Bezeichnung -> Abrechnungsart -> Menge. Zwei Ebenen, damit gleich benannte
  // Artikel aus verschiedenen PLUs zusammenfallen, ohne dass die Abrechnungsarten
  // dabei verschmelzen.
  const gesammelt = new Map<string, Map<string, Decimal>>()
  /** Welche PLUs je Bezeichnung — nur für den Hinweis. */
  const plus = new Map<string, Set<string>>()
  let laufend: string | null = null

  for (let i = kopfzeileIndex + 1; i < zeilen.length; i++) {
    const zeile = zeilen[i]
    // parseCsv verwirft Leerzeilen, die Nummer ist deshalb ein Anhaltspunkt zum
    // Suchen und kein Zeilenzeiger.
    const nummer = i + 1
    const name = (zeile[SPALTE.name] ?? '').trim()
    const plu = (zeile[SPALTE.plu] ?? '').trim()
    const art = (zeile[SPALTE.abrechnungsart] ?? '').trim()
    const menge = (zeile[SPALTE.anzahl] ?? '').trim()

    // Kopfzeile eines Artikelblocks: Name und PLU, aber keine Menge.
    if (name !== '' && plu !== '') {
      laufend = name
      if (!plus.has(name)) plus.set(name, new Set())
      plus.get(name)!.add(plu)
      if (!gesammelt.has(name)) gesammelt.set(name, new Map())
      continue
    }

    // Summenzeile des Blocks und die Zeile "Gesamtumsatz": Name, aber keine PLU.
    // Ihre Menge steht schon in den Abrechnungszeilen darüber; mitgezählt wäre
    // jeder Artikel doppelt im Bestand abgezogen.
    if (name !== '') continue

    // Mengenzeile.
    if (art === '' || menge === '') continue

    if (laufend === null) {
      fehler.push({ zeile: nummer, meldung: `"${art}" steht vor jedem Artikel` })
      continue
    }

    let wert: Decimal
    try {
      wert = anzahl(menge)
    } catch (ursache) {
      const meldung = ursache instanceof Error ? ursache.message : String(ursache)
      fehler.push({ zeile: nummer, meldung: `${laufend} / ${art}: ${meldung}` })
      continue
    }

    const arten = gesammelt.get(laufend)!
    arten.set(art, (arten.get(art) ?? new Decimal(0)).plus(wert))
  }

  for (const [name, nummern] of plus) {
    if (nummern.size > 1) {
      hinweise.push({
        zeile: 1,
        meldung: `"${name}" steht unter ${nummern.size} PLUs (${[...nummern].join(', ')}) — die Mengen wurden zusammengezählt`,
      })
    }
  }

  // Der Bericht führt jede Abrechnungsart auf, auch wenn nichts darüber lief —
  // "Promotion intern Im Haus;;0x" steht bei hunderten Artikeln. Diese Zeilen
  // ändern keine Rechnung, würden aber jede Bezeichnung, die nie verkauft wurde,
  // auf die Zuordnungsliste heben.
  const gelesen: Umsatzzeile[] = []
  const bezeichnungen = new Set<string>()
  let ohneMenge = 0

  for (const [posBezeichnung, arten] of gesammelt) {
    for (const [abrechnungsart, menge] of arten) {
      if (menge.isZero()) {
        ohneMenge++
        continue
      }
      gelesen.push({ posBezeichnung, abrechnungsart, menge })
      bezeichnungen.add(posBezeichnung)
    }
  }

  if (ohneMenge > 0) {
    hinweise.push({
      zeile: 1,
      meldung: `${ohneMenge} ${ohneMenge === 1 ? 'Zeile' : 'Zeilen'} mit Menge 0 übergangen`,
    })
  }
  gelesen.sort(
    (a, b) =>
      a.posBezeichnung.localeCompare(b.posBezeichnung, 'de') ||
      a.abrechnungsart.localeCompare(b.abrechnungsart, 'de'),
  )

  return {
    zeitraum: zeitraumLesung.zeitraum,
    zeilen: gelesen,
    // Gezählt werden die Bezeichnungen, die auch geschrieben werden — nicht die
    // im Bericht. Sonst nennt die Vorschau eine Zahl, die niemand wiederfindet.
    bezeichnungen: bezeichnungen.size,
    fehler,
    hinweise,
  }
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Ein bereits vorhandener Import, dessen Zeitraum sich mit dem neuen überschneidet. */
export type Ueberschneidung = {
  id: string
  dateiname: string
  von: string
  bis: string
  /** true, wenn der Zeitraum auf den Tag derselbe ist. */
  deckungsgleich: boolean
}

/**
 * Wie eine Bezeichnung aus dieser Datei im Lager ankommt.
 *
 *  - `zugeordnet`  — sie nimmt bekannte Artikel aus dem Bestand.
 *  - `uebergangen` — geprüft und für lagerfremd befunden (Kaffee, Gutscheine).
 *                    Erledigt, nicht offen.
 *  - `unbekannt`   — noch nie angefasst. Ihre Mengen liegen nach dem Import in
 *                    der App, gehen aber in keinen Sollbestand ein.
 */
export type Zuordnungsstand = 'zugeordnet' | 'uebergangen' | 'unbekannt'

/** Eine Bezeichnung der Datei, wie sie die Vorschau zeigt. */
export type Rohzeile = {
  posBezeichnung: string
  /** Die Abrechnungsarten, unter denen gebucht wurde — „Bar Im Haus, Bruch". */
  abrechnungsarten: string
  /** Gebuchte Menge über alle Abrechnungsarten, fertig als deutscher Text. */
  menge: string
  stand: Zuordnungsstand
  /** Worauf sie zeigt. `null`, solange sie niemand zugeordnet hat. */
  ziel: string | null
}

export type Kassenimportvorschau = {
  /** `null`, wenn die Datei keinen Zeitraum trug — dann wird nichts geschrieben. */
  zeitraum: { von: string; bis: string } | null
  /**
   * Wie dieser Zeitraum an die vorhandenen Importe anschliesst — der eine
   * Befund, an dem diese Maske hängt. `null` ohne Zeitraum: ohne ihn gibt es
   * nichts, was anschliessen könnte.
   */
  anschluss: Anschlussanzeige | null
  /** Abgedeckte Tage, beide Ränder eingeschlossen. 0 ohne Zeitraum. */
  tage: number
  /** Geschriebene Umsatzzeilen (Bezeichnung × Abrechnungsart). */
  zeilen: number
  /** Unterschiedliche Kassenbezeichnungen in der Datei. */
  bezeichnungen: number
  /** Davon solche, die der Betrieb noch nie gesehen hat. */
  neueBezeichnungen: number
  /** Bezeichnungen aus dieser Datei, deren Zuordnung noch offen ist. */
  offeneZuordnungen: number
  /** Bezeichnungen dieser Datei, die bereits auf Artikel zeigen. */
  zugeordnete: number
  /** Bezeichnungen dieser Datei, die geprüft und als lagerfremd abgehakt sind. */
  uebergangene: number
  /** Summe aller gebuchten Mengen, als Text. */
  mengeGesamt: string
  /** Mengen je Abrechnungsart, absteigend. */
  jeAbrechnungsart: { abrechnungsart: string; menge: string }[]
  /**
   * Die stärksten Bezeichnungen der Datei, grösste Menge zuerst.
   *
   * Nicht alle: ein Jahresexport bringt tausend Zeilen mit, und eine Liste, die
   * niemand zu Ende liest, prüft auch niemand. Die Menge entscheidet, weil sie
   * entscheidet, was eine falsche Zuordnung kostet.
   */
  rohzeilen: Rohzeile[]
  ueberschneidungen: Ueberschneidung[]
  fehler: Zeilenfehler[]
  hinweise: Zeilenhinweis[]
}

export type Kassenimportergebnis = Kassenimportvorschau & {
  /** id des angelegten Imports. `null`, wenn nur gerechnet oder abgebrochen wurde. */
  importId: string | null
  /** false, wenn nur die Vorschau gerechnet wurde. */
  geschrieben: boolean
  /** Importe, die beim Schreiben ersetzt und dabei gelöscht wurden. */
  ersetzt: string[]
}

export type Kassenimportoptionen = {
  /** true rechnet die Zahlen, schreibt aber nichts. Vorgabe: false. */
  nurVorschau?: boolean
  /**
   * Ids vorhandener Importe, die beim Schreiben gelöscht werden. Ohne sie zählt
   * ein zweimal hochgeladener Zeitraum doppelt — die Auswertung summiert alle
   * Importe, die in ihr Fenster fallen, und kann eine Wiederholung nicht von
   * einem echten zweiten Absatz unterscheiden.
   */
  ersetze?: string[]
}

/**
 * Wie viele Bezeichnungen die Vorschau zeigt.
 *
 * Genug, um in einer Datei mit fünfzig neuen Cocktails zu sehen, dass etwas
 * nicht stimmt; wenig genug, dass die Liste gelesen wird. Was darunter liegt,
 * steht danach in der Zuordnung — nach derselben Reihenfolge sortiert.
 */
const ROHZEILEN_GEZEIGT = 25

/**
 * Die Bezeichnungen der Datei mit ihrer Menge und ihrem Zuordnungsstand.
 *
 * Zusammengefasst über die Abrechnungsarten: für die Frage „was nimmt das aus
 * dem Lager" ist es gleichgültig, ob eine Menge bar oder auf Rechnung gebucht
 * wurde. Die Arten bleiben als Text daneben stehen, weil gebuchter Bruch dort
 * auffallen soll.
 */
function rohzeilen(
  zeilen: readonly Umsatzzeile[],
  stand: (posBezeichnung: string) => { stand: Zuordnungsstand; ziel: string | null },
): Rohzeile[] {
  const summen = new Map<string, { menge: Decimal; arten: Set<string> }>()
  for (const zeile of zeilen) {
    const eintrag = summen.get(zeile.posBezeichnung) ?? { menge: new Decimal(0), arten: new Set() }
    eintrag.menge = eintrag.menge.plus(zeile.menge)
    eintrag.arten.add(zeile.abrechnungsart)
    summen.set(zeile.posBezeichnung, eintrag)
  }

  return [...summen.entries()]
    .sort(
      ([nameA, a], [nameB, b]) =>
        b.menge.comparedTo(a.menge) || nameA.localeCompare(nameB, 'de'),
    )
    .slice(0, ROHZEILEN_GEZEIGT)
    .map(([posBezeichnung, eintrag]) => ({
      posBezeichnung,
      abrechnungsarten: [...eintrag.arten].sort((a, b) => a.localeCompare(b, 'de')).join(', '),
      menge: alsMenge(eintrag.menge),
      ...stand(posBezeichnung),
    }))
}

/** Die Mengen je Abrechnungsart, grösste zuerst. */
function jeAbrechnungsart(zeilen: readonly Umsatzzeile[]): { abrechnungsart: string; menge: string }[] {
  const summen = new Map<string, Decimal>()
  for (const zeile of zeilen) {
    summen.set(zeile.abrechnungsart, (summen.get(zeile.abrechnungsart) ?? new Decimal(0)).plus(zeile.menge))
  }
  return [...summen.entries()]
    .map(([abrechnungsart, menge]) => ({ abrechnungsart, menge }))
    .sort((a, b) => b.menge.comparedTo(a.menge) || a.abrechnungsart.localeCompare(b.abrechnungsart, 'de'))
    .map(({ abrechnungsart, menge }) => ({ abrechnungsart, menge: menge.toString() }))
}

/**
 * Schreibt einen Kassenexport in die Datenbank.
 *
 * Angelegt werden drei Dinge: der Import mit seinem Zeitraum, seine Positionen
 * und — für jede noch unbekannte Bezeichnung — ein unbearbeiteter Kassenartikel.
 * Der bleibt ohne Bestandteile stehen und erscheint auf der Zuordnungsliste.
 *
 * Mit `nurVorschau` liefert dieselbe Funktion dieselben Zahlen, ohne zu
 * schreiben. Eine Vorschau aus einer zweiten Rechenstelle wäre eine Vorschau auf
 * etwas anderes als das, was danach passiert.
 *
 * Ohne brauchbaren Zeitraum wird auch ohne `nurVorschau` nichts geschrieben: ein
 * Import ohne Zeitraum wäre in keiner Auswertung auffindbar und läge als
 * unsichtbarer Datenbestand herum.
 */
export async function importiereKassenumsatz(
  db: PrismaClient,
  betriebId: string,
  dateiname: string,
  csvText: string,
  optionen: Kassenimportoptionen = {},
): Promise<Kassenimportergebnis> {
  const lesung = leseKassenumsatz(csvText)
  const { zeitraum } = lesung

  const bekannt = await db.kassenartikel.findMany({
    where: { betriebId },
    select: {
      posBezeichnung: true,
      bestaetigt: true,
      bestandteile: {
        select: { artikel: { select: { name: true, lieferGebindeText: true } } },
      },
    },
  })
  const vorhanden = new Map(bekannt.map((eintrag) => [eintrag.posBezeichnung, eintrag]))

  const bezeichnungen = [...new Set(lesung.zeilen.map((zeile) => zeile.posBezeichnung))]
  const neue = bezeichnungen.filter((name) => !vorhanden.has(name))

  /** Der Zuordnungsstand einer Bezeichnung, für die Zeilen der Vorschau. */
  const standVon = (posBezeichnung: string): { stand: Zuordnungsstand; ziel: string | null } => {
    const eintrag = vorhanden.get(posBezeichnung)
    if (eintrag === undefined || !eintrag.bestaetigt) return { stand: 'unbekannt', ziel: null }
    if (eintrag.bestandteile.length === 0) {
      return { stand: 'uebergangen', ziel: 'übergangen · nimmt nichts aus dem Lager' }
    }
    return {
      stand: 'zugeordnet',
      ziel: eintrag.bestandteile
        .map((teil) => `${teil.artikel.name} · ${teil.artikel.lieferGebindeText}`)
        .join(' + '),
    }
  }

  // Gezählt wird über denselben Stand, den auch die Zeilen tragen: eine Kennzahl,
  // die anders zählt als die Liste unter ihr, kostet mehr Zeit, als sie spart.
  // Offen ist dabei, was noch niemand angefasst hat — bestätigt ohne Bestandteil
  // heisst "geht das Lager nichts an" und ist erledigt, nicht offen.
  const staende = bezeichnungen.map((name) => standVon(name).stand)
  const offen = staende.filter((stand) => stand === 'unbekannt').length
  const zugeordnet = staende.filter((stand) => stand === 'zugeordnet').length
  const uebergangen = staende.filter((stand) => stand === 'uebergangen').length

  // Alle Zeiträume dieses Betriebs, nicht nur die überschneidenden: die Lücke
  // zum Vorgänger ist gerade die Stelle, an der sich nichts überschneidet.
  const alleZeitraeume = await db.umsatzimport.findMany({
    where: { betriebId },
    select: { zeitraumVon: true, zeitraumBis: true },
    orderBy: { zeitraumVon: 'asc' },
  })

  const ueberschneidungen: Ueberschneidung[] =
    zeitraum === null
      ? []
      : (
          await db.umsatzimport.findMany({
            where: {
              betriebId,
              zeitraumVon: { lte: zeitraum.bis },
              zeitraumBis: { gte: zeitraum.von },
            },
            orderBy: { zeitraumVon: 'asc' },
          })
        ).map((eintrag) => ({
          id: eintrag.id,
          dateiname: eintrag.dateiname,
          von: alsDatumstext(eintrag.zeitraumVon),
          bis: alsDatumstext(eintrag.zeitraumBis),
          deckungsgleich:
            alsDatumstext(eintrag.zeitraumVon) === alsDatumstext(zeitraum.von) &&
            alsDatumstext(eintrag.zeitraumBis) === alsDatumstext(zeitraum.bis),
        }))

  const vorschau: Kassenimportvorschau = {
    zeitraum:
      zeitraum === null
        ? null
        : { von: alsDatumstext(zeitraum.von), bis: alsDatumstext(zeitraum.bis) },
    anschluss:
      zeitraum === null
        ? null
        : alsAnschlussanzeige(
            anschluss(
              zeitraum,
              alleZeitraeume.map((eintrag) => ({
                von: eintrag.zeitraumVon,
                bis: eintrag.zeitraumBis,
              })),
            ),
          ),
    tage: zeitraum === null ? 0 : tage(zeitraum),
    zeilen: lesung.zeilen.length,
    bezeichnungen: lesung.bezeichnungen,
    neueBezeichnungen: neue.length,
    offeneZuordnungen: offen,
    zugeordnete: zugeordnet,
    uebergangene: uebergangen,
    mengeGesamt: lesung.zeilen
      .reduce((summe, zeile) => summe.plus(zeile.menge), new Decimal(0))
      .toString(),
    jeAbrechnungsart: jeAbrechnungsart(lesung.zeilen),
    rohzeilen: rohzeilen(lesung.zeilen, standVon),
    ueberschneidungen,
    fehler: lesung.fehler,
    hinweise: lesung.hinweise,
  }

  if (optionen.nurVorschau === true || zeitraum === null || lesung.zeilen.length === 0) {
    return { ...vorschau, importId: null, geschrieben: false, ersetzt: [] }
  }

  // Nur ersetzen, was auch wirklich überschneidet: eine mitgeschickte fremde id
  // soll keinen unbeteiligten Import löschen können.
  const ersetzbar = new Set(ueberschneidungen.map((eintrag) => eintrag.id))
  const ersetzt = (optionen.ersetze ?? []).filter((id) => ersetzbar.has(id))

  const importId = await db.$transaction(
    async (tx) => {
      if (ersetzt.length > 0) {
        // Die Positionen hängen per Cascade daran und gehen mit.
        await tx.umsatzimport.deleteMany({ where: { betriebId, id: { in: ersetzt } } })
      }

      const angelegt = await tx.umsatzimport.create({
        data: {
          betriebId,
          dateiname,
          zeitraumVon: zeitraum.von,
          zeitraumBis: zeitraum.bis,
        },
      })

      await tx.umsatzposition.createMany({
        data: lesung.zeilen.map((zeile) => ({
          betriebId,
          umsatzimportId: angelegt.id,
          posBezeichnung: zeile.posBezeichnung,
          abrechnungsart: zeile.abrechnungsart,
          menge: zeile.menge,
        })),
      })

      if (neue.length > 0) {
        // skipDuplicates fängt den Fall ab, dass zwei Uploads gleichzeitig
        // dieselbe neue Bezeichnung anlegen wollen.
        await tx.kassenartikel.createMany({
          data: neue.map((posBezeichnung) => ({ betriebId, posBezeichnung })),
          skipDuplicates: true,
        })
      }

      return angelegt.id
    },
    // Ein Jahresexport bringt einige tausend Zeilen mit. createMany ist ein
    // Umlauf, das Löschen ein zweiter — die Vorgabe von fünf Sekunden reicht,
    // solange der Pooler mitspielt, aber nicht verlässlich.
    { timeout: 120_000, maxWait: 15_000 },
  )

  return { ...vorschau, importId, geschrieben: true, ersetzt }
}
