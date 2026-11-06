import { createNote, expect, expectSaved, markdownText, openWorkspace, test, trackProblems } from './helpers'

test('stores notes in real IndexedDB so they survive a reload', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Garden plan', '- [ ] Water the seedlings\n- [x] Buy compost')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Garden plan' })).toBeVisible()

  await page.getByRole('button', { name: 'Open note Garden plan' }).click()
  await expect(page.getByRole('progressbar', { name: 'Checklist progress' })).toHaveText('1 of 2 complete')
  await page.getByRole('checkbox', { name: 'Mark task Water the seedlings complete' }).click()
  await expect(page.getByRole('progressbar', { name: 'Checklist progress' })).toHaveText('2 of 2 complete')
  await expectSaved(page)
  // The open note is in the page's address, so the reload reads it back from storage and opens it.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Garden plan')
  await expect.poll(() => markdownText(page)).toBe('- [x] Water the seedlings\n- [x] Buy compost')
})

test('ships the Content Security Policy in the production build', async ({ page }) => {
  await openWorkspace(page)
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(policy).toContain("script-src 'self'")
  expect(policy).toContain("object-src 'none'")
})

test('keeps two tabs in sync through BroadcastChannel', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  const firstProblems = await trackProblems(first)
  const secondProblems = await trackProblems(second)
  await openWorkspace(first)
  await openWorkspace(second)

  await createNote(first, 'Shared note', 'Written in the first tab')
  await expect(second.getByRole('heading', { name: 'Shared note' })).toBeVisible()

  await second.getByRole('button', { name: 'Open note Shared note' }).click()
  await expect.poll(() => markdownText(second)).toBe('Written in the first tab')
  await first.getByRole('button', { name: 'Open note Shared note' }).click()
  await first.getByRole('textbox', { name: 'Note text' }).fill('Edited in the first tab')
  await expectSaved(first)

  // The second tab has no unsaved edits, so it shows the newer version on its own.
  await expect.poll(() => markdownText(second)).toBe('Edited in the first tab')
  expect([...firstProblems, ...secondProblems]).toEqual([])
})

test('exports a backup and restores it into an empty browser profile', async ({ page, browser }, testInfo) => {
  await openWorkspace(page)
  await createNote(page, 'Backed-up note', 'Restore me on another device')

  await page.getByRole('button', { name: 'Open settings' }).first().click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON backup' }).click()
  const download = await downloadPromise
  const backupPath = testInfo.outputPath('backup.json')
  await download.saveAs(backupPath)

  const freshContext = await browser.newContext()
  try {
    const fresh = await freshContext.newPage()
    const problems = await trackProblems(fresh)
    await openWorkspace(fresh)
    await expect(fresh.getByRole('heading', { name: 'Backed-up note' })).toHaveCount(0)

    await fresh.getByRole('button', { name: 'Open settings' }).first().click()
    await fresh.getByLabel('Choose a JSON backup').setInputFiles(backupPath)
    fresh.once('dialog', (dialog) => void dialog.accept())
    await fresh.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(fresh.getByRole('dialog', { name: 'Settings' }).getByRole('status')).toHaveText(/Backup restored: .* 1 notes/)
    await fresh.getByRole('button', { name: 'Close settings' }).click()
    await expect(fresh.getByRole('heading', { name: 'Backed-up note' })).toBeVisible()
    expect(problems).toEqual([])
  } finally {
    await freshContext.close()
  }
})

test('links notes by searching in the link picker with the keyboard', async ({ page }) => {
  await openWorkspace(page)
  await createNote(page, 'Seed catalogue')
  await createNote(page, 'Planting calendar')

  await page.getByRole('button', { name: 'Open note Planting calendar' }).click()
  const picker = page.getByRole('combobox', { name: 'Choose a note to link' })
  await picker.fill('seed')
  await expect(page.getByRole('listbox', { name: 'Notes to link' }).getByRole('option')).toHaveCount(1)
  await picker.press('ArrowDown')
  await picker.press('Enter')
  await expect(picker).toHaveValue(/^Seed catalogue — /)
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByRole('list', { name: 'Links from this note' })).toContainText('Seed catalogue')
  await expect(picker).toHaveValue('')
})
