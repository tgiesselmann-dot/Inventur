/**
 * Legt den Betrieb an und importiert den Artikelstamm aus
 * fixtures/artikelstamm-stadthafen.csv.
 *
 * Die Abbildung der Excel-Spalten auf das Modell steht nicht hier, sondern in
 * src/lib/artikelimport.ts — dieselbe Funktion, die auch ein späterer Upload
 * über die Oberfläche benutzt. Dieses Skript liest die Datei, ruft den Import
 * und schreibt das Protokoll; ein zweiter Parser entstünde sonst genau hier.
 *
 * Idempotent: der Import gleicht über (name, lieferGebindeText) ab und lässt
 * sich beliebig oft wiederholen.
 *
 * Aufruf: npm run db:seed
 * Mit --vorschau wird nur gerechnet, nicht geschrieben.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrismaPg } from '@prisma/adapter-pg'

import { importiereArtikelstamm } from '../src/lib/artikelimport'
import { PrismaClient } from '../src/generated/prisma/client'

// Über `prisma db seed` lädt prisma.config.ts die Datei bereits; per
// `npm run db:seed` läuft dieses Skript ohne die CLI und muss selbst laden.
// Doppeltes Laden schadet nicht, gesetzte Variablen bleiben erhalten.
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local nicht vorhanden — Variablen kommen aus der Umgebung.
}

const BETRIEB_NAME = 'Stadthafen Recklinghausen'
const FIXTURE = fileURLToPath(new URL('../fixtures/artikelstamm-stadthafen.csv', import.meta.url))

async function main() {
  const nurVorschau = process.argv.includes('--vorschau')

  // Die CLI-Verbindung: Session-Pooler auf 5432. Ein einmalig laufendes Skript
  // braucht keinen Transaction-Pooler, und die lange Import-Transaktion liegt
  // auf einer Session-gebundenen Verbindung ohnehin besser.
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL oder DATABASE_URL muss gesetzt sein')

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })

  try {
    const betrieb =
      (await prisma.betrieb.findFirst({ where: { name: BETRIEB_NAME } })) ??
      (await prisma.betrieb.create({ data: { name: BETRIEB_NAME } }))
    console.log(`Betrieb: ${betrieb.name} (${betrieb.id})`)
    console.log(`Datei:   ${FIXTURE}`)

    const ergebnis = await importiereArtikelstamm(
      prisma,
      betrieb.id,
      readFileSync(FIXTURE, 'utf8'),
      { nurVorschau },
    )

    console.log(
      `\n${nurVorschau ? 'Vorschau' : 'Import'}: ` +
        `${ergebnis.neu} neu, ${ergebnis.geaendert} geändert, ` +
        `${ergebnis.unveraendert} unverändert, ${ergebnis.fehlerhaft} fehlerhaft` +
        (ergebnis.unvollstaendig > 0 ? `, davon ${ergebnis.unvollstaendig} ohne EK-Preis` : ''),
    )

    if (ergebnis.fehler.length > 0) {
      console.log('\nÜBERSPRUNGEN:')
      for (const { zeile, meldung, name } of ergebnis.fehler)
        console.log(`  Zeile ${zeile}: ${meldung}${name ? ` (${name})` : ''}`)
    }

    // excel_zeile, original_excel und pruefen haben keine Zielspalte; was aus
    // ihnen folgt, gehört ins Protokoll und nicht in die Datenbank.
    if (ergebnis.hinweise.length > 0) {
      console.log('\nHINWEISE:')
      for (const { zeile, meldung } of ergebnis.hinweise) console.log(`  Zeile ${zeile}: ${meldung}`)
    }

    if (!nurVorschau) {
      const gesamt = await prisma.artikel.count({ where: { betriebId: betrieb.id } })
      console.log(`\n${gesamt} Artikel im Bestand.`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

await main()
