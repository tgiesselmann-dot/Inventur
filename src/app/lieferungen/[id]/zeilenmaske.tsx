'use client'

/**
 * Eine Zeile in Bearbeitung: die tatsächliche Menge korrigieren und, wenn etwas
 * fehlt, einen Teil davon als Bruch auszeichnen.
 *
 * Aus pruefmaske.tsx herausgelöst, damit dort nur noch der Zustand und die
 * Weiche zwischen den Ansichten steht. Der Zustand bleibt drüben; diese Ansicht
 * bekommt die Zeile und meldet die geänderte zurück.
 *
 * Der Aufbau folgt dem Griff und nicht der Reihenfolge der Felder: oben, wo der
 * Blick hinfällt, stehen Artikel, Mengen und der Befund; unten, wo der Daumen
 * liegt, die Frage nach dem Bruch und der Ziffernblock. Zwischen beiden dehnt
 * sich der Rest — was nur manchmal auftritt (Preis, Nachlieferung, ein anderer
 * Artikel), steht dort und drängt sich nie zwischen Zahl und Taste.
 */

import { useState } from 'react'

import { Abweichungsart } from '@/generated/prisma/enums'
import {
  abweichungstext,
  alsPreiseingabe,
  centAusEingabe,
  differenz,
  istErsatzartikel,
  lieferscheinSetzen,
  mengeSetzen,
  mitBruch,
  mitNachlieferung,
  nachlieferungSetzen,
  preisabweichungsstufe,
  preisabweichungstext,
  preisSetzen,
  stimmig,
  zeilenstand,
  type PruefPosition,
} from '@/lib/wareneingang'
import { alsEingabe, gebindeEinzahl, schritt, tasteAnwenden, type Taste } from '@/lib/zaehlung'
import { ROLLEN } from '@/ui/rollen'
import { Ziffernblock } from '@/ui/ziffernblock'

/**
 * Die Farbe des Befunds unter den Mengen. Dieselbe Zuordnung wie in der Liste —
 * eine Fehlmenge ist eine Forderung, eine Überlieferung eine Frage.
 */
const BEFUND = {
  stimmt: '',
  fehlmenge: 'text-danger-text',
  ueberlieferung: 'text-attention-text',
} as const

export function Zeilenmaske({
  position,
  mitPreisen,
  mitBestellung,
  gesperrt,
  aufFertig,
  aufAendern,
  aufErsatzartikel,
}: {
  position: PruefPosition
  /** Ohne Preissicht gibt es weder Preisfeld noch Beträge — siehe Pruefmaske. */
  mitPreisen: boolean
  mitBestellung: boolean
  gesperrt: boolean
  aufFertig: () => void
  aufAendern: (neu: PruefPosition) => void
  aufErsatzartikel: () => void
}) {
  /**
   * Welches Feld der Ziffernblock beschreibt.
   *
   * Ohne Bestellbezug wird der Lieferschein hier abgetippt, deshalb muss auch er
   * erreichbar sein. Voreingestellt ist trotzdem die tatsächliche Menge: das ist
   * die Frage, die an der Rampe wirklich gestellt wird.
   */
  const [feld, setFeld] = useState<'lieferschein' | 'tatsaechlich' | 'preis'>('tatsaechlich')

  /**
   * Der Preis braucht einen eigenen Zwischenstand, weil "18," beim Tippen
   * entsteht und noch keine Zahl ist. Mengen kommen ohne aus, sie werden bei
   * jedem Tastendruck zu einem gültigen Wert.
   */
  const [preistext, setPreistext] = useState(alsPreiseingabe(position.ekPreisCentLieferschein))

  const bruch = position.abweichungen.find((eintrag) => eintrag.art === Abweichungsart.BRUCH)
  const fehlt = differenz(position).greaterThan(0)
  /**
   * Ob die Frage schon beantwortet ist.
   *
   * Eine frisch geöffnete Zeile hat keine Aufschlüsselung — die Liste nennt das
   * "Grund fehlt" und der Fuss verweigert die Bestätigung deswegen. Ohne diese
   * Unterscheidung trüge "nichts" trotzdem den gewählten Rahmen, und der
   * Bildschirm behauptete eine Antwort, die niemand gegeben hat.
   */
  const erklaert = stimmig(position)
  const befund = abweichungstext(position, mitPreisen)
  const preisabweichung = mitPreisen ? preisabweichungstext(position) : null

  /** Das Komma gehört zum Preis. Gebinde werden nicht halbiert. */
  const dezimal = feld === 'preis'

  const entwurf =
    feld === 'preis'
      ? preistext
      : alsEingabe(feld === 'lieferschein' ? position.lieferschein : position.tatsaechlich)

  function setzen(text: string) {
    if (feld === 'preis') {
      setPreistext(text)
      aufAendern(preisSetzen(position, centAusEingabe(text)))
      return
    }
    aufAendern(
      feld === 'lieferschein'
        ? lieferscheinSetzen(position, text)
        : mengeSetzen(position, text),
    )
  }

  return (
    <>
      {/* Nicht die ganze Maske scrollt, sondern nur ihr Mittelteil. Sonst
          rutschte die Bruchfrage unter den Bildschirmrand, sobald ein Sonderfall
          dazukommt — und sie ist die Frage, die zur Zahl darüber gehört. */}
      <main className="flex flex-1 flex-col overflow-hidden px-4 py-3">
        <div className="shrink-0">
          <h1 className="text-titel">{position.artikel.name}</h1>
          <p className="mt-1 text-base text-text-muted">{position.artikel.lieferGebindeText}</p>
          {istErsatzartikel(position) && (
            <p className="mt-1 text-sm text-attention-text">
              statt {position.bestellterArtikel?.name} {position.bestellterArtikel?.lieferGebindeText}
            </p>
          )}
        </div>

        {/* Die Mengenfelder sind selbst Tasten und dürfen deshalb oben liegen.
            Angetippt wird eines nicht, um es zu ändern, sondern um zu bestimmen,
            was der Ziffernblock beschreibt. */}
        <div className="mt-5 flex shrink-0 gap-tapgap">
          {mitBestellung && (
            // Ohne Rahmen und ohne Reaktion: die Bestellung ist Papier von
            // gestern und wird an der Rampe nicht mehr geändert.
            <Feld fassung="papier" beschriftung="bestellt" wert={position.bestellt} />
          )}
          <Feld
            fassung={feld === 'lieferschein' ? 'aktiv' : 'ruhend'}
            beschriftung="Lieferschein"
            wert={position.lieferschein}
            aufKlick={gesperrt ? undefined : () => setFeld('lieferschein')}
          />
          <Feld
            fassung={feld === 'tatsaechlich' ? 'aktiv' : 'ruhend'}
            beschriftung="tatsächlich"
            wert={position.tatsaechlich}
            aufKlick={gesperrt ? undefined : () => setFeld('tatsaechlich')}
          />
        </div>

        {/* Der ganze Befund in einer Zeile, fertig aus src/lib: Menge, Betrag,
            und ob ein Bruch dabei ist. */}
        {befund !== null && (
          <p className={`mt-3 shrink-0 text-base font-semibold ${BEFUND[zeilenstand(position)]}`}>
            {befund}
          </p>
        )}

        {!mitBestellung && (
          <p className="mt-3 shrink-0 text-base text-text-muted">Ohne Bestellbezug</p>
        )}

        {/* Ab hier die Fälle, die selten eintreten. Sie stehen zwischen Befund
            und Bruchfrage, weil keiner von ihnen den Regelfall aufhält — und sie
            sind der Teil, der scrollt und den Dehnraum bildet. */}
        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {/* Der Preis laut Lieferschein ist eine Frage der Betriebsleitung —
              ohne Preissicht fehlt das Feld ganz, statt leer dazustehen. */}
          {mitPreisen && (
            <Preiszeile
              beschriftung={`Preis je ${gebindeEinzahl(position.artikel.gebindeart)} laut Lieferschein`}
              wert={preistext}
              aktiv={feld === 'preis'}
              aufKlick={gesperrt ? undefined : () => setFeld('preis')}
            />
          )}
          {/* Der Satz trägt seinen Rat schon in sich ("später klären" /
              "jetzt nachfragen"); der Ton folgt der Stufe wie in der Liste —
              die stille Abweichung bleibt grau. */}
          {preisabweichung !== null && (
            <p
              className={`text-sm ${
                preisabweichungsstufe(position) === 'nachfragen'
                  ? 'font-semibold text-attention-text'
                  : 'text-text-muted'
              }`}
            >
              {preisabweichung}
            </p>
          )}

          {fehlt && !gesperrt && (
            <div className="mt-2">
              <p className="text-sm text-text-muted">
                Nachlieferung zugesagt? Dann ist es kein Fall für die Reklamation.
              </p>
              <div className="mt-2 flex gap-tapgap">
                <input
                  type="date"
                  value={position.nachlieferungZugesagtBis ?? ''}
                  onChange={(ereignis) =>
                    aufAendern(
                      nachlieferungSetzen(
                        position,
                        ereignis.target.value === '' ? null : ereignis.target.value,
                      ),
                    )
                  }
                  className="h-tap min-w-0 flex-1 rounded-ctl border border-border-strong px-3 text-base"
                />
                {mitNachlieferung(position) && (
                  <button
                    type="button"
                    onClick={() => aufAendern(nachlieferungSetzen(position, null))}
                    className="tap h-tap shrink-0 rounded-ctl bg-surface-2 px-4 text-base font-medium focus-visible:fokus"
                  >
                    Zusage zurück
                  </button>
                )}
              </div>
            </div>
          )}

          {mitBestellung && !gesperrt && (
            <button
              type="button"
              onClick={aufErsatzartikel}
              className="tap mt-2 h-tap w-full rounded-ctl border-2 border-dashed border-border-strong text-base font-medium text-text-muted focus-visible:fokus"
            >
              {istErsatzartikel(position) ? 'Anderen Artikel wählen' : 'Anderer Artikel geliefert'}
            </button>
          )}
        </div>

        {/* Bruch und Fehlmenge mindern den Bestand gleich und werden verschieden
            reklamiert: das eine kam an und ist unbrauchbar, das andere war nie
            da. Deshalb die Frage — unmittelbar über dem Ziffernblock, im selben
            Griff wie die Zahl, die sie ausgelöst hat. */}
        {fehlt && !gesperrt && (
          <div className="mt-4 shrink-0 pb-1">
            <p className="text-base font-semibold">Davon beschädigt angekommen?</p>
            <div className="mt-2 flex gap-tapgap">
              {['0', '1', '2'].map((menge) => {
                const gewaehlt = erklaert && (bruch?.anzahlGebinde ?? '0') === menge
                return (
                  <button
                    key={menge}
                    type="button"
                    onClick={() =>
                      aufAendern({ ...position, abweichungen: mitBruch(position, menge) })
                    }
                    aria-pressed={gewaehlt}
                    className={`tap h-tap flex-1 rounded-ctl text-base focus-visible:fokus ${
                      gewaehlt
                        ? 'border-2 border-primary bg-primary-soft font-semibold text-primary-soft-on'
                        : 'border border-border-strong font-medium'
                    }`}
                  >
                    {menge === '0' ? 'nichts' : `${menge} Bruch`}
                  </button>
                )
              })}
            </div>
          </div>
        )}
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

/**
 * Die drei Fassungen eines Mengenfelds.
 *
 * `papier` ist die Bestellung: gedeckte Fläche, kein Rahmen, keine Reaktion.
 * `ruhend` und `aktiv` sind dieselbe Taste in zwei Zuständen — der aktive trägt
 * Rahmen, Hinterlegung und Farbe, damit ohne Hinsehen klar ist, wohin die
 * nächste Ziffer fällt. Farbe steht dabei nicht allein: nur das aktive Feld ist
 * überhaupt umrandet.
 *
 * `Feld` und `Preiszeile` sind exportiert, weil die Leergutmaske dieselben
 * Bausteine braucht: dort bestimmen dieselben Tasten, wohin der Ziffernblock
 * schreibt. Eine zweite Fassung der Fassungen liefe auseinander.
 */
const FASSUNG = {
  papier: { form: 'bg-surface-2', zahl: 'text-text-muted', text: 'text-text-muted' },
  ruhend: { form: 'border border-border-strong', zahl: 'text-text', text: 'text-text-muted' },
  aktiv: {
    form: `border-2 ${ROLLEN.primary.rand} bg-primary-soft`,
    zahl: ROLLEN.primary.text,
    text: ROLLEN.primary.schrift,
  },
} as const

export function Feld({
  fassung,
  beschriftung,
  wert,
  aufKlick,
}: {
  fassung: keyof typeof FASSUNG
  beschriftung: string
  wert: string | null
  /** Fehlt bei Feldern, die nur dastehen — bestellt, oder alles nach der Bestätigung. */
  aufKlick?: () => void
}) {
  const ton = FASSUNG[fassung]
  const inhalt = (
    <>
      <span className={`text-3xl font-semibold tabular-nums ${ton.zahl}`}>
        {wert === null || wert === '' ? '—' : alsEingabe(wert)}
      </span>
      <span className={`text-beschriftung uppercase ${ton.text}`}>{beschriftung}</span>
    </>
  )
  const form = `flex h-20 flex-1 flex-col items-center justify-center gap-1.5 rounded-ctl px-2 ${ton.form}`

  if (aufKlick === undefined) return <div className={form}>{inhalt}</div>

  return (
    <button
      type="button"
      onClick={aufKlick}
      aria-pressed={fassung === 'aktiv'}
      // Ohne diesen Namen liest eine Sprachausgabe nur die nackte Zahl vor.
      aria-label={`${beschriftung}: ${wert === null || wert === '' ? 'kein Wert' : alsEingabe(wert)}`}
      className={`tap focus-visible:fokus ${form}`}
    >
      {inhalt}
    </button>
  )
}

/**
 * Der Preis laut Lieferschein — kein Mengenfeld und deshalb auch keines der
 * grossen Kästen: eine Zeile in Tastenhöhe, Beschriftung links, Zahl rechts.
 * Aktiv trägt sie denselben Rahmen wie ein Mengenfeld, denn sie ist dann
 * dasselbe: das Ziel des Ziffernblocks.
 */
export function Preiszeile({
  beschriftung,
  wert,
  aktiv,
  aufKlick,
}: {
  beschriftung: string
  wert: string
  aktiv: boolean
  aufKlick?: () => void
}) {
  const ton = FASSUNG[aktiv ? 'aktiv' : 'ruhend']
  const inhalt = (
    <>
      <span className={`min-w-0 flex-1 truncate text-left text-base ${ton.text}`}>
        {beschriftung}
      </span>
      <span className={`text-zeile font-semibold tabular-nums ${ton.zahl}`}>
        {wert === '' ? '—' : wert}
      </span>
    </>
  )
  const form = `flex h-tap w-full items-center gap-3 rounded-ctl px-3 ${ton.form}`

  if (aufKlick === undefined) return <div className={form}>{inhalt}</div>

  return (
    <button
      type="button"
      onClick={aufKlick}
      aria-pressed={aktiv}
      aria-label={`${beschriftung}: ${wert === '' ? 'kein Wert' : wert}`}
      className={`tap focus-visible:fokus ${form}`}
    >
      {inhalt}
    </button>
  )
}
