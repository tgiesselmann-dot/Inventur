'use client'

/**
 * Der Auffangbildschirm für unerwartete Fehler unterhalb des Wurzel-Layouts.
 *
 * Er behauptet nichts über die Ursache — die Meldung aus dem Server ist in
 * Produktion ohnehin nur eine Kennung (error.digest). Er bietet die zwei Wege,
 * die immer stimmen: denselben Schritt noch einmal versuchen oder zurück auf
 * die Startseite. Ohne diese Datei endet der Fehler auf der englischen
 * Standardseite von Next.js, ohne Weg zurück.
 */

import { useEffect } from 'react'

import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Wegflaeche } from '@/ui/wegflaeche'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // In der Konsole steht die ganze Geschichte; auf dem Schirm nur der Weg.
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2.5 p-4 text-center">
      <p className="text-abschnitt text-text-muted uppercase">Fehler</p>
      <h1 className="text-titel">Das hat gerade nicht geklappt</h1>
      <p className="max-w-[44ch] text-base text-text-muted">
        Beim Laden dieser Seite ist etwas schiefgegangen. Es wurde nichts ohne Bestätigung
        gespeichert.
        {error.digest !== undefined && (
          <>
            {' '}
            <span className="font-mono text-sm">Kennung {error.digest}</span>
          </>
        )}
      </p>
      <div className="mt-4 flex flex-col items-center gap-tapgap sm:flex-row">
        <Schaltflaeche onClick={() => retry()}>Erneut versuchen</Schaltflaeche>
        <Wegflaeche href="/" art="sekundaer">
          Zur Startseite
        </Wegflaeche>
      </div>
    </main>
  )
}
