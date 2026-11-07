import { deleteDB, openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore, type IDBPTransaction, type StoreNames } from 'idb'
import { themeSettings } from './theme'
import { isCoreId } from './core'
import type {
  AppSettings,
  Note,
  ReaderSettings,
  ReadingRecord,
  NoteAttachment,
  NoteLink,
  Library,
  Notebook,
  NoteHistoryEntry,
  SavedSearch,
  Shelf,
  Tag,
  EditorMode,
  ThemeChoice,
} from '../types'
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_BACKUP_SIZE_BYTES,
  MAX_NOTE_ATTACHMENT_BYTES,
  validateAttachmentDetails,
} from '../features/notes/attachments'
import { mergeSavedSearches, withSavedSearch } from './savedSearches'
import { starterNotes } from './starterNotes'
import {
  base64ToArrayBuffer,
  bytesToBase64,
  DEFAULT_LIBRARY_ID,
  DEFAULT_SHELF_ID,
  validateBackup,
  type NotesBackup,
} from './backupFormat'
import { t } from '../i18n/i18n'

export type { NotesBackup } from './backupFormat'

interface StoredNoteAttachment extends Omit<NoteAttachment, 'blob'> {
  data: ArrayBuffer
}

interface NotesDatabase extends DBSchema {
  notes: {
    key: string
    value: Note
    indexes: { 'by-updated': number; 'by-notebook': string; 'by-tags': string }
  }
  notebooks: { key: string; value: Notebook; indexes: { 'by-name': string } }
  libraries: { key: string; value: Library; indexes: { 'by-name': string } }
  shelves: { key: string; value: Shelf; indexes: { 'by-library': string; 'by-name': string } }
  settings: { key: string; value: AppSettings }
  attachments: {
    key: string
    value: StoredNoteAttachment
    indexes: { 'by-note': string }
  }
  tags: { key: string; value: Tag; indexes: { 'by-label': string } }
  history: {
    key: string
    value: NoteHistoryEntry
    indexes: { 'by-note': string; 'by-saved-at': number }
  }
  noteLinks: {
    key: [string, string]
    value: NoteLink
    indexes: { 'by-source': string; 'by-target': string }
  }
  /** What the reader opened, and when: for "Continue reading". Not part of backups. */
  reading: {
    key: string
    value: ReadingRecord
    indexes: { 'by-opened': number }
  }
}

const starterNotebooks = [
  ['starter-personal', 'Personal'],
  ['starter-work', 'Work'],
  ['starter-ideas', 'Ideas'],
  ['starter-research', 'Research'],
  ['starter-health', 'Health Handbook'],
] as const


export const DATABASE_VERSION = 7

export type StorageEvent =
  /** Another tab changed data. An empty noteIds list means anything may have changed. */
  | { type: 'changed'; noteIds: string[] }
  /** An older tab is keeping this tab's database upgrade from finishing. */
  | { type: 'blocked' }
  /** A newer version of the app opened in another tab; this connection was closed. */
  | { type: 'version-change' }
  /** The browser closed the database connection unexpectedly. */
  | { type: 'terminated' }

const storageListeners = new Set<(event: StorageEvent) => void>()

export function subscribeToStorage(listener: (event: StorageEvent) => void): () => void {
  storageListeners.add(listener)
  return () => storageListeners.delete(listener)
}

function emitStorageEvent(event: StorageEvent) {
  for (const listener of storageListeners) listener(event)
}

// Tabs share one database, so each write tells the other tabs which notes it touched.
// BroadcastChannel never delivers a message back to the tab that sent it.
const changeChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('my-notes-changes') : undefined
changeChannel?.addEventListener('message', (event: MessageEvent) => {
  const data: unknown = event.data
  if (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'changed' &&
    Array.isArray((data as { noteIds?: unknown }).noteIds)
  ) {
    emitStorageEvent({
      type: 'changed',
      noteIds: (data as { noteIds: unknown[] }).noteIds.filter((id): id is string => typeof id === 'string'),
    })
  }
})

function announceChange(noteIds: string[] = []) {
  changeChannel?.postMessage({ type: 'changed', noteIds })
}

const database = openDB<NotesDatabase>('my-notes', DATABASE_VERSION, {
  blocked() {
    emitStorageEvent({ type: 'blocked' })
  },
  blocking() {
    // Close so the newer tab can upgrade instead of waiting forever on this one.
    void database.then((db) => db.close())
    emitStorageEvent({ type: 'version-change' })
  },
  terminated() {
    emitStorageEvent({ type: 'terminated' })
  },
  upgrade(db, oldVersion, _newVersion, transaction) {
    return upgradeDatabase(db, oldVersion, transaction, true)
  },
})

type UpgradeTransaction = IDBPTransaction<NotesDatabase, ArrayLike<StoreNames<NotesDatabase>>, 'versionchange'>

/**
 * Creates or upgrades the database's stores. A new device also gets the starter notebooks, the
 * default library and shelf, and (unless `withStarterNotes` is false) a starter note in each.
 */
async function upgradeDatabase(db: IDBPDatabase<NotesDatabase>, oldVersion: number, transaction: UpgradeTransaction, withStarterNotes: boolean) {
  const now = Date.now()
  if (oldVersion < 1) {
    const store = db.createObjectStore('notes', { keyPath: 'id' })
    store.createIndex('by-updated', 'updatedAt')
  }

  if (oldVersion < 2) {
    const notes = transaction.objectStore('notes')
    if (!notes.indexNames.contains('by-notebook')) {
      notes.createIndex('by-notebook', 'notebookId')
    }
    if (!notes.indexNames.contains('by-tags')) {
      notes.createIndex('by-tags', 'tags', { multiEntry: true })
    }

    const notebooks = db.createObjectStore('notebooks', { keyPath: 'id' })
    notebooks.createIndex('by-name', 'name')
    // A brand-new library starts with one notebook; a library upgraded from version 1 gets the
    // original set, as it always has.
    for (const [id, name] of oldVersion === 0 ? starterNotebooks.slice(0, 1) : starterNotebooks) {
      notebooks.put({ id, name, createdAt: now, updatedAt: now })
    }

    db.createObjectStore('settings', { keyPath: 'id' }).put({
      id: 'preferences',
      theme: 'system',
    })

    const tags = db.createObjectStore('tags', { keyPath: 'id' })
    tags.createIndex('by-label', 'label')

    const history = db.createObjectStore('history', { keyPath: 'id' })
    history.createIndex('by-note', 'noteId')
    history.createIndex('by-saved-at', 'savedAt')

    let cursor = await notes.openCursor()
    while (cursor) {
      const note = cursor.value
      cursor.update({
        ...note,
        notebookId: note.notebookId ?? 'starter-personal',
        tags: cleanTags(note.tags ?? []),
        pinned: note.pinned ?? false,
        favorite: note.favorite ?? false,
      })
      cursor = await cursor.continue()
    }
  }

  if (oldVersion < 4) {
    db.createObjectStore('attachments', { keyPath: 'id' }).createIndex('by-note', 'noteId')
  }

  if (oldVersion < 5) {
    const links = db.createObjectStore('noteLinks', { keyPath: ['sourceNoteId', 'targetNoteId'] })
    links.createIndex('by-source', 'sourceNoteId')
    links.createIndex('by-target', 'targetNoteId')
  }

  if (oldVersion < 6) {
    const libraries = db.createObjectStore('libraries', { keyPath: 'id' })
    libraries.createIndex('by-name', 'name')
    const shelves = db.createObjectStore('shelves', { keyPath: 'id' })
    shelves.createIndex('by-library', 'libraryId')
    shelves.createIndex('by-name', 'name')
    const notebooks = transaction.objectStore('notebooks')
    // "My notes" for a brand-new library, beside the built-in handbooks; upgrades keep their name.
    const library = { id: DEFAULT_LIBRARY_ID, name: oldVersion === 0 ? 'My notes' : 'Personal Library', createdAt: now, updatedAt: now }
    const shelf = { id: DEFAULT_SHELF_ID, libraryId: DEFAULT_LIBRARY_ID, name: 'General', createdAt: now, updatedAt: now }
    libraries.put(library)
    shelves.put(shelf)
    let cursor = await notebooks.openCursor()
    while (cursor) {
      cursor.update({ ...cursor.value, shelfId: cursor.value.shelfId ?? DEFAULT_SHELF_ID })
      cursor = await cursor.continue()
    }
  }

  if (oldVersion < 7) {
    db.createObjectStore('reading', { keyPath: 'noteId' }).createIndex('by-opened', 'openedAt')
  }

  // A brand-new library only (never an upgrade of existing data): the Welcome note. It carries
  // no tags, so the tags store needs no update.
  if (oldVersion === 0 && withStarterNotes) {
    const notes = transaction.objectStore('notes')
    for (const note of starterNotes(now)) notes.put(note)
  }
}

/** Handbooks are read-only: nothing may save, move, or delete them, or put personal items in them. */
function refuseHandbookChange(...ids: Array<string | undefined>) {
  if (ids.some(isCoreId)) throw new Error(t('Handbooks are read-only. Make a personal copy to change one.'))
}

export async function openNotesDatabase(): Promise<IDBPDatabase<NotesDatabase>> {
  return database
}

/** Trimmed tags without blanks or repeats (ignoring capitals). */
export function cleanTags(tags: string[]): string[] {
  const found = new Set<string>()
  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase()
      if (!tag || found.has(key)) return false
      found.add(key)
      return true
    })
}

function normalizeNote(note: Note): Note {
  return {
    ...note,
    title: note.title.trim() || 'Untitled note',
    tags: cleanTags(note.tags ?? []),
    notebookId: note.notebookId ?? 'starter-personal',
    pinned: note.pinned ?? false,
    favorite: note.favorite ?? false,
  }
}

// A note must always reference an existing notebook; otherwise its backups fail validation.
// Falls back to the note's stored notebook, then to the oldest notebook.
async function resolveNotebookId<
  StoreNames extends ArrayLike<
    'notes' | 'notebooks' | 'libraries' | 'shelves' | 'settings' | 'tags' | 'history' | 'attachments' | 'noteLinks'
  >,
>(
  notebooksStore: IDBPObjectStore<NotesDatabase, StoreNames, 'notebooks', 'readwrite'>,
  ...candidates: Array<string | undefined>
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (candidate && (await notebooksStore.get(candidate))) return candidate
  }
  const notebooks = await notebooksStore.getAll()
  return notebooks.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))[0]?.id
}

async function refreshTags<
  StoreNames extends ArrayLike<
    'notes' | 'notebooks' | 'libraries' | 'shelves' | 'settings' | 'tags' | 'history' | 'attachments' | 'noteLinks'
  >,
>(
  notesStore: IDBPObjectStore<NotesDatabase, StoreNames, 'notes', 'readwrite'>,
  tagsStore: IDBPObjectStore<NotesDatabase, StoreNames, 'tags', 'readwrite'>,
): Promise<void> {
  const notes = await notesStore.getAll()
  const counts = new Map<string, { label: string; count: number }>()
  for (const note of notes) {
    if (note.deletedAt !== undefined) continue
    for (const label of cleanTags(note.tags ?? [])) {
      const id = label.toLocaleLowerCase()
      const current = counts.get(id)
      counts.set(id, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 })
    }
  }
  await tagsStore.clear()
  for (const [id, value] of counts) await tagsStore.put({ id, ...value })
}

export async function getNotes(): Promise<Note[]> {
  const db = await database
  return (await db.getAll('notes'))
    .filter((note) => note.deletedAt === undefined)
    .sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  )
}

export async function getNote(id: string): Promise<Note | undefined> {
  const db = await database
  return db.get('notes', id)
}

export async function getNoteLinks(noteId: string): Promise<{ outgoing: NoteLink[]; backlinks: NoteLink[] }> {
  const db = await database
  const [outgoing, backlinks] = await Promise.all([
    db.getAllFromIndex('noteLinks', 'by-source', noteId),
    db.getAllFromIndex('noteLinks', 'by-target', noteId),
  ])
  return { outgoing, backlinks }
}

export async function getAllNoteLinks(): Promise<NoteLink[]> {
  const db = await database
  return db.getAll('noteLinks')
}

export async function linkNotes(sourceNoteId: string, targetNoteId: string): Promise<void> {
  refuseHandbookChange(sourceNoteId)
  if (sourceNoteId === targetNoteId) throw new Error(t("A note cannot link to itself."))
  const db = await database
  const transaction = db.transaction(['notes', 'noteLinks'], 'readwrite')
  const notes = transaction.objectStore('notes')
  const [source, target] = await Promise.all([
    notes.get(sourceNoteId),
    notes.get(targetNoteId),
  ])
  // A handbook note ships with the app rather than being stored, so it counts as existing.
  if (!source || !(target || isCoreId(targetNoteId))) {
    await transaction.done
    throw new Error(t("Both notes must exist before they can be linked."))
  }
  if (source.deletedAt !== undefined || target?.deletedAt !== undefined) {
    await transaction.done
    throw new Error(t("Restore notes from Trash before linking them."))
  }
  await transaction.objectStore('noteLinks').put({ sourceNoteId, targetNoteId })
  await transaction.done
  announceChange([sourceNoteId, targetNoteId])
}

export async function unlinkNotes(sourceNoteId: string, targetNoteId: string): Promise<void> {
  const db = await database
  await db.delete('noteLinks', [sourceNoteId, targetNoteId])
  announceChange([sourceNoteId, targetNoteId])
}

export async function getTrash(): Promise<Note[]> {
  const db = await database
  return (await db.getAll('notes'))
    .filter((note) => note.deletedAt !== undefined)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

// Autosave runs after every pause in typing, so keep at most one revision per editing
// burst and a bounded number per note. Older revisions are pruned first.
export const HISTORY_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
export const MAX_HISTORY_PER_NOTE = 50

export async function saveNote(input: Note, options: { forceHistory?: boolean } = {}): Promise<void> {
  refuseHandbookChange(input.id, input.notebookId)
  const db = await database
  const transaction = db.transaction(['notes', 'notebooks', 'tags', 'history'], 'readwrite')
  const existing = await transaction.objectStore('notes').get(input.id)
  const notebookId = await resolveNotebookId(
    transaction.objectStore('notebooks'),
    input.notebookId,
    existing?.notebookId,
  )
  if (!notebookId) {
    await transaction.done
    throw new Error(t("Create a notebook before saving notes."))
  }
  const note = normalizeNote({ ...input, notebookId })
  if (existing && (existing.title !== note.title || existing.content !== note.content)) {
    const historyStore = transaction.objectStore('history')
    const revisions = (await historyStore.index('by-note').getAll(existing.id))
      .sort((a, b) => b.savedAt - a.savedAt)
    const now = Date.now()
    // Within a burst, the newest revision already holds the text from before the burst.
    if (options.forceHistory || !revisions.length || now - revisions[0].savedAt >= HISTORY_SNAPSHOT_INTERVAL_MS) {
      // Strictly later than the newest revision: two saves within one millisecond would
      // otherwise tie, and history would fall back to ordering by random revision IDs.
      const savedAt = revisions.length ? Math.max(now, revisions[0].savedAt + 1) : now
      await historyStore.put({ id: crypto.randomUUID(), noteId: existing.id, savedAt, snapshot: existing })
      for (const revision of revisions.slice(MAX_HISTORY_PER_NOTE - 1)) await historyStore.delete(revision.id)
    }
  }
  await transaction.objectStore('notes').put(note)
  // Rebuilding tag counts reads every note, so skip it for the common autosave case where
  // only the title or content changed.
  if (!existing || !sameTagContribution(existing, note)) {
    await refreshTags(transaction.objectStore('notes'), transaction.objectStore('tags'))
  }
  await transaction.done
  announceChange([note.id])
}

function sameTagContribution(before: Note, after: Note): boolean {
  if ((before.deletedAt === undefined) !== (after.deletedAt === undefined)) return false
  const beforeTags = cleanTags(before.tags ?? [])
  const afterTags = cleanTags(after.tags ?? [])
  return beforeTags.length === afterTags.length && beforeTags.every((tag, index) => tag === afterTags[index])
}

export async function getNoteAttachments(noteId: string): Promise<NoteAttachment[]> {
  const db = await database
  return (await db.getAllFromIndex('attachments', 'by-note', noteId))
    .map(({ data, ...attachment }) => ({
      ...attachment,
      blob: new Blob([data], { type: attachment.type }),
    }))
    .sort(
    (a, b) => a.createdAt - b.createdAt,
  )
}

/** The IDs of notes with at least one attachment, read from the index without loading any files. */
export async function getNoteIdsWithAttachments(): Promise<Set<string>> {
  const db = await database
  const ids = new Set<string>()
  let cursor = await db.transaction('attachments').store.index('by-note').openKeyCursor(null, 'nextunique')
  while (cursor) {
    ids.add(cursor.key)
    cursor = await cursor.continue()
  }
  return ids
}

export async function addNoteAttachment(
  noteId: string,
  file: Blob,
  name: string,
): Promise<NoteAttachment> {
  refuseHandbookChange(noteId)
  validateAttachmentDetails(name, file.size)
  const data = await readBlob(file)
  const db = await database
  const transaction = db.transaction(['notes', 'attachments'], 'readwrite')
  const noteStore = transaction.objectStore('notes')
  const note = await noteStore.get(noteId)
  if (!note) {
    await transaction.done
    throw new Error(t("Save this note before adding attachments."))
  }
  const attachmentStore = transaction.objectStore('attachments')
  const existing = await attachmentStore.index('by-note').getAll(noteId)
  const usedBytes = existing.reduce((sum, attachment) => sum + attachment.size, 0)
  if (existing.length >= MAX_ATTACHMENTS_PER_NOTE) {
    await transaction.done
    throw new Error(t("A note can have at most {MAX_ATTACHMENTS_PER_NOTE} attachments.", { MAX_ATTACHMENTS_PER_NOTE }))
  }
  if (usedBytes + file.size > MAX_NOTE_ATTACHMENT_BYTES) {
    await transaction.done
    throw new Error(t("Attachments for a note cannot exceed 20 MiB in total."))
  }
  const attachment: StoredNoteAttachment = {
    id: crypto.randomUUID(),
    noteId,
    name: name.trim(),
    type: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
    data,
  }
  try {
    await attachmentStore.add(attachment)
    await noteStore.put({ ...note, updatedAt: Date.now() })
    await transaction.done
  } catch (reason) {
    let failure = reason
    try {
      await transaction.done
    } catch (transactionError) {
      failure = transactionError
    }
    if (isQuotaExceeded(failure)) {
      throw new Error(t("Browser storage is full. Remove large attachments or free device storage and try again."))
    }
    throw failure
  }
  announceChange([noteId])
  return { ...attachment, blob: new Blob([data], { type: attachment.type }) }
}

export async function deleteNoteAttachment(id: string): Promise<void> {
  const db = await database
  const transaction = db.transaction(['notes', 'attachments'], 'readwrite')
  const attachmentStore = transaction.objectStore('attachments')
  const attachment = await attachmentStore.get(id)
  if (!attachment) {
    await transaction.done
    throw new Error(t("Attachment not found."))
  }
  await attachmentStore.delete(id)
  const noteStore = transaction.objectStore('notes')
  const note = await noteStore.get(attachment.noteId)
  if (note) await noteStore.put({ ...note, updatedAt: Date.now() })
  await transaction.done
  announceChange([attachment.noteId])
}

export async function trashNote(id: string): Promise<void> {
  refuseHandbookChange(id)
  const db = await database
  const transaction = db.transaction(['notes', 'tags'], 'readwrite')
  const store = transaction.objectStore('notes')
  const note = await store.get(id)
  if (!note) {
    await transaction.done
    throw new Error(t("Note not found."))
  }
  if (note.deletedAt !== undefined) {
    await transaction.done
    return
  }
  await store.put({ ...note, deletedAt: Date.now() })
  await refreshTags(store, transaction.objectStore('tags'))
  await transaction.done
  announceChange([id])
}

export async function restoreNote(id: string): Promise<void> {
  refuseHandbookChange(id)
  const db = await database
  const transaction = db.transaction(['notes', 'tags'], 'readwrite')
  const store = transaction.objectStore('notes')
  const note = await store.get(id)
  if (!note) {
    await transaction.done
    throw new Error(t("Note not found."))
  }
  if (note.deletedAt === undefined) {
    await transaction.done
    return
  }
  const { deletedAt: _deletedAt, ...restored } = note
  await store.put(restored)
  await refreshTags(store, transaction.objectStore('tags'))
  await transaction.done
  announceChange([id])
}

export async function permanentlyDeleteNote(id: string): Promise<void> {
  refuseHandbookChange(id)
  const db = await database
  const transaction = db.transaction(['notes', 'tags', 'history', 'attachments', 'noteLinks', 'reading'], 'readwrite')
  const noteStore = transaction.objectStore('notes')
  const note = await noteStore.get(id)
  if (!note) {
    await transaction.done
    throw new Error(t("Note not found."))
  }
  if (note.deletedAt === undefined) {
    await transaction.done
    throw new Error(t("Only notes in Trash can be permanently deleted."))
  }
  await noteStore.delete(id)
  const historyStore = transaction.objectStore('history')
  const historyKeys = await historyStore.index('by-note').getAllKeys(id)
  for (const key of historyKeys) await historyStore.delete(key)
  const attachmentStore = transaction.objectStore('attachments')
  const attachmentKeys = await attachmentStore.index('by-note').getAllKeys(id)
  for (const key of attachmentKeys) await attachmentStore.delete(key)
  const linkStore = transaction.objectStore('noteLinks')
  const [outgoing, backlinks] = await Promise.all([
    linkStore.index('by-source').getAll(id),
    linkStore.index('by-target').getAll(id),
  ])
  for (const link of [...outgoing, ...backlinks]) {
    await linkStore.delete([link.sourceNoteId, link.targetNoteId])
  }
  await transaction.objectStore('reading').delete(id)
  await refreshTags(transaction.objectStore('notes'), transaction.objectStore('tags'))
  await transaction.done
  announceChange([id])
}

export async function deleteNote(id: string): Promise<void> {
  refuseHandbookChange(id)
  await trashNote(id)
}

export async function getNotebooks(): Promise<Notebook[]> {
  const db = await database
  return (await db.getAll('notebooks')).sort(
    (a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name),
  )
}

export async function getLibraries(): Promise<Library[]> {
  const db = await database
  return (await db.getAll('libraries')).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
}

export async function getShelves(): Promise<Shelf[]> {
  const db = await database
  return (await db.getAll('shelves')).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
}

export async function createLibrary(name: string): Promise<Library> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error(t("Library name cannot be empty."))
  const db = await database
  const transaction = db.transaction(['libraries', 'shelves'], 'readwrite')
  const libraries = await transaction.objectStore('libraries').getAll()
  if (libraries.some((library) => library.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error(t("A library with that name already exists."))
  }
  const now = Date.now()
  const library = { id: crypto.randomUUID(), name: cleaned, createdAt: now, updatedAt: now }
  await transaction.objectStore('libraries').add(library)
  await transaction.objectStore('shelves').add({
    id: crypto.randomUUID(),
    libraryId: library.id,
    name: 'General',
    createdAt: now,
    updatedAt: now,
  })
  await transaction.done
  announceChange()
  return library
}

export async function renameLibrary(id: string, name: string): Promise<void> {
  refuseHandbookChange(id)
  const cleaned = name.trim()
  if (!cleaned) throw new Error(t("Library name cannot be empty."))
  const db = await database
  const transaction = db.transaction('libraries', 'readwrite')
  const store = transaction.objectStore('libraries')
  const libraries = await store.getAll()
  const library = libraries.find((item) => item.id === id)
  if (!library) {
    await transaction.done
    throw new Error(t("Library not found."))
  }
  if (libraries.some((item) => item.id !== id && item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error(t("A library with that name already exists."))
  }
  await store.put({ ...library, name: cleaned, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function createShelf(libraryId: string, name: string): Promise<Shelf> {
  refuseHandbookChange(libraryId)
  const cleaned = name.trim()
  if (!cleaned) throw new Error(t("Shelf name cannot be empty."))
  const db = await database
  const transaction = db.transaction(['libraries', 'shelves'], 'readwrite')
  if (!(await transaction.objectStore('libraries').get(libraryId))) {
    await transaction.done
    throw new Error(t("Library not found."))
  }
  const shelves = await transaction.objectStore('shelves').getAll()
  if (shelves.some((shelf) => shelf.libraryId === libraryId && shelf.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error(t("A shelf with that name already exists in this library."))
  }
  const now = Date.now()
  const shelf = { id: crypto.randomUUID(), libraryId, name: cleaned, createdAt: now, updatedAt: now }
  await transaction.objectStore('shelves').add(shelf)
  await transaction.done
  announceChange()
  return shelf
}

export async function renameShelf(id: string, name: string): Promise<void> {
  refuseHandbookChange(id)
  const cleaned = name.trim()
  if (!cleaned) throw new Error(t("Shelf name cannot be empty."))
  const db = await database
  const transaction = db.transaction('shelves', 'readwrite')
  const store = transaction.objectStore('shelves')
  const shelves = await store.getAll()
  const shelf = shelves.find((item) => item.id === id)
  if (!shelf) {
    await transaction.done
    throw new Error(t("Shelf not found."))
  }
  if (shelves.some((item) => item.id !== id && item.libraryId === shelf.libraryId && item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error(t("A shelf with that name already exists in this library."))
  }
  await store.put({ ...shelf, name: cleaned, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function deleteShelf(id: string, destinationId: string): Promise<void> {
  refuseHandbookChange(id, destinationId)
  const db = await database
  const transaction = db.transaction(['shelves', 'notebooks'], 'readwrite')
  const shelves = transaction.objectStore('shelves')
  const source = await shelves.get(id)
  const destination = await shelves.get(destinationId)
  if (!source || !destination || id === destinationId || source.libraryId !== destination.libraryId) {
    await transaction.done
    throw new Error(t("Choose a different existing shelf in the same library as the destination."))
  }
  if ((await shelves.index('by-library').count(source.libraryId)) <= 1) {
    await transaction.done
    throw new Error(t("The last shelf in a library cannot be deleted."))
  }
  const notebooks = transaction.objectStore('notebooks')
  for (const notebook of await notebooks.getAll()) {
    if (notebook.shelfId === id) await notebooks.put({ ...notebook, shelfId: destinationId, updatedAt: Date.now() })
  }
  await shelves.delete(id)
  await transaction.done
  announceChange()
}

export async function deleteLibrary(id: string, destinationId: string): Promise<void> {
  refuseHandbookChange(id, destinationId)
  const db = await database
  const transaction = db.transaction(['libraries', 'shelves', 'notebooks'], 'readwrite')
  const libraries = transaction.objectStore('libraries')
  const source = await libraries.get(id)
  const destination = await libraries.get(destinationId)
  if (!source || !destination || id === destinationId) {
    await transaction.done
    throw new Error(t("Choose a different existing library as the destination."))
  }
  if ((await libraries.count()) <= 1) {
    await transaction.done
    throw new Error(t("The last library cannot be deleted."))
  }
  const shelves = transaction.objectStore('shelves')
  const sourceShelves = await shelves.index('by-library').getAll(id)
  const destinationShelves = await shelves.index('by-library').getAll(destinationId)
  const notebooks = transaction.objectStore('notebooks')
  for (const sourceShelf of sourceShelves) {
    let name = sourceShelf.name
    let suffix = 2
    while (destinationShelves.some((shelf) => shelf.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      name = `${sourceShelf.name} (${suffix++})`
    }
    const newShelf = { ...sourceShelf, libraryId: destinationId, name, updatedAt: Date.now() }
    await shelves.put(newShelf)
    destinationShelves.push(newShelf)
    for (const notebook of await notebooks.getAll()) {
      if (notebook.shelfId === sourceShelf.id) {
        await notebooks.put({ ...notebook, shelfId: newShelf.id, updatedAt: Date.now() })
      }
    }
  }
  await libraries.delete(id)
  await transaction.done
  announceChange()
}

export async function moveNotebook(notebookId: string, shelfId: string): Promise<void> {
  refuseHandbookChange(notebookId, shelfId)
  const db = await database
  const transaction = db.transaction(['notebooks', 'shelves'], 'readwrite')
  const notebooks = transaction.objectStore('notebooks')
  const notebook = await notebooks.get(notebookId)
  if (!notebook) {
    await transaction.done
    throw new Error(t("Notebook not found."))
  }
  if (!(await transaction.objectStore('shelves').get(shelfId))) {
    await transaction.done
    throw new Error(t("Shelf not found."))
  }
  await notebooks.put({ ...notebook, shelfId, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

/**
 * Notebook names are unique across all libraries (docs/DECISIONS.md, decision 8): links,
 * imports, backups, and the Inbox, Templates, and Daily notes notebooks find a notebook by name.
 * The message says where the existing one is.
 */
async function duplicateNotebookMessage(existing: Notebook, getShelf: (id: string) => Promise<Shelf | undefined>): Promise<string> {
  const shelf = existing.shelfId ? await getShelf(existing.shelfId) : undefined
  return `A notebook named “${existing.name}” already exists${shelf ? `, on the shelf “${shelf.name}”` : ''}. Notebook names are unique across all your libraries, so choose another name.`
}

export async function createNotebook(name: string, shelfId?: string): Promise<Notebook> {
  refuseHandbookChange(shelfId)
  const cleaned = name.trim()
  if (!cleaned) throw new Error(t("Notebook name cannot be empty."))
  const db = await database
  const transaction = db.transaction(['notebooks', 'shelves'], 'readwrite')
  const notebooksStore = transaction.objectStore('notebooks')
  const notebooks = await notebooksStore.getAll()
  const existing = notebooks.find((notebook) => notebook.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())
  if (existing) {
    const message = await duplicateNotebookMessage(existing, (id) => transaction.objectStore('shelves').get(id))
    await transaction.done
    throw new Error(message)
  }
  const targetShelfId = shelfId ?? (await transaction.objectStore('shelves').getAll())[0]?.id
  if (!targetShelfId || !(await transaction.objectStore('shelves').get(targetShelfId))) {
    await transaction.done
    throw new Error(t("Choose an existing shelf for the notebook."))
  }
  const now = Date.now()
  const notebook = { id: crypto.randomUUID(), name: cleaned, shelfId: targetShelfId, createdAt: now, updatedAt: now }
  await notebooksStore.add(notebook)
  await transaction.done
  announceChange()
  return notebook
}

export async function renameNotebook(id: string, name: string): Promise<void> {
  refuseHandbookChange(id)
  const cleaned = name.trim()
  if (!cleaned) throw new Error(t("Notebook name cannot be empty."))
  const db = await database
  const transaction = db.transaction(['notebooks', 'shelves'], 'readwrite')
  const notebooksStore = transaction.objectStore('notebooks')
  const notebooks = await notebooksStore.getAll()
  const notebook = notebooks.find((item) => item.id === id)
  if (!notebook) {
    await transaction.done
    throw new Error(t("Notebook not found."))
  }
  const existing = notebooks.find((item) => item.id !== id && item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())
  if (existing) {
    const message = await duplicateNotebookMessage(existing, (shelfId) => transaction.objectStore('shelves').get(shelfId))
    await transaction.done
    throw new Error(message)
  }
  await notebooksStore.put({ ...notebook, name: cleaned, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function deleteNotebook(id: string, destinationId: string): Promise<void> {
  refuseHandbookChange(id, destinationId)
  const db = await database
  const transaction = db.transaction(['notebooks', 'notes', 'history'], 'readwrite')
  const notebooks = transaction.objectStore('notebooks')
  const source = await notebooks.get(id)
  const destination = await notebooks.get(destinationId)
  if (!source || !destination || id === destinationId) {
    await transaction.done
    throw new Error(t("Choose a different existing notebook as the destination."))
  }
  if ((await notebooks.count()) <= 1) {
    await transaction.done
    throw new Error(t("The last notebook cannot be deleted."))
  }
  const noteStore = transaction.objectStore('notes')
  const notes = await noteStore.index('by-notebook').getAll(id)
  for (const note of notes) {
    await noteStore.put({ ...note, notebookId: destinationId, updatedAt: Date.now() })
  }
  // Snapshots of notes that have since moved elsewhere can still reference this notebook.
  const historyStore = transaction.objectStore('history')
  let cursor = await historyStore.openCursor()
  while (cursor) {
    if (cursor.value.snapshot.notebookId === id) {
      await cursor.update({
        ...cursor.value,
        snapshot: { ...cursor.value.snapshot, notebookId: destinationId },
      })
    }
    cursor = await cursor.continue()
  }
  await notebooks.delete(id)
  await transaction.done
  announceChange(notes.map((note) => note.id))
}

export async function moveNote(noteId: string, notebookId: string): Promise<void> {
  refuseHandbookChange(noteId, notebookId)
  const db = await database
  const transaction = db.transaction(['notes', 'notebooks'], 'readwrite')
  const notes = transaction.objectStore('notes')
  const note = await notes.get(noteId)
  if (!note) {
    await transaction.done
    throw new Error(t("Note not found."))
  }
  if (!(await transaction.objectStore('notebooks').get(notebookId))) {
    await transaction.done
    throw new Error(t("Notebook not found."))
  }
  await notes.put({ ...note, notebookId, updatedAt: Date.now() })
  await transaction.done
  announceChange([noteId])
}

export async function getTags(): Promise<Tag[]> {
  const db = await database
  return (await db.getAll('tags')).sort((a, b) => a.label.localeCompare(b.label))
}

export async function getSettings(): Promise<AppSettings> {
  const db = await database
  return (await db.get('settings', 'preferences')) ?? { id: 'preferences', theme: 'system' }
}

// Each preference is saved without disturbing the others.
async function saveSettings(change: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
  const db = await database
  const transaction = db.transaction('settings', 'readwrite')
  const current = (await transaction.store.get('preferences')) ?? { id: 'preferences', theme: 'system' }
  await transaction.store.put({ ...current, ...change })
  await transaction.done
  announceChange()
}

export async function saveTheme(choice: ThemeChoice): Promise<void> {
  await saveSettings(themeSettings(choice))
}

export async function saveReaderSettings(reader: ReaderSettings): Promise<void> {
  await saveSettings({ reader })
}

export async function saveEditorMode(editorMode: EditorMode): Promise<void> {
  await saveSettings({ editorMode })
}

/** Saves a search by name, or renames it if the same search is already saved. Returns them all. */
export async function saveSearch(name: string, query: string): Promise<SavedSearch[]> {
  const db = await database
  const transaction = db.transaction('settings', 'readwrite')
  const current = (await transaction.store.get('preferences')) ?? { id: 'preferences', theme: 'system' }
  let savedSearches: SavedSearch[]
  try {
    savedSearches = withSavedSearch(current.savedSearches ?? [], name, query, crypto.randomUUID())
  } catch (reason) {
    transaction.abort()
    await transaction.done.catch(() => undefined)
    throw reason
  }
  await transaction.store.put({ ...current, savedSearches })
  await transaction.done
  announceChange()
  return savedSearches
}

/** Removes a saved search. Returns those left. */
export async function deleteSavedSearch(id: string): Promise<SavedSearch[]> {
  const db = await database
  const transaction = db.transaction('settings', 'readwrite')
  const current = await transaction.store.get('preferences')
  const savedSearches = (current?.savedSearches ?? []).filter((search) => search.id !== id)
  if (current?.savedSearches) await transaction.store.put({ ...current, savedSearches })
  await transaction.done
  announceChange()
  return savedSearches
}

export async function setNoteFlag(
  id: string,
  flag: 'pinned' | 'favorite',
  value: boolean,
): Promise<void> {
  refuseHandbookChange(id)
  const db = await database
  const note = await db.get('notes', id)
  if (!note) throw new Error(t("Note not found."))
  await saveNote({ ...note, [flag]: value, updatedAt: Date.now() })
}

/** Records that a note, personal or handbook, was opened now, keeping its reading position. */
export async function recordReading(noteId: string): Promise<void> {
  const db = await database
  const transaction = db.transaction('reading', 'readwrite')
  const existing = await transaction.store.get(noteId)
  await transaction.store.put({ ...existing, noteId, openedAt: Date.now() })
  await transaction.done
}

/** Every note opened, with when; the most recent first. */
export async function getReadingRecords(): Promise<ReadingRecord[]> {
  const db = await database
  return (await db.getAllFromIndex('reading', 'by-opened')).reverse()
}

/** Remembers how far through a note the reader is, from 0 (the start) to 1 (the end). */
export async function saveReadingPosition(noteId: string, position: number): Promise<void> {
  const db = await database
  const transaction = db.transaction('reading', 'readwrite')
  const existing = await transaction.store.get(noteId)
  await transaction.store.put({ openedAt: Date.now(), ...existing, noteId, position: Math.min(1, Math.max(0, position)) })
  await transaction.done
}

/** The note opened most recently, if any. */
export async function getLastReading(): Promise<ReadingRecord | undefined> {
  const db = await database
  const cursor = await db.transaction('reading').store.index('by-opened').openCursor(null, 'prev')
  return cursor?.value
}

export async function getNoteHistory(noteId: string): Promise<NoteHistoryEntry[]> {
  const db = await database
  return (await db.getAllFromIndex('history', 'by-note', noteId)).sort(
    (a, b) => b.savedAt - a.savedAt,
  )
}

// Restores only the title and text; notebook, tags, pin, favorite, and Trash state stay
// as they are now, since history records content changes rather than organization.
export async function restoreHistory(revisionId: string): Promise<Note> {
  const db = await database
  const revision = await db.get('history', revisionId)
  if (!revision) throw new Error(t("History revision not found."))
  const current = await db.get('notes', revision.noteId)
  if (!current) throw new Error(t("The note for this revision no longer exists."))
  const restored = { ...current, title: revision.snapshot.title, content: revision.snapshot.content, updatedAt: Date.now() }
  await saveNote(restored, { forceHistory: true })
  return normalizeNote(restored)
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error(t("The attachment could not be read for export.")))
    }
    reader.onerror = () => reject(reader.error ?? new Error(t("The attachment could not be read for export.")))
    reader.readAsArrayBuffer(blob)
  })
}

function isQuotaExceeded(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'QuotaExceededError'
}

export interface BackupOptions {
  /** Include attachment files (stored as Base64, about a third larger than the originals). */
  attachments?: boolean
  /** Include note history revisions. */
  history?: boolean
}

/** Everything in the library, as a backup holds it (no size limit; see exportBackup). */
export async function collectLibrary(options: BackupOptions = {}): Promise<NotesBackup> {
  return buildBackup(options)
}

async function buildBackup({ attachments: includeAttachments = true, history: includeHistory = true }: BackupOptions): Promise<NotesBackup> {
  const db = await database
  const [notes, notebooks, libraries, shelves, tags, settings, history, attachments, links] = await Promise.all([
    db.getAll('notes'),
    db.getAll('notebooks'),
    db.getAll('libraries'),
    db.getAll('shelves'),
    db.getAll('tags'),
    getSettings(),
    includeHistory ? db.getAll('history') : [],
    includeAttachments ? db.getAll('attachments') : [],
    db.getAll('noteLinks'),
  ])
  const backupAttachments = attachments.map(({ data, ...attachment }) => ({
    ...attachment,
    data: bytesToBase64(new Uint8Array(data)),
  }))
  return {
    format: 'my-notes-backup',
    version: 4,
    exportedAt: Date.now(),
    notes,
    notebooks,
    libraries,
    shelves,
    tags,
    settings,
    history,
    attachments: backupAttachments,
    links,
  }
}

function serializeBackup(backup: NotesBackup): string {
  const text = JSON.stringify(backup, null, 2)
  if (new Blob([text]).size > MAX_BACKUP_SIZE_BYTES) {
    throw new Error(
      backup.attachments.length || backup.history.length
        ? t('This backup exceeds 40 MiB. Export it without attachments or history, or remove some attachments, and try again.')
        : t('This backup exceeds 40 MiB even without attachments and history.'),
    )
  }
  return text
}

export async function exportBackup(options: BackupOptions = {}): Promise<NotesBackup> {
  const backup = await buildBackup(options)
  serializeBackup(backup)
  return backup
}

/** Builds and serializes a backup once, ready to download. */
export async function exportBackupFile(options: BackupOptions = {}): Promise<Blob> {
  return new Blob([serializeBackup(await buildBackup(options))], { type: 'application/json' })
}

/** Problems the start-up check found (see lib/integrity.ts), to repair. */
export interface LibraryProblems {
  /** Stored links whose note at either end no longer exists. */
  links: NoteLink[]
  /** Notes in a notebook that no longer exists. */
  notesWithoutNotebook: string[]
  /** Notebooks on a shelf that no longer exists. */
  notebooksWithoutShelf: string[]
  /** Shelves in a library that no longer exists. */
  shelvesWithoutLibrary: string[]
  /** Attachments and history entries of notes that no longer exist. */
  orphanAttachments: string[]
  orphanHistory: string[]
  /** The tag list does not match the tags on notes. */
  tagsOutOfDate: boolean
}

export interface LibraryRepairs {
  linksRemoved: number
  notesMoved: number
  notebooksMoved: number
  shelvesMoved: number
  attachmentsRemoved: number
  historyRemoved: number
  tagsRebuilt: boolean
  /** Where moved items went, for the report. */
  notebookName?: string
  shelfName?: string
  libraryName?: string
}

/**
 * The attachments and history entries of notes that do not exist (in `noteIds`), read from the
 * indexes without loading any contents: each note is visited once, and entry IDs are fetched
 * only for notes that are missing.
 */
export async function findOrphans(noteIds: ReadonlySet<string>): Promise<{ attachments: string[]; history: string[] }> {
  const db = await database
  const transaction = db.transaction(['attachments', 'history'])
  const collect = async (store: 'attachments' | 'history') => {
    const index = transaction.objectStore(store).index('by-note')
    const orphans: string[] = []
    let cursor = await index.openKeyCursor(null, 'nextunique')
    while (cursor) {
      if (!noteIds.has(cursor.key)) orphans.push(...(await index.getAllKeys(cursor.key)))
      cursor = await cursor.continue()
    }
    return orphans
  }
  const [attachments, history] = await Promise.all([collect('attachments'), collect('history')])
  await transaction.done
  return { attachments, history }
}

/**
 * Repairs what the start-up check found, in one transaction. Each problem is checked again
 * first, so nothing changed by another tab since is touched: links and orphans are removed only
 * if their note is still missing, and items are moved only if what they belong to is still gone.
 * Moved items go to the starter (or first) notebook, shelf, or library, created if none is left.
 */
export async function repairLibrary(problems: LibraryProblems): Promise<LibraryRepairs> {
  const db = await database
  const transaction = db.transaction(['notes', 'notebooks', 'libraries', 'shelves', 'tags', 'history', 'attachments', 'noteLinks'], 'readwrite')
  const notes = transaction.objectStore('notes')
  const notebooks = transaction.objectStore('notebooks')
  const shelves = transaction.objectStore('shelves')
  const libraries = transaction.objectStore('libraries')
  const now = Date.now()
  const repairs: LibraryRepairs = {
    linksRemoved: 0, notesMoved: 0, notebooksMoved: 0, shelvesMoved: 0, attachmentsRemoved: 0, historyRemoved: 0, tagsRebuilt: false,
  }
  const noteExists = async (id: string) => (await notes.count(id)) > 0

  let fallbackLibrary: Library | undefined
  const libraryToUse = async () => {
    fallbackLibrary ??= (await libraries.get(DEFAULT_LIBRARY_ID)) ?? (await libraries.getAll())[0]
    if (!fallbackLibrary) {
      fallbackLibrary = { id: DEFAULT_LIBRARY_ID, name: 'My notes', createdAt: now, updatedAt: now }
      await libraries.put(fallbackLibrary)
    }
    return fallbackLibrary
  }
  for (const id of problems.shelvesWithoutLibrary) {
    const shelf = await shelves.get(id)
    if (!shelf || (await libraries.count(shelf.libraryId)) > 0) continue
    const library = await libraryToUse()
    await shelves.put({ ...shelf, libraryId: library.id, updatedAt: now })
    repairs.shelvesMoved += 1
    repairs.libraryName = library.name
  }

  let fallbackShelf: Shelf | undefined
  const shelfToUse = async () => {
    fallbackShelf ??= (await shelves.get(DEFAULT_SHELF_ID)) ?? (await shelves.getAll())[0]
    if (!fallbackShelf) {
      fallbackShelf = { id: DEFAULT_SHELF_ID, libraryId: (await libraryToUse()).id, name: 'General', createdAt: now, updatedAt: now }
      await shelves.put(fallbackShelf)
    }
    return fallbackShelf
  }
  for (const id of problems.notebooksWithoutShelf) {
    const notebook = await notebooks.get(id)
    if (!notebook || (notebook.shelfId && (await shelves.count(notebook.shelfId)) > 0)) continue
    const shelf = await shelfToUse()
    await notebooks.put({ ...notebook, shelfId: shelf.id, updatedAt: now })
    repairs.notebooksMoved += 1
    repairs.shelfName = shelf.name
  }

  let fallbackNotebook: Notebook | undefined
  const notebookToUse = async () => {
    fallbackNotebook ??= (await notebooks.get('starter-personal')) ?? (await notebooks.getAll())[0]
    if (!fallbackNotebook) {
      fallbackNotebook = { id: crypto.randomUUID(), name: 'Recovered notes', shelfId: (await shelfToUse()).id, createdAt: now, updatedAt: now }
      await notebooks.put(fallbackNotebook)
    }
    return fallbackNotebook
  }
  for (const id of problems.notesWithoutNotebook) {
    const note = await notes.get(id)
    if (!note || (note.notebookId && (await notebooks.count(note.notebookId)) > 0)) continue
    const notebook = await notebookToUse()
    // The note's edit time is kept: moving it is a repair, not an edit.
    await notes.put({ ...note, notebookId: notebook.id })
    repairs.notesMoved += 1
    repairs.notebookName = notebook.name
  }

  const linkStore = transaction.objectStore('noteLinks')
  for (const link of problems.links) {
    if ((await noteExists(link.sourceNoteId)) && (await noteExists(link.targetNoteId))) continue
    await linkStore.delete([link.sourceNoteId, link.targetNoteId])
    repairs.linksRemoved += 1
  }
  for (const [store, ids, count] of [
    ['attachments', problems.orphanAttachments, 'attachmentsRemoved'],
    ['history', problems.orphanHistory, 'historyRemoved'],
  ] as const) {
    const objects = transaction.objectStore(store)
    for (const id of ids) {
      const item = await objects.get(id)
      if (!item || (await noteExists(item.noteId))) continue
      await objects.delete(id)
      repairs[count] += 1
    }
  }

  if (problems.tagsOutOfDate) {
    await refreshTags(notes, transaction.objectStore('tags'))
    repairs.tagsRebuilt = true
  }
  await transaction.done
  if (Object.values(repairs).some((value) => value === true || (typeof value === 'number' && value > 0))) announceChange()
  return repairs
}

/** A note brought in from another app (see features/transfer). */
export interface IncomingNote {
  title: string
  content: string
  tags: string[]
  /** The notebook to put it in, by name; created if missing. */
  notebook: string
  createdAt: number
  updatedAt: number
  pinned?: boolean
  favorite?: boolean
  /** Put straight into Trash (it was deleted in the other app). */
  trashed?: boolean
  attachments: Array<{ name: string; type: string; data: Uint8Array }>
}

export interface NotesImportSummary {
  notes: number
  notebooksCreated: number
  attachments: number
  /** Attachments left out: too large, or over a note's limits. */
  attachmentsSkipped: number
}

/**
 * Adds notes from another app as new notes (never replacing any), in one transaction. Notebooks
 * are matched by name, ignoring capitals, or created on the default shelf. Attachments over the
 * usual limits are left out and counted.
 */
export async function importNotes(incoming: IncomingNote[]): Promise<NotesImportSummary> {
  const db = await database
  const transaction = db.transaction(['notes', 'notebooks', 'shelves', 'tags', 'attachments'], 'readwrite')
  const notes = transaction.objectStore('notes')
  const notebooks = transaction.objectStore('notebooks')
  const attachments = transaction.objectStore('attachments')
  const byName = new Map((await notebooks.getAll()).map((notebook) => [notebook.name.toLocaleLowerCase(), notebook]))
  const shelves = transaction.objectStore('shelves')
  const shelfId = ((await shelves.get(DEFAULT_SHELF_ID)) ?? (await shelves.getAll())[0])?.id
  const summary: NotesImportSummary = { notes: 0, notebooksCreated: 0, attachments: 0, attachmentsSkipped: 0 }
  const now = Date.now()

  for (const item of incoming) {
    const name = item.notebook.trim() || 'Imported'
    let notebook = byName.get(name.toLocaleLowerCase())
    if (!notebook) {
      notebook = { id: crypto.randomUUID(), name, shelfId, createdAt: now, updatedAt: now }
      await notebooks.add(notebook)
      byName.set(name.toLocaleLowerCase(), notebook)
      summary.notebooksCreated += 1
    }
    const note = normalizeNote({
      id: crypto.randomUUID(),
      title: item.title,
      content: item.content,
      tags: item.tags,
      notebookId: notebook.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      pinned: item.pinned ?? false,
      favorite: item.favorite ?? false,
      ...(item.trashed ? { deletedAt: now } : {}),
    })
    await notes.add(note)
    summary.notes += 1

    let count = 0
    let bytes = 0
    for (const file of item.attachments) {
      const fits = file.data.byteLength > 0 && file.data.byteLength <= MAX_ATTACHMENT_SIZE_BYTES
        && count < MAX_ATTACHMENTS_PER_NOTE && bytes + file.data.byteLength <= MAX_NOTE_ATTACHMENT_BYTES
      if (!fits) {
        summary.attachmentsSkipped += 1
        continue
      }
      await attachments.add({
        id: crypto.randomUUID(),
        noteId: note.id,
        name: file.name.trim() || 'attachment',
        type: file.type || 'application/octet-stream',
        size: file.data.byteLength,
        createdAt: item.createdAt,
        data: file.data.slice().buffer,
      })
      count += 1
      bytes += file.data.byteLength
      summary.attachments += 1
    }
  }
  await refreshTags(notes, transaction.objectStore('tags'))
  await transaction.done
  announceChange()
  return summary
}

export interface ImportSummary {
  notesAdded: number
  notesSkipped: number
  notebooksAdded: number
  librariesAdded: number
  shelvesAdded: number
  historyAdded: number
  attachmentsAdded: number
  linksAdded: number
  settingsKept: boolean
}

export async function importBackupFile(file: File): Promise<ImportSummary> {
  if (file.size > MAX_BACKUP_SIZE_BYTES) throw new Error(t("Backup files must be 40 MiB or smaller."))
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error(t("The selected file is not valid JSON."))
  }
  const summary = await importBackupInto(await database, validateBackup(parsed))
  announceChange()
  return summary
}

/**
 * Opens an empty database laid out like a new device's (starter notebooks, library, and shelf,
 * but no starter notes), to restore a backup into as a test. `discard` closes and deletes it.
 */
export async function openTestRestoreDatabase(name: string): Promise<{ db: IDBPDatabase<NotesDatabase>; discard: () => Promise<void> }> {
  const db = await openDB<NotesDatabase>(name, DATABASE_VERSION, {
    upgrade(upgrading, oldVersion, _newVersion, transaction) {
      return upgradeDatabase(upgrading, oldVersion, transaction, false)
    },
  })
  return {
    db,
    discard: async () => {
      db.close()
      await deleteDB(name)
    },
  }
}

/** Merges a validated backup into a database; see importBackupFile. */
export async function importBackupInto(db: IDBPDatabase<NotesDatabase>, backup: NotesBackup): Promise<ImportSummary> {
  const transaction = db.transaction(['notes', 'notebooks', 'libraries', 'shelves', 'settings', 'tags', 'history', 'attachments', 'noteLinks'], 'readwrite')
  const noteStore = transaction.objectStore('notes')
  const notebookStore = transaction.objectStore('notebooks')
  const libraryStore = transaction.objectStore('libraries')
  const shelfStore = transaction.objectStore('shelves')
  const historyStore = transaction.objectStore('history')
  const attachmentStore = transaction.objectStore('attachments')
  const linkStore = transaction.objectStore('noteLinks')
  const currentNotes = await noteStore.getAll()
  const currentNotebooks = await notebookStore.getAll()
  const currentLibraries = await libraryStore.getAll()
  const currentShelves = await shelfStore.getAll()
  const noteIds = new Set(currentNotes.map((note) => note.id))
  const notebookById = new Map(currentNotebooks.map((notebook) => [notebook.id, notebook]))
  const notebookByName = new Map(currentNotebooks.map((notebook) => [notebook.name.toLocaleLowerCase(), notebook]))
  const notebookIdMap = new Map<string, string>()
  const libraryIdMap = new Map<string, string>()
  const shelfIdMap = new Map<string, string>()
  let notebooksAdded = 0
  let librariesAdded = 0
  let shelvesAdded = 0

  const libraryById = new Map(currentLibraries.map((library) => [library.id, library]))
  const libraryByName = new Map(currentLibraries.map((library) => [library.name.toLocaleLowerCase(), library]))
  for (const imported of backup.libraries) {
    const sameId = libraryById.get(imported.id)
    const local = sameId?.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase()
      ? sameId
      : libraryByName.get(imported.name.toLocaleLowerCase())
    if (local) {
      libraryIdMap.set(imported.id, local.id)
      continue
    }
    const id = sameId ? crypto.randomUUID() : imported.id
    const library = { ...imported, id }
    await libraryStore.add(library)
    libraryById.set(id, library)
    libraryByName.set(library.name.toLocaleLowerCase(), library)
    libraryIdMap.set(imported.id, id)
    librariesAdded += 1
  }

  const shelfById = new Map(currentShelves.map((shelf) => [shelf.id, shelf]))
  const shelfByName = new Map(currentShelves.map((shelf) => [`${shelf.libraryId}\u0000${shelf.name.toLocaleLowerCase()}`, shelf]))
  for (const imported of backup.shelves) {
    const libraryId = libraryIdMap.get(imported.libraryId)
    if (!libraryId) {
      transaction.abort()
      throw new Error(t("A backup shelf refers to a library that could not be restored."))
    }
    const sameId = shelfById.get(imported.id)
    const local = sameId?.libraryId === libraryId && sameId.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase()
      ? sameId
      : shelfByName.get(`${libraryId}\u0000${imported.name.toLocaleLowerCase()}`)
    if (local) {
      shelfIdMap.set(imported.id, local.id)
      continue
    }
    const id = sameId ? crypto.randomUUID() : imported.id
    const shelf = { ...imported, id, libraryId }
    await shelfStore.add(shelf)
    shelfById.set(id, shelf)
    shelfByName.set(`${libraryId}\u0000${shelf.name.toLocaleLowerCase()}`, shelf)
    shelfIdMap.set(imported.id, id)
    shelvesAdded += 1
  }

  const defaultShelf = currentShelves.find((shelf) => shelf.id === DEFAULT_SHELF_ID) ?? currentShelves[0]
  if (!defaultShelf) {
    transaction.abort()
    throw new Error(t("A default shelf is not available for imported notebooks."))
  }
  const defaultShelfId = defaultShelf.id

  for (const imported of backup.notebooks) {
    const local = notebookById.get(imported.id)
    if (local && local.name.toLocaleLowerCase() === imported.name.toLocaleLowerCase()) {
      notebookIdMap.set(imported.id, local.id)
      continue
    }
    const sameName = notebookByName.get(imported.name.toLocaleLowerCase())
    if (sameName) {
      notebookIdMap.set(imported.id, sameName.id)
      continue
    }
    const id = local ? crypto.randomUUID() : imported.id
    notebookIdMap.set(imported.id, id)
    const shelfId = shelfIdMap.get(imported.shelfId ?? '') ?? defaultShelfId
    const notebook = { ...imported, id, shelfId }
    await notebookStore.add(notebook)
    notebookById.set(id, notebook)
    notebookByName.set(imported.name.toLocaleLowerCase(), notebook)
    notebooksAdded += 1
  }

  let notesAdded = 0
  let notesSkipped = 0
  // Older exports could reference notebooks that no longer existed. Those records are
  // reassigned instead of rejecting the whole backup.
  const fallbackNotebookId =
    notebookIdMap.get('starter-personal') ??
    (notebookById.has('starter-personal') ? 'starter-personal' : undefined) ??
    currentNotebooks[0]?.id
  if (!fallbackNotebookId) {
    transaction.abort()
    throw new Error(t("A notebook is not available for imported notes."))
  }
  const acceptedNoteIds = new Set<string>()
  const importedNotebookByNote = new Map<string, string>()
  for (const imported of backup.notes) {
    if (noteIds.has(imported.id)) {
      notesSkipped += 1
      continue
    }
    const notebookId = notebookIdMap.get(imported.notebookId ?? '') ?? fallbackNotebookId
    const note = normalizeNote({ ...imported, notebookId })
    await noteStore.put(note)
    noteIds.add(note.id)
    acceptedNoteIds.add(note.id)
    importedNotebookByNote.set(note.id, notebookId)
    notesAdded += 1
  }

  let historyAdded = 0
  for (const imported of backup.history) {
    if (!acceptedNoteIds.has(imported.noteId)) continue
    const snapshot = imported.snapshot
    const snapshotNotebookId =
      notebookIdMap.get(snapshot.notebookId ?? '') ??
      importedNotebookByNote.get(imported.noteId) ??
      fallbackNotebookId
    await historyStore.put({
      ...imported,
      id: (await historyStore.get(imported.id)) ? crypto.randomUUID() : imported.id,
      snapshot: normalizeNote({ ...snapshot, notebookId: snapshotNotebookId }),
    })
    historyAdded += 1
  }

  let attachmentsAdded = 0
  for (const imported of backup.attachments) {
    if (!acceptedNoteIds.has(imported.noteId)) continue
    await attachmentStore.put({
      id: (await attachmentStore.get(imported.id)) ? crypto.randomUUID() : imported.id,
      noteId: imported.noteId,
      name: imported.name,
      type: imported.type,
      size: imported.size,
      createdAt: imported.createdAt,
      data: base64ToArrayBuffer(imported.data),
    })
    attachmentsAdded += 1
  }

  let linksAdded = 0
  for (const link of backup.links) {
    if (!noteIds.has(link.sourceNoteId) || !noteIds.has(link.targetNoteId)) continue
    if (await linkStore.get([link.sourceNoteId, link.targetNoteId])) continue
    await linkStore.put(link)
    linksAdded += 1
  }

  const settingsStore = transaction.objectStore('settings')
  const hasLocalSettings = await settingsStore.get('preferences')
  if (!hasLocalSettings) await settingsStore.put(backup.settings)
  // This device keeps its own preferences, but gains the backup's saved searches.
  else if (backup.settings.savedSearches?.length) {
    await settingsStore.put({ ...hasLocalSettings, savedSearches: mergeSavedSearches(hasLocalSettings.savedSearches ?? [], backup.settings.savedSearches) })
  }
  await refreshTags(transaction.objectStore('notes'), transaction.objectStore('tags'))
  await transaction.done
  return {
    notesAdded,
    notesSkipped,
    notebooksAdded,
    librariesAdded,
    shelvesAdded,
    historyAdded,
    attachmentsAdded,
    linksAdded,
    settingsKept: Boolean(hasLocalSettings),
  }
}

export async function getStorageSnapshot(): Promise<{
  notes: number
  trash: number
  notebooks: number
  tags: number
  revisions: number
  attachments: number
  attachmentBytes: number
  estimatedBytes: number
}> {
  const db = await database
  const [notes, notebooks, tags, history, attachments, links] = await Promise.all([
    db.getAll('notes'),
    db.getAll('notebooks'),
    db.getAll('tags'),
    db.getAll('history'),
    db.getAll('attachments'),
    db.getAll('noteLinks'),
  ])
  const attachmentBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0)
  const estimatedBytes = new Blob([JSON.stringify({ notes, notebooks, tags, history, links })]).size + attachmentBytes
  const trash = notes.filter((note) => note.deletedAt !== undefined).length
  return {
    notes: notes.length - trash,
    trash,
    notebooks: notebooks.length,
    tags: tags.length,
    revisions: history.length,
    attachments: attachments.length,
    attachmentBytes,
    estimatedBytes,
  }
}
