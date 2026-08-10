'use client'

/**
 * Der letzte Auffangbildschirm: ein Fehler im Wurzel-Layout selbst.
 *
 * Diese Datei ersetzt das ganze Dokument und bringt deshalb mit, was sonst das
 * Layout liefert — globals.css für die Rollen und das Modus-Skript, damit ein
 * dunkel eingestelltes Gerät nicht plötzlich weiss aufleuchtet. Die Geist-Schrift
 * fehlt hier bewusst: body fällt auf die Systemschrift zurück, und ein
 * Fehlerbildschirm muss nicht erst eine Schrift laden.
 */

import './globals.css'

import { MODUS_SKRIPT } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    // suppressHydrationWarning aus demselben Grund wie im Layout: das Skript
    // setzt `dark` vor React, der Server liefert ohne.
    <html lang="de" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODUS_SKRIPT }} />
        <title>Fehler — Inventur</title>
      </head>
      <body className="flex min-h-full flex-col">
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2.5 p-4 text-center">
          <p className="text-abschnitt text-text-muted uppercase">Fehler</p>
          <h1 className="text-titel">Die App konnte nicht laden</h1>
          <p className="max-w-[44ch] text-base text-text-muted">
            Beim Aufbau der Seite ist etwas schiefgegangen. Es wurde nichts ohne Bestätigung
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
            {/* Bewusst <a> statt <Link>: wenn das Wurzel-Layout fällt, ist dem
                Router nicht zu trauen — ein voller Seitenaufruf startet sauber. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="tap flex min-h-tap items-center justify-center rounded-ctl border border-border-strong bg-surface px-6 text-center text-zeile focus-visible:fokus"
            >
              Zur Startseite
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
