/**
 * Die Arbeitsliste: welche Kassenbezeichnung meint welchen Lagerartikel.
 *
 * Ein Jahresexport bringt rund fünfzehnhundert Bezeichnungen mit, und die
 * allermeisten sind Speisen und Sonderwünsche, die kein Getränkelager berühren.
 * Deshalb steht hier nicht der Artikelstamm im Mittelpunkt, sondern die offene
 * Frage — sortiert nach gebuchter Menge, damit die vierhundert Gläser Veltins
 * vor dem einen Espresso stehen.
 *
 * Dies ist der fehleranfälligste Bildschirm der App: hier entscheidet sich, ob
 * die Schwundrechnung stimmt. Eine falsch gesetzte Zahl fällt niemandem auf —
 * der Bestand geht auf, und der Schwund wandert still in die Auswertung.
 * Deshalb steht neben jedem Feld, was es tatsächlich abzieht, und deshalb gilt
 * keine Zeile, bevor sie einmal von Hand bestätigt wurde.
 *
 * Filter und Suche laufen über die Adresse und nicht im Browser: bei
 * fünfzehnhundert Bezeichnungen wäre ein Filter über die vierzig geladenen
 * Zeilen eine Behauptung und keine Auskunft.
 */

import Link from 'next/link'

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { zaehler } from '@/lib/kassenzuordnung-anzeige'
import { schlageZuordnungVor, type Zuordnungskandidat } from '@/lib/kassenzuordnung'
import { prisma } from '@/lib/prisma'
import { Fortschrittsbalken } from '@/ui/fortschrittsbalken'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Wegflaeche } from '@/ui/wegflaeche'
import { Leerzustand } from '@/ui/zustand'

import { Zuordnungsliste } from './liste'
import { Taste, type Auswahleintrag, type Zeilendaten } from './zeile'

export const dynamic = 'force-dynamic'

/** Wie viele Zeilen auf einmal. Mehr wäre eine Seite, die niemand zu Ende liest. */
const SCHRITT = 40

/**
 * Die drei Beispiele, an denen „Menge je Verkauf" hängt.
 *
 * Sie stehen als Text und nicht als gerechnete Werte da: es sind Merksätze für
 * den Kopf des Bildschirms, keine Zahlen aus den Daten. Wer sie ausrechnen
 * liesse, hätte eine zweite Rechenstelle für eine Erklärung.
 */
const BEISPIELE = [
  {
    titel: 'Glas aus der Flasche',
    zahl: '0,3 l',
    formel: '0,3 l ÷ 1,0 l = 0,3 Fl.',
    text: 'Ein Glas Cola — den Flaschenanteil rechnet die App.',
  },
  {
    titel: 'Schnaps aus der Flasche',
    zahl: '4 cl',
    formel: '0,04 l ÷ 0,7 l = 0,057 Fl.',
    text: 'Rund 17 Ausschänke gehen aus einer 0,7er.',
  },
  {
    titel: 'Flasche über die Theke',
    zahl: '1 Fl.',
    formel: '1 Fl. ÷ 1 Fl. = 1',
    text: 'Eine Buchung, eine Flasche aus dem Kasten.',
  },
]

export default async function Page({ searchParams }: PageProps<'/umsatz/zuordnung'>) {
  const parameter = await searchParams
  // Vorgabe ist die Arbeitsliste: wer hierher kommt, will das Offene sehen.
  const nurOffene = parameter.alle !== '1'
  const suche = typeof parameter.suche === 'string' ? parameter.suche.trim() : ''
  const anzahl = Math.max(SCHRITT, Number(parameter.anzahl) || SCHRITT)

  const { betrieb } = await pflichtBetriebsleiter()

  const filter = {
    betriebId: betrieb.id,
    ...(nurOffene ? { bestaetigt: false } : {}),
    ...(suche === ''
      ? {}
      : { posBezeichnung: { contains: suche, mode: 'insensitive' as const } }),
  }

  const [bezeichnungen, gesamtGefiltert, gesamt, offen, artikel, mengen] = await Promise.all([
    prisma.kassenartikel.findMany({
      where: filter,
      include: { bestandteile: true },
      orderBy: { posBezeichnung: 'asc' },
    }),
    prisma.kassenartikel.count({ where: filter }),
    prisma.kassenartikel.count({ where: { betriebId: betrieb.id } }),
    prisma.kassenartikel.count({ where: { betriebId: betrieb.id, bestaetigt: false } }),
    prisma.artikel.findMany({
      where: { betriebId: betrieb.id, aktiv: true },
      orderBy: [{ kategorie: 'asc' }, { sortierung: 'asc' }],
    }),
    // Die gebuchte Menge je Bezeichnung über alle Importe — sie bestimmt die
    // Reihenfolge. Eine Bezeichnung mit vierhundert Buchungen kostet ungeprüft
    // vierhundertmal so viel wie eine mit einer.
    prisma.umsatzposition.groupBy({
      by: ['posBezeichnung'],
      where: { betriebId: betrieb.id },
      _sum: { menge: true },
    }),
  ])

  const jeBezeichnung = new Map(
    mengen.map((eintrag) => [eintrag.posBezeichnung, Number(eintrag._sum.menge ?? 0)]),
  )

  // Grösste Menge zuerst, bei Gleichstand alphabetisch. Die Sortierung passiert
  // hier und nicht in der Datenbank: die Menge steht in einer anderen Tabelle
  // und hängt am Text, nicht an einem Fremdschlüssel.
  const sortiert = [...bezeichnungen].sort(
    (a, b) =>
      (jeBezeichnung.get(b.posBezeichnung) ?? 0) - (jeBezeichnung.get(a.posBezeichnung) ?? 0) ||
      a.posBezeichnung.localeCompare(b.posBezeichnung, 'de'),
  )

  const kandidaten: Zuordnungskandidat[] = artikel
  const auswahl: Auswahleintrag[] = artikel.map((eintrag) => ({
    id: eintrag.id,
    name: eintrag.name,
    gebindeText: eintrag.lieferGebindeText,
    kategorie: eintrag.kategorie,
    zaehlmodus: eintrag.zaehlmodus,
    einheitsgroesseLiter: eintrag.einheitsgroesseLiter.toString(),
  }))

  const zeilen: Zeilendaten[] = sortiert.slice(0, anzahl).map((eintrag) => ({
    id: eintrag.id,
    posBezeichnung: eintrag.posBezeichnung,
    bestaetigt: eintrag.bestaetigt,
    notiz: eintrag.notiz,
    verkaeufe: jeBezeichnung.get(eintrag.posBezeichnung) ?? 0,
    // Der rohe Anteil mit Punkt: die Zeile rechnet ihn in die lesbarste
    // Mengenangabe um, und die Umrechnung liest Punktzahlen.
    bestandteile: eintrag.bestandteile.map((bestandteil) => ({
      artikelId: bestandteil.artikelId,
      einheitenProVerkauf: bestandteil.einheitenProVerkauf.toString(),
    })),
    // Vorschläge nur, wo noch nichts steht: eine geprüfte Zuordnung soll nicht
    // neben einem Rateergebnis stehen, das ihr widerspricht.
    vorschlaege:
      eintrag.bestandteile.length === 0
        ? schlageZuordnungVor(eintrag.posBezeichnung, kandidaten)
        : [],
  }))

  const stand = zaehler(offen, gesamt)
  const weiter = (mehr: Record<string, string>) => {
    const teile = new URLSearchParams()
    if (!nurOffene) teile.set('alle', '1')
    if (suche !== '') teile.set('suche', suche)
    for (const [name, wert] of Object.entries(mehr)) teile.set(name, wert)
    const text = teile.toString()
    return text === '' ? '/umsatz/zuordnung' : `/umsatz/zuordnung?${text}`
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-titel">Kasse zu Artikelstamm zuordnen</h1>
          <p className="mt-2 max-w-[80ch] text-base text-text-muted">
            Links steht, was die Kasse gebucht hat. Rechts steht, was das vom Bestand abzieht.
            Keine Zeile gilt, bevor sie einmal von Hand bestätigt wurde.
          </p>
          {/* Nicht im Fliesstext: als Handlung braucht der Querverweis seine
              56 px, und die sprengten die Zeile des Satzes. */}
          <div className="flex flex-wrap gap-tapgap">
            <Link
              href="/umsatz"
              className="tap -ml-2 inline-flex min-h-tap items-center self-start rounded-ctl px-2 font-medium text-primary-text focus-visible:fokus"
            >
              Zurück zum Kassenimport
            </Link>
            {/* Die Leseansicht dessen, was hier bestätigt wird. */}
            <Link
              href="/rezepturen"
              className="tap inline-flex min-h-tap items-center self-start rounded-ctl px-2 font-medium text-primary-text focus-visible:fokus"
            >
              Rezepturen ansehen
            </Link>
          </div>
        </div>
        <Modusumschalter className="md:hidden" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-ctl border border-border bg-surface p-3">
        <p className="flex h-tap items-center gap-2.5 rounded-ctl bg-attention-soft px-3.5 font-semibold text-attention-soft-on">
          <span aria-hidden className="size-2 rounded-full bg-attention" />
          {stand.text}
        </p>
        <div className="w-36">
          <Fortschrittsbalken anteil={stand.prozent / 100} rolle="confirm" />
          <p className="mt-1.5 text-sm text-text-muted">{stand.bestaetigtText}</p>
        </div>

        <form className="ml-auto flex flex-wrap items-center gap-tapgap" action="/umsatz/zuordnung">
          {!nurOffene && <input type="hidden" name="alle" value="1" />}
          <label className="sr-only" htmlFor="suche">
            Bezeichnung suchen
          </label>
          <input
            id="suche"
            name="suche"
            type="search"
            defaultValue={suche}
            placeholder="Bezeichnung suchen"
            className="h-tap w-56 rounded-ctl border border-border bg-surface px-3.5 text-base"
          />
          <Schaltflaeche type="submit" art="sekundaer">
            Suchen
          </Schaltflaeche>
        </form>

        <Link
          href={nurOffene ? weiter({ alle: '1' }) : '/umsatz/zuordnung'}
          aria-pressed={nurOffene}
          className={`tap flex h-tap items-center gap-2.5 rounded-ctl px-4 text-base font-medium ${
            nurOffene
              ? 'border border-primary bg-primary-soft font-semibold text-primary-soft-on'
              : 'border border-border bg-surface'
          }`}
        >
          <span
            aria-hidden
            className={`flex h-5 w-9 items-center rounded-full p-0.5 ${
              nurOffene ? 'justify-end bg-primary' : 'bg-text-muted'
            }`}
          >
            <span className="size-4 rounded-full bg-surface" />
          </span>
          nur offene
        </Link>
      </div>

      <section className="mt-4 rounded-ctl border border-border bg-surface p-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex-1">
            <p className="text-abschnitt text-text-muted uppercase">Das Feld in der Mitte</p>
            <h2 className="mt-2 text-zeile text-xl font-semibold">Menge je Verkauf</h2>
            <p className="mt-2 max-w-[64ch] text-base text-text-muted">
              Die Menge sagt, was eine einzelne Kassenbuchung ausschenkt — in cl, Litern
              oder ganzen Flaschen. Den Anteil am Gebinde rechnet die App daraus selbst.
            </p>
            <p className="mt-3 inline-block rounded-ctl border border-border px-3.5 py-2.5 font-mono text-sm font-normal tracking-normal">
              Verkäufe × Menge je Verkauf = Abzug vom Bestand
            </p>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-3 lg:w-[660px] lg:shrink-0">
            {BEISPIELE.map((beispiel) => (
              <li
                key={beispiel.titel}
                className="rounded-ctl border border-border bg-surface p-3.5"
              >
                <p className="text-sm font-semibold">{beispiel.titel}</p>
                <p className="mt-2 flex items-baseline gap-2.5">
                  <span className="text-3xl leading-none font-semibold whitespace-nowrap text-primary-text">
                    {beispiel.zahl}
                  </span>
                  <span className="font-mono text-xs font-normal tracking-normal text-text-muted">
                    {beispiel.formel}
                  </span>
                </p>
                <p className="mt-2 text-sm text-text-muted">{beispiel.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 border-t border-border pt-3.5 text-sm text-text-muted">
          Eine falsch gesetzte Zahl fällt niemandem auf: der Bestand geht auf, der Schwund
          wandert still in die Auswertung. Deshalb steht neben jedem Feld im Klartext, was es
          tatsächlich abzieht.
        </p>
      </section>

      {artikel.length === 0 && (
        <div className="mt-4">
          <Hinweisleiste rolle="attention" titel="Der Artikelstamm ist leer" aktion={
            <Link
              href="/artikel/neu"
              className="tap flex h-tap w-full shrink-0 items-center justify-center rounded-ctl border border-attention bg-surface px-4 text-sm font-semibold text-attention-text focus-visible:fokus sm:w-auto"
            >
              Ersten Artikel anlegen
            </Link>
          }>
            Ohne Artikel gibt es nichts, worauf sich eine Bezeichnung beziehen könnte.
          </Hinweisleiste>
        </div>
      )}

      {zeilen.length === 0 ? (
        <div className="mt-6">
          {suche !== '' ? (
            <Leerzustand
              titel={`Keine Bezeichnung enthält „${suche}“`}
              erklaerung={
                nurOffene
                  ? 'Gesucht wurde nur in den offenen Bezeichnungen.'
                  : 'Gesucht wurde in allen importierten Bezeichnungen.'
              }
              handlung={
                <Wegflaeche
                  href={nurOffene ? '/umsatz/zuordnung' : '/umsatz/zuordnung?alle=1'}
                  art="sekundaer"
                >
                  Suche zurücksetzen
                </Wegflaeche>
              }
            />
          ) : nurOffene ? (
            <Leerzustand
              titel="Keine offene Bezeichnung"
              erklaerung="Jede importierte Kassenbezeichnung ist zugeordnet oder ausgenommen."
              handlung={
                <Wegflaeche href="/umsatz/zuordnung?alle=1" art="sekundaer">
                  Alle Bezeichnungen ansehen
                </Wegflaeche>
              }
            />
          ) : (
            <Leerzustand
              titel="Noch keine Kassenbezeichnung importiert"
              erklaerung="Die Bezeichnungen kommen mit dem Kassenexport — erst der Import bringt sie in diese Liste."
              handlung={
                <Wegflaeche href="/umsatz" art="sekundaer">
                  Zum Kassenimport
                </Wegflaeche>
              }
            />
          )}
        </div>
      ) : (
        <div className="mt-4">
          <Zuordnungsliste zeilen={zeilen} auswahl={auswahl} />
        </div>
      )}

      {gesamtGefiltert > zeilen.length && (
        <Link
          href={weiter({ anzahl: String(anzahl + SCHRITT) })}
          className="tap mt-4 flex h-tap w-full items-center justify-center rounded-ctl bg-surface-2 text-base font-medium"
        >
          Weitere {Math.min(SCHRITT, gesamtGefiltert - zeilen.length)} von{' '}
          {gesamtGefiltert - zeilen.length} zeigen
        </Link>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm text-text-muted">
        <Taste zeichen="tab" text="nächste Zeile" />
        <Taste zeichen="a–z" text="Artikel suchen und wählen" />
        <Taste zeichen="0–9" text="Menge je Verkauf" />
        <Taste zeichen="↵" text="bestätigen und weiter" />
        <span className="ml-auto">
          {offen === 0
            ? 'Alle Bezeichnungen sind bestätigt.'
            : `${offen} offene Zeilen bleiben ohne Wirkung auf den Sollbestand.`}
        </span>
      </div>
    </main>
  )
}
