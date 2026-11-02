import type { View } from '../../state/workspaceStore'
import type { Library, Note, Notebook, Shelf, Tag, ThemePreference } from '../../types'
import type { PaletteItem } from './paletteSearch'

export const RECENT_NOTE_COUNT = 8

export interface PaletteSources {
  notes: readonly Note[]
  libraries: readonly Library[]
  shelves: readonly Shelf[]
  notebooks: readonly Notebook[]
  tags: readonly Tag[]
  theme: ThemePreference
  /** Undefined on compact screens, where the sidebar is a drawer rather than collapsible. */
  sidebarCollapsed: boolean | undefined
}

export interface PaletteHandlers {
  newNote: () => void
  openSettings: () => void
  setTheme: (theme: ThemePreference) => void
  toggleSidebar: () => void
  goTo: (view: View) => void
  openNote: (note: Note) => void
}

/** Every action, place, and note the palette can find, plus the newest notes for an empty query. */
export function buildPaletteItems(sources: PaletteSources, handlers: PaletteHandlers): { items: PaletteItem[]; recent: PaletteItem[] } {
  const { notes, libraries, shelves, notebooks, tags, theme, sidebarCollapsed } = sources
  const libraryName = new Map(libraries.map((library) => [library.id, library.name]))
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]))
  const notebookName = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]))

  const actions: PaletteItem[] = [
    { id: 'action:new-note', group: 'Actions', label: 'New note', keywords: 'create add write', run: handlers.newNote },
    { id: 'action:settings', group: 'Actions', label: 'Open settings', keywords: 'preferences backup export import restore storage', run: handlers.openSettings },
  ]
  for (const [value, label] of [['light', 'Use light theme'], ['dark', 'Use dark theme'], ['system', 'Use system theme']] as const) {
    if (value !== theme) actions.push({ id: `action:theme-${value}`, group: 'Actions', label, keywords: 'appearance colour color mode', run: () => handlers.setTheme(value) })
  }
  if (sidebarCollapsed !== undefined) {
    actions.push({
      id: 'action:sidebar',
      group: 'Actions',
      label: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
      keywords: 'navigation panel hide show toggle',
      run: handlers.toggleSidebar,
    })
  }

  const place = (id: string, label: string, view: View, detail?: string, keywords?: string): PaletteItem =>
    ({ id: `place:${id}`, group: 'Places', label, detail, keywords, run: () => handlers.goTo(view) })
  const places: PaletteItem[] = [
    place('all', 'All Notes', 'all', undefined, 'everything home'),
    place('favorites', 'Favorites', 'favorites', undefined, 'starred hearts'),
    place('trash', 'Trash', 'trash', undefined, 'deleted bin restore'),
    place('graph', 'Knowledge Graph', 'graph', undefined, 'links backlinks relationships'),
    ...libraries.map((library) => place(`library:${library.id}`, library.name, `library:${library.id}`, 'Library')),
    ...shelves.map((shelf) => place(`shelf:${shelf.id}`, shelf.name, `shelf:${shelf.id}`, `Shelf in ${libraryName.get(shelf.libraryId) ?? 'a library'}`)),
    ...notebooks.map((notebook) => {
      const shelf = notebook.shelfId ? shelfById.get(notebook.shelfId) : undefined
      return place(`notebook:${notebook.id}`, notebook.name, `notebook:${notebook.id}`, shelf ? `Notebook on ${shelf.name}` : 'Notebook')
    }),
    ...tags.map((tag) => place(`tag:${tag.id}`, `#${tag.label}`, `tag:${tag.id}`, 'Tag', tag.label)),
  ]

  const noteItem = (note: Note): PaletteItem => ({
    id: `note:${note.id}`,
    group: 'Notes',
    label: note.title.trim() || 'Untitled note',
    detail: notebookName.get(note.notebookId ?? ''),
    run: () => handlers.openNote(note),
  })
  const noteItems = notes.map(noteItem)

  // The newest few, without sorting the whole library.
  const recentNotes: Note[] = []
  for (const note of notes) {
    if (recentNotes.length < RECENT_NOTE_COUNT) recentNotes.push(note)
    else if (note.updatedAt > recentNotes[recentNotes.length - 1].updatedAt) recentNotes[recentNotes.length - 1] = note
    else continue
    recentNotes.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  const itemById = new Map(noteItems.map((item) => [item.id, item]))
  const recent = recentNotes.map((note) => itemById.get(`note:${note.id}`)!)

  return { items: [...actions, ...places, ...noteItems], recent }
}
