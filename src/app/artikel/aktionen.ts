'use server'

/**
 * Serveraktionen des Artikelstamms: anlegen und speichern.
 *
 * Gelöscht wird hier nichts. Ein Artikel, an dem Zählungen und Lieferungen
 * hängen, wird über den Aktiv-Schalter stillgelegt und bleibt im Stamm — eine
 * Löschaktion gibt es deshalb bewusst nicht.
 *
 * Das Lesen und Prüfen des Formulars steht in src/lib/artikelstamm.ts und ist
 * dort getestet; hier steht nur, was mit dem gelesenen Satz passiert. Dadurch
 * kommt der Feldname der Gebindegrösse in dieser Datei nicht vor — die Aktion
 * reicht den fertigen Satz durch, statt seine Felder anzufassen.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { aktuellerBetrieb } from '@/lib/anmeldung'
import { leseArtikelformular } from '@/lib/artikelstamm'
import { prisma } from '@/lib/prisma'

export type Speicherzustand =
  | { art: 'leer' }
  | { art: 'gespeichert' }
  | { art: 'fehler'; meldung: string }

/**
 * Prisma meldet eine verletzte Unique-Constraint als P2002 — hier ist das
 * immer (betriebId, name, lieferGebindeText): denselben Namen im selben
 * Gebinde gibt es schon. Die Meldung soll das sagen, nicht "P2002".
 */
function istDoppelt(ursache: unknown): boolean {
  return (
    typeof ursache === 'object' &&
    ursache !== null &&
    'code' in ursache &&
    (ursache as { code: unknown }).code === 'P2002'
  )
}

function doppeltMeldung(name: string, gebinde: string): string {
  return `„${name}" mit Gebinde „${gebinde}" gibt es schon — derselbe Artikel darf nur je Gebindegrösse einmal im Stamm stehen`
}

/**
 * Nach jeder Änderung am Stamm neu lesen: die Liste selbst, die Startseite
 * (sie zählt die aktiven Artikel) und den Bestellvorschlag, der über den
 * Stamm rechnet.
 */
function stammNeuLesen(): void {
  revalidatePath('/artikel')
  revalidatePath('/')
  revalidatePath('/bestellungen/vorschlag')
}

/** Legt einen neuen Artikel an und führt auf seine Detailseite. */
export async function artikelAnlegen(
  _vorher: Speicherzustand,
  formular: FormData,
): Promise<Speicherzustand> {
  let ziel: string
  try {
    const betrieb = await aktuellerBetrieb()

    const satz = leseArtikelformular(formular)

    let artikelId: string
    try {
      const artikel = await prisma.artikel.create({ data: { ...satz, betriebId: betrieb.id } })
      artikelId = artikel.id
    } catch (ursache) {
      if (istDoppelt(ursache)) throw new Error(doppeltMeldung(satz.name, satz.lieferGebindeText))
      throw ursache
    }

    stammNeuLesen()
    ziel = `/artikel/${artikelId}`
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }

  // Ausserhalb des try: `redirect` arbeitet über eine Ausnahme, die der
  // catch-Zweig sonst als Fehlermeldung anzeigen würde.
  redirect(ziel)
}

/** Schreibt einen bestehenden Artikel neu. */
export async function artikelSpeichern(
  _vorher: Speicherzustand,
  formular: FormData,
): Promise<Speicherzustand> {
  try {
    const id = String(formular.get('artikelId') ?? '')
    if (id === '') throw new Error('Kein Artikel angegeben')

    // Über Id und Betrieb gesucht: die Id kommt aus einem Formular, und ein
    // Formular kann jede Id tragen.
    const betrieb = await aktuellerBetrieb()
    const artikel = await prisma.artikel.findFirst({ where: { id, betriebId: betrieb.id } })
    if (artikel === null) throw new Error('Artikel nicht gefunden')

    const satz = leseArtikelformular(formular)

    try {
      await prisma.artikel.update({ where: { id }, data: satz })
    } catch (ursache) {
      if (istDoppelt(ursache)) throw new Error(doppeltMeldung(satz.name, satz.lieferGebindeText))
      throw ursache
    }

    stammNeuLesen()
    revalidatePath(`/artikel/${id}`)

    return { art: 'gespeichert' }
  } catch (ursache) {
    return { art: 'fehler', meldung: ursache instanceof Error ? ursache.message : String(ursache) }
  }
}
