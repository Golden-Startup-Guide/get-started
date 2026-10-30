import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Archive,
  ArrowLeft,
  Check,
  Clock3,
  Download,
  FileText,
  Heart,
  Link2,
  Mic,
  Moon,
  Network,
  Paperclip,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  Square,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import {
  createNotebook,
  addNoteAttachment,
  deleteNoteAttachment,
  deleteNotebook,
  exportBackup,
  getNoteHistory,
  getNoteLinks,
  getAllNoteLinks,
  getNoteAttachments,
  getNotes,
  getNotebooks,
  getSettings,
  getStorageSnapshot,
  getTags,
  importBackupFile,
  linkNotes,
  getTrash,
  permanentlyDeleteNote,
  renameNotebook,
  restoreNote,
  restoreHistory,
  saveNote,
  saveTheme,
  setNoteFlag,
  trashNote,
  unlinkNotes,
} from './lib/notes'
import type {
  AppSettings,
  Note,
  NoteAttachment,
  Notebook,
  NoteHistoryEntry,
  NoteLink,
  Tag,
  ThemePreference,
} from './types'
import './workspace.css'
import { useDebouncedAutosave } from './features/notes/useDebouncedAutosave'
import {
  getChecklistProgress,
  getChecklistTaskLines,
  toggleChecklistItem,
} from './features/notes/checklists'
import { MAX_ATTACHMENT_SIZE_BYTES } from './features/notes/attachments'
import { KnowledgeGraph } from './features/graph/KnowledgeGraph'

type View = 'all' | 'favorites' | 'trash' | 'graph' | `notebook:${string}` | `tag:${string}`
type SaveState = 'saved' | 'unsaved' | 'saving'

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt,
  )
}

function highlight(text: string, query: string): React.ReactNode {
  const term = query.trim()
  if (!term) return text
  const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase())
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-200 px-0.5 text-stone-950">
        {text.slice(index, index + term.length)}
      </mark>
      {highlight(text.slice(index + term.length), term)}
    </>
  )
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    timestamp,
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function getNoteLinkLabel(note: Note, records: Note[], notebooks: Notebook[]): string {
  const title = note.title || 'Untitled note'
  const duplicates = records.filter((item) =>
    (item.title || 'Untitled note').toLocaleLowerCase() === title.toLocaleLowerCase(),
  )
  const notebook = notebooks.find((item) => item.id === note.notebookId)?.name ?? 'Personal'
  const maxIdLength = Math.max(0, ...duplicates.map((item) => item.id.length))
  let suffixLength = Math.min(8, maxIdLength)
  while (suffixLength < maxIdLength && duplicates.some((item) =>
    item.id !== note.id && item.id.slice(-suffixLength) === note.id.slice(-suffixLength),
  )) {
    suffixLength += 1
  }
  return `${title} — ${notebook}${duplicates.length > 1 ? ` · ${note.id.slice(-suffixLength)}` : ''}`
}

function keepFocusInDialog(event: KeyboardEvent<HTMLElement>, onEscape?: () => void) {
  if (event.key === 'Escape' && onEscape) {
    event.preventDefault()
    onEscape()
    return
  }
  if (event.key !== 'Tab') return
  const elements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (!elements.length) return
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [trash, setTrash] = useState<Note[]>([])
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [links, setLinks] = useState<NoteLink[]>([])
  const [settings, setSettings] = useState<AppSettings>({ id: 'preferences', theme: 'system' })
  const [view, setView] = useState<View>('all')
  const [query, setQuery] = useState('')
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notebookName, setNotebookName] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<Notebook | null>(null)
  const [deleteDestination, setDeleteDestination] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [storage, setStorage] = useState({ notes: 0, trash: 0, notebooks: 0, tags: 0, revisions: 0, attachments: 0, attachmentBytes: 0, estimatedBytes: 0 })
  const newNoteRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const focusReturnRef = useRef<HTMLElement | null>(null)
  const settingsFocusReturnRef = useRef<HTMLElement | null>(null)
  const deleteFocusReturnRef = useRef<HTMLElement | null>(null)
  const deleteDestinationRef = useRef<HTMLSelectElement>(null)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  async function refresh() {
    const [savedNotes, savedTrash, savedNotebooks, savedTags, savedSettings, storageSnapshot, savedLinks] = await Promise.all([
      getNotes(),
      getTrash(),
      getNotebooks(),
      getTags(),
      getSettings(),
      getStorageSnapshot(),
      getAllNoteLinks(),
    ])
    setNotes(sortNotes(savedNotes))
    setTrash(savedTrash)
    setNotebooks(savedNotebooks)
    setTags(savedTags)
    setLinks(savedLinks)
    setSettings(savedSettings)
    setStorage(storageSnapshot)
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

  useEffect(() => {
    if (settings.theme !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [settings.theme])
  const theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    if (deleteCandidate) requestAnimationFrame(() => deleteDestinationRef.current?.focus())
  }, [deleteCandidate])

  const filteredNotes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const currentNotebook = view.startsWith('notebook:')
      ? notebooks.find((notebook) => notebook.id === view.slice('notebook:'.length))
      : undefined
    const selectedTag = view.startsWith('tag:') ? view.slice('tag:'.length) : undefined
    const source = view === 'trash' ? trash : notes
    const ordered = view === 'trash' ? source : sortNotes(source)
    return ordered.filter((note) => {
      const noteTags = note.tags ?? []
      if (view === 'trash' && note.deletedAt === undefined) return false
      if (view !== 'trash' && note.deletedAt !== undefined) return false
      if (view === 'favorites' && !note.favorite) return false
      if (currentNotebook && note.notebookId !== currentNotebook.id) return false
      if (selectedTag && !noteTags.some((tag) => tag.toLocaleLowerCase() === selectedTag)) return false
      if (!term) return true
      const notebookName = notebooks.find((notebook) => notebook.id === note.notebookId)?.name ?? ''
      return [note.title, note.content, notebookName, ...noteTags].some((value) =>
        value.toLocaleLowerCase().includes(term),
      )
    })
  }, [notes, notebooks, query, trash, view])

  const viewLabel = view === 'all'
    ? 'All Notes'
    : view === 'favorites'
      ? 'Favorites'
      : view === 'trash'
        ? 'Trash'
      : view === 'graph'
        ? 'Knowledge Graph'
      : view.startsWith('notebook:')
        ? notebooks.find((item) => item.id === view.slice(9))?.name ?? 'Notebook'
        : tags.find((item) => item.id === view.slice(4))?.label ?? 'Tag'

  async function handleSave(note: Note) {
    await saveNote(note)
    setNotes((current) => note.deletedAt === undefined
      ? sortNotes([note, ...current.filter((item) => item.id !== note.id)])
      : current.filter((item) => item.id !== note.id))
    if (note.deletedAt !== undefined) {
      setTrash((current) => [note, ...current.filter((item) => item.id !== note.id)])
    }
    setError(null)
    await Promise.all([getTags().then(setTags), getStorageSnapshot().then(setStorage)])
  }

  function openNewNote() {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setIsCreating(true)
    setActiveNote({
      id: crypto.randomUUID(),
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notebookId: view.startsWith('notebook:') ? view.slice(9) : 'starter-personal',
      tags: [],
      pinned: false,
      favorite: false,
    })
  }

  function openNote(note: Note) {
    focusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setIsCreating(false)
    setActiveNote(note)
  }

  function closeEditor() {
    setActiveNote(null)
    setIsCreating(false)
    requestAnimationFrame(() => {
      const target = focusReturnRef.current
      ;(target?.isConnected ? target : newNoteRef.current)?.focus()
    })
  }

  function openSettings() {
    settingsFocusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setShowSettings(true)
  }

  function closeSettings() {
    setShowSettings(false)
    requestAnimationFrame(() => settingsFocusReturnRef.current?.focus())
  }

  function openDeleteNotebook(notebook: Notebook) {
    deleteFocusReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDeleteError(null)
    setDeleteCandidate(notebook)
    setDeleteDestination(notebooks.find((item) => item.id !== notebook.id)?.id ?? '')
  }

  function closeDeleteDialog() {
    setDeleteCandidate(null)
    setDeleteError(null)
    requestAnimationFrame(() => deleteFocusReturnRef.current?.focus())
  }

  async function createNotebookFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const created = await createNotebook(notebookName)
      setNotebookName('')
      setView(`notebook:${created.id}`)
      await refresh()
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The notebook could not be created.')
    }
  }

  async function handleDeleteNotebook() {
    if (!deleteCandidate) return
    try {
      await deleteNotebook(deleteCandidate.id, deleteDestination)
      setDeleteCandidate(null)
      setDeleteDestination('')
      if (view === `notebook:${deleteCandidate.id}`) setView('all')
      setDeleteError(null)
      await refresh()
      requestAnimationFrame(() => {
        const target = deleteFocusReturnRef.current
        ;(target?.isConnected ? target : newNoteRef.current)?.focus()
      })
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'The notebook could not be deleted.')
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

  async function handleExport() {
    try {
      const backup = await exportBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
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
        `Backup restored: ${result.notesAdded} notes, ${result.linksAdded} links, and ${result.attachmentsAdded} attachments added, ${result.notesSkipped} duplicate notes skipped.`,
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
    <div className="workspace" data-theme={theme}>
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="workspace-sidebar hidden w-72 shrink-0 flex-col border-r p-5 md:flex">
          <a href="/" className="mb-8 flex items-center gap-3 px-2 text-lg font-semibold" aria-label="My Notes home">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#d77762] text-white">
              <FileText size={20} aria-hidden="true" />
            </span>
            my notes
          </a>
          <button ref={newNoteRef} onClick={openNewNote} className="primary-button mb-5 flex items-center justify-center gap-2" aria-label="Create a new note">
            <Plus size={17} aria-hidden="true" /> New note
          </button>
          <nav aria-label="Note views" className="space-y-1">
            <NavButton active={view === 'all'} label="All Notes" count={notes.length} onClick={() => setView('all')} icon={<FileText size={16} />} />
            <NavButton active={view === 'favorites'} label="Favorites" count={notes.filter((note) => note.favorite).length} onClick={() => setView('favorites')} icon={<Heart size={16} />} />
            <NavButton active={view === 'trash'} label="Trash" count={trash.length} onClick={() => setView('trash')} icon={<Trash2 size={16} />} />
            <NavButton active={view === 'graph'} label="Knowledge Graph" count={notes.length} onClick={() => setView('graph')} icon={<Network size={16} />} />
          </nav>
          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="section-label">Notebooks</h2>
              <span className="text-xs text-[var(--muted)]">{notebooks.length}</span>
            </div>
            <nav aria-label="Notebooks" className="space-y-1">
              {notebooks.map((notebook) => (
                <div key={notebook.id} className="group flex items-center gap-1">
                  <NavButton
                    active={view === `notebook:${notebook.id}`}
                    label={notebook.name}
                    count={notes.filter((note) => note.notebookId === notebook.id).length}
                    onClick={() => setView(`notebook:${notebook.id}`)}
                    icon={<Archive size={16} />}
                  />
                  <div className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button className="icon-button !h-8 !w-8" aria-label={`Rename ${notebook.name}`} onClick={() => void handleRename(notebook)}><Settings size={13} /></button>
                            <button className="icon-button !h-8 !w-8" aria-label={`Delete ${notebook.name}`} disabled={notebooks.length <= 1} title={notebooks.length <= 1 ? 'The last notebook cannot be deleted' : undefined} onClick={() => openDeleteNotebook(notebook)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </nav>
            <form className="mt-3 flex gap-2" onSubmit={(event) => void createNotebookFromForm(event)}>
              <label className="sr-only" htmlFor="new-notebook">New notebook name</label>
              <input id="new-notebook" className="small-input min-w-0 flex-1" value={notebookName} onChange={(event) => setNotebookName(event.target.value)} placeholder="New notebook" />
              <button className="icon-button" aria-label="Add notebook" type="submit"><Plus size={16} /></button>
            </form>
          </div>
          <div className="mt-8">
            <h2 className="section-label mb-2 px-2">Tags</h2>
            <nav aria-label="Tags" className="space-y-1">
              {tags.map((tag) => (
                <NavButton key={tag.id} active={view === `tag:${tag.id}`} label={tag.label} count={tag.count} onClick={() => setView(`tag:${tag.id}`)} icon={<TagIcon size={15} />} />
              ))}
              {tags.length === 0 && <p className="px-3 py-1 text-xs text-[var(--muted)]">Tags you add to notes appear here.</p>}
            </nav>
          </div>
          <button onClick={openSettings} className="nav-button mt-auto flex items-center gap-3" aria-label="Open settings"><Settings size={17} /> Settings</button>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-8 lg:p-10">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div>
              <p className="section-label mb-1">Workspace</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{viewLabel}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="icon-button md:hidden" onClick={openSettings} aria-label="Open settings"><Settings size={18} /></button>
              <button className="primary-button flex items-center gap-2 md:hidden" onClick={openNewNote}><Plus size={17} /> New note</button>
              <button className="icon-button hidden md:inline-flex" onClick={openSettings} aria-label="Open settings"><Settings size={18} /></button>
            </div>
          </header>
          {error && <div role="alert" className="notice notice-error mb-5">{error}<button onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && <div role="status" className="notice mb-5">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={15} /></button></div>}
          <div className="mb-5 flex items-center gap-3">
            <label className="sr-only" htmlFor="mobile-view">Filter notes</label>
            <select id="mobile-view" className="small-input max-w-48 md:hidden" value={view} onChange={(event) => setView(event.target.value as View)}>
              <option value="all">All Notes</option>
              <option value="favorites">Favorites</option>
              <option value="trash">Trash ({trash.length})</option>
              <option value="graph">Knowledge Graph</option>
              {notebooks.map((notebook) => <option key={notebook.id} value={`notebook:${notebook.id}`}>{notebook.name}</option>)}
              {tags.map((tag) => <option key={tag.id} value={`tag:${tag.id}`}>Tag: {tag.label}</option>)}
            </select>
            {view !== 'graph' && (
              <>
                <div className="search-field flex-1">
                  <Search size={18} aria-hidden="true" />
                  <label htmlFor="note-search" className="sr-only">Search notes, notebooks, and tags</label>
                  <input id="note-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, content, tags, or notebooks..." />
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
          key={activeNote.id}
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
        />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          storage={storage}
          fileRef={fileRef}
          onClose={closeSettings}
          onTheme={(value) => void handleTheme(value)}
          onExport={() => void handleExport()}
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
          <section className="dialog-card max-w-md" role="dialog" aria-modal="true" aria-labelledby="delete-notebook-title" onKeyDown={(event) => keepFocusInDialog(event, closeDeleteDialog)}>
            <div className="flex items-start justify-between"><div><h2 id="delete-notebook-title" className="text-xl font-semibold">Delete notebook?</h2><p className="mt-2 text-sm text-[var(--muted)]">Notes in “{deleteCandidate.name}” will be moved, not deleted.</p></div><button className="icon-button" onClick={closeDeleteDialog} aria-label="Close"><X size={17} /></button></div>
            <label htmlFor="delete-destination" className="mt-5 block text-sm font-medium">Move notes to</label>
            <select ref={deleteDestinationRef} id="delete-destination" className="small-input mt-2 w-full" value={deleteDestination} onChange={(event) => setDeleteDestination(event.target.value)}>
              {notebooks.filter((item) => item.id !== deleteCandidate.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {deleteError && <p className="mt-4 text-sm text-red-700" role="alert">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2"><button className="secondary-button" onClick={closeDeleteDialog}>Cancel</button><button className="danger-button" onClick={() => void handleDeleteNotebook()}>Move notes and delete</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

function NavButton({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button className={`nav-button flex w-full items-center gap-3 text-left ${active ? 'nav-button-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="shrink-0">{icon}</span><span className="min-w-0 flex-1 truncate">{label}</span><span className="text-xs tabular-nums text-[var(--muted)]">{count}</span>
    </button>
  )
}

function NoteCard({
  note,
  notebook,
  query,
  onOpen,
  onFlag,
  isTrash,
  onRestore,
  onPermanentDelete,
}: {
  note: Note
  notebook: string
  query: string
  isTrash: boolean
  onOpen: () => void
  onFlag: (flag: 'pinned' | 'favorite') => void
  onRestore: () => void
  onPermanentDelete: () => void
}) {
  return (
    <article className="note-card group relative">
      <button onClick={onOpen} className="absolute inset-0 z-0 rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b45d4d]" aria-label={`Open note ${note.title || 'Untitled note'}`} />
      <div className="relative z-10 pointer-events-none">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-xs text-[var(--muted)]">{highlight(notebook, query)}</span>
          {!isTrash && <div className="pointer-events-auto flex gap-1">
            <button className={`card-action ${note.pinned ? 'card-action-active' : ''}`} onClick={() => onFlag('pinned')} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} aria-pressed={Boolean(note.pinned)}><Pin size={15} /></button>
            <button className={`card-action ${note.favorite ? 'card-action-favorite' : ''}`} onClick={() => onFlag('favorite')} aria-label={note.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={Boolean(note.favorite)}><Heart size={15} fill={note.favorite ? 'currentColor' : 'none'} /></button>
          </div>}
        </div>
        <h2 className="line-clamp-2 text-base font-semibold leading-snug">{highlight(note.title || 'Untitled note', query)}</h2>
        <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{highlight(note.content, query) || 'No content yet.'}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(note.tags ?? []).map((tag) => <span className="tag-chip" key={tag}>{highlight(tag, query)}</span>)}
          {note.pinned && <span className="tag-chip tag-chip-pin"><Pin size={11} /> Pinned</span>}
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">{isTrash ? `Moved to Trash ${formatDate(note.deletedAt ?? note.updatedAt)}` : `Updated ${formatDate(note.updatedAt)}`}</p>
        {isTrash && <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
          <button className="secondary-button" onClick={onRestore}><RotateCcw size={14} /> Restore</button>
          <button className="danger-button" onClick={onPermanentDelete}><Trash2 size={14} /> Delete forever</button>
        </div>}
      </div>
    </article>
  )
}

function AttachmentCard({
  attachment,
  onDelete,
}: {
  attachment: NoteAttachment
  onDelete: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const isImagePreviewable = ['image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']
    .includes(attachment.type.toLocaleLowerCase())

  useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return
    const objectUrl = URL.createObjectURL(attachment.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [attachment.blob])

  return (
    <li className="attachment-card">
      {url && isImagePreviewable && (
        <img className="attachment-image" src={url} alt={`Preview of ${attachment.name}`} />
      )}
      {url && attachment.type.startsWith('audio/') && (
        <audio className="attachment-audio" controls preload="metadata" src={url}>
          Audio playback is not supported by this browser.
        </audio>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <Paperclip size={15} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm" title={attachment.name}>{attachment.name}</span>
        <span className="shrink-0 text-xs text-[var(--muted)]">{formatBytes(attachment.size)}</span>
        {url && <a className="secondary-button !min-h-8 !px-2 !py-1 text-xs" href={url} download={attachment.name} aria-label={`Download ${attachment.name}`}>Download</a>}
        <button className="icon-button !h-8 !w-8" onClick={onDelete} aria-label={`Remove attachment ${attachment.name}`}><Trash2 size={14} /></button>
      </div>
    </li>
  )
}

function NoteEditor({
  note,
  isCreating,
  notebooks,
  tags,
  notes,
  trash,
  onSave,
  onRefresh,
  onClose,
  onOpenNote,
  onDelete,
  onError,
}: {
  note: Note
  isCreating: boolean
  notebooks: Notebook[]
  tags: Tag[]
  notes: Note[]
  trash: Note[]
  onSave: (note: Note) => Promise<void>
  onRefresh: () => Promise<void>
  onClose: () => void
  onOpenNote: (note: Note) => void
  onDelete: () => Promise<boolean>
  onError: (message: string | null) => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [noteTags, setNoteTags] = useState(note.tags ?? [])
  const [notebookId, setNotebookId] = useState(note.notebookId ?? notebooks[0]?.id ?? '')
  const [pinned, setPinned] = useState(Boolean(note.pinned))
  const [favorite, setFavorite] = useState(Boolean(note.favorite))
  const [tagInput, setTagInput] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [previewOnly, setPreviewOnly] = useState(false)
  const [history, setHistory] = useState<NoteHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [links, setLinks] = useState<{ outgoing: NoteLink[]; backlinks: NoteLink[] }>({ outgoing: [], backlinks: [] })
  const [linkTargetId, setLinkTargetId] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(!isCreating)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isAddingAttachment, setIsAddingAttachment] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const attachmentFileRef = useRef<HTMLInputElement>(null)
  const recordingRef = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    chunks: Blob[]
    exceeded: boolean
  } | null>(null)
  const latest = useRef({ title, content, noteTags, notebookId, pinned, favorite })
  const baseline = useRef({ title: note.title, content: note.content, tags: note.tags ?? [], notebookId: note.notebookId ?? notebooks[0]?.id ?? '', pinned: Boolean(note.pinned), favorite: Boolean(note.favorite) })
  const saveRef = useRef<() => Promise<boolean>>(async () => false)

  latest.current = { title, content, noteTags, notebookId, pinned, favorite }
  saveRef.current = async () => {
    const draft = latest.current
    if (isCreating && !draft.title.trim() && !draft.content.trim()) return true
    const old = baseline.current
    const changed = draft.title !== old.title || draft.content !== old.content ||
      JSON.stringify(draft.noteTags) !== JSON.stringify(old.tags) ||
      draft.notebookId !== old.notebookId || draft.pinned !== old.pinned || draft.favorite !== old.favorite
    if (!changed) return true
    setSaveState('saving')
    setSaveError(null)
    const next: Note = {
      ...note,
      title: draft.title.trim() || 'Untitled note',
      content: draft.content,
      tags: draft.noteTags,
      notebookId: draft.notebookId,
      pinned: draft.pinned,
      favorite: draft.favorite,
      updatedAt: Date.now(),
    }
    try {
      await onSave(next)
      setPersisted(true)
      baseline.current = { title: draft.title, content: draft.content, tags: draft.noteTags, notebookId: draft.notebookId, pinned: draft.pinned, favorite: draft.favorite }
      setSaveState('saved')
      return true
    } catch {
      setSaveState('unsaved')
      setSaveError('Could not save. Your changes are still here; try again.')
      return false
    }
  }

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    getNoteAttachments(note.id)
      .then((saved) => {
        if (active) setAttachments(saved)
      })
      .catch(() => {
        if (active) setAttachmentError('Attachments could not be loaded.')
      })
    return () => {
      active = false
      const recording = recordingRef.current
      if (recording) {
        recording.recorder.onstop = null
        if (recording.recorder.state !== 'inactive') recording.recorder.stop()
        recording.stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [note.id])

  useEffect(() => {
    let active = true
    getNoteLinks(note.id)
      .then((saved) => {
        if (active) setLinks(saved)
      })
      .catch(() => {
        if (active) setLinkError('Note links could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [note.id])

  const dirty = title !== baseline.current.title || content !== baseline.current.content ||
    JSON.stringify(noteTags) !== JSON.stringify(baseline.current.tags) ||
    notebookId !== baseline.current.notebookId || pinned !== baseline.current.pinned || favorite !== baseline.current.favorite
  const draftKey = JSON.stringify([title, content, noteTags, notebookId, pinned, favorite])
  const { flush, cancel, skipUnmountSave, resumeUnmountSave } = useDebouncedAutosave(
    dirty,
    draftKey,
    () => saveRef.current(),
  )

  async function addAttachment(file: File) {
    setAttachmentError(null)
    if (isCreating && !latest.current.title.trim() && !latest.current.content.trim()) {
      setAttachmentError('Add a title or note text before attaching files.')
      return
    }
    if (!(await flush())) {
      setAttachmentError('Save this note before adding attachments.')
      return
    }
    setIsAddingAttachment(true)
    try {
      const added = await addNoteAttachment(note.id, file, file.name)
      setAttachments((current) => [...current, added])
      await onRefresh()
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : 'The attachment could not be saved.')
    } finally {
      setIsAddingAttachment(false)
    }
  }

  function handleAttachmentFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    for (const file of files) void addAttachment(file)
  }

  async function toggleAudioRecording() {
    const current = recordingRef.current
    if (current) {
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      return
    }
    setAttachmentError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAttachmentError('Audio recording is not supported by this browser. You can attach an audio file instead.')
      return
    }
    if (isCreating && !latest.current.title.trim() && !latest.current.content.trim()) {
      setAttachmentError('Add a title or note text before recording audio.')
      return
    }
    if (!(await flush())) {
      setAttachmentError('Save this note before recording audio.')
      return
    }
    let stream: MediaStream | undefined
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream = activeStream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream)
      const recording = { recorder, stream, chunks: [] as Blob[], exceeded: false }
      recordingRef.current = recording
      recorder.ondataavailable = (event) => {
        if (event.data.size) recording.chunks.push(event.data)
        const total = recording.chunks.reduce((sum, chunk) => sum + chunk.size, 0)
        if (total > MAX_ATTACHMENT_SIZE_BYTES) {
          recording.exceeded = true
          setAttachmentError('The recording reached the 5 MiB limit and was discarded.')
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }
      recorder.onerror = () => {
        recording.exceeded = true
        setAttachmentError('Audio recording failed. Check microphone permissions and try again.')
        if (recorder.state !== 'inactive') recorder.stop()
      }
      recorder.onstop = () => {
        activeStream.getTracks().forEach((track) => track.stop())
        recordingRef.current = null
        setIsRecording(false)
        if (recording.exceeded) return
        const blob = new Blob(recording.chunks, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) return
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `audio-note-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`, { type: blob.type })
        void addAttachment(file)
      }
      recorder.start(250)
      setIsRecording(true)
    } catch (reason) {
      recordingRef.current = null
      setIsRecording(false)
      stream?.getTracks().forEach((track) => track.stop())
      setAttachmentError(reason instanceof Error ? reason.message : 'Microphone access was denied or unavailable.')
    }
  }

  async function removeAttachment(attachment: NoteAttachment) {
    if (!window.confirm(`Remove “${attachment.name}” from this note?`)) return
    try {
      await deleteNoteAttachment(attachment.id)
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
      await onRefresh()
      setAttachmentError(null)
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : 'The attachment could not be removed.')
    }
  }

  useEffect(() => {
    if (dirty) setSaveState('unsaved')
  }, [dirty])

  async function closeSafely() {
    const saved = await flush()
    if (saved) onClose()
  }

  async function addLink() {
    if (!linkTargetId || !(await flush())) return
    try {
      if (!notes.some((item) => item.id === note.id)) {
        setLinkError('Save this note and restore it from Trash before adding links.')
        return
      }
      await linkNotes(note.id, linkTargetId)
      setLinks(await getNoteLinks(note.id))
      setLinkTargetId('')
      setLinkError(null)
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : 'The note could not be linked.')
    }
  }

  async function removeLink(targetNoteId: string) {
    if (!(await flush())) return
    try {
      await unlinkNotes(note.id, targetNoteId)
      setLinks(await getNoteLinks(note.id))
      setLinkError(null)
    } catch (reason) {
      setLinkError(reason instanceof Error ? reason.message : 'The link could not be removed.')
    }
  }

  async function openRelatedNote(related: Note) {
    if (related.deletedAt !== undefined || !(await flush())) return
    onOpenNote(related)
  }

  async function deleteSafely() {
    const message = note.deletedAt === undefined
      ? `Move “${title.trim() || 'Untitled note'}” to Trash? You can restore it later.`
      : `Permanently delete “${title.trim() || 'Untitled note'}”? This cannot be undone.`
    if (!window.confirm(message)) return
    if (note.deletedAt === undefined) {
      if (!(await flush())) return
    } else {
      cancel()
    }
    skipUnmountSave()
    if (!(await onDelete())) {
      resumeUnmountSave()
      void flush()
    }
  }

  function addTag(value = tagInput) {
    const cleaned = value.trim().replace(/,$/, '')
    if (!cleaned || noteTags.some((tag) => tag.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
      setTagInput('')
      return
    }
    setNoteTags((current) => [...current, cleaned])
    setTagInput('')
  }

  function tagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag()
    } else if (event.key === 'Backspace' && !tagInput && noteTags.length) {
      setNoteTags((current) => current.slice(0, -1))
    }
  }

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false)
      return
    }
    try {
      setHistory(await getNoteHistory(note.id))
      setShowHistory(true)
    } catch {
      onError('Note history could not be loaded.')
    }
  }

  async function restore(revision: NoteHistoryEntry) {
    if (!window.confirm('Restore this saved version? Your current note will remain available in history.')) return
    try {
      await restoreHistory(revision.id)
      const restored = { ...revision.snapshot, id: note.id, createdAt: note.createdAt, updatedAt: Date.now() }
      setTitle(restored.title)
      setContent(restored.content)
      setNoteTags(restored.tags ?? [])
      setNotebookId(restored.notebookId ?? notebookId)
      setPinned(Boolean(restored.pinned))
      setFavorite(Boolean(restored.favorite))
      await onSave(restored)
      baseline.current = { title: restored.title, content: restored.content, tags: restored.tags ?? [], notebookId: restored.notebookId ?? notebookId, pinned: Boolean(restored.pinned), favorite: Boolean(restored.favorite) }
      setHistory(await getNoteHistory(note.id))
      setSaveState('saved')
      setShowHistory(false)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'The revision could not be restored.')
    }
  }

  const suggestions = tags.filter((tag) =>
    tag.label.toLocaleLowerCase().includes(tagInput.trim().toLocaleLowerCase()) &&
    !noteTags.some((item) => item.toLocaleLowerCase() === tag.id),
  )
  const checklistProgress = getChecklistProgress(content)
  const checklistTaskLines = getChecklistTaskLines(content)
  const allNotes = [...notes, ...trash]
  const outgoingNotes = links.outgoing
    .map((link) => allNotes.find((item) => item.id === link.targetNoteId))
    .filter((item): item is Note => Boolean(item))
  const backlinkNotes = links.backlinks
    .map((link) => allNotes.find((item) => item.id === link.sourceNoteId))
    .filter((item): item is Note => Boolean(item))
  const linkedIds = new Set(links.outgoing.map((link) => link.targetNoteId))
  const availableTargets = notes.filter((item) => item.id !== note.id && !linkedIds.has(item.id))
  const canEditLinks = persisted && note.deletedAt === undefined
  const audioRecordingSupported =
    typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  let taskInputIndex = 0

  function toggleTask(lineNumber: number) {
    setContent((current) => toggleChecklistItem(current, lineNumber))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) void closeSafely()
    }}>
      <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-heading" onKeyDown={(event) => keepFocusInDialog(event, () => void closeSafely())}>
        <header className="editor-header">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button" onClick={() => void closeSafely()} aria-label="Close editor"><ArrowLeft size={18} /></button>
            <div className="min-w-0">
              <p className="section-label">Note editor</p>
              <h2 id="editor-heading" className="truncate text-sm font-semibold">{isCreating ? 'New note' : note.title || 'Untitled note'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="save-status" role="status" aria-live="polite">
              {saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved changes' : <><Check size={14} /> Saved</>}
            </span>
            <button className={`icon-button ${pinned ? 'is-selected' : ''}`} onClick={() => setPinned((value) => !value)} aria-label={pinned ? 'Unpin note' : 'Pin note'} aria-pressed={pinned}><Pin size={17} /></button>
            <button className={`icon-button ${favorite ? 'is-favorite' : ''}`} onClick={() => setFavorite((value) => !value)} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button>
            <button className="icon-button" onClick={() => void toggleHistory()} aria-label="Show note history"><Clock3 size={17} /></button>
            <button className="icon-button" onClick={() => void closeSafely()} aria-label="Close editor"><X size={17} /></button>
          </div>
        </header>
        <div className="editor-toolbar">
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]" htmlFor="note-notebook">Notebook</label>
          <select id="note-notebook" className="small-input max-w-48" value={notebookId} onChange={(event) => {
            setNotebookId(event.target.value)
          }}>
            {notebooks.map((notebook) => <option value={notebook.id} key={notebook.id}>{notebook.name}</option>)}
          </select>
          <button className="secondary-button ml-auto" onClick={() => setPreviewOnly((value) => !value)} aria-pressed={previewOnly}>{previewOnly ? 'Edit Markdown' : 'Preview only'}</button>
        </div>
        <div className="editor-body">
          <div className="editor-fields">
            <label htmlFor="note-title" className="sr-only">Note title</label>
            <input ref={titleRef} id="note-title" className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled note" />
            <div className="tag-editor">
              <TagIcon size={15} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-1.5">
                {noteTags.map((tag) => (
                  <span className="tag-chip" key={tag}>{tag}<button onClick={() => setNoteTags((current) => current.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`}><X size={12} /></button></span>
                ))}
                <label className="sr-only" htmlFor="tag-input">Add tags</label>
                <input id="tag-input" className="tag-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={tagKeyDown} onBlur={() => tagInput.trim() && addTag()} placeholder="Add a tag…" />
              </div>
              {tagInput && suggestions.length > 0 && <div className="suggestion-list" role="listbox" aria-label="Tag suggestions">{suggestions.map((tag) => <button key={tag.id} role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag.label)}>{tag.label}</button>)}</div>}
            </div>
            <section className="note-links" aria-labelledby="note-links-heading">
              <h3 id="note-links-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Link2 size={15} aria-hidden="true" /> Linked notes</h3>
              {canEditLinks && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="link-note-target">Choose a note to link</label>
                  <select
                    id="link-note-target"
                    className="small-input min-w-0 flex-1"
                    value={linkTargetId}
                    onChange={(event) => setLinkTargetId(event.target.value)}
                    disabled={!availableTargets.length}
                  >
                    <option value="">Choose a note…</option>
                    {availableTargets.map((item) => (
                      <option key={item.id} value={item.id}>{getNoteLinkLabel(item, allNotes, notebooks)}</option>
                    ))}
                  </select>
                  <button className="secondary-button" onClick={() => void addLink()} disabled={!linkTargetId}>Add link</button>
                </div>
              )}
              {linkError && <p className="mb-2 text-sm text-red-700" role="alert">{linkError}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-medium text-[var(--muted)]">Links from this note</h4>
                  {outgoingNotes.length ? (
                    <ul className="note-link-list" aria-label="Links from this note">
                      {outgoingNotes.map((related) => (
                        <li key={related.id}>
                          {related.deletedAt === undefined ? (
                            <>
                              <button className="note-link-open" onClick={() => void openRelatedNote(related)}>{getNoteLinkLabel(related, allNotes, notebooks)}</button>
                              {canEditLinks && <button className="note-link-remove" onClick={() => void removeLink(related.id)} aria-label={`Remove link to ${getNoteLinkLabel(related, allNotes, notebooks)}`}>Remove</button>}
                            </>
                          ) : <span>{getNoteLinkLabel(related, allNotes, notebooks)} <span className="text-[var(--muted)]">(in Trash; link retained)</span></span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-[var(--muted)]">No linked notes yet.</p>}
                </div>
                <div>
                  <h4 className="text-xs font-medium text-[var(--muted)]">Backlinks</h4>
                  {backlinkNotes.length ? (
                    <ul className="note-link-list" aria-label="Backlinks">
                      {backlinkNotes.map((related) => (
                        <li key={related.id}>
                          {related.deletedAt === undefined ? (
                            <button className="note-link-open" onClick={() => void openRelatedNote(related)}>{getNoteLinkLabel(related, allNotes, notebooks)}</button>
                          ) : <span>{getNoteLinkLabel(related, allNotes, notebooks)} <span className="text-[var(--muted)]">(in Trash; link retained)</span></span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-[var(--muted)]">No backlinks yet.</p>}
                </div>
              </div>
              {!canEditLinks && !note.deletedAt && <p className="mt-2 text-xs text-[var(--muted)]">Save this note before linking it.</p>}
              {note.deletedAt !== undefined && <p className="mt-2 text-xs text-[var(--muted)]">Links are preserved while this note is in Trash.</p>}
            </section>
            <div className={`markdown-workspace ${previewOnly ? 'markdown-workspace-preview' : ''}`}>
              {!previewOnly && <div className="markdown-editor-pane">
                <label htmlFor="note-content" className="section-label mb-2 block">Markdown</label>
                <textarea id="note-content" className="content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder={'Write in Markdown…\n\n# A heading\n- [ ] A checklist item'} />
              </div>}
              <article className="markdown-preview-pane" aria-label="Live Markdown preview">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="section-label">Live preview</p>
                  {checklistProgress.total > 0 && <span className="checklist-progress" role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={checklistProgress.total} aria-valuenow={checklistProgress.completed}>
                    {checklistProgress.completed} of {checklistProgress.total} complete
                  </span>}
                </div>
                <div className="prose-notes">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      input: ({ checked, ...props }) => {
                        const lineNumber = checklistTaskLines[taskInputIndex++]
                        const line = lineNumber ? content.split(/\r?\n/)[lineNumber - 1] ?? '' : ''
                        const taskText = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/, '').trim()
                        return <input
                          {...props}
                          type="checkbox"
                          checked={Boolean(checked)}
                          disabled={false}
                          aria-label={taskText ? `Mark task ${taskText} ${checked ? 'incomplete' : 'complete'}` : 'Toggle checklist task'}
                          onChange={() => lineNumber && toggleTask(lineNumber)}
                        />
                      },
                    }}
                  >
                    {content || '_Nothing to preview yet._'}
                  </ReactMarkdown>
                </div>
              </article>
            </div>
            <section className="attachments-section" aria-labelledby="attachments-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="attachments-heading" className="text-sm font-semibold">Attachments</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">Stored on this device. Each file is limited to 5 MiB; 20 MiB per note.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={attachmentFileRef}
                    id="note-attachments"
                    type="file"
                    multiple
                    className="sr-only"
                    aria-label="Choose files to attach"
                    onChange={handleAttachmentFiles}
                  />
                  <button className="secondary-button" disabled={isAddingAttachment} onClick={() => attachmentFileRef.current?.click()}>
                    <Paperclip size={15} /> Attach files
                  </button>
                  <button
                    className="secondary-button"
                    disabled={isAddingAttachment || isRecording || !audioRecordingSupported}
                    onClick={() => void toggleAudioRecording()}
                    aria-pressed={isRecording}
                  >
                    {isRecording ? <Square size={15} /> : <Mic size={15} />}
                    {isRecording ? 'Stop recording' : 'Record audio'}
                  </button>
                </div>
              </div>
              {!audioRecordingSupported && <p className="mb-2 text-xs text-[var(--muted)]">Audio recording is unavailable here; attach an audio file to play it in the note.</p>}
              {isRecording && <p className="mb-2 text-sm text-[var(--muted)]" role="status">Recording audio…</p>}
              {isAddingAttachment && <p className="mb-2 text-sm text-[var(--muted)]" role="status">Saving attachment…</p>}
              {attachmentError && <p className="mb-2 text-sm text-red-700" role="alert">{attachmentError}</p>}
              {attachments.length ? (
                <ul className="attachment-list" aria-label="Note attachments">
                  {attachments.map((attachment) => (
                    <AttachmentCard
                      key={attachment.id}
                      attachment={attachment}
                      onDelete={() => void removeAttachment(attachment)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--muted)]">No attachments yet.</p>
              )}
            </section>
            {saveError && <p className="text-sm text-red-700" role="alert">{saveError}<button className="ml-2 underline" onClick={() => void saveRef.current()}>Retry</button></p>}
            <p className="text-xs text-[var(--muted)]">Markdown is saved locally on this device. Raw HTML is not rendered.</p>
          </div>
          {showHistory && <aside className="history-panel" aria-label="Note history">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">History</h3><button className="icon-button !h-8 !w-8" onClick={() => setShowHistory(false)} aria-label="Close history"><X size={15} /></button></div>
            {history.length ? history.map((entry) => <div className="history-item" key={entry.id}><time className="text-xs text-[var(--muted)]">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(entry.savedAt)}</time><p className="mt-1 truncate text-sm font-medium">{entry.snapshot.title || 'Untitled note'}</p><p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{entry.snapshot.content}</p><button className="secondary-button mt-2" onClick={() => void restore(entry)}>Restore</button></div>) : <p className="text-sm text-[var(--muted)]">Earlier saved versions will appear here after you edit this note.</p>}
          </aside>}
        </div>
        <footer className="editor-footer">
          <p className="text-xs text-[var(--muted)]">Created {formatDate(note.createdAt)}</p>
          {!isCreating && <button className="danger-button" onClick={() => void deleteSafely()}><Trash2 size={15} /> {note.deletedAt === undefined ? 'Move to Trash' : 'Delete forever'}</button>}
          <button className="primary-button ml-auto" onClick={() => void closeSafely()}>{saveState === 'unsaved' ? 'Save and close' : 'Done'}</button>
        </footer>
      </section>
    </div>
  )
}

function SettingsDialog({
  settings,
  storage,
  fileRef,
  onClose,
  onTheme,
  onExport,
  onImport,
  error,
  notice,
  onDismissError,
  onDismissNotice,
}: {
  settings: AppSettings
  storage: { notes: number; trash: number; notebooks: number; tags: number; revisions: number; attachments: number; attachmentBytes: number; estimatedBytes: number }
  fileRef: React.RefObject<HTMLInputElement>
  onClose: () => void
  onTheme: (theme: ThemePreference) => void
  onExport: () => void
  onImport: (event: FormEvent<HTMLFormElement>) => void
  error: string | null
  notice: string | null
  onDismissError: () => void
  onDismissNotice: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => closeRef.current?.focus(), [])
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="dialog-card max-w-xl" role="dialog" aria-modal="true" aria-labelledby="settings-heading" onKeyDown={(event) => keepFocusInDialog(event, onClose)}>
        <header className="mb-6 flex items-start justify-between">
          <div><p className="section-label">Preferences</p><h2 id="settings-heading" className="text-2xl font-semibold">Settings</h2></div>
          <button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
        </header>
        <section>
          <h3 className="mb-3 text-sm font-semibold">Appearance</h3>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Color theme">
            {(['light', 'dark', 'system'] as const).map((choice, index, choices) => <button key={choice} id={`theme-${choice}`} role="radio" aria-checked={settings.theme === choice} tabIndex={settings.theme === choice ? 0 : -1} className={`theme-option ${settings.theme === choice ? 'theme-option-active' : ''}`} onKeyDown={(event) => {
              const nextIndex = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? (index + 1) % choices.length
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? (index + choices.length - 1) % choices.length
                  : -1
              if (nextIndex >= 0) {
                event.preventDefault()
                onTheme(choices[nextIndex])
                document.getElementById(`theme-${choices[nextIndex]}`)?.focus()
              }
            }} onClick={() => onTheme(choice)}>
              {choice === 'light' ? <Sun size={18} /> : choice === 'dark' ? <Moon size={18} /> : <Settings size={18} />}
              <span className="capitalize">{choice}</span>
            </button>)}
          </div>
        </section>
        {error && <div role="alert" className="notice notice-error mt-4">{error}<button onClick={onDismissError} aria-label="Dismiss error"><X size={15} /></button></div>}
        {notice && <div role="status" className="notice mt-4">{notice}<button onClick={onDismissNotice} aria-label="Dismiss notice"><X size={15} /></button></div>}
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">Backup and restore</h3>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" onClick={onExport}><Download size={15} /> Export JSON backup</button>
            <form className="flex items-center gap-2" onSubmit={onImport}>
              <label className="sr-only" htmlFor="backup-file">Choose a JSON backup</label>
              <input ref={fileRef} id="backup-file" type="file" accept="application/json,.json" className="max-w-48 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--surface-alt)] file:px-3 file:py-2 file:text-[var(--text)]" />
              <button className="secondary-button" type="submit">Import</button>
            </form>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Import adds notes without overwriting existing notes. JSON backups up to 40 MiB are supported.</p>
        </section>
        <section className="mt-7">
          <h3 className="mb-3 text-sm font-semibold">Storage on this device</h3>
          <dl className="settings-stats">
            <div><dt>Notes</dt><dd>{storage.notes}</dd></div><div><dt>Trash</dt><dd>{storage.trash}</dd></div><div><dt>Notebooks</dt><dd>{storage.notebooks}</dd></div><div><dt>Tags</dt><dd>{storage.tags}</dd></div><div><dt>History revisions</dt><dd>{storage.revisions}</dd></div><div><dt>Attachments</dt><dd>{storage.attachments}</dd></div><div><dt>Attachment data</dt><dd>{formatBytes(storage.attachmentBytes)}</dd></div><div><dt>Estimated content size</dt><dd>{formatBytes(storage.estimatedBytes)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">Includes attachment data; browser quota may differ.</p>
        </section>
        <section className="mt-7 border-t border-[var(--border)] pt-5">
          <h3 className="text-sm font-semibold">About My Notes</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">An offline-first, private notes app. Your notes stay in this browser’s local storage; no account or network connection is required.</p>
          <p className="mt-2 text-xs text-[var(--muted)]">My Notes · IndexedDB schema 4 · Data stored locally</p>
        </section>
      </section>
    </div>
  )
}

export default App
