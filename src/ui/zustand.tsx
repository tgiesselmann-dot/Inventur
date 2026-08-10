/**
 * Leerzustand und Ladezustand einer Liste.
 *
 * Beide sagen, wie es weitergeht: der Leerzustand mit genau einer Handlung,
 * der Ladezustand, indem er die Zeilenmasse der Listenzeile hält — beim
 * Eintreffen der Daten springt nichts.
 *
 * Die Balken pulsieren nicht. Die einzige Animation des Produkts ist die
 * Rückmeldung beim Tippen (globals.css) — ein Ladezustand, der Aufmerksamkeit
 * fordert, hilft niemandem beim Warten.
 */

import type { ReactNode } from 'react'

export function Leerzustand({
  titel,
  erklaerung,
  handlung,
  titelAls: Titel = 'p',
}: {
  titel: string
  /** Warum hier nichts steht — als Auskunft, nicht als Entschuldigung. */
  erklaerung: string
  /**
   * Genau eine nächste Handlung: eine Schaltfläche oder ein Link.
   *
   * Fehlt dort, wo die Maske sie ins untere Drittel legt — auf dem Telefon
   * liegt alles Auslösende über dem Daumen, nicht in der Mitte des Bildschirms.
   * Die Karte trägt dann nur die Aussage.
   */
  handlung?: ReactNode
  /** 'h1', wenn die Karte eine ganze Seite trägt (Hinweisseite) — eine Seite braucht ihre Überschrift. */
  titelAls?: 'p' | 'h1'
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-ctl border border-border bg-surface px-6 py-8 text-center">
      <div aria-hidden className="size-11 rounded-ctl border-2 border-dashed border-border-strong" />
      <Titel className="mt-1 text-zeile font-semibold">{titel}</Titel>
      <p className="max-w-[38ch] text-sm text-text-muted">{erklaerung}</p>
      {handlung && <div className="mt-2">{handlung}</div>}
    </div>
  )
}

/* Verschiedene Balkenbreiten je Zeile: drei gleiche Zeilen sähen aus wie ein
   eingefrorenes Bild, nicht wie eine kommende Liste. */
const BREITEN = [
  ['w-1/2', 'w-1/4'],
  ['w-2/3', 'w-1/5'],
  ['w-2/5', 'w-1/3'],
] as const

export function Ladezustand({ zeilen = 3 }: { zeilen?: number }) {
  return (
    <div role="status" className="flex flex-col gap-tapgap">
      <span className="sr-only">Wird geladen …</span>
      {Array.from({ length: zeilen }, (_, i) => {
        const [titel, unterzeile] = BREITEN[i % BREITEN.length]
        return (
          <div key={i} aria-hidden className="flex min-h-tap items-center gap-3.5 rounded-ctl border border-border bg-surface px-4 py-2">
            <div className="flex flex-1 flex-col gap-2">
              <div className={`h-3.5 rounded bg-border ${titel}`} />
              <div className={`h-3 rounded bg-surface-2 ${unterzeile}`} />
            </div>
            <div className="h-3.5 w-8 rounded bg-border" />
          </div>
        )
      })}
    </div>
  )
}
