'use client'

/**
 * Die Liste der Artikel dieses Lagers: der Ausweg aus der Fokusansicht.
 *
 * Sie beantwortet drei Fragen, die die Fokusansicht nicht beantworten kann: Was
 * fehlt noch? Was habe ich bei Artikel 60 eingetragen? Und: wie komme ich
 * dorthin zurück, ohne sechzig Mal "weiter" zu tippen.
 *
 * Seit die Zeile Eingabefelder trägt, ist sie ausserdem der zweite Weg zum
 * Wert: die drei Zeilen, die man nachträgt, oder das Zählen zu zweit vom Zettel
 * ab, brauchen nicht den Umweg über die Fokusansicht. Der Umweg bleibt der
 * bessere Weg für den ganzen Durchgang — dort steht jedes Bedienelement an
 * derselben Stelle, hier zielt der Daumen auf eine Zeile, die scrollt.
 *
 * Die Zeile zerfällt dafür in zwei Flächen: links Name und Gebinde, die in die
 * Fokusansicht springen, rechts ein oder zwei Felder je nach Zählmodus, jedes
 * 56 px hoch und 8 px von seinem Nachbarn entfernt. Ein Eingabefeld in einer
 * Schaltfläche gäbe es nicht — deshalb trägt jetzt das `li` die Kartenfassung
 * und nicht mehr der Knopf darin.
 *
 * Jeder Tastendruck geht sofort denselben Weg wie am Ziffernblock. Ein leeres
 * Feld wird dabei als 0 gespeichert, sobald der Artikel einmal beschrieben
 * wurde — dieselbe Aussage wie "weiter" über einem leeren Feld: nachgesehen,
 * Fach ist leer. Ein nie angefasster Artikel bleibt dagegen ein Gedankenstrich.
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
 * Jeder Abschnitt klappt zu. Zugeklappt bleibt seine Zeile mit Nummer, Namen
 * und Stand stehen — 26 solche Zeilen sind der Überblick über den Laufweg, den
 * 99 Artikelzeilen nicht geben. Der Klappstand liegt in der Maske, nicht hier:
 * die Liste wird beim Sprung in die Fokusansicht abgebaut.
 *
 * Das Suchfeld im Fuss filtert über Name, Gebinde und Kategorie und setzt den
 * Klappstand so lange aus — ein Treffer hinter einer zugeklappten Überschrift
 * wäre kein Treffer. Beide Listen dieser Maske filtern dabei nach derselben
 * Regel: die Artikel des Ortes und der übrige Stamm unter „Weitere Artikel".
 * Eine Suche, die oben Gruppen kennt und unten nicht, wäre für den Zähler
 * dieselbe Suche mit zwei Ergebnissen. Die Zeilen behalten ihren Index in der
 * Zählreihenfolge, sonst spränge eine angetippte Zeile auf den falschen
 * Artikel.
 *
 * Die Zeile ist hier eigen und nicht die Listenzeile aus src/ui: die vermissten
 * Zeilen nach einem abgelehnten Abschluss tragen eine getönte Fläche und eine
 * eigene Textfarbe, wofür die Listenzeile keine Fassung hat. Sie einzubauen
 * hiesse, eine zweite Hervorhebung neben `aktiv` in einen Baustein zu legen,
 * den ausser dieser Maske niemand so braucht.
 */


import { useState } from 'react'

import {
  alsEingabe,
  alsEingaben,
  eingabetext,
  felder,
  fortschritt,
  listenabschnitte,
  passtInZaehlliste,
  type Feldname,
  type ZaehlArtikel,
  type Zaehleingabe,
} from '@/lib/zaehlung'
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
  /**
   * Wie viele Werte bei der letzten Fertigmeldung noch auf dem Gerät lagen.
   * Grösser 0 heisst: die Meldung wurde gar nicht erst abgeschickt.
   */
  geraetOffen: number
  alleErfasst: boolean
  abgeschlossen: boolean
  /** Wohin es zurückgeht: die Ortswahl dieser Zählung. */
  ortswahlZiel: string
  meldet: boolean
  /**
   * Suchbegriff und Klappstand liegen in der Maske, nicht hier: die Liste wird
   * beim Sprung in die Fokusansicht abgebaut, und wer nach „aperitif" gesucht
   * und eine Zeile gezählt hat, will beim Zurückkommen dieselbe Suche
   * vorfinden und nicht wieder 99 Zeilen.
   */
  suche: string
  aufSuche: (begriff: string) => void
  /** Die Schlüssel der zugeklappten Abschnitte. */
  zugeklappt: ReadonlySet<string>
  aufZugeklappt: (neu: ReadonlySet<string>) => void
  aufArtikel: (index: number) => void
  /** Übernimmt einen in der Liste getippten Wert — derselbe Weg wie am Ziffernblock. */
  aufWert: (artikel: ZaehlArtikel, werte: Zaehleingabe) => void
  aufAufnehmen: (artikelId: string) => void
  aufFertigmeldung: () => void
}

/** Der Schlüssel eines Abschnitts: Station und Kategorie, wie er dasteht. */
function abschnittsschluessel(station: number, kategorie: string): string {
  return `${station}-${kategorie}`
}

export function Uebersicht({
  artikel,
  weitere,
  lagerortName,
  eintraege,
  erfasst,
  offen,
  meldungFehlt,
  geraetOffen,
  alleErfasst,
  abgeschlossen,
  ortswahlZiel,
  meldet,
  suche,
  aufSuche,
  zugeklappt,
  aufZugeklappt,
  aufArtikel,
  aufWert,
  aufAufnehmen,
  aufFertigmeldung,
}: Props) {
  const sucht = suche.trim() !== ''
  const blocks = listenabschnitte(artikel, suche)
  const treffer = blocks.reduce((summe, block) => summe + block.zeilen.length, 0)
  const weitereTreffer = weitere.filter((eintrag) => passtInZaehlliste(eintrag, suche))
  const allesZu =
    blocks.length > 0 &&
    blocks.every((block) => zugeklappt.has(abschnittsschluessel(block.station, block.kategorie)))

  /**
   * Ob „Weitere Artikel" offen steht.
   *
   * Eigener Zustand und kein blosses <details>, seit die Liste Eingabefelder
   * trägt: jeder Tastendruck in einer Zeile baut die Liste neu auf, und ein
   * unkontrolliertes <details> mit gesetztem `open` würde dabei zuklappen. Er
   * lebt nur, solange die Liste offen ist — wer einen Artikel dazugeholt hat,
   * findet ihn danach oben in seiner Kategorie wieder.
   */
  const [weitereOffen, setWeitereOffen] = useState(false)

  /**
   * Was gerade getippt wird, je Artikel. Ohne diesen Zwischenspeicher fiele ein
   * angefangenes "2," beim nächsten Bild auf "2" zurück — gespeichert wird die
   * Zahl, im Feld steht der Text.
   *
   * Er lebt nur, solange die Liste offen ist: gespeichert ist ohnehin alles,
   * und der Wechsel in die Fokusansicht soll den Text nicht mitnehmen.
   */
  const [entwuerfe, setEntwuerfe] = useState<ReadonlyMap<string, Zaehleingabe>>(new Map())

  function beiEingabe(eintrag: ZaehlArtikel, feld: Feldname, roh: string, dezimal: boolean) {
    const bisher = entwuerfe.get(eintrag.id) ?? alsEingaben(eintraege.get(eintrag.id))
    const neu = { ...bisher, [feld]: eingabetext(roh, dezimal) }
    setEntwuerfe(new Map(entwuerfe).set(eintrag.id, neu))
    aufWert(eintrag, neu)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-bg">
        {/* Die Sperre vor der Fertigmeldung: solange Werte auf dem Gerät
            liegen, wird nicht gemeldet — sonst stünde in der Auswertung
            Schwund, der keiner ist. Der orange Punkt an den Zeilen zeigt,
            welche Werte gemeint sind. */}
        {geraetOffen > 0 && (
          <div className="p-2">
            <Hinweisleiste
              rolle="attention"
              titel={
                geraetOffen === 1
                  ? '1 Wert liegt noch auf dem Gerät — noch nicht fertig gemeldet'
                  : `${geraetOffen} Werte liegen noch auf dem Gerät — noch nicht fertig gemeldet`
              }
            >
              Gesendet wird von allein, sobald Netz da ist. Steht oben „Gespeichert&ldquo;, erneut
              fertig melden.
            </Hinweisleiste>
          </div>
        )}
        {meldungFehlt && (
          <div className="p-2">
            <Hinweisleiste rolle="attention" titel="Die Fertigmeldung hat nicht geklappt.">
              Sobald wieder Netz da ist, erneut versuchen. Die gezählten Werte liegen im Gerät und
              gehen nicht verloren.
            </Hinweisleiste>
          </div>
        )}

        <div className="flex items-center gap-3 border-b border-border px-4 py-3 text-sm text-text-muted">
          <p className="min-w-0 flex-1">
            {sucht
              ? treffer === 0
                ? `Kein Treffer in ${lagerortName}`
                : treffer === 1
                  ? `1 Treffer in ${lagerortName}`
                  : `${treffer} Treffer in ${lagerortName}`
              : offen.length === 0
                ? `${lagerortName}: alle ${artikel.length} Artikel gezählt`
                : offen.length === 1
                  ? `${lagerortName}: 1 Artikel ohne Wert`
                  : `${lagerortName}: ${offen.length} Artikel ohne Wert`}
          </p>
          {/* Die einzige auslösende Fläche ausserhalb des Fusses, die kleiner
              als 56 px ist — und bewusst: sie steht in einer Textzeile, wird
              selten gebraucht, und ihr Fehlgriff ist ein Klapp, kein Wert.
              Bei aktiver Suche fehlt sie, weil dann nichts zugeklappt ist. */}
          {!sucht && blocks.length > 0 && (
            <button
              type="button"
              onClick={() =>
                aufZugeklappt(
                  allesZu
                    ? new Set()
                    : new Set(
                        blocks.map((block) =>
                          abschnittsschluessel(block.station, block.kategorie),
                        ),
                      ),
                )
              }
              className="tap focus-visible:fokus shrink-0 rounded-ctl px-2 py-1 font-medium text-primary-text"
            >
              {/* Die Aufschrift folgt nicht dem ersten Klapp, sondern dem
                  Ganzen: mit einem zugeklappten Abschnitt von 26 ist
                  "Alle aufklappen" die Handlung, die fast nichts tut. */}
              {allesZu ? 'Alle aufklappen' : 'Alle zuklappen'}
            </button>
          )}
        </div>

        {blocks.map((block) => {
          const stand = fortschritt(block.artikel, erfasst)
          const schluessel = abschnittsschluessel(block.station, block.kategorie)
          // Während gesucht wird, ist der Klappstand ausgesetzt: was passt,
          // ist sichtbar. Ein Treffer hinter einer zugeklappten Überschrift
          // wäre kein Treffer, sondern eine zweite Suche.
          const zu = !sucht && zugeklappt.has(schluessel)
          return (
            <section key={schluessel}>
              <Abschnitt
                titel={block.kategorie}
                nummer={String(block.station).padStart(2, '0')}
                stand={`${stand.gezaehlt} / ${stand.gesamt}`}
                zugeklappt={zu}
                aufUmschalten={
                  sucht
                    ? undefined
                    : () => {
                        const neu = new Set(zugeklappt)
                        if (zu) neu.delete(schluessel)
                        else neu.add(schluessel)
                        aufZugeklappt(neu)
                      }
                }
              />
              {!zu && (
                <ul className="flex flex-col gap-tapgap p-2">
                  {block.zeilen.map((zeile) => (
                    <Zeile
                      key={zeile.artikel.id}
                      artikel={zeile.artikel}
                      eintrag={eintraege.get(zeile.artikel.id)}
                      gezaehlt={erfasst.has(zeile.artikel.id)}
                      vermisst={false}
                      werte={
                        entwuerfe.get(zeile.artikel.id) ??
                        alsEingaben(eintraege.get(zeile.artikel.id))
                      }
                      aufEingabe={
                        abgeschlossen
                          ? undefined
                          : (feld, roh, dezimal) => beiEingabe(zeile.artikel, feld, roh, dezimal)
                      }
                      aufKlick={abgeschlossen ? undefined : () => aufArtikel(zeile.index)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}

        {sucht && treffer === 0 && weitereTreffer.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-text-muted">
            Kein Artikel passt zu „{suche.trim()}&ldquo; — auch nicht im übrigen Stamm.
          </p>
        )}

        {/* Der übrige Stamm, zugeklappt — und bei einer Suche mit Treffern von
            allein offen: wer im Lager etwas sucht, das hier nicht erwartet
            wird, hat genau dann den Grund, es dazuzuholen. */}
        {!abgeschlossen && weitere.length > 0 && (
          <details
            open={weitereOffen || (sucht && weitereTreffer.length > 0)}
            onToggle={(ereignis) => setWeitereOffen(ereignis.currentTarget.open)}
            className="border-t border-border"
          >
            <summary className="flex h-tap cursor-pointer items-center px-4 text-zeile text-text-muted marker:content-none">
              {sucht
                ? `Weitere Artikel · ${weitereTreffer.length} von ${weitere.length} passen`
                : `Weitere Artikel (${weitere.length})`}
            </summary>
            <p className="px-4 pb-2 text-sm text-text-muted">
              Steht heute ausnahmsweise etwas hier, das sonst woanders liegt? Antippen nimmt es in
              dieses Lager auf.
            </p>
            <ul className="flex flex-col gap-tapgap p-2">
              {weitereTreffer.map((eintrag) => (
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
          {/* Zwei Flächen im Fuss, und die Reihenfolge ist Absicht: unten
              landet der Daumen blind, und dort liegt deshalb das Suchfeld und
              nicht die Meldung, die ein Lager als fertig ausweist. Das dreht
              die sonstige Gewohnheit (Bestätigung ganz unten) an dieser einen
              Stelle um. */}
          <div className="flex flex-col gap-tapgap">
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

            {/* Dieselbe Fassung wie die Artikelsuche an der Rampe: wer beides
                bedient, soll nicht zweimal lernen, wie ein Suchfeld hier
                aussieht. Kein type="search": dessen Löschkreuz ist je Browser
                verschieden gross und liegt unter 56 px. */}
            <span className="relative flex">
              <input
                type="text"
                value={suche}
                onChange={(ereignis) => aufSuche(ereignis.target.value)}
                placeholder="Artikel oder Gruppe suchen"
                aria-label="In dieser Liste suchen"
                className="h-tap w-full rounded-ctl border-2 border-primary bg-primary-soft px-4 pr-16 text-lg font-medium text-text placeholder:font-normal placeholder:text-text-muted"
              />
              {sucht && (
                <button
                  type="button"
                  onClick={() => aufSuche('')}
                  aria-label="Suche zurücksetzen"
                  className="tap focus-visible:fokus absolute top-0 right-0 flex h-tap w-tap items-center justify-center rounded-ctl text-lg text-primary-soft-on"
                >
                  ✕
                </button>
              )}
            </span>
          </div>
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
  werte,
  aufEingabe,
  aufKlick,
}: {
  artikel: ZaehlArtikel
  eintrag: Eintrag | undefined
  gezaehlt: boolean
  vermisst: boolean
  /** Was in den Feldern steht — Entwurf oder gespeicherter Wert. */
  werte: Zaehleingabe
  /** undefined: die Zeile nimmt keine Werte an — die Zählung ist abgeschlossen. */
  aufEingabe?: (feld: Feldname, roh: string, dezimal: boolean) => void
  /** undefined: die Zeile zeigt nur an — bei abgeschlossener Zählung führt kein Weg zurück in die Eingabe. */
  aufKlick?: () => void
}) {
  const wartet = eintrag !== undefined && istOffen(eintrag)
  // Die Kartenfassung liegt auf dem li: in der Zeile stehen jetzt mehrere
  // Flächen nebeneinander, und ein Rahmen um nur eine davon wäre die falsche
  // Auskunft darüber, was zusammengehört.
  const flaechenKlassen = `flex min-h-tap w-full items-center gap-tapgap rounded-ctl border py-1.5 pr-2 ${
    vermisst ? 'border-attention-soft-on/25 bg-attention-soft' : 'border-border bg-surface'
  }`

  const beschriftungen = (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      {/* Umbrechen statt abschneiden: neben den Feldern bleiben dem Namen rund
          155 px, und abgeschnitten wären "Veltins Fassbrause Eistee Pfirsich"
          und "Veltins Fassbrause Cola Orange" dieselbe Zeile. Drei Zeilen
          tragen den ganzen Stadthafener Stamm und kosten nichts: die Felder
          samt Beschriftung stellen die Zeile ohnehin auf diese Höhe. */}
      <span
        className={`line-clamp-3 text-zeile ${
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
  )

  /* Ein Punkt für "liegt noch auf dem Gerät". Kein Punkt heisst angekommen —
     der Normalfall soll nicht blinken. Die Aussage steht daneben als Wort für
     die Sprachausgabe; der Punkt ist fürs Überfliegen. Der Platz bleibt auch
     ohne Punkt stehen, sonst rückt die Zahlenspalte je Zeile um zehn Pixel. */
  const punkt = (
    <>
      <span
        aria-hidden
        className={`size-2.5 shrink-0 rounded-full ${wartet ? 'bg-attention' : ''}`}
      />
      {wartet && <span className="sr-only">wartet auf Netz</span>}
      {vermisst && <span className="sr-only">fehlt für den Abschluss</span>}
    </>
  )

  // Ohne aufKlick ist die Zeile reine Anzeige und deshalb kein button:
  // eine Fläche, die auf Antippen nichts tut, verspräche sonst Bedienbarkeit.
  // Dann steht der Wert wieder als Text da, wie vor den Feldern.
  if (aufKlick === undefined || aufEingabe === undefined) {
    return (
      <li className={flaechenKlassen}>
        <span className="flex min-w-0 flex-1 pl-4">{beschriftungen}</span>
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
        {punkt}
      </li>
    )
  }

  return (
    <li className={flaechenKlassen}>
      {/* Der Sprung in die Fokusansicht. Er hängt am Namen und nicht mehr an
          der ganzen Zeile: neben den Feldern wäre eine Zeile, die überall
          wegspringt, beim Tippen im Weg. */}
      <button
        type="button"
        onClick={aufKlick}
        // Das Gebinde gehört in die Aufschrift: die Sprachausgabe liest die
        // Beschriftung sonst nicht mehr mit, und "Gerolsteiner Sprudel" steht
        // im Stamm zweimal — einmal als 24 x 0,25 und einmal als 12 x 0,75.
        aria-label={`${artikel.name}, ${artikel.lieferGebindeText}${
          artikel.schwundfaehig ? '' : ', ohne Schwundrechnung'
        } — im Zählbildschirm öffnen`}
        className="tap focus-visible:fokus flex min-h-tap min-w-0 flex-1 items-center rounded-ctl pl-4"
      >
        {beschriftungen}
      </button>

      {/* Die Felder hängen unten bündig, nicht mittig: "LOSE FLASCHEN" bricht
          auf zwei Zeilen, "KÄSTEN" nicht — mittig zentriert stünden die beiden
          Zahlen derselben Zeile um eine halbe Zeilenhöhe versetzt. */}
      <span className="flex shrink-0 items-end gap-tapgap">
        {felder(artikel).map((feld) => (
          <label key={feld.name} className="flex w-20 flex-col items-center gap-0.5">
            <span
              aria-hidden
              className="text-beschriftung text-center leading-tight text-text-muted uppercase"
            >
              {feld.beschriftung}
            </span>
            <input
              type="text"
              inputMode={feld.dezimal ? 'decimal' : 'numeric'}
              enterKeyHint="done"
              value={werte[feld.name]}
              onChange={(ereignis) => aufEingabe(feld.name, ereignis.target.value, feld.dezimal)}
              // Leer ist ein Gedankenstrich und keine 0 — dieselbe Regel wie auf
              // der Wertkachel der Fokusansicht.
              placeholder="—"
              aria-label={`${artikel.name}: ${feld.beschriftung}`}
              className="h-tap w-full rounded-ctl border border-border-strong bg-surface px-2 text-center text-zeile tabular-nums placeholder:text-text-muted/50 focus-visible:fokus"
            />
          </label>
        ))}
      </span>

      {punkt}
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
