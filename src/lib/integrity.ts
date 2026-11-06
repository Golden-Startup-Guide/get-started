import type { Library, Note, Notebook, NoteLink, Shelf, Tag } from '../types'
import { isCoreId } from './core'
import { cleanTags, findOrphans, repairLibrary, type LibraryProblems, type LibraryRepairs } from './notes'
import { t, tp } from '../i18n/i18n'

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
    // A link to a handbook note is kept: handbooks ship with the app rather than being stored.
    links: library.links.filter((link) => !noteIds.has(link.sourceNoteId) || !(noteIds.has(link.targetNoteId) || isCoreId(link.targetNoteId))),
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
  const phrases: string[] = []
  if (repairs.linksRemoved) phrases.push(tp(repairs.linksRemoved, 'removed {count} link to notes that no longer exist', 'removed {count} links to notes that no longer exist'))
  if (repairs.attachmentsRemoved) phrases.push(tp(repairs.attachmentsRemoved, 'removed {count} attachment left behind by deleted notes', 'removed {count} attachments left behind by deleted notes'))
  if (repairs.historyRemoved) phrases.push(tp(repairs.historyRemoved, 'removed {count} history entry left behind by deleted notes', 'removed {count} history entries left behind by deleted notes'))
  if (repairs.notesMoved) phrases.push(tp(repairs.notesMoved, 'moved {count} note whose notebook was missing to “{name}”', 'moved {count} notes whose notebook was missing to “{name}”', { name: repairs.notebookName ?? '' }))
  if (repairs.notebooksMoved) phrases.push(tp(repairs.notebooksMoved, 'moved {count} notebook whose shelf was missing to “{name}”', 'moved {count} notebooks whose shelf was missing to “{name}”', { name: repairs.shelfName ?? '' }))
  if (repairs.shelvesMoved) phrases.push(tp(repairs.shelvesMoved, 'moved {count} shelf whose library was missing to “{name}”', 'moved {count} shelves whose library was missing to “{name}”', { name: repairs.libraryName ?? '' }))
  if (repairs.tagsRebuilt) phrases.push(t('rebuilt the tag list'))
  return phrases
}
