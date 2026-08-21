/**
 * Reiht die Sends einer Erfassungsmaske je logischer Zeile hintereinander.
 *
 * Der Wareneingang schickt jede Änderung sofort los und wartet nicht auf die
 * Antwort. Bei einer neuen Zeile ist das gefährlich: bis der Server ihre Id
 * vergeben hat, trägt sie eine vorläufige Kennung — zwei schnelle Änderungen
 * hintereinander gingen als zwei „lege neu an" hinaus, und aus einer Palette
 * würden zwei Lieferpositionen. Der Doppelbestand ginge als Ware in die
 * Bewertung.
 *
 * Deshalb läuft je Zeile immer nur ein Send; der nächste startet erst nach der
 * Antwort und bekommt die inzwischen vergebene Id mit. Die vorläufige Kennung
 * bleibt der Schlüssel der Kette, auch nachdem die Maske die Zeile auf die
 * echte Id umgeschrieben hat — sonst liefen alter und neuer Schlüssel als zwei
 * Ketten nebeneinander, und genau die Überholung wäre wieder da.
 *
 * Bewusst ohne React: die Regel, an der eine Rampe scheitern kann, soll ohne
 * laufenden Browser prüfbar sein. Die Masken halten eine Instanz je Besuch.
 */

export type Zeilenversand = {
  /**
   * Hängt `arbeit` hinter alle laufenden Sends derselben Zeile. `arbeit`
   * bekommt die vom Server vergebene Id, falls die Zeile als neue begann und
   * inzwischen eine hat — sonst null. Fehler einer Arbeit reissen die Kette
   * nicht ab; der nächste Send läuft trotzdem.
   */
  reihe(zeilenId: string, arbeit: (vergebeneId: string | null) => Promise<void>): Promise<void>
  /** Trägt die vom Server vergebene Id einer neu angelegten Zeile nach. */
  vergeben(zeilenId: string, id: string): void
}

export function zeilenversand(): Zeilenversand {
  const ketten = new Map<string, Promise<void>>()
  /** Kettenschlüssel → vom Server vergebene Id. */
  const echteId = new Map<string, string>()
  /** Vergebene Id → Kettenschlüssel, unter dem die Zeile begann. */
  const urspruenglich = new Map<string, string>()

  const schluesselVon = (zeilenId: string) => urspruenglich.get(zeilenId) ?? zeilenId

  return {
    reihe(zeilenId, arbeit) {
      const schluessel = schluesselVon(zeilenId)
      // Die vergebene Id wird erst gelesen, wenn die Arbeit drankommt — beim
      // Einreihen ist die Antwort des Vorgängers ja noch unterwegs.
      const kette = (ketten.get(schluessel) ?? Promise.resolve()).then(() =>
        arbeit(echteId.get(schluessel) ?? null),
      )
      // Gespeichert wird die verschluckte Fassung: ein Wurf gehört dem, der
      // eingereiht hat, und darf nicht als unbehandelte Ablehnung liegenbleiben.
      ketten.set(
        schluessel,
        kette.catch(() => undefined),
      )
      return kette
    },

    vergeben(zeilenId, id) {
      const schluessel = schluesselVon(zeilenId)
      echteId.set(schluessel, id)
      urspruenglich.set(id, schluessel)
    },
  }
}
