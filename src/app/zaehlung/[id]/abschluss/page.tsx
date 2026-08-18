/**
 * Das Ergebnis einer abgeschlossenen Zählung.
 *
 * Eine eigene Adresse und keine Bestätigungsmeldung: der Bildschirm erscheint
 * direkt nach dem Abschluss und wird Wochen später aus der Zählungsliste wieder
 * geöffnet. Deshalb steht oben keine Feier, sondern das, was dann noch
 * interessiert — Datum, Vollständigkeit, Dauer.
 *
 * Darunter drei Zahlen, und die mittlere ist der Grund für diese Seite: Artikel
 * ohne Einkaufspreis sind gezählt, aber nicht bewertbar. Sie stehen als eigene
 * Kennzahl neben dem Bestandswert und nicht als Fussnote darunter, weil der
 * Bestandswert ohne sie nicht zu lesen ist. In die Summe fliessen sie nie mit 0
 * — das ist die Rechnung in src/lib/auswertung.ts, hier wird sie nur gezeigt.
 *
 * Bearbeiten gibt es nicht. Eine abgeschlossene Zählung ist zu; fehlende Preise
 * gehören in die Stammdaten, die Zählwerte bleiben, wie sie im Lager erfasst
 * wurden.
 *
 * Gerechnet wird hier nichts: Bestand, Kategorien, Dauer und die Zahl der
 * auffälligen Schwundzeilen kommen fertig aus src/lib/auswertung-daten.ts.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { pflichtBenutzer } from '@/lib/anmeldung'
import { istBetriebsleiter } from '@/lib/berechtigungen'
import { alsMenge, type Kategoriebestand } from '@/lib/auswertung'
import { zaehlungsergebnis, type Zaehlungsergebnis } from '@/lib/auswertung-daten'
import { alsDatumstext, kalenderwoche } from '@/lib/datum'
import { istKennung } from '@/lib/kennung'
import { alsEuro } from '@/lib/wareneingang'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Kennzahl } from '@/ui/kennzahl'
import { Listenzeile } from '@/ui/listenzeile'
import { Wegflaeche } from '@/ui/wegflaeche'

// Ohne diese Zeile rendert der Build das Ergebnis einmal und friert es ein —
// es hinge dann an den Preisen, die beim Bauen im Stamm standen.
export const dynamic = 'force-dynamic'

export default async function Page({ params }: PageProps<'/zaehlung/[id]/abschluss'>) {
  const { id } = await params
  if (!istKennung(id)) notFound()

  const benutzer = await pflichtBenutzer()
  const ergebnis = await zaehlungsergebnis(benutzer.betrieb.id, id)
  if (ergebnis === null) notFound()
  // Eine laufende Zählung hat kein Ergebnis, sondern eine Maske.
  if (!ergebnis.abgeschlossen) redirect(`/zaehlung/${id}`)

  // Bestandswert, Kategoriewerte und Schwund sind Geld — sie erscheinen nur
  // der Betriebsleitung. Der Mitarbeiter sieht, dass seine Zählung angekommen
  // ist: Datum, Vollständigkeit, Dauer, und den Weg zu den gezählten Werten.
  const mitWerten = istBetriebsleiter(benutzer.rolle)

  const gesperrt = ergebnis.ohnePreis.length > 0

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-2 md:px-6">
        <Link
          href="/zaehlung"
          className="tap flex h-tap items-center gap-1 rounded-ctl px-2.5 text-zeile text-primary-text focus-visible:fokus"
        >
          <span aria-hidden className="text-xl leading-none">
            ‹
          </span>
          Zählungen
        </Link>
        <p className="pr-2 font-mono text-abschnitt font-normal tracking-normal text-text-muted">
          KW {kalenderwoche(ergebnis.datum)}
        </p>
      </header>

      {/* flex-1 nur auf dem Telefon: dort drückt es den Fuss an den unteren
          Rand, wo er hingehört. Auf dem Desktop stünde er sonst allein am Ende
          einer halbleeren Seite, weit weg von der Tabelle, auf die er sich
          bezieht. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 md:flex-none md:gap-7 md:px-8 md:py-8">
        <Bestaetigung ergebnis={ergebnis} />

        {/* Der Bestandswert über die volle Breite, die beiden Zahlen zu seiner
            Einordnung darunter nebeneinander: auf 390 px trägt ein Euro-Betrag
            keine halbe Spalte, zwei Stückzahlen schon. */}
        {mitWerten && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <Kennzahl
              beschriftung="Bestandswert"
              wert={
                ergebnis.bestand.wertCent === null ? undefined : alsEuro(ergebnis.bestand.wertCent)
              }
              unterzeile={
                gesperrt
                  ? `Mindestwert · ${artikelzahl(ergebnis.ohnePreis.length)} ohne Preis fehlen`
                  : `${alsMenge(ergebnis.bestand.einheiten)} Einheiten · ${kategoriezahl(ergebnis.kategorien.length)}`
              }
              rolle={gesperrt ? 'attention' : 'neutral'}
            />
          </div>
          <Kennzahl
            beschriftung="Nicht bewertbar"
            wert={String(ergebnis.ohnePreis.length)}
            unterzeile={
              gesperrt
                ? 'gezählt, aber ohne Einkaufspreis'
                : 'jeder gezählte Artikel hat einen Preis'
            }
            rolle={gesperrt ? 'attention' : 'neutral'}
          />
          <Kennzahl
            beschriftung="Auffälliger Schwund"
            // Ohne Vorgängerzählung gibt es keinen Zeitraum und damit keinen
            // Schwund. Eine 0 hiesse "nachgesehen, nichts fehlt" — nachgesehen
            // hat niemand.
            wert={
              ergebnis.auffaelligerSchwund === null
                ? undefined
                : String(ergebnis.auffaelligerSchwund)
            }
            unterzeile={
              ergebnis.auffaelligerSchwund === null
                ? 'braucht zwei Zählungen'
                : 'Artikel über der Schwelle'
            }
            rolle={
              ergebnis.auffaelligerSchwund !== null && ergebnis.auffaelligerSchwund > 0
                ? 'danger'
                : 'neutral'
            }
          />
        </div>
        )}

        {mitWerten && gesperrt && <OhnePreis artikel={ergebnis.ohnePreis} />}

        {mitWerten && <Kategorien kategorien={ergebnis.kategorien} bestand={ergebnis.bestand} />}
      </main>

      {/* Auf dem Telefon fest im Fuss, im unteren Drittel. Auf dem Desktop
          rechts unter der Tabelle: row-reverse legt die primäre Fläche nach
          rechts aussen, ohne die Reihenfolge im Dokument zu drehen. */}
      <footer className="sticky bottom-0 z-10 mx-auto flex w-full max-w-5xl flex-col gap-tapgap border-t border-border bg-surface px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:static md:flex-row-reverse md:justify-start md:border-0 md:bg-transparent md:px-8 md:pt-0 md:pb-8">
        {/* Die Auswertung ist Geld — für den Mitarbeiter gibt es hier weder
            den Weg noch die Sperre, die von ihm spräche. */}
        {mitWerten &&
          (gesperrt ? (
            // Kein Link, keine Fläche zum Antippen: die Auswertung würde einen
            // Bestandswert zeigen, dem vier Artikel fehlen. Die Aufschrift trägt
            // den Grund der Sperre, nicht nur die Sperre.
            <span
              aria-disabled
              className="flex min-h-tap flex-col items-center justify-center rounded-ctl bg-surface-2 px-6 text-center text-zeile font-semibold text-text-muted"
            >
              Zur Auswertung
              <span className="text-sm font-normal">braucht alle Einkaufspreise</span>
            </span>
          ) : (
            <Wegflaeche href="/auswertung">Zur Auswertung</Wegflaeche>
          ))}
        <Wegflaeche href={`/zaehlung/${ergebnis.zaehlungId}`} art="sekundaer">
          Werte ansehen
        </Wegflaeche>
      </footer>
    </div>
  )
}

/**
 * Die ruhige Bestätigung oben: ein Punkt, ein Satz, drei Fakten.
 *
 * Der Punkt trägt seine Aussage nicht allein — daneben steht sie als Wort.
 */
function Bestaetigung({ ergebnis }: { ergebnis: Zaehlungsergebnis }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h1 className="flex items-center gap-2.5 text-titel">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-confirm" />
        Zählung abgeschlossen
      </h1>

      {/* Auf dem Telefon Beschriftung links, Wert rechts — die Form, in der
          vier kurze Zeilen im Vorbeigehen lesbar sind. Auf dem Desktop stehen
          sie nebeneinander, wo die Breite dafür da ist. */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 md:flex md:gap-10">
        <Fakt beschriftung="Datum" wert={alsDatumstext(ergebnis.datum)} />
        <Fakt beschriftung="Artikel" wert={`${ergebnis.gezaehlt} von ${ergebnis.aktiv}`} />
        <Fakt beschriftung="Dauer" wert={ergebnis.dauer ?? undefined} />
      </dl>
    </section>
  )
}

function Fakt({ beschriftung, wert }: { beschriftung: string; wert?: string }) {
  return (
    <div className="contents md:flex md:flex-col md:gap-1">
      <dt className="text-base text-text-muted md:text-beschriftung md:uppercase">{beschriftung}</dt>
      <dd className="text-right text-base font-medium md:text-left">{wert ?? '—'}</dd>
    </div>
  )
}

/**
 * Welche Artikel keinen Wert haben — die Erklärung der Sperre.
 *
 * Sie stehen namentlich da und nicht als blosse Zahl: "vier Artikel ohne Preis"
 * lässt sich nicht abarbeiten, "Aperol, Campari, …" schon. Der Weg führt in die
 * Stammdaten, denn dorthin gehört der Preis — die Zählung bleibt unverändert.
 */
function OhnePreis({ artikel }: { artikel: Zaehlungsergebnis['ohnePreis'] }) {
  return (
    <section className="flex flex-col gap-2">
      <Hinweisleiste
        rolle="attention"
        titel={`${artikelzahl(artikel.length)} gezählt, aber ohne Einkaufspreis`}
        aktion={
          <span className="w-full sm:w-auto">
            <Wegflaeche href="/artikel" art="sekundaer" rolle="attention" breit>
              Stammdaten öffnen
            </Wegflaeche>
          </span>
        }
      >
        Ihr Bestand ist gezählt, sein Wert unbekannt — er fehlt in der Summe und zählt dort nicht als
        0. Der Preis wird in den Stammdaten gepflegt, die Zählung bleibt unverändert.
      </Hinweisleiste>

      <div className="flex flex-col gap-tapgap">
        {artikel.map((eintrag) => (
          <Listenzeile key={eintrag.id} titel={eintrag.name} unterzeile={eintrag.kategorie} />
        ))}
      </div>
    </section>
  )
}

/**
 * Der Bestand nach Kategorie.
 *
 * Zweimal dieselben Zahlen aus derselben Quelle: auf dem Telefon als Liste, auf
 * dem Desktop als Tabelle mit dem Anteil am Wert. Auf 390 px stünde der Balken
 * zwischen Name und Betrag und nähme beiden den Platz.
 *
 * Eine Kategorie ohne bekannten Wert trägt einen Gedankenstrich und steht
 * hinten — sortiert wird in src/lib/auswertung.ts.
 */
function Kategorien({
  kategorien,
  bestand,
}: {
  kategorien: Kategoriebestand[]
  bestand: Zaehlungsergebnis['bestand']
}) {
  if (kategorien.length === 0) {
    return <p className="text-base text-text-muted">In dieser Zählung wurde nichts erfasst.</p>
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-abschnitt text-text-muted uppercase">Bestand nach Kategorie</h2>

      <div className="flex flex-col gap-tapgap md:hidden">
        {kategorien.map((eintrag) => (
          <Listenzeile
            key={eintrag.kategorie}
            titel={eintrag.kategorie}
            unterzeile={unterzeile(eintrag)}
            wert={eintrag.wertCent === null ? undefined : alsEuro(eintrag.wertCent)}
          />
        ))}
        <div className="flex min-h-tap items-center gap-3.5 rounded-ctl border border-border bg-surface-2 px-4 py-2">
          <span className="flex-1 text-zeile font-semibold">Summe</span>
          <span className="text-sm text-text-muted">{alsMenge(bestand.einheiten)}</span>
          <span className="text-zeile font-semibold">
            {bestand.wertCent === null ? '—' : alsEuro(bestand.wertCent)}
          </span>
        </div>
      </div>

      <table className="hidden w-full border-separate border-spacing-0 md:table">
        <thead>
          <tr className="text-abschnitt text-text-muted uppercase">
            <th className="border-b border-border bg-surface-2 px-4 py-2.5 text-left font-semibold">
              Kategorie
            </th>
            <th className="w-full border-b border-border bg-surface-2 px-4 py-2.5 text-left font-semibold">
              Anteil am Wert
            </th>
            <th className="border-b border-border bg-surface-2 px-4 py-2.5 text-right font-semibold whitespace-nowrap">
              Einheiten
            </th>
            <th className="border-b border-border bg-surface-2 px-4 py-2.5 text-right font-semibold whitespace-nowrap">
              Wert
            </th>
          </tr>
        </thead>
        <tbody>
          {kategorien.map((eintrag) => (
            <tr key={eintrag.kategorie}>
              <td className="border-b border-border px-4 py-2.5 text-base font-medium whitespace-nowrap">
                {eintrag.kategorie}
              </td>
              <td className="border-b border-border px-4 py-2.5">
                <Anteilsbalken anteil={eintrag.anteil} />
              </td>
              <td className="border-b border-border px-4 py-2.5 text-right text-base whitespace-nowrap text-text-muted">
                {alsMenge(eintrag.einheiten)}
              </td>
              <td className="border-b border-border px-4 py-2.5 text-right text-base font-medium whitespace-nowrap">
                {eintrag.wertCent === null ? (
                  <span className="text-text-muted">—</span>
                ) : (
                  alsEuro(eintrag.wertCent)
                )}
                {eintrag.ohnePreis > 0 && eintrag.wertCent !== null && (
                  <span className="block text-sm font-normal text-attention-text">
                    + {eintrag.ohnePreis} ohne Wert
                  </span>
                )}
              </td>
            </tr>
          ))}
          <tr className="bg-surface-2">
            <td className="px-4 py-3 text-base font-semibold">Summe</td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3 text-right text-base font-semibold whitespace-nowrap">
              {alsMenge(bestand.einheiten)}
            </td>
            <td className="px-4 py-3 text-right text-base font-semibold whitespace-nowrap">
              {bestand.wertCent === null ? '—' : alsEuro(bestand.wertCent)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

/**
 * Der Anteil einer Kategorie am Bestandswert als Balken.
 *
 * Die Breite kommt fertig als Anteil aus src/lib/auswertung.ts und wird hier
 * nur in ein `scaleX` gelegt — dieselbe Form wie der Fortschrittsbalken der
 * Zählmaske. Vor der Sprachausgabe verborgen: die beiden Spalten daneben sagen
 * dasselbe genauer.
 */
function Anteilsbalken({ anteil }: { anteil: number | null }) {
  if (anteil === null) return null

  return (
    <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full w-full origin-left rounded-full bg-primary"
        style={{ transform: `scaleX(${anteil})` }}
      />
    </div>
  )
}

/** "38 Einheiten" — und dazu die Lücke, wo eine ist. */
function unterzeile(eintrag: Kategoriebestand): string {
  const einheiten = `${alsMenge(eintrag.einheiten)} Einheiten`
  if (eintrag.ohnePreis === 0) return einheiten
  return `${einheiten} · ${eintrag.ohnePreis} ohne Wert`
}

/** "1 Artikel" / "4 Artikel" — die Mehrzahl ist im Deutschen dieselbe Form. */
function artikelzahl(wert: number): string {
  return `${wert} Artikel`
}

function kategoriezahl(wert: number): string {
  return `${wert} ${wert === 1 ? 'Kategorie' : 'Kategorien'}`
}
