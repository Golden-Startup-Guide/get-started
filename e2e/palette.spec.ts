import { createNote, expect, openWorkspace, test } from './helpers'

test('opens notes and places from the command palette with the keyboard', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')

  const searchBox = page.getByRole('searchbox', { name: /Search notes/ })
  await searchBox.focus()
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  const input = palette.getByRole('combobox', { name: 'Search notes, places, and actions' })
  await expect(input).toBeFocused()

  // Escape closes it and puts focus back where it was.
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await expect(searchBox).toBeFocused()

  // A note: type part of its title and press Enter.
  await page.keyboard.press('ControlOrMeta+k')
  await input.fill('seed cat')
  await expect(palette.getByRole('option').first()).toHaveText(/Seed catalogue/)
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Seed catalogue')

  await page.getByRole('button', { name: 'Close editor' }).first().click()

  // A place: the page changes and its heading takes focus.
  await page.getByRole('button', { name: 'Open command palette' }).click()
  await input.fill('favorites')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeFocused()
})

test('switches notes from the palette inside the editor, saving the open note first', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')
  await createNote(page, 'Planting calendar')

  await page.getByRole('button', { name: 'Open note Planting calendar' }).click()
  const editor = page.getByRole('textbox', { name: 'Note text' })
  await editor.click()
  // Typed and switched away at once, before autosave would normally run.
  await page.keyboard.type('Sow beans in May')
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  const input = palette.getByRole('combobox')
  await expect(input).toBeFocused()

  // Escape returns to the editor where you were typing.
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
  await expect(editor).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Planting calendar')

  // A theme change keeps the note open.
  await page.keyboard.press('ControlOrMeta+k')
  await input.fill('dark theme')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Planting calendar')

  // Choosing another note saves this one, then opens the other.
  await page.keyboard.press('ControlOrMeta+k')
  await input.fill('seed cat')
  await expect(palette.getByRole('option').first()).toHaveText(/Seed catalogue/)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Seed catalogue')

  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await page.reload()
  await page.getByRole('button', { name: 'Open note Planting calendar' }).click()
  await expect(page.getByRole('textbox', { name: 'Note text' })).toContainText('Sow beans in May')
})
