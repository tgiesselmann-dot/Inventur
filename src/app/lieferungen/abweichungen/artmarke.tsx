/**
 * Die Art einer Abweichung: ein Punkt in der Rollenfarbe und das Wort.
 *
 * Die Art trägt die Farbe, die Zeile bleibt weiss — fünf getönte Zeilen
 * nebeneinander wären ein Warnbild ohne Aussage; ein Punkt und ein Wort
 * reichen und bleiben auch beim Ausdruck lesbar. Welche Art welche Rolle
 * trägt, entscheidet `artrolle` in src/lib/reklamation.ts.
 */

import type { Abweichungsart } from '@/generated/prisma/enums'
import { arttext, artrolle } from '@/lib/reklamation'
import { ROLLEN } from '@/ui/rollen'

export function Artmarke({
  art,
  zusatz,
  gedeckt = false,
}: {
  art: Abweichungsart
  /** Hinter dem Wort, z. B. die Menge: "Fehlmenge · −2 Fässer". */
  zusatz?: string
  /** Für abgeschlossene Zeilen: Punkt und Wort ohne Farbe. */
  gedeckt?: boolean
}) {
  const rolle = artrolle(art)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-xs ${gedeckt ? 'bg-border' : ROLLEN[rolle].punkt}`}
      />
      <span
        className={`truncate text-sm font-medium ${gedeckt ? 'text-text-muted' : ROLLEN[rolle].text}`}
      >
        {arttext(art)}
        {zusatz && <span className="font-normal"> · {zusatz}</span>}
      </span>
    </span>
  )
}
