'use client'

/**
 * Der Kassenimport in drei Schritten: Datei, Zeitraum, Rohzeilen.
 *
 * Serverseitig sind es zwei Gänge — die Vorschau und das Schreiben, beide durch
 * dieselbe Funktion in src/lib/kassenimport.ts. Die Schritte 2 und 3 zeigen
 * dieselbe Vorschau von zwei Seiten und werden nur umgeblättert; die Datei wird
 * dafür nicht ein zweites Mal gelesen. Eine zweite Anfrage zwischen "Zeitraum
 * prüfen" und "Rohzeilen prüfen" könnte eine andere Antwort geben als die, auf
 * die jemand gerade geschaut hat.
 *
 * Schritt 2 ist der, wegen dem es die Maske gibt: schliesst dieser Zeitraum an
 * den vorigen Import an. Fehlende Tage treiben den Schwund nach oben, doppelte
 * nach unten, und beides fällt in der Auswertung nicht mehr auf.
 *
 * Gerechnet wird hier nichts. Zahlen, Anschlussurteil und Erklärsätze kommen
 * fertig aus src/lib.
 */

import { startTransition, useActionState, useState } from 'react'

import type { Kassenimportvorschau, Rohzeile } from '@/lib/kassenimport'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { flaechenfassung, Wegflaeche } from '@/ui/wegflaeche'

import { kassenimport, type Importzustand } from './aktionen'
import { Anschlussleiste, Importkette, type Kettenbalken } from './anschlussleiste'

const LEER: Importzustand = { art: 'leer' }

/** Welche Seite der Vorschau gerade oben liegt. */
type Ansicht = 'zeitraum' | 'zeilen'

export function Importmaske({
  naechsterTag,
  letztesEnde,
  balken,
}: {
  /** Der Tag, an dem eine lückenlose Datei beginnen müsste. `null` vor dem ersten Import. */
  naechsterTag: string | null
  /** Ende des jüngsten Imports. `null`, solange keiner da ist. */
  letztesEnde: string | null
  /** Die bisherigen Importe als Balkenreihe, ältester zuerst. */
  balken: Kettenbalken[]
}) {
  const [zustand, aktion, laeuft] = useActionState(kassenimport, LEER)
  const [datei, setzeDatei] = useState<File | null>(null)
  const [ansicht, setzeAnsicht] = useState<Ansicht>('zeitraum')
  const [ersetzen, setzeErsetzen] = useState<string[]>([])

  // Eine frisch eingetroffene Vorschau blättert auf ihre erste Seite zurück und
  // wählt die deckungsgleichen Zeiträume zum Ersetzen vor: dieselbe Woche
  // zweimal hochgeladen ist fast immer eine Wiederholung und fast nie ein
  // zweiter Absatz. Teilüberschneidungen bleiben leer — die muss jemand ansehen.
  const [gesehen, setzeGesehen] = useState<Importzustand>(zustand)
  if (gesehen !== zustand) {
    setzeGesehen(zustand)
    setzeAnsicht('zeitraum')
    setzeErsetzen(
      zustand.art === 'vorschau'
        ? zustand.vorschau.ueberschneidungen
            .filter((eintrag) => eintrag.deckungsgleich)
            .map((eintrag) => eintrag.id)
        : [],
    )
  }

  const schritt: 1 | 2 | 3 | 4 =
    zustand.art === 'fertig' ? 4 : zustand.art !== 'vorschau' ? 1 : ansicht === 'zeitraum' ? 2 : 3

  /**
   * Die Datei wird für beide Gänge aus dem Zustand geschickt und nicht aus dem
   * Formular gelesen: React setzt ein Formular nach einer Aktion zurück, und das
   * Dateifeld wäre für den zweiten Gang leer. Es ist dieselbe Datei und dieselbe
   * Funktion dahinter — die Vorschau soll auf das schauen, was danach geschrieben
   * wird, und nicht auf eine zweite Lesung.
   */
  function schicke(modus: 'vorschau' | 'schreiben') {
    if (datei === null) return
    const daten = new FormData()
    daten.set('datei', datei)
    daten.set('modus', modus)
    for (const id of ersetzen) daten.append('ersetze', id)
    startTransition(() => {
      aktion(daten)
    })
  }

  return (
    <div className="mt-4 overflow-hidden rounded-ctl border border-border">
      <div className="flex min-h-tap flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="text-zeile">Kassenimport</h2>
        {datei !== null && (
          <span className="truncate rounded-ctl bg-surface-2 px-2 py-1 font-mono text-sm text-text-muted">
            {datei.name}
          </span>
        )}
        <span className="ml-auto text-sm text-text-muted">
          {schritt === 4 ? 'Mengen geschrieben' : 'Mengen werden erst mit „Importieren“ geschrieben'}
        </span>
      </div>

      <Schrittleiste
        schritt={schritt}
        zeitraumZeile={
          zustand.art === 'vorschau'
            ? zustand.vorschau.anschluss?.titel ?? 'Ohne Zeitraum'
            : zustand.art === 'fertig'
              ? zustand.ergebnis.anschluss?.titel ?? null
              : null
        }
        zeilenZeile={
          zustand.art === 'vorschau'
            ? `${zustand.vorschau.offeneZuordnungen} von ${zustand.vorschau.bezeichnungen} unbekannt`
            : zustand.art === 'fertig'
              ? `${zustand.ergebnis.zeilen} Zeilen geschrieben`
              : null
        }
        dateiZeile={datei?.name ?? null}
      />

      {schritt === 1 && (
        <div className="p-4">
          <Schritt1
            datei={datei}
            setzeDatei={setzeDatei}
            naechsterTag={naechsterTag}
            letztesEnde={letztesEnde}
            laeuft={laeuft}
            weiter={() => {
              schicke('vorschau')
            }}
            fehler={zustand.art === 'fehler' ? zustand.meldung : null}
          />
        </div>
      )}

      {zustand.art === 'vorschau' && (
        <VorschauSchritte
          vorschau={zustand.vorschau}
          dateiname={zustand.dateiname}
          ansicht={ansicht}
          setzeAnsicht={setzeAnsicht}
          ersetzen={ersetzen}
          setzeErsetzen={setzeErsetzen}
          laeuft={laeuft}
          balken={balken}
          schreibe={() => {
            schicke('schreiben')
          }}
        />
      )}

      {zustand.art === 'fertig' && (
        <Fertig ergebnis={zustand.ergebnis} dateiname={zustand.dateiname} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Die Schrittleiste
// ---------------------------------------------------------------------------

function Schrittleiste({
  schritt,
  dateiZeile,
  zeitraumZeile,
  zeilenZeile,
}: {
  schritt: 1 | 2 | 3 | 4
  dateiZeile: string | null
  zeitraumZeile: string | null
  zeilenZeile: string | null
}) {
  return (
    <ol className="grid gap-2 border-b border-border bg-bg p-3 sm:grid-cols-3">
      <Schrittkarte
        nummer={1}
        titel="Datei"
        zeile={dateiZeile ?? 'Kassenexport auswählen'}
        stand={schritt === 1 ? 'aktiv' : 'fertig'}
      />
      <Schrittkarte
        nummer={2}
        titel="Zeitraum prüfen"
        zeile={zeitraumZeile ?? 'Anschluss an den vorigen Import'}
        stand={schritt === 2 ? 'aktiv' : schritt > 2 ? 'fertig' : 'offen'}
      />
      <Schrittkarte
        nummer={3}
        titel={schritt === 4 ? 'Importiert' : 'Rohzeilen prüfen'}
        zeile={zeilenZeile ?? 'Bezeichnung und Menge'}
        stand={schritt === 3 ? 'aktiv' : schritt > 3 ? 'fertig' : 'offen'}
      />
    </ol>
  )
}

function Schrittkarte({
  nummer,
  titel,
  zeile,
  stand,
}: {
  nummer: number
  titel: string
  zeile: string
  stand: 'aktiv' | 'fertig' | 'offen'
}) {
  const fassung =
    stand === 'aktiv'
      ? 'border-primary bg-primary-soft text-primary-soft-on'
      : stand === 'fertig'
        ? 'border-border bg-surface'
        : 'border-border bg-surface opacity-60'

  return (
    <li className={`flex items-center gap-3 rounded-ctl border p-3 ${fassung}`}>
      <span
        aria-hidden
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          stand === 'fertig'
            ? 'bg-confirm text-confirm-on'
            : stand === 'aktiv'
              ? 'bg-primary text-primary-on'
              : 'border border-border-strong text-text-muted'
        }`}
      >
        {stand === 'fertig' ? '✓' : nummer}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{titel}</span>
        <span className="truncate text-sm text-text-muted">{zeile}</span>
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Schritt 1: die Datei
// ---------------------------------------------------------------------------

function Schritt1({
  datei,
  setzeDatei,
  naechsterTag,
  letztesEnde,
  laeuft,
  weiter,
  fehler,
}: {
  datei: File | null
  setzeDatei: (wert: File | null) => void
  naechsterTag: string | null
  letztesEnde: string | null
  laeuft: boolean
  weiter: () => void
  fehler: string | null
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-zeile">Datei aus dem Kassensystem</h3>
          <p className="mt-1 max-w-[66ch] text-sm text-text-muted">
            Der Bericht „Umsatz nach Artikel und Abrechnungsart“, ein Zeitraum je Datei. Der Zeitraum
            steht im Kopf der Datei und wird im nächsten Schritt geprüft.
          </p>
        </div>

        <label
          htmlFor="datei"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-ctl border-2 border-dashed border-border-strong bg-bg p-8 text-center"
        >
          <span className="text-zeile">Datei hierher ziehen</span>
          <span className="max-w-[44ch] text-sm text-text-muted">
            Oder klicken und im Ordner auswählen. Trennzeichen und Zeichensatz werden erkannt.
          </span>
          {datei !== null && (
            <span className="mt-2 rounded-ctl bg-confirm-soft px-3 py-2 font-mono text-sm text-confirm-soft-on">
              {datei.name}
            </span>
          )}
        </label>
        <input
          id="datei"
          name="datei"
          type="file"
          accept=".csv,text/csv"
          onChange={(ereignis) => {
            setzeDatei(ereignis.target.files?.[0] ?? null)
          }}
          className="block w-full text-sm file:mr-3 file:min-h-tap file:rounded-ctl file:border-0 file:bg-surface-2 file:px-4 file:text-base file:font-medium"
        />

        {fehler !== null && (
          <p className="rounded-ctl bg-danger-soft p-3 text-sm text-danger-soft-on">{fehler}</p>
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <h3 className="text-abschnitt text-text-muted uppercase">Anschluss</h3>
        <div className="rounded-ctl border border-border p-3">
          <p className="text-sm font-semibold">
            {letztesEnde === null
              ? 'Noch kein Import vorhanden'
              : `Letzter Import endet am ${letztesEnde}`}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {naechsterTag === null
              ? 'Der erste Import setzt den Anfang der Kette. Ab ihm zählt jeder weitere gegen sein Ende.'
              : `Die nächste Datei muss am ${naechsterTag} beginnen. Beginnt sie später, fehlen Verkäufe und der Schwund fällt zu hoch aus. Beginnt sie früher, werden Verkäufe doppelt gezählt und der Schwund fällt zu niedrig aus.`}
          </p>
        </div>
        <div className="rounded-ctl border border-border p-3">
          <p className="text-sm font-semibold">Der Zeitraum steht über der Datei</p>
          <p className="mt-1 text-sm text-text-muted">
            Nicht der Dateiname entscheidet, sondern der Kopfblock des Berichts. Ein Export, der über
            die falschen Tage gezogen wurde, wird neu gezogen und nicht hier umdatiert.
          </p>
        </div>
        <div className="rounded-ctl border border-border p-3">
          <p className="text-sm font-semibold">Menge, nicht Umsatz</p>
          <p className="mt-1 text-sm text-text-muted">
            Der Sollbestand rechnet in Flaschen und Litern. Was der Gast gezahlt hat, gehört in die
            Kasse und geht in keine Rechnung dieser App ein.
          </p>
        </div>
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-tapgap border-t border-border pt-3 lg:col-span-2">
        <p className="text-sm text-text-muted">Schritt 1 von 3</p>
        <Schaltflaeche onClick={weiter} disabled={datei === null || laeuft}>
          {laeuft
            ? 'Wird gelesen …'
            : datei === null
              ? 'Erst eine Datei wählen'
              : 'Zeitraum prüfen'}
        </Schaltflaeche>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schritte 2 und 3: dieselbe Vorschau von zwei Seiten
// ---------------------------------------------------------------------------

function VorschauSchritte({
  vorschau,
  dateiname,
  ansicht,
  setzeAnsicht,
  ersetzen,
  setzeErsetzen,
  laeuft,
  balken,
  schreibe,
}: {
  vorschau: Kassenimportvorschau
  dateiname: string
  ansicht: Ansicht
  setzeAnsicht: (wert: Ansicht) => void
  ersetzen: string[]
  setzeErsetzen: (wert: string[]) => void
  laeuft: boolean
  balken: Kettenbalken[]
  schreibe: () => void
}) {
  const offeneUeberschneidungen = vorschau.ueberschneidungen.filter(
    (eintrag) => !ersetzen.includes(eintrag.id),
  )
  const brauchbar =
    vorschau.zeitraum !== null && vorschau.zeilen > 0 && offeneUeberschneidungen.length === 0

  return (
    <>
      {ansicht === 'zeitraum' ? (
        <SchrittZeitraum
          vorschau={vorschau}
          balken={balken}
          ersetzen={ersetzen}
          setzeErsetzen={setzeErsetzen}
          weiter={() => {
            setzeAnsicht('zeilen')
          }}
        />
      ) : (
        <SchrittZeilen
          vorschau={vorschau}
          dateiname={dateiname}
          zurueck={() => {
            setzeAnsicht('zeitraum')
          }}
          brauchbar={brauchbar}
          offeneUeberschneidungen={offeneUeberschneidungen.length}
          ersetzt={ersetzen.length}
          laeuft={laeuft}
          schreibe={schreibe}
        />
      )}
    </>
  )
}

function SchrittZeitraum({
  vorschau,
  balken,
  ersetzen,
  setzeErsetzen,
  weiter,
}: {
  vorschau: Kassenimportvorschau
  balken: Kettenbalken[]
  ersetzen: string[]
  setzeErsetzen: (wert: string[]) => void
  weiter: () => void
}) {
  // Die Kette bis hierher, mit dem geprüften Zeitraum am rechten Ende — und der
  // Lücke davor, wo eine ist. Die Tage kommen gerechnet aus der Vorschau.
  const kette: Kettenbalken[] =
    vorschau.zeitraum === null
      ? balken
      : [
          ...balken,
          ...(vorschau.anschluss?.art === 'luecke'
            ? [
                {
                  art: 'luecke' as const,
                  beschriftung: `${vorschau.anschluss.tage} ${vorschau.anschluss.tage === 1 ? 'Tag' : 'Tage'}`,
                  tage: vorschau.anschluss.tage,
                },
              ]
            : []),
          { art: 'dieser' as const, beschriftung: 'dieser', tage: vorschau.tage },
        ]

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-zeile">Zeitraum aus der Datei</h3>
          <p className="mt-1 max-w-[66ch] text-sm text-text-muted">
            Gelesen aus dem Kopfblock des Berichts, beide Tage einschliesslich. Er ist kein
            Eingabefeld: ein von Hand vorgezogener Anfang behauptet Verkaufstage, die in keiner
            Datei stehen.
          </p>
        </div>

        {vorschau.zeitraum === null ? (
          <p className="rounded-ctl bg-danger-soft p-3 text-base text-danger-soft-on">
            Die Datei nennt keinen Zeitraum. Ohne ihn wüsste keine Auswertung, welche Tage dieser
            Import abdeckt — es wird nichts geschrieben.
          </p>
        ) : (
          <p className="text-count">
            {vorschau.zeitraum.von} <span className="text-text-muted">bis</span>{' '}
            {vorschau.zeitraum.bis}
          </p>
        )}

        {vorschau.anschluss !== null && <Anschlussleiste anschluss={vorschau.anschluss} />}

        {vorschau.ueberschneidungen.length > 0 && (
          <fieldset className="rounded-ctl border border-attention bg-attention-soft p-3 text-attention-soft-on">
            <legend className="px-1 text-sm font-semibold">
              {vorschau.ueberschneidungen.length === 1
                ? 'Ein vorhandener Import deckt dieselben Tage ab'
                : `${vorschau.ueberschneidungen.length} vorhandene Importe decken dieselben Tage ab`}
            </legend>
            <p className="text-sm">
              Doppelte Tage lassen sich hinterher nicht mehr trennen. Deshalb wird jeder betroffene
              Import ersetzt — das Alte wird gelöscht, das Neue tritt an seine Stelle. Wer einen
              behalten will, bricht ab und zieht einen Export ohne diese Tage.
            </p>
            <ul className="mt-2 space-y-2">
              {vorschau.ueberschneidungen.map((eintrag) => (
                <li key={eintrag.id}>
                  <label className="flex min-h-tap items-center gap-3">
                    <input
                      type="checkbox"
                      value={eintrag.id}
                      checked={ersetzen.includes(eintrag.id)}
                      onChange={(ereignis) => {
                        setzeErsetzen(
                          ereignis.target.checked
                            ? [...ersetzen, eintrag.id]
                            : ersetzen.filter((id) => id !== eintrag.id),
                        )
                      }}
                      className="size-5 shrink-0"
                    />
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">
                        {eintrag.von} bis {eintrag.bis}
                      </span>{' '}
                      <span className="font-mono">{eintrag.dateiname}</span>
                      {eintrag.deckungsgleich && ' · gleicher Zeitraum'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="text-abschnitt text-text-muted uppercase">Die Kette der Importe</h4>
          <Importkette balken={kette} />
        </div>

        <Meldungen titel="Konnte nicht gelesen werden" eintraege={vorschau.fehler} betont />
        <Meldungen titel="Hinweise" eintraege={vorschau.hinweise} />
      </div>

      <aside className="flex flex-col gap-3">
        <h3 className="text-abschnitt text-text-muted uppercase">Aus der Datei gelesen</h3>
        <dl className="divide-y divide-border rounded-ctl border border-border">
          <Angabe name="Zeilen" wert={String(vorschau.zeilen)} />
          <Angabe name="Bezeichnungen" wert={String(vorschau.bezeichnungen)} />
          <Angabe name="davon neu" wert={String(vorschau.neueBezeichnungen)} />
          <Angabe name="Gebuchte Menge" wert={vorschau.mengeGesamt.replace('.', ',')} />
        </dl>
        {vorschau.jeAbrechnungsart.length > 0 && (
          <div className="rounded-ctl border border-border p-3">
            <p className="text-abschnitt text-text-muted uppercase">Je Abrechnungsart</p>
            <ul className="mt-2 space-y-1 text-sm">
              {vorschau.jeAbrechnungsart.map((eintrag) => (
                <li key={eintrag.abrechnungsart} className="flex justify-between gap-3">
                  <span className="truncate">{eintrag.abrechnungsart}</span>
                  <span className="text-text-muted">{eintrag.menge.replace('.', ',')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-ctl border border-border p-3">
          <p className="text-sm font-semibold">Ein Ruhetag ist kein Loch</p>
          <p className="mt-1 text-sm text-text-muted">
            Ein Tag ohne Buchung innerhalb des Zeitraums ist in Ordnung — geschlossen heisst nichts
            verkauft. Gemeldet wird nur, was zwischen zwei Importen liegt.
          </p>
        </div>
      </aside>

      <div className="flex flex-wrap items-center justify-between gap-tapgap border-t border-border pt-3 lg:col-span-2">
        <p className="text-sm text-text-muted">Schritt 2 von 3 · noch wird nichts geschrieben</p>
        <Schaltflaeche onClick={weiter} disabled={vorschau.zeitraum === null}>
          {vorschau.anschluss?.stufe === 'danger' || vorschau.anschluss?.stufe === 'attention'
            ? 'Trotzdem weiter zu den Zeilen'
            : 'Rohzeilen prüfen'}
        </Schaltflaeche>
      </div>
    </div>
  )
}

function SchrittZeilen({
  vorschau,
  dateiname,
  zurueck,
  brauchbar,
  offeneUeberschneidungen,
  ersetzt,
  laeuft,
  schreibe,
}: {
  vorschau: Kassenimportvorschau
  dateiname: string
  zurueck: () => void
  brauchbar: boolean
  offeneUeberschneidungen: number
  ersetzt: number
  laeuft: boolean
  schreibe: () => void
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-zeile">Rohzeilen aus der Kasse</h3>
          <p className="mt-1 max-w-[74ch] text-sm text-text-muted">
            So, wie die Kasse es nennt, und wie viel davon gebucht wurde. Die Zuordnung zum
            Artikelstamm entsteht danach — sie ist nicht Bedingung für den Import.
          </p>
        </div>
        <p className="font-mono text-sm text-text-muted">
          {vorschau.zeitraum?.von} – {vorschau.zeitraum?.bis} · {dateiname}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Zaehlkarte wert={vorschau.bezeichnungen} text="Bezeichnungen in der Datei" />
        <Zaehlkarte wert={vorschau.zugeordnete} text="bereits zugeordnet" rolle="confirm" />
        <Zaehlkarte
          wert={vorschau.offeneZuordnungen}
          text="unbekannt · nach dem Import zuordnen"
          rolle="attention"
        />
        <Zaehlkarte wert={vorschau.uebergangene} text="übergangen · nimmt nichts aus dem Lager" />
      </div>

      <div className="overflow-hidden rounded-ctl border border-border">
        <div className="hidden grid-cols-[minmax(0,1.2fr)_160px_110px_minmax(0,1.4fr)] gap-4 bg-surface-2 px-4 py-2 text-abschnitt text-text-muted uppercase lg:grid">
          <span>Kassenbezeichnung</span>
          <span>Abrechnungsart</span>
          <span className="text-right">Menge</span>
          <span>Zuordnung</span>
        </div>
        <ul className="divide-y divide-border">
          {vorschau.rohzeilen.map((zeile) => (
            <Zeilenzeile key={zeile.posBezeichnung} zeile={zeile} />
          ))}
        </ul>
        <p className="bg-bg px-4 py-3 text-sm text-text-muted">
          {vorschau.rohzeilen.length} von {vorschau.bezeichnungen} Bezeichnungen · nach Menge
          sortiert. Der Import schreibt alle.
        </p>
      </div>

      {vorschau.offeneZuordnungen > 0 && (
        <div className="rounded-ctl bg-attention-soft p-3 text-attention-soft-on">
          <p className="text-sm font-semibold">
            {vorschau.offeneZuordnungen}{' '}
            {vorschau.offeneZuordnungen === 1 ? 'Bezeichnung ist' : 'Bezeichnungen sind'} noch keinem
            Artikel zugeordnet
          </p>
          <p className="mt-1 max-w-[92ch] text-sm">
            Der Import wird davon nicht aufgehalten: die Mengen liegen danach vollständig in der App.
            Sie fliessen aber erst in den Sollbestand ein, wenn die Zuordnung steht — deshalb führt
            der nächste Schritt direkt dorthin.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-tapgap border-t border-border pt-3">
        <p className="text-sm text-text-muted">
          Schritt 3 von 3 · {vorschau.zeilen} Zeilen · {vorschau.mengeGesamt.replace('.', ',')}{' '}
          gebuchte Einheiten
        </p>
        <div className="flex flex-wrap gap-tapgap">
          <Schaltflaeche art="sekundaer" onClick={zurueck}>
            Zurück zum Zeitraum
          </Schaltflaeche>
          <Schaltflaeche onClick={schreibe} rolle="confirm" gross disabled={!brauchbar || laeuft}>
            {laeuft
              ? 'Wird importiert …'
              : offeneUeberschneidungen > 0
                ? `${offeneUeberschneidungen} Überschneidung${offeneUeberschneidungen === 1 ? '' : 'en'} entscheiden`
                : ersetzt > 0
                  ? `Importieren und ${ersetzt} ${ersetzt === 1 ? 'Import ersetzen' : 'Importe ersetzen'}`
                  : 'Importieren'}
          </Schaltflaeche>
        </div>
      </div>
    </div>
  )
}

// Übersetzt nur Fachbegriff → Facette; die Klassen je Rolle stehen in
// rollen.ts. Der Strich der zugeordneten Zeile bleibt bewusst border-l-border:
// der Normalfall braucht keine Farbkante, nur der Punkt bestätigt ihn.
const STAND = {
  zugeordnet: { strich: 'border-l-border', punkt: ROLLEN.confirm.punkt, text: '' },
  unbekannt: {
    strich: ROLLEN.attention.kante,
    punkt: ROLLEN.attention.punkt,
    text: ROLLEN.attention.text,
  },
  uebergangen: { strich: ROLLEN.neutral.kante, punkt: ROLLEN.neutral.punkt, text: ROLLEN.neutral.text },
} as const

function Zeilenzeile({ zeile }: { zeile: Rohzeile }) {
  const fassung = STAND[zeile.stand]

  return (
    <li
      className={`grid gap-x-4 gap-y-1 border-l-3 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_160px_110px_minmax(0,1.4fr)] lg:items-center ${fassung.strich}`}
    >
      <span className={`truncate font-mono text-sm ${fassung.text}`}>{zeile.posBezeichnung}</span>
      <span className="truncate text-sm text-text-muted">{zeile.abrechnungsarten}</span>
      <span className={`text-zeile lg:text-right ${fassung.text}`}>{zeile.menge}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${fassung.punkt}`} />
        <span className={`min-w-0 truncate text-sm ${fassung.text || 'text-text-muted'}`}>
          {zeile.ziel ?? 'unbekannt · fehlt im Sollbestand'}
        </span>
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Nach dem Import
// ---------------------------------------------------------------------------

function Fertig({
  ergebnis,
  dateiname,
}: {
  ergebnis: Kassenimportvorschau & { ersetzt: string[] }
  dateiname: string
}) {
  const unbekannte = ergebnis.rohzeilen.filter((zeile) => zeile.stand === 'unbekannt')

  return (
    <div className="flex flex-col gap-4 p-4">
      <Hinweisleiste
        rolle="confirm"
        titel={`Verkäufe importiert${
          ergebnis.zeitraum !== null ? ` · ${ergebnis.zeitraum.von} bis ${ergebnis.zeitraum.bis}` : ''
        }`}
      >
        {ergebnis.zeilen} Zeilen aus <span className="font-mono">{dateiname}</span> ·{' '}
        {ergebnis.mengeGesamt.replace('.', ',')} gebuchte Einheiten
        {ergebnis.anschluss !== null && ` · ${ergebnis.anschluss.titel}`}
        {ergebnis.ersetzt.length > 0 &&
          ` · ${ergebnis.ersetzt.length} ${ergebnis.ersetzt.length === 1 ? 'vorheriger Import wurde' : 'vorherige Importe wurden'} dabei gelöscht`}
      </Hinweisleiste>

      {ergebnis.offeneZuordnungen > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <h3 className="text-abschnitt text-text-muted uppercase">
              Die unbekannten Bezeichnungen
            </h3>
            <ul className="mt-2 divide-y divide-border rounded-ctl border border-border">
              {unbekannte.map((zeile) => (
                <li
                  key={zeile.posBezeichnung}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="truncate font-mono text-sm">{zeile.posBezeichnung}</span>
                  <span className="text-zeile">{zeile.menge}</span>
                </li>
              ))}
              {unbekannte.length < ergebnis.offeneZuordnungen && (
                <li className="bg-bg px-4 py-3 text-sm text-text-muted">
                  {unbekannte.length} von {ergebnis.offeneZuordnungen} · die übrigen stehen in der
                  Zuordnung
                </li>
              )}
            </ul>
          </div>

          <aside className="flex flex-col gap-3">
            <div className="rounded-ctl border border-border p-3">
              <p className="text-sm font-semibold">Einmal zuordnen genügt</p>
              <p className="mt-1 text-sm text-text-muted">
                Eine zugeordnete Bezeichnung gilt für alle künftigen Importe, und die Zuordnung wirkt
                auf die eben geschriebenen Mengen zurück. Nichts muss erneut eingelesen werden.
              </p>
            </div>
            <Wegflaeche href="/umsatz/zuordnung">
              {ergebnis.offeneZuordnungen}{' '}
              {ergebnis.offeneZuordnungen === 1 ? 'Bezeichnung' : 'Bezeichnungen'} zuordnen
            </Wegflaeche>
          </aside>
        </div>
      )}

      <Meldungen titel="Konnte nicht gelesen werden" eintraege={ergebnis.fehler} betont />

      {/* Ein voller Seitenaufbau und kein Zurücksetzen im Zustand: nach dem
          Schreiben ist die Kette der Importe eine andere, und die nächste Datei
          soll gegen sie geprüft werden und nicht gegen die von eben. */}
      <a href="/umsatz" className={`${flaechenfassung({ art: 'sekundaer' })} sm:w-fit`}>
        Weitere Datei einlesen
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kleinteile
// ---------------------------------------------------------------------------

function Angabe({ name, wert }: { name: string; wert: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-sm text-text-muted">{name}</dt>
      <dd className="text-zeile">{wert}</dd>
    </div>
  )
}

function Zaehlkarte({
  wert,
  text,
  rolle = 'neutral',
}: {
  wert: number
  text: string
  rolle?: 'neutral' | 'confirm' | 'attention'
}) {
  // Die neutrale Zahl bleibt text-text — sie ist die Auskunft, kein Nebenwort.
  const zahl = rolle === 'neutral' ? '' : ROLLEN[rolle].text
  return (
    <div className={`rounded-ctl border border-l-3 border-border p-3 ${ROLLEN[rolle].kante}`}>
      <p className={`text-titel ${zahl}`}>{wert}</p>
      <p className="mt-0.5 text-sm text-text-muted">{text}</p>
    </div>
  )
}

/** Zeigt höchstens fünf Meldungen; der Rest wird gezählt, nicht ausgebreitet. */
function Meldungen({
  titel,
  eintraege,
  betont = false,
}: {
  titel: string
  eintraege: { zeile: number; meldung: string }[]
  betont?: boolean
}) {
  if (eintraege.length === 0) return null

  return (
    <details
      className={`rounded-ctl p-3 text-sm ${betont ? 'bg-danger-soft text-danger-soft-on' : 'bg-surface-2'}`}
    >
      <summary className="min-h-tap cursor-pointer content-center font-medium">
        {titel}: {eintraege.length}
      </summary>
      <ul className="mt-2 space-y-1">
        {eintraege.slice(0, 5).map((eintrag, index) => (
          <li key={index}>
            <span className="text-text-muted">Zeile {eintrag.zeile}: </span>
            {eintrag.meldung}
          </li>
        ))}
      </ul>
      {eintraege.length > 5 && (
        <p className="mt-1 text-text-muted">… und {eintraege.length - 5} weitere</p>
      )}
    </details>
  )
}
