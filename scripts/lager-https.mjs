/**
 * Die HTTPS-Tür fürs Lager-Handy: https://<rechnername>.local:8443 → Port 3000.
 *
 * Warum eine eigene Tür statt eines Cloud-Deployments: Die App hat noch keine
 * Anmeldung — öffentlich erreichbar wäre jede Zählung und jede Schreib-API
 * offen für alle. Im eigenen WLAN bleibt alles im Haus, und HTTPS braucht das
 * iPhone trotzdem: ohne vertrautes Zertifikat startet Safari keinen Service
 * Worker, und die App auf dem Home-Bildschirm bliebe ohne Offline-Speicher.
 *
 * Beim ersten Start entsteht unter zertifikate/ eine eigene kleine
 * Zertifikatsstelle („Inventur Lager CA“) samt Server-Zertifikat für
 * localhost, <rechnername>.local und die aktuelle WLAN-Adresse. Die Datei
 * lager-ca.pem wird einmal auf dem iPhone installiert und als vertrauenswürdig
 * markiert — die Schritte stehen in docs/lager-https.md. Das Server-Zertifikat
 * ist 820 Tage gültig (Apples Obergrenze liegt bei 825); danach den Ordner
 * zertifikate/ löschen und neu starten, dann entsteht eine frische Kette und
 * das Profil muss erneut aufs Telefon.
 *
 * Der Host-Kopf läuft unverändert durch: Next prüft bei Serveraktionen die
 * Herkunft gegen genau diesen Kopf, und ein umgeschriebener Host liesse jede
 * Aktion an der Prüfung scheitern.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:https'
import { networkInterfaces, hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORDNER = join(WURZEL, 'zertifikate')
const ZIEL_PORT = 3000
const PORT = 8443

/**
 * „MacBook-Pro-von-Tim.local“ — der Name, den das iPhone im WLAN auflöst.
 *
 * Auf dem Mac ist das der Bonjour-Name aus `scutil --get LocalHostName`, nicht
 * `os.hostname()`: Letzteres liefert den Kernel-Namen (hier schlicht „Mac“),
 * und ein Zertifikat auf den falschen Namen scheitert am Telefon still.
 */
function lokalerName() {
  if (process.platform === 'darwin') {
    try {
      return `${execFileSync('scutil', ['--get', 'LocalHostName']).toString().trim()}.local`
    } catch {
      // scutil fehlt oder verweigert — dann trägt der Kernel-Name.
    }
  }
  const name = hostname()
  return name.endsWith('.local') ? name : `${name}.local`
}

/** Die aktuelle IPv4-Adresse im WLAN — als zweiter Weg neben dem .local-Namen. */
function lanAdresse() {
  for (const eintraege of Object.values(networkInterfaces())) {
    for (const eintrag of eintraege ?? []) {
      if (eintrag.family === 'IPv4' && !eintrag.internal) return eintrag.address
    }
  }
  return null
}

function openssl(argumente, eingabe) {
  return execFileSync('openssl', argumente, { input: eingabe, cwd: ORDNER })
}

function zertifikateErzeugen() {
  mkdirSync(ORDNER, { recursive: true })
  const name = lokalerName()
  const adresse = lanAdresse()

  // Die eigene Zertifikatsstelle — ihr öffentlicher Teil (lager-ca.pem) kommt
  // aufs Telefon, ihr Schlüssel verlässt diesen Ordner nie.
  openssl(['genrsa', '-out', 'lager-ca.key', '2048'])
  openssl([
    'req', '-x509', '-new', '-key', 'lager-ca.key',
    '-days', '1825', '-subj', '/CN=Inventur Lager CA', '-out', 'lager-ca.pem',
  ])

  // Das Server-Zertifikat: iOS verlangt SubjectAltName, serverAuth und
  // höchstens 825 Tage Laufzeit — alles drei steht hier.
  const erweiterungen = [
    `subjectAltName=DNS:localhost,DNS:${name}${adresse ? `,IP:127.0.0.1,IP:${adresse}` : ',IP:127.0.0.1'}`,
    'extendedKeyUsage=serverAuth',
    'basicConstraints=CA:FALSE',
  ].join('\n')
  writeFileSync(join(ORDNER, 'erweiterungen.cnf'), erweiterungen + '\n')

  openssl(['genrsa', '-out', 'lager.key', '2048'])
  openssl(['req', '-new', '-key', 'lager.key', '-subj', `/CN=${name}`, '-out', 'lager.csr'])
  openssl([
    'x509', '-req', '-in', 'lager.csr',
    '-CA', 'lager-ca.pem', '-CAkey', 'lager-ca.key', '-CAcreateserial',
    '-days', '820', '-extfile', 'erweiterungen.cnf', '-out', 'lager.pem',
  ])

  console.log(`Zertifikate erzeugt für ${name}${adresse ? ` und ${adresse}` : ''}.`)
  console.log('Einmalig nötig: zertifikate/lager-ca.pem aufs iPhone — Anleitung in docs/lager-https.md')
}

if (!existsSync(join(ORDNER, 'lager.pem'))) zertifikateErzeugen()

const server = createServer(
  {
    key: readFileSync(join(ORDNER, 'lager.key')),
    cert: readFileSync(join(ORDNER, 'lager.pem')),
  },
  (anfrage, antwort) => {
    const weiter = request(
      {
        host: '127.0.0.1',
        port: ZIEL_PORT,
        path: anfrage.url,
        method: anfrage.method,
        headers: { ...anfrage.headers, 'x-forwarded-proto': 'https' },
      },
      (zielAntwort) => {
        antwort.writeHead(zielAntwort.statusCode ?? 502, zielAntwort.headers)
        zielAntwort.pipe(antwort)
      },
    )
    weiter.on('error', () => {
      antwort.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      antwort.end(`Der App-Server auf Port ${ZIEL_PORT} antwortet nicht — läuft er? (npm run start)`)
    })
    anfrage.pipe(weiter)
  },
)

server.listen(PORT, () => {
  console.log(`HTTPS-Tür offen: https://${lokalerName()}:${PORT} → http://localhost:${ZIEL_PORT}`)
})
