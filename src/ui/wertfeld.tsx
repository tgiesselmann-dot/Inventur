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
 * Die Kachel ist Anzeige und keine Schaltfläche. Gewechselt wird über die
 * Wechseltaste im Ziffernblock — damit liegt oberhalb des unteren Drittels
 * nichts mehr, was auf einen Tipp reagiert.
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
}

export function Wertfeld({ wert, beschriftung, aktiv }: Props) {
  const leer = wert === ''

  return (
    <div
      className={`flex flex-1 flex-col items-start gap-2 rounded-ctl border-2 px-4 py-4 text-left ${
        aktiv ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface'
      }`}
    >
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
      <span className="sr-only">
        {beschriftung}: {leer ? 'kein Wert' : wert}
        {aktiv && ', wird gerade beschrieben'}
      </span>
    </div>
  )
}
