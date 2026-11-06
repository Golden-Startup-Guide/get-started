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

  it('gives every starter notebook one untagged note, welcome note first', async () => {
    const notes = await storage.getNotes()
    const notebooks = await storage.getNotebooks()
    expect(notes).toHaveLength(notebooks.length)
    expect(new Set(notes.map((note) => note.notebookId))).toEqual(new Set(notebooks.map((notebook) => notebook.id)))
    expect(notes[0]).toEqual(expect.objectContaining({ id: 'starter-note-welcome', notebookId: 'starter-personal', title: 'Welcome to your Knowledge Library' }))
    expect(notes.every((note) => note.tags?.length === 0 && !note.pinned && !note.favorite && note.content.length > 0)).toBe(true)
    expect(await storage.getTags()).toEqual([])
  })

  it('does not duplicate starter notes when a backup containing them is imported', async () => {
    const backup = await storage.exportBackup()
    const text = JSON.stringify(backup)
    const file = new File([text], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => text })
    await expect(storage.importBackupFile(file)).resolves.toEqual(expect.objectContaining({ notesAdded: 0, notesSkipped: 5 }))
    expect(await storage.getNotes()).toHaveLength(5)
  })
})
