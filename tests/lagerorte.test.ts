import { describe, expect, it } from 'vitest'

import {
  NAME_MAXLAENGE,
  darfGeloeschtWerden,
  darfStillgelegtWerden,
  nameGeprueft,
  zustandstext,
  type Lagerortzeile,
} from '@/lib/lagerorte'

// Die vier Lager des Stadthafens, wie sie im Betrieb heissen.
function ort(teil: Partial<Lagerortzeile> & Pick<Lagerortzeile, 'id'>): Lagerortzeile {
  return { name: 'Theke', aktiv: true, positionen: 0, ...teil }
}

const VIER: Lagerortzeile[] = [
  ort({ id: '1', name: 'Theke', positionen: 40 }),
  ort({ id: '2', name: 'Kiosk', positionen: 22 }),
  ort({ id: '3', name: 'Kühlcontainer', positionen: 30 }),
  ort({ id: '4', name: 'blauer Container', positionen: 6 }),
]

describe('nameGeprueft', () => {
  it('nimmt einen neuen Namen an und bereinigt ihn', () => {
    expect(nameGeprueft('  Kühlcontainer 2 ', VIER)).toEqual({
      art: 'gueltig',
      name: 'Kühlcontainer 2',
    })
  })

  it('fasst Leerzeichen zusammen, statt zwei Schreibweisen zu erlauben', () => {
    expect(nameGeprueft('blauer   Container', [])).toEqual({
      art: 'gueltig',
      name: 'blauer Container',
    })
  })

  it('behält die Schreibweise des Betriebs bei — auch klein', () => {
    expect(nameGeprueft('blauer Container', [])).toEqual({
      art: 'gueltig',
      name: 'blauer Container',
    })
  })

  it('weist einen leeren Namen ab, auch aus Leerzeichen', () => {
    expect(nameGeprueft('   ', VIER)).toEqual({ art: 'fehler', grund: 'leer' })
  })

  it('weist einen zu langen Namen ab', () => {
    expect(nameGeprueft('x'.repeat(NAME_MAXLAENGE + 1), [])).toEqual({
      art: 'fehler',
      grund: 'zu-lang',
    })
  })

  it('weist einen doppelten Namen ab, ungeachtet der Schreibweise', () => {
    expect(nameGeprueft('KIOSK', VIER)).toEqual({ art: 'fehler', grund: 'doppelt' })
    expect(nameGeprueft('Blauer  Container', VIER)).toEqual({ art: 'fehler', grund: 'doppelt' })
  })

  it('lässt den eigenen Namen beim Umbenennen stehen', () => {
    // Wer nur die Schreibweise ändert, darf nicht an seinem eigenen Namen scheitern.
    expect(nameGeprueft('Kiosk', VIER, '2')).toEqual({ art: 'gueltig', name: 'Kiosk' })
  })
})

describe('darfStillgelegtWerden', () => {
  it('lässt einen von vier Orten stilllegen — auch mit Zählwerten daran', () => {
    expect(darfStillgelegtWerden(VIER, '4')).toEqual({ art: 'ja' })
  })

  it('hält den letzten aktiven Ort fest', () => {
    const einer = [ort({ id: '1', positionen: 98 })]
    const ergebnis = darfStillgelegtWerden(einer, '1')
    expect(ergebnis.art).toBe('nein')
  })

  it('zählt stillgelegte Orte nicht als Rückfallebene', () => {
    const eineAktiv = [
      ort({ id: '1', name: 'Theke' }),
      ort({ id: '2', name: 'Gesamtlager', aktiv: false, positionen: 98 }),
    ]
    expect(darfStillgelegtWerden(eineAktiv, '1').art).toBe('nein')
  })

  it('lässt einen schon stillgelegten Ort in Ruhe', () => {
    const orte = [ort({ id: '1' }), ort({ id: '2', name: 'Alt', aktiv: false })]
    expect(darfStillgelegtWerden(orte, '2')).toEqual({ art: 'ja' })
  })
})

describe('darfGeloeschtWerden', () => {
  it('erlaubt das Löschen eines Ortes ohne jeden Zählwert — der Vertipper', () => {
    expect(darfGeloeschtWerden(ort({ id: '9', name: 'Kühlcontaienr' }))).toBe(true)
  })

  it('verweigert es, sobald ein einziger Wert daran hängt', () => {
    expect(darfGeloeschtWerden(ort({ id: '1', positionen: 1 }))).toBe(false)
  })
})

describe('zustandstext', () => {
  it('nennt den Zustand als Wort, nicht nur als Farbe', () => {
    expect(zustandstext(ort({ id: '1', positionen: 0 }))).toBe('noch nie gezählt')
    expect(zustandstext(ort({ id: '1', positionen: 1 }))).toBe('1 Zählwert')
    expect(zustandstext(ort({ id: '1', positionen: 40 }))).toBe('40 Zählwerte')
    expect(zustandstext(ort({ id: '1', aktiv: false, positionen: 98 }))).toBe(
      'Stillgelegt · 98 Zählwerte',
    )
  })
})
