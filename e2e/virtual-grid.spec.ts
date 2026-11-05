import { seedLibrary } from '../bench/seedLibrary'
import { expect, openWorkspace, test } from './helpers'

// jsdom has no layout, so only a real browser can show that the grid renders a window of
// rows, measures them without overlap, and reaches every note by scrolling.
test('renders only the visible part of a large note grid', async ({ page }) => {
  await openWorkspace(page)
  const library = await page.evaluate(seedLibrary, { notes: 600 })
  await page.reload()
  await expect(page.locator('#note-count')).toHaveText(`${(library.notes).toLocaleString('en-US')} notes`)

  const feed = page.getByRole('feed', { name: 'All Notes notes' })
  const cards = feed.locator('article')
  await expect(cards.first()).toBeVisible()
  const rendered = await cards.count()
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(100)
  await expect(cards.first()).toHaveAttribute('aria-setsize', String(library.notes))
  await expect(cards.first()).toHaveAttribute('aria-posinset', '1')

  // Rows are absolutely positioned from measured heights; none may overlap the next.
  const rowBoxes = await feed.locator(':scope > div').evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect()).map((box) => ({ top: box.top, bottom: box.bottom })),
  )
  rowBoxes.sort((a, b) => a.top - b.top)
  for (let index = 1; index < rowBoxes.length; index += 1) {
    expect(rowBoxes[index].top).toBeGreaterThanOrEqual(rowBoxes[index - 1].bottom - 1)
  }

  // Scrolling to the end renders the last note.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(feed.locator(`article[aria-posinset="${library.notes}"]`)).toBeVisible()
  expect(await cards.count()).toBeLessThan(100)

  // Search still reaches notes that were never rendered.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('searchbox', { name: /Search notes/ }).fill(library.searchTerm)
  await expect(page.locator('#note-count')).toHaveText(`${(library.searchMatches).toLocaleString('en-US')} notes`)
  await expect(page.getByRole('feed').locator('article').first()).toBeVisible()
})
