import type { Library, Note, Notebook, NoteLink, Shelf, Tag } from '../types'
import { cleanTags, findOrphans, repairLibrary, type LibraryProblems, type LibraryRepairs } from './notes'

/** What is checked: the library as loaded at start-up. */
export interface LibrarySnapshot {
  notes: readonly Note[]
  trash: readonly Note[]
  notebooks: readonly Notebook[]
  shelves: readonly Shelf[]
  libraries: readonly Library[]
  tags: readonly Tag[]
  links: readonly NoteLink[]
}

/** Attachments and history entries whose note does not exist. */
export interface Orphans {
  attachments: readonly string[]
  history: readonly string[]
}

/** Every note's ID, in Trash or not. */
export const allNoteIds = (library: Pick<LibrarySnapshot, 'notes' | 'trash'>) =>
  new Set([...library.notes, ...library.trash].map((note) => note.id))

/**
 * Finds what is broken: links, attachments, and history entries left behind by notes that no
 * longer exist; notes, notebooks, and shelves whose notebook, shelf, or library is gone; and a
 * tag list that no longer matches the notes. Such damage can come from an interrupted write in
 * an older version, a bug, or an edited backup.
 */
export function findLibraryProblems(library: LibrarySnapshot, orphans: Orphans): LibraryProblems {
  const noteIds = allNoteIds(library)
  const notebookIds = new Set(library.notebooks.map((notebook) => notebook.id))
  const shelfIds = new Set(library.shelves.map((shelf) => shelf.id))
  const libraryIds = new Set(library.libraries.map((item) => item.id))

  const expectedTags = new Map<string, number>()
  for (const note of library.notes) {
    if (note.deletedAt !== undefined) continue
    for (const label of cleanTags(note.tags ?? [])) {
      const id = label.toLocaleLowerCase()
      expectedTags.set(id, (expectedTags.get(id) ?? 0) + 1)
    }
  }
  const tagsOutOfDate = expectedTags.size !== library.tags.length
    || library.tags.some((tag) => expectedTags.get(tag.id) !== tag.count)

  return {
    links: library.links.filter((link) => !noteIds.has(link.sourceNoteId) || !noteIds.has(link.targetNoteId)),
    notesWithoutNotebook: [...library.notes, ...library.trash]
      .filter((note) => !note.notebookId || !notebookIds.has(note.notebookId))
      .map((note) => note.id),
    notebooksWithoutShelf: library.notebooks.filter((notebook) => !notebook.shelfId || !shelfIds.has(notebook.shelfId)).map((notebook) => notebook.id),
    shelvesWithoutLibrary: library.shelves.filter((shelf) => !libraryIds.has(shelf.libraryId)).map((shelf) => shelf.id),
    orphanAttachments: [...orphans.attachments],
    orphanHistory: [...orphans.history],
    tagsOutOfDate,
  }
}

export const hasProblems = (problems: LibraryProblems) =>
  problems.tagsOutOfDate || Object.values(problems).some((value) => Array.isArray(value) && value.length > 0)

/**
 * Checks the library and repairs what is broken. Returns what was repaired, or undefined when
 * nothing needed it.
 */
export async function checkAndRepairLibrary(library: LibrarySnapshot): Promise<LibraryRepairs | undefined> {
  const problems = findLibraryProblems(library, await findOrphans(allNoteIds(library)))
  if (!hasProblems(problems)) return undefined
  const repairs = await repairLibrary(problems)
  return describeRepairs(repairs).length ? repairs : undefined
}

/** One phrase per kind of repair, for the report. */
export function describeRepairs(repairs: LibraryRepairs): string[] {
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`
  const phrases: string[] = []
  if (repairs.linksRemoved) phrases.push(`removed ${count(repairs.linksRemoved, 'link', 'links')} to notes that no longer exist`)
  if (repairs.attachmentsRemoved) phrases.push(`removed ${count(repairs.attachmentsRemoved, 'attachment', 'attachments')} left behind by deleted notes`)
  if (repairs.historyRemoved) phrases.push(`removed ${count(repairs.historyRemoved, 'history entry', 'history entries')} left behind by deleted notes`)
  if (repairs.notesMoved) phrases.push(`moved ${count(repairs.notesMoved, 'note', 'notes')} whose notebook was missing to “${repairs.notebookName}”`)
  if (repairs.notebooksMoved) phrases.push(`moved ${count(repairs.notebooksMoved, 'notebook', 'notebooks')} whose shelf was missing to “${repairs.shelfName}”`)
  if (repairs.shelvesMoved) phrases.push(`moved ${count(repairs.shelvesMoved, 'shelf', 'shelves')} whose library was missing to “${repairs.libraryName}”`)
  if (repairs.tagsRebuilt) phrases.push('rebuilt the tag list')
  return phrases
}
