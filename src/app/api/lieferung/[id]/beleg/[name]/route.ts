/**
 * Liefert einen Beleg der Lieferung aus: das Foto des Lieferscheins oder die
 * Unterschrift des Fahrers. Gebraucht von der Nachverfolgung einer Abweichung
 * — dort stehen beide neben dem Betrag, denn sie sind der Grund, warum die
 * Reklamation Bestand hat.
 *
 * Der Bucket ist privat und bleibt es: das Bild geht durch diesen Handler,
 * nicht über eine signierte URL, deren Laufzeit irgendwo verwaltet werden
 * müsste. Gelesen wird der in der Datenbank hinterlegte Pfad — nicht ein aus
 * der URL gebauter, sonst wäre die Route ein Durchgriff auf den Bucket.
 */

import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'
import { belegLaden } from '@/lib/supabase/storage'

export async function GET(_: Request, ctx: RouteContext<'/api/lieferung/[id]/beleg/[name]'>) {
  const { id, name } = await ctx.params

  if (name !== 'lieferschein' && name !== 'unterschrift') {
    return new Response('Unbekannter Beleg', { status: 404 })
  }

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) return new Response('Nicht angemeldet', { status: 401 })

  // Der Betrieb steht in der Bedingung, nicht in einer Prüfung danach: sonst
  // wäre diese Route ein Weg, an das Papier eines fremden Betriebs zu kommen.
  const lieferung = await prisma.lieferung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
    select: { lieferscheinBildPfad: true, unterschriftBildPfad: true },
  })
  if (lieferung === null) return new Response('Lieferung nicht gefunden', { status: 404 })

  const pfad =
    name === 'lieferschein' ? lieferung.lieferscheinBildPfad : lieferung.unterschriftBildPfad
  if (pfad === null) return new Response('Kein Beleg hinterlegt', { status: 404 })

  const beleg = await belegLaden(pfad)
  if (beleg === null) return new Response('Beleg nicht im Speicher', { status: 404 })

  return new Response(beleg, {
    headers: {
      'Content-Type': beleg.type === '' ? 'application/octet-stream' : beleg.type,
      // Kurz statt lange: ein ersetzter Beleg behält seinen Pfad, ein Browser
      // mit Tagescache zeigte dann das alte Papier.
      'Cache-Control': 'private, max-age=300',
    },
  })
}
