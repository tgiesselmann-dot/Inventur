'use client'

/**
 * Der Eingabeblock am unteren Bildschirmrand.
 *
 * Ein eigener Ziffernblock statt der Systemtastatur, und das aus drei Gründen:
 * die Systemtastatur schiebt sich beim Aufgehen über genau den Bereich, den
 * diese Maske braucht; ihre Höhe schwankt je Gerät und Sprache, womit die
 * Zusage "alles im unteren Drittel" nicht mehr zu halten wäre; und das Komma
 * lässt sich an ihr nicht je Zählmodus sperren.
 *
 * Preis dieser Entscheidung: kein natives Einfügen aus der Zwischenablage, und
 * Sprachausgabe-Geräte lesen einen Tastenblock schlechter als ein Zahlenfeld.
 * Für eine Maske, die einhändig im Lager bedient wird, ist der Tausch richtig
 * herum.
 *
 * Vier Reihen zu vier Tasten, jede 56px hoch. Mit Abständen und Rand bleibt der
 * Block unter 270px und damit im unteren Drittel eines Handybildschirms — auch
 * auf den kleinen. Einen Knopf zum Feldwechsel gibt es bewusst nicht: die
 * beiden Mengenfelder darüber sind selbst gross genug zum Antippen, und das ist
 * der kürzere Weg.
 */

import type { Taste } from '@/lib/zaehlung'

type Props = {
  /** Ob das Komma im gerade aktiven Feld erlaubt ist. */
  dezimal: boolean
  /** Beschriftung der Weiter-Taste. */
  weiterText: string
  aufTaste: (taste: Taste) => void
  aufSchritt: (delta: number) => void
  aufWeiter: () => void
}

/** Gemeinsame Grundform aller Tasten: 56px hoch, grosser Text, klare Fläche. */
const TASTE =
  'h-14 rounded-xl text-2xl font-medium select-none touch-manipulation ' +
  'transition-transform active:scale-95 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500'

const ZIFFER = `${TASTE} bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50`
const NEBEN = `${TASTE} bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50`

export function Ziffernblock({ dezimal, weiterText, aufTaste, aufSchritt, aufWeiter }: Props) {
  const ziffer = (wert: string) => (
    <button
      key={wert}
      type="button"
      className={ZIFFER}
      onClick={() => aufTaste({ art: 'ziffer', ziffer: wert })}
    >
      {wert}
    </button>
  )

  return (
    <div className="grid grid-cols-4 gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {['1', '2', '3'].map(ziffer)}
      <button
        type="button"
        className={NEBEN}
        onClick={() => aufTaste({ art: 'loeschen' })}
        aria-label="Letzte Ziffer löschen"
      >
        ⌫
      </button>

      {['4', '5', '6'].map(ziffer)}
      <button type="button" className={NEBEN} onClick={() => aufSchritt(-1)} aria-label="Eins weniger">
        −
      </button>

      {['7', '8', '9'].map(ziffer)}
      <button type="button" className={NEBEN} onClick={() => aufSchritt(1)} aria-label="Eins mehr">
        +
      </button>

      <button
        type="button"
        className={`${NEBEN} disabled:opacity-30`}
        onClick={() => aufTaste({ art: 'komma' })}
        disabled={!dezimal}
        aria-label="Komma"
      >
        ,
      </button>
      {ziffer('0')}
      <button
        type="button"
        className={`${TASTE} col-span-2 bg-sky-600 px-2 text-base leading-tight text-white active:bg-sky-700`}
        onClick={aufWeiter}
      >
        {weiterText}
      </button>
    </div>
  )
}
