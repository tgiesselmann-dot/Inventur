/**
 * Die Importstrecke des Artikelstamms: CSV wählen, Vorschau lesen, bestätigen.
 *
 * Gebaut für den Laptop — der Stamm wird am Schreibtisch gepflegt, nicht im
 * Lager. Die Strecke selbst ist eine Client-Komponente (Schritte, Filter,
 * Dateiablage); gerechnet wird ausschliesslich in den Serveraktionen über
 * src/lib/artikelimport.ts.
 */

import { pflichtBetriebsleiter } from '@/lib/anmeldung'

import { Importstrecke } from './importstrecke'

export const dynamic = 'force-dynamic'

export default async function Page() {
  // Der Betrieb wird hier nicht gebraucht, der Aufruf aber sehr wohl: er ist
  // die Zugangsprüfung. Die Strecke selbst schreibt über Serveraktionen, und
  // die fragen noch einmal — dies hier ist die Tür, nicht das Schloss.
  await pflichtBetriebsleiter()

  return <Importstrecke />
}
