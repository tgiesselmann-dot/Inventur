/**
 * Das Gerüst der Vollbild-Masken: fester Rahmen, fester Fuss.
 *
 * `Vollbild` ist die Wurzel — exakt Bildschirmhöhe (100dvh), Spalte, Grund und
 * Textfarbe. Kopf und Rumpf setzt jede Maske selbst (die Köpfe unterscheiden
 * sich zu Recht), aber der Rahmen, der den Fuss unten hält, steht damit genau
 * einmal.
 *
 * `Maskenfuss` ist die Fläche über der Home-Zone: shrink-0, Trennkante,
 * Oberfläche, und unten mindestens die Randzone des Geräts
 * (safe-area-inset-bottom) — die Zusage „alles Auslösende liegt über der
 * Wischleiste“ wohnt in dieser einen Klassenzeile. Vorher war sie achtmal
 * kopiert; wer sie ändert, ändert jetzt alle Masken zugleich.
 */

import type { ReactNode } from 'react'

export function Vollbild({ children }: { children: ReactNode }) {
  return <div className="flex h-[100dvh] flex-col bg-bg text-text">{children}</div>
}

export function Maskenfuss({ children }: { children: ReactNode }) {
  return (
    <footer className="shrink-0 border-t border-border bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {children}
    </footer>
  )
}
