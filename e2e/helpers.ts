import { test as base, expect, type Page } from '@playwright/test'

// Collects console errors, uncaught exceptions, and Content Security Policy violations, so
// every end-to-end test also proves the page ran cleanly under the production CSP.
export async function trackProblems(page: Page): Promise<string[]> {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`exception: ${error.message}`))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} blocked ${event.blockedURI || 'inline content'}`)
    })
  })
  return problems
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const problems = await trackProblems(page)
    await use(page)
    expect(problems, 'console errors, exceptions, or CSP violations').toEqual([])
  },
})

export { expect }

export async function openWorkspace(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
}

export async function expectSaved(page: Page) {
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
}

/** Creates a note through the UI, waits for autosave, and closes the editor. */
export async function createNote(page: Page, title: string, content = '') {
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill(title)
  if (content) await page.getByRole('textbox', { name: 'Markdown' }).fill(content)
  await expectSaved(page)
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}
