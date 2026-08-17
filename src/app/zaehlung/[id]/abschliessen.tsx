'use client'

/**
 * „Zählung abschliessen" aus der Ortswahl heraus.
 *
 * Der Abschluss sitzt hier und nicht mehr in der Zählmaske: eine Maske kennt
 * nur ihr eigenes Lager, und ob die anderen drei fertig sind, ist von dort aus
 * nicht zu sehen. Die Ortswahl sieht alle vier.
 *
 * Die Fläche steht nur, wenn jedes aktive Lager fertig gemeldet ist — die Seite
 * entscheidet das, nicht diese Komponente. Der Server prüft es trotzdem noch
 * einmal: zwischen dem Aufbau dieser Seite und dem Tippen kann jemand anders
 * ein Lager angelegt haben.
 *
 * Bleibt die Antwort trotzdem ablehnend, steht der Grund hier — und zwar der
 * genaue: welche Lager offen sind oder welche Artikel nirgends einen Wert
 * haben. „Hat nicht geklappt" wäre die Sorte Meldung, wegen der jemand die
 * Zählung von vorn beginnt.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { offeneWerte } from '@/offline/verwenden'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Schaltflaeche } from '@/ui/schaltflaeche'

type Ablehnung = {
  offeneLager: { id: string; name: string }[]
  fehlend: { id: string; name: string }[]
}

export function ZaehlungAbschliessen({
  zaehlungId,
  lagerorte,
}: {
  zaehlungId: string
  /** Die aktiven Lager samt Namen — um zu sagen, wo liegengebliebene Werte herkommen. */
  lagerorte: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [laeuft, starte] = useTransition()
  const [abgelehnt, setAbgelehnt] = useState<Ablehnung | null>(null)
  const [gescheitert, setGescheitert] = useState(false)
  /** Was noch ungesendet auf diesem Gerät liegt, je Lagerort — oder `null`. */
  const [aufGeraet, setAufGeraet] = useState<ReadonlyMap<string, number> | null>(null)

  function abschliessen() {
    starte(async () => {
      setAbgelehnt(null)
      setGescheitert(false)
      setAufGeraet(null)

      // Die Gerätewarteschlange sieht nur der Client — der Server kann sie
      // nicht prüfen. Ein Abschluss über liegengebliebene Werte hinweg sperrt
      // sie aus (POST …/positionen lehnt bei ABGESCHLOSSEN mit 409 ab) und
      // zeigt in der Auswertung Schwund, der keiner ist. Nur dieses Gerät:
      // was auf dem Handy des zweiten Zählers liegt, hält dort dessen eigene
      // Fertigmeldung auf.
      const offen = await offeneWerte(zaehlungId)
      if (offen.size > 0) {
        setAufGeraet(offen)
        return
      }

      try {
        const antwort = await fetch(`/api/zaehlung/${zaehlungId}/abschluss`, { method: 'POST' })
        if (antwort.ok) {
          router.push(`/zaehlung/${zaehlungId}/abschluss`)
          return
        }
        if (antwort.status === 409) {
          const ergebnis = (await antwort.json()) as Ablehnung
          setAbgelehnt({
            offeneLager: ergebnis.offeneLager ?? [],
            fehlend: ergebnis.fehlend ?? [],
          })
          return
        }
        setGescheitert(true)
      } catch {
        // Ohne Netz lässt sich nicht abschliessen.
        setGescheitert(true)
      }
    })
  }

  const offenAufGeraet =
    aufGeraet === null ? 0 : [...aufGeraet.values()].reduce((summe, zahl) => summe + zahl, 0)
  const offeneOrte =
    aufGeraet === null
      ? []
      : lagerorte.filter((ort) => aufGeraet.has(ort.id)).map((ort) => ort.name)

  return (
    <div className="flex flex-col gap-tapgap">
      {aufGeraet !== null && (
        <Hinweisleiste
          rolle="attention"
          titel={
            offenAufGeraet === 1
              ? '1 Wert liegt noch ungesendet auf diesem Gerät'
              : `${offenAufGeraet} Werte liegen noch ungesendet auf diesem Gerät`
          }
        >
          {offeneOrte.length > 0 && <>Aus: {offeneOrte.join(', ')}. </>}
          Öffnen Sie das Lager, damit die Werte gesendet werden — abschliessen klappt danach.
        </Hinweisleiste>
      )}
      {abgelehnt !== null && abgelehnt.offeneLager.length > 0 && (
        <Hinweisleiste rolle="attention" titel="Es sind noch nicht alle Lager fertig gemeldet">
          Offen: {abgelehnt.offeneLager.map((ort) => ort.name).join(', ')}.
        </Hinweisleiste>
      )}
      {abgelehnt !== null && abgelehnt.offeneLager.length === 0 && abgelehnt.fehlend.length > 0 && (
        <Hinweisleiste
          rolle="attention"
          titel={
            abgelehnt.fehlend.length === 1
              ? '1 Artikel hat in keinem Lager einen Wert'
              : `${abgelehnt.fehlend.length} Artikel haben in keinem Lager einen Wert`
          }
        >
          {abgelehnt.fehlend
            .slice(0, 8)
            .map((eintrag) => eintrag.name)
            .join(', ')}
          {abgelehnt.fehlend.length > 8 && ' …'}
        </Hinweisleiste>
      )}
      {gescheitert && (
        <Hinweisleiste rolle="attention" titel="Der Abschluss hat nicht geklappt.">
          Sobald wieder Netz da ist, erneut versuchen.
        </Hinweisleiste>
      )}

      <Schaltflaeche breit rolle="confirm" disabled={laeuft} onClick={abschliessen}>
        {laeuft ? 'Wird abgeschlossen…' : 'Zählung abschliessen'}
      </Schaltflaeche>
    </div>
  )
}
