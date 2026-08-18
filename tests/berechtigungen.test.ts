import { describe, expect, it } from 'vitest'

import {
  alsRolle,
  darfPfad,
  darfPreiseSehen,
  istBetriebsleiter,
  punkteFuerRolle,
  sichtbareBereiche,
} from '@/lib/berechtigungen'
import { BEREICHE, type OffenerPunkt } from '@/lib/offene-punkte'

describe('alsRolle', () => {
  it('kennt den Betriebsleiter', () => {
    expect(alsRolle('betriebsleiter')).toBe('betriebsleiter')
  })

  it('macht aus allem Unbekannten einen Mitarbeiter — zu wenig öffnen, nie zu viel', () => {
    expect(alsRolle('mitarbeiter')).toBe('mitarbeiter')
    expect(alsRolle('admin')).toBe('mitarbeiter')
    expect(alsRolle('')).toBe('mitarbeiter')
    expect(alsRolle('Betriebsleiter')).toBe('mitarbeiter')
  })
})

describe('istBetriebsleiter und darfPreiseSehen', () => {
  it('nur der Betriebsleiter sieht Preise', () => {
    expect(istBetriebsleiter('betriebsleiter')).toBe(true)
    expect(istBetriebsleiter('mitarbeiter')).toBe(false)
    expect(darfPreiseSehen('betriebsleiter')).toBe(true)
    expect(darfPreiseSehen('mitarbeiter')).toBe(false)
  })
})

describe('darfPfad', () => {
  it('lässt den Betriebsleiter überall hin', () => {
    for (const pfad of ['/', '/umsatz', '/auswertung', '/lieferungen/abc/preise']) {
      expect(darfPfad('betriebsleiter', pfad)).toBe(true)
    }
  })

  it('öffnet dem Mitarbeiter Start, Zählung und Wareneingang', () => {
    for (const pfad of [
      '/',
      '/anmelden',
      '/zaehlung',
      '/zaehlung/abc',
      '/zaehlung/abc/keller',
      '/zaehlung/abc/abschluss',
      '/lieferungen',
      '/lieferungen/abc',
      '/lieferungen/abc/erfassen',
      '/api/zaehlung/abc/positionen',
      '/api/lieferung/abc/positionen',
      '/api/health',
    ]) {
      expect(darfPfad('mitarbeiter', pfad), pfad).toBe(true)
    }
  })

  it('sperrt dem Mitarbeiter alles, wo Geld steht', () => {
    for (const pfad of [
      '/umsatz',
      '/umsatz/zuordnung',
      '/auswertung',
      '/auswertung/verlauf',
      '/bestellungen',
      '/bestellungen/vorschlag',
      '/artikel',
      '/artikel/neu',
      '/rezepturen',
      '/lagerorte',
      '/einrichtung',
      '/lieferungen/abweichungen',
      '/lieferungen/abweichungen/abc',
      '/lieferungen/abc/preise',
      '/api/bestellung/abc/csv',
      '/api/bestellung/abc/doerlemann',
    ]) {
      expect(darfPfad('mitarbeiter', pfad), pfad).toBe(false)
    }
  })

  it('vergleicht ganze Pfadabschnitte, keine Präfixe', () => {
    // "/zaehlungXY" ist kein Unterweg von "/zaehlung" — aber hier gilt die
    // Erlaubnisliste: ein unbekannter Abschnitt ist schlicht zu.
    expect(darfPfad('mitarbeiter', '/zaehlungXY')).toBe(false)
    expect(darfPfad('mitarbeiter', '/lieferungenXY')).toBe(false)
  })
})

describe('sichtbareBereiche', () => {
  it('zeigt dem Betriebsleiter alle Bereiche', () => {
    expect(sichtbareBereiche('betriebsleiter')).toEqual(BEREICHE)
  })

  it('zeigt dem Mitarbeiter nur die Lieferungen', () => {
    expect(sichtbareBereiche('mitarbeiter').map((bereich) => bereich.schluessel)).toEqual([
      'lieferungen',
    ])
  })
})

describe('punkteFuerRolle', () => {
  const punkte: OffenerPunkt[] = [
    {
      id: 'umsatz-nie',
      titel: 'Noch keine Umsatzdaten importiert',
      unterzeile: '',
      bereich: 'umsatz',
      ziel: '/umsatz',
      aktion: 'Umsatz importieren',
    },
    {
      id: 'lieferung-abc',
      titel: 'Lieferung vom 04.08. ohne Positionen',
      unterzeile: 'Dörlemann',
      bereich: 'lieferungen',
      ziel: '/lieferungen/abc',
      aktion: 'Positionen erfassen',
    },
    {
      id: 'preise-abc',
      titel: '1 Preisabweichung zu klären',
      unterzeile: 'Dörlemann',
      bereich: 'lieferungen',
      ziel: '/lieferungen/abc/preise',
      aktion: 'Preise klären',
    },
  ]

  it('lässt dem Betriebsleiter alle Punkte', () => {
    expect(punkteFuerRolle(punkte, 'betriebsleiter')).toEqual(punkte)
  })

  it('filtert für den Mitarbeiter nach dem Ziel, nicht nach dem Bereich', () => {
    // Die Preisabweichung gehört zum offenen Bereich Lieferungen — ihr Ziel
    // ist trotzdem zu, also verschwindet der Punkt.
    expect(punkteFuerRolle(punkte, 'mitarbeiter').map((punkt) => punkt.id)).toEqual([
      'lieferung-abc',
    ])
  })
})
