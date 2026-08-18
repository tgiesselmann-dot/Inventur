/**
 * Nimmt die geprüften Positionen einer Lieferung entgegen — im Stapel, nicht
 * einzeln, wie bei der Zählung.
 *
 * Der Server prüft dieselbe Stimmigkeit wie die Maske: die Aufschlüsselung in
 * Fehlmenge, Bruch und Überlieferung muss genau die Differenz zwischen
 * Lieferschein und tatsächlicher Menge ergeben. Eine Position, bei der das nicht
 * aufgeht, ist keine halbe Wahrheit, sondern eine kaputte — sie würde später als
 * unerklärter Schwund auftauchen.
 *
 * Positionen ohne `id` werden angelegt, Positionen mit `id` aktualisiert. Die
 * Antwort nennt zu jeder Zeile ihre Id, damit der Client eine neu angelegte
 * Position beim nächsten Stapel wiederfindet.
 *
 * Die Abweichungen einer Position werden bei jedem Stapel ersetzt, nicht
 * ergänzt: der Client schickt den vollständigen Stand einer Zeile, und zwei
 * Fehlmengen aus zwei Versanden derselben Korrektur wären eine doppelte
 * Reklamation. Vor dem Abschluss trägt eine Abweichung nur ihr Anlege-Ereignis,
 * es geht dabei also kein Verlauf verloren; danach nimmt diese Route nichts mehr
 * an.
 *
 * `betriebId` kommt aus der Lieferung, nie aus dem Request.
 */

import type { NextRequest } from 'next/server'

import { Abweichungsart, Abweichungsstatus } from '@/generated/prisma/enums'
import { angemeldeterBenutzer } from '@/lib/anmeldung'
import { darfPreiseSehen } from '@/lib/berechtigungen'
import { prisma } from '@/lib/prisma'
import { luecke, stimmig, type Abweichungseingabe } from '@/lib/wareneingang'

type Eingang = {
  id: string | null
  artikelId: string
  bestellpositionId: string | null
  lieferschein: string
  tatsaechlich: string
  ekPreisCentLieferschein: number | null
  nachlieferungZugesagtBis: string | null
  abweichungen: Abweichungseingabe[]
}

/** Eine Zeile des Leergut-Blocks, wie sie über die Leitung kommt. */
type Leergut = {
  id: string | null
  bezeichnung: string
  lieferschein: string
  tatsaechlich: string
  pfandCentJeEinheit: number | null
}

const ARTEN = new Set<string>(Object.values(Abweichungsart))

/** Eine Menge, wie sie über die Leitung kommt: Dezimaltext, nie negativ. */
function menge(wert: unknown, feld: string): string {
  if (typeof wert !== 'string' || wert === '' || !/^\d+(\.\d{1,2})?$/.test(wert)) {
    throw new Error(`${feld} ist keine Menge mit höchstens zwei Nachkommastellen: ${String(wert)}`)
  }
  return wert
}

function leseAbweichungen(roh: unknown, index: number): Abweichungseingabe[] {
  if (roh === undefined) return []
  if (!Array.isArray(roh)) throw new Error(`Position ${index}: "abweichungen" muss eine Liste sein`)

  return roh.map((eintrag, stelle) => {
    if (typeof eintrag !== 'object' || eintrag === null) {
      throw new Error(`Position ${index}, Abweichung ${stelle} ist kein Objekt`)
    }
    const { art, anzahlGebinde } = eintrag as Record<string, unknown>
    if (typeof art !== 'string' || !ARTEN.has(art)) {
      throw new Error(`Position ${index}, Abweichung ${stelle}: unbekannte Art ${String(art)}`)
    }
    return {
      art: art as Abweichungsart,
      anzahlGebinde: menge(anzahlGebinde, `Position ${index}, Abweichung ${stelle}`),
    }
  })
}

/** Ein Betrag in Cent: ganze Zahl, nie negativ. `null` bleibt `null`. */
function cent(wert: unknown, feld: string): number | null {
  if (wert === null || wert === undefined) return null
  if (typeof wert !== 'number' || !Number.isInteger(wert) || wert < 0) {
    throw new Error(`${feld} muss eine ganze Zahl in Cent >= 0 sein: ${String(wert)}`)
  }
  return wert
}

/** Ein reines Datum als ISO-Text. `null` bleibt `null`. */
function datum(wert: unknown, feld: string): string | null {
  if (wert === null || wert === undefined || wert === '') return null
  if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    throw new Error(`${feld} muss ein Datum der Form JJJJ-MM-TT sein: ${String(wert)}`)
  }
  return wert
}

/** Prüft die Form des Rumpfs, bevor irgendetwas die Datenbank sieht. */
function lesePositionen(rumpf: unknown): Eingang[] {
  if (typeof rumpf !== 'object' || rumpf === null || !('positionen' in rumpf)) {
    throw new Error('Rumpf ohne Feld "positionen"')
  }
  const roh = (rumpf as { positionen: unknown }).positionen
  if (!Array.isArray(roh)) throw new Error('"positionen" muss eine Liste sein')

  return roh.map((eintrag, index) => {
    if (typeof eintrag !== 'object' || eintrag === null) {
      throw new Error(`Position ${index} ist kein Objekt`)
    }
    const {
      id,
      artikelId,
      bestellpositionId,
      lieferschein,
      tatsaechlich,
      ekPreisCentLieferschein,
      nachlieferungZugesagtBis,
      abweichungen,
    } = eintrag as Record<string, unknown>

    if (typeof artikelId !== 'string' || artikelId === '') {
      throw new Error(`Position ${index} ohne artikelId`)
    }
    if (id !== null && id !== undefined && typeof id !== 'string') {
      throw new Error(`Position ${index}: id muss Text oder null sein`)
    }
    if (
      bestellpositionId !== null &&
      bestellpositionId !== undefined &&
      typeof bestellpositionId !== 'string'
    ) {
      throw new Error(`Position ${index}: bestellpositionId muss Text oder null sein`)
    }

    return {
      id: (id as string | undefined) ?? null,
      artikelId,
      bestellpositionId: (bestellpositionId as string | undefined) ?? null,
      lieferschein: menge(lieferschein, `Position ${index}: lieferschein`),
      tatsaechlich: menge(tatsaechlich, `Position ${index}: tatsaechlich`),
      ekPreisCentLieferschein: cent(
        ekPreisCentLieferschein,
        `Position ${index}: ekPreisCentLieferschein`,
      ),
      nachlieferungZugesagtBis: datum(
        nachlieferungZugesagtBis,
        `Position ${index}: nachlieferungZugesagtBis`,
      ),
      abweichungen: leseAbweichungen(abweichungen, index),
    }
  })
}

/**
 * Das Leergut aus dem Rumpf. Fehlt das Feld, bleibt der Block unangetastet —
 * die Maske schickt Ware und Leergut getrennt.
 */
function leseLeergut(rumpf: unknown): Leergut[] | null {
  if (typeof rumpf !== 'object' || rumpf === null || !('leergut' in rumpf)) return null
  const roh = (rumpf as { leergut: unknown }).leergut
  if (!Array.isArray(roh)) throw new Error('"leergut" muss eine Liste sein')

  return roh.map((eintrag, index) => {
    if (typeof eintrag !== 'object' || eintrag === null) {
      throw new Error(`Leergut ${index} ist kein Objekt`)
    }
    const { id, bezeichnung, lieferschein, tatsaechlich, pfandCentJeEinheit } = eintrag as Record<
      string,
      unknown
    >
    if (typeof bezeichnung !== 'string' || bezeichnung.trim() === '') {
      throw new Error(`Leergut ${index} ohne Bezeichnung`)
    }
    if (id !== null && id !== undefined && typeof id !== 'string') {
      throw new Error(`Leergut ${index}: id muss Text oder null sein`)
    }
    return {
      id: (id as string | undefined) ?? null,
      bezeichnung: bezeichnung.trim(),
      lieferschein: menge(lieferschein, `Leergut ${index}: lieferschein`),
      tatsaechlich: menge(tatsaechlich, `Leergut ${index}: tatsaechlich`),
      pfandCentJeEinheit: cent(pfandCentJeEinheit, `Leergut ${index}: pfandCentJeEinheit`),
    }
  })
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/lieferung/[id]/positionen'>,
) {
  const { id } = await ctx.params

  let positionen: Eingang[]
  let leergut: Leergut[] | null
  try {
    const rumpf = (await request.json()) as unknown
    positionen = lesePositionen(rumpf)
    leergut = leseLeergut(rumpf)
  } catch (ursache) {
    const meldung = ursache instanceof Error ? ursache.message : String(ursache)
    return Response.json({ fehler: meldung }, { status: 400 })
  }

  const benutzer = await angemeldeterBenutzer()
  if (benutzer === null) {
    return Response.json({ fehler: 'Nicht angemeldet' }, { status: 401 })
  }

  // Über Id und Betrieb gesucht: eine fremde Lieferung ist damit nicht gefunden.
  const lieferung = await prisma.lieferung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
  })
  if (lieferung === null) {
    return Response.json({ fehler: 'Lieferung nicht gefunden' }, { status: 404 })
  }
  if (lieferung.geprueftAm !== null) {
    return Response.json(
      { fehler: 'Wareneingang ist bestätigt und nimmt keine Werte mehr an' },
      { status: 409 },
    )
  }

  if (positionen.length === 0 && leergut === null) return Response.json({ gespeichert: [] })

  // Erst alles prüfen, dann alles schreiben. Ein halb angenommener Stapel wäre
  // für den Client nicht von einem ganz abgelehnten zu unterscheiden.
  const artikel = await prisma.artikel.findMany({
    where: { betriebId: lieferung.betriebId, id: { in: positionen.map((p) => p.artikelId) } },
    select: { id: true },
  })
  const bekannt = new Set(artikel.map((eintrag) => eintrag.id))

  for (const position of positionen) {
    if (!bekannt.has(position.artikelId)) {
      return Response.json(
        { fehler: `Artikel ${position.artikelId} gehört nicht zu diesem Betrieb` },
        { status: 400 },
      )
    }
    if (!stimmig(position)) {
      return Response.json(
        {
          fehler:
            `Die Abweichungen erklären die Mengendifferenz nicht: ` +
            `es fehlen ${luecke(position).toString()} Gebinde in der Aufschlüsselung`,
          artikelId: position.artikelId,
        },
        { status: 400 },
      )
    }
  }

  // Ohne Preissicht (darfPreiseSehen) bekommt die Maske die Lieferscheinpreise
  // gar nicht erst — schickte diese Route deren `null` in die Datenbank, wäre
  // jeder von der Betriebsleitung erfasste Preis nach dem ersten
  // Mitarbeiter-Speichern still gelöscht. Deshalb bleibt der Preis beim
  // Aktualisieren unangetastet, und die PREISABWEICHUNGen einer Zeile
  // überleben das Ersetzen der Abweichungen.
  const mitPreisen = darfPreiseSehen(benutzer.rolle)

  const gespeichert = await prisma.$transaction(async (tx) => {
    const ids: { artikelId: string; id: string }[] = []

    for (const position of positionen) {
      const daten = {
        // Der Artikel darf sich ändern: beim Ersatzartikel steht auf der Palette
        // etwas anderes als bestellt, und bestellpositionId hält fest, wovon.
        artikelId: position.artikelId,
        bestellpositionId: position.bestellpositionId,
        anzahlGebindeLieferschein: position.lieferschein,
        anzahlGebindeTatsaechlich: position.tatsaechlich,
        ...(mitPreisen ? { ekPreisCentLieferschein: position.ekPreisCentLieferschein } : {}),
        nachlieferungZugesagtBis:
          position.nachlieferungZugesagtBis === null
            ? null
            : new Date(`${position.nachlieferungZugesagtBis}T00:00:00Z`),
      }

      const zeile =
        position.id === null
          ? await tx.lieferposition.create({
              data: { betriebId: lieferung.betriebId, lieferungId: id, ...daten },
            })
          : await tx.lieferposition.update({ where: { id: position.id }, data: daten })

      await tx.abweichung.deleteMany({
        where: {
          lieferpositionId: zeile.id,
          ...(mitPreisen ? {} : { art: { not: Abweichungsart.PREISABWEICHUNG } }),
        },
      })
      for (const abweichung of position.abweichungen) {
        // Was die Rolle nicht sehen kann, darf sie auch nicht behaupten.
        if (!mitPreisen && abweichung.art === Abweichungsart.PREISABWEICHUNG) continue
        await tx.abweichung.create({
          data: {
            betriebId: lieferung.betriebId,
            lieferpositionId: zeile.id,
            art: abweichung.art,
            anzahlGebinde: abweichung.anzahlGebinde,
            verlauf: {
              create: {
                betriebId: lieferung.betriebId,
                nachStatus: Abweichungsstatus.OFFEN,
              },
            },
          },
        })
      }

      ids.push({ artikelId: position.artikelId, id: zeile.id })
    }

    // Der Leergut-Block wird als Ganzes ersetzt, wenn er mitkommt: die Maske
    // schickt ihn vollständig, und eine gelöschte Zeile soll auch verschwinden.
    // Fehlt das Feld im Rumpf, bleibt das gespeicherte Leergut unangetastet.
    if (leergut !== null) {
      await tx.leergutposition.deleteMany({ where: { lieferungId: id } })
      if (leergut.length > 0) {
        await tx.leergutposition.createMany({
          data: leergut.map((zeile) => ({
            betriebId: lieferung.betriebId,
            lieferungId: id,
            bezeichnung: zeile.bezeichnung,
            anzahlLieferschein: zeile.lieferschein,
            anzahlTatsaechlich: zeile.tatsaechlich,
            pfandCentJeEinheit: zeile.pfandCentJeEinheit,
          })),
        })
      }
    }

    return ids
  })

  return Response.json({ gespeichert })
}
