import { expect, openWorkspace, test } from './helpers'

test('draws the whole library, narrows it with search, and selects a note to explore', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: /Knowledge Graph/ }).click()
  const wholeLibrary = page.getByRole('button', { name: 'Whole library' })
  // Browsers without WebGL 2 start in "Around a note" instead.
  test.skip(await wholeLibrary.getAttribute('aria-pressed') !== 'true', 'No WebGL 2 in this browser')

  // The starter library: five notes, one link between them.
  const status = page.getByRole('status').filter({ hasText: /notes? ·/ })
  await expect(status).toHaveText('5 notes · 1 link', { timeout: 15_000 })
  await expect(page.locator('.library-graph canvas').first()).toBeVisible()
  await expect(page.getByRole('img', { name: /Graph of 5 notes/ })).toBeVisible()

  // Search narrows the graph and lists the few notes left, to select from the keyboard.
  await page.getByRole('searchbox', { name: /Search notes/ }).fill('welcome')
  await expect(status).toHaveText('1 of 5 notes · 1 link')
  const listed = page.getByRole('navigation', { name: 'Notes in the graph' }).getByRole('button')
  await expect(listed).toHaveCount(1)
  await listed.focus()
  await page.keyboard.press('Enter')
  await expect(listed).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Selected note')).toBeVisible()
  await expect(page.getByText('1 linked note')).toBeVisible()

  await page.getByRole('button', { name: 'Explore around it' }).click()
  await expect(page.getByRole('button', { name: 'Around a note' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Explore note' }).locator('option:checked')).toHaveText(/^Welcome to your Knowledge Library/)
  await expect(page.getByRole('region', { name: 'Links from this note' }).getByRole('button')).toHaveCount(1)
})
