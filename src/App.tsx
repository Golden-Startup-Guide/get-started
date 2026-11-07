import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { themeChoice } from './lib/theme'
import {
  FileText,
  Menu,
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
import { UpdateBanner } from './features/app/UpdateBanner'
import { readLaunchRequest } from './features/app/launchRequest'
import { CommandPalette } from './features/palette/CommandPalette'
import type { PaletteItem } from './features/palette/paletteSearch'
import { DeleteStructureDialog } from './features/library/DeleteStructureDialog'
import { HomePage } from './features/home/HomePage'
import { LazyHandbookNote } from './features/notes/LazyHandbookNote'
import { CORE_CATALOG, useCoreStore } from './state/coreStore'
import { isCoreId } from './lib/core'
import { useReadingStore } from './state/readingStore'
import { LibrarySidebar } from './features/library/LibrarySidebar'
import { Breadcrumb, type Crumb } from './features/library/Breadcrumb'
import { CollapsedRail } from './features/library/CollapsedRail'
import { useRouting } from './features/app/useRouting'
import { isHandbookView, notebookForNewNote } from './features/library/placement'
import {
  changeReaderSettings,
  changeTheme,
  createSampleTemplate,
  ensureNotebook,
  saveClip,
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
import { useLanguageStore } from './state/languageStore'
import { runIntegrityCheck, useIntegrityStore } from './state/integrityStore'
import { useEditorStore } from './state/editorStore'
import { useLibraryStore } from './state/libraryStore'
import { usePersistenceStore } from './state/persistenceStore'
import { compactNavigationQuery, useWorkspaceStore, type View } from './state/workspaceStore'
import { buildLocations, isEmptyQuery, matchesQuery, parseSearchQuery, pruneSearchCache } from './lib/search'
import { findSavedSearch } from './lib/savedSearches'
import { DAILY_NOTEBOOK, dailyNoteContent, fillTemplate, findDailyNote, isoDate } from './lib/templates'
import { deriveWikilinks, mergeLinks } from './lib/wikilinks'
import { mentionsOf, relatedNotes } from './lib/related'
import { DEFAULT_READER_SETTINGS, type CoreNote, type Note, type NoteLink } from './types'
import './workspace.css'
import { t, tp } from './i18n/i18n'

const NO_LINKS: NoteLink[] = []

// Pages other than Home and the note lists come in one chunk, fetched after start-up (see
// features/pagesChunk.ts), so the start-up script stays small as the library grows.
const loadPages = () => import('./features/pagesChunk')
const LibraryPage = lazy(() => loadPages().then((pages) => ({ default: pages.LibraryPage })))
const ShelfPage = lazy(() => loadPages().then((pages) => ({ default: pages.ShelfPage })))
const HandbookNotebookPage = lazy(() => loadPages().then((pages) => ({ default: pages.HandbookNotebookPage })))
const SearchPage = lazy(() => loadPages().then((pages) => ({ default: pages.SearchPage })))
const KnowledgeGraph = lazy(() => loadPages().then((pages) => ({ default: pages.KnowledgeGraph })))
// Both Ctrl+K and ⌘K work everywhere; the hint shows the one this platform uses.
const IS_APPLE = /Mac|iPhone|iPad/.test(navigator.platform)
const PALETTE_SHORTCUT = IS_APPLE ? '⌘K' : 'Ctrl K'
const QUICK_NOTE_SHORTCUT = IS_APPLE ? '⌥N' : 'Alt N'

// Module-level, so every note card receives the same functions on every render.
const flagNote = (note: Note, flag: 'pinned' | 'favorite') => void toggleNoteFlag(note, flag)
const restoreNoteFromTrash = (note: Note) => void restoreFromTrash(note)
function confirmPermanentDelete(note: Note) {
  if (!window.confirm(t('Permanently delete “{title}”? This cannot be undone.', { title: note.title || t('Untitled note') }))) return
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
  const coreNotes = useCoreStore((state) => state.notes)
  const coreFailed = useCoreStore((state) => state.failed)
  const readingRecords = useReadingStore((state) => state.records)
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
  // Open again after a language change from Settings, which draws the app afresh.
  const [showSettings, setShowSettings] = useState(() => {
    const reopen = useLanguageStore.getState().reopenSettings
    if (reopen) useLanguageStore.setState({ reopenSettings: false })
    return reopen
  })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  // Kept while the quick note box is closed, until it is saved or cleared.
  const [quickDraft, setQuickDraft] = useState('')
  const quickReturnRef = useRef<HTMLElement | null>(null)
  const paletteReturnRef = useRef<HTMLElement | null>(null)
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
    const preloadTimer = window.setTimeout(() => {
      void preloadNoteEditor().catch(() => undefined)
      void loadPages().catch(() => undefined)
    }, 0)
    const stopSync = startStorageSync()
    return () => {
      window.clearTimeout(preloadTimer)
      stopSync()
    }
  }, [])

  // The handbooks' text, once the library has loaded and the page is idle (a handbook page or
  // address loads it at once).
  useEffect(() => {
    if (isLoading) return
    const load = () => void useCoreStore.getState().load()
    if (isHandbookView(useWorkspaceStore.getState().view)) return load()
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(load, { timeout: 4000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(load, 1500)
    return () => window.clearTimeout(timer)
  }, [isLoading])
  useEffect(() => {
    if (isHandbookView(view)) void useCoreStore.getState().load()
  }, [view])
  // What has been read, and how far: for Continue reading and the reader's place in each note.
  useEffect(() => {
    if (!isLoading) void useReadingStore.getState().refresh()
  }, [isLoading])

  // Once the library has loaded, check it for damage (in idle time, so start-up never waits).
  useEffect(() => {
    if (isLoading || useIntegrityStore.getState().checkedAt) return
    const run = () => void runIntegrityCheck()
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(run, { timeout: 5000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(run, 1000)
    return () => window.clearTimeout(timer)
  }, [isLoading])

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

  // Handbook and personal libraries, shelves, and notebooks, for finding names and places; changes
  // only ever go to the personal ones.
  const allLibraries = useMemo(() => [...CORE_CATALOG.libraries, ...libraries], [libraries])
  const allShelves = useMemo(() => [...CORE_CATALOG.shelves, ...shelves], [shelves])
  const allNotebooks = useMemo(() => [...CORE_CATALOG.notebooks, ...notebooks], [notebooks])
  // Every note a [[link]] can reach: personal notes first, then handbook notes.
  const linkableNotes = useMemo(() => (coreNotes.length ? [...notes, ...coreNotes] : notes), [notes, coreNotes])
  const notebookNames = useMemo(() => new Map(allNotebooks.map((notebook) => [notebook.id, notebook.name])), [allNotebooks])
  const notebookName = useCallback((note: Note) => notebookNames.get(note.notebookId ?? '') ?? 'Personal', [notebookNames])
  const graphNotes = useMemo(() => [...notes, ...trash], [notes, trash])
  const linkLabels = useMemo(() => buildNoteLinkLabels(graphNotes, notebooks), [graphNotes, notebooks])
  const noteLabel = useCallback((note: Note) => linkLabels.get(note.id) ?? (note.title || t('Untitled note')), [linkLabels])
  // [[Wikilinks]] are read from every note's text, so they are only worked out while the editor or
  // the graph is showing; start-up and the note list never pay for it. Deferred, so opening a note
  // shows the editor first and fills in text backlinks in a follow-up render.
  const needsTextLinks = useDeferredValue(Boolean(activeNote) || view === 'graph')
  const textLinks = useMemo(() => (needsTextLinks ? deriveWikilinks(notes) : NO_LINKS), [needsTextLinks, notes])
  const graphLinks = useMemo(() => mergeLinks(links, textLinks), [links, textLinks])
  // The same across personal and handbook notes, for the note map and a handbook note's related
  // notes and mentions: only while one of those is showing, and once the handbooks have loaded.
  const showingHandbookNote = Boolean(activeNote && isCoreId(activeNote.id))
  const needsWideLinks = useDeferredValue((view === 'graph' || showingHandbookNote) && coreNotes.length > 0)
  const wideLinks = useMemo(
    () => (needsWideLinks ? mergeLinks(links, deriveWikilinks(linkableNotes)) : NO_LINKS),
    [needsWideLinks, links, linkableNotes],
  )
  const mapNotes = useMemo(() => (coreNotes.length ? [...graphNotes, ...coreNotes] : graphNotes), [graphNotes, coreNotes])
  const graphFocusId = useWorkspaceStore((state) => state.graphFocusId)

  const resolvedTheme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme
  // Soft paper replaces the light colours; 'system' follows the device between light and dark.
  const theme = resolvedTheme === 'light' && settings.paper ? 'paper' : resolvedTheme

  // Sorting depends only on the notes, not the search, so typing never re-sorts the library.
  const sortedNotes = useMemo(() => sortNotes(notes), [notes])
  const locations = useMemo(() => buildLocations(allNotebooks, allShelves, allLibraries), [allNotebooks, allShelves, allLibraries])
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
    // A handbook library, shelf, or notebook shows its handbook notes, in notebook order.
    if (isHandbookView(view)) {
      const shelfOfCoreNotebook = new Map(CORE_CATALOG.notebooks.map((notebook) => [notebook.id, notebook.shelfId]))
      const libraryOfCoreShelf = new Map(CORE_CATALOG.shelves.map((shelf) => [shelf.id, shelf.libraryId]))
      const id = view.slice(view.indexOf(':') + 1)
      return coreNotes.filter((note) => {
        const shelfId = shelfOfCoreNotebook.get(note.notebookId)
        const inScope = note.notebookId === id || shelfId === id || libraryOfCoreShelf.get(shelfId ?? '') === id
        return inScope && (!searching || matchesQuery(note, searchQuery, locations, attachedNoteIds))
      })
    }
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
  }, [attachedNoteIds, coreNotes, listPosition, locations, noteById, notebooks, searchQuery, sortedNotes, trash, view, useWorkerResults, workerSearch.ids])

  // In the graph, the search narrows the notes shown.
  const graphMatches = useMemo(
    () => (view === 'graph' && !isEmptyQuery(searchQuery) ? new Set(filteredNotes.map((note) => note.id)) : undefined),
    [view, searchQuery, filteredNotes],
  )

  // Forget the cached search text of notes deleted for good.
  useEffect(() => {
    pruneSearchCache([...notes, ...trash, ...coreNotes].map((note) => note.id))
  }, [notes, trash, coreNotes])

  const viewLabel = view === 'home'
    ? t('Home')
    : view === 'search'
    ? t('Search')
    : view === 'all'
    ? t('All Notes')
    : view === 'favorites'
      ? t('Favorites')
      : view === 'trash'
        ? t('Trash')
      : view === 'graph'
        ? t('Note map')
      : view.startsWith('library:')
        ? allLibraries.find((item) => item.id === view.slice(8))?.name ?? t('Library')
      : view.startsWith('shelf:')
        ? allShelves.find((item) => item.id === view.slice(6))?.name ?? t('Shelf')
      : view.startsWith('notebook:')
        ? allNotebooks.find((item) => item.id === view.slice(9))?.name ?? t('Notebook')
        : tags.find((item) => item.id === view.slice(4))?.label ?? t('Tag')
  const activeShelf = view.startsWith('shelf:')
    ? allShelves.find((shelf) => shelf.id === view.slice(6))
    : undefined
  const activeNotebook = view.startsWith('notebook:')
    ? allNotebooks.find((notebook) => notebook.id === view.slice(9))
    : undefined
  const activeNotebookShelf = activeNotebook
    ? allShelves.find((shelf) => shelf.id === activeNotebook.shelfId)
    : undefined
  const handbookView = isHandbookView(view)
  // What a handbook library, shelf, or notebook is for, under its title.
  const handbookDescription = handbookView
    ? [...CORE_CATALOG.libraries, ...CORE_CATALOG.shelves, ...CORE_CATALOG.notebooks].find((item) => item.id === view.slice(view.indexOf(':') + 1))?.description
    : undefined
  const libraryCrumb = (libraryId: string): Crumb => ({
    label: allLibraries.find((library) => library.id === libraryId)?.name ?? t('Library'),
    view: `library:${libraryId}`,
  })
  // The levels above the current page; the page itself is the heading.
  const breadcrumbTrail: Crumb[] = view === 'home'
    ? []
    : [
        { label: t('Home'), view: 'home' },
        ...(activeShelf ? [libraryCrumb(activeShelf.libraryId)] : []),
        ...(activeNotebookShelf ? [libraryCrumb(activeNotebookShelf.libraryId), { label: activeNotebookShelf.name, view: `shelf:${activeNotebookShelf.id}` as View }] : []),
      ]

  // A handbook note's [[links]] reach handbook notes first, then personal ones.
  const handbookLinkTargets = useMemo(() => [...coreNotes, ...notes], [coreNotes, notes])
  // What mentions the handbook note open, and what is near it (not the notes before and after it,
  // which the reader already names).
  const openHandbookNote = showingHandbookNote ? activeNote : null
  const handbookMentions = useMemo(
    () => (openHandbookNote ? mentionsOf(openHandbookNote.id, wideLinks, new Map(handbookLinkTargets.map((item) => [item.id, item]))) : []),
    [openHandbookNote, wideLinks, handbookLinkTargets],
  )
  const handbookRelated = useMemo(() => {
    if (!openHandbookNote) return []
    const siblings = coreNotes.filter((item) => item.notebookId === openHandbookNote.notebookId)
    const index = siblings.findIndex((item) => item.id === openHandbookNote.id)
    const shelfOfNotebook = new Map(allNotebooks.map((notebook) => [notebook.id, notebook.shelfId]))
    return relatedNotes({
      note: openHandbookNote,
      notes: handbookLinkTargets,
      links: wideLinks,
      shelfOf: (notebookId) => shelfOfNotebook.get(notebookId ?? ''),
      exclude: new Set([siblings[index - 1]?.id, siblings[index + 1]?.id].filter((id): id is string => Boolean(id))),
    })
  }, [openHandbookNote, coreNotes, allNotebooks, handbookLinkTargets, wideLinks])

  // Remember what was opened, for "Continue reading". A new note counts from when it is next opened.
  const openedNoteId = activeNote && !isCreating ? activeNote.id : undefined
  useEffect(() => {
    if (openedNoteId) void useReadingStore.getState().opened(openedNoteId)
  }, [openedNoteId])

  useRouting({
    ready: !isLoading,
    // After Back or Forward, move focus to the page's heading so the new page is announced; an
    // open note's editor takes focus itself.
    onHistoryMove: (route) => {
      if (!route.note) requestAnimationFrame(() => pageHeadingRef.current?.focus())
    },
  })

  // The browser tab and history show the page, or the open note.
  useEffect(() => {
    const appName = t('The Personal Knowledge Library')
    const page = activeNote ? activeNote.title.trim() || t('Untitled note') : view === 'home' ? '' : viewLabel
    document.title = page ? `${page} — ${appName}` : appName
  }, [activeNote, view, viewLabel])

  function closeNavigation() {
    setNavigationOpen(false)
    requestAnimationFrame(() => navigationToggleRef.current?.focus())
  }

  function navigateToView(nextView: View) {
    // A search made on the Search page stays there (Back returns to it with its results) rather
    // than filtering the next page.
    if (view === 'search' && nextView !== 'search') setQuery('')
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

  /** "Library / Shelf / Notebook" for any note. */
  function placeOfNote(note: Note): string {
    const notebook = allNotebooks.find((item) => item.id === note.notebookId)
    const shelf = allShelves.find((item) => item.id === notebook?.shelfId)
    const library = allLibraries.find((item) => item.id === shelf?.libraryId)
    return [library?.name, shelf?.name, notebook?.name].filter(Boolean).join(' / ')
  }

  /** Closes the note and shows the note map around it. */
  function showOnMap(note: Note) {
    useWorkspaceStore.getState().setGraphFocus(note.id)
    closeEditor()
    navigateToView('graph')
  }

  /** "Library / Shelf / Notebook" for a handbook note. */
  function handbookLocation(note: CoreNote): string {
    const notebook = CORE_CATALOG.notebooks.find((item) => item.id === note.notebookId)
    const shelf = CORE_CATALOG.shelves.find((item) => item.id === notebook?.shelfId)
    const library = CORE_CATALOG.libraries.find((item) => item.id === shelf?.libraryId)
    return [library?.name, shelf?.name, notebook?.name].filter(Boolean).join(' / ')
  }

  /** A personal, editable copy of a handbook note, ending with a link back to it. */
  function copyHandbookNote(note: CoreNote) {
    const notebookId = notebookForNewNote('all', notebooks, shelves)
    openDraft({ title: note.title, content: `${note.content}

---
${t('Copied from the handbook note [[{title}]].', { title: note.title })}
`, notebookId })
  }

  /** A new personal note about a handbook note, linking to it. */
  function writeAboutHandbookNote(note: CoreNote) {
    const notebookId = notebookForNewNote('all', notebooks, shelves)
    openDraft({ title: t('Notes on {title}', { title: note.title }), content: `${t('About [[{title}]]:', { title: note.title })}

`, notebookId })
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
    // Going from note to note inside an open one (a link, Previous or Next, Back) keeps where to
    // return when it finally closes: the link pressed is gone by then, and focus would fall back
    // to the New note button.
    const active = document.activeElement
    const fromOpenNote = active instanceof HTMLElement && active.closest('[role="dialog"][aria-modal="true"]') !== null
    const nothingFocused = !active || active === document.body
    if (!fromOpenNote && !(nothingFocused && useEditorStore.getState().activeNote)) {
      focusReturnRef.current = active instanceof HTMLElement ? active : null
    }
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
  const openNewNoteRef = useRef(openNewNote)
  const openTodayNoteRef = useRef(openTodayNote)
  useLayoutEffect(() => {
    openPaletteRef.current = openPalette
    closePaletteRef.current = closePalette
    openQuickCaptureRef.current = openQuickCapture
    openNewNoteRef.current = openNewNote
    openTodayNoteRef.current = openTodayNote
  })

  // Opened from an app shortcut, the web clipper, or Android's share menu: do what was asked
  // once the library has loaded, then clear the request from the address so a reload does not
  // repeat it.
  const launchRef = useRef(true)
  useEffect(() => {
    if (isLoading || !launchRef.current) return
    launchRef.current = false
    const request = readLaunchRequest(window.location.search)
    if (!request) return
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`)
    if (request.kind === 'clip') void saveClip(request)
    else if (request.kind === 'new') openNewNoteRef.current()
    else if (request.kind === 'quick') openQuickCaptureRef.current()
    else void openTodayNoteRef.current()
  }, [isLoading])

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


  return (
    <div className="workspace" data-theme={theme} data-navigation-open={navigationOpen && isCompactNavigation}>
      {isCompactNavigation && navigationOpen && (
        <button className="navigation-backdrop" onClick={closeNavigation} aria-label={t("Close navigation")} tabIndex={-1} />
      )}
      <a href="#main-content" className="skip-link" onClick={(event) => {
        // The address holds the page, so move focus without following the link.
        event.preventDefault()
        document.getElementById('main-content')?.focus()
      }}>{t('Skip to main content')}</a>
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        {!isCompactNavigation && sidebarCollapsed && (
          <CollapsedRail
            view={view}
            expandRef={navigationToggleRef}
            onExpand={openNavigation}
            onNavigate={navigateToView}
            onNewNote={openNewNote}
            onOpenToday={() => void openTodayNote()}
            onOpenSettings={openSettings}
          />
        )}
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

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-4 sm:p-8 lg:p-10">
          <header className="workspace-header mb-8 flex items-center justify-between gap-4">
            <div className="workspace-header-start flex min-w-0 items-center gap-3">
              {/* On narrow screens, while the drawer is closed; wide screens use the sidebar or its rail. */}
              {isCompactNavigation && !navigationOpen && (
                <button
                  ref={navigationToggleRef}
                  className="icon-button navigation-toggle shrink-0"
                  onClick={openNavigation}
                  aria-label={t("Open navigation")}
                  aria-expanded={false}
                  aria-controls="workspace-navigation"
                >
                  <Menu size={18} aria-hidden="true" />
                </button>
              )}
              <div className="workspace-title min-w-0">
                {breadcrumbTrail.length > 0
                  ? <Breadcrumb trail={breadcrumbTrail} current={viewLabel} onNavigate={navigateToView} />
                  : <p className="section-label mb-1">{t("Personal Knowledge Library")}</p>}
                <h1 ref={pageHeadingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight sm:text-3xl">{view === 'home' ? t('Welcome to your library') : viewLabel}</h1>
                {handbookDescription && <p className="handbook-description">{handbookDescription}</p>}
              </div>
            </div>
            <div className="workspace-actions flex items-center gap-2">
              {/* Named by its content, so the shortcut people see is part of the name voice control hears. */}
              <button className="palette-trigger" onClick={openPalette} aria-keyshortcuts="Control+K Meta+K" title={t("Command palette ({PALETTE_SHORTCUT})", { PALETTE_SHORTCUT })}>
                <TextSearch size={16} aria-hidden="true" />
                <span className="sr-only">{t("Open command palette")} </span>
                <kbd className="palette-kbd">{PALETTE_SHORTCUT}</kbd>
              </button>
              <button className="icon-button" onClick={openQuickCapture} aria-label={t("Quick note")} aria-keyshortcuts="Alt+N" title={t("Quick note ({QUICK_NOTE_SHORTCUT})", { QUICK_NOTE_SHORTCUT })}><Zap size={18} /></button>
              <button className="icon-button" onClick={openSettings} aria-label={t("Open settings")}><Settings size={18} /></button>
              <button className="primary-button flex items-center gap-2" onClick={openNewNote} aria-label={t("Create a new note")}><Plus size={17} /><span className="new-note-label">{t("New note")}</span></button>
            </div>
          </header>
          {error && <div role="alert" className="notice notice-error mb-5">{error}<button onClick={() => showError(null)} aria-label={t("Dismiss error")}><X size={15} /></button></div>}
          <UpdateBanner />
          <BackupReminder onOpenSettings={openSettings} />
          {notice && <div role="status" className="notice mb-5">{notice}<button onClick={() => showNotice(null)} aria-label={t("Dismiss notice")}><X size={15} /></button></div>}
          {view.startsWith('notebook:') && !handbookView && (
            <div className="mb-5 max-w-xl md:hidden">
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]" htmlFor="mobile-notebook-shelf">{t("Move notebook to shelf")}</label>
              <select
                id="mobile-notebook-shelf"
                className="small-input w-full"
                value={activeNotebook?.shelfId ?? ''}
                onChange={(event) => void moveNotebookToShelf(view.slice(9), event.target.value)}
              >
                {shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{libraries.find((library) => library.id === shelf.libraryId)?.name ?? t("Library")} · {shelf.name}</option>)}
              </select>
            </div>
          )}
          <div className="mb-5 flex min-w-0 items-center gap-3">
            {/* Library, shelf, and handbook pages are for reading and choosing; notes are searched where they are listed. */}
            {!view.startsWith('library:') && !view.startsWith('shelf:') && !handbookView && view !== 'home' && view !== 'search' && (
              <>
                <div className="search-field flex-1">
                  <Search size={18} aria-hidden="true" />
                  <label htmlFor="note-search" className="sr-only">{t("Search notes, libraries, shelves, notebooks, and tags")}</label>
                  <input ref={searchInputRef} id="note-search" type="search" value={query} onFocus={() => setSearchPrimed(true)} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search these notes")} />
                  {query && <button className="icon-button !h-8 !w-8" onClick={() => setQuery('')} aria-label={t("Clear search")}><X size={15} /></button>}
                  {query.trim() && <SaveSearchButton query={query} saved={findSavedSearch(settings.savedSearches, query)} />}
                  <SearchTips onAdd={(example) => {
                    setQuery(query.trim() ? `${query.trimEnd()} ${example}` : example)
                    searchInputRef.current?.focus()
                  }} />
                </div>
                <p id="note-count" className="whitespace-nowrap text-xs text-[var(--muted)] sm:text-sm" aria-live="polite">
                  {useWorkerResults && workerSearch.pending ? t("Searching…") : tp(filteredNotes.length, '{count} note', '{count} notes')}
                </p>
              </>
            )}
          </div>
          {/* The pages loaded after start-up (see loadPages) show this only if their code is not ready yet. */}
          <Suspense fallback={<p role="status" className="py-16 text-center text-[var(--muted)]">{t('Loading…')}</p>}>
          {view === 'home' ? (
            // Drawn at once, before the library has loaded: the handbooks need no database.
            <HomePage onNavigate={navigateToView} onOpenNote={openNote} />
          ) : isLoading ? (
            <p role="status" className="py-16 text-center text-[var(--muted)]">{t("Loading your notes…")}</p>
          ) : view === 'search' ? (
            <SearchPage
              query={query}
              searchQuery={searchQuery}
              personalMatches={filteredNotes}
              searching={useWorkerResults && workerSearch.pending}
              onQuery={setQuery}
              onNavigate={navigateToView}
              onOpenNote={openNote}
            />
          ) : view.startsWith('library:') ? (
            <LibraryPage libraryId={view.slice(8)} onNavigate={navigateToView} onOpenNote={openNote} />
          ) : view.startsWith('shelf:') ? (
            <ShelfPage shelfId={view.slice(6)} onNavigate={navigateToView} onOpenNote={openNote} />
          ) : handbookView && coreFailed ? (
            <p role="status" className="py-16 text-center text-[var(--muted)]">
              {t('The handbooks could not be loaded. Connect to the internet once so the app can finish installing, then reload.')}
            </p>
          ) : handbookView ? (
            <HandbookNotebookPage notebookId={view.slice(9)} onNavigate={navigateToView} onOpenNote={openNote} />
          ) : view === 'graph' ? (
            <KnowledgeGraph
              key={graphFocusId ?? 'map'}
              initialFocusId={graphFocusId ?? readingRecords.find((record) => mapNotes.some((note) => note.id === record.noteId))?.noteId}
              notes={mapNotes}
              links={coreNotes.length ? wideLinks : graphLinks}
              libraryNotes={graphNotes}
              libraryLinks={graphLinks}
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
              <h2 className="mt-4 text-lg font-semibold">{query ? t("No matching notes") : view === 'favorites' ? t("No favorites yet") : view === 'trash' ? t("Trash is empty") : t("A little space to think.")}</h2>
              <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">{query ? t("Try another search term or clear your filters.") : view === 'trash' ? t("Notes you move to Trash can be restored or permanently deleted here.") : t("Capture an idea, a reminder, or anything you want to remember.")}</p>
              {!query && view !== 'favorites' && view !== 'trash' && <button className="primary-button mt-5" onClick={openNewNote}><Plus size={16} /> {t("Create a note")}</button>}
            </div>
          )}
          </Suspense>
          <div className="mt-8 flex items-center justify-between md:hidden">
            <span className="text-xs text-[var(--muted)]">{tp(notebooks.length, '{count} notebook', '{count} notebooks')} · {tp(tags.length, '{count} tag', '{count} tags')}</span>
            <button className="nav-button flex items-center gap-2" onClick={openSettings}><Settings size={15} /> {t("Settings")}</button>
          </div>
        </main>
      </div>

      {activeNote && isCoreId(activeNote.id) ? (
        <LazyHandbookNote
          key={activeNote.id}
          note={activeNote as CoreNote}
          onError={showError}
          notebookNotes={coreNotes.filter((note) => note.notebookId === activeNote.notebookId)}
          settings={settings.reader ?? DEFAULT_READER_SETTINGS}
          theme={themeChoice(settings)}
          initialPosition={readingRecords.find((record) => record.noteId === activeNote.id)?.position}
          onSettings={(reader) => void changeReaderSettings(reader)}
          onTheme={(choice) => void changeTheme(choice)}
          onPosition={(noteId, position) => void useReadingStore.getState().savePosition(noteId, position)}
          mentions={handbookMentions}
          related={handbookRelated}
          pathOf={placeOfNote}
          onShowOnMap={() => showOnMap(activeNote)}
          location={handbookLocation(activeNote as CoreNote)}
          notes={handbookLinkTargets}
          onOpenNote={(note, section) => {
            useEditorStore.getState().setPendingSection(section ?? null)
            openNote(note)
          }}
          onClose={closeEditor}
          onMakeCopy={() => copyHandbookNote(activeNote as CoreNote)}
          onWriteAbout={() => writeAboutHandbookNote(activeNote as CoreNote)}
        />
      ) : activeNote && (
        <LazyNoteEditor
          key={`${activeNote.id}:${editorRevision}`}
          note={activeNote}
          isCreating={isCreating}
          notebooks={notebooks}
          tags={tags}
          notes={linkableNotes}
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
          sources={{ notes, libraries, shelves, notebooks, tags, savedSearches: settings.savedSearches ?? [], theme: themeChoice(settings), sidebarCollapsed: isCompactNavigation ? undefined : sidebarCollapsed }}
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
