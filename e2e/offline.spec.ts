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
    await expect(page.getByRole('textbox', { name: 'Note text' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})

test('keeps maths and diagrams working offline once a note has shown them', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates offline service workers reliably only in Chromium')
  await openWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  // Neither is in the install download; showing them once online stores them for offline use.
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Circle')
  await page.getByRole('textbox', { name: 'Note text' }).fill('Area: $$\\pi r^2$$\n\n```mermaid\nflowchart LR\n  Seeds --> Harvest\n```')
  await expect(page.locator('.prose-notes .katex')).toBeVisible()
  await expect(page.locator('.prose-notes .diagram-drawing svg')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  await context.setOffline(true)
  try {
    await page.reload()
    await page.getByRole('button', { name: 'Open note Circle' }).click()
    await expect(page.locator('.prose-notes .katex')).toBeVisible()
    await expect(page.locator('.prose-notes .diagram-drawing svg')).toContainText('Harvest')
  } finally {
    await context.setOffline(false)
  }
})

test('opens a built-in handbook note offline, straight from its address', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright emulates offline service workers reliably only in Chromium')
  await openWorkspace(page)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  try {
    // Never opened online: the handbook and the reader must both come from the install.
    await page.goto('/#/notebook/core-everyday-nutrition?note=core-staying-hydrated')
    const reader = page.getByRole('dialog', { name: 'Staying hydrated' })
    await expect(reader.getByRole('heading', { name: 'Keep water close' })).toBeVisible()
    // Its picture too.
    const picture = reader.getByRole('img', { name: /drinking a glass of water/ })
    await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    // The library, shelf, notebook, and search pages come from the install too.
    await page.goto('/#/library/core-agriculture')
    await expect(page.getByRole('region', { name: 'Shelves' })).toContainText('Keeping animals')
  } finally {
    await context.setOffline(false)
  }
})
