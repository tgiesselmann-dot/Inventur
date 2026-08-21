/**
 * Schliesst eine Zählung ab — aber nur, wenn zwei Bedingungen erfüllt sind.
 *
 * Erstens: jedes aktive Lager ist fertig gemeldet. Ein Lager, in das niemand
 * gegangen ist, sieht in der Schwundrechnung aus wie eines, aus dem die Ware
 * verschwunden ist; die Meldung ist die einzige Stelle, an der diese beiden
 * Fälle auseinandergehen. Es gibt bewusst keinen Weg daran vorbei — kein
 * „überspringen", kein Durchwinken mit Warnung.
 *
 * Zweitens: jeder aktive Artikel hat *irgendwo* einen Wert. Nicht an jedem Ort —
 * eine Cola, die nur an der Theke steht, soll in drei anderen Lagern keine Null
 * brauchen. Aber ein Artikel, den niemand irgendwo gezählt hat, ist eine Lücke,
 * die in der Auswertung wie ein Bestand von null aussähe.
 *
 * Die Prüfung steht hier und nicht nur in der Maske. Der Client prüft ebenfalls,
 * damit der Zähler die Lücken sieht, ohne auf eine Antwort zu warten; das ist
 * Bequemlichkeit. Verlassen darf sich darauf niemand: die Maske kann mit einem
 * veralteten Artikelstamm arbeiten, wenn zwischendurch ein Artikel aktiviert
 * wurde.
 *
 * Stillgelegte Artikel und stillgelegte Lager werden nicht verlangt. Sie stehen
 * nicht mehr im Betrieb, ihre alten Zählungen bleiben aber erhalten.
 */

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'

export async function POST(_request: Request, ctx: RouteContext<'/api/zaehlung/[id]/abschluss'>) {
  const { id } = await ctx.params

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit schlicht nicht
  // gefunden — dieselbe Antwort wie für eine erfundene Id, und keine Auskunft
  // darüber, welche Ids es anderswo gibt.
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
  })
  if (zaehlung === null) {
    return Response.json({ fehler: 'Zählung nicht gefunden' }, { status: 404 })
  }
  if (zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN) {
    // Kein Fehler: ein zweiter Klick nach einer verlorenen Antwort soll nicht
    // wie ein Problem aussehen.
    return Response.json({ status: ZaehlungStatus.ABGESCHLOSSEN, fehlend: [], offeneLager: [] })
  }
  if (zaehlung.status === ZaehlungStatus.VERWORFEN) {
    // Wohl aber hier: ein Abschluss würde den Fehlstart zum Anfangsbestand
    // der nächsten Auswertung machen.
    return Response.json({ fehler: 'Zählung wurde verworfen' }, { status: 409 })
  }

  const [offeneLager, fehlend] = await Promise.all([
    // Jedes aktive Lager ohne Fertigmeldung — auch die, für die es noch gar
    // keinen Abschnitt gibt, weil dort niemand war. Genau die sind gemeint.
    prisma.lagerort.findMany({
      where: {
        betriebId: zaehlung.betriebId,
        aktiv: true,
        abschnitte: { none: { zaehlungId: id, fertigAm: { not: null } } },
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    }),
    // Artikel ohne Wert an *irgendeinem* Ort dieser Zählung.
    prisma.artikel.findMany({
      where: {
        betriebId: zaehlung.betriebId,
        aktiv: true,
        zaehlpositionen: { none: { zaehlungId: id } },
      },
      select: { id: true, name: true, kategorie: true, lieferGebindeText: true, sortierung: true },
      orderBy: { sortierung: 'asc' },
    }),
  ])

  if (offeneLager.length > 0) {
    return Response.json(
      { fehler: 'Es sind noch nicht alle Lager fertig gemeldet', offeneLager, fehlend },
      { status: 409 },
    )
  }

  if (fehlend.length > 0) {
    return Response.json(
      { fehler: 'Es fehlen noch Werte', fehlend, offeneLager: [] },
      { status: 409 },
    )
  }

  await prisma.zaehlung.update({
    where: { id },
    data: { status: ZaehlungStatus.ABGESCHLOSSEN },
  })

  return Response.json({ status: ZaehlungStatus.ABGESCHLOSSEN, fehlend: [], offeneLager: [] })
}
