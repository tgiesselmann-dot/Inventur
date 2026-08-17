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


## U8 — Auswertung


## U9 — Kassenimport

 









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
