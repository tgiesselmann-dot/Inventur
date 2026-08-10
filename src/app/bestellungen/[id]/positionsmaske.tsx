'use client'

/**
 * Die Positionsliste einer gespeicherten Bestellung — zum Lesen, zum Ändern und
 * zum Drucken.
 *
 * Eine Tabelle für alle vier Stände und für das Papier, nicht drei. Was sich
 * unterscheidet, ist die Menge: als Eingabefeld, solange die Bestellung änderbar
 * ist, sonst als Zahl. Im Ausdruck bleibt von dem Feld nur sein Wert stehen
 * (siehe `@media print` in globals.css), und rechts kommt die Spalte zum Abhaken
 * dazu. Eine zweite Vorlage für den Druck wäre eine zweite Stelle, an der sich
 * eine Spalte ändern müsste.
 *
 * Gerechnet wird hier nicht: Positionswerte laufen über `wertGebindeCent`, die
 * Summe über `mengensumme` — beides dieselben Funktionen, die auch der
 * Bestellvorschlag benutzt.
 *
 * Artikel dazunehmen geschieht nicht über eine eigene Maske, sondern über
 * dieselbe Liste: umschalten auf alle Artikel, suchen, Menge setzen. Eine Zeile
 * mit Menge 0 steht nicht in der Bestellung — das ist die ganze Regel, und sie
 * gilt in beide Richtungen.
 */

import { useActionState, useState } from 'react'

import { bestellwerttext, mengensumme, type Bestellzeile } from '@/lib/bestellung'
import { wertGebindeCent } from '@/lib/einheiten'
import { alsEuro } from '@/lib/wareneingang'
import { Mengenfeld } from '@/ui/mengenfeld'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { AKTION_LEER } from '../../aktionszustand'
import { positionenSpeichern } from '../aktionen'


type Props = {
  bestellungId: string
  /** Alle aktiven Artikel, die der Bestellung zugeordnet sind oder es werden können. */
  zeilen: Bestellzeile[]
  aenderbar: boolean
  /** Für den Hinweis: nach dem Abschicken ändert sich, wogegen der Wareneingang prüft. */
  versendet: boolean
}

export function Positionsmaske({ bestellungId, zeilen, aenderbar, versendet }: Props) {
  const [zustand, aktion, laeuft] = useActionState(positionenSpeichern, AKTION_LEER)
  const [mengen, setMengen] = useState<Record<string, number>>({})
  const [alleZeigen, setAlleZeigen] = useState(false)
  const [suche, setSuche] = useState('')

  const menge = (zeile: Bestellzeile): number => mengen[zeile.artikelId] ?? zeile.mengeGebinde

  const setzen = (zeile: Bestellzeile, wert: number) =>
    setMengen((vorher) => {
      const rest = { ...vorher }
      // Zurück auf dem gespeicherten Wert ist keine Änderung mehr — der Eintrag
      // verschwindet, damit "nichts geändert" auch wirklich nichts heisst.
      if (wert === zeile.mengeGebinde) delete rest[zeile.artikelId]
      else rest[zeile.artikelId] = wert
      return rest
    })

  const bestellt = zeilen.filter((zeile) => menge(zeile) > 0)
  const gesamt = mengensumme(zeilen, menge)

  /**
   * Was von der gespeicherten Bestellung abweicht — verglichen, nicht gezählt.
   *
   * Ein Zähler über die Eingriffe wäre nach dem Speichern falsch: die Serveraktion
   * schickt die Seite neu, der Zustand dieser Komponente bleibt aber stehen. Die
   * Zeilen tragen dann schon die neuen Mengen, und ein Schlüsselzähler behauptete
   * weiter zwei offene Änderungen. Der Vergleich heilt sich von selbst.
   */
  const abweichend = zeilen.filter((zeile) => menge(zeile) !== zeile.mengeGebinde)
  const geaendert = abweichend.length

  const passt = (zeile: Bestellzeile) => {
    const text = suche.trim().toLowerCase()
    if (text === '') return true
    return (
      zeile.name.toLowerCase().includes(text) ||
      zeile.kategorie.toLowerCase().includes(text) ||
      zeile.lieferGebindeText.toLowerCase().includes(text)
    )
  }

  /**
   * Eine auf 0 gesetzte Zeile bleibt stehen, solange nicht gespeichert ist.
   *
   * Sonst verschwände sie im Moment des Tippens aus der Liste — und mit ihr die
   * Möglichkeit zu sehen, was da gerade gestrichen wird, und es zurückzunehmen.
   * Nach dem Speichern ist sie weg, denn dann ist es entschieden.
   */
  const sichtbar = (zeile: Bestellzeile) =>
    menge(zeile) > 0 || menge(zeile) !== zeile.mengeGebinde

  const gezeigt = (alleZeigen ? zeilen : zeilen.filter(sichtbar)).filter(passt)

  // Nur Zeilen mit Menge gehen mit; was fehlt, wird gestrichen. Die beiden
  // Feldlisten stehen paarweise, weil der Browser sie in Dokumentreihenfolge
  // überträgt.
  const mitVorschlag = zeilen.some((zeile) => zeile.vorschlagGebinde !== null)
  const mitLieferung = zeilen.some((zeile) => zeile.geliefert !== null)

  return (
    <form action={aktion} className="mt-4">
      <input type="hidden" name="bestellungId" value={bestellungId} />
      {bestellt.map((zeile) => (
        <span key={zeile.artikelId} className="hidden">
          <input type="hidden" name="artikelId" value={zeile.artikelId} />
          <input type="hidden" name="anzahlGebinde" value={menge(zeile)} />
        </span>
      ))}

      {aenderbar && (
        <div className="nur-schirm mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAlleZeigen(!alleZeigen)
                setSuche('')
              }}
              className="tap -ml-2 inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium text-primary-text focus-visible:fokus"
            >
              {alleZeigen ? 'nur die Bestellung' : `Artikel dazunehmen (${zeilen.length} im Stamm)`}
            </button>
            {alleZeigen && (
              <input
                type="search"
                value={suche}
                onChange={(ereignis) => setSuche(ereignis.target.value)}
                placeholder="Artikel suchen"
                className="h-10 min-w-40 rounded-ctl border border-border bg-surface px-3 text-sm"
              />
            )}
          </div>

          {geaendert > 0 && (
            <button
              type="button"
              onClick={() => setMengen({})}
              className="tap -mr-2 inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium text-primary-text focus-visible:fokus"
            >
              Änderungen verwerfen
            </button>
          )}
        </div>
      )}

      {gezeigt.length === 0 ? (
        <p className="rounded-ctl border border-border p-3 text-sm text-text-muted">
          {suche.trim() !== ''
            ? 'Kein Artikel passt zur Suche.'
            : 'Diese Bestellung hat keine Position.'}
        </p>
      ) : (
        <>
          {/* Desktop und Papier. */}
          <div className="hidden overflow-x-auto md:block print:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
                  <th className="py-2 pr-3 font-medium">Artikel</th>
                  <Kopf>Bestellt</Kopf>
                  {mitVorschlag && <Kopf className="nur-schirm">Vor&shy;schlag</Kopf>}
                  <Kopf>je Gebinde</Kopf>
                  <Kopf>Wert</Kopf>
                  {mitLieferung && <Kopf>Geliefert</Kopf>}
                  <Kopf className="nur-druck">Ok</Kopf>
                </tr>
              </thead>
              <tbody>
                {gezeigt.map((zeile) => (
                  <Tabellenzeile
                    key={zeile.artikelId}
                    zeile={zeile}
                    menge={menge(zeile)}
                    setzen={(wert) => setzen(zeile, wert)}
                    aenderbar={aenderbar}
                    mitVorschlag={mitVorschlag}
                    mitLieferung={mitLieferung}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-3">
                    {gesamt.positionen === 1 ? '1 Position' : `${gesamt.positionen} Positionen`}
                  </td>
                  <td className="py-2 pl-3 text-right tabular-nums">{gesamt.gebinde}</td>
                  {mitVorschlag && <td className="nur-schirm" />}
                  <td />
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {bestellwerttext(gesamt)}
                  </td>
                  {mitLieferung && <td />}
                  <td className="nur-druck" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Telefon. */}
          <ul className="divide-y divide-border md:hidden print:hidden">
            {gezeigt.map((zeile) => (
              <Karte
                key={zeile.artikelId}
                zeile={zeile}
                menge={menge(zeile)}
                setzen={(wert) => setzen(zeile, wert)}
                aenderbar={aenderbar}
              />
            ))}
            <li className="flex justify-between py-3 font-semibold">
              <span>
                {gesamt.positionen === 1 ? '1 Position' : `${gesamt.positionen} Positionen`}
              </span>
              <span className="tabular-nums">
                {gesamt.gebinde} Gebinde · {bestellwerttext(gesamt)}
              </span>
            </li>
          </ul>
        </>
      )}

      {gesamt.ohnePreis > 0 && (
        <p className="mt-3 text-sm text-text-muted">
          {gesamt.ohnePreis === 1
            ? '1 Position ohne hinterlegten Einkaufspreis — nicht in der Summe enthalten.'
            : `${gesamt.ohnePreis} Positionen ohne hinterlegten Einkaufspreis — nicht in der Summe enthalten.`}
        </p>
      )}

      {aenderbar && (
        <div className="nur-schirm mt-4">
          {zustand.art === 'fehler' && (
            <p className="mb-2 rounded-ctl bg-danger-soft p-2 text-sm text-danger-soft-on">
              {zustand.meldung}
            </p>
          )}
          {zustand.art === 'gespeichert' && geaendert === 0 && (
            <p className="mb-2 text-sm font-medium text-confirm-text">{zustand.text}</p>
          )}

          {versendet && geaendert > 0 && (
            <p className="mb-2 rounded-ctl bg-attention-soft p-3 text-sm text-attention-soft-on">
              Diese Bestellung ist abgeschickt. Was du hier änderst, ist die Menge, gegen die der
              Wareneingang später prüft — richtig also nur, wenn der Lieferant die Änderung
              tatsächlich kennt.
            </p>
          )}

          <Schaltflaeche type="submit" breit disabled={laeuft || geaendert === 0}>
            {laeuft
              ? 'Wird gespeichert …'
              : geaendert === 0
                ? 'Keine Änderung'
                : `Änderungen speichern · ${geaendert === 1 ? '1 Zeile' : `${geaendert} Zeilen`}`}
          </Schaltflaeche>
        </div>
      )}
    </form>
  )
}

function Kopf({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`py-2 pl-3 text-right font-medium whitespace-nowrap ${className}`}>
      {children}
    </th>
  )
}

/**
 * Was unter der Menge steht: Streichung, Abstand zum gespeicherten Wert, Sperre.
 *
 * Alle drei sagen etwas über das Ändern und verschwinden deshalb, wo nichts mehr
 * änderbar ist. „Nicht streichbar" an einer abgeschlossenen Bestellung wäre ein
 * Hinweis auf eine Taste, die es nicht gibt.
 */
function Vermerk({
  zeile,
  menge,
  aenderbar,
}: {
  zeile: Bestellzeile
  menge: number
  aenderbar: boolean
}) {
  if (!aenderbar) return null

  if (menge === 0) {
    return (
      <span className="block text-xs text-danger-text">
        {zeile.mengeGebinde > 0 ? 'wird gestrichen' : ''}
      </span>
    )
  }
  if (menge !== zeile.mengeGebinde) {
    return (
      <span className="nur-schirm block text-xs text-attention-text">
        geändert · gespeichert {zeile.mengeGebinde}
      </span>
    )
  }
  if (zeile.gesperrt) {
    return (
      <span className="nur-schirm block text-xs text-text-muted">geliefert — nicht streichbar</span>
    )
  }
  return null
}

function Tabellenzeile({
  zeile,
  menge,
  setzen,
  aenderbar,
  mitVorschlag,
  mitLieferung,
}: {
  zeile: Bestellzeile
  menge: number
  setzen: (wert: number) => void
  aenderbar: boolean
  mitVorschlag: boolean
  mitLieferung: boolean
}) {
  const cent = wertGebindeCent(zeile.artikel, menge)
  const jeGebinde = wertGebindeCent(zeile.artikel, 1)
  const abweichend = zeile.vorschlagGebinde !== null && zeile.vorschlagGebinde !== menge

  return (
    <tr className={`border-b border-border ${menge === 0 ? 'text-text-muted' : ''}`}>
      <td className="py-2 pr-3">
        <span className="block">{zeile.name}</span>
        <span className="block text-xs text-text-muted">
          {zeile.lieferGebindeText} · {zeile.kategorie}
        </span>
      </td>
      <td className="py-2 pl-3 text-right">
        <Mengenfeld
          menge={menge}
          setzen={setzen}
          feldId={zeile.artikelId}
          bezeichnung={`${zeile.name} ${zeile.lieferGebindeText}`}
          mitTasten={false}
          mindestens={zeile.gesperrt ? 1 : 0}
          gesperrt={!aenderbar}
        />
        <Vermerk zeile={zeile} menge={menge} aenderbar={aenderbar} />
      </td>
      {mitVorschlag && (
        <td className="nur-schirm py-2 pl-3 text-right tabular-nums">
          {zeile.vorschlagGebinde === null ? (
            <span className="text-text-muted">—</span>
          ) : (
            <span className={abweichend ? 'text-attention-text' : 'text-text-muted'}>
              {zeile.vorschlagGebinde}
            </span>
          )}
        </td>
      )}
      <td className="py-2 pl-3 text-right tabular-nums">
        {jeGebinde === null ? (
          <span className="text-xs text-text-muted">kein Preis</span>
        ) : (
          alsEuro(jeGebinde)
        )}
      </td>
      <td className="py-2 pl-3 text-right tabular-nums">
        {menge === 0 ? (
          <span className="text-text-muted">—</span>
        ) : cent === null ? (
          <span className="text-xs text-text-muted">nicht bewertbar</span>
        ) : (
          alsEuro(cent)
        )}
      </td>
      {mitLieferung && (
        <td className="py-2 pl-3 text-right tabular-nums">
          {zeile.geliefert === null ? <span className="text-text-muted">—</span> : zeile.geliefert}
        </td>
      )}
      <td className="nur-druck py-2 pl-3 text-right">
        {/* Zum Abhaken mit dem Kugelschreiber an der Rampe. */}
        <span className="inline-block h-4 w-4 border border-black align-middle" />
      </td>
    </tr>
  )
}

function Karte({
  zeile,
  menge,
  setzen,
  aenderbar,
}: {
  zeile: Bestellzeile
  menge: number
  setzen: (wert: number) => void
  aenderbar: boolean
}) {
  const cent = wertGebindeCent(zeile.artikel, menge)

  return (
    <li className={`py-3 ${menge === 0 ? 'text-text-muted' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate">{zeile.name}</span>
          <span className="block truncate text-xs text-text-muted">{zeile.lieferGebindeText}</span>
        </span>
        <span className="shrink-0 text-right">
          <Mengenfeld
            menge={menge}
            setzen={setzen}
            feldId={zeile.artikelId}
            bezeichnung={`${zeile.name} ${zeile.lieferGebindeText}`}
            mitTasten={aenderbar}
            mindestens={zeile.gesperrt ? 1 : 0}
            gesperrt={!aenderbar}
          />
          <Vermerk zeile={zeile} menge={menge} aenderbar={aenderbar} />
        </span>
      </div>

      {/* Dieselben drei Fälle wie in der Desktop-Zeile: eine gestrichene Zeile
          hat keinen Wert von 0,00 EUR, sie hat keinen. */}
      <p className="mt-1 text-xs text-text-muted tabular-nums">
        {menge === 0 ? '—' : cent === null ? 'nicht bewertbar' : alsEuro(cent)}
        {zeile.vorschlagGebinde !== null && ` · Vorschlag ${zeile.vorschlagGebinde}`}
        {zeile.geliefert !== null && ` · ${zeile.geliefert} geliefert`}
      </p>
    </li>
  )
}
