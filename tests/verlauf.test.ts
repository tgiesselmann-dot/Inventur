import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug } from '@/generated/prisma/enums'
import { zeile, type AuswertungsArtikel, type Bewegungen, type Zeile } from '@/lib/auswertung'
import type { Zeitraum } from '@/lib/auswertung-daten'
import {
  balkenanteil,
  hoechsteQuote,
  kategorien,
  quotenstufe,
  schwundJeKategorie,
  veraenderung,
  veraenderungstext,
  verlaufspunkt,
  zeitraeumeAus,
  zeitraumzahl,
  type Verlaufspunkt,
} from '@/lib/verlauf'

/** Kasten Cola, 24 x 0,33, 18,59 EUR je Kasten. */
const cola: AuswertungsArtikel = {
  id: 'a1',
  name: 'Coca Cola',
  kategorie: 'Softdrinks',
  lieferGebindeText: '24 x 0,33',
  einheitenProGebinde: 24,
  ekPreisCent: 1859,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  schwundfaehig: true,
}

/** Pils, 20 x 0,5, 12,00 EUR je Kasten — eine zweite Kategorie. */
const pils: AuswertungsArtikel = {
  id: 'a2',
  name: 'Veltins Pils',
  kategorie: 'Bier',
  lieferGebindeText: '20 x 0,5',
  einheitenProGebinde: 20,
  ekPreisCent: 1200,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  schwundfaehig: true,
}

/** Wein ohne hinterlegten Preis — gezählt, aber nicht bewertbar. */
const weinOhnePreis: AuswertungsArtikel = {
  id: 'a3',
  name: '3 Freunde Weisswein',
  kategorie: 'Wein',
  lieferGebindeText: '6 x 0,75',
  einheitenProGebinde: 6,
  ekPreisCent: null,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  schwundfaehig: true,
}

const OHNE_BELEGE = { anfang: [], lieferungen: [], verkaeufe: [], ist: [] }

function bewegung(
  anfang: number,
  lieferungen: number,
  verkaeufe: number,
  ist: number | null,
): Bewegungen {
  return {
    anfang: new Decimal(anfang),
    lieferungen: new Decimal(lieferungen),
    verkaeufe: new Decimal(verkaeufe),
    ist: ist === null ? null : new Decimal(ist),
    belege: OHNE_BELEGE,
  }
}

function tag(text: string): Date {
  return new Date(`${text}T00:00:00Z`)
}

function zaehlung(id: string, datum: string) {
  return { id, datum: tag(datum) }
}

const ZEITRAUM: Zeitraum = {
  vonZaehlungId: 'z1',
  bisZaehlungId: 'z2',
  von: tag('2026-07-27'),
  bis: tag('2026-08-03'),
  tage: 7,
}

function punkt(quote: number | null): Verlaufspunkt {
  return {
    zeitraum: ZEITRAUM,
    gesamt: {
      schwundWertCent: 0,
      bestandWertCent: 0,
      wareneinsatzCent: 0,
      bewertet: 0,
      ohnePreis: 0,
      ohneSchwundrechnung: 0,
      ungezaehlt: 0,
      verkauftOhnePreis: 0,
    },
    bestand: { einheiten: new Decimal(0), wertCent: null, artikel: 0, ohnePreis: 0 },
    quote,
    mitUmsatzdaten: true,
    kategorien: [],
  }
}

describe('zeitraeumeAus', () => {
  it('macht aus n Zählungen n−1 Zeiträume, jüngster zuerst', () => {
    const zeitraeume = zeitraeumeAus(
      [zaehlung('c', '2026-08-10'), zaehlung('b', '2026-08-03'), zaehlung('a', '2026-07-27')],
      12,
    )

    expect(zeitraeume).toHaveLength(2)
    expect(zeitraeume[0]).toMatchObject({ vonZaehlungId: 'b', bisZaehlungId: 'c', tage: 7 })
    expect(zeitraeume[1]).toMatchObject({ vonZaehlungId: 'a', bisZaehlungId: 'b', tage: 7 })
  })

  it('gibt ohne zwei Zählungen keinen Zeitraum', () => {
    expect(zeitraeumeAus([], 12)).toEqual([])
    expect(zeitraeumeAus([zaehlung('a', '2026-08-10')], 12)).toEqual([])
  })

  it('schneidet hinten ab — die jüngsten Zeiträume bleiben', () => {
    const zeitraeume = zeitraeumeAus(
      [
        zaehlung('d', '2026-08-10'),
        zaehlung('c', '2026-08-03'),
        zaehlung('b', '2026-07-27'),
        zaehlung('a', '2026-07-20'),
      ],
      2,
    )

    expect(zeitraeume.map((eintrag) => eintrag.bisZaehlungId)).toEqual(['d', 'c'])
  })

  it('rechnet auch ungleiche Abstände in Tagen aus', () => {
    // Eine ausgefallene Woche: vierzehn Tage zwischen zwei Zählungen.
    const [zeitraum] = zeitraeumeAus(
      [zaehlung('b', '2026-08-10'), zaehlung('a', '2026-07-27')],
      12,
    )
    expect(zeitraum.tage).toBe(14)
  })

  it('zählt die Zeiträume unabhängig von der Grenze', () => {
    expect(zeitraumzahl([zaehlung('b', '2026-08-10'), zaehlung('a', '2026-08-03')])).toBe(1)
    expect(zeitraumzahl([])).toBe(0)
  })
})

describe('quotenstufe', () => {
  it('nennt eine fehlende Quote „ohne" und nicht null Prozent', () => {
    expect(quotenstufe(null)).toBe('ohne')
  })

  it('trennt Fehlbestand von Überbestand', () => {
    expect(quotenstufe(-1.2)).toBe('zuviel')
    expect(quotenstufe(1.2)).toBe('neutral')
  })

  it('nutzt dieselbe Schwelle wie die einzelne Zeile — 3 Prozent', () => {
    expect(quotenstufe(2.9)).toBe('neutral')
    expect(quotenstufe(3)).toBe('auffaellig')
    expect(quotenstufe(7.4)).toBe('auffaellig')
  })
})

describe('schwundJeKategorie', () => {
  const zeilen: Zeile[] = [
    // Cola: 100 da, 0 geliefert, 50 verkauft, 45 gezählt -> 5 fehlen.
    zeile(cola, bewegung(100, 0, 50, 45)),
    // Pils: nichts fehlt.
    zeile(pils, bewegung(200, 0, 100, 100)),
    // Wein ohne Preis: 2 fehlen, aber niemand kann sie bewerten.
    zeile(weinOhnePreis, bewegung(10, 0, 4, 4)),
  ]

  it('gruppiert nach Kategorie und ordnet alphabetisch', () => {
    expect(schwundJeKategorie(zeilen).map((eintrag) => eintrag.kategorie)).toEqual([
      'Bier',
      'Softdrinks',
      'Wein',
    ])
  })

  it('rechnet Schwund und Quote je Kategorie', () => {
    const jeKategorie = new Map(
      schwundJeKategorie(zeilen).map((eintrag) => [eintrag.kategorie, eintrag]),
    )

    // 5 Flaschen Cola zu 77,458… Cent = 387 Cent; Wareneinsatz 50 Flaschen = 3873.
    expect(jeKategorie.get('Softdrinks')?.schwundWertCent).toBe(387)
    expect(jeKategorie.get('Softdrinks')?.quote).toBe(10)

    expect(jeKategorie.get('Bier')?.schwundWertCent).toBe(0)
    expect(jeKategorie.get('Bier')?.quote).toBe(0)
  })

  it('lässt die Quote ohne bewertbare Verkäufe offen statt sie auf null zu setzen', () => {
    const wein = schwundJeKategorie(zeilen).find((eintrag) => eintrag.kategorie === 'Wein')
    expect(wein?.quote).toBeNull()
    expect(wein?.ohnePreis).toBe(1)
  })
})

describe('verlaufspunkt', () => {
  it('trägt Summe, Bestand, Quote und Kategorien zusammen', () => {
    const ergebnis = verlaufspunkt(
      ZEITRAUM,
      [zeile(cola, bewegung(100, 0, 50, 45)), zeile(pils, bewegung(200, 0, 100, 100))],
      true,
    )

    expect(ergebnis.zeitraum).toBe(ZEITRAUM)
    expect(ergebnis.gesamt.schwundWertCent).toBe(387)
    // Bezugsgrösse ist der Wareneinsatz beider Kategorien: 50 Cola (3873) und
    // 100 Pils (6000) — 387 von 9873 sind 3,9 %. Die Quote des Betriebs ist
    // damit kleiner als die der auffälligen Kategorie allein (10 %), und genau
    // deshalb steht die Tafel darunter.
    expect(ergebnis.gesamt.wareneinsatzCent).toBe(9873)
    expect(ergebnis.quote).toBe(3.9)
    expect(ergebnis.bestand.artikel).toBe(2)
    expect(ergebnis.kategorien).toHaveLength(2)
  })
})

describe('kategorien', () => {
  it('sammelt jede Kategorie, die irgendwo vorkommt', () => {
    const eine = verlaufspunkt(ZEITRAUM, [zeile(cola, bewegung(10, 0, 5, 5))], true)
    const andere = verlaufspunkt(ZEITRAUM, [zeile(pils, bewegung(10, 0, 5, 5))], true)

    // Beide Zeilen bleiben stehen, auch wo eine Kategorie in einer Woche fehlt —
    // sonst verschöben sich die Spalten unter dem Auge.
    expect(kategorien([eine, andere])).toEqual(['Bier', 'Softdrinks'])
  })
})

describe('balkenanteil', () => {
  it('bezieht sich auf die grösste Quote der Reihe', () => {
    expect(balkenanteil(2, 4)).toBe(0.5)
    expect(balkenanteil(4, 4)).toBe(1)
  })

  it('misst negative Quoten an ihrem Betrag', () => {
    expect(balkenanteil(-2, 4)).toBe(0.5)
  })

  it('zeigt für eine fehlende Quote keinen Balken', () => {
    expect(balkenanteil(null, 4)).toBeNull()
  })

  it('kommt ohne Bezugsgrösse zurecht', () => {
    expect(balkenanteil(0, 0)).toBe(0)
  })

  it('findet die grösste Quote dem Betrag nach', () => {
    expect(hoechsteQuote([punkt(1.2), punkt(-3.4), punkt(null)])).toBe(3.4)
    expect(hoechsteQuote([punkt(null)])).toBe(0)
    expect(hoechsteQuote([])).toBe(0)
  })
})

describe('veraenderung', () => {
  it('vergleicht mit dem Zeitraum davor — der steht hinter ihm in der Reihe', () => {
    const punkte = [punkt(3.1), punkt(2.4), punkt(2)]
    expect(veraenderung(punkte, 0)).toBe(0.7)
    expect(veraenderung(punkte, 1)).toBe(0.4)
  })

  it('lässt den ältesten Zeitraum ohne Vergleich', () => {
    expect(veraenderung([punkt(3.1), punkt(2.4)], 1)).toBeNull()
  })

  it('vergleicht nicht mit einer unbekannten Grösse', () => {
    expect(veraenderung([punkt(3.1), punkt(null)], 0)).toBeNull()
    expect(veraenderung([punkt(null), punkt(2.4)], 0)).toBeNull()
  })

  it('schreibt die Veränderung in Prozentpunkten, mit Vorzeichen', () => {
    expect(veraenderungstext(0.7)).toBe('+0,7 Pp')
    expect(veraenderungstext(-1.5)).toBe('-1,5 Pp')
    expect(veraenderungstext(0)).toBe('unverändert')
    expect(veraenderungstext(null)).toBeNull()
  })
})
