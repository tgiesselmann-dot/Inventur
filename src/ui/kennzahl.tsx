/**
 * Eine Kennzahl: grosse Zahl über kleiner Versalien-Beschriftung.
 *
 * Zeigt nur, was sie bekommt — gerechnet wird in src/lib. Ein fehlender Wert
 * ist ein Gedankenstrich: "nicht bewertbar" ist eine Auskunft, 0,00 EUR wäre
 * eine falsche.
 *
 * `rolle` färbt die Zahl über die Text-Fassung der Rolle, etwa Schwund in
 * Warnrot. Die Farbe steht nie allein — die Unterzeile trägt die Aussage als
 * Wort.
 */

import { ROLLEN } from './rollen'

export function Kennzahl({
  wert,
  beschriftung,
  unterzeile,
  rolle = 'neutral',
}: {
  /** Fertig formatiert, samt Einheit. Ohne Wert steht „—". */
  wert?: string
  beschriftung: string
  unterzeile?: string
  /**
   * `primary` steht für eine Zahl, die eine Entscheidung zählt und keinen
   * Mangel — die Handeingriffe am Bestellvorschlag. Bernstein heisst in diesem
   * Produkt "stimmt noch nicht"; wer eine Menge von Hand setzt, hat aber genau
   * das getan, was die Maske von ihm will.
   */
  rolle?: 'neutral' | 'confirm' | 'primary' | 'attention' | 'danger'
}) {
  // Die neutrale Zahl bleibt text-text: sie ist die Auskunft selbst, kein
  // gedämpftes Nebenwort (die Ausnahme, die rollen.ts ankündigt).
  const zahl = rolle === 'neutral' ? 'text-text' : ROLLEN[rolle].text
  return (
    <div className="rounded-ctl border border-border p-3">
      <p className={`text-titel ${wert === undefined ? 'text-text-muted' : zahl}`}>
        {wert ?? '—'}
      </p>
      <p className="mt-1 text-xs font-medium tracking-wide text-text-muted uppercase">{beschriftung}</p>
      {unterzeile && <p className="mt-0.5 text-sm text-text-muted">{unterzeile}</p>}
    </div>
  )
}
