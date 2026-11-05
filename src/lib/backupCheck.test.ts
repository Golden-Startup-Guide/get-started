import { beforeAll, describe, expect, it } from 'vitest'
import { readText } from '../features/backup/backupFolder'

describe('checking a backup by restoring it', () => {
  let storage: typeof import('./notes')
  let checker: typeof import('./backupCheck')
  let backupText: string

  beforeAll(async () => {
    storage = await import('./notes')
    checker = await import('./backupCheck')
    const library = await storage.createLibrary('Checked library')
    const shelf = await storage.createShelf(library.id, 'Checked shelf')
    const notebook = await storage.createNotebook('Checked notebook', shelf.id)
    const first = { id: 'check-a', title: 'First', content: 'Café ✓ — **bold** text', createdAt: 1, updatedAt: 2, notebookId: notebook.id, tags: ['kept'] }
    const second = { id: 'check-b', title: 'Second', content: 'Links to [[First]]', createdAt: 1, updatedAt: 3, notebookId: notebook.id }
    await storage.saveNote(first)
    await storage.saveNote({ ...first, content: 'A later version', updatedAt: 4 }, { forceHistory: true })
    await storage.saveNote(second)
    await storage.linkNotes(second.id, first.id)
    await storage.addNoteAttachment(first.id, new Blob([new Uint8Array([0, 1, 2, 250, 251, 252])], { type: 'application/octet-stream' }), 'bytes.bin')
    await storage.trashNote(second.id)
    backupText = await readText(await storage.exportBackupFile())
  })

  it('restores a whole backup into a test database and finds everything', async () => {
    const backup = JSON.parse(backupText)
    const check = await checker.checkBackup(backupText)
    expect(check).toEqual({ ok: true, notes: backup.notes.length, attachments: 1, history: backup.history.length, links: 1 })
    expect(backup.history.length).toBeGreaterThan(0)
    expect(checker.describeCheck({ ok: true, notes: 1, attachments: 2, history: 1, links: 0 })).toBe('1 note, 2 attachments, 1 history entry, and 0 links')

    // The real library is untouched, and the test database is gone.
    expect((await storage.getNotes()).filter((note) => note.id.startsWith('check-'))).toHaveLength(1)
    const names = (await indexedDB.databases()).map((info) => info.name)
    expect(names).toContain('my-notes')
    expect(names.filter((name) => name?.startsWith('my-notes-backup-check-'))).toEqual([])
  })

  it('reports a damaged or incomplete backup', async () => {
    expect(await checker.checkBackup(backupText.slice(0, -40))).toEqual({ ok: false, problem: 'the file is not valid JSON' })

    const backup = JSON.parse(backupText)
    const noFormat = await checker.checkBackup(JSON.stringify({ ...backup, format: 'something-else' }))
    expect(noFormat.ok).toBe(false)

    // An attachment whose data does not match its recorded size is refused, as Import would.
    const truncated = { ...backup, attachments: [{ ...backup.attachments[0], data: backup.attachments[0].data.slice(0, 4) }] }
    expect(await checker.checkBackup(JSON.stringify(truncated))).toEqual({ ok: false, problem: 'this backup contains invalid, duplicate, or unsupported records' })

    // A link to a note missing from the backup cannot be restored.
    const brokenLink = { ...backup, links: [...backup.links, { sourceNoteId: 'check-a', targetNoteId: 'not-in-backup' }] }
    const linkCheck = await checker.checkBackup(JSON.stringify(brokenLink))
    expect(linkCheck.ok).toBe(false)
  })
})
