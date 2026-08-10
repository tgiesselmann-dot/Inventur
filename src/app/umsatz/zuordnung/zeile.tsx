'use client'

/**
 * Eine Zeile der Zuordnungsmaske: eine Kassenbezeichnung und das, was sie aus
 * dem Lager nimmt.
 *
 * Jede Zeile ist ein eigenes Formular mit eigenem Zustand. Ein Formular über
 * die ganze Seite hiesse, vierzig Zuordnungen auf einmal abzuschicken und bei
 * einem Fehler in Zeile drei nicht zu wissen, welche der anderen angekommen
 * sind.
 *
 * Drei Dinge machen diese Zeile aus, und alle drei sind Schutz vor demselben
 * Fehler:
 *
 *  1. Neben jedem Feld steht die Auswirkung im Klartext — „120 Verkäufe × 4 cl
 *     = 6,84 Flaschen Sudmare Gin". Ein Faktor lässt sich nicht prüfen, ein
 *     Ergebnis schon.
 *  2. Ein Vorschlag sieht anders aus als eine bestätigte Zeile und trägt seine
 *     Güte offen. Er kommt aus Namensähnlichkeit und ist nie eine Tatsache.
 *  3. Die Zeile lässt sich vollständig mit der Tastatur bedienen: Tab hinein,
 *     Artikel tippen, Zahl tippen, Enter — und weiter zur nächsten offenen.
 *
 * Gerechnet wird hier nichts. Der Zustand kommt aus `zeilenzustand`, der Satz
 * aus `auswirkung`, beides in src/lib/kassenzuordnung-anzeige.ts.
 *
 * Mehrere Bestandteile, weil ein Verkauf mehr als einen Artikel anfasst: der
 * Aperol Spritz nimmt Aperol und Prosecco. Der erste steht in der Zeile, die
 * weiteren als eigene Zutatenzeilen direkt darunter — in der Zeile selbst,
 * nicht erst in der aufgeklappten Fassung. Die Zeile bleibt damit auf den
 * häufigen Fall gebaut, ohne den seltenen zu verstecken.
 *
 * Der Artikel wird gesucht, nicht gescrollt: das Feld ist eine Suchliste über
 * den Stamm. Tippen filtert, Pfeiltasten wählen, Enter übernimmt und springt
 * ins Mengenfeld — bei hunderten Artikeln ist ein Auswahlmenü keine Antwort.
 */

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

import type { Zaehlmodus } from '@/generated/prisma/enums'
import { mengenangabeAusAnteil, type Ausschankeinheit } from '@/lib/einheiten'
import {
  auswirkung,
  einheitswort,
  faktorAusEingabe,
  guetetext,
  zeilenzustand,
  type Zeilenzustand,
} from '@/lib/kassenzuordnung-anzeige'
import type { Zuordnungsvorschlag } from '@/lib/kassenzuordnung'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { AKTION_LEER, type Aktionszustand } from '../../aktionszustand'
import { zuordnungSpeichern } from './aktionen'

/** Ein wählbarer Artikel, mit allem, was die Zeile zum Zeigen und Rechnen braucht. */
export type Auswahleintrag = {
  id: string
  name: string
  gebindeText: string
  kategorie: string
  zaehlmodus: Zaehlmodus
  /** Inhalt einer Einheit in Litern, als Text — Decimal überlebt die Client-Grenze nicht. */
  einheitsgroesseLiter: string
}

/** Ein gespeicherter Bestandteil, wie er vom Server kommt: der rohe Anteil. */
export type Bestandteil = { artikelId: string; einheitenProVerkauf: string }

/**
 * Eine Zeile des Formulars: die Menge, wie sie getippt wird — Zahl und
 * Einheit. Der Anteil `einheitenProVerkauf` entsteht daraus in src/lib und
 * geht als verborgenes Feld mit; er ist abgeleitet und nie ein Eingabefeld.
 */
type Mengenzeile = { artikelId: string; wert: string; einheit: Ausschankeinheit }

export type Zeilendaten = {
  id: string
  posBezeichnung: string
  bestaetigt: boolean
  notiz: string | null
  /** Gebuchte Menge über alle Importe, als Zahl — der Text entsteht in src/lib. */
  verkaeufe: number
  bestandteile: Bestandteil[]
  vorschlaege: Zuordnungsvorschlag[]
}

const LEERE_ZEILE: Mengenzeile = { artikelId: '', wert: '1', einheit: 'einheit' }

/** Das Raster der Zeile. Ab lg siebenspaltig wie im Entwurf, darunter gestapelt. */
const RASTER =
  'flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_104px_20px_minmax(0,1fr)_176px_minmax(0,1.15fr)_128px] lg:items-center lg:gap-3.5'

/**
 * Die Kante links. Sie trägt den Zustand, bevor irgendein Text gelesen ist:
 * Bernstein heisst „hier fehlt eine Antwort", Blau heisst „hier steht eine
 * Vermutung", nichts heisst „hier hat jemand hingesehen".
 */
export const KANTE: Record<Zeilenzustand, string> = {
  offen: 'border-l-4 border-l-attention bg-attention-soft',
  vorschlag: 'border-l-4 border-l-primary bg-surface',
  bestaetigt: 'border-l-4 border-l-transparent bg-surface',
  ausgenommen: 'border-l-4 border-l-transparent bg-surface-2',
}

export function Zuordnungszeile({
  zeile,
  auswahl,
  istFokus,
  springHierher,
  aufFokus,
  aufFertig,
  aufGesprungen,
}: {
  zeile: Zeilendaten
  auswahl: Auswahleintrag[]
  /** Ob die ausführliche Fassung unter der Zeile aufgeklappt ist. */
  istFokus: boolean
  /** Ob der Tastaturfokus jetzt in diese Zeile springen soll. */
  springHierher: boolean
  aufFokus: () => void
  /** Meldet der Liste, dass gespeichert wurde — sie sucht die nächste offene Zeile. */
  aufFertig: (springen: boolean) => void
  aufGesprungen: () => void
}) {
  const [zustand, aktion, laeuft] = useActionState(zuordnungSpeichern, AKTION_LEER)
  const [teile, setzeTeile] = useState<Mengenzeile[]>(() => anfangsbestand(zeile, auswahl))

  const feldId = useId()
  const feld = useRef<HTMLInputElement>(null)
  const bestaetigen = useRef<HTMLButtonElement>(null)
  // Ob der letzte Absendevorgang weiterspringen sollte. Steht in einem Ref und
  // nicht im Zustand: die Antwort der Serveraktion soll kein neues Rendern
  // auslösen, nur den Sprung entscheiden.
  const springen = useRef(true)
  const gemeldet = useRef<Aktionszustand>(AKTION_LEER)

  // Nach erfolgreichem Speichern genau einmal melden. Ohne den Vergleich liefe
  // der Sprung bei jedem Rendern erneut und risse den Fokus aus der Zeile, in
  // der gerade jemand tippt.
  useEffect(() => {
    if (zustand === gemeldet.current) return
    gemeldet.current = zustand
    if (zustand.art === 'gespeichert') aufFertig(springen.current)
  }, [zustand, aufFertig])

  // Der Sprung aus der vorigen Zeile landet im Zahlenfeld, weil dort die
  // fehleranfällige Zahl steht. Der Artikel ist meist schon vorgeschlagen.
  useEffect(() => {
    if (!springHierher) return
    feld.current?.focus()
    feld.current?.select()
    aufGesprungen()
  }, [springHierher, aufGesprungen])

  const gewaehlt = teile.filter((teil) => teil.artikelId !== '')
  const lage = zeilenzustand({
    bestaetigt: zeile.bestaetigt,
    artikelInDerZeile: gewaehlt.length,
  })

  const erster = teile[0] ?? LEERE_ZEILE
  const ersterArtikel = auswahl.find((eintrag) => eintrag.id === erster.artikelId) ?? null
  const wirkung = auswirkung(ersterArtikel, zeile.verkaeufe, erster)

  /** Der Vorschlag zum gerade gewählten Artikel — er trägt Herleitung und Warnung. */
  const zumArtikel = zeile.vorschlaege.find(
    (vorschlag) => vorschlag.artikelId === erster.artikelId,
  )
  const istVorgeschlagen = lage === 'vorschlag' && zumArtikel !== undefined

  function setzeTeil(index: number, teil: Partial<Mengenzeile>) {
    setzeTeile((vorher) =>
      vorher.map((eintrag, i) => (i === index ? { ...eintrag, ...teil } : eintrag)),
    )
  }

  function uebernimm(vorschlag: Zuordnungsvorschlag) {
    setzeTeile((vorher) => {
      const neu = alsMengenzeile(vorschlag.artikelId, vorschlag.einheitenProVerkauf, auswahl)
      if (vorher.some((teil) => teil.artikelId === vorschlag.artikelId)) return vorher
      // Ersetzt nur die erste leere Zeile, hängt sonst an: wer zwei Vorschläge
      // nacheinander übernimmt, will beide.
      const leerIndex = vorher.findIndex((teil) => teil.artikelId === '')
      if (leerIndex === -1) return [...vorher, neu]
      return vorher.map((teil, i) => (i === leerIndex ? neu : teil))
    })
    feld.current?.focus()
    feld.current?.select()
  }

  /**
   * Die Tastatur der Zeile. Enter bestätigt und geht weiter, Umschalt+Enter
   * bestätigt und bleibt, Esc nimmt den Vorschlag zurück.
   *
   * Das Abfangen ist nötig, weil Enter in einem Formular sonst den ersten
   * Absendeknopf auslöst — und damit unter Umständen „Ausnehmen" statt
   * „Bestätigen".
   */
  function taste(ereignis: KeyboardEvent<HTMLElement>) {
    if (ereignis.key === 'Enter') {
      ereignis.preventDefault()
      if (laeuft) return
      springen.current = !ereignis.shiftKey
      // Über den Knopf, damit `modus=zuordnen` mitgeht. Fehlt er gerade — eine
      // bestätigte Zeile trägt „Ändern" —, schickt das Formular selbst ab; die
      // Aktion nimmt dann ihren Vorgabemodus.
      if (bestaetigen.current !== null) bestaetigen.current.click()
      else ereignis.currentTarget.closest('form')?.requestSubmit()
      return
    }
    // Nur ein Vorschlag lässt sich verwerfen. Eine bestätigte Zeile bliebe sonst
    // leer im Formular stehen, und das nächste Enter schriebe die Leere fest.
    if (ereignis.key === 'Escape' && lage === 'vorschlag') {
      ereignis.preventDefault()
      setzeTeile([LEERE_ZEILE])
    }
  }

  const zeigtPanel = istFokus && lage !== 'ausgenommen'

  return (
    <form
      action={aktion}
      // Auf den Klick und nicht auf den Fokus: die ausführliche Fassung bringt
      // eigene Bedienelemente mit, und beim blossen Durchtabben lägen die
      // zwischen dieser Zeile und der nächsten. Wer mit der Tastatur arbeitet,
      // bekommt sie nach dem ersten Enter — dorthin springt der Fokus, und dort
      // wird tatsächlich an einer Zeile gearbeitet.
      onClick={aufFokus}
      aria-label={zeile.posBezeichnung}
      className={`border-b border-border px-4 py-3 ${KANTE[lage]}`}
    >
      <input type="hidden" name="kassenartikelId" value={zeile.id} />
      {!zeigtPanel && <input type="hidden" name="notiz" value={zeile.notiz ?? ''} />}

      <div className={RASTER}>
        <div className="min-w-0">
          <p className="truncate text-zeile font-semibold">{zeile.posBezeichnung}</p>
          <p
            className={`truncate text-sm ${lage === 'offen' ? 'text-attention-soft-on' : 'text-text-muted'}`}
          >
            {unterzeile(lage, zeile, gewaehlt.length)}
          </p>
        </div>

        <p className="text-lg font-semibold lg:text-right">
          <span className="text-sm font-normal text-text-muted lg:hidden">Verkäufe: </span>
          {zeile.verkaeufe}
        </p>

        <p aria-hidden className="hidden justify-center text-text-muted lg:flex">
          →
        </p>

        {lage === 'ausgenommen' ? (
          <p className="flex min-w-0 items-center gap-2 text-sm text-text-muted lg:col-span-2">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-border-strong" />
            berührt kein Getränkelager
          </p>
        ) : (
          <>
            <div className="min-w-0">
              <label className="sr-only" htmlFor={`artikel-${feldId}`}>
                Artikel für {zeile.posBezeichnung}
              </label>
              <Artikelsuche
                id={`artikel-${feldId}`}
                auswahl={auswahl}
                artikelId={erster.artikelId}
                klasse={
                  lage === 'offen'
                    ? 'border-2 border-dashed border-attention font-medium text-attention-soft-on'
                    : 'border border-border'
                }
                aufWahl={(artikelId) => setzeTeil(0, { artikelId })}
                nachWahl={() => {
                  feld.current?.focus()
                  feld.current?.select()
                }}
                taste={taste}
              />

              {istVorgeschlagen && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded border border-dashed border-primary bg-primary-soft px-1.5 py-0.5 text-beschriftung text-primary-soft-on uppercase">
                    Vorschlag {guetetext(zumArtikel.guete)}
                  </span>
                  {/* Die Herleitung und nicht das Gebinde: dass eine Menge nur
                      geschätzt ist, muss in der Zeile stehen und nicht erst in
                      der aufgeklappten Fassung. Das Gebinde steht ohnehin schon
                      im Auswahlfeld darüber. */}
                  <span className="truncate text-sm text-text-muted">
                    {zumArtikel.herleitung}
                  </span>
                </p>
              )}
              {lage === 'bestaetigt' && (
                <p className="mt-1.5 flex items-center gap-2 text-sm text-text-muted">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-confirm" />
                  bestätigt
                </p>
              )}
            </div>

            <div>
              <label
                className="text-sm text-text-muted lg:sr-only"
                htmlFor={`menge-${feldId}`}
              >
                Menge je Verkauf
              </label>
              <div
                className={`flex h-tap items-center gap-1 rounded-ctl bg-surface pl-3 ${
                  lage === 'vorschlag' ? 'border-2 border-primary' : 'border border-border'
                }`}
              >
                <input
                  ref={feld}
                  id={`menge-${feldId}`}
                  type="text"
                  inputMode="decimal"
                  value={erster.wert}
                  onChange={(ereignis) => setzeTeil(0, { wert: ereignis.target.value })}
                  onKeyDown={taste}
                  placeholder="1"
                  className={`w-full min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none ${
                    lage === 'vorschlag' ? 'text-primary-text' : ''
                  }`}
                />
                <Einheitenwahl
                  einheit={erster.einheit}
                  artikel={ersterArtikel}
                  aufWahl={(einheit) => setzeTeil(0, { einheit })}
                  taste={taste}
                />
              </div>
              {/* Gespeichert wird der Anteil, nicht die Angabe — abgeleitet in
                  src/lib und deshalb kein Eingabefeld. Er steht direkt hinter
                  dem Artikelfeld, weil die Aktion beide Listen paarweise
                  nebeneinanderlegt. */}
              <input
                type="hidden"
                name="einheitenProVerkauf"
                value={faktorAusEingabe(ersterArtikel, erster)?.toString() ?? ''}
              />
            </div>
          </>
        )}

        <div className="min-w-0">
          {lage === 'ausgenommen' ? (
            <p className="text-sm text-text-muted">
              kein Bestand betroffen · Küche und Gutscheine zählen nicht mit
            </p>
          ) : (
            <>
              <p
                className={`text-sm ${lage === 'offen' ? 'text-attention-soft-on' : 'text-text-muted'}`}
              >
                {wirkung.rechnung}
              </p>
              <p
                className={`text-base leading-snug ${
                  wirkung.wirksam
                    ? lage === 'bestaetigt'
                      ? 'font-medium text-text'
                      : 'font-semibold text-text'
                    : 'font-semibold text-attention-soft-on'
                }`}
              >
                {wirkung.ergebnis}
              </p>
              {teile.slice(1).map((teil, index) => (
                <Nebenwirkung
                  key={index}
                  teil={teil}
                  auswahl={auswahl}
                  verkaeufe={zeile.verkaeufe}
                />
              ))}
            </>
          )}
        </div>

        {/* Auf dem Telefon rückt der Knopf ans Ende der Zeile, hinter die
            Zutaten: Auslösendes gehört nach unten. */}
        <div className="max-lg:order-last lg:justify-self-end">{aktionsknopf()}</div>

        {/* Die weiteren Zutaten eines Rezepts, direkt unter Artikel und Menge —
            in der Zeile selbst, nicht erst in der aufgeklappten Fassung. Der
            Prosecco im Aperol Spritz soll dort stehen, wo gearbeitet wird. */}
        {lage !== 'ausgenommen' &&
          teile.slice(1).map((teil, index) => (
            <div key={index} className="min-w-0 lg:col-span-2 lg:col-start-4">
              <Zutatenzeile
                teil={teil}
                auswahl={auswahl}
                taste={taste}
                aufAenderung={(aenderung) => setzeTeil(index + 1, aenderung)}
                aufEntfernen={() =>
                  setzeTeile((vorher) => vorher.filter((_, i) => i !== index + 1))
                }
              />
            </div>
          ))}
        {lage !== 'ausgenommen' && (istFokus || teile.length > 1) && gewaehlt.length > 0 && (
          <div className="lg:col-span-2 lg:col-start-4">
            <button
              type="button"
              onClick={() => setzeTeile((vorher) => [...vorher, LEERE_ZEILE])}
              className="tap -ml-2 flex h-tap items-center rounded-ctl px-2 text-sm font-medium text-primary-text focus-visible:fokus"
            >
              + Zutat
            </button>
          </div>
        )}
      </div>

      {zustand.art === 'fehler' && (
        <p className="mt-2 rounded-ctl bg-danger-soft p-2 text-sm text-danger-soft-on">
          {zustand.meldung}
        </p>
      )}
      {zustand.art === 'gespeichert' && !zeigtPanel && (
        <p className="mt-2 text-sm font-medium text-confirm-text">{zustand.text}</p>
      )}

      {zeigtPanel && (
        <Ausfuehrlich
          zeile={zeile}
          satz={wirkung.satz}
          herleitung={zumArtikel?.herleitung ?? null}
          warnung={zumArtikel?.warnung ?? null}
          uebernimm={uebernimm}
          laeuft={laeuft}
        />
      )}
    </form>
  )

  function aktionsknopf() {
    if (lage === 'ausgenommen') {
      return (
        <button
          type="submit"
          name="modus"
          value="aufnehmen"
          disabled={laeuft}
          className="tap h-tap w-full rounded-ctl border border-border bg-surface px-4 text-sm font-medium disabled:opacity-50 lg:w-auto"
        >
          Aufnehmen
        </button>
      )
    }

    if (lage === 'bestaetigt' && !istFokus) {
      return (
        <button
          type="button"
          onClick={aufFokus}
          className="tap h-tap w-full rounded-ctl border border-border bg-surface px-4 text-sm font-medium lg:w-auto"
        >
          Ändern
        </button>
      )
    }

    return (
      <button
        ref={bestaetigen}
        type="submit"
        name="modus"
        value="zuordnen"
        disabled={laeuft}
        className="tap h-tap w-full rounded-ctl bg-primary px-4 text-sm font-semibold text-primary-on disabled:opacity-50 lg:w-auto"
      >
        Bestätigen
      </button>
    )
  }
}

/**
 * Womit die Zeile startet: das Gespeicherte, sonst der beste Vorschlag.
 *
 * Der Vorschlag steht im Feld und nicht daneben — sonst müsste er für jede der
 * vierhundert Zeilen erst angeklickt werden, und der Bildschirm wäre wieder eine
 * Nachmittagsarbeit. Er ist trotzdem keine Zuordnung: die Zeile trägt die
 * gestrichelte Marke mit dem Ähnlichkeitswert, zählt weiter als offen, und
 * daneben steht im Klartext, was er abziehen würde. Wer das liest, sieht einen
 * falsch geratenen Artikel sofort — „= 1952 Flaschen" auf 2148 Verkäufe stimmt
 * für kein Getränk dieser Welt.
 */
function anfangsbestand(zeile: Zeilendaten, auswahl: Auswahleintrag[]): Mengenzeile[] {
  if (zeile.bestandteile.length > 0) {
    return zeile.bestandteile.map((teil) =>
      alsMengenzeile(teil.artikelId, teil.einheitenProVerkauf, auswahl),
    )
  }

  const [bester] = zeile.vorschlaege
  if (bester === undefined) return [LEERE_ZEILE]

  return [alsMengenzeile(bester.artikelId, bester.einheitenProVerkauf, auswahl)]
}

/**
 * Ein gespeicherter Anteil als Formularzeile — in der Einheit, in der die
 * Theke ihn sagt: aus 0,057 der 0,7er wird "4" mit Einheit cl. Die Weiche
 * steht in src/lib/einheiten.ts und ist dieselbe wie auf den Rezepturkarten;
 * Feld und Karte sagen damit dasselbe.
 */
function alsMengenzeile(
  artikelId: string,
  einheitenProVerkauf: string,
  auswahl: Auswahleintrag[],
): Mengenzeile {
  const artikel = auswahl.find((eintrag) => eintrag.id === artikelId)
  try {
    if (artikel === undefined) throw new Error('Artikel nicht in der Auswahl')
    const angabe = mengenangabeAusAnteil(artikel, { einheitenProVerkauf })
    return {
      artikelId,
      wert: angabe.wert.toString().replace('.', ','),
      einheit: angabe.einheit,
    }
  } catch {
    // Ein Artikel, der nicht mehr wählbar ist, oder ein Anteil, der sich nicht
    // umrechnen lässt: der rohe Anteil bleibt als ganze Einheiten stehen,
    // statt die Zeile zu verlieren.
    return { artikelId, wert: einheitenProVerkauf.replace('.', ','), einheit: 'einheit' }
  }
}

/** Mehr Treffer zeigt die Suchliste nicht — weiter tippen grenzt weiter ein. */
const ANGEZEIGTE_TREFFER = 8

/**
 * Ob ein Artikel zur getippten Suche passt: jedes Suchwort muss irgendwo in
 * Name, Gebinde oder Kategorie vorkommen. "vodka 0,7" findet den Dockside
 * Vodka in der 0,7er, ohne dass die Reihenfolge stimmen muss.
 */
function passtZurSuche(eintrag: Auswahleintrag, suche: string): boolean {
  const ziel =
    `${eintrag.name} ${eintrag.gebindeText} ${eintrag.kategorie}`.toLocaleLowerCase('de')
  return suche
    .toLocaleLowerCase('de')
    .split(/\s+/)
    .filter((wort) => wort !== '')
    .every((wort) => ziel.includes(wort))
}

/**
 * Das Artikelfeld: eine Suchliste über den Stamm statt eines Auswahlmenüs.
 *
 * Tippen filtert, Pfeiltasten wandern, Enter übernimmt den markierten Treffer
 * und ruft `nachWahl` — dort springt der Fokus ins Mengenfeld, denn das ist
 * der nächste Handgriff. Solange die Liste zu ist, gehen Enter und Escape an
 * die Zeile durch (`taste`): Enter bestätigt, Escape verwirft den Vorschlag.
 *
 * Der gewählte Artikel steht als verborgenes Feld im Formular; das sichtbare
 * Feld zeigt nur seinen Namen. Wer den Text ändert und nichts wählt, verliert
 * nichts — beim Verlassen fällt das Feld auf die Wahl zurück.
 */
function Artikelsuche({
  id,
  auswahl,
  artikelId,
  klasse = 'border border-border',
  beschriftung,
  aufWahl,
  nachWahl,
  taste,
}: {
  id?: string
  auswahl: Auswahleintrag[]
  artikelId: string
  /** Rahmen- und Schriftklassen des Feldes — die Zeile färbt den offenen Zustand. */
  klasse?: string
  /** Nur für Felder ohne eigenes Label, etwa die Zutatenzeilen. */
  beschriftung?: string
  aufWahl: (artikelId: string) => void
  nachWahl?: () => void
  taste: (ereignis: KeyboardEvent<HTMLElement>) => void
}) {
  const [suchtext, setzeSuchtext] = useState<string | null>(null)
  const [offen, setzeOffen] = useState(false)
  const [markiert, setzeMarkiert] = useState(0)
  const listenId = useId()
  const eingabe = useRef<HTMLInputElement>(null)

  const gewaehlt = auswahl.find((eintrag) => eintrag.id === artikelId) ?? null
  const text = suchtext ?? (gewaehlt === null ? '' : `${gewaehlt.name} · ${gewaehlt.gebindeText}`)
  const treffer =
    suchtext === null || suchtext.trim() === ''
      ? auswahl
      : auswahl.filter((eintrag) => passtZurSuche(eintrag, suchtext))
  const gezeigt = treffer.slice(0, ANGEZEIGTE_TREFFER)
  // Die Markierung darf der schrumpfenden Liste nicht davonlaufen.
  const aktiv = Math.min(markiert, Math.max(0, gezeigt.length - 1))

  function schliesse() {
    setzeOffen(false)
    setzeSuchtext(null)
  }

  function waehle(eintrag: Auswahleintrag) {
    aufWahl(eintrag.id)
    schliesse()
    nachWahl?.()
  }

  /** Öffnen per Klick: die Wahl bleibt markiert, damit Enter sie nicht wechselt. */
  function oeffnePerKlick() {
    if (offen) return
    setzeOffen(true)
    const index = gewaehlt === null ? 0 : gezeigt.findIndex((e) => e.id === gewaehlt.id)
    setzeMarkiert(Math.max(0, index))
  }

  function tasten(ereignis: KeyboardEvent<HTMLInputElement>) {
    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault()
      if (offen) setzeMarkiert(Math.min(aktiv + 1, gezeigt.length - 1))
      else oeffnePerKlick()
      return
    }
    if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault()
      if (offen) setzeMarkiert(Math.max(aktiv - 1, 0))
      return
    }
    if (offen && ereignis.key === 'Enter') {
      ereignis.preventDefault()
      const eintrag = gezeigt[aktiv]
      if (eintrag !== undefined) waehle(eintrag)
      return
    }
    if (offen && ereignis.key === 'Escape') {
      ereignis.preventDefault()
      schliesse()
      return
    }
    taste(ereignis)
  }

  return (
    <div className="relative min-w-0 w-full flex-1">
      {/* Ins Formular geht die Wahl, nicht der Anzeigetext. Das Feld steht vor
          dem verborgenen Mengenanteil derselben Zutat — die Aktion legt beide
          Listen paarweise nebeneinander. */}
      <input type="hidden" name="artikelId" value={artikelId} />
      <input
        ref={eingabe}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={offen}
        aria-controls={listenId}
        aria-autocomplete="list"
        aria-activedescendant={offen && gezeigt.length > 0 ? `${listenId}-${aktiv}` : undefined}
        aria-label={beschriftung}
        value={text}
        placeholder="Artikel suchen"
        onChange={(ereignis) => {
          setzeSuchtext(ereignis.target.value)
          setzeOffen(true)
          setzeMarkiert(0)
        }}
        onClick={oeffnePerKlick}
        onFocus={() => eingabe.current?.select()}
        onBlur={schliesse}
        onKeyDown={tasten}
        className={`h-tap w-full min-w-0 rounded-ctl bg-surface px-2 text-sm ${klasse}`}
      />
      {offen && (
        <ul
          id={listenId}
          role="listbox"
          aria-label="Artikel im Stamm"
          className="absolute top-full left-0 z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-ctl border border-border-strong bg-surface shadow-lg"
        >
          {gezeigt.length === 0 ? (
            <li className="px-3 py-3 text-sm text-text-muted">
              Kein Artikel im Stamm passt zu dieser Suche.
            </li>
          ) : (
            gezeigt.map((eintrag, index) => (
              <li key={eintrag.id} id={`${listenId}-${index}`} role="option" aria-selected={index === aktiv}>
                {/* mousedown statt click, sonst schliesst der Fokusverlust die
                    Liste, bevor die Wahl ankommt. */}
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(ereignis) => {
                    ereignis.preventDefault()
                    waehle(eintrag)
                  }}
                  onMouseMove={() => setzeMarkiert(index)}
                  className={`flex min-h-tap w-full flex-col justify-center px-3 py-1.5 text-left ${
                    index === aktiv ? 'bg-primary-soft text-primary-soft-on' : ''
                  }`}
                >
                  <span className="w-full truncate text-sm font-medium">{eintrag.name}</span>
                  <span className={`w-full truncate text-sm ${index === aktiv ? '' : 'text-text-muted'}`}>
                    {eintrag.gebindeText} · {eintrag.kategorie}
                  </span>
                </button>
              </li>
            ))
          )}
          {treffer.length > gezeigt.length && (
            <li className="border-t border-border px-3 py-2 text-sm text-text-muted">
              {treffer.length - gezeigt.length} weitere — weiter tippen grenzt ein
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Eine weitere Zutat des Rezepts, als kompakte Zeile unter der ersten:
 * Artikelsuche, Menge, Einheit, weg damit. Nach der Artikelwahl springt der
 * Fokus in das Mengenfeld dieser Zutat — derselbe Griff wie in der Hauptzeile.
 */
function Zutatenzeile({
  teil,
  auswahl,
  taste,
  aufAenderung,
  aufEntfernen,
}: {
  teil: Mengenzeile
  auswahl: Auswahleintrag[]
  taste: (ereignis: KeyboardEvent<HTMLElement>) => void
  aufAenderung: (aenderung: Partial<Mengenzeile>) => void
  aufEntfernen: () => void
}) {
  const menge = useRef<HTMLInputElement>(null)
  const artikel = auswahl.find((eintrag) => eintrag.id === teil.artikelId) ?? null

  return (
    <div className="flex gap-tapgap">
      <Artikelsuche
        auswahl={auswahl}
        artikelId={teil.artikelId}
        beschriftung="Weitere Zutat"
        aufWahl={(artikelId) => aufAenderung({ artikelId })}
        nachWahl={() => {
          menge.current?.focus()
          menge.current?.select()
        }}
        taste={taste}
      />
      <input
        ref={menge}
        type="text"
        inputMode="decimal"
        aria-label="Menge je Verkauf"
        value={teil.wert}
        onChange={(ereignis) => aufAenderung({ wert: ereignis.target.value })}
        onKeyDown={taste}
        className="h-tap w-16 shrink-0 rounded-ctl border border-border bg-surface px-2 text-right text-sm"
      />
      <Einheitenwahl
        einheit={teil.einheit}
        artikel={artikel}
        aufWahl={(einheit) => aufAenderung({ einheit })}
        taste={taste}
        schmal
      />
      {/* Der abgeleitete Anteil dieser Zutat, hinter ihrem Artikelfeld. */}
      <input
        type="hidden"
        name="einheitenProVerkauf"
        value={faktorAusEingabe(artikel, teil)?.toString() ?? ''}
      />
      <button
        type="button"
        onClick={aufEntfernen}
        aria-label="Zutat entfernen"
        className="tap h-tap w-tap shrink-0 rounded-ctl bg-surface-2 text-lg"
      >
        ×
      </button>
    </div>
  )
}

/** Die Einheit neben der Zahl: cl, l oder die Zähleinheit des Artikels. */
function Einheitenwahl({
  einheit,
  artikel,
  aufWahl,
  taste,
  schmal = false,
}: {
  einheit: Ausschankeinheit
  artikel: Auswahleintrag | null
  aufWahl: (einheit: Ausschankeinheit) => void
  taste: (ereignis: KeyboardEvent<HTMLElement>) => void
  /** Die Fassung mit eigenem Rahmen für die aufgeklappten Zutatenzeilen. */
  schmal?: boolean
}) {
  return (
    <select
      aria-label="Einheit der Menge"
      value={einheit}
      onChange={(ereignis) => aufWahl(ereignis.target.value as Ausschankeinheit)}
      onKeyDown={taste}
      className={
        schmal
          ? 'h-tap shrink-0 rounded-ctl border border-border bg-surface px-1.5 text-sm'
          : 'h-full shrink-0 bg-transparent pr-2 text-sm text-text-muted outline-none'
      }
    >
      <option value="cl">cl</option>
      <option value="l">l</option>
      <option value="einheit">{artikel === null ? 'Flasche' : einheitswort(artikel)}</option>
    </select>
  )
}

/**
 * Was unter der Bezeichnung steht — die Lage der Zeile, nicht ihr Inhalt.
 *
 * Bei einer bestätigten Zeile steht hier nichts: der grüne Punkt neben dem
 * Artikel sagt es schon, und zweimal dasselbe zu lesen kostet auf vierhundert
 * Zeilen mehr Zeit, als es Sicherheit gibt. Ein Rezept mit mehreren Zutaten
 * bleibt stehen — das sieht man dem Artikelfeld nicht an.
 */
function unterzeile(lage: Zeilenzustand, zeile: Zeilendaten, artikel: number): string {
  if (zeile.notiz !== null && zeile.notiz !== '') return zeile.notiz
  switch (lage) {
    case 'offen':
      return 'nicht zugeordnet'
    case 'vorschlag':
      return 'Vorschlag — noch nicht bestätigt'
    case 'bestaetigt':
      return artikel > 1 ? `Rezept, ${artikel} Zutaten` : ''
    case 'ausgenommen':
      return 'ausgenommen'
  }
}

/** Die Wirkung eines weiteren Bestandteils — der Prosecco neben dem Aperol. */
function Nebenwirkung({
  teil,
  auswahl,
  verkaeufe,
}: {
  teil: Mengenzeile
  auswahl: Auswahleintrag[]
  verkaeufe: number
}) {
  const artikel = auswahl.find((eintrag) => eintrag.id === teil.artikelId) ?? null
  if (artikel === null) return null
  const wirkung = auswirkung(artikel, verkaeufe, teil)
  return <p className="mt-1 text-sm text-text-muted">+ {wirkung.satz}</p>
}

/**
 * Die aufgeklappte Fassung unter der aktiven Zeile.
 *
 * Sie sagt dasselbe wie die Zeile, nur gross genug, um es beim Durcharbeiten
 * nicht zu übersehen — und sie zeigt, woher der Vorschlag kommt. Die Kandidaten
 * stehen mit ihrer Güte da und nicht als fertige Antwort: die Reihenfolge kommt
 * aus dem Namen, und ähnlich heisst nicht richtig.
 *
 * Bearbeitet wird hier nichts mehr ausser der Notiz: Artikel, Mengen und
 * Zutaten stehen in der Zeile selbst. Zwei Feldsätze für dieselben Zutaten
 * gingen doppelt ins Formular.
 */
function Ausfuehrlich({
  zeile,
  satz,
  herleitung,
  warnung,
  uebernimm,
  laeuft,
}: {
  zeile: Zeilendaten
  satz: string
  herleitung: string | null
  warnung: string | null
  uebernimm: (vorschlag: Zuordnungsvorschlag) => void
  laeuft: boolean
}) {
  return (
    <div className="mt-4 grid gap-7 border-t border-border pt-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-3">
        <p className="text-abschnitt text-primary-text uppercase">Was diese Zeile abzieht</p>
        <p className="text-titel text-primary-soft-on">{satz}</p>
        {herleitung !== null && (
          <p className="font-mono text-sm font-normal tracking-normal text-primary-text">
            {herleitung}
          </p>
        )}

        {warnung !== null && (
          <p className="rounded-ctl bg-attention-soft p-3 text-sm text-attention-soft-on">
            {warnung}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-tapgap">
          <Schaltflaeche
            type="submit"
            art="sekundaer"
            name="modus"
            value="ausnehmen"
            disabled={laeuft}
            title="Diese Bezeichnung berührt das Getränkelager nicht"
          >
            Ausnehmen
          </Schaltflaeche>
        </div>

        <label className="sr-only" htmlFor={`notiz-${zeile.id}`}>
          Notiz
        </label>
        <input
          id={`notiz-${zeile.id}`}
          name="notiz"
          type="text"
          defaultValue={zeile.notiz ?? ''}
          placeholder="Notiz (freiwillig)"
          className="h-tap w-full rounded-ctl border border-border bg-surface px-3 text-sm"
        />

        <p className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
          <Taste zeichen="↵" text="bestätigen und zur nächsten offenen Zeile" />
          <Taste zeichen="⇧↵" text="bestätigen, hier bleiben" />
          <Taste zeichen="esc" text="Vorschlag verwerfen" />
        </p>
      </div>

      <div className="flex flex-col gap-tapgap">
        <p className="text-abschnitt text-primary-text uppercase">
          Vorschläge aus Namensähnlichkeit
        </p>
        {zeile.vorschlaege.length === 0 ? (
          <p className="text-sm text-text-muted">
            Kein Artikel im Stamm ähnelt dieser Bezeichnung genug, um ihn vorzuschlagen.
          </p>
        ) : (
          zeile.vorschlaege.map((vorschlag) => (
            <button
              key={vorschlag.artikelId}
              type="button"
              onClick={() => uebernimm(vorschlag)}
              className="tap flex min-h-tap items-center gap-3 rounded-ctl border border-border bg-surface px-3.5 py-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {vorschlag.artikelName}
                </span>
                <span className="block truncate text-sm text-text-muted">
                  {vorschlag.gebindeText}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-primary-text">
                {guetetext(vorschlag.guete)}
              </span>
            </button>
          ))
        )}
        <p className="text-sm text-text-muted">
          Die Reihenfolge kommt aus dem Namen, nicht aus dem Gebinde. Ähnlich heisst nicht
          richtig.
        </p>
      </div>
    </div>
  )
}

export function Taste({ zeichen, text }: { zeichen: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-normal tracking-normal">
        {zeichen}
      </kbd>
      {text}
    </span>
  )
}
