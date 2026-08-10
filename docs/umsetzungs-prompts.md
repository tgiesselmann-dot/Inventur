# Prompts für Claude Code — das Design in die App holen

Gegenstück zu [design-prompts.md](design-prompts.md). Dort standen die Prompts,
aus denen die Entwürfe entstanden sind; hier stehen die Prompts, mit denen
Claude Code sie umsetzt. Jeder Prompt steht in einem eigenen Codeblock und ist
so geschrieben, dass er ohne weitere Erklärung eingefügt werden kann.

**Vor dem ersten Prompt einmalig:** `/design-login` ausführen. Danach kennt
Claude Code das MCP unter `https://api.anthropic.com/v1/design/mcp`.

Projekt: `54a06c07-7f63-4369-843c-b5c851465031`

## Reihenfolge

U0 und U1 zuerst und in dieser Folge — U0 stellt fest, was der Entwurf will und
was der Code hergibt, U1 legt Tokens und Bausteine an, auf denen alles Weitere
steht. Danach sind die Prompts einzeln und in beliebiger Reihenfolge nutzbar.
Jeweils einer pro Sitzung: ein Screen ist eine abgeschlossene Einheit, und eine
Sitzung, die vier Screens gleichzeitig anfasst, verliert die Zustände aus dem
Blick.

| | Prompt | Entwurf | Ziel im Code |
|---|---|---|---|
| **Vorlauf** | U0 | alle | kein Code — Abgleichbericht |
| | U1 | Design-Grundlage, support.js | `globals.css`, `src/ui/` |
| **Gebaut, wird verfeinert** | U2 | Zaehlbildschirm | `zaehlung/[id]/zaehlmaske.tsx` |
| | U3 | Listenansicht | `zaehlung/[id]/uebersicht.tsx` |
| | U4 | Wareneingang | `lieferungen/[id]/pruefmaske.tsx` |
| | U5 | Wareneingang Unteransichten | dieselbe Datei, Unteransichten |
| | U6 | Lieferungsuebersicht | `lieferungen/page.tsx` |
| | U7 | Bestellvorschlag | `bestellungen/` |
| | U8 | Auswertung | `auswertung/` |
| | U9 | Kassenimport | `umsatz/` |
| | U10 | Zuordnung | `umsatz/zuordnung/` |
| **Neu zu bauen** | U11 | Startseite | `app/page.tsx` (noch Next-Template) |
| | U12 | Abschluss | neu unter `zaehlung/[id]/` |
| | U13 | Artikelstamm | `artikel/page.tsx` (dreizeiliger Stub) |
| | U14 | CSV-Import | neu unter `artikel/` |
| | U15 | Lieferungen | Erfassungsmaske, neu |
| | U16 | Wareneingang Sonderfaelle | Leergut, Preis, Ersatz, Nachlieferung, Belege |
| | U17 | Abweichungen | neu unter `lieferungen/` |
| **Abschluss** | U18 | — | Durchsicht über alle Screens |

Die Trennung ist wichtig. Bei *verfeinern* darf sich nur die Darstellung ändern
— Zustände, Datenfluss und Rechnung bleiben, wie sie sind. Bei *neu* entsteht
auch Verhalten, und dann gilt die Regel aus U1 doppelt: gerechnet wird in
`src/lib`, nie in der Komponente.

---

## U0 — Entwurf holen und gegen den Code halten

Dieser Prompt ändert keine Zeile Code. Er liefert die Liste, an der die
folgenden Prompts entlanglaufen.

```text
Verbinde dich über das claude_design MCP (https://api.anthropic.com/v1/design/mcp)
mit dem Projekt 54a06c07-7f63-4369-843c-b5c851465031 und lies alle Dateien:

  Inventur Design-Grundlage.dc.html
  Inventur Startseite.dc.html
  Inventur Zaehlbildschirm.dc.html
  Inventur Listenansicht.dc.html
  Inventur Abschluss.dc.html
  Inventur Auswertung.dc.html
  Inventur Artikelstamm.dc.html
  Inventur CSV-Import.dc.html
  Inventur Lieferungen.dc.html
  Inventur Lieferungsuebersicht.dc.html
  Inventur Wareneingang.dc.html
  Inventur Wareneingang Unteransichten.dc.html
  Inventur Wareneingang Sonderfaelle.dc.html
  Inventur Abweichungen.dc.html
  Inventur Kassenimport.dc.html
  Inventur Zuordnung.dc.html
  Inventur Bestellvorschlag.dc.html
  support.js

Schreibe noch keinen Code. Lies dazu den vorhandenen Stand: src/app/globals.css,
src/ui/, die Seiten unter src/app/ und die Rechenmodule unter src/lib/.

Liefere docs/design-abgleich.md mit drei Abschnitten:

1. Tokens. Welche Farben, Abstände, Radien und Schriftstufen der Entwurf
   verwendet, und ob es sie in globals.css schon gibt. Drei Spalten: Entwurf,
   vorhandenes Token, Befund. Der Befund ist einer von: deckt sich · Entwurf
   weicht ab (mit Zahlen) · fehlt und muss ergänzt werden · Entwurf benutzt eine
   Rohfarbe, für die es eine semantische Rolle gibt. Für den vierten Fall die
   Rolle nennen — im Code steht nie eine Hexfarbe und nie bg-zinc-800, sondern
   immer die Rolle.

2. Bausteine. Welche wiederkehrenden Bausteine der Entwurf zeigt (Schaltfläche,
   Listenzeile, Wertfeld, klebende Abschnittsüberschrift, Hinweisleiste,
   Statuszeile, Leer- und Ladezustand, Kennzahlenblock, Tabelle). Zu jedem: gibt
   es ihn in src/ui, steckt er mehrfach kopiert in einzelnen Seiten, oder fehlt
   er ganz.

3. Zustände. Je Entwurfsdatei die Zustände, die sie zeigt, und daneben, ob die
   App diesen Zustand kennt. Drei Fälle, und der dritte ist der einzige, der
   Arbeit macht:
   · Code kennt ihn — nur Darstellung
   · Entwurf zeigt ihn nicht, Code hat ihn — muss trotzdem gestaltet bleiben,
     bitte auflisten, damit er beim Umbau nicht verschwindet
   · Entwurf zeigt ihn, Code kennt ihn nicht — dann sag, woher die Daten kämen
     und ob dafür eine Rechnung in src/lib oder ein Feld im Schema fehlt

Ergänze am Ende einen Abschnitt „Was ich nicht umsetzen würde": Stellen, an
denen der Entwurf gegen eine Zusage der App verstösst — etwas Antippbares
oberhalb des unteren Drittels auf dem Telefon, eine Berührfläche unter 56 px,
eine gerechnete Zahl als Eingabefeld, eine 0,00 EUR dort, wo „nicht bewertbar"
stehen muss, ein Kontrast unter WCAG AA. Der Entwurf ist Vorlage, nicht Befehl.

Trage die dauerhaften Regeln zusätzlich in AGENTS.md ein, damit jede weitere
Sitzung sie ohne diesen Prompt kennt. Kurz, als Abschnitt „Regeln der
Oberfläche", unterhalb des Next.js-Blocks:
- Sprache der Oberfläche ist Deutsch. Statt ß wird ss geschrieben, Umlaute
  bleiben Umlaute. Auch Bezeichner und Kommentare im Code sind deutsch.
- Farben nur über die semantischen Rollen aus globals.css. Keine Hexwerte und
  keine Tailwind-Rohfarben im JSX.
- Kleinste Berührfläche 56 px (h-tap), kleinster Abstand zwischen zwei
  auslösenden Flächen 8 px (gap-tapgap).
- Auf dem Telefon liegt alles Auslösende im unteren Drittel.
- Jede gerechnete Zahl wird genau einmal gerechnet, in src/lib, mit Test. Eine
  Komponente rechnet nicht, sie zeigt.
- Abgeleitete Zahlen sind sichtbar abgeleitet und nie ein Eingabefeld.
- Ein leerer Wert ist ein Gedankenstrich, nie 0. Ein fehlender Preis ist
  „nicht bewertbar", nie 0,00 EUR.
```

---

## U1 — Grundlage und Bausteine

Der einzige Prompt, der quer durch alle Screens wirkt. Alles Weitere setzt
voraus, dass er gelaufen ist.

```text
Lies über das claude_design MCP die Dateien „Inventur Design-Grundlage.dc.html"
und „support.js" aus dem Projekt 54a06c07-7f63-4369-843c-b5c851465031, sowie
docs/design-abgleich.md, falls vorhanden.

Ziel: src/app/globals.css und die Bausteine unter src/ui/ bringen den Entwurf,
und zwar so, dass jeder folgende Screen nur noch zusammensetzt.

Zwei Dinge vorweg, weil sie den ganzen Prompt tragen:

Erstens ist das Entwurfs-HTML eine Vorlage und keine Quelle. Übernimm daraus
Werte und Verhältnisse — Farben, Abstände, Grössen, Zustände. Übernimm kein
Markup und keine Zeile aus support.js. Das Ergebnis ist React 19 mit Tailwind
v4, nicht eine eingebettete Seite.

Zweitens steht in globals.css bereits eine vollständige Grundlage: die
Rollenfarben primary / confirm / attention / danger, jeweils mit Aufschrift-,
Text- und gedeckter Fassung, in Hell und Dunkel, sowie --spacing-tap,
--spacing-tapgap, --radius-ctl und die Stufe --text-count. Diese Struktur bleibt.
Weicht der Entwurf in einem Wert ab, ändere den Wert der Variablen — nicht die
Struktur, und lege keine zweite Variable daneben. Fehlt eine Rolle ganz, ergänze
sie nach demselben Muster: Fläche, Aufschrift, Text, gedeckte Fläche, gedeckte
Aufschrift, in beiden Modi.

Prüfe jedes geänderte Paar auf Kontrast und schreibe das Verhältnis als
Kommentar an die Variable, so wie es die vorhandenen Kommentare tun. Flächen mit
Aufschrift müssen 4,5:1 halten. Fällt ein Wert aus dem Entwurf darunter, nimm
ihn nicht, sondern die nächstdunklere beziehungsweise -hellere Stufe, und
vermerke die Abweichung.

Baue dann die Bausteine, die der Entwurf zeigt, als eigene Dateien unter src/ui.
Jeder mit den Zuständen aus dem Entwurf — Ruhe, gedrückt, gesperrt, fokussiert —
und jeder in Hell und Dunkel richtig:

  schaltflaeche.tsx     primär, sekundär, volle Breite; die Rolle als Eigenschaft
                        (primary / confirm / danger), nicht als durchgereichte
                        Klassenliste
  listenzeile.tsx       Titel, Unterzeile, rechtsbündiger Zahlenwert,
                        Statuspunkt; 56 px hoch, ganz antippbar
  hinweisleiste.tsx     volle Breite, Rollen Achtung und Warnung
  kennzahl.tsx          grosse Zahl über kleiner Beschriftung
  abschnitt.tsx         Überschrift, die beim Scrollen oben klebt
  zustand.tsx           Leerzustand und Ladezustand, je mit genau einer
                        nächsten Handlung

Ziffernblock und Mengenfeld gibt es bereits in src/ui. Gleiche sie an den
Entwurf an, ohne ihre Schnittstelle zu ändern — beide werden von mehreren Masken
benutzt, und ihre Kommentare erklären, warum sie sind, wie sie sind. Widerspricht
der Entwurf einem dieser Gründe, setze ihn nicht um, sondern sag mir warum.

Kein Baustein rechnet. Keiner holt Daten. Jeder bekommt, was er zeigt.

Zu jedem Baustein ein Kopfkommentar in dem Ton, den die Dateien in src/ui schon
haben: was er ist, und warum er so und nicht anders. Keine Beschreibung dessen,
was der Code ohnehin sagt.

Rühre in diesem Schritt keine Seite unter src/app an — ausser dort, wo ein
geänderter Variablenwert eine Seite sichtbar kaputtmacht.

Prüfe am Ende: npx tsc --noEmit, npm run lint, npm test. Starte dann den
Dev-Server über die Vorschau und zeige mir eine Seite in Hell und Dunkel.
```

---

## U2 — Zählbildschirm

```text
Setze „Inventur Zaehlbildschirm.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/zaehlung/[id]/zaehlmaske.tsx um.

Diese Maske läuft bereits und ist der Kernbildschirm der App. Es geht um
Darstellung, nicht um Verhalten: die Zustände, der Datenfluss, die
Offline-Warteschlange aus src/offline und die Tastenauswertung in
src/lib/zaehlung.ts bleiben unangetastet. Zeigt der Entwurf einen Zustand, den
die Maske nicht kennt, bau ihn nicht heimlich — nenn ihn mir am Ende.

Verwende die Bausteine aus src/ui und die Rollenfarben aus globals.css. Wo der
Entwurf etwas zeigt, das noch kein Baustein ist und mehr als einmal vorkommt,
leg den Baustein an, statt die Klassen in die Maske zu schreiben.

Diese Punkte müssen nach dem Umbau nachweislich noch stimmen, sie sind die
Zusagen dieses Bildschirms:
- Ausser der Liste-Schaltfläche im Kopf liegt nichts Antippbares oberhalb des
  unteren Drittels.
- Der Ziffernblock bleibt unter 270 px, damit das auch auf kleinen Geräten hält.
- Die Weiter-Taste beschriftet sich mit dem, was sie speichert.
- Die Komma-Taste ist gesperrt und sichtbar ausgegraut, wenn der Zählmodus keine
  Kommazahlen kennt.
- Ein leeres Wertfeld zeigt einen Gedankenstrich, keine Null.
- Die Kontrollzeile („= 51 Flaschen") erscheint erst mit Eingabe.
- Der Fuss respektiert env(safe-area-inset-bottom).

Prüfe mit npx tsc --noEmit, npm run lint und npm test. Zeige mir dann in der
Vorschau bei 390 x 844: leerer Artikel mit zwei Feldern, Artikel mit Wert und
Kontrollzeile, Fass-Artikel mit 0,5, und den Zustand mit dem grünen
Abschlussbalken — je in Hell und Dunkel.
```

---

## U3 — Listenansicht innerhalb der Zählung

```text
Setze „Inventur Listenansicht.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/zaehlung/[id]/uebersicht.tsx um.

Gebaut, wird verfeinert: Gruppierung, Sortierung und die Abschlusslogik bleiben,
wie sie sind. Nur die Darstellung ändert sich.

Vier Eigenheiten dieser Liste, die der Umbau nicht verlieren darf:
- Dieselbe Kategorie darf mehrfach als Abschnitt auftauchen. Das ist kein
  Gruppierungsfehler, sondern der Laufweg durch das Lager — 14 Kategorien
  zerfallen in 26 Abschnitte. Fasse sie nicht zusammen.
- Kategorieüberschriften kleben beim Scrollen oben. Nimm den Baustein aus src/ui.
- Der bernsteinfarbene Punkt steht nur an Werten, die noch offline auf dem Gerät
  liegen. Angekommene Werte tragen keinen Punkt — der Normalfall blinkt nicht.
- Beim Abschlussversuch vermisste Zeilen bleiben bernsteinfarben hinterlegt, und
  die Leiste oben zählt sie.

Die Fussschaltfläche behält ihre drei Aufschriften: grün und aktiv, gesperrt mit
der Zahl der fehlenden Artikel, und der sendende Zustand.

Zeilenhöhe 56 px, die ganze Zeile ist antippbar. Zahlen in Tabellenziffern.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir die Liste
in der Vorschau in Hell und Dunkel — einmal mit fehlenden Artikeln und
Fehlermeldung, einmal vollständig.
```

---

## U4 — Wareneingang, Prüfliste

```text
Setze „Inventur Wareneingang.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in die Prüfliste in
src/app/lieferungen/[id]/pruefmaske.tsx um.

Diese Datei ist mit rund 1100 Zeilen die grösste der App und trägt mehrere
Ansichten. Fass in diesem Schritt nur die Prüfliste an — Kopf, Zeilen, Fuss.
Zeilenmaske, Artikelsuche und Bestätigung kommen im nächsten Prompt.

Ist die Datei danach unübersichtlich, teile sie entlang der Ansichten in eigene
Dateien im selben Ordner. Der Zustand bleibt dabei an einer Stelle; die
Ansichten bekommen ihn übergeben.

Die Regel, an der dieser Bildschirm hängt: Die tatsächliche Menge startet auf
dem Wert des Lieferscheins. Wer nichts anfasst, bestätigt das Papier. Deshalb
gibt es keinen Fortschrittsbalken „14 von 18 geprüft" — falls der Entwurf einen
zeigt, setz ihn nicht um und sag mir Bescheid.

Was die Zeile trägt: Artikelname und Liefergebinde links, rechts die Mengen
nebeneinander in Tabellenziffern, jede mit kleiner Beschriftung darunter —
„bestellt" nur mit Bestellbezug, „Lieferschein", „tatsächlich". Bei Abweichung
darunter der Klartext („1 Kasten fehlt · 18,59 EUR · mit Bruch"). Fehlmenge
rot hinterlegt, Überlieferung bernsteinfarben, Übereinstimmung ruhig.

Die Beträge kommen aus src/lib/wareneingang.ts. Rechne in der Komponente nichts
nach — auch nicht „schnell mal" die Differenz zweier Mengen. Fehlt eine Zahl,
die der Entwurf zeigt, gehört sie als Funktion mit Test nach src/lib.

Die Fussschaltfläche behält ihre vier Fassungen: grün „Alles stimmt", blau mit
Zahl der Abweichungen, gesperrt mit Zahl der unerklärten Positionen, und nach
der Bestätigung der blosse Satz statt einer Schaltfläche.

Prüfe mit npx tsc --noEmit, npm run lint und npm test. Zeige mir in der Vorschau
bei 390 x 844 die fünf Zustände in Hell und Dunkel: leere Lieferung, drei
stimmige Positionen, eine Fehlmenge mit Bruch neben einer Überlieferung, mit
Bestellbezug also drei Mengenspalten, und bestätigt.
```

---

## U5 — Wareneingang, Unteransichten

```text
Setze „Inventur Wareneingang Unteransichten.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in die drei Unteransichten der
Wareneingangskontrolle um: Zeilenmaske, Artikelsuche und Bestätigung in
src/app/lieferungen/[id]/ (bislang alle in pruefmaske.tsx).

Gebaut, wird verfeinert. Jede der drei löst die Liste ab und füllt den
Bildschirm; das bleibt so.

Zeile korrigieren: ein bis drei Mengenfelder nebeneinander, je 80 px hoch.
„bestellt" ist nicht antippbar, „Lieferschein" und „tatsächlich" schalten um,
welches Feld der Ziffernblock beschreibt — beide müssen erreichbar bleiben, denn
ohne Bestellung wird der Lieferschein hier abgetippt. Das aktive Feld ist farbig
umrandet und hinterlegt. Fehlt etwas, erscheint darunter die Bruchfrage. Bruch
und Fehlmenge bleiben getrennt: das eine ist angekommen und unbrauchbar, das
andere war nie da, und beides wird verschieden reklamiert.

Artikel suchen: Suchfeld oben, Treffer in 56 px hohen Zeilen mit Name und
Liefergebinde, bereits erfasste mit dem Vermerk „· steht schon in der Liste".

Bestätigen: die Kennzahlen als Liste, Beschriftung links, grosse Zahl rechts.
Bei Abweichungen der Satz zur Gegenzeichnung und das Feld für den Fahrernamen.
Fehlt zu Positionen der Preis, steht „ohne Preis, nicht bewertbar" dabei — nie
eine 0,00 EUR.

Der Ziffernblock kommt aus src/ui und wird nicht kopiert. Braucht er für die
Zeilenmaske eine Fassung, die er nicht hat, erweitere ihn dort um eine
Eigenschaft, statt eine zweite Fassung anzulegen.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir alle drei
Ansichten in der Vorschau bei 390 x 844, in Hell und Dunkel.
```

---

## U6 — Lieferungsübersicht

```text
Setze „Inventur Lieferungsuebersicht.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/lieferungen/page.tsx um.
Telefon und Desktop.

Gebaut, wird verfeinert. Die Seite trägt oben das Formular zum Beginnen —
Lieferant mit Vorschlägen, Belegnummer, Datum mit heute vorbelegt, und die
Auswahl offener Bestellungen, die ganz fehlt, wenn es keine gibt. Darunter die
Lieferungen nach Datum absteigend.

Der Kontrollstand ist abgeleitet und kein gespeicherter Status. Im Entwurf heisst
das: eine ruhige Textangabe, kein Etikett, das nach Pflege aussieht. Wenn der
Entwurf daraus einen bunten Zustandschip macht, setz das nicht um — das würde
eine Pflegepflicht behaupten, die es nicht gibt.

Die vier Stände bleiben unterscheidbar, besonders „ungeprüft · ohne Positionen":
diese Lieferungen sind angelegt, aber nie erfasst, und verfälschen jede
Auswertung.

Leerzustand über den Baustein aus src/ui, mit dem Weg zur ersten Lieferung.

Prüfe mit npx tsc --noEmit, npm run lint und npm test. Zeige mir in der Vorschau
die Liste mit allen vier Ständen, in Hell und Dunkel, bei 390 x 844 und 1280 —
und den Zustand ohne offene Bestellungen.
```

---

## U7 — Bestellvorschlag

```text
Setze „Inventur Bestellvorschlag.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/bestellungen/ um: die
Vorschlagsmaske, die Seite der gespeicherten Bestellung und die Druckansicht.

Gebaut, wird verfeinert. Die Rechnung liegt vollständig in src/lib/bestellung.ts
und bleibt dort — Verbrauch je Tag, Reichweite, Saisonzuschlag, das Aufrunden
auf ganze Gebinde und der Abzug bereits bestellter Mengen. Die Maske zeigt das
Ergebnis und die drei Parameter im Kopf. Keine dieser Zahlen wird in der
Komponente noch einmal gerechnet.

Drei Zeilenzustände müssen sichtbar unterschieden bleiben:
1. Artikel ohne Kassenbezeichnung — der Bedarf ist unbekannt, nicht 0. Verbrauch,
   Bedarf und Fehlmenge zeigen einen Gedankenstrich, die Zeile bleibt sichtbar,
   die Menge wird von Hand gesetzt.
2. Artikel, der bei der letzten Zählung fehlte — der Vorschlag deckt den ganzen
   Bedarf, als wäre das Regal leer, und die Zeile sagt das.
3. Artikel ohne Einkaufspreis — der Positionswert ist „nicht bewertbar", niemals
   0,00 EUR, und die Zeile fehlt in der Summe mit einem Hinweis darunter.

Eine überschriebene Bestellmenge bleibt als Handeingriff markiert („von Hand ·
Vorschlag 11") und einzeln wie gesamt zurücksetzbar.

Die Druckansicht ist keine zweite Vorlage, sondern dieselbe Seite ohne ihre
Bedienelemente. Die Regeln dafür stehen im @media print-Block in globals.css und
an den Klassen .nur-schirm und .nur-druck. Leg keine zweite Komponente für den
Ausdruck an — das wären zwei Stellen, an denen sich eine Spalte ändern müsste.

Prüfe mit npx tsc --noEmit, npm run lint und npm test. Zeige mir in der Vorschau
den Vorschlag bei 1280 in Hell und Dunkel und die Druckansicht.
```

---

## U8 — Auswertung

```text
Setze „Inventur Auswertung.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/auswertung/ um. Vorrangig
Desktop bei 1280, dazu die mobile Fassung als Karten.

Gebaut, wird verfeinert. Die Rechnung steht in src/lib/auswertung.ts und
src/lib/auswertung-daten.ts und wird nicht angefasst: Anfangsbestand plus
Lieferungen minus Verkäufe ergibt den Sollbestand, minus Ist-Bestand ergibt den
Schwund.

Drei Fälle muss die Tabelle sichtbar unterscheiden, und sie sind der Grund,
warum es diese Seite überhaupt gibt:
1. Artikel ohne Einkaufspreis: „nicht bewertbar" in der Wertspalte, niemals
   0,00 EUR, und unter der Summe der Hinweis, wie viele Artikel deshalb fehlen.
2. Nicht schwundfähige Artikel: die Schwundzeile bleibt leer mit dem grauen
   Vermerk „ohne Schwundrechnung".
3. Kassenbezeichnungen ohne Zuordnung: bernsteinfarbene Leiste ganz oben mit
   Anzahl und Weg zur Zuordnung, weil die Auswertung ohne sie unvollständig ist.

Die Schwundspalte trägt die Farbe: kleiner Schwund neutral, auffälliger rot,
negativer bernsteinfarben — mehr gezählt als möglich deutet auf einen Zählfehler
oder eine nicht erfasste Lieferung, und das ist etwas anderes als Verlust.

Die Herleitung hinter einer Zeile ist wichtiger als jedes Diagramm: alle
Rechenschritte untereinander mit ihren Belegen — welche Lieferung, welcher
Umsatzimport, welche Zählung. Bau sie sorgfältig und lass sie beim Umbau nicht
zur Nebensache werden.

Zahlen rechtsbündig in Tabellenziffern, sortierbar nach Schwund.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir Tabelle,
Herleitung und die mobile Kartenfassung in der Vorschau, in Hell und Dunkel.
```

---

## U9 — Kassenimport

```text
Setze „Inventur Kassenimport.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/umsatz/ um, Desktop bei 1280.

Gebaut, wird verfeinert. Der Import selbst liegt in src/lib/kassenimport.ts und
bleibt dort.

Der eine Punkt, an dem diese Seite hängt: die Anzeige, ob der Zeitraum lückenlos
an den vorigen Import anschliesst. Lücken und Überschneidungen zwischen zwei
Importen zerstören jede Schwundrechnung, und sie müssen hier auffallen, nicht
erst in der Auswertung. Beide Fälle deutlich: „lückenlos" ruhig, „3 Tage fehlen
zwischen 01.08. und 04.08." als Hinweisleiste.

Wird diese Prüfung noch nicht gerechnet, dann gehört sie nach src/lib mit einem
Test, der Lücke, Überschneidung und Anschluss abdeckt — nicht in die Seite.

Nach dem Import führt die Seite unmittelbar weiter zu dem, was jetzt zu tun ist:
unbekannte Kassenbezeichnungen zuordnen, als auffällige Leiste mit Anzahl und
Weg dorthin.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir Übersicht,
Importschritt und beide Anschlussfälle in der Vorschau, in Hell und Dunkel.
```

---

## U10 — Kassenbezeichnungen zuordnen

```text
Setze „Inventur Zuordnung.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/umsatz/zuordnung/ um, Desktop
bei 1280.

Gebaut, wird verfeinert. Das ist der fehleranfälligste Bildschirm der App: hier
entscheidet sich, ob die Schwundrechnung stimmt. Er braucht Tempo und Sicherheit
zugleich.

Das Feld „Einheiten je Verkauf" ist der Kern und braucht die beste Erklärung des
ganzen Entwurfs: es sagt, wie viel eine Kassenbuchung vom Bestand abzieht. Ein
Glas Cola 0,2 l aus der Literflasche ist 0,2, ein Schnaps aus der 0,7er-Flasche
0,06, eine Flasche Bier über die Theke 1. Daneben steht immer die Auswirkung im
Klartext: „120 Verkäufe × 0,06 = 7,2 Flaschen Sudmare Gin". Diese Zeile kommt aus
src/lib/kassenzuordnung.ts, nicht aus einer Rechnung in der Komponente.

Drei Zeilenzustände: nicht zugeordnet auffällig, zugeordnet aber unbestätigt als
Vorschlag erkennbar, bestätigt ruhig. Vorschläge kommen aus Namensähnlichkeit
und werden nie wie eine Tatsache dargestellt — wer das übersieht, ordnet
„Veltins 0,3" der falschen Gebindegrösse zu und sucht den Schwund danach
monatelang.

Die Tastaturbedienung ist Teil des Designs und darf beim Umbau nicht verloren
gehen: Tab durch die Zeilen, Auswahl per Eingabe, Enter bestätigt und springt
weiter. Prüfe sie nach dem Umbau ausdrücklich in der Vorschau.

Oben der Zähler „7 von 84 offen" und der Filter „nur offene".

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir die drei
Zeilenzustände in Hell und Dunkel.
```

---

## U11 — Startseite

Ab hier entsteht Neues. Die Startseite ist bis heute das Next.js-Template.

```text
Setze „Inventur Startseite.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/page.tsx um. Telefon bei
390 x 844 und Desktop bei 1280.

Diese Seite gibt es noch nicht — src/app/page.tsx ist unverändert das
Next.js-Template und wird vollständig ersetzt, samt der Verweise auf Vercel und
die Next-Dokumentation.

Sie beantwortet drei Fragen in dieser Rangfolge:
1. Muss ich jetzt zählen? Grosse primäre Fläche „Zählung beginnen"; läuft heute
   schon eine Zählung, heisst sie „Zählung fortsetzen — 47 von 99 gezählt" mit
   Fortschritt.
2. Was ist offen? Kurze Liste konkreter Sätze, jeder mit dem Weg an die
   zuständige Stelle: Umsatzdaten seit drei Tagen nicht importiert,
   Kassenbezeichnungen ohne Zuordnung, Lieferung ohne Positionen.
3. Wie stand es zuletzt? Drei Kennzahlen der letzten abgeschlossenen Zählung —
   Bestandswert, Schwund in Prozent, Datum.

Die Daten dafür stehen schon in der Datenbank, aber die Abfragen gibt es noch
nicht. Leg sie als Server Component an und hol die Rechnung aus den vorhandenen
Modulen in src/lib — auswertung-daten.ts für Bestandswert und Schwund,
kassenzuordnung.ts für die offenen Bezeichnungen. Fehlt eine Zahl, schreib die
Funktion nach src/lib mit einem Test, nicht in die Seite. Die Offenpunkte-Liste
ist eine eigene Funktion, weil sie mehrere Quellen zusammenzieht: leg sie als
src/lib/offene-punkte.ts an, mit Test.

Darunter der Einstieg in die Bereiche Artikel, Lieferungen, Umsatz, Auswertung —
auf dem Telefon als Liste mit 56 px hohen Zeilen, auf dem Desktop als
Seitennavigation links. Verwende dafür die Listenzeile aus src/ui.

Betriebsname im Kopf, aus der Datenbank, nicht fest verdrahtet.

Zeige mir zum Schluss in der Vorschau beide Varianten — mit offener Zählung von
heute und ohne — in Hell und Dunkel, mobil und Desktop. Prüfe mit npx tsc
--noEmit, npm run lint und npm test.
```

---

## U12 — Zählung abgeschlossen

```text
Setze „Inventur Abschluss.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) als neuen Bildschirm unter
src/app/zaehlung/[id]/ um. Mobil und Desktop.

Neu. Bisher endet der Abschluss ohne eigenes Ergebnis. Dieser Bildschirm wird
direkt danach gezeigt und später aus der Zählungsliste wieder geöffnet — er ist
also keine Bestätigungsmeldung, sondern eine Seite mit eigener Adresse.

Oben eine ruhige Bestätigung: Datum, 99 von 99 Artikeln, Dauer, Name der
zählenden Person. Kein Konfetti, keine Vollbild-Feier.

Darunter drei Kennzahlen: Bestandswert, Anzahl nicht bewertbarer Artikel, Anzahl
Artikel mit auffälligem Schwund. Nicht bewertbar heisst: gezählt, aber ohne
hinterlegten Einkaufspreis — der Wert ist unbekannt und darf nie als 0 in eine
Summe einfliessen. Diese Zahl steht deshalb als eigene Kennzahl da und nicht als
Fussnote.

Dann der Bestand nach Kategorie mit gezählten Einheiten und Wert, rechtsbündig
in Tabellenziffern.

Die Werte kommen aus src/lib/auswertung.ts und src/lib/einheiten.ts. Fehlt die
Zusammenfassung je Kategorie, schreib sie dorthin mit einem Test — inklusive des
Falls, dass eine Kategorie ausschliesslich Artikel ohne Preis enthält.

Fuss: „Zur Auswertung" primär, „Werte ansehen" sekundär. Kein Bearbeiten — eine
abgeschlossene Zählung ist zu, und das muss der Bildschirm ausstrahlen.

Entwirf zusätzlich die Variante mit fehlenden Werten: gesperrter Zustand mit der
Erklärung, welche Artikel keinen Wert haben.

Prüfe mit npx tsc --noEmit, npm run lint und npm test und zeige mir beide
Varianten in der Vorschau, in Hell und Dunkel.
```

---

## U13 — Artikelstamm

```text
Setze „Inventur Artikelstamm.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in src/app/artikel/ um, Desktop und mobil.

Neu, und mehr als Gestaltung: src/app/artikel/page.tsx ist ein dreizeiliger
Stub. Es entstehen die Liste und die Detail-/Bearbeitungsansicht samt den
Serveraktionen zum Speichern.

Liste: 99 Artikel, Suchfeld, Filter nach Kategorie und nach aktiv/stillgelegt.
Spalten Name, Liefergebinde, Kategorie, Zählmodus, Einkaufspreis, Sortiernummer.
Zeilen 56 px. Stillgelegte Artikel ausgegraut, aber sichtbar — in dieser App
wird kein Artikel gelöscht, nur stillgelegt, weil an ihm Zählungen und
Lieferungen hängen.

Derselbe Name darf mehrfach vorkommen, wenn er in mehreren Gebindegrössen
geführt wird. „Coca Cola 12 x 1,0" und „Coca Cola 24 x 0,33" sind zwei Artikel.
Das Liefergebinde steht deshalb immer direkt neben dem Namen und wird nie
weggekürzt, auch nicht auf dem Telefon.

Detailansicht in klar getrennten Blöcken: Identität, Lieferung, Zählung, Preis,
Schalter. Gebindeart und Zählmodus sind getrennt und bleiben getrennt — Wein
kommt im Karton, wird aber einzeln im Regal gezählt. Erkläre das in der
Oberfläche in einem Satz, nicht nur im Code.

Der Preis trägt seinen Bezug: je Gebinde oder je Einheit. Darunter live die
abgeleitete Angabe „18,59 EUR je Kasten = 0,77 EUR je Flasche". Diese Umrechnung
kommt aus src/lib/einheiten.ts und wird hier nicht zum zweiten Mal geschrieben —
genau daran ist die Excel gestorben, die diese App ablöst.

Ein leeres Preisfeld bedeutet ausdrücklich „Preis nicht bekannt" und ist so
beschriftet. Es bedeutet nicht 0, und es darf nicht als 0 gespeichert werden.

Alle abgeleiteten Angaben sind sichtbar berechnet — anderer Hintergrund, kein
Eingabefeld. Nach dem Umbau muss auf einen Blick klar sein, welche Zahl
eingegeben und welche gerechnet ist.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir Liste und
Detail in der Vorschau, in Hell und Dunkel, bei 390 x 844 und 1280.
```

---

## U14 — Artikelstamm importieren

```text
Setze „Inventur CSV-Import.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) als Importstrecke unter src/app/artikel/
um, Desktop bei 1280.

Die Oberfläche ist neu, die Rechnung nicht: src/lib/artikelimport.ts und
src/lib/csv.ts leisten das Einlesen und den Abgleich bereits und sind durch
tests/artikelimport.test.ts und tests/csv.test.ts gedeckt. Bisher gibt es dazu
keine Seite. Bau die Seite auf diese Module und nicht daneben — kein zweites
Parsen im Client.

Drei Schritte mit sichtbarem Fortschritt:
1. Datei wählen: Ablagefläche, darunter die erwarteten Spalten und ein Link auf
   eine Beispieldatei. Ein Satz sagt, dass der Import über Name plus
   Liefergebinde abgleicht und beliebig oft wiederholt werden kann.
2. Vorschau — der wichtigste Schritt. Tabelle mit farbiger Kennzeichnung je
   Zeile: grün neu, blau geändert mit altem Wert durchgestrichen neben dem
   neuen, grau unverändert, rot nicht lesbar mit konkretem Grund („Spalte
   ek_preis_gebinde_eur enthält '8,58 EUR' — erwartet wird eine Zahl"). Oben die
   Zusammenfassung, dazu Filter auf nur Änderungen und nur Fehler.
3. Bestätigen: Zusammenfassung und „Import ausführen", gesperrt solange
   Fehlerzeilen bestehen. Danach das Protokoll.

Die farbige Kennzeichnung ist eine Aussage über die Daten und keine Dekoration:
Farbe allein darf sie nicht tragen. Jede Zeile sagt zusätzlich in Worten, was
mit ihr geschieht.

Gibt src/lib/artikelimport.ts die Unterscheidung neu / geändert / unverändert /
fehlerhaft noch nicht in dieser Form zurück, erweitere das Modul und den Test.
Leite sie nicht in der Seite ab.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir alle drei
Schritte in der Vorschau, in Hell und Dunkel, mit einer Beispieldatei, die
mindestens einen Fehler enthält.
```

---

## U15 — Lieferungen erfassen

```text
Setze „Inventur Lieferungen.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) als Erfassungsmaske für Lieferpositionen
um, Desktop und mobil. Die Übersicht darin ist bereits durch U6 abgedeckt —
bau hier nur die Erfassung.

Neu. Sie entsteht am Lieferschein entlang, oft im Stehen an der Rampe. Der
Eingabefluss muss ohne Mausklick auskommen: Artikel suchen, Anzahl tippen,
Enter, nächste Zeile. Bereits erfasste Positionen stehen darüber und sind
änderbar. Prüfe diesen Fluss nach dem Bau ausdrücklich mit der Tastatur.

Je Position sichtbar: Artikelname, Liefergebinde, Anzahl Gebinde, und daraus
abgeleitet die Einheiten („4 Kästen = 96 Flaschen") sowie der Positionswert. Die
Umrechnung kommt über gesamtEinheiten aus src/lib/einheiten.ts — nicht über eine
zweite Formel in dieser Maske. Abgeleitete Zahlen sind als solche erkennbar und
keine Eingabefelder.

Unten die Summe und „Lieferung speichern".

Die mobile Fassung ist dieselbe Erfassung als Einzelposition im Vollbild, mit
dem Ziffernblock aus src/ui.

Bau die Maske auf die vorhandene Route src/app/api/lieferung/[id]/positionen und
auf src/lib/wareneingang.ts. Fehlt dort etwas, ergänze es dort.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir beide
Fassungen in der Vorschau, in Hell und Dunkel.
```

---

## U16 — Wareneingang, die Sonderfälle

```text
Setze „Inventur Wareneingang Sonderfaelle.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) in die vorhandene Wareneingangskontrolle
unter src/app/lieferungen/[id]/ um.

Neu in der Oberfläche, vorbereitet im Datenmodell: Leergutposition,
ekPreisCentLieferschein, bestellpositionId, nachlieferungZugesagtBis und die
Bildpfade an Lieferung stehen bereits in prisma/schema.prisma. Lies das Schema,
bevor du beginnst, und leg keine Felder doppelt an.

Fünf Fälle, jeder muss sich in den vorhandenen Aufbau einfügen — Kopf,
scrollende Liste, feste Fussschaltfläche — und keiner darf den Regelfall
aufwendiger machen. Das ist die eigentliche Anforderung dieses Prompts: An der
Rampe ist der Regelfall, dass alles stimmt. Wer für fünf Sonderfälle fünf
Schaltflächen in die Zeile legt, hat den Regelfall verteuert.

1. Leergut. Eigener Block unter der Ware, so wie er auch auf dem Lieferschein
   steht. Je Zeile freie Bezeichnung, Rückgabemenge laut Lieferschein,
   tatsächlich mitgegebene Menge, optional Pfand je Einheit.
2. Preisabweichung. Fällt in der Zeile auf, ohne den Mengenabgleich zu
   verdecken. Die Frage, ob der neue Preis in den Artikelstamm übernommen wird,
   darf an der Rampe nicht blockieren — sie gehört später beantwortet.
3. Ersatzartikel. Bestellt Veltins 30 l, geliefert Veltins 50 l. Die Zeile lässt
   sich auf einen anderen Artikel umstellen, ohne den Bezug zur Bestellzeile zu
   verlieren; beide Artikel bleiben gleichzeitig sichtbar.
4. Nachlieferung. Eine Zusage, keine Fehlmenge — sie darf nicht als Reklamation
   zählen. Datum eingeben, Zeile kennzeichnen.
5. Belege. Foto des Lieferscheins und Unterschriftsfläche im Bestätigungsschritt.
   Die Unterschrift wird mit dem Finger geleistet, während der Fahrer daneben
   steht: die Fläche gross, der Weg dorthin kurz. Ablage in Supabase Storage
   nach dem Muster in src/lib/supabase/.

Was sich aus vorhandenen Daten ergibt, wird nicht gespeichert: ob eine Lieferung
Abweichungen hatte, folgt aus den Abweichungen; was eine Abweichung wert ist,
aus Menge und Lieferscheinpreis. Gespeichert wird nur, was neue Tatsache ist.

Rechnungen für Pfand, Preisdifferenz und Ersatzmengen gehören nach
src/lib/wareneingang.ts, mit Tests. Ergänze tests/wareneingang.test.ts.

Prüfe mit npx tsc --noEmit, npm run lint und npm test. Zeige mir in der Vorschau
je Fall den Normalzustand, den Fall selbst und den Fehlerzustand, in Hell und
Dunkel, bei 390 x 844.
```

---

## U17 — Abweichungen und Reklamation

```text
Setze „Inventur Abweichungen.dc.html" (claude_design MCP, Projekt
54a06c07-7f63-4369-843c-b5c851465031) als neue Nachverfolgung unter
src/app/lieferungen/ um. Desktop bei 1280 und mobil.

Neu in der Oberfläche. Die Tabellen Abweichung und Abweichungsereignis stehen
bereits in prisma/schema.prisma — lies sie, bevor du beginnst.

Hier sitzt die Betriebsleitung am nächsten Morgen und arbeitet ab, was an der
Rampe aufgefallen ist. Übersicht über alle Lieferungen hinweg, nach Alter
sortiert: je älter, desto dringender, weil Reklamationsfristen laufen. Sortiere
also nicht nach Betrag, auch wenn das zunächst naheliegt.

Arten farblich unterschieden: Fehlmenge, Überlieferung, Bruch, falscher oder
Ersatzartikel, Preisabweichung. Status als schmale Folge in der Zeile — offen,
reklamiert, Gutschrift erwartet, erledigt, dazu verworfen für den Fall, dass der
eigene Zählfehler auffiel. Keine Ampel: eine Ampel sagt nur gut oder schlecht,
und hier zählt, wie weit die Sache ist.

Detailansicht: die drei Mengen nebeneinander, Foto des Lieferscheins,
Unterschrift des Fahrers, Notizfeld und der Verlauf mit wer wann welchen Status
gesetzt hat. Der reklamierte Betrag ist gerechnet aus Menge und
Lieferscheinpreis und als gerechnet erkennbar; eingetragen wird nur die
tatsächlich erhaltene Gutschrift.

Oben drei Kennzahlen: offener Reklamationsbetrag, Abweichungen der letzten
30 Tage, und die Übersicht je Lieferant — Anzahl Lieferungen, Anteil
fehlerfreier Lieferungen, Summe der Abweichungen. Diese Lieferantenübersicht ist
der eigentliche Wert des Bildschirms: sie ist das Argument im nächsten Gespräch
mit dem Aussendienst. Gib ihr entsprechend Platz.

Die Auswertung je Lieferant gehört als Funktion nach src/lib/wareneingang.ts
oder in ein eigenes Modul src/lib/reklamation.ts, mit Test — nicht in die Seite.

Prüfe mit npx tsc --noEmit, npm run lint und npm test, und zeige mir Übersicht
und Detail in der Vorschau, in Hell und Dunkel.
```

---

## U18 — Durchsicht über alle Screens

Zum Schluss, wenn mehrere Prompts gelaufen sind. Er sucht das, was beim
Screen-für-Screen-Vorgehen zwangsläufig auseinanderläuft.

```text
Sieh dir die Oberfläche der App im Ganzen an, nachdem die Screens einzeln aus
dem Design übernommen wurden. Ändere zuerst nichts, sondern berichte.

Sieben Fragen:

1. Steht irgendwo noch eine Hexfarbe oder eine Tailwind-Rohfarbe (bg-zinc-800,
   text-red-500) im JSX statt einer Rolle aus globals.css?
2. Gibt es Bausteine, die in mehreren Seiten fast gleich, aber nicht gleich
   sind — zwei Fassungen derselben Hinweisleiste, drei Arten von Kennzahlblock?
   Nenne sie mit Fundstellen.
3. Rechnet eine Komponente etwas, das in src/lib gehört? Suche nach Arithmetik
   in .tsx-Dateien und prüfe jede Fundstelle. Das ist die wichtigste der sieben
   Fragen: Diese App löst eine Excel ab, in der dieselbe Umrechnung an mehreren
   Stellen stand und auseinanderdriftete.
4. Zeigt irgendwo eine 0 oder 0,00 EUR, wo ein Gedankenstrich oder „nicht
   bewertbar" stehen muss?
5. Liegt auf einem mobilen Screen etwas Antippbares oberhalb des unteren
   Drittels, das kein Ausweg-Knopf im Kopf ist? Ist irgendeine Berührfläche
   unter 56 px hoch oder liegen zwei näher als 8 px beieinander?
6. Gibt es einen Zustand ohne nächste Handlung — einen Leerzustand, einen
   Fehler, eine gesperrte Schaltfläche ohne Erklärung, warum sie gesperrt ist?
7. Trägt jeder Screen Hell und Dunkel gleichwertig, und hält jede Fläche mit
   Aufschrift 4,5:1?

Liefere die Befunde als Liste mit Datei und Zeile, nach Gewicht sortiert, und
sag mir zu jedem in einem Satz, was du ändern würdest. Erst nach meiner Freigabe
umsetzen.
```

---

## Wenn ein Prompt zu gross wird

Zwei Fälle, in denen es sich lohnt, einen Prompt zu teilen statt ihn zu wiederholen:

- **Die Prüfmaske.** `pruefmaske.tsx` trägt vier Ansichten in einer Datei. U4 und
  U5 sind deshalb schon getrennt. Wird auch das noch zu viel, geh Ansicht für
  Ansicht und teile die Datei dabei auf — der Zustand bleibt an einer Stelle.
- **Artikelstamm und Import.** U13 baut Liste, Detail und Serveraktionen auf
  einmal. Wer lieber in zwei Schritten arbeitet, nimmt zuerst die Liste, dann
  das Detail; der Import in U14 hängt an keinem von beiden.

## Was über allen Prompts steht

Der Entwurf zeigt, wie es aussehen soll. Er weiss nichts davon, dass diese App
eine Excel ablöst, in der dieselbe Umrechnung an mehreren Stellen von Hand stand
und auseinanderdriftete. Deshalb gilt bei jeder Übernahme: Jede Zahl, die
gerechnet wird, wird genau einmal gerechnet — in `src/lib`, mit Test. Zeigt ein
Screen eine abgeleitete Zahl, ist sie sichtbar abgeleitet und wird kein
Eingabefeld. Wo der Entwurf und diese Regel sich widersprechen, gewinnt die
Regel, und der Widerspruch gehört gemeldet, nicht stillschweigend aufgelöst.
