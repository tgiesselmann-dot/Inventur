/**
 * Die Abschnittsüberschrift einer Liste: Versalien auf gedeckter Fläche, klebt
 * beim Scrollen oben.
 *
 * Sticky, weil die Frage im Lager "wo bin ich im Laufweg" lautet — die Antwort
 * muss stehen bleiben, während die Zeilen darunter durchlaufen. Der Stand
 * ("4 / 6") kommt fertig gerechnet an.
 *
 * Die Nummer links ist die Station im Laufweg, nicht die Nummer der Kategorie.
 * Sie ist da, wo dieselbe Kategorie mehrfach in einer Liste steht — dann sagt
 * erst sie, an welchem der drei Wasserregale man gerade steht. In Mono, weil
 * zwei Ziffern in Proportionalschrift je nach Zahl unterschiedlich breit sind
 * und die Überschriften dann nicht mehr untereinander fluchten.
 */

export function Abschnitt({
  titel,
  stand,
  nummer,
}: {
  titel: string
  stand?: string
  /** Fertig formatiert, z. B. "07". Fehlt, wo die Liste keinen Laufweg hat. */
  nummer?: string
}) {
  return (
    <h2 className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3 text-abschnitt text-text-muted uppercase">
      {nummer && <span className="shrink-0 font-mono font-normal tracking-normal">{nummer}</span>}
      <span className="flex-1 truncate">{titel}</span>
      {stand && <span className="shrink-0">{stand}</span>}
    </h2>
  )
}
