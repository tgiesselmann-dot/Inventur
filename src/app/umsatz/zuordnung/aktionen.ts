'use server'

/**
 * Serveraktion der Zuordnungsmaske: was eine Kassenbezeichnung aus dem Lager
 * nimmt, wird hier festgeschrieben.
 *
 * Drei Wege, absichtlich als ein Formular mit drei Knöpfen und nicht als drei
 * Aktionen — sie schliessen einander aus, und der Zustand einer Bezeichnung
 * ergibt sich hinterher aus dem, was in der Datenbank steht:
 *
 *  - zuordnen:  Bestandteile setzen, `bestaetigt = true`.
 *  - ausnehmen: alle Bestandteile weg, `bestaetigt = true`. Die Bezeichnung
 *    berührt das Getränkelager nicht (Speisen, Sonderwünsche) und verschwindet
 *    von der Arbeitsliste, ohne als zugeordnet zu gelten.
 *  - aufnehmen: `bestaetigt = false`. Zurück auf die Arbeitsliste, damit jemand
 *    eine strittige Zuordnung noch einmal ansehen kann.
 *
 * Die Sammelaktion darunter macht dasselbe für viele Bezeichnungen auf einmal —
 * aber nur Ausnehmen und Aufnehmen, denn beide kommen ohne Zahl aus. Eine
 * Sammel-Zuordnung gibt es bewusst nicht: eine falsche Menge fällt in einer
 * Zeile kaum auf, auf zwanzig gestempelt wandert sie zwanzigfach still in die
 * Schwundrechnung.
 */

import { revalidatePath } from 'next/cache'

import { Decimal } from '@prisma/client/runtime/client'

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'

import { type Aktionszustand } from '../../aktionszustand'


/** Ein Bestandteil, wie er aus dem Formular kommt. */
type Eingabe = { artikelId: string; einheitenProVerkauf: Decimal }

/**
 * Liest die Bestandteile aus dem Formular. Die beiden Feldlisten stehen in
 * derselben Reihenfolge, weil der Browser Formularfelder in Dokumentreihenfolge
 * überträgt — deshalb gehören Auswahl und Menge im Markup in dieselbe Zeile.
 *
 * Leere Zeilen fallen still weg: eine hinzugefügte und nicht ausgefüllte Zeile
 * ist ein abgebrochener Gedanke und kein Fehler.
 */
function leseBestandteile(formular: FormData): Eingabe[] {
  const artikelIds = formular.getAll('artikelId').map(String)
  const mengen = formular.getAll('einheitenProVerkauf').map(String)

  const gelesen: Eingabe[] = []
  const gesehen = new Set<string>()

  artikelIds.forEach((artikelId, index) => {
    const mengentext = (mengen[index] ?? '').trim().replace(',', '.')
    if (artikelId === '') return

    if (mengentext === '') {
      throw new Error('Zu jedem Artikel gehört eine Menge je Verkauf')
    }

    let menge: Decimal
    try {
      menge = new Decimal(mengentext)
    } catch {
      throw new Error(`"${mengen[index]}" ist keine Zahl`)
    }
    if (!menge.isFinite() || menge.lessThanOrEqualTo(0)) {
      throw new Error(`Menge je Verkauf muss grösser als 0 sein, ist aber ${mengen[index]}`)
    }

    // Zwei Zeilen desselben Artikels wären zwei Mengen für dieselbe Sache; die
    // Unique-Constraint würde sie ohnehin abweisen, nur später und unschöner.
    if (gesehen.has(artikelId)) {
      throw new Error('Derselbe Artikel steht zweimal in der Zuordnung')
    }
    gesehen.add(artikelId)

    gelesen.push({ artikelId, einheitenProVerkauf: menge })
  })

  return gelesen
}

export async function zuordnungSpeichern(
  _vorher: Aktionszustand,
  formular: FormData,
): Promise<Aktionszustand> {
  try {
    const id = formular.get('kassenartikelId')
    if (typeof id !== 'string' || id === '') throw new Error('Keine Bezeichnung angegeben')

    const modus = String(formular.get('modus') ?? 'zuordnen')
    const notizRoh = String(formular.get('notiz') ?? '').trim()
    const notiz = notizRoh === '' ? null : notizRoh

    // Über den Betrieb gesucht, nicht bloss über die Id: die Id kommt aus einem
    // Formular, und ein Formular kann jede Id tragen.
    const betrieb = await aktuellerBetrieb()
    const kassenartikel = await prisma.kassenartikel.findFirst({
      where: { id, betriebId: betrieb.id },
    })
    if (kassenartikel === null) throw new Error('Bezeichnung nicht gefunden')

    if (modus === 'aufnehmen') {
      await prisma.kassenartikel.update({ where: { id }, data: { bestaetigt: false, notiz } })
      return fertig('Wieder aufgenommen')
    }

    if (modus === 'ausnehmen') {
      await prisma.$transaction([
        prisma.kassenartikelbestandteil.deleteMany({ where: { kassenartikelId: id } }),
        prisma.kassenartikel.update({ where: { id }, data: { bestaetigt: true, notiz } }),
      ])
      return fertig('Ausgenommen')
    }

    const bestandteile = leseBestandteile(formular)
    if (bestandteile.length === 0) {
      throw new Error(
        'Ohne Artikel gibt es nichts zuzuordnen — „Ausnehmen“ nehmen, wenn die Bezeichnung das Lager nicht berührt',
      )
    }

    // Die Artikel müssen demselben Betrieb gehören wie die Bezeichnung. Ein
    // Formular mit fremder artikelId soll keine betriebsübergreifende Zuordnung
    // anlegen können.
    const erlaubt = await prisma.artikel.count({
      where: {
        betriebId: kassenartikel.betriebId,
        id: { in: bestandteile.map((eintrag) => eintrag.artikelId) },
      },
    })
    if (erlaubt !== bestandteile.length) {
      throw new Error('Ein gewählter Artikel gehört nicht zu diesem Betrieb')
    }

    await prisma.$transaction([
      // Ersetzen statt abgleichen: eine Zuordnung ist kurz, und ein Abgleich
      // müsste entscheiden, was eine geänderte Zeile ist und was eine neue.
      prisma.kassenartikelbestandteil.deleteMany({ where: { kassenartikelId: id } }),
      prisma.kassenartikelbestandteil.createMany({
        data: bestandteile.map((eintrag) => ({
          betriebId: kassenartikel.betriebId,
          kassenartikelId: id,
          artikelId: eintrag.artikelId,
          einheitenProVerkauf: eintrag.einheitenProVerkauf,
        })),
      }),
      prisma.kassenartikel.update({ where: { id }, data: { bestaetigt: true, notiz } }),
    ])

    return fertig(
      bestandteile.length === 1 ? 'Zugeordnet' : `Zugeordnet (${bestandteile.length} Artikel)`,
    )
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }
}

/** Was eine Sammelaktion können darf: alles, was ohne Zahl auskommt. */
export type Sammelmodus = 'ausnehmen' | 'aufnehmen'

/**
 * Ausnehmen oder Aufnehmen für viele Bezeichnungen auf einmal.
 *
 * Wird aus der Sammelleiste heraus aufgerufen, nicht über ein Formular — die
 * Auswahl lebt im Client. Ausnehmen entfernt wie in der Einzelaktion auch die
 * Bestandteile: eine ausgenommene Bezeichnung mit Zuordnung wäre ein
 * Widerspruch, und die Leiste sagt vorher an, wie viele Zuordnungen wegfallen.
 */
export async function sammelAktion(
  ids: string[],
  modus: Sammelmodus,
): Promise<Aktionszustand> {
  try {
    const eindeutig = [...new Set(ids)].filter((id) => id !== '')
    if (eindeutig.length === 0) throw new Error('Keine Bezeichnung ausgewählt')

    // Der Betrieb steht in jeder Bedingung darunter: die Ids kommen aus der
    // Auswahl im Client, und die kann geschickt werden, wie sie will.
    const betrieb = await aktuellerBetrieb()
    const gefunden = await prisma.kassenartikel.count({
      where: { betriebId: betrieb.id, id: { in: eindeutig } },
    })
    if (gefunden !== eindeutig.length) {
      throw new Error('Eine der Bezeichnungen wurde nicht gefunden')
    }

    if (modus === 'aufnehmen') {
      await prisma.kassenartikel.updateMany({
        where: { betriebId: betrieb.id, id: { in: eindeutig } },
        data: { bestaetigt: false },
      })
      return fertig(
        eindeutig.length === 1
          ? 'Wieder aufgenommen'
          : `${eindeutig.length} wieder aufgenommen`,
      )
    }

    await prisma.$transaction([
      prisma.kassenartikelbestandteil.deleteMany({
        where: { betriebId: betrieb.id, kassenartikelId: { in: eindeutig } },
      }),
      prisma.kassenartikel.updateMany({
        where: { betriebId: betrieb.id, id: { in: eindeutig } },
        data: { bestaetigt: true },
      }),
    ])
    return fertig(eindeutig.length === 1 ? 'Ausgenommen' : `${eindeutig.length} ausgenommen`)
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }
}

function fertig(text: string): Aktionszustand {
  // Die Auswertung liest die Zuordnung mit; ohne diese Zeile zeigte sie nach
  // einer Korrektur noch den Stand von vorher.
  revalidatePath('/umsatz')
  revalidatePath('/umsatz/zuordnung')
  revalidatePath('/auswertung')
  return { art: 'gespeichert', text }
}
