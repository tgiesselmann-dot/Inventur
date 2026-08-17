/**
 * Die Wertkachel der Zählmaske: eine grosse Zahl über ihrer Beschriftung.
 *
 * Steht unter src/ui, weil sie je Artikel ein- oder zweimal nebeneinander steht
 * — bei "Gebinde plus einzeln" zwei Kacheln, bei Fass und Einzeln eine über die
 * volle Breite. Als Klassenliste in der Maske müssten die aktive und die ruhende
 * Fassung an zwei Stellen gepflegt werden, und genau dort läuft es auseinander.
 *
 * Die Zahl steht in der Stufe "Zählwert": aus 60 cm Abstand lesbar, mit
 * Handschuhen und ohne Brille. Ein leeres Feld zeigt einen Gedankenstrich. Eine
 * 0 wäre die Aussage "nachgesehen, Fach ist leer" — die gehört dem Zähler, nicht
 * der Maske.
 *
 * Der Rand ist in beiden Fassungen 2 px stark und wechselt nur die Farbe. Mit
 * 1 px im Ruhezustand würde die Kachel beim Feldwechsel um einen Punkt springen,
 * und die Zahl daneben mit ihr.
 *
 * Die ruhende Kachel ist zugleich der zweite Weg ins andere Feld: wer auf
 * "lose Flaschen" schaut, tippt darauf, statt die Wechseltaste zu suchen. Die
 * Wechseltaste im Ziffernblock bleibt trotzdem — sie ist der Weg, der die
 * Zusage "alles Auslösende im unteren Drittel" hält, und die Kachel ist der
 * bequeme daneben, nicht ihr Ersatz.
 *
 * Die *aktive* Kachel bleibt Anzeige und wird keine Schaltfläche: sie führt
 * nirgendwohin, und eine Fläche, die auf Antippen nichts tut, verspricht eine
 * Bedienbarkeit, die sie nicht hat.
 *
 * Was auf dem Schirm die Farbe des Rahmens sagt, muss die Sprachausgabe hören:
 * darum steht der ganze Sachverhalt einmal als Satz in der Kachel, und Zahl und
 * Beschriftung sind für sie ausgeblendet. Sonst käme dort "Gedankenstrich,
 * Kästen" an.
 */

type Props = {
  /** Der eingetippte Wert in deutscher Schreibweise. Leer heisst: nicht angefasst. */
  wert: string
  /** Die Einheit, in der die Zahl steht — "Kästen", "Fässer". */
  beschriftung: string
  /** Ob der Ziffernblock gerade dieses Feld beschreibt. */
  aktiv: boolean
  /**
   * Führt den Ziffernblock in dieses Feld. Fehlt an der aktiven Kachel und beim
   * Artikel, der nur ein Feld hat — dort gibt es nichts zu wechseln.
   */
  aufWechsel?: () => void
}

export function Wertfeld({ wert, beschriftung, aktiv, aufWechsel }: Props) {
  const leer = wert === ''

  const fassung = `flex flex-1 flex-col items-start gap-2 rounded-ctl border-2 px-4 py-4 text-left ${
    aktiv ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface'
  }`

  const inhalt = (
    <>
      <span
        aria-hidden
        className={`text-count ${
          leer ? 'text-text-muted/50' : aktiv ? 'text-primary-text' : 'text-text'
        }`}
      >
        {leer ? '—' : wert}
      </span>
      <span
        aria-hidden
        className={`text-beschriftung uppercase ${
          aktiv ? 'text-primary-soft-on' : 'text-text-muted'
        }`}
      >
        {beschriftung}
      </span>
      {/* Der ganze Sachverhalt einmal als Satz — er ist zugleich die Aufschrift
          der Schaltfläche, wo die Kachel eine ist. Ein aria-label daneben würde
          ihn verdecken. */}
      <span className="sr-only">
        {beschriftung}: {leer ? 'kein Wert' : wert}
        {aktiv && ', wird gerade beschrieben'}
        {!aktiv && aufWechsel !== undefined && ', zum Beschreiben antippen'}
      </span>
    </>
  )

  if (aufWechsel === undefined) return <div className={fassung}>{inhalt}</div>

  return (
    <button type="button" onClick={aufWechsel} className={`tap focus-visible:fokus ${fassung}`}>
      {inhalt}
    </button>
  )
}
