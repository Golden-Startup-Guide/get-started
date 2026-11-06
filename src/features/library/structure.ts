import { useMemo } from 'react'
import { isCoreId } from '../../lib/core'
import { CORE_CATALOG, useCoreStore } from '../../state/coreStore'
import { useLibraryStore } from '../../state/libraryStore'
import type { CoreNote, Library, Note, Notebook, Shelf } from '../../types'

/** A library, shelf, or notebook's one-sentence description; handbooks have one, personal ones not. */
export const descriptionOf = (item: Library | Shelf | Notebook | undefined) => (item as { description?: string } | undefined)?.description

/**
 * The handbooks and the personal library as one structure, for the library, shelf, and notebook
 * pages: what each holds, in reading order. Handbook notes keep their notebook order; personal
 * notes come most recently changed first.
 */
export function useStructure() {
  const libraries = useLibraryStore((state) => state.libraries)
  const shelves = useLibraryStore((state) => state.shelves)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const notes = useLibraryStore((state) => state.notes)
  const coreNotes = useCoreStore((state) => state.notes)
  const coreLoaded = useCoreStore((state) => state.loaded)

  return useMemo(() => {
    const allLibraries: Library[] = [...CORE_CATALOG.libraries, ...libraries]
    const allShelves: Shelf[] = [...CORE_CATALOG.shelves, ...shelves]
    const allNotebooks: Notebook[] = [...CORE_CATALOG.notebooks, ...notebooks]
    const notesByNotebook = new Map<string, Note[]>()
    const add = (note: Note) => {
      const list = notesByNotebook.get(note.notebookId ?? '')
      if (list) list.push(note)
      else notesByNotebook.set(note.notebookId ?? '', [note])
    }
    coreNotes.forEach(add)
    ;[...notes].sort((a, b) => b.updatedAt - a.updatedAt).forEach(add)

    const shelvesOf = (libraryId: string) => allShelves.filter((shelf) => shelf.libraryId === libraryId)
    const notebooksOf = (shelfId: string) => allNotebooks.filter((notebook) => notebook.shelfId === shelfId)
    const notesOf = (notebookId: string) => notesByNotebook.get(notebookId) ?? []
    const notesOfShelf = (shelfId: string) => notebooksOf(shelfId).flatMap((notebook) => notesOf(notebook.id))
    const notesOfLibrary = (libraryId: string) => shelvesOf(libraryId).flatMap((shelf) => notesOfShelf(shelf.id))
    /** When a note was added: a handbook note's date, or when a personal note was created. */
    const addedAt = (note: Note) => (isCoreId(note.id) ? Date.parse((note as CoreNote).added) : note.createdAt)
    return {
      libraries: allLibraries,
      shelves: allShelves,
      notebooks: allNotebooks,
      shelvesOf,
      notebooksOf,
      notesOf,
      notesOfShelf,
      notesOfLibrary,
      addedAt,
      /** Handbook notes load after start-up; until then their counts are unknown. */
      coreLoaded,
    }
  }, [libraries, shelves, notebooks, notes, coreNotes, coreLoaded])
}
