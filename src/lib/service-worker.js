/**
 * Der Service Worker der Zählmaske.
 *
 * Er hat genau eine Aufgabe: dafür sorgen, dass die Seite auch dann lädt, wenn
 * das Handy im Flugmodus ist und die App zwischendurch geschlossen wurde. Ohne
 * ihn holt der Browser beim Neustart die HTML vom Server, findet kein Netz und
 * zeigt die Fehlerseite — die gezählten Werte lägen zwar unversehrt in
 * IndexedDB, aber niemand käme an sie heran.
 *
 * Die Werte selbst fasst er nicht an. Das Senden erledigt die Warteschlange in
 * src/offline/, die dafür sichtbaren Zustand und Wiederholungen braucht;
 * Background Sync wäre hier ein zweiter, unsichtbarer Weg zum selben Ziel.
 *
 * Bewusst ohne Serwist oder Workbox: gebraucht werden zwei Regeln, und die
 * stehen hier vollständig.
 */

/// <reference lib="webworker" />

const CACHE = 'inventur-v1'

// Der Server rendert die Seite ohnehin bei jedem Aufruf neu; gecacht wird nur,
// um den Neustart ohne Netz zu überleben.
self.addEventListener('install', () => {
  // Sofort übernehmen statt auf das Schliessen aller Tabs zu warten: eine
  // Zählung soll nicht mit einer veralteten Fassung weiterlaufen.
  self.skipWaiting()
})

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    (async () => {
      const namen = await caches.keys()
      await Promise.all(namen.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request
  if (anfrage.method !== 'GET') return

  const ziel = new URL(anfrage.url)
  if (ziel.origin !== self.location.origin) return

  // Die Build-Dateien tragen einen Hash im Namen und ändern sich nie. Aus dem
  // Cache zu antworten ist hier nicht nur erlaubt, sondern richtig.
  if (ziel.pathname.startsWith('/_next/static/')) {
    ereignis.respondWith(ausCacheSonstNetz(anfrage))
    return
  }

  // Seitenaufrufe: das Netz gewinnt, solange es da ist. Der Cache ist die
  // Rückfalllinie für den Neustart im Flugmodus.
  if (anfrage.mode === 'navigate') {
    ereignis.respondWith(ausNetzSonstCache(anfrage))
  }

  // Alles Übrige — Datenabrufe des App Routers, die API — läuft am Worker
  // vorbei. Eine gecachte Antwort wäre dort ein veralteter Bestand, und das
  // ist schlimmer als eine ausbleibende Antwort.
})

async function ausCacheSonstNetz(anfrage) {
  const treffer = await caches.match(anfrage)
  if (treffer !== undefined) return treffer

  const antwort = await fetch(anfrage)
  if (antwort.ok) {
    const cache = await caches.open(CACHE)
    await cache.put(anfrage, antwort.clone())
  }
  return antwort
}

async function ausNetzSonstCache(anfrage) {
  try {
    const antwort = await fetch(anfrage)
    if (antwort.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(anfrage, antwort.clone())
    }
    return antwort
  } catch {
    const treffer = await caches.match(anfrage)
    if (treffer !== undefined) return treffer

    // Diese Seite war noch nie offen. Ohne Netz ist hier nichts zu holen —
    // aber die Auskunft darüber soll wenigstens lesbar sein.
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font:16px system-ui;padding:2rem">' +
        '<h1>Kein Netz</h1><p>Diese Seite war auf diesem Gerät noch nicht geöffnet und lässt sich ohne Verbindung nicht laden.</p>' +
        '<p>Bereits gezählte Werte sind gespeichert und gehen nicht verloren.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}
