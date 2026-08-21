/**
 * Trägt die Gebinderegeln der Stadthafener Lager ein — einmalige Einrichtung,
 * beliebig oft wiederholbar.
 *
 *   Theke            Nur Flaschen; Ausnahmen: beide Maisels (20 x 0,5)
 *   Kiosk            Nur Flaschen
 *   Blauer Container Nur Flaschen; Ausnahmen: Cola, Fanta, Sprite als 12 x 1,0
 *   Kühlcontainer    Nur ganze Kästen
 *
 * Die Orte sind Nutzerdaten und heissen, wie sie angelegt wurden. Gesucht wird
 * deshalb ohne Rücksicht auf Gross- und Kleinschreibung; ein nicht gefundener
 * Ort wird gemeldet statt angelegt — ein Tippfehler hier soll kein fünftes
 * Lager erzeugen. Ausnahmen werden ergänzt, nie entfernt: was über die
 * Oberfläche dazukam, bleibt stehen und wird nur berichtet.
 *
 * Aufruf: npx tsx prisma/gebinde-regeln-stadthafen.mts
 */

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../src/generated/prisma/client'
import { GebindeRegel } from '../src/generated/prisma/enums'

try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local nicht vorhanden — Variablen kommen aus der Umgebung.
}

const BETRIEB_NAME = 'Stadthafen Recklinghausen'

/** Artikel werden wie überall über (name, lieferGebindeText) angesprochen. */
type Artikelschluessel = { name: string; lieferGebindeText: string }

const REGELN: { ort: string; regel: GebindeRegel; ausnahmen: Artikelschluessel[] }[] = [
  {
    ort: 'Theke',
    regel: GebindeRegel.NUR_EINZELN,
    ausnahmen: [
      { name: 'Maisels', lieferGebindeText: '20 x 0,5' },
      { name: 'Maisels 0,00%', lieferGebindeText: '20 x 0,5' },
    ],
  },
  { ort: 'Kiosk', regel: GebindeRegel.NUR_EINZELN, ausnahmen: [] },
  {
    ort: 'Blauer Container',
    regel: GebindeRegel.NUR_EINZELN,
    ausnahmen: [
      { name: 'Coca Cola', lieferGebindeText: '12 x 1,0' },
      { name: 'Fanta', lieferGebindeText: '12 x 1,0' },
      { name: 'Sprite', lieferGebindeText: '12 x 1,0' },
    ],
  },
  { ort: 'Kühlcontainer', regel: GebindeRegel.NUR_GEBINDE, ausnahmen: [] },
]

/** Dieselbe Angleichung wie beim Anlegen eines Ortes in src/lib/lagerorte.ts. */
function vergleichbar(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL oder DATABASE_URL muss gesetzt sein')

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })
  let fehler = 0

  try {
    const betrieb = await prisma.betrieb.findFirst({ where: { name: BETRIEB_NAME } })
    if (betrieb === null) throw new Error(`Betrieb "${BETRIEB_NAME}" nicht gefunden`)

    const orte = await prisma.lagerort.findMany({
      where: { betriebId: betrieb.id },
      include: {
        gebindeausnahmen: {
          include: { artikel: { select: { name: true, lieferGebindeText: true } } },
        },
      },
    })

    for (const eintrag of REGELN) {
      const ort = orte.find((zeile) => vergleichbar(zeile.name) === vergleichbar(eintrag.ort))
      if (ort === undefined) {
        console.error(
          `FEHLT: Lagerort "${eintrag.ort}" gibt es nicht. Vorhanden: ${orte
            .map((zeile) => `"${zeile.name}"`)
            .join(', ')}`,
        )
        fehler += 1
        continue
      }

      await prisma.lagerort.update({
        where: { id: ort.id },
        data: { gebindeRegel: eintrag.regel },
      })
      console.log(`${ort.name}: Regel ${eintrag.regel}`)

      for (const schluessel of eintrag.ausnahmen) {
        const artikel = await prisma.artikel.findFirst({
          where: { betriebId: betrieb.id, ...schluessel },
        })
        if (artikel === null) {
          console.error(
            `FEHLT: Artikel "${schluessel.name}" (${schluessel.lieferGebindeText}) nicht gefunden`,
          )
          fehler += 1
          continue
        }

        await prisma.gebindeausnahme.createMany({
          data: [{ betriebId: betrieb.id, lagerortId: ort.id, artikelId: artikel.id }],
          skipDuplicates: true,
        })
        console.log(`  Ausnahme: ${artikel.name} · ${artikel.lieferGebindeText}`)
      }

      // Nur berichten, nie löschen: was über die Oberfläche dazukam, bleibt.
      const gewollt = new Set(
        eintrag.ausnahmen.map((schluessel) => `${schluessel.name}|${schluessel.lieferGebindeText}`),
      )
      for (const ausnahme of ort.gebindeausnahmen) {
        const schluessel = `${ausnahme.artikel.name}|${ausnahme.artikel.lieferGebindeText}`
        if (!gewollt.has(schluessel)) {
          console.log(
            `  Hinweis: weitere Ausnahme bleibt stehen — ${ausnahme.artikel.name} · ${ausnahme.artikel.lieferGebindeText}`,
          )
        }
      }
    }
  } finally {
    await prisma.$disconnect()
  }

  if (fehler > 0) {
    console.error(`${fehler} Eintrag/Einträge konnten nicht gesetzt werden.`)
    process.exitCode = 1
  }
}

await main()
