import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { deleteDB } from 'idb'
import { seedLibrary, type SeedSummary } from './seedLibrary'

describe('benchmark library generator', () => {
  let storage: typeof import('../src/lib/notes')
  let summary: SeedSummary

  beforeAll(async () => {
    await deleteDB('my-notes')
    vi.resetModules()
    storage = await import('../src/lib/notes')
    // Opening through the app creates the current schema, as a first visit does.
    ;(await storage.openNotesDatabase()).close()
    vi.resetModules()
    summary = await seedLibrary({ notes: 300, largeNoteBytes: 20_000 })
    storage = await import('../src/lib/notes')
  })

  afterAll(async () => {
    ;(await storage.openNotesDatabase()).close()
    await deleteDB('my-notes')
  })

  it('writes the library the app reads back', async () => {
    const notes = await storage.getNotes()
    expect(notes).toHaveLength(301)
    expect(summary).toEqual(expect.objectContaining({ notes: 301, libraries: 3, shelves: 12, notebooks: 60, searchMatches: 3 }))
    expect(await storage.getNotebooks()).toHaveLength(60)
    expect(await storage.getAllNoteLinks()).toHaveLength(summary.links)
    expect(notes.filter((note) => note.content.includes(summary.searchTerm))).toHaveLength(summary.searchMatches)
    const large = notes.find((note) => note.id === summary.largeNoteId)
    expect(large?.content.length).toBe(20_000)
  })

  it('stores tag counts that match the notes', async () => {
    const counts = new Map<string, number>()
    for (const note of await storage.getNotes()) {
      for (const tag of note.tags ?? []) counts.set(tag.toLocaleLowerCase(), (counts.get(tag.toLocaleLowerCase()) ?? 0) + 1)
    }
    const tags = await storage.getTags()
    expect(tags).toHaveLength(summary.tags)
    for (const tag of tags) expect(tag.count).toBe(counts.get(tag.id))
  })

  it('produces records that pass the app’s own backup validation', async () => {
    const backup = await storage.exportBackup()
    const text = JSON.stringify(backup)
    const file = new File([text], 'bench.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => text })
    await expect(storage.importBackupFile(file)).resolves.toEqual(expect.objectContaining({ notesSkipped: 301 }))
  })

  it('is deterministic for a given seed', async () => {
    const first = await storage.getNotes()
    await seedLibrary({ notes: 300, largeNoteBytes: 20_000 })
    const second = await storage.getNotes()
    expect(second.map((note) => [note.id, note.title, note.content])).toEqual(first.map((note) => [note.id, note.title, note.content]))
  })
})
