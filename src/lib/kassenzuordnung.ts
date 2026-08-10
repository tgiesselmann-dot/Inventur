/**
 * Vorschläge, welcher Lagerartikel hinter einer Kassenbezeichnung steckt.
 *
 * Der Kassenexport nennt "Gerolst. Sprudel 0,25l", der Artikelstamm
 * "Gerolsteiner Sprudel" im Gebinde "24 x 0,25". Beides von Hand über
 * fünfzehnhundert Zeilen zusammenzusuchen ist eine Nachmittagsarbeit, die
 * niemand zweimal macht — also sucht diese Datei die Kandidaten heraus.
 *
 * Sie schlägt vor und entscheidet nicht. Der Vorschlag wird in der Maske
 * bestätigt, und `Kassenartikel.bestaetigt` sagt danach, dass ein Mensch
 * hingesehen hat. Eine automatisch gesetzte Zuordnung wäre von einer geprüften
 * nicht mehr zu unterscheiden, und ein falsch geratener Artikel erzeugt genau
 * den Schwund, den die Auswertung erklären soll.
 *
 * Reine Funktionen: keine Datenbank, kein Zustand.
 */

import { Decimal } from '@prisma/client/runtime/client'

import { anteilJeAusschank } from '@/lib/einheiten'

/** Die Felder eines Artikels, die für den Vorschlag gebraucht werden. */
export type Zuordnungskandidat = {
  id: string
  name: string
  kategorie: string
  lieferGebindeText: string
  /**
   * Inhalt einer Einheit in Litern. Wird hier nur verglichen und — für den
   * Ausschank — an `anteilJeAusschank` weitergereicht; gerechnet wird in dieser
   * Datei nicht damit.
   */
  einheitsgroesseLiter: Decimal | number | string
}

export type Zuordnungsvorschlag = {
  artikelId: string
  /** Vorgeschlagene Menge je Verkauf, als Text fürs Formular. */
  einheitenProVerkauf: string
  /** Von 0 bis 1. Ab 0,5 wird der Vorschlag angezeigt. */
  guete: number
  /** Warum dieser Artikel — steht in der Maske neben dem Vorschlag. */
  begruendung: string
  /** Name und Gebinde einzeln, weil die Maske sie verschieden gross setzt. */
  artikelName: string
  gebindeText: string
  /** Wie die vorgeschlagene Menge zustande kommt: "0,2 l aus 1 l ausgeschenkt". */
  herleitung: string
  /**
   * Was an diesem Vorschlag nicht stimmen könnte, oder `null`.
   *
   * Der teuerste Fehler dieses Bildschirms ist eine Zuordnung auf die falsche
   * Gebindegrösse: „Veltins 0,3" auf die 0,33er-Flasche ergibt 0,909 Einheiten
   * je Verkauf — eine Zahl, die plausibel aussieht und den halben Jahresschwund
   * erklärt. Wer sie einmal bestätigt hat, sucht danach monatelang am falschen
   * Ende. Deshalb sagt der Vorschlag selbst, wo er wackelt.
   */
  warnung: string | null
}

/** Ab hier lohnt es sich, den Vorschlag überhaupt zu zeigen. */
const SCHWELLE = 0.5

/**
 * Ab welchem Anteil einer Einheit ein „Ausschank" keiner mehr ist.
 *
 * Vier Fünftel: ein 0,4-l-Glas aus der Literflasche bleibt ein Ausschank, ein
 * 0,3-l-Glas aus der 0,33er-Flasche ist in Wahrheit die Flasche selbst oder das
 * Fass daneben.
 */
const FAST_GANZ = 0.8

/** Wörter, die in beiden Welten vorkommen und nichts unterscheiden. */
const FUELLWOERTER = new Set([
  'fl',
  'flasche',
  'fass',
  'glas',
  'im',
  'haus',
  'der',
  'die',
  'das',
  'mit',
  'und',
  'von',
  'a',
])

/**
 * Kleinschrift ohne Umlaute und Satzzeichen. Die Kasse schreibt "Pülleken", der
 * Stamm auch — aber "Zitrönken von Pülleken" und "Zitroenken" sollen sich
 * trotzdem finden, und der Punkt in "Gerolst." darf nicht am Wort kleben.
 */
function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Liest die Ausschank- oder Flaschengrösse aus einem Text, in Litern.
 *
 * Die Kasse schreibt sie auf drei Arten: "0,33l" und "0,4" als Liter, "2cl" und
 * "4cl" als Zentiliter. `null`, wenn keine drinsteht — dann sagt der Text nichts
 * über die Grösse, und geraten wird hier nichts.
 */
export function leseGroesseLiter(text: string): Decimal | null {
  const zentiliter = /(\d+(?:[.,]\d+)?)\s*cl\b/i.exec(text)
  if (zentiliter !== null) {
    return new Decimal(zentiliter[1].replace(',', '.')).div(100)
  }

  // Nur Kommazahlen: eine blosse "4" in "4 Nuggets" ist keine Literangabe, und
  // das nachgestellte l ist bei "Veltins 0,4" nicht immer da.
  const liter = /(\d+[.,]\d+)\s*l?\b/i.exec(text)
  if (liter !== null) {
    return new Decimal(liter[1].replace(',', '.'))
  }
  return null
}

/** Wörter eines Namens, ohne Füllwörter und ohne Grössenangaben. */
function woerter(text: string): string[] {
  return normalisiere(text)
    .split(' ')
    .filter((wort) => wort !== '' && !FUELLWOERTER.has(wort))
    // Zahlen fliegen raus: die Grösse wird eigens verglichen, und "24" aus dem
    // Gebindetext hat mit "0,33" aus der Kasse nichts zu tun.
    .filter((wort) => !/^\d+$/.test(wort))
}

/**
 * Ob zwei Wörter dasselbe meinen. Neben der Gleichheit zählt der abgekürzte
 * Anfang: die Kasse kürzt Namen auf Bonbreite, "gerolst" steht für
 * "gerolsteiner". Vier Zeichen als Untergrenze, damit nicht jedes "co" auf
 * "coca" und "cola" zugleich passt.
 */
function passt(a: string, b: string): boolean {
  if (a === b) return true
  const kurz = a.length < b.length ? a : b
  const lang = a.length < b.length ? b : a
  return kurz.length >= 4 && lang.startsWith(kurz)
}

/** Anteil übereinstimmender Wörter, von 0 bis 1. */
function wortaehnlichkeit(ausKasse: readonly string[], ausStamm: readonly string[]): number {
  if (ausKasse.length === 0 || ausStamm.length === 0) return 0

  const offen = [...ausStamm]
  let treffer = 0
  for (const wort of ausKasse) {
    const index = offen.findIndex((kandidat) => passt(wort, kandidat))
    if (index !== -1) {
      treffer++
      offen.splice(index, 1)
    }
  }
  // Über beide Seiten gemittelt: sonst gewänne ein Artikel mit einem einzigen,
  // sehr allgemeinen Wort ("Cola") gegen den, der wirklich gemeint ist.
  return (2 * treffer) / (ausKasse.length + ausStamm.length)
}

/**
 * Vorschläge für eine Kassenbezeichnung, beste zuerst.
 *
 * Zwei Dinge fliessen ein: die Namensähnlichkeit und die Grösse. Passt die
 * Grösse aus der Kasse zur Einheit des Artikels, ist ein Verkauf eine Einheit —
 * "Gerolst. Sprudel 0,25l" gegen die 0,25er Flasche. Ist die Kassengrösse
 * kleiner, wird ausgeschenkt, und der Vorschlag ist der Anteil: ein 0,3-l-Glas
 * aus der Literflasche sind 0,3 Einheiten.
 *
 * Ohne Grössenangabe in der Kasse bleibt es bei einer Einheit je Verkauf. Das
 * ist der häufigste Fall und der, den ein Mensch am schnellsten prüft.
 */
export function schlageZuordnungVor(
  posBezeichnung: string,
  kandidaten: readonly Zuordnungskandidat[],
  grenze = 3,
): Zuordnungsvorschlag[] {
  const ausKasse = woerter(posBezeichnung)
  const kassengroesse = leseGroesseLiter(posBezeichnung)

  const bewertet = kandidaten.map((artikel) => {
    const namensguete = wortaehnlichkeit(ausKasse, woerter(artikel.name))
    const artikelgroesse = new Decimal(artikel.einheitsgroesseLiter)

    let einheitenProVerkauf = new Decimal(1)
    let groessenbonus = 0
    let groessentext = 'Menge je Verkauf geschätzt'
    let warnung: string | null = null

    if (kassengroesse !== null && artikelgroesse.greaterThan(0)) {
      if (kassengroesse.equals(artikelgroesse)) {
        groessenbonus = 0.25
        groessentext = `Grösse passt (${alsLiter(artikelgroesse)})`
      } else if (kassengroesse.lessThan(artikelgroesse)) {
        einheitenProVerkauf = anteilJeAusschank(artikel, kassengroesse)
        groessenbonus = 0.1
        groessentext = `${alsLiter(kassengroesse)} aus ${alsLiter(artikelgroesse)} ausgeschenkt`

        // Ein Ausschank, der fast die ganze Einheit leert, ist meistens keiner:
        // "Veltins 0,3" gegen die 0,33er-Flasche ergibt 0,909 statt der 0,01,
        // die das 30-l-Fass gäbe. Beides sieht im Feld gleich harmlos aus, und
        // nur eines davon stimmt.
        if (kassengroesse.div(artikelgroesse).greaterThanOrEqualTo(FAST_GANZ)) {
          warnung =
            `${alsLiter(kassengroesse)} aus einer Einheit von ${alsLiter(artikelgroesse)} —` +
            ' das leert fast das ganze Gebinde. Wird hier wirklich ausgeschenkt,' +
            ' oder ist es dieselbe Sorte in einer anderen Gebindegrösse?'
        }
      } else {
        // Die Kasse verkauft mehr, als in eine Einheit passt — dann ist es ein
        // anderer Artikel und nicht dieser in gross.
        groessenbonus = -0.3
        groessentext = `Kasse bucht ${alsLiter(kassengroesse)}, die Einheit hat nur ${alsLiter(artikelgroesse)}`
        warnung =
          `Die Kasse bucht ${alsLiter(kassengroesse)}, in eine Einheit passen nur` +
          ` ${alsLiter(artikelgroesse)}. Das ist vermutlich ein anderes Gebinde.`
      }
    }

    return {
      artikelId: artikel.id,
      einheitenProVerkauf: einheitenProVerkauf.toString(),
      guete: Math.max(0, Math.min(1, namensguete + groessenbonus)),
      begruendung: `${artikel.name} · ${artikel.lieferGebindeText} — ${groessentext}`,
      artikelName: artikel.name,
      gebindeText: artikel.lieferGebindeText,
      herleitung: groessentext,
      warnung,
    }
  })

  return bewertet
    .filter((vorschlag) => vorschlag.guete >= SCHWELLE)
    .sort((a, b) => b.guete - a.guete || a.begruendung.localeCompare(b.begruendung, 'de'))
    .slice(0, grenze)
}

/** 0.25 -> "0,25 l". Reiner Anzeigetext für die Begründung. */
function alsLiter(wert: Decimal): string {
  return `${wert.toString().replace('.', ',')} l`
}
