import { expect, openWorkspace, test } from './helpers'

// The other end-to-end tests block service workers (see playwright.config.ts); this one
// needs the real service worker to cache the app shell.
test.use({ serviceWorkers: 'allow' })

test('opens offline after the first visit', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates offline service workers reliably only in Chromium')
  await openWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
    // The editor is a separate chunk; it must come from the service worker's cache as well.
    await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
    await page.getByRole('textbox', { name: 'Note title' }).fill('Written offline')
    await expect(page.getByRole('textbox', { name: 'Markdown' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
