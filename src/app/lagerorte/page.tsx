/**
 * Die Lager, in denen gezählt wird — Theke, Kiosk, Kühlcontainer und was sonst
 * noch Ware trägt.
 *
 * Ein Lagerort sagt, *wo gezählt wurde*, und nicht, wo Ware gebucht ist. Der
 * Bestand eines Artikels bleibt die Summe über alle Orte; es gibt keinen
 * Bestand je Lager und deshalb auch keine Umlagerung, die jemand nachtragen
 * müsste. Diese Seite pflegt also eine Liste von Zählplätzen, keine Filialen.
 *
 * Die Reihenfolge ist die des Anlegens und ausdrücklich keine Laufreihenfolge:
 * in welcher Folge gezählt wird, entscheidet der, der zählt. Die Liste steht
 * nur deshalb fest, damit sie nicht bei jedem Aufruf springt.
 *
 * Gelöscht wird ein Ort nur, solange nie an ihm gezählt wurde. Alles andere
 * wird stillgelegt — an einem Ort mit Zählwerten hängen Bestände von Wochen.
 */

import { pflichtBetriebsleiter } from '@/lib/anmeldung'
import {
  NAME_MAXLAENGE,
  darfGeloeschtWerden,
  namensfehlerText,
  zustandstext,
  type Namensfehler,
} from '@/lib/lagerorte'
import { prisma } from '@/lib/prisma'
import { BESCHRIFTUNG, FELD } from '@/ui/feld'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Leerzustand } from '@/ui/zustand'

import { Geruest } from '../geruest'
import { lagerortAnlegen, lagerortUmbenennen, lagerortUmschalten } from './aktionen'
import { LagerortLoeschen } from './loeschen'

// Ein Datenbankzugriff macht eine Seite nicht von allein dynamisch: ohne diese
// Zeile stünde die Liste nach dem Build für immer so da, wie sie einmal war.
export const dynamic = 'force-dynamic'

/** Die Meldungen, die als Suchparameter zurückkommen. */
function fehlertext(fehler: string): string | null {
  if (fehler === 'leer' || fehler === 'zu-lang' || fehler === 'doppelt') {
    return namensfehlerText(fehler as Namensfehler)
  }
  if (fehler === 'letzter') {
    return 'Das ist das letzte aktive Lager. Ohne mindestens eines lässt sich nichts mehr zählen — legen Sie erst das neue an.'
  }
  if (fehler === 'gezaehlt') {
    return 'An diesem Lager hängen Zählwerte. Es lässt sich stilllegen, aber nicht löschen: die alten Bestände gehören zu Zählungen, die stattgefunden haben.'
  }
  return null
}

export default async function Page({ searchParams }: PageProps<'/lagerorte'>) {
  const parameter = await searchParams
  const { betrieb } = await pflichtBetriebsleiter()

  const orte = await prisma.lagerort.findMany({
    where: { betriebId: betrieb.id },
    // Anlagereihenfolge über die zeitgeordnete UUIDv7 — siehe Kopf der Datei.
    orderBy: { id: 'asc' },
    include: { _count: { select: { zaehlpositionen: true } } },
  })

  const meldung = typeof parameter.fehler === 'string' ? fehlertext(parameter.fehler) : null
  const aktive = orte.filter((ort) => ort.aktiv).length

  return (
    <Geruest>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 pb-0 md:py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold md:text-titel">Lager</h1>
          <Modusumschalter className="md:hidden" />
        </div>

        <p className="mt-3 max-w-[60ch] text-base text-text-muted">
          Die Orte, an denen gezählt wird. Beim Zählen wird ein Lager gewählt und darin erfasst;
          der Bestand eines Artikels ist die Summe über alle Lager. In welcher Reihenfolge gezählt
          wird, gibt diese Liste nicht vor.
        </p>

        {meldung !== null && (
          <div className="mt-4">
            <Hinweisleiste rolle="attention" titel="Nicht übernommen">
              {meldung}
            </Hinweisleiste>
          </div>
        )}

        {orte.length === 0 ? (
          <div className="mt-6">
            <Leerzustand
              titel="Noch kein Lager."
              erklaerung="Ohne Lager lässt sich nichts zählen. Legen Sie unten das erste an — etwa die Theke."
            />
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-tapgap">
            {orte.map((ort) => (
              <li
                key={ort.id}
                className="flex flex-col gap-tapgap rounded-ctl border border-border bg-surface p-3"
              >
                {/* Umbenennen ist ein eigenes Formular: zwei Formulare
                    nebeneinander statt eines mit zwei Zielen — verschachteln
                    lassen sie sich nicht, und ein Namensfeld, das beim
                    Stilllegen mitreist, wäre eine stille Zweitwirkung. */}
                <form action={lagerortUmbenennen} className="flex items-end gap-tapgap">
                  <input type="hidden" name="id" value={ort.id} />
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={BESCHRIFTUNG}>Name</span>
                    <input
                      name="name"
                      defaultValue={ort.name}
                      maxLength={NAME_MAXLAENGE}
                      required
                      className={FELD}
                    />
                  </label>
                  <div className="shrink-0">
                    <Schaltflaeche art="sekundaer" type="submit">
                      Speichern
                    </Schaltflaeche>
                  </div>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="text-sm text-text-muted">
                    {zustandstext({
                      id: ort.id,
                      name: ort.name,
                      aktiv: ort.aktiv,
                      positionen: ort._count.zaehlpositionen,
                    })}
                  </p>

                  <div className="flex flex-wrap items-center gap-tapgap">
                    {darfGeloeschtWerden({
                      id: ort.id,
                      name: ort.name,
                      aktiv: ort.aktiv,
                      positionen: ort._count.zaehlpositionen,
                    }) && <LagerortLoeschen id={ort.id} name={ort.name} />}

                    <form action={lagerortUmschalten}>
                      <input type="hidden" name="id" value={ort.id} />
                      {/* Das letzte aktive Lager lässt sich nicht stilllegen.
                          Die Fläche ist dann gesperrt und trägt den Grund —
                          eine Fläche, die auf Tippen nichts tut, wäre schlechter
                          als eine, die sagt warum. */}
                      <Schaltflaeche
                        art="sekundaer"
                        type="submit"
                        disabled={ort.aktiv && aktive === 1}
                      >
                        {ort.aktiv
                          ? aktive === 1
                            ? 'Letztes Lager'
                            : 'Stilllegen'
                          : 'Wieder aufnehmen'}
                      </Schaltflaeche>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Das Anlegen steht unten: auf dem Telefon liegt alles Auslösende im
            unteren Drittel, und die Liste ist das, was man zuerst liest. */}
        <form
          action={lagerortAnlegen}
          className="mt-6 mb-4 flex flex-col gap-tapgap sm:flex-row sm:items-end"
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={BESCHRIFTUNG}>Neues Lager</span>
            <input
              name="name"
              required
              maxLength={NAME_MAXLAENGE}
              placeholder="Kühlcontainer"
              className={FELD}
            />
          </label>
          <div className="shrink-0">
            <Schaltflaeche type="submit">Lager anlegen</Schaltflaeche>
          </div>
        </form>
      </main>
    </Geruest>
  )
}
