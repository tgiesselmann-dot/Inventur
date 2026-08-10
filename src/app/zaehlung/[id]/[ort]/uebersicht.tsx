'use client'

/**
 * Die Liste der Artikel dieses Lagers: der Ausweg aus der Fokusansicht.
 *
 * Sie beantwortet drei Fragen, die die Fokusansicht nicht beantworten kann: Was
 * fehlt noch? Was habe ich bei Artikel 60 eingetragen? Und: wie komme ich
 * dorthin zurück, ohne sechzig Mal "weiter" zu tippen. Jede Zeile ist antippbar
 * und 56px hoch.
 *
 * Ganz unten steht „Weitere Artikel" — der Rest des Stamms, der hier sonst
 * nicht steht. Antippen holt einen davon in dieses Lager und führt sofort zu
 * seiner Eingabe. Das ist der Weg für die Kiste, die heute ausnahmsweise hinten
 * steht; ab der nächsten Zählung ist sie von allein dabei, weil sie dann hier
 * einen Wert hat. Der Block ist zugeklappt: er ist die Ausnahme und darf die
 * Liste dessen, was wirklich hier steht, nicht zuschütten.
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
  /** Der übrige Stamm — was an diesem Ort nicht erwartet wird. */
  weitere: ZaehlArtikel[]
  lagerortName: string
  eintraege: ReadonlyMap<string, Eintrag>
  erfasst: ReadonlySet<string>
  offen: ZaehlArtikel[]
  /** true, wenn die Fertigmeldung nicht durchkam. */
  meldungFehlt: boolean
  alleErfasst: boolean
  abgeschlossen: boolean
  /** Wohin es zurückgeht: die Ortswahl dieser Zählung. */
  ortswahlZiel: string
  meldet: boolean
  aufArtikel: (index: number) => void
  aufAufnehmen: (artikelId: string) => void
  aufFertigmeldung: () => void
}

export function Uebersicht({
  artikel,
  weitere,
  lagerortName,
  eintraege,
  erfasst,
  offen,
  meldungFehlt,
  alleErfasst,
  abgeschlossen,
  ortswahlZiel,
  meldet,
  aufArtikel,
  aufAufnehmen,
  aufFertigmeldung,
}: Props) {
  const blocks = abschnitte(artikel)

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-bg">
        {meldungFehlt && (
          <div className="p-2">
            <Hinweisleiste rolle="attention" titel="Die Fertigmeldung hat nicht geklappt.">
              Sobald wieder Netz da ist, erneut versuchen. Die gezählten Werte liegen im Gerät und
              gehen nicht verloren.
            </Hinweisleiste>
          </div>
        )}

        <p className="border-b border-border px-4 py-3 text-sm text-text-muted">
          {offen.length === 0
            ? `${lagerortName}: alle ${artikel.length} Artikel gezählt`
            : offen.length === 1
              ? `${lagerortName}: 1 Artikel ohne Wert`
              : `${lagerortName}: ${offen.length} Artikel ohne Wert`}
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
                    vermisst={false}
                    aufKlick={abgeschlossen ? undefined : () => aufArtikel(block.ab + versatz)}
                  />
                ))}
              </ul>
            </section>
          )
        })}

        {/* Der übrige Stamm, zugeklappt. Ein <details> und kein eigener
            Zustand: das Aufklappen überlebt so den Wechsel in die Fokusansicht
            nicht, und genau das ist richtig — wer einen Artikel dazugeholt hat,
            findet ihn danach oben in seiner Kategorie wieder. */}
        {!abgeschlossen && weitere.length > 0 && (
          <details className="border-t border-border">
            <summary className="flex h-tap cursor-pointer items-center px-4 text-zeile text-text-muted marker:content-none">
              Weitere Artikel ({weitere.length})
            </summary>
            <p className="px-4 pb-2 text-sm text-text-muted">
              Steht heute ausnahmsweise etwas hier, das sonst woanders liegt? Antippen nimmt es in
              dieses Lager auf.
            </p>
            <ul className="flex flex-col gap-tapgap p-2">
              {weitere.map((eintrag) => (
                <li key={eintrag.id}>
                  <button
                    type="button"
                    onClick={() => aufAufnehmen(eintrag.id)}
                    className="tap focus-visible:fokus flex h-tap w-full items-center gap-3.5 rounded-ctl border border-border bg-surface px-4 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-zeile text-text">{eintrag.name}</span>
                      <span className="truncate text-sm text-text-muted">
                        {eintrag.lieferGebindeText}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-text-muted">aufnehmen</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {!abgeschlossen && (
        <Maskenfuss>
          {/* Nicht gesperrt, auch wenn Artikel ohne Wert bleiben: an der Theke
              stehen vierzig der neunundneunzig Artikel, und für die übrigen
              eine Null zu tippen wäre keine Zählung. Die Aufschrift sagt
              trotzdem, was offen bleibt — wer hier zu früh tippt, hat es
              gelesen. Dass am Ende kein Artikel *nirgends* gezählt ist, prüft
              der Abschluss der ganzen Zählung. */}
          <Schaltflaeche breit rolle="confirm" onClick={aufFertigmeldung} disabled={meldet}>
            {meldet ? (
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-confirm" />
                Wird gemeldet…
              </span>
            ) : alleErfasst ? (
              `${lagerortName} fertig melden`
            ) : (
              `${lagerortName} fertig melden · ${offen.length} ohne Wert`
            )}
          </Schaltflaeche>
        </Maskenfuss>
      )}
      {abgeschlossen && (
        <Maskenfuss>
          <p className="px-2 py-1.5 text-sm text-text-muted">
            Diese Zählung ist abgeschlossen — die Werte stehen fest.
          </p>
          {/* Der Weg zurück in die Ortswahl. Ohne diese Fläche wäre der Rückweg
              der Zurück-Knopf des Browsers, und wer über die Liste hereinkam,
              hat keinen. */}
          <Wegflaeche href={ortswahlZiel} art="sekundaer" breit>
            Zu den Lagern
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
