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

  /** Removes a test's note even if the test failed partway, so later tests see a clean library. */
  async function discard(noteId: string) {
    await storage.trashNote(noteId).catch(() => undefined)
    await storage.permanentlyDeleteNote(noteId).catch(() => undefined)
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
    // Starter notes are only for brand-new libraries, never added to existing data.
    expect(notes.filter((note) => note.id.startsWith('starter-note-'))).toEqual([])
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
    expect(db.version).toBe(storage.DATABASE_VERSION)
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['notes', 'notebooks', 'libraries', 'shelves', 'settings', 'tags', 'history', 'attachments', 'noteLinks']))
    expect(await storage.getLibraries()).toContainEqual(expect.objectContaining({ id: 'starter-library', name: 'Personal Library' }))
    expect(await storage.getShelves()).toContainEqual(expect.objectContaining({ id: 'starter-shelf', libraryId: 'starter-library', name: 'General' }))
    expect((await storage.getNotebooks()).every((notebook) => notebook.shelfId === 'starter-shelf')).toBe(true)
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

  it('creates, moves, and safely deletes libraries and shelves without deleting notes', async () => {
    const library = await storage.createLibrary('Field Library')
    const shelf = await storage.createShelf(library.id, 'Growing')
    const notebook = await storage.createNotebook('Crop journal', shelf.id)
    const note: Note = {
      id: 'library-shelf-note',
      title: 'Seedling observations',
      content: 'Keep this note intact.',
      createdAt: 123,
      updatedAt: 456,
      notebookId: notebook.id,
      tags: ['field'],
      favorite: true,
      pinned: true,
    }
    await storage.saveNote(note)
    await storage.renameLibrary(library.id, 'Field Library Renamed')
    await storage.renameShelf(shelf.id, 'Growing Shelf')
    expect(await storage.getLibraries()).toContainEqual(expect.objectContaining({ id: library.id, name: 'Field Library Renamed' }))
    expect(await storage.getShelves()).toContainEqual(expect.objectContaining({ id: shelf.id, name: 'Growing Shelf' }))

    await expect(storage.deleteShelf(shelf.id, 'starter-shelf')).rejects.toThrow('same library')
    await expect(storage.deleteLibrary(library.id, library.id)).rejects.toThrow('different existing library')
    await storage.deleteLibrary(library.id, 'starter-library')
    expect(await storage.getLibraries()).not.toContainEqual(expect.objectContaining({ id: library.id }))
    expect(await storage.getShelves()).toContainEqual(expect.objectContaining({
      id: shelf.id,
      libraryId: 'starter-library',
      name: 'Growing Shelf',
    }))
    expect(await storage.getNotebooks()).toContainEqual(expect.objectContaining({ id: notebook.id, shelfId: shelf.id }))
    expect(await storage.getNotes()).toContainEqual(note)

    const secondShelf = await storage.createShelf('starter-library', 'Archive')
    await storage.moveNotebook(notebook.id, secondShelf.id)
    await storage.deleteShelf(shelf.id, secondShelf.id)
    expect(await storage.getShelves()).not.toContainEqual(expect.objectContaining({ id: shelf.id }))
    expect(await storage.getNotebooks()).toContainEqual(expect.objectContaining({ id: notebook.id, shelfId: secondShelf.id }))
    expect(await storage.getNotes()).toContainEqual(note)
    await expect(storage.createShelf('starter-library', 'archive')).rejects.toThrow('already exists')
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

  it('orders history newest first even when revisions are saved in the same millisecond', async () => {
    // Fast machines can create two revisions within one millisecond. A tie must not fall back
    // to the revisions' random IDs.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_900_000_000_000)
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-00000000000a')
      .mockReturnValueOnce('00000000-0000-4000-8000-00000000000b')
    const note: Note = { id: 'same-millisecond-note', title: 'Tie', content: 'first', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal' }
    try {
      await storage.saveNote(note)
      await storage.saveNote({ ...note, content: 'second' })
      const [older] = await storage.getNoteHistory(note.id)
      await storage.restoreHistory(older.id)
      const history = await storage.getNoteHistory(note.id)
      expect(history.map((entry) => entry.snapshot.content)).toEqual(['second', 'first'])
      expect(history[0].savedAt).toBeGreaterThan(history[1].savedAt)
    } finally {
      clock.mockRestore()
      await discard(note.id)
    }
  })

  it('restores only title and text, keeping Trash state and organization', async () => {
    const note: Note = { id: 'restore-scope-note', title: 'Old title', content: 'Old text', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal', tags: ['Before'] }
    try {
      await storage.saveNote(note)
      await storage.saveNote({ ...note, title: 'New title', content: 'New text', notebookId: 'starter-work', tags: ['After'], pinned: true, favorite: true, updatedAt: 2 })
      await storage.trashNote(note.id)
      const [revision] = await storage.getNoteHistory(note.id)

      const restored = await storage.restoreHistory(revision.id)
      const stored = await (await storage.openNotesDatabase()).get('notes', note.id)
      expect(stored).toEqual(restored)
      expect(stored).toEqual(expect.objectContaining({
        title: 'Old title',
        content: 'Old text',
        notebookId: 'starter-work',
        tags: ['After'],
        pinned: true,
        favorite: true,
      }))
      expect(stored?.deletedAt).toBeDefined()
      expect((await storage.getNoteHistory(note.id))[0].snapshot.content).toBe('New text')
    } finally {
      await discard(note.id)
    }
  })

  it('keeps tag counts correct when content-only saves skip the tag rebuild', async () => {
    const note: Note = { id: 'tag-count-note', title: 'Tags', content: 'a', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal', tags: ['Countable'] }
    const count = async () => (await storage.getTags()).find((tag) => tag.id === 'countable')?.count ?? 0
    const before = await count()
    try {
      await storage.saveNote(note)
      expect(await count()).toBe(before + 1)
      await storage.saveNote({ ...note, content: 'b', updatedAt: 2 })
      expect(await count()).toBe(before + 1)
      await storage.saveNote({ ...note, content: 'c', tags: ['Renamed'], updatedAt: 3 })
      expect(await count()).toBe(before)
      expect((await storage.getTags()).find((tag) => tag.id === 'renamed')?.count).toBe(1)
      await storage.trashNote(note.id)
      expect((await storage.getTags()).find((tag) => tag.id === 'renamed')).toBeUndefined()
    } finally {
      await discard(note.id)
    }
  })

  it('keeps one revision per editing burst and caps revisions per note', async () => {
    let now = 1_800_000_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
        const note: Note = { id: 'bursty-note', title: 'Draft', content: 'v0', createdAt: now, updatedAt: now, notebookId: 'starter-personal' }
        await storage.saveNote(note)
        for (let version = 1; version <= 5; version += 1) {
          now += 1000
          await storage.saveNote({ ...note, content: `v${version}`, updatedAt: now })
        }
        const burst = await storage.getNoteHistory(note.id)
        expect(burst).toHaveLength(1)
        expect(burst[0].snapshot.content).toBe('v0')

        now += storage.HISTORY_SNAPSHOT_INTERVAL_MS
        await storage.saveNote({ ...note, content: 'after a break', updatedAt: now })
        const afterBreak = await storage.getNoteHistory(note.id)
        expect(afterBreak.map((entry) => entry.snapshot.content)).toEqual(['v5', 'v0'])

        for (let version = 0; version < storage.MAX_HISTORY_PER_NOTE + 5; version += 1) {
          now += storage.HISTORY_SNAPSHOT_INTERVAL_MS
          await storage.saveNote({ ...note, content: `long session ${version}`, updatedAt: now })
        }
        const capped = await storage.getNoteHistory(note.id)
        expect(capped).toHaveLength(storage.MAX_HISTORY_PER_NOTE)
        expect(capped.map((entry) => entry.snapshot.content)).not.toContain('v0')
        expect(capped[0].snapshot.content).toBe(`long session ${storage.MAX_HISTORY_PER_NOTE + 3}`)
    } finally {
      clock.mockRestore()
    }
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
    await storage.addNoteAttachment(note.id, new Blob(['and another'], { type: 'text/plain' }), 'more.txt')
    expect(await storage.getNoteIdsWithAttachments()).toEqual(new Set([note.id]))
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
    expect(await storage.getNoteAttachments(note.id)).toHaveLength(2)

    await storage.trashNote(note.id)
    await storage.permanentlyDeleteNote(note.id)
    expect(await storage.getNoteIdsWithAttachments()).toEqual(new Set())
    expect(await storage.getTrash()).not.toContainEqual(expect.objectContaining({ id: note.id }))
    expect(await storage.getNoteHistory(note.id)).toHaveLength(0)
    expect(await storage.getNoteAttachments(note.id)).toHaveLength(0)
  })

  it('stores stable directional links, preserves them in Trash, and cleans both directions on permanent deletion', async () => {
    const source: Note = { id: 'link-source', title: 'Source', content: '', createdAt: 1, updatedAt: 1 }
    const target: Note = { id: 'link-target', title: 'Target', content: '', createdAt: 2, updatedAt: 2 }
    const backlink: Note = { id: 'link-backlink', title: 'Backlink', content: '', createdAt: 3, updatedAt: 3 }
    await Promise.all([source, target, backlink].map((note) => storage.saveNote(note)))
    await storage.linkNotes(source.id, target.id)
    await storage.linkNotes(source.id, target.id)
    await storage.linkNotes(backlink.id, source.id)

    expect(await storage.getNoteLinks(source.id)).toEqual({
      outgoing: [{ sourceNoteId: source.id, targetNoteId: target.id }],
      backlinks: [{ sourceNoteId: backlink.id, targetNoteId: source.id }],
    })
    expect(await storage.getAllNoteLinks()).toHaveLength(2)
    await expect(storage.linkNotes(source.id, source.id)).rejects.toThrow('cannot link to itself')
    await storage.trashNote(target.id)
    expect(await storage.getNoteLinks(source.id)).toEqual({
      outgoing: [{ sourceNoteId: source.id, targetNoteId: target.id }],
      backlinks: [{ sourceNoteId: backlink.id, targetNoteId: source.id }],
    })
    await expect(storage.linkNotes(source.id, target.id)).rejects.toThrow('Restore notes from Trash')
    await storage.restoreNote(target.id)
    await storage.trashNote(target.id)
    await storage.permanentlyDeleteNote(target.id)
    expect((await storage.getNoteLinks(source.id)).outgoing).toEqual([])

    await storage.trashNote(source.id)
    await storage.permanentlyDeleteNote(source.id)
    expect((await storage.getNoteLinks(backlink.id)).outgoing).toEqual([])
  })

  it('saves searches with the settings, backs them up, and adds a backup’s new ones on import', async () => {
    await storage.saveTheme('dark')
    expect(await storage.saveSearch('Open tasks', ' has:task ')).toEqual([expect.objectContaining({ name: 'Open tasks', query: 'has:task' })])
    await expect(storage.saveSearch('', 'x')).rejects.toThrow('Give the saved search a name')
    const backup = await storage.exportBackup()
    expect(backup.settings.savedSearches).toHaveLength(1)

    // This device keeps its own theme and searches, and gains the backup's other searches.
    await storage.saveTheme('light')
    const [kept] = await storage.deleteSavedSearch(
      (await storage.saveSearch('Recent', 'after:7d')).find((search) => search.query === 'has:task')!.id,
    )
    expect(kept.query).toBe('after:7d')
    const imported = { ...backup, settings: { ...backup.settings, savedSearches: [...backup.settings.savedSearches!, { id: 'x', name: 'Recent too', query: 'after:7d ' }] } }
    await storage.importBackupFile(jsonFile(JSON.stringify(imported)))
    const settings = await storage.getSettings()
    expect(settings.theme).toBe('light')
    expect(settings.savedSearches?.map((search) => search.name)).toEqual(['Recent', 'Open tasks'])

    const invalid = { ...backup, settings: { ...backup.settings, savedSearches: [{ id: 'y', name: '', query: 'x' }] } }
    await expect(storage.importBackupFile(jsonFile(JSON.stringify(invalid)))).rejects.toThrow()

    // Leave the settings as the later tests expect them.
    await (await storage.openNotesDatabase()).put('settings', { id: 'preferences', theme: 'system' })
  })

  it('backs up links across local and imported notes while skipping missing and existing edges', async () => {
    const source: Note = { id: 'backup-link-source', title: 'Linked source', content: '', createdAt: 11, updatedAt: 12 }
    const target: Note = { id: 'backup-link-target', title: 'Linked target', content: '', createdAt: 13, updatedAt: 14 }
    await storage.saveNote(source)
    await storage.saveNote(target)
    await storage.linkNotes(source.id, target.id)
    const backup = await storage.exportBackup()
    expect(backup.version).toBe(4)
    expect(backup.links).toContainEqual({ sourceNoteId: source.id, targetNoteId: target.id })

    await storage.trashNote(source.id)
    await storage.permanentlyDeleteNote(source.id)
    await storage.trashNote(target.id)
    await storage.permanentlyDeleteNote(target.id)
    const result = await storage.importBackupFile(jsonFile(JSON.stringify(backup)))
    expect(result.notesAdded).toBe(2)
    expect(result.linksAdded).toBe(1)
    expect(await storage.getNoteLinks(source.id)).toEqual({
      outgoing: [{ sourceNoteId: source.id, targetNoteId: target.id }],
      backlinks: [],
    })
    const duplicateResult = await storage.importBackupFile(jsonFile(JSON.stringify(backup)))
    expect(duplicateResult.linksAdded).toBe(0)

    const localEndpoint: Note = {
      id: 'local-link-endpoint',
      title: 'Local endpoint',
      content: '',
      createdAt: 21,
      updatedAt: 22,
    }
    const importedEndpoint: Note = {
      id: 'imported-link-endpoint',
      title: 'Imported endpoint',
      content: '',
      createdAt: 23,
      updatedAt: 24,
    }
    await storage.saveNote(localEndpoint)
    await storage.saveNote(importedEndpoint)
    await storage.linkNotes(localEndpoint.id, importedEndpoint.id)
    const mixedBackup = await storage.exportBackup()
    await storage.trashNote(importedEndpoint.id)
    await storage.permanentlyDeleteNote(importedEndpoint.id)
    const mixedResult = await storage.importBackupFile(jsonFile(JSON.stringify(mixedBackup)))
    expect(mixedResult.notesAdded).toBe(1)
    expect(mixedResult.linksAdded).toBe(1)
    expect(await storage.getNoteLinks(localEndpoint.id)).toEqual({
      outgoing: [{ sourceNoteId: localEndpoint.id, targetNoteId: importedEndpoint.id }],
      backlinks: [],
    })
    expect((await storage.importBackupFile(jsonFile(JSON.stringify(mixedBackup)))).linksAdded).toBe(0)

    const orphanedBackup = {
      ...mixedBackup,
      links: [{ sourceNoteId: 'missing-link-endpoint', targetNoteId: importedEndpoint.id }],
    }
    expect((await storage.importBackupFile(jsonFile(JSON.stringify(orphanedBackup)))).linksAdded).toBe(0)

    const { attachments: _attachments, links: _links, ...versionTwoBackup } = backup
    const oldBackup = { ...versionTwoBackup, version: 2, attachments: [] }
    await expect(storage.importBackupFile(jsonFile(JSON.stringify(oldBackup)))).resolves.toEqual(
      expect.objectContaining({ linksAdded: 0 }),
    )
  })

  it('persists theme preference and exports/imports a full backup without overwrites', async () => {
    await storage.saveTheme('dark')
    expect(await storage.getSettings()).toEqual({ id: 'preferences', theme: 'dark', paper: false })
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
      version: 4,
      libraries: expect.arrayContaining([expect.objectContaining({ id: 'starter-library' })]),
      shelves: expect.arrayContaining([expect.objectContaining({ id: 'starter-shelf' })]),
      settings: { id: 'preferences', theme: 'dark', paper: false },
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
    const { attachments: _attachments, links: _links, ...legacyBackup } = backup
    const legacyResult = await storage.importBackupFile(jsonFile(JSON.stringify({ ...legacyBackup, version: 1 })))
    expect(legacyResult.attachmentsAdded).toBe(0)
  })

  it('imports version 1 through 3 backups into the default hierarchy', async () => {
    for (const version of [1, 2, 3]) {
      const notebook = {
        id: `legacy-notebook-${version}`,
        name: `Legacy notebook ${version}`,
        createdAt: version,
        updatedAt: version,
      }
      const note: Note = {
        id: `legacy-backup-note-${version}`,
        title: `Legacy note ${version}`,
        content: 'Keep legacy content.',
        createdAt: version,
        updatedAt: version,
        notebookId: notebook.id,
      }
      const backup = {
        format: 'my-notes-backup',
        version,
        exportedAt: version,
        notes: [note],
        notebooks: [notebook],
        tags: [],
        settings: { id: 'preferences', theme: 'system' },
        history: [],
        ...(version >= 2 ? { attachments: [] } : {}),
        ...(version >= 3 ? { links: [] } : {}),
      }

      await expect(storage.importBackupFile(jsonFile(JSON.stringify(backup)))).resolves.toEqual(
        expect.objectContaining({ notesAdded: 1 }),
      )
      const restoredNotebook = (await storage.getNotebooks()).find((item) => item.id === notebook.id)
      expect(restoredNotebook?.shelfId).toBeTruthy()
      expect(await storage.getShelves()).toContainEqual(expect.objectContaining({
        id: restoredNotebook?.shelfId,
        libraryId: 'starter-library',
      }))
      expect(await storage.getNotes()).toContainEqual(expect.objectContaining(note))
    }
  })

  it('keeps backups restorable after a note moves and its earlier notebook is deleted', async () => {
    const formerNotebook = await storage.createNotebook('Former home')
    const note: Note = {
      id: 'moved-before-notebook-deletion',
      title: 'Moved note',
      content: 'First version',
      createdAt: 1,
      updatedAt: 1,
      notebookId: formerNotebook.id,
    }
    await storage.saveNote(note)
    await storage.saveNote({ ...note, content: 'Second version', updatedAt: 2 })
    await storage.moveNote(note.id, 'starter-work')
    await storage.deleteNotebook(formerNotebook.id, 'starter-ideas')

    const [revision] = await storage.getNoteHistory(note.id)
    expect(revision.snapshot.notebookId).toBe('starter-ideas')

    const backup = await storage.exportBackup()
    const fresh = {
      ...backup,
      notes: backup.notes.map((item) => (item.id === note.id ? { ...item, id: 'fresh-moved-note' } : item)),
      history: backup.history
        .filter((entry) => entry.noteId === note.id)
        .map((entry) => ({
          ...entry,
          id: 'fresh-moved-revision',
          noteId: 'fresh-moved-note',
          snapshot: { ...entry.snapshot, id: 'fresh-moved-note' },
        })),
      attachments: [],
      links: [],
    }
    await expect(storage.importBackupFile(jsonFile(JSON.stringify(fresh)))).resolves.toEqual(
      expect.objectContaining({ notesAdded: 1, historyAdded: 1 }),
    )
  })

  it('reassigns notes and history that reference missing notebooks in older backups', async () => {
    const backup = {
      format: 'my-notes-backup',
      version: 3,
      exportedAt: 10,
      notes: [{ id: 'orphaned-note', title: 'Orphan', content: 'Keep me', createdAt: 10, updatedAt: 10, notebookId: 'missing-notebook' }],
      notebooks: [{ id: 'kept-notebook', name: 'Kept notebook', createdAt: 10, updatedAt: 10 }],
      tags: [],
      settings: { id: 'preferences', theme: 'system' },
      history: [{
        id: 'orphaned-revision',
        noteId: 'orphaned-note',
        savedAt: 9,
        snapshot: { id: 'orphaned-note', title: 'Orphan', content: 'Old', createdAt: 10, updatedAt: 9, notebookId: 'deleted-notebook' },
      }],
      attachments: [],
      links: [],
    }
    await expect(storage.importBackupFile(jsonFile(JSON.stringify(backup)))).resolves.toEqual(
      expect.objectContaining({ notesAdded: 1, historyAdded: 1 }),
    )
    const notebookIds = new Set((await storage.getNotebooks()).map((notebook) => notebook.id))
    const restored = (await storage.getNotes()).find((item) => item.id === 'orphaned-note')
    expect(notebookIds.has(restored?.notebookId ?? '')).toBe(true)
    const [revision] = await storage.getNoteHistory('orphaned-note')
    expect(revision.snapshot.notebookId).toBe(restored?.notebookId)
  })

  it('never saves a note that references a missing notebook', async () => {
    await storage.saveNote({
      id: 'missing-notebook-note',
      title: 'No home',
      content: '',
      createdAt: 1,
      updatedAt: 1,
      notebookId: 'does-not-exist',
    })
    const saved = await (await storage.openNotesDatabase()).get('notes', 'missing-notebook-note')
    expect((await storage.getNotebooks()).some((notebook) => notebook.id === saved?.notebookId)).toBe(true)
  })

  it('exports smaller backups without attachments or history that still import', async () => {
    await storage.saveNote({ id: 'export-options-note', title: 'Options', content: 'one', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal' })
    await storage.saveNote({ id: 'export-options-note', title: 'Options', content: 'two', createdAt: 1, updatedAt: 2, notebookId: 'starter-personal' })
    await storage.addNoteAttachment('export-options-note', new Blob(['attached'], { type: 'text/plain' }), 'file.txt')

    const full = await storage.exportBackup()
    expect(full.history.length).toBeGreaterThan(0)
    expect(full.attachments.length).toBeGreaterThan(0)

    const slim = await storage.exportBackup({ attachments: false, history: false })
    expect(slim.history).toEqual([])
    expect(slim.attachments).toEqual([])
    expect(slim.notes).toEqual(full.notes)

    const file = await storage.exportBackupFile({ attachments: false })
    expect(file.type).toBe('application/json')
    const parsed = JSON.parse(await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(file)
    }))
    expect(parsed.attachments).toEqual([])
    expect(parsed.history.length).toBe(full.history.length)

    const renamed = {
      ...slim,
      notes: slim.notes.filter((item) => item.id === 'export-options-note').map((item) => ({ ...item, id: 'slim-imported-note' })),
      links: [],
    }
    await expect(storage.importBackupFile(jsonFile(JSON.stringify(renamed)))).resolves.toEqual(
      expect.objectContaining({ notesAdded: 1, historyAdded: 0, attachmentsAdded: 0 }),
    )
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
        notebooks.put({ id: 'starter-personal', name: 'Personal', createdAt: 1, updatedAt: 1 })
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
    expect(await storage.getNotebooks()).toContainEqual(expect.objectContaining({ id: 'starter-personal', shelfId: 'starter-shelf' }))
    expect(await (await storage.openNotesDatabase()).get('notes', note.id)).toEqual(note)
    expect((await storage.openNotesDatabase()).version).toBe(storage.DATABASE_VERSION)
  })
})
