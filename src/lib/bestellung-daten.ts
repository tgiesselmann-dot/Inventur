/**
 * Holt zusammen, was der Bestellvorschlag wissen muss, und rechnet es in
 * Einheiten um.
 *
 * Getrennt von src/lib/bestellung.ts nach demselben Muster wie Auswertung und
 * Auswertungsdaten: dort die Rechnung, hier der Datenbankzugriff. Die Rechnung
 * bleibt ohne Datenbank prüfbar.
 *
 * Vier Quellen:
 *  1. die letzte abgeschlossene Zählung — der Anker des Bestands,
 *  2. geprüfte Lieferungen seither — Zugänge,
 *  3. Kassenumsätze seither — Abgänge, und über ein längeres Fenster der
 *     Verbrauch, aus dem der Bedarf entsteht,
 *  4. versendete Bestellungen — was schon unterwegs ist.
 *
 * Ohne die vierte Quelle bestellt man zweimal. Sie ist gerechnet und nicht
 * gespeichert: offen ist die bestellte Menge minus dem, was auf sie geliefert
 * wurde. Genau deshalb kennt `BestellStatus` kein TEILWEISE_GELIEFERT.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { BestellStatus, ZaehlungStatus } from '@/generated/prisma/enums'
import type { BestellArtikel, Bedarfsrahmen, Lage } from '@/lib/bestellung'
import { heute, vorTagen } from '@/lib/datum'
import { einheitenAusGebinden, gesamtEinheiten } from '@/lib/einheiten'
import { prisma } from '@/lib/prisma'
import { verkaeufeJeArtikel } from '@/lib/auswertung-daten'

export type Vorschlagslage = {
  rahmen: Bedarfsrahmen
  /** Die Zählung, auf die der Bestand zurückgeht. */
  zaehlung: { id: string; datum: Date }
  /** Fenster, aus dem der Verbrauch stammt. */
  referenz: { von: Date; bis: Date; angefragteTage: number }
  artikel: BestellArtikel[]
  lage: Map<string, Lage>
  /** Ob im Referenzfenster überhaupt Kassendaten liegen. */
  mitUmsatzdaten: boolean
  /** Kassenbezeichnungen ohne Artikelzuordnung — ihr Verbrauch fehlt. */
  ohneZuordnung: { bezeichnung: string; menge: string }[]
}

/**
 * Der Vorschlag für einen Betrieb. `null`, wenn es keine abgeschlossene Zählung
 * gibt — ohne gezählten Bestand ist jeder Vorschlag geraten, und eine geratene
 * Bestellung ist schlechter als keine.
 */
export async function vorschlagslage(
  betriebId: string,
  eingabe: { referenzTage: number; reichweiteTage: number; saisonfaktor: string },
): Promise<Vorschlagslage | null> {
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { betriebId, status: ZaehlungStatus.ABGESCHLOSSEN },
    orderBy: { datum: 'desc' },
  })
  if (zaehlung === null) return null

  const bis = heute()
  const referenzVon = vorTagen(eingabe.referenzTage)

  // Ohne `select`, damit der Feldname der Gebindegrösse in dieser Datei nicht
  // vorkommt — die Umrechnung gehört nach src/lib/einheiten.ts, und der Wächter
  // in tests/einheiten.test.ts prüft das über den blossen Namen.
  const [stamm, zaehlpositionen, lieferpositionen, verbrauch, seitZaehlung, offene, zugeordnete] =
    await Promise.all([
      prisma.artikel.findMany({
        where: { betriebId, aktiv: true },
        omit: { einheitsgroesseLiter: true },
        orderBy: [{ kategorie: 'asc' }, { sortierung: 'asc' }],
      }),
      prisma.zaehlposition.findMany({
        where: { zaehlungId: zaehlung.id },
        include: { artikel: { omit: { einheitsgroesseLiter: true } } },
      }),
      prisma.lieferposition.findMany({
        where: {
          betriebId,
          // Nur geprüfte Lieferungen sind ein belegter Zugang. Ungeprüfte Ware
          // steht unten weiterhin als "unterwegs" — sie ist da, aber niemand hat
          // sie gegen den Lieferschein gehalten.
          lieferung: { geprueftAm: { not: null }, datum: { gt: zaehlung.datum, lte: bis } },
        },
        include: { artikel: { omit: { einheitsgroesseLiter: true } } },
      }),
      verkaeufeJeArtikel(betriebId, referenzVon, bis),
      verkaeufeJeArtikel(betriebId, zaehlung.datum, bis),
      prisma.bestellposition.findMany({
        where: { betriebId, bestellung: { status: BestellStatus.VERSENDET } },
        include: {
          artikel: { omit: { einheitsgroesseLiter: true } },
          // Nur geprüfte Lieferungen schliessen eine Bestellzeile ab — dieselbe
          // Grenze wie oben. Sonst wäre Ware, die noch niemand geprüft hat,
          // weder im Bestand noch unterwegs und fiele aus der Rechnung.
          lieferpositionen: {
            where: { lieferung: { geprueftAm: { not: null } } },
            select: { anzahlGebindeTatsaechlich: true },
          },
        },
      }),
      prisma.kassenartikelbestandteil.findMany({
        where: { betriebId },
        select: { artikelId: true },
        distinct: ['artikelId'],
      }),
    ])

  const zugeordnet = new Set(zugeordnete.map((eintrag) => eintrag.artikelId))
  const lage = new Map<string, Lage>(
    stamm.map((artikel) => [
      artikel.id,
      {
        verbrauch: new Decimal(0),
        zugeordnet: zugeordnet.has(artikel.id),
        gezaehlt: null,
        zugaenge: new Decimal(0),
        abgaenge: new Decimal(0),
        unterwegs: new Decimal(0),
      },
    ]),
  )

  for (const position of zaehlpositionen) {
    const eintrag = lage.get(position.artikelId)
    if (eintrag === undefined) continue
    const menge = gesamtEinheiten(position.artikel, position.anzahlGebinde, position.anzahlEinzeln)
    eintrag.gezaehlt = (eintrag.gezaehlt ?? new Decimal(0)).plus(menge)
  }

  for (const position of lieferpositionen) {
    const eintrag = lage.get(position.artikelId)
    if (eintrag === undefined) continue
    // Die tatsächlich angenommene Menge, nie die vom Lieferschein.
    eintrag.zugaenge = eintrag.zugaenge.plus(
      einheitenAusGebinden(position.artikel, position.anzahlGebindeTatsaechlich),
    )
  }

  for (const [artikelId, verkauf] of verbrauch.jeArtikel) {
    const eintrag = lage.get(artikelId)
    if (eintrag === undefined) continue
    eintrag.verbrauch = eintrag.verbrauch.plus(verkauf.menge)
  }

  for (const [artikelId, verkauf] of seitZaehlung.jeArtikel) {
    const eintrag = lage.get(artikelId)
    if (eintrag === undefined) continue
    eintrag.abgaenge = eintrag.abgaenge.plus(verkauf.menge)
  }

  for (const position of offene) {
    const eintrag = lage.get(position.artikelId)
    if (eintrag === undefined) continue
    const geliefert = position.lieferpositionen.reduce(
      (summe, lieferung) => summe.plus(lieferung.anzahlGebindeTatsaechlich),
      new Decimal(0),
    )
    // Überlieferung macht keine negative Restmenge: mehr als bestellt ist
    // gekommen, offen ist trotzdem nichts.
    const restGebinde = Decimal.max(0, position.anzahlGebinde.minus(geliefert))
    eintrag.unterwegs = eintrag.unterwegs.plus(
      einheitenAusGebinden(position.artikel, restGebinde),
    )
  }

  return {
    rahmen: {
      // Der Divisor sind die tatsächlich belegten Tage. Fehlen Importe ganz,
      // steht hier 1 — der Verbrauch ist dann überall 0, es entsteht kein
      // Vorschlag, und die Seite sagt oben warum. Eine 0 wäre eine Division
      // durch null.
      verbrauchTage: Math.max(1, verbrauch.abgedeckteTage),
      reichweiteTage: eingabe.reichweiteTage,
      saisonfaktor: eingabe.saisonfaktor,
    },
    zaehlung: { id: zaehlung.id, datum: zaehlung.datum },
    referenz: { von: referenzVon, bis, angefragteTage: eingabe.referenzTage },
    artikel: stamm,
    lage,
    mitUmsatzdaten: verbrauch.mitUmsatzdaten,
    ohneZuordnung: verbrauch.ohneZuordnung,
  }
}
