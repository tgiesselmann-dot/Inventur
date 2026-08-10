/**
 * Der Fortschrittsbalken: ein Blick sagt, wie weit es ist.
 *
 * Vorher dreimal einzeln gebaut — Startseite, Zählmaske, Zuordnung — mit
 * driftenden Höhen, Spuren und Farblogiken. Hier steht die Form genau einmal.
 *
 * Vor der Sprachausgabe verborgen: neben jedem Balken steht dieselbe Aussage
 * als Zahl oder Satz, und die ist genauer. Der Balken ist für den Blick im
 * Vorbeigehen.
 *
 * Der Anteil kommt fertig herein (0 bis 1) — gerechnet wird er in src/lib
 * (`fortschrittsanteil`), nicht hier.
 */

export function Fortschrittsbalken({
  anteil,
  rolle = 'primary',
  fein = false,
}: {
  /** 0 bis 1, fertig gerechnet in src/lib. */
  anteil: number
  /** `confirm`, sobald nichts mehr offen ist. */
  rolle?: 'primary' | 'confirm'
  /** Die 3-px-Linie ohne Rundung — als Kante unter einem Maskenkopf. */
  fein?: boolean
}) {
  return (
    <div
      aria-hidden
      className={fein ? 'h-[3px] bg-border' : 'h-2 overflow-hidden rounded-full bg-border'}
    >
      <div
        className={`h-full w-full origin-left ${fein ? '' : 'rounded-full'} ${
          rolle === 'confirm' ? 'bg-confirm' : 'bg-primary'
        }`}
        style={{ transform: `scaleX(${anteil})` }}
      />
    </div>
  )
}
