import { useState, type FormEvent, type RefObject } from 'react'
import {
  Archive,
  ChevronDown,
  FileText,
  Heart,
  Layers3,
  LibraryBig,
  Network,
  Plus,
  Settings,
  Tag as TagIcon,
  Trash2,
  X,
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
import { useLibraryStore } from '../../state/libraryStore'
import { useWorkspaceStore, type View } from '../../state/workspaceStore'
import type { Library } from '../../types'
import { FALLBACK_FOCUS_ID } from './DeleteStructureDialog'
import { shelfForNewNotebook } from './placement'

export function LibrarySidebar({
  onNavigate,
  onNewNote,
  onOpenSettings,
  onCloseNavigation,
  newNoteRef,
  closeButtonRef,
}: {
  onNavigate: (view: View) => void
  onNewNote: () => void
  onOpenSettings: () => void
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
  const view = useWorkspaceStore((state) => state.view)
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed)
  const navigationOpen = useWorkspaceStore((state) => state.navigationOpen)
  const isCompactNavigation = useWorkspaceStore((state) => state.isCompactNavigation)
  const collapsedLibraries = useWorkspaceStore((state) => state.collapsedLibraries)
  const collapsedShelves = useWorkspaceStore((state) => state.collapsedShelves)
  const toggleLibrary = useWorkspaceStore((state) => state.toggleLibrary)
  const toggleShelf = useWorkspaceStore((state) => state.toggleShelf)
  const askToDelete = useWorkspaceStore((state) => state.askToDelete)
  const [libraryName, setLibraryName] = useState('')
  const [notebookName, setNotebookName] = useState('')
  const [shelfNames, setShelfNames] = useState<Record<string, string>>({})
  const isDrawer = isCompactNavigation && navigationOpen

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
      aria-label="Primary navigation"
      onKeyDown={isDrawer ? (event) => keepFocusInDialog(event, onCloseNavigation) : undefined}
    >
      <div className="mb-6 flex items-center justify-between gap-2">
        <a href="/" className="flex min-w-0 items-center gap-3 px-2 text-lg font-semibold" aria-label="My Notes home">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d77762] text-white">
            <FileText size={20} aria-hidden="true" />
          </span>
          <span className="truncate">My Notes</span>
        </a>
        <button
          ref={closeButtonRef}
          className="icon-button navigation-close"
          onClick={onCloseNavigation}
          aria-label="Close navigation"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <button id={FALLBACK_FOCUS_ID} ref={newNoteRef} onClick={onNewNote} className="primary-button mb-5 flex items-center justify-center gap-2" aria-label="Create a new note from navigation">
        <Plus size={17} aria-hidden="true" /> New note
      </button>
      <nav aria-label="Note views" className="space-y-1">
        <NavButton active={view === 'all'} label="All Notes" count={notes.length} onClick={() => onNavigate('all')} icon={<FileText size={16} />} />
        <NavButton active={view === 'favorites'} label="Favorites" count={notes.filter((note) => note.favorite).length} onClick={() => onNavigate('favorites')} icon={<Heart size={16} />} />
        <NavButton active={view === 'trash'} label="Trash" count={trash.length} onClick={() => onNavigate('trash')} icon={<Trash2 size={16} />} />
        <NavButton active={view === 'graph'} label="Knowledge Graph" count={notes.length} onClick={() => onNavigate('graph')} icon={<Network size={16} />} />
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
                    onClick={() => toggleLibrary(library.id)}
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  <NavButton
                    active={view === `library:${library.id}`}
                    label={library.name}
                    count={notes.filter((note) => libraryNotebookIds.includes(note.notebookId ?? '')).length}
                    onClick={() => onNavigate(`library:${library.id}`)}
                    icon={<LibraryBig size={16} />}
                    className="min-w-0 flex-1 !w-auto"
                  />
                  <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button className="icon-button !h-8 !w-8" aria-label={`Rename ${library.name}`} onClick={() => void promptRename({ kind: 'library', item: library })}><Settings size={13} /></button>
                    <button className="icon-button !h-8 !w-8" aria-label={`Delete ${library.name}`} disabled={libraries.length <= 1} title={libraries.length <= 1 ? 'The last library cannot be deleted' : undefined} onClick={() => askToDelete({ kind: 'library', item: library })}><Trash2 size={13} /></button>
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
                            onClick={() => toggleShelf(shelf.id)}
                          >
                            <ChevronDown size={14} aria-hidden="true" />
                          </button>
                          <NavButton
                            active={view === `shelf:${shelf.id}`}
                            label={shelf.name}
                            count={notes.filter((note) => notebooks.some((notebook) => notebook.id === note.notebookId && notebook.shelfId === shelf.id)).length}
                            onClick={() => onNavigate(`shelf:${shelf.id}`)}
                            icon={<Layers3 size={15} />}
                            className="min-w-0 flex-1 !w-auto"
                          />
                          <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                            <button className="icon-button !h-8 !w-8" aria-label={`Rename ${shelf.name}`} onClick={() => void promptRename({ kind: 'shelf', item: shelf })}><Settings size={13} /></button>
                            <button className="icon-button !h-8 !w-8" aria-label={`Delete ${shelf.name}`} disabled={libraryShelves.length <= 1} title={libraryShelves.length <= 1 ? 'The last shelf in a library cannot be deleted' : undefined} onClick={() => askToDelete({ kind: 'shelf', item: shelf })}><Trash2 size={13} /></button>
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
                                  onClick={() => onNavigate(`notebook:${notebook.id}`)}
                                  icon={<Archive size={15} />}
                                  className="min-w-0 flex-1 !w-auto"
                                />
                                <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                                  <button className="icon-button !h-8 !w-8" aria-label={`Rename ${notebook.name}`} onClick={() => void promptRename({ kind: 'notebook', item: notebook })}><Settings size={13} /></button>
                                  <button className="icon-button !h-8 !w-8" aria-label={`Delete ${notebook.name}`} disabled={notebooks.length <= 1} title={notebooks.length <= 1 ? 'The last notebook cannot be deleted' : undefined} onClick={() => askToDelete({ kind: 'notebook', item: notebook })}><Trash2 size={13} /></button>
                                </div>
                              </div>
                              <label className="sr-only" htmlFor={`move-notebook-${notebook.id}`}>Move {notebook.name} to shelf</label>
                              <select
                                id={`move-notebook-${notebook.id}`}
                                className="small-input library-notebook-move !min-h-8 !px-2 text-xs"
                                aria-label={`Move ${notebook.name} to shelf`}
                                value={notebook.shelfId ?? ''}
                                onChange={(event) => void moveNotebookToShelf(notebook.id, event.target.value)}
                              >
                                {shelves.map((option) => <option key={option.id} value={option.id}>{libraries.find((item) => item.id === option.libraryId)?.name ?? 'Library'} · {option.name}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <form className="mt-1 flex min-w-0 gap-1" onSubmit={(event) => void addShelf(library, event)}>
                    <label className="sr-only" htmlFor={`new-shelf-${library.id}`}>New shelf in {library.name}</label>
                    <input id={`new-shelf-${library.id}`} className="small-input !min-h-8 min-w-0 flex-1 !px-2 text-xs" value={shelfNames[library.id] ?? ''} onChange={(event) => setShelfNames((current) => ({ ...current, [library.id]: event.target.value }))} placeholder="New shelf" />
                    <button className="icon-button !h-8 !w-8" aria-label={`Add shelf to ${library.name}`} type="submit"><Plus size={15} /></button>
                  </form>
                </div>
              </div>
            )
          })}
        </nav>
        <form className="mt-3 flex gap-2" onSubmit={(event) => void addLibrary(event)}>
          <label className="sr-only" htmlFor="new-library">New library name</label>
          <input id="new-library" className="small-input min-w-0 flex-1" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="New library" />
          <button className="icon-button" aria-label="Add library" type="submit"><Plus size={16} /></button>
        </form>
        <form className="mt-2 flex gap-2" onSubmit={(event) => void addNotebook(event)}>
          <label className="sr-only" htmlFor="new-notebook">New notebook name</label>
          <input id="new-notebook" className="small-input min-w-0 flex-1" value={notebookName} onChange={(event) => setNotebookName(event.target.value)} placeholder="New notebook" />
          <button className="icon-button" aria-label="Add notebook" type="submit"><Plus size={16} /></button>
        </form>
      </div>
      <div className="mt-8">
        <h2 className="section-label mb-2 px-2">Tags</h2>
        <nav aria-label="Tags" className="space-y-1">
          {tags.map((tag) => (
            <NavButton key={tag.id} active={view === `tag:${tag.id}`} label={tag.label} count={tag.count} onClick={() => onNavigate(`tag:${tag.id}`)} icon={<TagIcon size={15} />} />
          ))}
          {tags.length === 0 && <p className="px-3 py-1 text-xs text-[var(--muted)]">Tags you add to notes appear here.</p>}
        </nav>
      </div>
      <button onClick={onOpenSettings} className="nav-button mt-auto flex items-center gap-3" aria-label="Open settings"><Settings size={17} /> Settings</button>
    </aside>
  )
}
