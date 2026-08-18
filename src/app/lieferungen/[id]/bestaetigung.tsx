'use client'

/**
 * Der letzte Schritt: Belege sichern, gegenzeichnen lassen, bestätigen.
 *
 * Der Bildschirm rechnet nichts mehr aus, er zeigt, was gleich abgeschickt wird
 * — die Kennzahlen kommen fertig aus `zusammenfassung`, der Fehlbetrag samt
 * offenem Leergut-Pfand aus `fehlbetragtext`.
 *
 * Foto und Unterschrift liegen nicht hier, sondern im Zustand der Prüfmaske:
 * die Unterschrift entsteht in einer eigenen Vollbild-Ansicht, und ein Beleg,
 * der den Ansichtswechsel nicht überlebt, wäre in dem Moment weg, in dem der
 * Fahrer gerade unterschrieben hat.
 *
 * Der Satz zur Gegenzeichnung steht über dem Feld und nicht darunter: er ist der
 * Grund, warum das Feld da ist. Der Fahrer steht noch daneben, danach ist der
 * Anspruch weg — deshalb sperrt eine Abweichung ohne Unterschrift den Fuss, und
 * die Aufschrift nennt den Grund.
 */

import { useEffect, useMemo } from 'react'

import {
  fehlbetragsrolle,
  fehlbetragtext,
  type Leergutzusammenfassung,
  type Zusammenfassung,
} from '@/lib/wareneingang'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss } from '@/ui/vollbild'

import { fotoVerkleinern } from './bildhelfer'

export type Beleg = {
  fahrer: string
  foto: Blob | null
  unterschrift: Blob | null
}

export function Bestaetigung({
  summe,
  leergut,
  mitPreisen,
  beleg,
  sendet,
  aufBeleg,
  aufUnterschreiben,
  aufAbbruch,
  aufBestaetigen,
}: {
  summe: Zusammenfassung
  leergut: Leergutzusammenfassung
  /** Ohne Preissicht nennt die Bestätigung Mengen, aber keinen Fehlbetrag. */
  mitPreisen: boolean
  beleg: Beleg
  sendet: boolean
  aufBeleg: (beleg: Beleg) => void
  /** Öffnet die Vollbild-Zeichenfläche. */
  aufUnterschreiben: () => void
  aufAbbruch: () => void
  aufBestaetigen: () => void
}) {
  // Die Unterschrift ist Pflicht, wo vom Lieferschein abgewichen wird — ohne
  // sie ist der Anspruch weg. Das Foto bleibt freiwillig: es gibt Rampen ohne
  // Licht und Lieferscheine, die der Fahrer wieder mitnimmt.
  const gesperrt = summe.abweichende > 0 && beleg.unterschrift === null

  return (
    <>
      <main className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
        <h1 className="shrink-0 text-titel">Wareneingang bestätigen</h1>

        {/* Beschriftung links, Zahl rechts: die Zahlen fallen dadurch in eine
            Spalte und lassen sich in einem Blick abgehen. */}
        <dl className="mt-5 flex shrink-0 flex-col">
          <Wertzeile name="Positionen" wert={String(summe.positionen)} />
          <Wertzeile name="mit Abweichung" wert={String(summe.abweichende)} />
          {/* Nur wenn es Zusagen gibt: eine "0 Zusagen" wäre eine Meldung über
              das Ausbleiben einer Meldung. */}
          {summe.zugesagt > 0 && (
            <Wertzeile name="als Nachlieferung zugesagt" wert={String(summe.zugesagt)} />
          )}
          {/* Rot ist der Fehlbetrag nur, wo er eine Forderung ist. Eine
              Lieferung ohne Abweichung schuldet niemandem etwas, und ein nicht
              bewertbarer Betrag ist keine Forderung, sondern eine offene
              Frage. Das offene Leergut-Pfand steht mit im Betrag. Ohne
              Preissicht fehlen beide Zeilen — der Fehlbetrag ist Geld. */}
          {mitPreisen && (
            <Wertzeile
              name="Fehlbetrag"
              wert={fehlbetragtext(summe, leergut)}
              rolle={fehlbetragsrolle(summe, leergut)}
            />
          )}
          {/* Erscheint nur, wenn Artikel ohne Einkaufspreis betroffen sind. Der
              Fehlbetrag darüber ist dann unvollständig, und das steht hier,
              statt eine Zahl zu erfinden. */}
          {mitPreisen && summe.unbewertbar > 0 && (
            <Wertzeile
              name="ohne Preis, nicht bewertbar"
              wert={String(summe.unbewertbar)}
              rolle="attention"
              letzte
            />
          )}
        </dl>

        <div className="flex-1" />

        <div className="mt-6 shrink-0 pb-1">
          {summe.abweichende > 0 && (
            <p className="text-base leading-normal text-text-muted">
              Abweichungen gegen den Lieferschein müssen vom Fahrer gegengezeichnet werden,
              sonst ist der Anspruch weg.
            </p>
          )}

          <input
            value={beleg.fahrer}
            onChange={(ereignis) => aufBeleg({ ...beleg, fahrer: ereignis.target.value })}
            placeholder="Name des Fahrers"
            aria-label="Name des Fahrers"
            className="mt-2 h-tap w-full rounded-ctl border border-border-strong bg-surface px-4 text-zeile"
          />

          <div className="mt-2 flex flex-col gap-tapgap">
            <Fotokachel
              foto={beleg.foto}
              aufFoto={(foto) => aufBeleg({ ...beleg, foto })}
            />

            {beleg.unterschrift === null ? (
              <button
                type="button"
                onClick={aufUnterschreiben}
                className="tap flex h-33 w-full flex-col items-center justify-center gap-1 rounded-ctl border-2 border-dashed border-border-strong text-text focus-visible:fokus"
              >
                <span className="text-zeile font-semibold">Zum Unterschreiben tippen</span>
                <span className="text-sm text-text-muted">Solange der Fahrer noch da ist</span>
              </button>
            ) : (
              <>
                {/* Der graue Streifen ist die Quittung: unterschrieben, von wem.
                    Antippen zeichnet neu — die alte Unterschrift ist dann weg. */}
                <button
                  type="button"
                  onClick={aufUnterschreiben}
                  className="tap flex h-tap w-full items-center justify-between rounded-ctl bg-surface-2 px-4 focus-visible:fokus"
                >
                  <span className="text-zeile font-semibold">
                    Unterschrieben{beleg.fahrer.trim() !== '' && ` · ${beleg.fahrer.trim()}`}
                  </span>
                  <span className="text-sm text-text-muted">neu zeichnen</span>
                </button>
                {beleg.foto === null && (
                  <p className="px-1 text-sm text-text-muted">
                    Kein Foto vom Lieferschein — die Kachel darüber nimmt eines auf.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      <Maskenfuss>
        <Schaltflaeche
          breit
          gross
          rolle="confirm"
          disabled={sendet || gesperrt}
          onClick={aufBestaetigen}
        >
          {gesperrt
            ? 'Unterschrift des Fahrers fehlt'
            : sendet
              ? 'Wird bestätigt …'
              : 'Wareneingang bestätigen'}
        </Schaltflaeche>
        {/* Solange gesendet wird, gibt es keinen Weg zurück — die Fläche
            verschwindet, statt gesperrt dazustehen und einen Ausweg
            anzubieten, den sie nicht mehr hat. Ihr Platz bleibt trotzdem
            stehen: der Fuss darf im Moment des Absendens nicht springen und
            die Bestätigungstaste unter den Daumen ziehen. */}
        <div className="mt-2" aria-hidden={sendet}>
          {sendet ? (
            <div className="min-h-tap" />
          ) : (
            <Schaltflaeche art="sekundaer" breit onClick={aufAbbruch}>
              Zurück
            </Schaltflaeche>
          )}
        </div>
      </Maskenfuss>
    </>
  )
}

/**
 * Die Kachel für das Lieferschein-Foto: ein Label über einem versteckten
 * Datei-Feld, damit auf dem Telefon direkt die Kamera aufgeht. Es gibt genau
 * ein Foto je Lieferung (das Schema hat genau ein Pfadfeld) — erneutes
 * Antippen ersetzt die Aufnahme.
 */
function Fotokachel({
  foto,
  aufFoto,
}: {
  foto: Blob | null
  aufFoto: (foto: Blob) => void
}) {
  // Die Vorschau hängt am Blob, nicht am Dateifeld: sie soll den Wechsel in
  // die Unterschrift-Ansicht überleben. Abgeleitet statt in einem Effect
  // gesetzt; freigegeben wird die alte URL im Aufräumer, sonst hält jedes
  // ersetzte Foto Speicher fest.
  const vorschau = useMemo(() => (foto === null ? null : URL.createObjectURL(foto)), [foto])
  useEffect(() => {
    if (vorschau === null) return
    return () => URL.revokeObjectURL(vorschau)
  }, [vorschau])

  async function gewaehlt(ereignis: React.ChangeEvent<HTMLInputElement>) {
    const datei = ereignis.target.files?.[0]
    // Zurücksetzen, damit dieselbe Datei ein zweites Mal wählbar ist.
    ereignis.target.value = ''
    if (datei === undefined) return
    aufFoto(await fotoVerkleinern(datei))
  }

  return (
    <label className="tap relative flex h-22 w-full cursor-pointer items-center justify-center overflow-hidden rounded-ctl border-2 border-dashed border-border-strong text-zeile font-semibold text-text-muted focus-within:fokus">
      {vorschau !== null ? (
        <>
          {/* Kein next/image: die Quelle ist ein ObjectURL auf dem Gerät, da
              gibt es nichts zu optimieren. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vorschau}
            alt="Foto des Lieferscheins"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="relative rounded-ctl bg-surface px-3 py-1 text-sm text-text">
            Foto ersetzen
          </span>
        </>
      ) : (
        'Foto vom Lieferschein'
      )}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(ereignis) => void gewaehlt(ereignis)}
        className="sr-only"
        aria-label="Foto vom Lieferschein aufnehmen"
      />
    </label>
  )
}

/**
 * Eine Zeile der Abschlussrechnung: Name links, Zahl rechts. Kein
 * `src/ui/kennzahl.tsx` — das ist die Kachel mit Versalien-Beschriftung, dies
 * hier ist eine `<dl>`-Zeile; der frühere Lokalname „Kennzahl" verdeckte den
 * ui-Baustein.
 *
 * Die Zahl trägt die Farbe, das Wort daneben die Aussage — "Fehlbetrag" und
 * "ohne Preis, nicht bewertbar" stehen als Text da und nicht nur als Ton. Die
 * neutrale Zahl bleibt text-text: sie ist die Auskunft, kein Nebenwort.
 */
function Wertzeile({
  name,
  wert,
  rolle = 'neutral',
  letzte = false,
}: {
  name: string
  wert: string
  rolle?: 'neutral' | 'attention' | 'danger'
  /** Zieht die Linie auch unter die Zeile, damit die Liste unten abschliesst. */
  letzte?: boolean
}) {
  return (
    <div
      className={`flex h-16 items-center justify-between gap-4 border-t border-border ${
        letzte ? 'border-b' : ''
      }`}
    >
      <dt className="text-base text-text">{name}</dt>
      <dd
        className={`shrink-0 text-titel tabular-nums ${
          rolle === 'neutral' ? 'text-text' : ROLLEN[rolle].text
        }`}
      >
        {wert}
      </dd>
    </div>
  )
}
