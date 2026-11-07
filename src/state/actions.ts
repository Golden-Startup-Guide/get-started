// Operations that write to storage and then update one or more stores. Components call these
// instead of talking to src/lib/notes.ts directly, so storage can change behind them.
import {
  createLibrary,
  createNotebook,
  createShelf,
  deleteLibrary,
  deleteSavedSearch,
  deleteNotebook,
  deleteShelf,
  exportBackupFile,
  importBackupFile,
  moveNotebook,
  permanentlyDeleteNote,
  renameLibrary,
  renameNotebook,
  renameShelf,
  restoreNote,
  saveNote,
  saveEditorMode,
  saveSearch,
  saveReaderSettings,
  saveTheme,
  setNoteFlag,
  subscribeToStorage,
  trashNote,
  type BackupOptions,
} from '../lib/notes'
import { findNotebook, SAMPLE_TEMPLATE, TEMPLATES_NOTEBOOK } from '../lib/templates'
import { notesLinkingTo, renameWikilinks } from '../lib/wikilinks'
import { shelfForNewNotebook } from '../features/library/placement'
import type { EditorMode, Library, Note, Notebook, SavedSearch, Shelf, ThemeChoice, ReaderSettings } from '../types'
import { readText } from '../features/backup/backupFolder'
import { checkBackup, describeCheck } from '../lib/backupCheck'
import type { ImportSource } from '../features/transfer/importSources'
import { clipToNote, type LaunchRequest } from '../features/app/launchRequest'
import { useBackupStore } from './backupStore'
import { useEditorStore } from './editorStore'
import { useLibraryStore } from './libraryStore'
import { usePersistenceStore } from './persistenceStore'
import { reportError, useWorkspaceStore, type View } from './workspaceStore'
import { t, tp } from '../i18n/i18n'

export type StructureItem =
  | { kind: 'notebook'; item: Notebook }
  | { kind: 'shelf'; item: Shelf }
  | { kind: 'library'; item: Library }

const workspace = () => useWorkspaceStore.getState()
const library = () => useLibraryStore.getState()

/**
 * Runs a storage operation, then reloads the library. `beforeRefresh` runs as soon as the
 * operation succeeds, so callers can navigate to a newly created item before the reload
 * re-renders the page they are leaving.
 */
async function refreshAfter<T>(
  operation: () => Promise<T>,
  fallback: string,
  beforeRefresh?: (result: T) => void,
): Promise<T | undefined> {
  try {
    const result = await operation()
    beforeRefresh?.(result)
    await library().refresh()
    workspace().showError(null)
    return result
  } catch (reason) {
    reportError(reason, fallback)
    return undefined
  }
}

// --- Loading and other tabs -------------------------------------------------------------

export async function loadLibrary() {
  try {
    await library().refresh()
  } catch {
    workspace().showError(t("Your notes could not be loaded. Please try refreshing."))
  } finally {
    library().finishLoading()
  }
}

/** Keeps this tab in step with other tabs. Returns the function that stops listening. */
export function startStorageSync(): () => void {
  return subscribeToStorage((event) => {
    if (event.type === 'changed') {
      const activeId = useEditorStore.getState().activeNote?.id
      // Writes that change notes always list them; unlisted changes are organization only.
      if (activeId && event.noteIds.includes(activeId)) useEditorStore.getState().markChangedElsewhere()
      library().refresh().catch(() => workspace().showError(t("Changes from another tab could not be loaded. Please refresh.")))
    } else if (event.type === 'blocked') {
      workspace().showError(t("Close other tabs or windows of this app so this one can finish updating your notes."))
    } else if (event.type === 'version-change') {
      workspace().showError(t("The app was updated in another tab. Reload this page to keep working; unsaved changes here cannot be saved."))
    } else {
      workspace().showError(t("The browser closed the connection to your notes. Reload this page to keep working."))
    }
  })
}

// --- Notes ------------------------------------------------------------------------------

/** Saves a note from the editor. Throws on failure so the editor can keep the draft. */
export async function saveEditedNote(note: Note) {
  await saveNote(note)
  await library().noteSaved(note)
  workspace().showError(null)
  usePersistenceStore.getState().requestAfterSave()
}

/** Moves a note to Trash, or deletes it permanently if it is already there. */
export async function deleteOpenNote(note: Note): Promise<boolean> {
  try {
    if (note.deletedAt === undefined) await trashNote(note.id)
    else await permanentlyDeleteNote(note.id)
    useEditorStore.getState().close()
    await library().refresh()
    return true
  } catch {
    workspace().showError(t("Your note could not be deleted. Please try again."))
    return false
  }
}

export async function toggleNoteFlag(note: Note, flag: 'pinned' | 'favorite') {
  try {
    await setNoteFlag(note.id, flag, !note[flag])
    await library().refresh()
  } catch (reason) {
    reportError(reason, t("The note could not be updated."))
  }
}

export async function restoreFromTrash(note: Note) {
  try {
    await restoreNote(note.id)
    await library().refresh()
    workspace().showNotice(t('“{title}” was restored.', { title: note.title || t('Untitled note') }))
    workspace().showError(null)
  } catch (reason) {
    reportError(reason, t("The note could not be restored."))
  }
}

export async function deleteForever(note: Note) {
  try {
    await permanentlyDeleteNote(note.id)
    await library().refresh()
    workspace().showNotice(t("The note was permanently deleted."))
    workspace().showError(null)
  } catch {
    workspace().showError(t("The note could not be permanently deleted. Please try again."))
  }
}

// --- Libraries, shelves, and notebooks --------------------------------------------------

export const createNotebookOnShelf = (name: string, shelfId: string | undefined, onCreated?: (notebook: Notebook) => void) =>
  refreshAfter(() => createNotebook(name, shelfId), t("The notebook could not be created."), onCreated)

/**
 * The notebook with this name (ignoring case), created on the first shelf of the starter library
 * when it does not exist yet. Used for the Daily notes and Templates notebooks.
 */
export async function ensureNotebook(name: string): Promise<Notebook | undefined> {
  const { notebooks, shelves } = library()
  const existing = findNotebook(notebooks, name)
  if (existing) return existing
  return refreshAfter(() => createNotebook(name, shelfForNewNotebook('all', notebooks, shelves)), t("The {name} notebook could not be created.", { name }))
}

/**
 * After a note is renamed, rewrites [[links]] to its old title in other notes so they keep pointing
 * at it. Returns how many notes were updated, or undefined if saving failed part-way (the ones
 * already saved stay updated).
 */
export async function updateLinksAfterRename(oldTitle: string, newTitle: string, renamedId: string): Promise<number | undefined> {
  const now = Date.now()
  const changed = notesLinkingTo(library().notes, oldTitle, renamedId)
    .map((note) => ({ before: note, after: { ...note, content: renameWikilinks(note.content, oldTitle, newTitle), updatedAt: now } }))
    .filter(({ before, after }) => after.content !== before.content)
    .map(({ after }) => after)
  const count = await refreshAfter(async () => {
    for (const note of changed) await saveNote(note)
    return changed.length
  }, t("Some links could not be updated. Try again."))
  if (count !== undefined) {
    workspace().showNotice(tp(count, 'Updated links in {count} note to “{title}”.', 'Updated links in {count} notes to “{title}”.', { title: newTitle.trim() }))
  }
  return count
}

/** Quick notes are saved to a notebook with this name, for sorting later. */
export const INBOX_NOTEBOOK = 'Inbox'

/**
 * The title for a quick note: its first non-empty line, without heading or list markers, cut to
 * 80 characters at a word boundary.
 */
export function quickNoteTitle(text: string): string {
  const first = text.split(/\r?\n/).map((line) => line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s*)/, '').trim()).find(Boolean) ?? ''
  if (first.length <= 80) return first
  const cut = first.slice(0, 80)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80).trimEnd()}…`
}

/** Saves a new note to the Inbox notebook. Returns whether it was saved. */
async function saveToInbox(title: string, content: string, failure: string): Promise<boolean> {
  const notebook = await ensureNotebook(INBOX_NOTEBOOK)
  if (!notebook) return false
  const now = Date.now()
  const note: Note = {
    id: crypto.randomUUID(),
    title,
    content,
    notebookId: notebook.id,
    createdAt: now,
    updatedAt: now,
    tags: [],
    pinned: false,
    favorite: false,
  }
  const saved = await refreshAfter(async () => {
    await saveNote(note)
    return note
  }, failure)
  if (saved) workspace().showNotice(t("Saved “{title}” to {INBOX_NOTEBOOK}.", { title: saved.title, INBOX_NOTEBOOK }))
  return Boolean(saved)
}

/** Saves a quick note to the Inbox notebook. Returns whether it was saved. */
export async function saveQuickNote(text: string): Promise<boolean> {
  if (!text.trim()) return false
  return saveToInbox(quickNoteTitle(text) || 'Quick note', text.trimEnd(), t("Your quick note could not be saved. It is still in the quick note box."))
}

/** Saves a page clipped with the bookmarklet, or shared to the app, to the Inbox notebook. */
export async function saveClip(clip: Extract<LaunchRequest, { kind: 'clip' }>): Promise<boolean> {
  const { title, content } = clipToNote(clip)
  return saveToInbox(title, content, t("The clipped page could not be saved. Please try again."))
}

/** Creates (and saves) an example template in the Templates notebook, for people to adapt. */
export async function createSampleTemplate(): Promise<Note | undefined> {
  const notebook = await ensureNotebook(TEMPLATES_NOTEBOOK)
  if (!notebook) return undefined
  const now = Date.now()
  const template: Note = {
    id: crypto.randomUUID(),
    title: 'Meeting {{date}}',
    content: SAMPLE_TEMPLATE,
    notebookId: notebook.id,
    createdAt: now,
    updatedAt: now,
    tags: [],
    pinned: false,
    favorite: false,
  }
  return refreshAfter(async () => {
    await saveNote(template)
    return template
  }, t("The template could not be created."))
}

export const createNamedLibrary =(name: string, onCreated?: (library: Library) => void) =>
  refreshAfter(() => createLibrary(name), t("The library could not be created."), onCreated)

export const createShelfInLibrary = (libraryId: string, name: string, onCreated?: (shelf: Shelf) => void) =>
  refreshAfter(() => createShelf(libraryId, name), t("The shelf could not be created."), onCreated)

export const moveNotebookToShelf = (notebookId: string, shelfId: string) =>
  refreshAfter(() => moveNotebook(notebookId, shelfId), t("The notebook could not be moved."))

/** Prompts for a new name and renames the library, shelf, or notebook. */
export async function promptRename(target: StructureItem) {
  const question = target.kind === 'library' ? t('Rename library') : target.kind === 'shelf' ? t('Rename shelf') : t('Rename notebook')
  const name = window.prompt(question, target.item.name)
  if (name === null) return
  const rename = target.kind === 'library' ? renameLibrary : target.kind === 'shelf' ? renameShelf : renameNotebook
  await refreshAfter(
    () => rename(target.item.id, name),
    target.kind === 'library' ? t('The library could not be renamed.') : target.kind === 'shelf' ? t('The shelf could not be renamed.') : t('The notebook could not be renamed.'),
  )
}

/**
 * Deletes a library, shelf, or notebook after moving its contents to `destinationId`, and
 * leaves the current view if it was inside what was deleted. Throws on failure so the
 * delete dialog can show the reason.
 */
export async function deleteStructure(target: StructureItem, destinationId: string) {
  const { libraries, shelves, notebooks } = library()
  if (target.kind === 'notebook') await deleteNotebook(target.item.id, destinationId)
  else if (target.kind === 'shelf') await deleteShelf(target.item.id, destinationId)
  else await deleteLibrary(target.item.id, destinationId)

  const { view, setView } = workspace()
  let nextView: View | undefined
  if (target.kind === 'notebook' && view === `notebook:${target.item.id}`) nextView = 'all'
  if (target.kind === 'shelf' && view === `shelf:${target.item.id}`) nextView = `library:${target.item.libraryId}`
  if (target.kind === 'library') {
    const sourceShelfIds = new Set(shelves.filter((shelf) => shelf.libraryId === target.item.id).map((shelf) => shelf.id))
    const sourceNotebookIds = new Set(
      notebooks.filter((notebook) => notebook.shelfId && sourceShelfIds.has(notebook.shelfId)).map((notebook) => notebook.id),
    )
    const insideRemovedLibrary = view === `library:${target.item.id}`
      || (view.startsWith('shelf:') && sourceShelfIds.has(view.slice(6)))
      || (view.startsWith('notebook:') && sourceNotebookIds.has(view.slice(9)))
    if (insideRemovedLibrary) {
      nextView = libraries.some((item) => item.id === destinationId) ? `library:${destinationId}` : 'all'
    }
  }
  if (nextView) setView(nextView)
  await library().refresh()
}

// --- Settings ---------------------------------------------------------------------------

export async function changeTheme(theme: ThemeChoice) {
  try {
    await saveTheme(theme)
    library().setTheme(theme)
  } catch {
    workspace().showError(t("Your theme preference could not be saved."))
  }
}

/** Applied at once; saving only remembers it for next time. */
export async function changeReaderSettings(reader: ReaderSettings) {
  library().setReader(reader)
  try {
    await saveReaderSettings(reader)
  } catch {
    workspace().showError(t("Your reading settings could not be saved."))
  }
}

export async function changeEditorMode(mode: EditorMode) {
  // Applied at once; saving only remembers it for next time.
  library().setEditorMode(mode)
  try {
    await saveEditorMode(mode)
  } catch {
    workspace().showError(t("Your editor preference could not be saved."))
  }
}

export async function downloadBackup(options: BackupOptions) {
  try {
    const blob = await exportBackupFile(options)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `my-notes-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    workspace().showNotice(t("Your backup has been downloaded. Checking that it restores…"))
    // Prove the downloaded backup restores, from exactly what was downloaded.
    const check = await checkBackup(await readText(blob))
    await useBackupStore.getState().recordDownload(check)
    if (check.ok) workspace().showNotice(t("Your backup has been downloaded and checked: a test restore brought back {describeCheck}.", { describeCheck: describeCheck(check) }))
    else {
      workspace().showNotice(null)
      workspace().showError(t("Your backup was downloaded, but restoring it as a test failed: {problem}. Keep your earlier backups, and try exporting again.", { problem: check.problem }))
    }
  } catch (reason) {
    reportError(reason, t("The backup could not be created."))
  }
}

export async function restoreBackup(file: File) {
  try {
    const result = await importBackupFile(file)
    await library().refresh()
    workspace().showNotice(
      t("Backup restored: {librariesAdded} libraries, {shelvesAdded} shelves, {notebooksAdded} notebooks, {notesAdded} notes, {linksAdded} links, and {attachmentsAdded} attachments added; {notesSkipped} duplicate notes skipped.", { librariesAdded: result.librariesAdded, shelvesAdded: result.shelvesAdded, notebooksAdded: result.notebooksAdded, notesAdded: result.notesAdded, linksAdded: result.linksAdded, attachmentsAdded: result.attachmentsAdded, notesSkipped: result.notesSkipped }),
    )
    workspace().showError(null)
  } catch (reason) {
    reportError(reason, t("The backup could not be restored."))
  }
}

export async function requestPersistenceFromSettings() {
  const status = await usePersistenceStore.getState().requestNow()
  if (status !== 'persisted') {
    workspace().showNotice(t("The browser did not grant persistent storage. Installing the app, or bookmarking it, can help. Keep exporting backups."))
  }
}

// --- Saved searches ----------------------------------------------------------------------

/** Saves the search by name. Throws with a message to show if it cannot be saved. */
export async function saveNamedSearch(name: string, query: string) {
  library().setSavedSearches(await saveSearch(name, query))
}

export async function removeSavedSearch(search: SavedSearch) {
  try {
    library().setSavedSearches(await deleteSavedSearch(search.id))
    workspace().showNotice(t("Removed the saved search “{name}”.", { name: search.name }))
  } catch (reason) {
    reportError(reason, t("The saved search could not be removed."))
  }
}

// --- Markdown export and imports from other apps -----------------------------------------

const transfer = () => import('../features/transfer/transfer')

export async function exportMarkdownZip() {
  try {
    const { zip, notes } = await (await transfer()).exportMarkdown()
    const url = URL.createObjectURL(zip)
    const link = document.createElement('a')
    link.href = url
    link.download = `my-notes-markdown-${new Date().toISOString().slice(0, 10)}.zip`
    link.click()
    URL.revokeObjectURL(url)
    workspace().showNotice(tp(notes, 'Exported {count} note as Markdown files in a .zip.', 'Exported {count} notes as Markdown files in a .zip.'))
  } catch (reason) {
    reportError(reason, t("The Markdown export could not be created."))
  }
}

/** Imports notes exported from another app. Returns whether it worked. */
export async function importFromApp(source: ImportSource, files: readonly File[]): Promise<boolean> {
  try {
    const summary = await (await transfer()).importFromFiles(source, files)
    await library().refresh()
    workspace().showError(null)
    workspace().showNotice(
      [
        summary.notebooksCreated
          ? t('Imported {notes} into {notebooks}', { notes: tp(summary.notes, '{count} note', '{count} notes'), notebooks: tp(summary.notebooksCreated, '{count} new notebook', '{count} new notebooks') })
          : t('Imported {notes}', { notes: tp(summary.notes, '{count} note', '{count} notes') }),
        summary.attachments ? t(', with {attachments}', { attachments: tp(summary.attachments, '{count} attachment', '{count} attachments') }) : '',
        '.',
        summary.attachmentsSkipped ? ` ${tp(summary.attachmentsSkipped, '{count} attachment was left out (over 5 MiB, or over a note’s 20 attachments or 20 MiB).', '{count} attachments were left out (over 5 MiB, or over a note’s 20 attachments or 20 MiB).')}` : '',
      ].join(''),
    )
    return true
  } catch (reason) {
    reportError(reason, t("The notes could not be imported."))
    return false
  }
}

