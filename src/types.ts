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
  shelfId?: string
}

export interface Library {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface Shelf {
  id: string
  libraryId: string
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

/**
 * The theme a person picks: the three stored preferences, or soft paper. Soft paper is stored as
 * `theme: 'light'` with `paper: true`, so backups stay readable by versions without it.
 */
export type ThemeChoice = ThemePreference | 'paper'

/** How the Markdown editor shows text: formatted outside the line being edited, or as typed. */
export type EditorMode = 'live' | 'source'

/** A search kept by name, shown in the sidebar and the command palette. */
export interface SavedSearch {
  id: string
  name: string
  /** The search as typed, operators and all. */
  query: string
}

export interface AppSettings {
  id: 'preferences'
  theme: ThemePreference
  /** With the light theme, use soft paper colours instead. Absent means plain light. */
  paper?: boolean
  /** Absent in libraries from before live preview, which means 'live'. */
  editorMode?: EditorMode
  /** Absent until a search is first saved. */
  savedSearches?: SavedSearch[]
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
