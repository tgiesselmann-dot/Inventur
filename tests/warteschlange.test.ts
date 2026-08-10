import { describe, expect, it } from 'vitest'

import {
  geaendert,
  istOffen,
  nachVersand,
  sammelStatus,
  statusText,
  vomServer,
  zusammenfuehren,
  zuSenden,
  type Eintrag,
} from '@/offline/warteschlange'

/** Die Pflichtfelder eines Serverwerts, ohne artikelId. */
const basis = {
  zaehlungId: 'z1',
  anzahlGebinde: '2',
  anzahlEinzeln: '0',
  gezaehltAm: '2026-08-07T19:30:00.000Z',
}

function eintrag(teil: Partial<Eintrag> & Pick<Eintrag, 'artikelId'>): Eintrag {
  return {
    zaehlungId: 'z1',
    anzahlGebinde: '2',
    anzahlEinzeln: '0',
    gezaehltAm: '2026-08-07T19:30:00.000Z',
    stand: 1,
    gesendeterStand: null,
    ...teil,
  }
}

describe('istOffen', () => {
  it('sieht einen nie gesendeten Eintrag als offen', () => {
    expect(istOffen(eintrag({ artikelId: 'a', stand: 1, gesendeterStand: null }))).toBe(true)
  })

  it('sieht einen bestätigten Eintrag als erledigt', () => {
    expect(istOffen(eintrag({ artikelId: 'a', stand: 3, gesendeterStand: 3 }))).toBe(false)
  })

  it('sieht einen nach dem Versand geänderten Eintrag wieder als offen', () => {
    expect(istOffen(eintrag({ artikelId: 'a', stand: 4, gesendeterStand: 3 }))).toBe(true)
  })
})

describe('zuSenden', () => {
  it('nimmt nur die offenen Einträge und merkt sich deren Stand', () => {
    const stapel = zuSenden([
      eintrag({ artikelId: 'offen', stand: 2, gesendeterStand: null }),
      eintrag({ artikelId: 'fertig', stand: 1, gesendeterStand: 1 }),
    ])

    expect(stapel.nutzlast.map((n) => n.artikelId)).toEqual(['offen'])
    expect(stapel.staende.get('offen')).toBe(2)
  })

  it('schickt die Zählzeit mit, nicht die Versandzeit', () => {
    // Ein Wert, der drei Stunden im Flugmodus lag, ist am Abend gezählt worden
    // und nicht in dem Moment, in dem das Netz wiederkam.
    const stapel = zuSenden([
      eintrag({ artikelId: 'a', gezaehltAm: '2026-08-07T19:30:00.000Z' }),
    ])
    expect(stapel.nutzlast[0].gezaehltAm).toBe('2026-08-07T19:30:00.000Z')
  })

  it('gibt bei nichts Offenem einen leeren Stapel', () => {
    const stapel = zuSenden([eintrag({ artikelId: 'a', stand: 1, gesendeterStand: 1 })])
    expect(stapel.nutzlast).toEqual([])
  })
})

describe('nachVersand', () => {
  it('markiert die bestätigten Einträge als erledigt', () => {
    const nachher = nachVersand(
      [eintrag({ artikelId: 'a', stand: 2, gesendeterStand: null })],
      new Map([['a', 2]]),
    )
    expect(istOffen(nachher[0])).toBe(false)
  })

  it('lässt einen während des Versands geänderten Wert offen', () => {
    // Der Kern der Sache: gesendet wurde Stand 2, inzwischen steht lokal 3.
    // Würde die Bestätigung den Eintrag schliessen, bliebe die Korrektur für
    // immer auf dem Gerät liegen.
    const nachher = nachVersand(
      [eintrag({ artikelId: 'a', stand: 3, gesendeterStand: null })],
      new Map([['a', 2]]),
    )
    expect(istOffen(nachher[0])).toBe(true)
    expect(nachher[0].gesendeterStand).toBe(2)
  })

  it('rührt Einträge nicht an, die nicht im Versand waren', () => {
    const vorher = [eintrag({ artikelId: 'b', stand: 5, gesendeterStand: null })]
    expect(nachVersand(vorher, new Map([['a', 2]]))[0]).toBe(vorher[0])
  })

  it('setzt einen bestätigten Stand nie zurück', () => {
    // Eine verspätet eintreffende Antwort eines älteren Versands darf einen
    // neueren Stand nicht überschreiben.
    const nachher = nachVersand(
      [eintrag({ artikelId: 'a', stand: 5, gesendeterStand: 4 })],
      new Map([['a', 2]]),
    )
    expect(nachher[0].gesendeterStand).toBe(4)
  })
})

describe('geaendert', () => {
  const jetzt = new Date('2026-08-07T19:30:00.000Z')

  it('legt einen neuen Eintrag mit Stand 1 an', () => {
    const neu = geaendert(
      undefined,
      { zaehlungId: 'z1', artikelId: 'a', anzahlGebinde: '2', anzahlEinzeln: '5' },
      jetzt,
    )
    expect(neu.stand).toBe(1)
    expect(neu.gesendeterStand).toBeNull()
    expect(neu.gezaehltAm).toBe('2026-08-07T19:30:00.000Z')
  })

  it('zählt den Stand hoch und öffnet einen erledigten Eintrag wieder', () => {
    const vorher = eintrag({ artikelId: 'a', stand: 3, gesendeterStand: 3 })
    const neu = geaendert(
      vorher,
      { zaehlungId: 'z1', artikelId: 'a', anzahlGebinde: '4', anzahlEinzeln: '0' },
      jetzt,
    )
    expect(neu.stand).toBe(4)
    expect(istOffen(neu)).toBe(true)
  })
})

describe('zusammenfuehren', () => {
  it('lässt den lokalen Wert gewinnen', () => {
    // Das Gerät ist die Quelle der Zählung: der Wert liegt hier, bevor der
    // Server ihn je sieht.
    const zusammen = zusammenfuehren(
      [eintrag({ artikelId: 'a', anzahlGebinde: '9', stand: 2, gesendeterStand: null })],
      [vomServer({ ...basis, artikelId: 'a', anzahlGebinde: '2' })],
    )
    expect(zusammen).toHaveLength(1)
    expect(zusammen[0].anzahlGebinde).toBe('9')
  })

  it('übernimmt Serverwerte, zu denen lokal nichts liegt', () => {
    // Der Fall neues Handy oder geleerte Website-Daten: ohne das stünde eine
    // halb fertige Zählung wieder auf null.
    const zusammen = zusammenfuehren([], [vomServer({ ...basis, artikelId: 'b' })])
    expect(zusammen.map((e) => e.artikelId)).toEqual(['b'])
    expect(istOffen(zusammen[0])).toBe(false)
  })

  it('sieht einen reinen Serverwert nicht als offen an', () => {
    expect(istOffen(vomServer({ ...basis, artikelId: 'b' }))).toBe(false)
  })
})

describe('sammelStatus', () => {
  const offen = eintrag({ artikelId: 'a', stand: 1, gesendeterStand: null })
  const fertig = eintrag({ artikelId: 'b', stand: 1, gesendeterStand: 1 })

  it('meldet "gespeichert", wenn nichts aussteht', () => {
    expect(sammelStatus([fertig], false)).toEqual({ art: 'gespeichert' })
  })

  it('meldet "gespeichert" auch offline, wenn alles angekommen ist', () => {
    // Kein Netz ist für sich genommen kein Grund zur Beunruhigung.
    expect(sammelStatus([fertig], true)).toEqual({ art: 'gespeichert' })
  })

  it('meldet Wartende nur, wenn wirklich kein Netz da ist', () => {
    expect(sammelStatus([offen, fertig], true)).toEqual({ art: 'wartet', offen: 1 })
  })

  it('meldet bei vorhandenem Netz kein Warten auf Netz', () => {
    // Zwischen Tastendruck und Versand liegen ein paar hundert Millisekunden.
    // Dort "wartet auf Netz" anzuzeigen, wäre eine Falschmeldung über etwas,
    // das der Zähler ohnehin nicht beheben könnte.
    expect(sammelStatus([offen], false)).toEqual({ art: 'sendet', offen: 1 })
  })

  it('meldet eine Ablehnung des Servers vor allem anderen', () => {
    // Auch offline: die Ablehnung war eine Antwort, kein Funkloch — diese
    // Werte kommen von allein nicht mehr an.
    expect(sammelStatus([offen], false, 'abgelehnt')).toEqual({ art: 'abgelehnt', offen: 1 })
    expect(sammelStatus([offen], true, 'abgelehnt')).toEqual({ art: 'abgelehnt', offen: 1 })
  })

  it('hält die abgelaufene Anmeldung von der Ablehnung getrennt', () => {
    // Zwei verschiedene Handlungen: gegen eine Ablehnung hilft "Erneut", gegen
    // eine abgelaufene Sitzung nur eine neue Anmeldung.
    expect(sammelStatus([offen], false, 'abgemeldet')).toEqual({ art: 'abgemeldet', offen: 1 })
    expect(sammelStatus([offen], true, 'abgemeldet')).toEqual({ art: 'abgemeldet', offen: 1 })
  })

  it('lässt eine alte Ablehnung fallen, sobald nichts mehr aussteht', () => {
    expect(sammelStatus([fertig], false, 'abgelehnt')).toEqual({ art: 'gespeichert' })
    expect(sammelStatus([fertig], false, 'abgemeldet')).toEqual({ art: 'gespeichert' })
  })
})

describe('statusText', () => {
  it('formuliert den Einzelfall im Singular', () => {
    expect(statusText({ art: 'wartet', offen: 1 })).toBe('1 Wert wartet auf Netz')
    expect(statusText({ art: 'wartet', offen: 3 })).toBe('3 Werte warten auf Netz')
  })

  it('benennt die Ablehnung samt Umfang', () => {
    expect(statusText({ art: 'abgelehnt', offen: 1 })).toBe(
      'Übertragung fehlgeschlagen · 1 Wert offen',
    )
    expect(statusText({ art: 'abgelehnt', offen: 4 })).toBe(
      'Übertragung fehlgeschlagen · 4 Werte offen',
    )
  })

  it('sagt bei abgelaufener Anmeldung, dass die Werte im Gerät liegen', () => {
    // Kein „fehlgeschlagen": nichts ist kaputt und nichts ist weg. Wer im Lager
    // liest, dass die Übertragung fehlschlug, hält seinen Abend für verloren.
    expect(statusText({ art: 'abgemeldet', offen: 1 })).toBe(
      'Anmeldung abgelaufen · 1 Wert liegt im Gerät',
    )
    expect(statusText({ art: 'abgemeldet', offen: 7 })).toBe(
      'Anmeldung abgelaufen · 7 Werte liegen im Gerät',
    )
  })
})
