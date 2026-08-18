import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug, Zaehlmodus } from '@/generated/prisma/enums'
import {
  EinheitenFehler,
  anteilAusMengenangabe,
  anteilJeAusschank,
  ausschankLiter,
  einheitenAusGebinden,
  mengenangabeAusAnteil,
  ekPreisCentAusGebindepreis,
  ekProEinheitCent,
  gebindeAusEinheiten,
  gebindeFuerEinheiten,
  gesamtEinheiten,
  wertCent,
  wertGebindeCent,
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

  it('gibt null zurück, wenn kein Preis hinterlegt ist', () => {
    // Die 3-Freunde-Weine aus dem Artikelstamm: Preis unbekannt, nicht 0.
    expect(ekProEinheitCent({ ...kartonWein, ekPreisCent: null })).toBeNull()
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

  it('gibt null statt 0 zurück, wenn kein Preis hinterlegt ist', () => {
    // Der Unterschied trägt die ganze Entscheidung: 0 würde in einer Summe
    // untergehen, null zwingt die Auswertung, den Fall zu benennen.
    expect(wertCent({ ...kartonWein, ekPreisCent: null }, 12)).toBeNull()
  })
})

describe('einheitenAusGebinden', () => {
  it('rechnet Liefergebinde in Einheiten, unabhängig vom Zählmodus', () => {
    // Der Karton Wein wird EINZELN gezählt — geliefert werden trotzdem 6 je
    // Karton. gesamtEinheiten würde diese Eingabe zu Recht abweisen.
    expect(einheitenAusGebinden(kartonWein, 2).toString()).toBe('12')
    expect(() => gesamtEinheiten(kartonWein, 2, 0)).toThrow(EinheitenFehler)
  })

  it('rechnet halbe Gebinde mit', () => {
    expect(einheitenAusGebinden(kastenBier, 0.5).toString()).toBe('12')
  })

  it('lässt das Fass bei sich selbst', () => {
    expect(einheitenAusGebinden(fassPils, 3).toString()).toBe('3')
  })

  it('weist eine negative Liefermenge ab', () => {
    expect(() => einheitenAusGebinden(kastenBier, -1)).toThrow(EinheitenFehler)
  })
})

describe('gebindeFuerEinheiten', () => {
  it('rundet 121 Flaschen auf sechs Kästen auf', () => {
    // Fünf Kästen wären 120 — eine Flasche zu wenig, und die fällt erst auf,
    // wenn das Regal leer ist.
    expect(gebindeFuerEinheiten(kastenBier, 121)).toBe(6)
  })

  it('rundet auch eine einzelne fehlende Flasche auf einen ganzen Kasten', () => {
    expect(gebindeFuerEinheiten(kastenBier, 1)).toBe(1)
  })

  it('lässt den vollen Kasten glatt', () => {
    expect(gebindeFuerEinheiten(kastenBier, 48)).toBe(2)
  })

  it('braucht für nichts kein Gebinde', () => {
    expect(gebindeFuerEinheiten(kastenBier, 0)).toBe(0)
  })

  it('rundet beim Fass auf ganze Fässer', () => {
    expect(gebindeFuerEinheiten(fassPils, 3.2)).toBe(4)
  })

  it('ist die Gegenrichtung zu einheitenAusGebinden', () => {
    // Zurückgerechnet deckt der Vorschlag den Bedarf immer, nie knapper.
    const gebinde = gebindeFuerEinheiten(kastenBier, 121)
    expect(einheitenAusGebinden(kastenBier, gebinde).greaterThanOrEqualTo(121)).toBe(true)
  })

  it('weist eine negative Menge ab', () => {
    // Eine negative Fehlmenge ist keine Bestellung — der Aufrufer kappt sie
    // vorher bei 0.
    expect(() => gebindeFuerEinheiten(kastenBier, -1)).toThrow(EinheitenFehler)
  })
})

describe('gebindeAusEinheiten', () => {
  it('gibt den angebrochenen Kasten als Bruchteil, nicht aufgerundet', () => {
    // 63 Flaschen sind 2,625 Kästen — als Bestand eine Auskunft, keine
    // Bestellmenge. Aufgerundet stünde da ein Kasten, der nicht da ist.
    expect(gebindeAusEinheiten(kastenBier, 63).toString()).toBe('2.625')
  })

  it('lässt den vollen Kasten glatt', () => {
    expect(gebindeAusEinheiten(kastenBier, 48).toString()).toBe('2')
  })

  it('ist beim Einzelflaschen-Artikel die Flaschenzahl selbst', () => {
    expect(gebindeAusEinheiten(einzelflascheGin, 8).toString()).toBe('8')
  })

  it('ist die exakte Umkehrung von einheitenAusGebinden', () => {
    const einheiten = einheitenAusGebinden(kastenBier, new Decimal('2.5'))
    expect(gebindeAusEinheiten(kastenBier, einheiten).toString()).toBe('2.5')
  })

  it('lässt einen negativen Bestand durch — mehr verkauft als gezählt', () => {
    // Der fortgeschriebene Bestand darf ins Minus laufen; als Auskunft gehört
    // das Minus angezeigt. Abgewiesen stürzte die Bestellseite ab, die es zeigt.
    expect(gebindeAusEinheiten(einzelflascheGin, '-0.16').toString()).toBe('-0.16')
    expect(gebindeAusEinheiten(kastenBier, -12).toString()).toBe('-0.5')
  })
})

describe('wertGebindeCent', () => {
  it('bewertet einen Kasten mit dem Gebindepreis', () => {
    expect(wertGebindeCent(kastenBier, 1)).toBe(1799)
  })

  it('bewertet mehrere Kästen ohne Rundungsdrift', () => {
    // Über den Einheitspreis (75) wären es 7200 — der halbe Cent je Flasche
    // summiert sich sonst über die Lieferung.
    expect(wertGebindeCent(kastenBier, 4)).toBe(7196)
  })

  it('rechnet bei PRO_EINHEIT über die Gebindegrösse hoch', () => {
    // Zwei Kartons Wein zu je 6 Flaschen à 8,90 EUR.
    expect(wertGebindeCent(kartonWein, 2)).toBe(10680)
  })

  it('bewertet ein Fass als ganzes Gebinde', () => {
    expect(wertGebindeCent(fassPils, 1)).toBe(9500)
  })

  it('gibt null statt 0 zurück, wenn kein Preis hinterlegt ist', () => {
    expect(wertGebindeCent({ ...kastenBier, ekPreisCent: null }, 2)).toBeNull()
  })
})

describe('ekPreisCentAusGebindepreis', () => {
  it('lässt den Gebindepreis bei PRO_GEBINDE unverändert durch', () => {
    expect(ekPreisCentAusGebindepreis(kastenBier, 1899)).toBe(1899)
  })

  it('verteilt den Gebindepreis bei PRO_EINHEIT auf die Einheiten', () => {
    // Karton Wein zu 54,00 EUR, 6 Flaschen: 9,00 EUR je Flasche.
    expect(ekPreisCentAusGebindepreis(kartonWein, 5400)).toBe(900)
  })

  it('rundet kaufmännisch je Einheit und lässt den Rundungsrest zu', () => {
    // 17,99 EUR auf 24 Flaschen sind 74,958… Cent -> 75. Zurückgerechnet sind
    // das 18,00 EUR je Kasten — der eine Cent ist der Preis des
    // Einheitsbezugs, kein Fehler: wertCent rechnet ab hier mit 75 weiter.
    expect(
      ekPreisCentAusGebindepreis(
        { ekPreisBezug: EkPreisBezug.PRO_EINHEIT, einheitenProGebinde: 24 },
        1799,
      ),
    ).toBe(75)
  })

  it('weist Beträge ab, die keine ganzen Cent sind', () => {
    expect(() => ekPreisCentAusGebindepreis(kastenBier, 17.99)).toThrow(EinheitenFehler)
    expect(() => ekPreisCentAusGebindepreis(kastenBier, -1)).toThrow(EinheitenFehler)
  })
})

describe('anteilJeAusschank und ausschankLiter', () => {
  it('rechnet den Ausschank in den Einheiten-Anteil um', () => {
    // Ein 0,3-l-Glas aus der Literflasche; ein 2-cl-Schnaps aus der 0,7er.
    expect(anteilJeAusschank({ einheitsgroesseLiter: '1' }, '0.3').toString()).toBe('0.3')
    expect(anteilJeAusschank({ einheitsgroesseLiter: '0.7' }, '0.02').toString()).toBe('0.029')
  })

  it('rechnet den Anteil zurück in Liter, ungerundet', () => {
    expect(ausschankLiter({ einheitsgroesseLiter: '1' }, { einheitenProVerkauf: '0.06' }).toString()).toBe('0.06')
    // Die Gegenrichtung des gerundeten Anteils: 0,029 der 0,7er sind 0,0203 l.
    // Dass hier nicht exakt 2 cl herauskommen, ist der Preis der drei
    // Nachkommastellen der Spalte — gerundet wird erst im Anzeigetext.
    expect(ausschankLiter({ einheitsgroesseLiter: '0.7' }, { einheitenProVerkauf: '0.029' }).toString()).toBe('0.0203')
  })

  it('weist eine Flaschengrösse von null ab, in beiden Richtungen', () => {
    expect(() => anteilJeAusschank({ einheitsgroesseLiter: 0 }, '0.02')).toThrow(EinheitenFehler)
    expect(() => ausschankLiter({ einheitsgroesseLiter: 0 }, { einheitenProVerkauf: '0.02' })).toThrow(EinheitenFehler)
  })
})

describe('anteilAusMengenangabe', () => {
  it('rechnet cl, l und ganze Einheiten in den Anteil um', () => {
    // 4 cl aus der 0,7er, ein 0,3-l-Glas aus der Literflasche, eine Flasche.
    expect(anteilAusMengenangabe({ einheitsgroesseLiter: '0.7' }, '4', 'cl').toString()).toBe('0.057')
    expect(anteilAusMengenangabe({ einheitsgroesseLiter: '1' }, '0.3', 'l').toString()).toBe('0.3')
    expect(anteilAusMengenangabe({ einheitsgroesseLiter: '0.33' }, '1', 'einheit').toString()).toBe('1')
  })

  it('lässt ganze Einheiten unangetastet, auch als Bruch', () => {
    // Anderthalb Flaschen sind der Anteil selbst — hier wird nichts geteilt,
    // und die Flaschengrösse geht die Angabe nichts an.
    expect(anteilAusMengenangabe({ einheitsgroesseLiter: '0.7' }, '1.5', 'einheit').toString()).toBe('1.5')
  })
})

describe('mengenangabeAusAnteil', () => {
  it('sagt einen gespeicherten Anteil in der Sprache der Theke', () => {
    // Die drei Formen der Getränkekarte: Schnaps in cl, Glas in Litern,
    // Flasche als Flasche.
    const schnaps = mengenangabeAusAnteil({ einheitsgroesseLiter: '0.7' }, { einheitenProVerkauf: '0.057' })
    expect(schnaps).toMatchObject({ einheit: 'cl' })
    expect(schnaps.wert.toString()).toBe('4')

    const glas = mengenangabeAusAnteil({ einheitsgroesseLiter: '1' }, { einheitenProVerkauf: '0.3' })
    expect(glas).toMatchObject({ einheit: 'l' })
    expect(glas.wert.toString()).toBe('0.3')

    const flasche = mengenangabeAusAnteil({ einheitsgroesseLiter: '0.33' }, { einheitenProVerkauf: '2' })
    expect(flasche).toMatchObject({ einheit: 'einheit' })
    expect(flasche.wert.toString()).toBe('2')
  })

  it('bleibt beim Hin und Zurück beim selben Anteil', () => {
    // Der Kreis, an dem die Vorbelegung des Mengenfelds hängt: aus 0,029 der
    // 0,7er werden 2 cl, und die 2 cl werden wieder 0,029. Sonst änderte ein
    // blosses Bestätigen den gespeicherten Wert.
    const artikel = { einheitsgroesseLiter: '0.7' }
    const angabe = mengenangabeAusAnteil(artikel, { einheitenProVerkauf: '0.029' })
    expect(angabe.wert.toString()).toBe('2')
    expect(anteilAusMengenangabe(artikel, angabe.wert, angabe.einheit).toString()).toBe('0.029')
  })

  it('legt die Litergrenze gerundet aus, wie der Kartentext', () => {
    // 0,1 l Prosecco stehen gespeichert als 0,133 der 0,75er und sind exakt
    // 0,09975 l — sie gehören auf die Literseite, nicht zu "10 cl".
    const angabe = mengenangabeAusAnteil({ einheitsgroesseLiter: '0.75' }, { einheitenProVerkauf: '0.133' })
    expect(angabe).toMatchObject({ einheit: 'l' })
    expect(angabe.wert.toString()).toBe('0.1')
  })
})

describe('Umrechnung existiert nur an einer Stelle', () => {
  // Der Auftrag an diese Datei ist, die einzige Umrechnung zwischen Gebinden und
  // Einheiten zu sein. Diese Prüfung schlägt fehl, sobald irgendwo sonst in src/
  // mit einheitenProGebinde gerechnet wird — dem Feld, über das die zweite
  // Implementierung zwangsläufig laufen müsste.
  const srcVerzeichnis = fileURLToPath(new URL('../src', import.meta.url))
  // lib/artikelimport.ts und lib/artikelstamm.ts setzen das Feld beim Anlegen
  // bzw. Lesen eines Stammsatzes, sie rechnen nicht damit: die eine liest die
  // Gebindegrösse aus der Datei, die andere aus dem Formular, und beide
  // schreiben sie nur hin. Eine Division steht dort nicht und darf dort nicht
  // stehen — der Test darunter prüft das nach.
  const erlaubt = ['lib/einheiten.ts', 'lib/artikelimport.ts', 'lib/artikelstamm.ts']

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

  it.each(['lib/artikelimport.ts', 'lib/artikelstamm.ts'])(
    'rechnet auch in %s nicht mit einheitenProGebinde, sondern setzt es nur',
    (pfad) => {
      // Hält die Ausnahme oben eng: sobald dort ein Produkt oder ein Quotient
      // mit dem Feld auftaucht, ist die zweite Rechenstelle da.
      const quelle = readFileSync(join(srcVerzeichnis, pfad), 'utf8')
      expect(quelle).not.toMatch(/einheitenProGebinde\s*[*/]|[*/]\s*einheitenProGebinde/)
    },
  )
})
