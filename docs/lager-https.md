# HTTPS fürs Lager-Handy

Die App läuft auf dem Mac; das iPhone erreicht sie im selben WLAN. Damit Safari
die App als vollwertige Home-Bildschirm-App behandelt (Service Worker,
Offline-Speicher der Zählmaske), braucht die Verbindung HTTPS mit einem
Zertifikat, dem das iPhone vertraut. Genau das stellt `npm run lager` bereit.

Bewusst **kein** Cloud-Deployment: die App hat noch keine Anmeldung — im
Internet wäre jede Zählung und jede Schreib-API für alle offen. Im eigenen
WLAN bleibt alles im Haus. Sobald die Anmeldung (Supabase Auth) steht, kann
ein echtes Deployment folgen; diese Tür hier bleibt davon unberührt.

## Auf dem Mac

```
npm run build
npm run start        # App auf Port 3000 (oder: Start über die gewohnte Vorschau)
npm run lager        # HTTPS-Tür auf Port 8443
```

Beim ersten `npm run lager` entsteht der Ordner `zertifikate/` mit einer
eigenen kleinen Zertifikatsstelle („Inventur Lager CA“). Die Adresse steht
danach im Terminal, z. B. `https://macbook-pro-von-tim.local:8443`.

## Einmalig auf dem iPhone

1. `zertifikate/lager-ca.pem` aufs iPhone bringen — am einfachsten per
   AirDrop auf die Datei im Finder.
2. Die Meldung „Profil geladen“ bestätigen, dann: **Einstellungen → Allgemein →
   VPN & Geräteverwaltung → Inventur Lager CA → Installieren**.
3. Wichtig, sonst bleibt das Zertifikat wirkungslos: **Einstellungen →
   Allgemein → Info → Zertifikatsvertrauenseinstellungen → Inventur Lager CA
   einschalten**.
4. In Safari `https://macbook-pro-von-tim.local:8443` öffnen (der Name steht
   in der Ausgabe von `npm run lager`) → Teilen → **Zum Home-Bildschirm**.

## Wenn etwas hakt

- **„Server nicht gefunden“**: iPhone und Mac müssen im selben WLAN sein; der
  `.local`-Name kommt über Bonjour. Zur Not die IP-Adresse aus der
  Terminal-Ausgabe verwenden — sie steht mit im Zertifikat.
- **Zertifikatswarnung trotz Profil**: Schritt 3 (Vertrauenseinstellungen)
  wurde übersprungen.
- **Nach ~2 Jahren**: Das Server-Zertifikat ist 820 Tage gültig (Apples
  Obergrenze: 825). Ordner `zertifikate/` löschen, `npm run lager` neu
  starten, Profil erneut installieren.
- **502 im Browser**: Die HTTPS-Tür läuft, aber die App nicht — auf dem Mac
  `npm run start` (oder den Dev-Server) starten.
