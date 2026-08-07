'use client'

/**
 * Die Liste aller Artikel: der Ausweg aus der Fokusansicht.
 *
 * Sie beantwortet drei Fragen, die die Fokusansicht nicht beantworten kann: Was
 * fehlt noch? Was habe ich bei Artikel 60 eingetragen? Und: wie komme ich
 * dorthin zurück, ohne sechzig Mal "weiter" zu tippen. Jede Zeile ist antippbar
 * und 56px hoch.
 *
 * Die Kategorien erscheinen als Abschnitte in der Reihenfolge des Laufwegs, und
 * dieselbe Kategorie taucht dabei mehrfach auf, wenn der Weg mehrfach an ihr
 * vorbeiführt. Im Stadthafener Stamm zerfallen 14 Kategorien so in 26
 * Abschnitte — das ist keine Unordnung, sondern das Lager.
 */

import { abschnitte, alsEingabe, felder, type ZaehlArtikel } from '@/lib/zaehlung'
import { istOffen, type Eintrag } from '@/offline/warteschlange'

type Props = {
  artikel: ZaehlArtikel[]
  eintraege: ReadonlyMap<string, Eintrag>
  erfasst: ReadonlySet<string>
  offen: ZaehlArtikel[]
  /** Was der Server beim letzten Abschlussversuch vermisst hat. null: kein Versuch. */
  fehlendNachAbschluss: ZaehlArtikel[] | null
  alleErfasst: boolean
  abgeschlossen: boolean
  schliesst: boolean
  aufArtikel: (index: number) => void
  aufAbschluss: () => void
}

export function Uebersicht({
  artikel,
  eintraege,
  erfasst,
  offen,
  fehlendNachAbschluss,
  alleErfasst,
  abgeschlossen,
  schliesst,
  aufArtikel,
  aufAbschluss,
}: Props) {
  const blocks = abschnitte(artikel)
  const vermisst = new Set((fehlendNachAbschluss ?? []).map((eintrag) => eintrag.id))

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {fehlendNachAbschluss !== null && fehlendNachAbschluss.length > 0 && (
          <p className="bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Der Abschluss ist noch nicht möglich: {fehlendNachAbschluss.length} Artikel ohne Wert.
            Sie sind unten hervorgehoben.
          </p>
        )}
        {fehlendNachAbschluss !== null && fehlendNachAbschluss.length === 0 && (
          <p className="bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Der Abschluss hat nicht geklappt. Sobald wieder Netz da ist, erneut versuchen.
          </p>
        )}

        {offen.length > 0 && (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            {offen.length === 1 ? '1 Artikel fehlt noch' : `${offen.length} Artikel fehlen noch`}
          </p>
        )}

        {blocks.map((block) => (
          <section key={`${block.kategorie}-${block.ab}`}>
            <h2 className="sticky top-0 bg-zinc-100 px-4 py-1.5 text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:bg-zinc-900 dark:text-zinc-400">
              {block.kategorie}
            </h2>
            <ul>
              {block.artikel.map((eintrag, versatz) => (
                <Zeile
                  key={eintrag.id}
                  artikel={eintrag}
                  eintrag={eintraege.get(eintrag.id)}
                  gezaehlt={erfasst.has(eintrag.id)}
                  vermisst={vermisst.has(eintrag.id)}
                  aufKlick={() => aufArtikel(block.ab + versatz)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {!abgeschlossen && (
        <div className="shrink-0 border-t border-zinc-200 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-zinc-800">
          <button
            type="button"
            className="h-14 w-full rounded-xl bg-emerald-600 text-base font-medium text-white disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            onClick={aufAbschluss}
            disabled={!alleErfasst || schliesst}
          >
            {schliesst
              ? 'Wird abgeschlossen…'
              : alleErfasst
                ? 'Zählung abschliessen'
                : `Noch ${offen.length} zu zählen`}
          </button>
        </div>
      )}
      {abgeschlossen && (
        <p className="shrink-0 border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Diese Zählung ist abgeschlossen.
        </p>
      )}
    </>
  )
}

function Zeile({
  artikel,
  eintrag,
  gezaehlt,
  vermisst,
  aufKlick,
}: {
  artikel: ZaehlArtikel
  eintrag: Eintrag | undefined
  gezaehlt: boolean
  vermisst: boolean
  aufKlick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={aufKlick}
        className={`flex h-14 w-full items-center gap-3 px-4 text-left ${
          vermisst ? 'bg-amber-50 dark:bg-amber-950/40' : ''
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base">{artikel.name}</span>
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {artikel.lieferGebindeText}
            {!artikel.schwundfaehig && ' · ohne Schwundrechnung'}
          </span>
        </span>

        <span className="shrink-0 text-right text-base tabular-nums">
          {gezaehlt ? (
            wertText(artikel, eintrag)
          ) : (
            <span className="text-zinc-300 dark:text-zinc-600">—</span>
          )}
        </span>

        {/* Ein Punkt für "liegt noch auf dem Gerät". Kein Punkt heisst
            angekommen — der Normalfall soll nicht blinken. */}
        <span
          className={`size-2 shrink-0 rounded-full ${
            eintrag !== undefined && istOffen(eintrag) ? 'bg-amber-500' : 'bg-transparent'
          }`}
          aria-label={eintrag !== undefined && istOffen(eintrag) ? 'wartet auf Netz' : undefined}
        />
      </button>
    </li>
  )
}

/** Der gezählte Wert in der Schreibweise seines Zählmodus. */
function wertText(artikel: ZaehlArtikel, eintrag: Eintrag | undefined): string {
  if (eintrag === undefined) return '—'
  return felder(artikel)
    .map((feld) => alsEingabe(eintrag[feld.name]))
    .join(' + ')
}
