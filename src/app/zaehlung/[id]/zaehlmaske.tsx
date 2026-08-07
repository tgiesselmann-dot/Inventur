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
 * Der Weg durch die Artikel folgt `sortierung`, dem Laufweg im Lager. Die
 * Übersicht ist der Ausweg daraus: springen, überspringen, Lücken finden.
 *
 * Zwei Berührungen im Normalfall: eine Ziffer (der Wert steht und ist
 * gespeichert), dann "weiter". Wer an einem leeren Fach nichts eingibt,
 * bestätigt mit "weiter" die Null — die Taste sagt vorher, was sie speichert.
 */

import { useCallback, useMemo, useState } from 'react'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { gesamtEinheiten } from '@/lib/einheiten'
import {
  alsEingabe,
  alsPosition,
  felder,
  fortschritt,
  inZaehlreihenfolge,
  naechsterIndex,
  schritt,
  tasteAnwenden,
  ungezaehlte,
  type Feldname,
  type Taste,
  type ZaehlArtikel,
  type Zaehleingabe,
} from '@/lib/zaehlung'
import { useZaehlstand } from '@/offline/verwenden'
import { statusText, type Eintrag } from '@/offline/warteschlange'

import { Uebersicht } from './uebersicht'
import { Ziffernblock } from './ziffernblock'

const LEER: Zaehleingabe = { anzahlGebinde: '', anzahlEinzeln: '' }

type Props = {
  zaehlungId: string
  datum: string
  status: ZaehlungStatus
  artikel: ZaehlArtikel[]
  serverEintraege: Eintrag[]
}

export function Zaehlmaske({ zaehlungId, datum, status, artikel, serverEintraege }: Props) {
  const liste = useMemo(() => inZaehlreihenfolge(artikel), [artikel])
  const stand = useZaehlstand(zaehlungId, liste, serverEintraege, { datum, status })

  const [index, setIndex] = useState(0)
  const [ansicht, setAnsicht] = useState<'fokus' | 'uebersicht'>('fokus')
  const [aktivesFeld, setAktivesFeld] = useState<Feldname | null>(null)
  /** Was gerade getippt wurde. null heisst: es gilt der gespeicherte Wert. */
  const [entwurf, setEntwurf] = useState<Zaehleingabe | null>(null)
  const [abschlussFehlt, setAbschlussFehlt] = useState<ZaehlArtikel[] | null>(null)
  const [schliesst, setSchliesst] = useState(false)

  const aktuell = liste[index]
  const meineFelder = useMemo(() => (aktuell ? felder(aktuell) : []), [aktuell])
  const feld = meineFelder.find((eintrag) => eintrag.name === aktivesFeld) ?? meineFelder[0]

  /** Der gespeicherte Wert des aktuellen Artikels, als Eingabetext. */
  const gespeichert = useMemo((): Zaehleingabe => {
    if (aktuell === undefined) return LEER
    const eintrag = stand.eintraege.get(aktuell.id)
    if (eintrag === undefined) return LEER
    return {
      anzahlGebinde: alsEingabe(eintrag.anzahlGebinde),
      anzahlEinzeln: alsEingabe(eintrag.anzahlEinzeln),
    }
  }, [aktuell, stand.eintraege])

  const werte = entwurf ?? gespeichert

  /** Übernimmt einen neuen Stand für den aktuellen Artikel — Bildschirm und Speicher. */
  const uebernehmen = useCallback(
    (neu: Zaehleingabe) => {
      if (aktuell === undefined) return
      setEntwurf(neu)
      stand.setzen(aktuell.id, alsPosition(aktuell, neu))
    },
    [aktuell, stand],
  )

  const gehZu = useCallback((ziel: number) => {
    setIndex(ziel)
    setEntwurf(null)
    setAktivesFeld(null)
    setAnsicht('fokus')
  }, [])

  if (aktuell === undefined || feld === undefined) {
    return <p className="p-6">Diese Zählung hat keine aktiven Artikel.</p>
  }

  const gezaehlt = fortschritt(liste, stand.erfasst)
  const offen = ungezaehlte(liste, stand.erfasst)
  const abgeschlossen = status === ZaehlungStatus.ABGESCHLOSSEN

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

  async function beiAbschluss() {
    setSchliesst(true)
    setAbschlussFehlt(null)
    try {
      // Erst alles Ausstehende loswerden, sonst meldet der Server Lücken, die
      // in Wirklichkeit noch auf dem Gerät liegen.
      await stand.senden()
      const antwort = await fetch(`/api/zaehlung/${zaehlungId}/abschluss`, { method: 'POST' })
      const ergebnis = (await antwort.json()) as { fehlend?: { id: string }[] }

      if (antwort.ok) {
        window.location.reload()
        return
      }
      if (antwort.status === 409) {
        const fehlendeIds = new Set((ergebnis.fehlend ?? []).map((eintrag) => eintrag.id))
        setAbschlussFehlt(liste.filter((eintrag) => fehlendeIds.has(eintrag.id)))
        setAnsicht('uebersicht')
        return
      }
      setAbschlussFehlt([])
    } catch {
      // Ohne Netz lässt sich nicht abschliessen. Der Status oben sagt bereits,
      // dass noch Werte unterwegs sind.
      setAbschlussFehlt([])
    } finally {
      setSchliesst(false)
    }
  }

  const alleErfasst = gezaehlt.gezaehlt === gezaehlt.gesamt

  return (
    <div className="flex h-[100dvh] flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{aktuell.kategorie}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{statusText(stand.status)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-sm font-semibold">
            {gezaehlt.gezaehlt} von {gezaehlt.gesamt}
          </span>
          <button
            type="button"
            className="h-14 rounded-xl bg-zinc-100 px-4 text-sm font-medium dark:bg-zinc-800"
            onClick={() => setAnsicht(ansicht === 'fokus' ? 'uebersicht' : 'fokus')}
          >
            {ansicht === 'fokus' ? 'Liste' : 'Zählen'}
          </button>
        </div>
      </header>

      {ansicht === 'uebersicht' ? (
        <Uebersicht
          artikel={liste}
          eintraege={stand.eintraege}
          erfasst={stand.erfasst}
          offen={offen}
          fehlendNachAbschluss={abschlussFehlt}
          alleErfasst={alleErfasst}
          abgeschlossen={abgeschlossen}
          schliesst={schliesst}
          aufArtikel={gehZu}
          aufAbschluss={() => void beiAbschluss()}
        />
      ) : (
        <>
          <main className="flex flex-1 flex-col justify-center overflow-y-auto px-4 py-3">
            <h1 className="text-3xl leading-tight font-semibold">{aktuell.name}</h1>
            <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">
              {aktuell.lieferGebindeText}
            </p>

            {!aktuell.schwundfaehig && (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Wird gezählt, aber nicht auf Schwund geprüft.
              </p>
            )}

            <div className="mt-5 flex gap-2">
              {meineFelder.map((eintrag) => {
                const aktiv = eintrag.name === feld.name
                return (
                  <button
                    key={eintrag.name}
                    type="button"
                    onClick={() => setAktivesFeld(eintrag.name)}
                    aria-pressed={aktiv}
                    // Ohne diesen Namen liest eine Sprachausgabe nur den
                    // Gedankenstrich vor, mit dem ein leeres Feld dasteht.
                    aria-label={`${eintrag.beschriftung}: ${
                      werte[eintrag.name] === '' ? 'kein Wert' : werte[eintrag.name]
                    }`}
                    className={`flex h-20 flex-1 flex-col items-start justify-center rounded-xl border-2 px-3 text-left ${
                      aktiv
                        ? 'border-sky-600 bg-sky-50 dark:bg-sky-950'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <span className="text-3xl font-semibold tabular-nums">
                      {werte[eintrag.name] === '' ? (
                        <span className="text-zinc-300 dark:text-zinc-600">—</span>
                      ) : (
                        werte[eintrag.name]
                      )}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {eintrag.beschriftung}
                    </span>
                  </button>
                )
              })}
            </div>

            {meineFelder.length === 2 && <Kontrollzeile artikel={aktuell} werte={werte} />}
          </main>

          <footer className="shrink-0 border-t border-zinc-200 dark:border-zinc-800">
            {alleErfasst && !abgeschlossen && (
              <button
                type="button"
                className="h-14 w-full bg-emerald-600 px-4 text-base font-medium text-white disabled:opacity-50"
                onClick={() => void beiAbschluss()}
                disabled={schliesst}
              >
                {schliesst ? 'Wird abgeschlossen…' : 'Alle gezählt — Zählung abschliessen'}
              </button>
            )}
            <Ziffernblock
              dezimal={feld.dezimal}
              weiterText={weiterText(werte[feld.name], feld.beschriftung, index, liste.length)}
              aufTaste={beiTaste}
              aufSchritt={beiSchritt}
              aufWeiter={beiWeiter}
            />
          </footer>
        </>
      )}
    </div>
  )
}

/**
 * Die Kontrolle unter den beiden Feldern: was die Eingabe zusammengerechnet
 * bedeutet. Gerechnet wird über `gesamtEinheiten` — die einzige Stelle im
 * Projekt, die Gebinde in Einheiten umrechnet.
 */
function Kontrollzeile({ artikel, werte }: { artikel: ZaehlArtikel; werte: Zaehleingabe }) {
  // Am unberührten Artikel bliebe sonst "= 0 Flaschen" stehen — eine Aussage
  // über einen Bestand, den niemand gezählt hat.
  if (werte.anzahlGebinde === '' && werte.anzahlEinzeln === '') return null

  const position = alsPosition(artikel, werte)
  let text: string
  try {
    text = `= ${gesamtEinheiten(artikel, position.anzahlGebinde, position.anzahlEinzeln).toString().replace('.', ',')} Flaschen`
  } catch {
    // Sollte nicht vorkommen — alsPosition räumt die Werte vorher auf. Eine
    // kaputte Kontrollanzeige darf die Eingabe trotzdem nicht blockieren.
    text = ''
  }

  return <p className="mt-3 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">{text}</p>
}

/** Die Aufschrift der Weiter-Taste sagt, was sie speichert. */
function weiterText(wert: string, beschriftung: string, index: number, gesamt: number): string {
  if (index + 1 >= gesamt) return wert === '' ? '0 · fertig' : `${wert} ${beschriftung} · fertig`
  return wert === '' ? '0 · weiter' : `${wert} ${beschriftung} · weiter`
}
