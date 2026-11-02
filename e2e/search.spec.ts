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

  // The starter "Weekly plan" note is the only one in the Work notebook.
  await search.fill('notebook:work')
  await expect(count).toHaveText('1 note')
  await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible()

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
