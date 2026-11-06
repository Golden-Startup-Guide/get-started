import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'

describe('starter notes in a brand-new library', () => {
  let storage: typeof import('./notes')

  beforeAll(async () => {
    await deleteDB('my-notes')
    vi.resetModules()
    storage = await import('./notes')
  })

  afterAll(async () => {
    ;(await storage.openNotesDatabase()).close()
    await deleteDB('my-notes')
  })

  it('starts "My notes" with one notebook and the untagged Welcome note', async () => {
    const notes = await storage.getNotes()
    expect(notes).toEqual([expect.objectContaining({ id: 'starter-note-welcome', notebookId: 'starter-personal', title: 'Welcome to your Knowledge Library', tags: [], pinned: false, favorite: false })])
    expect((await storage.getNotebooks()).map((notebook) => notebook.name)).toEqual(['Personal'])
    expect((await storage.getLibraries()).map((library) => library.name)).toEqual(['My notes'])
    expect(await storage.getTags()).toEqual([])
  })

  it('does not duplicate starter notes when a backup containing them is imported', async () => {
    const backup = await storage.exportBackup()
    const text = JSON.stringify(backup)
    const file = new File([text], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => text })
    await expect(storage.importBackupFile(file)).resolves.toEqual(expect.objectContaining({ notesAdded: 0, notesSkipped: 1 }))
    expect(await storage.getNotes()).toHaveLength(1)
  })
})
