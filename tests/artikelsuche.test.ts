import { describe, expect, it } from 'vitest'

import { passtAufText, passtZurSuche, suchwoerter } from '@/lib/artikelsuche'

// Die Beispiele sind Zeilen aus fixtures/artikelstamm-stadthafen.csv: derselbe
// Artikel steht dort mehrfach in verschiedenen Gebinden, und genau daran muss
// sich die Suche bewähren.
const colaKasten = { name: 'Coca Cola', lieferGebindeText: '24 x 0,33' }
const sprudelKlein = { name: 'Gerolsteiner Sprudel', lieferGebindeText: '24 x 0,25' }
const sprudelGross = { name: 'Gerolsteiner Sprudel', lieferGebindeText: '12 x 0,75' }

describe('suchwoerter', () => {
  it('zerlegt an beliebigem Weissraum', () => {
    expect(suchwoerter('  coca   cola ')).toEqual(['coca', 'cola'])
  })

  it('gibt bei leerer Suche nichts zurück', () => {
    expect(suchwoerter('   ')).toEqual([])
  })
})

describe('passtAufText', () => {
  it('passt ohne Suche auf alles — keine Einschränkung ist keine Sperre', () => {
    expect(passtAufText('Aperitif', '')).toBe(true)
    expect(passtAufText('Aperitif', '   ')).toBe(true)
  })

  it('achtet nicht auf Gross- und Kleinschreibung', () => {
    expect(passtAufText('Aperitif', 'APERITIF')).toBe(true)
  })

  it('findet auch mitten im Wort', () => {
    // Wer "cola" tippt, meint auch "Coca Cola" — kein Präfix-Zwang.
    expect(passtAufText('Coca Cola', 'ola')).toBe(true)
  })
})

describe('passtZurSuche', () => {
  it('findet über den Namen', () => {
    expect(passtZurSuche(colaKasten, 'cola')).toBe(true)
  })

  it('trennt zwei Gebinde desselben Artikels über den Gebindetext', () => {
    // "Gerolsteiner 0,75" muss die grosse Flasche finden und die kleine nicht.
    expect(passtZurSuche(sprudelGross, 'gerolsteiner 0,75')).toBe(true)
    expect(passtZurSuche(sprudelKlein, 'gerolsteiner 0,75')).toBe(false)
  })

  it('nimmt die Wörter in beliebiger Reihenfolge', () => {
    expect(passtZurSuche(colaKasten, '0,33 coca')).toBe(true)
  })

  it('verlangt alle Wörter', () => {
    expect(passtZurSuche(colaKasten, 'coca fanta')).toBe(false)
  })
})
