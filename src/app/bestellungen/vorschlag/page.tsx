/**
 * Der Bestellvorschlag: was fehlt, damit das Lager die nächsten Wochen trägt.
 *
 * Die Rechnung steht in src/lib/bestellung.ts, die Datenlage in
 * src/lib/bestellung-daten.ts. Hier stehen nur die Anzeige und die drei
 * Parameter, die den Bedarf aufspannen — Referenzfenster, Reichweite,
 * Saisonzuschlag.
 *
 * Die Parameter stehen in der Adresse und nicht im Zustand einer Komponente:
 * ein Vorschlag mit vier Wochen Reichweite ist eine andere Seite als einer mit
 * einer Woche, und beide sollen sich verschicken und neu laden lassen.
 */

import Link from 'next/link'

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import { alsFaktor, ausEingabe, summe, VORGABE, alsText, zeile, type Zeile } from '@/lib/bestellung'
import { vorschlagslage } from '@/lib/bestellung-daten'
import { alsDatumstext, alsFeldwert, heute } from '@/lib/datum'
import { prisma } from '@/lib/prisma'
import { Hinweisseite } from '@/ui/hinweisseite'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { Vorschlagsmaske } from './vorschlagsmaske'

export const dynamic = 'force-dynamic'

/**
 * Ein Feld des Parameterformulars — Beschriftung, Wert und Einheit in einer
 * Fläche.
 *
 * Die drei stehen nebeneinander im Kopf, weil sie zusammen die Frage stellen,
 * die der Vorschlag beantwortet: woraus der Verbrauch stammt, wie lange die
 * Bestellung tragen soll, wie viel Saison darauf kommt. Getrennt untereinander
 * läsen sie sich wie drei Einstellungen; nebeneinander wie ein Satz.
 */
function Parameter({
  name,
  beschriftung,
  wert,
  einheit,
  hinweis,
}: {
  name: string
  beschriftung: string
  wert: string
  einheit: string
  hinweis: string
}) {
  return (
    <div>
      <label className="flex h-tap items-center gap-2 rounded-ctl border border-border-strong bg-surface px-3">
        <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
          {beschriftung}
        </span>
        <input
          name={name}
          type="text"
          inputMode="decimal"
          defaultValue={wert}
          className="w-12 bg-transparent text-right text-base font-medium tabular-nums"
        />
        <span className="text-sm whitespace-nowrap text-text-muted">{einheit}</span>
      </label>
      <span className="mt-1 block text-xs text-text-muted">{hinweis}</span>
    </div>
  )
}

export default async function Page({ searchParams }: PageProps<'/bestellungen/vorschlag'>) {
  const suche = await searchParams
  const einzel = (name: string): string | null => {
    const wert = suche[name]
    return typeof wert === 'string' ? wert : null
  }

  const eingabe = ausEingabe({
    referenzTage: einzel('referenz'),
    reichweiteTage: einzel('reichweite'),
    saisonfaktor: einzel('saison'),
  })

  const { betrieb } = await pflichtBetriebsleiter()

  const lage = await vorschlagslage(betrieb.id, eingabe)
  if (lage === null) {
    return (
      <Hinweisseite
        titel="Noch kein Bestellvorschlag möglich"
        text="Ein Vorschlag braucht eine abgeschlossene Zählung — ohne gezählten Bestand wäre jede Menge geraten, und eine geratene Bestellung ist schlechter als keine."
        weiter={{ ziel: '/zaehlung', text: 'Zu den Zählungen' }}
      />
    )
  }

  const zeilen: Zeile[] = lage.artikel.map((artikel) =>
    zeile(artikel, lage.lage.get(artikel.id)!, lage.rahmen),
  )
  const gesamt = summe(zeilen)

  const lieferanten = await prisma.bestellung.findMany({
    where: { betriebId: betrieb.id },
    distinct: ['lieferant'],
    select: { lieferant: true },
    orderBy: { datum: 'desc' },
    take: 20,
  })
  const ausLieferungen = await prisma.lieferung.findMany({
    where: { betriebId: betrieb.id },
    distinct: ['lieferant'],
    select: { lieferant: true },
    orderBy: { datum: 'desc' },
    take: 20,
  })
  const namen = [
    ...new Set([...lieferanten, ...ausLieferungen].map((eintrag) => eintrag.lieferant)),
  ]

  // Wie viele Tage der Verbrauch tatsächlich belegt — steht neben dem
  // angefragten Fenster, damit ein halb gefüllter Import auffällt.
  const luecke = lage.referenz.angefragteTage - lage.rahmen.verbrauchTage

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bestellvorschlag</h1>
          <p className="mt-1 text-sm text-text-muted tabular-nums">
            Bestand vom {alsDatumstext(lage.zaehlung.datum)}, fortgeschrieben bis{' '}
            {alsDatumstext(lage.referenz.bis)} · Verbrauch aus {lage.rahmen.verbrauchTage}{' '}
            {lage.rahmen.verbrauchTage === 1 ? 'Tag' : 'Tagen'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Auf dem Telefon läuft der Link neben dem zweizeiligen Titel aus
              dem Bild — der Weg zu den Bestellungen ist dort die Seite, von
              der man kam. */}
          <Link
            href="/bestellungen"
            className="tap hidden min-h-tap items-center rounded-ctl px-2 text-sm font-medium whitespace-nowrap text-primary-text focus-visible:fokus md:inline-flex"
          >
            Bestellungen
          </Link>
          <Modusumschalter className="md:hidden" />
        </div>
      </div>

      <form
        method="get"
        className="mt-4 flex flex-wrap items-start gap-tapgap rounded-ctl border border-border p-3"
      >
        <Parameter
          name="referenz"
          beschriftung="Referenzfenster"
          wert={String(lage.referenz.angefragteTage)}
          einheit="Tage zurück"
          hinweis="woraus der Verbrauch stammt"
        />
        <Parameter
          name="reichweite"
          beschriftung="Reichweite"
          wert={String(lage.rahmen.reichweiteTage)}
          einheit="Tage"
          hinweis="wie lange die Bestellung tragen soll"
        />
        <Parameter
          name="saison"
          beschriftung="Saisonzuschlag"
          wert={alsFaktor(lage.rahmen.saisonfaktor)}
          einheit="× Verbrauch"
          hinweis={`1 heisst kein Zuschlag, Vorgabe ${alsFaktor(VORGABE.saisonfaktor)}`}
        />
        <Schaltflaeche type="submit">Neu rechnen</Schaltflaeche>
      </form>

      {!lage.mitUmsatzdaten && (
        <div className="mt-4 rounded-ctl bg-attention-soft p-3 text-sm text-attention-soft-on">
          <p className="font-medium">
            Für die letzten {lage.referenz.angefragteTage} Tage liegen keine Kassendaten vor.
          </p>
          <p className="mt-1">
            Ohne Verbrauch gibt es keinen Bedarf und damit keinen Vorschlag. Verbrauch, Bedarf und
            Fehlmenge zeigen unten den Strich — nicht weil nichts fehlt, sondern weil es niemand
            ausrechnen kann.
          </p>
          <Link href="/umsatz" className="mt-2 inline-block font-medium underline">
            Zum Umsatzimport
          </Link>
        </div>
      )}

      {lage.mitUmsatzdaten && luecke > 0 && (
        <div className="mt-4 rounded-ctl bg-attention-soft p-3 text-sm text-attention-soft-on">
          <p className="font-medium">
            Die Kassendaten decken {lage.rahmen.verbrauchTage} der {lage.referenz.angefragteTage}{' '}
            angefragten Tage.
          </p>
          <p className="mt-1">
            Gerechnet wird durch die belegten Tage, nicht durch das Fenster — der Tagesverbrauch
            bleibt damit richtig. Fehlt ein ganzer Import, fehlt aber auch sein Verbrauch.
          </p>
        </div>
      )}

      {lage.ohneZuordnung.length > 0 && (
        <div className="mt-4 rounded-ctl bg-attention-soft p-3 text-sm text-attention-soft-on">
          <p className="font-medium">
            {lage.ohneZuordnung.length === 1
              ? '1 Kassenbezeichnung ist keinem Artikel zugeordnet'
              : `${lage.ohneZuordnung.length} Kassenbezeichnungen sind keinem Artikel zugeordnet`}{' '}
            — der Verbrauch ist unvollständig.
          </p>
          <p className="mt-1">
            Ihre Verkäufe fehlen im Bedarf. Der Vorschlag unten ist damit eher zu klein als zu
            gross.
          </p>
          <Link href="/umsatz/zuordnung" className="mt-2 inline-block font-medium underline">
            Zur Zuordnung
          </Link>
        </div>
      )}

      {gesamt.ohneBestand > 0 && (
        <div className="mt-4 rounded-ctl bg-attention-soft p-3 text-sm text-attention-soft-on">
          <p className="font-medium">
            {gesamt.ohneBestand} {gesamt.ohneBestand === 1 ? 'Artikel wurde' : 'Artikel wurden'} am{' '}
            {alsDatumstext(lage.zaehlung.datum)} nicht gezählt.
          </p>
          <p className="mt-1">
            Für sie deckt der Vorschlag den ganzen Bedarf, als wäre das Regal leer. Die Zeilen sind
            unten gekennzeichnet — wer weiss, dass dort etwas steht, streicht die Menge von Hand.
          </p>
        </div>
      )}

      {/* Die Kennzahlen stehen in der Maske und nicht hier: Bestellsumme und
          Handeingriffe ändern sich mit jeder korrigierten Menge, und eine hier
          gerechnete Summe wäre ab dem ersten Tastendruck falsch. */}
      <Vorschlagsmaske
        zeilen={zeilen.map((eintrag) => alsText(eintrag, lage.rahmen, lage.mitUmsatzdaten))}
        lieferanten={namen}
        datumVorgabe={alsFeldwert(heute())}
      />

      <p className="mt-6 text-xs text-text-muted">
        Bestellmengen sind ganze Liefergebinde und immer aufgerundet — halbe Kästen liefert niemand.
        Was die Aufrundung über den Bedarf hinaus bringt, steht je Zeile als Überdeckung.
      </p>
    </main>
  )
}

