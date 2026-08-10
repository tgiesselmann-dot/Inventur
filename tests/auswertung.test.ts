import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug } from '@/generated/prisma/enums'
import {
  alsMenge,
  bestand,
  bestandswerttext,
  jeKategorie,
  nachSchwund,
  schwundquote,
  schwundquotentext,
  schwundwerttext,
  sollbestand,
  summe,
  zeile,
  type AuswertungsArtikel,
  type Bewegungen,
} from '@/lib/auswertung'

/** Kasten Cola, 24 x 0,33, 18,59 EUR je Kasten — also 77,458… Cent je Flasche. */
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

/** Gin 0,7 — portioniert ausgeschenkt, deshalb ohne Schwundrechnung. */
const gin: AuswertungsArtikel = {
  id: 'a2',
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
  id: 'a3',
  name: '3 Freunde Weisswein',
  kategorie: 'Wein',
  lieferGebindeText: '6 x 0,75',
  einheitenProGebinde: 6,
  ekPreisCent: null,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  schwundfaehig: true,
}

/** Ein zweiter Wein, diesmal mit Preis — dieselbe Kategorie wie der ohne. */
const weinMitPreis: AuswertungsArtikel = {
  id: 'a4',
  name: 'Grauburgunder',
  kategorie: 'Wein',
  lieferGebindeText: '6 x 0,75',
  einheitenProGebinde: 6,
  ekPreisCent: 890,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  schwundfaehig: true,
}

/** Zuckersirup — der einzige Artikel seiner Kategorie, und ohne Preis. */
const sirupOhnePreis: AuswertungsArtikel = {
  id: 'a5',
  name: 'Zuckersirup',
  kategorie: 'Barzutat',
  lieferGebindeText: '1 x 0,7',
  einheitenProGebinde: 1,
  ekPreisCent: null,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  schwundfaehig: false,
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

describe('sollbestand', () => {
  it('rechnet Anfang plus Lieferungen minus Verkäufe', () => {
    // 48 Flaschen im Keller, 96 geliefert, 100 verkauft -> 44 müssten stehen.
    expect(sollbestand(bewegung(48, 96, 100, 44)).toString()).toBe('44')
  })

  it('kommt mit Bruchteilen zurecht', () => {
    // Ein angebrochenes Fass und ein Ausschank von 2 cl je Buchung.
    expect(sollbestand(bewegung(2.5, 1, 0.36, null)).toString()).toBe('3.14')
  })
})

describe('zeile', () => {
  it('meldet Schwund, wenn weniger dasteht als möglich', () => {
    // Soll 44, gezählt 40: vier Flaschen sind weg, die niemand verkauft hat.
    const ergebnis = zeile(cola, bewegung(48, 96, 100, 40))
    expect(ergebnis.soll.toString()).toBe('44')
    expect(ergebnis.schwund?.toString()).toBe('4')
    // 1859 x 4 / 24 = 309,83… -> 310 Cent
    expect(ergebnis.schwundWertCent).toBe(310)
  })

  it('meldet negativen Schwund, wenn mehr dasteht als möglich', () => {
    // Mehr im Lager als die Papierlage hergibt — ein Hinweis auf eine nicht
    // erfasste Lieferung, kein Grund zur Freude.
    const ergebnis = zeile(cola, bewegung(48, 0, 10, 50))
    expect(ergebnis.schwund?.toString()).toBe('-12')
    expect(ergebnis.schwundWertCent).toBe(-930)
  })

  it('rechnet für portioniert verkaufte Artikel keinen Schwund', () => {
    // Die Kasse zählt Gläser, nicht Flaschen. Eine Umrechnung wäre geraten.
    const ergebnis = zeile(gin, bewegung(6, 6, 4, 7))
    expect(ergebnis.soll.toString()).toBe('8')
    expect(ergebnis.schwund).toBeNull()
    expect(ergebnis.schwundWertCent).toBeNull()
    // Der Bestand wird trotzdem gezählt und bewertet.
    expect(ergebnis.bestandWertCent).toBe(8050)
  })

  it('lässt den Schwund offen, wenn der Artikel nicht gezählt wurde', () => {
    // Nicht gezählt heisst unbekannt, nicht null.
    const ergebnis = zeile(cola, bewegung(48, 0, 10, null))
    expect(ergebnis.ist).toBeNull()
    expect(ergebnis.schwund).toBeNull()
    expect(ergebnis.bestandWertCent).toBeNull()
  })

  it('rechnet die Menge auch ohne Preis, lässt aber den Wert offen', () => {
    const ergebnis = zeile(weinOhnePreis, bewegung(12, 6, 4, 10))
    expect(ergebnis.schwund?.toString()).toBe('4')
    expect(ergebnis.schwundWertCent).toBeNull()
    expect(ergebnis.bestandWertCent).toBeNull()
  })
})

describe('summe', () => {
  it('addiert nur, was bewertbar ist, und zählt den Rest getrennt', () => {
    const zeilen = [
      zeile(cola, bewegung(48, 96, 100, 40)), // 4 Schwund, 310 Cent
      zeile(weinOhnePreis, bewegung(12, 6, 4, 10)), // 4 Schwund, ohne Preis
      zeile(gin, bewegung(6, 6, 4, 7)), // ohne Schwundrechnung
      zeile(cola, bewegung(24, 0, 0, null)), // nicht gezählt
    ]
    const gesamt = summe(zeilen)

    expect(gesamt.schwundWertCent).toBe(310)
    expect(gesamt.bewertet).toBe(1)
    expect(gesamt.ohnePreis).toBe(1)
    expect(gesamt.ohneSchwundrechnung).toBe(1)
    expect(gesamt.ungezaehlt).toBe(1)
  })

  it('summiert den Bestandswert über alles Gezählte', () => {
    // Cola: 40 Flaschen zu 1859/24 = 3098,33 -> 3098 Cent; Gin: 7 x 1150 = 8050.
    const gesamt = summe([zeile(cola, bewegung(48, 96, 100, 40)), zeile(gin, bewegung(6, 6, 4, 7))])
    expect(gesamt.bestandWertCent).toBe(3098 + 8050)
  })

  it('rechnet den Wareneinsatz aus den Verkäufen', () => {
    // 100 Flaschen Cola zu 1859/24 = 7745,83 -> 7746 Cent
    expect(summe([zeile(cola, bewegung(48, 96, 100, 40))]).wareneinsatzCent).toBe(7746)
  })
})

describe('schwundquote', () => {
  it('setzt den Schwund ins Verhältnis zum Wareneinsatz', () => {
    const gesamt = summe([zeile(cola, bewegung(48, 96, 100, 40))])
    // 310 von 7746 Cent = 4,0 %
    expect(schwundquote(gesamt)).toBe(4)
  })

  it('gibt null zurück, solange nichts verkauft wurde', () => {
    // Ohne Bezugsgrösse gibt es keine Quote — eine 0 wäre eine Behauptung.
    expect(schwundquote(summe([zeile(cola, bewegung(48, 0, 0, 48))]))).toBeNull()
  })
})

describe('nachSchwund', () => {
  it('stellt den grössten Schwundwert nach oben', () => {
    const klein = zeile(cola, bewegung(48, 0, 0, 47))
    const gross = zeile(cola, bewegung(480, 0, 0, 400))
    expect(nachSchwund([klein, gross])[0]).toBe(gross)
  })

  it('schiebt Zeilen ohne Wert ans Ende', () => {
    // Sie sind keine kleine Abweichung, sondern eine offene Frage.
    const bewertbar = zeile(cola, bewegung(48, 0, 0, 47))
    const ohneWert = zeile(weinOhnePreis, bewegung(12, 0, 0, 8))
    const sortiert = nachSchwund([ohneWert, bewertbar])
    expect(sortiert[0]).toBe(bewertbar)
    expect(sortiert[1]).toBe(ohneWert)
  })
})

describe('alsMenge', () => {
  it('schreibt Mengen deutsch und ohne nachlaufende Nullen', () => {
    expect(alsMenge(new Decimal('44'))).toBe('44')
    expect(alsMenge(new Decimal('3.14'))).toBe('3,14')
    expect(alsMenge(new Decimal('-12'))).toBe('-12')
  })

  it('zeigt für eine offene Menge einen Gedankenstrich', () => {
    expect(alsMenge(null)).toBe('—')
  })
})

describe('bestand', () => {
  it('summiert Einheiten und Wert der gezählten Zeilen', () => {
    // Cola: 1859 x 40 / 24 = 3098,33… -> 3098 Cent. Gin: 1150 x 8 = 9200 Cent.
    const lage = bestand([zeile(cola, bewegung(48, 0, 0, 40)), zeile(gin, bewegung(6, 0, 0, 8))])
    expect(lage.einheiten.toString()).toBe('48')
    expect(lage.wertCent).toBe(12298)
    expect(lage.artikel).toBe(2)
    expect(lage.ohnePreis).toBe(0)
  })

  it('lässt nicht gezählte Zeilen ganz draussen', () => {
    // Ein Artikel ohne Istbestand ist keine Null im Regal, sondern eine offene
    // Frage — er darf weder die Einheiten noch die Zahl der Artikel bewegen.
    const lage = bestand([zeile(cola, bewegung(48, 0, 0, 40)), zeile(cola, bewegung(48, 0, 0, null))])
    expect(lage.einheiten.toString()).toBe('40')
    expect(lage.artikel).toBe(1)
    expect(lage.ohnePreis).toBe(0)
  })

  it('zählt die Menge ohne Preis mit und den Wert nicht', () => {
    const lage = bestand([
      zeile(cola, bewegung(48, 0, 0, 40)),
      zeile(weinOhnePreis, bewegung(12, 0, 0, 10)),
    ])
    expect(lage.einheiten.toString()).toBe('50')
    expect(lage.wertCent).toBe(3098)
    expect(lage.ohnePreis).toBe(1)
    expect(lage.artikel).toBe(2)
  })

  it('gibt null statt 0, wenn keine einzige Zeile bewertbar ist', () => {
    // Der Unterschied ist der ganze Punkt: unbekannt ist nicht null.
    const lage = bestand([zeile(weinOhnePreis, bewegung(12, 0, 0, 10))])
    expect(lage.wertCent).toBeNull()
    expect(lage.einheiten.toString()).toBe('10')
  })
})

describe('jeKategorie', () => {
  /** Vier gezählte Zeilen aus vier Kategorien, eine davon ganz ohne Preis. */
  function zeilen() {
    return [
      zeile(cola, bewegung(48, 0, 0, 40)), // Softdrinks: 3098 Cent
      zeile(gin, bewegung(6, 0, 0, 8)), // Spirituosen: 9200 Cent
      zeile(weinMitPreis, bewegung(12, 0, 0, 10)), // Wein: 8900 Cent
      zeile(weinOhnePreis, bewegung(12, 0, 0, 10)), // Wein: ohne Wert
      zeile(sirupOhnePreis, bewegung(4, 0, 0, 4)), // Barzutat: ohne Wert
    ]
  }

  it('fasst je Kategorie zusammen, wertvollste zuerst', () => {
    const lage = jeKategorie(zeilen())
    expect(lage.map((eintrag) => eintrag.kategorie)).toEqual([
      'Spirituosen',
      'Wein',
      'Softdrinks',
      'Barzutat',
    ])
  })

  it('rechnet in der gemischten Kategorie nur den bewerteten Teil', () => {
    // Zwanzig Flaschen Wein stehen im Regal, bewertbar sind zehn davon. Die
    // Einheiten stimmen trotzdem — gezählt wurde alles.
    const wein = jeKategorie(zeilen()).find((eintrag) => eintrag.kategorie === 'Wein')!
    expect(wein.einheiten.toString()).toBe('20')
    expect(wein.wertCent).toBe(8900)
    expect(wein.artikel).toBe(2)
    expect(wein.ohnePreis).toBe(1)
  })

  it('lässt eine Kategorie ohne jeden Preis ohne Wert — nicht bei 0', () => {
    // Der Fall, an dem die Excel scheiterte: vier Flaschen Sirup stehen da,
    // ihr Wert ist unbekannt. Eine 0 hier hiesse "wertlos" und wäre gelogen.
    const barzutat = jeKategorie(zeilen()).find((eintrag) => eintrag.kategorie === 'Barzutat')!
    expect(barzutat.wertCent).toBeNull()
    expect(barzutat.anteil).toBeNull()
    expect(barzutat.einheiten.toString()).toBe('4')
    expect(barzutat.artikel).toBe(1)
    expect(barzutat.ohnePreis).toBe(1)
  })

  it('setzt den Anteil ins Verhältnis zum bekannten Gesamtwert', () => {
    const lage = jeKategorie(zeilen())
    const gesamt = bestand(zeilen()).wertCent!
    expect(gesamt).toBe(21198)
    expect(lage[0].anteil).toBeCloseTo(9200 / gesamt, 10)
    // Die Kategorien mit Wert ergeben zusammen das Ganze.
    const summeAnteile = lage.reduce((wert, eintrag) => wert + (eintrag.anteil ?? 0), 0)
    expect(summeAnteile).toBeCloseTo(1, 10)
  })

  it('führt eine Kategorie ohne gezählte Zeile nicht auf', () => {
    // "0 Einheiten · —" sagt nichts, was das Fehlen der Zeile nicht auch sagt.
    const lage = jeKategorie([zeile(cola, bewegung(48, 0, 0, null))])
    expect(lage).toEqual([])
  })

  it('lässt ohne bekannten Gesamtwert alle Anteile offen', () => {
    // Ohne Bezugsgrösse gibt es keinen Anteil — ein Balken wäre erfunden.
    const lage = jeKategorie([zeile(weinOhnePreis, bewegung(12, 0, 0, 10))])
    expect(lage[0].anteil).toBeNull()
  })
})

describe('verkauftOhnePreis', () => {
  it('zählt Verkäufe, die im Wareneinsatz fehlen', () => {
    const gesamt = summe([
      zeile(cola, bewegung(48, 96, 100, 40)),
      zeile(weinOhnePreis, bewegung(12, 6, 4, 10)),
    ])
    expect(gesamt.verkauftOhnePreis).toBe(1)
  })

  it('zählt einen unverkauften Artikel ohne Preis nicht mit', () => {
    // Er fehlt in keiner Bezugsgrösse — nur im Schwundwert, und dort steht er
    // schon in `ohnePreis`.
    expect(summe([zeile(weinOhnePreis, bewegung(12, 0, 0, 10))]).verkauftOhnePreis).toBe(0)
  })
})

describe('schwundquotentext', () => {
  it('schreibt die Quote deutsch mit Prozent', () => {
    expect(schwundquotentext(4)).toBe('4 %')
    expect(schwundquotentext(3.2)).toBe('3,2 %')
  })

  it('reicht den fehlenden Wert durch', () => {
    expect(schwundquotentext(null)).toBeNull()
  })
})

describe('schwundwerttext', () => {
  it('nennt den Betrag, wo bewertet wurde', () => {
    expect(schwundwerttext(summe([zeile(cola, bewegung(48, 96, 100, 40))]))).toBe('3,10 EUR')
  })

  it('behauptet keine 0,00 EUR, wo nichts bewertbar ist', () => {
    expect(schwundwerttext(summe([zeile(weinOhnePreis, bewegung(12, 6, 4, 10))]))).toBe(
      'nicht bewertbar',
    )
  })

  it('zeigt den Strich, wo kein Schwund zu rechnen war', () => {
    expect(schwundwerttext(summe([zeile(gin, bewegung(6, 6, 4, 7))]))).toBeNull()
  })
})

describe('bestandswerttext', () => {
  it('nennt den Wert des Gezählten', () => {
    // 7 Flaschen Gin zu 1150 = 80,50 EUR.
    expect(bestandswerttext(bestand([zeile(gin, bewegung(6, 6, 4, 7))]))).toBe('80,50 EUR')
  })

  it('sagt "nicht bewertbar", wo gezählt wurde, aber kein Preis hinterlegt ist', () => {
    expect(bestandswerttext(bestand([zeile(weinOhnePreis, bewegung(12, 6, 4, 10))]))).toBe(
      'nicht bewertbar',
    )
  })

  it('zeigt den Strich, wo nichts gezählt wurde', () => {
    expect(bestandswerttext(bestand([zeile(cola, bewegung(24, 0, 0, null))]))).toBeNull()
  })
})
