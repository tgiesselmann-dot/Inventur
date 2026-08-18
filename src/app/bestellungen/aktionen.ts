'use server'

/**
 * Serveraktionen der Bestellung: aus einem gerechneten Vorschlag wird hier eine
 * Bestellung, gegen die sich später prüfen lässt.
 *
 * Der Vorschlag selbst wird nicht gespeichert. Er ist jederzeit wieder
 * ausrechenbar, und eine gespeicherte Empfehlung wäre in einer Woche eine
 * Behauptung über einen Bestand, den es nicht mehr gibt. Gespeichert wird nur
 * die Entscheidung: diese Menge dieses Artikels wird bestellt.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { BestellStatus } from '@/generated/prisma/enums'
import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { positionenAenderbar, statusText, wechselErlaubt } from '@/lib/bestellung'
import { heute } from '@/lib/datum'
import { prisma } from '@/lib/prisma'

import { type Aktionszustand } from '../aktionszustand'

/** Eine Zeile, wie sie aus dem Formular der Vorschlagsmaske kommt. */
type Eingabe = { artikelId: string; anzahlGebinde: number }

/**
 * Liest die Positionen aus dem Formular. Die beiden Feldlisten stehen in
 * derselben Reihenfolge, weil der Browser Formularfelder in Dokumentreihenfolge
 * überträgt — deshalb gehören Artikel und Menge im Markup in dieselbe Zeile.
 *
 * Mengen von 0 fallen weg: eine gestrichene Zeile ist keine Bestellposition.
 * Bestellt werden ganze Liefergebinde, deshalb sind gebrochene Mengen hier ein
 * Fehler und keine Rundungsaufgabe.
 */
function lesePositionen(formular: FormData): Eingabe[] {
  const artikelIds = formular.getAll('artikelId').map(String)
  const mengen = formular.getAll('anzahlGebinde').map(String)

  const gelesen: Eingabe[] = []
  const gesehen = new Set<string>()

  artikelIds.forEach((artikelId, index) => {
    if (artikelId === '') return

    const menge = Number((mengen[index] ?? '').trim())
    if (!Number.isInteger(menge) || menge < 0) {
      throw new Error(`Bestellmenge muss eine ganze Zahl von Gebinden sein, ist aber "${mengen[index]}"`)
    }
    if (menge === 0) return

    // Zwei Zeilen desselben Artikels wären zwei Mengen für dieselbe Sache; die
    // Unique-Constraint würde sie ohnehin abweisen, nur später und unschöner.
    if (gesehen.has(artikelId)) {
      throw new Error('Derselbe Artikel steht zweimal in der Bestellung')
    }
    gesehen.add(artikelId)

    gelesen.push({ artikelId, anzahlGebinde: menge })
  })

  return gelesen
}

/**
 * Legt aus den Zeilen der Maske eine Bestellung im Stand `ENTWURF` an und führt
 * auf sie. Abgeschickt wird sie in einem eigenen Schritt: zwischen "so soll es
 * aussehen" und "das liegt jetzt beim Lieferanten" liegt eine Entscheidung, und
 * die gehört nicht in denselben Knopf.
 */
export async function bestellungAnlegen(
  _vorher: Aktionszustand,
  formular: FormData,
): Promise<Aktionszustand> {
  let ziel: string
  try {
    const { betrieb } = await pflichtBetriebsleiter()

    const lieferant = String(formular.get('lieferant') ?? '').trim()
    if (lieferant === '') throw new Error('Ohne Lieferant gibt es keine Bestellung')

    const datumstext = String(formular.get('datum') ?? '')
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(datumstext)
      ? new Date(`${datumstext}T00:00:00Z`)
      : heute()

    const notizRoh = String(formular.get('notiz') ?? '').trim()

    const positionen = lesePositionen(formular)
    if (positionen.length === 0) {
      throw new Error('Keine Position mit einer Menge über 0 — es gibt nichts zu bestellen')
    }

    // Die Artikel müssen demselben Betrieb gehören. Ein Formular mit fremder
    // artikelId soll keine betriebsübergreifende Bestellung anlegen können.
    const erlaubt = await prisma.artikel.count({
      where: { betriebId: betrieb.id, id: { in: positionen.map((eintrag) => eintrag.artikelId) } },
    })
    if (erlaubt !== positionen.length) {
      throw new Error('Ein gewählter Artikel gehört nicht zu diesem Betrieb')
    }

    const bestellung = await prisma.bestellung.create({
      data: {
        betriebId: betrieb.id,
        datum,
        lieferant,
        notiz: notizRoh === '' ? null : notizRoh,
        positionen: {
          create: positionen.map((eintrag) => ({
            betriebId: betrieb.id,
            artikelId: eintrag.artikelId,
            anzahlGebinde: eintrag.anzahlGebinde,
          })),
        },
      },
    })

    revalidatePath('/bestellungen')
    ziel = `/bestellungen/${bestellung.id}`
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }

  // Ausserhalb des try: `redirect` arbeitet über eine Ausnahme, die der
  // catch-Zweig sonst als Fehlermeldung anzeigen würde.
  redirect(ziel)
}


/**
 * Schreibt die Positionsliste einer bestehenden Bestellung neu.
 *
 * Ersetzen statt abgleichen wäre hier falsch: an einer Bestellposition können
 * Lieferpositionen hängen, und die zeigen mit onDelete: Restrict darauf. Gelöscht
 * wird deshalb nur, was wirklich verschwindet und worauf nichts geliefert wurde;
 * alles andere wird aktualisiert.
 *
 * Änderbar auch nach dem Abschicken — die Begründung steht an
 * `positionenAenderbar`. Was nicht geht, ist eine abgeschickte Bestellung auf
 * null Positionen zu leeren: das ist eine Stornierung und hat ihren eigenen Weg.
 */
export async function positionenSpeichern(
  _vorher: Aktionszustand,
  formular: FormData,
): Promise<Aktionszustand> {
  try {
    const id = String(formular.get('bestellungId') ?? '')
    if (id === '') throw new Error('Keine Bestellung angegeben')

    // Über Id und Betrieb gesucht: die Id kommt aus einem Formular.
    const { betrieb } = await pflichtBetriebsleiter()
    const bestellung = await prisma.bestellung.findFirst({
      where: { id, betriebId: betrieb.id },
      include: {
        positionen: { include: { _count: { select: { lieferpositionen: true } } } },
      },
    })
    if (bestellung === null) throw new Error('Bestellung nicht gefunden')

    if (!positionenAenderbar(bestellung.status)) {
      throw new Error(
        `Eine Bestellung im Stand "${statusText(bestellung.status)}" lässt sich nicht mehr ändern`,
      )
    }

    const gewuenscht = lesePositionen(formular)
    if (gewuenscht.length === 0 && bestellung.status !== BestellStatus.ENTWURF) {
      throw new Error(
        'Eine abgeschickte Bestellung ohne Position ist eine Stornierung — dafür gibt es den eigenen Knopf',
      )
    }

    const erlaubt = await prisma.artikel.count({
      where: {
        betriebId: bestellung.betriebId,
        id: { in: gewuenscht.map((eintrag) => eintrag.artikelId) },
      },
    })
    if (erlaubt !== gewuenscht.length) {
      throw new Error('Ein gewählter Artikel gehört nicht zu diesem Betrieb')
    }

    const bleibt = new Set(gewuenscht.map((eintrag) => eintrag.artikelId))
    const weg = bestellung.positionen.filter((position) => !bleibt.has(position.artikelId))

    const beliefert = weg.filter((position) => position._count.lieferpositionen > 0)
    if (beliefert.length > 0) {
      throw new Error(
        `Auf ${beliefert.length === 1 ? 'eine Zeile' : `${beliefert.length} Zeilen`} wurde schon geliefert — sie lässt sich nicht streichen, nur in der Menge ändern`,
      )
    }

    const vorhanden = new Map(
      bestellung.positionen.map((position) => [position.artikelId, position]),
    )
    const neu = gewuenscht.filter((eintrag) => !vorhanden.has(eintrag.artikelId))
    const geaendert = gewuenscht.filter((eintrag) => {
      const alt = vorhanden.get(eintrag.artikelId)
      return alt !== undefined && !alt.anzahlGebinde.equals(eintrag.anzahlGebinde)
    })

    if (weg.length === 0 && neu.length === 0 && geaendert.length === 0) {
      return { art: 'gespeichert', text: 'Nichts geändert' }
    }

    await prisma.$transaction([
      prisma.bestellposition.deleteMany({ where: { id: { in: weg.map((p) => p.id) } } }),
      ...geaendert.map((eintrag) =>
        prisma.bestellposition.update({
          where: { bestellungId_artikelId: { bestellungId: id, artikelId: eintrag.artikelId } },
          data: { anzahlGebinde: eintrag.anzahlGebinde },
        }),
      ),
      prisma.bestellposition.createMany({
        data: neu.map((eintrag) => ({
          betriebId: bestellung.betriebId,
          bestellungId: id,
          artikelId: eintrag.artikelId,
          anzahlGebinde: eintrag.anzahlGebinde,
        })),
      }),
    ])

    revalidatePath('/bestellungen')
    revalidatePath(`/bestellungen/${id}`)

    const teile = [
      geaendert.length > 0 && `${geaendert.length} geändert`,
      neu.length > 0 && `${neu.length} neu`,
      weg.length > 0 && `${weg.length} gestrichen`,
    ].filter((teil): teil is string => teil !== false)

    return { art: 'gespeichert', text: `Gespeichert · ${teile.join(', ')}` }
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }
}

/**
 * Setzt den Stand einer Bestellung. Nur die Wechsel aus `naechsteStati` gehen
 * durch — der Weg ist einbahnig, und ein abgeschickter Entwurf lässt sich nicht
 * wieder einsammeln.
 */
export async function statusSetzen(formular: FormData): Promise<void> {
  const id = String(formular.get('bestellungId') ?? '')
  const nach = String(formular.get('status') ?? '')
  if (id === '') throw new Error('Keine Bestellung angegeben')

  if (!(nach in BestellStatus)) throw new Error(`Unbekannter Bestellstand: ${nach}`)
  const ziel = nach as BestellStatus

  // Über Id und Betrieb gesucht: die Id kommt aus einem Formular.
  const { betrieb } = await pflichtBetriebsleiter()
  const bestellung = await prisma.bestellung.findFirst({
    where: { id, betriebId: betrieb.id },
  })
  if (bestellung === null) throw new Error('Bestellung nicht gefunden')

  if (!wechselErlaubt(bestellung.status, ziel)) {
    throw new Error(
      `Eine Bestellung im Stand "${statusText(bestellung.status)}" lässt sich nicht auf "${statusText(ziel)}" setzen`,
    )
  }

  await prisma.bestellung.update({ where: { id }, data: { status: ziel } })

  revalidatePath('/bestellungen')
  revalidatePath(`/bestellungen/${id}`)
  // Die Lieferungsseite bietet versendete Bestellungen zur Auswahl an; ohne
  // diese Zeile fehlte die gerade abgeschickte dort noch.
  revalidatePath('/lieferungen')
}

/**
 * Verwirft einen Entwurf samt Positionen.
 *
 * Nur im Stand `ENTWURF`: was beim Lieferanten liegt, verschwindet nicht dadurch,
 * dass wir die Zeile löschen. Eine abgeschickte Bestellung wird storniert, und
 * das bleibt sichtbar.
 */
export async function entwurfVerwerfen(formular: FormData): Promise<void> {
  const id = String(formular.get('bestellungId') ?? '')
  if (id === '') throw new Error('Keine Bestellung angegeben')

  // Über Id und Betrieb gesucht: die Id kommt aus einem Formular.
  const { betrieb } = await pflichtBetriebsleiter()
  const bestellung = await prisma.bestellung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: { _count: { select: { lieferungen: true } } },
  })
  if (bestellung === null) throw new Error('Bestellung nicht gefunden')
  if (bestellung.status !== BestellStatus.ENTWURF) {
    throw new Error('Nur ein Entwurf lässt sich verwerfen — abgeschickte Bestellungen werden storniert')
  }
  if (bestellung._count.lieferungen > 0) {
    throw new Error('An dieser Bestellung hängt eine Lieferung — sie lässt sich nicht mehr verwerfen')
  }

  // Die Positionen hängen mit onDelete: Cascade daran und gehen mit.
  await prisma.bestellung.delete({ where: { id } })

  revalidatePath('/bestellungen')
  redirect('/bestellungen')
}
