/**
 * Die Seitennavigation des Desktops — auf jeder Seite, nicht nur am Start.
 *
 * Dieselben Bereiche wie die Karten-Liste auf dem Telefon, aus derselben
 * Quelle (sichtbareBereiche in src/lib/berechtigungen.ts, gespeist aus
 * BEREICHE) — und mit demselben Punkt, wo etwas offen ist. Zwei Listen wären
 * zwei Gelegenheiten, einen Bereich zu vergessen.
 *
 * `aktiv` sagt, welcher Eintrag die aktuelle Seite ist: er wird zur Fläche
 * statt zum Weg, denn ein Weg auf die Seite, auf der man steht, führt
 * nirgendwohin. Seiten ohne eigenen Eintrag (Bestellungen, Zählungsliste)
 * lassen `aktiv` weg — dann ist alles Weg.
 *
 * Im Druck verschwindet die Navigation (nur-schirm): gedruckt wird der
 * Inhalt einer Seite, nie ihr Menü.
 */

import Link from 'next/link'

import { type Bereich, type Bereichsschluessel } from '@/lib/offene-punkte'
import { Modusumschalter } from '@/ui/modus'

type Props = {
  betrieb: string
  /**
   * Die Einträge kommen vom Aufrufer, gefiltert nach der Rolle des
   * Angemeldeten (sichtbareBereiche in src/lib/berechtigungen.ts) — ein
   * Mitarbeiter sieht hier nur, was er auch betreten darf.
   */
  bereiche: readonly Bereich[]
  jeBereich: Record<Bereichsschluessel, number>
  artikelzahl: number
  aktiv?: 'start' | Bereichsschluessel
  /** Wer angemeldet ist, und der Weg hinaus. */
  angemeldet: { email: string; abmelden: () => Promise<void> }
}

export function Seitennavigation({
  betrieb,
  bereiche,
  jeBereich,
  artikelzahl,
  aktiv,
  angemeldet,
}: Props) {
  return (
    <aside className="nur-schirm hidden w-62 shrink-0 flex-col gap-6 border-r border-border bg-surface p-3 md:flex">
      <div className="flex flex-col gap-1.5 px-2.5 pt-2">
        <p className="text-base leading-tight font-semibold">{betrieb}</p>
        <p className="font-mono text-abschnitt font-normal tracking-wide text-text-muted uppercase">
          Inventur
        </p>
      </div>

      <nav className="flex flex-col gap-0.5">
        <Eintrag name="Start" ziel="/" aktiv={aktiv === 'start'} />
        {bereiche.map((bereich) => (
          <Eintrag
            key={bereich.schluessel}
            name={bereich.name}
            ziel={bereich.ziel}
            aktiv={aktiv === bereich.schluessel}
            wert={bereich.schluessel === 'artikel' ? String(artikelzahl) : undefined}
            punkt={jeBereich[bereich.schluessel] > 0}
          />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <Modusumschalter />
        {/* Die Adresse steht über der Fläche und nicht in ihr: wer sie liest,
            will wissen, wer angemeldet ist — nicht sich abmelden. Beides in
            einer Zeile hiesse, den Namen antippbar zu machen. */}
        <p className="truncate px-3 text-sm text-text-muted" title={angemeldet.email}>
          {angemeldet.email}
        </p>
        <form action={angemeldet.abmelden}>
          <button
            type="submit"
            className="tap flex h-11 w-full items-center rounded-ctl px-3 text-base text-text focus-visible:fokus"
          >
            Abmelden
          </button>
        </form>
      </div>
    </aside>
  )
}

function Eintrag({
  name,
  ziel,
  aktiv,
  wert,
  punkt,
}: {
  name: string
  ziel: string
  aktiv: boolean
  wert?: string
  punkt?: boolean
}) {
  if (aktiv) {
    return (
      <span
        aria-current="page"
        className="flex h-11 items-center gap-2 rounded-ctl bg-primary-soft px-3 text-base font-semibold text-primary-soft-on"
      >
        <span className="flex-1 truncate">{name}</span>
        {wert !== undefined && <span className="text-sm text-primary-soft-on">{wert}</span>}
      </span>
    )
  }

  return (
    <Link
      href={ziel}
      className="tap flex h-11 items-center gap-2 rounded-ctl px-3 text-base text-text focus-visible:fokus"
    >
      <span className="flex-1 truncate">{name}</span>
      {wert !== undefined && <span className="text-sm text-text-muted">{wert}</span>}
      {punkt && (
        // Der Punkt trägt seine Aussage nicht allein: derselbe Bereich steht
        // in der Liste "Offen" der Startseite mit dem Satz, der ihn betrifft.
        <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-attention" />
      )}
    </Link>
  )
}
