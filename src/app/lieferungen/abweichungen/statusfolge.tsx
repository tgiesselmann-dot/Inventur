/**
 * Die Statusfolge einer Abweichung: vier schmale Segmente, gefüllt bis zum
 * erreichten Schritt, daneben der Status als Wort.
 *
 * Keine Ampel: eine Ampel sagt nur gut oder schlecht, und hier zählt, wie
 * weit die Sache ist. Wie viele Segmente gefüllt sind, entscheidet
 * `statusstufe` in src/lib/reklamation.ts — die Komponente zeigt nur.
 *
 * Verworfen bleibt ganz leer: das ist das Verlassen des Weges, kein Schritt
 * darauf. Die Farbe steht nie allein — das Wort daneben trägt die Aussage
 * auch ohne sie.
 */

import type { Abweichungsstatus } from '@/generated/prisma/enums'
import { istAktiv, statusstufe, statustext, STATUSSTUFEN } from '@/lib/reklamation'

/** Farbe der gefüllten Segmente und des Wortes, je nach erreichtem Schritt. */
function fassung(status: Abweichungsstatus): { segment: string; wort: string } {
  if (!istAktiv(status)) {
    return statusstufe(status) === STATUSSTUFEN
      ? { segment: 'bg-confirm', wort: 'text-confirm-text' }
      : { segment: 'bg-border', wort: 'text-text-muted' }
  }
  // Der erste Schritt ist noch keine Bewegung: offen bleibt grau, erst die
  // Reklamation färbt den Weg in die Farbe des Vorgangs.
  return statusstufe(status) === 1
    ? { segment: 'bg-text-muted', wort: 'text-text' }
    : { segment: 'bg-primary-text', wort: 'text-primary-text' }
}

export function Statusfolge({
  status,
  zusatz,
  knapp = false,
}: {
  status: Abweichungsstatus
  /** Hinter dem Wort, z. B. "seit 16.07." — fertig formatiert. */
  zusatz?: string
  /** Schmalere Segmente für die Listenzeile auf dem Telefon. */
  knapp?: boolean
}) {
  const { segment, wort } = fassung(status)
  const stufe = statusstufe(status)

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className="flex shrink-0 gap-[3px]">
        {Array.from({ length: STATUSSTUFEN }, (_, index) => (
          <span
            key={index}
            className={`${knapp ? 'w-3.5' : 'w-6'} h-[5px] rounded-xs ${
              index < stufe ? segment : 'bg-border'
            }`}
          />
        ))}
      </span>
      <span className={`truncate text-abschnitt font-medium tracking-normal ${wort}`}>
        {statustext(status)}
        {zusatz && <span className="font-normal"> · {zusatz}</span>}
      </span>
    </span>
  )
}
