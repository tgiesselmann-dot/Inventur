import { defineConfig, env } from 'prisma/config'

// `import "dotenv/config"` würde nur .env laden. Die Zugangsdaten dieses Projekts
// liegen nach Next.js-Konvention in .env.local, deshalb der explizite Aufruf
// (Node 20.12+). In CI/Produktion fehlt die Datei erwartungsgemäß.
try {
  process.loadEnvFile('.env.local')
} catch {
  // .env.local nicht vorhanden — Variablen kommen aus der Umgebung.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Die CLI (migrate, db push, studio) läuft über den Session-Pooler auf Port 5432.
  // Der Transaction-Pooler aus DATABASE_URL verträgt kein DDL mit Advisory Locks.
  datasource: { url: env('DIRECT_URL') },
  migrations: {
    // tsx statt node: der generierte Client importiert seine Module ohne
    // Dateiendung, damit kommt Nodes eigenes TypeScript-Stripping nicht zurecht.
    // .mts, weil dieses Paket kein "type": "module" trägt — als .ts liefe das
    // Skript als CommonJS und vertrüge kein top-level await.
    seed: 'tsx prisma/seed.mts',
  },
})
