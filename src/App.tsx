import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  FileText,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { getNoteLinkLabel, sortNotes } from './features/notes/noteDisplay'
import { NoteCard } from './features/notes/NoteCard'
import { NoteEditor } from './features/notes/NoteEditor'
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
import type { Note } from './types'
import './workspace.css'

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
    return startStorageSync()
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
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isCompactNavigation, navigationOpen])

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

  function toggleNavigation() {
    if (isCompactNavigation) setNavigationOpen(!navigationOpen)
    else toggleSidebar()
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

  function openNote(note: Note) {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    useEditorStore.getState().open(note)
  }

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

  function handlePermanentDelete(note: Note) {
    if (!window.confirm(`Permanently delete “${note.title || 'Untitled note'}”? This cannot be undone.`)) return
    void deleteForever(note)
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
          onCloseNavigation={closeNavigation}
          newNoteRef={newNoteRef}
          closeButtonRef={navigationCloseRef}
        />

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
                <p className="whitespace-nowrap text-xs text-[var(--muted)] sm:text-sm" aria-live="polite">
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
                  onFlag={(flag) => void toggleNoteFlag(note, flag)}
                  onRestore={() => void restoreFromTrash(note)}
                  onPermanentDelete={() => handlePermanentDelete(note)}
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
          onSave={saveEditedNote}
          onRefresh={refresh}
          onClose={closeEditor}
          onOpenNote={openNote}
          onDelete={() => deleteOpenNote(activeNote)}
          onError={showError}
          changedElsewhere={changedElsewhere}
          onLoadLatest={loadLatest}
          onKeepMine={keepMine}
        />
      )}
      {showSettings && <SettingsDialog onClose={closeSettings} />}
      {structureToDelete && <DeleteStructureDialog target={structureToDelete} />}
    </div>
  )
}

export default App
