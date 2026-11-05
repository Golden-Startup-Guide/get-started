import { createNote, expect, expectSaved, markdownText, openWorkspace, test } from './helpers'

test('inserts Markdown from the slash menu with the keyboard', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Plan')
  await page.getByRole('textbox', { name: 'Note text' }).click()
  const menu = page.getByRole('listbox')
  // CodeMirror ignores Enter for 75 ms after a list appears, so fast typing never picks by mistake.
  const pick = async () => {
    await page.waitForTimeout(150)
    await page.keyboard.press('Enter')
  }

  // A slash inside a word does nothing.
  await page.keyboard.type('Buy seeds and/or compost')
  await page.waitForTimeout(200)
  await expect(menu).toHaveCount(0)

  // "/todo" finds the checklist by keyword.
  await page.keyboard.press('Enter')
  await page.keyboard.type('/todo')
  await expect(menu.getByRole('option')).toHaveText([/Checklist/])
  await pick()
  await page.keyboard.type('Order seeds')

  // Escape closes the menu and leaves the slash; the note editor stays open.
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Backspace')

  // "Link to note" goes straight on to note-title suggestions.
  await page.keyboard.type('/link')
  await expect(menu.getByRole('option')).toHaveText([/Link to note/])
  await pick()
  await expect(menu.getByRole('option', { name: 'Seed catalogue' })).toBeVisible()
  await pick()

  await expectSaved(page)
  expect(await markdownText(page)).toBe('Buy seeds and/or compost\n- [ ] Order seeds\n[[Seed catalogue]]')
})
