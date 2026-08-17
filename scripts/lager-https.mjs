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

/**
 * Die eigene Zertifikatsstelle — sie entsteht genau einmal.
 *
 * Ihr öffentlicher Teil (lager-ca.pem) kommt auf die Geräte, ihr Schlüssel
 * verlässt diesen Ordner nie. Sie neu zu erzeugen entwertet jedes installierte
 * Profil und schickt einen durch die Geräteverwaltung jedes Telefons — deshalb
 * passiert das hier nur, wenn wirklich keine da ist.
 */
function caErzeugen() {
  mkdirSync(ORDNER, { recursive: true })
  openssl(['genrsa', '-out', 'lager-ca.key', '2048'])
  openssl([
    'req', '-x509', '-new', '-key', 'lager-ca.key',
    '-days', '1825', '-subj', '/CN=Inventur Lager CA', '-out', 'lager-ca.pem',
  ])
  console.log('Zertifikatsstelle „Inventur Lager CA" angelegt.')
  console.log('Einmal je Gerät nötig: zertifikate/lager-ca.pem installieren — Anleitung in docs/lager-https.md')
}

/**
 * Das Server-Zertifikat, signiert von der bestehenden Stelle.
 *
 * iOS verlangt SubjectAltName, serverAuth und höchstens 825 Tage Laufzeit —
 * alles drei steht hier. Weil die Stelle selbst unangetastet bleibt, gilt jedes
 * bereits installierte Profil weiter: ein Netzwechsel kostet damit keinen
 * einzigen Gang ans Telefon.
 */
function serverZertifikatErzeugen(namen, adressen) {
  const eintraege = [
    ...[...namen].map((eintrag) => `DNS:${eintrag}`),
    ...[...adressen].map((eintrag) => `IP:${eintrag}`),
  ].join(',')

  writeFileSync(
    join(ORDNER, 'erweiterungen.cnf'),
    `subjectAltName=${eintraege}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`,
  )

  openssl(['genrsa', '-out', 'lager.key', '2048'])
  openssl(['req', '-new', '-key', 'lager.key', '-subj', `/CN=${lokalerName()}`, '-out', 'lager.csr'])
  openssl([
    'x509', '-req', '-in', 'lager.csr',
    '-CA', 'lager-ca.pem', '-CAkey', 'lager-ca.key', '-CAcreateserial',
    '-days', '820', '-extfile', 'erweiterungen.cnf', '-out', 'lager.pem',
  ])
}

/**
 * Was im vorhandenen Zertifikat schon eingetragen ist.
 *
 * Gelesen wird über `-text`: das kürzere `-ext subjectAltName` kennt nur
 * OpenSSL, und auf dem Mac steht LibreSSL vor der Tür. Beide schreiben die
 * Adressen unterschiedlich („IP Address:" gegen „IP:"), deshalb zählt hier
 * jeder Eintrag, der mit IP beginnt.
 */
function eingetragen() {
  const namen = new Set()
  const adressen = new Set()
  try {
    const text = openssl(['x509', '-in', 'lager.pem', '-noout', '-text']).toString()
    const zeile = text.match(/X509v3 Subject Alternative Name:[^\n]*\n\s*([^\n]+)/)?.[1] ?? ''
    for (const teil of zeile.split(',')) {
      const [art, wert] = teil.trim().split(':')
      if (art === 'DNS') namen.add(wert)
      else if (art?.startsWith('IP')) adressen.add(wert)
    }
  } catch {
    // Ein unlesbares Zertifikat zählt wie keines — es wird gleich neu gestellt.
  }
  return { namen, adressen }
}

const caIstNeu = !existsSync(join(ORDNER, 'lager-ca.pem'))
if (caIstNeu) caErzeugen()

/**
 * Fehlt der aktuelle Name oder die aktuelle Adresse, wird nachsigniert.
 *
 * Die IP steht fest im Zertifikat, der Bonjour-Name nicht — wechselt das WLAN,
 * bricht deshalb nur der Weg über die Adresse. Am iPhone fällt das nie auf,
 * Android merkt es sofort: Chrome löst .local-Namen nicht auf und kommt gar
 * nicht erst anders herein.
 *
 * Bisherige Einträge bleiben stehen. Der Mac steht mal im Lager-WLAN und mal
 * zuhause, und beide Adressen nebeneinander kosten nichts: ohne den privaten
 * Schlüssel, der diesen Ordner nie verlässt, nützt eine fremde Adresse niemandem.
 */
const { namen, adressen } = existsSync(join(ORDNER, 'lager.pem'))
  ? eingetragen()
  : { namen: new Set(), adressen: new Set() }

const nachgetragen = []
for (const [menge, wert] of [
  [namen, 'localhost'],
  [namen, lokalerName()],
  [adressen, '127.0.0.1'],
  [adressen, lanAdresse()],
]) {
  if (wert && !menge.has(wert)) {
    menge.add(wert)
    nachgetragen.push(wert)
  }
}

if (nachgetragen.length) {
  serverZertifikatErzeugen(namen, adressen)
  if (caIstNeu) {
    console.log(`Server-Zertifikat ausgestellt für: ${nachgetragen.join(', ')}`)
  } else {
    console.log(`Server-Zertifikat neu ausgestellt, nachgetragen: ${nachgetragen.join(', ')}`)
    console.log('Die Zertifikatsstelle blieb dieselbe — installierte Profile gelten unverändert weiter.')
  }
}

const server = createServer(
  {
    key: readFileSync(join(ORDNER, 'lager.key')),
    cert: readFileSync(join(ORDNER, 'lager.pem')),
  },
  (anfrage, antwort) => {
    // Die Fragen des Browsers nach seiner eigenen Kopie fliegen raus.
    //
    // Turbopack vergibt im Dev-Betrieb gleichnamige Bündel mit wechselndem
    // Inhalt. Fragt Safari „hat sich src_098izz2._.js geändert?", antwortet der
    // Dev-Server mit 304, und das Telefon nimmt weiter seine alte Fassung —
    // auch dann, wenn im Code längst etwas anderes steht. Aus der Ferne sieht
    // das aus wie eine Reparatur, die nicht wirkt: der Rechner zeigt das Neue,
    // das Handy führt das Alte aus.
    //
    // Deshalb geht von hier aus nie eine Rückfrage nach draussen, und jede
    // Antwort trägt no-store. Kostet im WLAN nichts und erspart die Suche nach
    // Fehlern, die es nicht mehr gibt.
    const kopfzeilen = { ...anfrage.headers, 'x-forwarded-proto': 'https' }
    delete kopfzeilen['if-none-match']
    delete kopfzeilen['if-modified-since']

    const weiter = request(
      {
        host: '127.0.0.1',
        port: ZIEL_PORT,
        path: anfrage.url,
        method: anfrage.method,
        headers: kopfzeilen,
      },
      (zielAntwort) => {
        // Mitschreiben, was das Telefon wirklich holt. Der Dev-Server
        // protokolliert nur Seiten, keine Bündel — und wenn im Lager „nichts
        // geht", ist genau das die Frage: fordert das Gerät die aktuellen
        // Dateien an oder alte aus seinem Cache, die es nicht mehr gibt?
        // Ein 404 auf ein /_next/-Bündel heisst: hier lädt kein JavaScript.
        const stand = zielAntwort.statusCode ?? 502
        const marke = stand >= 400 ? '✗' : '·'
        console.log(`${marke} ${stand} ${anfrage.method} ${anfrage.url}`)

        // Ohne diese beiden behielte das Telefon seine Validatoren und fragte
        // beim nächsten Mal doch wieder nach der alten Fassung. Gelöscht, nicht
        // auf undefined gesetzt: einen leeren Kopf nimmt Node nicht an.
        const antwortkoepfe = { ...zielAntwort.headers }
        delete antwortkoepfe.etag
        delete antwortkoepfe['last-modified']
        antwortkoepfe['cache-control'] = 'no-store, must-revalidate'

        antwort.writeHead(stand, antwortkoepfe)
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

/**
 * Der zweite Kanal: WebSocket-Verbindungen durchreichen.
 *
 * Ein Proxy, der nur `request` behandelt, lässt jede Aufrüstung auf WebSocket
 * ins Leere laufen — die Anfrage kommt an, niemand antwortet, die Verbindung
 * verhungert. Der Dev-Server hält über genau diesen Weg seinen Draht zum
 * Browser (Hot Reload, Fehleranzeige). Am Rechner fällt das nie auf, weil dort
 * niemand durch diese Tür geht.
 */
server.on('upgrade', (anfrage, buchse, kopf) => {
  const weiter = request({
    host: '127.0.0.1',
    port: ZIEL_PORT,
    path: anfrage.url,
    method: anfrage.method,
    headers: anfrage.headers,
  })

  weiter.on('upgrade', (zielAntwort, zielBuchse, zielKopf) => {
    console.log(`↑ 101 ${anfrage.method} ${anfrage.url}`)

    const zeilen = Object.entries(zielAntwort.headers).map(([name, wert]) => `${name}: ${wert}`)
    buchse.write(`HTTP/1.1 101 Switching Protocols\r\n${zeilen.join('\r\n')}\r\n\r\n`)
    if (zielKopf?.length) buchse.unshift(zielKopf)

    zielBuchse.pipe(buchse)
    buchse.pipe(zielBuchse)

    // Geht eine Seite, geht die andere mit — und zwar auch dann, wenn sie sich
    // ordentlich verabschiedet hat.
    //
    // Nur auf `error` zu hören reicht nicht: Startet der Dev-Server durch (etwa
    // weil next.config.ts sich geändert hat), schliesst er seine Verbindungen
    // sauber, also über `close`. Blieb die Browser-Seite dann offen, schickte
    // das Gerät weiter Frames in eine Leitung, an deren Ende ein frisch
    // gestarteter Server sitzt, der die Sitzung nicht kennt — im Protokoll als
    // „Invalid WebSocket frame: MASK must be set". Zweimal `destroy` schadet
    // nichts, der zweite Aufruf verpufft.
    const trennen = () => {
      buchse.destroy()
      zielBuchse.destroy()
    }
    for (const ereignis of ['error', 'close', 'end']) {
      zielBuchse.on(ereignis, trennen)
      buchse.on(ereignis, trennen)
    }
  })

  weiter.on('error', () => {
    console.log(`✗ --- ${anfrage.method} ${anfrage.url} (Aufrüstung abgelehnt)`)
    buchse.destroy()
  })

  if (kopf?.length) weiter.write(kopf)
  weiter.end()
})

/**
 * Der zweite Ort, an dem die Adresse stehen muss — hier nur als Hinweis.
 *
 * Der Dev-Server gibt seine Bündel nur an Herkünfte aus `allowedDevOrigins`
 * heraus. Fehlt die aktuelle Adresse dort, lädt am Gerät die Seite und reagiert
 * auf nichts: ein Fehlerbild, das wie ein App-Fehler aussieht und keiner ist.
 *
 * Das Zertifikat zieht diese Tür selbst nach, die Konfiguration bewusst nicht.
 * Next startet bei jeder Änderung an next.config.ts den Server durch — mitten
 * in einer Zählung wäre das teurer als diese Zeilen im Protokoll.
 */
function konfigurationPruefen() {
  const adresse = lanAdresse()
  if (!adresse) return
  try {
    if (readFileSync(join(WURZEL, 'next.config.ts'), 'utf8').includes(adresse)) return
  } catch {
    return // Ohne lesbare Konfiguration gibt es nichts zu melden.
  }
  console.log('')
  console.log(`Hinweis: ${adresse} fehlt in allowedDevOrigins (next.config.ts).`)
  console.log('Über den Bonjour-Namen geht es trotzdem — ein Android-Gerät kommt aber nur über die')
  console.log('Adresse herein und sähe eine Seite, die auf nichts reagiert. Eintrag ergänzen, sobald')
  console.log('niemand mitten im Zählen ist: der Dev-Server startet dabei durch.')
  console.log('')
}

server.listen(PORT, () => {
  console.log(`HTTPS-Tür offen: https://${lokalerName()}:${PORT} → http://localhost:${ZIEL_PORT}`)
  konfigurationPruefen()
})
