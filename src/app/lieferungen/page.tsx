/**
 * Die Lieferungen und der Weg in eine neue Wareneingangskontrolle.
 *
 * Der Kontrollstand jeder Zeile wird abgeleitet, nicht gespeichert: ungeprüft
 * heisst `geprueftAm = null`, und ob eine geprüfte Lieferung Abweichungen hatte,
 * sagen die Abweichungen selbst. Ein zusätzliches Statusfeld wäre eine zweite
 * Wahrheit und beim ersten vergessenen Update falsch. Gerechnet wird er in
 * `kontrollstand` (src/lib/wareneingang.ts), gezeigt nur hier.
 *
 * Deshalb steht er auch als ruhiger Text rechts in der Zeile und nicht als
 * eingefärbtes Etikett: ein Zustandschip behauptet einen Status, der gepflegt
 * wird. Farbe nimmt allein die Abweichung an — dort liegt Geld.
 *
 * Das Formular steht oben und nicht im Fuss, entgegen der Regel „alles
 * Auslösende im unteren Drittel": „Wareneingang beginnen" gehört zu den vier
 * Feldern darüber, wird einmal je Lieferung gedrückt und liegt bei offener
 * Tastatur ohnehin im Blick.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BestellStatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb, pflichtBenutzer } from '@/lib/anmeldung'
import { istBetriebsleiter } from '@/lib/berechtigungen'
import { alsDatumstext, alsFeldwert, alsKurzdatum, heute } from '@/lib/datum'
import { prisma } from '@/lib/prisma'
import { kontrollstand } from '@/lib/wareneingang'
import { FELD, BESCHRIFTUNG } from '@/ui/feld'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Leerzustand } from '@/ui/zustand'

import { Geruest } from '../geruest'

// Ohne diese Zeile rendert der Build die Liste einmal und friert sie ein — die
// Lieferung von heute Morgen stünde dann morgen noch immer nicht darin.
export const dynamic = 'force-dynamic'

async function wareneingangBeginnen(formular: FormData) {
  'use server'

  const betrieb = await aktuellerBetrieb()

  const lieferant = String(formular.get('lieferant') ?? '').trim()
  const belegNr = String(formular.get('belegNr') ?? '').trim()
  const datumstext = String(formular.get('datum') ?? '')
  const bestellungId = String(formular.get('bestellungId') ?? '')

  // Sichtbar scheitern statt still: `required` lässt Leerzeichen durch, und
  // eine Seite, die kommentarlos neu lädt, sieht aus wie ein Fehler der App.
  // Die Aktion hat keinen useActionState-Vertrag — die Meldung reist deshalb
  // als Parameter und wird oben am Formular gezeigt.
  if (lieferant === '' || belegNr === '') redirect('/lieferungen?fehler=angaben')

  const datum = /^\d{4}-\d{2}-\d{2}$/.test(datumstext) ? new Date(`${datumstext}T00:00:00Z`) : heute()

  const lieferung = await prisma.lieferung.create({
    data: {
      betriebId: betrieb.id,
      datum,
      lieferant,
      belegNr,
      bestellungId: bestellungId === '' ? null : bestellungId,
    },
  })

  // Mit Bestellbezug stehen die Zeilen schon da, bevor der Fahrer die Palette
  // abgerollt hat: die bestellte Menge ist der beste erste Vorschlag für das,
  // was auf dem Lieferschein stehen wird. Ohne Bestellung beginnt die Kontrolle
  // mit einer leeren Liste, die am Papier entlang wächst.
  if (bestellungId !== '') {
    const positionen = await prisma.bestellposition.findMany({
      where: { bestellungId, betriebId: betrieb.id },
    })
    if (positionen.length > 0) {
      await prisma.lieferposition.createMany({
        data: positionen.map((position) => ({
          betriebId: betrieb.id,
          lieferungId: lieferung.id,
          artikelId: position.artikelId,
          bestellpositionId: position.id,
          anzahlGebindeLieferschein: position.anzahlGebinde,
          anzahlGebindeTatsaechlich: position.anzahlGebinde,
        })),
      })
    }
  }

  // Mit Bestellbezug beginnt die Kontrolle: die Zeilen stehen vorbelegt da und
  // werden gegen die Palette geprüft. Ohne Bestellung gibt es noch nichts zu
  // prüfen — dort beginnt die Erfassung am Lieferschein entlang.
  redirect(
    bestellungId === ''
      ? `/lieferungen/${lieferung.id}/erfassen`
      : `/lieferungen/${lieferung.id}`,
  )
}

export default async function Page({ searchParams }: PageProps<'/lieferungen'>) {
  const parameter = await searchParams
  const benutzer = await pflichtBenutzer()
  const betrieb = benutzer.betrieb
  // Abweichungen und Bestellungen handeln von Beträgen — die beiden Wege
  // erscheinen nur der Betriebsleitung (siehe src/lib/berechtigungen.ts).
  const mitVerwaltung = istBetriebsleiter(benutzer.rolle)
  const [lieferungen, lieferanten, bestellungen] = await Promise.all([
    prisma.lieferung.findMany({
      where: { betriebId: betrieb.id },
      orderBy: { datum: 'desc' },
      take: 20,
      include: { positionen: { select: { _count: { select: { abweichungen: true } } } } },
    }),
    prisma.lieferung.findMany({
      where: { betriebId: betrieb.id },
      distinct: ['lieferant'],
      select: { lieferant: true },
      take: 20,
    }),
    prisma.bestellung.findMany({
      where: { betriebId: betrieb.id, status: BestellStatus.VERSENDET },
      orderBy: { datum: 'desc' },
      take: 20,
    }),
  ])

  // Das Gerüst steht hier an der Seite selbst und nicht in einem Layout:
  // unter /lieferungen/[id] wohnen die Vollbild-Masken (Wareneingang, Preise,
  // Prüfung), die es nicht tragen dürfen.
  const inhalt = (
    // Breiter als die übrigen Masken, weil das Formular vier Felder und die
    // Schaltfläche in eine Zeile stellt. Enger bricht die Zeile um, und die
    // Schaltfläche stünde allein unter den Feldern, zu denen sie gehört.
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 md:max-w-6xl md:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-titel">Lieferungen</h1>
        <div className="flex items-center gap-3">
          {/* Bis es eine Startseite mit Navigation gibt, ist das der einzige Weg
              von hier zu den Bestellungen — und der Weg dorthin ist derselbe,
              den die Ware nimmt. Die Abweichungen sind der Rückweg: was an der
              Rampe auffiel, wird dort nachverfolgt. Auf dem Telefon laufen die
              beiden Links neben dem Titel aus dem Bild — dort stehen sie als
              Karten am Ende der Seite. */}
          {mitVerwaltung && (
            <>
              <Link
                href="/lieferungen/abweichungen"
                className="tap hidden min-h-tap items-center rounded-ctl px-2 text-sm font-medium whitespace-nowrap text-primary-text focus-visible:fokus md:inline-flex"
              >
                Abweichungen
              </Link>
              <Link
                href="/bestellungen"
                className="tap hidden min-h-tap items-center rounded-ctl px-2 text-sm font-medium whitespace-nowrap text-primary-text focus-visible:fokus md:inline-flex"
              >
                Bestellungen
              </Link>
            </>
          )}
          <Modusumschalter className="md:hidden" />
        </div>
      </div>

      {parameter.fehler === 'angaben' && (
        <div className="mt-4">
          <Hinweisleiste rolle="attention" titel="Es wurde kein Wareneingang begonnen">
            Ohne Lieferant und Belegnummer beginnt kein Wareneingang — Leerzeichen zählen nicht
            als Eingabe.
          </Hinweisleiste>
        </div>
      )}

      {/* Telefon: gestapelt in einem Band über die volle Breite, die
          Schaltfläche am Ende. Desktop: dieselbe Reihenfolge in einer Zeile auf
          einer Karte. Die Fläche trennt in beiden Fällen das Beginnen von dem,
          was schon da ist. */}
      <form
        action={wareneingangBeginnen}
        className="mt-4 -mx-4 flex flex-wrap items-end gap-tapgap border-y border-border bg-surface px-4 py-4 md:mx-0 md:mt-6 md:gap-3 md:rounded-xl md:border md:p-5"
      >
        <label className="flex w-full min-w-0 flex-col gap-1 md:w-56">
          <span className={BESCHRIFTUNG}>Lieferant</span>
          {/* Vorschläge statt Auswahlliste: der Name eines neuen Lieferanten
              muss sich tippen lassen, ohne ihn vorher anzulegen. */}
          <input
            name="lieferant"
            list="lieferanten"
            required
            autoComplete="off"
            placeholder="Name eingeben"
            className={`${FELD} placeholder:text-text-muted`}
          />
        </label>
        <datalist id="lieferanten">
          {lieferanten.map((eintrag) => (
            <option key={eintrag.lieferant} value={eintrag.lieferant} />
          ))}
        </datalist>

        <label className="flex min-w-0 flex-1 flex-col gap-1 md:w-40 md:flex-none">
          <span className={BESCHRIFTUNG}>Belegnummer</span>
          <input
            name="belegNr"
            required
            placeholder="LS-"
            className={`${FELD} font-mono text-base font-normal placeholder:text-text-muted`}
          />
        </label>

        <label className="flex w-36 flex-none flex-col gap-1 md:w-36">
          <span className={BESCHRIFTUNG}>Datum</span>
          <input type="date" name="datum" defaultValue={alsFeldwert(heute())} className={FELD} />
        </label>

        {/* Das Feld erscheint nur, wenn es überhaupt offene Bestellungen gibt —
            eine leere Auswahl wäre eine Frage ohne Antwortmöglichkeit. Ein
            gesperrtes Feld an dieser Stelle wäre ein Hinweis auf etwas, das es
            nicht gibt. */}
        {bestellungen.length > 0 && (
          <label className="flex w-full min-w-0 flex-col gap-1 md:w-56">
            <span className={BESCHRIFTUNG}>Bestellung</span>
            <select name="bestellungId" defaultValue="" className={FELD}>
              <option value="">ohne Bestellung</option>
              {bestellungen.map((bestellung) => (
                <option key={bestellung.id} value={bestellung.id}>
                  {bestellung.lieferant} · {alsDatumstext(bestellung.datum)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="w-full md:ml-auto md:w-auto">
          <Schaltflaeche type="submit" breit>
            Wareneingang beginnen
          </Schaltflaeche>
        </div>
      </form>

      {lieferungen.length === 0 ? (
        <div className="mt-6 md:mt-8">
          {/* Ohne zweite Schaltfläche: der Weg zur ersten Lieferung ist das
              Formular darüber, und es abzusenden gibt es nur einmal. */}
          <Leerzustand
            titel="Noch keine Lieferung erfasst."
            erklaerung="Oben stehen Lieferant, Belegnummer und Datum — damit beginnt die erste Wareneingangskontrolle."
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-tapgap md:mt-8">
          {lieferungen.map((lieferung) => {
            const stand = kontrollstand({
              geprueftAm: lieferung.geprueftAm,
              positionen: lieferung.positionen.length,
              abweichungen: lieferung.positionen.reduce(
                (summe, position) => summe + position._count.abweichungen,
                0,
              ),
            })

            return (
              <li key={lieferung.id}>
                <Link
                  href={`/lieferungen/${lieferung.id}`}
                  className="tap flex min-h-20 items-center gap-3 rounded-ctl border border-border bg-surface px-4 py-2 focus-visible:fokus md:min-h-19 md:gap-4 md:px-6"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-zeile">
                      <span className="md:hidden">{alsKurzdatum(lieferung.datum)}</span>
                      <span className="hidden md:inline">{alsDatumstext(lieferung.datum)}</span> ·{' '}
                      {lieferung.lieferant}
                    </span>
                    <span className="truncate font-mono text-abschnitt font-normal tracking-normal text-text-muted">
                      Beleg {lieferung.belegNr}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm text-text-muted md:text-base">
                    {stand.pruefung} ·{' '}
                    <span className={stand.betont ? 'text-attention-text' : undefined}>
                      {stand.umfang}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-text-muted">
                    ›
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/* Der mobile Ersatz für die ausgeblendeten Kopfzeilen-Links. */}
      {mitVerwaltung && (
        <nav className="mt-6 flex flex-col gap-tapgap md:hidden">
          <Link
            href="/lieferungen/abweichungen"
            className="tap flex h-tap items-center justify-between gap-3 rounded-ctl border border-border bg-surface px-4 focus-visible:fokus"
          >
            Abweichungen
            <span aria-hidden className="shrink-0 text-text-muted">
              ›
            </span>
          </Link>
          <Link
            href="/bestellungen"
            className="tap flex h-tap items-center justify-between gap-3 rounded-ctl border border-border bg-surface px-4 focus-visible:fokus"
          >
            Bestellungen
            <span aria-hidden className="shrink-0 text-text-muted">
              ›
            </span>
          </Link>
        </nav>
      )}
    </main>
  )

  return <Geruest aktiv="lieferungen">{inhalt}</Geruest>
}
