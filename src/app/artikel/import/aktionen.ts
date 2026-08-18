'use server'

/**
 * Serveraktionen der Importstrecke: Vorschau rechnen und Import ausführen.
 *
 * Beide rufen dieselbe Funktion `importiereArtikelstamm` — die Vorschau mit
 * `nurVorschau`, der Lauf ohne. Die Seite parst nichts selbst und leitet
 * nichts ab: sie schickt den Dateitext hierher und zeigt, was zurückkommt.
 *
 * Der Lauf vergleicht in seiner Transaktion neu — hat sich der Bestand
 * zwischen Vorschau und Ausführen geändert, beschreibt das Protokoll den
 * echten Lauf, nicht die alte Vorschau.
 */

import { revalidatePath } from 'next/cache'

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { importiereArtikelstamm, type Importergebnis } from '@/lib/artikelimport'
import { prisma } from '@/lib/prisma'

export type Importantwort =
  | { art: 'ok'; ergebnis: Importergebnis }
  | { art: 'fehler'; meldung: string }

async function betriebId(): Promise<string> {
  const { betrieb } = await pflichtBetriebsleiter()
  return betrieb.id
}

/** Liest die Datei und stellt sie dem Bestand gegenüber. Schreibt nichts. */
export async function vorschauRechnen(csvText: string): Promise<Importantwort> {
  try {
    const ergebnis = await importiereArtikelstamm(prisma, await betriebId(), csvText, {
      nurVorschau: true,
    })
    return { art: 'ok', ergebnis }
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }
}

/** Schreibt den Stamm. Fehlerzeilen schreibt der Import nie — sie stehen im Protokoll. */
export async function importAusfuehren(csvText: string): Promise<Importantwort> {
  try {
    const ergebnis = await importiereArtikelstamm(prisma, await betriebId(), csvText)

    // Dieselben Pfade wie nach jeder Stammänderung: Liste, Startseite
    // (zählt aktive Artikel), Bestellvorschlag (rechnet über den Stamm).
    revalidatePath('/artikel')
    revalidatePath('/')
    revalidatePath('/bestellungen/vorschlag')

    return { art: 'ok', ergebnis }
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }
}
