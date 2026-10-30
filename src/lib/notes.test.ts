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
    expect(db.version).toBe(4)
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['notes', 'notebooks', 'settings', 'tags', 'history', 'attachments']))
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
    await storage.trashNote(legacyNote.id)
    expect(await storage.getNoteHistory(legacyNote.id)).toHaveLength(2)
    await storage.permanentlyDeleteNote(legacyNote.id)
    expect(await storage.getNoteHistory(legacyNote.id)).toHaveLength(0)
  })

  it('moves notes to Trash, restores them with tags, and permanently removes them with history', async () => {
    const note: Note = {
      id: 'trash-test-note',
      title: 'Trash test',
      content: 'Keep until permanently deleted',
      createdAt: 20,
      updatedAt: 30,
      notebookId: 'starter-personal',
      tags: ['recoverable'],
    }
    await storage.saveNote(note)
    await storage.saveNote({ ...note, content: 'A later version', updatedAt: 40 })
    await storage.addNoteAttachment(note.id, new Blob(['keep with trash'], { type: 'text/plain' }), 'trash.txt')
    await expect(storage.permanentlyDeleteNote(note.id)).rejects.toThrow('Only notes in Trash')
    await storage.trashNote(note.id)

    expect(await storage.getNotes()).not.toContainEqual(expect.objectContaining({ id: note.id }))
    expect(await storage.getTrash()).toContainEqual(expect.objectContaining({ id: note.id, deletedAt: expect.any(Number) }))
    expect(await storage.getTags()).not.toContainEqual(expect.objectContaining({ id: 'recoverable' }))
    expect(await storage.getStorageSnapshot()).toEqual(expect.objectContaining({ trash: 1 }))
    expect(await storage.exportBackup()).toEqual(expect.objectContaining({
      notes: expect.arrayContaining([expect.objectContaining({ id: note.id, deletedAt: expect.any(Number) })]),
    }))
    const previousVersion = (await storage.getNoteHistory(note.id))[0]
    await storage.restoreHistory(previousVersion.id)
    expect(await storage.getTrash()).toContainEqual(
      expect.objectContaining({ id: note.id, deletedAt: expect.any(Number), content: note.content }),
    )
    await storage.restoreNote(note.id)
    expect(await storage.getTrash()).not.toContainEqual(expect.objectContaining({ id: note.id }))
    const restoredNote = (await storage.getNotes()).find((item) => item.id === note.id)
    expect(restoredNote).toBeDefined()
    expect(restoredNote).not.toHaveProperty('deletedAt')
    expect(await storage.getTags()).toContainEqual(expect.objectContaining({ id: 'recoverable', count: 1 }))
    expect(await storage.getNoteAttachments(note.id)).toHaveLength(1)

    await storage.trashNote(note.id)
    await storage.permanentlyDeleteNote(note.id)
    expect(await storage.getTrash()).not.toContainEqual(expect.objectContaining({ id: note.id }))
    expect(await storage.getNoteHistory(note.id)).toHaveLength(0)
    expect(await storage.getNoteAttachments(note.id)).toHaveLength(0)
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
    await storage.addNoteAttachment(note.id, new Blob(['imagebytes'], { type: 'image/png' }), 'garden.png')
    const backup = await storage.exportBackup()
    expect(backup).toEqual(expect.objectContaining({
      format: 'my-notes-backup',
      version: 2,
      settings: { id: 'preferences', theme: 'dark' },
    }))
    expect(backup.notes).toContainEqual(expect.objectContaining({ id: note.id, favorite: true, pinned: true }))
    expect(backup.tags).toContainEqual(expect.objectContaining({ id: 'archive' }))
    expect(backup.attachments).toContainEqual(expect.objectContaining({
      noteId: note.id,
      name: 'garden.png',
      data: 'aW1hZ2VieXRlcw==',
    }))

    await storage.trashNote(note.id)
    await storage.permanentlyDeleteNote(note.id)
    const restoreFile = jsonFile(JSON.stringify(backup))
    const result = await storage.importBackupFile(restoreFile)
    expect(result.notesAdded).toBe(1)
    expect(result.attachmentsAdded).toBe(1)
    expect(await (await storage.openNotesDatabase()).get('notes', note.id)).toEqual(expect.objectContaining({
      title: note.title,
      notebookId: note.notebookId,
      tags: note.tags,
      favorite: true,
      pinned: true,
    }))
    expect(await storage.getNoteAttachments(note.id)).toEqual([
      expect.objectContaining({ name: 'garden.png', type: 'image/png', size: 10 }),
    ])
    expect((await storage.importBackupFile(restoreFile)).notesSkipped).toBe(backup.notes.length)
    const { attachments: _attachments, ...legacyBackup } = backup
    const legacyResult = await storage.importBackupFile(jsonFile(JSON.stringify({ ...legacyBackup, version: 1 })))
    expect(legacyResult.attachmentsAdded).toBe(0)
  })

  it('rejects malformed, duplicate-ID, and oversized backup files before importing', async () => {
    const malformed = jsonFile('{broken', 'bad.json')
    await expect(storage.importBackupFile(malformed)).rejects.toThrow('valid JSON')

    const valid = await storage.exportBackup()
    const duplicate = { ...valid, notes: [...valid.notes, valid.notes[0]] }
    const duplicateFile = jsonFile(JSON.stringify(duplicate), 'duplicate.json')
    await expect(storage.importBackupFile(duplicateFile)).rejects.toThrow('duplicate')

    const withInvalidAttachment = {
      ...valid,
      attachments: [
        ...valid.attachments,
        {
          id: 'invalid-attachment',
          noteId: valid.notes[0].id,
          name: 'invalid.bin',
          type: 'application/octet-stream',
          size: 1,
          createdAt: 1,
          data: '%%%not-base64%%%',
        },
      ],
    }
    await expect(storage.importBackupFile(jsonFile(JSON.stringify(withInvalidAttachment)))).rejects.toThrow('invalid')

    const largeFile = new File([new Uint8Array(40 * 1024 * 1024 + 1)], 'large.json', { type: 'application/json' })
    await expect(storage.importBackupFile(largeFile)).rejects.toThrow('40 MiB')
  })

  it('enforces per-file, per-note, and attachment-count limits', async () => {
    const initialStorage = await storage.getStorageSnapshot()
    const note: Note = {
      id: 'attachment-limits-note',
      title: 'Attachment limits',
      content: '',
      createdAt: 1,
      updatedAt: 1,
      notebookId: 'starter-personal',
    }
    await storage.saveNote(note)
    await expect(
      storage.addNoteAttachment(note.id, new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), 'too-large.bin'),
    ).rejects.toThrow('5 MiB')

    const fiveMiB = new Blob([new Uint8Array(5 * 1024 * 1024)])
    for (let index = 0; index < 4; index += 1) {
      await storage.addNoteAttachment(note.id, fiveMiB, `large-${index}.bin`)
    }
    await expect(storage.addNoteAttachment(note.id, new Blob(['x']), 'over-limit.txt')).rejects.toThrow('20 MiB')
    for (let index = 4; index < 20; index += 1) {
      await storage.addNoteAttachment(note.id, new Blob([]), `empty-${index}.txt`)
    }
    await expect(storage.addNoteAttachment(note.id, new Blob([]), 'too-many.txt')).rejects.toThrow('at most 20')
    expect(await storage.getStorageSnapshot()).toEqual(expect.objectContaining({
      attachments: initialStorage.attachments + 20,
      attachmentBytes: initialStorage.attachmentBytes + 20 * 1024 * 1024,
    }))
  })

  it('upgrades an existing V3 database without changing note data', async () => {
    const current = await storage.openNotesDatabase()
    current.close()
    await deleteDB('my-notes')
    const versionThree = await openDB('my-notes', 3, {
      upgrade(db) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('by-updated', 'updatedAt')
        notes.createIndex('by-notebook', 'notebookId')
        notes.createIndex('by-tags', 'tags', { multiEntry: true })
        const notebooks = db.createObjectStore('notebooks', { keyPath: 'id' })
        notebooks.createIndex('by-name', 'name')
        db.createObjectStore('settings', { keyPath: 'id' })
        const tags = db.createObjectStore('tags', { keyPath: 'id' })
        tags.createIndex('by-label', 'label')
        const history = db.createObjectStore('history', { keyPath: 'id' })
        history.createIndex('by-note', 'noteId')
        history.createIndex('by-saved-at', 'savedAt')
      },
    })
    const note: Note = {
      id: 'existing-v3-note',
      title: 'V3 note',
      content: 'Keep intact',
      createdAt: 10,
      updatedAt: 20,
      notebookId: 'starter-personal',
      tags: ['unchanged'],
      pinned: true,
      favorite: true,
      deletedAt: 30,
    }
    await versionThree.put('notes', note)
    versionThree.close()
    vi.resetModules()
    storage = await import('./notes')

    expect(await storage.getTrash()).toEqual([note])
    expect(await storage.getNoteAttachments(note.id)).toEqual([])
    expect((await storage.openNotesDatabase()).version).toBe(4)
  })
})
