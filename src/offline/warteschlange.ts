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
  'artikelId' | 'anzahlGebinde' | 'anzahlEinzeln' | 'gezaehltAm'
>

/** Ob dieser Eintrag noch zum Server muss. */
export function istOffen(eintrag: Eintrag): boolean {
  return eintrag.gesendeterStand !== eintrag.stand
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
 */
export function zuSenden(eintraege: readonly Eintrag[]): Stapel {
  const offen = eintraege.filter(istOffen)
  return {
    nutzlast: offen.map(({ artikelId, anzahlGebinde, anzahlEinzeln, gezaehltAm }) => ({
      artikelId,
      anzahlGebinde,
      anzahlEinzeln,
      gezaehltAm,
    })),
    staende: new Map(offen.map((eintrag) => [eintrag.artikelId, eintrag.stand])),
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
    const stand = bestaetigt.get(eintrag.artikelId)
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
  werte: { zaehlungId: string; artikelId: string; anzahlGebinde: string; anzahlEinzeln: string },
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
 * Lokal gewinnt, wo lokal etwas liegt. Das Gerät ist die Quelle der Zählung —
 * ein Wert kommt hier an, bevor er den Server je sieht, und ein serverseitiger
 * Wert kann ihn nur überholen, wenn jemand anders zählt. Gleichzeitiges Zählen
 * durch mehrere Personen ist ausdrücklich nicht Teil dieser App.
 *
 * Der Serverstand füllt damit genau eine Lücke: das Gerät, dessen lokaler
 * Speicher weg ist (neues Handy, geleerte Website-Daten). Ohne ihn stünde eine
 * halb fertige Zählung dort wieder auf null.
 */
export function zusammenfuehren(
  lokal: readonly Eintrag[],
  vomServer: readonly Eintrag[],
): Eintrag[] {
  const zusammen = new Map(vomServer.map((eintrag) => [eintrag.artikelId, eintrag]))
  for (const eintrag of lokal) zusammen.set(eintrag.artikelId, eintrag)
  return [...zusammen.values()]
}

/**
 * Ein Wert, wie er vom Server kommt: bereits gespeichert, also nicht offen.
 * `stand` und `gesendeterStand` starten gleich, damit er nicht sofort wieder
 * in die Warteschlange gerät.
 */
export function vomServer(werte: {
  zaehlungId: string
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

/**
 * Was oben in der Maske steht. Bewusst drei Zustände und nicht mehr: der Zähler
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
 */
export function sammelStatus(eintraege: readonly Eintrag[], offline: boolean): Sammelstatus {
  const offen = eintraege.filter(istOffen).length
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
    default: {
      const unbekannt: never = status
      throw new Error(`Unbekannter Status: ${JSON.stringify(unbekannt)}`)
    }
  }
}
