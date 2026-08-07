import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { EkPreisBezug, Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import { leseArtikelstamm, type Artikelstammsatz } from '@/lib/artikelimport'

const FIXTURE = fileURLToPath(
  new URL('../fixtures/artikelstamm-stadthafen.csv', import.meta.url),
)
const csvText = readFileSync(FIXTURE, 'utf8')

/** Kopfzeile der echten Datei, damit die Minimalfälle dieselben Spalten haben. */
const KOPF =
  'kategorie;name;gebinde_text;packungsgroesse;einheit;gebindegroesse_liter;' +
  'ek_preis_gebinde_eur;sortierung;excel_zeile;original_excel;pruefen'

function csv(...zeilen: string[]): string {
  return [KOPF, ...zeilen].join('\r\n')
}

function finde(saetze: Artikelstammsatz[], name: string, gebinde: string): Artikelstammsatz {
  const treffer = saetze.find((s) => s.name === name && s.lieferGebindeText === gebinde)
  if (!treffer) throw new Error(`Kein Satz "${name}" / "${gebinde}"`)
  return treffer
}

describe('Abbildung der Excel-Spalten auf das Modell', () => {
  it('macht aus einem Kasten ein Gebinde mit Resten, bepreist je Kasten', () => {
    const { saetze } = leseArtikelstamm(
      csv('Softdrinks;Coca Cola;24 x 0,33;24;FLASCHE;0,33;18,59;110;12;Coca Cola;'),
    )

    expect(saetze[0]).toMatchObject({
      gebindeart: Gebindeart.KASTEN,
      zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
      ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
      einheitenProGebinde: 24,
      ekPreisCent: 1859,
      schwundfaehig: true,
    })
    expect(saetze[0].einheitsgroesseLiter.toString()).toBe('0.33')
  })

  it('macht aus packungsgroesse 1 eine einzeln gezählte Flasche, bepreist je Flasche', () => {
    const { saetze } = leseArtikelstamm(
      csv('Spirituosen;Sudmare Gin;1 x 0,7;1;FLASCHE;0,7;7,99;660;67;Sudmare Gin;'),
    )

    expect(saetze[0]).toMatchObject({
      gebindeart: Gebindeart.EINZELFLASCHE,
      zaehlmodus: Zaehlmodus.EINZELN,
      ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
      einheitenProGebinde: 1,
    })
  })

  it('erkennt das Fass an der Spalte einheit, nicht an der Packungsgrösse', () => {
    // packungsgroesse steht auch beim Fass auf 1 — ginge die Regel danach, wäre
    // ein 50-Liter-Fass eine Einzelflasche.
    const { saetze } = leseArtikelstamm(
      csv('Bier Fass;Veltins;1 x 50,0;1;FASS;50,0;117,9;490;50;Veltins;'),
    )

    expect(saetze[0]).toMatchObject({
      gebindeart: Gebindeart.FASS,
      zaehlmodus: Zaehlmodus.FASS,
      ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
      ekPreisCent: 11790,
    })
  })

  it('nimmt Spirituosen, Likör, Aperitif und Barzutat aus der Schwundrechnung', () => {
    const { saetze } = leseArtikelstamm(
      csv(
        'Spirituosen;Sudmare Gin;1 x 0,7;1;FLASCHE;0,7;7,99;660;67;Sudmare Gin;',
        'Likoer;Pfeffi Doerlemann;1 x 0,7;1;FLASCHE;0,7;12;690;70;Pfeffi;',
        'Aperitif;Aperol;1 x 1,0;1;FLASCHE;1,0;13,45;600;61;Aperol;',
        'Barzutat;Lime Juice;1 x 0,7;1;FLASCHE;0,7;4,94;700;71;Lime Juice;',
        'Wein;Lergenmueller Riesling;1 x 0,75;1;FLASCHE;0,75;4,99;740;75;Riesling;',
      ),
    )

    expect(saetze.map((s) => s.schwundfaehig)).toEqual([false, false, false, false, true])
  })

  it('übernimmt die Spalten excel_zeile, original_excel und pruefen nicht', () => {
    const { saetze } = leseArtikelstamm(
      csv('Wasser;Gerolsteiner Sprudel;24 x 0,25;24;FLASCHE;0,25;8,58;10;2;Gerolsteiner Sprudel;'),
    )

    expect(Object.keys(saetze[0]).sort()).toEqual([
      'einheitenProGebinde',
      'einheitsgroesseLiter',
      'ekPreisBezug',
      'ekPreisCent',
      'gebindeart',
      'kategorie',
      'lieferGebindeText',
      'name',
      'schwundfaehig',
      'sortierung',
      'zaehlmodus',
    ])
  })
})

describe('Zahlen aus deutschen und englischen Quellen', () => {
  it('liest Dezimalkomma und Dezimalpunkt gleich', () => {
    const mitKomma = leseArtikelstamm(
      csv('Softdrinks;Cola;24 x 0,33;24;FLASCHE;0,33;18,59;110;12;Cola;'),
    ).saetze[0]
    const mitPunkt = leseArtikelstamm(
      csv('Softdrinks;Cola;24 x 0.33;24;FLASCHE;0.33;18.59;110;12;Cola;'),
    ).saetze[0]

    expect(mitPunkt.ekPreisCent).toBe(mitKomma.ekPreisCent)
    expect(mitPunkt.einheitsgroesseLiter.toString()).toBe(
      mitKomma.einheitsgroesseLiter.toString(),
    )
  })

  it('rechnet Euro exakt in Cent, ohne Fliesskomma-Rest', () => {
    // 8,58 * 100 ergibt in Fliesskomma 858.0000000000001.
    const { saetze } = leseArtikelstamm(
      csv(
        'Wasser;A;24 x 0,25;24;FLASCHE;0,25;8,58;10;2;A;',
        'Wasser;B;24 x 0,25;24;FLASCHE;0,25;117,9;20;3;B;',
        'Wasser;C;24 x 0,25;24;FLASCHE;0,25;12;30;4;C;',
      ),
    )

    expect(saetze.map((s) => s.ekPreisCent)).toEqual([858, 11790, 1200])
  })
})

describe('Unvollständige und fehlerhafte Zeilen', () => {
  it('importiert eine Zeile ohne Preis und markiert sie als unvollständig', () => {
    const { saetze, fehler, unvollstaendig, hinweise } = leseArtikelstamm(
      csv('Wein;3-Freunde Rose;1 x 0,75;1;FLASCHE;0,75;;980;103;3-Freunde Rose;'),
    )

    expect(saetze).toHaveLength(1)
    expect(fehler).toEqual([])
    expect(unvollstaendig).toBe(1)
    // null heisst "Preis unbekannt" und ist ausdrücklich nicht 0 — sonst würde
    // der Artikel als wertlos in jede Bestandssumme eingehen.
    expect(saetze[0].ekPreisCent).toBeNull()
    expect(hinweise[0].meldung).toMatch(/ohne EK-Preis/)
  })

  it('überspringt unbrauchbare Zeilen und liest die übrigen weiter', () => {
    const { saetze, fehler } = leseArtikelstamm(
      csv(
        'Softdrinks;Cola;24 x 0,33;24;FLASCHE;0,33;18,59;110;12;Cola;',
        'Softdrinks;;24 x 0,33;24;FLASCHE;0,33;18,59;120;13;;',
        'Softdrinks;Fanta;12 x 1,0;0;FLASCHE;1,0;14,45;130;14;Fanta;',
        'Softdrinks;Sprite;12 x 1,0;12;KANISTER;1,0;14,45;140;15;Sprite;',
        'Softdrinks;Fanta;12 x 1,0;12;FLASCHE;;14,45;150;16;Fanta;',
        'Softdrinks;Spezi;12 x 1,0;12;FLASCHE;1,0;14,45;160;17;Spezi;',
      ),
    )

    expect(saetze.map((s) => s.name)).toEqual(['Cola', 'Spezi'])
    expect(fehler.map((f) => f.zeile)).toEqual([3, 4, 5, 6])
    expect(fehler.map((f) => f.meldung)).toEqual([
      expect.stringContaining('name fehlt'),
      expect.stringContaining('packungsgroesse'),
      expect.stringContaining('einheit'),
      expect.stringContaining('gebindegroesse_liter'),
    ])
  })

  it('meldet zwei gleiche Artikel in einer Datei, statt einen still zu verlieren', () => {
    const { saetze, fehler } = leseArtikelstamm(
      csv(
        'Softdrinks;Cola;12 x 1,0;12;FLASCHE;1,0;14,45;70;8;Cola;',
        'Softdrinks;Cola;12 x 1,0;12;FLASCHE;1,0;15,95;80;9;Cola;',
      ),
    )

    expect(saetze).toHaveLength(1)
    expect(fehler[0].meldung).toContain('steht schon in Zeile 2')
  })

  it('meldet eine Kopfzeile ohne Pflichtspalte, statt jede Zeile einzeln zu bemängeln', () => {
    const { saetze, fehler } = leseArtikelstamm(
      'kategorie;name;gebinde_text\r\nSoftdrinks;Cola;12 x 1,0',
    )

    expect(saetze).toEqual([])
    expect(fehler).toHaveLength(1)
    expect(fehler[0].meldung).toContain('packungsgroesse')
  })

  it('kommt mit einer leeren Datei klar', () => {
    expect(leseArtikelstamm('')).toMatchObject({ saetze: [], fehler: [] })
  })
})

describe('Die Fixture des Stadthafens', () => {
  const { saetze, fehler, unvollstaendig } = leseArtikelstamm(csvText)

  it('liest alle 99 Artikel ohne Fehler', () => {
    expect(fehler).toEqual([])
    expect(saetze).toHaveLength(99)
  })

  it('erkennt die vier Fässer', () => {
    expect(saetze.filter((s) => s.gebindeart === Gebindeart.FASS)).toHaveLength(4)
    expect(saetze.filter((s) => s.zaehlmodus === Zaehlmodus.FASS)).toHaveLength(4)
  })

  it('nimmt 23 Artikel aus der Schwundrechnung', () => {
    // Aperitif 11, Spirituosen 7, Likör 4, Barzutat 1. Die Vorgabe nannte 21;
    // ausgezählt sind es 23, und die vier Kategorien lassen sich nicht anders
    // kombinieren.
    expect(saetze.filter((s) => !s.schwundfaehig)).toHaveLength(23)
  })

  it('hält Cola in zwei Gebinden auseinander', () => {
    const gross = finde(saetze, 'Coca Cola', '12 x 1,0')
    const klein = finde(saetze, 'Coca Cola', '24 x 0,33')

    expect(gross.einheitenProGebinde).toBe(12)
    expect(klein.einheitenProGebinde).toBe(24)
    expect(gross.einheitsgroesseLiter.toString()).toBe('1')
    expect(klein.einheitsgroesseLiter.toString()).toBe('0.33')
  })

  it('lässt genau die drei Weine ohne Preis unvollständig', () => {
    expect(unvollstaendig).toBe(3)
    expect(saetze.filter((s) => s.ekPreisCent === null).map((s) => s.name)).toEqual([
      '3-Freunde Weissburgunder',
      '3-Freunde Rose',
      '3-Freunde Sauvignon Blanc',
    ])
  })

  it('übernimmt die drei 6er-Lieferungen als Karton, zählt sie aber einzeln', () => {
    const karton = saetze.filter((s) => s.gebindeart === Gebindeart.KARTON)

    expect(karton.map((s) => s.name)).toEqual([
      'Lergenmueller Grauburgunder',
      'Lergenmueller Rose Saigner',
      'Leonardo Prosecco (zum mischen)',
    ])
    for (const satz of karton) {
      expect(satz.lieferGebindeText).toBe('6 x 0,75')
      expect(satz.einheitenProGebinde).toBe(6)
      expect(satz.zaehlmodus).toBe(Zaehlmodus.EINZELN)
      expect(satz.ekPreisBezug).toBe(EkPreisBezug.PRO_EINHEIT)
    }
  })

  it('vergibt für jeden Artikel einen eindeutigen Schlüssel aus Name und Gebinde', () => {
    const schluessel = saetze.map((s) => `${s.name} ${s.lieferGebindeText}`)
    expect(new Set(schluessel).size).toBe(saetze.length)
  })
})
