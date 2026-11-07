import { create } from 'zustand'
import {
  getAllNoteLinks,
  getLibraries,
  getNoteIdsWithAttachments,
  getNotebooks,
  getNotes,
  getSettings,
  getShelves,
  getTags,
  getTrash,
} from '../lib/notes'
import { sortNotes } from '../features/notes/noteDisplay'
import type { AppSettings, EditorMode, Library, Note, Notebook, NoteLink, SavedSearch, Shelf, Tag, ThemeChoice, ReaderSettings } from '../types'
import { themeSettings } from '../lib/theme'

interface LibraryState {
  notes: Note[]
  trash: Note[]
  notebooks: Notebook[]
  libraries: Library[]
  shelves: Shelf[]
  tags: Tag[]
  links: NoteLink[]
  /** IDs of notes with attachments, for searching with has:attachment. */
  attachedNoteIds: ReadonlySet<string>
  settings: AppSettings
  /** True until the first load from storage has finished (or failed). */
  isLoading: boolean
  /** Reloads every list from storage. */
  refresh: () => Promise<void>
  /** Marks the first load as finished. */
  finishLoading: () => void
  /** Updates the note lists after the editor saved a note, without reloading everything. */
  noteSaved: (note: Note) => Promise<void>
  setTheme: (theme: ThemeChoice) => void
  setReader: (reader: ReaderSettings) => void
  setEditorMode: (mode: EditorMode) => void
  setSavedSearches: (savedSearches: SavedSearch[]) => void
}

// The single in-memory copy of the library. Storage (src/lib/notes.ts) stays the source of
// truth; actions write there first, then update or refresh this store.
export const useLibraryStore = create<LibraryState>()((set) => ({
  notes: [],
  trash: [],
  notebooks: [],
  libraries: [],
  shelves: [],
  tags: [],
  links: [],
  attachedNoteIds: new Set(),
  settings: { id: 'preferences', theme: 'system' },
  isLoading: true,
  refresh: async () => {
    const [notes, trash, notebooks, libraries, shelves, tags, settings, links, attachedNoteIds] = await Promise.all([
      getNotes(),
      getTrash(),
      getNotebooks(),
      getLibraries(),
      getShelves(),
      getTags(),
      getSettings(),
      getAllNoteLinks(),
      getNoteIdsWithAttachments(),
    ])
    set({ notes: sortNotes(notes), trash, notebooks, libraries, shelves, tags, settings, links, attachedNoteIds })
  },
  finishLoading: () => set({ isLoading: false }),
  noteSaved: async (note) => {
    set((state) => ({
      notes: note.deletedAt === undefined
        ? sortNotes([note, ...state.notes.filter((item) => item.id !== note.id)])
        : state.notes.filter((item) => item.id !== note.id),
      trash: note.deletedAt === undefined
        ? state.trash
        : [note, ...state.trash.filter((item) => item.id !== note.id)],
    }))
    set({ tags: await getTags() })
  },
  setTheme: (theme) => set((state) => ({ settings: { ...state.settings, ...themeSettings(theme) } })),
  setReader: (reader) => set((state) => ({ settings: { ...state.settings, reader } })),
  setEditorMode: (editorMode) => set((state) => ({ settings: { ...state.settings, editorMode } })),
  setSavedSearches: (savedSearches) => set((state) => ({ settings: { ...state.settings, savedSearches } })),
}))
