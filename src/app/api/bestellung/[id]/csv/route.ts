/**
 * Die Bestellung als CSV — für den Lieferanten, der sie in seine Maske einliest,
 * und für das Büro, das sie in eine Tabelle legt.
 *
 * Semikolon, CRLF und ein BOM: die Datei landet in deutschem Excel, und ohne BOM
 * steht dort „DÃ¶rlemann". Geschrieben wird sie von `alsCsv` aus src/lib/csv.ts,
 * derselben Datei, die die Eingangsdateien liest.
 *
 * Mengen und Beträge stehen mit Dezimalkomma, weil sie in dieser Datei gelesen
 * und nicht weitergerechnet werden. Der Betrag je Gebinde kommt aus
 * `wertGebindeCent` — auch hier wird Geld nicht ein zweites Mal ausgerechnet.
 */

import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { alsCsv } from '@/lib/csv'
import { alsDatumstext } from '@/lib/datum'
import { wertGebindeCent } from '@/lib/einheiten'
import { prisma } from '@/lib/prisma'
import { alsPreiseingabe } from '@/lib/wareneingang'
import { alsEingabe } from '@/lib/zaehlung'

export async function GET(_request: Request, ctx: RouteContext<'/api/bestellung/[id]/csv'>) {
  const { id } = await ctx.params

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  const bestellung = await prisma.bestellung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
    include: {
      positionen: {
        include: { artikel: { omit: { einheitsgroesseLiter: true } } },
        orderBy: [{ artikel: { kategorie: 'asc' } }, { artikel: { sortierung: 'asc' } }],
      },
    },
  })

  if (bestellung === null) {
    return Response.json({ fehler: 'Bestellung nicht gefunden' }, { status: 404 })
  }

  const zeilen: string[][] = [
    ['Kategorie', 'Artikel', 'Gebinde', 'Bestellmenge', 'Preis je Gebinde', 'Positionswert'],
    ...bestellung.positionen.map((position) => [
      position.artikel.kategorie,
      position.artikel.name,
      position.artikel.lieferGebindeText,
      alsEingabe(position.anzahlGebinde.toString()),
      alsPreiseingabe(wertGebindeCent(position.artikel, 1)),
      alsPreiseingabe(wertGebindeCent(position.artikel, position.anzahlGebinde)),
    ]),
  ]

  const datum = alsDatumstext(bestellung.datum).split('.').reverse().join('-')
  const dateiname = `Bestellung_${bestellung.lieferant.replace(/[^\p{L}\p{N}]+/gu, '_')}_${datum}.csv`
  // Zwei Angaben, weil "Dörlemann" im einfachen filename-Parameter nichts zu
  // suchen hat: dort steht eine ASCII-Fassung für alte Browser, der Umlaut geht
  // prozentkodiert über filename* (RFC 6266). Ohne das heisst die Datei beim
  // Herunterladen "Bestellung_DÃ¶rlemann".
  const ascii = dateiname.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')

  return new Response(alsCsv(zeilen), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`,
      // Eine Bestellung ändert sich, solange sie ein Entwurf ist — eine
      // zwischengespeicherte Datei wäre die von gestern.
      'cache-control': 'no-store',
    },
  })
}
