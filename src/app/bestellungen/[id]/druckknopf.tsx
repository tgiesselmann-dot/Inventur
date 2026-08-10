'use client'

/**
 * Öffnet den Druckdialog. Eine eigene Datei, weil `window.print` das Einzige an
 * dieser Seite ist, das einen Browser braucht — der Rest der Bestellung wird auf
 * dem Server gerendert.
 *
 * Die Druckfassung selbst steckt nicht hier, sondern in den Regeln unter
 * `@media print` in globals.css: gedruckt wird dieselbe Seite ohne ihre
 * Bedienelemente. Eine zweite Vorlage für den Ausdruck wäre eine zweite Stelle,
 * an der sich eine Spalte ändern müsste.
 */

export function Druckknopf() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="tap h-tap rounded-ctl bg-surface-2 px-4 text-base font-medium"
    >
      Drucken
    </button>
  )
}
