import { describe, expect, it } from 'vitest'

import { Abweichungsart, EkPreisBezug, Gebindeart } from '@/generated/prisma/enums'
import {
  abschlussstand,
  abweichungstext,
  alsEuro,
  alsPreiseingabe,
  artikelSetzen,
  aufgeschluesselt,
  bilanztext,
  centAusEingabe,
  kontrollstand,
  fehlbetragsrolle,
  fehlbetragtext,
  preisabweichungstext,
  istErsatzartikel,
  leergutDifferenz,
  leergutPfandCent,
  leergutzustand,
  leerguttext,
  leergutzusammenfassung,
  mitNachlieferung,
  nachlieferungSetzen,
  preisabweichungAnteil,
  preisabweichungCent,
  preisabweichungsstufe,
  preisvergleich,
  preisSetzen,
  bilanzbetont,
  umfangtext,
  PREIS_UNPLAUSIBEL_ANTEIL,
  bestellabweichung,
  differenz,
  einheitenzeile,
  erfassungssumme,
  fehlbetragCent,
  lieferscheinSetzen,
  luecke,
  mengeSetzen,
  mitBruch,
  positionswerttext,
  stimmig,
  vorbelegt,
  vorschlag,
  warenwerttext,
  zeilenstand,
  zusammenfassung,
  type ErfassungsArtikel,
  type ErfassungsPosition,
  type Leergutzeile,
  type PruefPosition,
  type WareneingangArtikel,
} from '@/lib/wareneingang'

/** Kasten Cola, 24 x 0,33, 18,59 EUR je Kasten. */
const kastenCola: WareneingangArtikel = {
  id: 'a1',
  name: 'Coca Cola',
  kategorie: 'Softdrinks',
  lieferGebindeText: '24 x 0,33',
  gebindeart: Gebindeart.KASTEN,
  einheitenProGebinde: 24,
  ekPreisCent: 1859,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
}

/** Karton Wein ohne hinterlegten Preis — im Stamm gibt es solche Zeilen. */
const kartonWeinOhnePreis: WareneingangArtikel = {
  id: 'a2',
  name: '3 Freunde Weisswein',
  kategorie: 'Wein',
  lieferGebindeText: '6 x 0,75',
  gebindeart: Gebindeart.KARTON,
  einheitenProGebinde: 6,
  ekPreisCent: null,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
}

/** Eine Zeile, wie sie nach dem Erfassen des Lieferscheins dasteht. */
function zeile(lieferschein: string, bestellt: string | null = null): PruefPosition {
  return vorbelegt({ id: 'p1', artikel: kastenCola, bestellt, lieferschein })
}

describe('vorbelegt', () => {
  it('setzt die tatsächliche Menge auf den Lieferschein', () => {
    // Der ganze Trick der Maske: wer nichts anfasst, bestätigt das Papier.
    const position = zeile('6')
    expect(position.tatsaechlich).toBe('6')
    expect(position.abweichungen).toEqual([])
    expect(zeilenstand(position)).toBe('stimmt')
  })
})

describe('differenz und zeilenstand', () => {
  it('meldet eine Fehlmenge, wenn weniger auf der Palette stand', () => {
    const position = mengeSetzen(zeile('6'), '5')
    expect(differenz(position).toString()).toBe('1')
    expect(zeilenstand(position)).toBe('fehlmenge')
  })

  it('meldet eine Überlieferung, wenn mehr da war', () => {
    const position = mengeSetzen(zeile('6'), '7')
    expect(differenz(position).toString()).toBe('-1')
    expect(zeilenstand(position)).toBe('ueberlieferung')
  })

  it('rechnet mit halben Gebinden', () => {
    const position = mengeSetzen(zeile('4'), '3,5')
    expect(differenz(position).toString()).toBe('0.5')
  })

  it('hält die Bestellabweichung von der Lieferabweichung getrennt', () => {
    // Bestellt 8, Lieferschein 6, tatsächlich 5: der Lieferant hat 2 zu wenig
    // geliefert, und von den berechneten 6 fehlt zusätzlich eines.
    const position = mengeSetzen(zeile('6', '8'), '5')
    expect(bestellabweichung(position)?.toString()).toBe('2')
    expect(differenz(position).toString()).toBe('1')
  })

  it('kennt ohne Bestellung keine Bestellabweichung', () => {
    expect(bestellabweichung(zeile('6'))).toBeNull()
  })
})

describe('Aufschlüsselung der Differenz', () => {
  it('schlägt für eine Fehlmenge die passende Abweichung vor', () => {
    const position = mengeSetzen(zeile('6'), '5')
    expect(position.abweichungen).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' },
    ])
    expect(stimmig(position)).toBe(true)
  })

  it('schlägt für eine Überlieferung die Gegenrichtung vor', () => {
    const position = mengeSetzen(zeile('6'), '8')
    expect(position.abweichungen).toEqual([
      { art: Abweichungsart.UEBERLIEFERUNG, anzahlGebinde: '2' },
    ])
    expect(stimmig(position)).toBe(true)
  })

  it('lässt eine stimmige Zeile ohne Abweichung', () => {
    expect(vorschlag(zeile('6'))).toEqual([])
  })

  it('teilt eine Fehlmenge in Bruch und schlicht Fehlendes', () => {
    // Von zwei fehlenden Kästen ist einer zerbrochen angekommen. Das sagt keine
    // Differenz der Welt — deshalb wird es aufgeschrieben.
    const position = mengeSetzen(zeile('6'), '4')
    const geteilt = { ...position, abweichungen: mitBruch(position, '1') }
    expect(geteilt.abweichungen).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' },
      { art: Abweichungsart.BRUCH, anzahlGebinde: '1' },
    ])
    expect(stimmig(geteilt)).toBe(true)
  })

  it('lässt Bruch die ganze Fehlmenge einnehmen', () => {
    const position = mengeSetzen(zeile('6'), '5')
    expect(mitBruch(position, '1')).toEqual([
      { art: Abweichungsart.BRUCH, anzahlGebinde: '1' },
    ])
  })

  it('kappt mehr Bruch, als überhaupt fehlt', () => {
    // Der verrutschte Daumen an der Rampe soll keinen Fehlerdialog auslösen.
    const position = mengeSetzen(zeile('6'), '5')
    expect(mitBruch(position, '9')).toEqual([
      { art: Abweichungsart.BRUCH, anzahlGebinde: '1' },
    ])
  })

  it('erhält den Bruch, wenn die Menge nochmals geändert wird', () => {
    const eineFehlt = mengeSetzen(zeile('6'), '5')
    const alsBruch = { ...eineFehlt, abweichungen: mitBruch(eineFehlt, '1') }
    // Beim zweiten Hinsehen fehlt noch ein weiterer Kasten — der Bruch bleibt.
    const korrigiert = mengeSetzen(alsBruch, '4')
    expect(korrigiert.abweichungen).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' },
      { art: Abweichungsart.BRUCH, anzahlGebinde: '1' },
    ])
    expect(stimmig(korrigiert)).toBe(true)
  })
})

describe('lieferscheinSetzen', () => {
  it('zieht die tatsächliche Menge mit, solange die Zeile unberührt ist', () => {
    // Der Regelfall ohne Bestellung: der Lieferschein wird abgetippt, und was
    // dort steht, ist zunächst auch angekommen.
    const position = lieferscheinSetzen(zeile('0'), '6')
    expect(position.lieferschein).toBe('6')
    expect(position.tatsaechlich).toBe('6')
    expect(zeilenstand(position)).toBe('stimmt')
  })

  it('lässt eine bereits korrigierte Menge stehen', () => {
    // Wer die tatsächliche Menge angefasst hat, hat etwas gesehen — eine
    // spätere Korrektur am Lieferschein darf das nicht überschreiben.
    const korrigiert = mengeSetzen(zeile('6'), '5')
    const position = lieferscheinSetzen(korrigiert, '7')
    expect(position.tatsaechlich).toBe('5')
    expect(position.abweichungen).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahlGebinde: '2' },
    ])
  })

  it('erhält dabei einen eingetragenen Bruch', () => {
    const eineFehlt = mengeSetzen(zeile('6'), '5')
    const alsBruch = { ...eineFehlt, abweichungen: mitBruch(eineFehlt, '1') }
    const position = lieferscheinSetzen(alsBruch, '7')
    expect(position.abweichungen).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' },
      { art: Abweichungsart.BRUCH, anzahlGebinde: '1' },
    ])
  })
})

describe('Invariante zwischen Differenz und Abweichungen', () => {
  it('erkennt eine Aufschlüsselung, die zu wenig erklärt', () => {
    const position: PruefPosition = {
      ...mengeSetzen(zeile('6'), '3'),
      abweichungen: [{ art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' }],
    }
    expect(luecke(position).toString()).toBe('2')
    expect(stimmig(position)).toBe(false)
  })

  it('erkennt eine Aufschlüsselung, die zu viel erklärt', () => {
    const position: PruefPosition = {
      ...zeile('6'),
      abweichungen: [{ art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' }],
    }
    expect(luecke(position).toString()).toBe('-1')
    expect(stimmig(position)).toBe(false)
  })

  it('zählt Überlieferung in der Gegenrichtung', () => {
    const position = mengeSetzen(zeile('6'), '7')
    expect(aufgeschluesselt(position).toString()).toBe('-1')
    expect(stimmig(position)).toBe(true)
  })
})

describe('fehlbetragCent', () => {
  it('bewertet die Fehlmenge mit dem Gebindepreis', () => {
    const position = mengeSetzen(zeile('6'), '5')
    expect(fehlbetragCent(position)).toBe(1859)
  })

  it('rechnet Bruch und Fehlmenge zusammen', () => {
    const position = mengeSetzen(zeile('6'), '4')
    const geteilt = { ...position, abweichungen: mitBruch(position, '1') }
    expect(fehlbetragCent(geteilt)).toBe(3718)
  })

  it('lässt eine Überlieferung kostenfrei', () => {
    // Sie ist kein Guthaben des Betriebs, sondern eine Frage an den Lieferanten.
    expect(fehlbetragCent(mengeSetzen(zeile('6'), '8'))).toBe(0)
  })

  it('gibt null statt 0 zurück, wenn der Artikel keinen Preis trägt', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '3',
    })
    expect(fehlbetragCent(mengeSetzen(ohnePreis, '2'))).toBeNull()
  })
})

describe('zusammenfassung', () => {
  it('zählt Abweichungen und summiert die Fehlbeträge', () => {
    const positionen = [
      zeile('6'),
      mengeSetzen(zeile('4'), '3'),
      mengeSetzen(zeile('2'), '3'),
    ]
    expect(zusammenfassung(positionen)).toEqual({
      positionen: 3,
      abweichende: 2,
      fehlbetragCent: 1859,
      unbewertbar: 0,
      unstimmig: 0,
      zugesagt: 0,
      preisabweichungen: 0,
      ersatzartikel: 0,
    })
  })

  it('führt nicht bewertbare Positionen getrennt, statt sie als 0 zu zählen', () => {
    // Der Unterschied trägt die Entscheidung: 0 EUR würde eine Reklamation
    // verschwinden lassen, die es gibt.
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '3',
    })
    const ergebnis = zusammenfassung([mengeSetzen(ohnePreis, '1')])
    expect(ergebnis.fehlbetragCent).toBe(0)
    expect(ergebnis.unbewertbar).toBe(1)
    expect(ergebnis.abweichende).toBe(1)
  })

  it('meldet unstimmige Zeilen', () => {
    const kaputt: PruefPosition = {
      ...mengeSetzen(zeile('6'), '3'),
      abweichungen: [{ art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' }],
    }
    expect(zusammenfassung([kaputt]).unstimmig).toBe(1)
  })
})

describe('alsEuro', () => {
  it('schreibt Cent als deutschen Betrag', () => {
    expect(alsEuro(1859)).toBe('18,59 EUR')
    expect(alsEuro(0)).toBe('0,00 EUR')
    expect(alsEuro(500)).toBe('5,00 EUR')
  })
})

// ---------------------------------------------------------------------------
// Klartext: was unter der Zeile, im Kopf und auf der Fusstaste steht
// ---------------------------------------------------------------------------

describe('abweichungstext', () => {
  it('schweigt, solange Palette und Lieferschein übereinstimmen', () => {
    expect(abweichungstext(zeile('6'))).toBeNull()
  })

  it('nennt die Fehlmenge in der Einzahl samt Betrag', () => {
    expect(abweichungstext(mengeSetzen(zeile('6'), '5'))).toBe('1 Kasten fehlt · 18,59 EUR')
  })

  it('setzt die Mehrzahl, wo mehr als eines fehlt', () => {
    expect(abweichungstext(mengeSetzen(zeile('6'), '4'))).toBe('2 Kästen fehlen · 37,18 EUR')
  })

  it('hängt den Bruch an', () => {
    const fehlt = mengeSetzen(zeile('6'), '5')
    const geteilt = { ...fehlt, abweichungen: mitBruch(fehlt, '1') }
    expect(abweichungstext(geteilt)).toBe('1 Kasten fehlt · 18,59 EUR · mit Bruch')
  })

  it('nennt die Überlieferung ohne Betrag — sie ist keine Forderung', () => {
    expect(abweichungstext(mengeSetzen(zeile('6'), '8'))).toBe('2 Kästen zu viel')
  })

  it('sagt „nicht bewertbar" statt 0,00 EUR, wo der Preis fehlt', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '2',
    })
    expect(abweichungstext(mengeSetzen(ohnePreis, '1'))).toBe('1 Karton fehlt · nicht bewertbar')
  })

  it('lässt bei zugesagter Nachlieferung den Betrag weg und nennt den Termin', () => {
    const zugesagt = nachlieferungSetzen(mengeSetzen(zeile('6'), '5'), '2026-08-14')
    expect(abweichungstext(zugesagt)).toBe('1 Kasten fehlt · Nachlieferung bis 14.08.2026')
  })

  it('schweigt ohne Preissicht über Geld — auch über „nicht bewertbar"', () => {
    // Die Fassung für Rollen ohne Preissicht: Menge ja, Betrag nie.
    expect(abweichungstext(mengeSetzen(zeile('6'), '5'), false)).toBe('1 Kasten fehlt')
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '2',
    })
    expect(abweichungstext(mengeSetzen(ohnePreis, '1'), false)).toBe('1 Karton fehlt')
    const fehlt = mengeSetzen(zeile('6'), '5')
    const geteilt = { ...fehlt, abweichungen: mitBruch(fehlt, '1') }
    expect(abweichungstext(geteilt, false)).toBe('1 Kasten fehlt · mit Bruch')
  })
})

describe('preisabweichungstext', () => {
  it('schweigt ohne Abweichung vom hinterlegten Preis', () => {
    expect(preisabweichungstext(preisSetzen(zeile('6'), 1859))).toBeNull()
  })

  it('nennt beide Preise und verweist die stille Abweichung auf später', () => {
    expect(preisabweichungstext(preisSetzen(zeile('6'), 1959))).toBe(
      'Preis 19,59 EUR statt 18,59 EUR · später klären',
    )
  })

  it('bleibt auch beim günstigeren Preis still — entschieden wird später', () => {
    expect(preisabweichungstext(preisSetzen(zeile('6'), 1759))).toBe(
      'Preis 17,59 EUR statt 18,59 EUR · später klären',
    )
  })
})

describe('Plausibilität der Preisabweichung', () => {
  /** Runder Stammpreis, damit die Anteile glatte Prozente sind. */
  const runderKasten: WareneingangArtikel = { ...kastenCola, ekPreisCent: 2000 }
  const runde = (cent: number) =>
    preisSetzen(
      vorbelegt({ id: 'p8', artikel: runderKasten, bestellt: null, lieferschein: '6' }),
      cent,
    )

  it('rechnet die Abweichung als Anteil des hinterlegten Gebindepreises', () => {
    expect(preisabweichungAnteil(runde(2240))).toBeCloseTo(0.12)
    expect(preisabweichungAnteil(runde(1400))).toBeCloseTo(-0.3)
    expect(preisabweichungAnteil(runde(2000))).toBeNull()
  })

  it('stuft unter der Schwelle auf "klaeren"', () => {
    expect(preisabweichungsstufe(runde(2240))).toBe('klaeren')
  })

  it('stuft ab der Schwelle auf "nachfragen" — genau 25 % zählt mit', () => {
    expect(PREIS_UNPLAUSIBEL_ANTEIL).toBe(0.25)
    expect(preisabweichungsstufe(runde(2500))).toBe('nachfragen')
    expect(preisabweichungsstufe(runde(2760))).toBe('nachfragen')
  })

  it('gilt in beide Richtungen — auch ein Viertel zu billig ist ein Irrtum', () => {
    expect(preisabweichungsstufe(runde(1400))).toBe('nachfragen')
  })

  it('kennt ohne Vergleichspreis weder Anteil noch Stufe', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '3',
    })
    expect(preisabweichungAnteil(preisSetzen(ohnePreis, 5000))).toBeNull()
    expect(preisabweichungsstufe(preisSetzen(ohnePreis, 5000))).toBe('keine')
  })

  it('ruft bei der unplausiblen Abweichung nach dem Fahrer', () => {
    expect(preisabweichungstext(runde(2760))).toBe(
      'Preis 27,60 EUR statt 20,00 EUR · 38 % mehr — jetzt nachfragen',
    )
    expect(preisabweichungstext(runde(1400))).toBe(
      'Preis 14,00 EUR statt 20,00 EUR · 30 % weniger — jetzt nachfragen',
    )
  })
})

describe('preisvergleich', () => {
  it('schweigt ohne Preisabweichung', () => {
    expect(preisvergleich(zeile('6'))).toBeNull()
    expect(preisvergleich(preisSetzen(zeile('6'), 1859))).toBeNull()
  })

  it('stellt hinterlegten und berechneten Preis nebeneinander', () => {
    expect(preisvergleich(preisSetzen(zeile('6'), 1959))).toEqual({
      hinterlegt: '18,59 EUR',
      lieferschein: '19,59 EUR',
      hinweis: null,
    })
  })

  it('warnt vor der unplausiblen Übernahme', () => {
    const runderKasten: WareneingangArtikel = { ...kastenCola, ekPreisCent: 2000 }
    const teuer = preisSetzen(
      vorbelegt({ id: 'p8', artikel: runderKasten, bestellt: null, lieferschein: '6' }),
      2760,
    )
    expect(preisvergleich(teuer)).toEqual({
      hinterlegt: '20,00 EUR',
      lieferschein: '27,60 EUR',
      hinweis: '38 % mehr als hinterlegt',
    })
  })

  it('rechnet den hinterlegten Einheitspreis auf das Liefergebinde hoch', () => {
    // 8,90 EUR je Flasche, 6 je Karton: verglichen wird je Gebinde, wie auf
    // dem Lieferschein.
    const wein = vorbelegt({
      id: 'p9',
      artikel: { ...kartonWeinOhnePreis, ekPreisCent: 890 },
      bestellt: null,
      lieferschein: '2',
    })
    expect(preisvergleich(preisSetzen(wein, 5440))).toEqual({
      hinterlegt: '53,40 EUR',
      lieferschein: '54,40 EUR',
      hinweis: null,
    })
  })
})

describe('bilanztext', () => {
  it('fasst die fehlerfreie Lieferung in zwei Wörtern', () => {
    expect(bilanztext(zusammenfassung([zeile('6'), zeile('4')]))).toBe('ohne Abweichung')
  })

  it('nennt Zahl und Betrag', () => {
    const positionen = [zeile('6'), mengeSetzen(zeile('4'), '3'), mengeSetzen(zeile('2'), '3')]
    expect(bilanztext(zusammenfassung(positionen))).toBe('2 Abweichungen · 18,59 EUR')
  })

  it('setzt die Einzahl bei einer einzigen Abweichung', () => {
    expect(bilanztext(zusammenfassung([mengeSetzen(zeile('6'), '5')]))).toBe(
      '1 Abweichung · 18,59 EUR',
    )
  })

  it('behauptet bei einer reinen Überlieferung keine 0,00 EUR', () => {
    expect(bilanztext(zusammenfassung([mengeSetzen(zeile('6'), '8')]))).toBe('1 Abweichung')
  })

  it('sagt „nicht bewertbar", wo keine Abweichung einen Preis trägt', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '2',
    })
    expect(bilanztext(zusammenfassung([mengeSetzen(ohnePreis, '1')]))).toBe(
      '1 Abweichung · nicht bewertbar',
    )
  })

  it('nennt ohne Preissicht die Zahl der Abweichungen, aber keinen Betrag', () => {
    const positionen = [zeile('6'), mengeSetzen(zeile('4'), '3'), mengeSetzen(zeile('2'), '3')]
    expect(bilanztext(zusammenfassung(positionen), undefined, false)).toBe('2 Abweichungen')
    expect(bilanztext(zusammenfassung([zeile('6')]), undefined, false)).toBe('ohne Abweichung')
  })

  it('benennt ohne Preissicht abweichendes Leergut, ohne das Pfand zu beziffern', () => {
    const kaesten: Leergutzeile = {
      id: 'lg1',
      bezeichnung: 'Kasten 24er',
      lieferschein: '6',
      tatsaechlich: '4',
      pfandCentJeEinheit: 330,
    }
    expect(bilanztext(zusammenfassung([zeile('6')]), leergutzusammenfassung([kaesten]), false)).toBe(
      'Leergut weicht ab',
    )
  })
})

describe('fehlbetragtext', () => {
  it('nennt die Forderung als Betrag', () => {
    expect(fehlbetragtext(zusammenfassung([mengeSetzen(zeile('6'), '5')]))).toBe('18,59 EUR')
  })

  it('sagt 0,00 EUR, wo wirklich nichts zu fordern ist', () => {
    expect(fehlbetragtext(zusammenfassung([zeile('6'), zeile('4')]))).toBe('0,00 EUR')
  })

  it('behauptet keine 0,00 EUR, wo keine Abweichung einen Preis trägt', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '2',
    })
    expect(fehlbetragtext(zusammenfassung([mengeSetzen(ohnePreis, '1')]))).toBe('nicht bewertbar')
  })

  it('zeigt den bewertbaren Teil, wenn beides zusammenkommt', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '2',
    })
    const summe = zusammenfassung([mengeSetzen(zeile('6'), '5'), mengeSetzen(ohnePreis, '1')])
    // Die unbewertbare Zeile steht in der Bestätigung als eigene Kennzahl
    // daneben — der Betrag hier ist der geprüfte Teil und gibt sich nicht als
    // die ganze Forderung aus.
    expect(fehlbetragtext(summe)).toBe('18,59 EUR')
  })
})

describe('abschlussstand', () => {
  it('nennt bei leerer Lieferung den Grund, statt nur grau zu sein', () => {
    expect(abschlussstand(zusammenfassung([]))).toEqual({
      art: 'leer',
      text: 'Noch keine Position erfasst',
    })
  })

  it('bestätigt die stimmige Lieferung', () => {
    expect(abschlussstand(zusammenfassung([zeile('6'), zeile('4')]))).toEqual({
      art: 'stimmig',
      text: 'Alles stimmt — Wareneingang bestätigen',
    })
  })

  it('trägt die Zahl der Abweichungen in der Aufschrift', () => {
    const positionen = [zeile('6'), mengeSetzen(zeile('4'), '3'), mengeSetzen(zeile('2'), '3')]
    expect(abschlussstand(zusammenfassung(positionen))).toEqual({
      art: 'abweichend',
      text: 'Wareneingang bestätigen · 2 Abweichungen',
    })
  })

  it('sperrt, solange eine Abweichung keinen Grund hat', () => {
    const kaputt: PruefPosition = {
      ...mengeSetzen(zeile('6'), '3'),
      abweichungen: [{ art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' }],
    }
    expect(abschlussstand(zusammenfassung([kaputt]))).toEqual({
      art: 'unerklaert',
      text: '1 Position ohne Erklärung',
    })
  })

  it('meldet die leere Lieferung vor der unerklärten Abweichung', () => {
    // Ohne Position gibt es nichts zu erklären — die Aufschrift muss das
    // nächstliegende Hindernis nennen, nicht das zweitnächste.
    expect(abschlussstand(zusammenfassung([])).art).toBe('leer')
  })
})

// ---------------------------------------------------------------------------
// Ausbaustufen: Nachlieferung, Preisabweichung, Ersatzartikel, Leergut
// ---------------------------------------------------------------------------

describe('Nachlieferung', () => {
  it('lässt die Menge fehlen, aber nicht den Betrag fordern', () => {
    // Der Bestand ist geringer — das bleibt wahr. Reklamiert wird trotzdem
    // nichts, weil der Fahrer den Rest für Freitag zugesagt hat.
    const fehlt = mengeSetzen(zeile('6'), '5')
    expect(fehlbetragCent(fehlt)).toBe(1859)

    const zugesagt = nachlieferungSetzen(fehlt, '2026-08-14')
    expect(differenz(zugesagt).toString()).toBe('1')
    expect(mitNachlieferung(zugesagt)).toBe(true)
    expect(fehlbetragCent(zugesagt)).toBe(0)
  })

  it('fordert den Bruch auch bei zugesagter Nachlieferung', () => {
    // Was zerbrochen ankam, liefert niemand nach.
    const fehlt = mengeSetzen(zeile('6'), '4')
    const geteilt = { ...fehlt, abweichungen: mitBruch(fehlt, '1') }
    const zugesagt = nachlieferungSetzen(geteilt, '2026-08-14')
    expect(fehlbetragCent(zugesagt)).toBe(1859)
  })

  it('nimmt die Zusage wieder zurück', () => {
    const zugesagt = nachlieferungSetzen(mengeSetzen(zeile('6'), '5'), '2026-08-14')
    expect(fehlbetragCent(nachlieferungSetzen(zugesagt, null))).toBe(1859)
  })
})

describe('Preisabweichung', () => {
  it('erkennt einen zu hoch berechneten Gebindepreis', () => {
    // Stammpreis 18,59 je Kasten, Lieferschein sagt 19,59.
    const teurer = preisSetzen(zeile('6'), 1959)
    expect(preisabweichungCent(teurer)).toBe(100)
    expect(teurer.abweichungen).toEqual([
      { art: Abweichungsart.PREISABWEICHUNG, anzahlGebinde: '0' },
    ])
  })

  it('meldet nichts bei gleichem Preis', () => {
    expect(preisabweichungCent(preisSetzen(zeile('6'), 1859))).toBeNull()
  })

  it('vergleicht auch, wenn der Stammpreis je Einheit gilt', () => {
    // Wein: 8,90 EUR je Flasche, 6 je Karton -> 53,40 EUR je Gebinde.
    const wein = vorbelegt({
      id: 'p9',
      artikel: { ...kartonWeinOhnePreis, ekPreisCent: 890 },
      bestellt: null,
      lieferschein: '2',
    })
    expect(preisabweichungCent(preisSetzen(wein, 5340))).toBeNull()
    expect(preisabweichungCent(preisSetzen(wein, 5440))).toBe(100)
  })

  it('meldet nichts ohne Stammpreis — ohne Vergleichswert keine Abweichung', () => {
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '3',
    })
    expect(preisabweichungCent(preisSetzen(ohnePreis, 5000))).toBeNull()
  })

  it('sprengt die Stimmigkeitsrechnung nicht', () => {
    // Die Preisabweichung sagt nichts über die Menge. Zählte sie mit, müsste
    // die Maske Mengen erfinden, damit die Rechnung wieder aufgeht.
    const teurer = preisSetzen(zeile('6'), 1959)
    expect(aufgeschluesselt(teurer).toString()).toBe('0')
    expect(stimmig(teurer)).toBe(true)
  })

  it('rechnet Eingabetext und Cent ineinander um', () => {
    expect(centAusEingabe('18,59')).toBe(1859)
    expect(centAusEingabe('')).toBeNull()
    expect(centAusEingabe('-5')).toBeNull()
    expect(alsPreiseingabe(1859)).toBe('18,59')
    expect(alsPreiseingabe(null)).toBe('')
  })
})

describe('Ersatzartikel', () => {
  const fassKlein: WareneingangArtikel = {
    id: 'a3',
    name: 'Veltins',
    kategorie: 'Bier Fass',
    lieferGebindeText: '1 x 30,0',
    gebindeart: Gebindeart.FASS,
    einheitenProGebinde: 1,
    ekPreisCent: 7275,
    ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  }

  it('hält bestellten und gelieferten Artikel gleichzeitig fest', () => {
    const bestellt = zeile('2', '2')
    const ersetzt = artikelSetzen(bestellt, fassKlein)

    expect(ersetzt.artikel.name).toBe('Veltins')
    expect(ersetzt.bestellterArtikel?.name).toBe('Coca Cola')
    expect(istErsatzartikel(ersetzt)).toBe(true)
  })

  it('dokumentiert den Ersatz als Abweichung, ohne die Menge zu verfälschen', () => {
    const ersetzt = artikelSetzen(zeile('2', '2'), fassKlein)
    expect(ersetzt.abweichungen).toEqual([
      { art: Abweichungsart.FALSCHER_ARTIKEL, anzahlGebinde: '2' },
    ])
    expect(aufgeschluesselt(ersetzt).toString()).toBe('0')
    expect(stimmig(ersetzt)).toBe(true)
  })

  it('trägt Fehlmenge und Ersatz nebeneinander', () => {
    const ersetzt = artikelSetzen(zeile('2', '2'), fassKlein)
    const eineFehlt = mengeSetzen(ersetzt, '1')
    expect(eineFehlt.abweichungen).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' },
      { art: Abweichungsart.FALSCHER_ARTIKEL, anzahlGebinde: '1' },
    ])
    expect(stimmig(eineFehlt)).toBe(true)
  })

  it('kennt ohne Bestellung keinen Ersatzartikel', () => {
    // Ohne Bestellung gibt es nichts, wovon die Lieferung abweichen könnte.
    const ersetzt = artikelSetzen(zeile('2'), fassKlein)
    expect(istErsatzartikel(ersetzt)).toBe(false)
    expect(ersetzt.abweichungen).toEqual([])
  })

  it('bewertet die Fehlmenge nach dem gelieferten Artikel', () => {
    // Gerechnet wird mit dem, was auf der Palette steht — 72,75 EUR je Fass.
    const ersetzt = artikelSetzen(zeile('2', '2'), fassKlein)
    expect(fehlbetragCent(mengeSetzen(ersetzt, '1'))).toBe(7275)
  })
})

describe('Leergut', () => {
  const kaesten: Leergutzeile = {
    id: 'lg1',
    bezeichnung: 'Kasten 24er',
    lieferschein: '6',
    tatsaechlich: '6',
    pfandCentJeEinheit: 330,
  }

  it('ist stimmig, wenn so viel mitging wie gutgeschrieben', () => {
    expect(leergutDifferenz(kaesten).toString()).toBe('0')
    expect(leergutPfandCent(kaesten)).toBe(0)
  })

  it('rechnet fehlendes Leergut in Pfand um', () => {
    const zuWenig = { ...kaesten, tatsaechlich: '4' }
    expect(leergutDifferenz(zuWenig).toString()).toBe('2')
    expect(leergutPfandCent(zuWenig)).toBe(660)
  })

  it('kennt auch die Gegenrichtung', () => {
    const zuViel = { ...kaesten, tatsaechlich: '8' }
    expect(leergutPfandCent(zuViel)).toBe(-660)
  })

  it('gibt null statt 0 zurück, wenn kein Pfand hinterlegt ist', () => {
    expect(leergutPfandCent({ ...kaesten, tatsaechlich: '4', pfandCentJeEinheit: null })).toBeNull()
  })

  describe('leergutzustand', () => {
    it('kennt die vier Fassungen einer Zeile', () => {
      expect(leergutzustand(kaesten)).toBe('stimmt')
      expect(leergutzustand({ ...kaesten, tatsaechlich: '4' })).toBe('weniger')
      expect(leergutzustand({ ...kaesten, tatsaechlich: '8' })).toBe('mehr')
      expect(leergutzustand({ ...kaesten, bezeichnung: '' })).toBe('fehler')
    })

    it('lässt die leere neue Zeile ohne Befund', () => {
      // Ohne Menge sagt die namenlose Zeile nichts — erst eine Menge ohne
      // Bezeichnung ist nicht abrechenbar.
      expect(
        leergutzustand({ ...kaesten, bezeichnung: '  ', lieferschein: '0', tatsaechlich: '0' }),
      ).toBe('stimmt')
    })
  })

  describe('leerguttext', () => {
    it('schweigt, wo die Rückgabe stimmt', () => {
      expect(leerguttext(kaesten)).toBeNull()
    })

    it('nennt fehlendes Leergut samt Pfand', () => {
      expect(leerguttext({ ...kaesten, tatsaechlich: '4' })).toBe(
        '2 weniger zurück als gutgeschrieben · 6,60 EUR Pfand',
      )
      expect(leerguttext({ ...kaesten, tatsaechlich: '5' })).toBe(
        '1 weniger zurück als gutgeschrieben · 3,30 EUR Pfand',
      )
    })

    it('benennt das fehlende Pfand, statt 0,00 EUR zu behaupten', () => {
      expect(leerguttext({ ...kaesten, tatsaechlich: '4', pfandCentJeEinheit: null })).toBe(
        '2 weniger zurück als gutgeschrieben · Pfand nicht hinterlegt',
      )
    })

    it('nennt zu viel Zurückgegebenes ohne Betrag — es ist keine Forderung', () => {
      expect(leerguttext({ ...kaesten, tatsaechlich: '7' })).toBe(
        '1 mehr zurück, nicht auf dem Lieferschein',
      )
    })

    it('schickt die namenlose Zeile zurück in die Maske', () => {
      expect(leerguttext({ ...kaesten, bezeichnung: '' })).toBe(
        'Ohne Bezeichnung nicht abrechenbar — Zeile antippen',
      )
    })
  })

  describe('leergutzusammenfassung', () => {
    it('zählt nur Forderungen — "mehr zurück" mindert nichts', () => {
      const summe = leergutzusammenfassung([
        { ...kaesten, tatsaechlich: '4' }, // 6,60 EUR offen
        { ...kaesten, id: 'lg2', tatsaechlich: '8' }, // -6,60 EUR, keine Forderung
      ])
      expect(summe).toEqual({
        zeilen: 2,
        offenesPfandCent: 660,
        pfandUnbewertbar: 0,
        ohneBezeichnung: 0,
      })
    })

    it('führt fehlendes Leergut ohne Pfand als unbewertbar', () => {
      const summe = leergutzusammenfassung([
        { ...kaesten, tatsaechlich: '4', pfandCentJeEinheit: null },
      ])
      expect(summe.offenesPfandCent).toBe(0)
      expect(summe.pfandUnbewertbar).toBe(1)
    })

    it('zählt namenlose Zeilen für die Sperre des Fusses', () => {
      const summe = leergutzusammenfassung([kaesten, { ...kaesten, id: 'lg2', bezeichnung: '' }])
      expect(summe.ohneBezeichnung).toBe(1)
    })
  })
})

describe('Kopf und Fuss mit Leergut', () => {
  const kaesten: Leergutzeile = {
    id: 'lg1',
    bezeichnung: 'Kasten 24er',
    lieferschein: '6',
    tatsaechlich: '4',
    pfandCentJeEinheit: 330,
  }

  it('nennt das Leergut im Umfang des Kopfes', () => {
    const summe = zusammenfassung([zeile('6'), zeile('4'), zeile('2')])
    expect(umfangtext(summe, leergutzusammenfassung([kaesten, { ...kaesten, id: 'lg2' }]))).toBe(
      '3 Positionen · 2 Leergut',
    )
    expect(umfangtext(summe, leergutzusammenfassung([]))).toBe('3 Positionen')
    expect(umfangtext(zusammenfassung([zeile('6')]))).toBe('1 Position')
  })

  it('addiert das offene Pfand genau einmal zum Betrag', () => {
    const summe = zusammenfassung([mengeSetzen(zeile('6'), '5')])
    const leergut = leergutzusammenfassung([kaesten])
    // 18,59 EUR Ware + 6,60 EUR Pfand.
    expect(bilanztext(summe, leergut)).toBe('1 Abweichung · 25,19 EUR')
    expect(fehlbetragtext(summe, leergut)).toBe('25,19 EUR')
  })

  it('nennt das Leergut beim Namen, wenn nur dort Geld fehlt', () => {
    const summe = zusammenfassung([zeile('6')])
    expect(bilanztext(summe, leergutzusammenfassung([kaesten]))).toBe('Leergut · 6,60 EUR')
    expect(
      bilanztext(summe, leergutzusammenfassung([{ ...kaesten, pfandCentJeEinheit: null }])),
    ).toBe('Leergut · nicht bewertbar')
  })

  it('betont den Kopf nur, wo Geld fehlt', () => {
    const stimmt = zusammenfassung([zeile('6')])
    expect(bilanzbetont(stimmt, leergutzusammenfassung([kaesten]))).toBe(true)
    expect(bilanzbetont(zusammenfassung([mengeSetzen(zeile('6'), '5')]))).toBe(true)
    // Überlieferung und "mehr zurück" sind Fragen, keine Forderungen.
    expect(bilanzbetont(zusammenfassung([mengeSetzen(zeile('6'), '8')]))).toBe(false)
    expect(
      bilanzbetont(stimmt, leergutzusammenfassung([{ ...kaesten, tatsaechlich: '8' }])),
    ).toBe(false)
  })

  it('sperrt den Abschluss, solange eine Leergutzeile keine Bezeichnung trägt', () => {
    const summe = zusammenfassung([zeile('6')])
    expect(
      abschlussstand(summe, leergutzusammenfassung([{ ...kaesten, bezeichnung: '' }])),
    ).toEqual({ art: 'unerklaert', text: '1 Leergut ohne Bezeichnung' })
  })

  it('behauptet mit offenem Pfand kein "Alles stimmt"', () => {
    const summe = zusammenfassung([zeile('6')])
    expect(abschlussstand(summe, leergutzusammenfassung([kaesten]))).toEqual({
      art: 'abweichend',
      text: 'Wareneingang bestätigen · Leergut weicht ab',
    })
    expect(abschlussstand(summe, leergutzusammenfassung([{ ...kaesten, tatsaechlich: '6' }]))).toEqual({
      art: 'stimmig',
      text: 'Alles stimmt — Wareneingang bestätigen',
    })
  })
})

describe('zusammenfassung mit den Ausbaustufen', () => {
  it('zählt Zusagen, Preisabweichungen und Ersatzartikel getrennt', () => {
    const zugesagt = nachlieferungSetzen(mengeSetzen(zeile('6'), '5'), '2026-08-14')
    const teurer = preisSetzen(zeile('4'), 1959)
    const ergebnis = zusammenfassung([zugesagt, teurer, zeile('2')])

    expect(ergebnis.zugesagt).toBe(1)
    expect(ergebnis.preisabweichungen).toBe(1)
    expect(ergebnis.ersatzartikel).toBe(0)
    // Der zugesagte Rest steht nicht in der Forderung.
    expect(ergebnis.fehlbetragCent).toBe(0)
    expect(ergebnis.abweichende).toBe(1)
  })
})

describe('kontrollstand der Lieferungsübersicht', () => {
  const geprueft = new Date('2026-08-06T09:12:00Z')

  it('unterscheidet die angelegte von der erfassten Lieferung', () => {
    // Der Stand, der jede Auswertung verfälscht: angelegt, nie erfasst.
    expect(kontrollstand({ geprueftAm: null, positionen: 0, abweichungen: 0 })).toEqual({
      pruefung: 'ungeprüft',
      umfang: 'ohne Positionen',
      betont: false,
    })
    expect(kontrollstand({ geprueftAm: null, positionen: 3, abweichungen: 0 })).toEqual({
      pruefung: 'ungeprüft',
      umfang: '3 Positionen',
      betont: false,
    })
  })

  it('nennt bei der geprüften Lieferung die Abweichungen statt der Positionen', () => {
    expect(kontrollstand({ geprueftAm: geprueft, positionen: 3, abweichungen: 0 })).toEqual({
      pruefung: 'geprüft',
      umfang: '3 Positionen',
      betont: false,
    })
    expect(kontrollstand({ geprueftAm: geprueft, positionen: 3, abweichungen: 1 })).toEqual({
      pruefung: 'geprüft',
      umfang: '1 Abweichung',
      betont: true,
    })
    expect(kontrollstand({ geprueftAm: geprueft, positionen: 4, abweichungen: 3 })).toEqual({
      pruefung: 'geprüft',
      umfang: '3 Abweichungen',
      betont: true,
    })
  })

  it('zählt eine einzelne Position in der Einzahl', () => {
    expect(kontrollstand({ geprueftAm: null, positionen: 1, abweichungen: 0 }).umfang).toBe(
      '1 Position',
    )
  })

  it('schreibt nie „0 Positionen"', () => {
    // Eine Null wäre die Aussage "nachgesehen, es kam nichts" — die hat niemand
    // getroffen. Auch nicht an der geprüften Lieferung ohne Zeilen.
    expect(kontrollstand({ geprueftAm: geprueft, positionen: 0, abweichungen: 0 }).umfang).toBe(
      'ohne Positionen',
    )
  })

  it('färbt vor der Kontrolle nichts ein', () => {
    // Vor der Prüfung sagt die Zahl der Abweichungen nichts: es hat noch
    // niemand hingesehen.
    expect(kontrollstand({ geprueftAm: null, positionen: 3, abweichungen: 2 })).toEqual({
      pruefung: 'ungeprüft',
      umfang: '3 Positionen',
      betont: false,
    })
  })
})

describe('Erfassung am Lieferschein entlang', () => {
  /** Derselbe Kasten Cola, wie ihn die Erfassungsmaske bekommt: mit Literangabe. */
  const kastenColaMitLiter: ErfassungsArtikel = { ...kastenCola, einheitsgroesseLiter: '0.33' }

  const fassPils: ErfassungsArtikel = {
    id: 'a4',
    name: 'Stauder Pils 30 l',
    kategorie: 'Bier Fass',
    lieferGebindeText: 'Fass 30 l',
    gebindeart: Gebindeart.FASS,
    einheitenProGebinde: 1,
    einheitsgroesseLiter: '30',
    ekPreisCent: 9250,
    ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  }

  const einzelflasche: ErfassungsArtikel = {
    id: 'a5',
    name: 'Ramazzotti 0,7',
    kategorie: 'Spirituosen',
    lieferGebindeText: '1 x 0,7',
    gebindeart: Gebindeart.EINZELFLASCHE,
    einheitenProGebinde: 1,
    einheitsgroesseLiter: '0.7',
    ekPreisCent: null,
    ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  }

  function erfasst(artikel: ErfassungsArtikel, anzahl: string): ErfassungsPosition {
    return {
      ...vorbelegt({ id: `p-${artikel.id}`, artikel, bestellt: null, lieferschein: anzahl }),
      artikel,
    }
  }

  describe('einheitenzeile', () => {
    it('rechnet Kästen in Flaschen um', () => {
      expect(einheitenzeile(kastenColaMitLiter, '4')).toBe('= 96 Flaschen')
    })

    it('sagt die glatte Eins in der Einzahl', () => {
      expect(einheitenzeile(einzelflasche, '1')).toBe('= 1 Flasche')
    })

    it('sagt das Fass in Litern — sein Inhalt ist die abgeleitete Angabe', () => {
      expect(einheitenzeile(fassPils, '3')).toBe('= 90,0 Liter')
    })

    it('trägt auch das angebrochene Fass', () => {
      expect(einheitenzeile(fassPils, '0.5')).toBe('= 15,0 Liter')
    })
  })

  describe('positionswerttext', () => {
    it('bewertet über wertGebindeCent', () => {
      // 8 Kästen zu 18,59 EUR.
      expect(positionswerttext(kastenCola, '8')).toBe('= 148,72 EUR')
    })

    it('gibt null statt 0,00 EUR ohne hinterlegten Preis', () => {
      expect(positionswerttext(kartonWeinOhnePreis, '8')).toBeNull()
    })
  })

  describe('erfassungssumme und warenwerttext', () => {
    it('summiert die Menge laut Lieferschein und benennt Unbewertbares', () => {
      const summe = erfassungssumme([
        erfasst(kastenColaMitLiter, '4'), //  74,36 EUR
        erfasst(fassPils, '2'), //           185,00 EUR
        erfasst(einzelflasche, '6'), //      kein Preis
      ])
      expect(summe).toEqual({ positionen: 3, warenwertCent: 25936, unbewertbar: 1 })
      expect(warenwerttext(summe)).toBe('259,36 EUR')
    })

    it('behauptet keine 0,00 EUR, wenn alle Zeilen unbewertbar sind', () => {
      const summe = erfassungssumme([erfasst(einzelflasche, '6')])
      expect(warenwerttext(summe)).toBe('nicht bewertbar')
    })

    it('lässt die leere Erfassung bei 0,00 EUR beginnen', () => {
      // Ohne Zeile gibt es nichts Unbewertbares — die Null ist hier keine
      // Behauptung über Ware, sondern der Anfang der Summe.
      expect(warenwerttext(erfassungssumme([]))).toBe('0,00 EUR')
    })
  })
})

describe('fehlbetragsrolle', () => {
  it('färbt rot, wo wirklich Geld fehlt', () => {
    expect(fehlbetragsrolle(zusammenfassung([mengeSetzen(zeile('6'), '5')]))).toBe('danger')
  })

  it('färbt bernstein, wo die Forderung unbekannt ist', () => {
    // Dieselbe Lage, in der `fehlbetragtext` "nicht bewertbar" schreibt — Text
    // und Farbe derselben Zahl kommen aus derselben Summe.
    const ohnePreis = vorbelegt({
      id: 'p2',
      artikel: kartonWeinOhnePreis,
      bestellt: null,
      lieferschein: '2',
    })
    expect(fehlbetragsrolle(zusammenfassung([mengeSetzen(ohnePreis, '1')]))).toBe('attention')
  })

  it('bleibt neutral, wo nichts zu fordern ist', () => {
    expect(fehlbetragsrolle(zusammenfassung([zeile('6'), zeile('4')]))).toBe('neutral')
  })
})
