/**
 * Bestätigt den Wareneingang: ab hier gilt die Lieferung als geprüft.
 *
 * Der Abschluss ist die Stelle, an der die tatsächlich angenommenen Mengen
 * bestandswirksam werden. Deshalb prüft er noch einmal, was die Maske und die
 * Positions-Route schon geprüft haben — die Aufschlüsselung jeder Zeile muss zur
 * Mengendifferenz passen. Was hier durchgeht, taucht sonst später als
 * unerklärter Schwund auf, und dann findet niemand mehr die Ursache.
 *
 * Der Rumpf kommt als FormData, nicht als JSON: neben dem Fahrernamen gehen
 * hier die Belege mit — die Unterschrift des Fahrers und das Foto des
 * Lieferscheins. Bei Abweichungen ist die Unterschrift Pflicht, und zwar
 * gezählt an den gespeicherten Positionen, nicht am Client-Zustand: der Server
 * bestätigt nur, was er selbst belegt sieht.
 *
 * Die Uploads laufen vor dem Update. Scheitert einer, bleibt die Lieferung
 * unbestätigt (502) — ein bestätigter Wareneingang, dessen Unterschrift nie
 * ankam, wäre bei der Reklamation wertlos, und niemand wüsste es.
 *
 * Ein zweiter Abschluss wird mit 409 abgewiesen, nicht still übergangen: die
 * Kontrolle ist ein Vorgang mit Zeitpunkt, kein Schalter.
 */

import type { NextRequest } from 'next/server'

import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'
import { belegHochladen, belegpfad } from '@/lib/supabase/storage'
import { luecke, stimmig, zeilenstand } from '@/lib/wareneingang'

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/lieferung/[id]/abschluss'>,
) {
  const { id } = await ctx.params

  // Der Fahrername ist ein Belegtext vom Lieferschein, kein Benutzer dieses
  // Systems. Fehlt er, wird der Wareneingang trotzdem bestätigt — an der Rampe
  // ist der Fahrer manchmal schon weg.
  let fahrerName: string | null = null
  let unterschrift: File | null = null
  let foto: File | null = null
  try {
    const rumpf = await request.formData()

    const name = rumpf.get('fahrerName')
    if (typeof name === 'string' && name.trim() !== '') fahrerName = name.trim()

    const unterschriftRoh = rumpf.get('unterschrift')
    if (unterschriftRoh instanceof File && unterschriftRoh.size > 0) {
      unterschrift = unterschriftRoh
    }
    const fotoRoh = rumpf.get('foto')
    if (fotoRoh instanceof File && fotoRoh.size > 0) foto = fotoRoh
  } catch {
    // Ein leerer Rumpf ist zulässig — dann ohne Namen und ohne Belege.
  }

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  // Über Id und Betrieb gesucht: eine fremde Lieferung ist damit nicht gefunden.
  const lieferung = await prisma.lieferung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
    include: { positionen: { include: { abweichungen: true, artikel: true } } },
  })

  if (lieferung === null) {
    return Response.json({ fehler: 'Lieferung nicht gefunden' }, { status: 404 })
  }
  if (lieferung.geprueftAm !== null) {
    return Response.json(
      { fehler: 'Dieser Wareneingang ist bereits bestätigt' },
      { status: 409 },
    )
  }
  if (lieferung.positionen.length === 0) {
    return Response.json(
      { fehler: 'Diese Lieferung hat noch keine Positionen' },
      { status: 409 },
    )
  }

  const staende = lieferung.positionen.map((position) => ({
    name: position.artikel.name,
    stand: {
      lieferschein: position.anzahlGebindeLieferschein.toString(),
      tatsaechlich: position.anzahlGebindeTatsaechlich.toString(),
      abweichungen: position.abweichungen.map((abweichung) => ({
        art: abweichung.art,
        anzahlGebinde: abweichung.anzahlGebinde.toString(),
      })),
    },
  }))

  const unstimmig = staende.filter((eintrag) => !stimmig(eintrag.stand))
  if (unstimmig.length > 0) {
    return Response.json(
      {
        fehler: 'Bei diesen Positionen erklären die Abweichungen die Mengendifferenz nicht',
        positionen: unstimmig.map((eintrag) => ({
          name: eintrag.name,
          offen: luecke(eintrag.stand).toString(),
        })),
      },
      { status: 409 },
    )
  }

  // Abweichungen gegen den Lieferschein muss der Fahrer gegenzeichnen, sonst
  // ist der Anspruch weg. Gezählt an den gespeicherten Mengen: was der Client
  // zu schicken vergass, zählt trotzdem.
  const abweichende = staende.filter((eintrag) => zeilenstand(eintrag.stand) !== 'stimmt').length
  if (abweichende > 0 && unterschrift === null) {
    return Response.json({ fehler: 'Unterschrift des Fahrers fehlt' }, { status: 400 })
  }

  let unterschriftPfad: string | undefined
  let fotoPfad: string | undefined
  try {
    if (unterschrift !== null) {
      unterschriftPfad = belegpfad(lieferung.betriebId, lieferung.id, 'unterschrift.png')
      await belegHochladen(unterschriftPfad, unterschrift, 'image/png')
    }
    if (foto !== null) {
      fotoPfad = belegpfad(lieferung.betriebId, lieferung.id, 'lieferschein.jpg')
      await belegHochladen(fotoPfad, foto, 'image/jpeg')
    }
  } catch (ursache) {
    const meldung = ursache instanceof Error ? ursache.message : String(ursache)
    return Response.json({ fehler: meldung }, { status: 502 })
  }

  // Wer geprüft hat, steht jetzt an der Lieferung: bei einer Reklamation Wochen
  // später ist das die Person, die an der Rampe stand — die einzige, die noch
  // weiss, wie die Palette aussah.
  //
  // Die Pfadfelder werden nur gesetzt, wenn eine Datei mitkam: `undefined`
  // lässt Prisma die Spalte in Ruhe, ein `null` würde einen früher abgelegten
  // Beleg aus der Lieferung streichen, ohne ihn zu löschen.
  const bestaetigt = await prisma.lieferung.update({
    where: { id },
    data: {
      geprueftAm: new Date(),
      geprueftVonId: benutzer.benutzerId,
      fahrerName,
      unterschriftBildPfad: unterschriftPfad,
      lieferscheinBildPfad: fotoPfad,
    },
  })

  return Response.json({ geprueftAm: bestaetigt.geprueftAm })
}
