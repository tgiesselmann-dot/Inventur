/**
 * Schliesst eine Zählung ab — aber nur, wenn jeder aktive Artikel einen Wert
 * hat.
 *
 * Die Prüfung steht hier und nicht nur in der Maske. Der Client prüft ebenfalls,
 * damit der Zähler die Lücken sieht, ohne auf eine Antwort zu warten; das ist
 * Bequemlichkeit. Verlassen darf sich darauf niemand: die Maske kann mit einem
 * veralteten Artikelstamm arbeiten, wenn zwischendurch ein Artikel aktiviert
 * wurde, und eine unvollständige Zählung fällt sonst erst in der Auswertung auf,
 * wo die fehlende Zeile wie ein Bestand von null aussieht.
 *
 * Stillgelegte Artikel (aktiv = false) werden nicht verlangt. Sie stehen nicht
 * mehr im Lager, ihre alten Zählungen bleiben aber erhalten.
 */

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

export async function POST(_request: Request, ctx: RouteContext<'/api/zaehlung/[id]/abschluss'>) {
  const { id } = await ctx.params

  const zaehlung = await prisma.zaehlung.findUnique({ where: { id } })
  if (zaehlung === null) {
    return Response.json({ fehler: 'Zählung nicht gefunden' }, { status: 404 })
  }
  if (zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN) {
    // Kein Fehler: ein zweiter Klick nach einer verlorenen Antwort soll nicht
    // wie ein Problem aussehen.
    return Response.json({ status: ZaehlungStatus.ABGESCHLOSSEN, fehlend: [] })
  }

  const fehlend = await prisma.artikel.findMany({
    where: {
      betriebId: zaehlung.betriebId,
      aktiv: true,
      zaehlpositionen: { none: { zaehlungId: id } },
    },
    select: { id: true, name: true, kategorie: true, lieferGebindeText: true, sortierung: true },
    orderBy: { sortierung: 'asc' },
  })

  if (fehlend.length > 0) {
    return Response.json({ fehler: 'Es fehlen noch Werte', fehlend }, { status: 409 })
  }

  await prisma.zaehlung.update({
    where: { id },
    data: { status: ZaehlungStatus.ABGESCHLOSSEN },
  })

  return Response.json({ status: ZaehlungStatus.ABGESCHLOSSEN, fehlend: [] })
}
