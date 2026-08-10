'use client'

/**
 * Die drei Schritte des CSV-Imports — und der zweite trägt die Arbeit: erst in
 * der Vorschau steht Zeile für Zeile, was der Import mit dem Stamm machen
 * würde. Geschrieben wird nichts, bevor diese Liste gelesen ist.
 *
 * Diese Komponente rechnet nicht: Einlesen, Abgleich und die Unterscheidung
 * neu / geändert / unverändert / fehlerhaft kommen fertig aus den
 * Serveraktionen (src/lib/artikelimport.ts). Hier stehen nur Schrittzustand,
 * Filter und die Ablagefläche.
 *
 * Der Status jeder Zeile steht als Wort an der Zeile — die Farbe unterstreicht
 * die Aussage, sie trägt sie nicht.
 *
 * Eine Fehlerzeile sperrt den Import, bis sie in der Datei berichtigt oder
 * ausdrücklich übersprungen wird. Übersprungen heisst nur bestätigt: der
 * Import schreibt eine unlesbare Zeile ohnehin nie.
 */

import Link from 'next/link'
import { useRef, useState } from 'react'

import {
  PFLICHTSPALTEN,
  type Importergebnis,
  type Pflichtspalte,
  type Vorschaustatus,
  type Vorschauzeile,
} from '@/lib/artikelimport'
import { alsCsv, dekodiereCsv } from '@/lib/csv'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Umschalter, Umschaltersegment } from '@/ui/umschalter'
import { Wegflaeche } from '@/ui/wegflaeche'

import { importAusfuehren, vorschauRechnen } from './aktionen'

// ---------------------------------------------------------------------------
// Beschriftungen
// ---------------------------------------------------------------------------

const SPALTENHILFE: Record<Pflichtspalte, { text: string; beispiel: string }> = {
  kategorie: {
    text: 'Frei wählbar · Spirituosen, Likoer, Aperitif und Barzutat nimmt der Import aus der Schwundrechnung',
    beispiel: 'Softdrinks',
  },
  name: { text: 'Teil des Schlüssels · genau so, wie der Artikel heissen soll', beispiel: 'Coca Cola' },
  gebinde_text: { text: 'Teil des Schlüssels · so, wie es am Regal steht', beispiel: '24 x 0,33' },
  packungsgroesse: { text: 'Einheiten je Gebinde · ganze Zahl ab 1', beispiel: '24' },
  einheit: { text: 'FASS oder FLASCHE', beispiel: 'FLASCHE' },
  gebindegroesse_liter: { text: 'Inhalt je Einheit in Litern · Komma oder Punkt', beispiel: '0,33' },
  ek_preis_gebinde_eur: {
    text: 'Einkaufspreis je Gebinde · Zahl ohne Währung, leer = unbekannt',
    beispiel: '18,59',
  },
  sortierung: { text: 'Position im Laufweg durch das Lager · ganze Zahl', beispiel: '110' },
}

/**
 * Wie ein Status in Vorschau und Protokoll heisst und aussieht. Die Klassen je
 * Rolle kommen aus rollen.ts; hier stehen nur noch die Übersetzung
 * Fachbegriff → Rolle und die abgeschwächten Töne (/40, /30), die es als
 * Facette bewusst nicht gibt — sie tönen ganze Tabellenzeilen, keine Bausteine.
 */
const STATUS: Record<
  Vorschaustatus,
  { wort: string; protokollWort: string; chip: string; kante: string; flaeche: string }
> = {
  neu: {
    wort: 'neu',
    protokollWort: 'angelegt',
    chip: `border-confirm/40 ${ROLLEN.confirm.flaeche}`,
    kante: ROLLEN.confirm.kante,
    flaeche: 'bg-confirm-soft/30',
  },
  geaendert: {
    wort: 'geändert',
    protokollWort: 'geändert',
    chip: `border-primary/40 ${ROLLEN.primary.flaeche}`,
    kante: ROLLEN.primary.kante,
    flaeche: 'bg-primary-soft/30',
  },
  unveraendert: {
    wort: 'unverändert',
    protokollWort: 'unverändert',
    chip: `border-border bg-surface-2 ${ROLLEN.neutral.text}`,
    kante: 'border-l-border',
    flaeche: '',
  },
  fehlerhaft: {
    wort: 'Fehler',
    protokollWort: 'übersprungen',
    chip: `border-danger/40 ${ROLLEN.danger.flaeche}`,
    kante: ROLLEN.danger.kante,
    flaeche: 'bg-danger-soft/40',
  },
}

/** Die sechs Spalten der Vorschautabelle — Kopf und Zeilen tragen dieselben. */
const TABELLE =
  'md:grid md:grid-cols-[56px_118px_minmax(0,1fr)_110px_120px_minmax(0,1.7fr)] md:items-center md:gap-3'

type Filter = 'alle' | 'aenderungen' | 'fehler'

type Datei = { name: string; csvText: string }

// ---------------------------------------------------------------------------
// Die Strecke
// ---------------------------------------------------------------------------

export function Importstrecke() {
  const [schritt, setSchritt] = useState<1 | 2 | 3>(1)
  const [datei, setDatei] = useState<Datei | null>(null)
  const [vorschau, setVorschau] = useState<Importergebnis | null>(null)
  const [filter, setFilter] = useState<Filter>('alle')
  const [uebersprungen, setUebersprungen] = useState<ReadonlySet<number>>(new Set())
  const [protokoll, setProtokoll] = useState<{ ergebnis: Importergebnis; zeit: string } | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fuehrtAus, setFuehrtAus] = useState(false)
  const [meldung, setMeldung] = useState<string | null>(null)

  const zeilen = vorschau?.zeilen ?? []
  const fehlerZeilen = zeilen.filter((zeile) => zeile.status === 'fehlerhaft')
  const offeneFehler = fehlerZeilen.filter((zeile) => !uebersprungen.has(zeile.zeile))
  const anzahlAenderungen = zeilen.filter(
    (zeile) => zeile.status === 'neu' || zeile.status === 'geaendert',
  ).length

  async function dateiEinlesen(gewaehlt: File) {
    setLaedt(true)
    setMeldung(null)
    try {
      const csvText = dekodiereCsv(await gewaehlt.arrayBuffer())
      const antwort = await vorschauRechnen(csvText)
      if (antwort.art === 'fehler') {
        setMeldung(antwort.meldung)
        return
      }
      setDatei({ name: gewaehlt.name, csvText })
      setVorschau(antwort.ergebnis)
      setUebersprungen(new Set())
      setFilter('alle')
    } finally {
      setLaedt(false)
    }
  }

  function dateiEntfernen() {
    setDatei(null)
    setVorschau(null)
    setUebersprungen(new Set())
    setSchritt(1)
  }

  async function ausfuehren() {
    if (datei === null || offeneFehler.length > 0) return
    setFuehrtAus(true)
    setMeldung(null)
    try {
      const antwort = await importAusfuehren(datei.csvText)
      if (antwort.art === 'fehler') {
        setMeldung(antwort.meldung)
        return
      }
      setProtokoll({
        ergebnis: antwort.ergebnis,
        zeit: new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }),
      })
    } finally {
      setFuehrtAus(false)
    }
  }

  function nochEinmal() {
    setProtokoll(null)
    dateiEntfernen()
    setMeldung(null)
  }

  const fertig = protokoll !== null

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-beschriftung tracking-widest text-text-muted uppercase">
          Stadthafen Recklinghausen · Inventur
        </p>
        <h1 className="text-titel">Artikelstamm importieren</h1>
        <p className="max-w-[72ch] text-zeile font-normal text-text-muted">
          Drei Schritte, und der zweite trägt die Arbeit: erst in der Vorschau steht Zeile für
          Zeile, was der Import mit dem Stamm machen würde. Geschrieben wird nichts, bevor diese
          Liste gelesen ist.
        </p>
      </header>

      <div className="overflow-hidden rounded-ctl border border-border bg-surface">
        <div className="flex min-h-tap flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <Link
            href="/artikel"
            className="tap -ml-2 inline-flex min-h-tap items-center rounded-ctl px-2 text-zeile text-primary-text focus-visible:fokus"
          >
            ‹ Artikelstamm
          </Link>
          <span aria-hidden className="hidden h-6 w-px bg-border md:block" />
          <span className="text-zeile font-semibold">Import aus CSV</span>
          {datei !== null && (
            <span className="rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-abschnitt font-normal tracking-normal">
              {datei.name}
            </span>
          )}
          <span className="ml-auto hidden text-sm text-text-muted lg:block">
            {fertig
              ? 'Der Stamm ist geschrieben'
              : 'Änderungen werden erst mit „Import ausführen" geschrieben'}
          </span>
          <Modusumschalter className="md:hidden" />
        </div>

        <Schrittleiste
          schritt={fertig ? 4 : schritt}
          aufSchritt={(ziel) => setSchritt(ziel)}
          dateiZeile={datei?.name ?? 'CSV ablegen oder auswählen'}
          vorschauZeile={
            vorschau === null
              ? 'Zeile für Zeile prüfen'
              : `${vorschau.neu} neu, ${vorschau.geaendert} geändert, ` +
                (offeneFehler.length > 0
                  ? `${offeneFehler.length} Fehler`
                  : `${uebersprungen.size > 0 ? `${uebersprungen.size} übersprungen` : 'kein Fehler'}`)
          }
          bestaetigenZeile={
            fertig
              ? `${protokoll.ergebnis.neu + protokoll.ergebnis.geaendert} Artikel geschrieben`
              : offeneFehler.length > 0
                ? 'gesperrt, solange ein Fehler offen ist'
                : 'Import ausführen'
          }
        />

        {meldung !== null && (
          <div className="mx-4 mt-4 rounded-ctl border border-danger/40 bg-danger-soft px-4 py-3 text-zeile text-danger-soft-on">
            {meldung}
          </div>
        )}

        {fertig ? (
          <Protokollansicht
            ergebnis={protokoll.ergebnis}
            zeit={protokoll.zeit}
            dateiname={datei?.name ?? ''}
            aufNeu={nochEinmal}
          />
        ) : schritt === 1 ? (
          <SchrittDatei
            datei={datei}
            vorschau={vorschau}
            laedt={laedt}
            aufDatei={dateiEinlesen}
            aufEntfernen={dateiEntfernen}
            aufWeiter={() => setSchritt(2)}
          />
        ) : schritt === 2 ? (
          <SchrittVorschau
            vorschau={vorschau}
            dateiname={datei?.name ?? ''}
            filter={filter}
            aufFilter={setFilter}
            uebersprungen={uebersprungen}
            aufUeberspringen={(zeile, wieder) =>
              setUebersprungen((bisher) => {
                const neu = new Set(bisher)
                if (wieder) neu.delete(zeile)
                else neu.add(zeile)
                return neu
              })
            }
            anzahlAenderungen={anzahlAenderungen}
            offeneFehler={offeneFehler.length}
            aufZurueck={() => setSchritt(1)}
            aufWeiter={() => setSchritt(3)}
          />
        ) : (
          <SchrittBestaetigen
            vorschau={vorschau}
            dateiname={datei?.name ?? ''}
            offeneFehler={offeneFehler.length}
            uebersprungen={uebersprungen.size}
            fuehrtAus={fuehrtAus}
            aufZurueck={() => setSchritt(2)}
            aufAusfuehren={ausfuehren}
          />
        )}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Schrittleiste
// ---------------------------------------------------------------------------

function Schrittleiste({
  schritt,
  aufSchritt,
  dateiZeile,
  vorschauZeile,
  bestaetigenZeile,
}: {
  /** 4 heisst: alles fertig, das Protokoll steht. */
  schritt: 1 | 2 | 3 | 4
  aufSchritt: (ziel: 1 | 2 | 3) => void
  dateiZeile: string
  vorschauZeile: string
  bestaetigenZeile: string
}) {
  const eintraege = [
    { nummer: 1 as const, titel: 'Datei wählen', zeile: dateiZeile },
    { nummer: 2 as const, titel: 'Vorschau', zeile: vorschauZeile },
    { nummer: 3 as const, titel: 'Bestätigen', zeile: bestaetigenZeile },
  ]

  return (
    <ol className="grid gap-2 border-b border-border bg-bg p-3 md:grid-cols-3">
      {eintraege.map(({ nummer, titel, zeile }) => {
        const aktiv = schritt === nummer
        const erledigt = schritt > nummer
        // Zurückspringen ist erlaubt, vorwärts nur über die Fussleisten — dort
        // steht, was den nächsten Schritt freigibt.
        const anklickbar = erledigt && schritt !== 4

        const fassung = aktiv
          ? 'border-primary bg-primary-soft'
          : erledigt && schritt === 4
            ? 'border-confirm/40 bg-confirm-soft'
            : 'border-border bg-surface'

        const inhalt = (
          <>
            <span
              aria-hidden
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                erledigt
                  ? 'bg-confirm text-confirm-on'
                  : aktiv
                    ? 'bg-primary text-primary-on'
                    : 'border border-border-strong text-text-muted'
              }`}
            >
              {erledigt ? '✓' : nummer}
            </span>
            <span className="flex min-w-0 flex-col text-left">
              <span
                className={`text-zeile ${aktiv ? 'font-semibold text-primary-soft-on' : ''} ${
                  !aktiv && !erledigt ? 'text-text-muted' : ''
                }`}
              >
                {titel}
              </span>
              <span className="truncate text-sm text-text-muted">{zeile}</span>
            </span>
          </>
        )

        return (
          <li key={nummer} className={!aktiv && !erledigt ? 'opacity-60' : ''}>
            {anklickbar ? (
              <button
                type="button"
                onClick={() => aufSchritt(nummer)}
                className={`flex min-h-tap w-full items-center gap-3 rounded-ctl border px-3.5 py-2 focus-visible:fokus ${fassung}`}
              >
                {inhalt}
              </button>
            ) : (
              <div
                className={`flex min-h-tap items-center gap-3 rounded-ctl border px-3.5 py-2 ${fassung}`}
                aria-current={aktiv ? 'step' : undefined}
              >
                {inhalt}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Schritt 1: Datei wählen
// ---------------------------------------------------------------------------

function SchrittDatei({
  datei,
  vorschau,
  laedt,
  aufDatei,
  aufEntfernen,
  aufWeiter,
}: {
  datei: Datei | null
  vorschau: Importergebnis | null
  laedt: boolean
  aufDatei: (datei: File) => void
  aufEntfernen: () => void
  aufWeiter: () => void
}) {
  const eingabe = useRef<HTMLInputElement>(null)
  const [zieht, setZieht] = useState(false)

  const ersteZeile = datei?.csvText.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? ''

  return (
    <>
      <div className="grid md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5 p-5 md:border-r md:border-border">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">Datei wählen</h2>
            <p className="max-w-[66ch] text-zeile font-normal text-text-muted">
              Der Import gleicht Artikel über Name plus Liefergebinde ab und lässt sich beliebig
              oft wiederholen — dieselbe Datei ein zweites Mal eingelesen ändert nichts.
            </p>
          </div>

          <input
            ref={eingabe}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(ereignis) => {
              const gewaehlt = ereignis.target.files?.[0]
              if (gewaehlt) aufDatei(gewaehlt)
              ereignis.target.value = ''
            }}
          />

          {datei === null ? (
            <button
              type="button"
              onClick={() => eingabe.current?.click()}
              onDragOver={(ereignis) => {
                ereignis.preventDefault()
                setZieht(true)
              }}
              onDragLeave={() => setZieht(false)}
              onDrop={(ereignis) => {
                ereignis.preventDefault()
                setZieht(false)
                const gezogen = ereignis.dataTransfer.files[0]
                if (gezogen) aufDatei(gezogen)
              }}
              className={`flex min-h-56 flex-col items-center justify-center gap-3 rounded-ctl border-2 border-dashed p-6 focus-visible:fokus ${
                zieht ? 'border-primary bg-primary-soft' : 'border-border-strong bg-bg'
              }`}
            >
              <span aria-hidden className="size-11 rounded-ctl border-2 border-dashed border-border-strong" />
              <span className="text-zeile font-semibold">
                {laedt ? 'Wird eingelesen …' : 'CSV hierher ziehen'}
              </span>
              <span className="max-w-[44ch] text-center text-sm text-text-muted">
                Oder klicken und im Ordner auswählen. Trennzeichen Semikolon, Zeichensatz UTF-8
                oder Windows-1252 — beides wird erkannt.
              </span>
              <span className="tap mt-1 inline-flex min-h-tap items-center rounded-ctl bg-primary px-5 text-zeile font-semibold text-primary-on">
                Datei auswählen
              </span>
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4 rounded-ctl border border-confirm/40 bg-confirm-soft p-4">
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-ctl border border-confirm/40 bg-surface font-mono text-[11px] font-medium text-confirm-text"
                >
                  CSV
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-zeile font-semibold text-confirm-soft-on">
                    {datei.name}
                  </span>
                  <span className="text-sm text-confirm-text">
                    {vorschau === null
                      ? '…'
                      : `${vorschau.zeilen.length} Datenzeilen · ` +
                        (vorschau.fehler.some((f) => f.zeile === 1)
                          ? 'Kopfzeile unvollständig — Details in der Vorschau'
                          : 'alle erwarteten Spalten gefunden')}
                  </span>
                </span>
                <Schaltflaeche art="sekundaer" onClick={aufEntfernen}>
                  Andere Datei
                </Schaltflaeche>
              </div>
              <div className="flex flex-col gap-1.5 rounded-ctl border border-border bg-bg px-4 py-3">
                <span className="font-mono text-beschriftung tracking-widest text-text-muted uppercase">
                  Erste Zeile der Datei
                </span>
                <span className="overflow-x-auto font-mono text-abschnitt font-normal tracking-normal whitespace-nowrap text-text-muted">
                  {ersteZeile}
                </span>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2.5">
            <h3 className="text-abschnitt text-text-muted uppercase">Erwartete Spalten</h3>
            <div className="overflow-hidden rounded-ctl border border-border">
              {PFLICHTSPALTEN.map((spalte) => (
                <div
                  key={spalte}
                  className="grid min-h-12 items-center gap-4 border-b border-surface-2 px-4 py-2 md:grid-cols-[190px_minmax(0,1fr)_90px]"
                >
                  <span className="font-mono text-abschnitt font-normal tracking-normal">
                    {spalte}
                  </span>
                  <span className="text-sm text-text-muted">{SPALTENHILFE[spalte].text}</span>
                  <span className="font-mono text-abschnitt font-normal tracking-normal text-text-muted md:text-right">
                    {SPALTENHILFE[spalte].beispiel}
                  </span>
                </div>
              ))}
              <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 bg-bg px-4 py-2">
                <span className="text-sm text-text-muted">
                  Spaltenreihenfolge ist frei, die Kopfzeile entscheidet. Unbekannte Spalten werden
                  übergangen.
                </span>
                <a
                  href="/beispiele/artikelstamm-beispiel.csv"
                  download
                  className="tap -mr-2 inline-flex min-h-tap items-center rounded-ctl px-2 text-sm font-medium text-primary-text focus-visible:fokus"
                >
                  Beispieldatei laden
                </a>
              </div>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3 bg-bg p-5">
          <h3 className="text-abschnitt text-text-muted uppercase">Wie abgeglichen wird</h3>
          <div className="flex flex-col gap-2 rounded-ctl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Schlüssel: Name + Liefergebinde</p>
            <p className="text-sm text-text-muted">
              {'„Coca Cola" steht zweimal im Stamm. Erst zusammen mit dem Gebindetext — „12 x 1,0" oder „24 x 0,33" — ist die Zeile eindeutig.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-ctl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Nichts wird gelöscht</p>
            <p className="text-sm text-text-muted">
              Artikel, die in der Datei fehlen, bleiben unverändert im Stamm. Wer einen Artikel aus
              dem Laufweg nehmen will, legt ihn im Stamm still.
            </p>
          </div>
          <div className="flex flex-col gap-2 rounded-ctl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Gerechnete Zahlen kommen nicht aus der Datei</p>
            <p className="text-sm text-text-muted">
              Stückpreis und Literpreis stehen in keiner Spalte. Sie entstehen wie überall aus
              Einkaufspreis, Packungsgrösse und Gebindegrösse.
            </p>
          </div>
        </aside>
      </div>

      <Fussleiste hinweis="Schritt 1 von 3">
        <Wegflaeche href="/artikel" art="sekundaer">
          Abbrechen
        </Wegflaeche>
        <Schaltflaeche onClick={aufWeiter} disabled={datei === null || laedt}>
          {datei === null ? 'Erst eine Datei wählen' : 'Vorschau öffnen'}
        </Schaltflaeche>
      </Fussleiste>
    </>
  )
}

// ---------------------------------------------------------------------------
// Schritt 2: Vorschau
// ---------------------------------------------------------------------------

function SchrittVorschau({
  vorschau,
  dateiname,
  filter,
  aufFilter,
  uebersprungen,
  aufUeberspringen,
  anzahlAenderungen,
  offeneFehler,
  aufZurueck,
  aufWeiter,
}: {
  vorschau: Importergebnis | null
  dateiname: string
  filter: Filter
  aufFilter: (filter: Filter) => void
  uebersprungen: ReadonlySet<number>
  aufUeberspringen: (zeile: number, wieder: boolean) => void
  anzahlAenderungen: number
  offeneFehler: number
  aufZurueck: () => void
  aufWeiter: () => void
}) {
  if (vorschau === null) return null
  const zeilen = vorschau.zeilen

  const sichtbar =
    filter === 'fehler'
      ? zeilen.filter((zeile) => zeile.status === 'fehlerhaft')
      : filter === 'aenderungen'
        ? zeilen.filter((zeile) => zeile.status === 'neu' || zeile.status === 'geaendert')
        : zeilen

  const zusammenfassung =
    `${vorschau.neu} neu, ${vorschau.geaendert} geändert, ${vorschau.unveraendert} unverändert` +
    (offeneFehler > 0
      ? `, ${offeneFehler} Fehler`
      : uebersprungen.size > 0
        ? `, ${uebersprungen.size} übersprungen`
        : '')

  return (
    <>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Vorschau</h2>
            <p className="text-zeile font-normal text-text-muted">{zusammenfassung}</p>
          </div>
          <span className="font-mono text-abschnitt font-normal tracking-normal text-text-muted">
            {dateiname}
          </span>
        </div>

        <div className="grid gap-2.5 md:grid-cols-4">
          <Zahlkarte status="neu" zahl={vorschau.neu} text="neu · werden angelegt" />
          <Zahlkarte
            status="geaendert"
            zahl={vorschau.geaendert}
            text="geändert · Felder werden überschrieben"
          />
          <Zahlkarte
            status="unveraendert"
            zahl={vorschau.unveraendert}
            text="unverändert · nichts zu tun"
          />
          {offeneFehler > 0 ? (
            <Zahlkarte status="fehlerhaft" zahl={offeneFehler} text="Fehler · Zeile nicht lesbar" />
          ) : (
            <Zahlkarte
              status="unveraendert"
              zahl={uebersprungen.size}
              text="übersprungen · kein Fehler mehr offen"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Umschalter beschriftung="Zeilen filtern">
            <Umschaltersegment aktiv={filter === 'alle'} aufTipp={() => aufFilter('alle')}>
              Alle {zeilen.length}
            </Umschaltersegment>
            <Umschaltersegment aktiv={filter === 'aenderungen'} aufTipp={() => aufFilter('aenderungen')}>
              Nur Änderungen {anzahlAenderungen}
            </Umschaltersegment>
            <Umschaltersegment aktiv={filter === 'fehler'} aufTipp={() => aufFilter('fehler')}>
              Nur Fehler {vorschau.fehlerhaft}
            </Umschaltersegment>
          </Umschalter>
          <span className="ml-auto text-sm text-text-muted">
            {sichtbar.length} von {zeilen.length} Zeilen
          </span>
        </div>

        <div className="overflow-hidden rounded-ctl border border-border">
          <div
            aria-hidden
            className={`hidden h-10 border-b border-border bg-surface-2 px-4 text-beschriftung text-text-muted uppercase ${TABELLE}`}
          >
            <span>Zeile</span>
            <span>Status</span>
            <span>Name</span>
            <span>Gebinde</span>
            <span>Kategorie</span>
            <span>Was passiert</span>
          </div>

          {sichtbar.map((zeile) => (
            <Tabellenzeile
              key={zeile.zeile}
              zeile={zeile}
              uebersprungen={uebersprungen.has(zeile.zeile)}
              aufUeberspringen={aufUeberspringen}
            />
          ))}

          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 bg-bg px-4 py-2 text-sm text-text-muted">
            <span>
              {sichtbar.length} von {zeilen.length} Zeilen
            </span>
            <button
              type="button"
              onClick={() => csvLaden(`vorschau-${dateiname}`, zeilen)}
              className="tap -mr-2 inline-flex min-h-tap items-center rounded-ctl px-2 font-medium text-primary-text focus-visible:fokus"
            >
              Vorschau als CSV laden
            </button>
          </div>
        </div>

        {offeneFehler > 0 ? (
          <Hinweisleiste
            rolle="danger"
            titel={
              offeneFehler === 1
                ? '1 Zeile ist nicht lesbar und sperrt den Import'
                : `${offeneFehler} Zeilen sind nicht lesbar und sperren den Import`
            }
          >
            Entweder die Datei berichtigen und erneut einlesen, oder die Zeile überspringen. Ein
            Import mit offenen Fehlern ist nicht möglich — sonst bliebe unklar, welcher Preis im
            Stamm steht.
          </Hinweisleiste>
        ) : (
          uebersprungen.size > 0 && (
            <Hinweisleiste rolle="confirm" titel="Keine Fehlerzeile mehr offen">
              {uebersprungen.size === 1
                ? '1 Zeile wird übersprungen und nicht importiert.'
                : `${uebersprungen.size} Zeilen werden übersprungen und nicht importiert.`}{' '}
              Der Import kann ausgeführt werden.
            </Hinweisleiste>
          )
        )}
      </div>

      <Fussleiste hinweis="Schritt 2 von 3 · noch wird nichts geschrieben">
        <Schaltflaeche art="sekundaer" onClick={aufZurueck}>
          Zurück
        </Schaltflaeche>
        <Schaltflaeche onClick={aufWeiter}>Weiter zur Bestätigung</Schaltflaeche>
      </Fussleiste>
    </>
  )
}

function Zahlkarte({
  status,
  zahl,
  text,
}: {
  status: Vorschaustatus
  zahl: number
  text: string
}) {
  const fassung = STATUS[status]
  return (
    <div
      className={`flex flex-col gap-0.5 rounded-ctl border border-l-3 border-border px-4 py-3 ${fassung.kante} ${fassung.flaeche || 'bg-surface'}`}
    >
      <span className="text-2xl font-semibold">{zahl}</span>
      <span className="text-sm text-text-muted">{text}</span>
    </div>
  )
}

function Tabellenzeile({
  zeile,
  uebersprungen,
  aufUeberspringen,
}: {
  zeile: Vorschauzeile
  uebersprungen: boolean
  aufUeberspringen: (zeile: number, wieder: boolean) => void
}) {
  const fehler = zeile.status === 'fehlerhaft'
  const fassung = STATUS[zeile.status]

  if (fehler && uebersprungen) {
    return (
      <div
        className={`flex min-h-tap flex-col gap-1 border-b border-l-3 border-surface-2 border-l-border-strong bg-bg px-4 py-2 text-text-muted ${TABELLE}`}
      >
        <span className="font-mono text-abschnitt font-normal tracking-normal">{zeile.zeile}</span>
        <Statuschip klasse="border-border bg-surface text-text-muted" wort="übersprungen" />
        <span className="truncate text-zeile line-through">{zeile.name || '—'}</span>
        <span className="font-mono text-abschnitt font-normal tracking-normal">
          {zeile.gebinde || '—'}
        </span>
        <span className="truncate text-sm">{zeile.kategorie || '—'}</span>
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-sm">
            Wird nicht importiert · der Stamm bleibt, wie er ist
          </span>
          <Schaltflaeche art="sekundaer" onClick={() => aufUeberspringen(zeile.zeile, true)}>
            Wieder aufnehmen
          </Schaltflaeche>
        </span>
      </div>
    )
  }

  return (
    <div
      className={`flex min-h-tap flex-col gap-1 border-b border-l-3 border-surface-2 px-4 py-2 ${fassung.kante} ${fassung.flaeche} ${TABELLE}`}
    >
      <span className="font-mono text-abschnitt font-normal tracking-normal text-text-muted">
        {zeile.zeile}
      </span>
      <Statuschip klasse={fassung.chip} wort={fassung.wort} />
      <span
        className={`truncate text-zeile ${zeile.status === 'unveraendert' ? 'text-text-muted' : ''}`}
      >
        {zeile.name || '—'}
      </span>
      <span className="font-mono text-abschnitt font-normal tracking-normal text-text-muted">
        {zeile.gebinde || '—'}
      </span>
      <span className="truncate text-sm text-text-muted">{zeile.kategorie || '—'}</span>

      {zeile.status === 'geaendert' ? (
        <span className="flex flex-col gap-1">
          {zeile.aenderungen.map((aenderung) => (
            <span key={aenderung.feld} className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[12px] tracking-normal text-text-muted">
                {aenderung.feld}
              </span>
              <s className="text-sm text-text-muted">{aenderung.alt}</s>
              <span aria-hidden className="text-sm text-text-muted">
                →
              </span>
              <span className="text-sm font-semibold text-primary-soft-on">{aenderung.neu}</span>
            </span>
          ))}
        </span>
      ) : fehler ? (
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-sm text-danger-soft-on">{zeile.beschreibung}</span>
          <Schaltflaeche
            art="sekundaer"
            rolle="danger"
            onClick={() => aufUeberspringen(zeile.zeile, false)}
          >
            Zeile überspringen
          </Schaltflaeche>
        </span>
      ) : (
        <span
          className={`text-sm ${zeile.status === 'neu' ? 'text-confirm-soft-on' : 'text-text-muted'}`}
        >
          {zeile.beschreibung}
        </span>
      )}
    </div>
  )
}

function Statuschip({ klasse, wort }: { klasse: string; wort: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${klasse}`}
    >
      {wort}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Schritt 3: Bestätigen
// ---------------------------------------------------------------------------

function SchrittBestaetigen({
  vorschau,
  dateiname,
  offeneFehler,
  uebersprungen,
  fuehrtAus,
  aufZurueck,
  aufAusfuehren,
}: {
  vorschau: Importergebnis | null
  dateiname: string
  offeneFehler: number
  uebersprungen: number
  fuehrtAus: boolean
  aufZurueck: () => void
  aufAusfuehren: () => void
}) {
  if (vorschau === null) return null

  return (
    <>
      <div className="grid md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5 p-5 md:border-r md:border-border">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xl font-semibold">Bestätigen</h2>
            <p className="max-w-[66ch] text-zeile font-normal text-text-muted">
              Was jetzt ausgeführt wird, steht hier noch einmal in Zahlen. Danach ist der Stamm
              geändert.
            </p>
          </div>

          <div className="overflow-hidden rounded-ctl border border-border">
            <Bilanzzeile
              status="neu"
              titel="Werden angelegt"
              text="Neue Artikel, Sortiernummer aus der Datei"
              zahl={vorschau.neu}
            />
            <Bilanzzeile
              status="geaendert"
              titel="Werden überschrieben"
              text="Nur die Felder, die in der Vorschau als Änderung stehen"
              zahl={vorschau.geaendert}
            />
            <Bilanzzeile
              status="unveraendert"
              titel="Bleiben unberührt"
              text="Kein Schreibvorgang, kein Eintrag im Protokoll"
              zahl={vorschau.unveraendert}
            />
            {offeneFehler > 0 ? (
              <Bilanzzeile
                status="fehlerhaft"
                titel="Nicht lesbar"
                text="Sperrt den Import, bis berichtigt oder übersprungen"
                zahl={offeneFehler}
              />
            ) : (
              uebersprungen > 0 && (
                <Bilanzzeile
                  status="unveraendert"
                  titel="Übersprungen"
                  text="Werden nicht importiert · der Stamm bleibt dort, wie er ist"
                  zahl={uebersprungen}
                />
              )
            )}
          </div>

          {offeneFehler > 0 && (
            <Hinweisleiste
              rolle="danger"
              titel={
                offeneFehler === 1
                  ? '1 Zeile ist nicht lesbar und sperrt den Import'
                  : `${offeneFehler} Zeilen sind nicht lesbar und sperren den Import`
              }
              aktion={
                <Schaltflaeche art="sekundaer" rolle="danger" onClick={aufZurueck}>
                  Fehlerzeilen ansehen
                </Schaltflaeche>
              }
            >
              Zurück zur Vorschau, dort steht der Grund an der Zeile. Die Schaltfläche bleibt bis
              dahin gesperrt.
            </Hinweisleiste>
          )}
        </div>

        <aside className="flex flex-col gap-3 bg-bg p-5">
          <h3 className="text-abschnitt text-text-muted uppercase">Quelle</h3>
          <div className="flex flex-col gap-1.5 rounded-ctl border border-border bg-surface p-4">
            <span className="font-mono text-abschnitt font-normal tracking-normal">{dateiname}</span>
            <span className="text-sm text-text-muted">
              {vorschau.zeilen.length} Datenzeilen · Abgleich über Name plus Liefergebinde
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-ctl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Wiederholbar</p>
            <p className="text-sm text-text-muted">
              Derselbe Import ein zweites Mal ausgeführt meldet 0 neu und 0 geändert. Eine Datei
              zweimal einzulesen ist keine Gefahr.
            </p>
          </div>
        </aside>
      </div>

      <Fussleiste hinweis="Schritt 3 von 3">
        <Schaltflaeche art="sekundaer" onClick={aufZurueck}>
          Zurück zur Vorschau
        </Schaltflaeche>
        <Schaltflaeche
          rolle="confirm"
          onClick={aufAusfuehren}
          disabled={offeneFehler > 0 || fuehrtAus}
        >
          {fuehrtAus ? 'Wird ausgeführt …' : 'Import ausführen'}
        </Schaltflaeche>
      </Fussleiste>
    </>
  )
}

function Bilanzzeile({
  status,
  titel,
  text,
  zahl,
}: {
  status: Vorschaustatus
  titel: string
  text: string
  zahl: number
}) {
  const fassung = STATUS[status]
  return (
    <div
      className={`flex min-h-tap items-center justify-between gap-4 border-b border-l-3 border-surface-2 px-4 py-2 ${fassung.kante} ${fassung.flaeche}`}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-zeile">{titel}</span>
        <span className="text-sm text-text-muted">{text}</span>
      </span>
      <span className="text-2xl font-semibold">{zahl}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

function Protokollansicht({
  ergebnis,
  zeit,
  dateiname,
  aufNeu,
}: {
  ergebnis: Importergebnis
  zeit: string
  dateiname: string
  aufNeu: () => void
}) {
  const eintraege = ergebnis.zeilen.filter((zeile) => zeile.status !== 'unveraendert')

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-4 rounded-ctl border border-confirm/40 bg-confirm-soft p-4">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-confirm text-xl font-semibold text-confirm-on"
        >
          ✓
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xl font-semibold text-confirm-soft-on">Import ausgeführt</span>
          <span className="text-sm text-confirm-text">
            {ergebnis.neu} Artikel angelegt, {ergebnis.geaendert} geändert, {ergebnis.unveraendert}{' '}
            unverändert
            {ergebnis.fehlerhaft > 0 &&
              `, ${ergebnis.fehlerhaft} ${ergebnis.fehlerhaft === 1 ? 'Zeile' : 'Zeilen'} übersprungen`}
          </span>
        </span>
        <span className="font-mono text-abschnitt font-normal tracking-normal text-confirm-text">
          {zeit}
        </span>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-2.5">
          <h3 className="text-abschnitt text-text-muted uppercase">Protokoll</h3>
          <div className="overflow-hidden rounded-ctl border border-border">
            {eintraege.map((zeile) => (
              <div
                key={zeile.zeile}
                className="grid min-h-tap items-center gap-3 border-b border-surface-2 px-4 py-2 md:grid-cols-[56px_118px_minmax(0,1fr)_minmax(0,1.4fr)]"
              >
                <span className="font-mono text-abschnitt font-normal tracking-normal text-text-muted">
                  {zeile.zeile}
                </span>
                <Statuschip
                  klasse={STATUS[zeile.status].chip}
                  wort={STATUS[zeile.status].protokollWort}
                />
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-zeile">{zeile.name || '—'}</span>
                  <span className="shrink-0 font-mono text-abschnitt font-normal tracking-normal text-text-muted">
                    {zeile.gebinde}
                  </span>
                </span>
                <span className="text-sm text-text-muted">
                  {zeile.status === 'geaendert'
                    ? zeile.aenderungen
                        .map((aenderung) => `${aenderung.feld} ${aenderung.alt} → ${aenderung.neu}`)
                        .join(' · ')
                    : zeile.status === 'fehlerhaft'
                      ? `${zeile.beschreibung} · Stamm unverändert`
                      : zeile.beschreibung}
                </span>
              </div>
            ))}
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 bg-bg px-4 py-2 text-sm text-text-muted">
              <span>
                {eintraege.length} {eintraege.length === 1 ? 'Eintrag' : 'Einträge'} · unveränderte
                Zeilen stehen nicht im Protokoll
              </span>
              <button
                type="button"
                onClick={() => csvLaden(`protokoll-${dateiname}`, eintraege)}
                className="tap -mr-2 inline-flex min-h-tap items-center rounded-ctl px-2 font-medium text-primary-text focus-visible:fokus"
              >
                Protokoll als CSV laden
              </button>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <h3 className="text-abschnitt text-text-muted uppercase">Danach</h3>
          {ergebnis.fehlerhaft > 0 && (
            <div className="flex flex-col gap-2 rounded-ctl border border-border bg-surface p-4">
              <p className="text-sm font-semibold">
                {ergebnis.fehlerhaft === 1
                  ? 'Eine Zeile blieb aussen vor'
                  : `${ergebnis.fehlerhaft} Zeilen blieben aussen vor`}
              </p>
              <p className="text-sm text-text-muted">
                Der Grund steht im Protokoll. Nach dem Berichtigen genügt es, dieselbe Datei erneut
                einzulesen — schon Importiertes meldet sich dann als unverändert.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-ctl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Was der Import nicht angefasst hat</p>
            <p className="text-sm text-text-muted">
              Der Aktiv-Schalter steht in keiner Spalte der Datei — ein stillgelegter Artikel
              bleibt stillgelegt, auch wenn seine Zeile in der Datei steht.
            </p>
          </div>
          <div className="mt-1 flex flex-col gap-tapgap">
            <Wegflaeche href="/artikel">Zum Artikelstamm</Wegflaeche>
            <Schaltflaeche art="sekundaer" breit onClick={aufNeu}>
              Weitere Datei einlesen
            </Schaltflaeche>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gemeinsames
// ---------------------------------------------------------------------------

function Fussleiste({ hinweis, children }: { hinweis: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2">
      <span className="text-sm text-text-muted">{hinweis}</span>
      <div className="flex flex-wrap gap-tapgap">{children}</div>
    </div>
  )
}

/**
 * Vorschau oder Protokoll als Datei — dieselbe Windows-Welt wie alle
 * CSV-Ausgänge des Projekts: Semikolon, CRLF, BOM (alsCsv).
 */
function csvLaden(name: string, zeilen: readonly Vorschauzeile[]): void {
  const inhalt = alsCsv([
    ['zeile', 'status', 'name', 'gebinde', 'kategorie', 'was_passiert'],
    ...zeilen.map((zeile) => [
      String(zeile.zeile),
      STATUS[zeile.status].wort,
      zeile.name,
      zeile.gebinde,
      zeile.kategorie,
      zeile.status === 'geaendert'
        ? zeile.aenderungen
            .map((aenderung) => `${aenderung.feld} ${aenderung.alt} -> ${aenderung.neu}`)
            .join(' · ')
        : zeile.beschreibung,
    ]),
  ])

  const url = URL.createObjectURL(new Blob([inhalt], { type: 'text/csv;charset=utf-8' }))
  const verweis = document.createElement('a')
  verweis.href = url
  verweis.download = name.endsWith('.csv') ? name : `${name}.csv`
  verweis.click()
  URL.revokeObjectURL(url)
}
