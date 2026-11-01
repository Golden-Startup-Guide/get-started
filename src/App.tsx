import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  FileText,
  Heart,
  Layers3,
  LibraryBig,
  Network,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import {
  createLibrary,
  createNotebook,
  createShelf,
  deleteNotebook,
  deleteLibrary,
  deleteShelf,
  exportBackupFile,
  getNote,
  getAllNoteLinks,
  getNotes,
  getNotebooks,
  getLibraries,
  getShelves,
  getSettings,
  getStorageSnapshot,
  getTags,
  importBackupFile,
  getTrash,
  permanentlyDeleteNote,
  renameNotebook,
  renameLibrary,
  renameShelf,
  moveNotebook,
  restoreNote,
  saveNote,
  saveTheme,
  setNoteFlag,
  trashNote,
  subscribeToStorage,
  type BackupOptions,
} from './lib/notes'
import type {
  AppSettings,
  Note,
  Notebook,
  NoteLink,
  Library,
  Tag,
  Shelf,
  ThemePreference,
} from './types'
import { sortNotes, getNoteLinkLabel } from './features/notes/noteDisplay'
import { keepFocusInDialog } from './components/dialogFocus'
import { NavButton } from './components/NavButton'
import { NoteCard } from './features/notes/NoteCard'
import { NoteEditor } from './features/notes/NoteEditor'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { KnowledgeGraph } from './features/graph/KnowledgeGraph'
import { getStoragePersistence, requestStoragePersistence, type StoragePersistence } from './features/notes/storagePersistence'
import './workspace.css'

type View = 'all' | 'favorites' | 'trash' | 'graph' | `library:${string}` | `shelf:${string}` | `notebook:${string}` | `tag:${string}`
type DeleteCandidate =
  | { kind: 'notebook'; item: Notebook }
  | { kind: 'shelf'; item: Shelf }
  | { kind: 'library'; item: Library }

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [trash, setTrash] = useState<Note[]>([])
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [libraries, setLibraries] = useState<Library[]>([])
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [links, setLinks] = useState<NoteLink[]>([])
  const [settings, setSettings] = useState<AppSettings>({ id: 'preferences', theme: 'system' })
  const [view, setView] = useState<View>('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [isCompactNavigation, setIsCompactNavigation] = useState(
    () => window.matchMedia?.('(max-width: 1023px)').matches ?? false,
  )
  const [collapsedLibraries, setCollapsedLibraries] = useState<string[]>([])
  const [collapsedShelves, setCollapsedShelves] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  // Bumped to remount the editor with the latest stored copy of the same note.
  const [editorRevision, setEditorRevision] = useState(0)
  const [activeNoteChangedElsewhere, setActiveNoteChangedElsewhere] = useState(false)
  const activeNoteIdRef = useRef<string | null>(null)
  activeNoteIdRef.current = activeNote?.id ?? null
  const [isCreating, setIsCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notebookName, setNotebookName] = useState('')
  const [libraryName, setLibraryName] = useState('')
  const [shelfNames, setShelfNames] = useState<Record<string, string>>({})
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null)
  const [deleteDestination, setDeleteDestination] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [persistence, setPersistence] = useState<StoragePersistence>('unsupported')
  const persistenceRequested = useRef(false)
  const [storage, setStorage] = useState({ notes: 0, trash: 0, notebooks: 0, tags: 0, revisions: 0, attachments: 0, attachmentBytes: 0, estimatedBytes: 0 })
  const newNoteRef = useRef<HTMLButtonElement>(null)
  const navigationToggleRef = useRef<HTMLButtonElement>(null)
  const navigationCloseRef = useRef<HTMLButtonElement>(null)
  const pageHeadingRef = useRef<HTMLHeadingElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const focusReturnRef = useRef<HTMLElement | null>(null)
  const settingsFocusReturnRef = useRef<HTMLElement | null>(null)
  const deleteFocusReturnRef = useRef<HTMLElement | null>(null)
  const deleteDestinationRef = useRef<HTMLSelectElement>(null)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  async function refresh() {
    const [savedNotes, savedTrash, savedNotebooks, savedLibraries, savedShelves, savedTags, savedSettings, savedLinks] = await Promise.all([
      getNotes(),
      getTrash(),
      getNotebooks(),
      getLibraries(),
      getShelves(),
      getTags(),
      getSettings(),
      getAllNoteLinks(),
    ])
    setNotes(sortNotes(savedNotes))
    setTrash(savedTrash)
    setNotebooks(savedNotebooks)
    setLibraries(savedLibraries)
    setShelves(savedShelves)
    setTags(savedTags)
    setLinks(savedLinks)
    setSettings(savedSettings)
  }

  useEffect(() => {
    let active = true
    refresh()
      .catch(() => {
        if (active) setError('Your notes could not be loaded. Please try refreshing.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // The snapshot reads every record, including attachment data, so only compute it while
  // Settings is open (and again whenever the data it summarizes changes).
  useEffect(() => {
    if (!showSettings) return
    let active = true
    getStorageSnapshot()
      .then((snapshot) => {
        if (active) setStorage(snapshot)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [showSettings, notes, trash, notebooks, tags, links])

  useEffect(() => {
    let active = true
    void getStoragePersistence().then((status) => {
      if (active) setPersistence(status)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => subscribeToStorage((event) => {
    if (event.type === 'changed') {
      const activeId = activeNoteIdRef.current
      // Writes that change notes always list them; unlisted changes are organization only.
      if (activeId && event.noteIds.includes(activeId)) {
        setActiveNoteChangedElsewhere(true)
      }
      refresh().catch(() => setError('Changes from another tab could not be loaded. Please refresh.'))
    } else if (event.type === 'blocked') {
      setError('Close other My Notes tabs or windows so this one can finish updating your notes.')
    } else if (event.type === 'version-change') {
      setError('My Notes was updated in another tab. Reload this page to keep working; unsaved changes here cannot be saved.')
    } else {
      setError('The browser closed the connection to your notes. Reload this page to keep working.')
    }
  }), [])

  useEffect(() => {
    if (settings.theme !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [settings.theme])

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1023px)')
    if (!media) return
    const update = () => {
      setIsCompactNavigation(media.matches)
      if (!media.matches) setNavigationOpen(false)
    }
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    if (!navigationOpen || !isCompactNavigation) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => navigationCloseRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isCompactNavigation, navigationOpen])

  const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    if (deleteCandidate) requestAnimationFrame(() => deleteDestinationRef.current?.focus())
  }, [deleteCandidate])

  const filteredNotes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const currentNotebook = view.startsWith('notebook:')
      ? notebooks.find((notebook) => notebook.id === view.slice('notebook:'.length))
      : undefined
    const currentShelfId = view.startsWith('shelf:') ? view.slice('shelf:'.length) : undefined
    const selectedTag = view.startsWith('tag:') ? view.slice('tag:'.length) : undefined
    const source = view === 'trash' ? trash : notes
    const ordered = view === 'trash' ? source : sortNotes(source)
    return ordered.filter((note) => {
      const noteTags = note.tags ?? []
      if (view === 'trash' && note.deletedAt === undefined) return false
      if (view !== 'trash' && note.deletedAt !== undefined) return false
      if (view === 'favorites' && !note.favorite) return false
      if (currentNotebook && note.notebookId !== currentNotebook.id) return false
      if (currentShelfId && notebooks.find((notebook) => notebook.id === note.notebookId)?.shelfId !== currentShelfId) return false
      if (selectedTag && !noteTags.some((tag) => tag.toLocaleLowerCase() === selectedTag)) return false
      if (!term) return true
      const notebook = notebooks.find((item) => item.id === note.notebookId)
      const shelf = shelves.find((item) => item.id === notebook?.shelfId)
      const libraryName = libraries.find((item) => item.id === shelf?.libraryId)?.name ?? ''
      return [note.title, note.content, notebook?.name ?? '', shelf?.name ?? '', libraryName, ...noteTags].some((value) =>
        value.toLocaleLowerCase().includes(term),
      )
    })
  }, [libraries, notes, notebooks, query, shelves, trash, view])

  const viewLabel = view === 'all'
    ? 'All Notes'
    : view === 'favorites'
      ? 'Favorites'
      : view === 'trash'
        ? 'Trash'
      : view === 'graph'
        ? 'Knowledge Graph'
      : view.startsWith('library:')
        ? libraries.find((item) => item.id === view.slice(8))?.name ?? 'Library'
      : view.startsWith('shelf:')
        ? shelves.find((item) => item.id === view.slice(6))?.name ?? 'Shelf'
      : view.startsWith('notebook:')
        ? notebooks.find((item) => item.id === view.slice(9))?.name ?? 'Notebook'
        : tags.find((item) => item.id === view.slice(4))?.label ?? 'Tag'
  const activeLibrary = view.startsWith('library:')
    ? libraries.find((library) => library.id === view.slice(8))
    : undefined
  const activeShelf = view.startsWith('shelf:')
    ? shelves.find((shelf) => shelf.id === view.slice(6))
    : undefined
  const activeNotebook = view.startsWith('notebook:')
    ? notebooks.find((notebook) => notebook.id === view.slice(9))
    : undefined
  const activeNotebookShelf = activeNotebook
    ? shelves.find((shelf) => shelf.id === activeNotebook.shelfId)
    : undefined
  const breadcrumbItems: Array<{ label: string; view: View }> = activeLibrary
    ? [{ label: 'Knowledge Library', view: 'all' }]
    : activeShelf
      ? [
          { label: 'Knowledge Library', view: 'all' },
          {
            label: libraries.find((library) => library.id === activeShelf.libraryId)?.name ?? 'Library',
            view: `library:${activeShelf.libraryId}`,
          },
        ]
      : activeNotebook
        ? [
            { label: 'Knowledge Library', view: 'all' },
            ...(activeNotebookShelf
              ? [
                  {
                    label: libraries.find((library) => library.id === activeNotebookShelf.libraryId)?.name ?? 'Library',
                    view: `library:${activeNotebookShelf.libraryId}` as View,
                  },
                  { label: activeNotebookShelf.name, view: `shelf:${activeNotebookShelf.id}` as View },
                ]
              : []),
          ]
        : []

  function closeNavigation() {
    setNavigationOpen(false)
    requestAnimationFrame(() => navigationToggleRef.current?.focus())
  }

  function navigateToView(nextView: View) {
    setView(nextView)
    if (isCompactNavigation) {
      setNavigationOpen(false)
      requestAnimationFrame(() => pageHeadingRef.current?.focus())
    }
  }

  function toggleNavigation() {
    if (isCompactNavigation) {
      setNavigationOpen((current) => !current)
      return
    }
    setSidebarCollapsed((current) => !current)
  }

  function toggleLibraryExpanded(libraryId: string) {
    setCollapsedLibraries((current) =>
      current.includes(libraryId)
        ? current.filter((id) => id !== libraryId)
        : [...current, libraryId],
    )
  }

  function toggleShelfExpanded(shelfId: string) {
    setCollapsedShelves((current) =>
      current.includes(shelfId)
        ? current.filter((id) => id !== shelfId)
        : [...current, shelfId],
    )
  }

  async function handleSave(note: Note) {
    await saveNote(note)
    setNotes((current) => note.deletedAt === undefined
      ? sortNotes([note, ...current.filter((item) => item.id !== note.id)])
      : current.filter((item) => item.id !== note.id))
    if (note.deletedAt !== undefined) {
      setTrash((current) => [note, ...current.filter((item) => item.id !== note.id)])
    }
    setError(null)
    setTags(await getTags())
    // Ask once per session, after the first save, so there is real data worth protecting.
    if (persistence === 'best-effort' && !persistenceRequested.current) {
      persistenceRequested.current = true
      setPersistence(await requestStoragePersistence())
    }
  }

  async function handleRequestPersistence() {
    persistenceRequested.current = true
    const status = await requestStoragePersistence()
    setPersistence(status)
    if (status !== 'persisted') {
      setNotice('The browser did not grant persistent storage. Installing My Notes as an app, or bookmarking it, can help. Keep exporting backups.')
    }
  }

  function openNewNote() {
    focusReturnRef.current = isCompactNavigation && navigationOpen
      ? navigationToggleRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    if (isCompactNavigation && navigationOpen) setNavigationOpen(false)
    const activeLibraryId = view.startsWith('shelf:')
      ? shelves.find((shelf) => shelf.id === view.slice(6))?.libraryId ?? 'starter-library'
      : view.startsWith('library:')
        ? view.slice(8)
        : 'starter-library'
    const activeShelfId = view.startsWith('shelf:')
      ? view.slice(6)
      : shelves.find((shelf) => shelf.libraryId === activeLibraryId)?.id
    const targetNotebookId = view.startsWith('notebook:')
      ? view.slice(9)
      : notebooks.find((notebook) => notebook.shelfId === activeShelfId)?.id
        ?? notebooks.find((notebook) => shelves.some((shelf) => shelf.id === notebook.shelfId && shelf.libraryId === activeLibraryId))?.id
        ?? notebooks.find((notebook) => notebook.id === 'starter-personal')?.id
        ?? notebooks[0]?.id
    setIsCreating(true)
    setActiveNote({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notebookId: targetNotebookId,
      tags: [],
      pinned: false,
      favorite: false,
    })
  }

  // Stable (uses only refs and state setters), so the editor's effect that calls it does
  // not re-run on every render.
  const reloadActiveNote = useCallback(async () => {
    const id = activeNoteIdRef.current
    if (!id) return
    setActiveNoteChangedElsewhere(false)
    try {
      const latest = await getNote(id)
      if (!latest) {
        setActiveNote(null)
        setIsCreating(false)
        setNotice('The note you were editing was permanently deleted in another tab.')
        return
      }
      setIsCreating(false)
      setActiveNote(latest)
      setEditorRevision((current) => current + 1)
    } catch {
      setError('The latest version of this note could not be loaded. Please refresh.')
    }
  }, [])

  function openNote(note: Note) {
    setActiveNoteChangedElsewhere(false)
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setIsCreating(false)
    setActiveNote(note)
  }

  function closeEditor() {
    setActiveNoteChangedElsewhere(false)
    setActiveNote(null)
    setIsCreating(false)
    requestAnimationFrame(() => {
      const target = focusReturnRef.current
      ;(target?.isConnected ? target : newNoteRef.current)?.focus()
    })
  }

  function openSettings() {
    settingsFocusReturnRef.current = isCompactNavigation && navigationOpen
      ? navigationToggleRef.current
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    if (isCompactNavigation && navigationOpen) setNavigationOpen(false)
    setShowSettings(true)
  }

  function closeSettings() {
    setShowSettings(false)
    requestAnimationFrame(() => settingsFocusReturnRef.current?.focus())
  }

  function openDeleteStructure(candidate: DeleteCandidate) {
    deleteFocusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDeleteError(null)
    setDeleteCandidate(candidate)
    if (candidate.kind === 'notebook') {
      setDeleteDestination(notebooks.find((item) => item.id !== candidate.item.id)?.id ?? '')
    } else if (candidate.kind === 'shelf') {
      setDeleteDestination(shelves.find((item) => item.libraryId === candidate.item.libraryId && item.id !== candidate.item.id)?.id ?? '')
    } else {
      setDeleteDestination(libraries.find((item) => item.id !== candidate.item.id)?.id ?? '')
    }
  }

  function closeDeleteDialog() {
    setDeleteCandidate(null)
    setDeleteError(null)
    requestAnimationFrame(() => deleteFocusReturnRef.current?.focus())
  }

  async function createNotebookFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const currentNotebook = view.startsWith('notebook:')
        ? notebooks.find((notebook) => notebook.id === view.slice(9))
        : undefined
      const currentShelfId = view.startsWith('shelf:')
        ? view.slice(6)
        : currentNotebook?.shelfId
          ?? shelves.find((shelf) => shelf.libraryId === (view.startsWith('library:') ? view.slice(8) : 'starter-library'))?.id
      const created = await createNotebook(notebookName, currentShelfId)
      setNotebookName('')
      navigateToView(`notebook:${created.id}`)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The notebook could not be created.')
    }
  }

  async function handleDeleteStructure() {
    if (!deleteCandidate) return
    try {
      if (deleteCandidate.kind === 'notebook') {
        await deleteNotebook(deleteCandidate.item.id, deleteDestination)
      } else if (deleteCandidate.kind === 'shelf') {
        await deleteShelf(deleteCandidate.item.id, deleteDestination)
      } else {
        await deleteLibrary(deleteCandidate.item.id, deleteDestination)
      }
      const removed = deleteCandidate
      setDeleteCandidate(null)
      setDeleteDestination('')
      if (removed.kind === 'notebook' && view === `notebook:${removed.item.id}`) setView('all')
      if (removed.kind === 'shelf' && view === `shelf:${removed.item.id}`) setView(`library:${removed.item.libraryId}`)
      if (removed.kind === 'library') {
        const destination = libraries.find((library) => library.id === deleteDestination)
        const sourceShelfIds = new Set(shelves.filter((shelf) => shelf.libraryId === removed.item.id).map((shelf) => shelf.id))
        const sourceNotebookIds = new Set(notebooks.filter((notebook) => notebook.shelfId && sourceShelfIds.has(notebook.shelfId)).map((notebook) => notebook.id))
        const isInRemovedLibrary = view === `library:${removed.item.id}`
          || (view.startsWith('shelf:') && sourceShelfIds.has(view.slice(6)))
          || (view.startsWith('notebook:') && sourceNotebookIds.has(view.slice(9)))
        if (isInRemovedLibrary) setView(destination ? `library:${destination.id}` : 'all')
      }
      setDeleteError(null)
      await refresh()
      requestAnimationFrame(() => {
        const target = deleteFocusReturnRef.current
        ;(target?.isConnected ? target : newNoteRef.current)?.focus()
      })
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : `The ${deleteCandidate.kind} could not be deleted.`)
    }
  }

  async function createLibraryFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const created = await createLibrary(libraryName)
      setLibraryName('')
      navigateToView(`library:${created.id}`)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The library could not be created.')
    }
  }

  async function createShelfFromForm(library: Library, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const created = await createShelf(library.id, shelfNames[library.id] ?? '')
      setShelfNames((current) => ({ ...current, [library.id]: '' }))
      navigateToView(`shelf:${created.id}`)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The shelf could not be created.')
    }
  }

  async function handleRenameLibrary(library: Library) {
    const name = window.prompt('Rename library', library.name)
    if (name === null) return
    try {
      await renameLibrary(library.id, name)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The library could not be renamed.')
    }
  }

  async function handleRenameShelf(shelf: Shelf) {
    const name = window.prompt('Rename shelf', shelf.name)
    if (name === null) return
    try {
      await renameShelf(shelf.id, name)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The shelf could not be renamed.')
    }
  }

  async function handleNoteFlag(note: Note, flag: 'pinned' | 'favorite') {
    try {
      await setNoteFlag(note.id, flag, !note[flag])
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The note could not be updated.')
    }
  }

  async function handleDeleteNote(note: Note): Promise<boolean> {
    try {
      if (note.deletedAt === undefined) {
        await trashNote(note.id)
      } else {
        await permanentlyDeleteNote(note.id)
      }
      setActiveNote(null)
      setIsCreating(false)
      await refresh()
      return true
    } catch {
      setError('Your note could not be deleted. Please try again.')
      return false
    }
  }

  async function handleRestoreNote(note: Note) {
    try {
      await restoreNote(note.id)
      await refresh()
      setNotice(`“${note.title || 'Untitled note'}” was restored.`)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The note could not be restored.')
    }
  }

  async function handlePermanentDelete(note: Note) {
    if (!window.confirm(`Permanently delete “${note.title || 'Untitled note'}”? This cannot be undone.`)) return
    try {
      await permanentlyDeleteNote(note.id)
      await refresh()
      setNotice('The note was permanently deleted.')
      setError(null)
    } catch {
      setError('The note could not be permanently deleted. Please try again.')
    }
  }

  async function handleTheme(themePreference: ThemePreference) {
    try {
      await saveTheme(themePreference)
      setSettings((current) => ({ ...current, theme: themePreference }))
    } catch {
      setError('Your theme preference could not be saved.')
    }
  }

  async function handleExport(options: BackupOptions) {
    try {
      const blob = await exportBackupFile(options)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `my-notes-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Your backup has been downloaded.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be created.')
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choose a JSON backup file to import.')
      return
    }
    if (!window.confirm('Merge this backup with the notes on this device? Existing notes will never be overwritten.')) {
      form.reset()
      return
    }
    try {
      const result = await importBackupFile(file)
      await refresh()
      setNotice(
        `Backup restored: ${result.librariesAdded} libraries, ${result.shelvesAdded} shelves, ${result.notebooksAdded} notebooks, ${result.notesAdded} notes, ${result.linksAdded} links, and ${result.attachmentsAdded} attachments added; ${result.notesSkipped} duplicate notes skipped.`,
      )
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be restored.')
    } finally {
      form.reset()
    }
  }

  async function handleRename(notebook: Notebook) {
    const name = window.prompt('Rename notebook', notebook.name)
    if (name === null) return
    try {
      await renameNotebook(notebook.id, name)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The notebook could not be renamed.')
    }
  }

  return (
    <div className="workspace" data-theme={theme} data-navigation-open={navigationOpen && isCompactNavigation}>
      {isCompactNavigation && navigationOpen && (
        <button className="navigation-backdrop" onClick={closeNavigation} aria-label="Close navigation" tabIndex={-1} />
      )}
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside
          id="workspace-navigation"
          className="workspace-sidebar w-72 shrink-0 flex-col border-r p-5"
          data-collapsed={sidebarCollapsed && !isCompactNavigation}
          data-open={navigationOpen}
          aria-hidden={isCompactNavigation && !navigationOpen}
          role={isCompactNavigation && navigationOpen ? 'dialog' : undefined}
          aria-modal={isCompactNavigation && navigationOpen ? true : undefined}
          aria-label="Primary navigation"
          onKeyDown={isCompactNavigation && navigationOpen ? (event) => keepFocusInDialog(event, closeNavigation) : undefined}
        >
          <div className="mb-6 flex items-center justify-between gap-2">
            <a href="/" className="flex min-w-0 items-center gap-3 px-2 text-lg font-semibold" aria-label="My Notes home">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d77762] text-white">
              <FileText size={20} aria-hidden="true" />
            </span>
              <span className="truncate">My Notes</span>
            </a>
            <button
              ref={navigationCloseRef}
              className="icon-button navigation-close"
              onClick={closeNavigation}
              aria-label="Close navigation"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <button ref={newNoteRef} onClick={openNewNote} className="primary-button mb-5 flex items-center justify-center gap-2" aria-label="Create a new note from navigation">
            <Plus size={17} aria-hidden="true" /> New note
          </button>
          <nav aria-label="Note views" className="space-y-1">
            <NavButton active={view === 'all'} label="All Notes" count={notes.length} onClick={() => navigateToView('all')} icon={<FileText size={16} />} />
            <NavButton active={view === 'favorites'} label="Favorites" count={notes.filter((note) => note.favorite).length} onClick={() => navigateToView('favorites')} icon={<Heart size={16} />} />
            <NavButton active={view === 'trash'} label="Trash" count={trash.length} onClick={() => navigateToView('trash')} icon={<Trash2 size={16} />} />
            <NavButton active={view === 'graph'} label="Knowledge Graph" count={notes.length} onClick={() => navigateToView('graph')} icon={<Network size={16} />} />
          </nav>
          <div className="library-tree mt-8 min-w-0">
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="section-label">Your Library</h2>
              <span className="text-xs text-[var(--muted)]">{libraries.length}</span>
            </div>
            <nav aria-label="Libraries" className="min-w-0 space-y-3">
              {libraries.map((library) => {
                const libraryShelves = shelves.filter((shelf) => shelf.libraryId === library.id)
                const libraryNotebookIds = notebooks
                  .filter((notebook) => libraryShelves.some((shelf) => shelf.id === notebook.shelfId))
                  .map((notebook) => notebook.id)
                const libraryExpanded = !collapsedLibraries.includes(library.id)
                return (
                  <div key={library.id} className="min-w-0">
                    <div className="group flex min-w-0 items-center gap-1">
                      <button
                        className="icon-button tree-disclosure !h-8 !w-8 shrink-0"
                        aria-label={`${libraryExpanded ? 'Collapse' : 'Expand'} ${library.name}`}
                        aria-expanded={libraryExpanded}
                        aria-controls={`library-contents-${library.id}`}
                        onClick={() => toggleLibraryExpanded(library.id)}
                      >
                        <ChevronDown size={15} aria-hidden="true" />
                      </button>
                      <NavButton
                        active={view === `library:${library.id}`}
                        label={library.name}
                        count={notes.filter((note) => libraryNotebookIds.includes(note.notebookId ?? '')).length}
                        onClick={() => navigateToView(`library:${library.id}`)}
                        icon={<LibraryBig size={16} />}
                        className="min-w-0 flex-1 !w-auto"
                      />
                      <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        <button className="icon-button !h-8 !w-8" aria-label={`Rename ${library.name}`} onClick={() => void handleRenameLibrary(library)}><Settings size={13} /></button>
                        <button className="icon-button !h-8 !w-8" aria-label={`Delete ${library.name}`} disabled={libraries.length <= 1} title={libraries.length <= 1 ? 'The last library cannot be deleted' : undefined} onClick={() => openDeleteStructure({ kind: 'library', item: library })}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div
                      id={`library-contents-${library.id}`}
                      role="group"
                      aria-label={`${library.name} shelves`}
                      hidden={!libraryExpanded}
                      className="ml-3 min-w-0 border-l border-[var(--border)] pl-2"
                    >
                        {libraryShelves.map((shelf) => {
                          const shelfExpanded = !collapsedShelves.includes(shelf.id)
                          return (
                            <div key={shelf.id} className="mb-2">
                              <div className="group flex min-w-0 items-center gap-1">
                                <button
                                  className="icon-button tree-disclosure !h-8 !w-8 shrink-0"
                                  aria-label={`${shelfExpanded ? 'Collapse' : 'Expand'} ${shelf.name}`}
                                  aria-expanded={shelfExpanded}
                                  aria-controls={`shelf-contents-${shelf.id}`}
                                  onClick={() => toggleShelfExpanded(shelf.id)}
                                >
                                  <ChevronDown size={14} aria-hidden="true" />
                                </button>
                                <NavButton
                                  active={view === `shelf:${shelf.id}`}
                                  label={shelf.name}
                                  count={notes.filter((note) => notebooks.some((notebook) => notebook.id === note.notebookId && notebook.shelfId === shelf.id)).length}
                                  onClick={() => navigateToView(`shelf:${shelf.id}`)}
                                  icon={<Layers3 size={15} />}
                                  className="min-w-0 flex-1 !w-auto"
                                />
                                <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                                  <button className="icon-button !h-8 !w-8" aria-label={`Rename ${shelf.name}`} onClick={() => void handleRenameShelf(shelf)}><Settings size={13} /></button>
                                  <button className="icon-button !h-8 !w-8" aria-label={`Delete ${shelf.name}`} disabled={libraryShelves.length <= 1} title={libraryShelves.length <= 1 ? 'The last shelf in a library cannot be deleted' : undefined} onClick={() => openDeleteStructure({ kind: 'shelf', item: shelf })}><Trash2 size={13} /></button>
                                </div>
                              </div>
                              <div id={`shelf-contents-${shelf.id}`} role="group" aria-label={`${shelf.name} notebooks`} hidden={!shelfExpanded}>
                                  {notebooks.filter((notebook) => notebook.shelfId === shelf.id).map((notebook) => (
                                    <div key={notebook.id} className="library-tree-notebook ml-3 min-w-0">
                                      <div className="group flex min-w-0 items-center gap-1">
                                        <NavButton
                                          active={view === `notebook:${notebook.id}`}
                                          label={notebook.name}
                                          count={notes.filter((note) => note.notebookId === notebook.id).length}
                                          onClick={() => navigateToView(`notebook:${notebook.id}`)}
                                          icon={<Archive size={15} />}
                                          className="min-w-0 flex-1 !w-auto"
                                        />
                                        <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                                          <button className="icon-button !h-8 !w-8" aria-label={`Rename ${notebook.name}`} onClick={() => void handleRename(notebook)}><Settings size={13} /></button>
                                          <button className="icon-button !h-8 !w-8" aria-label={`Delete ${notebook.name}`} disabled={notebooks.length <= 1} title={notebooks.length <= 1 ? 'The last notebook cannot be deleted' : undefined} onClick={() => openDeleteStructure({ kind: 'notebook', item: notebook })}><Trash2 size={13} /></button>
                                        </div>
                                      </div>
                                      <label className="sr-only" htmlFor={`move-notebook-${notebook.id}`}>Move {notebook.name} to shelf</label>
                                      <select
                                        id={`move-notebook-${notebook.id}`}
                                        className="small-input library-notebook-move !min-h-8 !px-2 text-xs"
                                        aria-label={`Move ${notebook.name} to shelf`}
                                        value={notebook.shelfId ?? ''}
                                        onChange={(event) => void moveNotebook(notebook.id, event.target.value).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The notebook could not be moved.'))}
                                      >
                                        {shelves.map((option) => <option key={option.id} value={option.id}>{libraries.find((item) => item.id === option.libraryId)?.name ?? 'Library'} · {option.name}</option>)}
                                      </select>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )
                        })}
                        <form className="mt-1 flex min-w-0 gap-1" onSubmit={(event) => void createShelfFromForm(library, event)}>
                          <label className="sr-only" htmlFor={`new-shelf-${library.id}`}>New shelf in {library.name}</label>
                          <input id={`new-shelf-${library.id}`} className="small-input !min-h-8 min-w-0 flex-1 !px-2 text-xs" value={shelfNames[library.id] ?? ''} onChange={(event) => setShelfNames((current) => ({ ...current, [library.id]: event.target.value }))} placeholder="New shelf" />
                          <button className="icon-button !h-8 !w-8" aria-label={`Add shelf to ${library.name}`} type="submit"><Plus size={15} /></button>
                        </form>
                    </div>
                  </div>
                )
              })}
            </nav>
            <form className="mt-3 flex gap-2" onSubmit={(event) => void createLibraryFromForm(event)}>
              <label className="sr-only" htmlFor="new-library">New library name</label>
              <input id="new-library" className="small-input min-w-0 flex-1" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="New library" />
              <button className="icon-button" aria-label="Add library" type="submit"><Plus size={16} /></button>
            </form>
            <form className="mt-2 flex gap-2" onSubmit={(event) => void createNotebookFromForm(event)}>
              <label className="sr-only" htmlFor="new-notebook">New notebook name</label>
              <input id="new-notebook" className="small-input min-w-0 flex-1" value={notebookName} onChange={(event) => setNotebookName(event.target.value)} placeholder="New notebook" />
              <button className="icon-button" aria-label="Add notebook" type="submit"><Plus size={16} /></button>
            </form>
          </div>
          <div className="mt-8">
            <h2 className="section-label mb-2 px-2">Tags</h2>
            <nav aria-label="Tags" className="space-y-1">
              {tags.map((tag) => (
                <NavButton key={tag.id} active={view === `tag:${tag.id}`} label={tag.label} count={tag.count} onClick={() => navigateToView(`tag:${tag.id}`)} icon={<TagIcon size={15} />} />
              ))}
              {tags.length === 0 && <p className="px-3 py-1 text-xs text-[var(--muted)]">Tags you add to notes appear here.</p>}
            </nav>
          </div>
          <button onClick={openSettings} className="nav-button mt-auto flex items-center gap-3" aria-label="Open settings"><Settings size={17} /> Settings</button>
        </aside>

        <main id="main-content" className="min-w-0 flex-1 p-4 sm:p-8 lg:p-10">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={navigationToggleRef}
                className="icon-button navigation-toggle shrink-0"
                onClick={toggleNavigation}
                aria-label={
                  isCompactNavigation
                    ? navigationOpen ? 'Close navigation' : 'Open navigation'
                    : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
                }
                aria-expanded={isCompactNavigation ? navigationOpen : !sidebarCollapsed}
                aria-controls="workspace-navigation"
              >
                {isCompactNavigation
                  ? navigationOpen
                    ? <X size={18} aria-hidden="true" />
                    : <Menu size={18} aria-hidden="true" />
                  : sidebarCollapsed
                    ? <PanelLeftOpen size={18} aria-hidden="true" />
                    : <PanelLeftClose size={18} aria-hidden="true" />}
              </button>
              <div className="min-w-0">
                <p className="section-label mb-1">Personal Knowledge Library</p>
                {breadcrumbItems.length > 0 && (
                  <nav className="workspace-breadcrumb mb-1" aria-label="Breadcrumb">
                    <ol>
                      {breadcrumbItems.map((item, index) => (
                        <li key={`${item.label}-${index}`}>
                          <button onClick={() => navigateToView(item.view)}>{item.label}</button>
                          <span aria-hidden="true">/</span>
                        </li>
                      ))}
                    </ol>
                  </nav>
                )}
                <h1 ref={pageHeadingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{viewLabel}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="icon-button" onClick={openSettings} aria-label="Open settings"><Settings size={18} /></button>
              <button className="primary-button flex items-center gap-2" onClick={openNewNote} aria-label="Create a new note"><Plus size={17} /><span className="new-note-label">New note</span></button>
            </div>
          </header>
          {error && <div role="alert" className="notice notice-error mb-5">{error}<button onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && <div role="status" className="notice mb-5">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={15} /></button></div>}
          {view.startsWith('shelf:') && (
            <form className="mb-5 flex max-w-xl gap-2" onSubmit={(event) => void createNotebookFromForm(event)}>
              <label className="sr-only" htmlFor="shelf-new-notebook">New notebook in {viewLabel}</label>
              <input id="shelf-new-notebook" className="small-input min-w-0 flex-1" value={notebookName} onChange={(event) => setNotebookName(event.target.value)} placeholder={`New notebook in ${viewLabel}`} />
              <button className="secondary-button" type="submit"><Plus size={15} /> Add notebook</button>
            </form>
          )}
          {view.startsWith('notebook:') && (
            <div className="mb-5 max-w-xl md:hidden">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mobile-notebook-shelf">Move notebook to shelf</label>
              <select
                id="mobile-notebook-shelf"
                className="small-input w-full"
                value={notebooks.find((notebook) => notebook.id === view.slice(9))?.shelfId ?? ''}
                onChange={(event) => void moveNotebook(view.slice(9), event.target.value).then(refresh).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The notebook could not be moved.'))}
              >
                {shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{libraries.find((library) => library.id === shelf.libraryId)?.name ?? 'Library'} · {shelf.name}</option>)}
              </select>
            </div>
          )}
          <div className="mb-5 flex min-w-0 items-center gap-3">
            {view !== 'graph' && !view.startsWith('library:') && (
              <>
                <div className="search-field flex-1">
                  <Search size={18} aria-hidden="true" />
                  <label htmlFor="note-search" className="sr-only">Search notes, libraries, shelves, notebooks, and tags</label>
                  <input id="note-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, content, libraries, shelves, notebooks, or tags..." />
                  {query && <button className="icon-button !h-8 !w-8" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
                </div>
                <p className="whitespace-nowrap text-xs text-[var(--muted)] sm:text-sm" aria-live="polite">
                  {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
                </p>
              </>
            )}
          </div>
          {isLoading ? (
            <p role="status" className="py-16 text-center text-[var(--muted)]">Loading your notes…</p>
          ) : view.startsWith('library:') ? (
            <section aria-labelledby="library-home-title">
              <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <p className="section-label">Personal Knowledge Library</p>
                <h2 id="library-home-title" className="mt-2 text-xl font-semibold">Library home</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">Organize notebooks and notes into shelves. Your notes remain available in All Notes at any time.</p>
                {activeLibrary && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button className="secondary-button" onClick={() => void handleRenameLibrary(activeLibrary)}>Rename library</button>
                    <button className="danger-button" disabled={libraries.length <= 1} onClick={() => openDeleteStructure({ kind: 'library', item: activeLibrary })}>Delete library</button>
                  </div>
                )}
              </div>
              {activeLibrary && (
                <div className="mb-5 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
                  <form className="flex gap-2" onSubmit={(event) => void createShelfFromForm(activeLibrary, event)}>
                    <label className="sr-only" htmlFor={`home-new-shelf-${activeLibrary.id}`}>New shelf in {activeLibrary.name}</label>
                    <input id={`home-new-shelf-${activeLibrary.id}`} className="small-input min-w-0 flex-1" value={shelfNames[activeLibrary.id] ?? ''} onChange={(event) => setShelfNames((current) => ({ ...current, [activeLibrary.id]: event.target.value }))} placeholder="New shelf" />
                    <button className="secondary-button" type="submit"><Plus size={15} /> Add shelf</button>
                  </form>
                  <form className="flex gap-2" onSubmit={(event) => void createLibraryFromForm(event)}>
                    <label className="sr-only" htmlFor="home-new-library">New library name</label>
                    <input id="home-new-library" className="small-input min-w-0 flex-1" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="New library" />
                    <button className="secondary-button" type="submit"><Plus size={15} /> Add library</button>
                  </form>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shelves.filter((shelf) => shelf.libraryId === view.slice(8)).map((shelf) => {
                  const shelfNotebooks = notebooks.filter((notebook) => notebook.shelfId === shelf.id)
                  const shelfNotes = notes.filter((note) => shelfNotebooks.some((notebook) => notebook.id === note.notebookId))
                  return (
                    <article key={shelf.id} className="note-card !min-h-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="section-label">Shelf</p>
                          <h3 className="mt-2 text-lg font-semibold">{shelf.name}</h3>
                          <p className="mt-1 text-sm text-[var(--muted)]">{shelfNotebooks.length} notebooks · {shelfNotes.length} notes</p>
                        </div>
                        <Layers3 size={20} className="text-[var(--accent)]" aria-hidden="true" />
                      </div>
                      {shelfNotebooks.length > 0 && <p className="mt-4 text-sm text-[var(--muted)]">{shelfNotebooks.map((notebook) => notebook.name).join(' · ')}</p>}
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button className="secondary-button" onClick={() => navigateToView(`shelf:${shelf.id}`)} aria-label={`Open ${shelf.name} shelf`}>Open shelf <ArrowLeft className="rotate-180" size={15} /></button>
                        <button className="secondary-button" aria-label={`Rename ${shelf.name}`} onClick={() => void handleRenameShelf(shelf)}>Rename shelf</button>
                        <button className="danger-button" aria-label={`Delete ${shelf.name}`} disabled={shelves.filter((item) => item.libraryId === shelf.libraryId).length <= 1} onClick={() => openDeleteStructure({ kind: 'shelf', item: shelf })}>Delete shelf</button>
                      </div>
                    </article>
                  )
                })}
                {shelves.filter((shelf) => shelf.libraryId === view.slice(8)).length === 0 && (
                  <div className="empty-state sm:col-span-2 xl:col-span-3">
                    <span className="empty-icon"><Layers3 size={24} /></span>
                    <h2 className="mt-4 text-lg font-semibold">No shelves yet</h2>
                    <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">Add a shelf from the library navigation to start organizing this library.</p>
                  </div>
                )}
              </div>
            </section>
          ) : view === 'graph' ? (
            <KnowledgeGraph
              notes={[...notes, ...trash]}
              links={links}
              noteLabel={(note) => getNoteLinkLabel(note, [...notes, ...trash], notebooks)}
              onOpenNote={openNote}
            />
          ) : filteredNotes.length ? (
            <section aria-label={`${viewLabel} notes`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  notebook={notebooks.find((item) => item.id === note.notebookId)?.name ?? 'Personal'}
                  query={query}
                  isTrash={view === 'trash'}
                  onOpen={() => openNote(note)}
                  onFlag={(flag) => void handleNoteFlag(note, flag)}
                  onRestore={() => void handleRestoreNote(note)}
                  onPermanentDelete={() => void handlePermanentDelete(note)}
                />
              ))}
            </section>
          ) : (
            <div className="empty-state">
              <span className="empty-icon"><FileText size={24} /></span>
              <h2 className="mt-4 text-lg font-semibold">{query ? 'No matching notes' : view === 'favorites' ? 'No favorites yet' : view === 'trash' ? 'Trash is empty' : 'A little space to think.'}</h2>
              <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">{query ? 'Try another search term or clear your filters.' : view === 'trash' ? 'Notes you move to Trash can be restored or permanently deleted here.' : 'Capture an idea, a reminder, or anything you want to remember.'}</p>
              {!query && view !== 'favorites' && view !== 'trash' && <button className="primary-button mt-5" onClick={openNewNote}><Plus size={16} /> Create a note</button>}
            </div>
          )}
          <div className="mt-8 flex items-center justify-between md:hidden">
            <span className="text-xs text-[var(--muted)]">{notebooks.length} notebooks · {tags.length} tags</span>
            <button className="nav-button flex items-center gap-2" onClick={openSettings}><Settings size={15} /> Settings</button>
          </div>
        </main>
      </div>

      {activeNote && (
        <NoteEditor
          key={`${activeNote.id}:${editorRevision}`}
          note={activeNote}
          isCreating={isCreating}
          notebooks={notebooks}
          tags={tags}
          notes={notes}
          trash={trash}
          onSave={handleSave}
          onRefresh={refresh}
          onClose={closeEditor}
          onOpenNote={openNote}
          onDelete={() => handleDeleteNote(activeNote)}
          onError={setError}
          changedElsewhere={activeNoteChangedElsewhere}
          onLoadLatest={reloadActiveNote}
          onKeepMine={() => setActiveNoteChangedElsewhere(false)}
        />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          storage={storage}
          persistence={persistence}
          onRequestPersistence={() => void handleRequestPersistence()}
          fileRef={fileRef}
          onClose={closeSettings}
          onTheme={(value) => void handleTheme(value)}
          onExport={(options) => void handleExport(options)}
          onImport={(event) => void handleImport(event)}
          error={error}
          notice={notice}
          onDismissError={() => setError(null)}
          onDismissNotice={() => setNotice(null)}
        />
      )}
      {deleteCandidate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDeleteDialog()
        }}>
          <section className="dialog-card max-w-md" role="dialog" aria-modal="true" aria-labelledby="delete-structure-title" onKeyDown={(event) => keepFocusInDialog(event, closeDeleteDialog)}>
            <div className="flex items-start justify-between">
              <div>
                <h2 id="delete-structure-title" className="text-xl font-semibold">
                  Delete {deleteCandidate.kind}?
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {deleteCandidate.kind === 'notebook'
                    ? `Notes in “${deleteCandidate.item.name}” will be moved, not deleted.`
                    : deleteCandidate.kind === 'shelf'
                      ? `Notebooks in “${deleteCandidate.item.name}” will be moved, not deleted.`
                      : `Shelves and notebooks in “${deleteCandidate.item.name}” will be moved, not deleted. Conflicting shelf names are renamed automatically.`}
                </p>
              </div>
              <button className="icon-button" onClick={closeDeleteDialog} aria-label="Close"><X size={17} /></button>
            </div>
            <label htmlFor="delete-destination" className="mt-5 block text-sm font-medium">
              {deleteCandidate.kind === 'notebook' ? 'Move notes to notebook' : deleteCandidate.kind === 'shelf' ? 'Move notebooks to shelf' : 'Move shelves to library'}
            </label>
            <select ref={deleteDestinationRef} id="delete-destination" className="small-input mt-2 w-full" value={deleteDestination} onChange={(event) => setDeleteDestination(event.target.value)}>
              {deleteCandidate.kind === 'notebook' && notebooks.filter((item) => item.id !== deleteCandidate.item.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              {deleteCandidate.kind === 'shelf' && shelves.filter((item) => item.libraryId === deleteCandidate.item.libraryId && item.id !== deleteCandidate.item.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              {deleteCandidate.kind === 'library' && libraries.filter((item) => item.id !== deleteCandidate.item.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {deleteError && <p className="mt-4 text-sm text-red-700" role="alert">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2"><button className="secondary-button" onClick={closeDeleteDialog}>Cancel</button><button className="danger-button" disabled={!deleteDestination} onClick={() => void handleDeleteStructure()}>Move contents and delete</button></div>
          </section>
        </div>
      )}
    </div>
  )
}


export default App
