'use client'

/**
 * Die Fokusfassung der Erfassung: eine Position füllt den Bildschirm, alles
 * Auslösende liegt im unteren Drittel.
 *
 * Drei Ansichten. Die Suche ist die einzige Stelle mit Systemtastatur — das
 * Suchfeld sitzt unten, die Treffer stehen darüber, Return übernimmt den
 * obersten. Sobald der Artikel steht, übernimmt der Ziffernblock der Zählmaske:
 * dieselben 56 px, dieselbe Weiter-Taste mit dem Wert in der Aufschrift. Die
 * Liste zeigt die erfassten Positionen, jede Zeile ist änderbar.
 *
 * Gerechnet wird nichts: Einheiten, Positionswert und Summe kommen fertig aus
 * src/lib/wareneingang.ts. Die Kontrollzeile unter dem Wertfeld ist dieselbe
 * Idee wie in der Zählmaske — was die Eingabe zusammengerechnet bedeutet.
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { alsKurzdatum } from '@/lib/datum'
import { wertGebindeCent } from '@/lib/einheiten'
import {
  alsEuro,
  einheitenzeile,
  positionswerttext,
  warenwerttext,
  type ErfassungsArtikel,
  type ErfassungsPosition,
  type Erfassungssumme,
} from '@/lib/wareneingang'
import {
  alsEingabe,
  dezimaltext,
  gebindeBeschriftung,
  gebindeMenge,
  schritt,
  tasteAnwenden,
  type Taste,
} from '@/lib/zaehlung'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss } from '@/ui/vollbild'
import { Wertfeld } from '@/ui/wertfeld'
import { Ziffernblock } from '@/ui/ziffernblock'
import { Leerzustand } from '@/ui/zustand'

/**
 * Was der Bildschirm gerade zeigt. `neu` trägt seinen Entwurf selbst: die Zeile
 * entsteht erst beim Ablegen, eine abgebrochene Suche hinterlässt nichts.
 */
export type FokusAnsicht =
  | { art: 'suche' }
  | { art: 'neu'; artikel: ErfassungsArtikel; anzahl: string }
  | { art: 'zeile'; id: string }
  | { art: 'liste' }

type Props = {
  lieferant: string
  belegNr: string
  datum: string
  /** Ohne Preissicht schweigt die Fassung über Positionswerte und Summen. */
  mitPreisen: boolean
  zeilen: ErfassungsPosition[]
  stamm: ErfassungsArtikel[]
  summe: Erfassungssumme
  fehler: string | null
  /** Wiederholt den gescheiterten Speicherversuch — die Handlung in der Leiste. */
  aufErneut: () => void
  ansicht: FokusAnsicht
  aufAnsicht: (ansicht: FokusAnsicht) => void
  aufAnlegen: (artikel: ErfassungsArtikel, anzahl: string) => void
  aufAendern: (id: string, anzahl: string) => void
  aufSpeichern: () => void
}

/** Das Liefergebinde mit seinem Preis: "24 x 0,33 · 18,59 EUR". */
function gebindeMitPreis(artikel: ErfassungsArtikel): string {
  const preis = wertGebindeCent(artikel, 1)
  if (preis === null) return artikel.lieferGebindeText
  return `${artikel.lieferGebindeText} · ${alsEuro(preis)}`
}

export function Fokuserfassung({
  lieferant,
  belegNr,
  datum,
  mitPreisen,
  zeilen,
  stamm,
  summe,
  fehler,
  aufErneut,
  ansicht,
  aufAnsicht,
  aufAnlegen,
  aufAendern,
  aufSpeichern,
}: Props) {
  // Eine geöffnete Zeile, die es nicht mehr gibt, fällt zur Liste zurück statt
  // auf einen leeren Bildschirm.
  const offeneZeile = ansicht.art === 'zeile' ? zeilen.find((z) => z.id === ansicht.id) : undefined
  const gezeigt: FokusAnsicht =
    ansicht.art === 'zeile' && offeneZeile === undefined ? { art: 'liste' } : ansicht

  const posNummer =
    gezeigt.art === 'zeile'
      ? zeilen.findIndex((z) => z.id === gezeigt.id) + 1
      : zeilen.length + 1

  return (
    <>
      <header className="flex shrink-0 items-center gap-3.5 border-b border-border bg-surface px-4 pt-2 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-zeile font-semibold">
            {lieferant} · {alsKurzdatum(new Date(`${datum}T00:00:00Z`))}
          </p>
          <p className="truncate font-mono text-abschnitt font-normal tracking-normal text-text-muted">
            Beleg {belegNr}
          </p>
        </div>
        {gezeigt.art !== 'liste' && (
          <span className="shrink-0 text-sm font-medium text-text-muted">Pos {posNummer}</span>
        )}
        <span className="-my-2 flex shrink-0">
          <Schaltflaeche
            art="sekundaer"
            onClick={() => aufAnsicht(gezeigt.art === 'liste' ? { art: 'suche' } : { art: 'liste' })}
          >
            {gezeigt.art === 'liste' ? 'Erfassen' : 'Liste'}
          </Schaltflaeche>
        </span>
      </header>

      {fehler !== null && (
        <div className="shrink-0 p-2">
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

      {gezeigt.art === 'suche' ? (
        <Suche
          stamm={stamm}
          mitPreisen={mitPreisen}
          aufWahl={(artikel) => aufAnsicht({ art: 'neu', artikel, anzahl: '' })}
        />
      ) : gezeigt.art === 'neu' ? (
        <Anzahleingabe
          artikel={gezeigt.artikel}
          anzahl={gezeigt.anzahl}
          summe={summe}
          mitPreisen={mitPreisen}
          weiterText={
            gezeigt.anzahl === ''
              ? 'ohne Zeile zurück'
              : `${gebindeMenge(dezimaltext(gezeigt.anzahl), gezeigt.artikel.gebindeart)} · nächste Position`
          }
          aufAnzahl={(anzahl) => aufAnsicht({ ...gezeigt, anzahl })}
          aufWeiter={() => {
            if (gezeigt.anzahl !== '') aufAnlegen(gezeigt.artikel, gezeigt.anzahl)
            aufAnsicht({ art: 'suche' })
          }}
          aufSpeichern={aufSpeichern}
        />
      ) : gezeigt.art === 'zeile' && offeneZeile !== undefined ? (
        <Anzahleingabe
          artikel={offeneZeile.artikel}
          anzahl={alsEingabe(offeneZeile.lieferschein)}
          summe={summe}
          mitPreisen={mitPreisen}
          weiterText={`${gebindeMenge(offeneZeile.lieferschein, offeneZeile.artikel.gebindeart)} · übernehmen`}
          aufAnzahl={(anzahl) => aufAendern(offeneZeile.id, anzahl)}
          aufWeiter={() => aufAnsicht({ art: 'liste' })}
          aufSpeichern={aufSpeichern}
        />
      ) : (
        <Liste
          zeilen={zeilen}
          summe={summe}
          mitPreisen={mitPreisen}
          aufZeile={(id) => aufAnsicht({ art: 'zeile', id })}
          aufNeu={() => aufAnsicht({ art: 'suche' })}
          aufSpeichern={aufSpeichern}
        />
      )}
    </>
  )
}

/**
 * Die Artikelsuche: Feld unten, Treffer darüber, aufsteigend vom Daumen weg.
 * Return übernimmt den obersten Treffer — er ist der markierte.
 */
function Suche({
  stamm,
  mitPreisen,
  aufWahl,
}: {
  stamm: ErfassungsArtikel[]
  /** Ohne Preissicht fehlt auch der Weg in die Stammdaten — der ist zu. */
  mitPreisen: boolean
  aufWahl: (artikel: ErfassungsArtikel) => void
}) {
  const [suche, setSuche] = useState('')
  const feldRef = useRef<HTMLInputElement>(null)

  // Fokus nur, wenn diese Fassung wirklich auf dem Schirm steht — ab md ist
  // sie über display:none ausgeblendet und darf der Tabelle nichts stehlen.
  useEffect(() => {
    const feld = feldRef.current
    if (feld !== null && feld.offsetParent !== null) feld.focus()
  }, [])

  const treffer = useMemo(() => {
    const begriff = suche.trim().toLowerCase()
    if (begriff === '') return []
    return stamm.filter((artikel) => artikel.name.toLowerCase().includes(begriff)).slice(0, 5)
  }, [stamm, suche])

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {suche.trim() !== '' && treffer.length === 0 && (
          <p className="border-t border-border px-4 py-3 text-sm text-text-muted">
            Kein Treffer im Artikelstamm.
            {mitPreisen && (
              <>
                {' '}
                <Link href="/artikel/neu" className="font-medium text-primary-text">
                  Artikel anlegen
                </Link>
              </>
            )}
          </p>
        )}
        {treffer.length > 0 && (
          <>
            <p className="border-y border-border bg-surface-2 px-4 py-2 text-abschnitt uppercase text-text-muted">
              {treffer.length === 1 ? '1 Treffer' : `${treffer.length} Treffer`}
            </p>
            <ul className="divide-y divide-border overflow-y-auto bg-surface">
              {treffer.map((artikel, index) => {
                const oberster = index === 0
                return (
                  <li key={artikel.id}>
                    <button
                      type="button"
                      onClick={() => aufWahl(artikel)}
                      className={`tap flex min-h-18 w-full flex-col justify-center gap-0.5 px-4 py-2 text-left focus-visible:fokus ${
                        oberster ? 'bg-primary-soft' : ''
                      }`}
                    >
                      <span
                        className={`w-full truncate text-zeile ${
                          oberster ? 'font-semibold text-primary-text' : 'text-text'
                        }`}
                      >
                        {artikel.name}
                      </span>
                      <span
                        className={`w-full truncate text-sm ${
                          oberster ? 'text-primary-soft-on' : 'text-text-muted'
                        }`}
                      >
                        {gebindeMitPreis(artikel)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </main>

      <Maskenfuss>
        <input
          ref={feldRef}
          value={suche}
          onChange={(ereignis) => setSuche(ereignis.target.value)}
          onKeyDown={(ereignis) => {
            if (ereignis.key !== 'Enter') return
            ereignis.preventDefault()
            const oberster = treffer[0]
            if (oberster !== undefined) aufWahl(oberster)
          }}
          placeholder="Artikel suchen"
          aria-label="Artikel suchen"
          className="h-tap w-full rounded-ctl border-2 border-primary bg-primary-soft px-4 text-lg font-medium text-text placeholder:font-normal placeholder:text-text-muted"
        />
      </Maskenfuss>
    </>
  )
}

/**
 * Die Anzahl eines Artikels, mit dem Ziffernblock der Zählmaske. Ohne Komma:
 * geliefert werden ganze Gebinde, und ein angebrochenes Fass ist eine Sache der
 * Zählung, nicht des Lieferscheins.
 */
function Anzahleingabe({
  artikel,
  anzahl,
  summe,
  mitPreisen,
  weiterText,
  aufAnzahl,
  aufWeiter,
  aufSpeichern,
}: {
  artikel: ErfassungsArtikel
  anzahl: string
  summe: Erfassungssumme
  mitPreisen: boolean
  weiterText: string
  aufAnzahl: (anzahl: string) => void
  aufWeiter: () => void
  aufSpeichern: () => void
}) {
  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-titel text-balance">{artikel.name}</h1>
          <p className="text-zeile font-normal text-text-muted">{gebindeMitPreis(artikel)}</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <div className="flex">
            <Wertfeld
              wert={anzahl}
              beschriftung={gebindeBeschriftung(artikel.gebindeart)}
              aktiv
            />
          </div>
          {/* Die Kontrollzeile: was die Zahl zusammengerechnet bedeutet. Beide
              Angaben sind abgeleitet und tragen deshalb das = und kein Feld. */}
          {anzahl !== '' && (
            <p className="flex justify-between px-1 font-mono text-sm text-text-muted">
              <span>{einheitenzeile(artikel, dezimaltext(anzahl))}</span>
              {/* Der Positionswert ist Geld — ohne Preissicht bleibt die
                  Einheitenzeile allein stehen. */}
              {mitPreisen && (
                <span>{positionswerttext(artikel, dezimaltext(anzahl)) ?? 'nicht bewertbar'}</span>
              )}
            </p>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-surface">
        <div className="flex min-h-tap items-center gap-tapgap px-4 py-1">
          <span className="text-sm text-text-muted">
            {summe.positionen === 1 ? '1 Position' : `${summe.positionen} Positionen`}
            {mitPreisen && <> · {warenwerttext(summe)}</>}
          </span>
          <button
            type="button"
            onClick={aufSpeichern}
            className="tap ml-auto h-tap shrink-0 rounded-ctl px-3 text-sm font-semibold text-confirm-text focus-visible:fokus"
          >
            Lieferung speichern
          </button>
        </div>
        <Ziffernblock
          dezimal={false}
          weiterText={weiterText}
          aufTaste={(taste: Taste) => aufAnzahl(tasteAnwenden(anzahl, taste, false))}
          aufSchritt={(delta) => aufAnzahl(schritt(anzahl, delta))}
          aufWeiter={aufWeiter}
        />
      </footer>
    </>
  )
}

/** Die erfassten Positionen — jede Zeile führt zurück in ihre Anzahl. */
function Liste({
  zeilen,
  summe,
  mitPreisen,
  aufZeile,
  aufNeu,
  aufSpeichern,
}: {
  zeilen: ErfassungsPosition[]
  summe: Erfassungssumme
  mitPreisen: boolean
  aufZeile: (id: string) => void
  aufNeu: () => void
  aufSpeichern: () => void
}) {
  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface">
        {zeilen.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <Leerzustand
              titel="Noch keine Position erfasst"
              erklaerung="Am Lieferschein entlang hinzufügen — über „Position +“ unten."
            />
          </div>
        ) : (
          <>
            <p className="flex justify-between border-b border-border bg-surface-2 px-4 py-2 text-abschnitt uppercase text-text-muted">
              <span>
                {summe.positionen === 1 ? '1 Position' : `${summe.positionen} Positionen`}
              </span>
              <span>Antippen ändert</span>
            </p>
            <ul className="divide-y divide-border">
              {zeilen.map((zeile) => {
                const wert = wertGebindeCent(zeile.artikel, zeile.lieferschein)
                return (
                  <li key={zeile.id}>
                    <button
                      type="button"
                      onClick={() => aufZeile(zeile.id)}
                      className="tap flex min-h-20 w-full items-center gap-3 px-4 py-2 text-left focus-visible:fokus"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-zeile">{zeile.artikel.name}</span>
                        <span className="truncate font-mono text-abschnitt font-normal tracking-normal text-text-muted">
                          {alsEingabe(zeile.lieferschein)} × {zeile.artikel.lieferGebindeText}{' '}
                          {einheitenzeile(zeile.artikel, zeile.lieferschein)}
                        </span>
                      </span>
                      {/* Der Positionswert ist Geld — ohne Preissicht endet
                          die Zeile mit der Menge. */}
                      {mitPreisen && (
                        <span className="shrink-0 text-right">
                          {wert === null ? (
                            <span className="text-sm text-text-muted">nicht bewertbar</span>
                          ) : (
                            <span className="text-zeile">{alsEuro(wert)}</span>
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </main>

      {/* px-2 pt-2 der alten Fassung ist p-2 mit überschriebener Unterkante —
          exakt der Maskenfuss. */}
      <Maskenfuss>
        {mitPreisen && summe.unbewertbar > 0 && (
          <p className="px-2 pb-2 text-sm text-text-muted">
            {summe.unbewertbar === 1
              ? '1 Zeile ohne hinterlegten Preis — sie fehlt in der Summe.'
              : `${summe.unbewertbar} Zeilen ohne hinterlegten Preis — sie fehlen in der Summe.`}
          </p>
        )}
        {mitPreisen && (
          <p className="flex items-baseline justify-between px-2 pb-2">
            <span className="text-beschriftung uppercase text-text-muted">Summe Lieferung</span>
            <span className="text-titel">{warenwerttext(summe)}</span>
          </p>
        )}
        <div className="flex gap-tapgap">
          <Schaltflaeche art="sekundaer" onClick={aufNeu}>
            Position +
          </Schaltflaeche>
          <span className="flex-1">
            <Schaltflaeche rolle="confirm" breit onClick={aufSpeichern}>
              Lieferung speichern
            </Schaltflaeche>
          </span>
        </div>
      </Maskenfuss>
    </>
  )
}
