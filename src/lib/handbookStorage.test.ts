import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import type { Note } from '../types'

describe('storage and the built-in handbooks', () => {
  let storage: typeof import('./notes')
  let integrity: typeof import('./integrity')

  beforeAll(async () => {
    await deleteDB('my-notes')
    vi.resetModules()
    storage = await import('./notes')
    integrity = await import('./integrity')
  })

  afterAll(async () => {
    ;(await storage.openNotesDatabase()).close()
    await deleteDB('my-notes')
  })

  const personal: Note = { id: 'personal-1', title: 'My hydration log', content: 'See [[Staying hydrated]].', createdAt: 1, updatedAt: 1, notebookId: 'starter-personal', tags: [] }

  it('refuses to save, move, flag, or delete a handbook note, or file a note in a handbook', async () => {
    const message = 'Handbooks are read-only. Make a personal copy to change one.'
    const handbook = { ...personal, id: 'core-staying-hydrated', notebookId: 'core-everyday-nutrition' }
    await expect(storage.saveNote(handbook)).rejects.toThrow(message)
    await expect(storage.saveNote({ ...personal, notebookId: 'core-everyday-nutrition' })).rejects.toThrow(message)
    await expect(storage.setNoteFlag('core-staying-hydrated', 'favorite', true)).rejects.toThrow(message)
    await expect(storage.trashNote('core-staying-hydrated')).rejects.toThrow(message)
    await expect(storage.moveNote('personal-1', 'core-everyday-nutrition')).rejects.toThrow(message)
    await expect(storage.renameNotebook('core-everyday-nutrition', 'Mine now')).rejects.toThrow(message)
    await expect(storage.createNotebook('Extra', 'core-nutrition')).rejects.toThrow(message)
    await expect(storage.createShelf('core-health-and-wellbeing', 'Extra')).rejects.toThrow(message)
    await expect(storage.linkNotes('core-staying-hydrated', 'personal-1')).rejects.toThrow(message)
    expect((await storage.getNotes()).some((note) => note.id.startsWith('core-'))).toBe(false)
  })

  it('keeps a personal note’s link to a handbook note through the start-up check', async () => {
    await storage.saveNote(personal)
    await storage.linkNotes('personal-1', 'core-staying-hydrated')
    const [notes, trash, notebooks, shelves, libraries, tags, links] = await Promise.all([
      storage.getNotes(), storage.getTrash(), storage.getNotebooks(), storage.getShelves(), storage.getLibraries(), storage.getTags(), storage.getAllNoteLinks(),
    ])
    const library = { notes, trash, notebooks, shelves, libraries, tags, links }
    const problems = integrity.findLibraryProblems(library, await storage.findOrphans(integrity.allNoteIds(library)))
    expect(problems.links).toEqual([])
    expect(links).toContainEqual({ sourceNoteId: 'personal-1', targetNoteId: 'core-staying-hydrated' })
  })

  it('remembers the note opened last, handbook or personal, and forgets notes deleted for good', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(1_000)
      await storage.recordReading('personal-1')
      vi.setSystemTime(2_000)
      await storage.recordReading('core-staying-hydrated')
      expect(await storage.getLastReading()).toEqual({ noteId: 'core-staying-hydrated', openedAt: 2_000 })
      vi.setSystemTime(3_000)
      await storage.recordReading('personal-1')
      expect(await storage.getLastReading()).toEqual({ noteId: 'personal-1', openedAt: 3_000 })
    } finally {
      vi.useRealTimers()
    }
    await storage.trashNote('personal-1')
    await storage.permanentlyDeleteNote('personal-1')
    expect(await storage.getLastReading()).toEqual(expect.objectContaining({ noteId: 'core-staying-hydrated' }))
  })

  it('remembers the place in a note, between 0 and 1, without changing when it was opened', async () => {
    await storage.recordReading('core-water-through-the-day')
    const opened = (await storage.getReadingRecords()).find((record) => record.noteId === 'core-water-through-the-day')!
    await storage.saveReadingPosition('core-water-through-the-day', 0.42)
    await storage.saveReadingPosition('core-staying-hydrated', 7)
    const records = await storage.getReadingRecords()
    expect(records.find((record) => record.noteId === 'core-water-through-the-day')).toEqual({ ...opened, position: 0.42 })
    expect(records.find((record) => record.noteId === 'core-staying-hydrated')?.position).toBe(1)
    // Opening it again keeps the place.
    await storage.recordReading('core-water-through-the-day')
    expect((await storage.getReadingRecords()).find((record) => record.noteId === 'core-water-through-the-day')?.position).toBe(0.42)
  })

  it('keeps reading settings with the other settings, and in backups that older versions accept', async () => {
    const reader = { size: 'large', font: 'simple', spacing: 'roomy', width: 'narrow' } as const
    await storage.saveReaderSettings(reader)
    expect((await storage.getSettings()).reader).toEqual(reader)
    const { validateBackup } = await import('./backupFormat')
    const backup = await storage.exportBackup()
    expect(backup.settings.reader).toEqual(reader)
    expect(() => validateBackup(backup)).not.toThrow()
    expect(() => validateBackup({ ...backup, settings: { ...backup.settings, reader: { ...reader, size: 'huge' } } })).toThrow()
  })

  it('leaves handbooks and reading out of backups', async () => {
    const backup = await storage.exportBackup()
    expect(JSON.stringify(backup)).not.toContain('core-staying-hydrated')
    expect(Object.keys(backup)).not.toContain('reading')
  })
})
