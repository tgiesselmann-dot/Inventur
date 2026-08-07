import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Erkennt fehlendes Netz zuverlässiger als navigator.onLine, das im WLAN
    // ohne Anschluss nach draussen weiterhin "online" meldet — im Lager genau
    // der Fall. Stellt zugleich `useOffline` aus next/offline bereit, an dem
    // die Zählmaske ihren Status anzeigt.
    useOffline: true,
  },
};

export default nextConfig;
