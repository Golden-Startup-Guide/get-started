import { openDB, type DBSchema, type IDBPDatabase, type IDBPObjectStore } from 'idb'
import type {
  AppSettings,
  Note,
  NoteAttachment,
  NoteLink,
  Notebook,
  NoteHistoryEntry,
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

const database = openDB<NotesDatabase>('my-notes', 5, {
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

async function refreshTags<
  StoreNames extends ArrayLike<'notes' | 'notebooks' | 'settings' | 'tags' | 'history' | 'attachments' | 'noteLinks'>,
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
}

export async function unlinkNotes(sourceNoteId: string, targetNoteId: string): Promise<void> {
  const db = await database
  await db.delete('noteLinks', [sourceNoteId, targetNoteId])
}

export async function getTrash(): Promise<Note[]> {
  const db = await database
  return (await db.getAll('notes'))
    .filter((note) => note.deletedAt !== undefined)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export async function saveNote(input: Note): Promise<void> {
  const note = normalizeNote(input)
  const db = await database
  const transaction = db.transaction(['notes', 'tags', 'history'], 'readwrite')
  const existing = await transaction.objectStore('notes').get(note.id)
  if (existing && (existing.title !== note.title || existing.content !== note.content)) {
    await transaction.objectStore('history').put({
      id: crypto.randomUUID(),
      noteId: existing.id,
      savedAt: Date.now(),
      snapshot: existing,
    })
  }
  await transaction.objectStore('notes').put(note)
  await refreshTags(transaction.objectStore('notes'), transaction.objectStore('tags'))
  await transaction.done
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

export async function createNotebook(name: string): Promise<Notebook> {
  const cleaned = name.trim()
  if (!cleaned) throw new Error('Notebook name cannot be empty.')
  const db = await database
  const transaction = db.transaction('notebooks', 'readwrite')
  const notebooks = await transaction.store.getAll()
  if (notebooks.some((notebook) => notebook.name.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    await transaction.done
    throw new Error('A notebook with that name already exists.')
  }
  const now = Date.now()
  const notebook = { id: crypto.randomUUID(), name: cleaned, createdAt: now, updatedAt: now }
  await transaction.store.add(notebook)
  await transaction.done
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
  const historyStore = transaction.objectStore('history')
  for (const note of notes) {
    await noteStore.put({ ...note, notebookId: destinationId, updatedAt: Date.now() })
    const revisions = await historyStore.index('by-note').getAll(note.id)
    for (const revision of revisions) {
      if (revision.snapshot.notebookId === id) {
        await historyStore.put({
          ...revision,
          snapshot: { ...revision.snapshot, notebookId: destinationId },
        })
      }
    }
  }
  await notebooks.delete(id)
  await transaction.done
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

export async function restoreHistory(revisionId: string): Promise<void> {
  const db = await database
  const revision = await db.get('history', revisionId)
  if (!revision) throw new Error('History revision not found.')
  const current = await db.get('notes', revision.noteId)
  if (!current) throw new Error('The note for this revision no longer exists.')
  await saveNote({
    ...revision.snapshot,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
    ...(current.deletedAt !== undefined ? { deletedAt: current.deletedAt } : {}),
  })
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

interface AttachmentBackup extends Omit<NoteAttachment, 'blob'> {
  data: string
}

export interface NotesBackup {
  format: 'my-notes-backup'
  version: 3
  exportedAt: number
  notes: Note[]
  notebooks: Notebook[]
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

export async function exportBackup(): Promise<NotesBackup> {
  const db = await database
  const [notes, notebooks, tags, settings, history, attachments, links] = await Promise.all([
    db.getAll('notes'),
    db.getAll('notebooks'),
    db.getAll('tags'),
    getSettings(),
    db.getAll('history'),
    db.getAll('attachments'),
    db.getAll('noteLinks'),
  ])
  const backupAttachments = attachments.map(({ data, ...attachment }) => ({
    ...attachment,
    data: bytesToBase64(new Uint8Array(data)),
  }))
  const backup: NotesBackup = {
    format: 'my-notes-backup',
    version: 3,
    exportedAt: Date.now(),
    notes,
    notebooks,
    tags,
    settings,
    history,
    attachments: backupAttachments,
    links,
  }
  if (new Blob([JSON.stringify(backup, null, 2)]).size > MAX_BACKUP_SIZE_BYTES) {
    throw new Error('This backup exceeds 40 MiB. Remove some attachments and try again.')
  }
  return backup
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

function isNotesBackup(value: unknown): value is NotesBackup | VersionTwoNotesBackup | LegacyNotesBackup {
  if (
    !isRecord(value) ||
    value.format !== 'my-notes-backup' ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    !Number.isFinite(value.exportedAt) ||
    !Array.isArray(value.notes) ||
    !Array.isArray(value.notebooks) ||
    !Array.isArray(value.tags) ||
    !Array.isArray(value.history) ||
    (value.version >= 2 && !Array.isArray(value.attachments)) ||
    (value.version === 3 && !Array.isArray(value.links)) ||
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
  const links: unknown[] = value.version === 3 && Array.isArray(value.links) ? value.links : []
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
    !links.every(validNoteLink) ||
    new Set(links.map((link) =>
      isRecord(link) ? JSON.stringify([link.sourceNoteId, link.targetNoteId]) : '',
    )).size !== links.length
  ) {
    return false
  }
  const validatedNotebooks = notebooks.filter(validNotebook)
  const validatedNotes = notes.filter(validNote)
  const validatedHistory = history.filter(validHistory)
  const validatedAttachments = attachments.filter(validAttachmentBackup)
  const notebookIds = new Set(validatedNotebooks.map((item) => item.id))
  const notebookNames = validatedNotebooks.map((item) => item.name.toLocaleLowerCase())
  const noteIds = new Set(validatedNotes.map((item) => item.id))
  const attachmentCounts = new Map<string, { count: number; bytes: number }>()
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
    validatedNotes.some(
      (item) => item.notebookId && !notebookIds.has(item.notebookId),
    ) ||
    validatedHistory.some((entry) => {
      return (
        !validatedNotes.some((note) => note.id === entry.noteId) ||
        (entry.snapshot.notebookId !== undefined && !notebookIds.has(entry.snapshot.notebookId))
      )
    })
  ) {
    return false
  }
  return true
}

function validateBackup(value: unknown): NotesBackup {
  if (!isNotesBackup(value)) throw new Error('This backup contains invalid, duplicate, or unsupported records.')
  if (value.version === 1) {
    return {
      ...value,
      version: 3,
      attachments: [],
      links: [],
    }
  }
  if (value.version === 2) {
    return {
      ...value,
      version: 3,
      links: [],
    }
  }
  return value
}

export interface ImportSummary {
  notesAdded: number
  notesSkipped: number
  notebooksAdded: number
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
  const transaction = db.transaction(['notes', 'notebooks', 'settings', 'tags', 'history', 'attachments', 'noteLinks'], 'readwrite')
  const noteStore = transaction.objectStore('notes')
  const notebookStore = transaction.objectStore('notebooks')
  const historyStore = transaction.objectStore('history')
  const attachmentStore = transaction.objectStore('attachments')
  const linkStore = transaction.objectStore('noteLinks')
  const currentNotes = await noteStore.getAll()
  const currentNotebooks = await notebookStore.getAll()
  const noteIds = new Set(currentNotes.map((note) => note.id))
  const notebookById = new Map(currentNotebooks.map((notebook) => [notebook.id, notebook]))
  const notebookByName = new Map(currentNotebooks.map((notebook) => [notebook.name.toLocaleLowerCase(), notebook]))
  const notebookIdMap = new Map<string, string>()
  let notebooksAdded = 0

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
    await notebookStore.add({ ...imported, id })
    notebookById.set(id, { ...imported, id })
    notebookByName.set(imported.name.toLocaleLowerCase(), { ...imported, id })
    notebooksAdded += 1
  }

  let notesAdded = 0
  let notesSkipped = 0
  const acceptedNoteIds = new Set<string>()
  for (const imported of backup.notes) {
    if (noteIds.has(imported.id)) {
      notesSkipped += 1
      continue
    }
    const notebookId = imported.notebookId
      ? notebookIdMap.get(imported.notebookId)
      : notebookIdMap.get('starter-personal') ?? currentNotebooks[0]?.id
    if (!notebookId) {
      transaction.abort()
      throw new Error('A backup note refers to a notebook that could not be restored.')
    }
    const note = normalizeNote({ ...imported, notebookId })
    await noteStore.put(note)
    noteIds.add(note.id)
    acceptedNoteIds.add(note.id)
    notesAdded += 1
  }

  let historyAdded = 0
  for (const imported of backup.history) {
    if (!acceptedNoteIds.has(imported.noteId)) continue
    const snapshot = imported.snapshot
    const originalNotebookId =
      snapshot.notebookId ?? backup.notes.find((note) => note.id === imported.noteId)?.notebookId
    const snapshotNotebookId = originalNotebookId
      ? notebookIdMap.get(originalNotebookId) ??
        ((await notebookStore.get(originalNotebookId)) ? originalNotebookId : undefined)
      : notebookIdMap.get('starter-personal') ?? currentNotebooks[0]?.id
    if (!snapshotNotebookId) {
      transaction.abort()
      throw new Error('A history entry refers to a notebook that could not be restored.')
    }
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
  return {
    notesAdded,
    notesSkipped,
    notebooksAdded,
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
