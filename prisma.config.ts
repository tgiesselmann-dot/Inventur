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
})
