import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Der Dev-Server liefert seine Skripte sonst nur an localhost aus. Beim
  // Zählen am Telefon kommt die App aber über die LAN-IP des Macs — ohne
  // diese Freigabe lädt dort nur der HTML-Rumpf und jede Interaktion schlägt
  // fehl.
  allowedDevOrigins: ["192.168.2.196"],
  experimental: {
    // Erkennt fehlendes Netz zuverlässiger als navigator.onLine, das im WLAN
    // ohne Anschluss nach draussen weiterhin "online" meldet — im Lager genau
    // der Fall. Stellt zugleich `useOffline` aus next/offline bereit, an dem
    // die Zählmaske ihren Status anzeigt.
    useOffline: true,
  },
};

export default nextConfig;
