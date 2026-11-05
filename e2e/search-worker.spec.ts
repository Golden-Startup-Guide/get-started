import { seedLibrary } from '../bench/seedLibrary'
import { expect, openWorkspace, test } from './helpers'

// Libraries of 5,000 notes or more are searched in a Web Worker; results must match exactly.
test('searches a large library in a worker, with exact counts, filters, and edits picked up', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Seeding 5,200 notes into WebKit’s IndexedDB takes several minutes on Windows')
  test.setTimeout(180_000)
  await openWorkspace(page)
  const library = await page.evaluate(seedLibrary, { notes: 5_200 })
  // The worker starts on focus, or earlier in idle time after loading, so listen from the reload.
  const workerStarted = page.waitForEvent('worker', { predicate: (worker) => worker.url().includes('search.worker'), timeout: 60_000 })
  await page.reload()
  const count = page.locator('#note-count')
  await expect(count).toHaveText(`${(library.notes).toLocaleString('en-US')} notes`, { timeout: 60_000 })

  const search = page.getByRole('searchbox', { name: /Search notes/ })
  await search.focus()
  await workerStarted

  await search.fill(library.searchTerm)
  await expect(count).toHaveText(`${(library.searchMatches).toLocaleString('en-US')} notes`, { timeout: 30_000 })

  // Exclusion: every note without the word.
  await search.fill(`-${library.searchTerm}`)
  await expect(count).toHaveText(`${(library.notes - library.searchMatches).toLocaleString('en-US')} notes`, { timeout: 30_000 })

  // An edit made after the worker started is searchable.
  await search.fill('')
  await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill('Quokka sightings')
  await expect(page.locator('.save-status')).toHaveText(/Saved/)
  await page.getByRole('button', { name: 'Close editor' }).first().click()
  await search.fill('quokka')
  await expect(count).toHaveText('1 note', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Quokka sightings' })).toBeVisible()

  // Date and has: filters work in the worker too: the seeded notes are from 2025.
  await search.fill('after:today')
  await expect(count).toHaveText('1 note', { timeout: 30_000 })
  await search.fill('before:2026 -has:attachment')
  await expect(count).toHaveText(`${(library.notes).toLocaleString('en-US')} notes`, { timeout: 30_000 })
})
