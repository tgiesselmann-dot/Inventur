'use client'

/**
 * Der Umschalter zwischen Hell und Dunkel.
 *
 * Die Design-Grundlage verlangt eine bewusste Wahl statt einer Medienabfrage:
 * im Lager wird Dunkel gewählt, weil dort Neonlicht und Kälte herrschen, nicht
 * weil das Telefon gerade auf Nachtmodus steht. Die Wahl hält deshalb über
 * Sitzungen hinweg.
 *
 * Beim allerersten Aufruf gibt es noch keine Wahl. Dann gilt die
 * Systemeinstellung als beste Vermutung — sie ist ein Startwert, keine
 * Entscheidung, und wird beim ersten Tippen ersetzt.
 */

import { useLayoutEffect, useSyncExternalStore } from 'react'

const SCHLUESSEL = 'inventur-modus'

/**
 * Läuft vor dem ersten Zeichnen im <head>, damit eine dunkle Oberfläche nicht
 * für einen Sekundenbruchteil hell aufblitzt. Als Text eingebettet, weil er
 * synchron laufen muss — jede React-Komponente käme dafür zu spät.
 */
export const MODUS_SKRIPT = `(function(){try{
var w=localStorage.getItem('${SCHLUESSEL}');
var d=w==='dunkel'||(w===null&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);
}catch(e){}})()`

/**
 * Wendet die gespeicherte Wahl nach dem Einhängen noch einmal an.
 *
 * Nötig für Seiten, deren Dokument ohne das Kopf-Skript ankommt: den
 * 404-Rumpf baut Next clientseitig auf, und ein <script> in einer
 * React-Komponente läuft dort nie — ohne diesen Nachzug wäre die
 * Nicht-gefunden-Seite auf einem dunkel eingestellten Gerät grellweiss.
 * Überall sonst ist der Aufruf ein No-op: das Kopf-Skript war schneller und
 * hat dieselbe Klasse längst gesetzt.
 */
export function Modusanwendung() {
  useLayoutEffect(() => {
    try {
      const wahl = localStorage.getItem(SCHLUESSEL)
      const dunkel =
        wahl === 'dunkel' ||
        (wahl === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dunkel)
    } catch {
      // Ohne Speicher bleibt es bei Hell — dieselbe Haltung wie im Skript.
    }
  }, [])
  return null
}

/**
 * Meldet, wenn sich die Klasse am <html> ändert.
 *
 * Der Modus ist Zustand des Dokuments, nicht dieser Komponente: das Skript im
 * <head> setzt ihn vor React, und mehrere Umschalter auf einer Seite müssen
 * dasselbe anzeigen. Deshalb wird er beobachtet statt kopiert.
 */
function abonnieren(melden: () => void): () => void {
  const beobachter = new MutationObserver(melden)
  beobachter.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => beobachter.disconnect()
}

export function Modusumschalter({ className = '' }: { className?: string }) {
  const dunkel = useSyncExternalStore(
    abonnieren,
    () => document.documentElement.classList.contains('dark'),
    // Der Server kennt die Wahl nicht. Hell ist die ruhigere Annahme; nach dem
    // Einhängen zeigt der Knopf sofort den wirklichen Stand.
    () => false,
  )

  function umschalten() {
    // Den Stand aus dem Dokument lesen, nicht aus dem letzten Render: dort
    // steht er, und zwei Tipps kurz hintereinander würden sonst denselben
    // Ausgangswert sehen und beide dasselbe schalten.
    const neu = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', neu)
    try {
      localStorage.setItem(SCHLUESSEL, neu ? 'dunkel' : 'hell')
    } catch {
      // Ohne Speicher gilt die Wahl nur für diese Sitzung. Kein Grund, sie
      // deshalb zu verweigern.
    }
  }

  return (
    <button
      type="button"
      onClick={umschalten}
      aria-label={dunkel ? 'Helle Ansicht' : 'Dunkle Ansicht'}
      className={`tap flex h-tap w-tap shrink-0 items-center justify-center rounded-ctl border border-border text-xl focus-visible:fokus ${className}`}
    >
      {dunkel ? '☀' : '☾'}
    </button>
  )
}
