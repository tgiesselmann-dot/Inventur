'use client'

/**
 * Die Liste aller Artikel: der Ausweg aus der Fokusansicht.
 *
 * Sie beantwortet drei Fragen, die die Fokusansicht nicht beantworten kann: Was
 * fehlt noch? Was habe ich bei Artikel 60 eingetragen? Und: wie komme ich
 * dorthin zurück, ohne sechzig Mal "weiter" zu tippen. Jede Zeile ist antippbar
 * und 56px hoch.
 *
 * Die Kategorien erscheinen als Abschnitte in der Reihenfolge des Laufwegs, und
 * dieselbe Kategorie taucht dabei mehrfach auf, wenn der Weg mehrfach an ihr
 * vorbeiführt. Im Stadthafener Stamm zerfallen 14 Kategorien so in 26
 * Abschnitte — das ist keine Unordnung, sondern das Lager. Die Stationsnummer
 * in der Überschrift unterscheidet die Wiederholungen: sie ist das, was mit dem
 * Blick durchs Regal übereinstimmt.
 *
 * Die Zeile ist hier eigen und nicht die Listenzeile aus src/ui: die vermissten
 * Zeilen nach einem abgelehnten Abschluss tragen eine getönte Fläche und eine
 * eigene Textfarbe, wofür die Listenzeile keine Fassung hat. Sie einzubauen
 * hiesse, eine zweite Hervorhebung neben `aktiv` in einen Baustein zu legen,
 * den ausser dieser Maske niemand so braucht.
 */


import { abschnitte, alsEingabe, felder, fortschritt, type ZaehlArtikel } from '@/lib/zaehlung'
import { istOffen, type Eintrag } from '@/offline/warteschlange'
import { Abschnitt } from '@/ui/abschnitt'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss } from '@/ui/vollbild'
import { Wegflaeche } from '@/ui/wegflaeche'

type Props = {
  artikel: ZaehlArtikel[]
  eintraege: ReadonlyMap<string, Eintrag>
  erfasst: ReadonlySet<string>
  offen: ZaehlArtikel[]
  /** Was der Server beim letzten Abschlussversuch vermisst hat. null: kein Versuch. */
  fehlendNachAbschluss: ZaehlArtikel[] | null
  alleErfasst: boolean
  abgeschlossen: boolean
  /** Wohin die abgeschlossene Zählung zurückführt: ihr Ergebnis. */
  ergebnisZiel: string
  schliesst: boolean
  aufArtikel: (index: number) => void
  aufAbschluss: () => void
}

export function Uebersicht({
  artikel,
  eintraege,
  erfasst,
  offen,
  fehlendNachAbschluss,
  alleErfasst,
  abgeschlossen,
  ergebnisZiel,
  schliesst,
  aufArtikel,
  aufAbschluss,
}: Props) {
  const blocks = abschnitte(artikel)
  const vermisst = new Set((fehlendNachAbschluss ?? []).map((eintrag) => eintrag.id))

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-bg">
        {fehlendNachAbschluss !== null && fehlendNachAbschluss.length > 0 && (
          <div className="p-2">
            <Hinweisleiste
              rolle="attention"
              titel={`Der Abschluss ist noch nicht möglich: ${fehlendNachAbschluss.length} Artikel ohne Wert.`}
            >
              Sie sind unten hervorgehoben.
            </Hinweisleiste>
          </div>
        )}
        {fehlendNachAbschluss !== null && fehlendNachAbschluss.length === 0 && (
          <div className="p-2">
            <Hinweisleiste rolle="attention" titel="Der Abschluss hat nicht geklappt.">
              Sobald wieder Netz da ist, erneut versuchen.
            </Hinweisleiste>
          </div>
        )}

        <p className="border-b border-border px-4 py-3 text-sm text-text-muted">
          {offen.length === 0
            ? `Alle ${artikel.length} Artikel gezählt`
            : offen.length === 1
              ? '1 Artikel fehlt noch'
              : `${offen.length} Artikel fehlen noch`}
        </p>

        {blocks.map((block, station) => {
          const stand = fortschritt(block.artikel, erfasst)
          return (
            <section key={`${block.kategorie}-${block.ab}`}>
              <Abschnitt
                titel={block.kategorie}
                nummer={String(station + 1).padStart(2, '0')}
                stand={`${stand.gezaehlt} / ${stand.gesamt}`}
              />
              <ul className="flex flex-col gap-tapgap p-2">
                {block.artikel.map((eintrag, versatz) => (
                  <Zeile
                    key={eintrag.id}
                    artikel={eintrag}
                    eintrag={eintraege.get(eintrag.id)}
                    gezaehlt={erfasst.has(eintrag.id)}
                    vermisst={vermisst.has(eintrag.id)}
                    aufKlick={abgeschlossen ? undefined : () => aufArtikel(block.ab + versatz)}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {!abgeschlossen && (
        <Maskenfuss>
          {/* Die Aufschrift trägt den Grund der Sperre, nicht nur die Sperre:
              "Noch 12 zu zählen" beantwortet die Frage, die ein graues Feld
              sonst offen lässt. */}
          <Schaltflaeche
            breit
            rolle="confirm"
            onClick={aufAbschluss}
            disabled={!alleErfasst || schliesst}
          >
            {schliesst ? (
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-confirm" />
                Wird abgeschlossen…
              </span>
            ) : alleErfasst ? (
              'Zählung abschliessen'
            ) : (
              `Noch ${offen.length} zu zählen`
            )}
          </Schaltflaeche>
        </Maskenfuss>
      )}
      {abgeschlossen && (
        <Maskenfuss>
          <p className="px-2 py-1.5 text-sm text-text-muted">
            Diese Zählung ist abgeschlossen — die Werte stehen fest.
          </p>
          {/* Der Weg zurück auf das Ergebnis. Von dort führt „Werte ansehen"
              hierher; ohne diese Fläche wäre der Rückweg der Zurück-Knopf des
              Browsers, und wer über die Liste hereinkam, hat keinen. */}
          <Wegflaeche href={ergebnisZiel} art="sekundaer" breit>
            Zum Ergebnis
          </Wegflaeche>
        </Maskenfuss>
      )}
    </>
  )
}

function Zeile({
  artikel,
  eintrag,
  gezaehlt,
  vermisst,
  aufKlick,
}: {
  artikel: ZaehlArtikel
  eintrag: Eintrag | undefined
  gezaehlt: boolean
  vermisst: boolean
  /** undefined: die Zeile zeigt nur an — bei abgeschlossener Zählung führt kein Weg zurück in die Eingabe. */
  aufKlick?: () => void
}) {
  const wartet = eintrag !== undefined && istOffen(eintrag)
  const flaechenKlassen = `flex h-tap w-full items-center gap-3.5 rounded-ctl border px-4 text-left ${
    vermisst ? 'border-attention-soft-on/25 bg-attention-soft' : 'border-border bg-surface'
  }`

  const inhalt = (
    <>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`truncate text-zeile ${
              vermisst ? 'font-semibold text-attention-soft-on' : 'text-text'
            }`}
          >
            {artikel.name}
          </span>
          <span
            className={`truncate text-sm ${vermisst ? 'text-attention-soft-on' : 'text-text-muted'}`}
          >
            {artikel.lieferGebindeText}
            {!artikel.schwundfaehig && ' · ohne Schwundrechnung'}
          </span>
        </span>

        <span
          className={`shrink-0 text-zeile ${
            vermisst
              ? 'font-semibold text-attention-soft-on'
              : gezaehlt
                ? 'text-text'
                : 'text-text-muted'
          }`}
        >
          {gezaehlt ? wertText(artikel, eintrag) : '—'}
        </span>

        {/* Ein Punkt für "liegt noch auf dem Gerät". Kein Punkt heisst
            angekommen — der Normalfall soll nicht blinken. Die Aussage steht
            daneben als Wort für die Sprachausgabe; der Punkt ist fürs
            Überfliegen. Der Platz bleibt auch ohne Punkt stehen, sonst rückt
            die Zahlenspalte je Zeile um zehn Pixel. */}
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${wartet ? 'bg-attention' : ''}`} />
        {wartet && <span className="sr-only">wartet auf Netz</span>}
        {vermisst && <span className="sr-only">fehlt für den Abschluss</span>}
    </>
  )

  // Ohne aufKlick ist die Zeile reine Anzeige und deshalb kein button:
  // eine Fläche, die auf Antippen nichts tut, verspräche sonst Bedienbarkeit.
  if (aufKlick === undefined) {
    return (
      <li>
        <div className={flaechenKlassen}>{inhalt}</div>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={aufKlick}
        className={`tap focus-visible:fokus ${flaechenKlassen}`}
      >
        {inhalt}
      </button>
    </li>
  )
}

/** Der gezählte Wert in der Schreibweise seines Zählmodus. */
function wertText(artikel: ZaehlArtikel, eintrag: Eintrag | undefined): string {
  if (eintrag === undefined) return '—'
  return felder(artikel)
    .map((feld) => alsEingabe(eintrag[feld.name]))
    .join(' + ')
}
