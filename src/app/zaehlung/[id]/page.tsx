/**
 * Lädt eine Zählung mit ihrem Artikelstamm und übergibt beides an die Maske.
 *
 * Der Artikelstamm kommt vollständig mit, nicht seitenweise: 99 Artikel sind
 * ein paar Kilobyte, und die Maske muss im Lager ohne Netz weiterblättern
 * können. Nachladen ist genau das, was hier nicht passieren darf.
 *
 * Die Auswahl läuft über `omit` statt über `select`. Der Grund ist der Wächter
 * in tests/einheiten.test.ts: er lässt jede Datei unter src/ durchfallen, die
 * den Namen des Gebindegrössen-Felds überhaupt enthält — auch in einer
 * Feldauswahl. Ausgelassen werden die Preisfelder (in der Zählung hat niemand
 * etwas mit Preisen zu tun) und die Literangabe, deren Decimal sich ohnehin
 * nicht über die Grenze zur Client-Komponente serialisieren liesse.
 */

import { notFound } from 'next/navigation'

import { prisma } from '@/lib/prisma'
import { vomServer, type Eintrag } from '@/offline/warteschlange'

import { Zaehlmaske } from './zaehlmaske'

export default async function Page({ params }: PageProps<'/zaehlung/[id]'>) {
  const { id } = await params

  const zaehlung = await prisma.zaehlung.findUnique({
    where: { id },
    include: { positionen: true },
  })
  if (zaehlung === null) notFound()

  const artikel = await prisma.artikel.findMany({
    where: { betriebId: zaehlung.betriebId, aktiv: true },
    omit: { ekPreisCent: true, ekPreisBezug: true, einheitsgroesseLiter: true },
    orderBy: { sortierung: 'asc' },
  })

  // Decimal ist eine Klasse und überquert die Grenze zur Client-Komponente
  // nicht. Die Maske rechnet ohnehin mit Text, nicht mit Zahlen.
  const serverEintraege: Eintrag[] = zaehlung.positionen.map((position) =>
    vomServer({
      zaehlungId: position.zaehlungId,
      artikelId: position.artikelId,
      anzahlGebinde: position.anzahlGebinde.toString(),
      anzahlEinzeln: position.anzahlEinzeln.toString(),
      gezaehltAm: position.gezaehltAm.toISOString(),
    }),
  )

  return (
    <Zaehlmaske
      zaehlungId={zaehlung.id}
      datum={zaehlung.datum.toISOString().slice(0, 10)}
      status={zaehlung.status}
      artikel={artikel}
      serverEintraege={serverEintraege}
    />
  )
}
