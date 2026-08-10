'use client'

/**
 * Die Erfassung einer Lieferung am Lieferschein entlang — Zustand und Verkehr
 * mit dem Server.
 *
 * Anders als die Prüfmaske nebenan fragt diese Maske nur eine Zahl je Zeile:
 * was auf dem Papier steht. Die Zeilen sind trotzdem volle Prüfpositionen und
 * laufen durch `vorbelegt` und `lieferscheinSetzen` aus src/lib/wareneingang.ts
 * — damit gilt auch hier die Regel, dass die tatsächliche Menge dem
 * Lieferschein folgt, solange niemand sie eigens angefasst hat, und eine Zeile
 * mit bereits erfassten Abweichungen wird beim Nachbessern nicht überschrieben.
 *
 * Desktop und Telefon sind zwei Fassungen derselben Erfassung: die
 * Tabellenfassung für die Tastatur (Artikel, Enter, Anzahl, Enter), die
 * Fokusfassung für den Daumen mit dem Ziffernblock der Zählmaske. Der Zustand
 * steht hier und nur hier — beide Fassungen bekommen ihn übergeben, sonst hätte
 * eine Zeile bald zwei Wahrheiten.
 *
 * Gespeichert wird je abgelegter Zeile über die Stapel-Route der Prüfmaske;
 * "Lieferung speichern" schliesst nichts ab, sondern führt zurück zur
 * Übersicht. Der Abschluss mit Fahrer und Unterschrift bleibt die Sache der
 * Wareneingangskontrolle.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import {
  erfassungssumme,
  lieferscheinSetzen,
  vorbelegt,
  type ErfassungsArtikel,
  type ErfassungsPosition,
} from '@/lib/wareneingang'
import { dezimaltext } from '@/lib/zaehlung'
import { Vollbild } from '@/ui/vollbild'

import { Fokuserfassung, type FokusAnsicht } from './fokuserfassung'
import { Tabellenerfassung } from './tabellenerfassung'

type Props = {
  lieferungId: string
  lieferant: string
  belegNr: string
  /** Lieferdatum als ISO-Text. */
  datum: string
  positionen: ErfassungsPosition[]
  stamm: ErfassungsArtikel[]
}

export function Erfassungsmaske(props: Props) {
  const router = useRouter()
  const [zeilen, setZeilen] = useState<ErfassungsPosition[]>(props.positionen)
  /**
   * Ein gescheiterter Speicherversuch samt der Zeile, die er tragen sollte —
   * „Erneut versuchen" wiederholt genau diesen Stand, nicht den inzwischen
   * sichtbaren.
   */
  const [fehler, setFehler] = useState<{ text: string; position: ErfassungsPosition } | null>(null)
  /**
   * Die Ansicht der Fokusfassung steht beim Zustand und nicht in der Fassung
   * selbst: wenn der Server einer neuen Zeile ihre Id vergibt, muss auch eine
   * gerade geöffnete Zeile die neue Id erfahren — sonst fiele die Maske mitten
   * in der Eingabe zur Liste zurück.
   */
  const [ansicht, setAnsicht] = useState<FokusAnsicht>(() =>
    props.positionen.length === 0 ? { art: 'suche' } : { art: 'liste' },
  )

  const summe = useMemo(() => erfassungssumme(zeilen), [zeilen])

  /**
   * Schickt den Stand einer Zeile zum Server — dieselbe Route und derselbe
   * Rumpf wie in der Prüfmaske. Die Maske wartet nicht auf die Antwort; nur die
   * Id einer neu angelegten Zeile wird nachgetragen, damit die nächste Änderung
   * dieselbe Zeile trifft und keine zweite anlegt.
   */
  const senden = useCallback(
    async (position: ErfassungsPosition) => {
      try {
        const antwort = await fetch(`/api/lieferung/${props.lieferungId}/positionen`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            positionen: [
              {
                id: position.id.startsWith('neu:') ? null : position.id,
                artikelId: position.artikel.id,
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
            position,
            text: ergebnis.fehler ?? 'Die Position konnte nicht gespeichert werden.',
          })
          return
        }
        setFehler(null)
        const vergeben = ergebnis.gespeichert?.[0]
        if (vergeben !== undefined && position.id.startsWith('neu:')) {
          setZeilen((bisher) =>
            bisher.map((zeile) => (zeile.id === position.id ? { ...zeile, id: vergeben.id } : zeile)),
          )
          setAnsicht((bisher) =>
            bisher.art === 'zeile' && bisher.id === position.id
              ? { art: 'zeile', id: vergeben.id }
              : bisher,
          )
        }
      } catch {
        setFehler({
          position,
          text: 'Ohne Netz lässt sich nichts speichern. Die Eingabe steht noch auf dem Gerät.',
        })
      }
    },
    [props.lieferungId],
  )

  /**
   * Legt eine fertige Zeile ab. Angelegt wird erst hier und nicht schon bei der
   * Artikelwahl: eine abgebrochene Suche soll auf dem Server keine Zeile mit
   * null Gebinden hinterlassen, die niemand mehr löschen kann.
   */
  const anlegen = useCallback(
    (artikel: ErfassungsArtikel, anzahl: string) => {
      const neu: ErfassungsPosition = {
        // Bis der Server eine Id vergeben hat, trägt die Zeile eine eigene. Das
        // Präfix macht sie beim Senden als "noch nicht angelegt" erkennbar.
        ...vorbelegt({
          id: `neu:${artikel.id}:${Date.now()}`,
          artikel,
          bestellt: null,
          lieferschein: dezimaltext(anzahl),
        }),
        // vorbelegt gibt den Artikel unverändert zurück, weiss aber nichts von
        // der Literangabe der Erfassung — hier bekommt die Zeile ihren Typ.
        artikel,
      }
      setZeilen((bisher) => [...bisher, neu])
      void senden(neu)
    },
    [senden],
  )

  /** Setzt die Menge einer erfassten Zeile neu und schickt sie zum Server. */
  const aendern = useCallback(
    (id: string, anzahl: string) => {
      const zeile = zeilen.find((eintrag) => eintrag.id === id)
      if (zeile === undefined) return
      const neu: ErfassungsPosition = { ...lieferscheinSetzen(zeile, anzahl), artikel: zeile.artikel }
      setZeilen((bisher) => bisher.map((eintrag) => (eintrag.id === id ? neu : eintrag)))
      void senden(neu)
    },
    [senden, zeilen],
  )

  /**
   * Jede abgelegte Zeile ist bereits unterwegs oder gespeichert — zu tun bleibt
   * nur der Weg zurück. Ein noch nicht abgelegter Entwurf bleibt Entwurf: die
   * Taste sagt "Lieferung speichern", nicht "halbe Zeilen raten".
   */
  const speichern = useCallback(() => {
    router.push('/lieferungen')
  }, [router])

  /** Wiederholt genau den Versuch, der gescheitert ist. */
  const erneutVersuchen = useCallback(() => {
    if (fehler !== null) void senden(fehler.position)
  }, [fehler, senden])

  // Beim Ansichtswechsel der Fokusfassung verfällt die Meldung: wer
  // weiterblättert, hat sie gesehen. Zurückgesetzt wird beim Rendern über den
  // Schlüsselvergleich, nicht in einem Effect — ein danach eintreffender
  // Fehler bleibt stehen.
  const ansichtsschluessel = `${ansicht.art}:${ansicht.art === 'zeile' ? ansicht.id : ''}`
  const [gesehen, setGesehen] = useState(ansichtsschluessel)
  if (gesehen !== ansichtsschluessel) {
    setGesehen(ansichtsschluessel)
    setFehler(null)
  }

  return (
    <Vollbild>
      {/* Beide Fassungen sind gebaut, sichtbar ist eine: display:none nimmt der
          verborgenen auch Fokus und Tab-Reihenfolge. Die Fassungen fokussieren
          ihre Felder deshalb nur, wenn sie tatsächlich auf dem Schirm stehen. */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <Tabellenerfassung
          lieferant={props.lieferant}
          belegNr={props.belegNr}
          datum={props.datum}
          zeilen={zeilen}
          stamm={props.stamm}
          summe={summe}
          fehler={fehler?.text ?? null}
          aufErneut={erneutVersuchen}
          aufAnlegen={anlegen}
          aufAendern={aendern}
          aufSpeichern={speichern}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <Fokuserfassung
          lieferant={props.lieferant}
          belegNr={props.belegNr}
          datum={props.datum}
          zeilen={zeilen}
          stamm={props.stamm}
          summe={summe}
          fehler={fehler?.text ?? null}
          aufErneut={erneutVersuchen}
          ansicht={ansicht}
          aufAnsicht={setAnsicht}
          aufAnlegen={anlegen}
          aufAendern={aendern}
          aufSpeichern={speichern}
        />
      </div>
    </Vollbild>
  )
}
