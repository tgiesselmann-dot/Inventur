'use client'

/**
 * Die Artikelliste: Suche, Kategorie, Stand — und je Breite eine eigene Form.
 *
 * Auf dem Laptop eine Tabelle mit sechs Spalten und 56-px-Zeilen, auf dem
 * Telefon zwei Zeilen je Artikel: Name und Gebinde nebeneinander, alles Weitere
 * in der Unterzeile. Das Liefergebinde steht in beiden Formen direkt neben dem
 * Namen und wird nie weggekürzt — „Coca Cola 12 x 1,0" und „Coca Cola
 * 24 x 0,33" sind zwei Artikel, und erst das Gebinde sagt, welcher gemeint ist.
 *
 * Stillgelegte Artikel bleiben sichtbar, ausgegraut und mit Merkmal: an ihnen
 * hängen Zählungen und Lieferungen, gelöscht wird hier nie.
 *
 * Gefiltert wird mit src/lib/artikelstamm.ts, gezeigt werden fertige Texte —
 * gerechnet wird hier nichts.
 */

import Link from 'next/link'
import { useState } from 'react'

import {
  gefiltert,
  standzahlen,
  type Listenzeile,
  type Standfilter,
} from '@/lib/artikelstamm'
import { FELD } from '@/ui/feld'
import { Umschalter, Umschaltersegment } from '@/ui/umschalter'
import { Leerzustand } from '@/ui/zustand'
import { Modusumschalter } from '@/ui/modus'
import { Wegflaeche } from '@/ui/wegflaeche'

/** Die sechs Spalten der Tabelle — Kopf und Zeilen müssen dieselben tragen. */
const SPALTEN =
  'md:grid md:grid-cols-[minmax(0,1fr)_132px_150px_160px_150px_88px] md:items-center md:gap-4'

export function Artikelliste({
  zeilen,
  alleKategorien,
}: {
  zeilen: Listenzeile[]
  alleKategorien: string[]
}) {
  const [suche, setSuche] = useState('')
  const [kategorie, setKategorie] = useState('')
  const [stand, setStand] = useState<Standfilter>('alle')

  const sichtbar = gefiltert(zeilen, { suche, kategorie, stand })
  const zahlen = standzahlen(zeilen)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col p-4 pb-32 md:pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Artikelstamm</h1>
        <div className="flex items-center gap-tapgap">
          {/* Import ist Laptop-Arbeit: die CSV liegt dort, wo die Excel gepflegt
              wurde. Auf dem Telefon bleibt der Kopf deshalb beim Anlegen. */}
          <div className="hidden items-center gap-tapgap md:flex">
            <Wegflaeche href="/artikel/import" art="sekundaer">
              CSV importieren
            </Wegflaeche>
            <Wegflaeche href="/artikel/neu">Neuer Artikel</Wegflaeche>
          </div>
          <Modusumschalter className="md:hidden" />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-tapgap">
        <input
          type="search"
          value={suche}
          onChange={(ereignis) => setSuche(ereignis.target.value)}
          placeholder="Name oder Gebinde suchen"
          aria-label="Name oder Gebinde suchen"
          className={FELD}
        />
        <div className="flex flex-wrap items-center gap-tapgap">
          <Umschalter beschriftung="Nach Stand filtern">
            <Umschaltersegment aktiv={stand === 'alle'} aufTipp={() => setStand('alle')}>
              Alle {zahlen.alle}
            </Umschaltersegment>
            <Umschaltersegment aktiv={stand === 'aktiv'} aufTipp={() => setStand('aktiv')}>
              Aktiv {zahlen.aktiv}
            </Umschaltersegment>
            <Umschaltersegment aktiv={stand === 'stillgelegt'} aufTipp={() => setStand('stillgelegt')}>
              Stillgelegt {zahlen.stillgelegt}
            </Umschaltersegment>
          </Umschalter>
          <select
            value={kategorie}
            onChange={(ereignis) => setKategorie(ereignis.target.value)}
            aria-label="Nach Kategorie filtern"
            className="h-tap rounded-ctl border border-border-strong bg-surface px-3 text-base text-text focus:outline-2 focus:-outline-offset-1 focus:outline-focus"
          >
            <option value="">Kategorie · alle</option>
            {alleKategorien.map((eintrag) => (
              <option key={eintrag} value={eintrag}>
                {eintrag}
              </option>
            ))}
          </select>
          <p className="ml-auto hidden text-sm text-text-muted lg:block">
            Sortiert nach Sortiernummer — der Laufweg durch das Lager
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-tapgap">
        <div
          aria-hidden
          className={`hidden h-10 rounded-ctl border border-border bg-surface-2 px-4 text-beschriftung text-text-muted uppercase ${SPALTEN}`}
        >
          <span>Name</span>
          <span>Liefergebinde</span>
          <span>Kategorie</span>
          <span>Zählmodus</span>
          <span className="text-right">Einkaufspreis</span>
          <span className="text-right">Sortier-Nr.</span>
        </div>

        {sichtbar.length === 0 ? (
          <Leerzustand
            titel="Kein Artikel passt"
            erklaerung={'Die Suche greift auf Name und Liefergebinde zu. Stillgelegte Artikel erscheinen unter „Alle" und „Stillgelegt".'}
          />
        ) : (
          <ul className="flex flex-col gap-tapgap">
            {sichtbar.map((zeile) => (
              <li key={zeile.id}>
                <Zeile zeile={zeile} />
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-center px-4 text-sm text-text-muted">
          {sichtbar.length} von {zeilen.length} Artikeln
        </p>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface px-4 pt-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:hidden">
        <Wegflaeche href="/artikel/neu" breit>
          Neuer Artikel
        </Wegflaeche>
      </footer>
    </main>
  )
}

/**
 * Eine Zeile, in beiden Formen. Stillgelegt heisst: gedeckte Fläche, gedämpfte
 * Schrift, Merkmal neben dem Namen — aber dieselbe Zeile, derselbe Weg in die
 * Detailansicht.
 */
function Zeile({ zeile }: { zeile: Listenzeile }) {
  const gedaempft = zeile.aktiv ? 'bg-surface' : 'bg-bg text-text-muted'

  return (
    <Link
      href={`/artikel/${zeile.id}`}
      className={`tap flex min-h-tap items-center gap-3 rounded-ctl border border-border px-4 py-2 hover:bg-bg focus-visible:fokus md:py-0 ${SPALTEN} ${gedaempft}`}
    >
      {/* Name + Gebinde: auf dem Telefon nebeneinander, das Gebinde nie gekürzt. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-none">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={`truncate text-zeile ${zeile.aktiv ? 'text-text' : ''}`}>
            {zeile.name}
          </span>
          {!zeile.aktiv && (
            <span className="shrink-0 rounded-sm border border-border-strong px-1.5 py-px text-[11px] font-medium tracking-wide text-text-muted uppercase">
              stillgelegt
            </span>
          )}
          <span className="shrink-0 font-mono text-abschnitt font-normal tracking-normal md:hidden">
            {zeile.lieferGebindeText}
          </span>
        </span>
        <span className="truncate text-sm text-text-muted md:hidden">
          {zeile.kategorie} · {zeile.modus}
          {zeile.preis !== null && ` · ${zeile.preis.haupt}`}
        </span>
      </span>

      <span className="hidden justify-self-start rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-abschnitt font-normal tracking-normal md:inline-block">
        {zeile.lieferGebindeText}
      </span>
      <span className="hidden truncate text-sm md:block">{zeile.kategorie}</span>
      <span className="hidden text-sm md:block">{zeile.modus}</span>
      <span className="hidden flex-col items-end md:flex">
        {zeile.preis === null ? (
          <span className="rounded-md border border-attention bg-attention-soft px-2 py-0.5 text-xs font-medium text-attention-soft-on">
            nicht bewertbar
          </span>
        ) : (
          <>
            <span className={`text-[15px] ${zeile.aktiv ? 'font-medium' : ''}`}>
              {zeile.preis.haupt}
            </span>
            {zeile.preis.abgeleitet !== null && (
              <span className="text-xs text-text-muted">{zeile.preis.abgeleitet}</span>
            )}
          </>
        )}
      </span>

      <span className="shrink-0 text-right font-mono text-abschnitt font-normal tracking-normal text-text-muted">
        {zeile.sortierung}
      </span>
    </Link>
  )
}
