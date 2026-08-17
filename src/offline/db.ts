/**
 * Der lokale Speicher der Zählmaske.
 *
 * IndexedDB und nicht localStorage: die Werte müssen einen Sturz des Browsers
 * überleben und dürfen den Bildschirm beim Schreiben nicht blockieren.
 * localStorage ist synchron und wäre bei jedem Tastendruck ein Ruckler.
 *
 * Bewusst ohne Bibliothek, wie schon beim CSV-Parser: gebraucht werden zwei
 * Objektspeicher und vier Zugriffe, und die stehen hier vollständig.
 *
 * Alles in dieser Datei läuft nur im Browser. Der Aufrufer ist eine
 * Client-Komponente; auf dem Server gibt es kein indexedDB.
 */

import type { ZaehlArtikel } from '@/lib/zaehlung'
import type { Eintrag } from '@/offline/warteschlange'

const DB_NAME = 'inventur'
/**
 * 2: Die Zählwerte tragen seit den Lagerorten einen Ort im Schlüssel.
 *
 * Ein keyPath lässt sich nicht ändern — der Speicher wird beim Aufstieg neu
 * angelegt und die alten Einträge fallen dabei weg. Das ist die richtige
 * Reihenfolge und kein Verlust: alte Einträge kennen keinen Ort, und ein
 * geratener Ort wäre schlimmer als ein erneut gezähltes Fach. Was den Server
 * erreicht hat — und das ist im Normalfall alles — kommt beim nächsten Öffnen
 * von dort zurück.
 */
const DB_VERSION = 2

/** Artikelstamm und Kopfdaten einer Zählung, gespiegelt für den Offline-Betrieb. */
const STAMM = 'stamm'
/** Die gezählten Werte samt Warteschlangenstand. */
const EINTRAEGE = 'eintraege'

export type Stamm = {
  zaehlungId: string
  datum: string
  status: string
  artikel: ZaehlArtikel[]
  /** Wann der Stamm zuletzt vom Server geholt wurde. */
  geholtAm: string
}

function alsPromise<T>(anfrage: IDBRequest<T>): Promise<T> {
  return new Promise((erfuellen, ablehnen) => {
    anfrage.onsuccess = () => erfuellen(anfrage.result)
    anfrage.onerror = () => ablehnen(anfrage.error)
  })
}

let offen: Promise<IDBDatabase> | undefined

/**
 * Wie lange auf den Browserspeicher gewartet wird, bevor die Maske ohne ihn
 * weitermacht.
 *
 * Drei Sekunden sind für ein `open` unverschämt viel — wenn danach nichts
 * gekommen ist, kommt nichts mehr. Eine Grenze braucht es trotzdem: Safari
 * beantwortet ein `open` unter Umständen weder mit Erfolg noch mit Fehler, und
 * ohne Grenze bliebe die Zählmaske hinter ihrem Ladezustand stehen. Lieber ohne
 * Gedächtnis zählen als gar nicht.
 */
const OEFFNEN_GRENZE_MS = 3_000

/**
 * Öffnet die Datenbank und legt beim ersten Mal die Speicher an. Das Ergebnis
 * wird gemerkt — jeder `open`-Aufruf ist eine eigene Verbindung, und die Maske
 * schreibt bei jedem Tastendruck.
 *
 * Drei Ausgänge, nicht zwei: neben Erfolg und Fehler gibt es `blocked`. Der
 * Browser meldet ihn, wenn eine ältere Verbindung dieselbe Datenbank noch auf
 * der alten Version offen hält — ein zweiter Tab, die App vom Home-Bildschirm
 * daneben — und **schweigt danach**. Wer diesen Fall nicht behandelt, hat kein
 * Versprechen, das ablehnt, sondern eines, das nie antwortet; dagegen hilft
 * auch das beste `catch` beim Aufrufer nichts.
 *
 * Wird abgelehnt, fällt der gemerkte Wert weg: der blockierende Tab kann
 * geschlossen werden, und der nächste Versuch soll dann wieder eine Chance
 * haben. Kommt die verwaiste Verbindung danach doch noch, wird sie geschlossen
 * — offen gelassen blockierte sie ihrerseits den nächsten Aufstieg.
 */
export function oeffne(): Promise<IDBDatabase> {
  offen ??= new Promise<IDBDatabase>((erfuellen, ablehnen) => {
    const anfrage = indexedDB.open(DB_NAME, DB_VERSION)
    let entschieden = false

    /** Der eine Ausgang: Uhr aus, Ergebnis melden, weitere Meldungen verwerfen. */
    const entscheiden = (zug: () => void) => {
      if (entschieden) return
      entschieden = true
      clearTimeout(uhr)
      zug()
    }

    const aufgeben = (grund: string) => {
      // Der gemerkte Wert muss weg, bevor abgelehnt wird: der Aufrufer darf
      // sofort einen neuen Versuch starten, und der soll neu öffnen.
      offen = undefined
      // Was jetzt noch ankommt, will niemand mehr — die Verbindung aber darf
      // nicht liegenbleiben.
      anfrage.onsuccess = () => anfrage.result.close()
      ablehnen(new Error(grund))
    }

    const uhr = setTimeout(() => {
      entscheiden(() => aufgeben(`Browserspeicher antwortet nicht (${OEFFNEN_GRENZE_MS} ms)`))
    }, OEFFNEN_GRENZE_MS)

    anfrage.onupgradeneeded = () => {
      const db = anfrage.result
      if (!db.objectStoreNames.contains(STAMM)) {
        db.createObjectStore(STAMM, { keyPath: 'zaehlungId' })
      }
      // Der Schlüssel trägt seit Version 2 den Lagerort. Ein vorhandener
      // Speicher wird deshalb weggeworfen und neu angelegt — siehe DB_VERSION.
      if (db.objectStoreNames.contains(EINTRAEGE)) {
        db.deleteObjectStore(EINTRAEGE)
      }
      // Zusammengesetzter Schlüssel: derselbe Artikel kann in mehreren
      // Zählungen vorkommen und innerhalb einer Zählung an mehreren Orten
      // stehen — jedes davon ist ein eigener Wert.
      db.createObjectStore(EINTRAEGE, { keyPath: ['zaehlungId', 'lagerortId', 'artikelId'] })
    }

    anfrage.onsuccess = () => entscheiden(() => erfuellen(anfrage.result))
    anfrage.onerror = () =>
      entscheiden(() => {
        offen = undefined
        ablehnen(anfrage.error ?? new Error('Browserspeicher nicht lesbar'))
      })
    anfrage.onblocked = () =>
      entscheiden(() =>
        aufgeben('Browserspeicher von einem anderen Fenster belegt — dort schliessen'),
      )
  })

  return offen
}

async function inTransaktion<T>(
  speicher: string,
  modus: IDBTransactionMode,
  arbeit: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await oeffne()
  const transaktion = db.transaction(speicher, modus)
  const ergebnis = await arbeit(transaktion.objectStore(speicher))

  // Erst auf das Ende der Transaktion warten, dann zurückgeben: sonst meldet
  // ein Schreibvorgang Erfolg, den die Datenbank noch gar nicht übernommen hat.
  await new Promise<void>((erfuellen, ablehnen) => {
    transaktion.oncomplete = () => erfuellen()
    transaktion.onerror = () => ablehnen(transaktion.error)
    transaktion.onabort = () => ablehnen(transaktion.error)
  })

  return ergebnis
}

export function stammSchreiben(stamm: Stamm): Promise<void> {
  return inTransaktion(STAMM, 'readwrite', (store) => {
    store.put(stamm)
  })
}

export function stammLesen(zaehlungId: string): Promise<Stamm | undefined> {
  return inTransaktion(STAMM, 'readonly', (store) =>
    alsPromise<Stamm | undefined>(store.get(zaehlungId)),
  )
}

export function eintraegeLesen(zaehlungId: string): Promise<Eintrag[]> {
  return inTransaktion(EINTRAEGE, 'readonly', async (store) => {
    // Der Schlüssel beginnt mit zaehlungId, ein Bereich über diesen Präfix
    // trifft genau die Einträge dieser Zählung.
    const bereich = IDBKeyRange.bound([zaehlungId], [zaehlungId, []])
    return alsPromise<Eintrag[]>(store.getAll(bereich))
  })
}

export function eintraegeSchreiben(eintraege: readonly Eintrag[]): Promise<void> {
  return inTransaktion(EINTRAEGE, 'readwrite', (store) => {
    for (const eintrag of eintraege) store.put(eintrag)
  })
}

/** Nur für Tests und die Fehlersuche: alles zu einer Zählung verwerfen. */
export function verwerfen(zaehlungId: string): Promise<void> {
  return inTransaktion(EINTRAEGE, 'readwrite', (store) => {
    store.delete(IDBKeyRange.bound([zaehlungId], [zaehlungId, []]))
  })
}
