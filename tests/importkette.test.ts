import { describe, expect, it } from 'vitest'

import { ausDatumstext, tagesende } from '@/lib/datum'
import {
  alsAnschlussanzeige,
  anschluss,
  kette,
  naht,
  naechsterTag,
  tage,
  type Zeitfenster,
} from '@/lib/importkette'

/**
 * Ein Import, so wie er in der Datenbank steht: erster Tag ab Mitternacht,
 * letzter Tag bis Mitternacht. Genau diese Form liefert src/lib/kassenimport.ts.
 */
function fenster(von: string, bis: string): Zeitfenster {
  return { von: ausDatumstext(von)!, bis: tagesende(ausDatumstext(bis)!) }
}

describe('Naht zwischen zwei Zeiträumen', () => {
  it('nennt den unmittelbaren Anschluss lückenlos', () => {
    const befund = naht(fenster('01.08.2026', '09.08.2026'), fenster('10.08.2026', '16.08.2026'))
    expect(befund.art).toBe('lueckenlos')
    expect(befund.tage).toBe(0)
  })

  it('zählt die Lücke ohne den ersten Tag des neuen Imports', () => {
    // Der Fall, an dem der Entwurf sich verzählt hat: endet der eine am 01.,
    // beginnt der andere am 04., dann fehlen der 02. und der 03. — zwei Tage.
    // Der 04. wird ja gerade importiert.
    const befund = naht(fenster('21.07.2026', '01.08.2026'), fenster('04.08.2026', '09.08.2026'))
    expect(befund.art).toBe('luecke')
    expect(befund.tage).toBe(2)
  })

  it('benennt den ersten und letzten Tag, der niemandem gehört', () => {
    const befund = naht(fenster('21.07.2026', '01.08.2026'), fenster('04.08.2026', '09.08.2026'))
    if (befund.art !== 'luecke') throw new Error('Lücke erwartet')
    expect(befund.ersterFehltag.toISOString()).toBe('2026-08-02T00:00:00.000Z')
    expect(befund.letzterFehltag.toISOString()).toBe('2026-08-03T00:00:00.000Z')
  })

  it('meldet einen einzelnen fehlenden Tag als Lücke', () => {
    const befund = naht(fenster('01.08.2026', '08.08.2026'), fenster('10.08.2026', '16.08.2026'))
    expect(befund).toMatchObject({ art: 'luecke', tage: 1 })
  })

  it('zählt bei Überschneidung die Tage, die in beiden stehen', () => {
    const befund = naht(fenster('07.07.2026', '14.07.2026'), fenster('14.07.2026', '20.07.2026'))
    expect(befund).toMatchObject({ art: 'ueberschneidung', tage: 1 })
  })

  it('zählt einen ganz enthaltenen Zeitraum nur so lang, wie er selbst ist', () => {
    // Nicht bis zum Ende des umfassenden Imports: der zweite endet vorher, und
    // doppelt sind nur seine eigenen Tage.
    const befund = naht(fenster('01.08.2026', '31.08.2026'), fenster('10.08.2026', '12.08.2026'))
    expect(befund).toMatchObject({ art: 'ueberschneidung', tage: 3 })
  })

  it('nennt den deckungsgleichen Zeitraum in voller Länge doppelt', () => {
    const befund = naht(fenster('10.08.2026', '16.08.2026'), fenster('10.08.2026', '16.08.2026'))
    expect(befund).toMatchObject({ art: 'ueberschneidung', tage: 7 })
  })
})

describe('Anschluss eines neuen Imports', () => {
  const vorhanden = [
    fenster('07.07.2026', '14.07.2026'),
    fenster('21.07.2026', '01.08.2026'),
    fenster('04.08.2026', '09.08.2026'),
  ]

  it('nennt den ersten Import einen ersten und nicht eine Lücke', () => {
    expect(anschluss(fenster('10.08.2026', '16.08.2026'), [])).toEqual({ art: 'erster' })
  })

  it('misst gegen den unmittelbaren Vorgänger, nicht gegen den ältesten', () => {
    const befund = anschluss(fenster('10.08.2026', '16.08.2026'), vorhanden)
    expect(befund.art).toBe('lueckenlos')
  })

  it('findet die Lücke zum Vorgänger', () => {
    const befund = anschluss(fenster('12.08.2026', '18.08.2026'), vorhanden)
    expect(befund).toMatchObject({ art: 'luecke', tage: 2 })
  })

  it('meldet die Überschneidung und nicht die Lücke, wenn beides zuträfe', () => {
    // Der Zeitraum reicht in den Import bis 01.08. hinein und lässt zugleich
    // den 02./03.08. offen. Doppelte Tage wiegen schwerer: sie lassen sich
    // hinterher nicht mehr trennen.
    const befund = anschluss(fenster('30.07.2026', '02.08.2026'), vorhanden)
    expect(befund).toMatchObject({ art: 'ueberschneidung', tage: 3 })
  })

  it('nennt die schwerste Überschneidung, wenn mehrere Importe betroffen sind', () => {
    const befund = anschluss(fenster('01.07.2026', '31.07.2026'), vorhanden)
    expect(befund).toMatchObject({ art: 'ueberschneidung', tage: 11 })
  })

  it('macht einen Nachtrag mitten in der Kette nicht zum Nachzügler', () => {
    // Genau die Datei, die die Lücke vom 15. bis 20.07. schliesst.
    const befund = anschluss(fenster('15.07.2026', '20.07.2026'), vorhanden)
    expect(befund.art).toBe('lueckenlos')
  })
})

describe('Die Kette der Importe', () => {
  it('hängt jede Naht an den Import, der sie aufreisst', () => {
    const glieder = kette([
      fenster('04.08.2026', '09.08.2026'),
      fenster('07.07.2026', '14.07.2026'),
      fenster('21.07.2026', '01.08.2026'),
    ])
    expect(glieder.map((glied) => glied.naht?.art ?? null)).toEqual([
      null,
      'luecke',
      'luecke',
    ])
  })

  it('lässt den ältesten Import ohne Naht', () => {
    const glieder = kette([fenster('07.07.2026', '14.07.2026')])
    expect(glieder).toHaveLength(1)
    expect(glieder[0].naht).toBeNull()
  })

  it('bleibt leer, solange nichts importiert ist', () => {
    expect(kette([])).toEqual([])
  })

  it('zählt die abgedeckten Tage mit beiden Rändern', () => {
    // Eine Woche vom Montag bis zum Sonntag sind sieben Tage und nicht sechs:
    // beide Ränder sind eingeschlossen, sonst fehlte in jedem Balken ein Tag.
    expect(tage(fenster('10.08.2026', '16.08.2026'))).toBe(7)
    expect(tage(fenster('10.08.2026', '10.08.2026'))).toBe(1)
    expect(kette([fenster('10.08.2026', '16.08.2026')])[0].tage).toBe(7)
  })
})

describe('Der Anschluss in Worten', () => {
  it('sagt bei Lücke, wie viele Tage fehlen und zwischen welchen Tagen', () => {
    const anzeige = alsAnschlussanzeige(
      naht(fenster('21.07.2026', '01.08.2026'), fenster('04.08.2026', '09.08.2026')),
    )
    expect(anzeige.stufe).toBe('danger')
    expect(anzeige.titel).toBe('2 Tage fehlen zwischen 01.08. und 04.08.')
    expect(anzeige.erklaerung).toContain('02.08.2026 bis 03.08.2026')
  })

  it('schreibt den einzelnen Tag in der Einzahl', () => {
    const anzeige = alsAnschlussanzeige(
      naht(fenster('01.08.2026', '08.08.2026'), fenster('10.08.2026', '16.08.2026')),
    )
    expect(anzeige.titel).toBe('1 Tag fehlt zwischen 08.08. und 10.08.')
    expect(anzeige.erklaerung).toContain('Der 09.08.2026 steht')
  })

  it('bleibt beim Anschluss ruhig und nennt den Import, an den er anschliesst', () => {
    const anzeige = alsAnschlussanzeige(
      naht(fenster('01.08.2026', '09.08.2026'), fenster('10.08.2026', '16.08.2026')),
    )
    expect(anzeige.stufe).toBe('confirm')
    expect(anzeige.titel).toBe('Lückenlos')
    expect(anzeige.erklaerung).toContain('09.08.2026')
  })

  it('nennt die Überschneidung bernstein und beim Namen', () => {
    const anzeige = alsAnschlussanzeige(
      naht(fenster('07.07.2026', '14.07.2026'), fenster('14.07.2026', '20.07.2026')),
    )
    expect(anzeige.stufe).toBe('attention')
    expect(anzeige.titel).toBe('1 Tag steht in zwei Importen')
  })

  it('meldet den ersten Import ohne Warnung', () => {
    const anzeige = alsAnschlussanzeige({ art: 'erster' })
    expect(anzeige.stufe).toBe('neutral')
  })
})

describe('Der nächste lückenlose Tag', () => {
  it('ist der Tag nach dem spätesten Ende', () => {
    const tag = naechsterTag([
      fenster('07.07.2026', '14.07.2026'),
      fenster('04.08.2026', '09.08.2026'),
      fenster('21.07.2026', '01.08.2026'),
    ])
    expect(tag!.toISOString()).toBe('2026-08-10T00:00:00.000Z')
  })

  it('ist ohne Import keiner', () => {
    expect(naechsterTag([])).toBeNull()
  })
})
