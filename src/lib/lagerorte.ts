/**
 * Die Regeln der Lagerorte — was ein gültiger Name ist, und wann ein Ort
 * stillgelegt oder gelöscht werden darf.
 *
 * Ohne Datenbank und ohne React, damit die Fälle prüfbar sind, an denen ein
 * Betrieb hängenbleibt: der letzte Ort, der verschwindet und die Zählung
 * unmöglich macht, und der Ort mit Zählwerten, der gelöscht statt stillgelegt
 * wird und die Bestände von Wochen mitnimmt.
 *
 * Ein Lagerort sagt, wo gezählt wurde. Er ist kein eigener Bestand: der Bestand
 * eines Artikels ist die Summe über seine Orte. Deshalb steht hier auch nichts
 * über Mengen — gerechnet wird in src/lib/einheiten.ts, hier wird nur über
 * Namen und Zulässigkeit entschieden.
 */

/** Ein Ort, so wie die Verwaltung ihn braucht. */
export type Lagerortzeile = {
  id: string
  name: string
  aktiv: boolean
  /** Wie viele Zählwerte an diesem Ort hängen — über alle Zählungen. */
  positionen: number
}

/**
 * Der längste Name, der in der Ortswahl noch ganz auf ein Telefon passt.
 * „blauer Container" sind 16 Zeichen; darüber hinaus bleibt Luft für Namen wie
 * „Kühlcontainer hinten", aber nicht für einen Satz.
 */
export const NAME_MAXLAENGE = 40

export type Namensfehler = 'leer' | 'zu-lang' | 'doppelt'

/**
 * Prüft einen eingetippten Namen gegen die schon vorhandenen.
 *
 * Gibt den bereinigten Namen zurück oder den Grund, warum es keiner ist. Der
 * Vergleich läuft ohne Rücksicht auf Gross- und Kleinschreibung und über
 * zusammengefasste Leerzeichen: „blauer Container" und „Blauer  Container"
 * wären zwei Zeilen in der Ortswahl, die im Lager niemand auseinanderhält.
 *
 * Die Schreibweise selbst bleibt dagegen so, wie sie eingetippt wurde — wer
 * sein Lager klein schreibt, soll es klein geschrieben wiederfinden.
 */
export function nameGeprueft(
  roh: string,
  vorhanden: readonly { id: string; name: string }[],
  /** Beim Umbenennen der eigene Datensatz — er darf sich nicht selbst blockieren. */
  eigeneId?: string,
): { art: 'gueltig'; name: string } | { art: 'fehler'; grund: Namensfehler } {
  const name = roh.trim().replace(/\s+/g, ' ')
  if (name === '') return { art: 'fehler', grund: 'leer' }
  if (name.length > NAME_MAXLAENGE) return { art: 'fehler', grund: 'zu-lang' }

  const vergleichbar = name.toLocaleLowerCase('de-DE')
  const kollision = vorhanden.some(
    (ort) => ort.id !== eigeneId && ort.name.toLocaleLowerCase('de-DE') === vergleichbar,
  )
  if (kollision) return { art: 'fehler', grund: 'doppelt' }

  return { art: 'gueltig', name }
}

/** Die Meldung zu einem Namensfehler, wie sie über dem Formular steht. */
export function namensfehlerText(grund: Namensfehler): string {
  switch (grund) {
    case 'leer':
      return 'Ohne Namen gibt es kein Lager — Leerzeichen zählen nicht als Eingabe.'
    case 'zu-lang':
      return `Der Name ist länger als ${NAME_MAXLAENGE} Zeichen und passt so in keine Ortswahl.`
    case 'doppelt':
      return 'Ein Lager mit diesem Namen gibt es bereits. Zwei gleiche Namen wären beim Zählen nicht zu unterscheiden.'
    default: {
      const unbekannt: never = grund
      throw new Error(`Unbekannter Grund: ${String(unbekannt)}`)
    }
  }
}

/**
 * Ob dieser Ort stillgelegt werden darf.
 *
 * Der letzte aktive nicht: ohne einen Ort liesse sich kein Wert mehr erfassen,
 * und die Maske stünde vor einer leeren Auswahl. Ein Betrieb, der seine Lager
 * neu ordnet, legt erst das neue an und dann das alte still.
 *
 * Zählwerte hindern nicht. Ein aufgegebenes Lager wird stillgelegt, und seine
 * alten Zeilen bleiben genau deshalb erhalten — sie gehören zu Zählungen, die
 * stattgefunden haben.
 */
export function darfStillgelegtWerden(
  orte: readonly Lagerortzeile[],
  id: string,
): { art: 'ja' } | { art: 'nein'; grund: string } {
  const ort = orte.find((eintrag) => eintrag.id === id)
  if (ort === undefined) return { art: 'nein', grund: 'Dieses Lager gibt es nicht.' }
  if (!ort.aktiv) return { art: 'ja' }

  const weitereAktive = orte.filter((eintrag) => eintrag.aktiv && eintrag.id !== id)
  if (weitereAktive.length === 0) {
    return {
      art: 'nein',
      grund:
        'Das ist das letzte Lager. Ohne mindestens eines lässt sich nichts mehr zählen — legen Sie erst das neue an.',
    }
  }
  return { art: 'ja' }
}

/**
 * Ob dieser Ort gelöscht werden darf — und nicht nur stillgelegt.
 *
 * Nur solange nie an ihm gezählt wurde. Das ist der Ausweg aus dem Vertipper
 * beim Anlegen, mehr nicht: sobald ein einziger Zählwert daran hängt, ist der
 * Ort Teil der Geschichte des Betriebs und wird stillgelegt, nie entfernt.
 * Dieselbe Linie wie beim Artikelstamm.
 */
export function darfGeloeschtWerden(ort: Lagerortzeile): boolean {
  return ort.positionen === 0
}

/**
 * Die Unterzeile eines Ortes in der Verwaltung.
 *
 * Trägt den Zustand als Wort, nicht nur als Farbe — ein stillgelegtes Lager
 * unterscheidet sich sonst allein durch einen Punkt, den niemand vorliest.
 */
export function zustandstext(ort: Lagerortzeile): string {
  const gezaehlt =
    ort.positionen === 0
      ? 'noch nie gezählt'
      : ort.positionen === 1
        ? '1 Zählwert'
        : `${ort.positionen} Zählwerte`
  return ort.aktiv ? gezaehlt : `Stillgelegt · ${gezaehlt}`
}

// ---------------------------------------------------------------------------
// Der Stand eines Ortes innerhalb einer laufenden Zählung
// ---------------------------------------------------------------------------

/** Wie weit ein Ort in dieser Zählung ist — die Zeile der Ortswahl. */
export type Ortsstand = {
  lagerortId: string
  name: string
  /** Werte, die in dieser Zählung an diesem Ort schon stehen. */
  erfasst: number
  /**
   * Wie viele Artikel hier erwartet werden — aus der letzten abgeschlossenen
   * Zählung. `null` beim ersten Mal: dann gibt es keine Erfahrung, und eine
   * Zahl zu nennen hiesse, sich eine auszudenken.
   */
  erwartet: number | null
  fertigAm: Date | null
  /** Wer fertig gemeldet hat. `null`, solange niemand es tat. */
  fertigVon: string | null
  /** Wer hier zuerst einen Wert erfasst hat. `null`, solange keiner steht. */
  begonnenVon: string | null
}

/**
 * Die Unterzeile eines Ortes in der Ortswahl.
 *
 * Ein fertig gemeldeter Ort sagt das zuerst — danach ist die Zahl nur noch
 * Beiwerk. Ein unberührter Ort bekommt einen Gedankenstrich und keine 0: „hier
 * war noch niemand" ist etwas anderes als „hier ist nichts".
 */
export function ortsstandText(stand: Ortsstand): string {
  if (stand.fertigAm !== null) {
    const uhrzeit = stand.fertigAm.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return stand.fertigVon === null
      ? `Fertig · ${uhrzeit}`
      : `Fertig · ${uhrzeit} · ${stand.fertigVon}`
  }

  if (stand.erfasst === 0) return '—'

  const teil =
    stand.erwartet === null
      ? `${stand.erfasst} erfasst`
      : `${stand.erfasst} von ${stand.erwartet} erfasst`
  return stand.begonnenVon === null ? teil : `${teil} · ${stand.begonnenVon}`
}

/**
 * Ob dieser Ort gerade von jemand anderem gezählt wird.
 *
 * Grundlage der Warnung in der Ortswahl — und ausdrücklich keiner Sperre. Zu
 * zweit zu zählen ist der Normalfall; dass zwei im selben Lager landen, ist der
 * Fehlgriff, den ein Satz verhindert und eine Sperre nur verlagert (auf das
 * Gerät mit leerem Akku, dessen Ort dann niemand mehr fertig bekommt).
 */
export function wirdBearbeitetVon(stand: Ortsstand, ichBin: string | null): string | null {
  if (stand.fertigAm !== null) return null
  if (stand.begonnenVon === null) return null
  if (ichBin !== null && stand.begonnenVon === ichBin) return null
  return stand.begonnenVon
}

/**
 * Ob die Zählung abgeschlossen werden darf — alle aktiven Orte fertig gemeldet.
 *
 * Hart und ohne Ausweg: ein Lager, das niemand angefasst hat, sieht in der
 * Schwundrechnung genau so aus wie eines, aus dem die Ware verschwunden ist.
 * Diese beiden Fälle auseinanderzuhalten ist der Zweck der ganzen App.
 */
export function offeneOrte(staende: readonly Ortsstand[]): Ortsstand[] {
  return staende.filter((stand) => stand.fertigAm === null)
}
