/**
 * Lädt eine Lieferung mit ihren Positionen und dem Artikelstamm für die
 * Erfassungsmaske — die Ersterfassung am Lieferschein entlang.
 *
 * Dasselbe Muster wie die Prüfmaske nebenan: der Artikelstamm kommt vollständig
 * mit, gesucht wird auf dem Gerät. Ein Unterschied: die Literangabe geht als
 * Text mit, weil die Erfassung Fässer in Litern ableitet ("3 Fässer =
 * 90,0 Liter") und Prismas Decimal die Grenze zur Client-Komponente nicht
 * überquert.
 *
 * Eine bestätigte Lieferung leitet zur Prüfmaske weiter: die API nimmt für sie
 * nichts mehr an, und eine Maske, deren Eingaben nirgends ankommen, wäre eine
 * Falle.
 */

import { notFound, redirect } from 'next/navigation'

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'
import type { Abweichungseingabe, ErfassungsArtikel, ErfassungsPosition } from '@/lib/wareneingang'

import { Erfassungsmaske } from './erfassungsmaske'

/** Der Artikel, wie ihn die Maske braucht: ganze Zeile, Literangabe als Text. */
function alsErfassungsArtikel<A extends { einheitsgroesseLiter: { toString(): string } }>(
  artikel: A,
): Omit<A, 'einheitsgroesseLiter'> & { einheitsgroesseLiter: string } {
  return { ...artikel, einheitsgroesseLiter: artikel.einheitsgroesseLiter.toString() }
}

export default async function Page({ params }: PageProps<'/lieferungen/[id]/erfassen'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  // Über Id und Betrieb gesucht: eine fremde Lieferung ist damit nicht gefunden.
  const betrieb = await aktuellerBetrieb()
  const lieferung = await prisma.lieferung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: {
      positionen: {
        include: {
          artikel: true,
          abweichungen: true,
          bestellposition: { include: { artikel: { omit: { einheitsgroesseLiter: true } } } },
        },
        // Nach der Id, nicht nach der Zählreihenfolge: die Ids sind zeitlich
        // sortiert (UUIDv7), und die Erfassung soll die Zeilen so zeigen, wie
        // sie am Lieferschein entlang eingetippt wurden.
        orderBy: { id: 'asc' },
      },
    },
  })
  if (lieferung === null) notFound()
  if (lieferung.geprueftAm !== null) redirect(`/lieferungen/${id}`)

  const stammRoh = await prisma.artikel.findMany({
    where: { betriebId: lieferung.betriebId, aktiv: true },
    orderBy: { sortierung: 'asc' },
  })
  const stamm: ErfassungsArtikel[] = stammRoh.map(alsErfassungsArtikel)

  const positionen: ErfassungsPosition[] = lieferung.positionen.map((position) => {
    const bestellt = position.bestellposition
    return {
      id: position.id,
      artikel: alsErfassungsArtikel(position.artikel),
      bestellt: bestellt?.anzahlGebinde.toString() ?? null,
      bestellpositionId: position.bestellpositionId,
      bestellterArtikel:
        bestellt === null || bestellt.artikelId === position.artikelId
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

  return (
    <Erfassungsmaske
      lieferungId={lieferung.id}
      lieferant={lieferung.lieferant}
      belegNr={lieferung.belegNr}
      datum={lieferung.datum.toISOString().slice(0, 10)}
      positionen={positionen}
      stamm={stamm}
    />
  )
}
