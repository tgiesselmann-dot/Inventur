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
 *
 * Alles Auslösende liegt im unteren Drittel, mit genau einer Ausnahme: "Liste"
 * im Kopf, bewusst weit weg vom Daumen, damit sie nicht versehentlich getroffen
 * wird und die Fokusansicht wegspringt. Alles darüber ist Anzeige — die
 * Wertkacheln ebenso wie der grüne Balken über dem Block. Zwischen den beiden
 * Kacheln wechselt die Wechseltaste im Ziffernblock, abgeschlossen wird in der
 * Liste, wo die Schaltfläche im Fuss steht.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import {
  alsEingabe,
  alsPosition,
  felder,
  fortschritt,
  fortschrittsanteil,
  inZaehlreihenfolge,
  kontrolltext,
  naechsterIndex,
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

type Props = {
  zaehlungId: string
  datum: string
  status: ZaehlungStatus
  artikel: ZaehlArtikel[]
  serverEintraege: Eintrag[]
}

export function Zaehlmaske({ zaehlungId, datum, status, artikel, serverEintraege }: Props) {
  const router = useRouter()
  const liste = useMemo(() => inZaehlreihenfolge(artikel), [artikel])
  const stand = useZaehlstand(zaehlungId, liste, serverEintraege, { datum, status })

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
  const [abschlussFehlt, setAbschlussFehlt] = useState<ZaehlArtikel[] | null>(null)
  const [schliesst, setSchliesst] = useState(false)

  const aktuell = liste[index]
  const meineFelder = useMemo(() => (aktuell ? felder(aktuell) : []), [aktuell])
  const feld = meineFelder.find((eintrag) => eintrag.name === aktivesFeld) ?? meineFelder[0]
  /** Das Feld, in das die Wechseltaste springt. Fehlt beim Artikel mit einem Feld. */
  const anderesFeld = meineFelder.find((eintrag) => eintrag.name !== feld?.name)

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
        // Weiter auf das Ergebnis und nicht zurück in die Maske: der Abschluss
        // endet nicht mit einer Meldung, sondern mit einem Bildschirm, der
        // sagt, was gezählt wurde.
        router.push(`/zaehlung/${zaehlungId}/abschluss`)
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
    <Vollbild>
      <header className="flex shrink-0 items-center gap-3.5 bg-surface px-4 pt-2 pb-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-zeile">
            {abgeschlossen ? `Zählung vom ${alsDatumstext(new Date(datum))}` : aktuell.kategorie}
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
              onClick={() => setAnsicht(ansicht === 'fokus' ? 'uebersicht' : 'fokus')}
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
          eintraege={stand.eintraege}
          erfasst={stand.erfasst}
          offen={offen}
          fehlendNachAbschluss={abschlussFehlt}
          alleErfasst={alleErfasst}
          abgeschlossen={abgeschlossen}
          ergebnisZiel={`/zaehlung/${zaehlungId}/abschluss`}
          schliesst={schliesst}
          aufArtikel={gehZu}
          aufAbschluss={() => void beiAbschluss()}
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
                  />
                ))}
              </div>

              {meineFelder.length === 2 && <Kontrollzeile artikel={aktuell} werte={werte} />}
            </div>
          </main>

          <footer className="shrink-0 border-t border-border bg-surface">
            {alleErfasst && !abgeschlossen && (
              <p
                role="status"
                className="mx-2 mt-2.5 flex items-center gap-2.5 rounded-ctl bg-confirm-soft px-4 py-3 text-sm font-semibold text-confirm-soft-on"
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-confirm" />
                Alle gezählt — Abschluss über „Liste“
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
function Kontrollzeile({ artikel, werte }: { artikel: ZaehlArtikel; werte: Zaehleingabe }) {
  let text: string | null
  try {
    text = kontrolltext(artikel, werte)
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
