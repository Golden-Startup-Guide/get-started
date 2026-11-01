import { useMemo } from 'react'
import { useLibraryStore } from '../../state/libraryStore'

export interface NoteCounts {
  byNotebook: Map<string, number>
  byShelf: Map<string, number>
  byLibrary: Map<string, number>
  favorites: number
}

/**
 * Note counts for every notebook, shelf, and library, from one pass over the notes.
 *
 * Counting per item filtered every note for each shelf and notebook (a shelf also checked every
 * notebook per note): about 80 million operations at 100,000 notes, repeated on every render
 * of the sidebar, including when a note opened.
 */
export function useNoteCounts(): NoteCounts {
  const notes = useLibraryStore((state) => state.notes)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const shelves = useLibraryStore((state) => state.shelves)
  return useMemo(() => {
    const byNotebook = new Map<string, number>()
    let favorites = 0
    for (const note of notes) {
      const notebookId = note.notebookId ?? ''
      byNotebook.set(notebookId, (byNotebook.get(notebookId) ?? 0) + 1)
      if (note.favorite) favorites += 1
    }
    const byShelf = new Map<string, number>()
    for (const notebook of notebooks) {
      if (!notebook.shelfId) continue
      byShelf.set(notebook.shelfId, (byShelf.get(notebook.shelfId) ?? 0) + (byNotebook.get(notebook.id) ?? 0))
    }
    const byLibrary = new Map<string, number>()
    for (const shelf of shelves) {
      byLibrary.set(shelf.libraryId, (byLibrary.get(shelf.libraryId) ?? 0) + (byShelf.get(shelf.id) ?? 0))
    }
    return { byNotebook, byShelf, byLibrary, favorites }
  }, [notes, notebooks, shelves])
}
