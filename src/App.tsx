import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  FileText,
  Menu,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { buildNoteLinkLabels, sortNotes } from './features/notes/noteDisplay'
import { NoteGrid } from './features/notes/NoteGrid'
import { LazyNoteEditor } from './features/notes/LazyNoteEditor'
import { preloadNoteEditor } from './features/notes/noteEditorChunk'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { KnowledgeGraph } from './features/graph/KnowledgeGraph'
import { DeleteStructureDialog } from './features/library/DeleteStructureDialog'
import { LibraryHome } from './features/library/LibraryHome'
import { LibrarySidebar } from './features/library/LibrarySidebar'
import { notebookForNewNote, shelfForNewNotebook } from './features/library/placement'
import {
  createNotebookOnShelf,
  deleteForever,
  deleteOpenNote,
  loadLibrary,
  moveNotebookToShelf,
  restoreFromTrash,
  saveEditedNote,
  startStorageSync,
  toggleNoteFlag,
} from './state/actions'
import { useEditorStore } from './state/editorStore'
import { useLibraryStore } from './state/libraryStore'
import { usePersistenceStore } from './state/persistenceStore'
import { compactNavigationQuery, useWorkspaceStore, type View } from './state/workspaceStore'
import { deriveWikilinks, mergeLinks } from './lib/wikilinks'
import type { Note, NoteLink } from './types'
import './workspace.css'

const NO_LINKS: NoteLink[] = []

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
  const [shelfNotebookName, setShelfNotebookName] = useState('')
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const newNoteRef = useRef<HTMLButtonElement>(null)
  const navigationToggleRef = useRef<HTMLButtonElement>(null)
  const navigationCloseRef = useRef<HTMLButtonElement>(null)
  const pageHeadingRef = useRef<HTMLHeadingElement>(null)
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

  function openNewNote() {
    focusReturnRef.current = focusToRestore()
    const now = Date.now()
    useEditorStore.getState().open({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
      notebookId: notebookForNewNote(view, notebooks, shelves),
      tags: [],
      pinned: false,
      favorite: false,
    }, { creating: true })
  }

  // Stable (uses only a ref and the store), so memoized note cards keep the same handler.
  const openNote = useCallback((note: Note) => {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    useEditorStore.getState().open(note)
  }, [])

  function closeEditor() {
    useEditorStore.getState().close()
    requestAnimationFrame(() => {
      const target = focusReturnRef.current
      ;(target?.isConnected ? target : newNoteRef.current)?.focus()
    })
  }

  function openSettings() {
    settingsFocusReturnRef.current = focusToRestore()
    setShowSettings(true)
  }

  function closeSettings() {
    setShowSettings(false)
    requestAnimationFrame(() => settingsFocusReturnRef.current?.focus())
  }

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
              <button className="icon-button" onClick={openSettings} aria-label="Open settings"><Settings size={18} /></button>
              <button className="primary-button flex items-center gap-2" onClick={openNewNote} aria-label="Create a new note"><Plus size={17} /><span className="new-note-label">New note</span></button>
            </div>
          </header>
          {error && <div role="alert" className="notice notice-error mb-5">{error}<button onClick={() => showError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}
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
            {view !== 'graph' && !view.startsWith('library:') && (
              <>
                <div className="search-field flex-1">
                  <Search size={18} aria-hidden="true" />
                  <label htmlFor="note-search" className="sr-only">Search notes, libraries, shelves, notebooks, and tags</label>
                  <input id="note-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, content, libraries, shelves, notebooks, or tags..." />
                  {query && <button className="icon-button !h-8 !w-8" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>}
                </div>
                <p id="note-count" className="whitespace-nowrap text-xs text-[var(--muted)] sm:text-sm" aria-live="polite">
                  {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
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
              noteLabel={noteLabel}
              onOpenNote={openNote}
            />
          ) : filteredNotes.length ? (
            <NoteGrid
              notes={filteredNotes}
              label={`${viewLabel} notes`}
              notebookName={notebookName}
              query={query}
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
      {structureToDelete && <DeleteStructureDialog target={structureToDelete} />}
    </div>
  )
}

export default App
