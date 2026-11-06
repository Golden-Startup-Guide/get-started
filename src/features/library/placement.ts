import { isCoreId } from '../../lib/core'
import type { Notebook, Shelf } from '../../types'
import type { View } from '../../state/workspaceStore'

const STARTER_LIBRARY_ID = 'starter-library'

/** Whether a view is a handbook library, shelf, or notebook. */
export const isHandbookView = (view: View) => !view.startsWith('tag:') && view.includes(':') && isCoreId(view.slice(view.indexOf(':') + 1))

/** The shelf a notebook created from the current view should go on. */
export function shelfForNewNotebook(view: View, notebooks: Notebook[], shelves: Shelf[]): string | undefined {
  if (isHandbookView(view)) return shelfForNewNotebook('all', notebooks, shelves)
  if (view.startsWith('shelf:')) return view.slice(6)
  const currentNotebook = view.startsWith('notebook:') ? notebooks.find((notebook) => notebook.id === view.slice(9)) : undefined
  if (currentNotebook?.shelfId) return currentNotebook.shelfId
  const libraryId = view.startsWith('library:') ? view.slice(8) : STARTER_LIBRARY_ID
  return shelves.find((shelf) => shelf.libraryId === libraryId)?.id
}

/** The notebook a note created from the current view should go in; always an existing one. */
export function notebookForNewNote(view: View, notebooks: Notebook[], shelves: Shelf[]): string | undefined {
  // Handbooks are read-only: a note started from one goes where a note from All Notes would.
  if (isHandbookView(view)) return notebookForNewNote('all', notebooks, shelves)
  if (view.startsWith('notebook:')) return view.slice(9)
  const libraryId = view.startsWith('shelf:')
    ? shelves.find((shelf) => shelf.id === view.slice(6))?.libraryId ?? STARTER_LIBRARY_ID
    : view.startsWith('library:')
      ? view.slice(8)
      : STARTER_LIBRARY_ID
  const shelfId = view.startsWith('shelf:') ? view.slice(6) : shelves.find((shelf) => shelf.libraryId === libraryId)?.id
  return notebooks.find((notebook) => notebook.shelfId === shelfId)?.id
    ?? notebooks.find((notebook) => shelves.some((shelf) => shelf.id === notebook.shelfId && shelf.libraryId === libraryId))?.id
    ?? notebooks.find((notebook) => notebook.id === 'starter-personal')?.id
    ?? notebooks[0]?.id
}
