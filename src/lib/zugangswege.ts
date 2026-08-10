/**
 * Welche Wege ohne Anmeldung offen stehen.
 *
 * Eigene Datei und nicht im Proxy, weil das eine Entscheidung ist, die man
 * lesen und prüfen können muss: jeder Eintrag hier ist eine Tür ohne Schloss.
 * Der Proxy fragt sie nur ab.
 *
 * Drei Einträge, jeder mit Grund:
 *  - `/anmelden` — sonst leitete die Tür auf sich selbst.
 *  - `/api/health` — die Systemauskunft soll gerade dann antworten, wenn die
 *    Anmeldung klemmt. Sie nennt keine Betriebsdaten, nur ob Datenbank und
 *    Auth-Dienst erreichbar sind.
 *  - `/manifest.webmanifest` — das Betriebssystem holt es beim „Zum
 *    Home-Bildschirm" ohne die Cookies der Seite. Eine Umleitung darauf wäre
 *    ein Symbol, das die Anmeldeseite zeigt.
 *
 * Alles andere ist zu. Statische Dateien und Bilder erreichen den Proxy gar
 * nicht erst — das regelt sein `matcher` in src/proxy.ts.
 */

export const OFFENE_PFADE = ['/anmelden', '/api/health', '/manifest.webmanifest'] as const

/**
 * Ob ein Pfad ohne Anmeldung erreichbar ist.
 *
 * Verglichen wird auf ganze Pfadabschnitte, nicht auf den Anfang der
 * Zeichenkette: `/anmeldenXY` ist kein Unterweg von `/anmelden`, und ein
 * blosses `startsWith` machte aus jedem offenen Pfad ein Präfix, unter dem
 * sich beliebige Adressen anlegen liessen.
 */
export function istOffenerPfad(pfad: string): boolean {
  return OFFENE_PFADE.some((offen) => pfad === offen || pfad.startsWith(`${offen}/`))
}
