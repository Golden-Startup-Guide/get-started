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

/** Opens All Notes (Home is the start page; tests about Home open "/"). */
export async function openWorkspace(page: Page) {
  await page.goto('/#/notes')
  await expect(page.getByRole('heading', { name: 'All Notes', level: 1 })).toBeVisible()
}

/**
 * The Markdown editor's text, exactly as stored. It is a CodeMirror editor, not a form field, so
 * toHaveValue does not apply. Live preview hides Markdown markers on purpose, so this switches the
 * editor to Source view first; the setting changes only how text is shown, never the text.
 */
export async function markdownText(page: Page): Promise<string> {
  const source = page.getByRole('group', { name: 'Editor view' }).getByRole('button', { name: 'Plain text' })
  if ((await source.getAttribute('aria-pressed')) !== 'true') await source.click()
  return page.getByRole('textbox', { name: 'Note text' }).innerText()
}

export async function expectSaved(page: Page) {
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
}

/** Creates a note through the UI, waits for autosave, and closes the editor. */
export async function createNote(page: Page, title: string, content = '') {
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill(title)
  if (content) await page.getByRole('textbox', { name: 'Note text' }).fill(content)
  await expectSaved(page)
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}
