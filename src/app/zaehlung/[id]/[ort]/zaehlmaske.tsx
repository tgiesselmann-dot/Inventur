'use client'

/**
 * Die Zählmaske: ein Artikel füllt den Bildschirm, der Eingabeblock sitzt unten.
 *
 * Die Fokusansicht statt einer Liste mit 99 Zeilen ist eine Entscheidung für
 * den Daumen. In einer Scrollliste liegen die oberen Zeilen zwangsläufig im
 * oberen Bildschirmdrittel, und die Zusage "alle Bedienelemente unten
 * erreichbar" wäre nicht zu halten. Hier steht jedes Bedienelement immer an
 * derselben Stelle — der Zähler muss nicht zielen und kann auf die Kiste
 * schauen statt auf das Handy.
 *
 * Gezählt wird immer in genau einem Lager. Die Maske führt deshalb nicht durch
 * den ganzen Artikelstamm, sondern durch das, was an diesem Ort erwartet wird —
 * die Artikel, die dort bei der letzten Zählung standen. Was heute
 * ausnahmsweise dort steht, holt man sich in der Liste unter „Weitere Artikel"
 * dazu; ab der nächsten Zählung ist es von allein dabei. Beim allerersten Mal
 * gibt es keine Erfahrung, dann führt sie durch den ganzen Stamm.
 *
 * Der Weg durch die Artikel folgt `sortierung`, dem Laufweg im Lager. Die
 * Übersicht ist der Ausweg daraus: springen, überspringen, Lücken finden — und
 * für die zwei, drei Zeilen, die man nachträgt, auch gleich eintragen, ohne
 * dafür in die Fokusansicht zu wechseln.
 *
 * Zwei Berührungen im Normalfall: eine Ziffer (der Wert steht und ist
 * gespeichert), dann "weiter". Wer an einem leeren Fach nichts eingibt,
 * bestätigt mit "weiter" die Null — die Taste sagt vorher, was sie speichert.
 *
 * Am Ende steht die Fertigmeldung dieses Lagers, nicht der Abschluss der
 * Zählung. Abgeschlossen wird erst, wenn alle Lager gemeldet sind, und das
 * geschieht eine Ebene höher in der Ortswahl — ein Lager, das niemand angefasst
 * hat, sieht in der Schwundrechnung sonst aus wie verschwundene Ware.
 *
 * Alles, was zum Zählen nötig ist, liegt im unteren Drittel: die Ziffern, der
 * Feldwechsel, "weiter". Darüber steht nichts, was man erreichen *muss* — die
 * "Liste" im Kopf ist bewusst weit weg vom Daumen, damit sie nicht versehentlich
 * getroffen wird und die Fokusansicht wegspringt.
 *
 * Zwei Flächen oben reagieren trotzdem auf einen Tipp, beide als zweiter Weg
 * neben einem unteren: die ruhende Wertkachel führt in ihr Feld wie die
 * Wechseltaste im Block. Wer auf „lose Flaschen" schaut, tippt dorthin, statt
 * unten zu zielen; wer das Handy in einer Hand hält, nimmt weiter die Taste.
 * Gemeldet wird nach wie vor in der Liste, wo die Schaltfläche im Fuss steht.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { ZaehlungStatus, type GebindeRegel } from '@/generated/prisma/enums'
import {
  alsEingaben,
  alsPosition,
  felder,
  fortschritt,
  fortschrittsanteil,
  inZaehlreihenfolge,
  kontrolltext,
  naechsterIndex,
  regelFuer,
  schritt,
  tasteAnwenden,
  ungezaehlte,
  type Feldname,
  type Taste,
  type ZaehlArtikel,
  type Zaehleingabe,
} from '@/lib/zaehlung'
import { alsDatumstext } from '@/lib/datum'
import { useZaehlstand } from '@/offline/verwenden'
import { type Eintrag } from '@/offline/warteschlange'
import { Fortschrittsbalken } from '@/ui/fortschrittsbalken'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Statuszeile } from '@/ui/statuszeile'
import { Vollbild } from '@/ui/vollbild'
import { Wertfeld } from '@/ui/wertfeld'
import { Ziffernblock } from '@/ui/ziffernblock'
import { Ladezustand } from '@/ui/zustand'

import { Uebersicht } from './uebersicht'

const LEER: Zaehleingabe = { anzahlGebinde: '', anzahlEinzeln: '' }

/**
 * Die Artikel, durch die dieses Lager führt.
 *
 * Steht als Funktion neben der Komponente, weil sie an zwei Stellen gebraucht
 * wird: für die Anzeige und für den Sprung auf einen gerade dazugeholten
 * Artikel, dessen Index sich auf die künftige Liste bezieht.
 *
 * Ohne Erwartung — die erste Zählung an diesem Ort — führt sie durch den ganzen
 * Stamm. Etwas anderes wäre geraten.
 */
function ortsliste(
  artikel: readonly ZaehlArtikel[],
  erwartet: ReadonlySet<string>,
  zusaetzlich: ReadonlySet<string>,
): ZaehlArtikel[] {
  const meine =
    erwartet.size === 0
      ? [...artikel]
      : artikel.filter((eintrag) => erwartet.has(eintrag.id) || zusaetzlich.has(eintrag.id))
  return inZaehlreihenfolge(meine)
}

type Props = {
  zaehlungId: string
  lagerortId: string
  lagerortName: string
  /** Welche Zählfelder dieser Ort zulässt — die Regel aus der Lagerverwaltung. */
  gebindeRegel: GebindeRegel
  /** Die Artikel, die von der Regel ausgenommen sind und normal zählen. */
  ausnahmeArtikel: string[]
  datum: string
  status: ZaehlungStatus
  artikel: ZaehlArtikel[]
  /**
   * Die Artikel, die an diesem Ort erwartet werden — aus der letzten
   * abgeschlossenen Zählung. Leer beim ersten Mal; dann führt die Maske durch
   * den ganzen Stamm, weil es keine Erfahrung gibt, auf die sie sich stützen
   * könnte.
   */
  erwarteteArtikel: string[]
  serverEintraege: Eintrag[]
}

export function Zaehlmaske({
  zaehlungId,
  lagerortId,
  lagerortName,
  gebindeRegel,
  ausnahmeArtikel,
  datum,
  status,
  artikel,
  erwarteteArtikel,
  serverEintraege,
}: Props) {
  const router = useRouter()

  const ausnahmen = useMemo(() => new Set(ausnahmeArtikel), [ausnahmeArtikel])

  /**
   * Die Regel, die für einen Artikel an diesem Ort gilt. Sie entscheidet über
   * die Felder — hier, in der Liste und beim Speichern, damit alle drei
   * dieselben Felder meinen.
   */
  const regelVon = useCallback(
    (artikelId: string) => regelFuer(gebindeRegel, ausnahmen, artikelId),
    [gebindeRegel, ausnahmen],
  )

  /**
   * Was heute ausnahmsweise hier steht — in der Liste dazugeholt.
   *
   * Nur für diese Sitzung: einen Wert bekommt der Artikel erst, wenn jemand
   * ihn zählt, und dann ist er ab der nächsten Zählung von allein erwartet.
   * Eine gepflegte Zuordnung wäre ein zweiter Stammdatensatz neben der
   * Wirklichkeit.
   */
  const [zusaetzlich, setZusaetzlich] = useState<ReadonlySet<string>>(new Set())

  const erwartet = useMemo(() => new Set(erwarteteArtikel), [erwarteteArtikel])

  /** Die Artikel dieses Ortes: erwartete plus dazugeholte. */
  const liste = useMemo(
    () => ortsliste(artikel, erwartet, zusaetzlich),
    [artikel, erwartet, zusaetzlich],
  )

  /** Der Rest des Stamms — erreichbar über die Liste, nicht über „weiter". */
  const weitere = useMemo(() => {
    const meine = new Set(liste.map((eintrag) => eintrag.id))
    return inZaehlreihenfolge(artikel.filter((eintrag) => !meine.has(eintrag.id)))
  }, [artikel, liste])

  const stand = useZaehlstand(zaehlungId, lagerortId, liste, serverEintraege, { datum, status })

  const abgeschlossen = status === ZaehlungStatus.ABGESCHLOSSEN

  const [index, setIndex] = useState(0)
  // Eine abgeschlossene Zählung öffnet als Liste, nicht als Eingabe: der
  // Server nimmt keine Werte mehr an, und ein Ziffernblock, dessen Eingaben
  // nie ankommen, sähe nur so aus, als würde er speichern.
  const [ansicht, setAnsicht] = useState<'fokus' | 'uebersicht'>(
    abgeschlossen ? 'uebersicht' : 'fokus',
  )
  const [aktivesFeld, setAktivesFeld] = useState<Feldname | null>(null)
  /** Was gerade getippt wurde. null heisst: es gilt der gespeicherte Wert. */
  const [entwurf, setEntwurf] = useState<Zaehleingabe | null>(null)
  /** true, wenn die Fertigmeldung nicht durchkam. */
  const [meldungFehlt, setMeldungFehlt] = useState(false)
  /**
   * Wie viele Werte bei der letzten Fertigmeldung noch auf dem Gerät lagen —
   * 0, wenn nichts im Weg stand. Die Meldung wurde dann nicht abgeschickt.
   */
  const [geraetOffen, setGeraetOffen] = useState(0)
  const [meldet, setMeldet] = useState(false)
  /**
   * Suche und Klappstand der Liste. Sie stehen hier und nicht in der Liste,
   * weil die beim Wechsel in die Fokusansicht abgebaut wird: wer nach
   * "aperitif" sucht, eine Zeile antippt und sie zählt, soll beim Zurückkommen
   * dieselben vier Stationen vorfinden und nicht wieder neunundneunzig Zeilen.
   */
  const [suche, setSuche] = useState('')
  const [zugeklappt, setZugeklappt] = useState<ReadonlySet<string>>(new Set())

  const aktuell = liste[index]
  const meineFelder = useMemo(
    () => (aktuell ? felder(aktuell, regelVon(aktuell.id)) : []),
    [aktuell, regelVon],
  )
  const feld = meineFelder.find((eintrag) => eintrag.name === aktivesFeld) ?? meineFelder[0]
  /** Das Feld, in das die Wechseltaste springt. Fehlt beim Artikel mit einem Feld. */
  const anderesFeld = meineFelder.find((eintrag) => eintrag.name !== feld?.name)

  /** Der gespeicherte Wert des aktuellen Artikels, als Eingabetext. */
  const gespeichert = useMemo(
    (): Zaehleingabe =>
      aktuell === undefined ? LEER : alsEingaben(stand.eintraege.get(aktuell.id)),
    [aktuell, stand.eintraege],
  )

  const werte = entwurf ?? gespeichert

  /** Übernimmt einen neuen Stand für den aktuellen Artikel — Bildschirm und Speicher. */
  const uebernehmen = useCallback(
    (neu: Zaehleingabe) => {
      if (aktuell === undefined) return
      setEntwurf(neu)
      stand.setzen(aktuell.id, alsPosition(aktuell, neu, regelVon(aktuell.id)))
    },
    [aktuell, stand, regelVon],
  )

  /**
   * Derselbe Weg für einen beliebigen Artikel — den Feldern der Liste.
   *
   * Kein zweiter Speicherweg neben `uebernehmen`: die Eingabe geht durch
   * denselben `stand.setzen`, und damit gelten Gerätespeicher, Warteschlange,
   * Statuspunkt und die Ruhe vor dem Versand unverändert. Nur der Entwurf des
   * aktuellen Artikels bleibt hier aussen vor — der gehört der Fokusansicht.
   */
  const wertSetzen = useCallback(
    (eintrag: ZaehlArtikel, neu: Zaehleingabe) => {
      stand.setzen(eintrag.id, alsPosition(eintrag, neu, regelVon(eintrag.id)))
    },
    [stand, regelVon],
  )

  const gehZu = useCallback((ziel: number) => {
    setIndex(ziel)
    setEntwurf(null)
    setAktivesFeld(null)
    setAnsicht('fokus')
  }, [])

  /**
   * Holt einen Artikel aus dem übrigen Stamm in dieses Lager.
   *
   * Er wandert damit in die Zählreihenfolge und wird sofort zum Artikel der
   * Fokusansicht — wer ihn dazuholt, will ihn zählen und nicht erst suchen.
   * Die künftige Liste wird dafür hier ausgerechnet und nicht abgewartet: der
   * neue Index bezieht sich auf sie, nicht auf die, die gerade noch steht.
   */
  const aufnehmen = useCallback(
    (artikelId: string) => {
      const neu = new Set(zusaetzlich).add(artikelId)
      setZusaetzlich(neu)
      const ziel = ortsliste(artikel, erwartet, neu).findIndex(
        (eintrag) => eintrag.id === artikelId,
      )
      if (ziel >= 0) setIndex(ziel)
      setEntwurf(null)
      setAktivesFeld(null)
      setAnsicht('fokus')
    },
    [artikel, erwartet, zusaetzlich],
  )

  if (aktuell === undefined || feld === undefined) {
    return <p className="p-6">Diese Zählung hat keine aktiven Artikel.</p>
  }

  // Bis der lokale Speicher gelesen ist, bleibt die Maske zu: wer vorher
  // tippte, dessen Eingabe würde vom Zusammenführen mit dem Gerätestand
  // überschrieben. Die Balken halten die Zeilenmasse — beim Öffnen springt
  // nichts.
  if (stand.laedt) {
    return (
      <Vollbild>
        <header className="flex shrink-0 items-center bg-surface px-4 pt-2 pb-3.5">
          <p className="text-zeile text-text-muted">Zählung wird geöffnet …</p>
        </header>
        <div aria-hidden className="h-[3px] shrink-0 bg-border" />
        <div className="flex-1 overflow-hidden p-2">
          <Ladezustand zeilen={6} />
        </div>
      </Vollbild>
    )
  }

  const gezaehlt = fortschritt(liste, stand.erfasst)
  const offen = ungezaehlte(liste, stand.erfasst)

  function beiTaste(taste: Taste) {
    uebernehmen({ ...werte, [feld!.name]: tasteAnwenden(werte[feld!.name], taste, feld!.dezimal) })
  }

  function beiSchritt(delta: number) {
    uebernehmen({ ...werte, [feld!.name]: schritt(werte[feld!.name], delta) })
  }

  function beiWeiter() {
    // Auch ohne Eingabe speichern: "weiter" bestätigt die Null, und die Taste
    // hat vorher gesagt, dass sie das tut.
    uebernehmen(werte)
    const ziel = naechsterIndex(liste, new Set([...stand.erfasst, aktuell!.id]), index)
    if (ziel === null) setAnsicht('uebersicht')
    else gehZu(ziel)
  }

  /**
   * Meldet dieses Lager fertig und führt zurück in die Ortswahl.
   *
   * Die Meldung ist bewusst nicht daran gebunden, dass jeder Artikel der Liste
   * einen Wert hat: an der Theke stehen vierzig der neunundneunzig Artikel, und
   * für die übrigen neunundfünfzig eine Null zu tippen wäre keine Zählung,
   * sondern eine Beschäftigung. Dass am Ende kein Artikel *nirgends* gezählt
   * ist, prüft der Abschluss der ganzen Zählung.
   */
  async function beiFertigmeldung() {
    setMeldet(true)
    setMeldungFehlt(false)
    setGeraetOffen(0)
    try {
      // Erst alles Ausstehende loswerden: ein Lager als fertig zu melden,
      // während seine Werte noch auf dem Gerät liegen, wäre eine Zusage, die
      // der Server nicht einlösen kann.
      await stand.senden()
      // senden() scheitert leise — kein Netz, eine Ablehnung, ein schon
      // laufender Versand. Liegt danach noch etwas, wird nicht gemeldet: eine
      // Fertigmeldung, die an der Lagertür durchrutscht, während der Stapel es
      // nicht tat, macht aus liegengebliebenen Werten Schein-Schwund — und der
      // Abschluss sperrt das Nachsenden mit 409.
      const liegtNoch = stand.offen()
      if (liegtNoch > 0) {
        setGeraetOffen(liegtNoch)
        return
      }
      const antwort = await fetch(`/api/zaehlung/${zaehlungId}/lager/${lagerortId}/fertig`, {
        method: 'POST',
      })

      if (antwort.ok) {
        // Zurück in die Ortswahl statt in die Liste: der nächste Griff gilt dem
        // nächsten Lager, und dort steht auch, was noch offen ist.
        router.push(`/zaehlung/${zaehlungId}`)
        return
      }
      setMeldungFehlt(true)
    } catch {
      // Ohne Netz lässt sich nichts melden. Der Status oben sagt bereits, dass
      // Werte unterwegs sind.
      setMeldungFehlt(true)
    } finally {
      setMeldet(false)
    }
  }

  const alleErfasst = gezaehlt.gezaehlt === gezaehlt.gesamt

  return (
    <Vollbild>
      <header className="flex shrink-0 items-center gap-3.5 bg-surface px-4 pt-2 pb-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Der Ortsname steht dauerhaft im Kopf, nicht die Kategorie: beim
              Zählen zu zweit ist „in welchem Lager bin ich" die Frage, deren
              falsche Antwort eine ganze Zählung verdirbt. Die Kategorie steht
              als Abschnitt in der Liste. */}
          <p className="truncate text-zeile">
            {abgeschlossen
              ? `${lagerortName} · ${alsDatumstext(new Date(datum))}`
              : lagerortName}
          </p>
          {/* Abgeschlossen gibt es keine Warteschlange mehr, deren Stand hier
              stehen könnte — der Fuss der Liste sagt stattdessen, dass die
              Werte feststehen. */}
          {!abgeschlossen && (
            <Statuszeile status={stand.status} aufErneut={() => void stand.senden()} />
          )}
        </div>
        <span className="shrink-0 text-sm font-medium text-text-muted">
          {gezaehlt.gezaehlt} von {gezaehlt.gesamt}
        </span>
        {/* Die Kachel bleibt 56px hoch und trägt ihre Höhe trotzdem nicht in den
            Kopf: der negative Rand lässt sie in dessen Polsterung hineinragen,
            statt ihn auf Tastenhöhe aufzublasen. */}
        {!abgeschlossen && (
          <span className="-my-2 flex shrink-0">
            <Schaltflaeche
              art="sekundaer"
              onClick={() => {
                // Der Entwurf gehört der Fokusansicht und ist beim Wechsel
                // hinfällig: wer denselben Artikel in der Liste beschreibt,
                // hätte beim Zurückkommen sonst den alten Text vor sich — und
                // der nächste Tastendruck ginge von ihm aus statt vom Wert.
                setEntwurf(null)
                setAnsicht(ansicht === 'fokus' ? 'uebersicht' : 'fokus')
              }}
            >
              {ansicht === 'fokus' ? 'Liste' : 'Zählen'}
            </Schaltflaeche>
          </span>
        )}
      </header>

      {/* Der Zähler im Kopf sagt dieselbe Zahl in Worten. */}
      <div className="shrink-0">
        <Fortschrittsbalken
          fein
          anteil={fortschrittsanteil(gezaehlt)}
          rolle={alleErfasst ? 'confirm' : 'primary'}
        />
      </div>

      {ansicht === 'uebersicht' ? (
        <Uebersicht
          artikel={liste}
          weitere={weitere}
          lagerortName={lagerortName}
          regelVon={regelVon}
          eintraege={stand.eintraege}
          erfasst={stand.erfasst}
          offen={offen}
          meldungFehlt={meldungFehlt}
          geraetOffen={geraetOffen}
          alleErfasst={alleErfasst}
          abgeschlossen={abgeschlossen}
          ortswahlZiel={`/zaehlung/${zaehlungId}`}
          meldet={meldet}
          suche={suche}
          aufSuche={setSuche}
          zugeklappt={zugeklappt}
          aufZugeklappt={setZugeklappt}
          aufArtikel={gehZu}
          aufWert={wertSetzen}
          aufAufnehmen={aufnehmen}
          aufFertigmeldung={() => void beiFertigmeldung()}
        />
      ) : (
        <>
          <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-titel text-balance">{aktuell.name}</h1>
              <p className="text-zeile font-normal text-text-muted">
                {aktuell.lieferGebindeText}
              </p>

              {!aktuell.schwundfaehig && (
                <p className="max-w-[32ch] text-sm text-text-muted">
                  Wird gezählt, aber nicht auf Schwund geprüft.
                </p>
              )}
            </div>

            <div className="flex w-full flex-col gap-3">
              <div className="flex gap-3">
                {meineFelder.map((eintrag) => (
                  <Wertfeld
                    key={eintrag.name}
                    wert={werte[eintrag.name]}
                    beschriftung={eintrag.beschriftung}
                    aktiv={eintrag.name === feld.name}
                    // Die ruhende Kachel führt in ihr Feld, die aktive bleibt
                    // Anzeige. Beim Artikel mit einem Feld ist dieses immer das
                    // aktive — dort entsteht so von allein keine Schaltfläche.
                    aufWechsel={
                      eintrag.name === feld.name ? undefined : () => setAktivesFeld(eintrag.name)
                    }
                  />
                ))}
              </div>

              {meineFelder.length === 2 && (
                <Kontrollzeile artikel={aktuell} werte={werte} regel={regelVon(aktuell.id)} />
              )}
            </div>
          </main>

          <footer className="shrink-0 border-t border-border bg-surface">
            {alleErfasst && !abgeschlossen && (
              <p
                role="status"
                className="mx-2 mt-2.5 flex items-center gap-2.5 rounded-ctl bg-confirm-soft px-4 py-3 text-sm font-semibold text-confirm-soft-on"
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-confirm" />
                Alle gezählt — fertig melden über „Liste“
              </p>
            )}
            <Ziffernblock
              dezimal={feld.dezimal}
              weiterText={weiterText(werte[feld.name], feld.beschriftung, index, liste.length)}
              weiterRolle={alleErfasst && !abgeschlossen ? 'confirm' : 'primary'}
              feldwechsel={
                anderesFeld === undefined
                  ? undefined
                  : {
                      ziel: anderesFeld.beschriftung,
                      aufWechsel: () => setAktivesFeld(anderesFeld.name),
                    }
              }
              aufTaste={beiTaste}
              aufSchritt={beiSchritt}
              aufWeiter={beiWeiter}
            />
          </footer>
        </>
      )}
    </Vollbild>
  )
}

/**
 * Die Kontrolle unter den beiden Feldern: was die Eingabe zusammengerechnet
 * bedeutet. Text samt Einheitenwort kommt aus `kontrolltext` — dort steht auch,
 * warum ein Fass keine "Flaschen" bekommt.
 */
function Kontrollzeile({
  artikel,
  werte,
  regel,
}: {
  artikel: ZaehlArtikel
  werte: Zaehleingabe
  regel: GebindeRegel
}) {
  let text: string | null
  try {
    text = kontrolltext(artikel, werte, regel)
  } catch {
    // Sollte nicht vorkommen — alsPosition räumt die Werte vorher auf. Eine
    // kaputte Kontrollanzeige darf die Eingabe trotzdem nicht blockieren.
    text = null
  }
  if (text === null) return null

  return <p className="text-sm text-text-muted">{text}</p>
}

/** Die Aufschrift der Weiter-Taste sagt, was sie speichert. */
function weiterText(wert: string, beschriftung: string, index: number, gesamt: number): string {
  if (index + 1 >= gesamt) return wert === '' ? '0 · fertig' : `${wert} ${beschriftung} · fertig`
  return wert === '' ? '0 · weiter' : `${wert} ${beschriftung} · weiter`
}
