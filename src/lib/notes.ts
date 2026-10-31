import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from 'idb'
import type {
  AppSettings,
  Note,
  NoteAttachment,
  NoteLink,
  Library,
  Notebook,
  NoteHistoryEntry,
  Shelf,
  Tag,
  ThemePreference,
} from '../types'
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_BACKUP_SIZE_BYTES,
  MAX_NOTE_ATTACHMENT_BYTES,
  validateAttachmentDetails,
} from '../features/notes/attachments'

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
}

const starterNotebooks = [
  ['starter-personal', 'Personal'],
  ['starter-work', 'Work'],
  ['starter-ideas', 'Ideas'],
  ['starter-research', 'Research'],
  ['starter-health', 'Health Handbook'],
] as const

const DEFAULT_LIBRARY_ID = 'starter-library'
const DEFAULT_SHELF_ID = 'starter-shelf'

export const DATABASE_VERSION = 6

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
  async upgrade(db, oldVersion, _newVersion, transaction) {
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
      for (const [id, name] of starterNotebooks) {
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
      const library = { id: DEFAULT_LIBRARY_ID, name: 'Personal Library', createdAt: now, updatedAt: now }
      const shelf = { id: DEFAULT_SHELF_ID, libraryId: DEFAULT_LIBRARY_ID, name: 'General', createdAt: now, updatedAt: now }
      libraries.put(library)
      shelves.put(shelf)
      let cursor = await notebooks.openCursor()
      while (cursor) {
        cursor.update({ ...cursor.value, shelfId: cursor.value.shelfId ?? DEFAULT_SHELF_ID })
        cursor = await cursor.continue()
      }
    }
  },
})

export async function openNotesDatabase(): Promise<IDBPDatabase<NotesDatabase>> {
  return database
}

function cleanTags(tags: string[]): string[] {
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
  if (sourceNoteId === targetNoteId) throw new Error('A note cannot link to itself.')
  const db = await database
  const transaction = db.transaction(['notes', 'noteLinks'], 'readwrite')
  const notes = transaction.objectStore('notes')
  const [source, target] = await Promise.all([
    notes.get(sourceNoteId),
    notes.get(targetNoteId),
  ])
  if (!source || !target) {
    await transaction.done
    throw new Error('Both notes must exist before they can be linked.')
  }
  if (source.deletedAt !== undefined || target.deletedAt !== undefined) {
    await transaction.done
    throw new Error('Restore notes from Trash before linking them.')
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
    throw new Error('Create a notebook before saving notes.')
  }
  const note = normalizeNote({ ...input, notebookId })
  if (existing && (existing.title !== note.title || existing.content !== note.content)) {
    const historyStore = transaction.objectStore('history')
    const revisions = (await historyStore.index('by-note').getAll(existing.id))
      .sort((a, b) => b.savedAt - a.savedAt)
    const now = Date.now()
    // Within a burst, the newest revision already holds the text from before the burst.
    if (options.forceHistory || !revisions.length || now - revisions[0].savedAt >= HISTORY_SNAPSHOT_INTERVAL_MS) {
      await historyStore.put({ id: crypto.randomUUID(), noteId: existing.id, savedAt: now, snapshot: existing })
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

export async function addNoteAttachment(
  noteId: string,
  file: Blob,
  name: string,
): Promise<NoteAttachment> {
  validateAttachmentDetails(name, file.size)
  const data = await readBlob(file)
  const db = await database
  const transaction = db.transaction(['notes', 'attachments'], 'readwrite')
  const noteStore = transaction.objectStore('notes')
  const note = await noteStore.get(noteId)
  if (!note) {
    await transaction.done
    throw new Error('Save this note before adding attachments.')
  }
  const attachmentStore = transaction.objectStore('attachments')
  const existing = await attachmentStore.index('by-note').getAll(noteId)
  const usedBytes = existing.reduce((sum, attachment) => sum + attachment.size, 0)
  if (existing.length >= MAX_ATTACHMENTS_PER_NOTE) {
    await transaction.done
    throw new Error(`A note can have at most ${MAX_ATTACHMENTS_PER_NOTE} attachments.`)
  }
  if (usedBytes + file.size > MAX_NOTE_ATTACHMENT_BYTES) {
    await transaction.done
    throw new Error('Attachments for a note cannot exceed 20 MiB in total.')
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
      throw new Error('Browser storage is full. Remove large attachments or free device storage and try again.')
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
    throw new Error('Attachment not found.')
  }
  await attachmentStore.delete(id)
  const noteStore = transaction.objectStore('notes')
  const note = await noteStore.get(attachment.noteId)
  if (note) await noteStore.put({ ...note, updatedAt: Date.now() })
  await transaction.done
  announceChange([attachment.noteId])
}

export async function trashNote(id: string): Promise<void> {
  const db = await database
  const transaction = db.transaction(['notes', 'tags'], 'readwrite')
  const store = transaction.objectStore('notes')
  const note = await store.get(id)
  if (!note) {
    await transaction.done
    throw new Error('Note not found.')
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
  const db = await database
  const transaction = db.transaction(['notes', 'tags'], 'readwrite')
  const store = transaction.objectStore('notes')
  const note = await store.get(id)
  if (!note) {
    await transaction.done
    throw new Error('Note not found.')
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
  const db = await database
  const transaction = db.transaction(['notes', 'tags', 'history', 'attachments', 'noteLinks'], 'readwrite')
  const noteStore = transaction.objectStore('notes')
  const note = await noteStore.get(id)
  if (!note) {
    await transaction.done
    throw new Error('Note not found.')
  }
  if (note.deletedAt === undefined) {
    await transaction.done
    throw new Error('Only notes in Trash can be permanently deleted.')
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
  await refreshTags(transaction.objectStore('notes'), transaction.objectStore('tags'))
  await transaction.done
  announceChange([id])
}

export async function deleteNote(id: string): Promise<void> {
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
  if (!cleaned) throw new Error('Library name cannot be empty.')
  const db = await database
  const transaction = db.transaction(['libraries', 'shelves'], 'readwrite')
  const libraries = await transaction.objectStore('libraries').getAll()
  if (libraries.some((library) => library.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error('A library with that name already exists.')
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
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Library name cannot be empty.')
  const db = await database
  const transaction = db.transaction('libraries', 'readwrite')
  const store = transaction.objectStore('libraries')
  const libraries = await store.getAll()
  const library = libraries.find((item) => item.id === id)
  if (!library) {
    await transaction.done
    throw new Error('Library not found.')
  }
  if (libraries.some((item) => item.id !== id && item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error('A library with that name already exists.')
  }
  await store.put({ ...library, name: cleaned, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function createShelf(libraryId: string, name: string): Promise<Shelf> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Shelf name cannot be empty.')
  const db = await database
  const transaction = db.transaction(['libraries', 'shelves'], 'readwrite')
  if (!(await transaction.objectStore('libraries').get(libraryId))) {
    await transaction.done
    throw new Error('Library not found.')
  }
  const shelves = await transaction.objectStore('shelves').getAll()
  if (shelves.some((shelf) => shelf.libraryId === libraryId && shelf.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error('A shelf with that name already exists in this library.')
  }
  const now = Date.now()
  const shelf = { id: crypto.randomUUID(), libraryId, name: cleaned, createdAt: now, updatedAt: now }
  await transaction.objectStore('shelves').add(shelf)
  await transaction.done
  announceChange()
  return shelf
}

export async function renameShelf(id: string, name: string): Promise<void> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Shelf name cannot be empty.')
  const db = await database
  const transaction = db.transaction('shelves', 'readwrite')
  const store = transaction.objectStore('shelves')
  const shelves = await store.getAll()
  const shelf = shelves.find((item) => item.id === id)
  if (!shelf) {
    await transaction.done
    throw new Error('Shelf not found.')
  }
  if (shelves.some((item) => item.id !== id && item.libraryId === shelf.libraryId && item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error('A shelf with that name already exists in this library.')
  }
  await store.put({ ...shelf, name: cleaned, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function deleteShelf(id: string, destinationId: string): Promise<void> {
  const db = await database
  const transaction = db.transaction(['shelves', 'notebooks'], 'readwrite')
  const shelves = transaction.objectStore('shelves')
  const source = await shelves.get(id)
  const destination = await shelves.get(destinationId)
  if (!source || !destination || id === destinationId || source.libraryId !== destination.libraryId) {
    await transaction.done
    throw new Error('Choose a different existing shelf in the same library as the destination.')
  }
  if ((await shelves.index('by-library').count(source.libraryId)) <= 1) {
    await transaction.done
    throw new Error('The last shelf in a library cannot be deleted.')
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
  const db = await database
  const transaction = db.transaction(['libraries', 'shelves', 'notebooks'], 'readwrite')
  const libraries = transaction.objectStore('libraries')
  const source = await libraries.get(id)
  const destination = await libraries.get(destinationId)
  if (!source || !destination || id === destinationId) {
    await transaction.done
    throw new Error('Choose a different existing library as the destination.')
  }
  if ((await libraries.count()) <= 1) {
    await transaction.done
    throw new Error('The last library cannot be deleted.')
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
  const db = await database
  const transaction = db.transaction(['notebooks', 'shelves'], 'readwrite')
  const notebooks = transaction.objectStore('notebooks')
  const notebook = await notebooks.get(notebookId)
  if (!notebook) {
    await transaction.done
    throw new Error('Notebook not found.')
  }
  if (!(await transaction.objectStore('shelves').get(shelfId))) {
    await transaction.done
    throw new Error('Shelf not found.')
  }
  await notebooks.put({ ...notebook, shelfId, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function createNotebook(name: string, shelfId?: string): Promise<Notebook> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Notebook name cannot be empty.')
  const db = await database
  const transaction = db.transaction(['notebooks', 'shelves'], 'readwrite')
  const notebooksStore = transaction.objectStore('notebooks')
  const notebooks = await notebooksStore.getAll()
  if (notebooks.some((notebook) => notebook.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error('A notebook with that name already exists.')
  }
  const targetShelfId = shelfId ?? (await transaction.objectStore('shelves').getAll())[0]?.id
  if (!targetShelfId || !(await transaction.objectStore('shelves').get(targetShelfId))) {
    await transaction.done
    throw new Error('Choose an existing shelf for the notebook.')
  }
  const now = Date.now()
  const notebook = { id: crypto.randomUUID(), name: cleaned, shelfId: targetShelfId, createdAt: now, updatedAt: now }
  await notebooksStore.add(notebook)
  await transaction.done
  announceChange()
  return notebook
}

export async function renameNotebook(id: string, name: string): Promise<void> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Notebook name cannot be empty.')
  const db = await database
  const transaction = db.transaction('notebooks', 'readwrite')
  const notebooks = await transaction.store.getAll()
  const notebook = notebooks.find((item) => item.id === id)
  if (!notebook) {
    await transaction.done
    throw new Error('Notebook not found.')
  }
  if (
    notebooks.some(
      (item) => item.id !== id && item.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase(),
    )
  ) {
    await transaction.done
    throw new Error('A notebook with that name already exists.')
  }
  await transaction.store.put({ ...notebook, name: cleaned, updatedAt: Date.now() })
  await transaction.done
  announceChange()
}

export async function deleteNotebook(id: string, destinationId: string): Promise<void> {
  const db = await database
  const transaction = db.transaction(['notebooks', 'notes', 'history'], 'readwrite')
  const notebooks = transaction.objectStore('notebooks')
  const source = await notebooks.get(id)
  const destination = await notebooks.get(destinationId)
  if (!source || !destination || id === destinationId) {
    await transaction.done
    throw new Error('Choose a different existing notebook as the destination.')
  }
  if ((await notebooks.count()) <= 1) {
    await transaction.done
    throw new Error('The last notebook cannot be deleted.')
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
  const db = await database
  const transaction = db.transaction(['notes', 'notebooks'], 'readwrite')
  const notes = transaction.objectStore('notes')
  const note = await notes.get(noteId)
  if (!note) {
    await transaction.done
    throw new Error('Note not found.')
  }
  if (!(await transaction.objectStore('notebooks').get(notebookId))) {
    await transaction.done
    throw new Error('Notebook not found.')
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

export async function saveTheme(theme: ThemePreference): Promise<void> {
  const db = await database
  await db.put('settings', { id: 'preferences', theme })
  announceChange()
}

export async function setNoteFlag(
  id: string,
  flag: 'pinned' | 'favorite',
  value: boolean,
): Promise<void> {
  const db = await database
  const note = await db.get('notes', id)
  if (!note) throw new Error('Note not found.')
  await saveNote({ ...note, [flag]: value, updatedAt: Date.now() })
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
  if (!revision) throw new Error('History revision not found.')
  const current = await db.get('notes', revision.noteId)
  if (!current) throw new Error('The note for this revision no longer exists.')
  const restored = { ...current, title: revision.snapshot.title, content: revision.snapshot.content, updatedAt: Date.now() }
  await saveNote(restored, { forceHistory: true })
  return normalizeNote(restored)
}

interface LegacyNotesBackup {
  format: 'my-notes-backup'
  version: 1
  exportedAt: number
  notes: Note[]
  notebooks: Notebook[]
  tags: Tag[]
  settings: AppSettings
  history: NoteHistoryEntry[]
}

interface VersionTwoNotesBackup extends Omit<LegacyNotesBackup, 'version'> {
  version: 2
  attachments: AttachmentBackup[]
}

interface VersionThreeNotesBackup extends Omit<VersionTwoNotesBackup, 'version'> {
  version: 3
  links: NoteLink[]
}

interface AttachmentBackup extends Omit<NoteAttachment, 'blob'> {
  data: string
}

export interface NotesBackup {
  format: 'my-notes-backup'
  version: 4
  exportedAt: number
  notes: Note[]
  notebooks: Notebook[]
  libraries: Library[]
  shelves: Shelf[]
  tags: Tag[]
  settings: AppSettings
  history: NoteHistoryEntry[]
  attachments: AttachmentBackup[]
  links: NoteLink[]
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function base64ByteLength(value: string): number | undefined {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('The attachment could not be read for export.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('The attachment could not be read for export.'))
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
        ? 'This backup exceeds 40 MiB. Export it without attachments or history, or remove some attachments, and try again.'
        : 'This backup exceeds 40 MiB even without attachments and history.',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validNote(value: unknown): value is Note {
  return (
    isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt) &&
    (value.notebookId === undefined || typeof value.notebookId === 'string') &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string'))) &&
    (value.pinned === undefined || typeof value.pinned === 'boolean') &&
    (value.favorite === undefined || typeof value.favorite === 'boolean') &&
    (value.deletedAt === undefined || Number.isFinite(value.deletedAt))
  )
}

function hasUniqueIds(values: unknown[], key = 'id'): boolean {
  const ids = values.map((value) => (isRecord(value) ? value[key] : undefined))
  return ids.every((id) => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length
}

function validNotebook(value: unknown): value is Notebook {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt) &&
    (value.shelfId === undefined || (typeof value.shelfId === 'string' && value.shelfId.length > 0))
  )
}

function validLibrary(value: unknown): value is Library {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt)
  )
}

function validShelf(value: unknown): value is Shelf {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.libraryId === 'string' &&
    value.libraryId.length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    Number.isFinite(value.createdAt) &&
    Number.isFinite(value.updatedAt)
  )
}

function validTag(value: unknown): value is Tag {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.label === 'string' &&
    value.label.trim().length > 0 &&
    Number.isFinite(value.count) &&
    Number(value.count) >= 0
  )
}

function validSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    value.id === 'preferences' &&
    ['light', 'dark', 'system'].includes(String(value.theme))
  )
}

function validHistory(value: unknown): value is NoteHistoryEntry {
  return (
    isRecord(value) &&
    typeof value.noteId === 'string' &&
    Number.isFinite(value.savedAt) &&
    validNote(value.snapshot) &&
    value.snapshot.id === value.noteId
  )
}

function validAttachmentBackup(value: unknown): value is AttachmentBackup {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.noteId !== 'string' ||
    !value.noteId ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 255 ||
    typeof value.type !== 'string' ||
    value.type.length > 255 ||
    !Number.isSafeInteger(value.size) ||
    Number(value.size) < 0 ||
    Number(value.size) > MAX_ATTACHMENT_SIZE_BYTES ||
    !Number.isFinite(value.createdAt) ||
    typeof value.data !== 'string'
  ) {
    return false
  }
  return base64ByteLength(value.data) === value.size
}

function validNoteLink(value: unknown): value is NoteLink {
  return (
    isRecord(value) &&
    typeof value.sourceNoteId === 'string' &&
    value.sourceNoteId.length > 0 &&
    typeof value.targetNoteId === 'string' &&
    value.targetNoteId.length > 0 &&
    value.sourceNoteId !== value.targetNoteId
  )
}

function isNotesBackup(
  value: unknown,
): value is NotesBackup | VersionThreeNotesBackup | VersionTwoNotesBackup | LegacyNotesBackup {
  if (
    !isRecord(value) ||
    value.format !== 'my-notes-backup' ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4) ||
    !Number.isFinite(value.exportedAt) ||
    !Array.isArray(value.notes) ||
    !Array.isArray(value.notebooks) ||
    !Array.isArray(value.tags) ||
    !Array.isArray(value.history) ||
    (value.version >= 2 && !Array.isArray(value.attachments)) ||
    (value.version >= 3 && !Array.isArray(value.links)) ||
    (value.version === 4 && (!Array.isArray(value.libraries) || !Array.isArray(value.shelves))) ||
    !validSettings(value.settings)
  ) {
    return false
  }
  const notebooks: unknown[] = value.notebooks
  const notes: unknown[] = value.notes
  const tags: unknown[] = value.tags
  const history: unknown[] = value.history
  const attachments: unknown[] =
    value.version >= 2 && Array.isArray(value.attachments) ? value.attachments : []
  const links: unknown[] = value.version >= 3 && Array.isArray(value.links) ? value.links : []
  const libraries: unknown[] = value.version === 4 && Array.isArray(value.libraries) ? value.libraries : []
  const shelves: unknown[] = value.version === 4 && Array.isArray(value.shelves) ? value.shelves : []
  if (
    !hasUniqueIds(notebooks) ||
    !notebooks.every(validNotebook) ||
    !hasUniqueIds(notes) ||
    !notes.every(validNote) ||
    !hasUniqueIds(tags) ||
    !tags.every(validTag) ||
    !hasUniqueIds(history) ||
    !history.every(validHistory) ||
    !hasUniqueIds(attachments) ||
    !attachments.every(validAttachmentBackup) ||
    !hasUniqueIds(libraries) ||
    !libraries.every(validLibrary) ||
    !hasUniqueIds(shelves) ||
    !shelves.every(validShelf) ||
    !links.every(validNoteLink) ||
    new Set(links.map((link) =>
      isRecord(link) ? JSON.stringify([link.sourceNoteId, link.targetNoteId]) : '',
    )).size !== links.length
  ) {
    return false
  }
  const validatedNotebooks = notebooks.filter(validNotebook)
  const validatedNotes = notes.filter(validNote)
  const validatedAttachments = attachments.filter(validAttachmentBackup)
  const validatedLibraries = libraries.filter(validLibrary)
  const validatedShelves = shelves.filter(validShelf)
  const notebookNames = validatedNotebooks.map((item) => item.name.toLocaleLowerCase())
  const noteIds = new Set(validatedNotes.map((item) => item.id))
  const attachmentCounts = new Map<string, { count: number; bytes: number }>()
  const libraryIds = new Set(validatedLibraries.map((item) => item.id))
  const shelfIds = new Set(validatedShelves.map((item) => item.id))
  const shelfNames = validatedShelves.map((item) => `${item.libraryId}\u0000${item.name.toLocaleLowerCase()}`)
  const libraryNames = validatedLibraries.map((item) => item.name.toLocaleLowerCase())
  for (const attachment of validatedAttachments) {
    if (!noteIds.has(attachment.noteId)) return false
    const current = attachmentCounts.get(attachment.noteId) ?? { count: 0, bytes: 0 }
    current.count += 1
    current.bytes += attachment.size
    if (current.count > MAX_ATTACHMENTS_PER_NOTE || current.bytes > MAX_NOTE_ATTACHMENT_BYTES) {
      return false
    }
    attachmentCounts.set(attachment.noteId, current)
  }
  if (
    new Set(notebookNames).size !== notebookNames.length ||
    new Set(libraryNames).size !== libraryNames.length ||
    new Set(shelfNames).size !== shelfNames.length ||
    validatedShelves.some((item) => !libraryIds.has(item.libraryId)) ||
    (value.version === 4 && validatedNotebooks.some((item) => !item.shelfId || !shelfIds.has(item.shelfId))) ||
    (value.version === 4 && validatedShelves.length === 0)
  ) {
    return false
  }
  return true
}

function validateBackup(value: unknown): NotesBackup {
  if (!isNotesBackup(value)) throw new Error('This backup contains invalid, duplicate, or unsupported records.')
  const defaultLibrary = { id: DEFAULT_LIBRARY_ID, name: 'Personal Library', createdAt: value.exportedAt, updatedAt: value.exportedAt }
  const defaultShelf = { id: DEFAULT_SHELF_ID, libraryId: DEFAULT_LIBRARY_ID, name: 'General', createdAt: value.exportedAt, updatedAt: value.exportedAt }
  const libraries = value.version === 4 ? value.libraries : [defaultLibrary]
  const shelves = value.version === 4 ? value.shelves : [defaultShelf]
  const shelfIdByNotebook = new Map(
    value.notebooks.map((notebook) => [
      notebook.id,
      value.version === 4 ? notebook.shelfId ?? DEFAULT_SHELF_ID : DEFAULT_SHELF_ID,
    ]),
  )
  const normalizedNotebooks = value.notebooks.map((notebook) => ({
    ...notebook,
    shelfId: shelfIdByNotebook.get(notebook.id) ?? DEFAULT_SHELF_ID,
  }))
  return {
    ...value,
    version: 4,
    libraries,
    shelves: shelves.length ? shelves : [defaultShelf],
    notebooks: normalizedNotebooks,
    attachments: value.version === 1 ? [] : value.attachments,
    links: value.version === 1 || value.version === 2 ? [] : value.links,
  }
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
  if (file.size > MAX_BACKUP_SIZE_BYTES) throw new Error('Backup files must be 40 MiB or smaller.')
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  const backup = validateBackup(parsed)
  const db = await database
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
      throw new Error('A backup shelf refers to a library that could not be restored.')
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
    throw new Error('A default shelf is not available for imported notebooks.')
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
    throw new Error('A notebook is not available for imported notes.')
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
  await refreshTags(transaction.objectStore('notes'), transaction.objectStore('tags'))
  await transaction.done
  announceChange()
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
