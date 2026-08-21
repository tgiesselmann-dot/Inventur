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

import { Zaehlmodus } from '@/generated/prisma/enums'
import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { istKennung } from '@/lib/kennung'
import {
  darfGeloeschtWerden,
  darfStillgelegtWerden,
  istGebindeRegel,
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
 * Setzt die Gebinderegel eines Ortes — welche Zählfelder er zulässt.
 *
 * Die Regel wirkt ab der nächsten Eingabe, nicht rückwirkend: schon gezählte
 * Werte bleiben stehen, wie sie erfasst wurden. Was sie für einen Artikel
 * bedeutet, entscheidet `felder()` in src/lib/zaehlung.ts — hier wird nur
 * gespeichert.
 */
export async function gebindeRegelSetzen(formular: FormData) {
  const id = String(formular.get('id') ?? '')
  if (!istKennung(id)) redirect(SEITE)

  const regel = String(formular.get('regel') ?? '')
  if (!istGebindeRegel(regel)) redirect(SEITE)

  const { betrieb } = await pflichtBetriebsleiter()
  await prisma.lagerort.updateMany({
    where: { id, betriebId: betrieb.id },
    data: { gebindeRegel: regel },
  })

  revalidatePath(SEITE)
  redirect(SEITE)
}

/**
 * Nimmt einen Artikel von der Gebinderegel seines Ortes aus — er zählt dort
 * wieder mit beiden Feldern. Die Maisels-Kästen an der Theke.
 *
 * Nur Artikel mit Zählmodus GEBINDE_PLUS_EINZELN: bei allen anderen gäbe es
 * nichts auszunehmen, die Regel fasst sie gar nicht an.
 */
export async function ausnahmeHinzufuegen(formular: FormData) {
  const id = String(formular.get('id') ?? '')
  const artikelId = String(formular.get('artikelId') ?? '')
  if (!istKennung(id) || !istKennung(artikelId)) redirect(SEITE)

  const { betrieb } = await pflichtBetriebsleiter()

  // Beide über den Betrieb gesucht: Fremdes ist schlicht nicht gefunden.
  const ort = await prisma.lagerort.findFirst({ where: { id, betriebId: betrieb.id } })
  const artikel = await prisma.artikel.findFirst({
    where: {
      id: artikelId,
      betriebId: betrieb.id,
      aktiv: true,
      zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
    },
  })
  if (ort === null || artikel === null) redirect(SEITE)

  // skipDuplicates statt Fehler: eine schon bestehende Ausnahme noch einmal
  // anzulegen ist kein Fehlerfall, sondern ein doppelter Tipp.
  await prisma.gebindeausnahme.createMany({
    data: [{ betriebId: betrieb.id, lagerortId: ort.id, artikelId: artikel.id }],
    skipDuplicates: true,
  })

  revalidatePath(SEITE)
  redirect(SEITE)
}

/** Entfernt eine Ausnahme — der Artikel folgt wieder der Regel seines Ortes. */
export async function ausnahmeEntfernen(formular: FormData) {
  const ausnahmeId = String(formular.get('ausnahmeId') ?? '')
  if (!istKennung(ausnahmeId)) redirect(SEITE)

  const { betrieb } = await pflichtBetriebsleiter()
  await prisma.gebindeausnahme.deleteMany({
    where: { id: ausnahmeId, betriebId: betrieb.id },
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
