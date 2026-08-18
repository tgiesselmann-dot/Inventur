/**
 * Die Detailseite eines Artikels.
 *
 * Der Server bildet den Datensatz über src/lib/artikelstamm.ts auf Eingabetexte
 * ab — Decimal-Mengen und die Gebindegrösse bleiben auf dem Server, die Maske
 * bekommt deutsche Schreibweise ("0,33") und zeigt sie nur.
 */

import { notFound } from 'next/navigation'

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { alsFormularwerte, kategorien } from '@/lib/artikelstamm'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'

import { Artikelformular } from '../formular'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  // Über Id und Betrieb gesucht: ein fremder Artikel ist damit schlicht nicht
  // gefunden — dieselbe Antwort wie für eine erfundene Kennung.
  const { betrieb } = await pflichtBetriebsleiter()
  const artikel = await prisma.artikel.findFirst({ where: { id, betriebId: betrieb.id } })
  if (artikel === null) notFound()

  const alle = await prisma.artikel.findMany({
    where: { betriebId: artikel.betriebId },
    orderBy: { sortierung: 'asc' },
    select: { kategorie: true },
  })

  return (
    <Artikelformular
      werte={alsFormularwerte(artikel)}
      artikelId={artikel.id}
      kategorien={kategorien(alle)}
    />
  )
}
