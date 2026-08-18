/**
 * Wer gerade vor der App sitzt — und zu welchem Betrieb er gehört.
 *
 * Vorher stand in achtzehn Dateien dieselbe Zeile: `betrieb.findFirst()`, den
 * ältesten Betrieb nehmen und hoffen, dass es nur einen gibt. Das war als
 * Platzhalter gedacht und hat gehalten, solange die App auf einem Rechner lief.
 * Ab hier kommt der Betrieb aus der Anmeldung, und es gibt genau diese eine
 * Stelle, die ihn kennt.
 *
 * Die Anmeldung selbst macht Supabase Auth: dort liegt das Passwort, von dort
 * kommt das signierte Token. Diese Datei fragt nur, wer das Token ausgestellt
 * bekommen hat, und schlägt in der Zugangsliste nach — der Tabelle `benutzer`.
 * Ein gültiges Supabase-Konto allein öffnet also nichts; es muss auch
 * eingetragen sein.
 *
 * `getClaims()` und nicht `getSession()`: nur ersteres prüft die Signatur des
 * Tokens. `getSession()` liest im Servercode bloss ein Cookie, dem niemand
 * ansieht, wer es geschrieben hat.
 */

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { istBetriebsleiter } from '@/lib/berechtigungen'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

/** Der Benutzer, wie ihn die Seiten brauchen. */
export type Angemeldet = {
  benutzerId: string
  email: string
  rolle: string
  betrieb: { id: string; name: string }
}

/**
 * Der Zugangsstand einer Anfrage. Vier Fälle, und der dritte ist der Grund für
 * diese Form: eine frische Datenbank hat noch keinen Betrieb und keinen
 * Benutzer — dann darf der erste Angemeldete beides anlegen. Steht dagegen
 * schon ein Betrieb da, ist ein unbekanntes Konto keine Erstinbetriebnahme
 * mehr, sondern ein Fremder vor der Tür.
 */
export type Zugang =
  | { art: 'angemeldet'; benutzer: Angemeldet }
  | { art: 'nicht-angemeldet' }
  | { art: 'erstinbetriebnahme'; authId: string; email: string }
  | { art: 'kein-zugang'; email: string }

/**
 * Der Zugangsstand, einmal je Anfrage ermittelt.
 *
 * `cache` ist hier nicht Bequemlichkeit: eine Seite mit Gerüst fragt bis zu
 * fünfmal nach dem Betrieb, und jede Frage wäre sonst eine Signaturprüfung und
 * eine Datenbankabfrage mehr.
 */
export const zugang = cache(async (): Promise<Zugang> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  const authId = typeof claims?.sub === 'string' ? claims.sub : null
  if (authId === null) return { art: 'nicht-angemeldet' }

  // Supabase führt Adressen in Kleinschrift; die Zugangsliste tut es auch.
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : ''

  const benutzer = await benutzerZuKonto(authId, email)
  if (benutzer !== null) {
    return {
      art: 'angemeldet',
      benutzer: {
        benutzerId: benutzer.id,
        email: benutzer.email,
        rolle: benutzer.rolle,
        betrieb: { id: benutzer.betrieb.id, name: benutzer.betrieb.name },
      },
    }
  }

  const betriebVorhanden = await prisma.betrieb.findFirst({ select: { id: true } })
  if (betriebVorhanden === null) return { art: 'erstinbetriebnahme', authId, email }

  return { art: 'kein-zugang', email }
})

/**
 * Sucht den Zugang zu einem Supabase-Konto.
 *
 * Zwei Wege, und die Reihenfolge ist die Sicherung: erst über die Konto-Id,
 * dann — nur beim allerersten Mal — über die E-Mail. Wird über die Adresse
 * gefunden, wird die Konto-Id sofort festgeschrieben. Ein Eintrag, der schon
 * eine andere Konto-Id trägt, wird dabei nicht übernommen: sonst käme über eine
 * neu registrierte Adresse jemand an einen fremden Zugang.
 */
async function benutzerZuKonto(authId: string, email: string) {
  const nachKonto = await prisma.benutzer.findUnique({
    where: { authId },
    include: { betrieb: { select: { id: true, name: true } } },
  })
  if (nachKonto !== null) return nachKonto

  if (email === '') return null

  const nachAdresse = await prisma.benutzer.findUnique({
    where: { email },
    include: { betrieb: { select: { id: true, name: true } } },
  })
  if (nachAdresse === null || nachAdresse.authId !== null) return null

  return await prisma.benutzer.update({
    where: { id: nachAdresse.id },
    data: { authId },
    include: { betrieb: { select: { id: true, name: true } } },
  })
}

/**
 * Der angemeldete Benutzer, oder `null`.
 *
 * Für Wege, die selbst entscheiden, was ohne Anmeldung geschehen soll — die
 * API-Routen antworten mit 401, statt eine Umleitung zu schicken, die ein
 * `fetch` aus der Warteschlange nur als seltsame Antwort sähe.
 */
export async function angemeldeterBenutzer(): Promise<Angemeldet | null> {
  const stand = await zugang()
  return stand.art === 'angemeldet' ? stand.benutzer : null
}

/**
 * Der Betrieb des Angemeldeten — für alles, was ohne ihn keinen Sinn ergibt.
 *
 * Kommt nie `null` zurück: jeder andere Fall endet in einer Umleitung, und
 * damit steht in den Seiten wieder das, was sie eigentlich tun, statt dreier
 * Zeilen Vorbehalt. Nur in Server Components und Server Actions aufrufen —
 * `redirect` wirft, und eine API-Route soll 401 antworten statt zu werfen.
 */
export async function aktuellerBetrieb(): Promise<{ id: string; name: string }> {
  const stand = await zugang()

  switch (stand.art) {
    case 'angemeldet':
      return stand.benutzer.betrieb
    case 'erstinbetriebnahme':
      redirect('/einrichtung')
    // Die Anmeldeseite sieht am Zugangsstand selbst, dass hier ein Konto ohne
    // Eintrag steht, und sagt es dort — kein Parameter nötig.
    case 'kein-zugang':
      redirect('/anmelden')
    case 'nicht-angemeldet':
      redirect('/anmelden')
  }
}

/** Der angemeldete Benutzer, oder eine Umleitung. Siehe `aktuellerBetrieb`. */
export async function pflichtBenutzer(): Promise<Angemeldet> {
  const stand = await zugang()
  if (stand.art === 'angemeldet') return stand.benutzer

  await aktuellerBetrieb()
  // Unerreichbar: `aktuellerBetrieb` leitet in jedem anderen Fall um.
  throw new Error('Kein angemeldeter Benutzer')
}

/**
 * Der angemeldete Betriebsleiter, oder eine Umleitung.
 *
 * Der Türwächter der gesperrten Bereiche: Umsatz, Auswertung, Bestellungen,
 * Stammdaten und die Preisseiten des Wareneingangs rufen ihn als erste Zeile —
 * in der Seite wie in jeder Server Action, denn eine Action ist über das Netz
 * auch ohne ihre Seite erreichbar. Ein Mitarbeiter landet auf der Startseite;
 * dort steht alles, was ihn angeht. Welche Wege offen sind, sagt
 * src/lib/berechtigungen.ts.
 *
 * Nur in Server Components und Server Actions aufrufen — `redirect` wirft.
 * API-Routen prüfen stattdessen `istBetriebsleiter` und antworten 403.
 */
export async function pflichtBetriebsleiter(): Promise<Angemeldet> {
  const benutzer = await pflichtBenutzer()
  if (!istBetriebsleiter(benutzer.rolle)) redirect('/')
  return benutzer
}
