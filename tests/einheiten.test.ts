import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug, Zaehlmodus } from '@/generated/prisma/enums'
import {
  EinheitenFehler,
  ekProEinheitCent,
  gesamtEinheiten,
  wertCent,
  type BepreisterArtikel,
  type ZaehlbarerArtikel,
} from '@/lib/einheiten'

// Die Testartikel tragen nur die Felder, die gerechnet werden. Ein echter
// Prisma-Artikel erfüllt dieselben Typen strukturell, braucht hier aber keine
// id/betriebId-Attrappen.

/** Kasten Bier, 24 x 0,33, 17,99 EUR je Kasten. */
const kastenBier: ZaehlbarerArtikel & BepreisterArtikel = {
  zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
  einheitenProGebinde: 24,
  ekPreisCent: 1799,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

/** Karton Wein, 6 x 1,0. Wird EINZELN gezählt, der Preis gilt je Flasche. */
const kartonWein: ZaehlbarerArtikel & BepreisterArtikel = {
  zaehlmodus: Zaehlmodus.EINZELN,
  einheitenProGebinde: 6,
  ekPreisCent: 890,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
}

/** Gin 0,7, Einzelflasche, portioniert verkauft. */
const einzelflascheGin: ZaehlbarerArtikel & BepreisterArtikel = {
  zaehlmodus: Zaehlmodus.EINZELN,
  einheitenProGebinde: 1,
  ekPreisCent: 1150,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
}

/** Fass Pils, 50 l. */
const fassPils: ZaehlbarerArtikel & BepreisterArtikel = {
  zaehlmodus: Zaehlmodus.FASS,
  einheitenProGebinde: 1,
  ekPreisCent: 9500,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

describe('gesamtEinheiten', () => {
  it('rechnet Kasten 24 x 0,33: 2 Gebinde + 5 lose = 53', () => {
    expect(gesamtEinheiten(kastenBier, 2, 5).toString()).toBe('53')
  })

  it('zählt den Karton Wein einzeln, ohne die Kartongrösse einzurechnen', () => {
    // 12 Flaschen sind 12 Flaschen — nicht 12 x 6. Genau hier trennt zaehlmodus
    // die Zählung von der Lieferung.
    expect(gesamtEinheiten(kartonWein, 0, 12).toString()).toBe('12')
  })

  it('nimmt bei der Einzelflasche halbe Flaschen an: 2,5', () => {
    expect(gesamtEinheiten(einzelflascheGin, 0, 2.5).toString()).toBe('2.5')
  })

  it('nimmt beim Fass 1,5 als anderthalb Fässer', () => {
    expect(gesamtEinheiten(fassPils, 1.5, 0).toString()).toBe('1.5')
  })

  it('verarbeitet Decimal und String genauso wie number', () => {
    expect(gesamtEinheiten(kastenBier, new Decimal('2'), '5').toString()).toBe('53')
  })

  it('rechnet halbe Gebinde exakt, ohne Fliesskomma-Rest', () => {
    // 0,1 + 0,2 wäre als number 0.30000000000000004 — Decimal hält 2,5 x 24 sauber.
    expect(gesamtEinheiten(kastenBier, 2.5, 0.5).toString()).toBe('60.5')
  })

  it('wirft, wenn eine Einzelflasche Gebinde gezählt bekommt', () => {
    expect(() => gesamtEinheiten(einzelflascheGin, 1, 0)).toThrow(EinheitenFehler)
    expect(() => gesamtEinheiten(einzelflascheGin, 1, 0)).toThrow(/anzahlGebinde muss 0 sein/)
  })

  it('wirft, wenn ein Fass lose Einheiten gezählt bekommt', () => {
    expect(() => gesamtEinheiten(fassPils, 1, 3)).toThrow(EinheitenFehler)
  })

  it('wirft bei negativen Mengen', () => {
    expect(() => gesamtEinheiten(kastenBier, -1, 0)).toThrow(/darf nicht negativ sein/)
  })

  it('wirft bei unbrauchbarer Gebindegrösse', () => {
    const kaputt: ZaehlbarerArtikel = { ...kastenBier, einheitenProGebinde: 0 }
    expect(() => gesamtEinheiten(kaputt, 1, 0)).toThrow(/einheitenProGebinde/)
  })
})

describe('ekProEinheitCent', () => {
  it('verteilt 1799 Cent auf 24 Einheiten und rundet kaufmännisch auf 75', () => {
    // 1799 / 24 = 74,9583...
    expect(ekProEinheitCent(kastenBier)).toBe(75)
  })

  it('rundet bei genau 0,5 auf', () => {
    // 150 / 4 = 37,5
    const artikel: BepreisterArtikel = {
      ekPreisCent: 150,
      ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
      einheitenProGebinde: 4,
    }
    expect(ekProEinheitCent(artikel)).toBe(38)
  })

  it('lässt den Preis bei PRO_EINHEIT unverteilt', () => {
    // Karton 6 x 1,0: der Preis gilt je Flasche, nicht je Karton — also nicht
    // durch 6 teilen.
    expect(ekProEinheitCent(kartonWein)).toBe(890)
  })

  it('wirft bei einem Preis, der keine ganzen Cent trägt', () => {
    const inEuro: BepreisterArtikel = { ...kastenBier, ekPreisCent: 17.99 }
    expect(() => ekProEinheitCent(inEuro)).toThrow(/ekPreisCent/)
  })
})

describe('wertCent', () => {
  it('bewertet einen vollen Kasten wieder mit exakt dem Gebindepreis', () => {
    // Über den gerundeten Einheitspreis (75 x 24) wären es 1800.
    expect(wertCent(kastenBier, 24)).toBe(1799)
  })

  it('verteilt den Gebindepreis anteilig auf lose Einheiten', () => {
    // 1799 x 5 / 24 = 374,79...
    expect(wertCent(kastenBier, 5)).toBe(375)
  })

  it('multipliziert bei PRO_EINHEIT direkt', () => {
    expect(wertCent(kartonWein, 12)).toBe(10680)
  })

  it('bewertet ein halbes Fass mit dem halben Fasspreis', () => {
    expect(wertCent(fassPils, 0.5)).toBe(4750)
  })

  it('ist bei Menge 0 wertfrei', () => {
    expect(wertCent(kastenBier, 0)).toBe(0)
  })

  it('nimmt das Ergebnis von gesamtEinheiten direkt entgegen', () => {
    const einheiten = gesamtEinheiten(kastenBier, 2, 5)
    expect(wertCent(kastenBier, einheiten)).toBe(3973) // 1799 x 53 / 24 = 3972,79...
  })
})

describe('Umrechnung existiert nur an einer Stelle', () => {
  // Der Auftrag an diese Datei ist, die einzige Umrechnung zwischen Gebinden und
  // Einheiten zu sein. Diese Prüfung schlägt fehl, sobald irgendwo sonst in src/
  // mit einheitenProGebinde gerechnet wird — dem Feld, über das die zweite
  // Implementierung zwangsläufig laufen müsste.
  const srcVerzeichnis = fileURLToPath(new URL('../src', import.meta.url))
  const erlaubt = ['lib/einheiten.ts']

  function tsDateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((eintrag) => {
      const pfad = join(verzeichnis, eintrag.name)
      // Der generierte Prisma-Client nennt das Feld naturgemäss — er ist die
      // Quelle des Typs, nicht eine zweite Rechnung.
      if (eintrag.isDirectory()) return eintrag.name === 'generated' ? [] : tsDateien(pfad)
      return eintrag.name.endsWith('.ts') || eintrag.name.endsWith('.tsx') ? [pfad] : []
    })
  }

  it('rechnet ausserhalb von src/lib/einheiten.ts nirgends mit einheitenProGebinde', () => {
    const treffer = tsDateien(srcVerzeichnis)
      .filter((pfad) => readFileSync(pfad, 'utf8').includes('einheitenProGebinde'))
      .map((pfad) => relative(srcVerzeichnis, pfad).split('\\').join('/'))
      .filter((pfad) => !erlaubt.includes(pfad))

    expect(treffer).toEqual([])
  })
})
