/**
 * Die Rezepturansicht: Mengentext, Herkunft und die beiden Gruppierungen.
 *
 * Die Beispiele sind die echten Stadthafener Rezepturen — dieselben Zahlen,
 * die nach der Vorbefüllung in der Datenbank stehen. Ein erfundener Artikel
 * mit runden Werten übersähe genau die Fälle, an denen es hier hängt: die
 * gespeicherten drei Nachkommastellen (0,029 für 2 cl aus der 0,7er) und den
 * Fassmix-Anteil (0,005 vom 50-l-Fass).
 */

import { describe, expect, it } from 'vitest'

import { Zaehlmodus } from '@/generated/prisma/enums'
import {
  herkunftstext,
  istMischung,
  mengentext,
  nachArtikel,
  nachGetraenk,
  type Rezepturartikel,
} from '@/lib/rezeptur'

const aperol: Rezepturartikel = {
  name: 'Aperol',
  lieferGebindeText: '1 x 1,0',
  einheitsgroesseLiter: '1',
  zaehlmodus: Zaehlmodus.EINZELN,
}

const prosecco: Rezepturartikel = {
  name: 'Leonardo Prosecco (zum mischen)',
  lieferGebindeText: '6 x 0,75',
  einheitsgroesseLiter: '0.75',
  zaehlmodus: Zaehlmodus.EINZELN,
}

const vodka: Rezepturartikel = {
  name: 'Dockside Vodka',
  lieferGebindeText: '1 x 0,7',
  einheitsgroesseLiter: '0.7',
  zaehlmodus: Zaehlmodus.EINZELN,
}

const fass: Rezepturartikel = {
  name: 'Veltins',
  lieferGebindeText: '1 x 50,0',
  einheitsgroesseLiter: '50',
  zaehlmodus: Zaehlmodus.FASS,
}

const cola: Rezepturartikel = {
  name: 'Coca Cola',
  lieferGebindeText: '24 x 0,33',
  einheitsgroesseLiter: '0.33',
  zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
}

describe('mengentext', () => {
  it('sagt ganze Einheiten als Flaschen', () => {
    expect(mengentext(cola, '1')).toBe('1 Flasche')
    expect(mengentext(cola, '2')).toBe('2 Flaschen')
  })

  it('sagt kleine Portionen in Zentilitern', () => {
    expect(mengentext(aperol, '0.06')).toBe('6 cl')
    // 2 cl aus der 0,7er stehen gespeichert als 0,029 — die Karte sagt
    // trotzdem "2 cl": sie beschreibt den Ausschank, nicht die Spaltenbreite.
    expect(mengentext(vodka, '0.029')).toBe('2 cl')
  })

  it('sagt Gläser in Litern, ab der Grenze der Getränkekarte', () => {
    // 0,1 l Prosecco stehen gespeichert als 0,133 der 0,75er.
    expect(mengentext(prosecco, '0.133')).toBe('0,1 l')
    expect(mengentext(fass, '0.005')).toBe('0,25 l')
  })
})

describe('herkunftstext', () => {
  it('nennt die Flasche bei Portionen und das Fass beim Fass', () => {
    expect(herkunftstext(aperol, '0.06')).toBe('aus der 1-l-Flasche')
    expect(herkunftstext(fass, '0.005')).toBe('vom 50-l-Fass')
  })

  it('nennt beim vollen Gebinde den Liefertext', () => {
    expect(herkunftstext(cola, '1')).toBe('24 x 0,33')
  })
})

describe('istMischung', () => {
  it('trennt volle Flaschen von Portionen und Mischungen', () => {
    expect(istMischung([{ artikel: cola, einheitenProVerkauf: '1' }])).toBe(false)
    expect(istMischung([{ artikel: aperol, einheitenProVerkauf: '0.06' }])).toBe(true)
    expect(
      istMischung([
        { artikel: aperol, einheitenProVerkauf: '1' },
        { artikel: prosecco, einheitenProVerkauf: '1' },
      ]),
    ).toBe(true)
  })
})

const spritz = {
  posBezeichnung: 'Aperol Spritz',
  bestaetigt: false,
  bestandteile: [
    { artikel: aperol, einheitenProVerkauf: '0.06' },
    { artikel: prosecco, einheitenProVerkauf: '0.133' },
  ],
}

const colaFlasche = {
  posBezeichnung: 'Coca Cola 0,33l',
  bestaetigt: true,
  bestandteile: [{ artikel: cola, einheitenProVerkauf: '1' }],
}

const eisProsecco = {
  posBezeichnung: 'Prosecco auf Eis 0,2',
  bestaetigt: true,
  bestandteile: [{ artikel: prosecco, einheitenProVerkauf: '0.267' }],
}

describe('nachGetraenk', () => {
  it('teilt in Karten und Kompaktzeilen und sortiert alphabetisch', () => {
    const { mischungen, flaschen } = nachGetraenk([colaFlasche, spritz, eisProsecco])

    expect(mischungen.map((karte) => karte.posBezeichnung)).toEqual([
      'Aperol Spritz',
      'Prosecco auf Eis 0,2',
    ])
    expect(flaschen).toEqual([
      { posBezeichnung: 'Coca Cola 0,33l', bestaetigt: true, artikelText: 'Coca Cola · 24 x 0,33' },
    ])
  })

  it('setzt die Zutaten einer Karte fertig zum Zeigen um', () => {
    const { mischungen } = nachGetraenk([spritz])
    expect(mischungen[0].zutaten).toEqual([
      { menge: '6 cl', artikel: 'Aperol', herkunft: 'aus der 1-l-Flasche' },
      {
        menge: '0,1 l',
        artikel: 'Leonardo Prosecco (zum mischen)',
        herkunft: 'aus der 0,75-l-Flasche',
      },
    ])
  })

  it('übergeht Zeilen ohne Bestandteile', () => {
    const { mischungen, flaschen } = nachGetraenk([
      { posBezeichnung: 'Kartoffel-Pommes', bestaetigt: true, bestandteile: [] },
    ])
    expect(mischungen).toEqual([])
    expect(flaschen).toEqual([])
  })
})

describe('nachArtikel', () => {
  it('gruppiert die Abnehmer je Artikel und zählt sie in der Fusszeile', () => {
    const karten = nachArtikel([spritz, eisProsecco, colaFlasche])

    const proseccoKarte = karten.find((karte) => karte.artikel.startsWith('Leonardo'))!
    expect(proseccoKarte.gebindeText).toBe('6 x 0,75')
    expect(proseccoKarte.abnehmer).toEqual([
      { posBezeichnung: 'Aperol Spritz', menge: '0,1 l', bestaetigt: false },
      { posBezeichnung: 'Prosecco auf Eis 0,2', menge: '0,2 l', bestaetigt: true },
    ])
    expect(proseccoKarte.fusszeile).toBe('2 Getränke zapfen aus diesem Artikel')

    expect(karten.find((karte) => karte.artikel === 'Coca Cola')!.fusszeile).toBe(
      '1 Getränk zapft aus diesem Artikel',
    )
  })

  it('unterscheidet denselben Namen nach Gebinde', () => {
    const dose: Rezepturartikel = { ...cola, lieferGebindeText: '12 x 1,0', einheitsgroesseLiter: '1' }
    const karten = nachArtikel([
      colaFlasche,
      {
        posBezeichnung: 'Coca Cola',
        bestaetigt: true,
        bestandteile: [{ artikel: dose, einheitenProVerkauf: '0.3' }],
      },
    ])
    expect(karten.map((karte) => `${karte.artikel} · ${karte.gebindeText}`)).toEqual([
      'Coca Cola · 12 x 1,0',
      'Coca Cola · 24 x 0,33',
    ])
  })
})
