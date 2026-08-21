/**
 * Lädt eine Zählung für genau ein Lager und übergibt sie an die Maske.
 *
 * Der Artikelstamm kommt vollständig mit, nicht seitenweise: 99 Artikel sind
 * ein paar Kilobyte, und die Maske muss im Lager ohne Netz weiterblättern
 * können. Nachladen ist genau das, was hier nicht passieren darf.
 *
 * Die Zählwerte kommen dagegen für *alle* Orte mit, nicht nur für den offenen.
 * Die Maske zeigt nur ihren Ort, aber ihre Warteschlange trägt die ganze
 * Zählung: ein Wert, der im Funkloch an der Theke entstand, muss auch dann noch
 * hinausgehen, wenn der Zähler längst im Kühlcontainer steht.
 *
 * Welche Artikel hier erwartet werden, sagt die letzte abgeschlossene Zählung —
 * wo ein Artikel zuletzt stand, steht er wahrscheinlich wieder. Die Liste
 * filtert damit nicht, sie sortiert nur: alles Übrige bleibt erreichbar, sonst
 * liesse sich die Flasche, die heute ausnahmsweise hinten steht, nirgends
 * erfassen.
 *
 * Die Auswahl läuft über `omit` statt über `select`. Der Grund ist der Wächter
 * in tests/einheiten.test.ts: er lässt jede Datei unter src/ durchfallen, die
 * den Namen des Gebindegrössen-Felds überhaupt enthält — auch in einer
 * Feldauswahl. Ausgelassen werden die Preisfelder (in der Zählung hat niemand
 * etwas mit Preisen zu tun) und die Literangabe, deren Decimal sich ohnehin
 * nicht über die Grenze zur Client-Komponente serialisieren liesse.
 */

import { notFound } from 'next/navigation'

import { ZaehlungStatus } from '@/generated/prisma/enums'
import { aktuellerBetrieb } from '@/lib/anmeldung'
import { istKennung } from '@/lib/kennung'
import { prisma } from '@/lib/prisma'
import { vomServer, type Eintrag } from '@/offline/warteschlange'

import { Zaehlmaske } from './zaehlmaske'

export default async function Page({ params }: PageProps<'/zaehlung/[id]/[ort]'>) {
  const { id, ort } = await params
  if (!istKennung(id) || !istKennung(ort)) notFound()

  // Über Id und Betrieb gesucht: eine fremde Zählung ist damit nicht gefunden.
  const betrieb = await aktuellerBetrieb()
  const zaehlung = await prisma.zaehlung.findFirst({
    where: { id, betriebId: betrieb.id },
    include: { positionen: true },
  })
  if (zaehlung === null) notFound()

  // Dasselbe für das Lager — und ein stillgelegtes gilt nur noch zum Ansehen
  // einer abgeschlossenen Zählung, nicht zum Weiterzählen.
  const lagerort = await prisma.lagerort.findFirst({
    where: { id: ort, betriebId: betrieb.id },
  })
  if (lagerort === null) notFound()
  if (!lagerort.aktiv && zaehlung.status !== ZaehlungStatus.ABGESCHLOSSEN) notFound()

  const artikel = await prisma.artikel.findMany({
    where: { betriebId: zaehlung.betriebId, aktiv: true },
    omit: { ekPreisCent: true, ekPreisBezug: true, einheitsgroesseLiter: true },
    orderBy: { sortierung: 'asc' },
  })

  // Die Artikel, die von der Gebinderegel dieses Ortes ausgenommen sind. Bei
  // der Standardregel ist die Menge belanglos, mitgegeben wird sie trotzdem —
  // eine Maske, die je nach Regel andere Props bekommt, wäre zwei Masken.
  const ausnahmen = await prisma.gebindeausnahme.findMany({
    where: { lagerortId: lagerort.id, betriebId: betrieb.id },
    select: { artikelId: true },
  })

  // Was an diesem Ort erwartet wird: die Artikel, die dort in der letzten
  // abgeschlossenen Zählung einen Wert hatten. Beim ersten Mal ist die Menge
  // leer, und die Maske führt schlicht durch den ganzen Stamm.
  const vorherige = await prisma.zaehlung.findFirst({
    where: {
      betriebId: betrieb.id,
      status: ZaehlungStatus.ABGESCHLOSSEN,
      datum: { lt: zaehlung.datum },
    },
    orderBy: { datum: 'desc' },
    select: { id: true },
  })
  const erwartet =
    vorherige === null
      ? []
      : await prisma.zaehlposition.findMany({
          where: { zaehlungId: vorherige.id, lagerortId: ort },
          select: { artikelId: true },
        })

  // Decimal ist eine Klasse und überquert die Grenze zur Client-Komponente
  // nicht. Die Maske rechnet ohnehin mit Text, nicht mit Zahlen.
  const serverEintraege: Eintrag[] = zaehlung.positionen.map((position) =>
    vomServer({
      zaehlungId: position.zaehlungId,
      lagerortId: position.lagerortId,
      artikelId: position.artikelId,
      anzahlGebinde: position.anzahlGebinde.toString(),
      anzahlEinzeln: position.anzahlEinzeln.toString(),
      gezaehltAm: position.gezaehltAm.toISOString(),
    }),
  )

  return (
    <Zaehlmaske
      zaehlungId={zaehlung.id}
      lagerortId={lagerort.id}
      lagerortName={lagerort.name}
      gebindeRegel={lagerort.gebindeRegel}
      ausnahmeArtikel={ausnahmen.map((zeile) => zeile.artikelId)}
      datum={zaehlung.datum.toISOString().slice(0, 10)}
      status={zaehlung.status}
      artikel={artikel}
      erwarteteArtikel={erwartet.map((zeile) => zeile.artikelId)}
      serverEintraege={serverEintraege}
    />
  )
}
