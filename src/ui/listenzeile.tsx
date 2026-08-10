'use client'

/**
 * Eine Zeile einer Bestandsliste: Titel, gedämpfte Unterzeile, Zahl rechts,
 * Statuspunkt aussen — als eigene Karte, nicht als Streifen mit Trennlinie.
 *
 * Die ganze Zeile ist die Berührfläche — im Lager trifft der Daumen keine
 * kleine Zielfläche am Zeilenrand. Antippen wählt nur aus (den aktiven
 * Artikel) oder führt weiter (`ziel`); jede Handlung mit Folgen liegt im Fuss
 * der Maske. Ohne beides ist die Zeile ein div, kein Knopf: eine Fläche, die
 * nichts tut, darf sich nicht antippbar nennen.
 *
 * Karte statt Trennlinie, weil zwischen zwei auslösenden Flächen 8 px liegen
 * müssen (gap-tapgap) — eine Liste aus Berührflächen, die sich nur eine Linie
 * teilen, unterschreitet das in jeder Zeile. Der Abstand gehört dem Container:
 * wer Listenzeilen stapelt, stapelt sie in `flex flex-col gap-tapgap`.
 *
 * `ziel` macht sie zum Weg an eine andere Stelle — die Bereiche und die offenen
 * Punkte der Startseite. Der Winkel am Ende steht nur dann, und er steht dann
 * immer: er ist das Zeichen, dass diese Zeile irgendwohin führt.
 *
 * Der Punkt trägt seine Farbe nie allein: derselbe Zustand steht als Wort in
 * der Unterzeile. Der Punkt ist fürs Überfliegen, das Wort für die Aussage —
 * für Vorleser ist der Punkt deshalb unsichtbar.
 *
 * Ein fehlender Wert ist ein Gedankenstrich, nie eine 0 — die 0 ist eine
 * gezählte Aussage.
 */

import Link from 'next/link'
import { ROLLEN } from './rollen'

type Props = {
  titel: string
  /** Trägt den Zustand als Wort — auch den, den der Punkt nur färbt. */
  unterzeile?: string
  /**
   * Fertig formatiert — hier wird nicht gerechnet. Ohne Wert steht „—", denn
   * eine Bestandszeile ohne Zahl ist eine offene Frage. Auf einer Zeile mit
   * `ziel` bleibt die Stelle dagegen leer: ein Weg hat keinen Wert, der fehlen
   * könnte.
   */
  wert?: string
  punkt?: 'confirm' | 'attention' | 'danger' | 'neutral'
  /** Diese Zeile ist der aktive Artikel: Innenring und getönte Fläche. */
  aktiv?: boolean
  gesperrt?: boolean
  /** Wohin diese Zeile führt. Macht sie zum Link, samt Winkel am Ende. */
  ziel?: string
  /**
   * Lässt den Titel umbrechen, statt ihn abzuschneiden.
   *
   * Für Zeilen, deren Titel ein Satz ist: „Umsatzdaten seit 3 Tagen nicht
   * importiert" auf 390 px abgeschnitten sagt nichts mehr. Ein Artikelname
   * bleibt einzeilig — dort steht das Unterscheidende vorn, und gleich hohe
   * Zeilen lassen sich im Vorbeigehen überfliegen.
   */
  mehrzeilig?: boolean
  aufTipp?: () => void
}

export function Listenzeile({
  titel,
  unterzeile,
  wert,
  punkt,
  aktiv,
  gesperrt,
  ziel,
  mehrzeilig,
  aufTipp,
}: Props) {
  const flaeche =
    'flex min-h-tap w-full items-center gap-3.5 rounded-ctl border border-border px-4 py-2 text-left ' +
    (aktiv ? 'bg-primary-soft outline-2 -outline-offset-2 outline-focus ' : 'bg-surface ') +
    (gesperrt ? 'opacity-45 ' : '')

  const inhalt = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-zeile text-text ${mehrzeilig ? 'text-pretty' : 'truncate'}`}>
          {titel}
        </span>
        {unterzeile && (
          <span className={`text-sm text-text-muted ${mehrzeilig ? '' : 'truncate'}`}>
            {unterzeile}
          </span>
        )}
      </span>
      {(wert !== undefined || ziel === undefined) && (
        <span
          className={`shrink-0 text-zeile ${wert === undefined ? 'text-text-muted' : 'text-text'}`}
        >
          {wert ?? '—'}
        </span>
      )}
      {punkt && (
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${ROLLEN[punkt].punkt}`} />
      )}
      {ziel !== undefined && (
        <span aria-hidden className="shrink-0 text-xl leading-none text-text-muted">
          ›
        </span>
      )}
    </>
  )

  if (ziel !== undefined) {
    return (
      <Link href={ziel} className={`tap focus-visible:fokus ${flaeche}`}>
        {inhalt}
      </Link>
    )
  }

  if (!aufTipp) return <div className={flaeche}>{inhalt}</div>

  return (
    <button
      type="button"
      onClick={aufTipp}
      disabled={gesperrt}
      className={`tap focus-visible:fokus ${flaeche}`}
    >
      {inhalt}
    </button>
  )
}
