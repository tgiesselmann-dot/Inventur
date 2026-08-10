import { describe, expect, it } from 'vitest'

import {
  alsDatumstext,
  alsFeldwert,
  alsKurzdatum,
  alsLangdatum,
  alsZeitpunktstext,
  dauertext,
  kalenderwoche,
  vorTagen,
  wochenbeginn,
} from '@/lib/datum'

describe('Datumsangaben in der Schreibweise des Betriebs', () => {
  const tag = new Date(Date.UTC(2026, 7, 7))

  it('schreibt das volle Datum mit führenden Nullen', () => {
    expect(alsDatumstext(tag)).toBe('07.08.2026')
    expect(alsFeldwert(tag)).toBe('2026-08-07')
  })

  it('lässt in der kurzen Form das Jahr weg, nicht den Punkt danach', () => {
    // Der abschliessende Punkt sagt, dass hier ein Datum steht und keine Uhrzeit.
    expect(alsKurzdatum(tag)).toBe('07.08.')
    expect(alsKurzdatum(new Date(Date.UTC(2025, 11, 31)))).toBe('31.12.')
  })

  it('verschiebt den Jahreswechsel nicht', () => {
    // Reine Datumswerte liegen auf Mitternacht UTC — eine Zeitzone im Spiel
    // würde aus dem 1. Januar den 31. Dezember machen.
    expect(alsKurzdatum(new Date(Date.UTC(2026, 0, 1)))).toBe('01.01.')
    expect(alsDatumstext(new Date(Date.UTC(2026, 0, 1)))).toBe('01.01.2026')
  })
})

describe('Das lange Datum mit Wochentag', () => {
  it('schreibt Wochentag, Tag ohne führende Null, Monat und Jahr', () => {
    expect(alsLangdatum(new Date(Date.UTC(2026, 7, 7)))).toBe('Freitag, 7. August 2026')
  })

  it('nennt den Wochentag des Datums, nicht den der Serverzeitzone', () => {
    // Mitternacht UTC ist westlich von Greenwich noch der Vortag. Ohne die
    // ausdrückliche Zeitzone stünde hier "Mittwoch, 31. Dezember 2025".
    expect(alsLangdatum(new Date(Date.UTC(2026, 0, 1)))).toBe('Donnerstag, 1. Januar 2026')
  })
})

describe('Kalenderwoche nach ISO 8601', () => {
  it('nennt die Woche eines gewöhnlichen Tages', () => {
    expect(kalenderwoche(new Date(Date.UTC(2026, 7, 7)))).toBe(32)
    expect(kalenderwoche(new Date(Date.UTC(2026, 7, 4)))).toBe(32)
    // Der Montag davor gehört noch in die Woche zuvor.
    expect(kalenderwoche(new Date(Date.UTC(2026, 6, 27)))).toBe(31)
  })

  it('hält Montag und Sonntag derselben Woche zusammen', () => {
    // 03.08.2026 ist ein Montag, 09.08. der Sonntag danach — eine Woche, eine
    // Nummer. Bei einer Rechnung mit Sonntag als Wochenanfang fielen sie
    // auseinander.
    expect(kalenderwoche(new Date(Date.UTC(2026, 7, 3)))).toBe(32)
    expect(kalenderwoche(new Date(Date.UTC(2026, 7, 9)))).toBe(32)
  })

  it('zählt den Jahreswechsel zur Woche mit dem ersten Donnerstag', () => {
    // Der 01.01.2027 ist ein Freitag: seine Woche hat ihren Donnerstag noch im
    // alten Jahr und heisst deshalb KW 53, nicht KW 1.
    expect(kalenderwoche(new Date(Date.UTC(2027, 0, 1)))).toBe(53)
    // Der 01.01.2026 ist ein Donnerstag — damit beginnt die KW 1 des Jahres.
    expect(kalenderwoche(new Date(Date.UTC(2026, 0, 1)))).toBe(1)
    // Und der 29.12.2025, ein Montag, gehört schon zu dieser KW 1.
    expect(kalenderwoche(new Date(Date.UTC(2025, 11, 29)))).toBe(1)
  })
})

describe('dauertext', () => {
  const start = new Date('2026-08-07T18:00:00Z')

  function spaeter(minuten: number, sekunden = 0): Date {
    return new Date(start.getTime() + minuten * 60_000 + sekunden * 1000)
  }

  it('schreibt Stunden und Minuten aus', () => {
    expect(dauertext(start, spaeter(74))).toBe('1 Std 14 Min')
  })

  it('nennt unter einer Stunde nur die Minuten', () => {
    expect(dauertext(start, spaeter(43))).toBe('43 Min')
  })

  it('lässt die glatte Stunde ohne Minutenangabe', () => {
    expect(dauertext(start, spaeter(120))).toBe('2 Std')
  })

  it('rundet Sekunden ab, statt sie zu zeigen', () => {
    // Die Zählung dauert Minuten; die Sekunden darin interessieren niemanden.
    expect(dauertext(start, spaeter(14, 59))).toBe('14 Min')
  })

  it('schreibt eine sehr kurze Spanne aus, statt "0 Min" zu zeigen', () => {
    expect(dauertext(start, spaeter(0, 20))).toBe('unter 1 Min')
  })

  it('macht aus einer verdrehten Reihenfolge keine Minuszahl', () => {
    // Am Kopf eines Bildschirms wäre "-3 Min" ein Rätsel, kein Hinweis.
    expect(dauertext(spaeter(3), start)).toBe('unter 1 Min')
  })
})

describe('wochenbeginn', () => {
  it('findet den Montag mitten in der Woche', () => {
    // Freitag, 7. August 2026 -> Montag, 3. August.
    expect(alsFeldwert(wochenbeginn(new Date(Date.UTC(2026, 7, 7))))).toBe('2026-08-03')
  })

  it('lässt einen Montag stehen', () => {
    expect(alsFeldwert(wochenbeginn(new Date(Date.UTC(2026, 7, 3))))).toBe('2026-08-03')
  })

  it('zählt den Sonntag zur ablaufenden Woche, nicht zur nächsten', () => {
    expect(alsFeldwert(wochenbeginn(new Date(Date.UTC(2026, 7, 9))))).toBe('2026-08-03')
  })

  it('reicht über einen Monatswechsel zurück', () => {
    // Dienstag, 1. September 2026 -> Montag, 31. August.
    expect(alsFeldwert(wochenbeginn(new Date(Date.UTC(2026, 8, 1))))).toBe('2026-08-31')
  })
})

describe('alsZeitpunktstext', () => {
  it('schreibt Datum und Uhrzeit in der Zeit des Betriebs', () => {
    // 07:12 UTC ist im Juli 09:12 in Recklinghausen.
    expect(alsZeitpunktstext(new Date(Date.UTC(2026, 6, 16, 7, 12)))).toBe('16.07.2026, 09:12')
  })

  it('kippt kurz nach Mitternacht nicht auf den Vortag', () => {
    // 23:30 UTC am 15. ist deutscher Zeit schon der 16. — nicht umgekehrt.
    expect(alsZeitpunktstext(new Date(Date.UTC(2026, 6, 15, 23, 30)))).toBe('16.07.2026, 01:30')
  })
})

describe('vorTagen', () => {
  it('geht vom gegebenen Datum die Tage zurück', () => {
    expect(vorTagen(30, new Date(Date.UTC(2026, 7, 7)))).toEqual(new Date(Date.UTC(2026, 6, 8)))
  })

  it('bleibt ein reines Datum auf Mitternacht UTC', () => {
    expect(alsFeldwert(vorTagen(14, new Date(Date.UTC(2026, 0, 5))))).toBe('2025-12-22')
  })
})
