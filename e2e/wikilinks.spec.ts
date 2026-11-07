import { createNote, expect, expectSaved, markdownText, openWorkspace, test } from './helpers'

test('links notes by typing [[ and a suggested title, then follows the link and its backlink', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')

  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Planting calendar')
  const editor = page.getByRole('textbox', { name: 'Note text' })
  await editor.click()
  await page.keyboard.type('Order from [[seed')
  const suggestions = page.getByRole('listbox')
  await expect(suggestions.getByRole('option', { name: 'Seed catalogue' })).toBeVisible()

  // Escape closes the suggestions without closing the editor.
  await page.keyboard.press('Escape')
  await expect(suggestions).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.type(' ')
  await page.keyboard.press('Backspace')
  await expect(suggestions.getByRole('option', { name: 'Seed catalogue' })).toBeVisible()
  // CodeMirror ignores Enter for 75 ms after the list appears, so fast typing is never taken as
  // picking a suggestion; pause as a person would.
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.keyboard.type(' soon.')
  await expect.poll(() => markdownText(page)).toBe('Order from [[Seed catalogue]] soon.')
  await expectSaved(page)

  await expect(page.getByRole('list', { name: 'Links from this note' })).toContainText('Seed catalogue')
  await expect(page.getByRole('list', { name: 'Links from this note' })).toContainText('in text')
  await expect(page.getByRole('button', { name: 'Remove link to Seed catalogue' })).toHaveCount(0)

  await page.locator('.prose-notes').getByRole('link', { name: 'Seed catalogue' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Seed catalogue')
  const backlinks = page.getByRole('list', { name: 'Mentioned in' })
  await expect(backlinks).toContainText('Planting calendar')

  await backlinks.getByRole('button', { name: 'Planting calendar' }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Planting calendar')
})
