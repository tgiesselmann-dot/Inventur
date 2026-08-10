import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { EkPreisBezug, Zaehlmodus } from '@/generated/prisma/enums'
import {
  einheitenJeArtikel,
  zeile,
  type AuswertungsArtikel,
  type Bewegungen,
  type Gezaehlt,
} from '@/lib/auswertung'

/**
 * Die Probe, an der der ganze Umbau hängt: derselbe Bestand, einmal an einem
 * Ort gezählt und einmal über die vier Lager verteilt, muss dieselbe Zahl
 * ergeben.
 *
 * Ginge das auseinander, wäre jede Schwundrechnung nach der Umstellung falsch —
 * und zwar unbemerkt, weil beide Wege für sich plausible Zahlen liefern.
 */

/**
 * Ein Artikel, wie ihn beide Seiten brauchen: bewertbar für die Zeile und
 * zählbar für die Umrechnung. `Gezaehlt['artikel']` holt sich die Zählfelder
 * von dort, wo sie definiert sind, statt sie hier abzuschreiben.
 */
type Testartikel = AuswertungsArtikel & Gezaehlt['artikel']

/** Kasten Cola, 24 x 0,33, 18,59 EUR je Kasten. */
const cola: Testartikel = {
  id: 'a1',
  name: 'Coca Cola',
  kategorie: 'Softdrinks',
  lieferGebindeText: '24 x 0,33',
  einheitenProGebinde: 24,
  ekPreisCent: 1859,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  schwundfaehig: true,
  zaehlmodus: Zaehlmodus.GEBINDE_PLUS_EINZELN,
}

/** Gin, nur einzeln gezählt — der Modus ohne Gebindefeld. */
const gin: Testartikel = {
  ...cola,
  id: 'a2',
  name: 'Gordons Gin',
  kategorie: 'Spirituosen',
  lieferGebindeText: '1 x 0,7',
  einheitenProGebinde: 1,
  zaehlmodus: Zaehlmodus.EINZELN,
  schwundfaehig: false,
}

function position(artikel: Testartikel, gebinde: string, einzeln: string): Gezaehlt {
  return {
    artikelId: artikel.id,
    anzahlGebinde: new Decimal(gebinde),
    anzahlEinzeln: new Decimal(einzeln),
    artikel,
  }
}

function bewegungen(ist: Decimal): Bewegungen {
  return {
    anfang: new Decimal(0),
    lieferungen: new Decimal(0),
    verkaeufe: new Decimal(0),
    ist,
    belege: { anfang: [], lieferungen: [], verkaeufe: [], ist: [] },
  }
}

describe('einheitenJeArtikel', () => {
  it('summiert vier Lager zu demselben Bestand wie eine Einzelzählung', () => {
    // 5 Kästen + 7 lose an einem Ort …
    const einer = einheitenJeArtikel([position(cola, '5', '7')])
    // … und dieselbe Ware über Theke, Kiosk, Kühlcontainer und blauen Container.
    const vier = einheitenJeArtikel([
      position(cola, '2', '3'),
      position(cola, '1', '4'),
      position(cola, '2', '0'),
      position(cola, '0', '0'),
    ])

    expect(vier.get(cola.id)!.toString()).toBe(einer.get(cola.id)!.toString())
    // 5 Kästen à 24 plus 7 lose = 127 Flaschen.
    expect(vier.get(cola.id)!.toString()).toBe('127')
  })

  it('gibt je Artikel genau einen Eintrag zurück', () => {
    // Der eigentliche Fehler, den diese Funktion verhindert: derselbe Artikel
    // mehrfach im Ergebnis, jedes Mal mit einem Teilbestand.
    const summen = einheitenJeArtikel([
      position(cola, '2', '0'),
      position(cola, '3', '0'),
      position(gin, '0', '4'),
    ])

    expect(summen.size).toBe(2)
    expect(summen.get(cola.id)!.toString()).toBe('120')
    expect(summen.get(gin.id)!.toString()).toBe('4')
  })

  it('hält die Lager zweier Artikel auseinander', () => {
    const summen = einheitenJeArtikel([
      position(cola, '1', '0'),
      position(gin, '0', '2'),
      position(gin, '0', '3'),
    ])

    expect(summen.get(cola.id)!.toString()).toBe('24')
    expect(summen.get(gin.id)!.toString()).toBe('5')
  })

  it('bleibt bei halben Gebinden genau', () => {
    // Fässer werden angebrochen gezählt; über vier Lager darf dabei nichts
    // verrutschen.
    const summen = einheitenJeArtikel([
      position(cola, '0.5', '0'),
      position(cola, '0.25', '0'),
      position(cola, '0.25', '0'),
    ])
    expect(summen.get(cola.id)!.toString()).toBe('24')
  })

  it('ergibt eine leere Zuordnung, wenn nichts gezählt wurde', () => {
    // Nicht 0: ein Artikel ohne jede Position ist nicht gezählt, und der
    // Unterschied trägt die ganze Auswertung.
    expect(einheitenJeArtikel([]).size).toBe(0)
  })
})

describe('bewertete Zeile über mehrere Lager', () => {
  it('führt zu demselben Bestandswert wie eine Einzelzählung', () => {
    const einer = zeile(cola, bewegungen(einheitenJeArtikel([position(cola, '5', '7')]).get(cola.id)!))
    const zwei = zeile(
      cola,
      bewegungen(
        einheitenJeArtikel([position(cola, '3', '7'), position(cola, '2', '0')]).get(cola.id)!,
      ),
    )

    expect(zwei.ist?.toString()).toBe(einer.ist?.toString())
    expect(zwei.bestandWertCent).toBe(einer.bestandWertCent)
  })
})
