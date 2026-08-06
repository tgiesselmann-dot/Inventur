import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL ist nicht gesetzt (siehe .env.example)')
}

// Next.js verwirft im Dev-Modus bei jedem HMR-Zyklus die Modul-Instanzen. Ohne
// diesen Cache öffnet jeder Reload einen neuen Pool und der Pooler läuft in sein
// Verbindungslimit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Ab Prisma 7 bekommt der Client seine Verbindung über einen Driver Adapter.
// Die URL zeigt auf den Transaction-Pooler (6543) inkl. pgbouncer=true, das
// Prismas Prepared Statements abschaltet.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // Für langlebige Node-Prozesse (next start, Container) passend. Im
      // Serverless-Betrieb entsteht ein Pool je Instanz — dort auf 1 reduzieren.
      max: 10,
    }),
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
