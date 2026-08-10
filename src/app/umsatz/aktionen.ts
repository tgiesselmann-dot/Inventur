'use server'

/**
 * Serveraktionen des Kassenimports.
 *
 * Zwei Schritte, weil ein Import nicht rückgängig zu machen ist, ohne dass
 * jemand weiss, was er rückgängig macht: erst die Vorschau, dann das Schreiben.
 * Beide gehen durch dieselbe Funktion in src/lib/kassenimport.ts — eine Vorschau
 * mit eigener Rechnung wäre eine Vorschau auf etwas anderes als das, was danach
 * passiert.
 *
 * Die Datei wird für den zweiten Schritt noch einmal hochgeladen. Sie im Server
 * zwischenzulagern hiesse, einen Zustand zu verwalten, der bei jedem
 * abgebrochenen Import liegenbleibt; eine Kassendatei sind ein paar hundert
 * Kilobyte, und der zweite Weg dauert keine Sekunde.
 */

import { revalidatePath } from 'next/cache'

import {
  importiereKassenumsatz,
  type Kassenimportergebnis,
  type Kassenimportvorschau,
} from '@/lib/kassenimport'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'

export type Importzustand =
  | { art: 'leer' }
  | { art: 'vorschau'; dateiname: string; vorschau: Kassenimportvorschau }
  | { art: 'fertig'; dateiname: string; ergebnis: Kassenimportergebnis }
  | { art: 'fehler'; meldung: string }

/**
 */
async function betriebId(): Promise<string> {
  const betrieb = await aktuellerBetrieb()
  return betrieb.id
}

/** Liest die hochgeladene Datei aus dem Formular. */
async function leseDatei(formular: FormData): Promise<{ name: string; inhalt: string }> {
  const datei = formular.get('datei')
  if (!(datei instanceof File) || datei.size === 0) {
    throw new Error('Keine Datei ausgewählt')
  }
  return { name: datei.name, inhalt: await datei.text() }
}

function alsFehler(ursache: unknown): Importzustand {
  return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
}

/**
 * Beide Schritte in einer Aktion, gesteuert über das Feld `modus` des Knopfes,
 * der abgeschickt hat.
 *
 * Nicht zwei Aktionen mit zwei Zuständen: die Maske müsste dann entscheiden,
 * welcher der beiden der jüngere ist, und nach einem zweiten Durchgang stünde
 * die alte Erfolgsmeldung über der neuen Vorschau.
 */
export async function kassenimport(
  _vorher: Importzustand,
  formular: FormData,
): Promise<Importzustand> {
  try {
    const schreiben = formular.get('modus') === 'schreiben'
    const datei = await leseDatei(formular)
    const ersetze = formular
      .getAll('ersetze')
      .filter((wert): wert is string => typeof wert === 'string')

    const ergebnis = await importiereKassenumsatz(
      prisma,
      await betriebId(),
      datei.name,
      datei.inhalt,
      schreiben ? { ersetze } : { nurVorschau: true },
    )

    if (!ergebnis.geschrieben) {
      return { art: 'vorschau', dateiname: datei.name, vorschau: ergebnis }
    }

    revalidatePath('/umsatz')
    revalidatePath('/umsatz/zuordnung')
    revalidatePath('/auswertung')
    return { art: 'fertig', dateiname: datei.name, ergebnis }
  } catch (ursache) {
    return alsFehler(ursache)
  }
}

/** Löscht einen Import mitsamt seiner Positionen. Die Kassenartikel bleiben. */
export async function importLoeschen(formular: FormData): Promise<void> {
  const id = formular.get('id')
  if (typeof id !== 'string' || id === '') throw new Error('Kein Import angegeben')

  // betriebId im Filter, nicht bloss die id: ein Formular mit fremder id soll
  // nichts löschen können, was diesem Betrieb nicht gehört.
  await prisma.umsatzimport.deleteMany({ where: { id, betriebId: await betriebId() } })

  revalidatePath('/umsatz')
  revalidatePath('/auswertung')
}
