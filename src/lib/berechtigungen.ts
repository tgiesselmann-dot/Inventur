/**
 * Wer welche Bereiche der App betreten darf.
 *
 * Zwei Rollen, und die Grenze verläuft am Geld: der Betriebsleiter sieht alles,
 * der Mitarbeiter zählt und nimmt Ware an — Umsätze, Schwund, Bestellungen und
 * Einkaufspreise gehen ihn nichts an. Die Zählmaske war schon immer preisfrei;
 * der Wareneingang wird es für ihn über `darfPreiseSehen`.
 *
 * Eigene Datei nach dem Muster von zugangswege.ts: jede Zeile hier ist eine
 * Tür, und man muss lesen können, welche für wen offen steht. Die Seiten selbst
 * fragen `pflichtBetriebsleiter` (anmeldung.ts), die Navigation, die offenen
 * Punkte und die API-Routen fragen diese Datei — alle dieselbe Antwort, keine
 * kopierte Liste.
 *
 * Rein: keine Datenbank, kein Next. Prüfbar in tests/berechtigungen.test.ts.
 */

import { BEREICHE, type Bereich, type OffenerPunkt } from '@/lib/offene-punkte'

export type Rolle = 'betriebsleiter' | 'mitarbeiter'

/**
 * Die Rolle aus der Datenbank, auf die zwei bekannten gefaltet.
 *
 * Alles Unbekannte wird Mitarbeiter: ein vertippter Rollenname darf höchstens
 * zu wenig öffnen, nie zu viel.
 */
export function alsRolle(wert: string): Rolle {
  return wert === 'betriebsleiter' ? 'betriebsleiter' : 'mitarbeiter'
}

export function istBetriebsleiter(rolle: string): boolean {
  return alsRolle(rolle) === 'betriebsleiter'
}

/**
 * Ob eine Rolle Einkaufspreise und Beträge sehen darf. Heute dasselbe wie
 * `istBetriebsleiter` — aber die Frage der Masken ist "darf der Preise sehen",
 * nicht "ist der Betriebsleiter", und sie soll so auch im Code stehen.
 */
export function darfPreiseSehen(rolle: string): boolean {
  return istBetriebsleiter(rolle)
}

/**
 * Ob eine Rolle einen Pfad betreten darf.
 *
 * Für den Mitarbeiter eine Erlaubnisliste, keine Sperrliste: ein neuer Bereich
 * ist damit zu, bis ihn jemand ausdrücklich öffnet. Verglichen wird auf ganze
 * Pfadabschnitte, wie in zugangswege.ts.
 *
 * Offen für den Mitarbeiter:
 *  - die Startseite und die Anmeldung
 *  - die ganze Zählstrecke
 *  - die Lieferungen (Wareneingang am Mittwoch), ohne die Preisklärung
 *    (/lieferungen/[id]/preise) und ohne die Abweichungsverfolgung — beide
 *    handeln von Beträgen
 *  - die API-Routen der Zählung und der Lieferung sowie die Systemauskunft
 */
export function darfPfad(rolle: string, pfad: string): boolean {
  if (istBetriebsleiter(rolle)) return true

  const teile = pfad.split('/').filter((teil) => teil !== '')
  const [kopf, zweiter, dritter] = teile

  if (teile.length === 0) return true
  if (kopf === 'anmelden' || kopf === 'zaehlung') return true
  if (kopf === 'lieferungen') {
    if (zweiter === 'abweichungen') return false
    if (dritter === 'preise') return false
    return true
  }
  if (kopf === 'api') {
    return zweiter === 'zaehlung' || zweiter === 'lieferung' || zweiter === 'health'
  }
  return false
}

/** Die Bereiche der Navigation, auf die Rolle gefiltert. */
export function sichtbareBereiche(rolle: string): readonly Bereich[] {
  return BEREICHE.filter((bereich) => darfPfad(rolle, bereich.ziel))
}

/**
 * Die offenen Punkte, auf die Rolle gefiltert — nach dem Ziel des Punkts, denn
 * ein Punkt, dessen Weg verschlossen ist, wäre eine Aufforderung ohne Tür.
 * Damit verschwinden für den Mitarbeiter auch die Preisabweichungen, obwohl
 * ihr Bereich (Lieferungen) für ihn offen ist.
 */
export function punkteFuerRolle(
  punkte: readonly OffenerPunkt[],
  rolle: string,
): OffenerPunkt[] {
  return punkte.filter((punkt) => darfPfad(rolle, punkt.ziel))
}
