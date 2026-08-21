'use client'

/**
 * „Zählung verwerfen“ mit Rückfrage an Ort und Stelle.
 *
 * Zwei Stufen statt eines Browser-Dialogs: die erste Fläche ist bewusst leise
 * (nur Text), die Rückfrage nennt den Preis („n gezählte Werte gehen
 * verloren“) und erst die rote Fläche tut es. Ein verirrter Daumen auf dem
 * Weg zu „Zählung fortsetzen“ kann so nichts anrichten.
 *
 * Erst der Server, dann der lokale Speicher: scheitert der Server, ist nichts
 * angetastet — vorher lokal zu leeren hiesse, noch nicht gesendete Werte zu
 * vernichten, obwohl die Zählung weiterlebt. Erst nach dem Erfolg wird der
 * Speicher geleert, sonst tauchten die verworfenen Werte beim nächsten Öffnen
 * einer Maske mit derselben Kennung wieder auf.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { verwerfen as lokalVerwerfen } from '@/offline/db'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { zaehlungVerwerfen } from './aktionen'

export function ZaehlungVerwerfen({
  zaehlungId,
  gezaehlt,
}: {
  zaehlungId: string
  /** Wie viele Werte die Rückfrage als Preis nennt. */
  gezaehlt: number
}) {
  const router = useRouter()
  const [fragt, setFragt] = useState(false)
  const [fehler, setFehler] = useState(false)
  const [laeuft, starte] = useTransition()

  if (!fragt) {
    return (
      <button
        type="button"
        onClick={() => setFragt(true)}
        className="tap inline-flex min-h-tap items-center self-start rounded-ctl px-2 text-sm font-medium text-text-muted focus-visible:fokus"
      >
        Zählung verwerfen …
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-danger-text">
          {gezaehlt === 0
            ? 'Die Zählung wird verworfen.'
            : gezaehlt === 1
              ? '1 gezählter Wert geht verloren.'
              : `${gezaehlt} gezählte Werte gehen verloren.`}
        </p>
        <div className="flex items-center gap-tapgap">
          <Schaltflaeche
            art="sekundaer"
            rolle="danger"
            disabled={laeuft}
            onClick={() =>
              starte(async () => {
                setFehler(false)
                try {
                  await zaehlungVerwerfen(zaehlungId)
                } catch {
                  setFehler(true)
                  return
                }
                try {
                  await lokalVerwerfen(zaehlungId)
                } catch {
                  // Kein IndexedDB: dann liegt lokal auch nichts, was wiederkäme.
                }
                router.push('/')
              })
            }
          >
            {laeuft ? 'Wird verworfen …' : 'Ja, verwerfen'}
          </Schaltflaeche>
          <Schaltflaeche art="sekundaer" disabled={laeuft} onClick={() => setFragt(false)}>
            Behalten
          </Schaltflaeche>
        </div>
      </div>
      {fehler ? (
        <p className="text-sm text-danger-text" role="alert">
          Das Verwerfen hat nicht geklappt. Die Zählung und alle Werte sind unverändert.
        </p>
      ) : null}
    </div>
  )
}
