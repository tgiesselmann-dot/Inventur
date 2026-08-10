/**
 * Meldet ein Lager innerhalb einer Zählung als fertig gezählt.
 *
 * Die Meldung ist eine Aussage des Zählers und keine Rechnung: „ich bin hier
 * durch". Sie verlangt deshalb nicht, dass jeder Artikel des Stamms an diesem
 * Ort einen Wert hat — an der Theke stehen vierzig der neunundneunzig Artikel,
 * und für die übrigen eine Null zu tippen wäre keine Zählung, sondern eine
 * Beschäftigung.
 *
 * Was sie trägt, ist die Unterscheidung, ohne die die ganze Trennung nach Orten
 * nichts brächte: ein Lager, in dem nichts steht, gegenüber einem Lager, in das
 * niemand gegangen ist. In der Schwundrechnung sehen beide gleich aus.
 *
 * Ein zweiter Aufruf ändert nichts und meldet Erfolg — nach einer verlorenen
 * Antwort tippt jeder ein zweites Mal, und das darf nicht wie ein Fehler
 * aussehen. Der Zeitpunkt der ersten Meldung bleibt dabei stehen.
 */

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: Request,
  ctx: RouteContext<'/api/zaehlung/[id]/lager/[ort]/fertig'>,
) {
  const { id, ort } = await ctx.params
  if (!istKennung(id) || !istKennung(ort)) {
    return Response.json({ fehler: 'Ungültige Kennung' }, { status: 400 })
  }

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit schlicht nicht
  // gefunden — dieselbe Antwort wie für eine erfundene Id.
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
  })
  if (zaehlung === null) {
    return Response.json({ fehler: 'Zählung nicht gefunden' }, { status: 404 })
  }
  if (zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN) {
    return Response.json(
      { fehler: 'Zählung ist abgeschlossen und nimmt keine Meldung mehr an' },
      { status: 409 },
    )
  }

  const lagerort = await prisma.lagerort.findFirst({
    where: { id: ort, betriebId: benutzer.betrieb.id },
  })
  if (lagerort === null) {
    return Response.json({ fehler: 'Lager nicht gefunden' }, { status: 404 })
  }

  // Upsert statt Update: ein Lager, in dem nichts steht, hat noch keinen
  // Abschnitt — und gerade dessen Meldung ist die wichtige. Ohne sie liesse
  // sich „leer" nicht von „nicht betreten" unterscheiden.
  const abschnitt = await prisma.zaehlabschnitt.upsert({
    where: { zaehlungId_lagerortId: { zaehlungId: id, lagerortId: ort } },
    update: {},
    create: {
      betriebId: zaehlung.betriebId,
      zaehlungId: id,
      lagerortId: ort,
      begonnenVonId: benutzer.benutzerId,
    },
  })

  // Der Zeitpunkt der ersten Meldung bleibt stehen: ein zweiter Klick nach
  // einer verlorenen Antwort soll die Uhr nicht neu stellen.
  if (abschnitt.fertigAm === null) {
    await prisma.zaehlabschnitt.update({
      where: { id: abschnitt.id },
      data: { fertigAm: new Date(), fertigVonId: benutzer.benutzerId },
    })
  }

  return Response.json({ fertig: true })
}
