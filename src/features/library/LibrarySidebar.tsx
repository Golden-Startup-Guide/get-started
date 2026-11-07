import { useMemo, useState, type FormEvent, type RefObject } from 'react'
import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronDown,
  FileText,
  Heart,
  Home,
  Layers3,
  LibraryBig,
  Network,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react'
import { keepFocusInDialog } from '../../components/dialogFocus'
import { NavButton } from '../../components/NavButton'
import {
  createNamedLibrary,
  createNotebookOnShelf,
  createShelfInLibrary,
  moveNotebookToShelf,
  promptRename,
} from '../../state/actions'
import { sameSearch } from '../../lib/savedSearches'
import { useLibraryStore } from '../../state/libraryStore'
import { CORE_CATALOG, useCoreStore } from '../../state/coreStore'
import { useWorkspaceStore, type View } from '../../state/workspaceStore'
import type { Library } from '../../types'
import { FALLBACK_FOCUS_ID } from './DeleteStructureDialog'
import { useNoteCounts } from './noteCounts'
import { shelfForNewNotebook } from './placement'
import { TreeItemMenu } from './TreeItemMenu'
import { t } from '../../i18n/i18n'

/** Libraries with up to this many notebooks, and shelves with up to this many, start open. */
const SMALL_LIBRARY = 8
const SMALL_SHELF = 12

export function LibrarySidebar({
  onNavigate,
  onNewNote,
  onOpenSettings,
  onOpenToday,
  onRunSearch,
  onCloseNavigation,
  newNoteRef,
  closeButtonRef,
}: {
  onNavigate: (view: View) => void
  onNewNote: () => void
  onOpenSettings: () => void
  /** Opens (or starts) today's daily note. */
  onOpenToday: () => void
  /** Runs a saved search. */
  onRunSearch: (query: string) => void
  onCloseNavigation: () => void
  newNoteRef: RefObject<HTMLButtonElement>
  closeButtonRef: RefObject<HTMLButtonElement>
}) {
  const notes = useLibraryStore((state) => state.notes)
  const trash = useLibraryStore((state) => state.trash)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const libraries = useLibraryStore((state) => state.libraries)
  const shelves = useLibraryStore((state) => state.shelves)
  const tags = useLibraryStore((state) => state.tags)
  const savedSearches = useLibraryStore((state) => state.settings.savedSearches)
  const query = useWorkspaceStore((state) => state.query)
  const counts = useNoteCounts()
  const view = useWorkspaceStore((state) => state.view)
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed)
  const navigationOpen = useWorkspaceStore((state) => state.navigationOpen)
  const isCompactNavigation = useWorkspaceStore((state) => state.isCompactNavigation)
  const treeChoices = useWorkspaceStore((state) => state.treeChoices)
  const setTreeOpen = useWorkspaceStore((state) => state.setTreeOpen)
  const askToDelete = useWorkspaceStore((state) => state.askToDelete)
  const [libraryName, setLibraryName] = useState('')
  const [notebookName, setNotebookName] = useState('')
  const [shelfNames, setShelfNames] = useState<Record<string, string>>({})
  const isDrawer = isCompactNavigation && navigationOpen
  // The tree shows the branch of the page open, and small libraries and shelves, unless the reader
  // chose otherwise; a large library stays closed, so the sidebar never lists everything at once.
  const allShelves = [...CORE_CATALOG.shelves, ...shelves]
  const allNotebooks = [...CORE_CATALOG.notebooks, ...notebooks]
  const viewId = view.slice(view.indexOf(':') + 1)
  const currentShelfId = view.startsWith('shelf:') ? viewId : view.startsWith('notebook:') ? allNotebooks.find((notebook) => notebook.id === viewId)?.shelfId : undefined
  const currentLibraryId = view.startsWith('library:') ? viewId : allShelves.find((shelf) => shelf.id === currentShelfId)?.libraryId
  const libraryOpen = (libraryId: string) => treeChoices[libraryId] ?? (libraryId === currentLibraryId
    || allNotebooks.filter((notebook) => allShelves.some((shelf) => shelf.id === notebook.shelfId && shelf.libraryId === libraryId)).length <= SMALL_LIBRARY)
  const shelfOpen = (shelfId: string) => treeChoices[shelfId] ?? (shelfId === currentShelfId || allNotebooks.filter((notebook) => notebook.shelfId === shelfId).length <= SMALL_SHELF)
  const coreNotes = useCoreStore((state) => state.notes)
  const coreLoaded = useCoreStore((state) => state.loaded)
  // Handbook note counts per library, shelf, and notebook, once their notes have loaded.
  const coreCounts = useMemo(() => {
    if (!coreLoaded) return undefined
    const counts = new Map<string, number>()
    const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1)
    const shelfOf = new Map(CORE_CATALOG.notebooks.map((notebook) => [notebook.id, notebook.shelfId]))
    const libraryOf = new Map(CORE_CATALOG.shelves.map((shelf) => [shelf.id, shelf.libraryId]))
    for (const note of coreNotes) {
      const shelfId = shelfOf.get(note.notebookId) ?? ''
      add(note.notebookId)
      add(shelfId)
      add(libraryOf.get(shelfId) ?? '')
    }
    return counts
  }, [coreNotes, coreLoaded])
  const shelfOptions = shelves.map((shelf) => ({
    id: shelf.id,
    label: `${libraries.find((library) => library.id === shelf.libraryId)?.name ?? 'Library'} · ${shelf.name}`,
  }))

  async function addShelf(library: Library, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createShelfInLibrary(library.id, shelfNames[library.id] ?? '', (created) => {
      setShelfNames((current) => ({ ...current, [library.id]: '' }))
      onNavigate(`shelf:${created.id}`)
    })
  }

  async function addLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createNamedLibrary(libraryName, (created) => {
      setLibraryName('')
      onNavigate(`library:${created.id}`)
    })
  }

  async function addNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createNotebookOnShelf(notebookName, shelfForNewNotebook(view, notebooks, shelves), (created) => {
      setNotebookName('')
      onNavigate(`notebook:${created.id}`)
    })
  }

  return (
    <aside
      id="workspace-navigation"
      className="workspace-sidebar w-72 shrink-0 flex-col border-r p-5"
      data-collapsed={sidebarCollapsed && !isCompactNavigation}
      data-open={navigationOpen}
      aria-hidden={isCompactNavigation && !navigationOpen}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer ? true : undefined}
      aria-label={t("Primary navigation")}
      onKeyDown={isDrawer ? (event) => keepFocusInDialog(event, onCloseNavigation) : undefined}
    >
      <div className="mb-6 flex items-center justify-between gap-2">
        <a href="#/" onClick={(event) => {
          event.preventDefault()
          onNavigate('home')
        }} className="brand-link flex min-w-0 items-center gap-3 px-2" aria-label={t("The Personal Knowledge Library home")}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-[var(--on-accent)]">
            <LibraryBig size={20} aria-hidden="true" />
          </span>
          <span className="brand-name">{t("The Personal Knowledge Library")}</span>
        </a>
        <button
          ref={closeButtonRef}
          className="icon-button navigation-close"
          onClick={onCloseNavigation}
          aria-label={isCompactNavigation ? t("Close navigation") : t("Collapse sidebar")}
          title={isCompactNavigation ? t("Close navigation") : t("Collapse sidebar")}
        >
          <PanelLeftClose size={18} aria-hidden="true" />
        </button>
      </div>
      <button id={FALLBACK_FOCUS_ID} ref={newNoteRef} onClick={onNewNote} className="primary-button mb-5 flex items-center justify-center gap-2" aria-label={t("Create a new note from navigation")}>
        <Plus size={17} aria-hidden="true" /> {t("New note")}
      </button>
      <nav aria-label={t("Note views")} className="space-y-1">
        <NavButton active={view === 'home'} label={t("Home")} onClick={() => onNavigate('home')} icon={<Home size={16} />} />
        <NavButton active={view === 'search'} label={t("Search")} onClick={() => onNavigate('search')} icon={<Search size={16} />} />
        <NavButton active={view === 'all'} label={t("All Notes")} count={notes.length} onClick={() => onNavigate('all')} icon={<FileText size={16} />} />
        <NavButton active={view === 'favorites'} label={t("Favorites")} count={counts.favorites} onClick={() => onNavigate('favorites')} icon={<Heart size={16} />} />
        <NavButton active={view === 'trash'} label={t("Trash")} count={trash.length} onClick={() => onNavigate('trash')} icon={<Trash2 size={16} />} />
        <NavButton active={view === 'graph'} label={t("Note map")} count={notes.length} onClick={() => onNavigate('graph')} icon={<Network size={16} />} />
        <button className="nav-button flex w-full items-center gap-3 text-left" onClick={onOpenToday}>
          <CalendarDays size={16} aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{t("Today’s note")}</span>
        </button>
      </nav>
      {savedSearches?.length ? (
        <div className="mt-8">
          <h2 className="section-label mb-2 px-2">{t("Saved searches")}</h2>
          <nav aria-label={t("Saved searches")} className="space-y-1">
            {savedSearches.map((search) => (
              <NavButton
                key={search.id}
                active={view === 'all' && sameSearch(query, search.query)}
                label={search.name}
                onClick={() => onRunSearch(search.query)}
                icon={<Search size={15} />}
              />
            ))}
          </nav>
        </div>
      ) : null}
      <div className="library-tree mt-8 min-w-0">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="section-label">{t("Handbooks")}</h2>
          <span className="text-xs text-[var(--muted)]">{CORE_CATALOG.libraries.length}</span>
        </div>
        {/* Built-in and read-only: no menus or forms to change them. */}
        <nav aria-label={t("Handbooks")} className="min-w-0 space-y-3">
          {CORE_CATALOG.libraries.map((library) => {
            const libraryShelves = CORE_CATALOG.shelves.filter((shelf) => shelf.libraryId === library.id)
            const libraryExpanded = libraryOpen(library.id)
            return (
              <div key={library.id} className="min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <button
                    className="icon-button tree-disclosure !h-8 !w-8 shrink-0"
                    aria-label={libraryExpanded ? t('Collapse {name}', { name: library.name }) : t('Expand {name}', { name: library.name })}
                    aria-expanded={libraryExpanded}
                    aria-controls={`library-contents-${library.id}`}
                    onClick={() => setTreeOpen(library.id, !libraryExpanded)}
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  <NavButton
                    active={view === `library:${library.id}`}
                    label={library.name}
                    count={coreCounts?.get(library.id)}
                    onClick={() => onNavigate(`library:${library.id}`)}
                    icon={<BookOpen size={16} />}
                    className="min-w-0 flex-1 !w-auto"
                  />
                </div>
                <div id={`library-contents-${library.id}`} role="group" aria-label={`${library.name} shelves`} hidden={!libraryExpanded} className="ms-3 min-w-0 border-s border-[var(--border)] ps-2">
                  {libraryExpanded && libraryShelves.map((shelf) => (
                    <div key={shelf.id} className="mb-2">
                      <NavButton
                        active={view === `shelf:${shelf.id}`}
                        label={shelf.name}
                        count={coreCounts?.get(shelf.id)}
                        onClick={() => onNavigate(`shelf:${shelf.id}`)}
                        icon={<Layers3 size={15} />}
                        className="min-w-0"
                      />
                      {CORE_CATALOG.notebooks.filter((notebook) => notebook.shelfId === shelf.id).map((notebook) => (
                        <div key={notebook.id} className="library-tree-notebook ms-3 min-w-0">
                          <NavButton
                            active={view === `notebook:${notebook.id}`}
                            label={notebook.name}
                            count={coreCounts?.get(notebook.id)}
                            onClick={() => onNavigate(`notebook:${notebook.id}`)}
                            icon={<Archive size={15} />}
                            className="min-w-0"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
      </div>
      <div className="library-tree mt-8 min-w-0">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="section-label">{t("Your Library")}</h2>
          <span className="text-xs text-[var(--muted)]">{libraries.length}</span>
        </div>
        <nav aria-label={t("Libraries")} className="min-w-0 space-y-3">
          {libraries.map((library) => {
            const libraryShelves = shelves.filter((shelf) => shelf.libraryId === library.id)
            const libraryExpanded = libraryOpen(library.id)
            return (
              <div key={library.id} className="min-w-0">
                <div className="group flex min-w-0 items-center gap-1">
                  <button
                    className="icon-button tree-disclosure !h-8 !w-8 shrink-0"
                    aria-label={libraryExpanded ? t('Collapse {name}', { name: library.name }) : t('Expand {name}', { name: library.name })}
                    aria-expanded={libraryExpanded}
                    aria-controls={`library-contents-${library.id}`}
                    onClick={() => setTreeOpen(library.id, !libraryExpanded)}
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  <NavButton
                    active={view === `library:${library.id}`}
                    label={library.name}
                    count={counts.byLibrary.get(library.id) ?? 0}
                    onClick={() => onNavigate(`library:${library.id}`)}
                    icon={<LibraryBig size={16} />}
                    className="min-w-0 flex-1 !w-auto"
                  />
                  <TreeItemMenu
                    name={library.name}
                    onRename={() => void promptRename({ kind: 'library', item: library })}
                    onDelete={() => askToDelete({ kind: 'library', item: library })}
                    deleteDisabledReason={libraries.length <= 1 ? t('The last library cannot be deleted.') : undefined}
                  />
                </div>
                <div
                  id={`library-contents-${library.id}`}
                  role="group"
                  aria-label={`${library.name} shelves`}
                  hidden={!libraryExpanded}
                  className="ms-3 min-w-0 border-s border-[var(--border)] ps-2"
                >
                  {libraryExpanded && libraryShelves.map((shelf) => {
                    const shelfExpanded = shelfOpen(shelf.id)
                    return (
                      <div key={shelf.id} className="mb-2">
                        <div className="group flex min-w-0 items-center gap-1">
                          <button
                            className="icon-button tree-disclosure !h-8 !w-8 shrink-0"
                            aria-label={shelfExpanded ? t('Collapse {name}', { name: shelf.name }) : t('Expand {name}', { name: shelf.name })}
                            aria-expanded={shelfExpanded}
                            aria-controls={`shelf-contents-${shelf.id}`}
                            onClick={() => setTreeOpen(shelf.id, !shelfExpanded)}
                          >
                            <ChevronDown size={14} aria-hidden="true" />
                          </button>
                          <NavButton
                            active={view === `shelf:${shelf.id}`}
                            label={shelf.name}
                            count={counts.byShelf.get(shelf.id) ?? 0}
                            onClick={() => onNavigate(`shelf:${shelf.id}`)}
                            icon={<Layers3 size={15} />}
                            className="min-w-0 flex-1 !w-auto"
                          />
                          <TreeItemMenu
                            name={shelf.name}
                            onRename={() => void promptRename({ kind: 'shelf', item: shelf })}
                            onDelete={() => askToDelete({ kind: 'shelf', item: shelf })}
                            deleteDisabledReason={libraryShelves.length <= 1 ? t('The last shelf in a library cannot be deleted.') : undefined}
                          />
                        </div>
                        <div id={`shelf-contents-${shelf.id}`} role="group" aria-label={`${shelf.name} notebooks`} hidden={!shelfExpanded}>
                          {shelfExpanded && notebooks.filter((notebook) => notebook.shelfId === shelf.id).map((notebook) => (
                            <div key={notebook.id} className="library-tree-notebook ms-3 min-w-0">
                              <div className="group flex min-w-0 items-center gap-1">
                                <NavButton
                                  active={view === `notebook:${notebook.id}`}
                                  label={notebook.name}
                                  count={counts.byNotebook.get(notebook.id) ?? 0}
                                  onClick={() => onNavigate(`notebook:${notebook.id}`)}
                                  icon={<Archive size={15} />}
                                  className="min-w-0 flex-1 !w-auto"
                                />
                                <TreeItemMenu
                                  name={notebook.name}
                                  onRename={() => void promptRename({ kind: 'notebook', item: notebook })}
                                  onDelete={() => askToDelete({ kind: 'notebook', item: notebook })}
                                  deleteDisabledReason={notebooks.length <= 1 ? t('The last notebook cannot be deleted.') : undefined}
                                  moveOptions={shelfOptions}
                                  currentMoveId={notebook.shelfId}
                                  onMove={(shelfId) => void moveNotebookToShelf(notebook.id, shelfId)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <form className="mt-1 flex min-w-0 gap-1" onSubmit={(event) => void addShelf(library, event)}>
                    <label className="sr-only" htmlFor={`new-shelf-${library.id}`}>{t('New shelf in {name}', { name: library.name })}</label>
                    <input id={`new-shelf-${library.id}`} className="small-input !min-h-8 min-w-0 flex-1 !px-2 text-xs" value={shelfNames[library.id] ?? ''} onChange={(event) => setShelfNames((current) => ({ ...current, [library.id]: event.target.value }))} placeholder={t("New shelf")} />
                    <button className="icon-button !h-8 !w-8" aria-label={t("Add shelf to {name}", { name: library.name })} type="submit"><Plus size={15} /></button>
                  </form>
                </div>
              </div>
            )
          })}
        </nav>
        <form className="mt-3 flex gap-2" onSubmit={(event) => void addLibrary(event)}>
          <label className="sr-only" htmlFor="new-library">{t("New library name")}</label>
          <input id="new-library" className="small-input min-w-0 flex-1" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder={t("New library")} />
          <button className="icon-button" aria-label={t("Add library")} type="submit"><Plus size={16} /></button>
        </form>
        <form className="mt-2 flex gap-2" onSubmit={(event) => void addNotebook(event)}>
          <label className="sr-only" htmlFor="new-notebook">{t("New notebook name")}</label>
          <input id="new-notebook" className="small-input min-w-0 flex-1" value={notebookName} onChange={(event) => setNotebookName(event.target.value)} placeholder={t("New notebook")} />
          <button className="icon-button" aria-label={t("Add notebook")} type="submit"><Plus size={16} /></button>
        </form>
      </div>
      <div className="mt-8">
        <h2 className="section-label mb-2 px-2">{t("Tags")}</h2>
        <nav aria-label={t("Tags")} className="space-y-1">
          {tags.map((tag) => (
            <NavButton key={tag.id} active={view === `tag:${tag.id}`} label={tag.label} count={tag.count} onClick={() => onNavigate(`tag:${tag.id}`)} icon={<TagIcon size={15} />} />
          ))}
          {tags.length === 0 && <p className="px-3 py-1 text-xs text-[var(--muted)]">{t("Tags you add to notes appear here.")}</p>}
        </nav>
      </div>
      <button onClick={onOpenSettings} className="nav-button mt-auto flex items-center gap-3" aria-label={t("Open settings")}><Settings size={17} /> {t("Settings")}</button>
    </aside>
  )
}
