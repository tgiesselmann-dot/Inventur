# Design-Abgleich

Abgleich der 17 Entwurfsdateien aus dem Claude-Design-Projekt (Stand 08.08.2026)
mit dem Code unter `src/`. Grundlage: `Inventur Design-Grundlage.dc.html` sowie
die 16 Bildschirm-Entwürfe; auf Code-Seite `src/app/globals.css`, `src/ui/`,
die Seiten unter `src/app/` und die Rechenmodule unter `src/lib/`.

Kurzfassung: Das Token-System der Grundlage steht in globals.css bereits
nahezu deckungsgleich. Die Bildschirm-Entwürfe halten sich überwiegend selbst
daran, benutzen aber durchgängig Rohfarben (es sind statische HTML-Mockups) und
brechen an einigen Stellen die eigenen Zusagen — diese Stellen stehen im
letzten Abschnitt. Die meiste Arbeit liegt nicht bei den Tokens, sondern bei
drei Dingen: der Startseite (im Code noch die Next.js-Vorlage), dem
Artikelstamm (im Code ein Stub) und dem Abweichungs-Bildschirm (Schema
vollständig vorhanden, UI fehlt ganz).

---

## 1. Tokens

### Farbrollen

Die Grundlage definiert das Rollensystem wörtlich so, wie es in globals.css
steht — inklusive der `*-soft-on`-Stufen, die der `@theme`-Block der Grundlage
auslässt, ihr `:root` aber definiert.

| Entwurf (Hell / Dunkel) | Vorhandenes Token | Befund |
|---|---|---|
| Grund `#fafafa` / `#09090b` | `--bg` | deckt sich |
| Fläche `#ffffff` / `#18181b` | `--surface` | deckt sich |
| Fläche 2 `#f4f4f5` / `#27272a` | `--surface-2` | deckt sich |
| Rand `#e4e4e7` / `#3f3f46` | `--border` | deckt sich |
| Rand stark `#d4d4d8` / `#52525b` | `--border-strong` | deckt sich |
| Text `#18181b` / `#fafafa` | `--text` | deckt sich |
| Text gedämpft `#52525b` / `#a1a1aa` | `--text-muted` | deckt sich |
| Primär `#0369a1` / `#0ea5e9`, on/text/soft/soft-on | `--primary`, `--primary-on`, `--primary-text`, `--primary-soft`, `--primary-soft-on` | deckt sich |
| Bestätigung `#047857` / `#34d399` (+ Stufen) | `--confirm`-Familie | deckt sich |
| Achtung `#f59e0b` (+ Stufen) | `--attention`-Familie | deckt sich |
| Warnung `#b91c1c` / `#f87171` (+ Stufen) | `--danger`-Familie | deckt sich |
| Fokus `#0284c7` / `#38bdf8` | `--focus` | deckt sich |

### Rohfarben in den Bildschirm-Entwürfen

Die 16 Bildschirm-Entwürfe sind statisches HTML mit Hexwerten. Die meisten
Werte sind exakt die Rollenwerte von oben — im Code steht dann die Rolle, nie
der Hexwert. Darüber hinaus tauchen Farben auf, für die Folgendes gilt:

| Entwurf | Vorhandenes Token | Befund |
|---|---|---|
| `#a1a1aa` als sichtbarer Text auf Hell (Platzhalter, „—", „übersprungen", „ausgenommen", „ohne Schwundrechnung") | — | Entwurf benutzt eine Rohfarbe, für die es eine semantische Rolle gibt: **`text-muted`**. `#a1a1aa` auf Weiss hat nur ≈2,3–2,8:1 und fällt unter AA — die Rolle heilt zugleich den Kontrast. |
| `#71717a` als Text auf dunklen Flächen (`#18181b`, `#09090b`, `#27272a`) | — | Rohfarbe mit vorhandener Rolle: **`text-muted`** (dunkel = `#a1a1aa`, 7:1). `#71717a` auf `#18181b` hat nur ≈3,7:1. |
| `#3f3f46` für Zahlenspalten/Sekundärtext hell | — | Rohfarbe mit vorhandener Rolle: **`text`** oder **`text-muted`** — eine dritte Textstufe gibt es nicht und sie fehlt nicht. |
| `#71717a` für Spaltenköpfe auf `#f4f4f5` | — | Rohfarbe mit Rolle: **`text-muted`** auf **`surface-2`**. Das Entwurfspaar liegt mit ≈4,4:1 knapp unter AA, `text-muted` (`#52525b`) besteht. |
| Gedrückt-Farben `#075985`, `#065f46`, `#38bdf8`, `#6ee7b7` | — | fehlt und muss entschieden werden: globals.css kennt für „gedrückt" nur `.tap` (scale 0.97), keinen Farbwechsel. Entweder je Rolle eine `*-active`-Stufe ergänzen oder beim reinen Scale bleiben. Empfehlung: beim Scale bleiben, keine neuen Töne. |
| Hinweisleisten-Ränder `#fcd34d`, `#fca5a5`, `#a7f3d0`, `#92400e` | — | Entwurf weicht ab: der Code setzt Hinweisleisten randlos auf `*-soft` + `*-soft-on`. Eine eigene Randstufe je Rolle gibt es nicht; sie einzuführen hiesse vier neue Token für einen Zierrand. Randlos lassen. |
| Zweite Textstufe in Leisten (`#92400e`, `#991b1b`, `#78350f`, `#fde68a`/`#fcd34d` gemischt) | — | Rohfarben, für die **eine** Rolle existiert: **`*-soft-on`**. Auf eine Stufe vereinheitlichen. |
| Violett `#7c3aed` / `#a78bfa` (Art „Preisabweichung" im Abweichungs-Entwurf) | — | fehlt — und sollte nicht ergänzt werden. Die Grundlage sagt „vier semantische Rollen"; eine fünfte Farbe nur für eine Abweichungsart bricht das System (siehe Abschnitt „Was ich nicht umsetzen würde"). |
| `#0284c7` als Artfarbe „Überlieferung" | `--focus` | Zweckentfremdung des Fokus-Tokens als Kategorienfarbe — nicht übernehmen, `primary-text` verwenden. |
| Feinstufen `#141416`, `#1c1c1f`, `#232326`, `#c4c4c8`, `#ebebee`, `#e9e9ec`, `#f6fefb`, `#f7fcff`, `#fffdf5`, `#1c1917`, `#0c4a6e`, `#573015`, `#7dd3fc` | — | Mockup-Nuancen ohne Rolle (Zeilentönungen, Tastenabstufungen, Hover). Auf die nächstliegende Rolle runden (`surface`, `surface-2`, `*-soft`), nicht als Token ergänzen. |

### Abstände

| Entwurf | Vorhandenes Token | Befund |
|---|---|---|
| Berührfläche 56 px | `--spacing-tap` (`h-tap`, `min-h-tap`, `w-tap`) | deckt sich |
| Abstand auslösender Flächen 8 px | `--spacing-tapgap` (`gap-tapgap`) | deckt sich |
| Raster 2/4/6/8/10/12/14/16/20/24/28 px | Tailwind-Skala (`gap-2`, `p-4` …) | deckt sich — kein eigenes Token nötig |
| Fester Kopf mobil 88 px, Zeilenhöhe 64 px, Home-Zone 34 px | — | Layoutmasse, keine Token; im Code je Maske gesetzt. Deckt sich der Sache nach. |

### Radien

| Entwurf | Vorhandenes Token | Befund |
|---|---|---|
| 10 px (Felder, Tasten, Buttons) | `--radius-ctl` (`rounded-ctl`) | deckt sich |
| 12 px (Karten, Ziffernblock-Tasten in einzelnen Entwürfen, mobile Buttons) | Tailwind `rounded-xl` | deckt sich über die Standardstufe. Achtung: einige Entwürfe setzen dieselbe Taste mal mit 10, mal mit 12 px — im Code gilt einheitlich `rounded-ctl`. |
| 14/16 px (Desktop-Rahmen), 5/6 px (Badges, Chips) | `rounded-2xl`, `rounded-md` | deckt sich über Standardstufen |
| 28 px (Telefonrahmen) | — | nur Mockup-Rahmen, kommt in der App nicht vor |

### Schriftstufen

Die Grundlage definiert sieben Stufen. Nur eine davon existiert als Token:

| Entwurf | Vorhandenes Token | Befund |
|---|---|---|
| Zählwert 48/1.0, 600 | `--text-count` (`text-count`) | Token vorhanden, aber **ungenutzt**: die Zählmaske setzt `text-3xl` (30 px). Entwurf weicht vom Code ab — der Code muss auf `text-count` umgestellt werden, nicht das Token geändert. |
| Titel 28/1.2, 600 | — | fehlt und muss ergänzt werden (Tailwind kennt 24 und 30, nicht 28) — z. B. `--text-titel`. |
| Zeilentitel 17/1.35, 500 | — | fehlt und muss ergänzt werden (Tailwind kennt 16 und 18) — z. B. `--text-zeile`. Der Code nutzt heute `text-base` (16). |
| Unterzeile 14/1.4, 400 gedämpft | `text-sm` | deckt sich |
| Abschnitt 13/1.2, 600, Versalien, 0.06em | — | fehlt und muss ergänzt werden (Tailwind kennt 12 und 14) — z. B. `--text-abschnitt`. Der Code nutzt heute `text-xs` (12) für Abschnittsköpfe. |
| Beschriftung 12/1.2, 500, Versalien, 0.08em | `text-xs` | deckt sich |
| ID · Mono 13/1.4, 400 | — | fehlt (13 px) — kann die Abschnitts-Stufe mitnutzen; Geist Mono ist als `--font-mono` vorhanden. |
| Bildschirm-Entwürfe: Zwischengrössen 10.5, 11, 12.5, 13.5, 15, 19, 22, 26, 30, 34, 36, 40, 44, 56 px | — | Mockup-Typografie ausserhalb der eigenen Grundlagen-Skala. Nicht übernehmen — beim Umsetzen auf die sieben Stufen der Grundlage runden. |

Ebenfalls deckungsgleich: `tabular-nums` auf `body`, `.tap` (90 ms, scale 0.97),
`.fokus` (2 px + 2 px Abstand), Dunkelmodus an der Klasse `.dark` statt
Medienabfrage, die Druckregeln (`.nur-druck`/`.nur-schirm`, Input-Reset, A4).

---

## 2. Bausteine

Was in `src/ui` liegt, was kopiert in Seiten steckt, was ganz fehlt.
Fundstellen der Kopien stehen in Klammern.

| Baustein (Entwurf) | Stand im Code |
|---|---|
| **Ziffernblock** (4×4, 56-px-Tasten, sperrbare Kommataste, doppeltbreite Weiter-Taste mit Wert in der Aufschrift) | vorhanden: [ziffernblock.tsx](../src/ui/ziffernblock.tsx). Deckt sich mit dem Entwurf; die Entwürfe Lieferungen und Wareneingang-Unteransichten benutzen denselben Block. |
| **Mengenfeld** (Ganzzahl mit −/+-Tasten, Untergrenze, gesperrt) | vorhanden: [mengenfeld.tsx](../src/ui/mengenfeld.tsx) |
| **Hell/Dunkel-Umschalter** | vorhanden: [modus.tsx](../src/ui/modus.tsx) |
| **Schaltfläche** (primär / sekundär / Bestätigung, gesperrt mit Grund in der Aufschrift) | mehrfach kopiert, uneinheitlich: `h-tap w-full rounded-ctl bg-primary …` in mindestens 9 Dateien (zaehlung/page.tsx:60, lieferungen/page.tsx:178, bestellungen/page.tsx:87, importmaske.tsx:172, vorschlagsmaske.tsx:208, zeile.tsx:206 …); `tap`-Klasse und `focus-visible:fokus` mal da, mal nicht. Gehört als Komponente nach src/ui. |
| **Listenzeile** (56–64 px, Titel + gedämpfte Unterzeile, Wert rechts, Statuspunkt aussen) | mehrfach kopiert, leicht abweichend: zaehlung/page.tsx:72, lieferungen/page.tsx:191, bestellungen/page.tsx:100, als Button-Variante uebersicht.tsx:129, pruefmaske.tsx:992. Gehört nach src/ui. |
| **Wertfeld** (grosse Zahl über Versalien-Beschriftung; aktiv = 2-px-Primärrand + Tonfläche; leer = „—") | doppelt kopiert, nahezu identisch: zaehlmaske.tsx:208–239 und pruefmaske.tsx:758–800. Gehört nach src/ui. |
| **Klebende Abschnittsüberschrift** (Versalien, Stand „4 / 6" rechts) | doppelt kopiert und uneinheitlich: uebersicht.tsx:72 (mit `sticky top-0`), pruefmaske.tsx:832 (ohne sticky). Gehört nach src/ui — mit sticky. |
| **Hinweisleiste** (soft-Fläche, Punkt, Titel + Erklärsatz; attention/danger/confirm) | vielfach kopiert: attention-Variante in mindestens 8 Dateien (umsatz/page.tsx:79, auswertung/page.tsx:73, vorschlag/page.tsx:178 ff., importmaske.tsx:126 …), danger- und confirm-Varianten dazu, plus randlose Vollbreiten-Variante (uebersicht.tsx:53, pruefmaske.tsx:289). Gehört nach src/ui. |
| **Statuszeile Synchronisation** (Punkt + „Alles übertragen / Offline · n warten / Überträgt / fehlgeschlagen") | Logik vorhanden in [warteschlange.ts](../src/offline/warteschlange.ts) (`sammelStatus`, `statusText`), Darstellung nur in der Zählmaske (zaehlmaske.tsx:164). Als Baustein fehlt sie; die Entwürfe Startseite und Lieferungen zeigen sie auch dort. Der Zustand „Übertragung fehlgeschlagen · Erneut" existiert im Code nicht (die Warteschlange versucht still weiter). |
| **Leerzustand** (ein Satz, ggf. eine Schaltfläche) | fünffach kopiert als `mt-6 text-sm text-text-muted` (zaehlung/page.tsx:68, lieferungen/page.tsx:187, bestellungen/page.tsx:95, umsatz/page.tsx:89, zuordnung/page.tsx:147). Klein genug, um kopiert zu bleiben — aber einheitlich halten. |
| **Ladezustand** (Skeleton-Zeilen, die die 64-px-Zeilenhöhe halten) | fehlt ganz. Der Code rendert serverseitig und kennt keinen sichtbaren Ladezustand; `useZaehlstand.laedt` existiert, wird aber nicht gerendert. Beim Umbau nur dort einführen, wo wirklich client-seitig geladen wird. |
| **Kennzahlenblock** (Versalien-Label, grosse Zahl, Unterzeile; 2er/3er-Raster) | mehrfach kopiert, fast identisch: `Kennzahl` in auswertung/page.tsx:161 und vorschlag/page.tsx:269, Varianten in pruefmaske.tsx:1090 und importmaske.tsx:218. Gehört nach src/ui. |
| **Hinweisseite** (Titel, Erklärtext, Primär-Link — „Noch keine Auswertung möglich") | doppelt identisch kopiert (auswertung/page.tsx:185, vorschlag/page.tsx:279) plus zwei Inline-Varianten („Kein Betrieb angelegt", umsatz/page.tsx:27, zuordnung/page.tsx:57). Gehört nach src/ui. |
| **Tabelle** (Desktop-Tabelle + Karten mobil, Kopf-/Zahlzellen-Helfer) | dreifach kopiert: `Kopf`/`Zahl`-Helfer in auswertung/tabelle.tsx:81, vorschlagsmaske.tsx:221, positionsmaske.tsx:268; das Muster „`hidden md:block`-Tabelle + `md:hidden`-Karten" dreimal implementiert. Mindestens die Zellen-Helfer nach src/ui. |
| **Fortschrittsbalken** (Kopf der Zählung, Zuordnungs-Fortschritt) | fehlt ganz — der Code zeigt Fortschritt nur als Text „47 von 99". |
| **Statuspunkt** (8–10 px, Farbe nie allein tragend) | kein Baustein; als Inline-`span` in mehreren Seiten. Kann inline bleiben, wenn die Rolle konsequent aus globals.css kommt. |
| **Badge/Chip** („Ersatz", „Zusage", „Vorschlag 96 %", „stillgelegt", „berechnet") | teils vorhanden als Textvermerke in pruefmaske/positionsmaske („wird gestrichen", „geändert"), nicht als Baustein. Bei Umsetzung von Artikelstamm/Abweichungen als Komponente anlegen. |
| **Berechnet-Fläche** (graue randlose Fläche mit Mono-Label „berechnet" — Gegenstück zum Eingabefeld) | fehlt als Baustein; das Prinzip lebt im Code bereits (Kontrollzeile „= 51 Flaschen" der Zählmaske, Vorschlags-Vermerke). Für Artikelstamm nötig. |
| **Vollbild-Masken-Gerüst** (fester Kopf, scrollender Rumpf, fester Fuss mit safe-area) | doppelt kopiert: zaehlmaske.tsx:160 ff., pruefmaske.tsx:262 ff. Gehört nach src/ui, damit die Zusage „Fuss über der Home-Zone" an genau einer Stelle steht. |
| **Stepper / Filter-Segmentcontrol / Datums-Chips** (Importe, Artikelstamm, Nachlieferung) | fehlen ganz — werden erst mit CSV-Import-UI und Artikelstamm-UI gebraucht. |
| **Druckansicht** (Briefkopf `nur-druck`, Abhak-Spalte, Input-Reset) | vorhanden: bestellungen/[id]/page.tsx:132 ff. + globals.css-Druckblock. Deckt sich mit dem Bestellvorschlag-Entwurf. |

Dazu ein nicht-visueller Befund: der Serveraktions-Zustandstyp
`{art:'leer'|'fertig'|'fehler'}` ist viermal fast gleich definiert
(umsatz/aktionen.ts:27, zuordnung/aktionen.ts:25, bestellungen/aktionen.ts:67
und :135) — beim Umbau zusammenführen.

---

## 3. Zustände

Je Entwurfsdatei: welche Zustände sie zeigt, und ob die App sie kennt.
Drei Fälle — nur der dritte macht Arbeit:

- **(A) Code kennt ihn** — nur Darstellung angleichen.
- **(B) Entwurf zeigt ihn nicht, Code hat ihn** — muss beim Umbau gestaltet
  bleiben und ist hier aufgelistet, damit er nicht verschwindet.
- **(C) Entwurf zeigt ihn, Code kennt ihn nicht** — mit Angabe, woher die
  Daten kämen und ob eine Rechnung in src/lib oder ein Feld im Schema fehlt.

### Startseite

Der Code hat **keine Startseite** — [page.tsx](../src/app/page.tsx) ist die
unveränderte Next.js-Vorlage (inklusive Tailwind-Rohfarben, die einzige Datei,
die das Rollensystem komplett ignoriert). Fast alles hier ist Fall C, aber die
Daten existieren fast vollständig:

- (C) **Offene Zählung von heute** (Fortschritt, „läuft seit 10:14", Fuss
  „Zählung fortsetzen"): Daten vorhanden (`Zaehlung.status`,
  `fortschritt()` in lib/zaehlung.ts). Nur UI.
- (C) **Keine offene Zählung** („Zählung beginnen", „Letzte Auswertung
  ansehen"): Daten vorhanden. Nur UI.
- (C) **„Zählung verwerfen"**: die Aktion existiert nirgends — /zaehlung setzt
  eine offene Zählung stets fort. Es fehlt eine Server-Aktion (Zählung samt
  Positionen löschen oder ein Status); das Schema kennt nur OFFEN/ABGESCHLOSSEN.
  Entscheiden: Löschen reicht vermutlich, kein neues Statusfeld.
- (C) **Offen-Liste** („Umsatzdaten seit 3 Tagen nicht importiert", „2
  Kassenbezeichnungen ohne Zuordnung", „Lieferung vom 04.08. ohne Positionen"):
  alle drei Aussagen sind heute schon berechenbar (`Umsatzimport.zeitraumBis`,
  Zuordnungszählung aus umsatz/page.tsx, Kontrollstand aus
  lieferungen/page.tsx) — aber jede steckt als Ad-hoc-Rechnung in ihrer Seite.
  Es fehlt eine Rechnung `offenePunkte()` in src/lib (mit Test), die die
  Startseite und die Bereichszeilen gemeinsam speist.
- (C) **Kennzahlen der letzten abgeschlossenen Zählung** (EUR Bestand,
  Schwund %, Datum/KW): Rechnungen vorhanden (`summe`, `schwundquote` in
  lib/auswertung.ts). Nur UI.
- (C) **Desktop-Seitenleiste mit Navigation und Statuspunkten**: fehlt ganz;
  Daten wie Offen-Liste.
- (A) **Statuszeile offline/übertragen**: Logik vorhanden
  (offline/warteschlange.ts), muss hier nur zusätzlich angezeigt werden.

### Zählbildschirm

- (A) Leeres Feld als „—", Doppel-/Einzelfeld je Zählmodus (`felder()`),
  Kontrollzeile „= 51 Flaschen" (`gesamtEinheiten`), Fass mit Komma und „ohne
  Schwundprüfung", Offline-Warteschlange („n Werte warten auf Netz"),
  Weiter-Taste mit Wert in der Aufschrift, Abschlussbereitschaft — alles in
  zaehlmaske.tsx vorhanden. Nur Darstellung (u. a. `text-count` statt
  `text-3xl`, Fortschrittsbalken statt reiner Textzähler).
- (B) Vom Entwurf nicht gezeigt, im Code vorhanden — muss bleiben:
  Leerzustand „Diese Zählung hat keine aktiven Artikel." (zaehlmaske.tsx:103),
  Abschlussfehler ohne Netz („Der Abschluss hat nicht geklappt …",
  uebersicht.tsx:59), „Diese Zählung ist abgeschlossen." (uebersicht.tsx:108),
  `notFound()` bei unbekannter Id.
- (C) Nichts — der Entwurf zeigt keinen Zustand, den der Code nicht kennt.

### Listenansicht

- (A) Alle drei Szenarien existieren in uebersicht.tsx: „Zählung läuft"
  (gesperrter Fuss „Noch n zu zählen"), „Abschluss abgelehnt" (409-Antwort:
  „Der Abschluss ist noch nicht möglich: n Artikel ohne Wert. Sie sind unten
  hervorgehoben." — wörtlich wie im Entwurf), „Vollständig" (grüner Fuss,
  „Wird abgeschlossen…"-Sperre gegen Doppelklick). Laufweg-Abschnitte
  liefert `abschnitte()` in lib/zaehlung.ts; Stationsnummer und Stand „4 / 6"
  sind daraus ableitbar — Darstellung.
- (B) Amber-Punkt „wartet auf Netz" je Zeile mit aria-label
  (uebersicht.tsx:156) — der Entwurf zeigt ihn nur beiläufig; nicht verlieren.
- (C) Nichts Wesentliches.

### Abschluss (abgeschlossene Zählung)

Der Code zeigt nach dem Abschluss nur die Zeile „Diese Zählung ist
abgeschlossen." — der Entwurf macht daraus einen eigenen Bildschirm. Fall C:

- (C) **Kennzahlen** Bestandswert / „Nicht bewertbar n" / Schwund:
  `wertCent` und `summe` existieren; die **Aggregation je Kategorie**
  („Bestand nach Kategorie", Anteils-Balken) fehlt als Rechnung in src/lib.
- (C) **„Bestandswert · unvollständig — Mindestwert"** bei fehlenden
  EK-Preisen: die Logik „ohne Preis zählt nicht als 0" existiert
  (lib/auswertung.ts `summe`); der Zustand braucht nur die Zählung der
  unbewerteten Artikel je Kategorie — kleine lib-Erweiterung.
- (C) **Dauer** („1 Std 14 Min"): `Zaehlposition.gezaehltAm` existiert,
  eine Dauer-Rechnung fehlt in src/lib (trivial, mit Test).
- (C) **„Gezählt von M. Kaminski"**: es gibt keine Anmeldung; das
  `Benutzer`-Modell existiert ungenutzt. Ohne Login-Entscheidung nicht
  umsetzbar — Feld vorhanden, Prozess fehlt. Zurückstellen.
- (B) nichts Zusätzliches.

### Auswertung

- (A) Sehr weitgehend deckungsgleich — der Code kennt: Warnleiste „n
  Kassenbezeichnungen nicht zugeordnet", „keine Kassendaten im Zeitraum",
  Kennzahlen mit „—", „nicht bewertbar", „ohne Schwundrechnung" (portioniert),
  „nicht gezählt", aufklappbare Herleitung mit Belegen und den drei
  Erklärtexten, Summen-Ausschluss („n Artikel ohne Preis …"), Karten mobil.
- (B) Vom Entwurf nicht gezeigt, im Code vorhanden: „Noch keine Auswertung
  möglich" (braucht zwei abgeschlossene Zählungen), „Kein Betrieb angelegt",
  „n Artikel ohne Bewegung im Zeitraum", Leerzustand der Tabelle,
  „keine Belege im Zeitraum" in der Herleitung.
- (C) **Rot-Schwelle** (rot erst ab Quote ≥ 3 % oder ≥ 10 EUR, Entwurfs-Prop
  `schwellwertProzent`): der Code färbt bei jedem Schwund. Die Schwelle ist
  eine Rechnung (`auffaellig()`) und gehört mit Test nach src/lib.
- (C) **Zeitraum-Wahl** (Dropdowns „Zählung 31 → 32"): der Code rechnet fix
  den letzten Zeitraum (`letzterZeitraum` in auswertung-daten.ts). Daten
  vorhanden (alle abgeschlossenen Zählungen); die Rechnung muss ein
  Zählungspaar als Parameter nehmen. Kein Schemafeld nötig.
- (C) **Sortier-Umschalter** (Spaltenkopf klickbar, mobil „Nach Schwund
  sortiert ▾"): `nachSchwund` existiert, weitere Sortierungen sind
  Darstellung.

### Artikelstamm

[/artikel](../src/app/artikel/page.tsx) ist ein Stub (nur die Überschrift).
Alles ist Fall C — aber Schema und Rechnungen sind fast vollständig:

- (C) Liste mit Suche, Kategorie-Filter, „Alle 99 / Aktiv 92 / Stillgelegt 7":
  Daten vorhanden (`Artikel.aktiv`, `kategorie`); nur UI.
- (C) Formular in fünf Blöcken mit **Berechnet-Flächen** („18,59 EUR je Kasten
  = 0,77 EUR je Flasche"): Rechnungen vorhanden (`ekProEinheitCent`,
  Einheitenrechnung in lib/einheiten.ts — dort per Wächtertest als einzige
  Rechenstelle erzwungen). Nur UI.
- (C) „Preis nicht bekannt … heisst nicht 0,00 EUR": Konvention im Schema
  verankert (`ekPreisCent: Int?`, null = unbekannt). Nur UI.
- (C) **„Stillgelegt seit 12.05.2026"**: das Datum der Stilllegung gibt es
  nicht — `aktiv` ist ein Boolean ohne Zeitstempel. **Schemafeld fehlt**
  (`stillgelegtAm DateTime?`), falls das Datum gezeigt werden soll; sonst nur
  „stillgelegt" ohne Datum zeigen.
- (B) nichts (es gibt ja nichts).

### CSV-Import (Artikelstamm importieren)

Kein UI im Code; [artikelimport.ts](../src/lib/artikelimport.ts) existiert
(`leseArtikelstamm` mit Test, `importiereArtikelstamm` ohne). Fall C:

- (C) **Vorschau mit Diff je Zeile** (neu / geändert mit „18,59 → 19,20" /
  unverändert / Fehler / übersprungen): `leseArtikelstamm` liefert Zeilen und
  Fehler, aber der **Abgleich gegen den Bestand** (welches Feld ändert sich)
  fehlt als eigene Rechnung in src/lib — heute schreibt `importiereArtikelstamm`
  direkt. Vorschau-Rechnung mit Test ergänzen.
- (C) **„Zeile überspringen / wieder aufnehmen"**: fehlt in lib (Parameter der
  Importfunktion).
- (C) Stepper, Protokoll, Beispieldatei: nur UI.

### Kassenimport

- (A) Weitgehend vorhanden in importmaske.tsx + lib/kassenimport.ts:
  Zustandsautomat leer/vorschau/fertig/fehler, Kennzahlen, Abrechnungsarten,
  **Überschneidungs-Erkennung** mit Checkbox-Ersetzen („… wären doppelt vom
  Bestand abgezogen"), Fehl-/Hinweislisten, Erfolgsmeldung mit offenen
  Zuordnungen.
- (B) Vom Entwurf nicht gezeigt, im Code vorhanden: „Die Datei nennt keinen
  Zeitraum", „Wird gelesen …/Wird importiert …", „n vorherige Importe wurden
  gelöscht", die Detail-Fehlerlisten („Konnte nicht gelesen werden: n").
- (C) **Lücken-Erkennung** („3 Tage fehlen zwischen 01.08. und 04.08.",
  „Trotz Lücke weiter", Karte „Ein Ruhetag ist kein Loch"): der Code erkennt
  Überschneidungen, aber keine Lücken zum Vorimport. Rechnung
  (`anschlussLuecke()`) fehlt in src/lib; Daten vorhanden
  (`Umsatzimport.zeitraumVon/Bis`).
- (C) **Editierbare Von/Bis-Felder** vor dem Import: der Code übernimmt den
  Zeitraum aus der Datei. Übersteuerbarkeit wäre ein Parameter von
  `importiereKassenumsatz` — kein Schemafeld.
- (C) **Verlaufstabelle „Bisherige Importe"** mit lückenlos/Lücke/
  Überschneidung und „Nachtragen/Bereinigen": Liste existiert rudimentär
  (umsatz/page.tsx zeigt Importe), Statusrechnung = dieselbe `anschlussLuecke()`.

### Lieferungen und Lieferungsübersicht

Die beiden Entwürfe zeigen **zwei konkurrierende Modelle desselben Bereichs**
(siehe letzter Abschnitt). Der Code entspricht dem Modell der
**Lieferungsübersicht** — bis in den Wortlaut („ungeprüft · ohne Positionen").

- (A) Kopf-Formular (Lieferant/Beleg/Datum, Bestellungs-Auswahl nur wenn
  versendete Bestellungen existieren), abgeleiteter Kontrollstand je Zeile,
  Leerzustand „Noch keine Lieferung erfasst."
- (B) Im Code, in keinem der beiden Entwürfe: stilles Scheitern bei leerem
  Lieferant/Beleg (lieferungen/page.tsx:37 — `return` ohne Meldung; beim
  Umbau eine sichtbare Meldung geben), ungefangener „Kein Betrieb"-Fehler.
- (C) Aus der Datei „Lieferungen": **Desktop-Erfassungsfluss ohne Maus**
  (Artikel → Enter → Anzahl → Enter, Autocomplete mit Enter-Chip): die
  Prüfmaske kann Suche + Ziffernblock (mobil), der Tastaturfluss am Laptop
  fehlt — reine UI-Arbeit, Rechnungen vorhanden. **Zeitraum-/Lieferanten-
  Filter und Monatssumme** der Übersicht: Summenrechnung gehört nach src/lib
  (heute rechnet lieferungen/page.tsx den Kontrollstand per `reduce` selbst —
  beim Umbau nach lib ziehen, siehe Abschnitt 4-Befund unten).
  **Lieferanten-Autocomplete** („Bisherige Lieferanten", „zuletzt 03.08."):
  Daten vorhanden (`Lieferung.lieferant` Freitext), Abfrage fehlt.

### Wareneingang (+ Unteransichten, + Sonderfälle)

Der grösste zusammenhängende Block — und der Code
([pruefmaske.tsx](../src/app/lieferungen/%5Bid%5D/pruefmaske.tsx)) kennt
erstaunlich viel davon:

- (A) Vorbelegung mit Lieferschein-Menge („Wer nichts anfasst, bestätigt das
  Papier"), Fehlmenge/Überlieferung mit Betrag, „nicht bewertbar" ohne Preis,
  Bruch (0–2), Ersatzartikel („statt …", Suche mit Dubletten-Vermerk „steht
  schon in der Liste"), Nachlieferungs-Zusage mit Datum („kein Fall für die
  Reklamation"), Preisabweichung („wird festgehalten, entschieden wird
  später"), Leergut mit Pfand und „Pfand nicht hinterlegt", Bestätigen-Dialog
  mit Kennzahlen und Fahrer-Pflichtfeld bei Abweichungen, „Wird bestätigt …",
  gesperrter Zustand nach Bestätigung, Fuss-Stufen („n Positionen ohne
  Erklärung" / „Alles stimmt — …" / „… · n Abweichungen").
- (B) Vom Entwurf nicht gezeigt, im Code vorhanden: die Offline-Fehlertexte
  („Ohne Netz lässt sich nichts speichern …", „… nicht bestätigen"), die
  Hinweise „n Abweichungen ohne hinterlegten Preis — nicht in der Summe" und
  „n Fehlmengen als Nachlieferung zugesagt — nicht Teil der Forderung",
  Leerzustand „Noch keine Position erfasst. Am Lieferschein entlang
  hinzufügen."
- (C) **Fotos** (Lieferschein, „+ Foto") und **Unterschrift zeichnen**
  („Gegenzeichnung Fahrer", gesperrter Fuss „Unterschrift des Fahrers
  fehlt"): die Schemafelder existieren (`lieferscheinBildPfad`,
  `unterschriftBildPfad`), aber Upload/Zeichnen und ein Ablageort (Storage)
  fehlen komplett. Grösster echter Neubau in diesem Block.
- (C) **„Preise klären"-Nachbildschirm** (nach der Bestätigung: „neuen Preis
  übernehmen / behalten" in den Artikelstamm): die Preisabweichung wird
  gespeichert, aber es gibt keine Übernahme in `Artikel.ekPreisCent`.
  Server-Aktion fehlt; Rechnung (`preisabweichungCent`) vorhanden.
- (C) **Datums-Chips „Mo 10.08. / Fr 14.08."** aus Liefertagen des
  Lieferanten: es gibt kein Lieferanten-Modell, nur Freitext — Daten fehlen.
  Ohne neues Modell: freie Datumseingabe behalten (hat der Code).
- (C) **Unplausible Preisabweichung** („38 % mehr — jetzt nachfragen"):
  Schwellwert-Rechnung fehlt in src/lib (klein, mit Test).

### Abweichungen nachverfolgen

Kein UI im Code — aber das Schema ist vollständig darauf vorbereitet
(`Abweichung` mit Art/Status/gutschriftCent/notiz, `Abweichungsereignis` als
Journal, Stati OFFEN → REKLAMIERT → GUTSCHRIFT_ERWARTET → ERLEDIGT/VERWORFEN).
Der klarste Fall von „Entwurf zeigt, Code kennt nicht":

- (C) Übersicht mit KPI („488,60 EUR offen", ältester Vorgang), Fristband
  „Älter als 14 Tage — Reklamationsfrist läuft", Sortierung nach Alter:
  Alters-/Frist-Rechnung fehlt in src/lib (`festgestelltAm` vorhanden).
- (C) **Reklamierter Betrag als Berechnet-Fläche** („Nicht änderbar"),
  **Gutschrift als einziges Eingabefeld** (leer = „—", „Erst dann gilt der
  Vorgang als erledigt"): Rechnungen vorhanden (`fehlbetragCent`,
  `preisabweichungCent` in lib/wareneingang.ts); Statusübergangs-Rechnung
  (welcher Schritt ist als Nächstes erlaubt) fehlt in src/lib.
- (C) **Lieferanten-Quote** („80 % der Lieferungen ohne Abweichung, 30
  Tage"): Aggregation fehlt in src/lib; Daten vorhanden.
- (C) Statusfolge-Anzeige (4 Segmente), Verlauf mit Person/Kanal: Journal
  vorhanden; „Person" hängt wieder an der fehlenden Anmeldung
  (`Abweichungsereignis.benutzerId` ist heute immer leer).
- Hinweis: Die Entwurfs-Art „Preisabweichung" in Violett — siehe letzter
  Abschnitt.

### Zuordnung (Kasse → Artikelstamm)

- (A) Der Kern existiert in umsatz/zuordnung/: Zustände offen / zugeordnet /
  übergangen (abgeleitet, kein Statusfeld — wie im Entwurf), Vorschläge
  (`schlageZuordnungVor`), Rezepte mit mehreren Zutaten
  (`Kassenartikelbestandteil`), „Übergehen"/„Wieder offen", gebuchte Menge
  („— " ohne Import).
- (B) Vom Entwurf nicht gezeigt, im Code vorhanden: Pagination („Weitere n von
  m zeigen"), „Der Artikelstamm ist leer …", die Fehlertexte je Zeile
  („Derselbe Artikel steht zweimal …", „‚x' ist keine Zahl"), Notizfeld.
- (C) **„bestätigt 12.07. · Kirsten B."**: `Kassenartikel` hat kein
  `bestaetigtAm` und keinen Bezug zur Person — **Schemafeld fehlt**
  (`bestaetigtAm DateTime?`; Person wieder Login-Thema).
- (C) **Vorschlags-Prozent** („Vorschlag 96 %") und **Plausibilitäts-Warnung**
  („Ausgeschenkt werden 0,5 l, das Gebinde hat 0,33 l — geht nicht auf"):
  `schlageZuordnungVor` liefert Kandidaten ohne Score; Score-Ausgabe und
  Plausibilitätsprüfung (Ausschank vs. Gebindegrösse) fehlen als Rechnungen
  in src/lib (`leseGroesseLiter` existiert als Baustein dafür).
- (C) **Tastatursteuerung** (Enter bestätigt und springt weiter, Shift+Enter,
  Esc, „/" fokussiert Suche) und **Fortschritt/„Abschliessen"**: reine UI;
  „Abschliessen" ist nur Navigation (es gibt bewusst keinen
  Abschluss-Status).

### Bestellvorschlag

- (A) Sehr weitgehend deckungsgleich mit vorschlagsmaske.tsx +
  bestellungen/[id]/: Vorschlag aus Zählung + Verbrauch (`zeile`,
  `vorschlagGebinde` — ganze Gebinde, aufgerundet), Hand-Eingriff mit Vermerk
  „von Hand · Vorschlag n" und Einzel-Reset, „n Handeingriffe zurücksetzen",
  von Hand gesetzte 0 bleibt sichtbar, Umschalter „nur zu Bestellendes / alle",
  Kennzahlen, „—" statt 0,00 bei leeren Positionen, CSV-Export, Druckansicht
  A4 mit Briefkopf und Abhak-Spalte (`nur-druck`), Warnleisten zur Datenlage
  („keine Kassendaten … das heisst nicht, dass nichts fehlt, sondern dass es
  niemand ausrechnen kann").
- (B) Vom Entwurf nicht gezeigt, im Code vorhanden: „Noch kein
  Bestellvorschlag möglich" (keine abgeschlossene Zählung), „Ohne
  abgeschlossene Zählung gibt es keinen Vergleichswert — … Eine 0 dort wäre
  keine Auskunft, sondern eine falsche.", Dringlichkeit „leer"
  (`bg-danger-soft`-Zeilen), „keine Kassenbezeichnung zugeordnet — Menge von
  Hand", Statuswechsel-Logik (`naechsteStati`), „Auf n Zeilen wurde schon
  geliefert — nicht streichbar", Lieferstand („teilweise geliefert").
- (C) **Lieferanten-Filter** („Lieferant: Getränke Dörlemann"): Artikel haben
  keinen Lieferanten — **Schemafeld fehlt** (`Artikel.lieferant` oder ein
  Lieferanten-Modell), wenn je Lieferant vorgeschlagen werden soll. Heute gibt
  es einen Vorschlag über alles.
- (C) **Liefertermin** („Lieferung: Mo, 10.08.2026") und **Bestellnummer**
  („B-2026-32-01") auf dem Druckblatt: `Bestellung` hat weder Liefertermin
  noch Nummer — **Schemafelder fehlen** (`liefertermin DateTime?`, Nummer als
  Rechnung aus Jahr/KW/Laufnummer oder gespeichertes Feld).
- (C) **MwSt-Zeile** (Prop `mwstAnzeigen`, Standard aus): Rechnung trivial,
  fehlt in lib/bestellung.ts, falls gewünscht — Standard des Entwurfs ist
  „aus", also zurückstellen.

---

## 4. Was ich nicht umsetzen würde

Stellen, an denen die Entwürfe gegen Zusagen der App (AGENTS.md, „Regeln der
Oberfläche" — und grossteils gegen die eigene Design-Grundlage) verstossen.
Der Entwurf ist Vorlage, nicht Befehl:

1. **44-px-Bedienflächen auf dem Desktop — durchgängig.** Filter-Pillen,
   Tab-Umschalter, Mengen-Eingabefelder (Bestellvorschlag 44 px,
   Lieferungen-Tabelle 84×44), „Verwerfen/Gutschrift erwartet" (Abweichungen),
   „Bestätigen/Ändern/Ausnehmen" (Zuordnung), „Zuordnung öffnen", „Zählung
   korrigieren" (Auswertung), „Andere Datei", Lücken-Aktionen (Importe).
   Dazu 36-px-Flächen („Zeile überspringen", Filterchips, Segmentcontrols,
   Pagination), 40-px-Flächen („Nachtragen/Bereinigen", Zurück-Quadrat),
   52-px-Datums-Chips (Nachlieferung) und der ~40-px-Preisstreifen
   (Sonderfälle). Die Grundlage selbst sagt: 56 px „auch in Listenzeilen und
   Tabellen, ausnahmslos" — und die App-Regel kennt keine Desktop-Ausnahme.
   Umsetzung: alles Auslösende auf `h-tap`.

2. **Antippbare Textfetzen ohne Fläche.** Beleg-Referenzen in der
   Auswertungs-Herleitung (12-px-Klickspans), „Zuordnung öffnen ›" als
   14-px-Textlink in der mobilen Warnkarte, „ändern" und „Foto" als
   Inline-Ziele (Sonderfälle), „Beispieldatei laden", „… als CSV laden",
   „Alle zuordnen", der Sortier-Klick auf einem 11-px-Spaltenkopf, „‹
   Kassenimport" als 20-px-Textziel. Entweder zur vollen Zeile/Fläche machen
   (h-tap) oder als Schaltfläche ausformen.

3. **Antippbares oberhalb des unteren Drittels auf dem Telefon.** Die
   Startseite legt die „Offen"- und „Bereiche"-Zeilen (mit ›) in den
   scrollenden Rumpf; die Lieferungsübersicht stellt das ganze
   Erfassungsformular nach oben (und deklariert das selbst als Regelbruch:
   „Formular oben, entgegen der Fussregel"); der Wareneingang macht die
   „tatsächlich"-Felder in den oberen Zeilen antippbar; die Sonderfälle
   verlangen „Zeile antippen" für Fehlerzeilen im oberen Bereich. Die
   Grundlage erlaubt genau eine Ausnahme (Zeile antippen = nur Auswahl des
   aktiven Artikels, plus das Zurück-Ziel im Kopf). Ich würde die Zusage
   halten: Auswahl-/Navigationszeilen ja, aber jede *auslösende* Handlung
   (Wert ändern, Formular absenden, Zeile öffnen mit Folgeaktion) wandert in
   den Fuss bzw. in eine Unteransicht mit Eingabe unten — so macht es die
   Wareneingang-Unteransicht ohnehin vor. Wo der Entwurf es anders zeigt,
   gilt die Zusage, nicht der Entwurf.

4. **„0" als Platzhalter für „nie erfasst".** Der Lieferungen-Entwurf
   beschriftet leere Lieferungen mit „0 · nicht erfasst" / „0 Positionen ·
   nicht erfasst" und der leere Wareneingang mit „0 Positionen / ohne
   Abweichung" — die Schwesterdatei Lieferungsübersicht verbietet genau das
   („Eine Null stünde für eine Aussage, die niemand getroffen hat") und der
   Code sagt bereits „ungeprüft · ohne Positionen". Es gilt die
   Gedankenstrich-Regel: „ohne Positionen", nicht 0. Ebenso wäre „ohne
   Abweichung" bei null Positionen eine Aussage ohne Grundlage — dort steht
   nichts oder „—". Wachsam bleiben bei „0 · weiter" auf der Weiter-Taste
   der Zählmaske (Entwurf wie Code): Weiter auf leerem Feld speichert eine
   gezählte 0 — das ist als bewusste Aussage vertretbar, darf aber nie
   automatisch passieren.

5. **Kontraste unter WCAG AA — drei wiederkehrende Muster.**
   (a) `#a1a1aa` auf Weiss (≈2,3–2,8:1) für sichtbaren, tragenden Text:
   Platzhalter, „—"-Leerwerte, „übersprungen"/„ausgenommen"-Zeilen, „ohne
   Schwundrechnung", alte Diff-Werte, Statusleisten-Netzanzeige.
   (b) `#71717a` auf dunklen Flächen (≈3,7–4,0:1): dieselben Zwecke im
   Dunkelmodus, dazu „bestellt"-Werte und Feldbeschriftungen.
   (c) `#71717a` auf `#f4f4f5` (≈4,4:1): praktisch alle Tabellenköpfe.
   Alle drei verschwinden, wenn konsequent die Rolle `text-muted` verwendet
   wird (hell `#52525b`, dunkel `#a1a1aa`) — was die Regel „Farben nur über
   Rollen" ohnehin verlangt. Dekorative Striche dürfen blass bleiben; Text
   nicht.

6. **Gesperrte Schaltflächen, deren Aufschrift den Grund trägt.** „Noch 12 zu
   zählen", „Noch keine Position erfasst", „2 Positionen ohne Erklärung",
   „Unterschrift des Fahrers fehlt" stehen im Entwurf mit ≈1,8–2:1 auf der
   Sperrfläche. WCAG nimmt Disabled aus, aber diese Aufschriften *sind* die
   Erklärung und müssen lesbar sein — gesperrte Fläche ja, Text aber in
   `text-muted` auf `surface-2` (≥4,5:1), nicht in der Entwurfs-Kombination.

7. **Violett als fünfte Farbe** für die Abweichungsart „Preisabweichung"
   (`#7c3aed`/`#a78bfa`) und `--focus`-Blau als Artfarbe „Überlieferung". Die
   Grundlage legt vier Rollen fest und verspricht „Farbe trägt nie allein
   eine Aussage". Die Art steht ohnehin als Wort neben dem Punkt — die fünf
   Arten brauchen keine fünf Farben. Umsetzung mit vorhandenen Rollen
   (Fehlmenge danger, Bruch/Preis attention, Überlieferung primary, Ersatz
   neutral); keine neuen Farbtoken.

8. **Zwei konkurrierende Lieferungs-Übersichten.** „Inventur Lieferungen"
   (Warenwert-Tabelle, Desktop-Erfassungsfluss, „0 · nicht erfasst") und
   „Inventur Lieferungsuebersicht" (Kontrollstand-Liste, „ohne Positionen")
   modellieren denselben Bereich unterschiedlich. Der Code folgt bereits der
   Lieferungsübersicht, die auch die konsistentere ist. Ich würde sie als
   verbindlich nehmen und aus „Lieferungen" nur den Desktop-Tastaturfluss
   und die Monatssumme übernehmen — nicht beide Layouts bauen.

9. **Sperre der Auswertung bei fehlenden Preisen** (Abschluss-Entwurf: „Zur
   Auswertung" deaktiviert, „Gesperrt statt geschätzt"). Die App-Zusage ist
   „nicht bewertbar statt 0" — die erfüllt die Auswertung heute, ohne zu
   sperren: Mengen-Schwund ist auch ohne Preise korrekt rechenbar, nur die
   Bewertung fehlt und wird ausgewiesen. Eine Sperre nähme dem Nutzer eine
   korrekte Auskunft. Hinweis ja, Sperre nein.

10. **Mockup-Semantik nicht übernehmen.** In den Entwürfen sind Tasten,
    „Liste", Zurück-Ziele und ganze Zeilen `div`s mit `cursor:pointer`, und
    deaktivierte Primärflächen sind `div`s ohne Button-Semantik. Der Code
    macht es richtig (echte `<button>`s, `disabled`, aria-labels) — beim
    Nachbauen der Optik nicht die Semantik der Vorlage kopieren.
