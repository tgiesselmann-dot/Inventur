/**
 * Die Bestellung als ausgefülltes Dörlemann-Formular — die Excel-Datei, die
 * nach dem Gegenchecken per Mail an die Kornbrennerei geht.
 *
 * Gefüllt wird die eingebettete Vorlage (vorlagen/doerlemann-bestellung.xlsx),
 * nicht ein nachgebautes Blatt: das Formular gehört dem Lieferanten, und seine
 * Preise, Abschnitte und Soll-Spalten bleiben unangetastet. Geändert werden
 * genau zwei Dinge — das Bestelldatum im Kopf und die Spalte Bestellmenge, die
 * vorher komplett geleert wird, weil in der Vorlage noch die Mengen der letzten
 * Hand-Bestellung stehen.
 *
 * Welche Menge in welche Zeile gehört, rechnet `formularmengen` in
 * src/lib/doerlemann-formular.ts — mit Test. Hier wird nur geschrieben.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import ExcelJS from 'exceljs'

import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { istBetriebsleiter } from '@/lib/berechtigungen'
import { alsDatumstext } from '@/lib/datum'
import {
  FORMULARZEILEN,
  formularmengen,
  istDoerlemann,
  SPALTE_BESTELLMENGE,
  VORLAGE_BLATT,
  VORLAGE_DATEI,
  ZELLE_BESTELLDATUM,
} from '@/lib/doerlemann-formular'
import { prisma } from '@/lib/prisma'

export async function GET(_request: Request, ctx: RouteContext<'/api/bestellung/[id]/doerlemann'>) {
  const { id } = await ctx.params

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }
  // Bestellungen samt Preisen sind Sache der Betriebsleitung — siehe
  // src/lib/berechtigungen.ts.
  if (!istBetriebsleiter(benutzer.rolle)) {
    return Response.json({ fehler: 'Bestellungen sind der Betriebsleitung vorbehalten' }, { status: 403 })
  }

  const bestellung = await prisma.bestellung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
    include: {
      positionen: {
        include: { artikel: { omit: { einheitsgroesseLiter: true } } },
      },
    },
  })

  if (bestellung === null) {
    return Response.json({ fehler: 'Bestellung nicht gefunden' }, { status: 404 })
  }

  // Für andere Lieferanten wäre die Datei kein Formular, sondern eine
  // Behauptung: leere Dörlemann-Zeilen mit fremdem Datum.
  if (!istDoerlemann(bestellung.lieferant)) {
    return Response.json(
      { fehler: 'Diese Bestellung geht nicht an Dörlemann — das Formular passt nicht' },
      { status: 400 },
    )
  }

  const { mengen } = formularmengen(
    bestellung.positionen.map((position) => ({
      name: position.artikel.name,
      lieferGebindeText: position.artikel.lieferGebindeText,
      anzahlGebinde: Number(position.anzahlGebinde),
    })),
  )

  const mappe = new ExcelJS.Workbook()
  const vorlage = await readFile(path.join(process.cwd(), VORLAGE_DATEI))
  await mappe.xlsx.load(vorlage.buffer as ArrayBuffer)

  const blatt = mappe.getWorksheet(VORLAGE_BLATT)
  if (blatt === undefined) {
    return Response.json({ fehler: `Blatt "${VORLAGE_BLATT}" fehlt in der Vorlage` }, { status: 500 })
  }

  blatt.getCell(ZELLE_BESTELLDATUM).value = `Bestelldatum: ${alsDatumstext(bestellung.datum)}`
  for (const zeile of FORMULARZEILEN) {
    blatt.getCell(zeile.zeile, SPALTE_BESTELLMENGE).value = mengen.get(zeile.zeile) ?? null
  }

  const inhalt = await mappe.xlsx.writeBuffer()

  const dateiname = `Dörlemann Bestellung ${alsDatumstext(bestellung.datum)}.xlsx`
  // Zwei Angaben wie beim CSV-Weg: eine ASCII-Fassung für alte Browser, der
  // Umlaut prozentkodiert über filename* (RFC 6266).
  const ascii = dateiname.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')

  return new Response(inhalt, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`,
      // Die Bestellung ändert sich, solange sie ein Entwurf ist — eine
      // zwischengespeicherte Datei wäre die von gestern.
      'cache-control': 'no-store',
    },
  })
}
