import { createNote, expect, openWorkspace, test } from './helpers'

test('searches with words in any order, phrases, exclusions, and tag and notebook filters', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed order', 'Buy tomato and basil seeds')
  await createNote(page, 'Watering plan', 'Water the basil every morning')

  const search = page.getByRole('searchbox', { name: /Search notes/ })
  const count = page.locator('#note-count')

  await search.fill('basil water')
  await expect(count).toHaveText('1 note')
  await expect(page.getByRole('heading', { name: 'Watering plan' })).toBeVisible()
  await expect(page.locator('mark').filter({ hasText: /^basil$/i }).first()).toBeVisible()

  await search.fill('basil -tomato')
  await expect(count).toHaveText('1 note')
  await search.fill('"tomato and basil"')
  await expect(count).toHaveText('1 note')
  await expect(page.getByRole('heading', { name: 'Seed order' })).toBeVisible()

  // Three notes in the Personal notebook: the Welcome note and the two above.
  await search.fill('notebook:personal')
  await expect(count).toHaveText('3 notes')
  await search.fill('notebook:personal welcome')
  await expect(count).toHaveText('1 note')
  await expect(page.getByRole('heading', { name: 'Welcome to your Knowledge Library' })).toBeVisible()

  // The tips explain the operators and add an example to the search.
  await search.fill('basil')
  await page.getByRole('button', { name: 'Search tips' }).click()
  const tips = page.getByRole('region', { name: 'Search tips' })
  await expect(tips).toBeVisible()
  await tips.getByRole('button', { name: /^-tomato/ }).click()
  await expect(search).toHaveValue('basil -tomato')
  await expect(search).toBeFocused()
  await expect(count).toHaveText('1 note')
  // The panel stays open after adding an example, so more can be added.
  await expect(tips).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tips).toHaveCount(0)

  // From the keyboard: Enter opens the tips, Escape closes them and keeps focus on the button,
  // and the search is not cleared.
  const tipsButton = page.getByRole('button', { name: 'Search tips' })
  await tipsButton.focus()
  await page.keyboard.press('Enter')
  await expect(tips).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tips).toHaveCount(0)
  await expect(tipsButton).toBeFocused()
  await expect(search).toHaveValue('basil -tomato')

  // Escape also closes them while typing in the search box, without clearing it.
  await tipsButton.click()
  await search.focus()
  await page.keyboard.press('Escape')
  await expect(tips).toHaveCount(0)
  await expect(search).toHaveValue('basil -tomato')
})

test('filters by open tasks and edit date, and saves a search to run from the sidebar', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed jobs', '- [x] order seeds\n- [ ] sow the basil')
  await createNote(page, 'Basil harvest', '- [x] pick the basil')

  const search = page.getByRole('searchbox', { name: /Search notes/ })
  const count = page.locator('#note-count')
  await search.fill('basil has:task')
  await expect(count).toHaveText('1 note')
  await expect(page.getByRole('heading', { name: 'Seed jobs' })).toBeVisible()
  await search.fill('basil -has:task after:today')
  await expect(count).toHaveText('1 note')
  await expect(page.getByRole('heading', { name: 'Basil harvest' })).toBeVisible()
  await search.fill('basil before:today')
  await expect(count).toHaveText('0 notes')

  await search.fill('basil has:task')
  await page.getByRole('button', { name: 'Save this search' }).click()
  const name = page.getByRole('textbox', { name: 'Name this search' })
  await expect(name).toBeFocused()
  await name.fill('Basil to do')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Remove saved search “Basil to do”' })).toBeVisible()

  await page.getByRole('button', { name: 'Clear search' }).click()
  await page.getByRole('navigation', { name: 'Saved searches' }).getByRole('button', { name: 'Basil to do' }).click()
  await expect(search).toHaveValue('basil has:task')
  await expect(count).toHaveText('1 note')

  // Kept after a reload, and found in the command palette.
  await page.reload()
  await page.getByRole('button', { name: 'Open command palette' }).click()
  await page.getByRole('combobox').fill('basil to do')
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('basil has:task')
  await expect(count).toHaveText('1 note')
})
