# Anmeldung

Die App ist ab sofort zu. Ohne angemeldeten Zugang leitet jede Seite auf
`/anmelden` um, und jede API-Route antwortet mit 401.

## Wie es zusammenhängt

Zwei Dinge gehören zusammen, und beide müssen stimmen:

1. **Das Konto** liegt in Supabase Auth. Dort liegt das Passwort, von dort kommt
   das signierte Token. Diese App speichert kein Passwort.
2. **Der Zugang** ist ein Datensatz in der Tabelle `benutzer`. Er sagt, zu
   welchem Betrieb das Konto gehört. Ein gültiges Supabase-Konto allein öffnet
   nichts — es muss auch eingetragen sein.

Beim allerersten Anmelden wird der Eintrag über die E-Mail gefunden und die
Konto-Id (`auth_id`) festgeschrieben. Danach hängt der Zugang an der Konto-Id
und nicht mehr an der Adresse: wer seine E-Mail ändert, verliert weder Zugang
noch Historie, und eine später frei gewordene Adresse öffnet keine fremde Tür.

## Einen Zugang anlegen

```bash
npm run benutzer -- anna@example.org
```

Das Skript fragt das Passwort ab (es wird nicht angezeigt und steht nicht in der
Shell-Historie), legt das Konto in Supabase an und trägt den Zugang ein.
Optional:

- `--rolle mitarbeiter` — Vorgabe ist `betriebsleiter`. Die Rolle wird
  gespeichert, aber noch nicht ausgewertet: wer angemeldet ist, darf alles.
- `--betrieb "Name"` — nur nötig, solange kein Betrieb angelegt ist.

Ein zweiter Aufruf mit derselben Adresse setzt das Passwort neu. Das ist
zugleich der Weg, ein vergessenes zurückzusetzen.

**Dafür braucht das Skript `SUPABASE_SECRET_KEY` in `.env.local`** (Dashboard →
Project Settings → API Keys → Secret keys). Derselbe Schlüssel wird für die
Belegbilder des Wareneingangs gebraucht.

## Erstinbetriebnahme

Auf einer leeren Datenbank gibt es weder Betrieb noch Zugang. Dann gilt: wer ein
Supabase-Konto hat und sich anmeldet, landet auf `/einrichtung` und legt Betrieb
und sich selbst als ersten Zugang an. Das ist der einzige Moment, in dem sich
jemand selbst einträgt — danach ist die Liste zu und wächst nur über
`npm run benutzer`.

`npm run db:seed` legt Betrieb und Artikelstamm an, **aber keinen Zugang**. Nach
einem Seed gehört deshalb immer `npm run benutzer` dazu: ein Betrieb ohne Zugang
lässt niemanden mehr herein.

## Was im Supabase-Dashboard eingestellt gehört

Zwei Einstellungen, die sich nicht im Code setzen lassen:

- **Sitzungsdauer** (Authentication → Sessions bzw. JWT expiry). Die Vorgabe von
  einer Stunde ist für das Lager knapp: läuft das Zugangstoken während einer
  Zählung ab und das Handy hat gerade kein Netz, steht beim nächsten Aufruf die
  Anmeldemaske. Mehrere Stunden sind hier die passendere Wahl. Das Auffrischen
  übernimmt der Proxy automatisch, sobald wieder Netz da ist.
- **Selbstregistrierung aus** (Authentication → Sign In / Providers → "Allow new
  users to sign up"). Die App bietet keine Registrierung an; ohne diese
  Einstellung bliebe der Weg über die Supabase-API trotzdem offen. Ein so
  angelegtes Konto käme zwar nicht in den Betrieb (es fehlt der Eintrag in
  `benutzer`), aber es hat auch nichts in der Kontoliste zu suchen.

## Was offen bleibt

Rollen werden gespeichert, aber nicht ausgewertet: wer angemeldet ist, darf
alles. Eine Trennung zwischen Betriebsleitung und Aushilfe (zählen ja, Preise
nein) wäre der nächste Schritt — sie braucht eine Rechteprüfung in jeder
Serveraktion und jeder API-Route, nicht nur eine Abfrage in der Oberfläche.
