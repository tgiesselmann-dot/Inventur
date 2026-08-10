'use client'

/**
 * Ware, die nicht auf dem Lieferschein steht — oder ein anderer Artikel als der
 * bestellte.
 *
 * Aus pruefmaske.tsx herausgelöst. Der Artikelstamm kommt fertig geladen an;
 * gesucht wird auf dem Gerät, damit an der Rampe niemand auf eine Netzantwort
 * wartet.
 *
 * Jede Trefferzeile trägt ihr Liefergebinde, weil zwei Artikel oft denselben
 * Namen haben und sich nur darin unterscheiden — ohne das Gebinde wäre die Wahl
 * geraten. Was schon in der Liste steht, bleibt sichtbar und antippbar: der
 * Vermerk verhindert die doppelte Position, ohne die Zeile zu verstecken.
 */

import { useMemo, useState } from 'react'

import type { WareneingangArtikel } from '@/lib/wareneingang'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss } from '@/ui/vollbild'

export function Artikelsuche({
  stamm,
  bereitsErfasst,
  ersetzt,
  aufAbbruch,
  aufWahl,
}: {
  stamm: WareneingangArtikel[]
  bereitsErfasst: ReadonlySet<string>
  /** Id der Zeile, deren Artikel ersetzt wird. null: neue Position. */
  ersetzt: string | null
  aufAbbruch: () => void
  aufWahl: (artikel: WareneingangArtikel) => void
}) {
  const [suche, setSuche] = useState('')

  const treffer = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (begriff === '') return []
    return stamm
      .filter((artikel) => artikel.name.toLowerCase().includes(begriff))
      .slice(0, 20)
  }, [stamm, suche])

  return (
    <>
      <div className="shrink-0 border-b border-border bg-surface px-4 pt-2 pb-3">
        {ersetzt !== null && (
          <p className="pb-2 text-sm text-text-muted">
            Welcher Artikel steht statt des bestellten auf der Palette?
          </p>
        )}
        {/* Das einzige Eingabefeld des Bildschirms und immer im Zugriff —
            deshalb trägt es den aktiven Rahmen dauerhaft und nicht erst im
            Fokus. */}
        <input
          autoFocus
          value={suche}
          onChange={(ereignis) => setSuche(ereignis.target.value)}
          placeholder="Artikel suchen"
          aria-label="Artikel suchen"
          className="h-tap w-full rounded-ctl border-2 border-primary bg-primary-soft px-4 text-lg font-medium text-text placeholder:font-normal placeholder:text-text-muted"
        />
      </div>

      <ul className="flex-1 divide-y divide-border overflow-y-auto bg-surface">
        {treffer.map((artikel) => {
          const schonErfasst = ersetzt === null && bereitsErfasst.has(artikel.id)
          return (
            <li key={artikel.id}>
              <button
                type="button"
                onClick={() => aufWahl(artikel)}
                className="tap flex h-tap w-full items-center px-4 text-left focus-visible:fokus"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-zeile ${schonErfasst ? 'text-text-muted' : 'text-text'}`}
                  >
                    {artikel.name}
                  </span>
                  <span className="block truncate text-sm text-text-muted">
                    {artikel.lieferGebindeText}
                    {schonErfasst && ' · steht schon in der Liste'}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Maskenfuss>
        <Schaltflaeche art="sekundaer" breit onClick={aufAbbruch}>
          Abbrechen
        </Schaltflaeche>
      </Maskenfuss>
    </>
  )
}
