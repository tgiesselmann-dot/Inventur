/**
 * Holt die Daten für den Verlauf — einmal breit statt zwölfmal schmal.
 *
 * Die Wochenauswertung lädt fünf Quellen für einen Zeitraum. Zwölf Zeiträume
 * nacheinander so zu laden wären sechzig Abfragen, davon zwölfmal derselbe
 * Artikelstamm. Stattdessen wird hier einmal über das ganze Fenster geladen und
 * je Zeitraum aufgeteilt; zusammengetragen und gerechnet wird mit denselben
 * Funktionen wie in der Wochenauswertung (`datenlageAus`, `verkaufslageAus`,
 * `zeile`) — der Verlauf soll keine eigene Wahrheit haben, sondern dieselbe
 * mehrfach.
 *
 * Ein Umsatzimport zählt zu einem Zeitraum, wenn er ganz hineinfällt — dieselbe
 * Bedingung wie in `verkaeufeJeArtikel`. Ein Import über zwei Wochen gehört
 * damit in keinen der beiden Wochenzeiträume; er würde sonst in beiden voll
 * gezählt und der Schwund doppelt gemindert.
 */

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { zeile, type Zeile } from '@/lib/auswertung'
import {
  datenlageAus,
  verkaufslageAus,
  type Zaehlzeile,
  type Zeitraum,
} from '@/lib/auswertung-daten'
import { prisma } from '@/lib/prisma'
import { verlaufspunkt, zeitraeumeAus, zeitraumzahl, type Verlaufspunkt } from '@/lib/verlauf'

/**
 * Wie viele Zeiträume der Verlauf zeigt.
 *
 * Zwölf Wochen sind ein Vierteljahr — lang genug, dass eine Entwicklung
 * sichtbar wird, und kurz genug, dass die Seite in einem Blick lesbar bleibt.
 * Die Grenze steht auf der Seite, statt still zu schneiden.
 */
export const VERLAUFSGRENZE = 12

export type Verlaufslage = {
  /** Die Zeiträume, jüngster zuerst. Jeder Punkt trägt seinen Zeitraum mit. */
  punkte: Verlaufspunkt[]
  /** Wie viele Zeiträume es insgesamt gäbe. Grösser als `punkte.length`, wo geschnitten wurde. */
  gesamt: number
}

export async function verlaufslage(
  betriebId: string,
  hoechstens: number = VERLAUFSGRENZE,
): Promise<Verlaufslage> {
  // Eine Zählung mehr als Zeiträume: n Zeiträume brauchen n+1 Zählungen.
  const zaehlungen = await prisma.zaehlung.findMany({
    where: { betriebId, status: ZaehlungStatus.ABGESCHLOSSEN },
    orderBy: { datum: 'desc' },
    select: { id: true, datum: true },
  })

  const zeitraeume = zeitraeumeAus(zaehlungen, hoechstens)
  if (zeitraeume.length === 0) {
    return { punkte: [], gesamt: zeitraumzahl(zaehlungen) }
  }

  // Das gemeinsame Fenster: vom Anfang des ältesten gezeigten Zeitraums bis zum
  // Ende des jüngsten.
  const anfang = zeitraeume[zeitraeume.length - 1].von
  const ende = zeitraeume[0].bis
  const zaehlungsIds = [
    ...new Set(zeitraeume.flatMap((zeitraum) => [zeitraum.vonZaehlungId, zeitraum.bisZaehlungId])),
  ]

  const [stamm, zaehlpositionen, lieferpositionen, umsatzpositionen, kassenartikel] =
    await Promise.all([
      // Ohne `select`, damit der Feldname der Gebindegrösse in dieser Datei nicht
      // vorkommt — die Umrechnung gehört nach src/lib/einheiten.ts, und der
      // Wächter in tests/einheiten.test.ts prüft das über den blossen Namen.
      prisma.artikel.findMany({
        where: { betriebId },
        omit: { einheitsgroesseLiter: true },
        orderBy: [{ kategorie: 'asc' }, { sortierung: 'asc' }],
      }),
      prisma.zaehlposition.findMany({
        where: { zaehlungId: { in: zaehlungsIds } },
        include: { artikel: { omit: { einheitsgroesseLiter: true } } },
      }),
      prisma.lieferposition.findMany({
        where: {
          betriebId,
          // Nur geprüfte Lieferungen zählen — dieselbe Regel wie in der
          // Wochenauswertung.
          lieferung: { geprueftAm: { not: null }, datum: { gt: anfang, lte: ende } },
        },
        include: { lieferung: true, artikel: { omit: { einheitsgroesseLiter: true } } },
      }),
      prisma.umsatzposition.findMany({
        where: {
          betriebId,
          umsatzimport: { zeitraumVon: { gte: anfang }, zeitraumBis: { lte: naechsterTag(ende) } },
        },
        include: { umsatzimport: true },
      }),
      prisma.kassenartikel.findMany({ where: { betriebId }, include: { bestandteile: true } }),
    ])

  const jeZaehlung = new Map<string, Zaehlzeile[]>()
  for (const position of zaehlpositionen) {
    const bisher = jeZaehlung.get(position.zaehlungId)
    if (bisher === undefined) jeZaehlung.set(position.zaehlungId, [position])
    else bisher.push(position)
  }

  const punkte = zeitraeume.map((zeitraum) => {
    const verkaeufe = verkaufslageAus(
      umsatzpositionen.filter((position) => imFenster(position.umsatzimport, zeitraum)),
      kassenartikel,
    )

    const lage = datenlageAus(zeitraum, {
      stamm,
      anfangszaehlung: jeZaehlung.get(zeitraum.vonZaehlungId) ?? [],
      endzaehlung: jeZaehlung.get(zeitraum.bisZaehlungId) ?? [],
      lieferpositionen: lieferpositionen.filter((position) =>
        imZeitraum(position.lieferung.datum, zeitraum),
      ),
      verkaeufe,
    })

    const zeilen: Zeile[] = lage.artikel.map((artikel) =>
      zeile(artikel, lage.bewegungen.get(artikel.id)!),
    )

    return verlaufspunkt(zeitraum, zeilen, lage.mitUmsatzdaten)
  })

  return { punkte, gesamt: zeitraumzahl(zaehlungen) }
}

/**
 * Ob ein Umsatzimport ganz in den Zeitraum fällt.
 *
 * Dieselbe Bedingung, die `verkaeufeJeArtikel` als Abfrage stellt — hier nur
 * im Speicher statt in der Datenbank, weil alle Importe des Fensters schon
 * geladen sind.
 */
function imFenster(
  eintrag: { zeitraumVon: Date; zeitraumBis: Date },
  zeitraum: Zeitraum,
): boolean {
  return (
    eintrag.zeitraumVon.getTime() >= zeitraum.von.getTime() &&
    eintrag.zeitraumBis.getTime() <= naechsterTag(zeitraum.bis).getTime()
  )
}

/** Lieferungen nach dem Anfangstag bis einschliesslich des Endtags. */
function imZeitraum(datum: Date, zeitraum: Zeitraum): boolean {
  return datum.getTime() > zeitraum.von.getTime() && datum.getTime() <= zeitraum.bis.getTime()
}

/** Der Tag nach einem Datum — die Umsatzimporte laufen bis Mitternacht. */
function naechsterTag(datum: Date): Date {
  return new Date(datum.getTime() + 86_400_000)
}
