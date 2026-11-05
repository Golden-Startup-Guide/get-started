import { defineConfig } from 'vitest/config'

// Only for capturing sample databases from past versions (scripts/captureDatabaseFixtures.test.ts).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['scripts/captureDatabaseFixtures.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
