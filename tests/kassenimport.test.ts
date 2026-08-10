import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { alsDatumstext } from '@/lib/datum'
import { leseKassenumsatz, type Umsatzzeile } from '@/lib/kassenimport'

const FIXTURE = fileURLToPath(new URL('../fixtures/kassenumsatz-stadthafen.csv', import.meta.url))
const csvText = readFileSync(FIXTURE, 'utf8')

/** Kopfblock der echten Datei, damit die Minimalfälle dieselbe Form haben. */
const KOPF = [
  'Umsatz nach Artikel und Abrechnungsart;;;;;;;;',
  'Datum;14.06.2026 16:11;;;;;;;',
  'Betrieb;Stadthafen;;;;;;;',
  'Filter;;;;;;;;',
  'Vom;01.07.2026;;;;;;;',
  'Bis;31.07.2026;;;;;;;',
  ';;;;;;;;',
  'Name;;PLU;Anzahl;Preis;Rabatt;Netto;MwSt;Brutto',
]

function csv(...zeilen: string[]): string {
  return [...KOPF, ...zeilen].join('\r\n')
}

/** Summe über alle Abrechnungsarten einer Bezeichnung. */
function summe(zeilen: Umsatzzeile[], bezeichnung: string): number {
  return zeilen
    .filter((zeile) => zeile.posBezeichnung === bezeichnung)
    .reduce((wert, zeile) => wert + zeile.menge.toNumber(), 0)
}

function menge(zeilen: Umsatzzeile[], bezeichnung: string, art: string): number | undefined {
  return zeilen
    .find((zeile) => zeile.posBezeichnung === bezeichnung && zeile.abrechnungsart === art)
    ?.menge.toNumber()
}

describe('Zeitraum aus dem Kopfblock', () => {
  it('liest Vom und Bis', () => {
    const { zeitraum } = leseKassenumsatz(csv('Cola;;1;;3,90;;;;', ';Bar Im Haus;;2x;3,90;;;;'))
    expect(zeitraum).not.toBeNull()
    expect(alsDatumstext(zeitraum!.von)).toBe('01.07.2026')
  })

  it('lässt den letzten Tag bis Mitternacht laufen', () => {
    // Der Bericht nennt den 31.07. und meint alles bis 24 Uhr. Endete der
    // Zeitraum um 0 Uhr, fiele der ganze Schlussabend aus der Auswertung.
    const { zeitraum } = leseKassenumsatz(csv('Cola;;1;;3,90;;;;', ';Bar Im Haus;;2x;3,90;;;;'))
    expect(zeitraum!.bis.toISOString()).toBe('2026-07-31T23:59:59.999Z')
  })

  it('meldet einen Kopfblock ohne Zeitraum, statt einen zu erfinden', () => {
    const ohne = ['Umsatz nach Artikel;;;;;;;;', 'Name;;PLU;Anzahl;Preis;Rabatt;Netto;MwSt;Brutto']
    const lesung = leseKassenumsatz([...ohne, 'Cola;;1;;3,90;;;;', ';Bar Im Haus;;2x;;;;;'].join('\r\n'))
    expect(lesung.zeitraum).toBeNull()
    expect(lesung.fehler[0].meldung).toMatch(/kein Umsatzbericht/)
  })

  it('weist eine Datei ohne Kopfzeile ab', () => {
    const lesung = leseKassenumsatz('Artikel;Menge\r\nCola;5')
    expect(lesung.zeitraum).toBeNull()
    expect(lesung.zeilen).toEqual([])
    expect(lesung.fehler).toHaveLength(1)
  })

  it('nimmt einen rückwärts laufenden Zeitraum nicht an', () => {
    const verdreht = csvText.replace('Vom;01.01.2026', 'Vom;31.12.2027')
    const lesung = leseKassenumsatz(verdreht)
    expect(lesung.zeitraum).toBeNull()
    expect(lesung.fehler.some((fehler) => /rückwärts/.test(fehler.meldung))).toBe(true)
  })
})

describe('Aufbau des Berichts', () => {
  it('bucht die Menge auf den Artikel der Kopfzeile darüber', () => {
    const { zeilen } = leseKassenumsatz(
      csv('Coca Cola 0,33l;;3121;;3,90;;;;', ';Bar Im Haus;;399x;3,90;;1308,69;247,41;1556,10'),
    )
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]).toMatchObject({ posBezeichnung: 'Coca Cola 0,33l', abrechnungsart: 'Bar Im Haus' })
    expect(zeilen[0].menge.toNumber()).toBe(399)
  })

  it('zählt die Summenzeile eines Blocks nicht mit', () => {
    // Die Zeile ohne PLU wiederholt nur, was darüber steht. Mitgezählt wäre
    // jeder Artikel doppelt vom Bestand abgezogen.
    const { zeilen } = leseKassenumsatz(
      csv(
        'Aperol Spritz;;2210;;7,90;;;;',
        ';Bar Im Haus;;146x;7,90;;969,44;183,96;1153,40',
        ';Debitor Im Haus;;12x;7,90;;79,68;15,12;94,80',
        'Aperol Spritz;;;158x;;;1049,12;199,08;1248,20',
      ),
    )
    expect(summe(zeilen, 'Aperol Spritz')).toBe(158)
    expect(zeilen).toHaveLength(2)
  })

  it('zählt dieselbe Bezeichnung aus mehreren PLUs zusammen', () => {
    const { zeilen, hinweise } = leseKassenumsatz(
      csv(
        'Coca Cola;;3121;;3,90;;;;',
        ';Bar Im Haus;;40x;3,90;;;;',
        'Coca Cola;;3305;;3,90;;;;',
        ';Bar Im Haus;;189x;3,90;;;;',
      ),
    )
    expect(menge(zeilen, 'Coca Cola', 'Bar Im Haus')).toBe(229)
    expect(hinweise.some((hinweis) => /2 PLUs/.test(hinweis.meldung))).toBe(true)
  })

  it('hält die Abrechnungsarten auseinander', () => {
    // Bruch ist kein Verkauf, mindert den Bestand aber genauso. Getrennt
    // gespeichert bleibt er später von echtem Schwund unterscheidbar.
    const { zeilen } = leseKassenumsatz(
      csv(
        'Veltins 0,4l;;3148;;5,50;;;;',
        ';Bar Im Haus;;677x;5,50;;;;',
        ';Bruch Im Haus;;43x;5,50;;;;',
      ),
    )
    expect(menge(zeilen, 'Veltins 0,4l', 'Bar Im Haus')).toBe(677)
    expect(menge(zeilen, 'Veltins 0,4l', 'Bruch Im Haus')).toBe(43)
  })

  it('übergeht Zeilen mit Menge 0, statt Zuordnungsarbeit dafür zu erzeugen', () => {
    const lesung = leseKassenumsatz(
      csv('43er;;2271;;3,90;;;;', ';Promotion intern Im Haus;;0x;3,90;;0,00;0,00;0,00'),
    )
    expect(lesung.zeilen).toEqual([])
    expect(lesung.bezeichnungen).toBe(0)
    expect(lesung.hinweise.some((hinweis) => /Menge 0/.test(hinweis.meldung))).toBe(true)
  })

  it('meldet eine unlesbare Anzahl, ohne die anderen Zeilen zu verlieren', () => {
    const lesung = leseKassenumsatz(
      csv(
        'Cola;;1;;3,90;;;;',
        ';Bar Im Haus;;viele;3,90;;;;',
        'Fanta;;2;;3,90;;;;',
        ';Bar Im Haus;;7x;3,90;;;;',
      ),
    )
    expect(lesung.fehler).toHaveLength(1)
    expect(lesung.fehler[0].meldung).toMatch(/Cola \/ Bar Im Haus/)
    expect(summe(lesung.zeilen, 'Fanta')).toBe(7)
  })

  it('meldet eine Menge, die vor jedem Artikel steht', () => {
    const lesung = leseKassenumsatz(csv(';Bar Im Haus;;5x;3,90;;;;'))
    expect(lesung.zeilen).toEqual([])
    expect(lesung.fehler[0].meldung).toMatch(/vor jedem Artikel/)
  })
})

describe('gegen die echte Kassendatei', () => {
  const lesung = leseKassenumsatz(csvText)

  it('liest den Zeitraum des Berichts', () => {
    expect(alsDatumstext(lesung.zeitraum!.von)).toBe('01.01.2026')
    expect(alsDatumstext(lesung.zeitraum!.bis)).toBe('31.12.2026')
  })

  it('liest die Datei ohne Fehler', () => {
    expect(lesung.fehler).toEqual([])
  })

  it('zählt "Gesamtumsatz" nicht als Artikel', () => {
    // Die Zeile trägt eine Menge, aber keine PLU — wie eine Summenzeile.
    expect(lesung.zeilen.some((zeile) => zeile.posBezeichnung === 'Gesamtumsatz')).toBe(false)
  })

  it('lässt die 0-Buchungen weg und behält den Rest der Bezeichnung', () => {
    // Der "43er" hat eine Kartenbuchung und eine Promotion über 0 Stück. Die
    // Bezeichnung bleibt, die leere Zeile fällt weg.
    const dreiundvierziger = lesung.zeilen.filter((zeile) => zeile.posBezeichnung === '43er')
    expect(dreiundvierziger.map((zeile) => zeile.abrechnungsart)).toEqual(['EC-/Kreditkarte Im Haus'])
    expect(lesung.bezeichnungen).toBe(9)
  })

  it('zählt die drei PLUs des Aperol Spritz über beide Abschnitte zusammen', () => {
    // 146 + 157 + 164 an der Bar, dazu Debitor, Karte, Bruch und zwei Promotionen.
    expect(menge(lesung.zeilen, 'Aperol Spritz', 'Bar Im Haus')).toBe(467)
    expect(menge(lesung.zeilen, 'Aperol Spritz', 'Bruch Im Haus')).toBe(7)
    expect(summe(lesung.zeilen, 'Aperol Spritz')).toBe(1013)
  })

  it('hält "Coca Cola" und "Coca Cola 0,33l" auseinander', () => {
    // Das Glas aus der Literflasche und die verkaufte Flasche sind zwei Dinge.
    expect(summe(lesung.zeilen, 'Coca Cola')).toBe(382)
    expect(summe(lesung.zeilen, 'Coca Cola 0,33l')).toBe(880)
  })
})
