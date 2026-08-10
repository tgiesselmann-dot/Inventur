<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Regeln der Oberfläche

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
