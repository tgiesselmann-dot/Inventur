/**
 * Welche Zählwerte noch zum Server müssen, und was nach einem Versand als
 * erledigt gelten darf.
 *
 * Reine Funktionen, kein IndexedDB und kein fetch — das steckt in db.ts und im
 * Treiber. Der Grund für die Trennung ist der eine Fall, der offline wirklich
 * weh tut: der Zähler ändert einen Wert, während genau dieser Wert gerade
 * gesendet wird. Markiert man danach stumpf "alles gesendet", verliert die App
 * die Korrektur — sie steht lokal richtig da und kommt nie beim Server an.
 *
 * Deshalb trägt jeder Eintrag einen `stand`, der bei jeder lokalen Änderung um
 * eins steigt, und einen `gesendeterStand`. Erledigt ist ein Eintrag nur, wenn
 * beide gleich sind. Wird während des Versands getippt, steigt `stand`, der
 * zurückkommende `gesendeterStand` ist dann veraltet, und der Eintrag bleibt
 * von allein in der Warteschlange.
 */

/** Ein Zählwert, wie er lokal liegt. */
export type Eintrag = {
  zaehlungId: string
  /** An welchem Ort dieser Wert gezählt wurde. */
  lagerortId: string
  artikelId: string
  /** Dezimaltext mit Punkt, wie ihn die API erwartet. */
  anzahlGebinde: string
  anzahlEinzeln: string
  /** Zeitpunkt der Zählung, vom Gerät gesetzt — nicht der Zeitpunkt des Versands. */
  gezaehltAm: string
  /** Steigt bei jeder lokalen Änderung um eins. */
  stand: number
  /** Der zuletzt bestätigte Stand. null heisst: noch nie angekommen. */
  gesendeterStand: number | null
}

/** Ein Eintrag, so wie er über die Leitung geht. */
export type Nutzlast = Pick<
  Eintrag,
  'lagerortId' | 'artikelId' | 'anzahlGebinde' | 'anzahlEinzeln' | 'gezaehltAm'
>

/**
 * Der Schlüssel eines Eintrags innerhalb einer Zählung.
 *
 * Ort und Artikel zusammen, nicht der Artikel allein: derselbe Artikel steht an
 * der Theke und im Kühlcontainer und ist dort zweimal etwas anderes. Auf den
 * Artikel allein gekeyt löschte die Theke den Kühlcontainer aus der
 * Warteschlange — der Wert stünde lokal richtig da und käme nie beim Server an.
 */
export function schluessel(eintrag: Pick<Eintrag, 'lagerortId' | 'artikelId'>): string {
  return `${eintrag.lagerortId}:${eintrag.artikelId}`
}

/** Ob dieser Eintrag noch zum Server muss. */
export function istOffen(eintrag: Eintrag): boolean {
  return eintrag.gesendeterStand !== eintrag.stand
}

/** Wie viele Einträge noch zum Server müssen. */
export function anzahlOffen(eintraege: readonly Eintrag[]): number {
  return eintraege.filter(istOffen).length
}

/**
 * Die offenen Einträge, je Lagerort gezählt.
 *
 * Für die Sperre vor dem Abschluss: die Ortswahl soll nicht nur sagen, *dass*
 * noch Werte auf dem Gerät liegen, sondern aus welchem Lager sie stammen —
 * dorthin muss, wer sie loswerden will, denn gesendet wird nur aus der offenen
 * Zählmaske.
 */
export function offeneJeOrt(eintraege: readonly Eintrag[]): Map<string, number> {
  const je = new Map<string, number>()
  for (const eintrag of eintraege) {
    if (istOffen(eintrag)) je.set(eintrag.lagerortId, (je.get(eintrag.lagerortId) ?? 0) + 1)
  }
  return je
}

export type Stapel = {
  /** Was gesendet wird. */
  nutzlast: Nutzlast[]
  /** Der Stand, den jeder Eintrag beim Absenden hatte. */
  staende: Map<string, number>
}

/**
 * Stellt die offenen Einträge zu einem Versand zusammen.
 *
 * Alles in einem Stapel, nicht ein Aufruf je Artikel: nach einem Abend im
 * Flugmodus liegen bis zu 99 Werte an, und 99 einzelne Anfragen über eine
 * gerade wiedergefundene Mobilverbindung sind 99 Gelegenheiten zu scheitern.
 *
 * Der Stapel nimmt alle Orte der Zählung mit, nicht nur den gerade offenen.
 * Wer im Funkloch die Theke zählt und dann in den Kühlcontainer geht, hätte
 * sonst Werte auf dem Gerät, die erst wieder losgingen, wenn er zufällig an die
 * Theke zurückkehrt.
 */
export function zuSenden(eintraege: readonly Eintrag[]): Stapel {
  const offen = eintraege.filter(istOffen)
  return {
    nutzlast: offen.map(
      ({ lagerortId, artikelId, anzahlGebinde, anzahlEinzeln, gezaehltAm }) => ({
        lagerortId,
        artikelId,
        anzahlGebinde,
        anzahlEinzeln,
        gezaehltAm,
      }),
    ),
    staende: new Map(offen.map((eintrag) => [schluessel(eintrag), eintrag.stand])),
  }
}

/**
 * Schreibt nach einem erfolgreichen Versand die bestätigten Stände zurück.
 *
 * Ein Eintrag, der sich während des Versands geändert hat, trägt inzwischen
 * einen höheren `stand` als der bestätigte — er bleibt offen und geht beim
 * nächsten Lauf mit. Genau dafür ist die Zahl da.
 */
export function nachVersand(
  eintraege: readonly Eintrag[],
  bestaetigt: ReadonlyMap<string, number>,
): Eintrag[] {
  return eintraege.map((eintrag) => {
    const stand = bestaetigt.get(schluessel(eintrag))
    if (stand === undefined) return eintrag
    // Nie einen höheren Stand bestätigen als den, der wirklich gesendet wurde.
    return { ...eintrag, gesendeterStand: Math.max(eintrag.gesendeterStand ?? -1, stand) }
  })
}

/**
 * Der Eintrag nach einer Änderung durch den Zähler. `stand` steigt, damit der
 * Wert erneut in die Warteschlange gerät, auch wenn er schon einmal ankam.
 */
export function geaendert(
  vorher: Eintrag | undefined,
  werte: {
    zaehlungId: string
    lagerortId: string
    artikelId: string
    anzahlGebinde: string
    anzahlEinzeln: string
  },
  jetzt: Date,
): Eintrag {
  return {
    ...werte,
    gezaehltAm: jetzt.toISOString(),
    stand: (vorher?.stand ?? 0) + 1,
    gesendeterStand: vorher?.gesendeterStand ?? null,
  }
}

/**
 * Führt die lokal liegenden Einträge mit dem Stand zusammen, den der Server
 * beim Laden der Seite mitgeschickt hat.
 *
 * Lokal gewinnt, wo lokal etwas liegt — je Ort und Artikel, nicht je Artikel.
 * Das Gerät ist die Quelle dessen, was es selbst gezählt hat: ein Wert kommt
 * hier an, bevor er den Server je sieht.
 *
 * Zu zweit zu zählen ist ausdrücklich vorgesehen, und der Ort ist die Trennung,
 * die es trägt. Wer an der Theke steht, fasst die Zeilen des Kühlcontainers nie
 * an; für diese Zeilen liegt lokal nichts, und der Serverstand des anderen
 * Geräts kommt unverändert durch. Auch nach einer Stunde ohne Netz können sich
 * zwei Zähler so nicht überschreiben, solange jeder in seinem Lager bleibt.
 *
 * Öffnen zwei Geräte denselben Ort, gewinnt weiterhin, wer zuletzt sendet. Das
 * ist ein bewusster Rest: davor warnt die Ortsliste, sperren tut sie nicht — im
 * Lager ist ein ausgesperrter Zähler schlimmer als ein doppelt gezähltes Fach.
 *
 * Der Serverstand füllt ausserdem die Lücke des Geräts, dessen lokaler Speicher
 * weg ist (neues Handy, geleerte Website-Daten). Ohne ihn stünde eine halb
 * fertige Zählung dort wieder auf null.
 */
export function zusammenfuehren(
  lokal: readonly Eintrag[],
  vomServer: readonly Eintrag[],
): Eintrag[] {
  const zusammen = new Map(vomServer.map((eintrag) => [schluessel(eintrag), eintrag]))
  for (const eintrag of lokal) zusammen.set(schluessel(eintrag), eintrag)
  return [...zusammen.values()]
}

/**
 * Ein Wert, wie er vom Server kommt: bereits gespeichert, also nicht offen.
 * `stand` und `gesendeterStand` starten gleich, damit er nicht sofort wieder
 * in die Warteschlange gerät.
 */
export function vomServer(werte: {
  zaehlungId: string
  lagerortId: string
  artikelId: string
  anzahlGebinde: string
  anzahlEinzeln: string
  gezaehltAm: string
}): Eintrag {
  return { ...werte, stand: 0, gesendeterStand: 0 }
}

export type Sammelstatus =
  | { art: 'gespeichert' }
  | { art: 'sendet'; offen: number }
  | { art: 'wartet'; offen: number }
  | { art: 'abgelehnt'; offen: number }
  | { art: 'abgemeldet'; offen: number }
  /**
   * Der Browserspeicher steht nicht zur Verfügung — die Zählung läuft, aber
   * ohne Netz ist jeder Wert nur so lange da, wie die Seite offen bleibt.
   */
  | { art: 'ungesichert'; offen: number }

/**
 * Warum ein Stapel liegenblieb.
 *
 * `abgemeldet` ist die abgelaufene Sitzung (401) und deshalb ein eigener Fall:
 * „Erneut versuchen" hilft dagegen nichts, und wer das nicht liest, tippt
 * dreimal darauf, während die Werte im Gerät liegen. Alles andere ist eine
 * Ablehnung, die der Zähler nicht selbst beheben kann.
 */
export type Ablehnungsgrund = 'abgelehnt' | 'abgemeldet' | null

/**
 * Was oben in der Maske steht. Bewusst vier Zustände und nicht mehr: der Zähler
 * im Lager will wissen, ob er das Handy weglegen darf, nicht wie die
 * Warteschlange aufgebaut ist.
 *
 * "Gespeichert" heisst hier serverseitig gespeichert. Lokal ist ohnehin alles
 * geschrieben, bevor diese Anzeige sich überhaupt ändert — das ist keine
 * Nachricht wert.
 *
 * Ob gerade eine Anfrage unterwegs ist, geht in diese Anzeige nicht ein. Ein
 * offener Wert bei vorhandenem Netz ist immer nur Sekunden vom Server entfernt;
 * ihn in dieser Zeit als "wartet auf Netz" auszuweisen, wäre eine falsche
 * Nachricht über einen Zustand, den der Zähler nicht beheben kann.
 *
 * "Abgelehnt" schlägt "wartet": eine Ablehnung ist eine Antwort des Servers,
 * kein Netzproblem — noch ein Funkloch dazu ändert nichts daran, dass diese
 * Werte von allein nicht mehr ankommen.
 *
 * "Ungesichert" steht dazwischen: es nennt kein liegengebliebenes Paket,
 * sondern eine fehlende Rückversicherung — ohne Browserspeicher überlebt kein
 * Wert das Schliessen der Seite. Eine Ablehnung nennt trotzdem weiterhin sie
 * selbst, weil dort eine Handlung dranhängt ("Erneut", "Anmelden") und hier
 * keine. Gegenüber "gespeichert" gewinnt es dagegen auch dann, wenn nichts
 * aussteht: der grüne Punkt hiesse sonst "leg das Handy ruhig weg", und das
 * stimmt in diesem Zustand nur, solange die Seite offen bleibt.
 */
export function sammelStatus(
  eintraege: readonly Eintrag[],
  offline: boolean,
  grund: Ablehnungsgrund = null,
  ohneSpeicher = false,
): Sammelstatus {
  const offen = anzahlOffen(eintraege)
  if (offen > 0 && grund !== null) return { art: grund, offen }
  if (ohneSpeicher) return { art: 'ungesichert', offen }
  if (offen === 0) return { art: 'gespeichert' }
  return offline ? { art: 'wartet', offen } : { art: 'sendet', offen }
}

/** Die Anzeige als Text. */
export function statusText(status: Sammelstatus): string {
  switch (status.art) {
    case 'gespeichert':
      return 'Gespeichert'
    case 'sendet':
      return 'Wird gespeichert …'
    case 'wartet':
      return status.offen === 1 ? '1 Wert wartet auf Netz' : `${status.offen} Werte warten auf Netz`
    case 'abgelehnt':
      return status.offen === 1
        ? 'Übertragung fehlgeschlagen · 1 Wert offen'
        : `Übertragung fehlgeschlagen · ${status.offen} Werte offen`
    // Kein „fehlgeschlagen": nichts ist kaputt, die Sitzung ist abgelaufen. Der
    // Satz nennt die Handlung, die hilft — und sagt zugleich, dass die Werte im
    // Gerät liegen und nicht weg sind.
    case 'abgemeldet':
      return status.offen === 1
        ? 'Anmeldung abgelaufen · 1 Wert liegt im Gerät'
        : `Anmeldung abgelaufen · ${status.offen} Werte liegen im Gerät`
    // Zwei Sätze für einen Zustand, weil der Rat sich unterscheidet: steht
    // nichts aus, ist alles beim Server und die Seite darf zu. Steht etwas aus,
    // hängt es allein am Bildschirm — dann ist "nicht schliessen" die Nachricht.
    case 'ungesichert':
      return status.offen === 0
        ? 'Ohne Gerätespeicher · gespeichert'
        : status.offen === 1
          ? 'Ohne Gerätespeicher · 1 Wert nur im Bildschirm'
          : `Ohne Gerätespeicher · ${status.offen} Werte nur im Bildschirm`
    default: {
      const unbekannt: never = status
      throw new Error(`Unbekannter Status: ${JSON.stringify(unbekannt)}`)
    }
  }
}
