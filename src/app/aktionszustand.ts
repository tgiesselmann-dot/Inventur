/**
 * Der Rückgabezustand einfacher Serveraktionen — eine Form, drei Fälle.
 *
 * Vorher stand dieselbe Vereinigung viermal fast gleich im Code (Zuordnung,
 * Bestellung anlegen, Positionen speichern); jede Kopie war eine Gelegenheit,
 * dass eine Maske ihre Meldung anders trägt als die Nachbarmaske. Der
 * Kassenimport behält seinen eigenen Zustand: seine Zwischenschritte
 * (Vorschau, Fertig mit Ergebnis) sind fachlich, keine Meldung.
 *
 * `leer` ist der Startwert von useActionState, `gespeichert` trägt die
 * Bestätigung als Satz, `fehler` die Meldung — nie stillschweigend neu laden.
 */
export type Aktionszustand =
  | { art: 'leer' }
  | { art: 'gespeichert'; text: string }
  | { art: 'fehler'; meldung: string }

export const AKTION_LEER: Aktionszustand = { art: 'leer' }
