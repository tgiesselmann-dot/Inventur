import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Die drei Ausgänge von `oeffne()`.
 *
 * Geprüft wird hier nur einer davon inhaltlich: dass die Maske nicht stehen
 * bleibt. Der Fall, der das kaputt gemacht hat, war kein Fehler und keine
 * Ausnahme, sondern Schweigen — ein `open`, das weder Erfolg noch Fehler
 * meldet, weil ein zweites Fenster die alte Version festhält. Ein `catch` beim
 * Aufrufer greift dagegen nicht; nur eine eigene Grenze tut es.
 *
 * Das echte IndexedDB kommt dafür nicht in Frage: es antwortet ja gerade dann,
 * wenn nichts kaputt ist. Der Ersatz unten ist deshalb kein Nachbau der
 * Datenbank, sondern nur ihr Antwortverhalten.
 */

/** Eine `open`-Anfrage, die auf Zuruf antwortet — oder eben nicht. */
type Anfrage = {
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  onblocked: (() => void) | null
  onupgradeneeded: (() => void) | null
  result: { close: () => void }
  error: DOMException | null
}

let letzteAnfrage: Anfrage
let geschlossen: number

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  geschlossen = 0

  vi.stubGlobal('indexedDB', {
    open: () => {
      letzteAnfrage = {
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
        result: {
          close: () => {
            geschlossen += 1
          },
        },
        error: null,
      }
      return letzteAnfrage
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('oeffne', () => {
  it('gibt die Verbindung zurück, wenn der Speicher antwortet', async () => {
    const { oeffne } = await import('@/offline/db')

    const versprechen = oeffne()
    letzteAnfrage.onsuccess?.()

    await expect(versprechen).resolves.toBe(letzteAnfrage.result)
  })

  it('lehnt ab, statt zu schweigen, wenn ein anderes Fenster den Speicher belegt', async () => {
    const { oeffne } = await import('@/offline/db')

    const versprechen = oeffne()
    letzteAnfrage.onblocked?.()

    await expect(versprechen).rejects.toThrow(/anderen Fenster/)
  })

  it('gibt nach der Grenze auf, wenn gar keine Antwort kommt', async () => {
    const { oeffne } = await import('@/offline/db')

    // Die Erwartung hängt vor dem Vorspulen: sonst liegt die Ablehnung einen
    // Wimpernschlag lang unbehandelt da, und das meldet Node als Fehler.
    const erwartung = expect(oeffne()).rejects.toThrow(/antwortet nicht/)
    // Weder onsuccess noch onerror noch onblocked — der Fall, in dem die
    // Zählmaske bis zum Sankt-Nimmerleins-Tag "wird geöffnet …" anzeigte.
    await vi.advanceTimersByTimeAsync(3_000)

    await erwartung
  })

  it('schliesst eine Verbindung, die nach dem Aufgeben doch noch eintrifft', async () => {
    const { oeffne } = await import('@/offline/db')

    const erwartung = expect(oeffne()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(3_000)
    await erwartung

    // Der blockierende Tab wird geschlossen, die alte Anfrage kommt durch.
    // Offen gelassen hielte sie ihrerseits den nächsten Aufstieg auf.
    letzteAnfrage.onsuccess?.()
    expect(geschlossen).toBe(1)
  })

  it('lässt nach einem Fehlschlag einen neuen Versuch zu', async () => {
    const { oeffne } = await import('@/offline/db')

    const erster = expect(oeffne()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(3_000)
    await erster

    // Kein gemerktes, für immer abgelehntes Versprechen: wer den zweiten Tab
    // schliesst und weiterzählt, soll seinen Speicher zurückbekommen.
    const zweiter = oeffne()
    letzteAnfrage.onsuccess?.()
    await expect(zweiter).resolves.toBe(letzteAnfrage.result)
  })
})
