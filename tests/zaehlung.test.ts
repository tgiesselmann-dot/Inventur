import { describe, expect, it } from 'vitest'

import { Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import {
  abschnitte,
  alsPosition,
  dezimaltext,
  felder,
  fortschritt,
  naechsterIndex,
  schritt,
  tasteAnwenden,
  ungezaehlte,
  type ZaehlArtikel,
} from '@/lib/zaehlung'

// Die Testartikel sind Zeilen aus fixtures/artikelstamm-stadthafen.csv — mit
// ihren echten Sortierungen, damit die Abschnittsbildung an denselben Sprüngen
// geprüft wird, die im Lager auftreten.

function artikel(teil: Partial<ZaehlArtikel> & Pick<ZaehlArtikel, 'id'>): ZaehlArtikel {
  return {
    name: 'Testartikel',
    kategorie: 'Softdrinks',
    sortierung: 10,
    lieferGebindeText: '24 x 0,33',
    einheitenProGebinde: 24,
    gebindeart: Gebindeart.KASTEN,
    zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
    schwundfaehig: true,
    ...teil,
  }
}

const colaKasten = artikel({
  id: 'cola',
  name: 'Coca Cola',
  kategorie: 'Softdrinks',
  sortierung: 110,
})

const ginFlasche = artikel({
  id: 'gin',
  name: 'Dockside Vodka',
  kategorie: 'Spirituosen',
  sortierung: 670,
  lieferGebindeText: '1 x 0,7',
  gebindeart: Gebindeart.EINZELFLASCHE,
  zaehlmodus: Zaehlmodus.EINZELN,
  schwundfaehig: false,
})

const fassPils = artikel({
  id: 'fass',
  name: 'Heineken',
  kategorie: 'Bier Fass',
  sortierung: 460,
  lieferGebindeText: '1 x 30',
  gebindeart: Gebindeart.FASS,
  zaehlmodus: Zaehlmodus.FASS,
})

describe('felder', () => {
  it('gibt dem Kasten zwei Felder, das Komma nur bei den losen Flaschen', () => {
    // Ein halber Kasten ist im Lager keine Angabe — was übrig ist, sind lose
    // Flaschen und gehört ins zweite Feld.
    expect(felder(colaKasten)).toEqual([
      { name: 'anzahlGebinde', beschriftung: 'Kästen', dezimal: false },
      { name: 'anzahlEinzeln', beschriftung: 'lose Flaschen', dezimal: true },
    ])
  })

  it('gibt der Einzelflasche ein Feld mit Komma', () => {
    expect(felder(ginFlasche)).toEqual([
      { name: 'anzahlEinzeln', beschriftung: 'Flaschen', dezimal: true },
    ])
  })

  it('gibt dem Fass ein Feld mit Komma, damit das angebrochene Fass hineinpasst', () => {
    expect(felder(fassPils)).toEqual([
      { name: 'anzahlGebinde', beschriftung: 'Fässer', dezimal: true },
    ])
  })

  it('beschriftet das Gebindefeld nach der Lieferform, nicht nach dem Zählmodus', () => {
    const wein = artikel({ id: 'wein', gebindeart: Gebindeart.KARTON })
    expect(felder(wein)[0].beschriftung).toBe('Kartons')
  })
})

describe('tasteAnwenden', () => {
  it('hängt Ziffern an', () => {
    expect(tasteAnwenden('1', { art: 'ziffer', ziffer: '2' }, false)).toBe('12')
  })

  it('ersetzt die führende Null, statt "07" entstehen zu lassen', () => {
    expect(tasteAnwenden('0', { art: 'ziffer', ziffer: '7' }, false)).toBe('7')
  })

  it('ergänzt ein führendes Komma zu "0,"', () => {
    expect(tasteAnwenden('', { art: 'komma' }, true)).toBe('0,')
  })

  it('lässt das Komma im Gebindefeld wirkungslos, statt zu werfen', () => {
    // Am Ziffernblock ist eine gesperrte Taste kein Fehlerfall.
    expect(tasteAnwenden('2', { art: 'komma' }, false)).toBe('2')
  })

  it('nimmt kein zweites Komma an', () => {
    expect(tasteAnwenden('2,5', { art: 'komma' }, true)).toBe('2,5')
  })

  it('hält die Nachkommastellen bei zwei — mehr fasst Decimal(10,2) nicht', () => {
    expect(tasteAnwenden('2,50', { art: 'ziffer', ziffer: '7' }, true)).toBe('2,50')
  })

  it('hält die Vorkommastellen bei vier', () => {
    expect(tasteAnwenden('1234', { art: 'ziffer', ziffer: '5' }, false)).toBe('1234')
  })

  it('löscht das letzte Zeichen', () => {
    expect(tasteAnwenden('2,5', { art: 'loeschen' }, true)).toBe('2,')
  })

  it('löscht am leeren Feld ins Leere, statt zu werfen', () => {
    expect(tasteAnwenden('', { art: 'loeschen' }, true)).toBe('')
  })
})

describe('schritt', () => {
  it('zählt hoch und runter', () => {
    expect(schritt('2', 1)).toBe('3')
    expect(schritt('2', -1)).toBe('1')
  })

  it('zählt nicht unter null', () => {
    // Ein negativer Bestand ist im Lager keine Aussage.
    expect(schritt('0', -1)).toBe('0')
    expect(schritt('', -1)).toBe('0')
  })

  it('vervollständigt einen angefangenen Wert', () => {
    expect(schritt('2,', 1)).toBe('3')
  })

  it('behält die halbe Menge beim Zählen', () => {
    expect(schritt('1,5', 1)).toBe('2,5')
  })
})

describe('dezimaltext', () => {
  it('macht aus dem Komma einen Punkt', () => {
    expect(dezimaltext('2,5')).toBe('2.5')
  })

  it('liest das leere Feld als 0', () => {
    expect(dezimaltext('')).toBe('0')
  })

  it('vervollständigt einen angefangenen Wert — wer "2," stehen lässt, meint zwei', () => {
    expect(dezimaltext('2,')).toBe('2')
    expect(dezimaltext('0,')).toBe('0')
  })
})

describe('alsPosition', () => {
  it('schreibt beide Felder beim Kasten', () => {
    expect(alsPosition(colaKasten, { anzahlGebinde: '2', anzahlEinzeln: '5' })).toEqual({
      anzahlGebinde: '2',
      anzahlEinzeln: '5',
    })
  })

  it('nullt das Gebindefeld bei EINZELN, auch wenn dort noch ein Wert steht', () => {
    // Ein Wert am modusfremden Feld weist gesamtEinheiten zurück. Diese
    // Zurückweisung soll nicht erst beim Abschluss der Zählung auffallen.
    expect(alsPosition(ginFlasche, { anzahlGebinde: '3', anzahlEinzeln: '2,5' })).toEqual({
      anzahlGebinde: '0',
      anzahlEinzeln: '2.5',
    })
  })

  it('nullt das Einzelfeld beim Fass', () => {
    expect(alsPosition(fassPils, { anzahlGebinde: '1,5', anzahlEinzeln: '9' })).toEqual({
      anzahlGebinde: '1.5',
      anzahlEinzeln: '0',
    })
  })
})

describe('abschnitte', () => {
  it('bildet Blöcke aufeinanderfolgender Kategorien, nicht Kategorien als Ganzes', () => {
    // Der echte Stamm läuft Softdrinks -> Energy -> Softdrinks. Würde man die
    // beiden Softdrink-Blöcke zusammenziehen, liefe der Zähler im Lager zurück.
    const liste = [
      artikel({ id: 'a', kategorie: 'Softdrinks', sortierung: 70 }),
      artikel({ id: 'b', kategorie: 'Softdrinks', sortierung: 110 }),
      artikel({ id: 'c', kategorie: 'Energy', sortierung: 430 }),
      artikel({ id: 'd', kategorie: 'Softdrinks', sortierung: 950 }),
    ]

    expect(abschnitte(liste).map((block) => [block.kategorie, block.ab])).toEqual([
      ['Softdrinks', 0],
      ['Energy', 2],
      ['Softdrinks', 3],
    ])
  })

  it('sortiert nach sortierung, nicht nach der Reihenfolge der Eingabe', () => {
    const liste = [
      artikel({ id: 'spaet', kategorie: 'Wein', sortierung: 970 }),
      artikel({ id: 'frueh', kategorie: 'Wasser', sortierung: 10 }),
    ]

    expect(abschnitte(liste).map((block) => block.kategorie)).toEqual(['Wasser', 'Wein'])
  })

  it('gibt für eine leere Liste keine Abschnitte', () => {
    expect(abschnitte([])).toEqual([])
  })
})

describe('fortschritt', () => {
  const liste = [colaKasten, ginFlasche, fassPils]

  it('zählt die erfassten Artikel', () => {
    expect(fortschritt(liste, new Set(['cola', 'fass']))).toEqual({ gezaehlt: 2, gesamt: 3 })
  })

  it('zählt einen Artikel mit 0 als gezählt', () => {
    // Nachgesehen und leer vorgefunden ist eine Zählung. Nur die Existenz des
    // Eintrags entscheidet, nicht seine Höhe.
    expect(fortschritt(liste, new Set(['cola'])).gezaehlt).toBe(1)
  })
})

describe('ungezaehlte', () => {
  it('gibt die offenen Artikel in Zählreihenfolge', () => {
    const offen = ungezaehlte([colaKasten, ginFlasche, fassPils], new Set(['fass']))
    expect(offen.map((eintrag) => eintrag.id)).toEqual(['cola', 'gin'])
  })
})

describe('naechsterIndex', () => {
  const liste = [colaKasten, fassPils, ginFlasche] // sortiert: cola(110), fass(460), gin(670)

  it('geht schlicht zum folgenden Artikel', () => {
    expect(naechsterIndex(liste, new Set(['cola']), 0)).toBe(1)
  })

  it('springt am Ende zum ersten übersprungenen Artikel zurück', () => {
    expect(naechsterIndex(liste, new Set(['cola', 'gin']), 2)).toBe(1)
  })

  it('gibt null, wenn am Ende alles erfasst ist', () => {
    expect(naechsterIndex(liste, new Set(['cola', 'fass', 'gin']), 2)).toBeNull()
  })
})
