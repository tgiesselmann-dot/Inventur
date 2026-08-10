'use client'

/**
 * Die Anmeldemaske.
 *
 * Vollbild mit Fuss, wie die Zählmaske: die auslösende Fläche gehört auf dem
 * Telefon über die Home-Zone und nicht unter das zweite Feld, wo sie bei
 * offener Tastatur verschwindet.
 *
 * Die Felder tragen die üblichen `autoComplete`-Namen — im Lager meldet sich
 * dasselbe Handy jede Woche an, und der Schlüsselbund soll das ausfüllen
 * dürfen.
 */

import { useActionState } from 'react'

import { BESCHRIFTUNG, FELD } from '@/ui/feld'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Maskenfuss, Vollbild } from '@/ui/vollbild'

import { AKTION_LEER } from '../aktionszustand'
import { anmelden } from './aktionen'

export function Anmeldemaske() {
  const [zustand, absenden, laeuft] = useActionState(anmelden, AKTION_LEER)

  return (
    <form action={absenden}>
      <Vollbild>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          <div className="mx-auto w-full max-w-sm">
            <p className="mt-8 text-abschnitt text-text-muted uppercase">Inventur</p>
            <h1 className="mt-2 text-titel">Anmelden</h1>
            <p className="mt-3 text-base text-text-muted">
              Die Zählung, die Lieferungen und die Preise dieses Betriebs — sichtbar nur für
              eingetragene Zugänge.
            </p>

            {zustand.art === 'fehler' && (
              <div className="mt-4">
                <Hinweisleiste rolle="danger" titel="Anmeldung nicht möglich">
                  {zustand.meldung}
                </Hinweisleiste>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className={BESCHRIFTUNG}>E-Mail</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={FELD}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className={BESCHRIFTUNG}>Passwort</span>
                <input
                  name="passwort"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={FELD}
                />
              </label>
            </div>
          </div>
        </div>

        <Maskenfuss>
          <div className="mx-auto w-full max-w-sm">
            <Schaltflaeche type="submit" breit disabled={laeuft}>
              {laeuft ? 'Wird angemeldet …' : 'Anmelden'}
            </Schaltflaeche>
          </div>
        </Maskenfuss>
      </Vollbild>
    </form>
  )
}
