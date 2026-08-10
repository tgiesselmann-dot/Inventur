'use client'

/**
 * „Lager löschen“ mit Rückfrage an Ort und Stelle — dasselbe zweistufige
 * Muster wie beim Verwerfen einer Zählung.
 *
 * Die Fläche steht nur an Orten, an denen nie gezählt wurde; mehr als der
 * Vertipper beim Anlegen kann hier also nicht verlorengehen. Die Rückfrage
 * steht trotzdem: die Fläche liegt zwischen „Speichern" und „Stilllegen", und
 * ein verirrter Daumen soll nichts entfernen.
 */

import { useState, useTransition } from 'react'

import { Schaltflaeche } from '@/ui/schaltflaeche'

import { lagerortLoeschen } from './aktionen'

export function LagerortLoeschen({ id, name }: { id: string; name: string }) {
  const [fragt, setFragt] = useState(false)
  const [laeuft, starte] = useTransition()

  if (!fragt) {
    return (
      <button
        type="button"
        onClick={() => setFragt(true)}
        className="tap inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium text-text-muted focus-visible:fokus"
      >
        Löschen …
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="text-sm text-danger-text">„{name}&ldquo; wird entfernt.</p>
      <div className="flex items-center gap-tapgap">
        <Schaltflaeche
          art="sekundaer"
          rolle="danger"
          disabled={laeuft}
          onClick={() =>
            starte(async () => {
              const formular = new FormData()
              formular.set('id', id)
              await lagerortLoeschen(formular)
            })
          }
        >
          {laeuft ? 'Wird gelöscht …' : 'Ja, löschen'}
        </Schaltflaeche>
        <Schaltflaeche art="sekundaer" disabled={laeuft} onClick={() => setFragt(false)}>
          Behalten
        </Schaltflaeche>
      </div>
    </div>
  )
}
