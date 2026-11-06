import { beforeAll, describe, expect, it } from 'vitest'
import type { Note } from '../types'

describe('start-up integrity check', () => {
  let storage: typeof import('./notes')
  let integrity: typeof import('./integrity')

  const snapshot = async () => {
    const [notes, trash, notebooks, shelves, libraries, tags, links] = await Promise.all([
      storage.getNotes(), storage.getTrash(), storage.getNotebooks(), storage.getShelves(), storage.getLibraries(), storage.getTags(), storage.getAllNoteLinks(),
    ])
    return { notes, trash, notebooks, shelves, libraries, tags, links }
  }
  const note = (id: string, fields: Partial<Note> = {}): Note =>
    ({ id, title: id, content: '', createdAt: 1, updatedAt: 2, notebookId: 'starter-work', ...fields })

  beforeAll(async () => {
    storage = await import('./notes')
    integrity = await import('./integrity')
  })

  it('finds nothing wrong with a healthy library, tags and all', async () => {
    await storage.saveNote(note('healthy-a', { tags: ['Garden', 'garden ', 'Plans'] }))
    await storage.saveNote(note('healthy-b', { tags: ['plans'] }))
    await storage.saveNote(note('healthy-c', { tags: ['Old'] }))
    await storage.trashNote('healthy-c')
    await storage.linkNotes('healthy-a', 'healthy-b')
    await storage.addNoteAttachment('healthy-a', new Blob(['x']), 'x.txt')
    await storage.saveNote(note('healthy-a', { content: 'Changed', updatedAt: 5, tags: ['Garden', 'Plans'] }), { forceHistory: true })
    expect(await integrity.checkAndRepairLibrary(await snapshot())).toBeUndefined()
  })

  it('repairs links, attachments, and history left by deleted notes, and items whose container is gone', async () => {
    const db = await storage.openNotesDatabase()
    await storage.saveNote(note('kept'))
    // Damage made directly in the database, as an interrupted write or an old bug might leave it.
    await db.put('noteLinks', { sourceNoteId: 'kept', targetNoteId: 'gone' })
    await db.put('attachments', { id: 'orphan-file', noteId: 'gone', name: 'lost.txt', type: 'text/plain', size: 1, createdAt: 1, data: new ArrayBuffer(1) })
    await db.put('history', { id: 'orphan-revision', noteId: 'gone', savedAt: 1, snapshot: note('gone') })
    await db.put('notes', note('homeless', { notebookId: 'deleted-notebook' }))
    await db.put('notebooks', { id: 'drifting', name: 'Drifting', shelfId: 'deleted-shelf', createdAt: 1, updatedAt: 1 })
    await db.put('shelves', { id: 'stray-shelf', libraryId: 'deleted-library', name: 'Stray', createdAt: 1, updatedAt: 1 })
    await db.put('tags', { id: 'ghost', label: 'Ghost', count: 3 })

    const repairs = await integrity.checkAndRepairLibrary(await snapshot())
    expect(repairs).toEqual(expect.objectContaining({
      linksRemoved: 1, attachmentsRemoved: 1, historyRemoved: 1, notesMoved: 1, notebooksMoved: 1, shelvesMoved: 1, tagsRebuilt: true,
      notebookName: 'Personal', shelfName: 'General', libraryName: 'My notes',
    }))
    expect(integrity.describeRepairs(repairs!)).toEqual([
      'removed 1 link to notes that no longer exist',
      'removed 1 attachment left behind by deleted notes',
      'removed 1 history entry left behind by deleted notes',
      'moved 1 note whose notebook was missing to “Personal”',
      'moved 1 notebook whose shelf was missing to “General”',
      'moved 1 shelf whose library was missing to “My notes”',
      'rebuilt the tag list',
    ])
    expect(await db.get('attachments', 'orphan-file')).toBeUndefined()
    expect(await db.get('history', 'orphan-revision')).toBeUndefined()
    expect(await db.get('noteLinks', ['kept', 'gone'])).toBeUndefined()
    // Moving is a repair, not an edit: the note keeps its edit time.
    expect(await db.get('notes', 'homeless')).toEqual(expect.objectContaining({ notebookId: 'starter-personal', updatedAt: 2 }))
    expect((await db.get('notebooks', 'drifting'))?.shelfId).toBe('starter-shelf')
    expect((await db.get('shelves', 'stray-shelf'))?.libraryId).toBe('starter-library')
    expect(await db.get('tags', 'ghost')).toBeUndefined()

    // Repaired for good: the next start finds nothing.
    expect(await integrity.checkAndRepairLibrary(await snapshot())).toBeUndefined()
  })

  it('leaves alone anything fixed since the check looked, such as a note another tab just created', async () => {
    const db = await storage.openNotesDatabase()
    await db.put('attachments', { id: 'early-file', noteId: 'arriving', name: 'early.txt', type: 'text/plain', size: 1, createdAt: 1, data: new ArrayBuffer(1) })
    const before = await snapshot()
    const orphans = await storage.findOrphans(integrity.allNoteIds(before))
    expect(orphans.attachments).toEqual(['early-file'])
    // The note arrives (from another tab) before the repair runs.
    await storage.saveNote(note('arriving'))
    const repairs = await storage.repairLibrary(integrity.findLibraryProblems(before, orphans))
    expect(repairs.attachmentsRemoved).toBe(0)
    expect(await db.get('attachments', 'early-file')).toBeDefined()
  })
})
