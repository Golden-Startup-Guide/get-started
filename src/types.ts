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
  /** How handbook notes are shown in the reading room. Absent means the defaults. */
  reader?: ReaderSettings
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

/**
 * Built-in handbook content: curated, shipped with the app, readable offline, and never edited in
 * place or stored in the database. Written in content/ and compiled by scripts/coreContent.ts.
 */
export type CoreNoteType = 'Article' | 'Guide' | 'Chapter' | 'Handbook'

export interface CoreLibrary extends Library {
  source: 'core'
  description: string
  order: number
}

export interface CoreShelf extends Shelf {
  source: 'core'
  description: string
  order: number
}

export interface CoreNotebook extends Notebook {
  source: 'core'
  shelfId: string
  description: string
  order: number
}

export interface CoreNote extends Note {
  source: 'core'
  notebookId: string
  summary: string
  type: CoreNoteType
  /** Position in its notebook. */
  order: number
  /** The day it was added, YYYY-MM-DD. */
  added: string
  /** Not final yet; labelled Draft. */
  draft?: boolean
  /** Who reviewed it and when, for health and money guidance. */
  reviewed?: string
}

/** Everything about the handbooks except the notes' text, which loads per library. */
export interface CoreCatalog {
  /** Changes whenever any handbook file changes. */
  version: string
  libraries: CoreLibrary[]
  shelves: CoreShelf[]
  notebooks: CoreNotebook[]
}

/** A note the reader opened: kept for "Continue reading" (src/lib/notes.ts, the reading store). */
export interface ReadingRecord {
  noteId: string
  openedAt: number
  /** How far through the note the reader was, from 0 to 1, once saved. */
  position?: number
}

/** The reading room's text: size, style, line spacing, and line length (src/features/notes/ReaderControls.tsx). */
export interface ReaderSettings {
  size: 'small' | 'medium' | 'large' | 'larger'
  /** Classic is a serif for long reading; simple is the interface's sans-serif. */
  font: 'classic' | 'simple'
  spacing: 'normal' | 'roomy'
  width: 'narrow' | 'medium' | 'wide'
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = { size: 'medium', font: 'classic', spacing: 'normal', width: 'medium' }
