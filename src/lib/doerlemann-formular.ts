/**
 * Das Dörlemann-Bestellformular: die Brücke zwischen einer Bestellung in der App
 * und der Excel-Datei, die per Mail an die Kornbrennerei geht.
 *
 * Das Formular ist deren Vorlage, nicht unsere — die Zeilenreihenfolge, die
 * Schreibweisen ("Pülleken" statt "Puelleken") und die Gebindetexte ("0.7" statt
 * "1 x 0,7") gehören dem Lieferanten. Deshalb rät hier nichts: jede Formularzeile
 * steht mit Nummer und Wortlaut in FORMULARZEILEN, und ZUORDNUNG verbindet sie
 * ausdrücklich mit dem Artikel der App über (Name, Liefergebinde) — dieselben
 * zwei Felder, über die auch der Artikelstamm seine Eindeutigkeit hat.
 *
 * Ein Test prüft beide Tabellen gegen die eingebettete Vorlage
 * (vorlagen/doerlemann-bestellung.xlsx). Tauscht Dörlemann das Formular oder
 * verschiebt eine Zeile, fällt der Test um, statt dass Mengen still in der
 * falschen Zeile landen.
 *
 * Wein und Prosecco führt die App in Einzelflaschen, das Formular in 6er-Kartons.
 * `artikelGebindeJeFormularGebinde` trägt diesen Faktor; gerechnet wird er genau
 * hier, in `formularmengen`, mit Test — nirgendwo sonst.
 */

export const DOERLEMANN_MAIL = 'bestellung@kornbrennerei-doerlemann.de'

/** Pfad der Vorlage, relativ zur Projektwurzel. */
export const VORLAGE_DATEI = 'vorlagen/doerlemann-bestellung.xlsx'
export const VORLAGE_BLATT = 'Getränke'

/** Spalte D trägt die Bestellmenge; A2 den Kopftext "Bestelldatum: …". */
export const SPALTE_BESTELLMENGE = 4
export const ZELLE_BESTELLDATUM = 'A2'

/**
 * Erkennt, ob eine Bestellung an Dörlemann geht. Der Lieferant ist Freitext,
 * deshalb genügt der Namensteil — mit und ohne Umlaut, weil beides vorkommt.
 */
export function istDoerlemann(lieferant: string): boolean {
  const klein = lieferant.toLowerCase()
  return klein.includes('dörlemann') || klein.includes('doerlemann')
}

/** Eine Artikelzeile des Formulars, im Wortlaut der Vorlage. */
export type Formularzeile = {
  zeile: number
  name: string
  gebinde: string
}

/**
 * Verbindet einen App-Artikel mit seiner Formularzeile.
 *
 * `artikelGebindeJeFormularGebinde`: wie viele Liefergebinde der App in ein
 * Gebinde des Formulars gehen. 1 fast überall; 6 bei Wein und Prosecco, wo die
 * App Flaschen zählt und das Formular Kartons.
 */
export type Zuordnung = {
  artikelName: string
  artikelGebinde: string
  zeile: number
  artikelGebindeJeFormularGebinde: number
}

/** Eine Position der Bestellung, so wie die App sie führt. */
export type Formularposition = {
  name: string
  lieferGebindeText: string
  anzahlGebinde: number
}

/** Eine Position, die beim Übertragen auf volle Formular-Gebinde wuchs. */
export type Aufrundung = {
  name: string
  /** Bestellt in der App, in deren Liefergebinden (bei Wein: Flaschen). */
  bestellt: number
  /** Eingetragen im Formular, in dessen Gebinden (bei Wein: 6er-Kartons). */
  formularMenge: number
  formularGebinde: string
  /** Was die Formularmenge in App-Gebinden bedeutet — für den Hinweistext. */
  entspricht: number
}

export type Formularmengen = {
  /** Formularzeile → Bestellmenge, fertig umgerechnet. */
  mengen: Map<number, number>
  /** Positionen ohne Formularzeile — sie fehlen in der Datei und brauchen einen Hinweis. */
  ohneZeile: Formularposition[]
  /** Positionen, die auf volle Formular-Gebinde aufgerundet wurden. */
  aufgerundet: Aufrundung[]
}

function schluessel(name: string, gebinde: string): string {
  return `${name}|${gebinde}`
}

/**
 * Rechnet die Positionen einer Bestellung in Formularmengen um.
 *
 * Nicht zuordenbare Artikel fallen nicht still weg, sondern kommen als
 * `ohneZeile` zurück — die Maske macht daraus einen sichtbaren Hinweis.
 * Gebrochene Kartonmengen werden aufgerundet, nie ab: lieber sechs Flaschen zu
 * viel bestellt als eine Bestellung, die kleiner ist als entschieden. Auch das
 * steht als `aufgerundet` im Ergebnis, damit es niemand erst in der Excel merkt.
 */
export function formularmengen(positionen: Formularposition[]): Formularmengen {
  const zuordnung = new Map(
    ZUORDNUNG.map((eintrag) => [schluessel(eintrag.artikelName, eintrag.artikelGebinde), eintrag]),
  )
  const formularGebinde = new Map(FORMULARZEILEN.map((zeile) => [zeile.zeile, zeile.gebinde]))

  const mengen = new Map<number, number>()
  const ohneZeile: Formularposition[] = []
  const aufgerundet: Aufrundung[] = []

  for (const position of positionen) {
    if (position.anzahlGebinde <= 0) continue

    const eintrag = zuordnung.get(schluessel(position.name, position.lieferGebindeText))
    if (eintrag === undefined) {
      ohneZeile.push(position)
      continue
    }

    const faktor = eintrag.artikelGebindeJeFormularGebinde
    const menge = Math.ceil(position.anzahlGebinde / faktor)
    if (menge * faktor !== position.anzahlGebinde) {
      aufgerundet.push({
        name: position.name,
        bestellt: position.anzahlGebinde,
        formularMenge: menge,
        formularGebinde: formularGebinde.get(eintrag.zeile) ?? '',
        entspricht: menge * faktor,
      })
    }

    mengen.set(eintrag.zeile, menge)
  }

  return { mengen, ohneZeile, aufgerundet }
}

/**
 * Alle Artikelzeilen des Formulars, im Wortlaut der Vorlage (geschützte
 * Leerzeichen und doppelte Zwischenräume bereinigt). Beim Füllen wird die
 * Bestellmenge jeder dieser Zeilen erst geleert — in der Vorlage stehen noch
 * die Mengen der letzten Hand-Bestellung.
 *
 * Zeilen ohne Zuordnung (Heineken 50 L, die fremden Weine) bleiben bewusst
 * drin: geleert werden müssen sie trotzdem.
 */
export const FORMULARZEILEN: Formularzeile[] = [
  { zeile: 16, name: 'Gerolsteiner Sprudel', gebinde: '24 x 0,25' },
  { zeile: 17, name: 'Gerolsteiner Still', gebinde: '24 x 0,25' },
  { zeile: 18, name: 'Gerolsteiner Sprudel', gebinde: '12 x 0,75' },
  { zeile: 19, name: 'Gerolsteiner Still', gebinde: '12 x 0,75' },
  { zeile: 20, name: 'Salinger Mineral (Perso- und Mischwasser)', gebinde: '12 x 0,75' },
  { zeile: 21, name: 'Salinger still', gebinde: '12 x 0,75' },
  { zeile: 23, name: 'Coca Cola', gebinde: '12 x 1,0' },
  { zeile: 24, name: 'Coke Zero', gebinde: '12 x 1,0' },
  { zeile: 25, name: 'Fanta', gebinde: '12 x 1,0' },
  { zeile: 26, name: 'Sprite', gebinde: '12 x 1,0' },
  { zeile: 27, name: 'Coca Cola', gebinde: '24 x 0,33' },
  { zeile: 28, name: 'Coke Zero', gebinde: '24 x 0,33' },
  { zeile: 29, name: 'Fanta', gebinde: '24 x 0,33' },
  { zeile: 30, name: 'Sprite', gebinde: '24 x 0,33' },
  { zeile: 35, name: 'Veltins Fassbrause Zitrone', gebinde: '24 x 0,33' },
  { zeile: 36, name: 'Veltins Fassbrause Holunder', gebinde: '24 x 0,33' },
  { zeile: 37, name: 'Veltins Fassbrause Maracuja', gebinde: '24 x 0,33' },
  { zeile: 38, name: 'Veltins Fassbrause Cola Orange', gebinde: '24 x 0,33' },
  { zeile: 39, name: 'Veltins Fassbrause Eistee Pfirsich', gebinde: '24 x 0,33' },
  { zeile: 40, name: 'Veltins Fassbrause Pink Grapefruit', gebinde: '24 x 0,33' },
  { zeile: 42, name: 'Granini Limo Grapefruit-Cranberry 0,33l', gebinde: '24 x 0,33' },
  { zeile: 43, name: 'Granini Limo Orange-Lemongras', gebinde: '24 x 0,33' },
  { zeile: 44, name: 'Granini Limo Zitrone-Limette', gebinde: '24 x 0,33' },
  { zeile: 45, name: 'Granini Schorle Kirsche', gebinde: '24 x 0,33' },
  { zeile: 46, name: 'Granini Schorle Maracuja', gebinde: '24 x 0,33' },
  { zeile: 47, name: 'Granini Schorle Rhabarber', gebinde: '24 x 0,33' },
  { zeile: 48, name: 'Granini Schorle Apfel', gebinde: '24 x 0,33' },
  { zeile: 49, name: 'Granini Saft Orange', gebinde: '6 x 1,0' },
  { zeile: 50, name: 'Granini Saft Apfel', gebinde: '6 x 1,0' },
  { zeile: 51, name: 'Granini Saft Maracuja', gebinde: '6 x 1,0' },
  { zeile: 52, name: 'Granini Saft Kirsche', gebinde: '6 x 1,0' },
  { zeile: 53, name: 'Granini Saft Mai Tai', gebinde: '6 x 1,0' },
  { zeile: 54, name: 'Granini Saft Mojito', gebinde: '6 x 1,0' },
  { zeile: 55, name: 'Granini Saft Pina Colada', gebinde: '6 x 1,0' },
  { zeile: 56, name: 'Granini Saft Sex on the beach', gebinde: '6 x 1,0' },
  { zeile: 57, name: 'Granini Saft Porn Star', gebinde: '6 x 1,0' },
  { zeile: 60, name: 'Schweppes Bitter Lemon', gebinde: '6 x 1,0' },
  { zeile: 61, name: 'Schweppes Ginger Ale', gebinde: '6 x 1,0' },
  { zeile: 62, name: 'Schweppes Tonic Water', gebinde: '6 x 1,0' },
  { zeile: 63, name: 'Schweppes Wild Berry', gebinde: '6 x 1,0' },
  { zeile: 64, name: 'Schweppes White Peach', gebinde: '6 x 1,0' },
  { zeile: 66, name: 'Redbull', gebinde: '24 x 0,25' },
  { zeile: 67, name: 'Redbull Zero', gebinde: '24 x 0,25' },
  { zeile: 68, name: 'Redbull Edition', gebinde: '24 x 0,25' },
  { zeile: 72, name: 'Heineken', gebinde: '30 L' },
  { zeile: 73, name: 'Heineken', gebinde: '50 L' },
  { zeile: 74, name: 'Veltins', gebinde: '10 L' },
  { zeile: 75, name: 'Veltins', gebinde: '30 L' },
  { zeile: 76, name: 'Veltins', gebinde: '50 L' },
  { zeile: 80, name: 'Desperados', gebinde: '24 x 0,33' },
  { zeile: 81, name: 'Heineken', gebinde: '24 x 0,33' },
  { zeile: 82, name: 'Pülleken', gebinde: '24 x 0,33' },
  { zeile: 83, name: 'Zitrönken von Pülleken', gebinde: '24 x 0,33' },
  { zeile: 84, name: 'Veltins Design Steini', gebinde: '20 x 0,33' },
  { zeile: 85, name: 'Veltins Helles Lager', gebinde: '24 x 0,275' },
  { zeile: 86, name: 'Veltins Radler', gebinde: '24 x 0,33' },
  { zeile: 87, name: 'Veltins 0,00%', gebinde: '24 x 0,33' },
  { zeile: 88, name: 'Veltins Radler 0,00%', gebinde: '24 x 0,33' },
  { zeile: 89, name: 'Maisels', gebinde: '20 x 0,5' },
  { zeile: 90, name: 'Maisels 0,00%', gebinde: '20 x 0,5' },
  { zeile: 94, name: 'Aperol', gebinde: '1,0 L' },
  { zeile: 95, name: 'Lillet Blanc', gebinde: '0,7 L' },
  { zeile: 96, name: 'Sarti Spritz', gebinde: '0,7 L' },
  { zeile: 97, name: 'Campari', gebinde: '1,0 L' },
  { zeile: 98, name: 'Limoncello Scavi & Ray', gebinde: '0,7 L' },
  { zeile: 99, name: 'Espresso Martini Premix 42below Tails', gebinde: '1,0 L' },
  { zeile: 103, name: 'Dockside Vodka', gebinde: '0.7' },
  { zeile: 104, name: 'Dockside Vodka', gebinde: '0.5' },
  { zeile: 105, name: 'Dünenbrand Rum', gebinde: '0.5' },
  { zeile: 106, name: 'Sudmare Gin', gebinde: '0.7' },
  { zeile: 107, name: 'Ramazzotti', gebinde: '1' },
  { zeile: 108, name: 'Williamsbirne Dörlemann?', gebinde: '0.7' },
  { zeile: 109, name: 'Pfeffi Dörlemann', gebinde: '0.7' },
  { zeile: 110, name: 'Choco Praline Dörlemann', gebinde: '0.7' },
  { zeile: 114, name: 'Bon Voyage Rotwein', gebinde: '6 x 0,75' },
  { zeile: 115, name: 'Strandperle Grauburgunder', gebinde: '6 x 0,75' },
  { zeile: 116, name: 'Flamingo Rosé', gebinde: '6 x 0,75' },
  { zeile: 117, name: 'Lergenmüller Grauburgunder', gebinde: '6 x 0,75' },
  { zeile: 118, name: 'Lergenmüller Rosé Saigner', gebinde: '6 x 0,75' },
  { zeile: 119, name: 'Leonardo Prosecco (zum mischen)', gebinde: '6 x 0,75' },
  { zeile: 120, name: 'Moet', gebinde: '0.75' },
  { zeile: 121, name: 'Moet Rosé', gebinde: '0.75' },
  { zeile: 122, name: 'Moet Ice', gebinde: '0.75' },
]

/**
 * App-Artikel → Formularzeile, Artikel benannt wie im Artikelstamm
 * (dort ohne Umlaute: "Puelleken", "Williamsbirne Doerlemann").
 *
 * Formularzeilen ohne App-Artikel tauchen hier nicht auf: Heineken 50 L führt
 * die App nicht, die Weine Bon Voyage, Strandperle und Flamingo Rosé auch
 * nicht. Ihre Zeilen bleiben beim Übertragen leer.
 */
export const ZUORDNUNG: Zuordnung[] = [
  { artikelName: 'Gerolsteiner Sprudel', artikelGebinde: '24 x 0,25', zeile: 16, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Gerolsteiner Still', artikelGebinde: '24 x 0,25', zeile: 17, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Gerolsteiner Sprudel', artikelGebinde: '12 x 0,75', zeile: 18, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Gerolsteiner Still', artikelGebinde: '12 x 0,75', zeile: 19, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Salinger Mineral (Perso- und Mischwasser)', artikelGebinde: '12 x 0,75', zeile: 20, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Salinger Still', artikelGebinde: '12 x 0,75', zeile: 21, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Coca Cola', artikelGebinde: '12 x 1,0', zeile: 23, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Coke Zero', artikelGebinde: '12 x 1,0', zeile: 24, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Fanta', artikelGebinde: '12 x 1,0', zeile: 25, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Sprite', artikelGebinde: '12 x 1,0', zeile: 26, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Coca Cola', artikelGebinde: '24 x 0,33', zeile: 27, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Coke Zero', artikelGebinde: '24 x 0,33', zeile: 28, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Fanta', artikelGebinde: '24 x 0,33', zeile: 29, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Sprite', artikelGebinde: '24 x 0,33', zeile: 30, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Fassbrause Zitrone', artikelGebinde: '24 x 0,33', zeile: 35, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Fassbrause Holunder', artikelGebinde: '24 x 0,33', zeile: 36, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Fassbrause Maracuja', artikelGebinde: '24 x 0,33', zeile: 37, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Fassbrause Cola Orange', artikelGebinde: '24 x 0,33', zeile: 38, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Fassbrause Eistee Pfirsich', artikelGebinde: '24 x 0,33', zeile: 39, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Fassbrause Pink Grapefruit', artikelGebinde: '24 x 0,33', zeile: 40, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Limo Grapefruit-Cranberry', artikelGebinde: '24 x 0,33', zeile: 42, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Limo Orange-Lemongras', artikelGebinde: '24 x 0,33', zeile: 43, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Limo Zitrone-Limette', artikelGebinde: '24 x 0,33', zeile: 44, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Schorle Kirsche', artikelGebinde: '24 x 0,33', zeile: 45, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Schorle Maracuja', artikelGebinde: '24 x 0,33', zeile: 46, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Schorle Rhabarber', artikelGebinde: '24 x 0,33', zeile: 47, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Schorle Apfel', artikelGebinde: '24 x 0,33', zeile: 48, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Orange', artikelGebinde: '6 x 1,0', zeile: 49, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Apfel', artikelGebinde: '6 x 1,0', zeile: 50, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Maracuja', artikelGebinde: '6 x 1,0', zeile: 51, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Kirsche', artikelGebinde: '6 x 1,0', zeile: 52, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Mai Tai', artikelGebinde: '6 x 1,0', zeile: 53, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Mojito', artikelGebinde: '6 x 1,0', zeile: 54, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Pina Colada', artikelGebinde: '6 x 1,0', zeile: 55, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Sex on the beach', artikelGebinde: '6 x 1,0', zeile: 56, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Granini Saft Porn Star', artikelGebinde: '6 x 1,0', zeile: 57, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Schweppes Bitter Lemon', artikelGebinde: '6 x 1,0', zeile: 60, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Schweppes Ginger Ale', artikelGebinde: '6 x 1,0', zeile: 61, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Schweppes Tonic Water', artikelGebinde: '6 x 1,0', zeile: 62, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Schweppes Wild Berry', artikelGebinde: '6 x 1,0', zeile: 63, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Schweppes White Peach', artikelGebinde: '6 x 1,0', zeile: 64, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Redbull', artikelGebinde: '24 x 0,25', zeile: 66, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Redbull Zero', artikelGebinde: '24 x 0,25', zeile: 67, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Redbull Edition', artikelGebinde: '24 x 0,25', zeile: 68, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Heineken', artikelGebinde: '1 x 30,0', zeile: 72, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins', artikelGebinde: '1 x 10,0', zeile: 74, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins', artikelGebinde: '1 x 30,0', zeile: 75, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins', artikelGebinde: '1 x 50,0', zeile: 76, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Desperados', artikelGebinde: '24 x 0,33', zeile: 80, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Heineken', artikelGebinde: '24 x 0,33', zeile: 81, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Puelleken', artikelGebinde: '24 x 0,33', zeile: 82, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Zitroenken von Puelleken', artikelGebinde: '24 x 0,33', zeile: 83, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Design Steini', artikelGebinde: '20 x 0,33', zeile: 84, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Helles Lager', artikelGebinde: '24 x 0,275', zeile: 85, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Radler', artikelGebinde: '24 x 0,33', zeile: 86, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins 0,00%', artikelGebinde: '24 x 0,33', zeile: 87, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Veltins Radler 0,00%', artikelGebinde: '24 x 0,33', zeile: 88, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Maisels', artikelGebinde: '20 x 0,5', zeile: 89, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Maisels 0,00%', artikelGebinde: '20 x 0,5', zeile: 90, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Aperol', artikelGebinde: '1 x 1,0', zeile: 94, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Lillet Blanc', artikelGebinde: '1 x 0,7', zeile: 95, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Sarti Spritz', artikelGebinde: '1 x 0,7', zeile: 96, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Campari', artikelGebinde: '1 x 1,0', zeile: 97, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Limoncello Scavi & Ray', artikelGebinde: '1 x 0,7', zeile: 98, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Espresso Martini Premix 42below Tails', artikelGebinde: '1 x 1,0', zeile: 99, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Dockside Vodka', artikelGebinde: '1 x 0,7', zeile: 103, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Dockside Vodka', artikelGebinde: '1 x 0,5', zeile: 104, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Duenenbrand Rum', artikelGebinde: '1 x 0,5', zeile: 105, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Sudmare Gin', artikelGebinde: '1 x 0,7', zeile: 106, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Ramazzotti', artikelGebinde: '1 x 1,0', zeile: 107, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Williamsbirne Doerlemann', artikelGebinde: '1 x 0,7', zeile: 108, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Pfeffi Doerlemann', artikelGebinde: '1 x 0,7', zeile: 109, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Choco Praline Doerlemann', artikelGebinde: '1 x 0,7', zeile: 110, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Lergenmueller Grauburgunder', artikelGebinde: '1 x 0,75', zeile: 117, artikelGebindeJeFormularGebinde: 6 },
  { artikelName: 'Lergenmueller Rose Saigner', artikelGebinde: '1 x 0,75', zeile: 118, artikelGebindeJeFormularGebinde: 6 },
  { artikelName: 'Leonardo Prosecco (zum mischen)', artikelGebinde: '1 x 0,75', zeile: 119, artikelGebindeJeFormularGebinde: 6 },
  { artikelName: 'Moet ( Braun )', artikelGebinde: '1 x 0,75', zeile: 120, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Moet Rose', artikelGebinde: '1 x 0,75', zeile: 121, artikelGebindeJeFormularGebinde: 1 },
  { artikelName: 'Moet Ice', artikelGebinde: '1 x 0,75', zeile: 122, artikelGebindeJeFormularGebinde: 1 },
]
