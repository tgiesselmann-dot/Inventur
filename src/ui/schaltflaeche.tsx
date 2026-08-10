'use client'

/**
 * Die eine Schaltfläche des Produkts.
 *
 * Steht unter src/ui, weil sie sonst in jeder Maske kopiert würde — und `tap`
 * und der Fokusring waren in den Kopien mal da, mal nicht. Die Rolle ist eine
 * Eigenschaft, keine durchgereichte Klassenliste: wer eine Fläche in einer
 * Farbe braucht, die keine Rolle ist, braucht keine Klasse, sondern eine neue
 * Rolle in globals.css.
 *
 * Gedrückt heisst: die Fläche zieht sich zusammen (`tap`). Die dunkleren
 * Gedrückt-Töne des Entwurfs bleiben draussen — vier neue Farbwerte für einen
 * Zustand, den der Scale schon zeigt.
 *
 * Gesperrt trägt die Aufschrift oft den Grund ("Noch 12 zu zählen"), also muss
 * sie lesbar bleiben: text-muted auf surface-2 hält 7,0:1 in Hell und 5,6:1 in
 * Dunkel. Die blasse Sperr-Kombination des Entwurfs (≈2:1) gilt nicht.
 */

import type { ComponentPropsWithoutRef } from 'react'

import { flaechenfassung, type Flaechenfassung } from './wegflaeche'

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'className'> & Flaechenfassung

export function Schaltflaeche({
  art = 'primaer',
  rolle,
  breit,
  gross,
  // Nie versehentlich absenden: submit ist die ausdrückliche Ausnahme.
  type = 'button',
  ...rest
}: Props) {
  // Die Klassenzeile kommt aus wegflaeche.tsx — sie steht genau einmal, und
  // Weg wie Schaltfläche tragen sie beide. Nur Gesperrt gehört allein hierher:
  // ein Link kennt kein disabled.
  const gesperrt =
    art === 'primaer'
      ? 'disabled:bg-surface-2 disabled:text-text-muted'
      : 'disabled:border-border disabled:bg-transparent disabled:text-text-muted'

  return (
    <button
      type={type}
      // min-h statt h (in der Fassung): die Aufschrift trägt oft den Grund
      // einer Sperre ("2 Positionen ohne Erklärung"), und der passt nicht
      // immer in eine Zeile. Eine feste Höhe liesse den zweiten Teil aus der
      // Fläche laufen; 56 px bleiben die Untergrenze.
      className={`${flaechenfassung({ art, rolle, breit, gross })} ${gesperrt}`}
      {...rest}
    />
  )
}
