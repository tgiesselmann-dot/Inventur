/**
 * Gleicht die Kassenzuordnungen an das Getränkemanual 2026 an
 * (Stadthafen_Getraenkemanual_Premium_2026_vollstaendig.docx, freigegeben am
 * 10.08.2026).
 *
 * Drei Sorten Änderungen:
 *  1. Rezepturen auf die verbindlichen Mengen des Manuals setzen — inklusive
 *     der bisher fehlenden zweiten Zutaten (Rum im Mojito, Cola im
 *     Dünenbrand Cola), die sonst als Schwund auftauchen.
 *  2. Bisher leere Bezeichnungen zuordnen (III-Freunde-Weine, Moet Ice,
 *     Eistee Pfirsich als Fassbrause, Bon Voyage Rotwein aus dem
 *     Dörlemann-Bestellformular — der Artikel wird bei Bedarf angelegt).
 *  3. Extrawünsche, die fälschlich Bestand buchten ("Mehr Cola",
 *     "Schuss Cola"), auf übergangen setzen.
 *
 * Die Umrechnung cl -> Einheitenanteil läuft über anteilJeAusschank aus
 * src/lib/einheiten.ts — hier wird nichts selbst gerechnet.
 *
 * Idempotent: Zielzustand wird verglichen und nur Abweichendes geschrieben.
 * Aufruf: npx tsx prisma/rezepturen-manual-2026.mts [--vorschau]
 */

import { PrismaPg } from '@prisma/adapter-pg'

import { anteilJeAusschank } from '../src/lib/einheiten'
import { PrismaClient } from '../src/generated/prisma/client'
import { EkPreisBezug, Zaehlmodus } from '../src/generated/prisma/enums'

try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local nicht vorhanden — Variablen kommen aus der Umgebung.
}

const BETRIEB_NAME = 'Stadthafen Recklinghausen'
const NOTIZ_MANUAL = 'Getränkemanual 2026'
const NOTIZ_EXTRAWUNSCH = 'Extrawunsch — bucht keinen Bestand (Getränkemanual 2026)'

/** Artikelschlüssel: Name + Liefergebinde, wie im Stamm eindeutig. */
type ArtikelKey = readonly [name: string, gebinde: string]

/** Eine Zutat: Ausschank in Litern oder ganze Einheiten (Flasche, Dose). */
type Zutat = { artikel: ArtikelKey; liter?: string; einheiten?: number }

const APEROL: ArtikelKey = ['Aperol', '1 x 1,0']
const LILLET: ArtikelKey = ['Lillet Blanc', '1 x 0,7']
const SARTI: ArtikelKey = ['Sarti Spritz', '1 x 0,7']
const CAMPARI: ArtikelKey = ['Campari', '1 x 1,0']
const LIMONCELLO: ArtikelKey = ['Limoncello Scavi & Ray', '1 x 0,7']
const MARA_LIKOER: ArtikelKey = ['Maracuja-Vanille Likoer', '1 x 0,7']
const FLOREALE: ArtikelKey = ['Martini Floreale', '1 x 0,7']
const RAMAZZOTTI: ArtikelKey = ['Ramazzotti', '1 x 1,0']
const PROSECCO: ArtikelKey = ['Leonardo Prosecco (zum mischen)', '6 x 0,75']
const SODA: ArtikelKey = ['Salinger Mineral (Perso- und Mischwasser)', '12 x 0,75']
const WILD_BERRY: ArtikelKey = ['Schweppes Wild Berry', '6 x 1,0']
const WHITE_PEACH: ArtikelKey = ['Schweppes White Peach', '6 x 1,0']
const TONIC: ArtikelKey = ['Schweppes Tonic Water', '6 x 1,0']
const GINGER_ALE: ArtikelKey = ['Schweppes Ginger Ale', '6 x 1,0']
const BITTER_LEMON: ArtikelKey = ['Schweppes Bitter Lemon', '6 x 1,0']
const KIRSCHSAFT: ArtikelKey = ['Mueller Kirschsaft', '6 x 1']
const VODKA_07: ArtikelKey = ['Dockside Vodka', '1 x 0,7']
const VODKA_05: ArtikelKey = ['Dockside Vodka', '1 x 0,5']
const GIN: ArtikelKey = ['Sudmare Gin', '1 x 0,7']
const DUENENBRAND: ArtikelKey = ['Duenenbrand Rum', '1 x 0,5']
const BACUBA_HELL: ArtikelKey = ['Bacuba Rum Hell', '1 x 1,0']
const BACUBA_DUNKEL: ArtikelKey = ['Bacuba Rum Dunkel', '1 x 1,0']
const WILLIAMSBIRNE: ArtikelKey = ['Williamsbirne Doerlemann', '1 x 0,7']
const PFEFFI: ArtikelKey = ['Pfeffi Doerlemann', '1 x 0,7']
const CHOCO: ArtikelKey = ['Choco Praline Doerlemann', '1 x 0,7']
const PREMIX_ESPRESSO: ArtikelKey = ['Espresso Martini Premix 42below Tails', '1 x 1,0']
const PREMIX_MAITAI: ArtikelKey = ['Granini Saft Mai Tai', '6 x 1,0']
const PREMIX_MOJITO: ArtikelKey = ['Granini Saft Mojito', '6 x 1,0']
const PREMIX_PINA: ArtikelKey = ['Granini Saft Pina Colada', '6 x 1,0']
const PREMIX_SOTB: ArtikelKey = ['Granini Saft Sex on the beach', '6 x 1,0']
const PREMIX_PORNSTAR: ArtikelKey = ['Granini Saft Porn Star', '6 x 1,0']
const SAFT_ORANGE: ArtikelKey = ['Granini Saft Orange', '6 x 1,0']
const SAFT_APFEL: ArtikelKey = ['Granini Saft Apfel', '6 x 1,0']
const SAFT_MARACUJA: ArtikelKey = ['Granini Saft Maracuja', '6 x 1,0']
const SAFT_KIRSCHE: ArtikelKey = ['Granini Saft Kirsche', '6 x 1,0']
const COLA_1L: ArtikelKey = ['Coca Cola', '12 x 1,0']
const REDBULL: ArtikelKey = ['Redbull', '24 x 0,25']
const FASSBRAUSE_EISTEE: ArtikelKey = ['Veltins Fassbrause Eistee Pfirsich', '24 x 0,33']
const VELTINS_50: ArtikelKey = ['Veltins', '1 x 50,0']
const MAISELS: ArtikelKey = ['Maisels', '20 x 0,5']
const WEISS_OFFEN: ArtikelKey = ['Lergenmueller Grauburgunder', '6 x 0,75']
const ROSE_OFFEN: ArtikelKey = ['Lergenmueller Rose Saigner', '6 x 0,75']
const PFAFF_ROSE: ArtikelKey = ['Pfaffmann Rose', '1 x 0,75']
const PFAFF_GRAU: ArtikelKey = ['Pfaffmann Grauburgunder', '1 x 0,75']
const DREI_WEISSBURGUNDER: ArtikelKey = ['3-Freunde Weissburgunder', '1 x 0,75']
const DREI_ROSE: ArtikelKey = ['3-Freunde Rose', '1 x 0,75']
const DREI_SAUVIGNON: ArtikelKey = ['3-Freunde Sauvignon Blanc', '1 x 0,75']
const MERLOT: ArtikelKey = ['Bon Voyage Rotwein', '6 x 0,75']
const MOET_ICE: ArtikelKey = ['Moet Ice', '1 x 0,75']

/** Ziel-Rezepturen je Kassenbezeichnung, Mengen laut Manual. */
const REZEPTE: ReadonlyMap<string, readonly Zutat[]> = new Map([
  // --- Aperitifs & Spritz ---------------------------------------------------
  ['Aperol Spritz', [
    { artikel: APEROL, liter: '0.04' },
    { artikel: PROSECCO, liter: '0.06' },
    { artikel: SODA, liter: '0.02' },
  ]],
  ['Campari Spritz', [
    { artikel: CAMPARI, liter: '0.04' },
    { artikel: PROSECCO, liter: '0.06' },
    { artikel: SODA, liter: '0.02' },
  ]],
  ['Sarti Spritz', [
    { artikel: SARTI, liter: '0.05' },
    { artikel: PROSECCO, liter: '0.07' },
    { artikel: SODA, liter: '0.02' },
  ]],
  ['Limoncello Spritz', [
    { artikel: LIMONCELLO, liter: '0.05' },
    { artikel: PROSECCO, liter: '0.07' },
    { artikel: SODA, liter: '0.02' },
  ]],
  ['Maracuja Spritz', [
    { artikel: MARA_LIKOER, liter: '0.05' },
    { artikel: PROSECCO, liter: '0.07' },
    { artikel: SODA, liter: '0.02' },
  ]],
  ['Lillet Wild Berry', [
    { artikel: LILLET, liter: '0.05' },
    { artikel: WILD_BERRY, liter: '0.10' },
  ]],
  ['Lillet White Peach', [
    { artikel: LILLET, liter: '0.05' },
    { artikel: WHITE_PEACH, liter: '0.10' },
  ]],
  // 0,0 %: statt Lillet der alkoholfreie Aperitif des Hauses.
  ['Lillet Wild Berry 0,0%', [
    { artikel: FLOREALE, liter: '0.05' },
    { artikel: WILD_BERRY, liter: '0.10' },
  ]],
  ['Lillet White Peach 0,0%', [
    { artikel: FLOREALE, liter: '0.05' },
    { artikel: WHITE_PEACH, liter: '0.10' },
  ]],
  ['Martini Berry 0,0%', [
    { artikel: FLOREALE, liter: '0.05' },
    { artikel: WILD_BERRY, liter: '0.10' },
  ]],
  ['Martini Berry alkfrei', [
    { artikel: FLOREALE, liter: '0.05' },
    { artikel: WILD_BERRY, liter: '0.10' },
  ]],

  // --- Cocktails ------------------------------------------------------------
  ['Pornstar Martini', [
    { artikel: PREMIX_PORNSTAR, liter: '0.15' },
    { artikel: VODKA_07, liter: '0.04' },
  ]],
  ['Sex on the Beach', [
    { artikel: PREMIX_SOTB, liter: '0.15' },
    { artikel: VODKA_07, liter: '0.04' },
  ]],
  ['Mojito', [
    { artikel: PREMIX_MOJITO, liter: '0.15' },
    { artikel: BACUBA_HELL, liter: '0.05' },
  ]],
  ['Mai Tai', [
    { artikel: PREMIX_MAITAI, liter: '0.15' },
    { artikel: BACUBA_DUNKEL, liter: '0.04' },
  ]],
  ['Pina Colada', [
    { artikel: PREMIX_PINA, liter: '0.15' },
    { artikel: BACUBA_HELL, liter: '0.04' },
  ]],
  // Hausrealität: 12 cl Premix, kein einzelner Vodka/Kaffeelikör.
  ['Espresso Martini', [{ artikel: PREMIX_ESPRESSO, liter: '0.12' }]],
  // Die 0,0-%-Varianten nehmen nur den Premix.
  ['Sex on the Beach 0,0%', [{ artikel: PREMIX_SOTB, liter: '0.15' }]],
  ['Mojito 0,0%', [{ artikel: PREMIX_MOJITO, liter: '0.15' }]],
  ['Mai Tai 0,0%', [{ artikel: PREMIX_MAITAI, liter: '0.15' }]],
  ['Pina Colada 0,0%', [{ artikel: PREMIX_PINA, liter: '0.15' }]],

  // --- Longdrinks & Digestifs ----------------------------------------------
  ['Dockside Vodka Ginger Ale', [
    { artikel: VODKA_07, liter: '0.04' },
    { artikel: GINGER_ALE, liter: '0.12' },
  ]],
  ['Dockside Vodka Tonic', [
    { artikel: VODKA_07, liter: '0.04' },
    { artikel: TONIC, liter: '0.12' },
  ]],
  ['Dockside Vodka Lemon', [
    { artikel: VODKA_07, liter: '0.04' },
    { artikel: BITTER_LEMON, liter: '0.12' },
  ]],
  ['Dockside Vodka Kirsch', [
    { artikel: VODKA_07, liter: '0.04' },
    { artikel: KIRSCHSAFT, liter: '0.12' },
  ]],
  ['Dockside Vodka Maracuja', [
    { artikel: VODKA_07, liter: '0.04' },
    { artikel: SAFT_MARACUJA, liter: '0.12' },
  ]],
  ['Dockside Vodka Red Bull', [
    { artikel: VODKA_07, liter: '0.04' },
    { artikel: REDBULL, einheiten: 1 },
  ]],
  ['Sudmare Gin Tonic', [
    { artikel: GIN, liter: '0.04' },
    { artikel: TONIC, liter: '0.12' },
  ]],
  ['Dünenbrand Cola', [
    { artikel: DUENENBRAND, liter: '0.04' },
    { artikel: COLA_1L, liter: '0.12' },
  ]],
  ['Dünenbrand Shot 2cl', [{ artikel: DUENENBRAND, liter: '0.02' }]],
  ['Vodka Shot 2cl', [{ artikel: VODKA_05, liter: '0.02' }]],
  ['Ramazzotti 2cl', [{ artikel: RAMAZZOTTI, liter: '0.02' }]],
  ['Williamsbirne 2cl', [{ artikel: WILLIAMSBIRNE, liter: '0.02' }]],
  ['Pfeffi 2cl', [{ artikel: PFEFFI, liter: '0.02' }]],
  ['Choco Praline 2cl', [{ artikel: CHOCO, liter: '0.02' }]],

  // --- Wein, Sekt, Champagner ----------------------------------------------
  ['Weißwein Schorle', [
    { artikel: WEISS_OFFEN, liter: '0.10' },
    { artikel: SODA, liter: '0.10' },
  ]],
  ['Roséwein Schorle', [
    { artikel: ROSE_OFFEN, liter: '0.10' },
    { artikel: SODA, liter: '0.10' },
  ]],
  ['Weißwein Grauburgunder 0,2', [{ artikel: WEISS_OFFEN, liter: '0.20' }]],
  ['Weißwein Flasche 0,75l', [{ artikel: WEISS_OFFEN, einheiten: 1 }]],
  ['Grauburgunder Flasche 0,75l', [{ artikel: PFAFF_GRAU, einheiten: 1 }]],
  ['Flamingo Rosé Fl. 0,75', [{ artikel: PFAFF_ROSE, einheiten: 1 }]],
  ['Rotwein Merlot 0,2', [{ artikel: MERLOT, liter: '0.20' }]],
  ['Rotwein Flasche 0,75l', [{ artikel: MERLOT, einheiten: 1 }]],
  ['III Freunde Rosé 0,2', [{ artikel: DREI_ROSE, liter: '0.20' }]],
  ['III Freunde Rose 0,2l', [{ artikel: DREI_ROSE, liter: '0.20' }]],
  ['III Freunde Rosé Fl. 0,75', [{ artikel: DREI_ROSE, einheiten: 1 }]],
  ['III Freunde Sauvignon blanc 0,2l', [{ artikel: DREI_SAUVIGNON, liter: '0.20' }]],
  ['III Freunde Sauvignon blanc0,2', [{ artikel: DREI_SAUVIGNON, liter: '0.20' }]],
  ['III Freunde Sauvignon blanc Fl. 0,75l', [{ artikel: DREI_SAUVIGNON, einheiten: 1 }]],
  ['III Freunde Weißburgunder 0,2', [{ artikel: DREI_WEISSBURGUNDER, liter: '0.20' }]],
  ['III Freunde Weißburgunder 0,2l', [{ artikel: DREI_WEISSBURGUNDER, liter: '0.20' }]],
  ['III Freunde Weißburgunder Flasche 0,75l', [{ artikel: DREI_WEISSBURGUNDER, einheiten: 1 }]],
  ['Prosecco 0,1', [{ artikel: PROSECCO, liter: '0.10' }]],
  ['Prosecco auf Eis 0,2', [{ artikel: PROSECCO, liter: '0.20' }]],
  ['Prosecco Eis', [{ artikel: PROSECCO, liter: '0.20' }]],
  ['Prosecco 0,75 Fl.', [{ artikel: PROSECCO, einheiten: 1 }]],
  ['Moet et Chandon Ice Imperial', [{ artikel: MOET_ICE, einheiten: 1 }]],

  // --- Bier vom Fass --------------------------------------------------------
  // Das 10-l-Partyfass ist laut Manual nur auf Bestellung — der Ausschank
  // zapft vom 50-l-Fass.
  ['Veltins 0,25l', [{ artikel: VELTINS_50, liter: '0.25' }]],
  ['Veltins Pils 0,33l', [{ artikel: VELTINS_50, liter: '0.33' }]],
  ['Veltins 0,4l', [{ artikel: VELTINS_50, liter: '0.40' }]],
  ['Heineken 0,25l', [{ artikel: ['Heineken', '1 x 30,0'], liter: '0.25' }]],
  ['Heineken 0,4l', [{ artikel: ['Heineken', '1 x 30,0'], liter: '0.40' }]],

  // --- Bier in Flaschen -----------------------------------------------------
  ['Heineken Fl. 0,33', [{ artikel: ['Heineken', '24 x 0,33'], einheiten: 1 }]],
  ['Desperados', [{ artikel: ['Desperados', '24 x 0,33'], einheiten: 1 }]],
  ['Desperados 0,33l', [{ artikel: ['Desperados', '24 x 0,33'], einheiten: 1 }]],
  ['Pülleken', [{ artikel: ['Puelleken', '24 x 0,33'], einheiten: 1 }]],
  ['Pülleken 0,33l', [{ artikel: ['Puelleken', '24 x 0,33'], einheiten: 1 }]],
  ['Zitrönken', [{ artikel: ['Zitroenken von Puelleken', '24 x 0,33'], einheiten: 1 }]],
  ['Veltins Design Steini', [{ artikel: ['Veltins Design Steini', '20 x 0,33'], einheiten: 1 }]],
  ['Veltins Flasche', [{ artikel: ['Veltins Design Steini', '20 x 0,33'], einheiten: 1 }]],
  ['Veltins Helles Lager', [{ artikel: ['Veltins Helles Lager', '24 x 0,275'], einheiten: 1 }]],
  ['Veltins Helles Lager 0,275l', [{ artikel: ['Veltins Helles Lager', '24 x 0,275'], einheiten: 1 }]],
  ['Radler Fl. 0,33', [{ artikel: ['Veltins Radler', '24 x 0,33'], einheiten: 1 }]],
  ['Radler Fl. 0,33l', [{ artikel: ['Veltins Radler', '24 x 0,33'], einheiten: 1 }]],
  ['Radler Fl 0,0%', [{ artikel: ['Veltins Radler 0,00%', '24 x 0,33'], einheiten: 1 }]],
  ['Veltins Radler 0,0% 0,33l', [{ artikel: ['Veltins Radler 0,00%', '24 x 0,33'], einheiten: 1 }]],
  ['Veltins alkoholfrei 0,0%', [{ artikel: ['Veltins 0,00%', '24 x 0,33'], einheiten: 1 }]],
  ['Maisels Weizen 0,50l', [{ artikel: MAISELS, einheiten: 1 }]],
  ['Maisel Weizen 0,5l', [{ artikel: MAISELS, einheiten: 1 }]],
  ['Maisels Weizen 0,0% 0,50l', [{ artikel: ['Maisels 0,00%', '20 x 0,5'], einheiten: 1 }]],

  // --- Softdrinks -----------------------------------------------------------
  // Offene Softdrinks im 0,3-l-Glas (Manual: Longdrinkglas 0,3 l).
  ['Coca Cola', [{ artikel: COLA_1L, liter: '0.30' }]],
  ['Coke Zero', [{ artikel: ['Coke Zero', '12 x 1,0'], liter: '0.30' }]],
  ['Fanta', [{ artikel: ['Fanta', '12 x 1,0'], liter: '0.30' }]],
  ['Sprite', [{ artikel: ['Sprite', '12 x 1,0'], liter: '0.30' }]],
  // Säfte im Saftglas 0,25 l (Manual).
  ['Saft Orange', [{ artikel: SAFT_ORANGE, liter: '0.25' }]],
  ['Saft Apfel', [{ artikel: SAFT_APFEL, liter: '0.25' }]],
  ['Saft Maracuja', [{ artikel: SAFT_MARACUJA, liter: '0.25' }]],
  ['Saft Kirsche', [{ artikel: SAFT_KIRSCHE, liter: '0.25' }]],
  // Fuze ist aus dem Sortiment — Eistee Pfirsich ist die Fassbrause.
  ['Eistee Pfirsich', [{ artikel: FASSBRAUSE_EISTEE, einheiten: 1 }]],
  ['Red Bull', [{ artikel: REDBULL, einheiten: 1 }]],
  ['Red Bull sugarfree', [{ artikel: ['Redbull Zero', '24 x 0,25'], einheiten: 1 }]],
])

/** Extrawünsche, die bisher Bestand buchten: übergangen, keine Bestandteile. */
const UEBERGEHEN: readonly string[] = [
  'Mehr Cola',
  'Schuss Cola',
  'Mehr Sprite',
  'Mehr Fanta',
  'Wenig sprite',
  'Wenig Sprite',
]

async function main() {
  const nurVorschau = process.argv.includes('--vorschau')

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL oder DATABASE_URL muss gesetzt sein')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })

  try {
    const betrieb = await prisma.betrieb.findFirstOrThrow({ where: { name: BETRIEB_NAME } })

    // ------------------------------------------------------------------
    // Bon Voyage Rotwein aus dem Dörlemann-Bestellformular anlegen.
    // Preis dort nur "U 5 Euro" — kein exakter EK, also null (nicht 0).
    // ------------------------------------------------------------------
    let merlot = await prisma.artikel.findUnique({
      where: {
        betriebId_name_lieferGebindeText: {
          betriebId: betrieb.id,
          name: MERLOT[0],
          lieferGebindeText: MERLOT[1],
        },
      },
    })
    if (merlot === null) {
      const vorbildWein = await prisma.artikel.findFirstOrThrow({
        where: { betriebId: betrieb.id, name: WEISS_OFFEN[0], lieferGebindeText: WEISS_OFFEN[1] },
      })
      const letzterWein = await prisma.artikel.findFirst({
        where: { betriebId: betrieb.id, kategorie: 'Wein' },
        orderBy: { sortierung: 'desc' },
      })
      const daten = {
        betriebId: betrieb.id,
        name: MERLOT[0],
        kategorie: 'Wein',
        sortierung: (letzterWein?.sortierung ?? 0) + 10,
        lieferGebindeText: MERLOT[1],
        einheitenProGebinde: 6,
        einheitsgroesseLiter: '0.75',
        gebindeart: vorbildWein.gebindeart,
        zaehlmodus: Zaehlmodus.EINZELN,
        ekPreisCent: null,
        ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
      }
      if (nurVorschau) {
        console.log(`NEUER ARTIKEL: ${MERLOT[0]} · ${MERLOT[1]} (EK unbekannt)`)
      } else {
        merlot = await prisma.artikel.create({ data: daten })
        console.log(`Artikel angelegt: ${MERLOT[0]} · ${MERLOT[1]} (EK unbekannt)`)
      }
    }

    // ------------------------------------------------------------------
    // Artikel auflösen, Zutatenmengen über die eine Rechenstelle bestimmen.
    // ------------------------------------------------------------------
    const artikelListe = await prisma.artikel.findMany({ where: { betriebId: betrieb.id } })
    const artikelNachKey = new Map(
      artikelListe.map((a) => [`${a.name} · ${a.lieferGebindeText}`, a]),
    )
    if (merlot !== null) artikelNachKey.set(`${MERLOT[0]} · ${MERLOT[1]}`, merlot)

    const fehlendeArtikel = new Set<string>()
    const fehlendeKassenartikel: string[] = []
    let geaendert = 0
    let unveraendert = 0

    for (const [posBezeichnung, zutaten] of REZEPTE) {
      const kassenartikel = await prisma.kassenartikel.findUnique({
        where: { betriebId_posBezeichnung: { betriebId: betrieb.id, posBezeichnung } },
        include: { bestandteile: { include: { artikel: true } } },
      })
      if (kassenartikel === null) {
        fehlendeKassenartikel.push(posBezeichnung)
        continue
      }

      // Zielbestandteile: artikelId -> einheitenProVerkauf (als String).
      const ziel = new Map<string, string>()
      let vollstaendig = true
      for (const zutat of zutaten) {
        const key = `${zutat.artikel[0]} · ${zutat.artikel[1]}`
        const artikel = artikelNachKey.get(key)
        if (artikel === undefined) {
          fehlendeArtikel.add(key)
          vollstaendig = false
          continue
        }
        const anteil =
          zutat.einheiten !== undefined
            ? String(zutat.einheiten)
            : anteilJeAusschank(artikel, zutat.liter as string).toString()
        ziel.set(artikel.id, anteil)
      }
      if (!vollstaendig) continue

      const ist = new Map(
        kassenartikel.bestandteile.map((b) => [b.artikelId, b.einheitenProVerkauf.toString()]),
      )
      const gleich =
        ist.size === ziel.size &&
        [...ziel].every(([artikelId, anteil]) => ist.get(artikelId) === anteil) &&
        kassenartikel.bestaetigt &&
        kassenartikel.notiz === NOTIZ_MANUAL

      if (gleich) {
        unveraendert += 1
        continue
      }

      const vorher =
        kassenartikel.bestandteile
          .map((b) => `${b.artikel.name} x ${b.einheitenProVerkauf}`)
          .join(' + ') || '(leer)'
      const nachher = [...ziel]
        .map(([artikelId, anteil]) => {
          const a = artikelListe.find((x) => x.id === artikelId) ?? merlot
          return `${a?.name} x ${anteil}`
        })
        .join(' + ')
      console.log(`${posBezeichnung}\n  vorher:  ${vorher}\n  nachher: ${nachher}`)
      geaendert += 1

      if (nurVorschau) continue

      await prisma.$transaction(async (tx) => {
        await tx.kassenartikelbestandteil.deleteMany({
          where: { kassenartikelId: kassenartikel.id, artikelId: { notIn: [...ziel.keys()] } },
        })
        for (const [artikelId, anteil] of ziel) {
          await tx.kassenartikelbestandteil.upsert({
            where: {
              kassenartikelId_artikelId: { kassenartikelId: kassenartikel.id, artikelId },
            },
            create: {
              betriebId: betrieb.id,
              kassenartikelId: kassenartikel.id,
              artikelId,
              einheitenProVerkauf: anteil,
            },
            update: { einheitenProVerkauf: anteil },
          })
        }
        await tx.kassenartikel.update({
          where: { id: kassenartikel.id },
          data: { bestaetigt: true, notiz: NOTIZ_MANUAL },
        })
      })
    }

    // ------------------------------------------------------------------
    // Extrawünsche auf übergangen setzen.
    // ------------------------------------------------------------------
    for (const posBezeichnung of UEBERGEHEN) {
      const kassenartikel = await prisma.kassenartikel.findUnique({
        where: { betriebId_posBezeichnung: { betriebId: betrieb.id, posBezeichnung } },
        include: { bestandteile: true },
      })
      if (kassenartikel === null) {
        fehlendeKassenartikel.push(posBezeichnung)
        continue
      }
      if (
        kassenartikel.bestandteile.length === 0 &&
        kassenartikel.bestaetigt &&
        kassenartikel.notiz === NOTIZ_EXTRAWUNSCH
      ) {
        unveraendert += 1
        continue
      }
      console.log(`${posBezeichnung}: uebergangen (war ${kassenartikel.bestandteile.length} Bestandteil(e))`)
      geaendert += 1
      if (nurVorschau) continue
      await prisma.$transaction(async (tx) => {
        await tx.kassenartikelbestandteil.deleteMany({
          where: { kassenartikelId: kassenartikel.id },
        })
        await tx.kassenartikel.update({
          where: { id: kassenartikel.id },
          data: { bestaetigt: true, notiz: NOTIZ_EXTRAWUNSCH },
        })
      })
    }

    console.log(
      `\n${nurVorschau ? 'VORSCHAU — nichts geschrieben. ' : ''}` +
        `${geaendert} geaendert, ${unveraendert} bereits auf Stand.`,
    )
    if (fehlendeKassenartikel.length > 0) {
      console.log(`Nicht in der Kasse gefunden: ${fehlendeKassenartikel.join(' | ')}`)
    }
    if (fehlendeArtikel.size > 0) {
      console.log(`Nicht im Artikelstamm gefunden: ${[...fehlendeArtikel].join(' | ')}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

await main()
