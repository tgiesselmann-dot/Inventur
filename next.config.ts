import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Der Dev-Server liefert seine Skripte sonst nur an localhost aus. Beim
  // Zählen am Telefon kommt die App aber über die LAN-IP des Macs — ohne
  // diese Freigabe lädt dort nur der HTML-Rumpf und jede Interaktion schlägt
  // fehl.
  //
  // Beide Türen brauchen ihren Eintrag: der Aufruf über http trägt die IP im
  // Host-Kopf, der über die HTTPS-Lagertür den Bonjour-Namen. Wer nur die IP
  // freigibt, sieht am Telefon eine Seite, die dasteht und auf nichts reagiert.
  //
  // Die IPs mehrerer Netze dürfen nebeneinander stehen (hier: Lager und
  // Zuhause) — der Name gilt überall und braucht keine Pflege. Wichtig wird
  // die IP-Liste vor allem für Android: Chrome löst .local-Namen nicht auf und
  // kommt deshalb nur über die Adresse herein. Wechselt das WLAN, gehört die
  // neue Adresse hierhin und ins Zertifikat (siehe scripts/lager-https.mjs).
  allowedDevOrigins: [
    "192.168.7.192",
    "192.168.2.196",
    "macbook-pro-von-tim.local",
  ],
  experimental: {
    // Erkennt fehlendes Netz zuverlässiger als navigator.onLine, das im WLAN
    // ohne Anschluss nach draussen weiterhin "online" meldet — im Lager genau
    // der Fall. Stellt zugleich `useOffline` aus next/offline bereit, an dem
    // die Zählmaske ihren Status anzeigt.
    useOffline: true,
  },
};

export default nextConfig;
