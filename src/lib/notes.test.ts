import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteDB, openDB } from 'idb'
import type { Note } from '../types'

const legacyNote: Note = {
  id: 'existing-v1-note',
  title: 'V1 note',
  content: 'Preserve this content',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
}

describe('IndexedDB storage and backup', () => {
  let storage: typeof import('./notes')

  function jsonFile(value: string, name = 'backup.json'): File {
    const file = new File([value], name, { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => value })
    return file
  }

  beforeAll(async () => {
    const oldDb = await openDB('my-notes', 1, {
      upgrade(db) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('by-updated', 'updatedAt')
      },
    })
    await oldDb.put('notes', legacyNote)
    oldDb.close()
    vi.resetModules()
    storage = await import('./notes')
  })

  afterAll(async () => {
    const db = await storage.openNotesDatabase()
    db.close()
    await deleteDB('my-notes')
  })

  it('migrates V1 notes without changing their identity or content', async () => {
    const notes = await storage.getNotes()
    expect(notes).toContainEqual(expect.objectContaining({
      ...legacyNote,
      notebookId: 'starter-personal',
      tags: [],
      pinned: false,
      favorite: false,
    }))
    expect((await storage.getNotebooks()).map((notebook) => notebook.name).sort()).toEqual([
      'Health Handbook',
      'Ideas',
      'Personal',
      'Research',
      'Work',
    ])
    const db = await storage.openNotesDatabase()
    expect(db.version).toBe(2)
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['notes', 'notebooks', 'settings', 'tags', 'history']))
  })

  it('supports notebook and tagged note CRUD, pins, and favorites', async () => {
    const notebook = await storage.createNotebook('Projects')
    const note: Note = {
      id: 'feature-note',
      title: 'Launch plan',
      content: 'Prepare the release',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notebookId: notebook.id,
      tags: ['Work', 'Ideas', 'work'],
      pinned: true,
      favorite: true,
    }
    await storage.saveNote(note)
    await storage.renameNotebook(notebook.id, 'Launches')
    expect(await storage.getTags()).toEqual([
      { id: 'ideas', label: 'Ideas', count: 1 },
      { id: 'work', label: 'Work', count: 1 },
    ])
    expect(await storage.getNotebooks()).toContainEqual(expect.objectContaining({ id: notebook.id, name: 'Launches' }))
    await storage.setNoteFlag(note.id, 'pinned', false)
    await storage.setNoteFlag(note.id, 'favorite', false)
    expect(await (await storage.openNotesDatabase()).get('notes', note.id)).toEqual(expect.objectContaining({
      notebookId: notebook.id,
      pinned: false,
      favorite: false,
      tags: ['Work', 'Ideas'],
    }))
    await storage.moveNote(note.id, 'starter-work')
    expect(await (await storage.openNotesDatabase()).get('notes', note.id)).toEqual(expect.objectContaining({ notebookId: 'starter-work' }))

    await storage.deleteNotebook(notebook.id, 'starter-personal')
    expect(await storage.getNotebooks()).not.toContainEqual(expect.objectContaining({ id: notebook.id }))

    const anotherNotebook = await storage.createNotebook('Archive')
    const toReassign = { ...note, id: 'reassigned-note', notebookId: anotherNotebook.id }
    await storage.saveNote(toReassign)
    await storage.deleteNotebook(anotherNotebook.id, 'starter-personal')
    expect(await (await storage.openNotesDatabase()).get('notes', toReassign.id)).toEqual(
      expect.objectContaining({ notebookId: 'starter-personal' }),
    )
    await expect(storage.createNotebook('personal')).rejects.toThrow('already exists')
  })

  it('keeps content revisions and restores the previous saved version', async () => {
    const original = await storage.openNotesDatabase().then((db) => db.get('notes', legacyNote.id))
    expect(original).toBeDefined()
    await storage.saveNote({ ...original!, title: 'Revised title', content: 'Revised content' })
    const revisions = await storage.getNoteHistory(legacyNote.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0].snapshot).toEqual(expect.objectContaining({
      title: legacyNote.title,
      content: legacyNote.content,
    }))
    await storage.restoreHistory(revisions[0].id)
    expect(await (await storage.openNotesDatabase()).get('notes', legacyNote.id)).toEqual(expect.objectContaining({
      title: legacyNote.title,
      content: legacyNote.content,
    }))
    expect(await storage.getNoteHistory(legacyNote.id)).toHaveLength(2)
    await storage.deleteNote(legacyNote.id)
    expect(await storage.getNoteHistory(legacyNote.id)).toHaveLength(0)
  })

  it('persists theme preference and exports/imports a full backup without overwrites', async () => {
    await storage.saveTheme('dark')
    expect(await storage.getSettings()).toEqual({ id: 'preferences', theme: 'dark' })
    const note: Note = {
      id: 'backup-note',
      title: 'Backup me',
      content: '# backed up',
      createdAt: 1,
      updatedAt: 2,
      notebookId: 'starter-research',
      tags: ['archive'],
      pinned: true,
      favorite: true,
    }
    await storage.saveNote(note)
    const backup = await storage.exportBackup()
    expect(backup).toEqual(expect.objectContaining({
      format: 'my-notes-backup',
      version: 1,
      settings: { id: 'preferences', theme: 'dark' },
    }))
    expect(backup.notes).toContainEqual(expect.objectContaining({ id: note.id, favorite: true, pinned: true }))
    expect(backup.tags).toContainEqual(expect.objectContaining({ id: 'archive' }))

    await storage.deleteNote(note.id)
    const restoreFile = jsonFile(JSON.stringify(backup))
    const result = await storage.importBackupFile(restoreFile)
    expect(result.notesAdded).toBe(1)
    expect(await (await storage.openNotesDatabase()).get('notes', note.id)).toEqual(expect.objectContaining({
      title: note.title,
      notebookId: note.notebookId,
      tags: note.tags,
      favorite: true,
      pinned: true,
    }))
    expect((await storage.importBackupFile(restoreFile)).notesSkipped).toBe(backup.notes.length)
  })

  it('rejects malformed, duplicate-ID, and oversized backup files before importing', async () => {
    const malformed = jsonFile('{broken', 'bad.json')
    await expect(storage.importBackupFile(malformed)).rejects.toThrow('valid JSON')

    const valid = await storage.exportBackup()
    const duplicate = { ...valid, notes: [...valid.notes, valid.notes[0]] }
    const duplicateFile = jsonFile(JSON.stringify(duplicate), 'duplicate.json')
    await expect(storage.importBackupFile(duplicateFile)).rejects.toThrow('duplicate')

    const largeFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.json', { type: 'application/json' })
    await expect(storage.importBackupFile(largeFile)).rejects.toThrow('10 MiB')
  })
})
