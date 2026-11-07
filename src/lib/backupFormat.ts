// The JSON backup file format: types, Base64 encoding, and validation. Pure functions with
// no database access, so they can be tested and reused without opening IndexedDB.
import type {
  AppSettings,
  Library,
  Note,
  NoteAttachment,
  Notebook,
  NoteHistoryEntry,
  NoteLink,
  Shelf,
  Tag,
} from '../types'
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_NOTE_ATTACHMENT_BYTES,
} from '../features/notes/attachments'
import { MAX_SAVED_SEARCHES, validSavedSearch } from './savedSearches'
import { t } from '../i18n/i18n'

export const DEFAULT_LIBRARY_ID = 'starter-library'
export const DEFAULT_SHELF_ID = 'starter-shelf'

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

export interface AttachmentBackup extends Omit<NoteAttachment, 'blob'> {
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

export function bytesToBase64(bytes: Uint8Array): string {
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

export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
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

const READER_CHOICES = {
  size: ['small', 'medium', 'large', 'larger'],
  font: ['classic', 'simple'],
  spacing: ['normal', 'roomy'],
  width: ['narrow', 'medium', 'wide'],
} as const

function validReaderSettings(value: unknown): boolean {
  return isRecord(value) && Object.entries(READER_CHOICES).every(([key, choices]) => (choices as readonly string[]).includes(String(value[key])))
}

function validSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    value.id === 'preferences' &&
    ['light', 'dark', 'system'].includes(String(value.theme)) &&
    (value.paper === undefined || typeof value.paper === 'boolean') &&
    (value.reader === undefined || validReaderSettings(value.reader)) &&
    (value.editorMode === undefined || value.editorMode === 'live' || value.editorMode === 'source') &&
    (value.savedSearches === undefined ||
      (Array.isArray(value.savedSearches) && value.savedSearches.length <= MAX_SAVED_SEARCHES && value.savedSearches.every(validSavedSearch)))
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

export function validateBackup(value: unknown): NotesBackup {
  if (!isNotesBackup(value)) throw new Error(t("This backup contains invalid, duplicate, or unsupported records."))
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
