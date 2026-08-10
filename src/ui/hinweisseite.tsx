/**
 * Eine ganze Seite, die nur eines zu sagen hat: Titel, Erklärsatz, ein Weg.
 *
 * Für die Fälle „Kein Betrieb angelegt“ und „Noch keine Auswertung möglich“ —
 * die Seite existiert, aber ihr Inhalt hat noch keine Grundlage. Vorher stand
 * derselbe Aufbau doppelt in Auswertung und Bestellvorschlag, jeweils als
 * nackter Text am oberen Rand; hier trägt ihn die Leerzustands-Karte, dieselbe
 * Form, die auch leere Listen zeigen.
 *
 * Der Titel ist ein h1: die Karte ist hier keine Zone einer Seite, sie ist die
 * Seite.
 */

import { Wegflaeche } from './wegflaeche'
import { Leerzustand } from './zustand'

export function Hinweisseite({
  titel,
  text,
  weiter,
}: {
  titel: string
  text: string
  weiter?: { ziel: string; text: string }
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 md:py-10">
      <Leerzustand
        titel={titel}
        titelAls="h1"
        erklaerung={text}
        handlung={
          weiter !== undefined && (
            <Wegflaeche href={weiter.ziel}>{weiter.text}</Wegflaeche>
          )
        }
      />
    </main>
  )
}
