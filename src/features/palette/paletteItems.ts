import { findTemplates } from '../../lib/templates'
import type { View } from '../../state/workspaceStore'
import type { Library, Note, Notebook, SavedSearch, Shelf, Tag, ThemeChoice } from '../../types'
import type { PaletteItem } from './paletteSearch'
import { t } from '../../i18n/i18n'

export const RECENT_NOTE_COUNT = 8

export interface PaletteSources {
  notes: readonly Note[]
  libraries: readonly Library[]
  shelves: readonly Shelf[]
  notebooks: readonly Notebook[]
  tags: readonly Tag[]
  savedSearches: readonly SavedSearch[]
  theme: ThemeChoice
  /** Undefined on compact screens, where the sidebar is a drawer rather than collapsible. */
  sidebarCollapsed: boolean | undefined
}

export interface PaletteHandlers {
  newNote: () => void
  openSettings: () => void
  setTheme: (theme: ThemeChoice) => void
  toggleSidebar: () => void
  goTo: (view: View) => void
  runSearch: (query: string) => void
  openNote: (note: Note) => void
  openToday: () => void
  newFromTemplate: (template: Note) => void
  createTemplate: () => void
  quickCapture: () => void
}

/** Every action, place, and note the palette can find, plus the newest notes for an empty query. */
export function buildPaletteItems(sources: PaletteSources, handlers: PaletteHandlers): { items: PaletteItem[]; recent: PaletteItem[] } {
  const { notes, libraries, shelves, notebooks, tags, savedSearches, theme, sidebarCollapsed } = sources
  const libraryName = new Map(libraries.map((library) => [library.id, library.name]))
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]))
  const notebookName = new Map(notebooks.map((notebook) => [notebook.id, notebook.name]))

  const actions: PaletteItem[] = [
    { id: 'action:new-note', group: 'Actions', label: t('New note'), keywords: 'create add write', run: handlers.newNote },
    { id: 'action:quick', group: 'Actions', label: t('Quick note'), keywords: 'capture jot inbox fast idea', run: handlers.quickCapture },
    { id: 'action:today', group: 'Actions', label: t('Open today’s note'), keywords: 'daily journal diary date log', run: handlers.openToday },
    { id: 'action:settings', group: 'Actions', label: t('Open settings'), keywords: 'preferences backup export import restore storage', run: handlers.openSettings },
  ]
  const templates = findTemplates(notes, notebooks)
  for (const template of templates) {
    actions.push({
      id: `action:template-${template.id}`,
      group: 'Actions',
      label: t('New note from template: {title}', { title: template.title.trim() || t('Untitled note') }),
      keywords: 'template create add',
      run: () => handlers.newFromTemplate(template),
    })
  }
  if (!templates.length) {
    actions.push({ id: 'action:create-template', group: 'Actions', label: t('Create a template'), keywords: 'template new note from', run: handlers.createTemplate })
  }
  for (const [value, label] of [['light', t('Use light theme')], ['paper', t('Use soft paper theme')], ['dark', t('Use dark theme')], ['system', t('Use system theme')]] as const) {
    if (value !== theme) actions.push({ id: `action:theme-${value}`, group: 'Actions', label, keywords: 'appearance colour color mode', keepsEditor: true, run: () => handlers.setTheme(value) })
  }
  if (sidebarCollapsed !== undefined) {
    actions.push({
      id: 'action:sidebar',
      group: 'Actions',
      label: sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar'),
      keywords: 'navigation panel hide show toggle',
      keepsEditor: true,
      run: handlers.toggleSidebar,
    })
  }

  const place = (id: string, label: string, view: View, detail?: string, keywords?: string): PaletteItem =>
    ({ id: `place:${id}`, group: 'Places', label, detail, keywords, run: () => handlers.goTo(view) })
  const places: PaletteItem[] = [
    place('all', t('All Notes'), 'all', undefined, 'everything home'),
    place('favorites', t('Favorites'), 'favorites', undefined, 'starred hearts'),
    place('trash', t('Trash'), 'trash', undefined, 'deleted bin restore'),
    place('graph', t('Note map'), 'graph', undefined, 'graph links backlinks mentions relationships'),
    ...libraries.map((library) => place(`library:${library.id}`, library.name, `library:${library.id}`, t('Library'))),
    ...shelves.map((shelf) => place(`shelf:${shelf.id}`, shelf.name, `shelf:${shelf.id}`, t('Shelf in {library}', { library: libraryName.get(shelf.libraryId) ?? t('a library') }))),
    ...notebooks.map((notebook) => {
      const shelf = notebook.shelfId ? shelfById.get(notebook.shelfId) : undefined
      return place(`notebook:${notebook.id}`, notebook.name, `notebook:${notebook.id}`, shelf ? t('Notebook on {shelf}', { shelf: shelf.name }) : t('Notebook'))
    }),
    ...tags.map((tag) => place(`tag:${tag.id}`, `#${tag.label}`, `tag:${tag.id}`, t('Tag'), tag.label)),
    ...savedSearches.map((search): PaletteItem => ({
      id: `search:${search.id}`,
      group: 'Places',
      label: search.name,
      detail: t('Saved search'),
      keywords: `${search.query} saved search`,
      run: () => handlers.runSearch(search.query),
    })),
  ]

  const noteItem = (note: Note): PaletteItem => ({
    id: `note:${note.id}`,
    group: 'Notes',
    label: note.title.trim() || t('Untitled note'),
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
