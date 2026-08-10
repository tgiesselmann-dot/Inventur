import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug } from '@/generated/prisma/enums'
import { zeile, type AuswertungsArtikel, type Bewegungen } from '@/lib/auswertung'
import { alsAnzeige, schwundstufe, sortiert, type Anzeigezeile } from '@/lib/auswertung-anzeige'

/** Cola, 24 x 0,33 zu 18,59 EUR je Kasten — 77,458… Cent je Flasche. */
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

/** Champagner: teuer je Flasche, kleiner Durchsatz. */
const champagner: AuswertungsArtikel = {
  id: 'a2',
  name: 'Moët Impérial',
  kategorie: 'Schaumwein',
  lieferGebindeText: '6 x 0,75',
  einheitenProGebinde: 6,
  ekPreisCent: 3200,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  schwundfaehig: true,
}

/** Gin — portioniert ausgeschenkt, deshalb ohne Schwundrechnung. */
const gin: AuswertungsArtikel = {
  id: 'a3',
  name: 'Sudmare Gin',
  kategorie: 'Spirituosen',
  lieferGebindeText: '1 x 0,7',
  einheitenProGebinde: 1,
  ekPreisCent: 1150,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  schwundfaehig: false,
}

/** Wein ohne hinterlegten Preis — im Stamm gibt es solche Zeilen. */
const weinOhnePreis: AuswertungsArtikel = {
  id: 'a4',
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

describe('schwundstufe', () => {
  it('färbt einen kleinen Schwund nicht ein', () => {
    // 4 von 400 verkauften Flaschen: 1 Prozent, 3,10 EUR.
    expect(schwundstufe(zeile(cola, bewegung(400, 100, 400, 96)))).toBe('neutral')
  })

  it('nennt einen Schwund über dem Anteil auffällig', () => {
    // 12 von 100: 12 Prozent.
    expect(schwundstufe(zeile(cola, bewegung(200, 0, 100, 88)))).toBe('auffaellig')
  })

  it('nennt einen teuren Schwund auch bei kleinem Anteil auffällig', () => {
    // 1 von 100 Flaschen — ein Prozent, aber 32 EUR.
    expect(schwundstufe(zeile(champagner, bewegung(200, 0, 100, 99)))).toBe('auffaellig')
  })

  it('erkennt einen auffälligen Anteil auch ohne hinterlegten Preis', () => {
    // Ohne Preis greift die Wertschwelle nicht — der Anteil muss reichen.
    expect(schwundstufe(zeile(weinOhnePreis, bewegung(60, 0, 30, 24)))).toBe('auffaellig')
  })

  it('nennt mehr Bestand als möglich nicht Schwund, sondern zuviel', () => {
    expect(schwundstufe(zeile(cola, bewegung(100, 0, 40, 80)))).toBe('zuviel')
  })

  it('lässt einen Schwund ohne Verkäufe und ohne Preis neutral', () => {
    // Kein Durchsatz, kein Wert: es gibt nichts, woran eine Schwelle hinge.
    expect(schwundstufe(zeile(weinOhnePreis, bewegung(12, 0, 0, 11)))).toBe('neutral')
  })

  it('gibt portioniert verkauften Artikeln keine Stufe', () => {
    expect(schwundstufe(zeile(gin, bewegung(6, 6, 0, 9)))).toBe('ohne')
  })

  it('gibt ungezählten Artikeln keine Stufe', () => {
    expect(schwundstufe(zeile(cola, bewegung(48, 0, 24, null)))).toBe('ohne')
  })
})

describe('alsAnzeige', () => {
  it('trägt Text und Stufe zusammen', () => {
    const anzeige = alsAnzeige(zeile(cola, bewegung(200, 0, 100, 88)))
    expect(anzeige.schwund).toBe('12')
    expect(anzeige.stufe).toBe('auffaellig')
    expect(anzeige.artikel.name).toBe('Coca Cola')
  })
})

describe('sortiert', () => {
  const gross = alsAnzeige(zeile(champagner, bewegung(20, 0, 10, 8)))
  const klein = alsAnzeige(zeile(cola, bewegung(400, 0, 200, 396)))
  const ohneWert = alsAnzeige(zeile(weinOhnePreis, bewegung(12, 0, 6, 4)))
  const alle: Anzeigezeile[] = [klein, ohneWert, gross]

  it('stellt absteigend den grössten Schwundwert nach vorn', () => {
    expect(sortiert(alle, 'schwund-ab').map((eintrag) => eintrag.artikel.id)).toEqual([
      'a2',
      'a1',
      'a4',
    ])
  })

  it('stellt aufsteigend den kleinsten nach vorn und lässt die offene Frage hinten', () => {
    expect(sortiert(alle, 'schwund-auf').map((eintrag) => eintrag.artikel.id)).toEqual([
      'a1',
      'a2',
      'a4',
    ])
  })

  it('ordnet nach Namen', () => {
    expect(sortiert(alle, 'name').map((eintrag) => eintrag.artikel.name)).toEqual([
      '3 Freunde Weisswein',
      'Coca Cola',
      'Moët Impérial',
    ])
  })

  it('lässt die übergebene Liste unberührt', () => {
    const vorher = alle.map((eintrag) => eintrag.artikel.id)
    sortiert(alle, 'schwund-auf')
    expect(alle.map((eintrag) => eintrag.artikel.id)).toEqual(vorher)
  })
})
