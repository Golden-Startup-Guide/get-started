import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { createNote, expect, openWorkspace, test } from './helpers'

/**
 * Automated accessibility checks (axe-core) against WCAG 2.2 A and AA, on every main screen, in
 * the light and dark themes. Automated checks catch about a third of problems; see
 * docs/ACCESSIBILITY.md for the manual checks that complete them.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

async function expectNoViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  const found = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
  }))
  expect(found, `accessibility problems on ${screen}`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test(`main screens have no WCAG 2.2 AA problems axe can find (${theme} theme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await openWorkspace(page)
    await createNote(page, 'Accessible note', '# Heading\n\n- [ ] A task\n\nSee [[Welcome to My Notes]] and **bold** text.\n\n| A | B |\n|---|---|\n| 1 | 2 |')
    await expectNoViolations(page, 'the workspace')

    await page.getByRole('button', { name: 'Open note Accessible note' }).click()
    await expect(page.getByRole('textbox', { name: 'Markdown' })).toBeVisible()
    await expectNoViolations(page, 'the note editor')
    await page.getByRole('button', { name: 'Close editor' }).first().click()

    await page.getByRole('button', { name: 'Open settings' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await expectNoViolations(page, 'Settings')
    await page.getByRole('button', { name: 'Close settings' }).click()

    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    await expectNoViolations(page, 'the command palette')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Quick note' }).click()
    await expect(page.getByRole('dialog', { name: /Quick note/ })).toBeVisible()
    await expectNoViolations(page, 'the quick note box')
    await page.keyboard.press('Escape')

    await page.getByRole('searchbox', { name: /Search notes/ }).fill('accessible')
    await page.getByRole('button', { name: 'Search tips' }).click()
    await expectNoViolations(page, 'search with tips open')
    await page.keyboard.press('Escape')
    await page.getByRole('searchbox', { name: /Search notes/ }).fill('')

    await page.getByRole('button', { name: /Knowledge Graph/ }).click()
    await expectNoViolations(page, 'the knowledge graph')
    await page.getByRole('button', { name: 'Around a note' }).click()
    await expectNoViolations(page, 'the relationship explorer')

    await page.getByRole('button', { name: /^Trash \d+$/ }).click()
    await expectNoViolations(page, 'Trash')
  })
}

test('the navigation drawer on a phone-sized screen has no problems axe can find', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  await expectNoViolations(page, 'the workspace on a phone')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Primary navigation' })).toBeVisible()
  await expectNoViolations(page, 'the navigation drawer')
})
