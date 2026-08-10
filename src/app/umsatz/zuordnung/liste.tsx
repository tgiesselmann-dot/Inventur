'use client'

/**
 * Die Arbeitsliste selbst — und das Wenige, das über eine einzelne Zeile
 * hinausgeht.
 *
 * Zwei Dinge lassen sich in der Zeile nicht entscheiden: welche Zeile
 * aufgeklappt ist, und wohin der Fokus nach einem Enter springt. Beides gehört
 * deshalb hierher, und nur beides — gespeichert wird weiterhin je Zeile.
 *
 * Der Sprung ist der Grund, warum dieser Bildschirm zu Ende gearbeitet wird.
 * Vierhundert Bezeichnungen einzeln anzuklicken schafft niemand an einem
 * Nachmittag; Tab, Zahl, Enter, weiter schon.
 *
 * Dazu kommt der Auswahlmodus: viele Bezeichnungen markieren und auf einmal
 * ausnehmen oder wieder aufnehmen. Er ist für das Abräumen gebaut — ein
 * Jahresexport bringt hunderte Speisen mit, und die einzeln auszunehmen wäre
 * dieselbe Nachmittagsarbeit noch einmal. Zuordnen kann er bewusst nicht:
 * eine Menge gehört in eine Zeile, die jemand gelesen hat, nicht auf zwanzig
 * gestempelt. Im Auswahlmodus zeigt die Liste deshalb nur Lesezeilen; die
 * Formulare der Zeilen bleiben dem Arbeitsmodus vorbehalten.
 */

import { useCallback, useState, useTransition } from 'react'

import { zeilenzustand } from '@/lib/kassenzuordnung-anzeige'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { AKTION_LEER, type Aktionszustand } from '../../aktionszustand'
import { sammelAktion, type Sammelmodus } from './aktionen'
import { KANTE, Zuordnungszeile, type Auswahleintrag, type Zeilendaten } from './zeile'


export function Zuordnungsliste({
  zeilen,
  auswahl,
}: {
  zeilen: Zeilendaten[]
  auswahl: Auswahleintrag[]
}) {
  const [fokusId, setzeFokusId] = useState<string | null>(null)
  const [sprungId, setzeSprungId] = useState<string | null>(null)
  /**
   * Was in dieser Sitzung schon bestätigt wurde.
   *
   * Nötig, weil die Serverdaten erst nach dem Neuladen nachkommen: ohne diese
   * Menge zeigte „nächste offene Zeile" auf die gerade eben erledigte, und der
   * Fokus bliebe stehen, wo er war.
   */
  const [erledigt, setzeErledigt] = useState<ReadonlySet<string>>(new Set())

  const [auswahlmodus, setzeAuswahlmodus] = useState(false)
  const [markiert, setzeMarkiert] = useState<ReadonlySet<string>>(new Set())
  const [meldung, setzeMeldung] = useState<Aktionszustand>(AKTION_LEER)
  const [laeuft, starte] = useTransition()

  const fertig = useCallback(
    (id: string, springen: boolean) => {
      setzeErledigt((vorher) => new Set(vorher).add(id))
      if (!springen) return

      const start = zeilen.findIndex((zeile) => zeile.id === id)
      const naechste = zeilen
        .slice(start + 1)
        .find((zeile) => !zeile.bestaetigt && !erledigt.has(zeile.id) && zeile.id !== id)

      if (naechste === undefined) return
      setzeFokusId(naechste.id)
      setzeSprungId(naechste.id)
    },
    [zeilen, erledigt],
  )

  const gesprungen = useCallback(() => setzeSprungId(null), [])

  // Nur, was gerade auf dem Bildschirm steht, zählt als ausgewählt: nach einem
  // Neuladen verschwundene Zeilen fallen so still aus der Auswahl, statt als
  // unsichtbare ids in einer Sammelaktion zu landen.
  const ausgewaehlt = zeilen.filter((zeile) => markiert.has(zeile.id))
  const mitZuordnung = ausgewaehlt.filter((zeile) => zeile.bestandteile.length > 0).length

  function umschalten(id: string) {
    setzeMarkiert((vorher) => {
      const neu = new Set(vorher)
      if (neu.has(id)) neu.delete(id)
      else neu.add(id)
      return neu
    })
    setzeMeldung(AKTION_LEER)
  }

  function beende() {
    setzeAuswahlmodus(false)
    setzeMarkiert(new Set())
    setzeMeldung(AKTION_LEER)
  }

  function fuehreAus(modus: Sammelmodus) {
    starte(async () => {
      const ergebnis = await sammelAktion(
        ausgewaehlt.map((zeile) => zeile.id),
        modus,
      )
      setzeMeldung(ergebnis)
      if (ergebnis.art === 'gespeichert') setzeMarkiert(new Set())
    })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => (auswahlmodus ? beende() : setzeAuswahlmodus(true))}
          aria-pressed={auswahlmodus}
          className={`tap h-tap rounded-ctl px-4 text-sm font-medium focus-visible:fokus ${
            auswahlmodus
              ? 'border border-primary bg-primary-soft font-semibold text-primary-soft-on'
              : 'border border-border bg-surface'
          }`}
        >
          {auswahlmodus ? 'Auswahl beenden' : 'Mehrere auswählen'}
        </button>
      </div>

      <div className="overflow-hidden rounded-ctl border border-border">
        {!auswahlmodus && (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_104px_20px_minmax(0,1fr)_176px_minmax(0,1.15fr)_128px] items-center gap-3.5 border-b border-border bg-surface-2 px-4 py-2 text-beschriftung text-text-muted uppercase lg:grid">
              <span className="col-span-3">Aus dem Kassenexport</span>
              <span className="col-span-4 border-l border-border-strong pl-3.5">
                Artikel im Stamm · Wirkung auf den Bestand
              </span>
            </div>
            <div className="hidden grid-cols-[minmax(0,1fr)_104px_20px_minmax(0,1fr)_176px_minmax(0,1.15fr)_128px] items-center gap-3.5 border-b border-border bg-bg px-4 py-1.5 text-sm text-text-muted lg:grid">
              <span>Bezeichnung wie in der Kasse</span>
              <span className="text-right">Verkäufe</span>
              <span />
              <span>Artikel</span>
              <span>Menge je Verkauf</span>
              <span>Auswirkung</span>
              <span />
            </div>
          </>
        )}

        {zeilen.map((zeile) =>
          auswahlmodus ? (
            <Auswahlzeile
              key={zeile.id}
              zeile={zeile}
              auswahl={auswahl}
              ausgewaehlt={markiert.has(zeile.id)}
              aufUmschalten={() => umschalten(zeile.id)}
            />
          ) : (
            <Zuordnungszeile
              key={zeile.id}
              zeile={zeile}
              auswahl={auswahl}
              istFokus={fokusId === zeile.id}
              springHierher={sprungId === zeile.id}
              aufFokus={() => setzeFokusId(zeile.id)}
              aufFertig={(springen) => fertig(zeile.id, springen)}
              aufGesprungen={gesprungen}
            />
          ),
        )}
      </div>

      {auswahlmodus && (
        <div className="sticky bottom-0 z-10 mt-3 rounded-ctl border border-border-strong bg-surface p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-tapgap">
            <p className="flex min-h-tap items-center px-1 text-base font-semibold">
              {ausgewaehlt.length === 1 ? '1 ausgewählt' : `${ausgewaehlt.length} ausgewählt`}
            </p>
            <button
              type="button"
              onClick={() =>
                setzeMarkiert(
                  ausgewaehlt.length === zeilen.length
                    ? new Set()
                    : new Set(zeilen.map((zeile) => zeile.id)),
                )
              }
              className="tap h-tap rounded-ctl px-3 text-sm font-medium text-primary-text focus-visible:fokus"
            >
              {ausgewaehlt.length === zeilen.length ? 'Keine auswählen' : `Alle ${zeilen.length} auswählen`}
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-tapgap">
              <Schaltflaeche
                art="sekundaer"
                onClick={() => fuehreAus('aufnehmen')}
                disabled={laeuft || ausgewaehlt.length === 0}
              >
                Wieder aufnehmen
              </Schaltflaeche>
              <Schaltflaeche
                onClick={() => fuehreAus('ausnehmen')}
                disabled={laeuft || ausgewaehlt.length === 0}
              >
                Ausnehmen
              </Schaltflaeche>
            </div>
          </div>

          {/* Die Ansage vor dem Verlust: Ausnehmen wirft auch bestehende
              Zuordnungen weg, und das darf niemanden überraschen. */}
          {mitZuordnung > 0 && (
            <p className="mt-2 rounded-ctl bg-attention-soft p-2 text-sm text-attention-soft-on">
              {mitZuordnung === 1
                ? 'Eine ausgewählte Bezeichnung trägt eine Zuordnung — Ausnehmen entfernt sie.'
                : `${mitZuordnung} ausgewählte Bezeichnungen tragen eine Zuordnung — Ausnehmen entfernt sie.`}
            </p>
          )}
          {meldung.art === 'fehler' && (
            <p className="mt-2 rounded-ctl bg-danger-soft p-2 text-sm text-danger-soft-on">
              {meldung.meldung}
            </p>
          )}
          {meldung.art === 'gespeichert' && (
            <p className="mt-2 text-sm font-medium text-confirm-text">{meldung.text}</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Eine Zeile im Auswahlmodus: Lesezeile mit Auswahlfeld, kein Formular.
 *
 * Die ganze Fläche schaltet um — als label um die Checkbox, damit Fläche und
 * Feld dasselbe Element sind und die Tastatur (Tab, Leertaste) von selbst
 * funktioniert. Ein gespeicherter Vorschlag existiert nicht, deshalb kennt
 * diese Zeile nur offen, bestätigt und ausgenommen.
 */
function Auswahlzeile({
  zeile,
  auswahl,
  ausgewaehlt,
  aufUmschalten,
}: {
  zeile: Zeilendaten
  auswahl: Auswahleintrag[]
  ausgewaehlt: boolean
  aufUmschalten: () => void
}) {
  const lage = zeilenzustand({
    bestaetigt: zeile.bestaetigt,
    artikelInDerZeile: zeile.bestandteile.length,
  })

  return (
    <label
      className={`flex min-h-tap cursor-pointer items-center gap-3.5 border-b border-border px-4 py-3 ${
        ausgewaehlt ? 'border-l-4 border-l-primary bg-primary-soft' : KANTE[lage]
      }`}
    >
      <input
        type="checkbox"
        checked={ausgewaehlt}
        onChange={aufUmschalten}
        aria-label={`${zeile.posBezeichnung} auswählen`}
        className="size-5 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-zeile font-semibold">{zeile.posBezeichnung}</span>
        <span
          className={`block truncate text-sm ${
            ausgewaehlt
              ? 'text-primary-soft-on'
              : lage === 'offen'
                ? 'text-attention-soft-on'
                : 'text-text-muted'
          }`}
        >
          {zustandstext(zeile, auswahl, lage)}
        </span>
      </span>
      <span className="shrink-0 text-lg font-semibold">
        <span className="text-sm font-normal text-text-muted">Verkäufe </span>
        {zeile.verkaeufe}
      </span>
    </label>
  )
}

/**
 * Was unter der Bezeichnung steht, solange nur gelesen wird: die Lage — und bei
 * einer bestätigten Zeile der Artikel, der an ihr hängt. Gerade hier muss er
 * stehen: wer eine zugeordnete Zeile mit ausnimmt, soll sehen, was er aufgibt.
 */
function zustandstext(
  zeile: Zeilendaten,
  auswahl: Auswahleintrag[],
  lage: ReturnType<typeof zeilenzustand>,
): string {
  if (lage === 'ausgenommen') return 'ausgenommen'
  if (lage === 'offen' || lage === 'vorschlag') return 'nicht zugeordnet'

  const erster = auswahl.find((eintrag) => eintrag.id === zeile.bestandteile[0]?.artikelId)
  const name = erster?.name ?? 'Artikel nicht mehr im Stamm'
  const weitere = zeile.bestandteile.length - 1
  return weitere > 0 ? `zugeordnet: ${name} + ${weitere} weitere` : `zugeordnet: ${name}`
}
