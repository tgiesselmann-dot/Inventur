/**
 * Nimmt die gezählten Werte einer Zählung entgegen — im Stapel, nicht einzeln.
 *
 * Nach einem Abend im Flugmodus liegen bis zu 99 Werte auf dem Gerät. Die gehen
 * in einer Anfrage und einer Transaktion zum Server: 99 einzelne Aufrufe über
 * eine gerade wiedergefundene Mobilverbindung wären 99 Gelegenheiten, auf
 * halber Strecke liegenzubleiben.
 *
 * Idempotent über die Unique-Constraint (zaehlungId, artikelId). Ein Stapel,
 * der wegen eines Verbindungsabbruchs zweimal ankommt, hinterlässt denselben
 * Stand — der Client darf beliebig oft wiederholen.
 *
 * `betriebId` kommt aus der Zählung, nie aus dem Request. Ein Client, der eine
 * fremde betriebId mitschickt, soll damit nichts erreichen können.
 */

import type { NextRequest } from 'next/server'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { EinheitenFehler, gesamtEinheiten } from '@/lib/einheiten'
import { prisma } from '@/lib/prisma'

type Position = {
  artikelId: string
  anzahlGebinde: string
  anzahlEinzeln: string
  gezaehltAm: string
}

/** Prüft die Form des Rumpfs, bevor irgendetwas die Datenbank sieht. */
function lesePositionen(rumpf: unknown): Position[] {
  if (typeof rumpf !== 'object' || rumpf === null || !('positionen' in rumpf)) {
    throw new Error('Rumpf ohne Feld "positionen"')
  }
  const roh = (rumpf as { positionen: unknown }).positionen
  if (!Array.isArray(roh)) throw new Error('"positionen" muss eine Liste sein')

  return roh.map((eintrag, index) => {
    if (typeof eintrag !== 'object' || eintrag === null) {
      throw new Error(`Position ${index} ist kein Objekt`)
    }
    const { artikelId, anzahlGebinde, anzahlEinzeln, gezaehltAm } = eintrag as Record<
      string,
      unknown
    >
    if (typeof artikelId !== 'string' || artikelId === '') {
      throw new Error(`Position ${index} ohne artikelId`)
    }
    if (typeof anzahlGebinde !== 'string' || typeof anzahlEinzeln !== 'string') {
      throw new Error(`Position ${index} (${artikelId}): Mengen müssen Text sein`)
    }
    // Der Zeitpunkt kommt vom Gerät, nicht vom Server: ein Wert, der drei
    // Stunden im Flugmodus lag, ist am Abend gezählt worden und nicht in dem
    // Moment, in dem das Netz wiederkam.
    if (typeof gezaehltAm !== 'string' || Number.isNaN(Date.parse(gezaehltAm))) {
      throw new Error(`Position ${index} (${artikelId}): gezaehltAm ist kein Zeitpunkt`)
    }
    return { artikelId, anzahlGebinde, anzahlEinzeln, gezaehltAm }
  })
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/zaehlung/[id]/positionen'>) {
  const { id } = await ctx.params

  let positionen: Position[]
  try {
    positionen = lesePositionen(await request.json())
  } catch (ursache) {
    const meldung = ursache instanceof Error ? ursache.message : String(ursache)
    return Response.json({ fehler: meldung }, { status: 400 })
  }

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit nicht gefunden.
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
  })
  if (zaehlung === null) {
    return Response.json({ fehler: 'Zählung nicht gefunden' }, { status: 404 })
  }
  if (zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN) {
    return Response.json(
      { fehler: 'Zählung ist abgeschlossen und nimmt keine Werte mehr an' },
      { status: 409 },
    )
  }

  if (positionen.length === 0) {
    return Response.json({ gespeichert: [] })
  }

  // Ohne `select`, damit der Feldname der Gebindegrösse in dieser Datei nicht
  // vorkommt — die Umrechnung gehört nach src/lib/einheiten.ts und der Wächter
  // in tests/einheiten.test.ts prüft das über den blossen Namen.
  const artikel = await prisma.artikel.findMany({
    where: { betriebId: zaehlung.betriebId, id: { in: positionen.map((p) => p.artikelId) } },
    omit: { ekPreisCent: true, ekPreisBezug: true },
  })
  const bekannt = new Map(artikel.map((eintrag) => [eintrag.id, eintrag]))

  // Erst alles prüfen, dann alles schreiben. Ein halb angenommener Stapel
  // wäre für den Client nicht von einem ganz abgelehnten zu unterscheiden.
  for (const position of positionen) {
    const eintrag = bekannt.get(position.artikelId)
    if (eintrag === undefined) {
      return Response.json(
        { fehler: `Artikel ${position.artikelId} gehört nicht zu diesem Betrieb` },
        { status: 400 },
      )
    }
    try {
      // Der Rückgabewert interessiert hier nicht — der Aufruf prüft, dass die
      // Mengen zum Zählmodus passen. Ein Wert am modusfremden Feld ist eine
      // Fehlerfassung und soll nicht still im Bestand landen.
      gesamtEinheiten(eintrag, position.anzahlGebinde, position.anzahlEinzeln)
    } catch (ursache) {
      if (ursache instanceof EinheitenFehler) {
        return Response.json(
          { fehler: `${eintrag.name}: ${ursache.message}` },
          { status: 400 },
        )
      }
      throw ursache
    }
  }

  await prisma.$transaction(
    positionen.map((position) =>
      prisma.zaehlposition.upsert({
        where: {
          zaehlungId_artikelId: { zaehlungId: id, artikelId: position.artikelId },
        },
        update: {
          anzahlGebinde: position.anzahlGebinde,
          anzahlEinzeln: position.anzahlEinzeln,
          gezaehltAm: position.gezaehltAm,
        },
        create: {
          betriebId: zaehlung.betriebId,
          zaehlungId: id,
          artikelId: position.artikelId,
          anzahlGebinde: position.anzahlGebinde,
          anzahlEinzeln: position.anzahlEinzeln,
          gezaehltAm: position.gezaehltAm,
        },
      }),
    ),
  )

  return Response.json({ gespeichert: positionen.map((position) => position.artikelId) })
}
