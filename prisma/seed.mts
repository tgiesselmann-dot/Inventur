/**
 * Importiert den Artikelstamm aus fixtures/artikelstamm-stadthafen.csv.
 *
 * Die Fixture ist eine Abschrift der bisherigen Inventur-Excel und trägt deren
 * Spalten (packungsgroesse, einheit, ek_preis_gebinde_eur). Dieses Skript bildet
 * sie auf das neue Modell ab, das Liefergebinde und Zähleinheit trennt.
 *
 * Idempotent: der Import läuft über upsert auf (betriebId, name,
 * lieferGebindeText) und lässt sich beliebig oft wiederholen.
 *
 * Aufruf: npm run db:seed
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { Decimal } from '@prisma/client/runtime/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { deutscheZahl, parseCsvMitKopf } from '../src/lib/csv'
import { PrismaClient } from '../src/generated/prisma/client'
import { EkPreisBezug, Gebindeart, Zaehlmodus } from '../src/generated/prisma/enums'

const BETRIEB_NAME = 'Stadthafen Recklinghausen'
const FIXTURE = fileURLToPath(new URL('../fixtures/artikelstamm-stadthafen.csv', import.meta.url))

/**
 * Kategorien, deren Artikel portioniert ausgeschenkt werden. Sie werden gezählt,
 * taugen aber nicht zur Schwundrechnung: aus einer 0,7er Flasche Gin gehen
 * zwanzig Gläser, und wie voll die angebrochene Flasche im Regal noch ist, sagt
 * keine Zählung genau genug.
 */
const NICHT_SCHWUNDFAEHIG = new Set(['Spirituosen', 'Likoer', 'Aperitif', 'Barzutat'])

/** Erkennt in der pruefen-Spalte den Vermerk zu den 6er-Lieferungen. */
const SECHSER_VERMERK = /geliefert als 6er/i

type Zeile = Record<string, string>

type Abbildung = {
  name: string
  kategorie: string
  sortierung: number
  lieferGebindeText: string
  einheitenProGebinde: number
  einheitsgroesseLiter: Decimal
  gebindeart: Gebindeart
  zaehlmodus: Zaehlmodus
  ekPreisCent: number | null
  ekPreisBezug: EkPreisBezug
  schwundfaehig: boolean
}

/** Euro als deutsche Dezimalzahl in ganze Cent, ohne Umweg über Fliesskomma. */
function euroInCent(text: string): number | null {
  const zahl = deutscheZahl(text)
  if (zahl === null) return null
  return new Decimal(zahl).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

function pflichtZahl(text: string, feld: string, zeile: Zeile): string {
  const zahl = deutscheZahl(text)
  if (zahl === null) throw new Error(`${feld} fehlt bei "${zeile.name}" (Excel-Zeile ${zeile.excel_zeile})`)
  return zahl
}

function bilde(zeile: Zeile): Abbildung {
  const packungsgroesse = Number(pflichtZahl(zeile.packungsgroesse, 'packungsgroesse', zeile))
  const istFass = zeile.einheit === 'FASS'
  // Drei Weine sind in der Excel als Einzelflasche geführt, weil dort nur eine
  // Zahl Platz hatte — geliefert werden sie im 6er-Karton. Das neue Modell hält
  // beides auseinander, also wird der Vermerk hier ausgewertet.
  const alsSechserGeliefert = SECHSER_VERMERK.test(zeile.pruefen ?? '')

  const einheitenProGebinde = alsSechserGeliefert ? 6 : packungsgroesse
  const einzelnGezaehlt = packungsgroesse === 1 && !istFass

  const gebindeart = istFass
    ? Gebindeart.FASS
    : alsSechserGeliefert
      ? Gebindeart.KARTON
      : packungsgroesse > 1
        ? Gebindeart.KASTEN
        : Gebindeart.EINZELFLASCHE

  const zaehlmodus = istFass
    ? Zaehlmodus.FASS
    : einzelnGezaehlt
      ? Zaehlmodus.EINZELN
      : Zaehlmodus.GEBINDE_PLUS_EINZELN

  // Der Preis der 6er-Weine steht in der Excel je Flasche, nicht je Karton.
  const ekPreisBezug =
    einzelnGezaehlt || alsSechserGeliefert ? EkPreisBezug.PRO_EINHEIT : EkPreisBezug.PRO_GEBINDE

  const einheitsgroesseLiter = new Decimal(
    pflichtZahl(zeile.gebindegroesse_liter, 'gebindegroesse_liter', zeile),
  )

  // Der Anzeigetext muss zum Gebinde passen, sonst steht "1 x 0,75" an einem
  // Karton mit sechs Flaschen.
  const lieferGebindeText = alsSechserGeliefert
    ? `6 x ${einheitsgroesseLiter.toString().replace('.', ',')}`
    : zeile.gebinde_text

  return {
    name: zeile.name,
    kategorie: zeile.kategorie,
    sortierung: Number(pflichtZahl(zeile.sortierung, 'sortierung', zeile)),
    lieferGebindeText,
    einheitenProGebinde,
    einheitsgroesseLiter,
    gebindeart,
    zaehlmodus,
    ekPreisCent: euroInCent(zeile.ek_preis_gebinde_eur),
    ekPreisBezug,
    schwundfaehig: !NICHT_SCHWUNDFAEHIG.has(zeile.kategorie),
  }
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL oder DATABASE_URL muss gesetzt sein')

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    const zeilen = parseCsvMitKopf(readFileSync(FIXTURE, 'utf8'))
    console.log(`Fixture gelesen: ${zeilen.length} Zeilen aus ${FIXTURE}`)

    const betrieb =
      (await prisma.betrieb.findFirst({ where: { name: BETRIEB_NAME } })) ??
      (await prisma.betrieb.create({ data: { name: BETRIEB_NAME } }))
    console.log(`Betrieb: ${betrieb.name} (${betrieb.id})`)

    const ohnePreis: string[] = []
    const umgedeutet: string[] = []

    for (const zeile of zeilen) {
      const artikel = bilde(zeile)

      if (artikel.ekPreisCent === null) {
        ohnePreis.push(`${artikel.name} (Excel-Zeile ${zeile.excel_zeile})`)
      }
      if (SECHSER_VERMERK.test(zeile.pruefen ?? '')) {
        umgedeutet.push(`${artikel.name}: "${zeile.gebinde_text}" → "${artikel.lieferGebindeText}", KARTON à 6`)
      }

      await prisma.artikel.upsert({
        where: {
          betriebId_name_lieferGebindeText: {
            betriebId: betrieb.id,
            name: artikel.name,
            lieferGebindeText: artikel.lieferGebindeText,
          },
        },
        update: artikel,
        create: { ...artikel, betriebId: betrieb.id },
      })
    }

    // Protokoll. excel_zeile, original_excel und pruefen haben keine Zielspalte;
    // sie sind die Rückverfolgung zur Quelle und gehören deshalb hierhin.
    const gesamt = await prisma.artikel.count({ where: { betriebId: betrieb.id } })
    console.log(`\n${zeilen.length} Zeilen verarbeitet, ${gesamt} Artikel im Bestand.`)

    if (umgedeutet.length > 0) {
      console.log(`\nAls 6er-Karton übernommen (in der Excel als Einzelflasche geführt):`)
      for (const eintrag of umgedeutet) console.log(`  - ${eintrag}`)
    }

    if (ohnePreis.length > 0) {
      console.log(`\nOHNE EK-PREIS übernommen — bitte nachtragen, der Bestand ist sonst nicht bewertbar:`)
      for (const eintrag of ohnePreis) console.log(`  - ${eintrag}`)
    }

    const mitHinweis = zeilen.filter((z) => (z.pruefen ?? '') !== '').length
    console.log(
      `\n${mitHinweis} der ${zeilen.length} Zeilen tragen einen pruefen-Hinweis aus der Excel-Abschrift.`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

await main()
