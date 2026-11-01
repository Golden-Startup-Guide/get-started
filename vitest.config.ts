import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Playwright owns e2e/; Vitest would otherwise collect its *.spec.ts files.
    include: ['src/**/*.test.{ts,tsx}', 'bench/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
