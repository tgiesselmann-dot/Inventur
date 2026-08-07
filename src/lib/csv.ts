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
