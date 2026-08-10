'use client'

/**
 * Die Tabellenfassung der Erfassung: eine Zeile je Position des Lieferscheins,
 * die aktive Zeile unten, die Hand bleibt auf der Tastatur.
 *
 * Der Fluss ist die ganze Maske: Tippen filtert den Stamm, Enter übernimmt den
 * markierten Treffer, die Anzahl folgt, Enter legt die Zeile ab und öffnet die
 * nächste. Pfeil-hoch aus dem leeren Suchfeld springt in die Zeile darüber,
 * Enter dort kehrt zurück. Esc verwirft die aktive Zeile — verwerfen lässt sie
 * sich gefahrlos, weil sie erst beim Ablegen zum Server geht.
 *
 * Abgeleitete Zahlen (Einheiten, Positionswert) stehen in Mono und gedämpft,
 * mit `=` davor und ohne Feldrand: eingebbar ist in der ganzen Tabelle nur, was
 * einen Rahmen trägt. Gerechnet wird nichts — beide Spalten kommen fertig aus
 * src/lib/wareneingang.ts.
 *
 * Die Trefferliste steht im Fluss unter der aktiven Zeile statt als schwebendes
 * Feld: sie wird mit den Pfeiltasten bedient, nicht mit der Maus, und ein
 * Überlager müsste je nach Zeilenzahl die Richtung wechseln, um nicht aus dem
 * Bild zu laufen.
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { alsDatumstext } from '@/lib/datum'
import {
  einheitenzeile,
  positionswerttext,
  warenwerttext,
  type ErfassungsArtikel,
  type ErfassungsPosition,
  type Erfassungssumme,
} from '@/lib/wareneingang'
import { alsEingabe } from '@/lib/zaehlung'
import { BESCHRIFTUNG } from '@/ui/feld'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'

/** Die Spaltenbreiten, einmal benannt — Kopfzeile und Zeilen müssen fluchten. */
const SPALTE = {
  pos: 'w-8 shrink-0',
  gebinde: 'w-28 shrink-0',
  liefergebinde: 'w-44 shrink-0',
  einheiten: 'w-48 shrink-0 text-right',
  wert: 'w-40 shrink-0 text-right',
} as const

/** Eine abgeleitete Zahl: Mono, gedämpft, nie ein Eingabefeld. */
const ABGELEITET = 'font-mono text-sm text-text-muted'

/** Was die aktive Zeile gerade fragt: erst den Artikel, dann die Anzahl. */
type Entwurf =
  | { schritt: 'suche' }
  | { schritt: 'anzahl'; artikel: ErfassungsArtikel; anzahl: string }

type Props = {
  lieferant: string
  belegNr: string
  datum: string
  zeilen: ErfassungsPosition[]
  stamm: ErfassungsArtikel[]
  summe: Erfassungssumme
  fehler: string | null
  /** Wiederholt den gescheiterten Speicherversuch — die Handlung in der Leiste. */
  aufErneut: () => void
  aufAnlegen: (artikel: ErfassungsArtikel, anzahl: string) => void
  aufAendern: (id: string, anzahl: string) => void
  aufSpeichern: () => void
}

/**
 * Fokussiert nur, was auf dem Schirm steht: unter md ist diese Fassung über
 * display:none ausgeblendet, und ein Fokus in ihr würde der Fokusfassung die
 * Tastatur stehlen.
 */
function fokussieren(element: HTMLElement | null) {
  if (element !== null && element.offsetParent !== null) element.focus()
}

export function Tabellenerfassung({
  lieferant,
  belegNr,
  datum,
  zeilen,
  stamm,
  summe,
  fehler,
  aufErneut,
  aufAnlegen,
  aufAendern,
  aufSpeichern,
}: Props) {
  const [entwurf, setEntwurf] = useState<Entwurf>({ schritt: 'suche' })
  const [suche, setSuche] = useState('')
  const [markiert, setMarkiert] = useState(0)

  const sucheRef = useRef<HTMLInputElement>(null)
  const anzahlRef = useRef<HTMLInputElement>(null)
  const zeilenRefs = useRef(new Map<string, HTMLInputElement>())

  const treffer = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (begriff === '') return []
    return stamm.filter((artikel) => artikel.name.toLowerCase().includes(begriff)).slice(0, 6)
  }, [stamm, suche])

  // Die Markierung folgt der Liste: schrumpfen die Treffer, bleibt sie darin.
  const gewaehlt = Math.min(markiert, Math.max(0, treffer.length - 1))

  // Der Fokus folgt dem Schritt — beim Öffnen ins Suchfeld, nach der Wahl ins
  // Anzahlfeld, nach dem Ablegen zurück.
  useEffect(() => {
    fokussieren(entwurf.schritt === 'suche' ? sucheRef.current : anzahlRef.current)
  }, [entwurf.schritt])

  function waehlen(artikel: ErfassungsArtikel) {
    setEntwurf({ schritt: 'anzahl', artikel, anzahl: '' })
    setSuche('')
    setMarkiert(0)
  }

  function zeileFokussieren(index: number) {
    const ziel = zeilen[index]
    if (ziel !== undefined) fokussieren(zeilenRefs.current.get(ziel.id) ?? null)
  }

  function zurueckZurAktivenZeile() {
    fokussieren(entwurf.schritt === 'suche' ? sucheRef.current : anzahlRef.current)
  }

  function beiSucheTaste(ereignis: KeyboardEvent<HTMLInputElement>) {
    if (ereignis.key === 'ArrowDown' && treffer.length > 0) {
      ereignis.preventDefault()
      setMarkiert(Math.min(gewaehlt + 1, treffer.length - 1))
      return
    }
    if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault()
      // Aus dem leeren Suchfeld führt Pfeil-hoch in die Zeile darüber — der
      // Weg, eine schon erfasste Anzahl zu ändern, ohne die Maus zu suchen.
      if (suche.trim() === '') zeileFokussieren(zeilen.length - 1)
      else setMarkiert(Math.max(gewaehlt - 1, 0))
      return
    }
    if (ereignis.key === 'Enter') {
      ereignis.preventDefault()
      const wahl = treffer[gewaehlt]
      if (wahl !== undefined) waehlen(wahl)
      return
    }
    if (ereignis.key === 'Escape') setSuche('')
  }

  function beiAnzahlTaste(ereignis: KeyboardEvent<HTMLInputElement>) {
    if (entwurf.schritt !== 'anzahl') return
    if (ereignis.key === 'Enter') {
      ereignis.preventDefault()
      if (entwurf.anzahl === '') return
      aufAnlegen(entwurf.artikel, entwurf.anzahl)
      setEntwurf({ schritt: 'suche' })
      return
    }
    if (ereignis.key === 'Escape') {
      // Verwirft die Zeile. Das geht folgenlos, weil sie erst beim Ablegen
      // angelegt wird — auf dem Server liegt noch nichts.
      setEntwurf({ schritt: 'suche' })
    }
  }

  function beiZeilenTaste(ereignis: KeyboardEvent<HTMLInputElement>, index: number) {
    if (ereignis.key === 'Enter' || ereignis.key === 'Escape') {
      ereignis.preventDefault()
      zurueckZurAktivenZeile()
      return
    }
    if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault()
      zeileFokussieren(index - 1)
      return
    }
    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault()
      if (index + 1 < zeilen.length) zeileFokussieren(index + 1)
      else zurueckZurAktivenZeile()
    }
  }

  return (
    <>
      <header className="flex h-15 shrink-0 items-center gap-4 border-b border-border bg-surface px-7">
        <Link
          href="/lieferungen"
          className="tap -ml-2 inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium text-primary-text focus-visible:fokus"
        >
          ← Lieferungen
        </Link>
        <h1 className="text-zeile font-semibold">Lieferung erfassen</h1>
        <div className="ml-auto">
          <Modusumschalter />
        </div>
      </header>

      {/* Der Kopf der Lieferung ist hier Anzeige, kein Formular: ausgefüllt
          wird er einmal beim Anlegen in der Übersicht. Gedeckte Fläche, kein
          Rahmen — dieselbe Fassung wie "Papier" in der Prüfmaske. */}
      <div className="flex shrink-0 items-end gap-3 border-b border-border bg-surface px-7 py-4">
        <Kopffeld beschriftung="Datum" wert={alsDatumstext(new Date(`${datum}T00:00:00Z`))} />
        <Kopffeld beschriftung="Lieferant" wert={lieferant} breit />
        <Kopffeld beschriftung="Belegnummer" wert={belegNr} mono />
        <div className="ml-auto hidden flex-col items-end gap-1.5 pb-1 lg:flex">
          <span className={BESCHRIFTUNG}>Tastenfolge</span>
          <span className="flex items-center gap-2 text-sm text-text-muted">
            <Tastenschild>Artikel</Tastenschild>→<Tastenschild>Enter</Tastenschild>→
            <Tastenschild>Anzahl</Tastenschild>→<Tastenschild>Enter</Tastenschild>
          </span>
        </div>
      </div>

      {fehler !== null && (
        <div className="shrink-0 px-7 pt-3">
          <Hinweisleiste
            rolle="attention"
            titel={fehler}
            aktion={
              <span className="w-full sm:w-auto">
                <Schaltflaeche art="sekundaer" rolle="attention" breit onClick={aufErneut}>
                  Erneut versuchen
                </Schaltflaeche>
              </span>
            }
          />
        </div>
      )}

      <main className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 flex-col px-7">
        <div className={`flex h-10 shrink-0 items-center gap-4 border-b border-border ${BESCHRIFTUNG}`}>
          <span className={SPALTE.pos}>Pos</span>
          <span className="min-w-0 flex-1">Artikel</span>
          <span className={SPALTE.liefergebinde}>Liefergebinde</span>
          <span className={`${SPALTE.gebinde} text-right`}>Gebinde</span>
          <span className={SPALTE.einheiten}>Einheiten</span>
          <span className={SPALTE.wert}>Positionswert</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <ul>
            {zeilen.map((zeile, index) => (
              <Tabellenzeile
                key={zeile.id}
                zeile={zeile}
                nummer={index + 1}
                eingabeRef={(element) => {
                  if (element === null) zeilenRefs.current.delete(zeile.id)
                  else zeilenRefs.current.set(zeile.id, element)
                }}
                aufAendern={(anzahl) => aufAendern(zeile.id, anzahl)}
                aufTaste={(ereignis) => beiZeilenTaste(ereignis, index)}
              />
            ))}
          </ul>

          <AktiveZeile
            nummer={zeilen.length + 1}
            entwurf={entwurf}
            suche={suche}
            sucheRef={sucheRef}
            anzahlRef={anzahlRef}
            aufSuche={setSuche}
            aufSucheTaste={beiSucheTaste}
            aufAnzahl={(anzahl) =>
              entwurf.schritt === 'anzahl' && setEntwurf({ ...entwurf, anzahl })
            }
            aufAnzahlTaste={beiAnzahlTaste}
          />

          {suche.trim() !== '' && entwurf.schritt === 'suche' && (
            <Trefferliste treffer={treffer} gewaehlt={gewaehlt} aufWahl={waehlen} />
          )}

          <p className="flex items-center gap-4 px-1 py-3 text-sm text-text-muted">
            <span>
              <Taste>Enter</Taste> Zeile ablegen und neue beginnen
            </span>
            <span>
              <Taste>↑</Taste> in die Zeile darüber springen und ändern
            </span>
            <span>
              <Taste>Esc</Taste> Zeile verwerfen
            </span>
            <span className="ml-auto">
              Graue Zahlen mit <Taste>=</Taste> sind abgeleitet und nicht eingebbar
            </span>
          </p>
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-surface px-7 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-abschnitt uppercase text-text-muted">
              {summe.positionen === 1 ? '1 Position erfasst' : `${summe.positionen} Positionen erfasst`}
            </span>
            {summe.unbewertbar > 0 && (
              <span className="text-sm text-text-muted">
                {summe.unbewertbar === 1
                  ? '1 Zeile ohne hinterlegten Preis — sie fehlt in der Summe.'
                  : `${summe.unbewertbar} Zeilen ohne hinterlegten Preis — sie fehlen in der Summe.`}
              </span>
            )}
          </div>
          <div className="ml-auto flex flex-col items-end gap-0.5">
            <span className={BESCHRIFTUNG}>Summe Lieferung</span>
            <span className="text-titel">{warenwerttext(summe)}</span>
          </div>
          <Schaltflaeche rolle="confirm" onClick={aufSpeichern}>
            Lieferung speichern
          </Schaltflaeche>
        </div>
      </footer>
    </>
  )
}

/** Ein Feld des Lieferungskopfs: Beschriftung über ruhiger Fläche. */
function Kopffeld({
  beschriftung,
  wert,
  breit = false,
  mono = false,
}: {
  beschriftung: string
  wert: string
  breit?: boolean
  mono?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${breit ? 'w-64' : 'w-44'}`}>
      <span className={BESCHRIFTUNG}>{beschriftung}</span>
      <span
        className={`flex h-tap items-center truncate rounded-ctl bg-surface-2 px-4 text-zeile ${
          mono ? 'font-mono text-base font-normal tracking-normal' : ''
        }`}
      >
        {wert}
      </span>
    </div>
  )
}

/** Ein Tastenname im Hinweistext, als kleines Schild. */
function Tastenschild({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-border-strong bg-surface px-2 py-1 font-mono text-abschnitt font-normal tracking-normal">
      {children}
    </span>
  )
}

/** Ein Tastenname im Lauftext, nur in Mono. */
function Taste({ children }: { children: string }) {
  return <span className="font-mono">{children}</span>
}

/**
 * Eine erfasste Zeile. Ihr einziges Eingabefeld ist die Anzahl der Gebinde —
 * beim Fokus wird der Wert markiert, damit die neue Zahl die alte ersetzt,
 * statt sich anzuhängen.
 */
function Tabellenzeile({
  zeile,
  nummer,
  eingabeRef,
  aufAendern,
  aufTaste,
}: {
  zeile: ErfassungsPosition
  nummer: number
  eingabeRef: (element: HTMLInputElement | null) => void
  aufAendern: (anzahl: string) => void
  aufTaste: (ereignis: KeyboardEvent<HTMLInputElement>) => void
}) {
  const wert = positionswerttext(zeile.artikel, zeile.lieferschein)

  return (
    <li className="flex h-16 items-center gap-4 border-b border-border">
      <span className={`${SPALTE.pos} font-mono text-abschnitt font-normal text-text-muted`}>
        {nummer}
      </span>
      <span className="min-w-0 flex-1 truncate text-zeile">{zeile.artikel.name}</span>
      <span className={`${SPALTE.liefergebinde} truncate text-sm text-text-muted`}>
        {zeile.artikel.lieferGebindeText}
      </span>
      <span className={`${SPALTE.gebinde} flex justify-end`}>
        <input
          ref={eingabeRef}
          inputMode="numeric"
          value={alsEingabe(zeile.lieferschein)}
          onChange={(ereignis) =>
            aufAendern(ereignis.target.value.replace(/\D/g, '').slice(0, 4))
          }
          onFocus={(ereignis) => ereignis.currentTarget.select()}
          onKeyDown={aufTaste}
          aria-label={`${zeile.artikel.name}: Anzahl Gebinde`}
          className="h-11 w-21 rounded-ctl border border-border-strong bg-surface px-3 text-right text-zeile focus:outline-2 focus:-outline-offset-1 focus:outline-focus"
        />
      </span>
      <span className={`${SPALTE.einheiten} ${ABGELEITET}`}>
        {einheitenzeile(zeile.artikel, zeile.lieferschein)}
      </span>
      <span className={`${SPALTE.wert} ${ABGELEITET}`}>{wert ?? 'nicht bewertbar'}</span>
    </li>
  )
}

/**
 * Die aktive Zeile am Fuss der Tabelle: erst das Suchfeld, nach der Wahl der
 * Artikel mit dem Anzahlfeld. Sie trägt als einzige den Primärrahmen — hier
 * fällt die nächste Eingabe hin.
 */
function AktiveZeile({
  nummer,
  entwurf,
  suche,
  sucheRef,
  anzahlRef,
  aufSuche,
  aufSucheTaste,
  aufAnzahl,
  aufAnzahlTaste,
}: {
  nummer: number
  entwurf: Entwurf
  suche: string
  sucheRef: React.RefObject<HTMLInputElement | null>
  anzahlRef: React.RefObject<HTMLInputElement | null>
  aufSuche: (text: string) => void
  aufSucheTaste: (ereignis: KeyboardEvent<HTMLInputElement>) => void
  aufAnzahl: (anzahl: string) => void
  aufAnzahlTaste: (ereignis: KeyboardEvent<HTMLInputElement>) => void
}) {
  const inAnzahl = entwurf.schritt === 'anzahl'

  return (
    <div className="mt-2.5 flex min-h-18 items-center gap-4 rounded-ctl border-2 border-primary bg-primary-soft px-3 py-2">
      <span className={`${SPALTE.pos} text-center font-mono text-abschnitt font-normal text-primary-text`}>
        {nummer}
      </span>

      {inAnzahl ? (
        <span className="min-w-0 flex-1 truncate text-zeile font-semibold text-primary-soft-on">
          {entwurf.artikel.name}
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <input
            ref={sucheRef}
            value={suche}
            onChange={(ereignis) => aufSuche(ereignis.target.value)}
            onKeyDown={aufSucheTaste}
            placeholder="Artikel suchen"
            aria-label="Artikel suchen"
            role="combobox"
            aria-expanded={suche.trim() !== ''}
            aria-controls="artikeltreffer"
            aria-autocomplete="list"
            className="h-12 w-full rounded-ctl border border-primary bg-surface px-3.5 text-zeile font-normal text-text placeholder:text-text-muted focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          />
        </span>
      )}

      <span className={`${SPALTE.liefergebinde} truncate text-sm ${inAnzahl ? 'text-primary-soft-on' : 'text-text-muted'}`}>
        {inAnzahl ? entwurf.artikel.lieferGebindeText : 'folgt aus Artikel'}
      </span>

      <span className={`${SPALTE.gebinde} flex justify-end`}>
        {inAnzahl ? (
          <input
            ref={anzahlRef}
            inputMode="numeric"
            value={entwurf.anzahl}
            onChange={(ereignis) =>
              aufAnzahl(ereignis.target.value.replace(/\D/g, '').slice(0, 4))
            }
            onKeyDown={aufAnzahlTaste}
            aria-label={`${entwurf.artikel.name}: Anzahl Gebinde`}
            className="h-12 w-21 rounded-ctl border border-primary bg-surface px-3 text-right text-lg font-semibold text-primary-text focus:outline-2 focus:outline-offset-2 focus:outline-focus"
          />
        ) : (
          <span className="flex h-11 w-21 items-center justify-end rounded-ctl border border-dashed border-border-strong px-3 text-text-muted">
            —
          </span>
        )}
      </span>

      <span className={`${SPALTE.einheiten} ${ABGELEITET}`}>
        {inAnzahl && entwurf.anzahl !== ''
          ? einheitenzeile(entwurf.artikel, entwurf.anzahl)
          : '—'}
      </span>
      <span className={`${SPALTE.wert} ${ABGELEITET}`}>
        {inAnzahl && entwurf.anzahl !== ''
          ? (positionswerttext(entwurf.artikel, entwurf.anzahl) ?? 'nicht bewertbar')
          : '—'}
      </span>
    </div>
  )
}

/**
 * Die Treffer unter der aktiven Zeile. Bedient mit den Pfeiltasten; die Maus
 * darf trotzdem — jede Zeile ist auch eine Taste.
 */
function Trefferliste({
  treffer,
  gewaehlt,
  aufWahl,
}: {
  treffer: ErfassungsArtikel[]
  gewaehlt: number
  aufWahl: (artikel: ErfassungsArtikel) => void
}) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-ctl border border-border bg-surface shadow-lg">
      {treffer.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-muted">
          Kein Treffer im Artikelstamm.{' '}
          <Link href="/artikel/neu" className="font-medium text-primary-text">
            Artikel anlegen
          </Link>
        </p>
      ) : (
        <>
          <ul id="artikeltreffer" role="listbox" aria-label="Artikeltreffer">
            {treffer.map((artikel, index) => {
              const markiert = index === gewaehlt
              return (
                <li key={artikel.id} role="option" aria-selected={markiert}>
                  <button
                    type="button"
                    onClick={() => aufWahl(artikel)}
                    // Kein Fokusdiebstahl beim Klick: der Fluss bleibt im Suchfeld.
                    onMouseDown={(ereignis) => ereignis.preventDefault()}
                    className={`flex h-tap w-full items-center gap-3 border-b border-border px-4 text-left ${
                      markiert ? 'bg-primary-soft' : ''
                    }`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-zeile ${
                        markiert ? 'font-semibold text-primary-text' : 'text-text'
                      }`}
                    >
                      {artikel.name}
                    </span>
                    <span className={`shrink-0 text-sm ${markiert ? 'text-primary-soft-on' : 'text-text-muted'}`}>
                      {artikel.lieferGebindeText}
                    </span>
                    {markiert && <Tastenschild>Enter</Tastenschild>}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="flex items-center gap-3.5 bg-surface-2 px-4 py-2 text-abschnitt font-normal text-text-muted">
            <span>
              <Taste>↑ ↓</Taste> wählen
            </span>
            <span>
              <Taste>Enter</Taste> übernehmen
            </span>
            <span>
              <Taste>Esc</Taste> abbrechen
            </span>
            <span className="ml-auto">
              Kein Treffer?{' '}
              <Link href="/artikel/neu" className="font-medium text-primary-text">
                Artikel anlegen
              </Link>
            </span>
          </p>
        </>
      )}
    </div>
  )
}
