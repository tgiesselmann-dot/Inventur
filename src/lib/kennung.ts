/**
 * Kennungen, wie sie in den Pfaden stehen.
 *
 * Die [id]-Routen fangen jedes Pfadstück unter ihrem Segment — /artikel/liste
 * kommt dort als id "liste" an. Ungeprüft weitergereicht scheitert die
 * Datenbankabfrage an der ungültigen UUID, und aus einem Tippfehler in der
 * Adresszeile wird eine Fehlerseite statt "Nicht gefunden".
 */

const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Hat das Pfadstück die Form einer UUID? */
export function istKennung(wert: string): boolean {
  return UUID_FORM.test(wert)
}
