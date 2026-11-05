import { createNote, expect, expectSaved, markdownText, openWorkspace, test } from './helpers'

test('offers to update links in other notes after a rename, and Not now leaves them', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')
  await createNote(page, 'Planting calendar', 'Order from [[Seed catalogue]] and [[seed catalogue|the list]].')
  await createNote(page, 'Shopping', 'Check [[Seed catalogue#Prices]] first.')

  await page.getByRole('button', { name: 'Open note Seed catalogue' }).click()
  const title = page.getByRole('textbox', { name: 'Note title' })
  await title.fill('Seed list')
  const banner = page.locator('.rename-links')
  await expect(banner).toContainText('2 notes link to “Seed catalogue”. Update them to “Seed list”?')

  // "Not now" hides it and changes nothing in the other notes.
  await banner.getByRole('button', { name: 'Not now' }).click()
  await expect(banner).toHaveCount(0)
  await expectSaved(page)
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await page.getByRole('button', { name: 'Open note Planting calendar' }).click()
  expect(await markdownText(page)).toBe('Order from [[Seed catalogue]] and [[seed catalogue|the list]].')
})

test('does not offer to update links while another note still has the old title', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Ideas')
  await createNote(page, 'Journal', 'See [[Ideas]].')
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Ideas')
  await page.getByRole('textbox', { name: 'Note text' }).fill('A second note titled Ideas')
  await expectSaved(page)
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  // The older "Ideas" is renamed, but [[Ideas]] already leads to the newer note of that name.
  await page.getByRole('button', { name: 'Open note Ideas' }).last().click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Old ideas')
  await expectSaved(page)
  await page.waitForTimeout(800)
  await expect(page.locator('.rename-links')).toHaveCount(0)
})

test('rewrites the links, keeping sections and shown text', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')
  await createNote(page, 'Planting calendar', 'Order from [[Seed catalogue]] and [[seed catalogue|the list]].')
  await createNote(page, 'Shopping', 'Check [[Seed catalogue#Prices]] first.')

  await page.getByRole('button', { name: 'Open note Seed catalogue' }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Seed list')
  const banner = page.locator('.rename-links')
  await banner.getByRole('button', { name: 'Update links' }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Updated links' })).toHaveText('Updated links in 2 notes to “Seed list”.')
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  await page.getByRole('button', { name: 'Open note Planting calendar' }).click()
  expect(await markdownText(page)).toBe('Order from [[Seed list]] and [[Seed list|the list]].')
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await page.getByRole('button', { name: 'Open note Shopping' }).click()
  expect(await markdownText(page)).toBe('Check [[Seed list#Prices]] first.')
})
