'use server'

/**
 * Serveraktionen der Zählung.
 *
 * `zaehlungBeginnen` steht hier und nicht in einer der beiden Seiten, weil zwei
 * Masken denselben Weg anbieten: die Startseite mit ihrer grossen Fläche im
 * Fuss und die Liste der Zählungen. Als Kopie in beiden Dateien wäre die
 * Fortsetzungsregel unten irgendwann nur noch an einer Stelle richtig — und
 * dann stünden für einen Tag zwei halbe Zählungen in der Datenbank.
 */

import { redirect } from 'next/navigation'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { heute } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'

/**
 * Beginnt die Zählung des heutigen Tages und führt in die Maske.
 *
 * Eine offene Zählung von heute wird fortgesetzt statt verdoppelt. Wer die
 * Seite zweimal öffnet oder auf dem Weg ins Lager noch einmal tippt, soll nicht
 * zwei halbe Zählungen erzeugen — der Bestand stünde danach in zwei
 * unvollständigen Listen, und keine davon wäre die richtige.
 */
export async function zaehlungBeginnen() {
  const betrieb = await aktuellerBetrieb()

  const laufend = await prisma.zaehlung.findFirst({
    where: { betriebId: betrieb.id, datum: heute(), status: ZaehlungStatus.OFFEN },
  })

  const zaehlung =
    laufend ?? (await prisma.zaehlung.create({ data: { betriebId: betrieb.id, datum: heute() } }))

  redirect(`/zaehlung/${zaehlung.id}`)
}

/**
 * Verwirft eine offene Zählung samt allen Positionen — der Ausweg aus einem
 * Fehlstart, ohne den die versehentlich begonnene Zählung die echte des Tages
 * blockieren würde (zaehlungBeginnen setzt eine offene stets fort).
 *
 * Nur offene: eine abgeschlossene Zählung ist Anfangsbestand einer Auswertung
 * und verschwindet nie wieder. Die Positionen fallen über die Kaskade im
 * Schema mit — hier wird nichts einzeln aufgeräumt.
 *
 * Die Rückfrage stellt die Oberfläche (verwerfen.tsx), nicht der Server: hier
 * kommt nur an, was schon bestätigt wurde.
 */
export async function zaehlungVerwerfen(zaehlungId: string) {
  if (!istKennung(zaehlungId)) throw new Error('Keine gültige Zählungskennung')

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit nicht gefunden —
  // und wird unten folgerichtig nicht gelöscht.
  const betrieb = await aktuellerBetrieb()
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id: zaehlungId, betriebId: betrieb.id },
  })
  // Schon weg (zweites Gerät, doppelter Klick): das Ziel ist erreicht.
  if (zaehlung !== null) {
    if (zaehlung.status !== ZaehlungStatus.OFFEN) {
      throw new Error('Nur eine offene Zählung lässt sich verwerfen')
    }
    await prisma.zaehlung.delete({ where: { id: zaehlungId } })
  }

  redirect('/')
}
