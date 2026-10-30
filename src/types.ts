export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  notebookId?: string
  tags?: string[]
  pinned?: boolean
  favorite?: boolean
  deletedAt?: number
}

export interface NoteLink {
  sourceNoteId: string
  targetNoteId: string
}

export interface Notebook {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface Tag {
  id: string
  label: string
  count: number
}

export type ThemePreference = 'light' | 'dark' | 'system'

export interface AppSettings {
  id: 'preferences'
  theme: ThemePreference
}

export interface NoteHistoryEntry {
  id: string
  noteId: string
  savedAt: number
  snapshot: Note
}

export interface NoteAttachment {
  id: string
  noteId: string
  name: string
  type: string
  size: number
  createdAt: number
  blob: Blob
}
