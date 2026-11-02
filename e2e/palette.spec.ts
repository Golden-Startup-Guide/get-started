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

  // The shortcut is left alone while the editor is open.
  await page.getByRole('textbox', { name: 'Note title' }).press('ControlOrMeta+k')
  await expect(palette).toHaveCount(0)
  await page.getByRole('button', { name: 'Close editor' }).first().click()

  // A place: the page changes and its heading takes focus.
  await page.getByRole('button', { name: 'Open command palette' }).click()
  await input.fill('favorites')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Favorites', level: 1 })).toBeFocused()
})
