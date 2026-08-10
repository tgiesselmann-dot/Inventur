'use client'

/**
 * Die Statuszeile der Startseite: liegt von der laufenden Zählung noch etwas
 * auf dem Gerät?
 *
 * Ein eigener kleiner Client-Baustein, weil die Startseite auf dem Server
 * rendert und der Warteschlangen-Stand nur im Browser liegt. Solange der
 * Speicher nicht gelesen ist, steht hier nichts — keine Auskunft ist besser
 * als eine, die gleich wieder umspringt.
 */

import { useSyncstatus } from '@/offline/verwenden'
import { Statuszeile } from '@/ui/statuszeile'

export function Synczeile({ zaehlungId }: { zaehlungId: string }) {
  const status = useSyncstatus(zaehlungId)
  if (status === null) return null
  return <Statuszeile status={status} />
}
