'use server'

/**
 * Serveraktionen der Lagerortverwaltung.
 *
 * Jede Aktion lädt die Orte des Betriebs, entscheidet mit den Regeln aus
 * src/lib/lagerorte.ts und schreibt erst dann. Die Regeln stehen dort und nicht
 * hier, damit sie ohne Datenbank prüfbar bleiben — diese Datei ist der Weg zur
 * Tabelle, nicht die Stelle, an der entschieden wird.
 *
 * Fehler reisen als Suchparameter zurück an die Seite. Das ist dasselbe Muster
 * wie in der Einrichtung: die Seite bleibt eine Serverkomponente, und für vier
 * Formulare lohnt kein Client-Zustand.
 *
 * Gelesen wird durchweg über `betriebId` — ein fremder Ort ist damit schlicht
 * nicht gefunden und wird folgerichtig nicht geändert.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { istKennung } from '@/lib/kennung'
import {
  darfGeloeschtWerden,
  darfStillgelegtWerden,
  nameGeprueft,
  type Lagerortzeile,
} from '@/lib/lagerorte'
import { prisma } from '@/lib/prisma'

const SEITE = '/lagerorte'

/** Die Orte eines Betriebs mit der Zahl ihrer Zählwerte — die Form der Regeln. */
async function zeilen(betriebId: string): Promise<Lagerortzeile[]> {
  const orte = await prisma.lagerort.findMany({
    where: { betriebId },
    // Anlagereihenfolge: die Schlüssel sind UUIDv7 und damit zeitgeordnet. Ein
    // Reihenfolgefeld gibt es bewusst nicht — es läse sich als Vorschrift, in
    // welcher Reihenfolge zu zählen sei.
    orderBy: { id: 'asc' },
    include: { _count: { select: { zaehlpositionen: true } } },
  })

  return orte.map((ort) => ({
    id: ort.id,
    name: ort.name,
    aktiv: ort.aktiv,
    positionen: ort._count.zaehlpositionen,
  }))
}

export async function lagerortAnlegen(formular: FormData) {
  const { betrieb } = await pflichtBetriebsleiter()
  const vorhanden = await zeilen(betrieb.id)

  const geprueft = nameGeprueft(String(formular.get('name') ?? ''), vorhanden)
  if (geprueft.art === 'fehler') redirect(`${SEITE}?fehler=${geprueft.grund}`)

  await prisma.lagerort.create({ data: { betriebId: betrieb.id, name: geprueft.name } })

  revalidatePath(SEITE)
  redirect(SEITE)
}

export async function lagerortUmbenennen(formular: FormData) {
  const id = String(formular.get('id') ?? '')
  if (!istKennung(id)) redirect(SEITE)

  const { betrieb } = await pflichtBetriebsleiter()
  const vorhanden = await zeilen(betrieb.id)
  if (!vorhanden.some((ort) => ort.id === id)) redirect(SEITE)

  const geprueft = nameGeprueft(String(formular.get('name') ?? ''), vorhanden, id)
  if (geprueft.art === 'fehler') redirect(`${SEITE}?fehler=${geprueft.grund}&ort=${id}`)

  // Über beide Schlüssel: ein fremder Ort wird nicht getroffen.
  await prisma.lagerort.updateMany({
    where: { id, betriebId: betrieb.id },
    data: { name: geprueft.name },
  })

  revalidatePath(SEITE)
  redirect(SEITE)
}

/**
 * Legt einen Ort still oder holt ihn zurück.
 *
 * Stilllegen ist der Normalfall des Aufhörens: die Zählwerte bleiben, der Ort
 * verschwindet nur aus der Auswahl beim Zählen und aus der Bedingung, dass
 * jeder aktive Ort fertig gemeldet sein muss.
 */
export async function lagerortUmschalten(formular: FormData) {
  const id = String(formular.get('id') ?? '')
  if (!istKennung(id)) redirect(SEITE)

  const { betrieb } = await pflichtBetriebsleiter()
  const vorhanden = await zeilen(betrieb.id)
  const ort = vorhanden.find((eintrag) => eintrag.id === id)
  if (ort === undefined) redirect(SEITE)

  if (ort.aktiv) {
    const erlaubt = darfStillgelegtWerden(vorhanden, id)
    if (erlaubt.art === 'nein') redirect(`${SEITE}?fehler=letzter&ort=${id}`)
  }

  await prisma.lagerort.updateMany({
    where: { id, betriebId: betrieb.id },
    data: { aktiv: !ort.aktiv },
  })

  revalidatePath(SEITE)
  redirect(SEITE)
}

/**
 * Löscht einen Ort — nur solange nie an ihm gezählt wurde.
 *
 * Der Ausweg aus dem Vertipper beim Anlegen und sonst nichts. Sobald ein
 * Zählwert daran hängt, bleibt allein das Stilllegen; die Rückfrage dazu stellt
 * die Oberfläche, hier kommt nur an, was bestätigt wurde.
 */
export async function lagerortLoeschen(formular: FormData) {
  const id = String(formular.get('id') ?? '')
  if (!istKennung(id)) redirect(SEITE)

  const { betrieb } = await pflichtBetriebsleiter()
  const vorhanden = await zeilen(betrieb.id)
  const ort = vorhanden.find((eintrag) => eintrag.id === id)
  if (ort === undefined) redirect(SEITE)

  if (!darfGeloeschtWerden(ort)) redirect(`${SEITE}?fehler=gezaehlt&ort=${id}`)

  await prisma.lagerort.deleteMany({ where: { id, betriebId: betrieb.id } })

  revalidatePath(SEITE)
  redirect(SEITE)
}
