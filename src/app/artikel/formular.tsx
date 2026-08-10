'use client'

/**
 * Die Detailmaske eines Artikels, für Anlegen und Bearbeiten dieselbe.
 *
 * Fünf Blöcke: Identität, Lieferung, Zählung, Preis, Schalter. Gebindeart und
 * Zählmodus sind getrennte Felder und bleiben es — wie geliefert wird und wie
 * gezählt wird, sind zwei Wirklichkeiten, und die Maske sagt das auch.
 *
 * Alles Berechnete steht auf gedeckter Fläche mit dem Etikett "berechnet" und
 * ist nie ein Eingabefeld. Gerechnet wird in src/lib/artikelstamm.ts — die
 * Maske reicht die Eingabetexte hin und zeigt die fertigen Sätze. Genau eine
 * Zahl je Grösse: die zweite Stelle, an der ein Flaschenpreis gepflegt wird,
 * war der Fehler der Excel, die diese App ablöst.
 *
 * Ein leeres Preisfeld heisst "Preis nicht bekannt" und wird als null
 * gespeichert, nie als 0.
 */

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { EkPreisBezug } from '@/generated/prisma/enums'
import {
  GEBINDEART_AUSWAHL,
  ZAEHLMODUS_AUSWAHL,
  literAbleitung,
  preisAbleitung,
  zaehlZeile,
  type Entwurfseingaben,
  type Formularwerte,
} from '@/lib/artikelstamm'
import { FELD, BESCHRIFTUNG } from '@/ui/feld'
import { Hinweisleiste } from '@/ui/hinweisleiste'
import { Modusumschalter } from '@/ui/modus'
import { Schaltflaeche } from '@/ui/schaltflaeche'

import { artikelAnlegen, artikelSpeichern, type Speicherzustand } from './aktionen'

const ANFANG: Speicherzustand = { art: 'leer' }

export function Artikelformular({
  werte: anfang,
  artikelId,
  kategorien,
}: {
  werte: Formularwerte
  /** Fehlt beim Anlegen — dann führt Speichern auf die neue Detailseite. */
  artikelId?: string
  kategorien: string[]
}) {
  const [werte, setWerte] = useState(anfang)
  const [zustand, absenden, laeuft] = useActionState(
    artikelId === undefined ? artikelAnlegen : artikelSpeichern,
    ANFANG,
  )

  function setze<F extends keyof Formularwerte>(feld: F, wert: Formularwerte[F]) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }))
  }

  const eingaben: Entwurfseingaben = {
    gebindeart: werte.gebindeart,
    einheiten: werte.einheiten,
    inhalt: werte.inhalt,
    preis: werte.preis,
    bezug: werte.ekPreisBezug,
  }
  const liter = literAbleitung(eingaben)
  const preis = preisAbleitung(eingaben)

  // Die Kategorie des Artikels gehört ins Auswahlfeld, auch wenn sie in der
  // Liste (noch) nicht vorkommt — sonst spränge die Auswahl auf die erste.
  const auswahlKategorien =
    werte.kategorie !== '' && !kategorien.includes(werte.kategorie)
      ? [werte.kategorie, ...kategorien]
      : kategorien

  return (
    <form action={absenden} className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      {artikelId !== undefined && <input type="hidden" name="artikelId" value={artikelId} />}
      <input type="hidden" name="zaehlmodus" value={werte.zaehlmodus} />
      <input type="hidden" name="ekPreisBezug" value={werte.ekPreisBezug} />
      <input type="hidden" name="schwundfaehig" value={werte.schwundfaehig ? 'ja' : 'nein'} />
      <input type="hidden" name="aktiv" value={werte.aktiv ? 'ja' : 'nein'} />

      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <Link
          href="/artikel"
          className="tap -ml-2 flex h-tap items-center px-2 text-zeile text-primary-text focus-visible:fokus"
        >
          ‹ Artikelstamm
        </Link>
        <span aria-hidden className="hidden h-6 w-px bg-border md:block" />
        <span className="hidden min-w-0 items-baseline gap-2 md:flex">
          <span className="truncate text-lg font-semibold">
            {werte.name === '' ? 'Neuer Artikel' : werte.name}
          </span>
          {werte.lieferGebindeText !== '' && <Gebindechip text={werte.lieferGebindeText} />}
        </span>
        <span className="ml-auto flex items-center gap-tapgap">
          {zustand.art === 'gespeichert' && (
            <span className="text-sm font-medium text-confirm-text">Gespeichert</span>
          )}
          <span className="hidden gap-tapgap md:flex">
            <Schaltflaeche art="sekundaer" onClick={() => setWerte(anfang)} disabled={laeuft}>
              Verwerfen
            </Schaltflaeche>
            <Schaltflaeche type="submit" disabled={laeuft}>
              Speichern
            </Schaltflaeche>
          </span>
          <Modusumschalter className="md:hidden" />
        </span>
      </header>

      <div className="flex-1 p-4 pb-32 md:pb-8 xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-6">
        <div className="overflow-hidden rounded-ctl border border-border bg-surface">
          {zustand.art === 'fehler' && (
            <div className="p-4 pb-0">
              <Hinweisleiste rolle="danger" titel="Nicht gespeichert">
                {zustand.meldung}
              </Hinweisleiste>
            </div>
          )}

          {!anfang.aktiv && (
            <div className="border-b border-border bg-surface-2 px-4 py-3.5 md:px-6">
              <p className="text-zeile">Stillgelegt</p>
              <p className="text-sm text-text-muted">
                Nicht mehr im Laufweg. Bereits gebuchte Zählungen und Lieferungen bleiben
                unverändert und bewertet — gelöscht wird hier nie.
              </p>
            </div>
          )}

          <Block titel="Identität" erklaerung="Wer der Artikel ist und wo er im Lager steht.">
            <label className="flex flex-col gap-1.5">
              <span className={BESCHRIFTUNG}>Name</span>
              <input
                type="text"
                name="name"
                value={werte.name}
                onChange={(ereignis) => setze('name', ereignis.target.value)}
                className={FELD}
              />
            </label>
            <div className="grid gap-3.5 md:grid-cols-[minmax(0,1fr)_160px]">
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Kategorie</span>
                <select
                  name="kategorie"
                  value={werte.kategorie}
                  onChange={(ereignis) => setze('kategorie', ereignis.target.value)}
                  className={FELD}
                >
                  {werte.kategorie === '' && <option value="">Kategorie wählen</option>}
                  {auswahlKategorien.map((eintrag) => (
                    <option key={eintrag} value={eintrag}>
                      {eintrag}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Sortiernummer</span>
                <input
                  type="text"
                  name="sortierung"
                  inputMode="numeric"
                  value={werte.sortierung}
                  onChange={(ereignis) => setze('sortierung', ereignis.target.value)}
                  className={`${FELD} font-mono`}
                />
              </label>
            </div>
            <p className="text-sm leading-relaxed text-text-muted">
              Die Sortiernummer ist die Position im Laufweg durch das Lager, nicht die
              Artikelnummer des Lieferanten. In Zehnerschritten vergeben, damit ein neuer Artikel
              dazwischen passt.
            </p>
          </Block>

          <Block titel="Lieferung" erklaerung="Wie der Artikel vom Lieferanten kommt.">
            <div className="grid gap-3.5 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Gebindeart</span>
                <select
                  name="gebindeart"
                  value={werte.gebindeart}
                  onChange={(ereignis) =>
                    setze('gebindeart', ereignis.target.value as Formularwerte['gebindeart'])
                  }
                  className={FELD}
                >
                  {GEBINDEART_AUSWAHL.map((eintrag) => (
                    <option key={eintrag.wert} value={eintrag.wert}>
                      {eintrag.text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Anzeigetext des Gebindes</span>
                <input
                  type="text"
                  name="lieferGebindeText"
                  value={werte.lieferGebindeText}
                  onChange={(ereignis) => setze('lieferGebindeText', ereignis.target.value)}
                  placeholder="24 x 0,33"
                  className={`${FELD} font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Einheiten je Gebinde</span>
                <input
                  type="text"
                  name="einheiten"
                  inputMode="numeric"
                  value={werte.einheiten}
                  onChange={(ereignis) => setze('einheiten', ereignis.target.value)}
                  className={FELD}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Inhalt je Einheit · Liter</span>
                <input
                  type="text"
                  name="inhalt"
                  inputMode="decimal"
                  value={werte.inhalt}
                  onChange={(ereignis) => setze('inhalt', ereignis.target.value)}
                  className={FELD}
                />
              </label>
            </div>
            <Berechnet>
              <p className="text-zeile text-text">{liter ?? '—'}</p>
              <p className="text-sm text-text-muted">
                Der Anzeigetext ist frei, die Rechnung folgt immer den beiden Zahlen darüber.
              </p>
            </Berechnet>
          </Block>

          <Block titel="Zählung" erklaerung="Wie im Lager gezählt wird.">
            <div role="radiogroup" aria-label="Zählmodus" className="grid gap-tapgap md:grid-cols-3">
              {ZAEHLMODUS_AUSWAHL.map((eintrag) => {
                const gewaehlt = werte.zaehlmodus === eintrag.wert
                return (
                  <button
                    key={eintrag.wert}
                    type="button"
                    role="radio"
                    aria-checked={gewaehlt}
                    onClick={() => setze('zaehlmodus', eintrag.wert)}
                    className={`tap flex min-h-tap flex-col justify-center gap-0.5 rounded-ctl px-3.5 py-2 text-left focus-visible:fokus ${
                      gewaehlt
                        ? 'border-2 border-primary bg-primary-soft'
                        : 'border border-border-strong bg-surface'
                    }`}
                  >
                    <span
                      className={`text-zeile ${gewaehlt ? 'font-semibold text-primary-soft-on' : ''}`}
                    >
                      {eintrag.titel}
                    </span>
                    <span
                      className={`text-sm ${gewaehlt ? 'text-primary-soft-on' : 'text-text-muted'}`}
                    >
                      {eintrag.beispiel}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="rounded-ctl border border-border bg-bg px-4 py-3.5">
              <p className="text-sm font-semibold">Warum das nicht an der Gebindeart hängt</p>
              <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-text-muted">
                Wein kommt im Karton zu sechs Flaschen, steht im Regal aber offen und wird einzeln
                gezählt — niemand baut den Karton nach. Umgekehrt wird Wasser im Kasten geliefert
                und auch im Kasten gezählt. Lieferung und Zählung sind zwei getrennte
                Wirklichkeiten; der Artikelstamm bildet beide ab.
              </p>
            </div>
          </Block>

          <Block titel="Preis" erklaerung="Grundlage jeder Bewertung.">
            <div className="grid gap-3.5 md:grid-cols-[200px_minmax(0,1fr)]">
              <label className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Einkaufspreis · EUR</span>
                <input
                  type="text"
                  name="preis"
                  inputMode="decimal"
                  value={werte.preis}
                  onChange={(ereignis) => setze('preis', ereignis.target.value)}
                  placeholder="leer = nicht bekannt"
                  className={FELD}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className={BESCHRIFTUNG}>Bezug des Preises</span>
                <div role="radiogroup" aria-label="Bezug des Preises" className="flex gap-tapgap">
                  <Bezugsknopf
                    text="je Gebinde"
                    gewaehlt={werte.ekPreisBezug === EkPreisBezug.PRO_GEBINDE}
                    aufTipp={() => setze('ekPreisBezug', EkPreisBezug.PRO_GEBINDE)}
                  />
                  <Bezugsknopf
                    text="je Einheit"
                    gewaehlt={werte.ekPreisBezug === EkPreisBezug.PRO_EINHEIT}
                    aufTipp={() => setze('ekPreisBezug', EkPreisBezug.PRO_EINHEIT)}
                  />
                </div>
              </div>
            </div>

            {preis === 'unbekannt' ? (
              <Hinweisleiste rolle="attention" titel="Preis nicht bekannt">
                {'Das Feld ist leer — das heisst nicht 0,00 EUR. Der Artikel wird gezählt, aber in der Bewertung als „nicht bewertbar" ausgewiesen und nicht mit null Euro in die Summe genommen.'}
              </Hinweisleiste>
            ) : (
              <Berechnet>
                <p className="text-xl font-semibold text-text">{preis === null ? '—' : preis.haupt}</p>
                {preis !== null && preis.abgeleitet !== null && (
                  <p className="text-zeile text-text-muted">{preis.abgeleitet}</p>
                )}
              </Berechnet>
            )}
          </Block>

          <Block
            titel="Schalter"
            erklaerung="Zwei Entscheidungen mit Folgen für die Auswertung."
            letzter
          >
            <Schalterzeile
              titel="Wird auf Schwund geprüft"
              erklaerung="Aus für portioniert verkaufte Spirituosen: aus einer 0,7-Flasche werden 2-cl-Gläser, die Kasse kennt Gläser, der Zähler kennt Flaschen. Ein Vergleich wäre Zahlenrauschen."
              an={werte.schwundfaehig}
              aufTipp={() => setze('schwundfaehig', !werte.schwundfaehig)}
            />
            <Schalterzeile
              titel="Aktiv"
              erklaerung="Aus heisst stillgelegt: der Artikel fällt aus dem Laufweg, bleibt aber im Stamm und in allen bereits gebuchten Inventuren. Gelöscht wird hier nie."
              an={werte.aktiv}
              aufTipp={() => setze('aktiv', !werte.aktiv)}
            />
          </Block>
        </div>

        <aside className="mt-6 flex flex-col gap-3.5 xl:mt-0">
          <p className={BESCHRIFTUNG}>Eingegeben und gerechnet</p>
          <Erklaerkarte titel="Eingegeben">
            Weisses Feld mit Rand, Beschriftung darüber, änderbar.
          </Erklaerkarte>
          <Erklaerkarte titel="Berechnet">
            Gedeckte Fläche, kein Rand, kein Feld. Nichts daran ist anklickbar — die Zahl gehört
            den Eingaben darüber.
          </Erklaerkarte>
          <Erklaerkarte titel="Woran die Excel gescheitert ist">
            Der Flaschenpreis stand in der Zählliste, in der Bestellung und in der Bewertung —
            drei Zellen, die zusammen hätten passen müssen. Nach jeder Preiserhöhung passten sie
            nicht mehr. Hier gibt es die Zahl genau einmal, überall sonst wird sie gerechnet.
          </Erklaerkarte>
          <div className="flex flex-col gap-2.5 rounded-ctl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">So erscheint der Artikel im Lager</p>
            <div className="flex min-h-tap items-center gap-3 rounded-ctl border border-border px-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-zeile">
                  {werte.name === '' ? 'Neuer Artikel' : werte.name}
                </span>
                <span className="truncate text-sm text-text-muted">
                  {zaehlZeile({
                    lieferGebindeText: werte.lieferGebindeText,
                    zaehlmodus: werte.zaehlmodus,
                  })}
                </span>
              </span>
              <span aria-hidden className="text-zeile text-text-muted">
                —
              </span>
            </div>
            <p className="text-sm text-text-muted">
              Der Zählbildschirm liest Gebindeart, Anzeigetext und Zählmodus. Preis und
              Schwund-Schalter tauchen dort nicht auf.
            </p>
          </div>
        </aside>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-surface px-4 pt-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:hidden">
        {zustand.art === 'fehler' && (
          <p className="text-sm font-medium text-danger-text">{zustand.meldung}</p>
        )}
        <Schaltflaeche type="submit" breit disabled={laeuft}>
          {laeuft ? 'Speichert …' : 'Speichern'}
        </Schaltflaeche>
      </footer>
    </form>
  )
}

/** Ein Block der Maske: links Titel und Erklärung, rechts die Felder. */
function Block({
  titel,
  erklaerung,
  letzter = false,
  children,
}: {
  titel: string
  erklaerung: string
  letzter?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`grid gap-4 p-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6 md:p-6 ${
        letzter ? '' : 'border-b border-border'
      }`}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-zeile font-semibold">{titel}</h2>
        <p className="text-sm leading-relaxed text-text-muted">{erklaerung}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

/** Eine berechnete Angabe: gedeckte Fläche, Etikett, kein Eingabefeld. */
function Berechnet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-ctl bg-surface-2 px-4 py-3.5">
      <span className="font-mono text-[11px] tracking-wide text-text-muted uppercase">
        berechnet
      </span>
      {children}
    </div>
  )
}

function Gebindechip({ text }: { text: string }) {
  return (
    <span className="shrink-0 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-abschnitt font-normal tracking-normal">
      {text}
    </span>
  )
}

function Bezugsknopf({
  text,
  gewaehlt,
  aufTipp,
}: {
  text: string
  gewaehlt: boolean
  aufTipp: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={gewaehlt}
      onClick={aufTipp}
      className={`tap flex h-tap flex-1 items-center justify-center rounded-ctl text-zeile focus-visible:fokus ${
        gewaehlt
          ? 'border-2 border-primary bg-primary-soft font-semibold text-primary-soft-on'
          : 'border border-border-strong bg-surface'
      }`}
    >
      {text}
    </button>
  )
}

/** Eine Schalterzeile: Aussage, Erklärung, Schalter. Die ganze Zeile schaltet. */
function Schalterzeile({
  titel,
  erklaerung,
  an,
  aufTipp,
}: {
  titel: string
  erklaerung: string
  an: boolean
  aufTipp: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      onClick={aufTipp}
      className="tap flex min-h-tap items-center gap-4 rounded-ctl border border-border bg-surface px-4 py-3 text-left focus-visible:fokus"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-zeile">{titel}</span>
        <span className="max-w-[70ch] text-sm leading-relaxed text-text-muted">{erklaerung}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-8 w-13 shrink-0 items-center rounded-full p-0.75 ${
          an ? 'justify-end bg-primary' : 'justify-start bg-text-muted'
        }`}
      >
        <span className="size-6.5 rounded-full bg-surface" />
      </span>
    </button>
  )
}

/** Eine Erklärkarte der rechten Spalte. */
function Erklaerkarte({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-ctl border border-border bg-surface p-4">
      <p className="text-sm font-semibold">{titel}</p>
      <p className="text-sm leading-relaxed text-text-muted">{children}</p>
    </div>
  )
}
