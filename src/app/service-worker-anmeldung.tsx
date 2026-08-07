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
