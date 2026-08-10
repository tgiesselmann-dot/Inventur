/**
 * Die Hinweisleiste in voller Breite: getönte Fläche, Punkt, ein Titel, ein
 * Erklärsatz.
 *
 * Vier Rollen: Achtung für "liegt noch auf dem Gerät", Warnung für Fehlbestand
 * und "nicht bewertbar", Bestätigung für den abgeschlossenen Import — dort ist
 * das Ergebnis selbst nicht auf dem Schirm, also muss die Leiste es sagen —
 * und Neutral für die Auskunft ohne Befund.
 *
 * Randlos auf der gedeckten Fläche: ein eigener Rand je Rolle wäre ein neues
 * Token für einen Zierstrich. Und beide Zeilen stehen in einer Textstufe
 * (*-soft-on) — der Entwurf mischt zwei Töne, von denen nur einer AA hält.
 */

import type { ReactNode } from 'react'
import { ROLLEN } from './rollen'

export function Hinweisleiste({
  rolle,
  titel,
  aktion,
  children,
}: {
  rolle: 'attention' | 'danger' | 'confirm' | 'neutral'
  titel: string
  /**
   * Der Weg aus dem Hinweis heraus, als Fläche am rechten Rand.
   *
   * Wo eine Leiste sagt, dass etwas fehlt, gehört der Weg dorthin in dieselbe
   * Leiste — als Fläche, nicht als Link im Fliesstext. Optional, weil nicht
   * jeder Hinweis eine Handlung hat.
   */
  aktion?: ReactNode
  /** Der Erklärsatz: was das heisst und was jetzt geht. */
  children?: ReactNode
}) {
  const fassung = ROLLEN[rolle]
  return (
    <div
      className={`flex w-full flex-wrap items-start gap-3 rounded-ctl px-4 py-3.5 ${fassung.flaeche}`}
    >
      <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${fassung.punkt}`} />
      {/* basis-64: bleibt für die Aktion weniger als das übrig, rutscht sie in
          die nächste Zeile, statt den Titel in eine Spalte zu quetschen. */}
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <p className="text-sm font-semibold">{titel}</p>
        {children && <p className="text-sm">{children}</p>}
      </div>
      {aktion}
    </div>
  )
}
