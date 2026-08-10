/**
 * Was die Zuordnungsmaske über den blossen Vorschlag hinaus zum Zeigen braucht:
 * den Zustand einer Zeile und den Satz, der sagt, was sie vom Bestand abzieht.
 *
 * Getrennt von src/lib/kassenzuordnung.ts, weil dort die Suche nach dem
 * passenden Artikel steht. Hier wird nichts gesucht — hier wird die Wirkung
 * einer bereits getroffenen Entscheidung ausgesprochen.
 *
 * Beides gehört nach src/lib und nicht ins JSX, und dieser Bildschirm ist der
 * Grund dafür: „Einheiten je Verkauf" ist die fehleranfälligste Zahl der App.
 * Steht dort 0,6 statt 0,06, geht der Bestand rechnerisch auf und der Schwund
 * wandert still in die Auswertung. Ein Faktor lässt sich nicht prüfen, ein
 * Ergebnis schon — deshalb steht neben jedem Feld, was es tatsächlich abzieht,
 * und dieser Satz wird an genau einer Stelle gebildet.
 *
 * Reine Funktionen: keine Datenbank, kein Zustand.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { Gebindeart, Zaehlmodus } from '@/generated/prisma/enums'
import {
  anteilAusMengenangabe,
  einheitenAusVerkauf,
  type Ausschankeinheit,
  type Menge,
} from '@/lib/einheiten'
import { dezimaltext, gebindeEinzahl, gebindeMenge } from '@/lib/zaehlung'

/**
 * Wie eine Zeile dasteht.
 *
 *  - `offen`      — kein Artikel zugeordnet. Fällt auf, denn diese Zeile fehlt
 *                   in jedem Sollbestand.
 *  - `vorschlag`  — ein Artikel steht da, aber niemand hat ihn bestätigt. Sieht
 *                   sichtbar anders aus als eine geprüfte Zeile: er kommt aus
 *                   Namensähnlichkeit und ist eine Vermutung, keine Tatsache.
 *  - `bestaetigt` — ein Mensch hat hingesehen. Ruhig, ohne Farbe.
 *  - `ausgenommen` — bestätigt, dass diese Bezeichnung kein Getränkelager
 *                   berührt: Küche, Gutscheine, Sonderwünsche.
 */
export type Zeilenzustand = 'offen' | 'vorschlag' | 'bestaetigt' | 'ausgenommen'

/**
 * Der Zustand einer Zeile — abgeleitet, nie gespeichert.
 *
 * Aus zwei Angaben, die beide in der Datenbank stehen: ob bestätigt wurde und
 * ob ein Artikel dranhängt. Ein eigenes Statusfeld gäbe es einen zweiten Ort,
 * an dem der Zustand steht, und irgendwann widersprächen sich beide.
 *
 * `artikelInDerZeile` zählt, was gerade dasteht — auch das, was erst im
 * Formular gewählt und noch nicht gespeichert ist. Genau daran hängt der
 * Unterschied zwischen `offen` und `vorschlag`.
 */
export function zeilenzustand(stand: {
  bestaetigt: boolean
  artikelInDerZeile: number
}): Zeilenzustand {
  if (stand.bestaetigt) return stand.artikelInDerZeile > 0 ? 'bestaetigt' : 'ausgenommen'
  return stand.artikelInDerZeile > 0 ? 'vorschlag' : 'offen'
}

/**
 * Die Felder eines Artikels, die für die Auswirkung gebraucht werden.
 *
 * Der Zählmodus und nicht die Gebindeart: wie ein Artikel geliefert wird, sagt
 * nichts darüber, worin sein Bestand gezählt wird. Wein kommt im Karton und
 * steht als Flaschen im Regal. Die Einheitsgrösse kommt dazu, weil die Menge
 * je Verkauf in cl oder l angegeben wird und erst über sie zum Anteil wird.
 */
export type Auswirkungsartikel = {
  name: string
  zaehlmodus: Zaehlmodus
  einheitsgroesseLiter: Menge
}

/**
 * Die Menge je Verkauf, wie sie im Formular steht: eine getippte Zahl und die
 * gewählte Einheit. Der Wert bleibt Text — auch "4," und "abc" müssen durch
 * diese Funktionen laufen können, ohne zu werfen.
 */
export type Mengeneingabe = { wert: string; einheit: Ausschankeinheit }

/** Was eine Zeile vom Bestand abzieht — in Worten, nicht als Faktor. */
export type Auswirkung = {
  /** "120 Verkäufe × 0,06" */
  rechnung: string
  /** "= 7,2 Flaschen Sudmare Gin" */
  ergebnis: string
  /** Dieselbe Aussage als ein Satz, für die aufgeklappte Zeile. */
  satz: string
  /** false heisst: diese Zeile zieht nichts ab. Kein Artikel oder keine Zahl. */
  wirksam: boolean
}

/**
 * Worin der Bestand dieses Artikels gezählt wird — "Flasche", "Fass".
 *
 * Nur der Fassartikel zählt in Gebinden; bei allen anderen Zählmodi ist die
 * Einheit die einzelne Flasche, auch wenn sie im Kasten geliefert wird. Das ist
 * keine Vereinfachung, sondern die Rechnung aus src/lib/einheiten.ts: ein voller
 * Kasten sind dort vierundzwanzig Einheiten, und `einheitenProVerkauf` bezieht
 * sich auf genau diese Einheit.
 *
 * Die Wörter kommen aus src/lib/zaehlung.ts. Eine zweite Liste derselben vier
 * Wörter liefe irgendwann auseinander.
 *
 * Exportiert, weil die Rezepturansicht (src/lib/rezeptur.ts) dieselbe Einheit
 * benennt — eine zweite Fass-oder-Flasche-Weiche wäre dieselbe Entscheidung
 * an zwei Stellen.
 */
export function zaehleinheit(artikel: Auswirkungsartikel): Gebindeart {
  return artikel.zaehlmodus === Zaehlmodus.FASS ? Gebindeart.FASS : Gebindeart.EINZELFLASCHE
}

/** "Fass", "Flasche" — die Einheit im Feld neben der Zahl. */
export function einheitswort(artikel: Auswirkungsartikel): string {
  return gebindeEinzahl(zaehleinheit(artikel))
}

/**
 * Der Einheiten-Anteil, den eine Formulareingabe bedeutet — oder `null`, wenn
 * daraus keiner wird: kein Artikel, keine brauchbare Zahl, oder eine Menge, die
 * nach der Rundung auf drei Nachkommastellen nichts mehr abzieht.
 *
 * Die Umrechnung selbst steht in src/lib/einheiten.ts
 * (`anteilAusMengenangabe`); hier wird nur die Eingabe gelesen. Genau dieser
 * Wert gehört ins Formularfeld `einheitenProVerkauf` — die Maske schreibt ihn
 * als verborgenes Feld mit, damit die Serveraktion denselben Anteil speichert,
 * den die Auswirkung daneben ausspricht.
 */
export function faktorAusEingabe(
  artikel: { einheitsgroesseLiter: Menge } | null,
  eingabe: Mengeneingabe,
): Decimal | null {
  if (artikel === null) return null
  const wert = alsWert(eingabe.wert)
  if (wert === null) return null
  try {
    const anteil = anteilAusMengenangabe(artikel, wert, eingabe.einheit)
    // 1 cl vom 50-l-Fass rundet auf 0,000 — ein Anteil, der nichts abzieht,
    // ist keine Antwort und würde von der Serveraktion ohnehin abgewiesen.
    return anteil.isZero() ? null : anteil
  } catch {
    // Ein Artikel ohne brauchbare Einheitsgrösse kann cl und l nicht umrechnen.
    return null
  }
}

/**
 * Was `anzahl` Kassenbuchungen dieser Bezeichnung vom Bestand nehmen.
 *
 * Gerechnet wird über `faktorAusEingabe` und `einheitenAusVerkauf` — die
 * Umrechnungen stehen in src/lib/einheiten.ts und nirgendwo sonst. Diese Datei
 * setzt nur den Satz darum herum: die Rechnung nennt die Eingabe, wie sie
 * getippt wurde ("120 Verkäufe × 4 cl"), das Ergebnis den Abzug in der
 * Zähleinheit des Artikels ("= 7,2 Flaschen Sudmare Gin").
 *
 * Das Ergebnis ist auf zwei Nachkommastellen gekürzt: es ist eine Aussage zum
 * Prüfen und keine Zahl zum Weiterrechnen. Wer damit weiterrechnet, nimmt
 * `einheitenAusVerkauf`.
 *
 * `artikel === null` oder ein leeres Feld ergeben eine unwirksame Auswirkung mit
 * Gedankenstrich — nie eine Null. Eine Null hiesse, dass nichts abgeht; hier ist
 * die Frage schlicht noch nicht beantwortet.
 */
export function auswirkung(
  artikel: Auswirkungsartikel | null,
  verkaeufe: Menge,
  eingabe: Mengeneingabe,
): Auswirkung {
  const anzahl = alsVerkaeufe(verkaeufe)
  const faktor = faktorAusEingabe(artikel, eingabe)

  if (artikel === null || faktor === null) {
    return {
      rechnung: `${anzahl} × —`,
      ergebnis: 'wirken auf keinen Bestand',
      satz: `${anzahl} ohne Wirkung auf den Bestand`,
      wirksam: false,
    }
  }

  const einheiten = einheitenAusVerkauf({ einheitenProVerkauf: faktor }, verkaeufe)
  const menge = gebindeMenge(gekuerzt(einheiten), zaehleinheit(artikel))
  const angabe = eingabetext(artikel, eingabe)

  return {
    rechnung: `${anzahl} × ${angabe}`,
    ergebnis: `= ${menge} ${artikel.name}`,
    satz: `${anzahl} × ${angabe} = ${menge} ${artikel.name}`,
    wirksam: true,
  }
}

/**
 * Die Eingabe als Wortgruppe der Rechnung: "4 cl", "0,3 l", "1 Flasche".
 * Bei ganzen Einheiten entscheidet der Zählmodus über das Wort — dieselbe
 * Weiche wie überall (`zaehleinheit`).
 */
function eingabetext(artikel: Auswirkungsartikel, eingabe: Mengeneingabe): string {
  const wert = eingabe.wert.trim().replace('.', ',')
  if (eingabe.einheit === 'einheit') {
    return gebindeMenge(wert, zaehleinheit(artikel))
  }
  return `${wert} ${eingabe.einheit}`
}

/**
 * Der Zähler über der Liste und der Balken daneben.
 *
 * Offen heisst hier: noch nicht bestätigt — ein übernommener Vorschlag zählt
 * mit. Er ist geraten, bis jemand ihn geprüft hat, und ein Zähler, der ihn schon
 * abzieht, verspricht eine Sicherheit, die es nicht gibt.
 */
export function zaehler(
  offen: number,
  gesamt: number,
): { text: string; bestaetigtText: string; prozent: number } {
  const bestaetigt = Math.max(0, gesamt - offen)
  return {
    text: `${offen} von ${gesamt} offen`,
    bestaetigtText: `${bestaetigt} bestätigt`,
    // Ohne Bezeichnungen gibt es keinen Fortschritt, den man zeigen könnte. Ein
    // voller Balken über einer leeren Liste behauptete eine erledigte Arbeit.
    prozent: gesamt === 0 ? 0 : Math.round((bestaetigt / gesamt) * 100),
  }
}

/**
 * Güte eines Vorschlags als Text neben der Marke: 0,96 -> "96 %".
 *
 * Bei 99 % ist Schluss, auch wenn Name und Grösse vollständig passen. Der Wert
 * misst die Ähnlichkeit zweier Texte und nicht die Wahrheit: „Coca Cola 0,33l"
 * trifft den Namen des Artikels „Coca Cola" zu hundert Prozent und kann trotzdem
 * das falsche Gebinde meinen. Eine Hundert daneben läse sich als Gewissheit, und
 * genau die darf dieser Bildschirm nirgends behaupten.
 */
export function guetetext(guete: number): string {
  return `${Math.min(99, Math.round(guete * 100))} %`
}

/** "1 Verkauf", "120 Verkäufe". */
function alsVerkaeufe(menge: Menge): string {
  const zahl = new Decimal(menge)
  const text = gekuerzt(zahl).replace('.', ',')
  return `${text} ${zahl.equals(1) ? 'Verkauf' : 'Verkäufe'}`
}

/**
 * Das Formularfeld als Zahl, oder `null`, wenn dort nichts Brauchbares steht.
 *
 * Eine Null ist ausdrücklich keine gültige Menge: „null je Verkauf" wäre ein
 * Artikel, der sich beim Verkaufen nicht verbraucht — den gibt es nicht, und
 * die Serveraktion weist ihn ohnehin ab.
 */
function alsWert(eingabe: string): Decimal | null {
  if (eingabe.trim() === '') return null
  try {
    const zahl = new Decimal(dezimaltext(eingabe.trim()))
    if (!zahl.isFinite() || zahl.lessThanOrEqualTo(0)) return null
    return zahl
  } catch {
    return null
  }
}

/** Zwei Nachkommastellen, ohne nachlaufende Nullen: 7.20 -> "7.2", 342 -> "342". */
function gekuerzt(wert: Decimal): string {
  return wert.toDecimalPlaces(2).toString()
}
