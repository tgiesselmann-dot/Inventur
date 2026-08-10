'use client'

/**
 * Die Tabelle des Bestellvorschlags und der Weg zur Bestellung.
 *
 * Zwei Dinge macht diese Maske und sonst nichts: Mengen ändern und die Zeilen
 * abschicken. Gerechnet wird hier nicht — Verbrauch, Bedarf, Fehlmenge und der
 * auf ganze Gebinde aufgerundete Vorschlag kommen fertig aus src/lib/bestellung.ts,
 * der Positionswert einer geänderten Menge läuft über `wertGebindeCent` aus
 * src/lib/einheiten.ts, die Summe über `mengensumme`. Ein Gebindepreis mal einer
 * Anzahl wäre die zweite Stelle, an der Geld gerechnet wird, und genau daran ist
 * die abgelöste Excel gescheitert.
 *
 * Die drei Kennzahlen stehen hier und nicht auf der Seite, weil zwei davon sich
 * unter der Hand ändern: wer eine Menge korrigiert, verschiebt Bestellsumme und
 * Handeingriffe. Eine auf dem Server gerechnete Summe stünde daneben und wäre
 * ab dem ersten Tastendruck falsch.
 *
 * Eine geänderte Menge ist als Handeingriff gekennzeichnet und über die Marke
 * neben dem Feld einzeln zurücksetzbar, über die Taste im Kopf gesammelt.
 * Gespeichert wird das Kennzeichen nicht: es ist der Abstand zum gerechneten
 * Vorschlag und damit jederzeit wieder ablesbar.
 *
 * Standardmässig stehen nur Zeilen mit einer Menge in der Liste. Neunzig leere
 * Zeilen verstecken die zwölf, um die es geht — umschaltbar bleibt es trotzdem,
 * denn wer einen Artikel von Hand dazunimmt, muss ihn finden.
 */

import { useActionState, useState } from 'react'

import { bestellwerttext, mengensumme, type ZeileText } from '@/lib/bestellung'
import { wertGebindeCent } from '@/lib/einheiten'
import { alsEuro } from '@/lib/wareneingang'
import { FELD } from '@/ui/feld'
import { Kennzahl } from '@/ui/kennzahl'
import { Mengenfeld } from '@/ui/mengenfeld'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Umschalter, Umschaltersegment } from '@/ui/umschalter'

import { AKTION_LEER } from '../../aktionszustand'
import { bestellungAnlegen } from '../aktionen'


type Props = {
  zeilen: ZeileText[]
  lieferanten: string[]
  datumVorgabe: string
}

/** Menge je Artikel — nur die vom Vorschlag abweichenden stehen darin. */
type Eingriffe = Record<string, number>

export function Vorschlagsmaske({ zeilen, lieferanten, datumVorgabe }: Props) {
  const [zustand, aktion, laeuft] = useActionState(bestellungAnlegen, AKTION_LEER)
  const [eingriffe, setEingriffe] = useState<Eingriffe>({})
  const [alleZeigen, setAlleZeigen] = useState(false)

  /** Die Menge, die für diese Zeile gilt. */
  const menge = (zeile: ZeileText): number => eingriffe[zeile.artikelId] ?? zeile.vorschlagGebinde

  /** Ob diese Zeile von Hand steht — verglichen, nicht gespeichert. */
  const vonHand = (zeile: ZeileText): boolean => menge(zeile) !== zeile.vorschlagGebinde

  const setzen = (zeile: ZeileText, wert: number) => {
    const gekappt = Math.max(0, Math.trunc(wert))
    setEingriffe((vorher) => {
      // Zurück auf dem Vorschlag ist kein Handeingriff mehr — der Eintrag
      // verschwindet, statt als gleiche Zahl daneben zu liegen.
      const rest = { ...vorher }
      if (gekappt === zeile.vorschlagGebinde) {
        delete rest[zeile.artikelId]
        return rest
      }
      rest[zeile.artikelId] = gekappt
      return rest
    })
  }

  const zuruecksetzen = (zeile: ZeileText) =>
    setEingriffe((vorher) => {
      const rest = { ...vorher }
      delete rest[zeile.artikelId]
      return rest
    })

  /*
   * Sichtbar bleibt, worüber noch zu entscheiden ist oder schon entschieden
   * wurde. Zeilen ohne Kassenbezug tragen keinen Vorschlag, also muss jemand
   * hinsehen. Eine von Hand gesetzte 0 bleibt ebenfalls stehen: sonst
   * verschwände die Entscheidung im Moment des Tippens aus der Liste, und mit
   * ihr die Möglichkeit, sie zurückzunehmen. Alles andere mit Menge 0 ist
   * entschieden und braucht den Platz nicht.
   */
  const gezeigt = alleZeigen
    ? zeilen
    : zeilen.filter((zeile) => menge(zeile) > 0 || zeile.ohneVerbrauch || vonHand(zeile))

  const bestellt = zeilen.filter((zeile) => menge(zeile) > 0)
  const gesamt = mengensumme(zeilen, menge)
  const eingegriffen = zeilen.filter(vonHand).length

  return (
    <form action={aktion} className="mt-4">
      {/* Die Zeilen gehen als zwei gleich lange Feldlisten mit: der Browser
          überträgt sie in Dokumentreihenfolge, und die Aktion liest sie paarweise. */}
      {bestellt.map((zeile) => (
        <span key={zeile.artikelId} className="hidden">
          <input type="hidden" name="artikelId" value={zeile.artikelId} />
          <input type="hidden" name="anzahlGebinde" value={menge(zeile)} />
        </span>
      ))}

      <div className="grid gap-3 sm:grid-cols-3">
        <Kennzahl
          wert={bestellwerttext(gesamt)}
          beschriftung="Bestellsumme"
          unterzeile={
            gesamt.ohnePreis === 0
              ? 'zum hinterlegten Einkaufspreis'
              : `${gesamt.ohnePreis} ${gesamt.ohnePreis === 1 ? 'Position' : 'Positionen'} ohne Preis, nicht enthalten`
          }
        />
        <Kennzahl
          wert={String(gesamt.positionen)}
          beschriftung="Positionen"
          unterzeile={`von ${zeilen.length} Artikeln · ${gesamt.gebinde} Gebinde`}
        />
        <Kennzahl
          wert={String(eingegriffen)}
          beschriftung="Handeingriffe"
          unterzeile="abweichend vom Vorschlag"
          rolle={eingegriffen === 0 ? 'neutral' : 'primary'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Umschalter beschriftung="Welche Zeilen die Tabelle zeigt">
          <Umschaltersegment aktiv={!alleZeigen} aufTipp={() => setAlleZeigen(false)}>
            Nur zu Bestellendes · {gesamt.positionen}
          </Umschaltersegment>
          <Umschaltersegment aktiv={alleZeigen} aufTipp={() => setAlleZeigen(true)}>
            Alle Artikel · {zeilen.length}
          </Umschaltersegment>
        </Umschalter>

        {/* Auf dem Telefon sagt der Umschalter genug — vier Zeilen Erklärung
            neben zwei Schaltflächen drängen die Liste nach unten. */}
        <p className="hidden min-w-0 flex-1 text-sm text-text-muted md:block">
          {alleZeigen
            ? 'Alle Artikel im Stamm, auch die ohne Bedarf'
            : 'Zeilen mit Menge, von Hand gesetzte und solche ohne Kassenbezug'}
        </p>

        {eingegriffen > 0 && (
          <button
            type="button"
            onClick={() => setEingriffe({})}
            className="h-tap shrink-0 px-2 text-sm font-medium text-primary-text"
          >
            {eingegriffen === 1 ? '1 Handeingriff' : `alle ${eingegriffen} Handeingriffe`}{' '}
            zurücksetzen
          </button>
        )}
      </div>

      {gezeigt.length === 0 ? (
        <p className="mt-3 rounded-ctl border border-border p-3 text-sm text-text-muted">
          Nichts zu bestellen — der Bestand deckt den Bedarf für die eingestellte Reichweite.
        </p>
      ) : (
        <>
          {/* Desktop: die ganze Rechnung in einer Zeile. */}
          <div className="mt-3 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-strong text-left text-xs tracking-wide text-text-muted uppercase">
                  <th className="py-2 pr-3 font-medium">Artikel</th>
                  <Kopf>Bestand</Kopf>
                  <Kopf>unter&shy;wegs</Kopf>
                  <Kopf>Verbrauch je Tag</Kopf>
                  <Kopf>Bedarf</Kopf>
                  <Kopf>fehlt</Kopf>
                  <Kopf betont>Bestell&shy;menge</Kopf>
                  <Kopf>Wert</Kopf>
                </tr>
              </thead>
              <tbody>
                {gezeigt.map((zeile) => (
                  <Tabellenzeile
                    key={zeile.artikelId}
                    zeile={zeile}
                    menge={menge(zeile)}
                    setzen={(wert) => setzen(zeile, wert)}
                    zuruecksetzen={() => zuruecksetzen(zeile)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Telefon: je Artikel eine Karte mit Stellrad. */}
          <ul className="mt-3 divide-y divide-border md:hidden">
            {gezeigt.map((zeile) => (
              <Karte
                key={zeile.artikelId}
                zeile={zeile}
                menge={menge(zeile)}
                setzen={(wert) => setzen(zeile, wert)}
                zuruecksetzen={() => zuruecksetzen(zeile)}
              />
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 rounded-ctl border border-border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <span className="text-zeile text-text-muted">
            Bestellsumme ·{' '}
            {gesamt.positionen === 1 ? '1 Position' : `${gesamt.positionen} Positionen`} ·{' '}
            {gesamt.gebinde} Gebinde
          </span>
          <span className="text-titel tabular-nums">{bestellwerttext(gesamt)}</span>
        </div>

        {/* Der fehlende Preis steht unter der Summe und nicht in ihr: eine
            Bestellsumme, die einen unbekannten Preis als 0 mitnimmt, ist beim
            Wareneingang die Zahl, gegen die niemand mehr prüfen kann. */}
        {gesamt.ohnePreis > 0 && (
          <p className="mt-2 text-sm text-text-muted">
            {gesamt.ohnePreis === 1
              ? '1 Position ohne hinterlegten Einkaufspreis — nicht bewertbar und nicht in der Summe enthalten.'
              : `${gesamt.ohnePreis} Positionen ohne hinterlegten Einkaufspreis — nicht bewertbar und nicht in der Summe enthalten.`}
          </p>
        )}

        <h3 className="mt-3 text-base font-semibold">Bestellung anlegen</h3>
        <p className="mt-1 text-sm text-text-muted">
          Sie entsteht als Entwurf. Abgeschickt wird sie im nächsten Schritt — erst dann steht sie
          im Wareneingang zur Auswahl.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            name="lieferant"
            list="bestell-lieferanten"
            required
            defaultValue={lieferanten[0] ?? ''}
            placeholder="Lieferant"
            className={`${FELD} min-w-40 flex-1`}
          />
          <datalist id="bestell-lieferanten">
            {lieferanten.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <input
            type="date"
            name="datum"
            defaultValue={datumVorgabe}
            className={`${FELD} min-w-40 flex-1`}
          />
        </div>

        <input
          name="notiz"
          type="text"
          placeholder="Notiz für den Lieferanten (freiwillig)"
          className={`mt-2 ${FELD}`}
        />

        {zustand.art === 'fehler' && (
          <p className="mt-2 rounded-ctl bg-danger-soft p-2 text-sm text-danger-soft-on">
            {zustand.meldung}
          </p>
        )}

        <Schaltflaeche
          type="submit"
          breit
          disabled={laeuft || gesamt.positionen === 0}
        >
          {laeuft
            ? 'Wird angelegt …'
            : gesamt.positionen === 0
              ? 'Keine Position mit einer Menge'
              : `Bestellung anlegen · ${gesamt.positionen} ${gesamt.positionen === 1 ? 'Position' : 'Positionen'} · ${bestellwerttext(gesamt)}`}
        </Schaltflaeche>
      </div>
    </form>
  )
}

function Kopf({ children, betont = false }: { children: React.ReactNode; betont?: boolean }) {
  return (
    <th
      className={`py-2 pl-3 text-right font-medium whitespace-nowrap ${betont ? 'text-text' : ''}`}
    >
      {children}
    </th>
  )
}

function Zahl({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pl-3 text-right tabular-nums">{children}</td>
}

/** Der Gedankenstrich für eine Zahl, die es nicht gibt. Nie eine 0. */
function Strich() {
  return <span className="text-text-muted">—</span>
}

/**
 * Die Farbe der Zeile.
 *
 * Eine Lücke in der Datenlage wird gedeckt getönt und nicht rot: Warnrot heisst
 * hier „das Regal ist gleich leer", und das ist eine Aussage über einen
 * bekannten Bestand. Ein Artikel ohne Kassenbezug oder ohne Zählung hat keinen
 * bekannten Bestand — `dringlichkeit` rechnet ihn zwangsläufig als leer, weil
 * sie mit 0 rechnen muss. Ihn deshalb rot zu färben, hiesse die Annahme als
 * Befund auszugeben. Was da fehlt, sagt die Zeile in Worten.
 *
 * Ein Handeingriff färbt in der Farbe der Aktion und nicht in Bernstein — er
 * ist kein Mangel, sondern die Absicht des Betriebsleiters.
 */
function zeilenfarbe(zeile: ZeileText, vonHand: boolean): string {
  if (zeile.ohneVerbrauch || zeile.ohneBestand) return 'bg-surface-2'
  if (dringend(zeile)) return 'bg-danger-soft'
  if (vonHand) return 'bg-primary-soft'
  return ''
}

/**
 * Ob die Fehlmenge als Befund gilt und nicht als Folge einer Annahme — dieselbe
 * Frage wie bei der Zeilenfarbe, und deshalb dieselbe Stelle.
 */
function dringend(zeile: ZeileText): boolean {
  return zeile.dringlichkeit === 'leer' && !zeile.ohneBestand && !zeile.ohneVerbrauch
}

/**
 * Die Marke neben der Bestellmenge: sie sagt, dass hier von Hand steht, was
 * dort gerechnet stünde — und setzt auf einen Tipp zurück.
 *
 * Der Vorschlag bleibt damit sichtbar, statt von der Eingabe ersetzt zu werden.
 * So ist auch nach einer Woche noch ablesbar, was die Rechnung sagte und was
 * der Mensch entschied.
 */
function Handmarke({ vorschlag, aufTipp }: { vorschlag: number; aufTipp: () => void }) {
  return (
    <button
      type="button"
      onClick={aufTipp}
      title="Auf den Vorschlag zurücksetzen"
      // Eigene Fläche statt getönter Schrift: die Zeile ist bei einem
      // Handeingriff selbst schon in primary-soft getönt, und eine Marke in
      // derselben Tönung verschwände genau dort, wo sie hingehört.
      className="tap nur-schirm flex min-h-tap shrink-0 flex-col justify-center rounded-ctl border border-border-strong bg-surface px-2 text-right text-xs leading-tight font-medium text-primary-text"
    >
      <span className="tracking-wide uppercase">von Hand</span>
      <span className="whitespace-nowrap">↺ Vorschlag {vorschlag}</span>
    </button>
  )
}

/** Was an einer Zeile unklar ist — steht klein unter dem Artikelnamen. */
function Luecke({ zeile }: { zeile: ZeileText }) {
  // Beide Lücken können zugleich gelten: ein Artikel ohne Kassenbezug kann
  // ebenso gut bei der Zählung gefehlt haben. Dann stehen beide Sätze da — die
  // zweite Lücke verschwindet nicht dadurch, dass die erste zuerst kam.
  return (
    <>
      {zeile.ohneVerbrauch && (
        <span className="block text-xs text-attention-text">
          keine Kassenbezeichnung zugeordnet — Bedarf unbekannt, Menge von Hand
        </span>
      )}
      {zeile.ohneBestand && (
        <span className="block text-xs text-attention-text">
          bei der letzten Zählung nicht gezählt — Vorschlag deckt den ganzen Bedarf
        </span>
      )}
    </>
  )
}

/** Der Positionswert: nie 0,00 EUR für einen Preis, den niemand kennt. */
function Positionswert({ zeile, menge }: { zeile: ZeileText; menge: number }) {
  if (menge === 0) return <Strich />
  const cent = wertGebindeCent(zeile.artikel, menge)
  if (cent === null) return <span className="text-xs text-text-muted">nicht bewertbar</span>
  return <>{alsEuro(cent)}</>
}

function Tabellenzeile({
  zeile,
  menge,
  setzen,
  zuruecksetzen,
}: {
  zeile: ZeileText
  menge: number
  setzen: (wert: number) => void
  zuruecksetzen: () => void
}) {
  const vonHand = menge !== zeile.vorschlagGebinde

  return (
    <tr className={`border-b border-border ${zeilenfarbe(zeile, vonHand)}`}>
      <td className="py-2 pr-3">
        <span className="block">{zeile.name}</span>
        <span className="block text-xs text-text-muted">
          {zeile.lieferGebindeText} · {zeile.kategorie}
        </span>
        <Luecke zeile={zeile} />
      </td>
      <Zahl>{zeile.bestand ?? <span className="text-xs text-text-muted">nicht gezählt</span>}</Zahl>
      <Zahl>{zeile.unterwegs ?? <Strich />}</Zahl>
      <Zahl>{zeile.verbrauchJeTag ?? <Strich />}</Zahl>
      <Zahl>{zeile.bedarf ?? <Strich />}</Zahl>
      <Zahl>
        {zeile.fehlmenge === null ? (
          <Strich />
        ) : (
          <span className={dringend(zeile) ? 'font-semibold text-danger-text' : ''}>
            {zeile.fehlmenge}
          </span>
        )}
      </Zahl>
      <td className="py-2 pl-3">
        <span className="flex items-center justify-end gap-tapgap">
          {vonHand && <Handmarke vorschlag={zeile.vorschlagGebinde} aufTipp={zuruecksetzen} />}
          <Mengenfeld
            menge={menge}
            setzen={setzen}
            feldId={zeile.artikelId}
            bezeichnung={`${zeile.name} ${zeile.lieferGebindeText}`}
            mitTasten={false}
          />
        </span>
        {!vonHand && zeile.ueberdeckung !== null && menge > 0 && (
          <span className="mt-1 block text-right text-xs text-text-muted">
            {zeile.ueberdeckung} über Bedarf
          </span>
        )}
      </td>
      <Zahl>
        <Positionswert zeile={zeile} menge={menge} />
      </Zahl>
    </tr>
  )
}

function Karte({
  zeile,
  menge,
  setzen,
  zuruecksetzen,
}: {
  zeile: ZeileText
  menge: number
  setzen: (wert: number) => void
  zuruecksetzen: () => void
}) {
  const vonHand = menge !== zeile.vorschlagGebinde

  return (
    <li className={`px-1 py-3 ${zeilenfarbe(zeile, vonHand)}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate">{zeile.name}</span>
          <span className="block truncate text-xs text-text-muted">{zeile.lieferGebindeText}</span>
          <Luecke zeile={zeile} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-tapgap">
          <Mengenfeld
            menge={menge}
            setzen={setzen}
            feldId={zeile.artikelId}
            bezeichnung={`${zeile.name} ${zeile.lieferGebindeText}`}
            mitTasten
          />
          {vonHand ? (
            <Handmarke vorschlag={zeile.vorschlagGebinde} aufTipp={zuruecksetzen} />
          ) : zeile.ueberdeckung !== null && menge > 0 ? (
            <span className="text-xs text-text-muted">{zeile.ueberdeckung} über Bedarf</span>
          ) : null}
        </span>
      </div>

      <p className="mt-1 text-xs text-text-muted tabular-nums">
        {zeile.bestand === null ? 'nicht gezählt' : `${zeile.bestand} da`}
        {zeile.unterwegs !== null && ` · ${zeile.unterwegs} unterwegs`}
        {zeile.bedarf === null ? (
          ' · Bedarf unbekannt'
        ) : (
          <>
            {' '}
            · {zeile.bedarf} Bedarf ·{' '}
            <span className={dringend(zeile) ? 'font-semibold text-danger-text' : ''}>
              {zeile.fehlmenge} fehlt
            </span>
          </>
        )}
        {menge > 0 && (
          <>
            {' · '}
            <Positionswert zeile={zeile} menge={menge} />
          </>
        )}
      </p>
    </li>
  )
}
