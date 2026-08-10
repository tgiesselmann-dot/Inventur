'use server'

/**
 * Serveraktionen der Nachverfolgung: die Statuswechsel einer Abweichung.
 *
 * Jeder Wechsel schreibt Abweichung und Verlaufsereignis in einem Update —
 * `nachStatus` des jüngsten Eintrags muss gleich dem Status der Abweichung
 * sein, das ist die Zusage des Journals (siehe prisma/schema.prisma).
 *
 * Erledigt gibt es nur über die eingetragene Gutschrift: eine Taste, die
 * Erledigung behauptet, gäbe es sonst schneller als das Geld. Verworfen ist
 * der eigene Zählfehler und von jedem aktiven Status aus möglich — auch eine
 * reklamierte Abweichung darf sich noch als Irrtum herausstellen.
 *
 * Jedes Ereignis trägt, wer es ausgelöst hat. Beim Gespräch mit dem
 * Aussendienst zählt nicht nur, wann reklamiert wurde, sondern wer es gesehen
 * hat — das ist die Person, die man fragen kann.
 */

import { revalidatePath } from 'next/cache'

import { Abweichungsstatus } from '@/generated/prisma/enums'
import { pflichtBenutzer } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'
import { istAktiv, naechsterSchritt } from '@/lib/reklamation'
import { centAusEingabe } from '@/lib/wareneingang'

async function aktiveAbweichung(formular: FormData) {
  const id = String(formular.get('abweichungId') ?? '')
  if (id === '') throw new Error('Keine Abweichung angegeben')

  // Über Id und Betrieb gesucht: die Id kommt aus einem Formular.
  const benutzer = await pflichtBenutzer()
  const abweichung = await prisma.abweichung.findFirst({
    where: { id, betriebId: benutzer.betrieb.id },
  })
  if (abweichung === null) throw new Error('Abweichung nicht gefunden')
  if (!istAktiv(abweichung.status)) {
    throw new Error('Dieser Vorgang ist abgeschlossen — sein Status ändert sich nicht mehr')
  }
  return { ...abweichung, benutzerId: benutzer.benutzerId }
}

/** Statuswechsel samt Verlaufsereignis, als eine Schreiboperation. */
function gewechselt(
  abweichung: {
    id: string
    betriebId: string
    status: Abweichungsstatus
    benutzerId: string
  },
  nachStatus: Abweichungsstatus,
  notiz: string | null,
  gutschriftCent?: number,
) {
  return prisma.abweichung.update({
    where: { id: abweichung.id },
    data: {
      status: nachStatus,
      ...(gutschriftCent === undefined ? {} : { gutschriftCent }),
      verlauf: {
        create: {
          betriebId: abweichung.betriebId,
          benutzerId: abweichung.benutzerId,
          vonStatus: abweichung.status,
          nachStatus,
          notiz,
        },
      },
    },
  })
}

function neuZeichnen(abweichungId: string) {
  revalidatePath('/lieferungen/abweichungen')
  revalidatePath(`/lieferungen/abweichungen/${abweichungId}`)
}

/**
 * Der nächste Schritt auf dem Weg: offen wird reklamiert, reklamiert wird zur
 * erwarteten Gutschrift. Welcher Schritt das ist, sagt `naechsterSchritt` in
 * src/lib/reklamation.ts — dieselbe Stelle, aus der die Maske ihre
 * Beschriftung nimmt. Von "Gutschrift erwartet" führt kein Schritt hierher.
 */
export async function weiterschalten(formular: FormData): Promise<void> {
  const abweichung = await aktiveAbweichung(formular)

  const nachStatus = naechsterSchritt(abweichung.status)
  if (nachStatus === null) {
    throw new Error('Von diesem Status führt kein Schritt weiter — erledigt wird über die Gutschrift')
  }

  await gewechselt(abweichung, nachStatus, null)
  neuZeichnen(abweichung.id)
}

/**
 * Verwirft den Vorgang: geprüft und fallengelassen, etwa weil der eigene
 * Zählfehler auffiel. Kein Löschen — der Vorgang bleibt samt Verlauf
 * nachlesbar, nur zählt er in keine Summe und keine Lieferantenquote mehr.
 */
export async function verwerfen(formular: FormData): Promise<void> {
  const abweichung = await aktiveAbweichung(formular)

  const grund = String(formular.get('grund') ?? '').trim()
  await gewechselt(abweichung, Abweichungsstatus.VERWORFEN, grund === '' ? null : grund)
  neuZeichnen(abweichung.id)
}

/**
 * Trägt die tatsächlich erhaltene Gutschrift ein und schliesst den Vorgang
 * damit ab. Beides in einem Schritt: erst die Gutschrift macht aus einer
 * Forderung ein Ergebnis, und ein Vorgang mit Gutschrift, der offen bliebe,
 * wäre eine Aufgabe, die niemand mehr los wird.
 *
 * Eingetragen wird nur die Gutschrift — der reklamierte Betrag ist gerechnet
 * und bleibt es. Auch 0,00 EUR ist eine Auskunft: der Lieferant hat abgelehnt.
 */
export async function gutschriftEintragen(formular: FormData): Promise<void> {
  const abweichung = await aktiveAbweichung(formular)

  const cent = centAusEingabe(String(formular.get('gutschrift') ?? ''))
  if (cent === null) {
    throw new Error('Ohne Betrag keine Gutschrift — das Feld erwartet z. B. "178,40"')
  }

  await gewechselt(abweichung, Abweichungsstatus.ERLEDIGT, null, cent)
  neuZeichnen(abweichung.id)
}

/**
 * Speichert die Notiz des Vorgangs. Kein Statuswechsel und deshalb auch kein
 * Verlaufsereignis: das Journal beschreibt Übergänge, nicht Textpflege. Die
 * Notiz darf auch an einem abgeschlossenen Vorgang wachsen — was am Telefon
 * gesagt wurde, gehört festgehalten, egal wie der Vorgang ausging.
 */
export async function notizSpeichern(formular: FormData): Promise<void> {
  const id = String(formular.get('abweichungId') ?? '')
  if (id === '') throw new Error('Keine Abweichung angegeben')

  const text = String(formular.get('notiz') ?? '').trim()
  await prisma.abweichung.update({
    where: { id },
    data: { notiz: text === '' ? null : text },
  })
  neuZeichnen(id)
}
