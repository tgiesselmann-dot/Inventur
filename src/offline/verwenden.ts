'use client'

/**
 * Verbindet die Zählmaske mit dem lokalen Speicher und dem Server.
 *
 * Der Ablauf ist bewusst einseitig: jede Eingabe geht sofort nach IndexedDB und
 * in den Bildschirmzustand, und erst danach — irgendwann, wenn Netz da ist —
 * zum Server. Die Maske wartet nie auf eine Antwort. Im Getränkelager gibt es
 * kein Netz, und eine Eingabe, die sich erst nach einer Serverantwort bewegt,
 * wäre dort unbenutzbar.
 *
 * Die Entscheidungen, welche Werte noch ausstehen und was nach einem Versand
 * als erledigt gilt, stehen nicht hier, sondern als reine Funktionen in
 * warteschlange.ts. Hier bleibt der Teil, der ohne Browser nicht zu haben ist.
 */

import { useOffline } from 'next/offline'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ZaehlArtikel } from '@/lib/zaehlung'
import { eintraegeLesen, eintraegeSchreiben, stammSchreiben } from '@/offline/db'
import {
  geaendert,
  nachVersand,
  sammelStatus,
  zusammenfuehren,
  zuSenden,
  type Eintrag,
  type Sammelstatus,
} from '@/offline/warteschlange'

/**
 * Wie oft ohne äusseren Anlass ein Versuch läuft. Die `online`-Ereignisse des
 * Browsers sind der eigentliche Auslöser; dieses Intervall fängt den Fall ab,
 * in dem das Gerät WLAN meldet, aber nichts hindurchkommt — im Lager der
 * Normalfall.
 */
const VERSUCH_ALLE_MS = 15_000

/**
 * Wie lange nach der letzten Eingabe gewartet wird, bevor ein Versand startet.
 * Kurz genug, dass ein weggelegtes Handy als "gespeichert" dasteht, lang genug,
 * dass eine dreistellige Zahl nicht drei Anfragen auslöst.
 */
const RUHE_VOR_VERSAND_MS = 1_500

export type Zaehlstand = {
  /** Die aktuellen Werte je Artikel-Id. */
  eintraege: ReadonlyMap<string, Eintrag>
  /** Die Artikel-Ids, zu denen ein Wert vorliegt. */
  erfasst: ReadonlySet<string>
  status: Sammelstatus
  /** true, bis der lokale Speicher gelesen ist. */
  laedt: boolean
  /** Übernimmt einen gezählten Wert. */
  setzen: (artikelId: string, werte: { anzahlGebinde: string; anzahlEinzeln: string }) => void
  /** Stösst einen Versand an, etwa vor dem Abschluss. */
  senden: () => Promise<void>
}

export function useZaehlstand(
  zaehlungId: string,
  artikel: readonly ZaehlArtikel[],
  serverEintraege: readonly Eintrag[],
  kopf: { datum: string; status: string },
): Zaehlstand {
  const [eintraege, setEintraege] = useState<ReadonlyMap<string, Eintrag>>(new Map())
  const [laedt, setLaedt] = useState(true)

  /**
   * Ob der letzte Versandversuch am Netz gescheitert ist.
   *
   * `useOffline` allein reicht hier nicht: es erkennt fehlgeschlagene
   * Navigationen, Prefetches und Server Actions, aber nicht den eigenen fetch
   * einer Client-Komponente — und genau der trägt die Zählwerte. Ein Gerät im
   * WLAN, dessen Verbindung nach draussen tot ist, gilt dort weiterhin als
   * online. Der Versand weiss es besser, weil er es gerade versucht hat.
   */
  const [versandFehlt, setVersandFehlt] = useState(false)
  const offline = useOffline()

  // Der Versand läuft asynchron und muss beim Zurückschreiben den Stand sehen,
  // der dann gilt — nicht den, der beim Absenden galt. Ein Ref neben dem State
  // ist dafür der geradlinige Weg; über den State-Updater ginge es nur mit
  // einem Seiteneffekt an einer Stelle, an der React ihn doppelt ausführen darf.
  const standRef = useRef<ReadonlyMap<string, Eintrag>>(eintraege)
  const sendetRef = useRef(false)

  const anwenden = useCallback((neu: ReadonlyMap<string, Eintrag>) => {
    standRef.current = neu
    setEintraege(neu)
  }, [])

  // Beim Öffnen: lokalen Stand lesen und mit dem verbinden, was der Server
  // beim Seitenaufbau mitgegeben hat. Zugleich den Artikelstamm spiegeln,
  // damit die Maske beim nächsten Start auch ohne Netz weiss, was zu zählen ist.
  useEffect(() => {
    let abgebrochen = false

    async function laden() {
      let lokal: Eintrag[] = []
      try {
        lokal = await eintraegeLesen(zaehlungId)
      } catch (ursache) {
        // Kein IndexedDB (privates Fenster, gesperrter Speicher): die Maske
        // funktioniert weiter, nur eben ohne Gedächtnis über einen Neustart.
        console.warn('Lokaler Speicher nicht lesbar, Zählung läuft ohne ihn', ursache)
      }
      if (abgebrochen) return

      anwenden(
        new Map(
          zusammenfuehren(lokal, serverEintraege).map((eintrag) => [eintrag.artikelId, eintrag]),
        ),
      )
      setLaedt(false)

      try {
        await stammSchreiben({
          zaehlungId,
          datum: kopf.datum,
          status: kopf.status,
          artikel: [...artikel],
          geholtAm: new Date().toISOString(),
        })
      } catch (ursache) {
        console.warn('Artikelstamm konnte nicht gespiegelt werden', ursache)
      }
    }

    void laden()
    return () => {
      abgebrochen = true
    }
    // Bewusst nur an der Zählung: Artikelstamm und Serverwerte kommen aus dem
    // Seitenaufbau und wechseln innerhalb einer Zählung nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zaehlungId])

  const setzen = useCallback(
    (artikelId: string, werte: { anzahlGebinde: string; anzahlEinzeln: string }) => {
      const neu = new Map(standRef.current)
      neu.set(
        artikelId,
        geaendert(neu.get(artikelId), { zaehlungId, artikelId, ...werte }, new Date()),
      )
      anwenden(neu)

      const eintrag = neu.get(artikelId)
      if (eintrag !== undefined) {
        void eintraegeSchreiben([eintrag]).catch((ursache) => {
          console.warn('Wert konnte nicht lokal gespeichert werden', ursache)
        })
      }
    },
    [anwenden, zaehlungId],
  )

  const senden = useCallback(async () => {
    if (sendetRef.current) return
    const stapel = zuSenden([...standRef.current.values()])
    if (stapel.nutzlast.length === 0) return

    sendetRef.current = true
    try {
      const antwort = await fetch(`/api/zaehlung/${zaehlungId}/positionen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionen: stapel.nutzlast }),
      })
      // Ein abgelehnter Stapel bleibt in der Warteschlange. Erneutes Senden
      // ändert daran nichts, aber es verwirft auch nichts — und der Zähler
      // sieht am stehenden Zähler, dass etwas nicht durchgeht.
      if (!antwort.ok) {
        console.warn('Server hat den Stapel abgelehnt', antwort.status, await antwort.text())
        return
      }

      const aktualisiert = nachVersand([...standRef.current.values()], stapel.staende)
      anwenden(new Map(aktualisiert.map((eintrag) => [eintrag.artikelId, eintrag])))
      await eintraegeSchreiben(aktualisiert)
      setVersandFehlt(false)
    } catch {
      // Kein Netz. Der nächste Lauf nimmt denselben Stapel erneut mit — und
      // bis dahin soll oben stehen, dass Werte liegenbleiben.
      setVersandFehlt(true)
    } finally {
      sendetRef.current = false
    }
  }, [anwenden, zaehlungId])

  // Rückfalllinie: wiedergefundenes Netz und ein Intervall. Hängt bewusst nicht
  // an den Einträgen, sonst würde die Uhr bei jedem Tastendruck neu gestellt.
  useEffect(() => {
    if (laedt) return

    void senden()
    const uhr = setInterval(() => void senden(), VERSUCH_ALLE_MS)
    const beiNetz = () => void senden()
    window.addEventListener('online', beiNetz)

    return () => {
      clearInterval(uhr)
      window.removeEventListener('online', beiNetz)
    }
  }, [laedt, senden])

  // Nach einer Eingabe: kurz abwarten, dann senden. Ohne die Pause ginge
  // während des Tippens von "1", "12", "124" dreimal etwas hinaus, und der
  // Zähler tippt an einem Abend mehrere hundert Mal.
  useEffect(() => {
    if (laedt) return
    const wartend = setTimeout(() => void senden(), RUHE_VOR_VERSAND_MS)
    return () => clearTimeout(wartend)
  }, [laedt, senden, eintraege])

  return {
    eintraege,
    erfasst: new Set(eintraege.keys()),
    status: sammelStatus([...eintraege.values()], offline || versandFehlt),
    laedt,
    setzen,
    senden,
  }
}
