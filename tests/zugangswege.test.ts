import { describe, expect, test } from 'vitest'

import { istOffenerPfad, OFFENE_PFADE } from '@/lib/zugangswege'

describe('istOffenerPfad', () => {
  test('lässt die Anmeldung, die Systemauskunft und das Manifest durch', () => {
    expect(istOffenerPfad('/anmelden')).toBe(true)
    expect(istOffenerPfad('/api/health')).toBe(true)
    expect(istOffenerPfad('/manifest.webmanifest')).toBe(true)
  })

  test('lässt Unterwege eines offenen Pfads durch', () => {
    expect(istOffenerPfad('/anmelden/hilfe')).toBe(true)
  })

  test('hält alles andere zu', () => {
    for (const pfad of [
      '/',
      '/zaehlung',
      '/zaehlung/019fd9b6-484d-750d-8756-16503a501760',
      '/auswertung',
      '/auswertung/verlauf',
      '/artikel',
      '/umsatz/zuordnung',
      '/einrichtung',
      '/api/zaehlung/019fd9b6-484d-750d-8756-16503a501760/positionen',
    ]) {
      expect(istOffenerPfad(pfad), pfad).toBe(false)
    }
  })

  test('ein offener Pfad ist kein Präfix für beliebige Adressen', () => {
    // Sonst öffnete `/anmelden` gleich `/anmeldenXY` mit — und wer eine Route
    // dieses Namens anlegt, hätte sie ungeschützt, ohne es zu merken.
    expect(istOffenerPfad('/anmeldenXY')).toBe(false)
    expect(istOffenerPfad('/api/healthcheck')).toBe(false)
    expect(istOffenerPfad('/anmelden-intern')).toBe(false)
  })

  test('die Liste bleibt kurz und begründet', () => {
    // Ein Wächter, kein Selbstzweck: jeder Eintrag hier ist eine Tür ohne
    // Schloss. Wächst die Liste, soll das eine bewusste Entscheidung sein und
    // keine, die beim Durchsehen eines Diffs untergeht.
    expect(OFFENE_PFADE).toEqual(['/anmelden', '/api/health', '/manifest.webmanifest'])
  })
})
