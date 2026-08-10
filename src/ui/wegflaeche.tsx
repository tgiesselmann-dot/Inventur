/**
 * Der Weg in Schaltflächen-Fassung: ein Link, der aussieht wie die eine
 * Schaltfläche — für den Schritt, der nur woandershin führt.
 *
 * Ein eigener Baustein und keine `Schaltflaeche` mit Link darin: ein Knopf,
 * der navigiert, nimmt dem Browser das Öffnen in einem neuen Tab und der
 * Sprachausgabe die Auskunft, wohin es geht.
 *
 * Neun Masken bauten diese Fassung einzeln nach, mit driftenden Details; vier
 * davon ohne Fokusring — genau das Auseinanderlaufen, vor dem
 * schaltflaeche.tsx warnt. Hier steht die Fassung genau einmal.
 *
 * `flaechenfassung` liegt in dieser Datei und nicht in schaltflaeche.tsx, weil
 * die Schaltfläche ein Client-Baustein ist und der Weg serverfähig bleiben
 * muss: aus einem Client-Modul kann eine Server-Maske nichts aufrufen. Die
 * Schaltfläche nimmt sich die Fassung von hier — andersherum ginge es nicht.
 */

import Link from 'next/link'
import type { ComponentPropsWithoutRef } from 'react'

import { ROLLEN, type Vollrolle } from './rollen'

export type Flaechenfassung = {
  /** Gefüllt in der Rollenfarbe oder umrandet — sekundär in der Rollenfarbe nur, wenn eine gesetzt ist. */
  art?: 'primaer' | 'sekundaer'
  rolle?: Vollrolle
  /** Volle Breite — die Form für den Fuss einer Maske. */
  breit?: boolean
  /**
   * 60 statt 56 px. Für die eine Fläche, die einen Vorgang abschliesst und
   * dabei neben einer zweiten steht: sie darf schwerer wiegen als das "Zurück"
   * darunter. Eine Eigenschaft und keine zweite Fläche — vier Punkte sind kein
   * Grund für ein zweites Bauteil.
   */
  gross?: boolean
}

/** Die eine Klassenzeile für Schaltfläche und Wegfläche. */
export function flaechenfassung({
  art = 'primaer',
  rolle = 'primary',
  breit = false,
  gross = false,
}: Flaechenfassung): string {
  const farbe =
    art === 'primaer'
      ? `${ROLLEN[rolle].voll} font-semibold`
      : rolle === 'primary'
        ? 'border border-border-strong bg-surface text-text'
        : // Die sekundäre Art in einer Rolle: umrandet statt gefüllt, für den
          // Weg aus einer Hinweisleiste — auffällig, aber nicht die Haupttat.
          `border ${ROLLEN[rolle].rand} bg-surface font-semibold ${ROLLEN[rolle].text}`

  return `tap inline-flex select-none touch-manipulation items-center justify-center rounded-ctl px-4 py-2 text-center text-zeile focus-visible:fokus ${gross ? 'min-h-15' : 'min-h-tap'} ${farbe} ${breit ? 'w-full' : ''}`
}

type Props = Omit<ComponentPropsWithoutRef<typeof Link>, 'className'> & Flaechenfassung

export function Wegflaeche({ art, rolle, breit, gross, ...rest }: Props) {
  return <Link className={flaechenfassung({ art, rolle, breit, gross })} {...rest} />
}
