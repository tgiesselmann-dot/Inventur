import { describe, expect, it } from 'vitest'

import { Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import {
  abschnitte,
  alsEingaben,
  alsPosition,
  dezimaltext,
  eingabetext,
  felder,
  fortschritt,
  fortschrittsanteil,
  kontrolltext,
  listenabschnitte,
  naechsterIndex,
  passtInZaehlliste,
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

describe('eingabetext', () => {
  it('lässt eine gewöhnliche Eingabe stehen', () => {
    expect(eingabetext('12', false)).toBe('12')
    expect(eingabetext('2,5', true)).toBe('2,5')
  })

  it('nimmt den Punkt als Komma an — manche Zehnertastatur hat nur ihn', () => {
    expect(eingabetext('2.5', true)).toBe('2,5')
  })

  it('lässt einen angefangenen Wert stehen, solange getippt wird', () => {
    expect(eingabetext('2,', true)).toBe('2,')
  })

  it('ergänzt ein führendes Komma zu "0,"', () => {
    expect(eingabetext(',5', true)).toBe('0,5')
  })

  it('wirft weg, was am Ziffernblock nicht einzugeben wäre', () => {
    // Buchstaben von einer Systemtastatur, das Komma im Kastenfeld, die dritte
    // Nachkommastelle und die fünfte Vorkommastelle.
    expect(eingabetext('12a3', false)).toBe('123')
    expect(eingabetext('2,5', false)).toBe('25')
    expect(eingabetext('2,555', true)).toBe('2,55')
    expect(eingabetext('12345', false)).toBe('1234')
  })

  it('nimmt kein zweites Komma an', () => {
    expect(eingabetext('2,5,5', true)).toBe('2,55')
  })

  it('lässt das leere Feld leer — ein Gedankenstrich ist keine Null', () => {
    expect(eingabetext('', true)).toBe('')
    expect(eingabetext('abc', true)).toBe('')
  })
})

describe('alsEingaben', () => {
  it('macht aus gespeicherten Dezimaltexten Eingabetexte', () => {
    expect(alsEingaben({ anzahlGebinde: '2', anzahlEinzeln: '0.5' })).toEqual({
      anzahlGebinde: '2',
      anzahlEinzeln: '0,5',
    })
  })

  it('gibt am ungezählten Artikel zwei leere Texte, nicht zwei Nullen', () => {
    expect(alsEingaben(undefined)).toEqual({ anzahlGebinde: '', anzahlEinzeln: '' })
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

describe('passtInZaehlliste', () => {
  const aperol = artikel({
    id: 'aperol',
    name: 'Aperol',
    kategorie: 'Aperitif',
    lieferGebindeText: '1 x 1,0',
  })

  it('findet über den Namen', () => {
    expect(passtInZaehlliste(aperol, 'aperol')).toBe(true)
  })

  it('findet über die Kategorie, auch wenn der Name nichts davon trägt', () => {
    // Der Fall, für den die Regel da ist: "likoer" muss den Ramazzotti finden.
    const ramazzotti = artikel({ id: 'rama', name: 'Ramazzotti', kategorie: 'Likoer' })
    expect(passtInZaehlliste(ramazzotti, 'likoer')).toBe(true)
    expect(passtInZaehlliste(aperol, 'likoer')).toBe(false)
  })

  it('findet über den Gebindetext', () => {
    expect(passtInZaehlliste(aperol, '1,0')).toBe(true)
  })

  it('lässt bei leerer Suche alles durch', () => {
    expect(passtInZaehlliste(aperol, '')).toBe(true)
  })
})

describe('listenabschnitte', () => {
  // Derselbe Laufweg wie oben: Softdrinks, Energy, noch einmal Softdrinks.
  const liste = [
    artikel({ id: 'cola', name: 'Coca Cola', kategorie: 'Softdrinks', sortierung: 70 }),
    artikel({ id: 'fanta', name: 'Fanta', kategorie: 'Softdrinks', sortierung: 110 }),
    artikel({ id: 'red', name: 'Red Bull', kategorie: 'Energy', sortierung: 430 }),
    artikel({ id: 'spezi', name: 'Spezi', kategorie: 'Softdrinks', sortierung: 950 }),
  ]

  it('gibt ohne Suche alle Abschnitte mit allen Zeilen', () => {
    expect(
      listenabschnitte(liste, '').map((block) => [
        block.station,
        block.kategorie,
        block.zeilen.length,
      ]),
    ).toEqual([
      [1, 'Softdrinks', 2],
      [2, 'Energy', 1],
      [3, 'Softdrinks', 1],
    ])
  })

  it('führt den Index der Zählreihenfolge mit, nicht die Stelle in der Anzeige', () => {
    const blocks = listenabschnitte(liste, '')
    expect(blocks.flatMap((block) => block.zeilen.map((zeile) => zeile.index))).toEqual([0, 1, 2, 3])
  })

  it('behält den Index bei aktiver Suche — sonst springt die Zeile auf den falschen Artikel', () => {
    const [block] = listenabschnitte(liste, 'spezi')
    expect(block.zeilen).toHaveLength(1)
    expect(block.zeilen[0].index).toBe(3)
  })

  it('lässt Abschnitte ohne Treffer weg, ihre Stationsnummer aber stehen', () => {
    // Aus dem dritten Halt im Lager wird durch eine Suche nicht der erste.
    expect(listenabschnitte(liste, 'spezi').map((block) => block.station)).toEqual([3])
  })

  it('nimmt einen Abschnitt ganz, wenn seine Kategorie passt', () => {
    // "energy" meint die Station, nicht einen Artikel darin.
    const blocks = listenabschnitte(liste, 'energy')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].zeilen.map((zeile) => zeile.artikel.id)).toEqual(['red'])
  })

  it('zeigt denselben Artikel in jedem Abschnitt, in dem er steht', () => {
    expect(listenabschnitte(liste, 'cola').map((block) => block.station)).toEqual([1])
  })

  it('rechnet den Stand weiter über alle Artikel des Abschnitts', () => {
    // Eine Suche macht einen Abschnitt nicht kleiner, sie zeigt ihn schmaler.
    const [block] = listenabschnitte(liste, 'coca')
    expect(block.artikel).toHaveLength(2)
    expect(block.zeilen).toHaveLength(1)
  })

  it('gibt bei einer Suche ohne Treffer keine Abschnitte', () => {
    expect(listenabschnitte(liste, 'weissbier')).toEqual([])
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

describe('fortschrittsanteil', () => {
  it('gibt den Anteil der erfassten Artikel', () => {
    expect(fortschrittsanteil({ gezaehlt: 1, gesamt: 4 })).toBe(0.25)
  })

  it('gibt 1, wenn alles erfasst ist', () => {
    expect(fortschrittsanteil({ gezaehlt: 3, gesamt: 3 })).toBe(1)
  })

  it('gibt 0 statt NaN, wenn die Zählung keine Artikel hat', () => {
    // Der Balken bekäme sonst eine ungültige Breite und liefe aus dem Bild.
    expect(fortschrittsanteil({ gezaehlt: 0, gesamt: 0 })).toBe(0)
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

describe('kontrolltext', () => {
  it('rechnet Kästen plus lose Flaschen zusammen', () => {
    expect(kontrolltext(colaKasten, { anzahlGebinde: '2', anzahlEinzeln: '3' })).toBe(
      '= 51 Flaschen',
    )
  })

  it('setzt die Einzahl bei genau einer Flasche', () => {
    expect(kontrolltext(ginFlasche, { anzahlGebinde: '', anzahlEinzeln: '1' })).toBe('= 1 Flasche')
  })

  it('nennt das Fass beim Namen, statt Flaschen zu behaupten', () => {
    // Die Einheit eines Fasses ist das Fass selbst.
    expect(kontrolltext(fassPils, { anzahlGebinde: '1,5', anzahlEinzeln: '' })).toBe('= 1,5 Fässer')
    expect(kontrolltext(fassPils, { anzahlGebinde: '1', anzahlEinzeln: '' })).toBe('= 1 Fass')
  })

  it('schweigt am unberührten Artikel', () => {
    // "= 0 Flaschen" wäre eine Aussage über einen Bestand, den niemand
    // gezählt hat.
    expect(kontrolltext(colaKasten, { anzahlGebinde: '', anzahlEinzeln: '' })).toBeNull()
  })
})
