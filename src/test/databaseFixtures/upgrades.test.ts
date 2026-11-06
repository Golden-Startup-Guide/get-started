/// <reference types="vite/client" />
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import type { AppSettings, Notebook, Note, NoteHistoryEntry, NoteLink, ReadingRecord } from '../../types'
import { readText } from '../../features/backup/backupFolder'
import { fixtureRecords, restoreDatabase, type DatabaseFixture } from './fixtureFormat'

/**
 * Upgrade tests: each sample database made by a past version of the app (captured with
 * scripts/captureDatabaseFixtures.test.ts) is opened with today's code, which upgrades it.
 * Nothing may be lost or damaged: every note keeps its text and times, every notebook,
 * attachment, history entry, link, and setting is still there, the result passes the start-up
 * integrity check, and a backup of it restores.
 */
const fixtures = import.meta.glob<DatabaseFixture>('./my-notes-v*.json', { eager: true, import: 'default' })

type StoredAttachment = { id: string; noteId: string; name: string; size: number; data: ArrayBuffer }

async function openWithCurrentCode(fixture: DatabaseFixture) {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  await restoreDatabase(fixture)
  const storage = await import('../../lib/notes')
  const integrity = await import('../../lib/integrity')
  const backupCheck = await import('../../lib/backupCheck')
  return { storage, integrity, backupCheck }
}

describe('upgrading databases from past versions', () => {
  it('has a sample of every released database version, including the current one', async () => {
    const { DATABASE_VERSION } = await import('../../lib/notes')
    const versions = new Set(Object.values(fixtures).map((fixture) => fixture.version))
    // Version 3 was never released.
    const released = Array.from({ length: DATABASE_VERSION }, (_, index) => index + 1).filter((version) => version !== 3)
    expect([...versions].sort()).toEqual(released)
  })

  for (const [file, fixture] of Object.entries(fixtures)) {
    it(`opens ${file.slice(2)} (version ${fixture.version}) without losing or damaging anything`, async () => {
      const { storage, integrity, backupCheck } = await openWithCurrentCode(fixture)
      const db = await storage.openNotesDatabase()
      expect(db.version).toBe(storage.DATABASE_VERSION)
      const [notes, trash, notebooks, shelves, libraries, tags, links, settings] = await Promise.all([
        storage.getNotes(), storage.getTrash(), storage.getNotebooks(), storage.getShelves(), storage.getLibraries(),
        storage.getTags(), storage.getAllNoteLinks(), storage.getSettings(),
      ])

      // Every note, and no others (an upgrade never adds starter notes).
      const before = fixtureRecords(fixture, 'notes') as Note[]
      const after = new Map([...notes, ...trash].map((note) => [note.id, note]))
      expect([...after.keys()].sort()).toEqual(before.map((note) => note.id).sort())
      for (const original of before) {
        const upgraded = after.get(original.id)!
        expect(upgraded).toEqual(expect.objectContaining({
          title: original.title,
          content: original.content,
          createdAt: original.createdAt,
          updatedAt: original.updatedAt,
          tags: storage.cleanTags(original.tags ?? []),
          notebookId: original.notebookId ?? 'starter-personal',
          pinned: original.pinned ?? false,
          favorite: original.favorite ?? false,
        }))
        expect(upgraded.deletedAt).toBe(original.deletedAt)
      }

      // Every notebook, now on a shelf in a library.
      const notebookNames = new Set(notebooks.map((notebook) => notebook.name))
      for (const original of fixtureRecords(fixture, 'notebooks') as Notebook[]) expect(notebookNames).toContain(original.name)
      const shelfIds = new Set(shelves.map((shelf) => shelf.id))
      const libraryIds = new Set(libraries.map((library) => library.id))
      expect(notebooks.every((notebook) => notebook.shelfId && shelfIds.has(notebook.shelfId))).toBe(true)
      expect(shelves.every((shelf) => libraryIds.has(shelf.libraryId))).toBe(true)

      // Every attachment, byte for byte; every history entry and link; the settings.
      for (const original of fixtureRecords(fixture, 'attachments') as StoredAttachment[]) {
        const upgraded = (await db.get('attachments', original.id)) as StoredAttachment | undefined
        expect(upgraded?.name).toBe(original.name)
        expect(original.data.byteLength).toBe(original.size)
        expect([...new Uint8Array(upgraded!.data)]).toEqual([...new Uint8Array(original.data)])
      }
      const history = (await db.getAll('history')) as NoteHistoryEntry[]
      expect(history.map((entry) => entry.id).sort()).toEqual((fixtureRecords(fixture, 'history') as NoteHistoryEntry[]).map((entry) => entry.id).sort())
      expect(links).toEqual(expect.arrayContaining(fixtureRecords(fixture, 'noteLinks') as NoteLink[]))
      expect(links).toHaveLength(fixtureRecords(fixture, 'noteLinks').length)
      const savedSettings = (fixtureRecords(fixture, 'settings') as AppSettings[])[0]
      expect(settings).toEqual(savedSettings ?? { id: 'preferences', theme: 'system' })
      // What was last opened, from version 7 on; older versions start with none.
      const reading = fixtureRecords(fixture, 'reading') as ReadingRecord[]
      expect((await storage.getLastReading())?.noteId).toBe(reading.sort((a, b) => b.openedAt - a.openedAt)[0]?.noteId)

      // Consistent: the start-up check finds nothing to repair.
      const library = { notes, trash, notebooks, shelves, libraries, tags, links }
      const orphans = await storage.findOrphans(integrity.allNoteIds(library))
      expect(integrity.findLibraryProblems(library, orphans)).toEqual({
        links: [], notesWithoutNotebook: [], notebooksWithoutShelf: [], shelvesWithoutLibrary: [],
        orphanAttachments: [], orphanHistory: [], tagsOutOfDate: false,
      })

      // And a backup of the upgraded library restores in full.
      const check = await backupCheck.checkBackup(await readText(await storage.exportBackupFile()))
      expect(check).toEqual(expect.objectContaining({ ok: true, notes: before.length }))
    })
  }
})
