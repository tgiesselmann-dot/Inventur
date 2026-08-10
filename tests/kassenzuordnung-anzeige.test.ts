import { describe, expect, it } from 'vitest'

import { Zaehlmodus } from '@/generated/prisma/enums'
import {
  auswirkung,
  einheitswort,
  faktorAusEingabe,
  guetetext,
  zaehler,
  zeilenzustand,
  type Auswirkungsartikel,
} from '@/lib/kassenzuordnung-anzeige'

const GIN: Auswirkungsartikel = {
  name: 'Sudmare Gin',
  zaehlmodus: Zaehlmodus.EINZELN,
  einheitsgroesseLiter: '0.7',
}
const COLA: Auswirkungsartikel = {
  name: 'Coca-Cola',
  zaehlmodus: Zaehlmodus.EINZELN,
  einheitsgroesseLiter: '1',
}
const KASTEN_BIER: Auswirkungsartikel = {
  name: 'Veltins Pils 0,33',
  zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
  einheitsgroesseLiter: '0.33',
}
const FASSBIER: Auswirkungsartikel = {
  name: 'Veltins Pils',
  zaehlmodus: Zaehlmodus.FASS,
  einheitsgroesseLiter: '50',
}

describe('auswirkung', () => {
  it('nennt den Schnaps aus der 0,7er beim Namen', () => {
    // Der Satz aus dem Entwurf, wörtlich: er ist der Prüfstein des ganzen
    // Bildschirms. Getippt wird, was die Theke sagt — 4,2 cl —, und daneben
    // steht, was das heisst. 120 Gin Tonic sind sieben Flaschen Gin, 72 wären
    // es nicht, und das sieht man ohne zu rechnen.
    const ergebnis = auswirkung(GIN, 120, { wert: '4,2', einheit: 'cl' })

    expect(ergebnis.rechnung).toBe('120 Verkäufe × 4,2 cl')
    expect(ergebnis.ergebnis).toBe('= 7,2 Flaschen Sudmare Gin')
    expect(ergebnis.satz).toBe('120 Verkäufe × 4,2 cl = 7,2 Flaschen Sudmare Gin')
    expect(ergebnis.wirksam).toBe(true)
  })

  it('rechnet das Glas aus der Literflasche', () => {
    const glas = auswirkung(COLA, 1204, { wert: '0,2', einheit: 'l' })
    expect(glas.rechnung).toBe('1204 Verkäufe × 0,2 l')
    expect(glas.ergebnis).toBe('= 240,8 Flaschen Coca-Cola')
  })

  it('zählt die Flasche über die Theke einzeln', () => {
    const flasche = auswirkung(KASTEN_BIER, 342, { wert: '1', einheit: 'einheit' })
    expect(flasche.rechnung).toBe('342 Verkäufe × 1 Flasche')
    expect(flasche.ergebnis).toBe('= 342 Flaschen Veltins Pils 0,33')
  })

  it('zählt den Fassartikel in Fässern und nicht in Flaschen', () => {
    // Der Zählmodus entscheidet, nicht die Gebindeart: was am Regal in Fässern
    // steht, wird auch hier in Fässern abgezogen — 0,5 l vom 50-l-Fass.
    expect(auswirkung(FASSBIER, 2148, { wert: '0,5', einheit: 'l' }).ergebnis).toBe(
      '= 21,48 Fässer Veltins Pils',
    )
  })

  it('setzt die Einzahl nur bei genau einer Einheit', () => {
    const eine = auswirkung(GIN, 1, { wert: '1', einheit: 'einheit' })
    expect(eine.rechnung).toBe('1 Verkauf × 1 Flasche')
    expect(eine.ergebnis).toBe('= 1 Flasche Sudmare Gin')
  })

  it('macht aus einem leeren Feld einen Gedankenstrich und keine Null', () => {
    const leer = auswirkung(GIN, 120, { wert: '', einheit: 'cl' })

    expect(leer.rechnung).toBe('120 Verkäufe × —')
    expect(leer.ergebnis).toBe('wirken auf keinen Bestand')
    expect(leer.wirksam).toBe(false)
    expect(leer.ergebnis).not.toContain('0')
  })

  it('ist ohne Artikel unwirksam, auch wenn eine Zahl im Feld steht', () => {
    expect(auswirkung(null, 188, { wert: '1', einheit: 'einheit' }).wirksam).toBe(false)
  })

  it('nimmt weder Buchstaben noch eine Null als Menge', () => {
    // Null je Verkauf wäre ein Artikel, der sich beim Verkaufen nicht
    // verbraucht. Den gibt es nicht — die Serveraktion weist ihn ebenfalls ab.
    expect(auswirkung(GIN, 120, { wert: 'viel', einheit: 'cl' }).wirksam).toBe(false)
    expect(auswirkung(GIN, 120, { wert: '0', einheit: 'cl' }).wirksam).toBe(false)
    expect(auswirkung(GIN, 120, { wert: '-1', einheit: 'einheit' }).wirksam).toBe(false)
  })

  it('kürzt das Ergebnis auf zwei Nachkommastellen', () => {
    // 2 cl aus der 0,7er sind 0,029 je Verkauf; mal 137 sind das 3,973 — die
    // dritte Stelle sagt beim Prüfen nichts mehr und macht die Spalte unruhig.
    expect(auswirkung(GIN, 137, { wert: '2', einheit: 'cl' }).ergebnis).toBe(
      '= 3,97 Flaschen Sudmare Gin',
    )
  })
})

describe('faktorAusEingabe', () => {
  it('macht aus der Thekensprache den gespeicherten Anteil', () => {
    expect(faktorAusEingabe(GIN, { wert: '4', einheit: 'cl' })?.toString()).toBe('0.057')
    expect(faktorAusEingabe(COLA, { wert: '0,3', einheit: 'l' })?.toString()).toBe('0.3')
    expect(faktorAusEingabe(KASTEN_BIER, { wert: '1', einheit: 'einheit' })?.toString()).toBe('1')
  })

  it('gibt ohne Artikel oder ohne brauchbare Zahl nichts zurück', () => {
    expect(faktorAusEingabe(null, { wert: '4', einheit: 'cl' })).toBeNull()
    expect(faktorAusEingabe(GIN, { wert: '', einheit: 'cl' })).toBeNull()
    expect(faktorAusEingabe(GIN, { wert: 'viel', einheit: 'cl' })).toBeNull()
  })

  it('lässt keinen Anteil durch, der auf null rundet', () => {
    // 1 cl vom 50-l-Fass rundet auf 0,000 — ein Anteil, der nichts abzieht,
    // ist keine Antwort, sondern eine falsch gewählte Einheit.
    expect(faktorAusEingabe(FASSBIER, { wert: '1', einheit: 'cl' })).toBeNull()
  })
})

describe('einheitswort', () => {
  it('nennt die Einheit, in der gezählt wird', () => {
    expect(einheitswort(FASSBIER)).toBe('Fass')
    expect(einheitswort(KASTEN_BIER)).toBe('Flasche')
    expect(einheitswort(COLA)).toBe('Flasche')
  })
})

describe('zeilenzustand', () => {
  it('unterscheidet die vier Lagen einer Zeile', () => {
    expect(zeilenzustand({ bestaetigt: false, artikelInDerZeile: 0 })).toBe('offen')
    expect(zeilenzustand({ bestaetigt: false, artikelInDerZeile: 1 })).toBe('vorschlag')
    expect(zeilenzustand({ bestaetigt: true, artikelInDerZeile: 1 })).toBe('bestaetigt')
    expect(zeilenzustand({ bestaetigt: true, artikelInDerZeile: 0 })).toBe('ausgenommen')
  })

  it('macht aus einem übernommenen Vorschlag keine bestätigte Zeile', () => {
    // Wer einen Vorschlag anklickt, hat ihn noch nicht geprüft. Würde die Zeile
    // dadurch ruhig, wäre eine geratene Zuordnung von einer geprüften nicht mehr
    // zu unterscheiden.
    expect(zeilenzustand({ bestaetigt: false, artikelInDerZeile: 2 })).toBe('vorschlag')
  })
})

describe('zaehler', () => {
  it('sagt, wie viel noch offen ist', () => {
    expect(zaehler(7, 84)).toEqual({
      text: '7 von 84 offen',
      bestaetigtText: '77 bestätigt',
      prozent: 92,
    })
  })

  it('behauptet über einer leeren Liste keinen Fortschritt', () => {
    expect(zaehler(0, 0).prozent).toBe(0)
  })
})

describe('guetetext', () => {
  it('schreibt die Güte als Prozent', () => {
    expect(guetetext(0.96)).toBe('96 %')
    expect(guetetext(0.416)).toBe('42 %')
  })

  it('behauptet nie hundert Prozent', () => {
    // Ein exakt passender Name ist keine Gewissheit über das Gebinde. Eine
    // Hundert daneben läse sich als geprüft — dieser Bildschirm darf nichts
    // behaupten, was ein Mensch nicht bestätigt hat.
    expect(guetetext(1)).toBe('99 %')
    expect(guetetext(1.4)).toBe('99 %')
  })
})
