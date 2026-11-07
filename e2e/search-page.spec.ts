import { createNote, expect, openWorkspace, test } from './helpers'

test('one search finds handbook notes and places, says where each sits, and Back returns to the results', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('complementary', { name: 'Primary navigation' }).getByRole('button', { name: 'Search' }).click()
  const search = page.getByRole('searchbox', { name: 'Search the handbooks and your notes' })
  await expect(search).toBeFocused()
  const status = page.getByRole('status').filter({ hasText: /Type a word|result/ })
  await expect(status).toHaveText('Type a word or two to search every library, shelf, notebook, and note.')

  await search.fill('water')
  await expect(status).toHaveText(/^\d+ results for “water”$/)
  await expect(page).toHaveURL(/#\/search\?q=water$/)
  const results = page.getByRole('list', { name: 'Search results' })
  // A note whose title holds the word comes first, with its level, place, and the word marked.
  const first = results.getByRole('listitem').first()
  await expect(first).toContainText('Note · Handbook')
  await expect(first).toContainText('Water through the day')
  await expect(first).toContainText('Health & Wellbeing / Nutrition / Everyday Nutrition')
  await expect(first.locator('mark').first()).toHaveText(/water/i)

  await first.getByRole('button').click()
  await page.getByRole('dialog', { name: 'Water through the day' }).getByRole('button', { name: 'Close note' }).first().click()
  await expect(search).toHaveValue('water')

  // Places match by name and description; the breadcrumb confirms where a result is.
  await search.fill('nutrition')
  const shelf = results.getByRole('button', { name: /^Shelf\s*Nutrition/ })
  await expect(shelf).toBeVisible()
  await shelf.click()
  await expect(page.getByRole('heading', { name: 'Nutrition', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Home/Health & Wellbeing/Nutrition')
  await page.goBack()
  await expect(page.getByRole('searchbox', { name: 'Search the handbooks and your notes' })).toHaveValue('nutrition')
  await expect(results.getByRole('button', { name: /^Shelf\s*Nutrition/ })).toBeVisible()
})

test('finds your own notes too, and offers a way on when nothing matches', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed plan', 'Sow the basil in March.')
  await page.goto('/#/search?q=basil')
  const results = page.getByRole('list', { name: 'Search results' })
  const mine = results.getByRole('listitem').filter({ hasText: 'Seed plan' })
  await expect(mine).toContainText('My notes / General / Personal')
  await expect(mine).not.toContainText('Handbook')

  const search = page.getByRole('searchbox', { name: 'Search the handbooks and your notes' })
  await search.fill('zebra crossing')
  await expect(page.getByText('Nothing in the handbooks or your notes matched.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).last().click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await search.fill('zebra')
  await page.getByRole('button', { name: 'Browse the libraries' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to your library', level: 1 })).toBeVisible()
})
