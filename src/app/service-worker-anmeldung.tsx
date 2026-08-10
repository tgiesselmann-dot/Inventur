'use client'

/**
 * Meldet den Service Worker an. Steht im Wurzel-Layout, damit er schon
 * bereitsteht, bevor jemand die Zählmaske öffnet — er kann nur Seiten
 * ausliefern, die er zuvor einmal gesehen hat.
 *
 * Ohne Netz und ohne Service-Worker-Unterstützung passiert hier nichts. Die
 * Maske funktioniert dann weiterhin, sie überlebt nur keinen Neustart im
 * Flugmodus.
 */

import { useEffect } from 'react'

export function ServiceWorkerAnmeldung() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // In der Entwicklung ausdrücklich nicht anmelden, sondern abmelden.
    //
    // Der Worker beantwortet /_next/static/ aus dem Cache, weil diese Dateien
    // im Produktionsbuild einen Hash im Namen tragen und sich nie ändern. Im
    // Dev-Server stimmt das nicht: Turbopack liefert gleichnamige Chunks mit
    // wechselndem Inhalt. Der Worker friert dann die erste Fassung ein, und
    // jede Änderung am Code kommt im Browser nicht mehr an — auch nicht nach
    // Neustart des Servers oder gelöschtem .next-Verzeichnis.
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((anmeldungen) => Promise.all(anmeldungen.map((eintrag) => eintrag.unregister())))
        .then(() => caches.keys())
        .then((namen) => Promise.all(namen.map((name) => caches.delete(name))))
        .catch(() => {
          // Ein fehlgeschlagenes Aufräumen ist in der Entwicklung kein Grund,
          // etwas zu melden.
        })
      return
    }

    navigator.serviceWorker
      .register(new URL('../lib/service-worker.js', import.meta.url), {
        scope: '/',
        // Die Worker-Datei selbst nie aus dem HTTP-Cache nehmen, sonst bliebe
        // eine alte Fassung beliebig lange liegen.
        updateViaCache: 'none',
      })
      .catch((ursache) => {
        console.warn('Service Worker nicht angemeldet — Offline-Neustart entfällt', ursache)
      })
  }, [])

  return null
}
