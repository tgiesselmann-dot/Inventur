/**
 * Der Anschluss eines Imports an den davor, als Leiste und als Zeilenmarke.
 *
 * Eigene, grössere Form statt src/ui/hinweisleiste.tsx: der Titel steht hier
 * in text-titel, denn „Lückenlos" ist die Aussage, wegen der jemand diese
 * Maske überhaupt aufmacht — sie wegzulassen hiesse, das Ausbleiben einer
 * Warnung als Auskunft zu verkaufen, und ein ausgebliebener Hinweis ist von
 * einem vergessenen nicht zu unterscheiden. Die Farben kommen aus rollen.ts,
 * nur die Form ist eigen.
 *
 * Gerechnet wird hier nichts: Stufe, Titel und Erklärsatz kommen fertig aus
 * src/lib/importkette.ts.
 */

import type { Anschlussanzeige } from '@/lib/importkette'
import { ROLLEN } from '@/ui/rollen'

/**
 * Die grosse Form: im Schritt, in dem der Zeitraum bestätigt wird.
 *
 * Der Titel steht in der Stufe des Befundes und ist so gross wie die Frage:
 * fehlende oder doppelte Tage zerlegen jede Schwundrechnung, die über sie
 * hinweggeht, und sollen hier auffallen und nicht erst in der Auswertung.
 */
export function Anschlussleiste({
  anschluss,
  aktion,
}: {
  anschluss: Anschlussanzeige
  aktion?: React.ReactNode
}) {
  const fassung = ROLLEN[anschluss.stufe]

  return (
    <div className={`flex flex-wrap items-start gap-4 rounded-ctl p-4 ${fassung.flaeche}`}>
      <span aria-hidden className={`mt-2 size-3 shrink-0 rounded-full ${fassung.punkt}`} />
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <p className="text-titel">{anschluss.titel}</p>
        <p className="max-w-[70ch] text-base leading-relaxed">{anschluss.erklaerung}</p>
      </div>
      {aktion}
    </div>
  )
}

/**
 * Ein Balken der Kette: ein Import oder eine Lücke zwischen zweien.
 *
 * Fertig gerechnet aus src/lib/importkette.ts — `tage` ist die Breite, mehr
 * entscheidet die Anzeige nicht.
 */
export type Kettenbalken = {
  art: 'import' | 'luecke' | 'dieser'
  beschriftung: string
  tage: number
}

/**
 * Die Kette als Balkenreihe: jeder Balken ein Import, die Breite sind Tage.
 *
 * Sie sagt dasselbe wie die Leiste darüber, nur räumlich: eine Lücke ist ein
 * Loch zwischen zwei Flächen, und wo die Kette dicht ist, sieht man das auf
 * einen Blick. Der Zeitraum, der gerade geprüft wird, steht am rechten Ende.
 */
export function Importkette({ balken }: { balken: Kettenbalken[] }) {
  if (balken.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-ctl border border-border p-3">
      <div className="flex h-11 items-stretch gap-1">
        {balken.map((eintrag, index) => (
          <span
            key={index}
            style={{ flexGrow: Math.max(1, eintrag.tage) }}
            className={`flex min-w-0 items-center justify-center overflow-hidden rounded-ctl px-1 text-sm ${
              eintrag.art === 'luecke'
                ? 'border border-dashed border-danger bg-danger-soft font-semibold text-danger-soft-on'
                : eintrag.art === 'dieser'
                  ? 'border-2 border-primary bg-primary-soft font-semibold text-primary-soft-on'
                  : 'border border-border bg-surface-2 text-text-muted'
            }`}
          >
            <span className="truncate">{eintrag.beschriftung}</span>
          </span>
        ))}
      </div>
      <p className="text-sm text-text-muted">
        Jeder Balken ist ein Import, die Breite sind Tage. Eine gestrichelte Fläche ist ein
        Zeitraum, den kein Import abdeckt — sie trifft jede Auswertung, die über sie hinweg rechnet.
      </p>
    </div>
  )
}

/** Die kleine Form: eine Zeile der Importliste. */
export function Anschlussmarke({ anschluss }: { anschluss: Anschlussanzeige }) {
  const fassung = ROLLEN[anschluss.stufe]

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${fassung.punkt}`} />
      <span className={`min-w-0 text-sm font-medium ${fassung.text}`}>{anschluss.titel}</span>
    </span>
  )
}
