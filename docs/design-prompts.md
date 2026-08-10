# Prompts für Claude Design — Inventur-App

Sammlung fertiger Prompts für [claude.ai/design](https://claude.ai/design). Jeder
Prompt steht in einem eigenen Codeblock und ist so geschrieben, dass er ohne
weitere Erklärung eingefügt werden kann.

**Reihenfolge:** Prompt 0 zuerst laufen lassen — er legt Tokens und
Grundkomponenten an. Alle weiteren Prompts bauen darauf auf und dürfen einzeln
und in beliebiger Reihenfolge genutzt werden. Wer nur einen einzelnen Screen
braucht, stellt den Kurzkontext aus Prompt 0 (Abschnitt „Kontext in einem
Absatz") voran.

**Stand des Codes (07.08.2026):** Jeder Prompt sagt in einem Merksatz, ob er
Gebautes verfeinert oder Neues entwirft. Der Unterschied ist wichtig — bei
Gebautem muss sich der Entwurf auf vorhandene Zustände abbilden lassen.

| | Prompts |
|---|---|
| **Gebaut, zu verfeinern** | 2–3 (Zählung), 8, 8a, 8b, 8e (Wareneingang), 11 (Bestellung) |
| **Noch nicht gebaut** | 1, 4–7, 8c, 8d, 9, 10, 12 |

Startseite ist weiterhin das Next.js-Template; `artikel`, `umsatz` und
`auswertung` sind leere Stubs.

**Wareneingang:** Der Dreiwege-Abgleich Bestellung ↔ Lieferschein ↔ tatsächlich
gelieferte Ware läuft (Prompts 8a, 8b, 8e). Das Datenmodell trägt darüber hinaus
Leergut, Preisabweichung, Ersatzartikel, Nachlieferung und Belege — die
Oberfläche dazu entwirft Prompt 8c, die Reklamations-Nachverfolgung Prompt 8d.
Siehe „Was das Datenmodell dafür braucht" am Ende des Dokuments.

---

## Prompt 0 — Design-Grundlage und Komponenten

```text
Du entwirfst das Design-System für eine Getränke-Inventur-App des Stadthafen
Recklinghausen — eine Gastronomie am Kanal mit Bar, Terrasse und Lager. Die App
löst eine Excel-Tabelle ab.

Kontext in einem Absatz:
Ein Mitarbeiter geht mit dem eigenen iPhone durch ein kühles, schlecht
ausgeleuchtetes Getränkelager und zählt 99 Artikel in fester Reihenfolge —
dem Laufweg an den Regalen entlang. Eine Hand hält das Telefon, die andere
öffnet Kisten und dreht Fässer. Das Mobilfunknetz bricht im Lager weg. Nach
der Zählung sitzt dieselbe Person oder die Betriebsleitung am Laptop und
wertet aus: Sollbestand aus Kassenumsatz und Lieferungen gegen den gezählten
Ist-Bestand, daraus Schwund und Bestandswert.

Gestalte eine Design-Grundlage, keine fertigen Screens:

1. Farben. Neutralachse Zinc, hell und dunkel gleichwertig — Dark Mode ist im
   Lager der Normalfall, nicht die Ausnahme. Vier semantische Rollen:
   - Primär (Aktion, aktives Feld): kräftiges Blau, Richtung Tailwind sky-600
   - Bestätigung (Zählung abschliessen): Grün, Richtung emerald-600
   - Achtung (Wert liegt noch offline auf dem Gerät, Artikel fehlt beim
     Abschluss): Bernstein, Richtung amber-500
   - Warnung/Fehlbestand (negativer Schwund, nicht bewertbar): Rot
   Alle Paare müssen in beiden Modi mindestens WCAG AA erfüllen — geprüft mit
   Handschuhen, bei Neonlicht und bei Sonne auf der Terrasse.

2. Typografie. Geist Sans für Text, Geist Mono nirgends ausser für IDs.
   Sämtliche Zahlen — Mengen, Beträge, Datumsangaben, Zähler — in
   Tabellenziffern (tabular-nums), damit Spalten nicht springen. Definiere eine
   eigene Stufe „Zählwert": sehr grosse, halbfette Ziffern, die aus 60 cm
   Abstand lesbar sind.

3. Berührflächen. Kleinste Fläche 56 px Höhe, überall, ausnahmslos — auch in
   Listenzeilen und Tabellen. Abstand zwischen zwei auslösenden Flächen
   mindestens 8 px. Kein Hover-only-Zustand: Alles muss per Tipp erreichbar
   sein. Deutliche Rückmeldung beim Tippen (kurzes Zusammenziehen der Fläche).

4. Grundkomponenten, jeweils in Ruhe / gedrückt / gesperrt / fokussiert:
   - Schaltfläche primär, sekundär, ganze Breite
   - Listenzeile mit Titel, Unterzeile, rechtsbündigem Zahlenwert und einem
     Statuspunkt ganz rechts
   - Wertfeld: grosse Zahl über kleiner Beschriftung, umrandet, im aktiven
     Zustand farbig hervorgehoben; leerer Wert ist ein Gedankenstrich, nie 0
   - Abschnittsüberschrift, die beim Scrollen oben klebt
   - Hinweisleiste über volle Breite in den Rollen Achtung und Warnung
   - Statuszeile für die Offline-Synchronisation
   - Leerzustand und Ladezustand

5. Bildschirmaufbau mobil: fester Kopf, scrollender Rumpf, fester Fuss. Der
   Fuss respektiert die Home-Indikator-Zone des iPhones. Alle auslösenden
   Elemente liegen im unteren Drittel des Bildschirms — das ist die zentrale
   Zusage dieser App und darf in keinem Entwurf gebrochen werden.

Technische Bindung: Tailwind CSS v4, React 19, Next.js App Router. Gib Farben
als CSS-Variablen aus, die sich auf Tailwind-Utilities abbilden lassen.

Sprache der Oberfläche ist durchgehend Deutsch. Konvention des Projekts: statt
ß wird ss geschrieben („abschliessen", „Gebindegrösse", „gross"). Umlaute
bleiben Umlaute.

Keine Illustrationen, keine Maskottchen, keine Farbverläufe. Das ist ein
Werkzeug, kein Marketing.
```

---

## Prompt 1 — Startseite: der Tag im Betrieb

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf die Startseite der Inventur-App für iPhone (390 × 844) und daneben die
Desktop-Fassung (1280 breit). Sie ersetzt eine Platzhalterseite und ist der
erste Bildschirm nach dem Anmelden.

Die Seite beantwortet drei Fragen in dieser Rangfolge:
1. Muss ich jetzt zählen? — grosse primäre Fläche „Zählung beginnen"; läuft
   heute schon eine offene Zählung, heisst sie stattdessen „Zählung
   fortsetzen — 47 von 99 gezählt" mit Fortschrittsbalken.
2. Was ist offen? — kurze Liste: „Umsatzdaten seit 3 Tagen nicht importiert",
   „2 Kassenbezeichnungen ohne Zuordnung", „Lieferung vom 04.08. ohne
   Positionen". Jede Zeile führt an die zuständige Stelle.
3. Wie stand es zuletzt? — drei Kennzahlen der letzten abgeschlossenen
   Zählung: Bestandswert (z. B. 8.412,50 EUR), Schwund in Prozent, Datum.
   Zahlen gross, Beschriftung klein darunter.

Darunter der Einstieg in die Bereiche: Artikel, Lieferungen, Umsatz,
Auswertung. Auf dem iPhone als Liste mit 56 px hohen Zeilen, auf dem Desktop
als Seitennavigation links.

Zeige zwei Varianten der Seite: einmal mit offener Zählung von heute, einmal
ohne. Betriebsname „Stadthafen Recklinghausen" im Kopf.
```

---

## Prompt 2 — Zählmaske: ein Artikel füllt den Bildschirm

```text
[Design-Grundlage der Inventur-App verwenden]

Verfeinere den Kernbildschirm der App für iPhone (390 × 844). Er existiert
bereits funktionsfähig — entwirf ihn schöner und klarer, ohne den Aufbau
umzustossen.

Aufbau von oben nach unten:
- Kopfzeile: Kategorie des aktuellen Artikels („Bier Flasche"), darunter
  klein der Synchronisationsstatus („3 Werte warten auf Netz" / „alles
  gespeichert"). Rechts der Zähler „47 von 99" und eine Schaltfläche „Liste".
- Rumpf, vertikal zentriert: Artikelname sehr gross („Veltins Pilsener"),
  darunter das Liefergebinde in Grau („24 x 0,33"). Bei nicht
  schwundgeprüften Artikeln eine kleine graue Zeile „Wird gezählt, aber nicht
  auf Schwund geprüft."
- Darunter ein bis zwei Wertfelder nebeneinander, je nach Zählmodus:
  · Gebinde plus einzeln → zwei Felder „Kästen" und „Einzelflaschen"
  · Nur einzeln → ein Feld „Flaschen"
  · Fass → ein Feld „Fässer", Kommazahlen erlaubt (0,5 = angebrochenes Fass)
  Das aktive Feld ist farbig umrandet und hinterlegt, das andere neutral. Ein
  leeres Feld zeigt einen Gedankenstrich, keine Null.
- Unter den Feldern eine graue Kontrollzeile, sobald etwas eingegeben ist:
  „= 51 Flaschen". Sie erscheint nicht am unberührten Artikel.
- Fuss: eigener Ziffernblock, 4 × 4 Tasten, jede 56 px hoch. Reihen: 1 2 3 ⌫ /
  4 5 6 − / 7 8 9 + / , 0 und eine doppelt breite primäre Weiter-Taste. Die
  Weiter-Taste beschriftet sich mit dem, was sie speichert: „2 Kästen ·
  weiter", ohne Eingabe „0 · weiter", beim letzten Artikel „… · fertig". Die
  Komma-Taste ist gesperrt und sichtbar ausgegraut, wenn der Zählmodus keine
  Kommazahlen kennt.
- Sind alle 99 Artikel erfasst, schiebt sich über den Ziffernblock ein grüner
  Balken „Alle gezählt — Zählung abschliessen".

Zeige vier Zustände: leerer Artikel mit zwei Feldern, Artikel mit Wert im
zweiten Feld und Kontrollzeile, Fass-Artikel („Veltins 1 x 30,0", Eingabe
„0,5"), und der Zustand mit dem grünen Abschlussbalken.

Zeige jeden Zustand in Hell und Dunkel. Der Daumen greift von unten — prüfe
in deinem Entwurf ausdrücklich, dass nichts Antippbares oberhalb des unteren
Drittels liegt, ausser der Liste-Schaltfläche im Kopf.
```

---

## Prompt 3 — Zählliste: was fehlt noch

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf die Listenansicht innerhalb einer laufenden Zählung für iPhone
(390 × 844). Sie ist der Ausweg aus der Einzelansicht und beantwortet: Was
fehlt noch? Was habe ich bei Artikel 60 eingetragen? Wie komme ich dorthin
zurück?

- Ganz oben, nur wenn ein Abschlussversuch fehlgeschlagen ist, eine
  bernsteinfarbene Hinweisleiste: „Der Abschluss ist noch nicht möglich:
  4 Artikel ohne Wert. Sie sind unten hervorgehoben."
- Darunter grau: „12 Artikel fehlen noch".
- Dann die Artikel, gruppiert nach Kategorie in der Reihenfolge des Laufwegs
  durch das Lager. Wichtig: dieselbe Kategorie darf mehrfach als Abschnitt
  auftauchen, wenn der Weg mehrfach an ihr vorbeiführt — 14 Kategorien
  zerfallen so in 26 Abschnitte. Das ist kein Fehler, das ist das Lager.
  Kategorieüberschriften kleben beim Scrollen oben.
- Jede Zeile 56 px hoch, antippbar: Artikelname, darunter klein das
  Liefergebinde („24 x 0,33"), rechts der gezählte Wert in Tabellenziffern
  („2 + 3" für zwei Kästen und drei Flaschen, „—" wenn ungezählt), ganz
  rechts ein kleiner bernsteinfarbener Punkt, wenn der Wert noch offline auf
  dem Gerät liegt. Angekommene Werte zeigen keinen Punkt — der Normalfall
  soll nicht blinken.
- Zeilen, die beim Abschluss vermisst wurden, sind bernsteinfarben
  hinterlegt.
- Fuss: Schaltfläche über volle Breite. Grün und aktiv als „Zählung
  abschliessen", solange etwas fehlt gesperrt mit der Aufschrift „Noch 12 zu
  zählen", während des Absendens „Wird abgeschlossen…".

Echte Artikel aus dem Stamm verwenden: Gerolsteiner Sprudel 24 x 0,25,
Coca Cola 12 x 1,0, Coke Zero 24 x 0,33, Veltins Fassbrause Zitrone,
Heineken 1 x 30,0, Sudmare Gin 1 x 0,7. Kategorien: Wasser, Softdrinks,
Saefte, Bier Flasche, Bier Fass, Wein, Sekt, Spirituosen, Likoer, Aperitif,
Barzutat, Premix, Energy, Champagner.

Hell und Dunkel.
```

---

## Prompt 4 — Zählung abgeschlossen: das Ergebnis

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf den Bildschirm einer abgeschlossenen Zählung, mobil und Desktop. Er
wird direkt nach dem Abschluss gezeigt und später aus der Zählungsliste wieder
geöffnet.

Oben eine ruhige Bestätigung — kein Konfetti, keine Vollbild-Feier: Datum
(07.08.2026), 99 von 99 Artikeln, Dauer der Zählung, Name der zählenden
Person.

Darunter das Ergebnis in drei Kennzahlen: Bestandswert in Euro, Anzahl nicht
bewertbarer Artikel (Artikel ohne hinterlegten Einkaufspreis — sie sind
gezählt, aber ihr Wert ist unbekannt und darf nie als 0 in eine Summe
einfliessen), Anzahl Artikel mit auffälligem Schwund.

Dann Bestand nach Kategorie: Balken oder Tabelle mit Kategorie, gezählten
Einheiten und Wert. Tabellenziffern, rechtsbündige Zahlen.

Fuss: „Zur Auswertung" als primäre Aktion, „Werte ansehen" sekundär. Kein
Bearbeiten — eine abgeschlossene Zählung ist zu.

Entwirf zusätzlich die Variante, in der Werte fehlen dürfen: gesperrter
Zustand mit Erklärung, dass 4 Artikel keinen Wert haben.
```

---

## Prompt 5 — Auswertung: Soll gegen Ist und Schwund

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf den Auswertungsbildschirm — die eigentliche Frage, wegen der es diese
App gibt. Vorrangig Desktop (1280 breit), zusätzlich eine mobile Fassung.

Die Rechnung, die der Bildschirm zeigt, je Artikel:
  Anfangsbestand (letzte Zählung)
  + Lieferungen im Zeitraum
  − Verkäufe laut Kassenexport
  = Sollbestand
  − Ist-Bestand (aktuelle Zählung)
  = Schwund

Kopf: Zeitraumauswahl über zwei Zählungen („von 31.07.2026 bis 07.08.2026"),
daneben drei Kennzahlen — Schwund in Euro, Schwund in Prozent vom Umsatz,
Bestandswert am Ende.

Kern der Seite ist eine Tabelle je Artikel mit den Spalten der Rechnung oben.
Alle Zahlen in Tabellenziffern, rechtsbündig. Die Schwundspalte trägt die
Farbe: kleiner Schwund neutral, auffälliger Schwund rot, negativer Schwund
(mehr gezählt als möglich — deutet auf Zählfehler oder nicht erfasste
Lieferung) bernsteinfarben. Sortierbar nach Schwund.

Drei Fälle, die die Tabelle sichtbar unterscheiden muss und die kein
Tabellenblatt in Excel jemals sauber hinbekommen hat:
1. Artikel ohne Einkaufspreis: gezählt, aber nicht bewertbar. Zeigt in der
   Wertspalte ein deutliches „nicht bewertbar", niemals 0,00 EUR. In der
   Gesamtsumme erscheint diese Menge als separater Hinweis unter der Summe:
   „3 Artikel ohne Preis, in der Summe nicht enthalten."
2. Nicht schwundfähige Artikel (portioniert verkaufte Spirituosen und Liköre):
   werden gezählt, aber die Schwundzeile bleibt leer mit dem grauen Vermerk
   „ohne Schwundrechnung".
3. Kassenbezeichnungen ohne Zuordnung zu einem Artikel: ihre Verkäufe fehlen
   in der Rechnung. Ganz oben als bernsteinfarbene Leiste: „7 Kassen-
   bezeichnungen sind keinem Artikel zugeordnet — die Auswertung ist unvoll-
   ständig" mit Weg zur Zuordnung.

Ein Klick auf eine Zeile öffnet die Herleitung: alle Rechenschritte
untereinander mit ihren Belegen — welche Lieferung, welcher Umsatzimport,
welche Zählung. Diese Herleitung ist wichtiger als jedes Diagramm; entwirf sie
sorgfältig.

Mobile Fassung: Karten statt Tabelle, je Artikel eine Karte mit Schwund gross
und der Rechnung klein darunter.

Hell und Dunkel.
```

---

## Prompt 6 — Artikelstamm: Liste und Detail

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf den Artikelstamm der Inventur-App, Desktop und mobil.

Listenansicht: 99 Artikel, Suchfeld, Filter nach Kategorie und nach
aktiv/stillgelegt. Spalten: Name, Liefergebinde („24 x 0,33"), Kategorie,
Zählmodus, Einkaufspreis, Sortiernummer. Zeilen 56 px. Stillgelegte Artikel
sind ausgegraut, aber sichtbar — Artikel werden in dieser App nie gelöscht,
nur stillgelegt.

Wichtig: derselbe Artikelname darf mehrfach vorkommen, wenn er in mehreren
Gebindegrössen geführt wird — „Coca Cola 12 x 1,0" und „Coca Cola 24 x 0,33"
sind zwei Zeilen. Das Liefergebinde muss deshalb in der Liste immer direkt
neben dem Namen stehen, nie versteckt.

Detail-/Bearbeitungsansicht mit klar getrennten Blöcken:
- Identität: Name, Kategorie, Sortiernummer (Position im Laufweg durch das
  Lager)
- Lieferung: Gebindeart (Kasten, Karton, Einzelflasche, Fass), Anzeigetext
  des Gebindes, Einheiten je Gebinde (z. B. 24), Inhalt je Einheit in Litern
  (0,33)
- Zählung: Zählmodus (Gebinde plus einzeln / nur einzeln / Fass). Erkläre im
  Entwurf sichtbar, warum das getrennt von der Gebindeart steht: Wein kommt
  im Karton, wird aber einzeln im Regal gezählt.
- Preis: Einkaufspreis und der Bezug dazu — je Gebinde oder je Einheit. Zeige
  darunter live die abgeleitete Angabe: „18,59 EUR je Kasten = 0,77 EUR je
  Flasche". Ein leeres Preisfeld bedeutet ausdrücklich „Preis nicht bekannt",
  nicht 0 — sichtbar so beschriftet.
- Schalter: „Wird auf Schwund geprüft" (aus für portioniert verkaufte
  Spirituosen), „Aktiv".

Die abgeleiteten Angaben sind überall als berechnet erkennbar — anderer
Hintergrund, kein Eingabefeld. Diese App löst eine Excel ab, in der dieselbe
Umrechnung an mehreren Stellen von Hand stand und auseinanderdriftete; im
Entwurf muss klar sein, welche Zahl eingegeben und welche gerechnet wird.

Hell und Dunkel.
```

---

## Prompt 7 — Artikelstamm importieren

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf den Import des Artikelstamms aus einer CSV-Datei, Desktop (1280).
Dreischrittig, Fortschritt oben sichtbar:

1. Datei wählen: Ablagefläche zum Hineinziehen, darunter die erwarteten
   Spalten als Liste (kategorie, name, gebinde_text, packungsgroesse,
   einheit, gebindegroesse_liter, ek_preis_gebinde_eur, sortierung) und ein
   Link auf eine Beispieldatei.

2. Vorschau — der wichtigste Schritt. Eine Tabelle mit farbiger Kennzeichnung
   je Zeile:
   · grün: neuer Artikel, wird angelegt
   · blau: bestehender Artikel, Feld ändert sich — alter Wert durchgestrichen
     neben neuem Wert
   · grau: unverändert
   · rot: Zeile nicht lesbar, mit konkretem Grund („Spalte
     ek_preis_gebinde_eur enthält '8,58 EUR' — erwartet wird eine Zahl")
   Oben eine Zusammenfassung: „12 neu, 5 geändert, 82 unverändert, 1 Fehler".
   Filter, um nur Änderungen oder nur Fehler zu zeigen.

3. Bestätigen: Zusammenfassung und die primäre Schaltfläche „Import
   ausführen", gesperrt solange Fehlerzeilen bestehen. Danach ein
   Protokollbildschirm mit dem Ergebnis.

Der Import gleicht Artikel über Name plus Liefergebinde ab und lässt sich
beliebig oft wiederholen — sage das dem Benutzer im ersten Schritt in einem
Satz.
```

---

## Prompt 8 — Lieferungen: Übersicht und Nacherfassung

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf zwei Bildschirme für Lieferungen, mobil und Desktop.

Übersicht: Lieferungen nach Datum absteigend. Je Zeile Datum, Lieferant
(„Dörlemann"), Belegnummer, Anzahl Positionen, Warenwert und der
Kontrollstand — ungeprüft / geprüft ohne Abweichung / geprüft mit
Abweichung / Reklamation offen. Ein Vermerk für Lieferungen ohne Positionen —
die sind angelegt, aber nicht erfasst, und verfälschen jede Auswertung.
Primär: „Wareneingang prüfen".

Erfassung: Kopf mit Datum, Lieferant, Belegnummer. Darunter die Positionen —
Artikel suchen und Gebindeanzahl eintragen. Die Erfassung geschieht am
Lieferschein entlang, oft im Stehen an der Rampe: der Eingabefluss muss ohne
Mausklick auskommen, Artikel suchen → Anzahl tippen → Enter → nächste Zeile.
Bereits erfasste Positionen stehen darüber und sind änderbar.

Je Position sichtbar: Artikelname, Liefergebinde, Anzahl Gebinde, und
abgeleitet daraus die Einheiten („4 Kästen = 96 Flaschen") sowie der
Positionswert. Abgeleitete Zahlen als solche erkennbar, nicht als
Eingabefelder.

Unten die Summe der Lieferung und „Lieferung speichern".

Entwirf zusätzlich den mobilen Zustand: dieselbe Erfassung als Einzelposition
im Vollbild mit dem Ziffernblock aus der Zählmaske.
```

---

## Prompt 8a — Wareneingang: die gebaute Prüfmaske verfeinern

> **Diese Maske existiert.** `src/app/lieferungen/[id]/pruefmaske.tsx`, Stand
> 07.08.2026. Der Prompt beschreibt sie so, wie sie läuft — mit ihren echten
> Texten und Zuständen. Es geht also um Gestaltung, nicht um Erfindung: Was der
> Entwurf ändert, muss sich auf die vorhandenen Zustände abbilden lassen.

```text
[Design-Grundlage der Inventur-App verwenden]

Verfeinere den Wareneingang für iPhone (390 × 844). Er läuft bereits — entwirf
ihn schöner und klarer, ohne den Aufbau umzustossen.

Die Lage: Der Getränkelieferant hält an der Rampe. Der Fahrer rollt Paletten ab
und will weiter. Wer annimmt, hat eine Hand frei und steht im Freien. Was jetzt
nicht auffällt, fällt nie mehr auf — eine Fehlmenge, die am Abend bemerkt wird,
zahlt der Betrieb selbst.

Der Entwurf hängt an einer Regel, die nicht verhandelbar ist: Die tatsächliche
Menge startet auf dem Wert des Lieferscheins. Wer nichts anfasst, bestätigt
damit das Papier. Erfasst wird nur, was abweicht. Deshalb gibt es hier auch
keinen Fortschrittsbalken "14 von 18 geprüft" — er würde zu Arbeit auffordern,
die diese Maske gerade abschafft.

Kopfzeile, zwei Zeilen links und zwei rechts:
  links   "Dörlemann · Beleg LS-4711"
          "07.08.2026" — nach der Bestätigung ergänzt um " · bestätigt" und
          den Namen des Fahrers
  rechts  "3 Positionen"
          "ohne Abweichung" oder "1 Abweichung · 18,59 EUR"

Darunter, nur wenn nötig, eine bernsteinfarbene Leiste über volle Breite:
  "Ohne Netz lässt sich nichts speichern. Die Eingabe steht noch auf dem Gerät."

Die Prüfliste, eine Zeile je Position. Jede Zeile trägt oben Artikelname und
Liefergebinde links, rechts die Mengen nebeneinander in Tabellenziffern, jede
mit kleiner Beschriftung darunter:
  "bestellt" (erscheint nur mit Bestellbezug) · "Lieferschein" · "tatsächlich"
Weicht die Ware ab, steht darunter eine kleine Zeile im Klartext:
  "1 Kasten fehlt · 18,59 EUR · mit Bruch"
  "2 Kästen zu viel"
  "1 Karton fehlt · nicht bewertbar"   (Artikel ohne hinterlegten Preis)

Zeilenzustände, farblich unterschieden:
  stimmt          ruhig, keine Auszeichnung
  Fehlmenge       rot hinterlegt — wir bekommen weniger, als berechnet wird
  Überlieferung   bernsteinfarben — auch das will gesehen werden

Unter der Liste eine Fläche mit gestrichelter Umrandung: "Position hinzufügen",
für Ware, die nicht auf dem Lieferschein steht.

Fuss, eine Schaltfläche über volle Breite, drei Aufschriften:
  grün      "Alles stimmt — Wareneingang bestätigen"
  blau      "Wareneingang bestätigen · 3 Abweichungen"
  gesperrt  "2 Positionen ohne Erklärung"
Nach der Bestätigung steht dort statt einer Schaltfläche nur noch der Satz
"Dieser Wareneingang ist bestätigt."

Zeige diese Zustände, in Hell und Dunkel:
1. leere Lieferung — "Noch keine Position erfasst. Am Lieferschein entlang
   hinzufügen."
2. drei Positionen, alle stimmig
3. drei Positionen, davon eine Fehlmenge mit Bruch und eine Überlieferung
4. mit Bestellbezug, also drei Mengenspalten statt zwei
5. bestätigt

Echte Artikel verwenden: Coca Cola 24 x 0,33, Gerolsteiner Sprudel 24 x 0,25,
Veltins 1 x 30,0, Sudmare Gin 1 x 0,7.

Der Daumen greift von unten, und der Entwurf muss bei Sonne auf der Rampe
lesbar sein.
```

---

## Prompt 8b — Wareneingang: Zeile korrigieren und bestätigen

> Ebenfalls gebaut. Dieselbe Datei, die Unteransichten `Zeilenmaske`,
> `Artikelsuche` und `Bestaetigung`.

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf die drei Unteransichten der Wareneingangskontrolle für iPhone
(390 × 844). Sie lösen jeweils die Liste ab und füllen den Bildschirm.

1. ZEILE KORRIGIEREN — wird durch Antippen einer Listenzeile geöffnet.
   - Artikelname gross, darunter das Liefergebinde in Grau
   - ein bis drei Mengenfelder nebeneinander, je 80 px hoch: "bestellt" (nur
     mit Bestellbezug, nicht antippbar), "Lieferschein", "tatsächlich". Die
     beiden letzten sind antippbar und schalten um, welches Feld der
     Ziffernblock beschreibt; das aktive ist farbig umrandet und hinterlegt.
     Beide müssen erreichbar sein: ohne Bestellung wird der Lieferschein hier
     abgetippt.
   - fehlt etwas, erscheint darunter die Frage "Davon beschädigt angekommen?"
     mit drei Schaltflächen "nichts" / "1 Bruch" / "2 Bruch". Bruch ist
     angekommen und unbrauchbar, eine Fehlmenge war nie da — beides wird
     verschieden reklamiert, deshalb die Trennung.
   - Fuss: der Ziffernblock der App, 4 × 4 Tasten zu je 56 px, die doppelt
     breite Weiter-Taste beschriftet mit "übernehmen"

2. ARTIKEL SUCHEN — für Ware, die nicht auf dem Lieferschein steht.
   Suchfeld oben, darunter Treffer in 56 px hohen Zeilen mit Name und
   Liefergebinde. Bereits erfasste Artikel tragen den Vermerk "· steht schon in
   der Liste". Unten "Abbrechen".

3. BESTÄTIGEN — der letzte Schritt.
   Überschrift "Wareneingang bestätigen", darunter die Kennzahlen als Liste mit
   Beschriftung links und grosser Zahl rechts:
     Positionen 3 · mit Abweichung 1 · Fehlbetrag 18,59 EUR
   und, wenn es sie gibt, "ohne Preis, nicht bewertbar 2".
   Gibt es Abweichungen, folgt der Satz "Abweichungen gegen den Lieferschein
   müssen vom Fahrer gegengezeichnet werden, sonst ist der Anspruch weg." und
   ein Feld "Name des Fahrers".
   Fuss: grüne Schaltfläche "Wareneingang bestätigen", darunter "Zurück".
   Während des Sendens "Wird bestätigt …".

Hell und Dunkel. Alle Bedienelemente im unteren Drittel, ausser den
Mengenfeldern, die selbst gross genug zum Antippen sind.
```

---

## Prompt 8c — Wareneingang: die Ausbaustufen

> **Noch nicht gebaut.** Das Datenmodell trägt diese Fälle bereits
> (`Leergutposition`, `ekPreisCentLieferschein`, `bestellpositionId`,
> `nachlieferungZugesagtBis`, die Bildpfade an `Lieferung`), die Oberfläche
> nicht. Dieser Prompt entwirft sie, damit sie sich in die vorhandene Maske
> einfügen statt neben ihr zu stehen.

```text
[Design-Grundlage der Inventur-App verwenden]

Ergänze die bestehende Wareneingangskontrolle (Prüfliste mit den Mengen
bestellt / Lieferschein / tatsächlich, Zeilenkorrektur mit Ziffernblock,
Bestätigung mit Fahrername) um fünf Fälle, die an jeder Rampe vorkommen. Jeder
Entwurf muss sich in den vorhandenen Aufbau einfügen — Kopf, scrollende Liste,
feste Fussschaltfläche — und darf den Regelfall nicht aufwendiger machen.

1. LEERGUT. Was an Kästen, Fässern und Paletten zurückgeht, steht auf dem
   Lieferschein in einem eigenen Block und gehört auch hier in einen eigenen,
   unter die Ware. Je Zeile eine freie Bezeichnung ("Kasten 24er", "Fass 50 l"),
   die Rückgabemenge laut Lieferschein und die tatsächlich mitgegebene — dieselbe
   Unterscheidung wie bei der Ware, nur in die Gegenrichtung. Optional ein Pfand
   je Einheit.

2. PREISABWEICHUNG. Der Preis auf dem Lieferschein weicht vom hinterlegten
   Einkaufspreis ab. Entwirf, wie das in einer Zeile auffällt, ohne den
   Mengenabgleich zu verdecken, und wie die Frage gestellt wird, ob der neue
   Preis in den Artikelstamm übernommen werden soll. Die Frage darf an der Rampe
   nicht blockieren — sie gehört später beantwortet.

3. ERSATZARTIKEL. Bestellt war Veltins 30 l, geliefert wurde Veltins 50 l. Die
   Zeile muss auf einen anderen Artikel umgestellt werden können, ohne den Bezug
   zur Bestellzeile zu verlieren: bestellt bleibt bestellt, geliefert ist etwas
   anderes. Zeige, wie beide Artikel gleichzeitig sichtbar bleiben.

4. NACHLIEFERUNG. Der Fahrer sagt zu, den Rest am Freitag zu bringen. Das ist
   eine Zusage und keine Fehlmenge — sie darf nicht als Reklamation zählen.
   Entwirf die Eingabe eines Datums und die Kennzeichnung der Zeile.

5. BELEGE. Foto des Lieferscheins und Unterschriftsfläche für die
   Gegenzeichnung, eingefügt in den Bestätigungsschritt. Die Unterschrift wird
   mit dem Finger auf dem Telefon geleistet, während der Fahrer danebensteht —
   entwirf die Fläche entsprechend gross und den Weg dorthin kurz.

Für jeden Fall: den Normalzustand, den Fall selbst und, wo es einen gibt, den
Fehlerzustand. Hell und Dunkel.
```

---

## Prompt 8d — Abweichungen und Reklamation

> Noch nicht gebaut. Das Schema trägt Status und Verlauf bereits
> (`Abweichung`, `Abweichungsereignis`).

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf die Nachverfolgung der Wareneingangs-Abweichungen, Desktop (1280) und
mobil. Hier sitzt die Betriebsleitung am nächsten Morgen und arbeitet ab, was an
der Rampe aufgefallen ist.

Übersicht aller offenen Abweichungen über alle Lieferungen hinweg, nach Alter
sortiert — je älter, desto dringender, weil Reklamationsfristen laufen. Je
Zeile: Datum, Lieferant, Artikel, Art der Abweichung, Menge, Betrag in Euro,
Status.

Arten, farblich unterschieden: Fehlmenge, Überlieferung, Bruch, falscher oder
Ersatzartikel, Preisabweichung.

Status je Abweichung: offen → reklamiert → Gutschrift erwartet → erledigt, dazu
"verworfen" für den Fall, dass der eigene Zählfehler auffiel. Als schmale
Statusfolge in der Zeile darstellbar, nicht als Ampel.

Detailansicht: die drei Mengen nebeneinander (bestellt, Lieferschein,
tatsächlich), das Foto des Lieferscheins, die Unterschrift des Fahrers, ein
Notizfeld und der Verlauf — wer wann welchen Status gesetzt hat. Der reklamierte
Betrag wird aus Menge und Lieferscheinpreis gerechnet und ist als berechnet
erkennbar; eingetragen wird nur die tatsächlich erhaltene Gutschrift.

Oben drei Kennzahlen: offener Reklamationsbetrag in Euro, Abweichungen der
letzten 30 Tage, und eine Übersicht je Lieferant — Anzahl Lieferungen, Anteil
fehlerfreier Lieferungen, Summe der Abweichungen. Diese Lieferantenübersicht ist
der eigentliche Wert des Bildschirms: sie ist das Argument im nächsten Gespräch
mit dem Aussendienst.

Hell und Dunkel.
```

---

## Prompt 8e — Lieferungen: Liste und Beginn

> Gebaut: `src/app/lieferungen/page.tsx`.

```text
[Design-Grundlage der Inventur-App verwenden]

Verfeinere die Lieferungsübersicht für iPhone (390 × 844) und Desktop (1280).
Sie ist der Weg in jede Wareneingangskontrolle.

Oben ein knappes Formular zum Beginnen: Lieferant (mit Vorschlägen aus den
bisherigen Lieferanten), Belegnummer, Datum (heute vorbelegt) und — nur wenn es
offene Bestellungen gibt — eine Auswahl "ohne Bestellung / Dörlemann ·
03.08.2026". Darunter die primäre Schaltfläche "Wareneingang beginnen".

Darunter die Lieferungen, nach Datum absteigend. Je Zeile links Datum und
Lieferant, darunter klein "Beleg LS-4711"; rechts der Kontrollstand:
  "ungeprüft · 3 Positionen"
  "ungeprüft · ohne Positionen"    (angelegt, aber nie erfasst)
  "geprüft · 3 Positionen"
  "geprüft · 1 Abweichung"

Der Kontrollstand ist abgeleitet und kein gespeicherter Status — im Entwurf
heisst das: er ist eine ruhige Textangabe, kein Etikett, das nach Pflege
aussieht.

Leerzustand: "Noch keine Lieferung erfasst."

Zeige die Liste mit vier Lieferungen in allen vier Ständen, in Hell und Dunkel,
und den Zustand ohne offene Bestellungen (dann fehlt die Auswahl ganz).
```

---

## Prompt 9 — Umsatzimport aus dem Kassensystem

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf den Import der Verkaufszahlen aus dem Kassensystem, Desktop (1280).

Übersicht der bisherigen Importe: Zeitraum von/bis, Dateiname, Anzahl Zeilen,
Importzeitpunkt. Eine deutliche Anzeige, ob der Zeitraum lückenlos an den
vorigen Import anschliesst — Lücken und Überschneidungen zwischen zwei
Importen zerstören jede Schwundrechnung und müssen hier sofort auffallen,
nicht erst in der Auswertung. Zeige beide Fälle: „lückenlos" und „3 Tage
fehlen zwischen 01.08. und 04.08.".

Import: Datei hineinziehen, Zeitraum bestätigen (aus der Datei vorgeschlagen,
änderbar), Vorschau der Rohzeilen mit Kassenbezeichnung und Menge, dann
importieren.

Nach dem Import führt die Seite unmittelbar weiter zu dem, was jetzt zu tun
ist: unbekannte Kassenbezeichnungen zuordnen — als auffällige Leiste mit
Anzahl und Weg dorthin.
```

---

## Prompt 10 — Kassenbezeichnungen zuordnen

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf den Zuordnungsbildschirm zwischen Kassensystem und Artikelstamm,
Desktop (1280). Das ist der fehleranfälligste Bildschirm der App — entwirf ihn
für Tempo und für Sicherheit zugleich.

Zwei Spalten. Links die Bezeichnung aus dem Kassenexport, wie sie dort steht
(„Veltins 0,3", „Gin Tonic", „Cola 0,2 l", „Hugo"), mit der verkauften Menge
im Zeitraum. Rechts der zugeordnete Artikel aus dem Stamm plus ein Zahlenfeld
„Einheiten je Verkauf".

Dieses Zahlenfeld ist der Kern und braucht die beste Erklärung des ganzen
Entwurfs: es sagt, wie viel eine Kassenbuchung vom Bestand abzieht. Ein Glas
Cola 0,2 l aus der Literflasche ist 0,2. Ein Schnaps aus der 0,7er-Flasche ist
0,06. Eine Flasche Bier über die Theke ist 1. Zeige daneben immer die
Auswirkung im Klartext: „120 Verkäufe × 0,06 = 7,2 Flaschen Sudmare Gin".

Zustände je Zeile: nicht zugeordnet (auffällig), zugeordnet aber unbestätigt
(Vorschlag des Systems, geprüft werden muss er trotzdem), bestätigt (ruhig).
Vorschläge kommen aus Namensähnlichkeit und sind als Vorschlag erkennbar,
nie als Tatsache.

Tastaturbedienung durchgängig: Tab durch die Zeilen, Auswahl per Eingabe,
Enter bestätigt und springt weiter. Oben ein Zähler „7 von 84 offen" und ein
Filter „nur offene".

Hell und Dunkel.
```

---

## Prompt 11 — Bestellvorschlag

> **Diese Seiten existieren.** `src/app/bestellungen/` und
> `src/app/bestellungen/vorschlag/`, Stand 08.08.2026. Der Prompt beschreibt sie
> so, wie sie laufen — es geht also um Gestaltung, nicht um Erfindung.
>
> **Eine Abweichung zum ursprünglichen Entwurf:** Ein *hinterlegter* Sollbestand
> je Artikel gibt es nicht. Er wird aus dem Kassenumsatz gerechnet — Verbrauch je
> Tag × Reichweite × Saisonzuschlag, die drei Parameter stehen im Kopf der Seite.
> Neunundneunzig von Hand gepflegte Zielmengen wären genau die Krankheit der
> Excel: einmal richtig eingetragen und danach still veraltet. Der Ist-Bestand
> kommt aus der letzten Zählung, fortgeschrieben mit geprüften Lieferungen und
> Verkäufen bis heute; bereits bestellte, noch nicht gelieferte Mengen werden
> abgezogen. Bestellmengen sind immer auf ganze Gebinde aufgerundet — die
> Überdeckung steht je Zeile. Die Rechnung liegt in `src/lib/bestellung.ts`.

```text
[Design-Grundlage der Inventur-App verwenden]

Verfeinere den Bestellvorschlag, Desktop und als Druckansicht. Er entsteht aus
dem gezählten Ist-Bestand und einem aus dem Kassenumsatz gerechneten Bedarf und
geht als Bestellung an den Getränkelieferanten.

Kopf: drei Parameter — Referenzfenster in Tagen (woraus der Verbrauch stammt),
Reichweite in Tagen (wie lange die Bestellung tragen soll), Saisonzuschlag als
Faktor. Daneben drei Kennzahlen: Positionen, Gebinde, Bestellwert.

Tabelle je Artikel: Name, Liefergebinde, Bestand, unterwegs, Verbrauch je Tag,
Bedarf, Fehlmenge, Bestellmenge in Gebinden (vorgeschlagen, aber
überschreibbar), Positionswert. Nur Artikel mit Bestellmenge über 0 stehen
standardmässig in der Liste, umschaltbar auf alle.

Drei Zeilenzustände, die die Tabelle unterscheiden muss:
1. Artikel ohne Kassenbezeichnung: der Bedarf ist unbekannt, nicht 0. Verbrauch,
   Bedarf und Fehlmenge zeigen einen Gedankenstrich, die Zeile bleibt sichtbar,
   und die Menge wird von Hand gesetzt.
2. Artikel, der bei der letzten Zählung fehlte: der Vorschlag deckt den ganzen
   Bedarf, als wäre das Regal leer. Die Zeile sagt das.
3. Artikel ohne Einkaufspreis: der Positionswert ist „nicht bewertbar", niemals
   0,00 EUR, und die Zeile fehlt in der Summe mit einem Hinweis darunter.

Eine überschriebene Bestellmenge ist sichtbar als Handeingriff markiert („von
Hand · Vorschlag 11") und lässt sich einzeln oder für alle Zeilen auf den
Vorschlag zurücksetzen. Gespeichert wird das Kennzeichen nicht — es ist der
Abstand zum gerechneten Vorschlag.

Unten der Block „Bestellung anlegen" mit Lieferant, Datum und Notiz. Die
Bestellung entsteht als Entwurf; abgeschickt wird sie erst auf ihrer eigenen
Seite, und erst dann steht sie im Wareneingang zur Auswahl.

Die Seite der gespeicherten Bestellung zeigt die Positionen, die Summe, den Stand
(Entwurf / abgeschickt / abgeschlossen / storniert) und — sobald darauf geliefert
wurde — die gelieferte Menge je Zeile.

Ihre Positionsliste ist änderbar, solange die Bestellung offen ist: Mengen
setzen, Zeilen streichen, Artikel aus dem Stamm dazunehmen. Daneben steht der
heute gerechnete Vorschlag als Vergleich, nicht als Vorgabe. Drei Zustände je
Zeile: geändert (mit dem gespeicherten Wert daneben), wird gestrichen, und
gesperrt — auf diese Zeile wurde geliefert, ihre Menge ist noch änderbar, die
Zeile selbst nicht mehr streichbar.

Auch nach dem Abschicken änderbar, dann mit deutlichem Hinweis: was hier steht,
ist die Menge, gegen die der Wareneingang später prüft. Wer beim Lieferanten
anruft und zwei Kästen dazunimmt, muss das nachtragen können — sonst zeigt jede
Lieferung eine Bestellabweichung, die es nicht gibt. Abgeschlossene und
stornierte Bestellungen sind zu und zeigen dieselbe Tabelle ohne Eingabefelder.

Die Druckansicht ist keine zweite Vorlage, sondern dieselbe Seite ohne ihre
Bedienelemente: Briefkopf mit Betrieb, Lieferant und Datum, eine ruhige Tabelle
in Schwarzweiss auf einer A4-Seite, und rechts eine leere Spalte zum Abhaken an
der Rampe.
```

---

## Prompt 12 — Zustände: offline, leer, fehlerhaft

```text
[Design-Grundlage der Inventur-App verwenden]

Entwirf die Zustände, die in Entwürfen üblicherweise fehlen und die diese App
im Alltag prägen. Mobil (390 × 844), je Zustand eine Karte.

Netz und Synchronisation — im Getränkelager gibt es kein Netz, das ist der
Normalfall und keine Störung:
1. Alles gespeichert (ruhig, unauffällig)
2. „7 Werte warten auf Netz" — bernsteinfarben, aber nicht alarmierend. Die
   Zählung läuft ungestört weiter, das muss der Entwurf ausstrahlen.
3. Werden gerade übertragen
4. Übertragung dauerhaft fehlgeschlagen — erst hier wird es rot, mit einer
   Erklärung, was der Benutzer tun kann, und der Zusicherung, dass keine
   Zählwerte verloren sind.
5. Abschluss ohne Netz versucht: „Ohne Netz lässt sich nicht abschliessen.
   Die Werte sind gespeichert, versuche es später erneut."

Leerzustände, jeweils mit einem Satz und der nächsten Aktion:
6. Noch keine Zählung vorhanden
7. Kein Artikel im Stamm — mit Weg zum Import
8. Keine Umsatzdaten für den Auswertungszeitraum
9. Suche ohne Treffer

Fehlerzustände:
10. Zählung nicht gefunden
11. Eingabe passt nicht zum Zählmodus: „Bei diesem Artikel werden keine
    Gebinde gezählt" — mit dem Hinweis, dass der Wert nicht stillschweigend
    verworfen wird
12. Serverfehler beim Abschluss

Kein Zustand darf mit einer Sackgasse enden: jeder trägt genau eine sinnvolle
nächste Handlung.
```

---

## Was das Datenmodell dafür braucht

> **Stand 07.08.2026:** umgesetzt in `prisma/schema.prisma` und der Migration
> `20260807223301_wareneingang_bestellung_abweichung`. Der folgende Abschnitt
> beschreibt, was dort entstanden ist.

Die Prompts 8a und 8b beschreiben einen Wareneingang, den das ursprüngliche
Schema nicht trug. `Lieferposition` kannte genau eine Menge (`anzahlGebinde`),
und eine Bestellung gab es als Entität gar nicht. Für den Dreiwege-Abgleich
fehlten:

- **Bestellung und Bestellposition.** Der Bestellvorschlag aus Prompt 11 wird
  erst dann zu einer Bestellung, gegen die sich prüfen lässt. Eine Bestellung
  kann in mehreren Lieferungen ankommen (Teillieferung), die Beziehung ist
  also 1:n und nicht 1:1.
- **Drei Mengen je Lieferposition** statt einer: bestellt (kommt über die
  Bestellposition), laut Lieferschein, tatsächlich angenommen. Bestandswirksam
  ist ausschliesslich die tatsächliche Menge — die vom Lieferschein ist ein
  Beleg, kein Bestand.
- **Abweichung als eigene Tabelle**, nicht als Spalte an der Lieferposition:
  sie trägt Art, Menge, Betrag, Status und einen Verlauf bis zur Gutschrift.
  Das überlebt die Lieferung, an der sie entstanden ist.
- **Leergut** als eigene Positionsart, getrennt von der Ware.
- **Lieferscheinpreis** an der Position, um Preisabweichungen zum
  `ekPreisCent` des Artikels zu erkennen.
- **Belege**: Foto des Lieferscheins und Unterschrift, abgelegt in Supabase
  Storage, referenziert an der Lieferung.

Eine Regel gilt dabei unverändert: Auch bestellte und laut Lieferschein
gelieferte Mengen werden über `gesamtEinheiten` in Einheiten umgerechnet, nicht
über eine zweite Formel im Wareneingang. Drei Mengen, eine Rechenstelle.

Konsequent ist auch, was das Schema **nicht** speichert, weil es ausrechenbar
ist: ob eine Bestellung teilweise geliefert wurde (aus den Positionen), ob eine
Lieferung Abweichungen hatte (aus den Abweichungen), und was eine Abweichung
wert ist (aus Menge und Lieferscheinpreis). Gespeichert wird nur, was neue
Tatsache ist — etwa die tatsächlich erhaltene Gutschrift.

---

## Zum Weiterarbeiten

- **Bestehende Screens abgleichen:** Prompt 2 und 3 beschreiben, was in
  `src/app/zaehlung/[id]/` bereits läuft. Wer den Entwurf zurück in den Code
  holt, ändert dort nur Darstellung — die Rechenlogik liegt in
  `src/lib/einheiten.ts` und bleibt unberührt.
- **Design-System synchron halten:** Mit `/design-sync` lässt sich ein
  Claude-Design-Projekt mit einer lokalen Komponentenbibliothek abgleichen,
  Komponente für Komponente statt als Rundumschlag.
- **Eine Regel bleibt über allen Entwürfen:** Jede Zahl, die gerechnet wird,
  wird genau einmal gerechnet. Wo ein Entwurf eine abgeleitete Zahl zeigt
  (Einheiten aus Gebinden, Wert aus Menge), muss sie sichtbar abgeleitet sein
  und darf kein Eingabefeld werden.
