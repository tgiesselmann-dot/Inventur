/**
 * Einen neuen Artikel anlegen: dieselbe Maske wie das Bearbeiten, mit leeren
 * Vorgaben. Nach dem Speichern führt die Aktion auf die neue Detailseite.
 */

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { NEUER_ARTIKEL, kategorien } from '@/lib/artikelstamm'
import { prisma } from '@/lib/prisma'

import { Artikelformular } from '../formular'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { betrieb } = await pflichtBetriebsleiter()
  const alle = await prisma.artikel.findMany({
    where: { betriebId: betrieb.id },
    orderBy: { sortierung: 'asc' },
    select: { kategorie: true },
  })

  return <Artikelformular werte={NEUER_ARTIKEL} kategorien={kategorien(alle)} />
}
