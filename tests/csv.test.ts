import { describe, expect, it } from 'vitest'

import { alsCsv, dekodiereCsv, deutscheZahl, parseCsv, parseCsvMitKopf } from '@/lib/csv'

describe('parseCsv', () => {
  it('zerlegt Felder am Semikolon', () => {
    expect(parseCsv('a;b;c')).toEqual([['a', 'b', 'c']])
  })

  it('entfernt ein BOM am Dateianfang', () => {
    // Excel schreibt es, und ohne diese Zeile hiesse die erste Spalte
    // "﻿kategorie" statt "kategorie".
    expect(parseCsv('﻿kategorie;name')).toEqual([['kategorie', 'name']])
  })

  it('behandelt CRLF wie LF', () => {
    expect(parseCsv('a;b\r\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('lässt Trenner innerhalb von Anführungszeichen stehen', () => {
    // Genau der Fall der pruefen-Spalte: "Flaschengroesse 0,75 angenommen;
    // Differenzformel korrigieren".
    expect(parseCsv('a;"eins; zwei";c')).toEqual([['a', 'eins; zwei', 'c']])
  })

  it('nimmt Zeilenumbrüche innerhalb von Anführungszeichen auf', () => {
    expect(parseCsv('a;"zeile1\nzeile2";c')).toEqual([['a', 'zeile1\nzeile2', 'c']])
  })

  it('liest verdoppelte Anführungszeichen als eines', () => {
    expect(parseCsv('a;"sagt ""hallo""";c')).toEqual([['a', 'sagt "hallo"', 'c']])
  })

  it('behält leere Felder', () => {
    expect(parseCsv('a;;c')).toEqual([['a', '', 'c']])
  })

  it('verwirft Leerzeilen und den Zeilenrest am Dateiende', () => {
    expect(parseCsv('a;b\n\nc;d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('kann auf Komma als Trenner umgestellt werden', () => {
    expect(parseCsv('a,b,c', { trenner: ',' })).toEqual([['a', 'b', 'c']])
  })
})

describe('parseCsvMitKopf', () => {
  it('bildet Datensätze über die Kopfzeile ab und trimmt', () => {
    expect(parseCsvMitKopf(' name ;preis\n Cola ; 8,58 ')).toEqual([
      { name: 'Cola', preis: '8,58' },
    ])
  })

  it('füllt am Zeilenende fehlende Felder mit Leerstring', () => {
    expect(parseCsvMitKopf('a;b;c\n1;2')).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('liefert bei leerem Text keine Datensätze', () => {
    expect(parseCsvMitKopf('')).toEqual([])
  })
})

describe('deutscheZahl', () => {
  it('macht aus dem Dezimalkomma einen Punkt', () => {
    expect(deutscheZahl('0,75')).toBe('0.75')
    expect(deutscheZahl('8,58')).toBe('8.58')
  })

  it('lässt ganze Zahlen unverändert', () => {
    expect(deutscheZahl('24')).toBe('24')
  })

  it('entfernt Tausenderpunkte', () => {
    expect(deutscheZahl('1.234,5')).toBe('1234.5')
  })

  it('gibt bei leerer Zelle null zurück', () => {
    // Der fehlende EK-Preis der 3-Freunde-Weine — leer heisst unbekannt, nicht 0.
    expect(deutscheZahl('')).toBeNull()
    expect(deutscheZahl('   ')).toBeNull()
  })

  it('wirft bei Text, der keine Zahl ist', () => {
    expect(() => deutscheZahl('acht Euro')).toThrow(/Keine gültige Zahl/)
  })
})

describe('alsCsv', () => {
  it('schreibt Semikolon, CRLF und ein BOM', () => {
    // Ohne BOM zeigt deutsches Excel "Dörlemann" als "DÃ¶rlemann".
    expect(alsCsv([['a', 'b'], ['1', '2']])).toBe('\ufeffa;b\r\n1;2\r\n')
  })

  it('quotet nur, was es braucht', () => {
    expect(alsCsv([['Cola 24 x 0,33', 'ohne Trenner']], { bom: false })).toBe(
      'Cola 24 x 0,33;ohne Trenner\r\n',
    )
    expect(alsCsv([['mit;Trenner']], { bom: false })).toBe('"mit;Trenner"\r\n')
    expect(alsCsv([['mit "Zitat"']], { bom: false })).toBe('"mit ""Zitat"""\r\n')
  })

  it('lässt sich von parseCsv wieder einlesen', () => {
    // Der Beweis, dass Schreiben und Lesen zusammenpassen — sonst wäre die
    // exportierte Bestellung eine Einbahnstrasse.
    const zeilen = [
      ['Artikel', 'Gebinde', 'Wert'],
      ['Coca Cola; 0,33', '24 x 0,33', '17,99'],
      ['Sagen wir "Gin"', '1 x 0,7', '11,50'],
    ]
    expect(parseCsv(alsCsv(zeilen))).toEqual(zeilen)
  })

  it('gibt bei keiner Zeile nur das BOM zurück', () => {
    expect(alsCsv([], { bom: false })).toBe('')
  })
})

describe('dekodiereCsv', () => {
  it('liest UTF-8-Bytes als UTF-8', () => {
    expect(dekodiereCsv(new TextEncoder().encode('Dörlemann;Kölsch'))).toBe('Dörlemann;Kölsch')
  })

  it('fällt bei ungültigem UTF-8 auf Windows-1252 zurück', () => {
    // "Dör" aus einem deutschen Windows: 0xF6 ist dort das ö und in UTF-8 ungültig.
    expect(dekodiereCsv(new Uint8Array([0x44, 0xf6, 0x72]))).toBe('Dör')
  })

  it('nimmt auch einen ArrayBuffer, wie ihn file.arrayBuffer() liefert', () => {
    const bytes = new TextEncoder().encode('a;b')
    expect(dekodiereCsv(bytes.buffer.slice(0))).toBe('a;b')
  })
})
