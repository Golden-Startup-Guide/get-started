import { createNote, expect, openWorkspace, test } from './helpers'

const DAY = 24 * 60 * 60 * 1000

test('backs up to a chosen folder at once and remembers the folder', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium-based browsers can write to a folder')
  // Playwright cannot answer the folder picker, so it hands over a folder in the browser's own
  // private file system, which is a real folder handle.
  await page.addInitScript(() => {
    Object.assign(window, {
      showDirectoryPicker: async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Backups', { create: true }),
    })
  })
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Open settings' }).first().click()
  const section = page.getByRole('region', { name: 'Automatic backups' })
  await section.getByRole('button', { name: 'Choose a backup folder…' }).click()
  await expect(section).toContainText('Backing up to the folder Backups')
  await expect(section).toContainText(/Last backup: .+ \(my-notes-backup-\d{4}-\d{2}-\d{2}\.json\)\./)
  // Each backup is proven by restoring the saved file into a test database.
  await expect(section).toContainText(/Checked .+: a test restore brought back 1 note, 0 attachments, 0 history entries, and 0 links\./)

  const saved = () => page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('Backups')
    const names: string[] = []
    for await (const name of (folder as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name)
    const backup = JSON.parse(await (await (await folder.getFileHandle(names[0])).getFile()).text())
    return { names, notes: backup.notes.length as number }
  })
  expect(await saved()).toEqual({ names: [expect.stringMatching(/^my-notes-backup-/)], notes: 1 })

  // The folder is remembered, and Back up now writes again.
  await page.reload()
  await page.getByRole('button', { name: 'Open settings' }).first().click()
  await expect(section).toContainText('Backing up to the folder Backups')
  await section.getByRole('button', { name: 'Back up now' }).click()
  await expect(section.getByRole('button', { name: 'Back up now' })).toBeEnabled()
  expect((await saved()).names).toHaveLength(1)

  await section.getByRole('button', { name: 'Stop using this folder' }).click()
  await expect(section.getByRole('button', { name: 'Choose a backup folder…' })).toBeVisible()
})

test('reminds to back up a week after changes, and a download or Later clears it', async ({ page }) => {
  await page.clock.install()
  await openWorkspace(page)
  await createNote(page, 'Worth keeping', 'Something to back up')
  const reminder = page.getByRole('region', { name: 'Backup reminder' })
  await expect(reminder).toHaveCount(0)

  await page.clock.setSystemTime(Date.now() + 8 * DAY)
  await page.reload()
  await expect(reminder).toContainText('You haven’t backed up your notes yet.')
  await reminder.getByRole('button', { name: 'Later' }).click()
  await expect(reminder).toHaveCount(0)

  // Two days later it is back; downloading a backup clears it for good.
  await page.clock.setSystemTime(Date.now() + 10 * DAY)
  await page.reload()
  await expect(reminder).toBeVisible()
  const download = page.waitForEvent('download')
  await reminder.getByRole('button', { name: 'Download a backup' }).click()
  expect((await download).suggestedFilename()).toMatch(/^my-notes-backup-\d{4}-\d{2}-\d{2}\.json$/)
  // The downloaded backup is restored as a test, and the result reported.
  await expect(page.getByRole('status').filter({ hasText: 'downloaded and checked' })).toContainText(/a test restore brought back 2 notes, 0 attachments, \d+ history entr(y|ies), and 0 links\./)
  await expect(reminder).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Worth keeping' })).toBeVisible()
  await expect(reminder).toHaveCount(0)
})
