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
 *
 * Mit `aufUmschalten` wird die Überschrift zur Schaltfläche und klappt ihren
 * Abschnitt zu. Sie wächst dann auf 56 px — eine auslösende Fläche in
 * Zeilenhöhe wäre in einer Liste, durch die man mit dem Daumen scrollt, die
 * falsche Zusage. Ohne den Rückruf bleibt sie die Überschrift, die sie war;
 * die vier Listen, die nicht klappen, ändern sich dadurch nicht.
 *
 * Nummer, Titel und Stand bleiben zugeklappt stehen: „09 APERITIF 0 / 6" ist
 * genau die Auskunft, für die man eine zugeklappte Liste überfliegt.
 */

export function Abschnitt({
  titel,
  stand,
  nummer,
  zugeklappt = false,
  aufUmschalten,
}: {
  titel: string
  stand?: string
  /** Fertig formatiert, z. B. "07". Fehlt, wo die Liste keinen Laufweg hat. */
  nummer?: string
  zugeklappt?: boolean
  /** Fehlt, wo die Liste nicht klappt — dann ist die Überschrift keine Schaltfläche. */
  aufUmschalten?: () => void
}) {
  // Ohne Polsterung: die setzt jede der beiden Fassungen selbst. Stünde sie
  // hier, müsste die Schaltflächen-Fassung sie überschreiben, und welche der
  // beiden Klassen dann gewinnt, entscheidet die Reihenfolge im erzeugten
  // Stylesheet und nicht diese Datei.
  const rahmen =
    'sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface-2 text-abschnitt text-text-muted uppercase'

  const inhalt = (
    <>
      {nummer && <span className="shrink-0 font-mono font-normal tracking-normal">{nummer}</span>}
      <span className="flex-1 truncate text-left">{titel}</span>
      {stand && <span className="shrink-0">{stand}</span>}
    </>
  )

  if (aufUmschalten === undefined) {
    return <h2 className={`${rahmen} px-4 py-3`}>{inhalt}</h2>
  }

  return (
    <h2 className={rahmen}>
      <button
        type="button"
        onClick={aufUmschalten}
        aria-expanded={!zugeklappt}
        // `uppercase` steht hier noch einmal, obwohl die Überschrift es schon
        // trägt: Browser setzen auf button ein eigenes `text-transform: none`,
        // und das erbt nicht weg.
        className="tap focus-visible:fokus flex h-tap w-full items-center gap-3 px-4 uppercase"
      >
        {inhalt}
        {/* Der Pfeil steht rechts aussen und dreht sich, statt das Zeichen zu
            wechseln: ein Pfeil, der von ▾ auf ▸ springt, liest sich als zwei
            Zeichen, einer der sich dreht als dieselbe Klappe. */}
        <span
          aria-hidden
          className={`shrink-0 text-xs transition-transform ${zugeklappt ? '-rotate-90' : ''}`}
        >
          ▾
        </span>
      </button>
    </h2>
  )
}
