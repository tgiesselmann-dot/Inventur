/**
 * Die eine Stelle, an der aus einer gespeicherten Abweichung samt ihrer
 * Lieferposition ein `Vorgang` der Rechenstelle wird (src/lib/reklamation.ts).
 *
 * Übersicht und Detailansicht rechnen beide mit demselben Vorgang — stünde
 * diese Zuordnung in beiden Seiten, wären es zwei Stellen, an denen ein
 * Feldname veralten kann. Decimals werden hier zu Dezimaltext, wie überall an
 * dieser Grenze.
 */

import type { Abweichungsart } from '@/generated/prisma/enums'
import type { Vorgang } from '@/lib/reklamation'

import type { Decimal } from '@prisma/client/runtime/client'

type GespeichertePosition = {
  anzahlGebindeLieferschein: Decimal
  ekPreisCentLieferschein: number | null
  artikel: Vorgang['artikel']
}

export function alsVorgang(
  abweichung: { art: Abweichungsart; anzahlGebinde: Decimal },
  position: GespeichertePosition,
): Vorgang {
  return {
    art: abweichung.art,
    anzahlGebinde: abweichung.anzahlGebinde.toString(),
    anzahlGebindeLieferschein: position.anzahlGebindeLieferschein.toString(),
    ekPreisCentLieferschein: position.ekPreisCentLieferschein,
    artikel: position.artikel,
  }
}
