/**
 * Die Detailansicht einer Abweichung: die drei Mengen nebeneinander, der
 * gerechnete Betrag, die Belege, der Verlauf — und die Stelle, an der die
 * tatsächlich erhaltene Gutschrift eingetragen wird.
 *
 * Die drei Mengen stehen nebeneinander, damit die Frage "wo ist es
 * auseinandergelaufen" eine Blickbewegung kostet: zwischen bestellt und
 * Lieferschein streitet man mit dem Innendienst, zwischen Lieferschein und
 * tatsächlich mit dem Fahrer.
 *
 * Der reklamierte Betrag ist gerechnet und sieht auch so aus: gedeckte
 * Fläche, "berechnet"-Etikett, die Rechnung als Mono-Zeile darunter — nie ein
 * Eingabefeld. Eingetragen wird nur die erhaltene Gutschrift; erst sie macht
 * den Vorgang erledigt.
 *
 * Foto und Unterschrift stehen neben dem Betrag, nicht unter "Anhänge": sie
 * sind der Grund, warum die Reklamation Bestand hat.
 *
 * Gerechnet wird in src/lib/reklamation.ts, gezeigt nur hier.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Abweichungsstatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { alsDatumstext, alsKurzdatum, alsZeitpunktstext } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'
import {
  alterInTagen,
  artrolle,
  gutschriftdifferenzCent,
  istAktiv,
  mengensatz,
  naechsterSchritt,
  rechenzeile,
  reklamationsbetragCent,
  statustext,
  type Artrolle,
} from '@/lib/reklamation'
import { alsEuro } from '@/lib/wareneingang'
import { alsEingabe, dezimaltext, gebindeEinzahl } from '@/lib/zaehlung'
import { FELD, BESCHRIFTUNG } from '@/ui/feld'
import { Modusumschalter } from '@/ui/modus'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { Artmarke } from '../artmarke'
import { Statusfolge } from '../statusfolge'
import { alsVorgang } from '../vorgang'
import { gutschriftEintragen, notizSpeichern, verwerfen, weiterschalten } from './aktionen'

const KARTE = 'rounded-xl border border-border bg-surface p-4 md:p-5'

/**
 * Die auffällige Mengenkachel, in der Rolle der Art. Preis und Neutral tragen
 * nur den Rand: Preis hat keine getönte Fläche in globals.css, und die
 * neutrale Kachel wäre sonst eine graue Warnung.
 */
const KACHEL: Record<Artrolle, string> = {
  danger: `${ROLLEN.danger.rand} ${ROLLEN.danger.flaeche}`,
  attention: `${ROLLEN.attention.rand} ${ROLLEN.attention.flaeche}`,
  primary: `${ROLLEN.primary.rand} ${ROLLEN.primary.flaeche}`,
  preis: ROLLEN.preis.rand,
  neutral: ROLLEN.neutral.rand,
}

/** Wie die Taste zum nächsten Schritt heisst — als Handlung, nicht als Zustand. */
const WEITER: Partial<Record<Abweichungsstatus, string>> = {
  [Abweichungsstatus.OFFEN]: 'Reklamieren',
  [Abweichungsstatus.REKLAMIERT]: 'Gutschrift erwartet',
}

export default async function Page({ params }: PageProps<'/lieferungen/abweichungen/[id]'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  // Über Id und Betrieb gesucht: eine fremde Abweichung ist damit nicht gefunden.
  const betrieb = await aktuellerBetrieb()
  const abweichung = await prisma.abweichung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: {
      lieferposition: { include: { artikel: true, lieferung: true, bestellposition: true } },
      verlauf: { include: { benutzer: true }, orderBy: { zeitpunkt: 'desc' } },
    },
  })
  if (abweichung === null) notFound()

  const position = abweichung.lieferposition
  const lieferung = position.lieferung
  const vorgang = alsVorgang(abweichung, position)
  const rolle = artrolle(abweichung.art)

  const bestellt = position.bestellposition?.anzahlGebinde.toString() ?? null
  const betragCent = reklamationsbetragCent(vorgang)
  const rechnung = rechenzeile(vorgang)
  const differenzCent = gutschriftdifferenzCent(betragCent, abweichung.gutschriftCent)

  const aktiv = istAktiv(abweichung.status)
  const weiter = naechsterSchritt(abweichung.status)
  const seit = abweichung.verlauf[0]
    ? `seit ${alsKurzdatum(abweichung.verlauf[0].zeitpunkt)}`
    : undefined
  const alter = alterInTagen(abweichung.festgestelltAm, new Date())

  const mengen: { wert: string; beschriftung: string; betont: boolean }[] = [
    {
      wert: bestellt === null ? '—' : alsEingabe(dezimaltext(bestellt)),
      beschriftung: 'bestellt',
      betont: false,
    },
    {
      wert: alsEingabe(dezimaltext(vorgang.anzahlGebindeLieferschein)),
      beschriftung: 'Lieferschein',
      betont: false,
    },
    {
      wert: alsEingabe(dezimaltext(position.anzahlGebindeTatsaechlich.toString())),
      beschriftung: `tatsächlich · ${gebindeEinzahl(position.artikel.gebindeart)}`,
      // Die Preisabweichung lässt die Mengen in Ruhe — dort ist nichts
      // auseinandergelaufen, das eine Kachel färben müsste.
      betont: rolle !== 'preis' && rolle !== 'neutral',
    },
  ]

  const aktionen = aktiv && (
    <>
      <form action={verwerfen}>
        <input type="hidden" name="abweichungId" value={abweichung.id} />
        <Schaltflaeche type="submit" art="sekundaer" breit>
          Verwerfen
        </Schaltflaeche>
      </form>
      {weiter !== null && (
        <form action={weiterschalten}>
          <input type="hidden" name="abweichungId" value={abweichung.id} />
          <Schaltflaeche type="submit" breit>
            {WEITER[abweichung.status]}
          </Schaltflaeche>
        </form>
      )}
    </>
  )

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-0 md:max-w-6xl md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/lieferungen/abweichungen"
            aria-label="Zurück zur Übersicht"
            className="tap flex size-tap shrink-0 items-center justify-center rounded-ctl border border-border-strong bg-surface text-text-muted focus-visible:fokus"
          >
            ‹
          </Link>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <Artmarke art={abweichung.art} />
            </div>
            <h1 className="truncate text-2xl font-semibold md:text-titel">
              {position.artikel.name}
            </h1>
            <p className="text-sm text-text-muted">
              {lieferung.lieferant} · Lieferung {alsDatumstext(lieferung.datum)} ·{' '}
              <span className="font-mono text-abschnitt font-normal tracking-normal">
                {lieferung.belegNr}
              </span>{' '}
              · {alter} Tage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <Statusfolge status={abweichung.status} zusatz={seit} />
          <div className="hidden items-center gap-tapgap md:flex">{aktionen}</div>
          <Modusumschalter className="md:hidden" />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:mt-6 md:flex-row md:items-start md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3 md:gap-4">
          <section className={KARTE}>
            <p className={BESCHRIFTUNG}>Mengen</p>
            <div className="mt-3 grid grid-cols-3 gap-2 md:gap-3">
              {mengen.map((menge) => (
                <div
                  key={menge.beschriftung}
                  className={`flex flex-col gap-1 rounded-ctl border p-3 md:p-4 ${
                    menge.betont ? `border-2 ${KACHEL[rolle]}` : 'border-border bg-bg'
                  }`}
                >
                  <span className="text-3xl font-semibold md:text-5xl md:tracking-tight">
                    {menge.wert}
                  </span>
                  <span
                    className={`text-[10px] font-medium tracking-[0.06em] uppercase md:text-beschriftung ${
                      menge.betont ? '' : 'text-text-muted'
                    }`}
                  >
                    {menge.beschriftung}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-text-muted">{mengensatz(vorgang, bestellt)}</p>
          </section>

          <div className="grid gap-3 md:grid-cols-2 md:gap-4">
            {/* Gerechnet, und sichtbar gerechnet: gedeckte Fläche, Etikett,
                die Rechnung zum Nachrechnen. Nie ein Eingabefeld. */}
            <section className="rounded-xl border border-border bg-surface-2 p-4 md:p-5">
              <p className="flex items-center gap-2">
                <span className={BESCHRIFTUNG}>Reklamierter Betrag</span>
                <span className="rounded-xs border border-border-strong px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-text-muted uppercase">
                  berechnet
                </span>
              </p>
              <p className={`mt-2 text-3xl font-semibold ${betragCent === null ? 'text-text-muted' : ''}`}>
                {betragCent === null ? '—' : alsEuro(betragCent)}
              </p>
              <p className="mt-1 font-mono text-abschnitt font-normal tracking-normal text-text-muted">
                {rechnung ?? 'nicht bewertbar — kein Preis erfasst und keiner hinterlegt'}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                Nicht änderbar. Weicht die Gutschrift ab, wird die Differenz sichtbar.
              </p>
            </section>

            <section className={KARTE}>
              <p className={BESCHRIFTUNG}>Erhaltene Gutschrift</p>
              {abweichung.gutschriftCent !== null ? (
                <>
                  <p className="mt-2 text-3xl font-semibold text-confirm-text">
                    {alsEuro(abweichung.gutschriftCent)}
                  </p>
                  <p className="mt-2 text-sm text-text-muted">
                    {differenzCent === null || differenzCent === 0
                      ? 'Gutschrift und gerechneter Betrag stimmen überein.'
                      : `${alsEuro(Math.abs(differenzCent))} ${
                          differenzCent < 0 ? 'unter' : 'über'
                        } dem gerechneten Betrag.`}
                  </p>
                </>
              ) : aktiv ? (
                <form action={gutschriftEintragen} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="abweichungId" value={abweichung.id} />
                  <input
                    name="gutschrift"
                    inputMode="decimal"
                    placeholder="—"
                    aria-label="Erhaltene Gutschrift in Euro"
                    className={`${FELD} text-2xl font-semibold placeholder:text-text-muted`}
                  />
                  <Schaltflaeche type="submit" art="sekundaer" breit>
                    Eintragen und erledigen
                  </Schaltflaeche>
                  <p className="text-sm text-text-muted">
                    Erst die eingetragene Gutschrift macht den Vorgang erledigt.
                  </p>
                </form>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-semibold text-text-muted">—</p>
                  <p className="mt-2 text-sm text-text-muted">
                    Verworfen — es gibt nichts gutzuschreiben.
                  </p>
                </>
              )}
            </section>
          </div>

          <section className={KARTE}>
            <p className={BESCHRIFTUNG}>Notiz</p>
            <form action={notizSpeichern} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="abweichungId" value={abweichung.id} />
              <textarea
                name="notiz"
                rows={4}
                defaultValue={abweichung.notiz ?? ''}
                placeholder="Was der Fahrer gesagt hat, wer informiert wurde …"
                className="min-h-24 w-full rounded-ctl border border-border-strong bg-surface p-3 text-zeile font-normal text-text placeholder:text-text-muted focus:outline-2 focus:-outline-offset-1 focus:outline-focus"
              />
              <div className="self-start">
                <Schaltflaeche type="submit" art="sekundaer">
                  Notiz speichern
                </Schaltflaeche>
              </div>
            </form>
          </section>
        </div>

        <div className="flex flex-col gap-3 md:w-90 md:shrink-0 md:gap-4">
          <section className={KARTE}>
            <p className={BESCHRIFTUNG}>Beleg</p>
            <div className="mt-3 flex flex-col gap-3">
              <Beleg
                lieferungId={lieferung.id}
                name="lieferschein"
                vorhanden={lieferung.lieferscheinBildPfad !== null}
                beschriftung="Foto des Lieferscheins"
                hoch
              />
              <Beleg
                lieferungId={lieferung.id}
                name="unterschrift"
                vorhanden={lieferung.unterschriftBildPfad !== null}
                beschriftung={
                  lieferung.fahrerName === null
                    ? 'Unterschrift des Fahrers'
                    : `Unterschrift · ${lieferung.fahrerName}`
                }
              />
            </div>
          </section>

          <section className={KARTE}>
            <p className={BESCHRIFTUNG}>Verlauf</p>
            <ul className="mt-3 flex flex-col gap-3">
              {abweichung.verlauf.map((ereignis, index) => (
                <li key={ereignis.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      index === 0 ? 'bg-primary' : 'bg-border-strong'
                    }`}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-zeile">{statustext(ereignis.nachStatus)}</span>
                    <span className="text-sm text-text-muted">
                      {ereignis.benutzer !== null && <>{ereignis.benutzer.email} · </>}
                      {alsZeitpunktstext(ereignis.zeitpunkt)}
                      {ereignis.notiz !== null && <> · {ereignis.notiz}</>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Auf dem Telefon liegen die Statuswechsel im unteren Drittel. */}
      {aktiv && (
        <div className="sticky bottom-0 -mx-4 mt-auto flex gap-tapgap border-t border-border bg-bg p-4 pb-6 *:flex-1 md:hidden">
          {aktionen}
        </div>
      )}
      <div className="pb-4 md:pb-0" />
    </main>
  )
}

/**
 * Ein Beleg aus dem privaten Bucket, über den Route-Handler geholt. Fehlt er,
 * sagt die Fläche das — ein leerer Rahmen wäre ein Rätsel, kein Befund.
 */
function Beleg({
  lieferungId,
  name,
  vorhanden,
  beschriftung,
  hoch = false,
}: {
  lieferungId: string
  name: 'lieferschein' | 'unterschrift'
  vorhanden: boolean
  beschriftung: string
  hoch?: boolean
}) {
  if (!vorhanden) {
    return (
      <div
        className={`flex items-center justify-center rounded-ctl border-2 border-dashed border-border-strong text-sm text-text-muted ${hoch ? 'h-40' : 'h-24'}`}
      >
        {beschriftung} — nicht hinterlegt
      </div>
    )
  }
  return (
    <figure className="overflow-hidden rounded-ctl border border-border-strong">
      {/* Kein next/image: die Quelle ist der eigene Route-Handler vor einem
          privaten Bucket, ein Optimierer davor wäre ein zweiter Weg hinein. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/lieferung/${lieferungId}/beleg/${name}`}
        alt={beschriftung}
        className={`w-full bg-bg object-contain ${hoch ? 'max-h-72' : 'max-h-32'}`}
      />
      <figcaption className="border-t border-border bg-bg px-3 py-1.5 font-mono text-[11px] text-text-muted">
        {beschriftung}
      </figcaption>
    </figure>
  )
}
