/**
 * Das Gerüst um jede Bereichsseite: Desktop-Seitenleiste, mobiler Rückweg.
 *
 * Vor dieser Klammer hatte nur die Startseite eine Navigation — jede andere
 * Seite war eine Sackgasse, aus der allein der Zurück-Knopf des Browsers
 * führte. Jetzt steht auf dem Desktop überall dieselbe Seitenleiste, auf dem
 * Telefon eine schmale Leiste mit dem Weg zurück zum Start — nach dem Muster
 * der Abschluss-Seite („‹ Zählungen“).
 *
 * Die Vollbild-Masken (Zählmaske, Wareneingang, Preise) bleiben draussen:
 * sie füllen den Bildschirm mit Absicht, dort wäre jede Leiste im Weg. Deshalb
 * liegt das Gerüst in den Bereichs-Layouts bzw. um einzelne Seiten — nie
 * pauschal im Root-Layout.
 *
 * Gerechnet wird hier nichts: die Punkte je Bereich kommen aus
 * src/lib/offene-punkte.ts, dieselbe Rechnung, die auch die Startseite speist.
 * Der Betrieb kommt aus der Anmeldung — wer hier ankommt, ohne angemeldet zu
 * sein, wird schon in `aktuellerBetrieb` umgeleitet und sieht kein Gerüst.
 */

import Link from 'next/link'

import { pflichtBenutzer } from '@/lib/anmeldung'
import { offenePunkte, punkteJeBereich, type Bereichsschluessel } from '@/lib/offene-punkte'
import { offenlage } from '@/lib/offene-punkte-daten'
import { prisma } from '@/lib/prisma'
import { Seitennavigation } from '@/ui/seitennavigation'

import { abmelden } from './anmelden/aktionen'

type Props = {
  aktiv?: 'start' | Bereichsschluessel
  children: React.ReactNode
}

export async function Geruest({ aktiv, children }: Props) {
  const benutzer = await pflichtBenutzer()
  const betrieb = benutzer.betrieb

  const [artikelzahl, lage] = await Promise.all([
    prisma.artikel.count({ where: { betriebId: betrieb.id, aktiv: true } }),
    offenlage(betrieb.id),
  ])
  const jeBereich = punkteJeBereich(offenePunkte(lage))

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Seitennavigation
        betrieb={betrieb.name}
        jeBereich={jeBereich}
        artikelzahl={artikelzahl}
        aktiv={aktiv}
        angemeldet={{ email: benutzer.email, abmelden }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="nur-schirm flex shrink-0 items-center border-b border-border bg-surface px-2 md:hidden">
          <Link
            href="/"
            className="tap flex h-tap items-center gap-1 rounded-ctl px-2.5 text-zeile text-primary-text focus-visible:fokus"
          >
            <span aria-hidden className="text-xl leading-none">
              ‹
            </span>
            Start
          </Link>
        </header>
        {children}
      </div>
    </div>
  )
}
