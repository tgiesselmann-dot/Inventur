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
  schluessel,
  zusammenfuehren,
  zuSenden,
  type Ablehnungsgrund,
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
  /**
   * Die aktuellen Werte des offenen Lagerorts, je Artikel-Id.
   *
   * Nur dieser Ort: die Maske zählt immer in genau einem Lager, und dort ist
   * der Artikel wieder eindeutig. Was an den anderen Orten liegt, geht in den
   * Versand ein, aber nicht in diese Anzeige.
   */
  eintraege: ReadonlyMap<string, Eintrag>
  /** Die Artikel-Ids, zu denen an diesem Ort ein Wert vorliegt. */
  erfasst: ReadonlySet<string>
  status: Sammelstatus
  /** true, bis der lokale Speicher gelesen ist. */
  laedt: boolean
  /** Übernimmt einen gezählten Wert für den offenen Lagerort. */
  setzen: (artikelId: string, werte: { anzahlGebinde: string; anzahlEinzeln: string }) => void
  /** Stösst einen Versand an, etwa vor dem Abschluss. */
  senden: () => Promise<void>
}

/**
 * Der Warteschlangen-Stand einer Zählung, ohne die Maske zu öffnen — für die
 * Statuszeile der Startseite. Liest denselben lokalen Speicher wie die Maske
 * und rechnet mit demselben `sammelStatus`; hier wird nichts gesendet, nur
 * gesagt, ob noch etwas liegt.
 *
 * `null`, solange der Speicher nicht gelesen ist: eine Statuszeile, die kurz
 * "Gespeichert" behauptet und dann umspringt, wäre eine falsche Auskunft.
 */
export function useSyncstatus(zaehlungId: string): Sammelstatus | null {
  const [eintraege, setEintraege] = useState<readonly Eintrag[] | null>(null)
  const offline = useOffline()

  useEffect(() => {
    let abgebrochen = false

    const lesen = () => {
      eintraegeLesen(zaehlungId)
        .then((gelesen) => {
          if (!abgebrochen) setEintraege(gelesen)
        })
        .catch(() => {
          // Kein IndexedDB: dann gibt es auch keine liegengebliebenen Werte,
          // über die diese Zeile Auskunft geben könnte.
          if (!abgebrochen) setEintraege([])
        })
    }

    lesen()
    // Dieselbe Uhr wie der Versand der Maske: liegt etwas, versucht ein
    // zweites offenes Fenster es gerade loszuwerden — hier wird nur nachgesehen.
    const uhr = setInterval(lesen, VERSUCH_ALLE_MS)
    window.addEventListener('online', lesen)
    return () => {
      abgebrochen = true
      clearInterval(uhr)
      window.removeEventListener('online', lesen)
    }
  }, [zaehlungId])

  if (eintraege === null) return null
  return sammelStatus(eintraege, offline)
}

/**
 * Der Stand einer Zählung, aus der Sicht eines Lagerorts.
 *
 * Gehalten wird immer die ganze Zählung — alle Orte. Nur so geht ein Wert, der
 * im Funkloch an der Theke entstand, auch dann noch hinaus, wenn der Zähler
 * längst im Kühlcontainer steht. Nach aussen zeigt der Stand dagegen nur den
 * offenen Ort: dort steht der Daumen, und dort ist der Artikel eindeutig.
 */
export function useZaehlstand(
  zaehlungId: string,
  lagerortId: string,
  artikel: readonly ZaehlArtikel[],
  serverEintraege: readonly Eintrag[],
  kopf: { datum: string; status: string },
): Zaehlstand {
  /** Alle Orte der Zählung, gekeyt über `schluessel`. */
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
  /**
   * Warum der Server den letzten Stapel abgelehnt hat — oder `null`. Anders als
   * ein totes Netz heilt das kein Wiederholen im Hintergrund: der Zähler soll
   * es sehen und kann es mit "Erneut" von Hand anstossen, etwa nachdem das
   * Hindernis (z. B. eine zwischenzeitlich abgeschlossene Zählung) geklärt ist.
   *
   * Eine abgelaufene Anmeldung (401) wird eigens geführt: dagegen hilft kein
   * "Erneut", sondern nur eine neue Anmeldung — und das muss dort stehen, wo
   * der Zähler es liest.
   */
  const [abgelehnt, setAbgelehnt] = useState<Ablehnungsgrund>(null)
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
          zusammenfuehren(lokal, serverEintraege).map((eintrag) => [schluessel(eintrag), eintrag]),
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
      const kennung = schluessel({ lagerortId, artikelId })
      const neu = new Map(standRef.current)
      neu.set(
        kennung,
        geaendert(
          neu.get(kennung),
          { zaehlungId, lagerortId, artikelId, ...werte },
          new Date(),
        ),
      )
      anwenden(neu)

      const eintrag = neu.get(kennung)
      if (eintrag !== undefined) {
        void eintraegeSchreiben([eintrag]).catch((ursache) => {
          console.warn('Wert konnte nicht lokal gespeichert werden', ursache)
        })
      }
    },
    [anwenden, lagerortId, zaehlungId],
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
      // Ein abgelehnter Stapel bleibt in der Warteschlange, und die Ablehnung
      // wird gemeldet: sie ist eine Antwort des Servers, kein Funkloch — von
      // allein kommt hier nichts mehr an.
      if (!antwort.ok) {
        console.warn('Server hat den Stapel abgelehnt', antwort.status, await antwort.text())
        setAbgelehnt(antwort.status === 401 ? 'abgemeldet' : 'abgelehnt')
        return
      }

      const aktualisiert = nachVersand([...standRef.current.values()], stapel.staende)
      anwenden(new Map(aktualisiert.map((eintrag) => [schluessel(eintrag), eintrag])))
      await eintraegeSchreiben(aktualisiert)
      setVersandFehlt(false)
      setAbgelehnt(null)
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

    // Der Erstversuch ruft senden() direkt. Dessen setState-Aufrufe liegen
    // alle hinter einem await auf die Serverantwort — hier rendert nichts
    // kaskadierend, die Regel sieht nur den synchronen Aufruf.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Der Ausschnitt für die Maske: nur der offene Ort, wieder je Artikel-Id.
  // Der Status dagegen zählt über alle Orte — ein Wert, der an der Theke
  // liegengeblieben ist, ist auch im Kühlcontainer noch nicht gespeichert, und
  // die Zeile oben soll das sagen.
  const meineEintraege = new Map(
    [...eintraege.values()]
      .filter((eintrag) => eintrag.lagerortId === lagerortId)
      .map((eintrag) => [eintrag.artikelId, eintrag]),
  )

  return {
    eintraege: meineEintraege,
    erfasst: new Set(meineEintraege.keys()),
    status: sammelStatus([...eintraege.values()], offline || versandFehlt, abgelehnt),
    laedt,
    setzen,
    senden,
  }
}
