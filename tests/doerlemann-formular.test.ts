import { readFile } from 'node:fs/promises'

import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  FORMULARZEILEN,
  formularmengen,
  istDoerlemann,
  SPALTE_BESTELLMENGE,
  VORLAGE_BLATT,
  VORLAGE_DATEI,
  ZELLE_BESTELLDATUM,
  ZUORDNUNG,
} from '@/lib/doerlemann-formular'

/**
 * Zellwerte der Vorlage tragen geschützte Leerzeichen und doppelte
 * Zwischenräume ("Heineken " mit NBSP) — die Tabellen im Code führen die
 * bereinigte Form. Verglichen wird deshalb über dieselbe Bereinigung.
 */
function bereinigt(wert: ExcelJS.CellValue): string {
  return String(wert ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('istDoerlemann', () => {
  it('erkennt den Namen mit und ohne Umlaut, unabhängig von Gross/Klein', () => {
    expect(istDoerlemann('Dörlemann')).toBe(true)
    expect(istDoerlemann('Kornbrennerei Doerlemann')).toBe(true)
    expect(istDoerlemann('DÖRLEMANN')).toBe(true)
    expect(istDoerlemann('Getränke Müller')).toBe(false)
  })
})

describe('ZUORDNUNG', () => {
  const zeilen = new Map(FORMULARZEILEN.map((zeile) => [zeile.zeile, zeile]))

  it('zeigt nur auf Zeilen, die das Formular hat', () => {
    for (const eintrag of ZUORDNUNG) {
      expect(zeilen.has(eintrag.zeile), `Zeile ${eintrag.zeile} (${eintrag.artikelName})`).toBe(
        true,
      )
    }
  })

  it('führt jeden Artikel und jede Formularzeile höchstens einmal', () => {
    const artikel = ZUORDNUNG.map((e) => `${e.artikelName}|${e.artikelGebinde}`)
    expect(new Set(artikel).size).toBe(artikel.length)

    const belegt = ZUORDNUNG.map((e) => e.zeile)
    expect(new Set(belegt).size).toBe(belegt.length)
  })

  it('hat nur ganze, positive Umrechnungsfaktoren', () => {
    for (const eintrag of ZUORDNUNG) {
      expect(Number.isInteger(eintrag.artikelGebindeJeFormularGebinde)).toBe(true)
      expect(eintrag.artikelGebindeJeFormularGebinde).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('formularmengen', () => {
  it('trägt eine zugeordnete Position in ihre Zeile ein', () => {
    const ergebnis = formularmengen([
      { name: 'Coca Cola', lieferGebindeText: '24 x 0,33', anzahlGebinde: 4 },
    ])
    expect(ergebnis.mengen.get(27)).toBe(4)
    expect(ergebnis.ohneZeile).toHaveLength(0)
    expect(ergebnis.aufgerundet).toHaveLength(0)
  })

  it('meldet eine Position ohne Formularzeile, statt sie zu verschlucken', () => {
    const ergebnis = formularmengen([
      { name: 'Fuze Eistee Lemon', lieferGebindeText: '24 x 0,25', anzahlGebinde: 2 },
    ])
    expect(ergebnis.mengen.size).toBe(0)
    expect(ergebnis.ohneZeile).toHaveLength(1)
    expect(ergebnis.ohneZeile[0].name).toBe('Fuze Eistee Lemon')
  })

  it('unterscheidet denselben Artikel nach Gebinde', () => {
    const ergebnis = formularmengen([
      { name: 'Coca Cola', lieferGebindeText: '12 x 1,0', anzahlGebinde: 3 },
      { name: 'Coca Cola', lieferGebindeText: '24 x 0,33', anzahlGebinde: 5 },
    ])
    expect(ergebnis.mengen.get(23)).toBe(3)
    expect(ergebnis.mengen.get(27)).toBe(5)
  })

  it('rechnet Wein von Flaschen in 6er-Kartons um und rundet auf volle Kartons auf', () => {
    const ergebnis = formularmengen([
      { name: 'Lergenmueller Grauburgunder', lieferGebindeText: '1 x 0,75', anzahlGebinde: 8 },
    ])
    expect(ergebnis.mengen.get(117)).toBe(2)
    expect(ergebnis.aufgerundet).toHaveLength(1)
    expect(ergebnis.aufgerundet[0]).toMatchObject({
      name: 'Lergenmueller Grauburgunder',
      bestellt: 8,
      formularMenge: 2,
      entspricht: 12,
    })
  })

  it('meldet keine Aufrundung, wenn die Flaschen volle Kartons ergeben', () => {
    const ergebnis = formularmengen([
      { name: 'Leonardo Prosecco (zum mischen)', lieferGebindeText: '1 x 0,75', anzahlGebinde: 12 },
    ])
    expect(ergebnis.mengen.get(119)).toBe(2)
    expect(ergebnis.aufgerundet).toHaveLength(0)
  })

  it('lässt Positionen ohne Menge weg', () => {
    const ergebnis = formularmengen([
      { name: 'Coca Cola', lieferGebindeText: '24 x 0,33', anzahlGebinde: 0 },
    ])
    expect(ergebnis.mengen.size).toBe(0)
    expect(ergebnis.ohneZeile).toHaveLength(0)
  })
})

/**
 * Der Wächter gegen stilles Veralten: jede Zeilennummer der Tabellen muss in
 * der eingebetteten Vorlage genau den Artikel tragen, den die Tabelle behauptet.
 * Tauscht Dörlemann das Formular oder verrutscht eine Zeile, fällt dieser Test
 * um — bevor Mengen in der falschen Zeile landen.
 */
describe('Vorlage und Tabellen passen zusammen', () => {
  let blatt: ExcelJS.Worksheet

  beforeAll(async () => {
    const mappe = new ExcelJS.Workbook()
    await mappe.xlsx.load((await readFile(VORLAGE_DATEI)).buffer as ArrayBuffer)
    const gefunden = mappe.getWorksheet(VORLAGE_BLATT)
    if (gefunden === undefined) throw new Error(`Blatt "${VORLAGE_BLATT}" fehlt in der Vorlage`)
    blatt = gefunden
  })

  it('hat jede Formularzeile am erwarteten Platz', () => {
    for (const zeile of FORMULARZEILEN) {
      expect(bereinigt(blatt.getCell(zeile.zeile, 1).value), `Zeile ${zeile.zeile}`).toBe(
        zeile.name,
      )
      expect(bereinigt(blatt.getCell(zeile.zeile, 2).value), `Zeile ${zeile.zeile}`).toBe(
        zeile.gebinde,
      )
    }
  })

  it('hat die Bestellmengen-Spalte und die Datumszelle, wo der Code sie erwartet', () => {
    expect(bereinigt(blatt.getCell(12, SPALTE_BESTELLMENGE).value)).toBe('Bestellmenge')
    expect(bereinigt(blatt.getCell(ZELLE_BESTELLDATUM).value)).toMatch(/^Bestelldatum/)
  })
})
