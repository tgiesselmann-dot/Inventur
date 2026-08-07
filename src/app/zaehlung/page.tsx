/**
 * Die Liste der Zählungen und der Weg in eine neue.
 *
 * Bewusst knapp gehalten — gebraucht wird sie, weil es sonst keinen Weg zu
 * einer `/zaehlung/[id]` gäbe, und nicht als eigenes Werkzeug.
 *
 * Der Betrieb wird hier noch aus der Datenbank gegriffen statt aus einer
 * Anmeldung: es gibt noch keine. Sobald `Benutzer` an eine Supabase-Session
 * hängt, gehört an diese Stelle die betriebId des angemeldeten Benutzers.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'

// Ein Datenbankzugriff macht eine Seite nicht von allein dynamisch: ohne diese
// Zeile rendert der Build die Liste einmal und friert sie ein — die Zählung von
// gestern Abend stünde dann morgen früh noch immer nicht darin.
export const dynamic = 'force-dynamic'

/** Heute als reines Datum, ohne Uhrzeit — die Spalte ist @db.Date. */
function heute(): Date {
  const jetzt = new Date()
  return new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()))
}

async function zaehlungBeginnen() {
  'use server'

  const betrieb = await prisma.betrieb.findFirst({ orderBy: { angelegtAm: 'asc' } })
  if (betrieb === null) throw new Error('Kein Betrieb angelegt — zuerst `npm run db:seed`')

  // Eine offene Zählung von heute wird fortgesetzt statt verdoppelt. Wer die
  // Seite zweimal öffnet, soll nicht zwei halbe Zählungen erzeugen.
  const laufend = await prisma.zaehlung.findFirst({
    where: { betriebId: betrieb.id, datum: heute(), status: ZaehlungStatus.OFFEN },
  })

  const zaehlung =
    laufend ??
    (await prisma.zaehlung.create({ data: { betriebId: betrieb.id, datum: heute() } }))

  redirect(`/zaehlung/${zaehlung.id}`)
}

export default async function Page() {
  const zaehlungen = await prisma.zaehlung.findMany({
    orderBy: { datum: 'desc' },
    take: 20,
    include: { _count: { select: { positionen: true } } },
  })

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4">
      <h1 className="text-2xl font-semibold">Zählungen</h1>

      <form action={zaehlungBeginnen} className="mt-4">
        <button
          type="submit"
          className="h-14 w-full rounded-xl bg-sky-600 text-base font-medium text-white"
        >
          Zählung beginnen
        </button>
      </form>

      {zaehlungen.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
          Noch keine Zählung vorhanden.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {zaehlungen.map((zaehlung) => (
            <li key={zaehlung.id}>
              <Link
                href={`/zaehlung/${zaehlung.id}`}
                className="flex h-14 items-center justify-between gap-3"
              >
                <span className="tabular-nums">
                  {zaehlung.datum.toISOString().slice(0, 10).split('-').reverse().join('.')}
                </span>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {zaehlung._count.positionen} Werte ·{' '}
                  {zaehlung.status === ZaehlungStatus.ABGESCHLOSSEN ? 'abgeschlossen' : 'offen'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
