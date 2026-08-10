import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { MODUS_SKRIPT, Modusanwendung } from "@/ui/modus";

import { ServiceWorkerAnmeldung } from "./service-worker-anmeldung";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Inventur",
  description: "Getränke-Inventur Stadthafen Recklinghausen",
  // "Zum Home-Bildschirm" auf dem iPhone: eigenständiges Fenster statt
  // Safari-Tab. Das Icon liegt als app/apple-icon.png daneben.
  appleWebApp: {
    capable: true,
    title: "Inventur",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Die Zählmaske geht bis an den unteren Rand; ohne dieses Deckblatt
  // rechnet env(safe-area-inset-bottom) auf dem iPhone mit 0.
  viewportFit: "cover",
  // Kein Zoom beim Doppeltippen auf eine Zifferntaste.
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: das Skript unten setzt die Klasse `dark` noch
    // vor React. Der Server kennt die Wahl nicht und liefert sie ohne — genau
    // diesen Unterschied soll React hier nicht bemängeln.
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODUS_SKRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Für den clientseitig aufgebauten 404-Rumpf, in dem das Kopf-Skript
            nie läuft — sonst ein No-op. Begründung an der Komponente. */}
        <Modusanwendung />
        <ServiceWorkerAnmeldung />
        {children}
      </body>
    </html>
  );
}
