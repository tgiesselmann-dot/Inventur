/**
 * Die Abfragen hinter den offenen Punkten.
 *
 * Getrennt von src/lib/offene-punkte.ts, weil dort die Regel steht, ab wann
 * etwas offen ist, und hier der Datenbankzugriff: die Regel soll ohne Datenbank
 * prüfbar bleiben. Dasselbe Paar wie src/lib/auswertung.ts und
 * src/lib/auswertung-daten.ts.
 *
 * Hier wird nichts entschieden und nichts gerechnet — hier wird geholt.
 */

import { Abweichungsart, Abweichungsstatus } from '@/generated/prisma/enums'
import { heute } from '@/lib/datum'
import type { Offenlage } from '@/lib/offene-punkte'
import { prisma } from '@/lib/prisma'

export async function offenlage(betriebId: string): Promise<Offenlage> {
  const [letzterImport, ohneZuordnung, leereLieferungen, preisabweichungen] = await Promise.all([
    prisma.umsatzimport.findFirst({
      where: { betriebId },
      orderBy: { zeitraumBis: 'desc' },
      select: { zeitraumBis: true },
    }),
    // Offen heisst: noch nicht bestätigt. Ein übernommener Vorschlag zählt mit
    // — er ist geraten, bis jemand ihn geprüft hat. Dieselbe Zählung wie in
    // src/app/umsatz/page.tsx.
    prisma.kassenartikel.count({ where: { betriebId, bestaetigt: false } }),
    // Ohne Obergrenze: eine gekappte Liste hiesse "fünf offen" an der
    // Bereichszeile, während acht Lieferungen unerfasst sind. Der Fall ist
    // selten, und wenn er eintritt, ist die lange Liste die richtige Antwort.
    prisma.lieferung.findMany({
      where: { betriebId, positionen: { none: {} } },
      orderBy: { datum: 'desc' },
      select: { id: true, datum: true, lieferant: true },
    }),
    // Ein Eintrag je Abweichung; zu Punkten je Lieferung gruppiert wird in
    // offene-punkte.ts — das ist Regel, nicht Abfrage. Jüngste Lieferung
    // zuerst, wie bei den leeren Lieferungen.
    //
    // Nur geprüfte Lieferungen: "Preise klären" ist der Nachbildschirm der
    // Bestätigung. Vorher ist die Rampe noch dran — und ein erneutes Speichern
    // der Position ersetzt ihre Abweichungen, eine vorher getroffene
    // Entscheidung wäre damit stillschweigend wieder offen.
    prisma.abweichung.findMany({
      where: {
        betriebId,
        art: Abweichungsart.PREISABWEICHUNG,
        status: Abweichungsstatus.OFFEN,
        lieferposition: { lieferung: { geprueftAm: { not: null } } },
      },
      orderBy: { lieferposition: { lieferung: { datum: 'desc' } } },
      select: {
        lieferposition: {
          select: { lieferung: { select: { id: true, lieferant: true } } },
        },
      },
    }),
  ])

  return {
    heute: heute(),
    umsatzBis: letzterImport?.zeitraumBis ?? null,
    ohneZuordnung,
    lieferungenOhnePositionen: leereLieferungen,
    preisabweichungen: preisabweichungen.map((abweichung) => ({
      lieferungId: abweichung.lieferposition.lieferung.id,
      lieferant: abweichung.lieferposition.lieferung.lieferant,
    })),
  }
}
