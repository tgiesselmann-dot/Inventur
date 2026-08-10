'use client'

/**
 * Die Prüfliste: eine Zeile je Position des Lieferscheins.
 *
 * Der Bildschirm, an dem der ganze Entwurf hängt. Die tatsächliche Menge steht
 * bereits auf dem Wert des Lieferscheins — wer nichts anfasst, bestätigt damit
 * das Papier. Deshalb gibt es hier keinen Fortschritt und keine Häkchen: eine
 * unberührte Zeile ist keine unerledigte Zeile, sondern die Aussage "stimmt".
 * Ein Zähler "14 von 18 geprüft" würde zu genau der Arbeit auffordern, die diese
 * Maske abschafft.
 *
 * Auch die Leergutzeilen sind Tippflächen wie die Ware: bearbeitet wird in der
 * Leergutmaske am Ziffernblock, nicht in Inline-Feldern. Drei Zahlenfelder in
 * Tastengrösse nebeneinander waren zu klein zum Treffen — und die Liste soll
 * zeigen, nicht erfassen.
 *
 * Gerechnet wird nichts. Menge, Betrag und jeder Satz, der eine Zahl trägt,
 * kommen fertig aus src/lib/wareneingang.ts — auch die Fassungen der
 * Fussschaltfläche und die Sätze unter den Leergutzeilen.
 */

import {
  abschlussstand,
  abweichungstext,
  istErsatzartikel,
  leerguttext,
  leergutzustand,
  preisabweichungsstufe,
  preisabweichungstext,
  stimmig,
  zeilenstand,
  type Leergutzeile,
  type Leergutzustand,
  type Leergutzusammenfassung,
  type PruefPosition,
  type Zeilenstand,
  type Zusammenfassung,
} from '@/lib/wareneingang'
import { alsEingabe } from '@/lib/zaehlung'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss } from '@/ui/vollbild'
import { Leerzustand } from '@/ui/zustand'

/**
 * Die drei Fassungen einer Zeile.
 *
 * Der 4-px-Balken links steht in jeder Zeile, auch in der ruhigen — dort
 * durchsichtig. Ohne ihn rückte die ganze Zeile um vier Punkte, sobald eine
 * Abweichung auftaucht, und die Zahlenspalten flöhen nicht mehr untereinander.
 *
 * Die getönten Zeilen tragen ihre Zweittexte in einer einzigen Stufe
 * (`*-soft-on`). Der Entwurf mischt dort zwei Töne, von denen nur einer AA hält
 * — bei Sonne auf der Rampe ist das der Unterschied zwischen lesbar und nicht.
 */
type Ton = {
  flaeche: string
  /** Beschriftungen, Zweitzeilen und die Zahlen, die vom Papier kommen. */
  text: string
  /** Die tatsächliche Menge — die einzige Zahl, die zählt. */
  zahl: string
  rahmen: string
}

const TON: Record<Zeilenstand, Ton> = {
  stimmt: {
    flaeche: 'border-l-transparent bg-surface',
    text: 'text-text-muted',
    zahl: 'text-text',
    rahmen: 'border-border-strong',
  },
  fehlmenge: {
    flaeche: `${ROLLEN.danger.kante} ${ROLLEN.danger.flaeche}`,
    text: ROLLEN.danger.schrift,
    zahl: ROLLEN.danger.schrift,
    rahmen: ROLLEN.danger.rand,
  },
  ueberlieferung: {
    flaeche: `${ROLLEN.attention.kante} ${ROLLEN.attention.flaeche}`,
    text: ROLLEN.attention.schrift,
    zahl: ROLLEN.attention.schrift,
    rahmen: ROLLEN.attention.rand,
  },
}

/**
 * Die Fassungen der Leergutzeilen, auf dieselben Töne abgebildet: "weniger
 * zurück" ist Geld, das beim Lieferanten liegt — Rot wie eine Fehlmenge, nicht
 * Bernstein: der Betrag ist berechnet, keine Frage. "mehr zurück" ist eine
 * Frage. Die namenlose Zeile ist nicht abrechenbar und damit ebenfalls Rot.
 */
const LEERGUT_TON: Record<Leergutzustand, Ton> = {
  stimmt: TON.stimmt,
  weniger: TON.fehlmenge,
  mehr: TON.ueberlieferung,
  fehler: TON.fehlmenge,
}

export function Liste({
  positionen,
  leergut,
  mitBestellung,
  geprueft,
  summe,
  leergutSumme,
  aufZeile,
  aufSuche,
  aufLeergutZeile,
  aufLeergutNeu,
  aufBestaetigen,
}: {
  positionen: PruefPosition[]
  leergut: Leergutzeile[]
  mitBestellung: boolean
  geprueft: boolean
  summe: Zusammenfassung
  leergutSumme: Leergutzusammenfassung
  aufZeile: (id: string) => void
  aufSuche: () => void
  aufLeergutZeile: (id: string) => void
  aufLeergutNeu: () => void
  aufBestaetigen: () => void
}) {
  const stand = abschlussstand(summe, leergutSumme)
  const leer = positionen.length === 0

  return (
    <>
      <div className="flex flex-1 flex-col overflow-y-auto bg-surface">
        {summe.unbewertbar > 0 && (
          <p className="border-b border-border px-4 py-3 text-sm text-text-muted">
            {summe.unbewertbar === 1
              ? '1 Abweichung ohne hinterlegten Preis — sie ist nicht in der Summe enthalten.'
              : `${summe.unbewertbar} Abweichungen ohne hinterlegten Preis — sie sind nicht in der Summe enthalten.`}
          </p>
        )}
        {summe.zugesagt > 0 && (
          <p className="border-b border-border px-4 py-3 text-sm text-text-muted">
            {summe.zugesagt === 1
              ? '1 Fehlmenge ist als Nachlieferung zugesagt und nicht Teil der Forderung.'
              : `${summe.zugesagt} Fehlmengen sind als Nachlieferung zugesagt und nicht Teil der Forderung.`}
          </p>
        )}

        {leer ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <Leerzustand
              titel="Noch keine Position erfasst"
              erklaerung="Am Lieferschein entlang hinzufügen."
            />
          </div>
        ) : (
          <>
            <ul>
              {positionen.map((position) => (
                <Zeile
                  key={position.id}
                  position={position}
                  mitBestellung={mitBestellung}
                  geprueft={geprueft}
                  aufKlick={() => aufZeile(position.id)}
                />
              ))}
            </ul>

            {!geprueft && (
              <div className="p-2">
                <Hinzufuegen aufKlick={aufSuche} />
              </div>
            )}
          </>
        )}

        {/* Vor der ersten Position bleibt der Leergut-Block weg: ein leerer
            Bildschirm soll einen nächsten Schritt zeigen und nicht drei. Eine
            Lieferung ohne Position lässt sich ohnehin nicht bestätigen. */}
        {(!leer || leergut.length > 0) && (
          <Leergutblock
            zeilen={leergut}
            gesperrt={geprueft}
            aufZeile={aufLeergutZeile}
            aufNeu={aufLeergutNeu}
          />
        )}
      </div>

      {/* Bei leerer Lieferung sitzt die einzige Handlung fest über dem Fuss —
          direkt über dem Daumen, statt in der Mitte des Bildschirms. */}
      {leer && !geprueft && (
        <div className="shrink-0 bg-surface px-2 pb-2">
          <Hinzufuegen aufKlick={aufSuche} />
        </div>
      )}

      {geprueft ? (
        <p className="flex shrink-0 items-center justify-center gap-2.5 border-t border-border bg-surface px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zeile font-semibold text-confirm-text">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-confirm" />
          Dieser Wareneingang ist bestätigt.
        </p>
      ) : (
        <Maskenfuss>
          {/* Gesperrt nennt die Aufschrift den Grund und nicht nur die Sperre:
              "2 Positionen ohne Erklärung" beantwortet die Frage, die ein graues
              Feld sonst offen lässt — und dieselbe Aussage steht oben an den
              betroffenen Zeilen. */}
          <Schaltflaeche
            breit
            rolle={stand.art === 'stimmig' ? 'confirm' : 'primary'}
            disabled={stand.art === 'leer' || stand.art === 'unerklaert'}
            onClick={aufBestaetigen}
          >
            {stand.text}
          </Schaltflaeche>
        </Maskenfuss>
      )}
    </>
  )
}

/** Die gestrichelte Fläche für Ware, die nicht auf dem Lieferschein steht. */
function Hinzufuegen({ aufKlick }: { aufKlick: () => void }) {
  return (
    <button
      type="button"
      onClick={aufKlick}
      className="tap flex h-16 w-full items-center justify-center rounded-ctl border-2 border-dashed border-border-strong bg-surface-2 text-zeile font-semibold text-text-muted focus-visible:fokus"
    >
      + Position hinzufügen
    </button>
  )
}

/**
 * Eine Zeile: links der Artikel, rechts die Mengen nebeneinander.
 *
 * Nur "tatsächlich" trägt einen Rahmen. Bestellt und Lieferschein sind Papier
 * und stehen ohne Rand daneben — so findet der Daumen die eine Zahl, die
 * geändert werden kann, ohne hinzusehen. Nach der Bestätigung fällt auch dieser
 * Rahmen weg: es gibt dann nichts mehr zu ändern.
 *
 * "bestellt" bleibt bewusst unbetont, auch wenn der Lieferant anders geliefert
 * hat als bestellt. Das ist eine Sache fürs Büro und für die nächste Bestellung
 * — an der Rampe zählt, was auf der Palette steht.
 */
function Zeile({
  position,
  mitBestellung,
  geprueft,
  aufKlick,
}: {
  position: PruefPosition
  mitBestellung: boolean
  geprueft: boolean
  aufKlick: () => void
}) {
  const ton = TON[zeilenstand(position)]
  const abweichung = abweichungstext(position)
  const preis = preisabweichungstext(position)

  return (
    <li>
      <button
        type="button"
        onClick={aufKlick}
        className={`tap w-full border-b border-l-4 border-b-surface-2 py-3.5 pr-4 pl-3 text-left focus-visible:fokus ${ton.flaeche}`}
      >
        <div className="flex items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5">
            <span className="truncate text-zeile font-semibold text-text">
              {position.artikel.name}
            </span>
            <span className={`truncate text-sm ${ton.text}`}>
              {position.artikel.lieferGebindeText}
            </span>
            {/* Ohne truncate: der bestellte Artikel ist bei einem Ersatz die
                eigentliche Frage und darf lieber umbrechen als abreissen. */}
            {istErsatzartikel(position) && (
              <span className="text-sm text-attention-text">
                statt {position.bestellterArtikel?.name}{' '}
                {position.bestellterArtikel?.lieferGebindeText}
              </span>
            )}
          </span>

          <span className="flex shrink-0 items-start gap-2">
            {mitBestellung && (
              <Menge beschriftung="bestellt" wert={position.bestellt} ton={ton} schmal />
            )}
            <Menge beschriftung="Lieferschein" wert={position.lieferschein} ton={ton} />
            <Menge
              beschriftung="tatsächlich"
              wert={position.tatsaechlich}
              ton={ton}
              gross
              rahmen={!geprueft}
            />
          </span>
        </div>

        {abweichung !== null && (
          <p className={`mt-2 text-sm font-semibold ${ton.text}`}>{abweichung}</p>
        )}
        {/* Dieselbe Aussage wie die gesperrte Fusstaste, an der Stelle, die sie
            betrifft. */}
        {!stimmig(position) && (
          <p className={`mt-0.5 text-sm ${ton.text}`}>Grund fehlt — Zeile antippen</p>
        )}
        {/* Der Preisstreifen trägt die Stufe als Ton: die stille Abweichung
            bleibt grau — geändert, aber nicht falsch, entschieden wird später.
            Erst die unplausible wird Bernstein: hinsehen, solange der Fahrer
            noch da ist. */}
        {preis !== null && (
          <p
            className={`mt-1 text-sm ${
              preisabweichungsstufe(position) === 'nachfragen'
                ? 'font-semibold text-attention-text'
                : ton.text
            }`}
          >
            {preis}
          </p>
        )}
      </button>
    </li>
  )
}

/** Eine Mengenspalte: die Zahl über ihrer Beschriftung. */
function Menge({
  beschriftung,
  wert,
  ton,
  schmal = false,
  gross = false,
  rahmen = false,
}: {
  beschriftung: string
  wert: string | null
  ton: Ton
  /** Die schwächste der drei Spalten — "bestellt" ist eine Absicht, keine Ware. */
  schmal?: boolean
  /** Die tatsächliche Menge: grösser gesetzt und in der Farbe des Befunds. */
  gross?: boolean
  rahmen?: boolean
}) {
  return (
    <span className={`flex flex-col items-center gap-1.5 ${schmal ? 'w-12' : 'w-16'}`}>
      <span
        className={`flex h-14 w-full items-center justify-center rounded-ctl ${
          gross ? `text-titel ${ton.zahl}` : `text-zeile ${ton.text}`
        } ${rahmen ? `border-2 bg-surface ${ton.rahmen}` : ''}`}
      >
        {wert === null ? '—' : alsEingabe(wert)}
      </span>
      <span className={`text-xs ${ton.text}`}>{beschriftung}</span>
    </span>
  )
}

/**
 * Das zurückgegebene Leergut — ein eigener Block unter der Ware.
 *
 * Eigener Block und nicht zwischen die Positionen gemischt, weil Leergut in die
 * andere Richtung geht: es verlässt den Betrieb. Auf dem Lieferschein steht es
 * ebenfalls für sich, und wer die Palette gegen das Papier prüft, arbeitet
 * beide Blöcke nacheinander ab.
 *
 * Die Zeilen sind Tippflächen wie die Warenzeilen darüber; "Leergut
 * hinzufügen" öffnet direkt die Zeilenmaske. Die Mengen stehen in denselben
 * Spalten wie bei der Ware — nur "zurück" trägt den Rahmen, denn nur sie wird
 * an der Rampe festgestellt.
 */
function Leergutblock({
  zeilen,
  gesperrt,
  aufZeile,
  aufNeu,
}: {
  zeilen: Leergutzeile[]
  gesperrt: boolean
  aufZeile: (id: string) => void
  aufNeu: () => void
}) {
  if (gesperrt && zeilen.length === 0) return null

  return (
    <section className="border-t border-border">
      <h2 className="bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-text-muted uppercase">
        Leergut zurück
      </h2>

      {zeilen.length === 0 ? (
        <p className="px-4 py-2 text-sm text-text-muted">Nichts zurückgegeben.</p>
      ) : (
        <ul>
          {zeilen.map((zeile) => {
            const ton = LEERGUT_TON[leergutzustand(zeile)]
            const befund = leerguttext(zeile)
            return (
              <li key={zeile.id}>
                <button
                  type="button"
                  onClick={() => aufZeile(zeile.id)}
                  className={`tap w-full border-b border-l-4 border-b-surface-2 py-3.5 pr-4 pl-3 text-left focus-visible:fokus ${ton.flaeche}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1.5">
                      <span
                        className={`truncate text-zeile font-semibold ${
                          zeile.bezeichnung.trim() === '' ? ton.text : 'text-text'
                        }`}
                      >
                        {zeile.bezeichnung.trim() === '' ? 'Ohne Bezeichnung' : zeile.bezeichnung}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-start gap-2">
                      <Menge beschriftung="Lieferschein" wert={zeile.lieferschein} ton={ton} />
                      <Menge
                        beschriftung="zurück"
                        wert={zeile.tatsaechlich}
                        ton={ton}
                        gross
                        rahmen={!gesperrt}
                      />
                    </span>
                  </div>

                  {befund !== null && (
                    <p className={`mt-2 text-sm font-semibold ${ton.text}`}>{befund}</p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!gesperrt && (
        <div className="p-2">
          <button
            type="button"
            onClick={aufNeu}
            className="tap h-tap w-full rounded-ctl border-2 border-dashed border-border-strong text-base font-medium text-text-muted focus-visible:fokus"
          >
            + Leergut hinzufügen
          </button>
        </div>
      )}
    </section>
  )
}
