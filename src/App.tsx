import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  FileText,
  Menu,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  TextSearch,
  X,
  Zap,
} from 'lucide-react'
import { buildNoteLinkLabels, sortNotes } from './features/notes/noteDisplay'
import { NoteGrid } from './features/notes/NoteGrid'
import { SaveSearchButton } from './features/notes/SaveSearchButton'
import { SearchTips } from './features/notes/SearchTips'
import { useSearchMatches, WORKER_SEARCH_THRESHOLD } from './features/notes/useSearchMatches'
import { QuickCapture } from './features/notes/QuickCapture'
import { LazyNoteEditor } from './features/notes/LazyNoteEditor'
import { preloadNoteEditor } from './features/notes/noteEditorChunk'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { BackupReminder } from './features/backup/BackupReminder'
import { KnowledgeGraph } from './features/graph/KnowledgeGraph'
import { CommandPalette } from './features/palette/CommandPalette'
import type { PaletteItem } from './features/palette/paletteSearch'
import { DeleteStructureDialog } from './features/library/DeleteStructureDialog'
import { LibraryHome } from './features/library/LibraryHome'
import { LibrarySidebar } from './features/library/LibrarySidebar'
import { notebookForNewNote, shelfForNewNotebook } from './features/library/placement'
import {
  changeTheme,
  createNotebookOnShelf,
  createSampleTemplate,
  ensureNotebook,
  saveQuickNote,
  deleteForever,
  deleteOpenNote,
  loadLibrary,
  moveNotebookToShelf,
  restoreFromTrash,
  saveEditedNote,
  startStorageSync,
  toggleNoteFlag,
} from './state/actions'
import { useBackupStore } from './state/backupStore'
import { useEditorStore } from './state/editorStore'
import { useLibraryStore } from './state/libraryStore'
import { usePersistenceStore } from './state/persistenceStore'
import { compactNavigationQuery, useWorkspaceStore, type View } from './state/workspaceStore'
import { buildLocations, isEmptyQuery, matchesQuery, parseSearchQuery, pruneSearchCache } from './lib/search'
import { findSavedSearch } from './lib/savedSearches'
import { DAILY_NOTEBOOK, dailyNoteContent, fillTemplate, findDailyNote, isoDate } from './lib/templates'
import { deriveWikilinks, mergeLinks } from './lib/wikilinks'
import type { Note, NoteLink } from './types'
import './workspace.css'

const NO_LINKS: NoteLink[] = []
// Both Ctrl+K and ⌘K work everywhere; the hint shows the one this platform uses.
const IS_APPLE = /Mac|iPhone|iPad/.test(navigator.platform)
const PALETTE_SHORTCUT = IS_APPLE ? '⌘K' : 'Ctrl K'
const QUICK_NOTE_SHORTCUT = IS_APPLE ? '⌥N' : 'Alt N'

// Module-level, so every note card receives the same functions on every render.
const flagNote = (note: Note, flag: 'pinned' | 'favorite') => void toggleNoteFlag(note, flag)
const restoreNoteFromTrash = (note: Note) => void restoreFromTrash(note)
function confirmPermanentDelete(note: Note) {
  if (!window.confirm(`Permanently delete “${note.title || 'Untitled note'}”? This cannot be undone.`)) return
  void deleteForever(note)
}

function App() {
  const notes = useLibraryStore((state) => state.notes)
  const trash = useLibraryStore((state) => state.trash)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const libraries = useLibraryStore((state) => state.libraries)
  const shelves = useLibraryStore((state) => state.shelves)
  const tags = useLibraryStore((state) => state.tags)
  const links = useLibraryStore((state) => state.links)
  const attachedNoteIds = useLibraryStore((state) => state.attachedNoteIds)
  const settings = useLibraryStore((state) => state.settings)
  const isLoading = useLibraryStore((state) => state.isLoading)
  const refresh = useLibraryStore((state) => state.refresh)
  const view = useWorkspaceStore((state) => state.view)
  const query = useWorkspaceStore((state) => state.query)
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed)
  const navigationOpen = useWorkspaceStore((state) => state.navigationOpen)
  const isCompactNavigation = useWorkspaceStore((state) => state.isCompactNavigation)
  const error = useWorkspaceStore((state) => state.error)
  const notice = useWorkspaceStore((state) => state.notice)
  const structureToDelete = useWorkspaceStore((state) => state.structureToDelete)
  const { setView, setQuery, toggleSidebar, setNavigationOpen, setCompactNavigation, showError, showNotice } = useWorkspaceStore.getState()
  const activeNote = useEditorStore((state) => state.activeNote)
  const isCreating = useEditorStore((state) => state.isCreating)
  const editorRevision = useEditorStore((state) => state.revision)
  const changedElsewhere = useEditorStore((state) => state.changedElsewhere)
  const loadLatest = useEditorStore((state) => state.loadLatest)
  const keepMine = useEditorStore((state) => state.keepMine)
  const [showSettings, setShowSettings] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  // Kept while the quick note box is closed, until it is saved or cleared.
  const [quickDraft, setQuickDraft] = useState('')
  const quickReturnRef = useRef<HTMLElement | null>(null)
  const paletteReturnRef = useRef<HTMLElement | null>(null)
  const [shelfNotebookName, setShelfNotebookName] = useState('')
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const newNoteRef = useRef<HTMLButtonElement>(null)
  const navigationToggleRef = useRef<HTMLButtonElement>(null)
  const navigationCloseRef = useRef<HTMLButtonElement>(null)
  const pageHeadingRef = useRef<HTMLHeadingElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const focusReturnRef = useRef<HTMLElement | null>(null)
  const settingsFocusReturnRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    void loadLibrary()
    void usePersistenceStore.getState().load()
    // Fetch the editor's code straight after the first render, so the first note opens without
    // waiting for it. A failure here is reported if a note is actually opened.
    const preloadTimer = window.setTimeout(() => void preloadNoteEditor().catch(() => undefined), 0)
    const stopSync = startStorageSync()
    return () => {
      window.clearTimeout(preloadTimer)
      stopSync()
    }
  }, [])

  // Backups: once the library has loaded, and then every quarter of an hour while the app is open,
  // make an automatic backup if one is due (or work out whether to remind).
  useEffect(() => {
    if (isLoading) return
    const backups = useBackupStore.getState()
    void (backups.loaded ? backups.check() : backups.load().then(() => useBackupStore.getState().check()))
    const timer = window.setInterval(() => void useBackupStore.getState().check(), 15 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [isLoading])

  useEffect(() => {
    if (settings.theme !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [settings.theme])

  useEffect(() => {
    const media = compactNavigationQuery()
    if (!media) return
    const update = () => setCompactNavigation(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [setCompactNavigation])

  useEffect(() => {
    if (!navigationOpen || !isCompactNavigation) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => navigationCloseRef.current?.focus())
    // Escape closes the drawer wherever focus is, not only from inside it.
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setNavigationOpen(false)
      requestAnimationFrame(() => navigationToggleRef.current?.focus())
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isCompactNavigation, navigationOpen, setNavigationOpen])

  const notebookNames = useMemo(() => new Map(notebooks.map((notebook) => [notebook.id, notebook.name])), [notebooks])
  const notebookName = useCallback((note: Note) => notebookNames.get(note.notebookId ?? '') ?? 'Personal', [notebookNames])
  const graphNotes = useMemo(() => [...notes, ...trash], [notes, trash])
  const linkLabels = useMemo(() => buildNoteLinkLabels(graphNotes, notebooks), [graphNotes, notebooks])
  const noteLabel = useCallback((note: Note) => linkLabels.get(note.id) ?? (note.title || 'Untitled note'), [linkLabels])
  // [[Wikilinks]] are read from every note's text, so they are only worked out while the editor or
  // the graph is showing; start-up and the note list never pay for it. Deferred, so opening a note
  // shows the editor first and fills in text backlinks in a follow-up render.
  const needsTextLinks = useDeferredValue(Boolean(activeNote) || view === 'graph')
  const textLinks = useMemo(() => (needsTextLinks ? deriveWikilinks(notes) : NO_LINKS), [needsTextLinks, notes])
  const graphLinks = useMemo(() => mergeLinks(links, textLinks), [links, textLinks])

  const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  // Sorting depends only on the notes, not the search, so typing never re-sorts the library.
  const sortedNotes = useMemo(() => sortNotes(notes), [notes])
  const locations = useMemo(() => buildLocations(notebooks, shelves, libraries), [notebooks, shelves, libraries])
  const searchQuery = useMemo(() => parseSearchQuery(query), [query])
  // Large libraries are searched in a worker; while it answers, the previous results stay shown
  // and the count reads "Searching…". Smaller ones search here, instantly.
  // The worker starts getting a copy of the library as soon as the search box has focus.
  const [searchPrimed, setSearchPrimed] = useState(false)
  // In a large library, start that copy in idle time after loading, so even the first search finds
  // the worker ready. Focusing the search box starts it sooner if that comes first.
  const largeLibrary = graphNotes.length >= WORKER_SEARCH_THRESHOLD
  useEffect(() => {
    if (isLoading || searchPrimed || !largeLibrary) return
    const prime = () => setSearchPrimed(true)
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(prime, { timeout: 3000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(prime, 1000)
    return () => window.clearTimeout(timer)
  }, [isLoading, searchPrimed, largeLibrary])
  const workerSearch = useSearchMatches(graphNotes, searchQuery, locations, attachedNoteIds, largeLibrary, searchPrimed)

  // Once the worker holds the library, it answers every search (the list keeps its previous
  // results, or all notes, until the answer arrives). Until then search runs here, as in small
  // libraries, so the first results never wait for the worker's copy.
  const useWorkerResults = workerSearch.ready
  // Each note's place in the list it is shown in, so worker results can be put back in order.
  // Built only while worker results are in use, so loading the library does not pay for it.
  const listPosition = useMemo(() => {
    const positions = new Map<string, number>()
    if (!useWorkerResults) return positions
    sortedNotes.forEach((note, index) => positions.set(note.id, index))
    trash.forEach((note, index) => positions.set(note.id, index))
    return positions
  }, [useWorkerResults, sortedNotes, trash])
  const noteById = useMemo(
    () => (useWorkerResults ? new Map(graphNotes.map((note) => [note.id, note])) : new Map<string, Note>()),
    [useWorkerResults, graphNotes],
  )

  const filteredNotes = useMemo(() => {
    const currentNotebookId = view.startsWith('notebook:') ? view.slice('notebook:'.length) : undefined
    const currentShelfId = view.startsWith('shelf:') ? view.slice('shelf:'.length) : undefined
    const selectedTag = view.startsWith('tag:') ? view.slice('tag:'.length) : undefined
    const shelfOfNotebook = new Map(notebooks.map((notebook) => [notebook.id, notebook.shelfId]))
    const searching = !isEmptyQuery(searchQuery)
    const inView = (note: Note) => {
      if (view === 'trash' && note.deletedAt === undefined) return false
      if (view !== 'trash' && note.deletedAt !== undefined) return false
      if (view === 'favorites' && !note.favorite) return false
      if (currentNotebookId && note.notebookId !== currentNotebookId) return false
      if (currentShelfId && shelfOfNotebook.get(note.notebookId ?? '') !== currentShelfId) return false
      if (selectedTag && !(note.tags ?? []).some((tag) => tag.toLocaleLowerCase() === selectedTag)) return false
      return true
    }
    // With the worker's answer, start from the matches rather than walking the whole library:
    // at 100,000 notes, filtering every note on each keystroke was the largest remaining cost.
    if (searching && useWorkerResults) {
      if (!workerSearch.ids) return (view === 'trash' ? trash : sortedNotes).filter(inView)
      const matches: Note[] = []
      for (const id of workerSearch.ids) {
        const note = noteById.get(id)
        if (note && inView(note)) matches.push(note)
      }
      return matches.sort((a, b) => (listPosition.get(a.id) ?? 0) - (listPosition.get(b.id) ?? 0))
    }
    const ordered = view === 'trash' ? trash : sortedNotes
    return ordered.filter((note) => inView(note) && (!searching || matchesQuery(note, searchQuery, locations, attachedNoteIds)))
  }, [attachedNoteIds, listPosition, locations, noteById, notebooks, searchQuery, sortedNotes, trash, view, useWorkerResults, workerSearch.ids])

  // In the graph, the search narrows the notes shown.
  const graphMatches = useMemo(
    () => (view === 'graph' && !isEmptyQuery(searchQuery) ? new Set(filteredNotes.map((note) => note.id)) : undefined),
    [view, searchQuery, filteredNotes],
  )

  // Forget the cached search text of notes deleted for good.
  useEffect(() => {
    pruneSearchCache([...notes, ...trash].map((note) => note.id))
  }, [notes, trash])

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

  /** Runs a saved search over all notes; its own filters say where to look. */
  function runSavedSearch(savedQuery: string) {
    setQuery(savedQuery)
    navigateToView('all')
  }

  /** The header button: opens the drawer on compact screens, expands the collapsed sidebar on desktop. */
  function openNavigation() {
    if (isCompactNavigation) {
      setNavigationOpen(true)
      return
    }
    toggleSidebar()
    requestAnimationFrame(() => navigationCloseRef.current?.focus())
  }

  /** The sidebar's own button: closes the drawer, or collapses the desktop sidebar. */
  function closeSidebarPanel() {
    if (isCompactNavigation) {
      closeNavigation()
      return
    }
    toggleSidebar()
    requestAnimationFrame(() => navigationToggleRef.current?.focus())
  }

  /** Remembers what to focus when a dialog closes; the drawer's toggle if the drawer was open. */
  function focusToRestore(): HTMLElement | null {
    if (isCompactNavigation && navigationOpen) {
      setNavigationOpen(false)
      return navigationToggleRef.current
    }
    return document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

  /** Opens a new, unsaved note; like any new note, it is saved once its title or text is edited. */
  function openDraft({ title = '', content = '', notebookId }: { title?: string; content?: string; notebookId?: string } = {}) {
    focusReturnRef.current = focusToRestore()
    const now = Date.now()
    useEditorStore.getState().open({
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
      notebookId: notebookId ?? notebookForNewNote(view, notebooks, shelves),
      tags: [],
      pinned: false,
      favorite: false,
    }, { creating: true })
  }

  function openNewNote() {
    openDraft()
  }

  /** Today's note in the Daily notes notebook, started from the "Daily note" template if new. */
  async function openTodayNote() {
    const notebook = await ensureNotebook(DAILY_NOTEBOOK)
    if (!notebook) return
    const { notes: latestNotes, notebooks: latestNotebooks } = useLibraryStore.getState()
    const today = new Date()
    const existing = findDailyNote(latestNotes, latestNotebooks, today)
    if (existing) openNote(existing)
    else openDraft({ title: isoDate(today), content: dailyNoteContent(latestNotes, latestNotebooks, today), notebookId: notebook.id })
  }

  /** A new note from a template, in the notebook a new note would go to (never the Templates notebook). */
  function openFromTemplate(template: Note) {
    const now = new Date()
    const title = fillTemplate(template.title, { date: now })
    const target = notebookForNewNote(view, notebooks, shelves)
    const notebookId = target === template.notebookId ? notebookForNewNote('all', notebooks, shelves) : target
    openDraft({ title, content: fillTemplate(template.content, { date: now, title }), notebookId })
  }

  async function makeSampleTemplate() {
    const template = await createSampleTemplate()
    if (template) openNote(template)
  }

  // Stable (uses only a ref and the store), so memoized note cards keep the same handler.
  const openNote = useCallback((note: Note) => {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    useEditorStore.getState().open(note)
  }, [])

  /**
   * After a dialog closes, moves focus back to where it was, on the next frame (once the dialog has
   * left the page). If focus has already gone somewhere by then, for example into a dialog opened
   * meanwhile, it is left there: a late frame (WebKit can delay one) once moved focus out of the
   * newly opened command palette, and the next Enter pressed the button focus had moved to.
   */
  function restoreFocusAfterClose(target: () => HTMLElement | null | undefined) {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body) return
      target()?.focus()
    })
  }

  function closeEditor() {
    useEditorStore.getState().close()
    restoreFocusAfterClose(() => {
      const target = focusReturnRef.current
      return target?.isConnected ? target : newNoteRef.current
    })
  }

  function openSettings() {
    settingsFocusReturnRef.current = focusToRestore()
    setShowSettings(true)
  }

  function closeSettings() {
    setShowSettings(false)
    restoreFocusAfterClose(() => settingsFocusReturnRef.current)
  }

  function openPalette() {
    paletteReturnRef.current = focusToRestore()
    setPaletteOpen(true)
  }

  function closePalette() {
    setPaletteOpen(false)
    // Synchronously, so an item run next (opening a note) remembers this as where to return.
    const target = paletteReturnRef.current
    ;(target?.isConnected ? target : newNoteRef.current)?.focus()
  }

  async function runPaletteItem(item: PaletteItem) {
    closePalette()
    // Opened over a note: save it first, then close it, unless the item keeps it open (a theme
    // change). If saving fails, stay on the note; the editor shows why.
    if (useEditorStore.getState().activeNote && !item.keepsEditor) {
      const flush = useEditorStore.getState().flush
      if (flush && !(await flush())) return
      closeEditor()
    }
    item.run()
  }

  function openQuickCapture() {
    quickReturnRef.current = focusToRestore()
    setQuickOpen(true)
  }

  function closeQuickCapture() {
    setQuickOpen(false)
    const target = quickReturnRef.current
    restoreFocusAfterClose(() => (target?.isConnected ? target : newNoteRef.current))
  }

  // The latest versions, so the shortcut listener is not re-added on every render.
  const openPaletteRef = useRef(openPalette)
  const closePaletteRef = useRef(closePalette)
  const openQuickCaptureRef = useRef(openQuickCapture)
  useLayoutEffect(() => {
    openPaletteRef.current = openPalette
    closePaletteRef.current = closePalette
    openQuickCaptureRef.current = openQuickCapture
  })

  // Ctrl+K / ⌘K for the palette, also over the note editor, and Alt+N for a quick note when no
  // dialog is open. Other dialogs (Settings, a delete confirmation, the quick note) keep them off.
  const otherDialogOpen = showSettings || Boolean(structureToDelete) || quickOpen
  const editorOpen = Boolean(activeNote)
  useEffect(() => {
    if (otherDialogOpen) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // event.code, not event.key: on a Mac, Option+N types a character instead of "n".
      if (!editorOpen && event.code === 'KeyN' && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        if (paletteOpen) closePaletteRef.current()
        openQuickCaptureRef.current()
        return
      }
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      if (paletteOpen) closePaletteRef.current()
      else openPaletteRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [otherDialogOpen, editorOpen, paletteOpen])


  async function addNotebookOnShelfPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createNotebookOnShelf(shelfNotebookName, shelfForNewNotebook(view, notebooks, shelves), (created) => {
      setShelfNotebookName('')
      navigateToView(`notebook:${created.id}`)
    })
  }

  return (
    <div className="workspace" data-theme={theme} data-navigation-open={navigationOpen && isCompactNavigation}>
      {isCompactNavigation && navigationOpen && (
        <button className="navigation-backdrop" onClick={closeNavigation} aria-label="Close navigation" tabIndex={-1} />
      )}
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <LibrarySidebar
          onNavigate={navigateToView}
          onNewNote={openNewNote}
          onOpenSettings={openSettings}
          onOpenToday={() => void openTodayNote()}
          onRunSearch={runSavedSearch}
          onCloseNavigation={closeSidebarPanel}
          newNoteRef={newNoteRef}
          closeButtonRef={navigationCloseRef}
        />

        <main id="main-content" className="min-w-0 flex-1 p-4 sm:p-8 lg:p-10">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {/* Shown only while the navigation is hidden; the sidebar has its own close button. */}
              {(isCompactNavigation ? !navigationOpen : sidebarCollapsed) && (
                <button
                  ref={navigationToggleRef}
                  className="icon-button navigation-toggle shrink-0"
                  onClick={openNavigation}
                  aria-label={isCompactNavigation ? 'Open navigation' : 'Expand sidebar'}
                  aria-expanded={false}
                  aria-controls="workspace-navigation"
                >
                  {isCompactNavigation ? <Menu size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
                </button>
              )}
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
              <button className="palette-trigger" onClick={openPalette} aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" title={`Command palette (${PALETTE_SHORTCUT})`}>
                <TextSearch size={16} aria-hidden="true" />
                <kbd className="palette-kbd">{PALETTE_SHORTCUT}</kbd>
              </button>
              <button className="icon-button" onClick={openQuickCapture} aria-label="Quick note" aria-keyshortcuts="Alt+N" title={`Quick note (${QUICK_NOTE_SHORTCUT})`}><Zap size={18} /></button>
              <button className="icon-button" onClick={openSettings} aria-label="Open settings"><Settings size={18} /></button>
              <button className="primary-button flex items-center gap-2" onClick={openNewNote} aria-label="Create a new note"><Plus size={17} /><span className="new-note-label">New note</span></button>
            </div>
          </header>
          {error && <div role="alert" className="notice notice-error mb-5">{error}<button onClick={() => showError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}
          <BackupReminder onOpenSettings={openSettings} />
          {notice && <div role="status" className="notice mb-5">{notice}<button onClick={() => showNotice(null)} aria-label="Dismiss notice"><X size={15} /></button></div>}
          {view.startsWith('shelf:') && (
            <form className="mb-5 flex max-w-xl gap-2" onSubmit={(event) => void addNotebookOnShelfPage(event)}>
              <label className="sr-only" htmlFor="shelf-new-notebook">New notebook in {viewLabel}</label>
              <input id="shelf-new-notebook" className="small-input min-w-0 flex-1" value={shelfNotebookName} onChange={(event) => setShelfNotebookName(event.target.value)} placeholder={`New notebook in ${viewLabel}`} />
              <button className="secondary-button" type="submit"><Plus size={15} /> Add notebook</button>
            </form>
          )}
          {view.startsWith('notebook:') && (
            <div className="mb-5 max-w-xl md:hidden">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mobile-notebook-shelf">Move notebook to shelf</label>
              <select
                id="mobile-notebook-shelf"
                className="small-input w-full"
                value={activeNotebook?.shelfId ?? ''}
                onChange={(event) => void moveNotebookToShelf(view.slice(9), event.target.value)}
              >
                {shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{libraries.find((library) => library.id === shelf.libraryId)?.name ?? 'Library'} · {shelf.name}</option>)}
              </select>
            </div>
          )}
          <div className="mb-5 flex min-w-0 items-center gap-3">
            {!view.startsWith('library:') && (
              <>
                <div className="search-field flex-1">
                  <Search size={18} aria-hidden="true" />
                  <label htmlFor="note-search" className="sr-only">Search notes, libraries, shelves, notebooks, and tags</label>
                  <input ref={searchInputRef} id="note-search" type="search" value={query} onFocus={() => setSearchPrimed(true)} onChange={(event) => setQuery(event.target.value)} placeholder={'Search notes — try tag:health, notebook:work, "a phrase", -word'} />
                  {query && <button className="icon-button !h-8 !w-8" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
                  {query.trim() && <SaveSearchButton query={query} saved={findSavedSearch(settings.savedSearches, query)} />}
                  <SearchTips onAdd={(example) => {
                    setQuery(query.trim() ? `${query.trimEnd()} ${example}` : example)
                    searchInputRef.current?.focus()
                  }} />
                </div>
                <p id="note-count" className="whitespace-nowrap text-xs text-[var(--muted)] sm:text-sm" aria-live="polite">
                  {useWorkerResults && workerSearch.pending ? 'Searching…' : `${filteredNotes.length} ${filteredNotes.length === 1 ? 'note' : 'notes'}`}
                </p>
              </>
            )}
          </div>
          {isLoading ? (
            <p role="status" className="py-16 text-center text-[var(--muted)]">Loading your notes…</p>
          ) : view.startsWith('library:') ? (
            <LibraryHome libraryId={view.slice(8)} onNavigate={navigateToView} />
          ) : view === 'graph' ? (
            <KnowledgeGraph
              notes={graphNotes}
              links={graphLinks}
              matchingIds={graphMatches}
              theme={theme}
              noteLabel={noteLabel}
              onOpenNote={openNote}
            />
          ) : filteredNotes.length ? (
            <NoteGrid
              notes={filteredNotes}
              label={`${viewLabel} notes`}
              notebookName={notebookName}
              highlights={searchQuery.highlights}
              isTrash={view === 'trash'}
              onOpen={openNote}
              onFlag={flagNote}
              onRestore={restoreNoteFromTrash}
              onPermanentDelete={confirmPermanentDelete}
            />
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
        <LazyNoteEditor
          key={`${activeNote.id}:${editorRevision}`}
          note={activeNote}
          isCreating={isCreating}
          notebooks={notebooks}
          tags={tags}
          notes={notes}
          trash={trash}
          onSave={saveEditedNote}
          onRefresh={refresh}
          onClose={closeEditor}
          onOpenNote={openNote}
          onDelete={() => deleteOpenNote(activeNote)}
          onError={showError}
          changedElsewhere={changedElsewhere}
          onLoadLatest={loadLatest}
          onKeepMine={keepMine}
          linkLabels={linkLabels}
          textLinks={textLinks}
        />
      )}
      {showSettings && <SettingsDialog onClose={closeSettings} />}
      {quickOpen && (
        <QuickCapture draft={quickDraft} onDraftChange={setQuickDraft} onSave={saveQuickNote} onClose={closeQuickCapture} shortcut={QUICK_NOTE_SHORTCUT} saveShortcut={IS_APPLE ? '⌘ Enter' : 'Ctrl Enter'} />
      )}
      {paletteOpen && (
        <CommandPalette
          sources={{ notes, libraries, shelves, notebooks, tags, savedSearches: settings.savedSearches ?? [], theme: settings.theme, sidebarCollapsed: isCompactNavigation ? undefined : sidebarCollapsed }}
          handlers={{
            newNote: openNewNote,
            openSettings,
            setTheme: (theme) => void changeTheme(theme),
            toggleSidebar,
            goTo: (nextView) => {
              navigateToView(nextView)
              requestAnimationFrame(() => pageHeadingRef.current?.focus())
            },
            runSearch: (savedQuery) => {
              runSavedSearch(savedQuery)
              requestAnimationFrame(() => pageHeadingRef.current?.focus())
            },
            openNote,
            openToday: () => void openTodayNote(),
            newFromTemplate: openFromTemplate,
            createTemplate: () => void makeSampleTemplate(),
            quickCapture: openQuickCapture,
          }}
          onClose={closePalette}
          onRun={(item) => void runPaletteItem(item)}
        />
      )}
      {structureToDelete && <DeleteStructureDialog target={structureToDelete} />}
    </div>
  )
}

export default App
