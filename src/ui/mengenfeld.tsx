'use client'

/**
 * Das Eingabefeld für eine Menge in ganzen Gebinden.
 *
 * Mit Tasten auf dem Telefon, ohne am Laptop: der Daumen zählt hoch, die Maus
 * tippt die Zahl. Drei Flächen je Zeile wären auf dem Desktop breiter als die
 * Wertspalte und würden sie aus dem Bild schieben. Die Masse bleiben in beiden
 * Fassungen dieselben: 56 px Feldhöhe und 8 px zwischen den Flächen — ein
 * Baustein, der kleiner geriete, trüge den Fehler in jede Bestellmaske.
 *
 * Steht unter src/ui, weil zwei Masken es brauchen — der Bestellvorschlag und
 * die Positionsliste einer gespeicherten Bestellung. Zwei Fassungen desselben
 * Feldes würden auseinanderlaufen, sobald eine davon eine Untergrenze bekommt.
 *
 * `mindestens` ist genau so eine: eine Zeile, auf die schon geliefert wurde,
 * lässt sich nicht mehr streichen, also darf ihre Menge nicht auf 0 fallen.
 *
 * Im Ausdruck bleibt nur die Zahl stehen — die Regeln dafür stecken im
 * `@media print`-Block in globals.css.
 */

export function Mengenfeld({
  menge,
  setzen,
  feldId,
  bezeichnung,
  mitTasten,
  mindestens = 0,
  gesperrt = false,
}: {
  menge: number
  setzen: (wert: number) => void
  /**
   * Eindeutig je Zeile — die Artikel-Id, nie der Name. Derselbe Artikelname kommt
   * in mehreren Gebindegrössen vor ("Coca Cola 12 x 1,0" und "24 x 0,33"), und
   * zwei Felder mit derselben Id sind zwei Felder, von denen die Beschriftung nur
   * eines trifft.
   */
  feldId: string
  /** Für die Beschriftung — Artikelname samt Gebinde. */
  bezeichnung: string
  mitTasten: boolean
  /** Untergrenze der Menge. 0 heisst: die Zeile darf gestrichen werden. */
  mindestens?: number
  /** Nur lesen — die Bestellung ist zu. */
  gesperrt?: boolean
}) {
  if (gesperrt) {
    return <span className="text-base font-semibold tabular-nums">{menge}</span>
  }

  const setzeGekappt = (wert: number) => setzen(Math.max(mindestens, Math.trunc(wert)))

  return (
    <span className="inline-flex items-center gap-tapgap">
      {mitTasten && (
        <button
          type="button"
          onClick={() => setzeGekappt(menge - 1)}
          disabled={menge <= mindestens}
          aria-label={`${bezeichnung}: eins weniger`}
          className="tap nur-schirm h-tap w-tap shrink-0 rounded-ctl bg-surface-2 text-lg disabled:opacity-40"
        >
          −
        </button>
      )}
      <label className="sr-only" htmlFor={`menge-${feldId}`}>
        Menge {bezeichnung}
      </label>
      <input
        id={`menge-${feldId}`}
        type="text"
        inputMode="numeric"
        value={String(menge)}
        onChange={(ereignis) => {
          const wert = ereignis.target.value.trim()
          setzeGekappt(wert === '' ? mindestens : Number(wert.replace(/[^\d]/g, '')))
        }}
        className="h-tap w-14 rounded-ctl border border-border-strong bg-surface px-2 text-right text-base font-semibold tabular-nums"
      />
      {mitTasten && (
        <button
          type="button"
          onClick={() => setzeGekappt(menge + 1)}
          aria-label={`${bezeichnung}: eins mehr`}
          className="tap nur-schirm h-tap w-tap shrink-0 rounded-ctl bg-surface-2 text-lg"
        >
          +
        </button>
      )}
    </span>
  )
}
