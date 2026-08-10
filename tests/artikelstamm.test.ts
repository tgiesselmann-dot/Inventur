import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug, Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import {
  gefiltert,
  kategorien,
  leseArtikelformular,
  literAbleitung,
  literJeGebindeText,
  preisAbleitung,
  preisRechenweg,
  standzahlen,
  zaehlZeile,
  type StammArtikel,
} from '@/lib/artikelstamm'
import { zaehlmodusText } from '@/lib/zaehlung'

/** Kasten Cola, 24 x 0,33, 18,59 EUR je Kasten. */
const kastenCola: StammArtikel = {
  gebindeart: Gebindeart.KASTEN,
  zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
  einheitenProGebinde: 24,
  einheitsgroesseLiter: new Decimal('0.33'),
  lieferGebindeText: '24 x 0,33',
  ekPreisCent: 1859,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

/** Karton Wein, 6 x 0,75, 8,90 EUR je Flasche. */
const kartonWein: StammArtikel = {
  gebindeart: Gebindeart.KARTON,
  zaehlmodus: Zaehlmodus.EINZELN,
  einheitenProGebinde: 6,
  einheitsgroesseLiter: new Decimal('0.75'),
  lieferGebindeText: '6 x 0,75',
  ekPreisCent: 890,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
}

/** Aperol, Einzelflasche 1,0 l, 13,49 EUR je Flasche. */
const flascheAperol: StammArtikel = {
  gebindeart: Gebindeart.EINZELFLASCHE,
  zaehlmodus: Zaehlmodus.EINZELN,
  einheitenProGebinde: 1,
  einheitsgroesseLiter: new Decimal('1'),
  lieferGebindeText: '1 x 1,0',
  ekPreisCent: 1349,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
}

/** Fass Pils, 30 l, 95,00 EUR je Fass. */
const fassPils: StammArtikel = {
  gebindeart: Gebindeart.FASS,
  zaehlmodus: Zaehlmodus.FASS,
  einheitenProGebinde: 1,
  einheitsgroesseLiter: new Decimal('30'),
  lieferGebindeText: '30 l',
  ekPreisCent: 9500,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

describe('literJeGebindeText', () => {
  it('rechnet den Kasten vor: 24 × 0,33 l = 7,92 l je Kasten', () => {
    expect(literJeGebindeText(kastenCola)).toBe('24 × 0,33 l = 7,92 l je Kasten')
  })

  it('zeigt die Einzelflasche mit zwei Nachkommastellen: 1 × 1,00 l', () => {
    expect(literJeGebindeText(flascheAperol)).toBe('1 × 1,00 l = 1,00 l je Flasche')
  })

  it('behält eine gebrauchte dritte Nachkommastelle: 0,375', () => {
    expect(
      literJeGebindeText({ ...kartonWein, einheitsgroesseLiter: new Decimal('0.375') }),
    ).toBe('6 × 0,375 l = 2,25 l je Karton')
  })
})

describe('preisRechenweg', () => {
  it('leitet beim Gebindepreis den Flaschenpreis ab', () => {
    expect(preisRechenweg(kastenCola)).toEqual({
      haupt: '18,59 EUR je Kasten',
      abgeleitet: '= 0,77 EUR je Flasche',
    })
  })

  it('leitet beim Einheitenpreis den Gebindepreis ab', () => {
    expect(preisRechenweg(kartonWein)).toEqual({
      haupt: '8,90 EUR je Flasche',
      abgeleitet: '= 53,40 EUR je Karton',
    })
  })

  it('leitet bei einer Einheit je Gebinde den Literpreis ab', () => {
    expect(preisRechenweg(flascheAperol)).toEqual({
      haupt: '13,49 EUR je Flasche',
      abgeleitet: '= 13,49 EUR je Liter',
    })
    expect(preisRechenweg(fassPils)).toEqual({
      haupt: '95,00 EUR je Fass',
      abgeleitet: '= 3,17 EUR je Liter',
    })
  })

  it('gibt null zurück, wenn kein Preis hinterlegt ist — nicht 0,00 EUR', () => {
    expect(preisRechenweg({ ...kastenCola, ekPreisCent: null })).toBeNull()
  })
})

describe('zaehlZeile', () => {
  it('trägt Gebindetext und Zählmodus, keinen Preis', () => {
    expect(zaehlZeile(kastenCola)).toBe('24 x 0,33 · Gebinde plus einzeln')
    expect(zaehlmodusText(Zaehlmodus.EINZELN)).toBe('Nur einzeln')
  })
})

describe('literAbleitung und preisAbleitung (Live-Karten der Maske)', () => {
  const eingaben = {
    gebindeart: Gebindeart.KASTEN,
    einheiten: '24',
    inhalt: '0,33',
    preis: '18,59',
    bezug: EkPreisBezug.PRO_GEBINDE,
  }

  it('folgt den Eingabetexten', () => {
    expect(literAbleitung(eingaben)).toBe('24 × 0,33 l = 7,92 l je Kasten')
    expect(preisAbleitung(eingaben)).toEqual({
      haupt: '18,59 EUR je Kasten',
      abgeleitet: '= 0,77 EUR je Flasche',
    })
  })

  it('meldet ein leeres Preisfeld als unbekannt, nie als 0', () => {
    expect(preisAbleitung({ ...eingaben, preis: '' })).toBe('unbekannt')
    expect(preisAbleitung({ ...eingaben, preis: '   ' })).toBe('unbekannt')
  })

  it('zeigt bei halb getippten Zahlen nichts statt Unsinn', () => {
    expect(literAbleitung({ ...eingaben, einheiten: '2x' })).toBeNull()
    expect(literAbleitung({ ...eingaben, inhalt: '0,' })).toBeNull()
    expect(preisAbleitung({ ...eingaben, preis: 'abc' })).toBeNull()
  })
})

describe('leseArtikelformular', () => {
  function formular(felder: Record<string, string>): FormData {
    const daten = new FormData()
    const vorgabe: Record<string, string> = {
      name: 'Coca Cola',
      kategorie: 'Alkoholfrei',
      sortierung: '120',
      gebindeart: 'KASTEN',
      zaehlmodus: 'GEBINDE_PLUS_EINZELN',
      lieferGebindeText: '24 x 0,33',
      einheiten: '24',
      inhalt: '0,33',
      preis: '18,59',
      ekPreisBezug: 'PRO_GEBINDE',
      schwundfaehig: 'ja',
      aktiv: 'ja',
    }
    Object.entries({ ...vorgabe, ...felder }).forEach(([feld, wert]) => daten.set(feld, wert))
    return daten
  }

  it('liest ein vollständiges Formular in einen schreibfertigen Satz', () => {
    const satz = leseArtikelformular(formular({}))
    expect(satz).toMatchObject({
      name: 'Coca Cola',
      kategorie: 'Alkoholfrei',
      sortierung: 120,
      gebindeart: Gebindeart.KASTEN,
      zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
      einheitenProGebinde: 24,
      ekPreisCent: 1859,
      ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
      schwundfaehig: true,
      aktiv: true,
    })
    expect(satz.einheitsgroesseLiter.toString()).toBe('0.33')
  })

  it('speichert ein leeres Preisfeld als null, nicht als 0', () => {
    expect(leseArtikelformular(formular({ preis: '' })).ekPreisCent).toBeNull()
    expect(leseArtikelformular(formular({ preis: '  ' })).ekPreisCent).toBeNull()
  })

  it('liest die Schalter: alles ausser "ja" ist aus', () => {
    const satz = leseArtikelformular(formular({ schwundfaehig: 'nein', aktiv: '' }))
    expect(satz.schwundfaehig).toBe(false)
    expect(satz.aktiv).toBe(false)
  })

  it.each([
    [{ name: '  ' }, /Name fehlt/],
    [{ sortierung: '12,5' }, /Sortiernummer/],
    [{ einheiten: '0' }, /Einheiten je Gebinde/],
    [{ einheiten: '2,5' }, /Einheiten je Gebinde/],
    [{ inhalt: '0' }, /Inhalt je Einheit/],
    [{ preis: 'abc' }, /Einkaufspreis/],
    [{ preis: '-1' }, /nicht negativ/],
    [{ gebindeart: 'PALETTE' }, /Gebindeart/],
    [{ zaehlmodus: '' }, /Zählmodus/],
    [{ ekPreisBezug: 'JE_LITER' }, /Preisbezug/],
  ] as const)('weist %o mit sprechender Meldung ab', (felder, meldung) => {
    expect(() => leseArtikelformular(formular({ ...felder }))).toThrow(meldung)
  })
})

describe('gefiltert', () => {
  const liste = [
    { name: 'Coca Cola', lieferGebindeText: '24 x 0,33', kategorie: 'Alkoholfrei', aktiv: true },
    { name: 'Coca Cola', lieferGebindeText: '12 x 1,0', kategorie: 'Alkoholfrei', aktiv: true },
    { name: 'Riesling trocken', lieferGebindeText: '6 x 0,75', kategorie: 'Wein', aktiv: true },
    { name: 'Aperol', lieferGebindeText: '1 x 1,0', kategorie: 'Spirituosen', aktiv: false },
  ]

  it('sucht über Name und Gebindetext zusammen', () => {
    expect(gefiltert(liste, { suche: 'cola 24', kategorie: '', stand: 'alle' })).toHaveLength(1)
    expect(gefiltert(liste, { suche: '0,33', kategorie: '', stand: 'alle' })).toHaveLength(1)
    expect(gefiltert(liste, { suche: 'cola', kategorie: '', stand: 'alle' })).toHaveLength(2)
  })

  it('filtert nach Stand und Kategorie, ohne Stillgelegte zu verstecken, wenn alle gewählt ist', () => {
    expect(gefiltert(liste, { suche: '', kategorie: '', stand: 'alle' })).toHaveLength(4)
    expect(gefiltert(liste, { suche: '', kategorie: '', stand: 'stillgelegt' })).toEqual([
      liste[3],
    ])
    expect(gefiltert(liste, { suche: '', kategorie: 'Wein', stand: 'aktiv' })).toEqual([liste[2]])
  })

  it('zählt die Stände und sammelt die Kategorien in Laufweg-Reihenfolge', () => {
    expect(standzahlen(liste)).toEqual({ alle: 4, aktiv: 3, stillgelegt: 1 })
    expect(kategorien(liste)).toEqual(['Alkoholfrei', 'Wein', 'Spirituosen'])
  })
})
