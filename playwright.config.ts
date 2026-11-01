import { defineConfig, devices } from '@playwright/test'

const port = 4174
// An explicit IPv4 address: on Windows `localhost` may resolve to ::1 or 127.0.0.1, and a
// browser trying the address the server is not on gets intermittent "connection refused".
const host = '127.0.0.1'
const isCI = Boolean(process.env.CI)

// End-to-end tests run against the production build, because the service worker, the
// Content Security Policy, and real IndexedDB only exist there (jsdom cannot test them).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  // No retries: a test that only passes on retry is flaky and should be fixed, not hidden.
  retries: 0,
  // More than two parallel WebKit instances stall on first page load on Windows (before any
  // app code runs), and WebKit there is several times slower than Chromium, hence the timeout.
  workers: 2,
  timeout: 60_000,
  // Autosave normally finishes in under a second; 10 s leaves room for loaded machines.
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://${host}:${port}`,
    trace: 'retain-on-failure',
    // Playwright's patched Firefox can hang on a page's "load" event while the service worker
    // installs on a first visit. Only the offline test needs it, so that file turns it back on.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host ${host} --port ${port} --strictPort`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
})
