/**
 * Lädt eine Lieferung mit ihren Positionen und dem Artikelstamm für die
 * Prüfmaske.
 *
 * Der Artikelstamm kommt vollständig mit, nicht seitenweise — wie in der
 * Zählung. An der Rampe soll die Suche nach einem Artikel, der nicht auf dem
 * Lieferschein steht, nicht auf eine Netzantwort warten.
 *
 * Die Artikel gehen als ganze Objekte an die Maske, statt Feld für Feld
 * zusammengesetzt zu werden. Das ist kein Geiz, sondern Absicht: der Wächter in
 * tests/einheiten.test.ts lässt jede Datei unter src/ durchfallen, die den Namen
 * des Gebindegrössen-Felds überhaupt enthält — auch in einer harmlosen
 * Zuweisung. Ausgelassen wird nur die Literangabe, deren Decimal sich nicht über
 * die Grenze zur Client-Komponente serialisieren liesse.
 */

import { notFound } from 'next/navigation'

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'
import type { Abweichungseingabe, Leergutzeile, PruefPosition } from '@/lib/wareneingang'

import { Pruefmaske } from './pruefmaske'

export default async function Page({ params }: PageProps<'/lieferungen/[id]'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  // Über Id und Betrieb gesucht: eine fremde Lieferung ist damit nicht gefunden.
  const betrieb = await aktuellerBetrieb()
  const lieferung = await prisma.lieferung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: {
      bestellung: true,
      positionen: {
        include: {
          artikel: { omit: { einheitsgroesseLiter: true } },
          abweichungen: true,
          // Der bestellte Artikel kommt mit, damit ein Ersatzartikel beide
          // Seiten zeigen kann: was bestellt war und was ankam.
          bestellposition: { include: { artikel: { omit: { einheitsgroesseLiter: true } } } },
        },
        orderBy: { artikel: { sortierung: 'asc' } },
      },
      leergutpositionen: { orderBy: { bezeichnung: 'asc' } },
    },
  })
  if (lieferung === null) notFound()

  const stamm = await prisma.artikel.findMany({
    where: { betriebId: lieferung.betriebId, aktiv: true },
    omit: { einheitsgroesseLiter: true },
    orderBy: { sortierung: 'asc' },
  })

  const positionen: PruefPosition[] = lieferung.positionen.map((position) => {
    const bestellt = position.bestellposition
    return {
      id: position.id,
      artikel: position.artikel,
      bestellt: bestellt?.anzahlGebinde.toString() ?? null,
      bestellpositionId: position.bestellpositionId,
      // Nur füllen, wenn tatsächlich ein anderer Artikel geliefert wurde —
      // sonst stünde bei jeder Zeile mit Bestellbezug ein "Ersatz" im Weg.
      bestellterArtikel:
        bestellt === undefined || bestellt === null || bestellt.artikelId === position.artikelId
          ? null
          : {
              id: bestellt.artikel.id,
              name: bestellt.artikel.name,
              lieferGebindeText: bestellt.artikel.lieferGebindeText,
            },
      lieferschein: position.anzahlGebindeLieferschein.toString(),
      tatsaechlich: position.anzahlGebindeTatsaechlich.toString(),
      ekPreisCentLieferschein: position.ekPreisCentLieferschein,
      nachlieferungZugesagtBis:
        position.nachlieferungZugesagtBis?.toISOString().slice(0, 10) ?? null,
      abweichungen: position.abweichungen.map(
        (abweichung): Abweichungseingabe => ({
          art: abweichung.art,
          anzahlGebinde: abweichung.anzahlGebinde.toString(),
        }),
      ),
    }
  })

  const leergut: Leergutzeile[] = lieferung.leergutpositionen.map((zeile) => ({
    id: zeile.id,
    bezeichnung: zeile.bezeichnung,
    lieferschein: zeile.anzahlLieferschein.toString(),
    tatsaechlich: zeile.anzahlTatsaechlich.toString(),
    pfandCentJeEinheit: zeile.pfandCentJeEinheit,
  }))

  return (
    <Pruefmaske
      lieferungId={lieferung.id}
      lieferant={lieferung.lieferant}
      belegNr={lieferung.belegNr}
      datum={lieferung.datum.toISOString().slice(0, 10)}
      geprueft={lieferung.geprueftAm !== null}
      fahrerName={lieferung.fahrerName}
      mitBestellung={lieferung.bestellung !== null}
      positionen={positionen}
      leergut={leergut}
      stamm={stamm}
    />
  )
}
