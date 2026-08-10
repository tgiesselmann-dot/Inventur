'use client'

/**
 * Die Tabelle der Auswertung — und die Herleitung hinter jeder Zeile.
 *
 * Die Herleitung ist nicht die Kür, sondern der Grund, warum diese Seite
 * geglaubt wird: In der abgelösten Tabellenkalkulation stand am Ende eine Zahl,
 * die niemand mehr nachvollziehen konnte. Hier legt ein Tipp auf die Zeile jede
 * Rechenstufe mit ihren Belegen offen — welche Zählung, welcher Lieferschein,
 * welcher Kassenimport.
 *
 * Die Spaltenköpfe tragen die Operatoren, damit die Zeile von links nach rechts
 * gelesen dieselbe Formel ergibt wie die Herleitung von oben nach unten.
 *
 * Auf dem Desktop eine Tabelle, auf dem Telefon Karten: acht Spalten sind auf
 * 390 px nicht lesbar, und die Auswertung wird ohnehin am Laptop gelesen. Die
 * mobile Fassung gibt es trotzdem, weil die Frage „was fehlt bei Cola" auch im
 * Lager aufkommt.
 *
 * Gerechnet wird hier nichts. Die Mengen kommen als Text aus src/lib/auswertung.ts,
 * die Farbstufe und die Reihenfolge aus src/lib/auswertung-anzeige.ts.
 */

import { useState } from 'react'

import {
  SORTIERUNGEN,
  sortiert,
  type Anzeigezeile,
  type Schwundstufe,
  type Sortierung,
} from '@/lib/auswertung-anzeige'
import { alsEuro } from '@/lib/wareneingang'
import { ROLLEN } from '@/ui/rollen'
import { Schaltflaeche } from '@/ui/schaltflaeche'
import { Wegflaeche } from '@/ui/wegflaeche'

/** Was unter der Tabelle steht — fertig formuliert, damit hier nichts gezählt wird. */
export type Tabellenfuss = {
  titel: string
  /** Bernstein: die Artikel, die nicht in der Summe stehen. */
  ohnePreis: string | null
  /** Grau: was sonst noch fehlt oder bewusst nicht gerechnet wird. */
  weitere: string | null
  wert: string
  /** Rot nur, wo wirklich Geld fehlt — "nicht bewertbar" ist keine Forderung. */
  betont: boolean
}

export type Wege = {
  /** Zur Zählung, die den Istbestand geliefert hat. */
  zaehlung: string
  lieferungen: string
}

/**
 * Die Farbe des Schwunds. Rot heisst „hier fehlt etwas", Bernstein „hier
 * stimmt die Datenlage nicht". Die neutrale Zahl bleibt text-text — sie ist
 * die Auskunft, kein Nebenwort.
 */
const STUFENFARBE: Record<Schwundstufe, string> = {
  neutral: 'text-text',
  auffaellig: ROLLEN.danger.text,
  zuviel: ROLLEN.attention.text,
  ohne: ROLLEN.neutral.text,
}

export function Auswertungstabelle({
  zeilen,
  zeitraum,
  fuss,
  wege,
}: {
  zeilen: Anzeigezeile[]
  zeitraum: { von: string; bis: string }
  fuss: Tabellenfuss
  wege: Wege
}) {
  const [offen, setOffen] = useState<string | null>(null)
  const [sortierung, setSortierung] = useState<Sortierung>('schwund-ab')

  if (zeilen.length === 0) {
    return (
      <p className="mt-6 text-sm text-text-muted">
        Für diesen Zeitraum gibt es keine bewegten Artikel.
      </p>
    )
  }

  const geordnet = sortiert(zeilen, sortierung)
  const umschalten = (id: string) => setOffen(offen === id ? null : id)

  return (
    <>
      <Volltabelle
        zeilen={geordnet}
        zeitraum={zeitraum}
        fuss={fuss}
        wege={wege}
        offen={offen}
        umschalten={umschalten}
        sortierung={sortierung}
        sortieren={setSortierung}
      />
      <Kartenliste
        zeilen={geordnet}
        zeitraum={zeitraum}
        fuss={fuss}
        wege={wege}
        offen={offen}
        umschalten={umschalten}
        sortierung={sortierung}
        sortieren={setSortierung}
      />
    </>
  )
}

type Fassung = {
  zeilen: Anzeigezeile[]
  zeitraum: { von: string; bis: string }
  fuss: Tabellenfuss
  wege: Wege
  offen: string | null
  umschalten: (id: string) => void
  sortierung: Sortierung
  sortieren: (wert: Sortierung) => void
}

/* ---------------------------------------------------------------- Desktop */

function Volltabelle({
  zeilen,
  zeitraum,
  fuss,
  wege,
  offen,
  umschalten,
  sortierung,
  sortieren,
}: Fassung) {
  const nachSchwund = sortierung === 'schwund-ab' || sortierung === 'schwund-auf'

  return (
    <div className="mt-4 hidden lg:block">
      {/*
        table-fixed statt Bildlauf: nur so klebt die Kopfzeile am Fenster und
        nicht am oberen Rand eines Bildlauffeldes.

        border-separate mit Abstand null: bei zusammengelegten Rändern teilen
        sich zwei Zellen einen Rand, und eine getönte Fussfläche bekommt an
        jeder Zellgrenze eine sichtbare Naht. Die Trennlinien liegen deshalb auf
        den Zellen und nicht auf der Zeile.
      */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col />
          <col className="w-[104px]" span={5} />
          <col className="w-[150px]" />
          <col className="w-[148px]" />
        </colgroup>
        <thead className="sticky top-0 z-2 bg-bg">
          <tr className="text-left text-xs font-medium tracking-wide text-text-muted uppercase [&>th]:border-b [&>th]:border-border-strong [&>th]:bg-bg">
            <th scope="col" className="py-2.5 pr-4" aria-sort={sortierung === 'name' ? 'ascending' : 'none'}>
              <Sortierkopf
                aktiv={sortierung === 'name'}
                pfeil="↕"
                aufKlick={() => sortieren('name')}
                links
              >
                Artikel
              </Sortierkopf>
            </th>
            <Kopf>Anfangs&shy;bestand</Kopf>
            <Kopf>+ Liefe&shy;rungen</Kopf>
            <Kopf>− Ver&shy;käufe</Kopf>
            <Kopf>= Soll&shy;bestand</Kopf>
            <Kopf>− Ist&shy;bestand</Kopf>
            <th
              scope="col"
              className="py-2.5 pl-3 pr-2 text-right"
              aria-sort={
                sortierung === 'schwund-ab'
                  ? 'descending'
                  : sortierung === 'schwund-auf'
                    ? 'ascending'
                    : 'none'
              }
            >
              <Sortierkopf
                aktiv={nachSchwund}
                pfeil={sortierung === 'schwund-auf' ? '▲' : '▼'}
                aufKlick={() =>
                  sortieren(sortierung === 'schwund-ab' ? 'schwund-auf' : 'schwund-ab')
                }
              >
                = Schwund
              </Sortierkopf>
            </th>
            <Kopf>Wert</Kopf>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((eintrag) => (
            <Tabellenzeile
              key={eintrag.artikel.id}
              zeile={eintrag}
              zeitraum={zeitraum}
              wege={wege}
              offen={offen === eintrag.artikel.id}
              aufKlick={() => umschalten(eintrag.artikel.id)}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="[&>td]:border-t [&>td]:border-border-strong [&>td]:bg-surface-2">
            <td colSpan={6} className="py-3 pr-4 pl-1 align-top">
              <p className="font-semibold">{fuss.titel}</p>
              {fuss.ohnePreis !== null && (
                <p className="mt-1 text-xs text-attention-text">{fuss.ohnePreis}</p>
              )}
              {fuss.weitere !== null && (
                <p className="mt-0.5 text-xs text-text-muted">{fuss.weitere}</p>
              )}
            </td>
            <td className="py-3 pr-2 pl-3 text-right align-top text-xs text-text-muted">gesamt</td>
            <td
              className={`py-3 pl-3 text-right align-top text-titel ${fuss.betont ? 'text-danger-text' : 'text-text-muted'}`}
            >
              {fuss.wert}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Kopf({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="py-2.5 pl-3 text-right leading-tight font-medium">
      {children}
    </th>
  )
}

function Sortierkopf({
  children,
  pfeil,
  aktiv,
  aufKlick,
  links = false,
}: {
  children: React.ReactNode
  pfeil: string
  aktiv: boolean
  aufKlick: () => void
  links?: boolean
}) {
  return (
    <button
      type="button"
      onClick={aufKlick}
      className={`inline-flex items-center gap-1.5 tracking-wide uppercase hover:text-primary-text focus-visible:fokus ${
        links ? '' : 'justify-end'
      } ${aktiv ? 'font-semibold text-text' : 'font-medium'}`}
    >
      {children}
      <span aria-hidden className={aktiv ? 'text-primary-text' : 'text-text-muted'}>
        {pfeil}
      </span>
    </button>
  )
}

function Tabellenzeile({
  zeile,
  zeitraum,
  wege,
  offen,
  aufKlick,
}: {
  zeile: Anzeigezeile
  zeitraum: { von: string; bis: string }
  wege: Wege
  offen: boolean
  aufKlick: () => void
}) {
  return (
    <>
      <tr
        onClick={aufKlick}
        onKeyDown={(ereignis) => {
          if (ereignis.key === 'Enter' || ereignis.key === ' ') {
            ereignis.preventDefault()
            aufKlick()
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={offen}
        className={`h-14 cursor-pointer focus-visible:fokus [&>td]:border-b [&>td]:border-border ${
          offen ? '[&>td]:bg-surface-2' : 'hover:[&>td]:bg-surface-2'
        }`}
      >
        <td className="py-1.5 pr-4">
          <span className="block truncate text-zeile">{zeile.artikel.name}</span>
          <span className="block truncate text-xs text-text-muted">
            {zeile.artikel.lieferGebindeText} · {zeile.artikel.kategorie}
          </span>
        </td>
        <Zahl>{zeile.anfang}</Zahl>
        <Zahl>{zeile.lieferungen}</Zahl>
        <Zahl>{verkaufsmenge(zeile)}</Zahl>
        <Zahl>{sollmenge(zeile)}</Zahl>
        <Zahl>{zeile.ist ?? '—'}</Zahl>
        <td className="py-1.5 pr-2 pl-3 text-right">
          {zeile.schwund === null ? (
            <span className="text-xs text-text-muted">
              {zeile.ist === null ? 'nicht gezählt' : 'ohne Schwundrechnung'}
            </span>
          ) : (
            <span className={`text-base font-semibold ${STUFENFARBE[zeile.stufe]}`}>
              {zeile.schwund}
            </span>
          )}
        </td>
        <td className="py-1.5 pl-3 text-right">
          <Schwundwert zeile={zeile} />
        </td>
      </tr>

      {offen && (
        <tr>
          <td colSpan={8} className="border-b border-border bg-surface-2 px-1 pt-1 pb-5">
            <Herleitung zeile={zeile} zeitraum={zeitraum} wege={wege} />
          </td>
        </tr>
      )}
    </>
  )
}

function Zahl({ children }: { children: React.ReactNode }) {
  return <td className="py-1.5 pl-3 text-right text-text-muted">{children}</td>
}

/**
 * Der Wert des Schwunds einer Zeile — Betrag oder Vermerk, nie ein Feld.
 * Der frühere Lokalname „Wertfeld" verdeckte den ui-Baustein
 * src/ui/wertfeld.tsx, der etwas ganz anderes ist (ein Mengenfeld).
 *
 * Ohne hinterlegten Preis steht hier ein bernsteinfarbener Vermerk und niemals
 * 0,00 EUR — eine Null wäre eine Aussage über Geld, die niemand gemacht hat.
 */
function Schwundwert({ zeile }: { zeile: Anzeigezeile }) {
  if (zeile.schwund === null) return <span className="text-border-strong">—</span>
  if (zeile.schwundWertCent === null) {
    return (
      <span className="inline-block rounded-md border border-attention bg-attention-soft px-2 py-0.5 text-xs font-medium text-attention-soft-on">
        nicht bewertbar
      </span>
    )
  }
  return (
    <span
      className={zeile.stufe === 'neutral' ? 'text-text-muted' : `font-semibold ${STUFENFARBE[zeile.stufe]}`}
    >
      {alsEuro(zeile.schwundWertCent)}
    </span>
  )
}

/* ----------------------------------------------------------------- Telefon */

function Kartenliste({
  zeilen,
  zeitraum,
  fuss,
  wege,
  offen,
  umschalten,
  sortierung,
  sortieren,
}: Fassung) {
  const naechste =
    SORTIERUNGEN[(SORTIERUNGEN.findIndex((eintrag) => eintrag.wert === sortierung) + 1) % SORTIERUNGEN.length]
  const jetzt = SORTIERUNGEN.find((eintrag) => eintrag.wert === sortierung)!

  return (
    <div className="lg:hidden">
      <ul className="mt-3 flex flex-col gap-2.5">
        {zeilen.map((eintrag) => (
          <Karte
            key={eintrag.artikel.id}
            zeile={eintrag}
            zeitraum={zeitraum}
            wege={wege}
            offen={offen === eintrag.artikel.id}
            aufKlick={() => umschalten(eintrag.artikel.id)}
          />
        ))}
      </ul>

      <div className="mt-3 rounded-ctl border border-border bg-surface-2 p-3">
        <p className="font-semibold">{fuss.titel}</p>
        <p className={`mt-1 text-titel ${fuss.betont ? 'text-danger-text' : 'text-text-muted'}`}>
          {fuss.wert}
        </p>
        {fuss.ohnePreis !== null && (
          <p className="mt-1 text-xs text-attention-text">{fuss.ohnePreis}</p>
        )}
        {fuss.weitere !== null && <p className="mt-0.5 text-xs text-text-muted">{fuss.weitere}</p>}
      </div>

      {/* Alles Auslösende liegt auf dem Telefon unten. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-3 border-t border-border bg-bg px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Schaltflaeche breit onClick={() => sortieren(naechste.wert)}>
          {jetzt.text}
          <span aria-hidden className="ml-2">
            {jetzt.pfeil}
          </span>
        </Schaltflaeche>
      </div>
    </div>
  )
}

function Karte({
  zeile,
  zeitraum,
  wege,
  offen,
  aufKlick,
}: {
  zeile: Anzeigezeile
  zeitraum: { von: string; bis: string }
  wege: Wege
  offen: boolean
  aufKlick: () => void
}) {
  return (
    <li className="rounded-ctl border border-border bg-surface">
      <button
        type="button"
        onClick={aufKlick}
        aria-expanded={offen}
        className="tap w-full px-3.5 py-3 text-left focus-visible:fokus"
      >
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-zeile">{zeile.artikel.name}</span>
            <span className="block truncate text-xs text-text-muted">
              {zeile.artikel.lieferGebindeText} · {zeile.artikel.kategorie}
            </span>
          </span>
          <span aria-hidden className="text-text-muted">
            {offen ? '⌃' : '⌄'}
          </span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <span className="min-w-0">
            {zeile.schwund === null ? (
              <span className="block text-zeile text-text-muted">
                {zeile.ist === null ? 'nicht gezählt' : 'ohne Schwundrechnung'}
              </span>
            ) : (
              <span className={`block text-count ${STUFENFARBE[zeile.stufe]}`}>
                {zeile.schwund}
              </span>
            )}
            <span className="mt-1 block text-xs text-text-muted">{unterschrift(zeile)}</span>
          </span>
          <span className="shrink-0 text-right">
            <Schwundwert zeile={zeile} />
          </span>
        </div>

        <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-2.5 text-xs">
          {kurzrechnung(zeile).map((stufe) => (
            <div key={stufe.name} className="flex items-baseline gap-2">
              <dt className="flex min-w-0 flex-1 gap-2">
                <span aria-hidden className="w-3 shrink-0 text-text-muted">
                  {stufe.zeichen}
                </span>
                <span className="truncate text-text-muted">{stufe.name}</span>
              </dt>
              <dd>{stufe.menge}</dd>
            </div>
          ))}
        </dl>
      </button>

      {offen && (
        <div className="px-1 pb-3">
          <Herleitung zeile={zeile} zeitraum={zeitraum} wege={wege} />
        </div>
      )}
    </li>
  )
}

/** Was die grosse Zahl auf der Karte bedeutet — die Farbe steht nie allein. */
function unterschrift(zeile: Anzeigezeile): string {
  if (zeile.schwund === null) {
    return zeile.ist === null
      ? 'kein Istbestand — Schwund unbekannt'
      : `portioniert verkauft · Bestand ${zeile.ist}`
  }
  if (zeile.stufe === 'zuviel') return 'mehr gezählt als möglich'
  if (zeile.richtung === 'genau') return 'keine Abweichung'
  // Substantivisch, weil die Zahl darüber 1 oder 24 sein kann und „1 Einheiten
  // fehlen" in einer Zeile steht, die Genauigkeit behauptet.
  return 'Fehlbestand'
}

/* -------------------------------------------------------------- Herleitung */

type Rechenstufe = {
  zeichen: string
  name: string
  menge: string
  belege: Anzeigezeile['belege']['anfang']
  /** Erklärung statt Belegen — für Stufen, die es bewusst nicht gibt. */
  statt?: string
}

/**
 * Verkäufe und Sollbestand eines portioniert verkauften Artikels.
 *
 * Die Kasse zählt dort Gläser. Was daraus in Flaschen wird, ist geraten — und
 * ein Sollbestand aus einer geratenen Zahl lädt zu genau dem Vergleich ein, den
 * die Rechnung für diese Artikel bewusst nicht zieht. Deshalb ein
 * Gedankenstrich und keine Zahl.
 */
function verkaufsmenge(zeile: Anzeigezeile): string {
  return zeile.artikel.schwundfaehig ? zeile.verkaeufe : '—'
}

function sollmenge(zeile: Anzeigezeile): string {
  return zeile.artikel.schwundfaehig ? zeile.soll : '—'
}

/** Die drei Zugänge und Abgänge bis zum Sollbestand. */
function rechenstufen(zeile: Anzeigezeile): Rechenstufe[] {
  return [
    { zeichen: '', name: 'Anfangsbestand', menge: zeile.anfang, belege: zeile.belege.anfang },
    {
      zeichen: '+',
      name: 'Lieferungen im Zeitraum',
      menge: zeile.lieferungen,
      belege: zeile.belege.lieferungen,
    },
    {
      zeichen: '−',
      name: 'Verkäufe laut Kassenexport',
      menge: verkaufsmenge(zeile),
      belege: zeile.belege.verkaeufe,
      statt: zeile.artikel.schwundfaehig
        ? undefined
        : 'Ausschank in Portionen · die Kasse zählt Gläser, nicht Flaschen',
    },
  ]
}

/** Dieselben Stufen, gekürzt für die Karte — plus der Istbestand. */
function kurzrechnung(zeile: Anzeigezeile): { zeichen: string; name: string; menge: string }[] {
  return [
    ...rechenstufen(zeile).map((stufe) => ({
      zeichen: stufe.zeichen,
      name: stufe.name.replace(' im Zeitraum', '').replace(' laut Kassenexport', ''),
      menge: stufe.menge,
    })),
    { zeichen: '=', name: 'Sollbestand', menge: sollmenge(zeile) },
    { zeichen: '−', name: 'Istbestand', menge: zeile.ist ?? '—' },
  ]
}

/** Jede Rechenstufe mit ihren Belegen — der Grund, warum die Zahl glaubwürdig ist. */
function Herleitung({
  zeile,
  zeitraum,
  wege,
}: {
  zeile: Anzeigezeile
  zeitraum: { von: string; bis: string }
  wege: Wege
}) {
  return (
    <div className="rounded-ctl border border-border bg-bg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-abschnitt text-text-muted uppercase">Herleitung</span>
          <span className="text-zeile">{zeile.artikel.name}</span>
          <span className="font-mono text-xs text-text-muted">
            {zeile.artikel.lieferGebindeText}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          {zeitraum.von} – {zeitraum.bis} · alle Mengen in Einheiten
        </span>
      </div>

      <dl>
        {rechenstufen(zeile).map((stufe) => (
          <Stufe key={stufe.name} stufe={stufe} />
        ))}

        <Ergebnis
          zeichen="="
          name="Sollbestand"
          hinweis={
            zeile.artikel.schwundfaehig
              ? 'so viel müsste im Lager stehen'
              : 'wird für portionierten Ausschank nicht gerechnet'
          }
          menge={sollmenge(zeile)}
        />

        <Stufe
          stufe={{
            zeichen: '−',
            name: 'Istbestand aus der Zählung',
            menge: zeile.ist ?? '—',
            belege: zeile.belege.ist,
            statt:
              zeile.ist === null
                ? 'am Ende des Zeitraums nicht gezählt — ohne Istbestand kein Schwund'
                : undefined,
          }}
        />

        {zeile.schwund === null ? (
          <Ergebnis
            zeichen="="
            name={zeile.ist === null ? 'Schwund unbekannt' : 'ohne Schwundrechnung'}
            hinweis={
              zeile.ist === null
                ? 'unbekannt ist nicht null'
                : 'gezählt und bewertet, aber nicht gegen die Kasse gerechnet'
            }
            menge="—"
          />
        ) : (
          <Ergebnis
            zeichen="="
            name={zeile.stufe === 'zuviel' ? 'Schwund · negativ' : 'Schwund'}
            hinweis={schwundhinweis(zeile)}
            menge={zeile.schwund}
            farbe={STUFENFARBE[zeile.stufe]}
          />
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {!zeile.artikel.mitPreis && (
          <p className="rounded-ctl border border-attention bg-attention-soft px-3 py-2 text-xs text-attention-soft-on">
            Für diesen Artikel ist kein Einkaufspreis hinterlegt. Die Menge steht in der Rechnung,
            der Wert bleibt offen — die Zeile zählt nicht in die Summe.
          </p>
        )}
        {!zeile.artikel.schwundfaehig && (
          <p className="rounded-ctl border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
            Portioniert ausgeschenkt. Die Kasse zählt Portionen, nicht Flaschen — eine Umrechnung
            wäre geraten. Der Bestand wird gezählt und bewertet, ein Schwund wird nicht gerechnet.
          </p>
        )}
        {zeile.stufe === 'zuviel' && (
          <p className="rounded-ctl border border-attention bg-attention-soft px-3 py-2 text-xs text-attention-soft-on">
            Es steht mehr im Lager, als möglich wäre. Das ist kein Verlust, sondern ein Zählfehler
            oder eine Lieferung, die niemand erfasst hat.
          </p>
        )}

        <div className="ml-auto flex flex-wrap gap-tapgap">
          <Wegflaeche href={wege.zaehlung} art="sekundaer">
            Zählung korrigieren
          </Wegflaeche>
          <Wegflaeche href={wege.lieferungen} art="sekundaer">
            Lieferung nachtragen
          </Wegflaeche>
        </div>
      </div>
    </div>
  )
}

/**
 * Was unter dem Schwund steht.
 *
 * Ohne Preis steht dort der Grund und nicht 0,00 EUR — dieselbe Regel wie in
 * der Wertspalte.
 */
function schwundhinweis(zeile: Anzeigezeile): string {
  if (zeile.schwundWertCent === null) return 'kein Einkaufspreis hinterlegt — nicht bewertbar'
  return `${alsEuro(zeile.schwundWertCent)} Einkaufswert`
}

function Stufe({ stufe }: { stufe: Rechenstufe }) {
  return (
    <div className="flex items-start gap-4 border-t border-border py-3">
      <dt className="flex min-w-0 flex-1 gap-4">
        <span aria-hidden className="w-4 shrink-0 text-right text-text-muted">
          {stufe.zeichen}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm">{stufe.name}</span>
          {stufe.statt !== undefined ? (
            <span className="text-xs text-text-muted">{stufe.statt}</span>
          ) : stufe.belege.length === 0 ? (
            <span className="text-xs text-text-muted">kein Beleg im Zeitraum</span>
          ) : (
            <span className="flex flex-col gap-0.5">
              {stufe.belege.map((beleg, nummer) => (
                <span key={`${beleg.ref}-${nummer}`} className="flex items-baseline gap-2.5 text-xs">
                  <span className="shrink-0 font-mono text-primary-text">{beleg.ref}</span>
                  <span className="truncate text-text-muted">{beleg.text}</span>
                  <span className="ml-auto shrink-0">{beleg.menge}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      </dt>
      <dd className="w-32 shrink-0 text-right text-zeile">{stufe.menge}</dd>
    </div>
  )
}

function Ergebnis({
  zeichen,
  name,
  hinweis,
  menge,
  farbe = 'text-text',
}: {
  zeichen: string
  name: string
  hinweis: string
  menge: string
  farbe?: string
}) {
  return (
    <div className="flex items-baseline gap-4 border-t border-border-strong py-3">
      <dt className="flex min-w-0 flex-1 gap-4">
        <span aria-hidden className="w-4 shrink-0 text-right text-text-muted">
          {zeichen}
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-text-muted">{hinweis}</span>
        </span>
      </dt>
      <dd className={`w-32 shrink-0 text-right text-titel ${farbe}`}>{menge}</dd>
    </div>
  )
}
