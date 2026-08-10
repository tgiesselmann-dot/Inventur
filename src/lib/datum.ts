/**
 * Datumsangaben, wie sie im Betrieb geschrieben werden.
 *
 * Die Spalten sind @db.Date, tragen also keine Uhrzeit und keine Zeitzone.
 * `toISOString` liest sie in UTC — bei einem reinen Datum ist das genau richtig
 * und verschiebt nichts, solange niemand vorher `toLocaleDateString` benutzt und
 * damit die Zeitzone des Servers ins Spiel bringt.
 */

/** 2026-08-07 -> "07.08.2026". */
export function alsDatumstext(datum: Date): string {
  return datum.toISOString().slice(0, 10).split('-').reverse().join('.')
}

/**
 * 2026-08-07 -> "07.08.". Die Form für eine Listenzeile auf dem Telefon.
 *
 * Das Jahr fällt weg, weil auf 390 px sonst der Lieferantenname abgeschnitten
 * wird — und der unterscheidet zwei Lieferungen desselben Tages, das Jahr nicht.
 * Auf dem Desktop steht weiter das volle Datum.
 */
export function alsKurzdatum(datum: Date): string {
  return datum.toISOString().slice(5, 10).split('-').reverse().join('.') + '.'
}

/**
 * 2026-08-07 -> "Freitag, 7. August 2026". Die Zeile unter dem Betriebsnamen
 * auf der Startseite.
 *
 * Der Wochentag steht vorn, weil er die Frage beantwortet, die am Morgen
 * wirklich gestellt wird: Lieferungen kommen dienstags, gezählt wird montags.
 *
 * `Intl` mit ausdrücklichem `timeZone: 'UTC'` — ohne diese Angabe läse der
 * Formatierer die Mitternacht einer @db.Date-Spalte in der Zeitzone des Servers
 * und schriebe westlich von Greenwich den Vortag hin, samt falschem Wochentag.
 */
export function alsLangdatum(datum: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(datum)
}

/**
 * Die Kalenderwoche nach ISO 8601: 2026-08-07 -> 32.
 *
 * Der Betrieb rechnet in Wochen — die Zählung ist die Wochenarbeit, und die
 * Bestellung geht wochenweise raus. Die Woche beginnt am Montag, und die erste
 * Woche eines Jahres ist die mit dem ersten Donnerstag darin. Genau daran
 * hängt der Sonderfall: der 1. Januar 2027 ist ein Freitag und gehört noch in
 * die KW 53 des Vorjahres.
 *
 * Gerechnet in UTC, aus demselben Grund wie oben. Eine eigene Rechnung und
 * kein `Intl`-Aufruf: die Wochennummer gibt `Intl` nicht heraus.
 */
export function kalenderwoche(datum: Date): number {
  // Auf den Donnerstag derselben Woche schieben. Dessen Jahr ist per
  // Definition das Jahr, zu dem die ganze Woche zählt.
  const donnerstag = new Date(
    Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()),
  )
  // getUTCDay: Sonntag ist 0. Der Betrieb zählt Montag als ersten Tag.
  const wochentag = (donnerstag.getUTCDay() + 6) % 7
  donnerstag.setUTCDate(donnerstag.getUTCDate() - wochentag + 3)

  const ersterDonnerstag = new Date(Date.UTC(donnerstag.getUTCFullYear(), 0, 4))
  const versatz = (ersterDonnerstag.getUTCDay() + 6) % 7
  ersterDonnerstag.setUTCDate(ersterDonnerstag.getUTCDate() - versatz + 3)

  return 1 + Math.round((donnerstag.getTime() - ersterDonnerstag.getTime()) / (7 * 86_400_000))
}

/**
 * Der Montag der Woche, in der das Datum liegt, als Mitternacht UTC. Dieselbe
 * Wochengrenze wie in `kalenderwoche`: die Woche des Betriebs beginnt am
 * Montag. Gebraucht für "diese Woche abgeschlossen" in der
 * Reklamations-Nachverfolgung.
 */
export function wochenbeginn(datum: Date): Date {
  const tag = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()))
  // getUTCDay: Sonntag ist 0. Der Betrieb zählt Montag als ersten Tag.
  const wochentag = (tag.getUTCDay() + 6) % 7
  tag.setUTCDate(tag.getUTCDate() - wochentag)
  return tag
}

/**
 * Ein Zeitpunkt mit Uhrzeit: "16.07.2026, 09:12" — die Form des Verlaufs, in
 * dem wer wann welchen Status gesetzt hat.
 *
 * Anders als die reinen Datumsangaben oben ist das eine echte Uhrzeit
 * (Timestamptz), und die gehört in die Zeit des Betriebs, nicht in die des
 * Servers: ausdrücklich Europe/Berlin, sonst läse ein Server in UTC den
 * Statuswechsel von 0:30 Uhr am Vortag.
 */
export function alsZeitpunktstext(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(zeitpunkt)
}

/** 2026-08-07 -> "2026-08-07", die Form eines <input type="date">. */
export function alsFeldwert(datum: Date): string {
  return datum.toISOString().slice(0, 10)
}

/** Heute als reines Datum, ohne Uhrzeit — passend zu einer @db.Date-Spalte. */
export function heute(): Date {
  const jetzt = new Date()
  return new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()))
}

/**
 * So viele Tage vor einem Datum, als reines Datum. Die Rückwärtsrichtung der
 * Fenster: "die letzten 30 Tage" beginnt hier, egal wer fragt — der
 * Bestellvorschlag und die Abweichungsübersicht rechnen dasselbe Fenster und
 * sollen es nicht zweimal tun.
 */
export function vorTagen(tage: number, von: Date = heute()): Date {
  return new Date(von.getTime() - tage * 86_400_000)
}

/**
 * "07.08.2026" -> 2026-08-07, als Mitternacht UTC. Die Gegenrichtung zu
 * `alsDatumstext`, gebraucht für Datumsangaben aus fremden Dateien — der
 * Kassenexport schreibt seinen Zeitraum in dieser Form.
 *
 * `null` bei allem, was nicht diese Form hat. Absichtlich nicht `new Date(text)`:
 * das liest "07.08.2026" je nach Umgebung als 8. Juli, und ein um einen Monat
 * verschobener Zeitraum fiele erst auf, wenn die Auswertung schon falsch ist.
 */
export function ausDatumstext(text: string): Date | null {
  const treffer = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim())
  if (treffer === null) return null

  const [, tag, monat, jahr] = treffer
  const datum = new Date(Date.UTC(Number(jahr), Number(monat) - 1, Number(tag)))

  // Fängt den 31. Februar ab: Date.UTC rollt ihn stillschweigend weiter.
  if (datum.getUTCDate() !== Number(tag) || datum.getUTCMonth() !== Number(monat) - 1) {
    return null
  }
  return datum
}

/**
 * Eine Zeitspanne als Text: „1 Std 14 Min", „14 Min", „2 Std".
 *
 * Gebraucht für die Dauer einer Zählung, und die wird aus den Zeitpunkten ihrer
 * Positionen abgeleitet — von der ersten bis zur letzten Erfassung. Das misst,
 * was im Lager gedauert hat, und nicht die Zeit bis zum Tippen auf
 * „abschliessen".
 *
 * Abgerundet auf ganze Minuten: „74 Min" wird zu „1 Std 14 Min", und die
 * Sekunden darin interessieren niemanden. Unter einer Minute steht das auch so
 * da — „0 Min" liest sich wie ein Fehler.
 *
 * Eine negative Spanne gibt es nicht: sie wäre eine verdrehte Reihenfolge und
 * würde hier zu „unter 1 Min", statt eine Minuszahl an den Kopf des
 * Bildschirms zu schreiben.
 */
export function dauertext(von: Date, bis: Date): string {
  const minuten = Math.max(0, Math.floor((bis.getTime() - von.getTime()) / 60_000))
  if (minuten === 0) return 'unter 1 Min'

  const stunden = Math.floor(minuten / 60)
  const rest = minuten % 60

  if (stunden === 0) return `${rest} Min`
  if (rest === 0) return `${stunden} Std`
  return `${stunden} Std ${rest} Min`
}

/**
 * Der letzte Augenblick eines Tages. Der Kassenexport nennt seinen letzten Tag,
 * meint aber alles bis Mitternacht — ohne diese Grenze fiele der ganze Schlussabend
 * aus dem Zeitraum.
 */
export function tagesende(datum: Date): Date {
  return new Date(datum.getTime() + 86_400_000 - 1)
}
