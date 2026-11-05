import { base64ToArrayBuffer, validateBackup, type NotesBackup } from './backupFormat'
import { importBackupInto, openTestRestoreDatabase } from './notes'

/** The outcome of restoring a backup as a test. */
export type BackupCheck =
  | { ok: true; notes: number; attachments: number; history: number; links: number }
  | { ok: false; problem: string }

const TEST_DATABASE_PREFIX = 'my-notes-backup-check-'

/**
 * Proves a backup can be restored: reads it the way Import does, restores it into an empty
 * test database laid out like a new device's, and checks that every note (with its text),
 * attachment (with its size), history entry, link, notebook, shelf, and library came back. The
 * test database is deleted afterwards; the real library is never touched.
 */
export async function checkBackup(text: string): Promise<BackupCheck> {
  let backup: NotesBackup
  try {
    backup = validateBackup(JSON.parse(text))
  } catch (reason) {
    return { ok: false, problem: reason instanceof SyntaxError ? 'the file is not valid JSON' : describe(reason) }
  }
  await removeLeftoverTestDatabases()
  let testDatabase: Awaited<ReturnType<typeof openTestRestoreDatabase>> | undefined
  try {
    testDatabase = await openTestRestoreDatabase(`${TEST_DATABASE_PREFIX}${crypto.randomUUID()}`)
    const { db } = testDatabase
    const summary = await importBackupInto(db, backup)
    const [notes, attachments, history, links, notebooks, shelves, libraries] = await Promise.all([
      db.getAll('notes'), db.getAll('attachments'), db.getAll('history'), db.getAll('noteLinks'),
      db.getAll('notebooks'), db.getAll('shelves'), db.getAll('libraries'),
    ])

    if (summary.notesAdded !== backup.notes.length) return failed(`${backup.notes.length - summary.notesAdded} of ${backup.notes.length} notes were not restored`)
    const restored = new Map(notes.map((note) => [note.id, note]))
    for (const note of backup.notes) {
      const copy = restored.get(note.id)
      if (!copy || copy.title !== note.title || copy.content !== note.content || copy.updatedAt !== note.updatedAt || copy.deletedAt !== note.deletedAt) {
        return failed(`the note “${note.title || 'Untitled note'}” did not come back unchanged`)
      }
    }
    const restoredSizes = new Map(attachments.map((attachment) => [attachment.id, attachment.data.byteLength]))
    if (attachments.length !== backup.attachments.length) return failed(`${backup.attachments.length - attachments.length} of ${backup.attachments.length} attachments were not restored`)
    for (const attachment of backup.attachments) {
      const size = restoredSizes.get(attachment.id)
      if (size !== attachment.size || base64ToArrayBuffer(attachment.data).byteLength !== attachment.size) {
        return failed(`the attachment “${attachment.name}” did not come back whole`)
      }
    }
    if (history.length !== backup.history.length) return failed(`${backup.history.length - history.length} of ${backup.history.length} history entries were not restored`)
    if (links.length !== backup.links.length) return failed(`${backup.links.length - links.length} of ${backup.links.length} links were not restored`)
    const names = (items: Array<{ name: string }>) => new Set(items.map((item) => item.name.toLocaleLowerCase()))
    for (const [kind, expected, actual] of [
      ['notebook', backup.notebooks, names(notebooks)],
      ['shelf', backup.shelves, names(shelves)],
      ['library', backup.libraries, names(libraries)],
    ] as const) {
      const missing = expected.find((item) => !actual.has(item.name.toLocaleLowerCase()))
      if (missing) return failed(`the ${kind} “${missing.name}” was not restored`)
    }
    return { ok: true, notes: notes.length, attachments: attachments.length, history: history.length, links: links.length }
  } catch (reason) {
    return failed(describe(reason))
  } finally {
    await testDatabase?.discard().catch(() => undefined)
  }
}

const failed = (problem: string): BackupCheck => ({ ok: false, problem })
// Messages are shown mid-sentence ("restoring it as a test failed: …").
const describe = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message.replace(/\.$/, '') : 'restoring it failed'
  return message.charAt(0).toLocaleLowerCase() + message.slice(1)
}

/** Deletes test databases left by a check that was interrupted (the tab closed mid-way). */
async function removeLeftoverTestDatabases() {
  if (typeof indexedDB.databases !== 'function') return
  const existing = await indexedDB.databases().catch(() => [])
  await Promise.all(existing
    .filter((info) => info.name?.startsWith(TEST_DATABASE_PREFIX))
    .map((info) => new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(info.name as string)
      request.onsuccess = request.onerror = request.onblocked = () => resolve()
    })))
}

/** "Restored 128 notes, 3 attachments, 40 history entries, and 12 links" */
export function describeCheck(check: Extract<BackupCheck, { ok: true }>): string {
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`
  return `${count(check.notes, 'note', 'notes')}, ${count(check.attachments, 'attachment', 'attachments')}, ${count(check.history, 'history entry', 'history entries')}, and ${count(check.links, 'link', 'links')}`
}
