import { createNote, expect, openWorkspace, test } from './helpers'

test('draws the whole library, narrows it with search, and selects a note to explore', async ({ page }) => {
  await openWorkspace(page)
  // A second note, linking to the Welcome note a new library starts with.
  await createNote(page, 'Garden plan', 'Read [[Welcome to your Knowledge Library]] first.')
  await page.getByRole('button', { name: /^Note map/ }).click()
  // The map around a note comes first; the whole library is offered where WebGL 2 can draw it.
  await expect(page.getByRole('group', { name: 'Connected note graph' })).toBeVisible()
  const wholeLibrary = page.getByRole('button', { name: 'Whole library' })
  test.skip(await wholeLibrary.count() === 0, 'No WebGL 2 in this browser')
  await expect(page.getByRole('button', { name: 'Around a note' })).toHaveAttribute('aria-pressed', 'true')
  await wholeLibrary.click()

  // Two notes, one link between them.
  const status = page.getByRole('status').filter({ hasText: /notes? ·/ })
  await expect(status).toHaveText('2 notes · 1 link', { timeout: 15_000 })
  await expect(page.locator('.library-graph canvas').first()).toBeVisible()
  await expect(page.getByRole('img', { name: /Graph of 2 notes/ })).toBeVisible()

  // Search narrows the graph and lists the few notes left, to select from the keyboard.
  await page.getByRole('searchbox', { name: /Search notes/ }).fill('garden')
  await expect(status).toHaveText('1 of 2 notes · 1 link')
  const listed = page.getByRole('navigation', { name: 'Notes in the graph' }).getByRole('button')
  await expect(listed).toHaveCount(1)
  await listed.focus()
  await page.keyboard.press('Enter')
  await expect(listed).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Selected note')).toBeVisible()
  await expect(page.getByText('1 linked note')).toBeVisible()

  await page.getByRole('button', { name: 'Explore around it' }).click()
  await expect(page.getByRole('button', { name: 'Around a note' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Explore note' }).locator('option:checked')).toHaveText(/^Garden plan/)
  await expect(page.getByRole('region', { name: 'Links from this note' }).getByRole('button')).toHaveCount(1)
})
