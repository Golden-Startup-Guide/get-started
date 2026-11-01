import { defineConfig, devices } from '@playwright/test'

const port = 4175
const host = '127.0.0.1'

// Performance benchmarks (bench/*.bench.ts) against the production build. One worker, so
// runs never compete for the machine; Chromium only, for its memory and timing APIs. Run
// with `npm run bench`; set BENCH_SIZES (for example "1000,10000") to choose library sizes.
export default defineConfig({
  testDir: './bench',
  testMatch: '*.bench.ts',
  workers: 1,
  retries: 0,
  timeout: 30 * 60_000,
  expect: { timeout: 10 * 60_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://${host}:${port}`,
    serviceWorkers: 'block',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: `npm run build && npm run preview -- --host ${host} --port ${port} --strictPort`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
