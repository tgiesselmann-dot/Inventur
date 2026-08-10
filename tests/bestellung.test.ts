import { Decimal } from '@prisma/client/runtime/client'
import { describe, expect, it } from 'vitest'

import { BestellStatus, EkPreisBezug, Gebindeart } from '@/generated/prisma/enums'
import {
  alsText,
  ausEingabe,
  bedarf,
  bestand,
  bestellwerttext,
  dringlichkeit,
  fehlmenge,
  gelieferteGebinde,
  lieferstand,
  naechsteStati,
  summe,
  VORGABE,
  verbrauchJeTag,
  wechselErlaubt,
  zeile,
  zuBestellen,
  type Bedarfsrahmen,
  type BestellArtikel,
  type Lage,
} from '@/lib/bestellung'

/** Kasten Bier, 24 x 0,33, 17,99 EUR je Kasten. */
const kastenBier: BestellArtikel = {
  id: 'a-bier',
  name: 'Veltins Pilsener',
  kategorie: 'Bier Flasche',
  lieferGebindeText: '24 x 0,33',
  gebindeart: Gebindeart.KASTEN,
  einheitenProGebinde: 24,
  ekPreisCent: 1799,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

/** Fass Pils, 50 l, 95,00 EUR. Ein Fass ist ein Gebinde und eine Einheit. */
const fassPils: BestellArtikel = {
  id: 'a-fass',
  name: 'Veltins Fass',
  kategorie: 'Bier Fass',
  lieferGebindeText: '1 x 50,0',
  gebindeart: Gebindeart.FASS,
  einheitenProGebinde: 1,
  ekPreisCent: 9500,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

/** Karton Wein, 6 x 0,75, Preis nicht bekannt. */
const kartonWein: BestellArtikel = {
  id: 'a-wein',
  name: '3 Freunde Riesling',
  kategorie: 'Wein',
  lieferGebindeText: '6 x 0,75',
  gebindeart: Gebindeart.KARTON,
  einheitenProGebinde: 6,
  ekPreisCent: null,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
}

/** Vier Wochen Verbrauch, vier Wochen Reichweite, kein Saisonzuschlag. */
const rahmen: Bedarfsrahmen = { verbrauchTage: 28, reichweiteTage: 28, saisonfaktor: '1' }

function lage(werte: Partial<Lage> = {}): Lage {
  return {
    verbrauch: new Decimal(0),
    zugeordnet: true,
    gezaehlt: new Decimal(0),
    zugaenge: new Decimal(0),
    abgaenge: new Decimal(0),
    unterwegs: new Decimal(0),
    ...werte,
  }
}

describe('bestand', () => {
  it('schreibt die Zählung mit Zugängen und Abgängen bis heute fort', () => {
    // 53 gezählt, ein Kasten geliefert, 30 verkauft.
    const stand = bestand(lage({ gezaehlt: new Decimal(53), zugaenge: new Decimal(24), abgaenge: new Decimal(30) }))
    expect(stand?.toString()).toBe('47')
  })

  it('ist am Zähltag selbst die Zählung', () => {
    expect(bestand(lage({ gezaehlt: new Decimal(53) }))?.toString()).toBe('53')
  })

  it('bleibt null, wenn der Artikel nicht gezählt wurde', () => {
    // Nicht 0: da stand vielleicht etwas, es hat nur niemand gezählt.
    expect(bestand(lage({ gezaehlt: null }))).toBeNull()
  })
})

describe('bedarf', () => {
  it('rechnet 168 Flaschen in 28 Tagen auf 6 je Tag', () => {
    expect(verbrauchJeTag(lage({ verbrauch: new Decimal(168) }), rahmen).toString()).toBe('6')
  })

  it('teilt durch die belegten Tage, nicht durch das angefragte Fenster', () => {
    // 84 Flaschen, aber nur 14 Tage importiert: 6 je Tag, nicht 3.
    const halbesFenster: Bedarfsrahmen = { ...rahmen, verbrauchTage: 14 }
    expect(verbrauchJeTag(lage({ verbrauch: new Decimal(84) }), halbesFenster).toString()).toBe('6')
  })

  it('multipliziert Tagesverbrauch mit der Reichweite', () => {
    expect(bedarf(lage({ verbrauch: new Decimal(168) }), rahmen).toString()).toBe('168')
  })

  it('schlägt den Saisonfaktor auf', () => {
    const hochsaison: Bedarfsrahmen = { ...rahmen, saisonfaktor: '1.5' }
    expect(bedarf(lage({ verbrauch: new Decimal(168) }), hochsaison).toString()).toBe('252')
  })

  it('wirft, wenn keine Tage belegt sind', () => {
    // Eine Division durch null wäre hier keine Unendlichkeit, sondern eine
    // Bestellung ohne Grundlage.
    expect(() => verbrauchJeTag(lage(), { ...rahmen, verbrauchTage: 0 })).toThrow(/verbrauchTage/)
  })
})

describe('fehlmenge', () => {
  it('zieht Bestand und unterwegs vom Bedarf ab', () => {
    const stand = lage({
      verbrauch: new Decimal(168),
      gezaehlt: new Decimal(53),
      zugaenge: new Decimal(24),
      abgaenge: new Decimal(30),
    })
    // Bedarf 168, Bestand 47 -> 121
    expect(fehlmenge(stand, rahmen).toString()).toBe('121')
    // Ein Kasten ist bestellt und noch nicht da: 24 weniger.
    expect(fehlmenge({ ...stand, unterwegs: new Decimal(24) }, rahmen).toString()).toBe('97')
  })

  it('wird bei vollem Keller nicht negativ', () => {
    const stand = lage({ verbrauch: new Decimal(28), gezaehlt: new Decimal(500) })
    expect(fehlmenge(stand, rahmen).toString()).toBe('0')
  })

  it('deckt bei nicht gezähltem Artikel den ganzen Bedarf', () => {
    const stand = lage({ verbrauch: new Decimal(168), gezaehlt: null })
    expect(fehlmenge(stand, rahmen).toString()).toBe('168')
  })
})

describe('zeile', () => {
  const knapp = lage({
    verbrauch: new Decimal(168),
    gezaehlt: new Decimal(53),
    zugaenge: new Decimal(24),
    abgaenge: new Decimal(30),
  })

  it('rundet die Fehlmenge auf ganze Kästen auf', () => {
    const eintrag = zeile(kastenBier, knapp, rahmen)
    // 121 Flaschen fehlen, ein Kasten hat 24: sechs Kästen, nicht fünf.
    expect(eintrag.fehlmenge.toString()).toBe('121')
    expect(eintrag.vorschlagGebinde).toBe(6)
  })

  it('zeigt die Überdeckung, die die Aufrundung kostet', () => {
    // 6 x 24 = 144 gegen 121 nötige Flaschen.
    expect(zeile(kastenBier, knapp, rahmen).ueberdeckung.toString()).toBe('23')
  })

  it('bestellt beim Fass ganze Fässer', () => {
    const stand = lage({ verbrauch: new Decimal(4.2), gezaehlt: new Decimal(1) })
    // Bedarf 4,2 Fässer, eines steht da: 3,2 fehlen, also 4 bestellen.
    const eintrag = zeile(fassPils, stand, rahmen)
    expect(eintrag.fehlmenge.toString()).toBe('3.2')
    expect(eintrag.vorschlagGebinde).toBe(4)
  })

  it('löst schon eine einzelne fehlende Flasche einen ganzen Kasten aus', () => {
    const stand = lage({ verbrauch: new Decimal(28), gezaehlt: new Decimal(27) })
    // Halbe Kästen liefert niemand. Die Überdeckung macht es sichtbar.
    const eintrag = zeile(kastenBier, stand, rahmen)
    expect(eintrag.vorschlagGebinde).toBe(1)
    expect(eintrag.ueberdeckung.toString()).toBe('23')
  })

  it('bewertet die Position über den Gebindepreis', () => {
    expect(zeile(kastenBier, knapp, rahmen).wertCent).toBe(6 * 1799)
  })

  it('lässt den Wert null, wenn kein Preis hinterlegt ist', () => {
    const stand = lage({ verbrauch: new Decimal(28), gezaehlt: new Decimal(0) })
    const eintrag = zeile(kartonWein, stand, rahmen)
    expect(eintrag.vorschlagGebinde).toBe(5) // 28 Flaschen / 6 je Karton
    expect(eintrag.wertCent).toBeNull()
  })

  it('erkennt einen Handeingriff am Abstand zum Vorschlag', () => {
    // Kein gespeichertes Kennzeichen: die abweichende Menge ist der Handeingriff.
    expect(zeile(kastenBier, knapp, rahmen, 6).handeingriff).toBe(false)
    expect(zeile(kastenBier, knapp, rahmen, 8).handeingriff).toBe(true)
    expect(zeile(kastenBier, knapp, rahmen, 0).handeingriff).toBe(true)
  })

  it('trennt gestrichene Zeile von übernommenem Vorschlag', () => {
    // null heisst "nimm den Vorschlag", 0 heisst "nicht bestellen".
    expect(zeile(kastenBier, knapp, rahmen, null).mengeGebinde).toBe(6)
    expect(zeile(kastenBier, knapp, rahmen, 0).mengeGebinde).toBe(0)
  })

  it('meldet den fehlenden Kassenbezug statt einen Bedarf von 0 zu behaupten', () => {
    const eintrag = zeile(kastenBier, lage({ zugeordnet: false }), rahmen)
    expect(eintrag.ohneVerbrauch).toBe(true)
    expect(eintrag.vorschlagGebinde).toBe(0)
  })

  it('meldet den fehlenden Bestand', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(24), gezaehlt: null }), rahmen)
    expect(eintrag.ohneBestand).toBe(true)
  })
})

describe('summe', () => {
  const bier = zeile(kastenBier, lage({ verbrauch: new Decimal(168) }), rahmen) // 7 Kästen
  const wein = zeile(kartonWein, lage({ verbrauch: new Decimal(28) }), rahmen) // 5 Kartons, kein Preis
  const nichts = zeile(fassPils, lage({ verbrauch: new Decimal(0) }), rahmen) // 0 Fässer

  it('zählt nur die Zeilen mit Menge als Position', () => {
    expect(zuBestellen([bier, wein, nichts]).map((eintrag) => eintrag.artikel.id)).toEqual([
      'a-bier',
      'a-wein',
    ])
  })

  it('addiert Gebinde und Wert', () => {
    const gesamt = summe([bier, wein, nichts])
    expect(gesamt.positionen).toBe(2)
    expect(gesamt.gebinde).toBe(12)
    expect(gesamt.wertCent).toBe(7 * 1799)
  })

  it('zählt die Position ohne Preis, statt sie als 0 mitzurechnen', () => {
    // Der Unterschied trägt die Entscheidung: eine 0 verschwindet in der Summe
    // und macht die Bestellung billiger, als sie ist.
    expect(summe([bier, wein, nichts]).ohnePreis).toBe(1)
  })

  it('zählt Lücken über alle Zeilen, nicht nur über die bestellten', () => {
    const ohne = zeile(fassPils, lage({ zugeordnet: false, gezaehlt: null }), rahmen)
    const gesamt = summe([bier, ohne])
    expect(gesamt.ohneVerbrauch).toBe(1)
    expect(gesamt.ohneBestand).toBe(1)
    expect(gesamt.positionen).toBe(1)
  })

  it('zählt Handeingriffe', () => {
    const eingegriffen = zeile(kastenBier, lage({ verbrauch: new Decimal(168) }), rahmen, 9)
    expect(summe([eingegriffen, wein]).handeingriffe).toBe(1)
  })
})

describe('dringlichkeit', () => {
  it('nennt eine gedeckte Zeile gedeckt', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(28), gezaehlt: new Decimal(500) }), rahmen)
    expect(dringlichkeit(eintrag, rahmen)).toBe('gedeckt')
  })

  it('nennt ein leeres Regal leer', () => {
    // 6 Flaschen am Tag, 12 im Lager: zwei Tage bei 28 Tagen Reichweite.
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(168), gezaehlt: new Decimal(12) }), rahmen)
    expect(dringlichkeit(eintrag, rahmen)).toBe('leer')
  })

  it('nennt einen halb gefüllten Bestand knapp', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(168), gezaehlt: new Decimal(100) }), rahmen)
    expect(dringlichkeit(eintrag, rahmen)).toBe('knapp')
  })
})

describe('alsText', () => {
  it('gibt Mengen als deutschen Text und die Menge in der Sprache des Gebindes', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(168), gezaehlt: new Decimal(47) }), rahmen)
    const text = alsText(eintrag, rahmen)
    expect(text.mengeText).toBe('6 Kästen')
    expect(text.bestand).toBe('47')
    expect(text.verbrauchJeTag).toBe('6')
    expect(text.mitPreis).toBe(true)
  })

  it('nennt einen einzelnen Kasten in der Einzahl', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(28), gezaehlt: new Decimal(27) }), rahmen)
    expect(alsText(eintrag, rahmen).mengeText).toBe('1 Kasten')
  })

  it('lässt unterwegs und Überdeckung leer, wo es nichts zu sagen gibt', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(24), gezaehlt: new Decimal(0) }), rahmen)
    const text = alsText(eintrag, rahmen)
    expect(text.unterwegs).toBeNull()
    expect(text.ueberdeckung).toBeNull()
  })

  it('zeigt beim nicht gezählten Artikel keinen Bestand statt einer 0', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(24), gezaehlt: null }), rahmen)
    expect(alsText(eintrag, rahmen).bestand).toBeNull()
  })
})

describe('lieferstand', () => {
  const position = (bestellt: number, geliefert: number) => ({
    bestellt: new Decimal(bestellt),
    geliefert: new Decimal(geliefert),
  })

  it('nennt eine unberührte Bestellung nichts geliefert', () => {
    expect(lieferstand([position(6, 0), position(2, 0)])).toBe('nichts')
  })

  it('erkennt eine Teillieferung', () => {
    expect(lieferstand([position(6, 6), position(2, 0)])).toBe('teilweise')
    expect(lieferstand([position(6, 4), position(2, 2)])).toBe('teilweise')
  })

  it('erkennt die vollständige Lieferung', () => {
    expect(lieferstand([position(6, 6), position(2, 2)])).toBe('vollstaendig')
  })

  it('macht aus einer Überlieferung keinen Sonderfall', () => {
    // Mehr als bestellt ist gekommen — offen ist trotzdem nichts.
    expect(lieferstand([position(6, 7)])).toBe('vollstaendig')
  })

  it('nennt eine Bestellung ohne Position nichts geliefert', () => {
    expect(lieferstand([])).toBe('nichts')
  })
})

describe('naechsteStati', () => {
  it('führt den Entwurf zum Abschicken oder ins Storno', () => {
    expect(naechsteStati(BestellStatus.ENTWURF)).toEqual([
      BestellStatus.VERSENDET,
      BestellStatus.STORNIERT,
    ])
  })

  it('lässt eine abgeschickte Bestellung nicht zurück in den Entwurf', () => {
    // Was beim Lieferanten liegt, sammelt niemand wieder ein.
    expect(wechselErlaubt(BestellStatus.VERSENDET, BestellStatus.ENTWURF)).toBe(false)
    expect(wechselErlaubt(BestellStatus.VERSENDET, BestellStatus.ABGESCHLOSSEN)).toBe(true)
  })

  it('lässt abgeschlossene und stornierte Bestellungen in Ruhe', () => {
    expect(naechsteStati(BestellStatus.ABGESCHLOSSEN)).toEqual([])
    expect(naechsteStati(BestellStatus.STORNIERT)).toEqual([])
  })
})

describe('ausEingabe', () => {
  it('übernimmt gültige Eingaben', () => {
    expect(ausEingabe({ referenzTage: '14', reichweiteTage: '7', saisonfaktor: '1,6' })).toEqual({
      referenzTage: 14,
      reichweiteTage: 7,
      saisonfaktor: '1.6',
    })
  })

  it('fällt bei unbrauchbaren Eingaben auf die Vorgabe zurück', () => {
    // Ein halb getippter Wert ist kein Fehler, der die Seite sprengt.
    expect(ausEingabe({ referenzTage: '', reichweiteTage: 'x', saisonfaktor: '-1' })).toEqual({
      referenzTage: VORGABE.referenzTage,
      reichweiteTage: VORGABE.reichweiteTage,
      saisonfaktor: VORGABE.saisonfaktor,
    })
  })

  it('weist einen Saisonfaktor über 5 als Tippfehler ab', () => {
    expect(ausEingabe({ saisonfaktor: '16' }).saisonfaktor).toBe(VORGABE.saisonfaktor)
  })

  it('weist gebrochene und übergrosse Tageszahlen ab', () => {
    expect(ausEingabe({ referenzTage: '2,5' }).referenzTage).toBe(VORGABE.referenzTage)
    expect(ausEingabe({ referenzTage: '400' }).referenzTage).toBe(VORGABE.referenzTage)
  })
})

describe('gelieferteGebinde', () => {
  const geprueft = (anzahl: string) => ({
    anzahlGebindeTatsaechlich: new Decimal(anzahl),
    lieferung: { geprueftAm: new Date(Date.UTC(2026, 7, 1)) },
  })
  const ungeprueft = (anzahl: string) => ({
    anzahlGebindeTatsaechlich: new Decimal(anzahl),
    lieferung: { geprueftAm: null },
  })

  it('summiert nur geprüfte Lieferungen', () => {
    // Ungeprüfte Ware ist ein Papier und kein Zugang.
    expect(gelieferteGebinde([geprueft('4'), ungeprueft('2'), geprueft('1')])?.toString()).toBe('5')
  })

  it('unterscheidet "nichts gekommen" von einer geprüften Lieferung über 0', () => {
    expect(gelieferteGebinde([])).toBeNull()
    expect(gelieferteGebinde([ungeprueft('2')])).toBeNull()
    expect(gelieferteGebinde([geprueft('0')])?.toString()).toBe('0')
  })
})

describe('bestellwerttext', () => {
  it('nennt den Betrag, auch wenn einzelne Positionen keinen Preis tragen', () => {
    expect(bestellwerttext({ wertCent: 1859, ohnePreis: 0 })).toBe('18,59 EUR')
    // Der fehlende Preis steht daneben in Worten, nicht als 0 in der Summe.
    expect(bestellwerttext({ wertCent: 1859, ohnePreis: 2 })).toBe('18,59 EUR')
  })

  it('sagt 0,00 EUR nur, wo wirklich nichts kostet', () => {
    expect(bestellwerttext({ wertCent: 0, ohnePreis: 0 })).toBe('0,00 EUR')
  })

  it('behauptet keine 0,00 EUR aus lauter unbewertbaren Positionen', () => {
    expect(bestellwerttext({ wertCent: 0, ohnePreis: 3 })).toBe('nicht bewertbar')
  })
})

describe('alsText ohne Kassendaten', () => {
  it('setzt Verbrauch, Bedarf und Fehlmenge auf den Strich statt auf 0', () => {
    // Ohne einen einzigen Kassenimport rechnen sich die drei Spalten zu 0 —
    // aber die 0 wäre die Behauptung "wir brauchen nichts".
    const eintrag = zeile(kastenBier, lage({ gezaehlt: new Decimal(10) }), rahmen)
    const text = alsText(eintrag, rahmen, false)

    expect(text.verbrauchJeTag).toBeNull()
    expect(text.bedarf).toBeNull()
    expect(text.fehlmenge).toBeNull()
  })

  it('lässt die Spalten mit Kassendaten stehen', () => {
    const eintrag = zeile(kastenBier, lage({ verbrauch: new Decimal(168) }), rahmen)
    expect(alsText(eintrag, rahmen, true).verbrauchJeTag).toBe('6')
  })
})
