'use client'

/**
 * Eine Leergutzeile in Bearbeitung — dasselbe Muster wie die Zeilenmaske der
 * Ware: oben, wo der Blick hinfällt, Bezeichnung, Mengen und Befund; unten, wo
 * der Daumen liegt, der Ziffernblock.
 *
 * Die Inline-Felder der Liste sind damit weg. Drei Zahlen in Tastengrösse
 * nebeneinander in einer Listenzeile waren zu klein zum Treffen und zu klein
 * zum Lesen — und die Bezeichnung braucht die Texttastatur, die Mengen den
 * Ziffernblock. Hier hat beides seinen Platz, ohne dass die Liste springt.
 *
 * Gerechnet wird nichts: der Differenzsatz kommt fertig aus `leerguttext`.
 */

import { useState } from 'react'

import {
  alsPreiseingabe,
  centAusEingabe,
  leerguttext,
  leergutzustand,
  type Leergutzeile,
} from '@/lib/wareneingang'
import { alsEingabe, dezimaltext, schritt, tasteAnwenden, type Taste } from '@/lib/zaehlung'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Ziffernblock } from '@/ui/ziffernblock'

import { Feld, Preiszeile } from './zeilenmaske'

/** Die Farbe des Befunds — dieselbe Zuordnung wie die Tonflächen der Liste. */
const BEFUND = {
  stimmt: '',
  weniger: 'text-danger-text',
  mehr: 'text-attention-text',
  fehler: 'text-danger-text',
} as const

export function Leergutmaske({
  zeile,
  gesperrt,
  aufFertig,
  aufAendern,
  aufEntfernen,
}: {
  zeile: Leergutzeile
  gesperrt: boolean
  aufFertig: () => void
  aufAendern: (neu: Leergutzeile) => void
  aufEntfernen: () => void
}) {
  /**
   * Welches Feld der Ziffernblock beschreibt. Voreingestellt ist die
   * mitgegebene Menge — das ist die Frage, die an der Rampe gestellt wird;
   * was auf dem Schein steht, ist meist schon abgetippt.
   */
  const [feld, setFeld] = useState<'lieferschein' | 'tatsaechlich' | 'pfand'>('tatsaechlich')

  /** Wie der Preis der Ware braucht das Pfand einen Zwischenstand: "0," ist beim Tippen noch keine Zahl. */
  const [pfandtext, setPfandtext] = useState(alsPreiseingabe(zeile.pfandCentJeEinheit))

  const zustand = leergutzustand(zeile)
  const befund = leerguttext(zeile)

  /** Das Komma gehört zum Pfand. Hüllen werden nicht halbiert. */
  const dezimal = feld === 'pfand'

  const entwurf =
    feld === 'pfand'
      ? pfandtext
      : alsEingabe(feld === 'lieferschein' ? zeile.lieferschein : zeile.tatsaechlich)

  function setzen(text: string) {
    if (feld === 'pfand') {
      setPfandtext(text)
      aufAendern({ ...zeile, pfandCentJeEinheit: centAusEingabe(text) })
      return
    }
    aufAendern({ ...zeile, [feld]: dezimaltext(text) })
  }

  return (
    <>
      <main className="flex flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="shrink-0">
          <p className="text-sm font-semibold tracking-wide text-text-muted uppercase">
            Leergut zurück
          </p>
          <input
            value={zeile.bezeichnung}
            disabled={gesperrt}
            onChange={(ereignis) => aufAendern({ ...zeile, bezeichnung: ereignis.target.value })}
            placeholder="Kasten 24er"
            aria-label="Bezeichnung des Leerguts"
            // Die Bezeichnung ist der Titel der Zeile und sieht auch so aus.
            // Ohne sie ist die Zeile nicht abrechenbar — deshalb steht sie
            // oben und nicht als Feld unter anderen.
            className="mt-1 h-tap w-full rounded-ctl border border-border-strong bg-surface px-3 text-titel disabled:opacity-60"
          />
        </div>

        <div className="mt-5 flex shrink-0 gap-tapgap">
          <Feld
            fassung={feld === 'lieferschein' ? 'aktiv' : 'ruhend'}
            beschriftung="Lieferschein"
            wert={zeile.lieferschein}
            aufKlick={gesperrt ? undefined : () => setFeld('lieferschein')}
          />
          <Feld
            fassung={feld === 'tatsaechlich' ? 'aktiv' : 'ruhend'}
            beschriftung="mitgegeben"
            wert={zeile.tatsaechlich}
            aufKlick={gesperrt ? undefined : () => setFeld('tatsaechlich')}
          />
        </div>

        {befund !== null && (
          <p className={`mt-3 shrink-0 text-base font-semibold ${BEFUND[zustand]}`}>{befund}</p>
        )}

        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <Preiszeile
            beschriftung="Pfand je Stück"
            wert={pfandtext}
            aktiv={feld === 'pfand'}
            aufKlick={gesperrt ? undefined : () => setFeld('pfand')}
          />

          {!gesperrt && (
            <div className="mt-2">
              <Schaltflaeche art="sekundaer" rolle="danger" breit onClick={aufEntfernen}>
                Zeile entfernen
              </Schaltflaeche>
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-surface">
        {gesperrt ? (
          <>
            {/* Dieselbe Aussage wie in der Liste — wer über einen alten Link in
                der Maske landet, erfährt den Grund der Sperre hier und nicht
                erst nach dem Zurückspringen. */}
            <p className="px-4 pt-3 text-center text-sm text-text-muted">
              Dieser Wareneingang ist bestätigt — die Werte lassen sich nicht mehr ändern.
            </p>
            <button
              type="button"
              onClick={aufFertig}
              className="tap h-tap w-full bg-surface-2 text-base font-medium focus-visible:fokus"
            >
              Zurück zur Liste
            </button>
          </>
        ) : (
          <Ziffernblock
            dezimal={dezimal}
            weiterText="übernehmen"
            aufTaste={(taste: Taste) => setzen(tasteAnwenden(entwurf, taste, dezimal))}
            aufSchritt={(delta) => setzen(schritt(entwurf, delta))}
            aufWeiter={aufFertig}
          />
        )}
      </footer>
    </>
  )
}
