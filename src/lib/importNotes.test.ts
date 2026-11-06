import { beforeAll, describe, expect, it } from 'vitest'
import type { IncomingNote } from './notes'

describe('importing notes from other apps', () => {
  let storage: typeof import('./notes')
  beforeAll(async () => {
    storage = await import('./notes')
  })

  const incoming = (title: string, fields: Partial<IncomingNote> = {}): IncomingNote => ({
    title, content: `${title} text`, tags: [], notebook: 'Imported', createdAt: 10, updatedAt: 20, attachments: [], ...fields,
  })

  it('adds new notes into notebooks matched by name or created, with tags, flags, Trash, and attachments within limits', async () => {
    const before = (await storage.getNotes()).length
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const summary = await storage.importNotes([
      incoming('Kept in Personal', { notebook: 'personal', tags: [' Errands', 'errands', 'home'], pinned: true }),
      incoming('In a new notebook', { notebook: 'Travel', favorite: true, attachments: [
        { name: 'map.png', type: 'image/png', data: new Uint8Array([1, 2, 3]) },
        { name: 'huge.bin', type: '', data: big },
        { name: 'empty.txt', type: 'text/plain', data: new Uint8Array() },
      ] }),
      incoming('Deleted elsewhere', { notebook: 'Travel', trashed: true }),
      incoming('Many files', { attachments: Array.from({ length: 22 }, (_, index) => ({ name: `f${index}.txt`, type: 'text/plain', data: new Uint8Array([index]) })) }),
    ])
    expect(summary).toEqual({ notes: 4, notebooksCreated: 2, attachments: 21, attachmentsSkipped: 4 })

    const notes = await storage.getNotes()
    expect(notes).toHaveLength(before + 3)
    const notebooks = await storage.getNotebooks()
    const trash = await storage.getTrash()
    const named = async (title: string) => [...notes, ...trash].find((note) => note.title === title)!
    const nameOf = (id: string | undefined) => notebooks.find((notebook) => notebook.id === id)?.name
    const work = await named('Kept in Personal')
    expect(work).toEqual(expect.objectContaining({ content: 'Kept in Personal text', tags: ['Errands', 'home'], pinned: true, createdAt: 10, updatedAt: 20 }))
    expect(nameOf(work.notebookId)).toBe('Personal')
    const travel = await named('In a new notebook')
    expect(nameOf(travel.notebookId)).toBe('Travel')
    expect(travel.favorite).toBe(true)
    const files = await storage.getNoteAttachments(travel.id)
    expect(files.map((file) => [file.name, file.type, file.size])).toEqual([['map.png', 'image/png', 3]])
    expect((await named('Deleted elsewhere')).deletedAt).toEqual(expect.any(Number))
    expect(nameOf((await named('Many files')).notebookId)).toBe('Imported')
    expect(await storage.getNoteAttachments((await named('Many files')).id)).toHaveLength(20)
    // Every new notebook sits on a shelf, and the tag list counts the imported tags.
    expect(notebooks.every((notebook) => notebook.shelfId)).toBe(true)
    expect(await storage.getTags()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'errands', count: 1 })]))
  })
})
