import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Reine Rechenlogik, kein DOM nötig.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    // Spiegelt `paths` aus der tsconfig. Ohne vite-tsconfig-paths als weitere
    // Abhängigkeit — es ist genau ein Alias.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
