/**
 * Die Rezepturen: was eine Kassenbuchung aus dem Lager nimmt, als lesbare
 * Karte — die Betriebsdokumentation der Theke und die Leseansicht der
 * Zuordnung.
 *
 * Geändert wird hier nichts. Jede Karte — und in der Artikelansicht jedes
 * Getränk auf ihr — führt in die Zuordnungsmaske mit vorbefüllter Suche; eine
 * zweite Schreibstelle für dieselben Bestandteile liefe auseinander. Gerechnet
 * wird auch nichts: Mengentexte, Herkunft und Gruppierung kommen aus
 * src/lib/rezeptur.ts.
 *
 * Zwei Ansichten über denselben Zeilen, umgeschaltet über die URL — die Seite
 * bleibt damit teilbar und ohne Client-Zustand:
 *  - "Nach Getränk": Ausschank und Mischung als Karten, die vollen Flaschen
 *    als Kompaktliste. Hundert Zeilen "eine Buchung, eine Flasche" würden
 *    sonst die zwanzig Rezepturen begraben, an denen etwas zu wissen ist.
 *  - "Nach Artikel": die Umkehrung, für die Schwundfrage "Wer verbraucht
 *    meinen Prosecco?".
 */

import Link from 'next/link'

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { prisma } from '@/lib/prisma'
import {
  nachArtikel,
  nachGetraenk,
  type Flaschenzeile,
  type Getraenkekarte,
  type Rezepturzeile,
} from '@/lib/rezeptur'
import { Modusumschalter } from '@/ui/modus'
import { Wegflaeche } from '@/ui/wegflaeche'
import { Leerzustand } from '@/ui/zustand'

// Ohne diese Zeile rendert der Build die Seite einmal und friert sie ein —
// eine heute bestätigte Zuordnung stünde dann morgen noch als Vorschlag da.
export const dynamic = 'force-dynamic'

/** Die Überschrift eines Abschnitts: Versalien, leiser als das darunter. */
const ABSCHNITT = 'text-abschnitt uppercase text-text-muted'

export default async function Page({ searchParams }: PageProps<'/rezepturen'>) {
  const parameter = await searchParams
  const ansicht = parameter.ansicht === 'artikel' ? 'artikel' : 'getraenk'
  const suche = typeof parameter.suche === 'string' ? parameter.suche.trim() : ''

  const { betrieb } = await pflichtBetriebsleiter()

  // Nur Bezeichnungen, an denen Bestandteile hängen: eine Rezeptur ist, was
  // etwas abzieht. Ausgenommene und offene Zeilen gehören in die Zuordnung.
  const kassenartikel = await prisma.kassenartikel.findMany({
    where: { betriebId: betrieb.id, bestandteile: { some: {} } },
    include: {
      bestandteile: {
        include: {
          artikel: {
            select: {
              name: true,
              lieferGebindeText: true,
              einheitsgroesseLiter: true,
              zaehlmodus: true,
            },
          },
        },
      },
    },
  })

  const zeilen: Rezepturzeile[] = kassenartikel.map((eintrag) => ({
    posBezeichnung: eintrag.posBezeichnung,
    bestaetigt: eintrag.bestaetigt,
    bestandteile: eintrag.bestandteile.map((teil) => ({
      artikel: teil.artikel,
      einheitenProVerkauf: teil.einheitenProVerkauf,
    })),
  }))

  // Ein Anzeigefilter, keine Rechnung: die Gruppierung braucht ohnehin alle
  // Zeilen im Speicher, deshalb filtert die Seite und nicht die Datenbank.
  const treffer =
    suche === ''
      ? zeilen
      : zeilen.filter(
          (zeile) =>
            enthaelt(zeile.posBezeichnung, suche) ||
            zeile.bestandteile.some((teil) => enthaelt(teil.artikel.name, suche)),
        )

  const weiter = (aenderung: Record<string, string>) => {
    const teile = new URLSearchParams()
    if (ansicht === 'artikel') teile.set('ansicht', 'artikel')
    if (suche !== '') teile.set('suche', suche)
    for (const [name, wert] of Object.entries(aenderung)) {
      if (wert === '') teile.delete(name)
      else teile.set(name, wert)
    }
    const text = teile.toString()
    return text === '' ? '/rezepturen' : `/rezepturen?${text}`
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 md:max-w-6xl md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-titel">Rezepturen</h1>
          <p className="mt-2 max-w-[80ch] text-base text-text-muted">
            Was eine Kassenbuchung aus dem Lager nimmt. Es zählt nur, was in der Zuordnung
            bestätigt wurde — ändern lässt sich eine Rezeptur dort, nicht hier.
          </p>
          {/* Auf dem Telefon läuft der Link neben dem Titel aus dem Bild —
              dort steht er als Fläche am Ende der Seite. */}
          <Link
            href="/umsatz/zuordnung"
            className="tap -ml-2 hidden min-h-tap items-center self-start rounded-ctl px-2 font-medium text-primary-text focus-visible:fokus md:inline-flex"
          >
            Zur Zuordnung
          </Link>
        </div>
        <Modusumschalter className="md:hidden" />
      </div>

      <div className="mt-4 flex flex-col gap-tapgap md:mt-5 md:flex-row md:flex-wrap md:items-center">
        <form className="flex flex-1 gap-tapgap" action="/rezepturen">
          {ansicht === 'artikel' && <input type="hidden" name="ansicht" value="artikel" />}
          <label className="sr-only" htmlFor="suche">
            Getränk oder Artikel suchen
          </label>
          <input
            id="suche"
            name="suche"
            type="search"
            defaultValue={suche}
            placeholder="Getränk oder Artikel suchen"
            className="h-tap w-full min-w-0 rounded-ctl border border-border bg-surface px-3.5 text-base md:w-72"
          />
          <button
            type="submit"
            className="tap h-tap shrink-0 rounded-ctl border border-border bg-surface px-4 text-base font-medium focus-visible:fokus"
          >
            Suchen
          </button>
        </form>

        {/* Der Umschalter als zwei Wege über die URL — Filter, nicht Handlung;
            dasselbe Muster wie "nur offene" in der Zuordnung. */}
        <div role="group" aria-label="Ansicht" className="flex gap-tapgap">
          <Ansichtssegment aktiv={ansicht === 'getraenk'} href={weiter({ ansicht: '' })}>
            Nach Getränk
          </Ansichtssegment>
          <Ansichtssegment aktiv={ansicht === 'artikel'} href={weiter({ ansicht: 'artikel' })}>
            Nach Artikel
          </Ansichtssegment>
        </div>
      </div>

      {zeilen.length === 0 ? (
        <div className="mt-6">
          <Leerzustand
            titel="Noch keine Rezepturen"
            erklaerung="Rezepturen entstehen in der Zuordnung: sobald eine Kassenbezeichnung Artikel zugeordnet hat, steht sie hier."
            handlung={<Wegflaeche href="/umsatz/zuordnung">Zur Zuordnung</Wegflaeche>}
          />
        </div>
      ) : treffer.length === 0 ? (
        <div className="mt-6">
          <Leerzustand
            titel={`Nichts zu "${suche}"`}
            erklaerung="Kein Getränk und kein Artikel trägt diesen Namen. Die Schreibweise der Kasse weicht mitunter ab — ein Wortteil findet mehr."
          />
        </div>
      ) : ansicht === 'getraenk' ? (
        <NachGetraenk zeilen={treffer} />
      ) : (
        <NachArtikel zeilen={treffer} />
      )}

      <div className="mt-8 md:hidden">
        <Wegflaeche href="/umsatz/zuordnung" art="sekundaer" breit>
          Zuordnung öffnen — Rezeptur ändern
        </Wegflaeche>
      </div>
    </main>
  )
}

/** Wortteil-Suche ohne Rücksicht auf Gross- und Kleinschreibung. */
function enthaelt(text: string, teil: string): boolean {
  return text.toLocaleLowerCase('de').includes(teil.toLocaleLowerCase('de'))
}

/** Ein Segment des Ansicht-Umschalters — ein Link, der aussieht wie gewählt. */
function Ansichtssegment({
  aktiv,
  href,
  children,
}: {
  aktiv: boolean
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-pressed={aktiv}
      className={`tap flex h-tap flex-1 items-center justify-center rounded-ctl border px-3.5 text-base whitespace-nowrap focus-visible:fokus md:flex-none ${
        aktiv
          ? 'border-primary bg-primary-soft font-semibold text-primary-soft-on'
          : 'border-border-strong bg-surface text-text-muted'
      }`}
    >
      {children}
    </Link>
  )
}

/** Der Bernstein-Punkt an einer unbestätigten Zeile. */
function Vorschlagschip() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-attention-text">
      <span aria-hidden className="size-2 rounded-full bg-attention" />
      Vorschlag
    </span>
  )
}

/** Die Karte, die eine Zeile in die Zuordnungsmaske trägt. */
const KARTE =
  'tap block rounded-xl border border-border bg-surface p-4 focus-visible:fokus'

function NachGetraenk({ zeilen }: { zeilen: readonly Rezepturzeile[] }) {
  const { mischungen, flaschen } = nachGetraenk(zeilen)

  return (
    <>
      {mischungen.length > 0 && (
        <section className="mt-6">
          <h2 className={ABSCHNITT}>Ausschank und Mischung</h2>
          <p className="mt-1 text-sm text-text-muted">
            {mischungen.length === 1
              ? 'Eine Rezeptur mit Portion oder mehreren Artikeln'
              : `${mischungen.length} Rezepturen mit Portion oder mehreren Artikeln`}
          </p>
          <div className="mt-3 flex flex-col gap-tapgap md:grid md:grid-cols-2 xl:grid-cols-3">
            {mischungen.map((karte) => (
              <Getraenkkarte key={karte.posBezeichnung} karte={karte} />
            ))}
          </div>
        </section>
      )}

      {flaschen.length > 0 && (
        <section className="mt-8">
          <h2 className={ABSCHNITT}>Flasche über die Theke</h2>
          <p className="mt-1 text-sm text-text-muted">
            {flaschen.length === 1
              ? 'Eine Bezeichnung · eine Buchung, eine Flasche'
              : `${flaschen.length} Bezeichnungen · eine Buchung, eine Flasche`}
          </p>
          <div className="mt-3 flex flex-col gap-tapgap md:grid md:grid-cols-2 xl:grid-cols-3">
            {flaschen.map((zeile) => (
              <Flaschenkarte key={zeile.posBezeichnung} zeile={zeile} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function Getraenkkarte({ karte }: { karte: Getraenkekarte }) {
  return (
    <Link href={zuordnungsweg(karte.posBezeichnung)} className={KARTE}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-zeile font-semibold">{karte.posBezeichnung}</span>
        {!karte.bestaetigt && <Vorschlagschip />}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {karte.zutaten.map((zutat) => (
          <div key={`${zutat.artikel}-${zutat.menge}`} className="flex items-baseline gap-3">
            <span className="w-18 shrink-0 font-semibold">{zutat.menge}</span>
            <span className="min-w-0">
              {zutat.artikel}
              <span className="block text-sm text-text-muted">{zutat.herkunft}</span>
            </span>
          </div>
        ))}
      </div>
    </Link>
  )
}

function Flaschenkarte({ zeile }: { zeile: Flaschenzeile }) {
  return (
    <Link
      href={zuordnungsweg(zeile.posBezeichnung)}
      className={`${KARTE} flex min-h-tap items-center justify-between gap-3 py-2`}
    >
      <span className="min-w-0 text-base font-medium">{zeile.posBezeichnung}</span>
      <span className="flex min-w-0 shrink-0 items-center gap-3 text-sm text-text-muted">
        {!zeile.bestaetigt && <Vorschlagschip />}
        {zeile.artikelText}
      </span>
    </Link>
  )
}

function NachArtikel({ zeilen }: { zeilen: readonly Rezepturzeile[] }) {
  const karten = nachArtikel(zeilen)

  return (
    <div className="mt-6 flex flex-col gap-tapgap md:grid md:grid-cols-2 xl:grid-cols-3">
      {karten.map((karte) => (
        <div key={`${karte.artikel} · ${karte.gebindeText}`} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-zeile font-semibold">{karte.artikel}</span>
            <span className="shrink-0 text-sm text-text-muted">{karte.gebindeText}</span>
          </div>
          {/* Jedes Getränk ist eine eigene Fläche und nicht die Karte als
              Ganzes: die Karte bündelt mehrere Rezepturen, und der Weg in die
              Zuordnung braucht genau eine. */}
          <div className="mt-2.5 flex flex-col gap-tapgap">
            {karte.abnehmer.map((abnehmer) => (
              <Link
                key={abnehmer.posBezeichnung}
                href={zuordnungsweg(abnehmer.posBezeichnung)}
                className="tap flex min-h-tap items-center gap-3 rounded-ctl border border-border bg-surface px-3 focus-visible:fokus"
              >
                <span className="w-18 shrink-0 font-semibold">{abnehmer.menge}</span>
                <span className="min-w-0 flex-1">{abnehmer.posBezeichnung}</span>
                {!abnehmer.bestaetigt && <Vorschlagschip />}
              </Link>
            ))}
          </div>
          <p className="mt-3 border-t border-border pt-2.5 text-sm text-text-muted">
            {karte.fusszeile}
          </p>
        </div>
      ))}
    </div>
  )
}

/** Der Weg in die Zuordnung, mit der Bezeichnung als vorbefüllter Suche. */
function zuordnungsweg(posBezeichnung: string): string {
  return `/umsatz/zuordnung?alle=1&suche=${encodeURIComponent(posBezeichnung)}`
}
