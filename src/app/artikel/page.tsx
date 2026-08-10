/**
 * Der Artikelstamm: 99 Artikel, gepflegt am Laptop, gelesen im Lager.
 *
 * Der Server lädt die Zeilen und bildet sie über src/lib/artikelstamm.ts auf
 * fertige Texte ab — Decimal-Mengen und die Gebindegrösse bleiben auf dem
 * Server, die Liste filtert und zeigt nur. Suche und Filter laufen im Client
 * über die volle Liste: bei 99 Artikeln ist jede Blätterei nur im Weg.
 *
 * Sortiert wird nach Sortiernummer — dem Laufweg durch das Lager. Stillgelegte
 * Artikel bleiben in der Liste sichtbar: gelöscht wird hier nie, an jedem
 * Artikel hängen Zählungen und Lieferungen.
 */

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { alsListenzeile, kategorien } from '@/lib/artikelstamm'
import { prisma } from '@/lib/prisma'

import { Artikelliste } from './liste'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const betrieb = await aktuellerBetrieb()

  const artikel = await prisma.artikel.findMany({
    where: { betriebId: betrieb.id },
    orderBy: { sortierung: 'asc' },
  })
  const zeilen = artikel.map(alsListenzeile)

  return <Artikelliste zeilen={zeilen} alleKategorien={kategorien(zeilen)} />
}
