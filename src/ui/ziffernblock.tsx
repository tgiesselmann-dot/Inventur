'use client'

/**
 * Der Eingabeblock am unteren Bildschirmrand.
 *
 * Gemeinsam genutzt von der Zählmaske im Lager und der Wareneingangskontrolle
 * an der Rampe. Beide werden einhändig bedient, während die andere Hand eine
 * Kiste hält — die Gründe unten gelten für beide gleichermassen.
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
 * auf den kleinen.
 *
 * Diese sechzehn Felder sind der ganze Vorrat, und sie sind voll: zehn Ziffern,
 * drei Nebentasten, das Komma, und die Weiter-Taste über zwei davon. Wer eine
 * Taste dazunimmt, nimmt eine weg — eine fünfte Reihe wären 320px und damit das
 * untere Drittel. Der Feldwechsel nimmt deshalb den Platz der Plus-Taste, und
 * nur dort, wo es überhaupt ein zweites Feld gibt: an der Rampe zählt niemand
 * Gebinde und lose Flaschen am selben Beleg, dort bleiben alle drei Nebentasten.
 *
 * Er sitzt unten in der rechten Spalte, unmittelbar über der Weiter-Taste. Bei
 * einem Artikel mit zwei Feldern wird er so oft gedrückt wie diese, und der
 * Daumen soll für beide nicht umgreifen müssen.
 */

import { useEffect, useRef } from 'react'

import type { Taste } from '@/lib/zaehlung'
import { ROLLEN } from './rollen'

type Props = {
  /** Ob das Komma im gerade aktiven Feld erlaubt ist. */
  dezimal: boolean
  /** Beschriftung der Weiter-Taste. */
  weiterText: string
  /**
   * Farbrolle der Weiter-Taste. `confirm`, sobald nichts mehr offen ist — die
   * Taste ist die einzige Fläche im Block, die dann noch etwas anderes bedeutet
   * als vorher, und sagt das über die Farbe, bevor der Daumen sie liest.
   */
  weiterRolle?: 'primary' | 'confirm'
  /**
   * Der Sprung ins andere Mengenfeld, samt dessen Namen. Fehlt, wenn der
   * Artikel nur ein Feld hat — dann steht an dieser Stelle die Plus-Taste.
   */
  feldwechsel?: { ziel: string; aufWechsel: () => void }
  aufTaste: (taste: Taste) => void
  aufSchritt: (delta: number) => void
  aufWeiter: () => void
}

/**
 * Gemeinsame Grundform aller Tasten: 56px hoch, klare Fläche.
 *
 * Ohne Schriftgrösse — die setzt jede Taste selbst. Stünde sie hier, müssten die
 * Weiter- und die Wechseltaste sie überschreiben, und welche der beiden Klassen
 * dann gewinnt, entscheidet die Reihenfolge im erzeugten Stylesheet und nicht
 * diese Datei.
 */
const TASTE = 'tap h-tap rounded-ctl font-medium select-none touch-manipulation focus-visible:fokus'

/**
 * Ziffern und Nebentasten bleiben unterscheidbar, ohne eine zweite Graustufe zu
 * erfinden: die Ziffern liegen auf der gedeckten Fläche, die Nebentasten auf dem
 * Grund mit Rand. Der Daumen greift blind — würden beide gleich aussehen, träfe
 * er das Komma statt der Null.
 */
const ZIFFER = `${TASTE} bg-surface-2 text-2xl text-text`
const NEBEN = `${TASTE} border border-border-strong bg-surface text-text`
const NEBEN_GROSS = `${NEBEN} text-2xl`

export function Ziffernblock({
  dezimal,
  weiterText,
  weiterRolle = 'primary',
  feldwechsel,
  aufTaste,
  aufSchritt,
  aufWeiter,
}: Props) {
  // Am Laptop tippt niemand Ziffern mit der Maus: solange der Block auf dem
  // Bildschirm steht, nimmt er die Hardware-Tastatur an — Ziffern, Komma,
  // Backspace, Enter für "weiter", Plus/Minus für den Schritt, die Pfeile für
  // den Feldwechsel. Der Griff über eine Ref statt über die Abhängigkeiten:
  // die Rückrufe entstehen je Render neu, und ein Lauscher, der je Render ab-
  // und wieder anmeldet, verpasst den Tastendruck dazwischen.
  const griffe = useRef({ dezimal, feldwechsel, aufTaste, aufSchritt, aufWeiter })
  useEffect(() => {
    griffe.current = { dezimal, feldwechsel, aufTaste, aufSchritt, aufWeiter }
  })

  useEffect(() => {
    function beiTastendruck(ereignis: KeyboardEvent) {
      const { dezimal, feldwechsel, aufTaste, aufSchritt, aufWeiter } = griffe.current

      // Echte Eingabefelder behalten ihre Tastatur — die Fokuserfassung hat
      // eine Artikelsuche, deren Ziffern nicht im Mengenfeld landen dürfen.
      const ziel = ereignis.target
      if (
        ziel instanceof HTMLInputElement ||
        ziel instanceof HTMLTextAreaElement ||
        ziel instanceof HTMLSelectElement ||
        (ziel instanceof HTMLElement && ziel.isContentEditable)
      ) {
        return
      }
      // Kürzel des Browsers (Cmd+R, Strg+…) bleiben Kürzel.
      if (ereignis.metaKey || ereignis.ctrlKey || ereignis.altKey) return

      if (/^[0-9]$/.test(ereignis.key)) {
        aufTaste({ art: 'ziffer', ziffer: ereignis.key })
      } else if (ereignis.key === ',' || ereignis.key === '.') {
        if (!dezimal) return
        aufTaste({ art: 'komma' })
      } else if (ereignis.key === 'Backspace') {
        aufTaste({ art: 'loeschen' })
      } else if (ereignis.key === 'Enter') {
        // Liegt der Fokus auf einer Taste, löst Enter sie bereits nativ aus —
        // ein zweites "weiter" obendrauf spränge einen Artikel zu weit.
        if (ziel instanceof HTMLButtonElement) return
        aufWeiter()
      } else if (ereignis.key === '+') {
        aufSchritt(1)
      } else if (ereignis.key === '-') {
        aufSchritt(-1)
      } else if (ereignis.key === 'ArrowLeft' || ereignis.key === 'ArrowRight') {
        // Kein Tab: der wandert weiter durch die Bedienelemente, wie überall.
        if (feldwechsel === undefined) return
        feldwechsel.aufWechsel()
      } else {
        return
      }
      ereignis.preventDefault()
    }

    window.addEventListener('keydown', beiTastendruck)
    return () => window.removeEventListener('keydown', beiTastendruck)
  }, [])

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
        className={NEBEN_GROSS}
        onClick={() => aufTaste({ art: 'loeschen' })}
        aria-label="Letzte Ziffer löschen"
      >
        ⌫
      </button>

      {['4', '5', '6'].map(ziffer)}
      <button type="button" className={NEBEN_GROSS} onClick={() => aufSchritt(-1)} aria-label="Eins weniger">
        −
      </button>

      {['7', '8', '9'].map(ziffer)}
      {feldwechsel === undefined ? (
        <button type="button" className={NEBEN_GROSS} onClick={() => aufSchritt(1)} aria-label="Eins mehr">
          +
        </button>
      ) : (
        <button
          type="button"
          // Das Zielfeld statt eines Pfeils: die Taste sagt, wohin sie führt,
          // wie die Weiter-Taste daneben. Sie bricht dafür auf zwei Zeilen,
          // "LOSE FLASCHEN" passt nicht in eine Spaltenbreite.
          className={`${NEBEN} text-beschriftung leading-tight break-words uppercase`}
          onClick={feldwechsel.aufWechsel}
          aria-label={`Zu ${feldwechsel.ziel} wechseln`}
        >
          {feldwechsel.ziel}
        </button>
      )}

      <button
        type="button"
        className={`${NEBEN_GROSS} disabled:opacity-30`}
        onClick={() => aufTaste({ art: 'komma' })}
        disabled={!dezimal}
        aria-label="Komma"
      >
        ,
      </button>
      {ziffer('0')}
      <button
        type="button"
        className={`${TASTE} col-span-2 px-2 text-base leading-tight ${ROLLEN[weiterRolle].voll}`}
        onClick={aufWeiter}
      >
        {weiterText}
      </button>
    </div>
  )
}
