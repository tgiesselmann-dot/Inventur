/**
 * Die Fassung eines Formularfelds und seiner Beschriftung — als Klassenexporte,
 * nicht als Komponente: ein Eingabefeld trägt je Maske andere Attribute
 * (inputMode, autoComplete, name, list …), und ein Baustein, der sie alle
 * durchreicht, wäre nur eine Klassenzeile mit Umweg.
 *
 * Vier Masken hielten dieselbe Zeichenkette byte-gleich, fünf weitere eine
 * abgewichene — teils ohne Fokusregel. Hier steht sie einmal.
 */

/**
 * Alle Felder tragen dieselbe Fläche: 56 px hoch, Rand in `border-strong`. Der
 * Fokusring kommt aus der Rolle `focus` und ist in Hell wie Dunkel sichtbar.
 */
export const FELD =
  'h-tap w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-3 text-zeile text-text focus:outline-2 focus:-outline-offset-1 focus:outline-focus'

/** Die Beschriftung über einem Feld: Versalien, leiser als der Wert darunter. */
export const BESCHRIFTUNG = 'text-beschriftung uppercase text-text-muted'
