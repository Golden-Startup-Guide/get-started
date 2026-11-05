import { base64ToArrayBuffer, validateBackup, type NotesBackup } from './backupFormat'
import { importBackupInto, openTestRestoreDatabase } from './notes'
import { msg, t, tp } from '../i18n/i18n'

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
    return { ok: false, problem: reason instanceof SyntaxError ? t('the file is not valid JSON') : describe(reason) }
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

    if (summary.notesAdded !== backup.notes.length) return failed(tp(backup.notes.length, '{missing} of {count} note was not restored', '{missing} of {count} notes were not restored', { missing: backup.notes.length - summary.notesAdded }))
    const restored = new Map(notes.map((note) => [note.id, note]))
    for (const note of backup.notes) {
      const copy = restored.get(note.id)
      if (!copy || copy.title !== note.title || copy.content !== note.content || copy.updatedAt !== note.updatedAt || copy.deletedAt !== note.deletedAt) {
        return failed(t('the note “{title}” did not come back unchanged', { title: note.title || t('Untitled note') }))
      }
    }
    const restoredSizes = new Map(attachments.map((attachment) => [attachment.id, attachment.data.byteLength]))
    if (attachments.length !== backup.attachments.length) return failed(tp(backup.attachments.length, '{missing} of {count} attachment was not restored', '{missing} of {count} attachments were not restored', { missing: backup.attachments.length - attachments.length }))
    for (const attachment of backup.attachments) {
      const size = restoredSizes.get(attachment.id)
      if (size !== attachment.size || base64ToArrayBuffer(attachment.data).byteLength !== attachment.size) {
        return failed(t('the attachment “{name}” did not come back whole', { name: attachment.name }))
      }
    }
    if (history.length !== backup.history.length) return failed(tp(backup.history.length, '{missing} of {count} history entry was not restored', '{missing} of {count} history entries were not restored', { missing: backup.history.length - history.length }))
    if (links.length !== backup.links.length) return failed(tp(backup.links.length, '{missing} of {count} link was not restored', '{missing} of {count} links were not restored', { missing: backup.links.length - links.length }))
    const names = (items: Array<{ name: string }>) => new Set(items.map((item) => item.name.toLocaleLowerCase()))
    for (const [message, expected, actual] of [
      [msg('the notebook “{name}” was not restored'), backup.notebooks, names(notebooks)],
      [msg('the shelf “{name}” was not restored'), backup.shelves, names(shelves)],
      [msg('the library “{name}” was not restored'), backup.libraries, names(libraries)],
    ] as const) {
      const missing = expected.find((item) => !actual.has(item.name.toLocaleLowerCase()))
      if (missing) return failed(t(message, { name: missing.name }))
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
  const message = reason instanceof Error ? reason.message.replace(/\.$/, '') : t('restoring it failed')
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
  return t('{notes}, {attachments}, {history}, and {links}', {
    notes: tp(check.notes, '{count} note', '{count} notes'),
    attachments: tp(check.attachments, '{count} attachment', '{count} attachments'),
    history: tp(check.history, '{count} history entry', '{count} history entries'),
    links: tp(check.links, '{count} link', '{count} links'),
  })
}
