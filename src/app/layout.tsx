import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerAnmeldung />
        {children}
      </body>
    </html>
  );
}
