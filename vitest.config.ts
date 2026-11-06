import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { coreContentPlugin } from './scripts/coreContent'

export default defineConfig({
  plugins: [react(), coreContentPlugin(fileURLToPath(new URL('./content', import.meta.url)))],
  test: {
    environment: 'jsdom',
    // Playwright owns e2e/; Vitest would otherwise collect its *.spec.ts files.
    include: ['src/**/*.test.{ts,tsx}', 'bench/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
