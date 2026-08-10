/**
 * Legt einen Zugang zur App an: Konto in Supabase Auth und Eintrag in der
 * Zugangsliste (Tabelle `benutzer`).
 *
 * Es gibt bewusst keine Selbstregistrierung in der Oberfläche. Wer hier
 * arbeitet, wird eingetragen — und eingetragen wird über dieses Skript, am
 * Rechner, von jemandem, der die Schlüssel des Projekts hat. Ein Formular im
 * Netz, das sich selbst Zugang gibt, wäre die Tür neben der Tür.
 *
 * Das Passwort wird abgefragt und nicht als Argument genommen: Argumente stehen
 * in der Shell-Historie und in der Prozessliste.
 *
 * Aufruf:
 *   npm run benutzer -- anna@example.org
 *   npm run benutzer -- anna@example.org --rolle mitarbeiter
 *   npm run benutzer -- anna@example.org --betrieb "Stadthafen Recklinghausen"
 *
 * `--betrieb` wird nur gebraucht, wenn noch kein Betrieb angelegt ist; sonst
 * kommt der Zugang zu dem einen vorhandenen.
 *
 * Ein zweiter Aufruf mit derselben Adresse ist kein Fehler: das Konto wird dann
 * nicht noch einmal angelegt, sondern nur die Verknüpfung nachgezogen. Ein
 * neues Passwort wird dabei gesetzt — das ist zugleich der Weg, ein vergessenes
 * zurückzusetzen.
 */

import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'

import { PrismaPg } from '@prisma/adapter-pg'
import { createClient } from '@supabase/supabase-js'

import { PrismaClient } from '../src/generated/prisma/client'

try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local nicht vorhanden — Variablen kommen aus der Umgebung.
}

/** Bekannte Rollen. Ausgewertet wird noch keine — eingetragen schon. */
const ROLLEN = ['betriebsleiter', 'mitarbeiter']

/**
 * Der Zugang zur Admin-API: der geheime Schlüssel, keine Sitzung, kein
 * Auffrischen — das Skript läuft einmal und ist wieder weg.
 *
 * Eigene Funktion, damit `Adminclient` einen Namen hat: `createClient` trägt
 * seine Typparameter am Aufruf, und ein Parameter vom Typ
 * `ReturnType<typeof createClient>` passt deshalb nicht zum erzeugten Klienten.
 */
function adminClient(url: string, geheim: string) {
  return createClient(url, geheim, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type Adminclient = ReturnType<typeof adminClient>

function argument(name: string): string | null {
  const stelle = process.argv.indexOf(`--${name}`)
  if (stelle === -1) return null
  const wert = process.argv[stelle + 1]
  if (wert === undefined || wert.startsWith('--')) {
    throw new Error(`--${name} braucht einen Wert`)
  }
  return wert
}

/**
 * Fragt das Passwort ab, ohne es anzuzeigen.
 *
 * Node bringt dafür nichts mit: das Echo schaltet der Rohmodus des Terminals
 * ab. Läuft das Skript ohne Terminal (Pipe, CI), wird stattdessen eine Zeile
 * von der Standardeingabe gelesen — dann gibt es kein Echo, das zu verbergen
 * wäre.
 */
async function passwortAbfragen(frage: string): Promise<string> {
  if (!stdin.isTTY) {
    const leser = createInterface({ input: stdin })
    for await (const zeile of leser) {
      leser.close()
      return zeile.trim()
    }
    return ''
  }

  stdout.write(frage)
  stdin.setRawMode(true)
  stdin.resume()

  let eingabe = ''
  for await (const stueck of stdin) {
    const text = String(stueck)
    // Enter beendet, Strg-C bricht ab, Rücktaste nimmt ein Zeichen zurück.
    if (text === '\r' || text === '\n') break
    if (text === '\u0003') {
      stdin.setRawMode(false)
      stdout.write('\n')
      process.exit(130)
    }
    if (text === '\u007f' || text === '\b') {
      eingabe = eingabe.slice(0, -1)
      continue
    }
    eingabe += text
  }

  stdin.setRawMode(false)
  stdin.pause()
  stdout.write('\n')
  return eingabe
}

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase()
  if (email === '' || email.startsWith('--') || !email.includes('@')) {
    throw new Error('Aufruf: npm run benutzer -- adresse@example.org [--rolle mitarbeiter]')
  }

  const rolle = argument('rolle') ?? 'betriebsleiter'
  if (!ROLLEN.includes(rolle)) {
    throw new Error(`Unbekannte Rolle "${rolle}" — bekannt sind: ${ROLLEN.join(', ')}`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const geheim = process.env.SUPABASE_SECRET_KEY
  if (!url || !geheim) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY müssen gesetzt sein')
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL oder DATABASE_URL muss gesetzt sein')

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) })

  try {
    const betriebName = argument('betrieb')
    const vorhanden = await prisma.betrieb.findFirst({ orderBy: { angelegtAm: 'asc' } })

    if (vorhanden === null && betriebName === null) {
      throw new Error(
        'Es ist noch kein Betrieb angelegt — mit --betrieb "Name" anlegen oder zuerst npm run db:seed',
      )
    }
    const betrieb =
      vorhanden ?? (await prisma.betrieb.create({ data: { name: betriebName as string } }))

    if (vorhanden !== null && betriebName !== null && betriebName !== vorhanden.name) {
      console.warn(
        `Hinweis: --betrieb wird übergangen, es gibt bereits "${vorhanden.name}".`,
      )
    }

    const passwort = await passwortAbfragen(`Passwort für ${email}: `)
    if (passwort.length < 8) {
      throw new Error('Das Passwort braucht mindestens 8 Zeichen')
    }

    const supabase = adminClient(url, geheim)

    const konto = await kontoAnlegenOderSetzen(supabase, email, passwort)

    const benutzer = await prisma.benutzer.upsert({
      where: { email },
      create: { betriebId: betrieb.id, email, rolle, authId: konto.id },
      update: { authId: konto.id, rolle },
      include: { betrieb: { select: { name: true } } },
    })

    console.log(`Zugang eingetragen: ${benutzer.email} (${benutzer.rolle})`)
    console.log(`Betrieb:            ${benutzer.betrieb.name}`)
    console.log(`Konto:              ${konto.id}`)
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Legt das Auth-Konto an — oder setzt bei einer bekannten Adresse das Passwort.
 *
 * `email_confirm: true`, weil niemand eine Bestätigungsmail bekommen soll: die
 * Adresse hat gerade jemand eingetippt, der ohnehin die Schlüssel des Projekts
 * hat. Ein Bestätigungslink wäre nur eine Hürde ohne Gewinn.
 */
async function kontoAnlegenOderSetzen(
  supabase: Adminclient,
  email: string,
  passwort: string,
): Promise<{ id: string }> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: passwort,
    email_confirm: true,
  })

  if (error === null && data.user !== null) return { id: data.user.id }

  // Schon vorhanden: dann das bestehende Konto suchen und sein Passwort setzen.
  const schonDa = error !== null && /already been registered|already exists/i.test(error.message)
  if (!schonDa) throw error ?? new Error('Konto konnte nicht angelegt werden')

  const gefunden = await kontoSuchen(supabase, email)
  if (gefunden === null) {
    throw new Error(`Supabase meldet die Adresse als vergeben, findet sie aber nicht: ${email}`)
  }

  const gesetzt = await supabase.auth.admin.updateUserById(gefunden, { password: passwort })
  if (gesetzt.error !== null) throw gesetzt.error

  console.log('Konto war bereits vorhanden — Passwort neu gesetzt.')
  return { id: gefunden }
}

/** Sucht eine Adresse in der Benutzerliste von Supabase, Seite für Seite. */
async function kontoSuchen(
  supabase: Adminclient,
  email: string,
): Promise<string | null> {
  for (let seite = 1; seite <= 20; seite += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: seite, perPage: 200 })
    if (error !== null) throw error
    const treffer = data.users.find((konto) => konto.email?.toLowerCase() === email)
    if (treffer !== undefined) return treffer.id
    if (data.users.length < 200) return null
  }
  return null
}

main().catch((ursache) => {
  console.error(ursache instanceof Error ? ursache.message : ursache)
  process.exit(1)
})
