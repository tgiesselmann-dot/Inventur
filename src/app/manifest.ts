/**
 * Das Web-App-Manifest: die App als Fläche auf dem Home-Bildschirm.
 *
 * `display: standalone` nimmt der Maske im Lager die Browserleisten weg —
 * navigierbar bleibt sie, weil jede Bereichsseite ihren eigenen Rückweg trägt
 * (Gerüst-Leiste „‹ Start“, Seitenleiste am Desktop).
 *
 * Die Icons sind vollflächig auf Primärblau gezeichnet und tragen deshalb
 * beide Zwecke (`any` und `maskable`): Android darf sie beschneiden, ohne
 * dass die Flasche den sicheren Bereich verlässt.
 */

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Inventur Stadthafen Recklinghausen',
    short_name: 'Inventur',
    description: 'Getränke-Inventur: zählen, Wareneingang, Sollbestand, Schwund.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#0369a1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
