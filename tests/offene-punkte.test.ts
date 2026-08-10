import { describe, expect, it } from 'vitest'

import { ausDatumstext, tagesende } from '@/lib/datum'
import {
  offenePunkte,
  offenText,
  punkteJeBereich,
  type Offenlage,
} from '@/lib/offene-punkte'

const HEUTE = ausDatumstext('07.08.2026')!

/**
 * Eine Lage ohne jeden offenen Punkt: gestern importiert, alles zugeordnet,
 * keine leere Lieferung. Die Fälle setzen davon jeweils einen Wert um.
 */
function lage(abweichend: Partial<Offenlage> = {}): Offenlage {
  return {
    heute: HEUTE,
    umsatzBis: tagesende(ausDatumstext('06.08.2026')!),
    ohneZuordnung: 0,
    lieferungenOhnePositionen: [],
    preisabweichungen: [],
    ...abweichend,
  }
}

describe('Rückstand der Kassendaten', () => {
  it('meldet nichts, solange nur der laufende Tag fehlt', () => {
    // Der Kassenexport kommt am Morgen für den Vortag. Ein Tag Rückstand ist
    // der Normalzustand und keine Aufgabe.
    expect(offenePunkte(lage())).toEqual([])
  })

  it('zählt die Tage bis heute, nicht die vollständig fehlenden', () => {
    // Zuletzt der 04., heute der 07. — der Entwurf nennt das "seit 3 Tagen".
    const punkte = offenePunkte(lage({ umsatzBis: tagesende(ausDatumstext('04.08.2026')!) }))
    expect(punkte).toHaveLength(1)
    expect(punkte[0].titel).toBe('Umsatzdaten seit 3 Tagen nicht importiert')
    expect(punkte[0].unterzeile).toBe('Zuletzt 04.08.')
    expect(punkte[0].ziel).toBe('/umsatz')
  })

  it('verzählt sich nicht am letzten Augenblick des Tages', () => {
    // Der Importzeitraum endet um 23:59:59.999, heute beginnt um Mitternacht.
    // In Millisekunden gerechnet wäre der Abstand knapp unter zwei Tagen und
    // die Meldung bliebe aus.
    const punkte = offenePunkte(lage({ umsatzBis: tagesende(ausDatumstext('05.08.2026')!) }))
    expect(punkte[0].titel).toBe('Umsatzdaten seit 2 Tagen nicht importiert')
  })

  it('unterscheidet "nie importiert" von "seit Tagen nicht"', () => {
    const punkte = offenePunkte(lage({ umsatzBis: null }))
    expect(punkte[0].titel).toBe('Noch keine Umsatzdaten importiert')
  })
})

describe('Nicht zugeordnete Kassenbezeichnungen', () => {
  it('nennt die Zahl und was sie bedeutet', () => {
    const punkte = offenePunkte(lage({ ohneZuordnung: 2 }))
    expect(punkte[0].titel).toBe('2 Kassenbezeichnungen ohne Zuordnung')
    expect(punkte[0].unterzeile).toBe('Umsatz zählt nicht auf Artikel')
    expect(punkte[0].ziel).toBe('/umsatz/zuordnung')
  })

  it('schreibt die Einzahl aus', () => {
    expect(offenePunkte(lage({ ohneZuordnung: 1 }))[0].titel).toBe(
      '1 Kassenbezeichnung ohne Zuordnung',
    )
  })
})

describe('Lieferungen ohne Positionen', () => {
  it('führt jede einzeln auf, mit dem Weg in ihre Kontrolle', () => {
    const punkte = offenePunkte(
      lage({
        lieferungenOhnePositionen: [
          { id: 'abc', datum: ausDatumstext('04.08.2026')!, lieferant: 'Dörlemann' },
          { id: 'def', datum: ausDatumstext('01.08.2026')!, lieferant: 'Getränke Nord' },
        ],
      }),
    )
    expect(punkte.map((punkt) => punkt.titel)).toEqual([
      'Lieferung vom 04.08. ohne Positionen',
      'Lieferung vom 01.08. ohne Positionen',
    ])
    expect(punkte[0].unterzeile).toBe('Dörlemann')
    expect(punkte[0].ziel).toBe('/lieferungen/abc')
  })

  it('sagt nie "0 Positionen"', () => {
    // Eine Null wäre die Aussage "nachgesehen, es kam nichts" — die hat
    // niemand getroffen.
    const punkte = offenePunkte(
      lage({
        lieferungenOhnePositionen: [
          { id: 'abc', datum: ausDatumstext('04.08.2026')!, lieferant: 'Dörlemann' },
        ],
      }),
    )
    expect(punkte[0].titel).not.toContain('0 Positionen')
    expect(punkte[0].titel).toContain('ohne Positionen')
  })
})

describe('Offene Preisabweichungen', () => {
  it('bündelt sie je Lieferung, mit dem Weg auf die Klärungsseite', () => {
    const punkte = offenePunkte(
      lage({
        preisabweichungen: [
          { lieferungId: 'abc', lieferant: 'Dörlemann' },
          { lieferungId: 'abc', lieferant: 'Dörlemann' },
          { lieferungId: 'def', lieferant: 'Getränke Nord' },
        ],
      }),
    )
    expect(punkte.map((punkt) => punkt.titel)).toEqual([
      '2 Preisabweichungen zu klären',
      '1 Preisabweichung zu klären',
    ])
    expect(punkte[0].unterzeile).toBe('Dörlemann')
    expect(punkte[0].ziel).toBe('/lieferungen/abc/preise')
    expect(punkte[0].aktion).toBe('Preise klären')
    expect(punkte[1].ziel).toBe('/lieferungen/def/preise')
  })

  it('zählt sie zum Bereich Lieferungen', () => {
    const punkte = offenePunkte(
      lage({ preisabweichungen: [{ lieferungId: 'abc', lieferant: 'Dörlemann' }] }),
    )
    expect(punkteJeBereich(punkte).lieferungen).toBe(1)
  })
})

describe('Reihenfolge und Bereichszahlen', () => {
  const punkte = offenePunkte(
    lage({
      umsatzBis: tagesende(ausDatumstext('04.08.2026')!),
      ohneZuordnung: 2,
      lieferungenOhnePositionen: [
        { id: 'abc', datum: ausDatumstext('04.08.2026')!, lieferant: 'Dörlemann' },
      ],
    }),
  )

  it('stellt den grösseren Schaden nach vorn', () => {
    expect(punkte.map((punkt) => punkt.id)).toEqual([
      'umsatz-rueckstand',
      'zuordnung',
      'lieferung-abc',
    ])
  })

  it('zählt die Bereichszahlen aus derselben Liste', () => {
    // Zwei Punkte im Umsatz, einer bei den Lieferungen — dieselbe Liste, die
    // oben steht. Eine zweite Abfrage könnte davon abweichen.
    expect(punkteJeBereich(punkte)).toEqual({
      artikel: 0,
      lieferungen: 1,
      umsatz: 2,
      rezepturen: 0,
      auswertung: 0,
    })
  })

  it('lässt die Zeile ohne Zusatz, wo nichts offen ist', () => {
    expect(offenText(2)).toBe('2 offen')
    expect(offenText(0)).toBeUndefined()
  })
})
