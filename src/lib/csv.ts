/**
 * CSV-Parser für die Dateien, die in dieses Projekt hineinlaufen: den
 * Artikelstamm aus der Inventur-Excel und später die Umsatzexporte aus der
 * Kasse. Beide kommen aus deutschsprachigen Windows-Programmen und bringen
 * deren Eigenheiten mit — Semikolon als Trenner, BOM am Dateianfang, CRLF als
 * Zeilenende, Dezimalkomma.
 *
 * Bewusst ohne Bibliothek: der Bedarf ist RFC 4180 plus wählbarer Trenner, und
 * das sind fünfzig Zeilen, die hier vollständig getestet sind.
 *
 * Reine Funktionen: kein Dateizugriff, keine Seiteneffekte.
 */

export type CsvOptionen = {
  /** Feldtrenner. Vorgabe ist Semikolon — deutsches Excel schreibt so. */
  trenner?: string
}

/**
 * Zerlegt CSV-Text in Zeilen aus Feldern.
 *
 * Beherrscht gequotete Felder (`"..."`), darin enthaltene Trenner und
 * Zeilenumbrüche sowie verdoppelte Anführungszeichen als Escape. Entfernt ein
 * BOM am Anfang und behandelt CRLF wie LF. Leerzeilen entfallen.
 */
export function parseCsv(text: string, optionen: CsvOptionen = {}): string[][] {
  const trenner = optionen.trenner ?? ';'
  const ohneBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const zeilen: string[][] = []
  let zeile: string[] = []
  let feld = ''
  let inQuote = false

  const feldAbschliessen = () => {
    zeile.push(feld)
    feld = ''
  }
  const zeileAbschliessen = () => {
    feldAbschliessen()
    // Eine Zeile, die nur aus leeren Feldern besteht, ist ein Zeilenrest und
    // keine Datenzeile — sonst liefert jede Datei am Ende einen Geisterdatensatz.
    if (zeile.some((f) => f.trim() !== '')) zeilen.push(zeile)
    zeile = []
  }

  for (let i = 0; i < ohneBom.length; i++) {
    const zeichen = ohneBom[i]

    if (inQuote) {
      if (zeichen === '"') {
        if (ohneBom[i + 1] === '"') {
          feld += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        feld += zeichen
      }
      continue
    }

    if (zeichen === '"') inQuote = true
    else if (zeichen === trenner) feldAbschliessen()
    else if (zeichen === '\n') zeileAbschliessen()
    else if (zeichen !== '\r') feld += zeichen
  }

  if (feld !== '' || zeile.length > 0) zeileAbschliessen()

  return zeilen
}

/**
 * Wie `parseCsv`, liefert die Datensätze aber als Objekte über die Kopfzeile.
 * Werte und Spaltennamen werden von umgebenden Leerzeichen befreit; fehlende
 * Felder am Zeilenende werden zu leeren Zeichenketten.
 */
export function parseCsvMitKopf(
  text: string,
  optionen: CsvOptionen = {},
): Record<string, string>[] {
  const [kopf, ...datenzeilen] = parseCsv(text, optionen)
  if (!kopf) return []

  const spalten = kopf.map((s) => s.trim())
  return datenzeilen.map((zeile) =>
    Object.fromEntries(spalten.map((spalte, i) => [spalte, (zeile[i] ?? '').trim()])),
  )
}

/**
 * Schreibt Zeilen als CSV — die Gegenrichtung zu `parseCsv`, für Dateien, die
 * dieses Projekt verlässt.
 *
 * Die Vorgaben sind die derselben Windows-Welt geschuldet, aus der die
 * Eingangsdateien kommen: Semikolon als Trenner, CRLF als Zeilenende, ein BOM
 * am Anfang. Ohne das BOM zeigt Excel „Dörlemann" als „DÃ¶rlemann", und die
 * Bestellung sieht nach Fehler aus, bevor sie gelesen wird.
 *
 * Gequotet wird nur, was es braucht: ein Feld mit Trenner, Anführungszeichen
 * oder Zeilenumbruch. `parseCsv` liest das Ergebnis wieder ein.
 */
export function alsCsv(
  zeilen: readonly (readonly string[])[],
  optionen: CsvOptionen & { bom?: boolean } = {},
): string {
  const trenner = optionen.trenner ?? ';'
  const bom = optionen.bom ?? true

  const text = zeilen
    .map((zeile) => zeile.map((feld) => quote(feld, trenner)).join(trenner))
    .join('\r\n')

  return `${bom ? '﻿' : ''}${text}${zeilen.length > 0 ? '\r\n' : ''}`
}

function quote(feld: string, trenner: string): string {
  if (!feld.includes(trenner) && !feld.includes('"') && !/[\r\n]/.test(feld)) return feld
  return `"${feld.split('"').join('""')}"`
}

/**
 * Rohbytes einer hochgeladenen CSV als Text.
 *
 * Die Dateien kommen aus zwei Welten: neuere Exporte als UTF-8, ältere aus
 * deutschem Windows als Windows-1252. Erst wird streng als UTF-8 gelesen;
 * schlägt das fehl, ist es Windows-1252 — dort ist jede Bytefolge gültig,
 * ein zweiter Fehlschlag ist also ausgeschlossen. Ohne diese Weiche würde
 * "Dörlemann" aus einer alten Datei als "D�rlemann" im Stamm landen.
 */
export function dekodiereCsv(daten: ArrayBuffer | Uint8Array): string {
  const bytes = daten instanceof Uint8Array ? daten : new Uint8Array(daten)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/**
 * Liest eine deutsche Dezimalzahl ("0,75", "8,58", "1.234,5") als Zeichenkette
 * in der englischen Schreibweise, wie Decimal und Number sie erwarten.
 * Leerer Text ergibt null — die Zelle war in der Excel leer.
 *
 * Gibt bewusst eine Zeichenkette zurück statt einer Zahl: der Aufrufer
 * entscheidet, ob daraus ein Decimal (exakt) oder ein number wird.
 */
export function deutscheZahl(text: string): string | null {
  const geputzt = text.trim()
  if (geputzt === '') return null

  // Tausenderpunkte entfernen, dann Dezimalkomma zum Punkt.
  const normalisiert = geputzt.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')

  if (!/^-?\d+(\.\d+)?$/.test(normalisiert)) {
    throw new Error(`Keine gültige Zahl: ${text}`)
  }
  return normalisiert
}
