'use client'

/**
 * „Zählung verwerfen“ mit Rückfrage an Ort und Stelle.
 *
 * Zwei Stufen statt eines Browser-Dialogs: die erste Fläche ist bewusst leise
 * (nur Text), die Rückfrage nennt den Preis („n gezählte Werte gehen
 * verloren“) und erst die rote Fläche tut es. Ein verirrter Daumen auf dem
 * Weg zu „Zählung fortsetzen“ kann so nichts anrichten.
 *
 * Vor dem Server wird der lokale Speicher der Zählung geleert: bliebe er
 * stehen, tauchten die verworfenen Werte beim nächsten Öffnen einer Maske mit
 * derselben Kennung wieder auf. Scheitert danach der Server, ist nichts
 * verloren — seine Werte kommen beim nächsten Seitenaufbau zurück.
 */

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
  const [fragt, setFragt] = useState(false)
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-sm text-danger-text">
        {gezaehlt === 0
          ? 'Die Zählung wird gelöscht.'
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
              try {
                await lokalVerwerfen(zaehlungId)
              } catch {
                // Kein IndexedDB: dann liegt lokal auch nichts, was wiederkäme.
              }
              await zaehlungVerwerfen(zaehlungId)
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
  )
}
