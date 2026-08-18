/**
 * Eine Bestellung: was bestellt ist, was sie kostet, was darauf geliefert wurde —
 * und solange sie offen ist, die Möglichkeit, das zu ändern.
 *
 * Die Positionsliste liegt in `positionsmaske.tsx` und trägt alle vier Stände
 * sowie den Ausdruck. Diese Seite bringt den Kopf, den Vergleich mit dem heute
 * gerechneten Vorschlag und die Statuswechsel.
 *
 * Der Vorschlag kommt ausdrücklich mit den Vorgabeparametern und nicht mit denen
 * der Vorschlagsseite: er ist hier ein Vergleichswert, keine Vorgabe. Fehlt eine
 * abgeschlossene Zählung, fehlt er ganz — 0 wäre keine Auskunft, sondern eine
 * falsche.
 *
 * Alle aktiven Artikel gehen an die Maske, nicht nur die bestellten: einen Artikel
 * dazunehmen heisst hier, seine Menge von 0 hochzusetzen. Eine eigene Suchmaske
 * dafür wäre ein zweiter Weg zu derselben Sache.
 */

import { Decimal } from '@prisma/client/runtime/client'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BestellStatus } from '@/generated/prisma/enums'
import {
  gelieferteGebinde,
  lieferstand,
  naechsteStati,
  positionenAenderbar,
  statusText,
  VORGABE,
  wechselText,
  zeile as vorschlagszeile,
  type Bestellzeile,
} from '@/lib/bestellung'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { alsMenge } from '@/lib/auswertung'
import { vorschlagslage } from '@/lib/bestellung-daten'
import {
  DOERLEMANN_MAIL,
  formularmengen,
  istDoerlemann,
} from '@/lib/doerlemann-formular'
import { gebindeAusEinheiten } from '@/lib/einheiten'
import { alsDatumstext } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'
import { alsEingabe } from '@/lib/zaehlung'
import { flaechenfassung } from '@/ui/wegflaeche'

import { entwurfVerwerfen, statusSetzen } from '../aktionen'
import { Druckknopf } from './druckknopf'
import { Positionsmaske } from './positionsmaske'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: PageProps<'/bestellungen/[id]'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  // Über Id und Betrieb gesucht: eine fremde Bestellung ist damit nicht gefunden.
  const betrieb = await aktuellerBetrieb()
  const bestellung = await prisma.bestellung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: {
      betrieb: true,
      positionen: {
        include: {
          lieferpositionen: {
            include: {
              lieferung: { select: { belegNr: true, geprueftAm: true } },
            },
          },
        },
      },
    },
  })
  if (bestellung === null) notFound()

  const aenderbar = positionenAenderbar(bestellung.status)

  const [stamm, lage] = await Promise.all([
    prisma.artikel.findMany({
      where: { betriebId: bestellung.betriebId, aktiv: true },
      omit: { einheitsgroesseLiter: true },
      orderBy: [{ kategorie: 'asc' }, { sortierung: 'asc' }],
    }),
    // Nur wo geändert werden darf: bei einer abgeschlossenen Bestellung wäre der
    // heutige Vorschlag eine Zahl über einen Bestand, den es damals nicht gab.
    aenderbar ? vorschlagslage(bestellung.betriebId, VORGABE) : Promise.resolve(null),
  ])

  const positionen = new Map(
    bestellung.positionen.map((position) => [position.artikelId, position]),
  )

  const zeilen: Bestellzeile[] = stamm.map((artikel) => {
    const position = positionen.get(artikel.id)

    // Was als geliefert zählt, entscheidet `gelieferteGebinde` — dieselbe
    // Regel wie in der Liste: nur geprüfte Lieferungen sind ein Zugang.
    const geliefert =
      position === undefined ? null : gelieferteGebinde(position.lieferpositionen)

    const rechnung = lage?.lage.get(artikel.id)

    // Einmal gerechnet, zweimal gezeigt: Vorschlag und Bestand kommen aus
    // derselben Zeile des Vorschlags.
    const vergleich =
      lage === undefined || lage === null || rechnung === undefined
        ? null
        : vorschlagszeile(artikel, rechnung, lage.rahmen)

    return {
      artikel,
      artikelId: artikel.id,
      name: artikel.name,
      kategorie: artikel.kategorie,
      lieferGebindeText: artikel.lieferGebindeText,
      mengeGebinde: position === undefined ? 0 : Number(position.anzahlGebinde),
      geliefert: geliefert === null ? null : alsEingabe(geliefert.toString()),
      // Gesperrt schon bei einer ungeprüften Lieferposition: die Fremdschlüssel
      // zeigt auch dann darauf, und die Datenbank lässt das Löschen nicht zu.
      gesperrt: (position?.lieferpositionen.length ?? 0) > 0,
      vorschlagGebinde: vergleich === null ? null : vergleich.vorschlagGebinde,
      // In Gebinden, wie alle Mengen dieser Maske — die Umrechnung ist die
      // Division aus einheiten.ts, keine eigene.
      bestand:
        vergleich === null || vergleich.bestand === null
          ? null
          : alsMenge(gebindeAusEinheiten(artikel, vergleich.bestand)),
    }
  })

  // Für die Anzeige zählt nur, was bestellt ist — der Rest des Stamms steht der
  // Maske zum Dazunehmen bereit, ist aber keine Position. Gerechnet wird mit den
  // exakten Mengen der Positionen, nicht mit ihrem Anzeigetext.
  const bestellt = zeilen.filter((zeile) => zeile.mengeGebinde > 0)

  // Geht die Bestellung an Dörlemann, gibt es das Formular als Excel — und
  // vorab die Auskunft, was beim Übertragen auffällt: Artikel ohne
  // Formularzeile und Wein, der auf volle Kartons aufgerundet wird. Beides
  // rechnet dieselbe Stelle, die auch die Datei füllt.
  const doerlemann = istDoerlemann(bestellung.lieferant)
  const formular = doerlemann
    ? formularmengen(
        bestellt.map((zeile) => ({
          name: zeile.name,
          lieferGebindeText: zeile.lieferGebindeText,
          anzahlGebinde: zeile.mengeGebinde,
        })),
      )
    : null
  const geliefertStand = lieferstand(
    stamm.flatMap((artikel) => {
      const position = positionen.get(artikel.id)
      if (position === undefined || position.anzahlGebinde.isZero()) return []
      return [
        {
          bestellt: position.anzahlGebinde,
          geliefert: gelieferteGebinde(position.lieferpositionen) ?? new Decimal(0),
        },
      ]
    }),
  )

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4">
      {/*
        Briefkopf, nur im Ausdruck. Er ersetzt die Bildschirmüberschrift und
        wiederholt sie nicht: auf Papier gehört der Betrieb nach oben, und
        zweimal dasselbe untereinander wäre kein Briefkopf, sondern ein Fehler.
      */}
      <div className="nur-druck mb-4 border-b border-black pb-2">
        <p className="text-lg font-semibold">{bestellung.betrieb.name}</p>
        <p className="text-sm">
          Bestellung {bestellung.lieferant} · {alsDatumstext(bestellung.datum)} ·{' '}
          {statusText(bestellung.status)}
        </p>
      </div>

      <div className="nur-schirm flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bestellung {bestellung.lieferant}</h1>
          <p className="mt-1 text-sm text-text-muted tabular-nums">
            {alsDatumstext(bestellung.datum)} · {statusText(bestellung.status)}
            {bestellung.status === BestellStatus.VERSENDET &&
              ` · ${
                geliefertStand === 'vollstaendig'
                  ? 'vollständig geliefert'
                  : geliefertStand === 'teilweise'
                    ? 'teilweise geliefert'
                    : 'Lieferung steht aus'
              }`}
          </p>
        </div>
        <Link
          href="/bestellungen"
          className="tap inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium whitespace-nowrap text-primary-text focus-visible:fokus"
        >
          Alle Bestellungen
        </Link>
      </div>

      {bestellung.notiz !== null && (
        <p className="mt-3 rounded-ctl border border-border p-3 text-sm print:border-0 print:p-0">
          {bestellung.notiz}
        </p>
      )}

      <Positionsmaske
        bestellungId={bestellung.id}
        zeilen={zeilen}
        aenderbar={aenderbar}
        versendet={bestellung.status === BestellStatus.VERSENDET}
      />

      {/*
        Nur auf Papier: die zwei Zeilen, die das Blatt zum Beleg machen. An der
        Rampe unterschreibt einer, dass er es bestellt hat, und einer, dass er
        es angenommen hat — auf dem Schirm gibt es dafür keine Entsprechung, und
        eine Unterschriftslinie im Browser wäre ein Zierstrich.

        Der äussere Kasten trägt `nur-druck`, nicht die Reihe darin: die
        Druckregel setzt `display: revert`, und ein Kasten, der zugleich `flex`
        sein will, verlöre dabei sein Nebeneinander.
      */}
      <div className="nur-druck mt-8 break-inside-avoid">
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="h-9 border-b border-black" />
            <p className="mt-1 text-xs tracking-wide uppercase">Bestellt · Betriebsleitung</p>
          </div>
          <div className="flex-1">
            <div className="h-9 border-b border-black" />
            <p className="mt-1 text-xs tracking-wide uppercase">Angenommen · Name, Datum</p>
          </div>
        </div>
      </div>

      {aenderbar && lage === null && (
        <p className="nur-schirm mt-3 text-xs text-text-muted">
          Ohne abgeschlossene Zählung gibt es keinen Vergleichswert — die Spalte
          &bdquo;Vorschlag&ldquo; fehlt deshalb ganz. Eine 0 dort wäre keine Auskunft, sondern eine
          falsche.
        </p>
      )}

      <div className="nur-schirm mt-6 flex flex-wrap items-center gap-2">
        {naechsteStati(bestellung.status).map((ziel) => (
          <form key={ziel} action={statusSetzen}>
            <input type="hidden" name="bestellungId" value={bestellung.id} />
            <input type="hidden" name="status" value={ziel} />
            <button
              type="submit"
              disabled={ziel === BestellStatus.VERSENDET && bestellt.length === 0}
              className={`tap h-tap rounded-ctl px-4 text-base font-medium disabled:opacity-50 ${
                ziel === BestellStatus.STORNIERT ? 'bg-surface-2' : 'bg-confirm text-confirm-on'
              }`}
            >
              {/* Gesperrt nennt die Aufschrift den Grund, wie in der
                  Vorschlagsmaske — ein graues "Abschicken" liesse offen, warum. */}
              {ziel === BestellStatus.VERSENDET && bestellt.length === 0
                ? 'Keine Position mit einer Menge'
                : wechselText(ziel)}
            </button>
          </form>
        ))}

        <Druckknopf />

        <a href={`/api/bestellung/${bestellung.id}/csv`} className={flaechenfassung({ art: 'sekundaer' })}>
          Als CSV
        </a>

        {doerlemann && (
          <>
            <a
              href={`/api/bestellung/${bestellung.id}/doerlemann`}
              className={flaechenfassung({ art: 'sekundaer' })}
            >
              Dörlemann-Formular
            </a>
            {/*
              Öffnet das Mail-Programm mit Empfänger und Betreff. Die Datei
              anhängen muss die Hand — mailto kennt keine Anhänge, und
              versenden soll ohnehin der Mensch, nicht die App.
            */}
            <a
              href={`mailto:${DOERLEMANN_MAIL}?subject=${encodeURIComponent(
                `Getränkebestellung Stadthafen ${alsDatumstext(bestellung.datum)}`,
              )}`}
              className={flaechenfassung({ art: 'sekundaer' })}
            >
              Mail an Dörlemann
            </a>
          </>
        )}

        {bestellung.status === BestellStatus.ENTWURF && (
          <form action={entwurfVerwerfen} className="ml-auto">
            <input type="hidden" name="bestellungId" value={bestellung.id} />
            <button type="submit" className="h-tap px-2 text-sm font-medium text-danger-text">
              Entwurf verwerfen
            </button>
          </form>
        )}
      </div>

      {/*
        Was die Excel-Datei verschweigen würde, steht hier vorab: Positionen
        ohne Formularzeile fehlen in der Datei ganz, und Wein wächst auf volle
        Kartons. Beides fällt sonst erst dem Lieferanten auf — oder niemandem.
      */}
      {formular !== null && formular.ohneZeile.length > 0 && (
        <p className="nur-schirm mt-3 text-xs text-text-muted">
          Nicht auf dem Dörlemann-Formular und deshalb nicht in der Excel-Datei:{' '}
          {formular.ohneZeile
            .map((position) => `${position.name} (${position.lieferGebindeText})`)
            .join(', ')}
          . Diese Positionen brauchen einen eigenen Weg.
        </p>
      )}
      {formular !== null && formular.aufgerundet.length > 0 && (
        <p className="nur-schirm mt-3 text-xs text-text-muted">
          Das Formular bestellt in vollen Gebinden, die Datei rundet deshalb auf:{' '}
          {formular.aufgerundet
            .map(
              (eintrag) =>
                `${eintrag.name} — aus ${eintrag.bestellt} Flaschen werden ${eintrag.formularMenge} ` +
                `Kartons (${eintrag.formularGebinde}), also ${eintrag.entspricht} Flaschen`,
            )
            .join('; ')}
          .
        </p>
      )}

      {bestellung.status === BestellStatus.ENTWURF && (
        <p className="nur-schirm mt-3 text-xs text-text-muted">
          Solange die Bestellung ein Entwurf ist, steht sie im Wareneingang nicht zur Auswahl.
        </p>
      )}
      {!aenderbar && (
        <p className="nur-schirm mt-3 text-xs text-text-muted">
          Diese Bestellung ist {statusText(bestellung.status)} — hier erwartet niemand mehr Ware,
          und die Positionen bleiben, wie sie waren.
        </p>
      )}
    </main>
  )
}
