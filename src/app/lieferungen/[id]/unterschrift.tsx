'use client'

/**
 * Die Vollbild-Zeichenfläche für die Unterschrift des Fahrers.
 *
 * Vollbild, weil eine Unterschrift Platz braucht: auf einer Briefmarke
 * unterschreibt niemand so, dass es später vor einem Lieferanten Bestand hat.
 * Das Telefon wird dem Fahrer hingehalten, er zeichnet mit dem Finger.
 *
 * Die Fläche ist Papier und bleibt es auch im Dunkelmodus: weisser Grund,
 * dunkle Tinte, direkt in die Canvas-Pixel gezeichnet. Der Beleg wird später
 * neben echten Lieferscheinen liegen — ein Thema hat er nicht.
 *
 * Bewusst ohne Test: reine Browser-Zeichenarbeit (Pointer Events, Canvas),
 * keine Geschäftszahl. Das Projekt testet src/lib.
 */

import { useEffect, useRef, useState } from 'react'

import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss } from '@/ui/vollbild'

/** Papier und Tinte des Belegs — Dokumentfarben, kein Thema der Oberfläche. */
const PAPIER = '#ffffff'
const TINTE = '#1a2433'

export function Unterschrift({
  aufAbbruch,
  aufUebernehmen,
}: {
  aufAbbruch: () => void
  /** Bekommt die fertige Zeichnung als PNG. */
  aufUebernehmen: (unterschrift: Blob) => void
}) {
  const flaeche = useRef<HTMLCanvasElement>(null)
  const zeichnet = useRef(false)
  const [gezeichnet, setGezeichnet] = useState(false)

  useEffect(() => {
    const canvas = flaeche.current
    if (canvas === null) return

    // Die Canvas-Pixel folgen der Gerätedichte, sonst ist der Strich auf jedem
    // Retina-Bildschirm verwaschen — und verwaschen unterschreibt es sich
    // schlecht.
    const mass = canvas.getBoundingClientRect()
    const dichte = window.devicePixelRatio || 1
    canvas.width = Math.round(mass.width * dichte)
    canvas.height = Math.round(mass.height * dichte)

    const kontext = canvas.getContext('2d')
    if (kontext === null) return
    kontext.scale(dichte, dichte)
    kontext.fillStyle = PAPIER
    kontext.fillRect(0, 0, mass.width, mass.height)
    kontext.strokeStyle = TINTE
    kontext.lineWidth = 2.5
    kontext.lineCap = 'round'
    kontext.lineJoin = 'round'
  }, [])

  function ort(ereignis: React.PointerEvent<HTMLCanvasElement>) {
    const mass = ereignis.currentTarget.getBoundingClientRect()
    return { x: ereignis.clientX - mass.left, y: ereignis.clientY - mass.top }
  }

  function beginnt(ereignis: React.PointerEvent<HTMLCanvasElement>) {
    const kontext = ereignis.currentTarget.getContext('2d')
    if (kontext === null) return
    // Capture hält den Strich auch dann, wenn der Finger über den Rand
    // hinausfährt — mitten in der Unterschrift abzureissen wäre der Normalfall.
    ereignis.currentTarget.setPointerCapture(ereignis.pointerId)
    const { x, y } = ort(ereignis)
    kontext.beginPath()
    kontext.moveTo(x, y)
    // Der Punkt zählt schon als Strich: auch ein kurzes Kürzel ist eine
    // Unterschrift.
    kontext.lineTo(x + 0.1, y + 0.1)
    kontext.stroke()
    zeichnet.current = true
    setGezeichnet(true)
  }

  function zieht(ereignis: React.PointerEvent<HTMLCanvasElement>) {
    if (!zeichnet.current) return
    const kontext = ereignis.currentTarget.getContext('2d')
    if (kontext === null) return
    const { x, y } = ort(ereignis)
    kontext.lineTo(x, y)
    kontext.stroke()
  }

  function endet() {
    zeichnet.current = false
  }

  function nochmal() {
    const canvas = flaeche.current
    if (canvas === null) return
    const kontext = canvas.getContext('2d')
    if (kontext === null) return
    const mass = canvas.getBoundingClientRect()
    kontext.fillStyle = PAPIER
    kontext.fillRect(0, 0, mass.width, mass.height)
    kontext.strokeStyle = TINTE
    setGezeichnet(false)
  }

  function uebernehmen() {
    const canvas = flaeche.current
    if (canvas === null) return
    canvas.toBlob((blob) => {
      // toBlob darf null liefern — dann bleibt die Maske offen, statt eine
      // Unterschrift zu behaupten, die es nicht gibt.
      if (blob !== null) aufUebernehmen(blob)
    }, 'image/png')
  }

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="shrink-0">
          <h1 className="text-titel">Unterschrift des Fahrers</h1>
          <p className="mt-1 text-base text-text-muted">
            Gegenzeichnung der Abweichungen auf diesem Lieferschein.
          </p>
        </div>

        {/* touch-none ist hier Pflicht: ohne sie scrollt die Seite unter dem
            Finger weg, statt einen Strich zu ziehen. */}
        <canvas
          ref={flaeche}
          onPointerDown={beginnt}
          onPointerMove={zieht}
          onPointerUp={endet}
          onPointerCancel={endet}
          aria-label="Zeichenfläche für die Unterschrift"
          className="mt-3 min-h-0 w-full flex-1 touch-none rounded-ctl border border-border-strong"
        />
      </main>

      <Maskenfuss>
        {!gezeichnet && (
          <p className="px-2 pb-2 text-center text-sm text-text-muted">
            Noch nichts gezeichnet — erst auf der Fläche unterschreiben.
          </p>
        )}
        <div className="flex gap-tapgap">
          <div className="flex-1">
            <Schaltflaeche art="sekundaer" breit disabled={!gezeichnet} onClick={nochmal}>
              nochmal
            </Schaltflaeche>
          </div>
          <div className="flex-2">
            <Schaltflaeche breit gross rolle="confirm" disabled={!gezeichnet} onClick={uebernehmen}>
              übernehmen
            </Schaltflaeche>
          </div>
        </div>
        <div className="mt-2">
          <Schaltflaeche art="sekundaer" breit onClick={aufAbbruch}>
            Zurück ohne Unterschrift
          </Schaltflaeche>
        </div>
      </Maskenfuss>
    </>
  )
}
