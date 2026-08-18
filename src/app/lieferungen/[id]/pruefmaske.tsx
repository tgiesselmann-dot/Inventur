'use client'

/**
 * Die Wareneingangskontrolle an der Rampe.
 *
 * Anders als die Zählmaske eine Liste und keine Fokusansicht — und zwar aus dem
 * gegenteiligen Grund: im Lager läuft der Zähler einen festen Weg ab und will
 * geführt werden, an der Rampe steht die Ware vor ihm und er sucht sich die
 * Zeile, die gerade dran ist. Der Lieferschein gibt die Reihenfolge vor, nicht
 * die App.
 *
 * Der ganze Entwurf hängt an der Vorbelegung: die tatsächliche Menge startet auf
 * dem Wert des Lieferscheins. Wer nichts anfasst, bestätigt damit das Papier.
 * Deshalb kostet eine fehlerfreie Lieferung zwei Berührungen — aufmachen,
 * bestätigen — und nur die Abweichung kostet Arbeit.
 *
 * Diese Datei hält den Zustand und den Verkehr mit dem Server; sie zeichnet nur
 * den Kopf, der über allen Ansichten steht. Die Ansichten liegen daneben im
 * selben Ordner und bekommen ihren Stand übergeben — der Zustand bleibt an
 * einer Stelle, sonst hätte eine Zeile bald zwei Wahrheiten. Auch die Belege
 * (Foto, Unterschrift) liegen deshalb hier: sie entstehen in zwei verschiedenen
 * Ansichten und müssen deren Wechsel überleben.
 *
 * Was hier NICHT steht: die Rechnung, wann eine Aufschlüsselung stimmig ist. Die
 * steht in src/lib/wareneingang.ts und wird vom Server mit denselben Funktionen
 * geprüft.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { alsDatumstext } from '@/lib/datum'
import {
  artikelSetzen,
  bilanzbetont,
  bilanztext,
  leergutzusammenfassung,
  umfangtext,
  vorbelegt,
  zusammenfassung,
  type Leergutzeile,
  type PruefPosition,
  type WareneingangArtikel,
} from '@/lib/wareneingang'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Vollbild } from '@/ui/vollbild'

import { Artikelsuche } from './artikelsuche'
import { Bestaetigung, type Beleg } from './bestaetigung'
import { Leergutmaske } from './leergutmaske'
import { Liste } from './liste'
import { Unterschrift } from './unterschrift'
import { Zeilenmaske } from './zeilenmaske'

type Props = {
  lieferungId: string
  lieferant: string
  belegNr: string
  datum: string
  geprueft: boolean
  fahrerName: string | null
  /**
   * Ob der Angemeldete Preise sehen darf (darfPreiseSehen in
   * src/lib/berechtigungen.ts). Ohne Preissicht kommen die Daten schon ohne
   * Einkaufspreise vom Server — dieses Flag lässt zusätzlich die Beträge und
   * Preisfelder aus den Ansichten verschwinden, statt überall "nicht
   * bewertbar" zu behaupten.
   */
  mitPreisen: boolean
  mitBestellung: boolean
  positionen: PruefPosition[]
  leergut: Leergutzeile[]
  stamm: WareneingangArtikel[]
}

/**
 * Ein gescheiterter Speicherversuch: die Meldung und das, was erneut zu senden
 * ist. Die Nutzlast liegt bei, damit „Erneut versuchen" genau den Stand
 * wiederholt, der gescheitert ist — nicht den, der inzwischen auf dem Schirm
 * steht.
 */
type Fehlversuch =
  | { text: string; art: 'position'; position: PruefPosition }
  | { text: string; art: 'leergut'; zeilen: Leergutzeile[] }
  | { text: string; art: 'abschluss' }

/** Was gerade bearbeitet wird: eine Zeile, oder die Suche nach einer neuen. */
type Ansicht =
  | { art: 'liste' }
  | { art: 'zeile'; id: string }
  | { art: 'leergut'; id: string }
  /** Suche für eine neue Position, oder — mit `ersetzt` — für einen Ersatzartikel. */
  | { art: 'suche'; ersetzt: string | null }
  | { art: 'bestaetigen' }
  | { art: 'unterschrift' }

export function Pruefmaske(props: Props) {
  const router = useRouter()
  const [positionen, setPositionen] = useState<PruefPosition[]>(props.positionen)
  const [leergut, setLeergut] = useState<Leergutzeile[]>(props.leergut)
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: 'liste' })
  const [geprueft, setGeprueft] = useState(props.geprueft)
  const [fehler, setFehler] = useState<Fehlversuch | null>(null)
  const [sendet, setSendet] = useState(false)
  /**
   * Die Belege des Abschlusses. Liegen hier und nicht in der Bestätigung, weil
   * die Unterschrift in einer eigenen Ansicht entsteht: beim Wechsel dorthin
   * wird die Bestätigung abgebaut, und mit ihr wäre das eben aufgenommene Foto
   * weg.
   */
  const [beleg, setBeleg] = useState<Beleg>({
    fahrer: props.fahrerName ?? '',
    foto: null,
    unterschrift: null,
  })

  const summe = useMemo(() => zusammenfassung(positionen), [positionen])
  const leergutSumme = useMemo(() => leergutzusammenfassung(leergut), [leergut])

  /**
   * Schickt den Stand einer Zeile zum Server. Die Maske wartet nicht darauf —
   * der Bildschirm ist schon weiter, wenn die Antwort kommt. Nur die Id einer
   * neu angelegten Zeile wird nachgetragen, damit die nächste Änderung dieselbe
   * Zeile trifft und keine zweite anlegt.
   */
  const senden = useCallback(
    async (position: PruefPosition) => {
      try {
        const antwort = await fetch(`/api/lieferung/${props.lieferungId}/positionen`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            positionen: [
              {
                id: position.id.startsWith('neu:') ? null : position.id,
                artikelId: position.artikel.id,
                // Muss mit, sonst räumt die Route den Bestellbezug ab und die
                // Spalte "bestellt" wäre nach dem nächsten Laden leer.
                bestellpositionId: position.bestellpositionId,
                lieferschein: position.lieferschein,
                tatsaechlich: position.tatsaechlich,
                ekPreisCentLieferschein: position.ekPreisCentLieferschein,
                nachlieferungZugesagtBis: position.nachlieferungZugesagtBis,
                abweichungen: position.abweichungen,
              },
            ],
          }),
        })
        const ergebnis = (await antwort.json()) as {
          gespeichert?: { artikelId: string; id: string }[]
          fehler?: string
        }
        if (!antwort.ok) {
          setFehler({
            art: 'position',
            position,
            text: ergebnis.fehler ?? 'Die Position konnte nicht gespeichert werden.',
          })
          return
        }
        setFehler(null)
        const vergeben = ergebnis.gespeichert?.[0]
        if (vergeben !== undefined && position.id.startsWith('neu:')) {
          setPositionen((bisher) =>
            bisher.map((zeile) => (zeile.id === position.id ? { ...zeile, id: vergeben.id } : zeile)),
          )
          // Die geöffnete Zeile zeigt noch auf die vorläufige Id. Ohne diesen
          // Nachzug fiele die Maske in dem Moment zur Liste zurück, in dem die
          // Antwort eintrifft — mitten in der Eingabe.
          setAnsicht((bisher) =>
            bisher.art === 'zeile' && bisher.id === position.id
              ? { art: 'zeile', id: vergeben.id }
              : bisher,
          )
        }
      } catch {
        setFehler({
          art: 'position',
          position,
          text: 'Ohne Netz lässt sich nichts speichern. Die Eingabe steht noch auf dem Gerät.',
        })
      }
    },
    [props.lieferungId],
  )

  const uebernehmen = useCallback(
    (neu: PruefPosition) => {
      setPositionen((bisher) => bisher.map((zeile) => (zeile.id === neu.id ? neu : zeile)))
      void senden(neu)
    },
    [senden],
  )

  /**
   * Schickt den Leergut-Block als Ganzes. Er ist kurz — meist zwei, drei Zeilen
   * — und eine gelöschte Zeile muss beim Server ankommen, ohne dass die Maske
   * Löschbefehle nachhalten muss.
   */
  const leergutSenden = useCallback(
    async (zeilen: Leergutzeile[]) => {
      try {
        const antwort = await fetch(`/api/lieferung/${props.lieferungId}/positionen`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            positionen: [],
            leergut: zeilen.map((zeile) => ({
              bezeichnung: zeile.bezeichnung,
              lieferschein: zeile.lieferschein,
              tatsaechlich: zeile.tatsaechlich,
              pfandCentJeEinheit: zeile.pfandCentJeEinheit,
            })),
          }),
        })
        if (!antwort.ok) {
          const ergebnis = (await antwort.json()) as { fehler?: string }
          setFehler({
            art: 'leergut',
            zeilen,
            text: ergebnis.fehler ?? 'Das Leergut konnte nicht gespeichert werden.',
          })
          return
        }
        setFehler(null)
      } catch {
        setFehler({
          art: 'leergut',
          zeilen,
          text: 'Ohne Netz lässt sich nichts speichern. Die Eingabe steht noch auf dem Gerät.',
        })
      }
    },
    [props.lieferungId],
  )

  // Nur vollständige Zeilen gehen zum Server — eine noch namenlose Zeile
  // würde er zu Recht zurückweisen. Sie bleibt auf dem Gerät stehen und
  // sperrt den Abschluss, bis sie einen Namen hat oder verschwindet.
  //
  // Gesendet wird ausserhalb des setLeergut-Updaters: der Updater läuft im
  // StrictMode doppelt, und zwei gleichzeitige Sends desselben Blocks legen
  // beim Ersetzen (löschen + neu anlegen) jede Zeile zweimal an.
  const leergutAendern = useCallback(
    (neu: Leergutzeile) => {
      const zeilen = leergut.map((zeile) => (zeile.id === neu.id ? neu : zeile))
      setLeergut(zeilen)
      void leergutSenden(zeilen.filter((zeile) => zeile.bezeichnung.trim() !== ''))
    },
    [leergut, leergutSenden],
  )

  /** Legt eine leere Leergutzeile an und öffnet gleich ihre Maske. */
  const leergutNeu = useCallback(() => {
    const neu: Leergutzeile = {
      id: `neu:leergut:${Date.now()}`,
      bezeichnung: '',
      lieferschein: '0',
      tatsaechlich: '0',
      pfandCentJeEinheit: null,
    }
    setLeergut((bisher) => [...bisher, neu])
    setAnsicht({ art: 'leergut', id: neu.id })
  }, [])

  const leergutEntfernen = useCallback(
    (id: string) => {
      const zeilen = leergut.filter((zeile) => zeile.id !== id)
      setLeergut(zeilen)
      void leergutSenden(zeilen.filter((zeile) => zeile.bezeichnung.trim() !== ''))
      setAnsicht({ art: 'liste' })
    },
    [leergut, leergutSenden],
  )

  /**
   * Übernimmt einen Artikel aus der Suche — entweder als neue Zeile oder als
   * Ersatz für den bestellten Artikel einer vorhandenen.
   */
  const ausSuche = useCallback(
    (artikel: WareneingangArtikel, ersetzt: string | null) => {
      if (ersetzt !== null) {
        setPositionen((bisher) => {
          const zeile = bisher.find((eintrag) => eintrag.id === ersetzt)
          if (zeile === undefined) return bisher
          const neu = artikelSetzen(zeile, artikel)
          void senden(neu)
          return bisher.map((eintrag) => (eintrag.id === ersetzt ? neu : eintrag))
        })
        setAnsicht({ art: 'zeile', id: ersetzt })
        return
      }

      const neu = vorbelegt({
        // Bis der Server eine Id vergeben hat, trägt die Zeile eine eigene. Das
        // Präfix macht sie beim Senden als "noch nicht angelegt" erkennbar.
        id: `neu:${artikel.id}:${Date.now()}`,
        artikel,
        bestellt: null,
        lieferschein: '0',
      })
      setPositionen((bisher) => [...bisher, neu])
      setAnsicht({ art: 'zeile', id: neu.id })
      void senden(neu)
    },
    [senden],
  )

  async function bestaetigen() {
    setSendet(true)
    try {
      // FormData statt JSON: die Belege gehen als Dateien mit. Keinen eigenen
      // content-type-Header setzen — die Multipart-Grenze kennt nur fetch.
      const daten = new FormData()
      if (beleg.fahrer.trim() !== '') daten.append('fahrerName', beleg.fahrer.trim())
      if (beleg.unterschrift !== null) {
        daten.append('unterschrift', beleg.unterschrift, 'unterschrift.png')
      }
      if (beleg.foto !== null) daten.append('foto', beleg.foto, 'lieferschein.jpg')

      const antwort = await fetch(`/api/lieferung/${props.lieferungId}/abschluss`, {
        method: 'POST',
        body: daten,
      })
      if (antwort.ok) {
        setGeprueft(true)
        setFehler(null)
        // Preisabweichungen werden nicht an der Rampe entschieden — der
        // Nachbildschirm übernimmt, sobald der Fahrer abgefertigt ist. Ohne
        // Preissicht gibt es weder Preisabweichungen noch den Bildschirm.
        if (props.mitPreisen && summe.preisabweichungen > 0) {
          router.push(`/lieferungen/${props.lieferungId}/preise`)
          return
        }
        setAnsicht({ art: 'liste' })
        return
      }
      const ergebnis = (await antwort.json()) as { fehler?: string }
      setFehler({
        art: 'abschluss',
        text: ergebnis.fehler ?? 'Der Wareneingang konnte nicht bestätigt werden.',
      })
    } catch {
      setFehler({ art: 'abschluss', text: 'Ohne Netz lässt sich der Wareneingang nicht bestätigen.' })
    } finally {
      setSendet(false)
    }
  }

  /** Wiederholt genau den Versuch, der gescheitert ist. */
  function erneutVersuchen() {
    if (fehler === null) return
    if (fehler.art === 'position') void senden(fehler.position)
    else if (fehler.art === 'leergut') void leergutSenden(fehler.zeilen)
    else void bestaetigen()
  }

  // Beim Ansichtswechsel verfällt die Meldung: wer die Zeile verlässt, hat sie
  // gesehen. Ohne Verfall stünde "Ohne Netz …" noch über der Liste, wenn das
  // Netz längst zurück ist. Zurückgesetzt wird beim Rendern über den
  // Schlüsselvergleich, nicht in einem Effect — ein danach eintreffender
  // Fehler bleibt stehen.
  const ansichtsschluessel = `${ansicht.art}:${'id' in ansicht ? ansicht.id : ''}`
  const [gesehen, setGesehen] = useState(ansichtsschluessel)
  if (gesehen !== ansichtsschluessel) {
    setGesehen(ansichtsschluessel)
    setFehler(null)
  }

  const offeneZeile = ansicht.art === 'zeile' ? positionen.find((z) => z.id === ansicht.id) : undefined
  const offenesLeergut =
    ansicht.art === 'leergut' ? leergut.find((z) => z.id === ansicht.id) : undefined

  return (
    <Vollbild>
      {/* Der Kopf steht über allen Ansichten: welcher Beleg, welcher Tag, und
          rechts das Ergebnis des ganzen Bildschirms in einer Zeile. */}
      <header className="shrink-0 border-b border-border bg-surface px-4 pt-2 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Ohne truncate: die Beleg-Nummer ist die Kennung des Papiers, das
                hier geprüft wird. Lieber zwei Zeilen als eine abgeschnittene
                Nummer — bei langen Lieferantennamen ist das der Regelfall. */}
            <p className="text-zeile font-semibold">
              {props.lieferant} ·{' '}
              {/* Wort und Nummer bleiben zusammen — der Umbruch gehört zwischen
                  Lieferant und Beleg, nicht mitten in die Kennung. */}
              <span className="whitespace-nowrap">
                Beleg <span className="font-mono font-normal tracking-normal">{props.belegNr}</span>
              </span>
            </p>
            <p className="text-sm text-text-muted">
              {alsDatumstext(new Date(`${props.datum}T00:00:00Z`))}
              {geprueft && ' · bestätigt'}
              {props.fahrerName !== null && ` · ${props.fahrerName}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold">{umfangtext(summe, leergutSumme)}</p>
            {/* Rot nur, wo Geld fehlt — die Farbe steht nicht allein, der Satz
                nennt Zahl und Betrag samt offenem Leergut-Pfand. */}
            <p
              className={`text-sm ${
                bilanzbetont(summe, leergutSumme) ? 'text-danger-text' : 'text-text-muted'
              }`}
            >
              {bilanztext(summe, leergutSumme, props.mitPreisen)}
            </p>
          </div>
        </div>
      </header>

      {fehler !== null && (
        <div className="shrink-0 p-2">
          <Hinweisleiste
            rolle="attention"
            titel={fehler.text}
            aktion={
              <button
                type="button"
                onClick={erneutVersuchen}
                className="tap flex h-tap w-full shrink-0 items-center justify-center rounded-ctl border border-attention bg-surface px-4 text-sm font-semibold text-attention-text focus-visible:fokus sm:w-auto"
              >
                Erneut versuchen
              </button>
            }
          />
        </div>
      )}

      {offeneZeile !== undefined ? (
        <Zeilenmaske
          key={offeneZeile.id}
          position={offeneZeile}
          mitPreisen={props.mitPreisen}
          mitBestellung={props.mitBestellung}
          gesperrt={geprueft}
          aufFertig={() => setAnsicht({ art: 'liste' })}
          aufAendern={uebernehmen}
          aufErsatzartikel={() => setAnsicht({ art: 'suche', ersetzt: offeneZeile.id })}
        />
      ) : offenesLeergut !== undefined ? (
        <Leergutmaske
          key={offenesLeergut.id}
          zeile={offenesLeergut}
          gesperrt={geprueft}
          aufFertig={() => setAnsicht({ art: 'liste' })}
          aufAendern={leergutAendern}
          aufEntfernen={() => leergutEntfernen(offenesLeergut.id)}
        />
      ) : ansicht.art === 'suche' ? (
        <Artikelsuche
          stamm={props.stamm}
          bereitsErfasst={new Set(positionen.map((zeile) => zeile.artikel.id))}
          ersetzt={ansicht.ersetzt}
          aufAbbruch={() =>
            setAnsicht(
              ansicht.ersetzt === null
                ? { art: 'liste' }
                : { art: 'zeile', id: ansicht.ersetzt },
            )
          }
          aufWahl={(artikel) => ausSuche(artikel, ansicht.ersetzt)}
        />
      ) : ansicht.art === 'unterschrift' ? (
        <Unterschrift
          aufAbbruch={() => setAnsicht({ art: 'bestaetigen' })}
          aufUebernehmen={(unterschrift) => {
            setBeleg((bisher) => ({ ...bisher, unterschrift }))
            setAnsicht({ art: 'bestaetigen' })
          }}
        />
      ) : ansicht.art === 'bestaetigen' ? (
        <Bestaetigung
          summe={summe}
          leergut={leergutSumme}
          mitPreisen={props.mitPreisen}
          beleg={beleg}
          sendet={sendet}
          aufBeleg={setBeleg}
          aufUnterschreiben={() => setAnsicht({ art: 'unterschrift' })}
          aufAbbruch={() => setAnsicht({ art: 'liste' })}
          aufBestaetigen={() => void bestaetigen()}
        />
      ) : (
        <Liste
          positionen={positionen}
          leergut={leergut}
          mitPreisen={props.mitPreisen}
          mitBestellung={props.mitBestellung}
          geprueft={geprueft}
          summe={summe}
          leergutSumme={leergutSumme}
          aufZeile={(id) => setAnsicht({ art: 'zeile', id })}
          aufSuche={() => setAnsicht({ art: 'suche', ersetzt: null })}
          aufLeergutZeile={(id) => setAnsicht({ art: 'leergut', id })}
          aufLeergutNeu={leergutNeu}
          aufBestaetigen={() => setAnsicht({ art: 'bestaetigen' })}
        />
      )}
    </Vollbild>
  )
}
