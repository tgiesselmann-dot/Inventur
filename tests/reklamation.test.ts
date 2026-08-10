import { describe, expect, it } from 'vitest'

import { Abweichungsart, Abweichungsstatus, EkPreisBezug, Gebindeart } from '@/generated/prisma/enums'
import {
  alsProzent,
  alterInTagen,
  artenzaehlung,
  artrolle,
  arttext,
  fristUeberschritten,
  gutschriftdifferenzCent,
  istAktiv,
  lieferantenuebersicht,
  mengensatz,
  mengentext,
  naechsterSchritt,
  offeneUebersicht,
  prozentzahl,
  quotenstufe,
  rechenzeile,
  reklamationsbetragCent,
  reklamationssummetext,
  REKLAMATIONSFRIST_TAGE,
  statusstufe,
  statustext,
  STATUSSTUFEN,
  type Reklamationsartikel,
  type Vorgang,
} from '@/lib/reklamation'

/** Ein Fass mit hinterlegtem Gebindepreis von 85,00 EUR. */
const FASS: Reklamationsartikel = {
  ekPreisCent: 8500,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  einheitenProGebinde: 1,
  gebindeart: Gebindeart.FASS,
}

/** Ein 24er-Kasten, hinterlegt je Einheit zu 75 Cent — 18,00 EUR je Kasten. */
const KASTEN: Reklamationsartikel = {
  ekPreisCent: 75,
  ekPreisBezug: EkPreisBezug.PRO_EINHEIT,
  einheitenProGebinde: 24,
  gebindeart: Gebindeart.KASTEN,
}

const OHNE_PREIS: Reklamationsartikel = {
  ekPreisCent: null,
  ekPreisBezug: EkPreisBezug.PRO_GEBINDE,
  einheitenProGebinde: 1,
  gebindeart: Gebindeart.FASS,
}

function vorgang(werte: Partial<Vorgang> & Pick<Vorgang, 'art'>): Vorgang {
  return {
    anzahlGebinde: '2',
    anzahlGebindeLieferschein: '8',
    ekPreisCentLieferschein: null,
    artikel: FASS,
    ...werte,
  }
}

describe('Alter und Frist', () => {
  const jetzt = new Date('2026-08-08T06:30:00Z')

  it('zählt Kalendertage seit der Feststellung', () => {
    expect(alterInTagen(new Date('2026-08-08T05:00:00Z'), jetzt)).toBe(0)
    expect(alterInTagen(new Date('2026-07-15T06:41:00Z'), jetzt)).toBe(24)
  })

  it('macht aus gestern Abend am Morgen danach 1 Tag, nicht 0', () => {
    // Was an der Rampe auffiel, wird am nächsten Morgen abgearbeitet — da
    // wäre "0 T" die Auskunft, es sei von heute.
    expect(alterInTagen(new Date('2026-08-07T18:00:00Z'), jetzt)).toBe(1)
  })

  it('zählt den Tageswechsel in der Zeit des Betriebs, nicht in UTC', () => {
    // 22:30 UTC am 7. ist in Recklinghausen schon der 8. — also heute, 0 Tage.
    expect(alterInTagen(new Date('2026-08-07T22:30:00Z'), jetzt)).toBe(0)
  })

  it('macht aus einer Feststellung in der Zukunft kein negatives Alter', () => {
    expect(alterInTagen(new Date('2026-08-09T06:00:00Z'), jetzt)).toBe(0)
  })

  it('lässt die Frist am vierzehnten Tag noch laufen und danach nicht mehr', () => {
    expect(fristUeberschritten(REKLAMATIONSFRIST_TAGE)).toBe(false)
    expect(fristUeberschritten(REKLAMATIONSFRIST_TAGE + 1)).toBe(true)
  })
})

describe('Statusfolge', () => {
  it('füllt die Segmente entlang des Weges', () => {
    expect(statusstufe(Abweichungsstatus.OFFEN)).toBe(1)
    expect(statusstufe(Abweichungsstatus.REKLAMIERT)).toBe(2)
    expect(statusstufe(Abweichungsstatus.GUTSCHRIFT_ERWARTET)).toBe(3)
    expect(statusstufe(Abweichungsstatus.ERLEDIGT)).toBe(STATUSSTUFEN)
  })

  it('lässt bei verworfen alle Segmente leer', () => {
    // Verworfen ist das Verlassen des Weges, kein Schritt darauf.
    expect(statusstufe(Abweichungsstatus.VERWORFEN)).toBe(0)
  })

  it('nennt jeden Status beim Wort der Oberfläche', () => {
    expect(statustext(Abweichungsstatus.OFFEN)).toBe('offen')
    expect(statustext(Abweichungsstatus.GUTSCHRIFT_ERWARTET)).toBe('Gutschrift erwartet')
    expect(statustext(Abweichungsstatus.VERWORFEN)).toBe('verworfen')
  })

  it('kennt die aktiven Status', () => {
    expect(istAktiv(Abweichungsstatus.OFFEN)).toBe(true)
    expect(istAktiv(Abweichungsstatus.GUTSCHRIFT_ERWARTET)).toBe(true)
    expect(istAktiv(Abweichungsstatus.ERLEDIGT)).toBe(false)
    expect(istAktiv(Abweichungsstatus.VERWORFEN)).toBe(false)
  })

  it('führt den Weg über reklamiert zur erwarteten Gutschrift', () => {
    expect(naechsterSchritt(Abweichungsstatus.OFFEN)).toBe(Abweichungsstatus.REKLAMIERT)
    expect(naechsterSchritt(Abweichungsstatus.REKLAMIERT)).toBe(
      Abweichungsstatus.GUTSCHRIFT_ERWARTET,
    )
  })

  it('bietet ab "Gutschrift erwartet" keinen Statussprung mehr an', () => {
    // Erledigt wird ein Vorgang über die eingetragene Gutschrift, nicht über
    // eine Taste, die Erledigung behauptet.
    expect(naechsterSchritt(Abweichungsstatus.GUTSCHRIFT_ERWARTET)).toBeNull()
    expect(naechsterSchritt(Abweichungsstatus.ERLEDIGT)).toBeNull()
    expect(naechsterSchritt(Abweichungsstatus.VERWORFEN)).toBeNull()
  })
})

describe('Arten', () => {
  it('nennt den falschen Artikel Ersatzartikel, ohne Urteil', () => {
    expect(arttext(Abweichungsart.FALSCHER_ARTIKEL)).toBe('Ersatzartikel')
  })

  it('trägt je Art ihre Rolle', () => {
    expect(artrolle(Abweichungsart.FEHLMENGE)).toBe('danger')
    expect(artrolle(Abweichungsart.BRUCH)).toBe('attention')
    expect(artrolle(Abweichungsart.UEBERLIEFERUNG)).toBe('primary')
    expect(artrolle(Abweichungsart.PREISABWEICHUNG)).toBe('preis')
    expect(artrolle(Abweichungsart.FALSCHER_ARTIKEL)).toBe('neutral')
  })
})

describe('mengentext', () => {
  it('gibt der Fehlmenge ihr Minus und der Überlieferung ihr Plus', () => {
    expect(mengentext(vorgang({ art: Abweichungsart.FEHLMENGE }))).toBe('−2 Fässer')
    expect(
      mengentext(vorgang({ art: Abweichungsart.UEBERLIEFERUNG, anzahlGebinde: '4', artikel: KASTEN })),
    ).toBe('+4 Kästen')
  })

  it('lässt Bruch und Ersatzartikel ohne Vorzeichen', () => {
    expect(mengentext(vorgang({ art: Abweichungsart.BRUCH, anzahlGebinde: '3', artikel: KASTEN }))).toBe(
      '3 Kästen',
    )
    expect(mengentext(vorgang({ art: Abweichungsart.FALSCHER_ARTIKEL }))).toBe('2 Fässer')
  })

  it('nimmt bei der Preisabweichung die Menge laut Lieferschein', () => {
    // Ihre anzahlGebinde ist 0 — abgewichen ist der Preis, nicht die Menge.
    expect(
      mengentext(
        vorgang({
          art: Abweichungsart.PREISABWEICHUNG,
          anzahlGebinde: '0',
          anzahlGebindeLieferschein: '18',
          artikel: KASTEN,
        }),
      ),
    ).toBe('18 Kästen')
  })
})

describe('reklamationsbetragCent', () => {
  it('bewertet zum Preis laut Lieferschein, wenn er erfasst ist', () => {
    expect(
      reklamationsbetragCent(
        vorgang({ art: Abweichungsart.FEHLMENGE, ekPreisCentLieferschein: 8920 }),
      ),
    ).toBe(17840)
  })

  it('springt ohne Lieferscheinpreis auf den hinterlegten Preis', () => {
    expect(reklamationsbetragCent(vorgang({ art: Abweichungsart.FEHLMENGE }))).toBe(17000)
    // Auch je Einheit hinterlegte Preise kommen über wertGebindeCent aufs Gebinde.
    expect(
      reklamationsbetragCent(
        vorgang({ art: Abweichungsart.BRUCH, anzahlGebinde: '3', artikel: KASTEN }),
      ),
    ).toBe(5400)
  })

  it('rundet krumme Mengen kaufmännisch', () => {
    expect(
      reklamationsbetragCent(
        vorgang({ art: Abweichungsart.FEHLMENGE, anzahlGebinde: '0.5', ekPreisCentLieferschein: 8919 }),
      ),
    ).toBe(4460)
  })

  it('ist ohne jeden Preis nicht bewertbar — null, nicht 0', () => {
    expect(
      reklamationsbetragCent(vorgang({ art: Abweichungsart.FEHLMENGE, artikel: OHNE_PREIS })),
    ).toBeNull()
  })

  it('kennt beim Ersatzartikel keinen Warenwert', () => {
    expect(
      reklamationsbetragCent(
        vorgang({ art: Abweichungsart.FALSCHER_ARTIKEL, ekPreisCentLieferschein: 8920 }),
      ),
    ).toBeNull()
  })

  it('rechnet die Preisabweichung über die Menge laut Lieferschein', () => {
    // 19,80 statt 18,00 je Kasten, 18 Kästen: 1,80 × 18 = 32,40 EUR.
    expect(
      reklamationsbetragCent(
        vorgang({
          art: Abweichungsart.PREISABWEICHUNG,
          anzahlGebinde: '0',
          anzahlGebindeLieferschein: '18',
          ekPreisCentLieferschein: 1980,
          artikel: KASTEN,
        }),
      ),
    ).toBe(3240)
  })

  it('nimmt eine zu billige Preisabweichung als Betrag, nicht als Minus', () => {
    expect(
      reklamationsbetragCent(
        vorgang({
          art: Abweichungsart.PREISABWEICHUNG,
          anzahlGebinde: '0',
          anzahlGebindeLieferschein: '10',
          ekPreisCentLieferschein: 1750,
          artikel: KASTEN,
        }),
      ),
    ).toBe(500)
  })

  it('lässt eine Preisabweichung ohne Vergleichspreis unbewertet', () => {
    expect(
      reklamationsbetragCent(
        vorgang({
          art: Abweichungsart.PREISABWEICHUNG,
          anzahlGebinde: '0',
          ekPreisCentLieferschein: 1980,
          artikel: OHNE_PREIS,
        }),
      ),
    ).toBeNull()
  })
})

describe('rechenzeile', () => {
  it('zeigt die Rechnung zum Lieferscheinpreis', () => {
    expect(
      rechenzeile(vorgang({ art: Abweichungsart.FEHLMENGE, ekPreisCentLieferschein: 8920 })),
    ).toBe('2 Fässer × 89,20 EUR · Preis laut Lieferschein')
  })

  it('benennt den hinterlegten Preis als Ersatzquelle', () => {
    expect(rechenzeile(vorgang({ art: Abweichungsart.FEHLMENGE }))).toBe(
      '2 Fässer × 85,00 EUR · hinterlegter Preis',
    )
  })

  it('schreibt bei der Preisabweichung den Unterschied je Gebinde', () => {
    expect(
      rechenzeile(
        vorgang({
          art: Abweichungsart.PREISABWEICHUNG,
          anzahlGebinde: '0',
          anzahlGebindeLieferschein: '18',
          ekPreisCentLieferschein: 1980,
          artikel: KASTEN,
        }),
      ),
    ).toBe('18 Kästen × 1,80 EUR zu viel je Kasten')
  })

  it('bleibt leer, wo es keinen Betrag gibt', () => {
    expect(rechenzeile(vorgang({ art: Abweichungsart.FALSCHER_ARTIKEL }))).toBeNull()
    expect(
      rechenzeile(vorgang({ art: Abweichungsart.FEHLMENGE, artikel: OHNE_PREIS })),
    ).toBeNull()
  })
})

describe('mengensatz', () => {
  it('beugt das Verb nach der Menge', () => {
    expect(mengensatz(vorgang({ art: Abweichungsart.FEHLMENGE }), '8')).toBe(
      '2 Fässer fehlen gegenüber dem Lieferschein. Bestellung und Lieferschein stimmen überein.',
    )
    expect(mengensatz(vorgang({ art: Abweichungsart.FEHLMENGE, anzahlGebinde: '1' }), '8')).toBe(
      '1 Fass fehlt gegenüber dem Lieferschein. Bestellung und Lieferschein stimmen überein.',
    )
  })

  it('vergleicht Bestellung und Lieferschein als Zahl, nicht als Text', () => {
    expect(mengensatz(vorgang({ art: Abweichungsart.FEHLMENGE }), '8.00')).toContain(
      'stimmen überein',
    )
    expect(mengensatz(vorgang({ art: Abweichungsart.FEHLMENGE }), '10')).toContain(
      'weichen voneinander ab',
    )
  })

  it('sagt ohne Bestellbezug genau das', () => {
    expect(mengensatz(vorgang({ art: Abweichungsart.BRUCH }), null)).toBe(
      '2 Fässer unbrauchbar angekommen. Ohne Bestellbezug.',
    )
  })

  it('erklärt die Preisabweichung ohne erfundene Menge', () => {
    expect(
      mengensatz(
        vorgang({ art: Abweichungsart.PREISABWEICHUNG, anzahlGebinde: '0' }),
        '8',
      ),
    ).toBe('Die Menge stimmt — abgewichen ist der Preis. Bestellung und Lieferschein stimmen überein.')
  })
})

describe('gutschriftdifferenzCent', () => {
  it('zeigt die Differenz erst, wenn beide Seiten da sind', () => {
    expect(gutschriftdifferenzCent(null, 17840)).toBeNull()
    expect(gutschriftdifferenzCent(17840, null)).toBeNull()
  })

  it('rechnet Gutschrift minus gerechneten Betrag', () => {
    expect(gutschriftdifferenzCent(17840, 17840)).toBe(0)
    expect(gutschriftdifferenzCent(17840, 16000)).toBe(-1840)
    expect(gutschriftdifferenzCent(17840, 18000)).toBe(160)
  })
})

describe('offeneUebersicht', () => {
  const eintraege = [
    { status: Abweichungsstatus.OFFEN, betragCent: 17840, alterTage: 24 },
    { status: Abweichungsstatus.OFFEN, betragCent: null, alterTage: 12 },
    { status: Abweichungsstatus.REKLAMIERT, betragCent: 9420, alterTage: 9 },
    { status: Abweichungsstatus.GUTSCHRIFT_ERWARTET, betragCent: 4170, alterTage: 19 },
    { status: Abweichungsstatus.ERLEDIGT, betragCent: 99999, alterTage: 30 },
    { status: Abweichungsstatus.VERWORFEN, betragCent: 1740, alterTage: 11 },
  ]

  it('summiert nur aktive, bewertbare Vorgänge', () => {
    const uebersicht = offeneUebersicht(eintraege)
    expect(uebersicht.summeCent).toBe(31430)
    expect(uebersicht.anzahl).toBe(4)
    expect(uebersicht.nichtBewertbar).toBe(1)
  })

  it('nennt den ältesten aktiven Vorgang, nicht den ältesten überhaupt', () => {
    // Der erledigte 30-Tage-Vorgang drängt niemanden mehr.
    expect(offeneUebersicht(eintraege).aeltesterTage).toBe(24)
  })

  it('zählt je Status in Wegreihenfolge und lässt leere Status weg', () => {
    expect(offeneUebersicht(eintraege).jeStatus).toEqual([
      { status: Abweichungsstatus.OFFEN, anzahl: 2 },
      { status: Abweichungsstatus.REKLAMIERT, anzahl: 1 },
      { status: Abweichungsstatus.GUTSCHRIFT_ERWARTET, anzahl: 1 },
    ])
    expect(
      offeneUebersicht([{ status: Abweichungsstatus.OFFEN, betragCent: 100, alterTage: 1 }]).jeStatus,
    ).toEqual([{ status: Abweichungsstatus.OFFEN, anzahl: 1 }])
  })

  it('bleibt bei leerer Liste bei null statt −Infinity', () => {
    expect(offeneUebersicht([]).aeltesterTage).toBeNull()
  })
})

describe('artenzaehlung', () => {
  it('zählt je Art und stellt die häufigste nach vorn', () => {
    const arten = [
      Abweichungsart.FEHLMENGE,
      Abweichungsart.BRUCH,
      Abweichungsart.FEHLMENGE,
      Abweichungsart.PREISABWEICHUNG,
      Abweichungsart.FEHLMENGE,
      Abweichungsart.BRUCH,
    ]
    expect(artenzaehlung(arten)).toEqual([
      { art: Abweichungsart.FEHLMENGE, anzahl: 3 },
      { art: Abweichungsart.BRUCH, anzahl: 2 },
      { art: Abweichungsart.PREISABWEICHUNG, anzahl: 1 },
    ])
  })

  it('führt keine Nullzeilen', () => {
    expect(artenzaehlung([])).toEqual([])
  })
})

describe('lieferantenuebersicht', () => {
  const ohneAbweichung = { geprueft: true, abweichungen: [] }

  it('zählt Lieferungen und rechnet die Quote nur über beurteilte', () => {
    const zeilen = lieferantenuebersicht([
      { lieferant: 'Dörlemann', ...ohneAbweichung },
      {
        lieferant: 'Dörlemann',
        geprueft: true,
        abweichungen: [{ status: Abweichungsstatus.OFFEN, betragCent: 17840 }],
      },
      // Ungeprüft ohne Befund: zählt als Lieferung, aber nicht in die Quote —
      // sonst schönte liegen gebliebene Kontrolle die Statistik.
      { lieferant: 'Dörlemann', geprueft: false, abweichungen: [] },
    ])
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0].lieferungen).toBe(3)
    expect(zeilen[0].beurteilt).toBe(2)
    expect(zeilen[0].fehlerfreiAnteil).toBe(0.5)
    expect(zeilen[0].summeCent).toBe(17840)
  })

  it('zählt eine ungeprüfte Lieferung mit Abweichungen als fehlerhaft', () => {
    // Die Kontrolle mag offen sein, ihr Befund ist es nicht — sonst stünde
    // neben "100 % fehlerfrei" eine Abweichungssumme aus denselben Lieferungen.
    const zeilen = lieferantenuebersicht([
      { lieferant: 'Dörlemann', ...ohneAbweichung },
      {
        lieferant: 'Dörlemann',
        geprueft: false,
        abweichungen: [{ status: Abweichungsstatus.OFFEN, betragCent: 17840 }],
      },
    ])
    expect(zeilen[0].beurteilt).toBe(2)
    expect(zeilen[0].fehlerfreiAnteil).toBe(0.5)
  })

  it('rechnet Verworfenes keinem Lieferanten zu', () => {
    const zeilen = lieferantenuebersicht([
      {
        lieferant: 'Sinalco',
        geprueft: true,
        abweichungen: [{ status: Abweichungsstatus.VERWORFEN, betragCent: 1740 }],
      },
    ])
    // Der eigene Zählfehler macht die Lieferung nicht fehlerhaft.
    expect(zeilen[0].fehlerfreiAnteil).toBe(1)
    expect(zeilen[0].summeCent).toBe(0)
  })

  it('zählt Unbewertbares aus, statt es mit 0 zu addieren', () => {
    const zeilen = lieferantenuebersicht([
      {
        lieferant: 'Krombacher',
        geprueft: true,
        abweichungen: [
          { status: Abweichungsstatus.OFFEN, betragCent: null },
          { status: Abweichungsstatus.OFFEN, betragCent: 3880 },
        ],
      },
    ])
    expect(zeilen[0].summeCent).toBe(3880)
    expect(zeilen[0].nichtBewertbar).toBe(1)
  })

  it('stellt die schlechteste Quote nach oben', () => {
    const zeilen = lieferantenuebersicht([
      { lieferant: 'Gut', ...ohneAbweichung },
      {
        lieferant: 'Schlecht',
        geprueft: true,
        abweichungen: [{ status: Abweichungsstatus.OFFEN, betragCent: 100 }],
      },
      { lieferant: 'Schlecht', ...ohneAbweichung },
      { lieferant: 'Ungeprüft', geprueft: false, abweichungen: [] },
    ])
    expect(zeilen.map((zeile) => zeile.lieferant)).toEqual(['Schlecht', 'Gut', 'Ungeprüft'])
    // Ohne geprüfte Lieferung gibt es keine Quote — sie steht hinten, nicht
    // mit 100 % vorn.
    expect(zeilen[2].fehlerfreiAnteil).toBeNull()
  })
})

describe('Quote als Anzeige', () => {
  it('stuft die Quote in drei Rollen', () => {
    expect(quotenstufe(0.8)).toBe('confirm')
    expect(quotenstufe(0.79)).toBe('attention')
    expect(quotenstufe(0.7)).toBe('attention')
    expect(quotenstufe(0.69)).toBe('danger')
  })

  it('schreibt ganze Prozent', () => {
    expect(alsProzent(2 / 3)).toBe('67 %')
    expect(alsProzent(1)).toBe('100 %')
  })
})

describe('prozentzahl', () => {
  it('rundet auf ganze Prozent — dieselbe Rundung wie alsProzent', () => {
    // Balkenbreite und Zahl daneben kommen aus derselben Stelle.
    expect(prozentzahl(0.667)).toBe(67)
    expect(alsProzent(0.667)).toBe('67 %')
    expect(prozentzahl(1)).toBe(100)
  })
})

describe('reklamationssummetext', () => {
  it('nennt den offenen Betrag', () => {
    expect(reklamationssummetext({ summeCent: 1859, nichtBewertbar: 0 })).toBe('18,59 EUR')
    // Der bewertbare Teil steht auch dann da, wenn daneben Unbewertbares liegt.
    expect(reklamationssummetext({ summeCent: 1859, nichtBewertbar: 2 })).toBe('18,59 EUR')
  })

  it('sagt 0,00 EUR nur, wo wirklich nichts offen ist', () => {
    expect(reklamationssummetext({ summeCent: 0, nichtBewertbar: 0 })).toBe('0,00 EUR')
  })

  it('behauptet keine 0,00 EUR hinter lauter unbewertbaren Vorgängen', () => {
    expect(reklamationssummetext({ summeCent: 0, nichtBewertbar: 2 })).toBe('nicht bewertbar')
  })
})
