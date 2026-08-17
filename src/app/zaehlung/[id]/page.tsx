/**
 * Die Ortswahl einer Zählung: in welchem Lager wird jetzt gezählt.
 *
 * Vier Lager, zwei Zähler — das ist der Betrieb, für den diese Seite da ist.
 * Sie schlägt bewusst keinen nächsten Ort vor und ordnet auch keinen Laufweg
 * an: in welcher Reihenfolge gezählt wird, entscheidet der, der zählt. Was sie
 * zeigt, ist der Stand — wo steht schon etwas, wo ist jemand dabei, was ist
 * fertig gemeldet.
 *
 * Die Reihenfolge der Liste ist die des Anlegens (UUIDv7, zeitgeordnet) und
 * bleibt fest: fertige Orte werden gedämpft, rutschen aber nicht ans Ende. Eine
 * Liste, in der Zeilen wandern, sobald man etwas erledigt, zwingt den Daumen
 * bei jedem Aufruf zum Neusuchen.
 *
 * Stillgelegte Lager stehen hier nicht. Ihre alten Werte bleiben in der
 * Auswertung, aber gezählt wird in ihnen nicht mehr — und der Abschluss
 * verlangt sie folgerichtig auch nicht.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { pflichtBenutzer } from '@/lib/anmeldung'
import { alsDatumstext } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { ortsstandText, wirdBearbeitetVon, type Ortsstand } from '@/lib/lagerorte'
import { prisma } from '@/lib/prisma'
import { Listenzeile } from '@/ui/listenzeile'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Leerzustand } from '@/ui/zustand'

import { ZaehlungAbschliessen } from './abschliessen'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: PageProps<'/zaehlung/[id]'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  const benutzer = await pflichtBenutzer()
  const betriebId = benutzer.betrieb.id

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit nicht gefunden.
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id, betriebId },
    include: {
      abschnitte: {
        include: {
          begonnenVon: { select: { email: true } },
          fertigVon: { select: { email: true } },
        },
      },
    },
  })
  if (zaehlung === null) notFound()

  const abgeschlossen = zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN

  const [lagerorte, erfasstJeOrt, letzteZaehlung] = await Promise.all([
    prisma.lagerort.findMany({
      // Bei einer abgeschlossenen Zählung auch die inzwischen stillgelegten:
      // sonst verschwände ein Ort aus einem Ergebnis, das ihn enthält.
      where: abgeschlossen ? { betriebId } : { betriebId, aktiv: true },
      orderBy: { id: 'asc' },
    }),
    prisma.zaehlposition.groupBy({
      by: ['lagerortId'],
      where: { zaehlungId: id },
      _count: { _all: true },
    }),
    // Die Erwartung je Ort kommt aus der letzten abgeschlossenen Zählung davor:
    // wo ein Artikel zuletzt einen Wert hatte, wird er wieder erwartet. Eine
    // gepflegte Zuordnungsliste gibt es bewusst nicht — sie wäre ein zweiter
    // Stammdatensatz, der neben der Wirklichkeit herläuft.
    prisma.zaehlung.findFirst({
      where: { betriebId, status: ZaehlungStatus.ABGESCHLOSSEN, datum: { lt: zaehlung.datum } },
      orderBy: { datum: 'desc' },
      select: { id: true },
    }),
  ])

  const erwartetJeOrt =
    letzteZaehlung === null
      ? []
      : await prisma.zaehlposition.groupBy({
          by: ['lagerortId'],
          where: { zaehlungId: letzteZaehlung.id },
          _count: { _all: true },
        })

  const erfasst = new Map(erfasstJeOrt.map((zeile) => [zeile.lagerortId, zeile._count._all]))
  const erwartet = new Map(erwartetJeOrt.map((zeile) => [zeile.lagerortId, zeile._count._all]))
  const abschnitte = new Map(zaehlung.abschnitte.map((eintrag) => [eintrag.lagerortId, eintrag]))

  const staende: Ortsstand[] = lagerorte.map((ort) => {
    const abschnitt = abschnitte.get(ort.id)
    return {
      lagerortId: ort.id,
      name: ort.name,
      erfasst: erfasst.get(ort.id) ?? 0,
      erwartet: erwartet.get(ort.id) ?? null,
      fertigAm: abschnitt?.fertigAm ?? null,
      fertigVon: abschnitt?.fertigVon?.email ?? null,
      begonnenVon: abschnitt?.begonnenVon?.email ?? null,
    }
  })

  const fertige = staende.filter((stand) => stand.fertigAm !== null).length

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-0 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/zaehlung"
          className="tap inline-flex min-h-tap items-center rounded-ctl pr-2 text-sm font-medium text-text-muted focus-visible:fokus"
        >
          ‹ Zählungen
        </Link>
      </div>

      <h1 className="mt-2 text-2xl font-semibold md:text-titel">
        Zählung vom {alsDatumstext(zaehlung.datum)}
      </h1>
      <p className="mt-2 text-base text-text-muted">
        {abgeschlossen
          ? 'Abgeschlossen — die Werte stehen fest.'
          : `${fertige} von ${staende.length} Lagern fertig gemeldet. In welcher Reihenfolge gezählt wird, ist Ihnen überlassen.`}
      </p>

      {lagerorte.length === 0 ? (
        <div className="mt-6">
          <Leerzustand
            titel="Noch kein Lager."
            erklaerung="Gezählt wird immer in einem Lager. Legen Sie zuerst eines an — etwa die Theke."
            handlung={
              <Link href="/lagerorte">
                <Schaltflaeche>Lager anlegen</Schaltflaeche>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-tapgap">
          {staende.map((stand) => {
            const fremd = wirdBearbeitetVon(stand, benutzer.email)
            return (
              <li key={stand.lagerortId} className="flex flex-col gap-1">
                <Listenzeile
                  titel={stand.name}
                  unterzeile={ortsstandText(stand)}
                  punkt={
                    stand.fertigAm !== null
                      ? 'confirm'
                      : stand.erfasst > 0
                        ? 'attention'
                        : 'neutral'
                  }
                  ziel={`/zaehlung/${id}/${stand.lagerortId}`}
                />
                {/* Warnung, keine Sperre: wer hier landet, weiss danach, dass
                    jemand anders in demselben Lager steht — und kann trotzdem
                    hinein, etwa weil dessen Handy leer ist. */}
                {fremd !== null && (
                  <p className="px-3 text-sm text-attention-text">
                    {fremd} zählt hier gerade. Zu zweit im selben Lager überschreiben Sie sich
                    gegenseitig.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!abgeschlossen && staende.length > 0 && fertige === staende.length && (
        <div className="mt-6 mb-4">
          <ZaehlungAbschliessen
            zaehlungId={id}
            lagerorte={lagerorte.map((ort) => ({ id: ort.id, name: ort.name }))}
          />
        </div>
      )}

      {abgeschlossen && (
        <div className="mt-6 mb-4">
          <Link href={`/zaehlung/${id}/abschluss`}>
            <Schaltflaeche breit>Ergebnis ansehen</Schaltflaeche>
          </Link>
        </div>
      )}
    </main>
  )
}
