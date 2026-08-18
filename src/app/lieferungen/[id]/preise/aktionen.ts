'use server'

/**
 * Serveraktionen der Seite "Preise klären": aus einer an der Rampe
 * festgehaltenen Preisabweichung wird hier eine Entscheidung.
 *
 * Zwei Wege, beide endgültig für diese Abweichung: den Lieferscheinpreis in
 * den Artikelstamm übernehmen (der Lieferant hat eben erhöht), oder den
 * hinterlegten Preis behalten (der Lieferschein irrt — das gibt eine
 * Reklamation beim nächsten Kontakt, aber keinen neuen Stammpreis). Der
 * erfasste Lieferscheinpreis bleibt in beiden Fällen an der Lieferposition
 * stehen: er ist der Beleg, aus dem die Abweichung entstand.
 *
 * Gerechnet wird nicht hier: die Umrechnung des Gebindepreises in den
 * Stammpreis (je nach Preisbezug) steht in src/lib/einheiten.ts.
 *
 * Der Statuswechsel schreibt Abweichung und Verlaufsereignis in einer
 * Transaktion — `nachStatus` des jüngsten Eintrags muss gleich dem Status der
 * Abweichung sein, das ist die Zusage des Journals.
 */

import { revalidatePath } from 'next/cache'

import { Abweichungsart, Abweichungsstatus } from '@/generated/prisma/enums'
import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { ekPreisCentAusGebindepreis } from '@/lib/einheiten'
import { prisma } from '@/lib/prisma'

/**
 * Holt die Abweichung und prüft die Wächter, die für beide Entscheidungen
 * gelten: es muss eine offene Preisabweichung sein. Alles andere ist kein
 * Anwenderfehler, sondern ein Formular, das es so nicht gibt.
 */
async function offenePreisabweichung(formular: FormData) {
  const id = String(formular.get('abweichungId') ?? '')
  if (id === '') throw new Error('Keine Abweichung angegeben')

  // Über Id und Betrieb gesucht: die Id kommt aus einem Formular.
  const { betrieb } = await pflichtBetriebsleiter()
  const abweichung = await prisma.abweichung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: { lieferposition: { include: { artikel: true } } },
  })
  if (abweichung === null) throw new Error('Abweichung nicht gefunden')
  if (abweichung.art !== Abweichungsart.PREISABWEICHUNG) {
    throw new Error('Diese Abweichung ist keine Preisabweichung')
  }
  if (abweichung.status !== Abweichungsstatus.OFFEN) {
    throw new Error('Diese Preisabweichung ist bereits entschieden')
  }
  return abweichung
}

/** Statuswechsel samt Verlaufsereignis, als eine Schreiboperation. */
function entschieden(
  abweichung: { id: string; betriebId: string },
  nachStatus: Abweichungsstatus,
  notiz: string,
) {
  return prisma.abweichung.update({
    where: { id: abweichung.id },
    data: {
      status: nachStatus,
      verlauf: {
        create: {
          betriebId: abweichung.betriebId,
          vonStatus: Abweichungsstatus.OFFEN,
          nachStatus,
          notiz,
        },
      },
    },
  })
}

/** Die Wege, die von der Entscheidung abhängen — alle zeigen Preise. */
function neuZeichnen(lieferungId: string) {
  revalidatePath('/')
  revalidatePath('/lieferungen')
  revalidatePath(`/lieferungen/${lieferungId}`)
  revalidatePath(`/lieferungen/${lieferungId}/preise`)
}

/**
 * Übernimmt den Preis laut Lieferschein in den Artikelstamm. Ab jetzt rechnet
 * jede Bewertung mit ihm — deshalb Artikel-Update und Statuswechsel in einer
 * Transaktion: ein neuer Stammpreis ohne erledigte Abweichung wäre eine
 * Aufgabe, die niemand mehr los wird.
 */
export async function preisUebernehmen(formular: FormData): Promise<void> {
  const abweichung = await offenePreisabweichung(formular)

  const laut = abweichung.lieferposition.ekPreisCentLieferschein
  if (laut === null) {
    throw new Error('An dieser Position ist kein Lieferscheinpreis erfasst')
  }

  // Der Lieferschein nennt den Preis je Gebinde; im Stamm kann er je Einheit
  // gelten. Die Gegenrichtung zu wertGebindeCent — gerechnet in einheiten.ts.
  const stammpreisCent = ekPreisCentAusGebindepreis(abweichung.lieferposition.artikel, laut)

  await prisma.$transaction([
    prisma.artikel.update({
      where: { id: abweichung.lieferposition.artikelId },
      data: { ekPreisCent: stammpreisCent },
    }),
    entschieden(abweichung, Abweichungsstatus.ERLEDIGT, 'Preis in den Artikelstamm übernommen'),
  ])

  neuZeichnen(abweichung.lieferposition.lieferungId)
}

/**
 * Behält den hinterlegten Preis: der Lieferschein irrt. Die Abweichung wird
 * verworfen, nicht gelöscht — dass zu viel berechnet wurde, bleibt samt
 * Lieferscheinpreis nachlesbar.
 */
export async function preisBehalten(formular: FormData): Promise<void> {
  const abweichung = await offenePreisabweichung(formular)

  await entschieden(abweichung, Abweichungsstatus.VERWORFEN, 'Hinterlegter Preis behalten')

  neuZeichnen(abweichung.lieferposition.lieferungId)
}
