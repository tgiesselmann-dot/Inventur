/**
 * Die Nachverfolgung der Abweichungen, über alle Lieferungen hinweg.
 *
 * Hier sitzt die Betriebsleitung am nächsten Morgen und arbeitet ab, was an
 * der Rampe aufgefallen ist. Sortiert wird nach Alter, nicht nach Betrag: der
 * Betrag entscheidet, wie hart man verhandelt; das Alter entscheidet, ob man
 * überhaupt noch verhandeln darf. Die Trennlinie bei 14 Tagen ist keine
 * Sortierung, sondern eine Frist.
 *
 * Die Lieferantenübersicht rechts ist der eigentliche Wert des Bildschirms:
 * nicht die Erinnerung an einen Vorfall, sondern die Quote über zwölf
 * Lieferungen — das Argument im nächsten Gespräch mit dem Aussendienst.
 *
 * Die Kennzahlen im Kopf rechnen immer über alles; die Filter darunter
 * schneiden nur die Arbeitsliste zu. Eine gefilterte Kennzahl sähe aus wie
 * die Lage des Betriebs und wäre nur die Lage eines Lieferanten.
 *
 * Gerechnet wird in src/lib/reklamation.ts, gezeigt nur hier.
 */

import Link from 'next/link'
import { revalidatePath } from 'next/cache'

import { Abweichungsart, Abweichungsstatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb, pflichtBenutzer } from '@/lib/anmeldung'
import { alsKurzdatum, heute, vorTagen, wochenbeginn } from '@/lib/datum'
import { prisma } from '@/lib/prisma'
import {
  alsProzent,
  alterInTagen,
  artenzaehlung,
  arttext,
  fristUeberschritten,
  lieferantenuebersicht,
  mengentext,
  offeneUebersicht,
  prozentzahl,
  quotenstufe,
  reklamationsbetragCent,
  reklamationssummetext,
  statustext,
  type Artrolle,
  artrolle,
  ABWEICHUNGSFENSTER_TAGE,
  REKLAMATIONSFRIST_TAGE,
} from '@/lib/reklamation'
import { alsEuro } from '@/lib/wareneingang'
import { Abschnitt } from '@/ui/abschnitt'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Leerzustand } from '@/ui/zustand'

import { Artmarke } from './artmarke'
import { Statusfolge } from './statusfolge'
import { alsVorgang } from './vorgang'

export const dynamic = 'force-dynamic'

const AKTIVE_STATUS = [
  Abweichungsstatus.OFFEN,
  Abweichungsstatus.REKLAMIERT,
  Abweichungsstatus.GUTSCHRIFT_ERWARTET,
]

/** Der Farbstreifen am linken Rand einer Telefon-Karte, je Art. */
const STREIFEN: Record<Artrolle, string> = {
  danger: 'border-l-danger',
  attention: 'border-l-attention',
  primary: 'border-l-primary',
  preis: 'border-l-preis',
  neutral: 'border-l-border-strong',
}

const QUOTE: Record<ReturnType<typeof quotenstufe>, { balken: string; text: string }> = {
  confirm: { balken: 'bg-confirm', text: 'text-confirm-text' },
  attention: { balken: 'bg-attention', text: 'text-attention-text' },
  danger: { balken: 'bg-danger', text: 'text-danger-text' },
}

/** Die Spalten der Desktop-Liste — Kopf und Zeilen müssen dieselben tragen. */
const SPALTEN =
  'md:grid md:grid-cols-[52px_64px_minmax(0,144px)_minmax(0,1fr)_136px_96px_100px_248px] md:items-center md:gap-x-3'

async function alleReklamieren() {
  'use server'

  const benutzer = await pflichtBenutzer()

  const offene = await prisma.abweichung.findMany({
    where: { betriebId: benutzer.betrieb.id, status: Abweichungsstatus.OFFEN },
    select: { id: true, betriebId: true },
  })

  // Je Abweichung Status und Verlaufsereignis zusammen, alle in einer
  // Transaktion: `nachStatus` des jüngsten Eintrags muss gleich dem Status
  // der Abweichung sein — das ist die Zusage des Journals.
  await prisma.$transaction(
    offene.map((abweichung) =>
      prisma.abweichung.update({
        where: { id: abweichung.id },
        data: {
          status: Abweichungsstatus.REKLAMIERT,
          verlauf: {
            create: {
              betriebId: abweichung.betriebId,
              benutzerId: benutzer.benutzerId,
              vonStatus: Abweichungsstatus.OFFEN,
              nachStatus: Abweichungsstatus.REKLAMIERT,
              notiz: 'Sammelreklamation aus der Übersicht',
            },
          },
        },
      }),
    ),
  )

  revalidatePath('/lieferungen/abweichungen')
}

export default async function Page({ searchParams }: PageProps<'/lieferungen/abweichungen'>) {
  const parameter = await searchParams
  const artFilter = Object.values(Abweichungsart).find((art) => art === parameter.art)
  const lieferantFilter =
    typeof parameter.lieferant === 'string' && parameter.lieferant !== ''
      ? parameter.lieferant
      : undefined

  const jetzt = new Date()
  const tag = heute()
  const fensterbeginn = vorTagen(ABWEICHUNGSFENSTER_TAGE, tag)
  const montag = wochenbeginn(tag)

  const betrieb = await aktuellerBetrieb()

  const [aktive, abgeschlossene, lieferungen, lieferanten] = await Promise.all([
    prisma.abweichung.findMany({
      where: { betriebId: betrieb.id, status: { in: AKTIVE_STATUS } },
      orderBy: { festgestelltAm: 'asc' },
      include: { lieferposition: { include: { artikel: true, lieferung: true } } },
    }),
    // Abgeschlossen ist, was diese Woche seinen Endzustand bekam — das steht
    // im Journal, nicht an der Abweichung: der Verlauf kennt den Zeitpunkt.
    prisma.abweichung.findMany({
      where: {
        betriebId: betrieb.id,
        status: { in: [Abweichungsstatus.ERLEDIGT, Abweichungsstatus.VERWORFEN] },
        verlauf: {
          some: {
            nachStatus: { in: [Abweichungsstatus.ERLEDIGT, Abweichungsstatus.VERWORFEN] },
            zeitpunkt: { gte: montag },
          },
        },
      },
      orderBy: { festgestelltAm: 'asc' },
      include: { lieferposition: { include: { artikel: true, lieferung: true } } },
    }),
    prisma.lieferung.findMany({
      where: { betriebId: betrieb.id, datum: { gte: fensterbeginn } },
      include: { positionen: { include: { artikel: true, abweichungen: true } } },
    }),
    prisma.lieferung.findMany({
      where: { betriebId: betrieb.id },
      distinct: ['lieferant'],
      select: { lieferant: true },
      take: 20,
    }),
  ])

  type Gruppe = (typeof aktive)[number]
  const alsZeile = (abweichung: Gruppe) => {
    const position = abweichung.lieferposition
    const vorgang = alsVorgang(abweichung, position)
    return {
      id: abweichung.id,
      alterTage: alterInTagen(abweichung.festgestelltAm, jetzt),
      datum: position.lieferung.datum,
      lieferant: position.lieferung.lieferant,
      artikel: position.artikel.name,
      art: abweichung.art,
      status: abweichung.status,
      menge: mengentext(vorgang),
      betragCent: reklamationsbetragCent(vorgang),
    }
  }

  const zeilen = aktive.map(alsZeile)
  const abgeschlosseneZeilen = abgeschlossene.map(alsZeile)

  // Die Kennzahlen rechnen über alles; erst ab hier schneiden die Filter zu.
  const passt = (zeile: ReturnType<typeof alsZeile>) =>
    (artFilter === undefined || zeile.art === artFilter) &&
    (lieferantFilter === undefined || zeile.lieferant === lieferantFilter)
  const ueberfaellige = zeilen.filter((z) => fristUeberschritten(z.alterTage)).filter(passt)
  const inFrist = zeilen.filter((z) => !fristUeberschritten(z.alterTage)).filter(passt)
  const abgeschlossenGefiltert = abgeschlosseneZeilen.filter(passt)
  const gefiltert = artFilter !== undefined || lieferantFilter !== undefined

  const offen = offeneUebersicht(
    zeilen.map((zeile) => ({
      status: zeile.status,
      betragCent: zeile.betragCent,
      alterTage: zeile.alterTage,
    })),
  )

  // 30 Tage: Abweichungen der Lieferungen dieses Zeitraums, ohne Verworfene —
  // der eigene Zählfehler ist kein Vorfall des Lieferanten.
  const dreissig = lieferungen.flatMap((lieferung) =>
    lieferung.positionen.flatMap((position) =>
      position.abweichungen
        .filter((abweichung) => abweichung.status !== Abweichungsstatus.VERWORFEN)
        .map((abweichung) => abweichung.art),
    ),
  )
  const arten = artenzaehlung(dreissig)

  const jeLieferant = lieferantenuebersicht(
    lieferungen.map((lieferung) => ({
      lieferant: lieferung.lieferant,
      geprueft: lieferung.geprueftAm !== null,
      abweichungen: lieferung.positionen.flatMap((position) =>
        position.abweichungen.map((abweichung) => ({
          status: abweichung.status,
          betragCent: reklamationsbetragCent(alsVorgang(abweichung, position)),
        })),
      ),
    })),
  )

  const statusverteilung = offen.jeStatus
    .map((eintrag) => `${eintrag.anzahl} ${statustext(eintrag.status)}`)
    .join(' · ')

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-0 md:max-w-6xl md:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold md:text-titel">Abweichungen</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/lieferungen"
            className="tap inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium whitespace-nowrap text-primary-text focus-visible:fokus"
          >
            Lieferungen
          </Link>
          <Modusumschalter className="md:hidden" />
        </div>
      </div>

      {/* Die drei Karten des Kopfes. Auf dem Telefon trägt die erste Karte
          alles Zählbare in zwei Zeilen, und die Lieferantenübersicht bleibt
          eine kompakte Tabelle — sie ist der Bildschirm, den man dem
          Aussendienst über den Tresen dreht. */}
      <div className="mt-4 flex flex-col gap-3 md:mt-6 md:flex-row md:items-stretch md:gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 md:w-72 md:shrink-0 md:p-5">
          <p className="text-beschriftung uppercase text-text-muted">Offener Reklamationsbetrag</p>
          <p className="text-titel md:text-4xl">{reklamationssummetext(offen)}</p>
          <p className="text-sm text-text-muted">
            {offen.anzahl === 0
              ? 'keine offenen Vorgänge'
              : `${offen.anzahl} ${offen.anzahl === 1 ? 'Vorgang' : 'Vorgänge'} · ältester ${offen.aeltesterTage} ${offen.aeltesterTage === 1 ? 'Tag' : 'Tage'}`}
          </p>
          {offen.nichtBewertbar > 0 && (
            <p className="text-sm text-text-muted">
              {offen.nichtBewertbar} davon nicht bewertbar — ohne Preis fehlt der Betrag in der
              Summe.
            </p>
          )}
          {statusverteilung !== '' && (
            <p className="mt-auto border-t border-border pt-2 text-sm text-text-muted">
              {statusverteilung}
            </p>
          )}
        </div>

        <div className="hidden flex-col gap-2 rounded-xl border border-border bg-surface p-5 md:flex md:w-60 md:shrink-0">
          <p className="text-beschriftung uppercase text-text-muted">
            Abweichungen · {ABWEICHUNGSFENSTER_TAGE} Tage
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold">{dreissig.length}</span>
            <span className="text-sm text-text-muted">
              von {lieferungen.length} {lieferungen.length === 1 ? 'Lieferung' : 'Lieferungen'}
            </span>
          </p>
          <ul className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
            {arten.map((eintrag) => (
              <li key={eintrag.art} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-xs ${ROLLEN[artrolle(eintrag.art)].punkt}`}
                />
                <span className="flex-1 text-text-muted">{arttext(eintrag.art)}</span>
                <span className="font-medium">{eintrag.anzahl}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-surface p-4 md:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-beschriftung uppercase text-text-muted">
              Je Lieferant · {ABWEICHUNGSFENSTER_TAGE} Tage
            </p>
            <p className="hidden text-abschnitt font-normal tracking-normal text-text-muted md:block">
              Anteil fehlerfreier Lieferungen
            </p>
          </div>
          {jeLieferant.length === 0 ? (
            <p className="text-sm text-text-muted">
              Im Zeitraum liegt keine Lieferung — die Quote entsteht mit dem nächsten
              Wareneingang.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {jeLieferant.map((zeile) => {
                const stufe = zeile.fehlerfreiAnteil === null ? null : quotenstufe(zeile.fehlerfreiAnteil)
                return (
                  <li key={zeile.lieferant} className="flex items-center gap-3 py-2 md:gap-4">
                    <span className="w-28 truncate text-zeile md:w-44">{zeile.lieferant}</span>
                    <span className="shrink-0 text-sm text-text-muted">
                      {zeile.lieferungen} Lief.
                    </span>
                    <span className="hidden min-w-0 flex-1 items-center gap-2.5 md:flex">
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-xs bg-surface-2">
                        {zeile.fehlerfreiAnteil !== null && stufe !== null && (
                          <span
                            className={`block h-full ${QUOTE[stufe].balken}`}
                            style={{ width: `${prozentzahl(zeile.fehlerfreiAnteil)}%` }}
                          />
                        )}
                      </span>
                    </span>
                    <span
                      className={`w-13 shrink-0 text-right text-zeile md:w-14 ${
                        stufe === null ? 'text-text-muted' : QUOTE[stufe].text
                      }`}
                    >
                      {zeile.fehlerfreiAnteil === null ? '—' : alsProzent(zeile.fehlerfreiAnteil)}
                    </span>
                    <span className="w-24 shrink-0 text-right text-zeile">
                      {zeile.summeCent === 0 && zeile.nichtBewertbar > 0
                        ? '—'
                        : alsEuro(zeile.summeCent)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Die Filter schneiden nur die Arbeitsliste zu, als Adresse (GET):
          eine gefilterte Sicht lässt sich so verschicken und neu laden. */}
      <form
        method="get"
        className="mt-4 flex flex-wrap items-end gap-tapgap md:mt-6 md:gap-3"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 md:w-44 md:flex-none">
          <span className="text-beschriftung uppercase text-text-muted">Art</span>
          <select
            name="art"
            defaultValue={artFilter ?? ''}
            className="h-tap w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-3 text-zeile text-text focus:outline-2 focus:-outline-offset-1 focus:outline-focus"
          >
            <option value="">alle Arten</option>
            {Object.values(Abweichungsart).map((art) => (
              <option key={art} value={art}>
                {arttext(art)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 md:w-56 md:flex-none">
          <span className="text-beschriftung uppercase text-text-muted">Lieferant</span>
          <select
            name="lieferant"
            defaultValue={lieferantFilter ?? ''}
            className="h-tap w-full min-w-0 rounded-ctl border border-border-strong bg-surface px-3 text-zeile text-text focus:outline-2 focus:-outline-offset-1 focus:outline-focus"
          >
            <option value="">alle Lieferanten</option>
            {lieferanten.map((eintrag) => (
              <option key={eintrag.lieferant} value={eintrag.lieferant}>
                {eintrag.lieferant}
              </option>
            ))}
          </select>
        </label>
        <Schaltflaeche type="submit" art="sekundaer">
          Filtern
        </Schaltflaeche>
        <p className="ml-auto hidden self-center text-sm text-text-muted md:block">
          sortiert nach Alter
        </p>
      </form>

      {ueberfaellige.length + inFrist.length + abgeschlossenGefiltert.length === 0 ? (
        <div className="mt-4 md:mt-6">
          <Leerzustand
            titel={gefiltert ? 'Nichts unter diesem Filter.' : 'Keine offenen Abweichungen.'}
            erklaerung={
              gefiltert
                ? 'Unter dieser Art oder diesem Lieferanten steht gerade nichts an — die Auswahl oben zeigt wieder alles.'
                : 'Was an der Rampe auffällt, erscheint hier am nächsten Morgen — sortiert nach Alter, denn die Reklamationsfrist läuft.'
            }
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-tapgap md:mt-6">
          {/* Der Tabellenkopf trägt dieselben Spalten wie jede Zeile. */}
          <div
            className={`hidden rounded-ctl border border-border bg-surface-2 px-6 py-2.5 text-abschnitt text-text-muted uppercase ${SPALTEN}`}
          >
            <span>Alter</span>
            <span>Datum</span>
            <span>Lieferant</span>
            <span>Artikel</span>
            <span>Art</span>
            <span className="text-right">Menge</span>
            <span className="text-right">Betrag</span>
            <span className="pl-4">Status</span>
          </div>

          {ueberfaellige.length > 0 && (
            <>
              <Hinweisleiste
                rolle="attention"
                titel={`Älter als ${REKLAMATIONSFRIST_TAGE} Tage — Reklamationsfrist läuft`}
              />
              <Zeilen zeilen={ueberfaellige} betont />
            </>
          )}

          {inFrist.length > 0 && (
            <>
              {(ueberfaellige.length > 0 || abgeschlossenGefiltert.length > 0) && (
                <Abschnitt titel="Innerhalb der Frist" />
              )}
              <Zeilen zeilen={inFrist} />
            </>
          )}

          {abgeschlossenGefiltert.length > 0 && (
            <>
              <Abschnitt titel="Diese Woche abgeschlossen" />
              <Zeilen zeilen={abgeschlossenGefiltert} abgeschlossen />
            </>
          )}
        </div>
      )}

      {/* Auf dem Telefon liegt die Sammelhandlung im unteren Drittel, über dem
          Daumen. Sie reklamiert alle offenen Vorgänge — nicht die gefilterten:
          eine Reklamation, die vom Filter abhängt, wäre eine Überraschung. */}
      {offen.jeStatus.some(
        (eintrag) => eintrag.status === Abweichungsstatus.OFFEN && eintrag.anzahl > 0,
      ) && (
        <form
          action={alleReklamieren}
          className="sticky bottom-0 -mx-4 mt-auto border-t border-border bg-bg p-4 pb-6 md:hidden"
        >
          <Schaltflaeche type="submit" breit>
            Alle offenen reklamieren
          </Schaltflaeche>
        </form>
      )}
      <div className="pb-4 md:pb-0" />
    </main>
  )
}

type Zeile = {
  id: string
  alterTage: number
  datum: Date
  lieferant: string
  artikel: string
  art: Abweichungsart
  status: Abweichungsstatus
  menge: string
  betragCent: number | null
}

function Zeilen({
  zeilen,
  betont = false,
  abgeschlossen = false,
}: {
  zeilen: Zeile[]
  /** Überfällige Zeilen: das Alter trägt Warnfarbe. */
  betont?: boolean
  /** Abgeschlossene Zeilen: alles gedeckt, Verworfenes gestrichen. */
  abgeschlossen?: boolean
}) {
  return (
    <ul className="flex flex-col gap-tapgap">
      {zeilen.map((zeile) => {
        const verworfen = zeile.status === Abweichungsstatus.VERWORFEN
        return (
          <li key={zeile.id}>
            {/* Die farbige Kante bleibt auch auf dem Desktop: als Karte hat
                die Zeile ihren Rand ohnehin, die Kante kostet nichts mehr. */}
            <Link
              href={`/lieferungen/abweichungen/${zeile.id}`}
              className={`tap block rounded-ctl border border-border border-l-4 bg-surface px-4 py-3 focus-visible:fokus md:px-6 md:py-0 ${
                abgeschlossen ? 'border-l-border text-text-muted' : STREIFEN[artrolle(zeile.art)]
              } ${SPALTEN} md:min-h-15`}
            >
              {/* Telefon: Karte in drei Zeilen. Alter und Betrag zuerst. */}
              <span className="flex flex-col gap-1.5 md:hidden">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-zeile">{zeile.artikel}</span>
                  <span
                    className={`shrink-0 text-zeile ${verworfen ? 'line-through' : ''} ${
                      abgeschlossen ? 'font-normal' : ''
                    }`}
                  >
                    {zeile.betragCent === null ? '—' : alsEuro(zeile.betragCent)}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3 text-sm text-text-muted">
                  <span className="min-w-0 truncate">
                    {alsKurzdatum(zeile.datum)} · {zeile.lieferant}
                  </span>
                  <span
                    className={
                      betont && !abgeschlossen ? 'font-semibold text-attention-text' : undefined
                    }
                  >
                    {zeile.alterTage} T
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <Artmarke art={zeile.art} zusatz={zeile.menge} gedeckt={abgeschlossen} />
                  <Statusfolge status={zeile.status} knapp />
                </span>
              </span>

              {/* Desktop: dieselben Angaben als Tabellenzeile. */}
              <span
                className={`hidden md:block ${
                  betont && !abgeschlossen
                    ? 'font-semibold text-attention-text'
                    : 'text-text-muted'
                }`}
              >
                {zeile.alterTage} T
              </span>
              <span className="hidden text-text-muted md:block">{alsKurzdatum(zeile.datum)}</span>
              <span className="hidden truncate md:block">{zeile.lieferant}</span>
              <span className="hidden truncate text-zeile md:block">{zeile.artikel}</span>
              <span className="hidden md:block">
                <Artmarke art={zeile.art} gedeckt={abgeschlossen} />
              </span>
              <span className="hidden text-right text-text-muted md:block">{zeile.menge}</span>
              <span
                className={`hidden text-right md:block ${verworfen ? 'line-through' : ''} ${
                  abgeschlossen ? '' : 'font-semibold'
                }`}
              >
                {zeile.betragCent === null ? '—' : alsEuro(zeile.betragCent)}
              </span>
              <span className="hidden pl-4 md:block">
                <Statusfolge status={zeile.status} />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
