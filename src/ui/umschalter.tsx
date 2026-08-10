'use client'

/**
 * Der segmentierte Umschalter: eine Gruppe gleichrangiger Sichten, von denen
 * genau eine gilt — Filter, nicht Handlung. Er schaltet die Ansicht um und
 * verändert nichts; jede Handlung mit Folgen bleibt eine Schaltfläche.
 *
 * Viermal war er in den Masken nachgebaut, davon zwei byte-identisch und eine
 * mit voll gefüllter Aktivfläche. Hier steht die eine Fassung: das aktive
 * Segment liegt auf der getönten Fläche — gewählt, nicht gedrückt; die volle
 * Rollenfarbe bleibt der Schaltfläche.
 *
 * Die Segmente stehen mit 8 px Abstand nebeneinander (gap-tapgap), jedes mit
 * eigenem Rand: zwischen zwei auslösenden Flächen liegt nie weniger — eine
 * Gruppe, die sich nur eine Trennlinie teilt, unterschreitet das an jeder
 * Naht. `aria-pressed` sagt der Sprachausgabe, welche Sicht gilt.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'

import { ROLLEN } from './rollen'

/**
 * Die Fassung eines Segments — eine Zeile, zwei Nehmer.
 *
 * Der Umschalter kommt in zwei Formen vor: als Taste, die eine Sicht in
 * derselben Maske umstellt, und als Weg zwischen zwei Seiten, die dasselbe
 * verschieden zeigen (Zeitraum und Verlauf). Beide sehen gleich aus, weil sie
 * dasselbe bedeuten — und deshalb steht die Klassenzeile hier einmal.
 */
function segmentfassung(aktiv: boolean): string {
  return `tap h-tap rounded-ctl border px-3.5 text-base whitespace-nowrap focus-visible:fokus ${
    aktiv
      ? `${ROLLEN.primary.flaeche} ${ROLLEN.primary.rand} font-medium`
      : 'border-border-strong bg-surface text-text-muted'
  }`
}

export function Umschalter({
  beschriftung,
  children,
}: {
  /** Wonach hier umgeschaltet wird — für die Sprachausgabe der Gruppe. */
  beschriftung: string
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={beschriftung}
      className="flex shrink-0 flex-wrap gap-tapgap"
    >
      {children}
    </div>
  )
}

export function Umschaltersegment({
  aktiv,
  aufTipp,
  children,
}: {
  aktiv: boolean
  aufTipp: () => void
  children: ReactNode
}) {
  return (
    <button type="button" onClick={aufTipp} aria-pressed={aktiv} className={segmentfassung(aktiv)}>
      {children}
    </button>
  )
}

/**
 * Ein Segment, das auf eine andere Seite führt.
 *
 * Für Sichten, die eigene Adressen haben — der Verlauf ist ein anderer
 * Bildschirm und keine umgeschaltete Tabelle. Das aktive Segment ist kein Link
 * mehr, sondern eine Fläche: ein Weg auf die Seite, auf der man steht, führt
 * nirgendwohin (dieselbe Regel wie in der Seitennavigation).
 */
export function Umschalterweg({
  aktiv,
  ziel,
  children,
}: {
  aktiv: boolean
  ziel: string
  children: ReactNode
}) {
  if (aktiv) {
    return (
      <span aria-current="page" className={`${segmentfassung(true)} inline-flex items-center`}>
        {children}
      </span>
    )
  }

  return (
    <Link href={ziel} className={`${segmentfassung(false)} inline-flex items-center`}>
      {children}
    </Link>
  )
}
