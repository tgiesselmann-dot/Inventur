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
 * Verwirft eine offene Zählung — der Ausweg aus einem Fehlstart, ohne den die
 * versehentlich begonnene Zählung die echte des Tages blockieren würde
 * (zaehlungBeginnen setzt eine offene stets fort).
 *
 * Verworfen heisst Status, nicht Löschen: ein delete risse über die Kaskade
 * alle Zählwerte mit — auch die eines zweiten Geräts, das gerade noch zählt —
 * und wäre durch nichts zurückzuholen. So verschwindet die Zählung aus der
 * App, bleibt aber in der Datenbank; die Abweichungen machen es genauso.
 *
 * Nur offene: eine abgeschlossene Zählung ist Anfangsbestand einer Auswertung
 * und verschwindet nie wieder.
 *
 * Die Rückfrage stellt die Oberfläche (verwerfen.tsx), nicht der Server: hier
 * kommt nur an, was schon bestätigt wurde. Auch die Navigation gehört der
 * Oberfläche — sie räumt nach dem Erfolg erst den lokalen Speicher, und ein
 * redirect hier flöge als Fehler durch ihr try/catch.
 */
export async function zaehlungVerwerfen(zaehlungId: string) {
  if (!istKennung(zaehlungId)) throw new Error('Keine gültige Zählungskennung')

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit nicht gefunden —
  // und wird unten folgerichtig nicht angefasst.
  const betrieb = await aktuellerBetrieb()
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id: zaehlungId, betriebId: betrieb.id },
  })
  // Nicht da oder schon verworfen (zweites Gerät, doppelter Klick): das Ziel
  // ist erreicht.
  if (zaehlung === null || zaehlung.status === ZaehlungStatus.VERWORFEN) return
  if (zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN) {
    throw new Error('Nur eine offene Zählung lässt sich verwerfen')
  }

  // Der Status steht noch einmal in der Bedingung: schliesst ein zweites Gerät
  // zwischen der Prüfung oben und diesem Schreiben ab, wird hier nichts mehr
  // verworfen — eine abgeschlossene Zählung gewinnt.
  await prisma.zaehlung.updateMany({
    where: { id: zaehlungId, betriebId: betrieb.id, status: ZaehlungStatus.OFFEN },
    data: { status: ZaehlungStatus.VERWORFEN },
  })
}
