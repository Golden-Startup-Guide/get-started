import { expect, openWorkspace, test } from './helpers'

test('repairs a damaged library at start-up and says what it did', async ({ page }) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: 'Open settings' }).first().click()
  await expect(page.getByText('The library check at start-up found no problems.')).toBeVisible()
  await page.getByRole('button', { name: 'Close settings' }).click()

  // Damage the library directly in IndexedDB: a note in a deleted notebook, a link to a note
  // that does not exist, and an attachment left behind by a deleted note.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('my-notes')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const transaction = db.transaction(['notes', 'noteLinks', 'attachments'], 'readwrite')
      transaction.objectStore('notes').put({ id: 'lost-note', title: 'Lost and found', content: 'Still here', createdAt: 1, updatedAt: 2, notebookId: 'deleted-notebook', tags: [], pinned: false, favorite: false })
      transaction.objectStore('noteLinks').put({ sourceNoteId: 'lost-note', targetNoteId: 'never-existed' })
      transaction.objectStore('attachments').put({ id: 'stray-file', noteId: 'deleted-long-ago', name: 'stray.txt', type: 'text/plain', size: 1, createdAt: 1, data: new ArrayBuffer(1) })
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    }
  }))
  await page.reload()

  const notice = page.getByRole('status').filter({ hasText: 'checked your library' })
  await expect(notice).toHaveText(/The app checked your library and repaired it: removed 1 link to notes that no longer exist; removed 1 attachment left behind by deleted notes; moved 1 note whose notebook was missing to “Personal”\./)
  // The rescued note is in Personal, with its text.
  await page.getByRole('button', { name: /^Personal \d+$/ }).click()
  await expect(page.getByRole('heading', { name: 'Lost and found' })).toBeVisible()

  await page.getByRole('button', { name: 'Open settings' }).first().click()
  await expect(page.getByText(/The library check at start-up repaired it: removed 1 link/)).toBeVisible()
})
