import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  Check,
  FileText,
  Leaf,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { deleteNote, getNotes, saveNote } from './lib/notes'
import type { Note } from './types'

const colors = ['note-peach', 'note-sage', 'note-lilac', 'note-sky']

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)
}

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [query, setQuery] = useState('')
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    getNotes()
      .then((savedNotes) => {
        if (active) setNotes(savedNotes)
      })
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
    if (isCreating) titleRef.current?.focus()
  }, [isCreating])

  const filteredNotes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return notes
    return notes.filter(
      (note) =>
        note.title.toLocaleLowerCase().includes(term) ||
        note.content.toLocaleLowerCase().includes(term),
    )
  }, [notes, query])

  function openNewNote() {
    setError(null)
    setActiveNote(null)
    setIsCreating(true)
  }

  function openNote(note: Note) {
    setError(null)
    setIsCreating(false)
    setActiveNote(note)
  }

  function closeEditor() {
    setIsCreating(false)
    setActiveNote(null)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const title = String(formData.get('title') ?? '').trim()
    const content = String(formData.get('content') ?? '').trim()

    if (!title && !content) {
      closeEditor()
      return
    }

    const now = Date.now()
    const note: Note = {
      id: activeNote?.id ?? crypto.randomUUID(),
      title: title || 'Untitled note',
      content,
      createdAt: activeNote?.createdAt ?? now,
      updatedAt: now,
    }

    try {
      await saveNote(note)
      setNotes((current) =>
        [note, ...current.filter((item) => item.id !== note.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      )
      closeEditor()
      setError(null)
    } catch {
      setError('Your note could not be saved. Check available storage and try again.')
    }
  }

  async function handleDelete(note: Note) {
    if (!window.confirm(`Delete “${note.title}”? This cannot be undone.`)) return

    try {
      await deleteNote(note.id)
      setNotes((current) => current.filter((item) => item.id !== note.id))
      closeEditor()
      setError(null)
    } catch {
      setError('Your note could not be deleted. Please try again.')
    }
  }

  const editorNote = activeNote

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-stone-200/80 px-7 py-8 md:flex">
          <a href="/" className="mb-14 flex items-center gap-3" aria-label="My Notes home">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-white shadow-sm">
              <FileText size={20} strokeWidth={2.2} />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">my notes</span>
          </a>

          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Workspace
          </p>
          <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-medium shadow-sm">
            <FileText size={17} className="text-accent" />
            <span className="flex-1">All notes</span>
            <span className="text-xs tabular-nums text-muted">{notes.length}</span>
          </div>

          <div className="mt-auto rounded-2xl bg-[#eeece5] p-4">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-white text-[#83917a]">
              <Leaf size={17} />
            </div>
            <p className="text-sm font-medium">A little space to think.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Your notes stay yours, right here on this device.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2 px-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[#81a58a]" />
            Saved on this device
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-10">
          <header className="mb-10 flex items-center justify-between gap-4">
            <a href="/" className="flex items-center gap-2.5 md:hidden" aria-label="My Notes home">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white">
                <FileText size={18} />
              </span>
              <span className="font-semibold tracking-tight">my notes</span>
            </a>
            <div className="relative ml-auto w-full max-w-[300px]">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                aria-label="Search notes"
                placeholder="Search your notes..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-xl border border-stone-200/80 bg-white/70 py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-[#aaa79f] focus:border-accent/60 focus:bg-white focus:ring-4 focus:ring-accent/10"
              />
            </div>
          </header>

          <section aria-labelledby="page-title">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
                  <Sparkles size={14} className="text-accent" />
                  YOUR PERSONAL SPACE
                </p>
                <h1 id="page-title" className="text-3xl font-semibold tracking-tight sm:text-[38px]">
                  Your thoughts,<br className="sm:hidden" /> neatly kept.
                </h1>
                <p className="mt-2 text-sm text-muted">
                  {query
                    ? `${filteredNotes.length} ${filteredNotes.length === 1 ? 'note' : 'notes'} found`
                    : notes.length
                      ? `${notes.length} little ${notes.length === 1 ? 'thought' : 'thoughts'} collected`
                      : 'A fresh page is a lovely place to start.'}
                </p>
              </div>
              <button
                type="button"
                onClick={openNewNote}
                className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#45433d] focus:outline-none focus:ring-4 focus:ring-ink/15"
              >
                <Plus size={17} />
                <span>New note</span>
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setError(null)}
                  className="rounded p-1 hover:bg-red-100"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading notes">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-52 animate-pulse rounded-2xl bg-white/70"
                  />
                ))}
              </div>
            ) : filteredNotes.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredNotes.map((note, index) => (
                  <article
                    key={note.id}
                    className={`note-card group relative flex min-h-[220px] cursor-pointer flex-col rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:shadow-soft focus-within:ring-2 focus-within:ring-accent/40 ${colors[index % colors.length]}`}
                    onClick={() => openNote(note)}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-ink/50">
                        {formatDate(note.updatedAt)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${note.title}`}
                        title="Delete note"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDelete(note)
                        }}
                        className="rounded-lg p-2 text-ink/40 opacity-100 transition hover:bg-white/60 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => openNote(note)}
                      className="mb-2 text-left text-[17px] font-semibold leading-snug tracking-tight text-ink"
                    >
                      {note.title}
                    </button>
                    <p className="line-clamp-5 whitespace-pre-wrap text-[13px] leading-[1.7] text-ink/65">
                      {note.content || 'No additional details'}
                    </p>
                    <div className="mt-auto flex justify-end pt-4 opacity-0 transition group-hover:opacity-50">
                      <ArrowDown size={14} className="-rotate-45" />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[330px] flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-white/35 px-5 text-center">
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#f0e4da] text-accent">
                  {query ? <Search size={23} /> : <FileText size={23} />}
                </span>
                <h2 className="text-base font-semibold">
                  {query ? 'No notes found' : 'Your notebook is waiting'}
                </h2>
                <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
                  {query
                    ? 'Try another search, or clear the search field to see all your notes.'
                    : 'Catch that thought before it wanders off. Your first note is just a tap away.'}
                </p>
                {!query && (
                  <button
                    type="button"
                    onClick={openNewNote}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:shadow-soft"
                  >
                    <Plus size={16} />
                    Write a note
                  </button>
                )}
              </div>
            )}
          </section>

          <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-muted md:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-[#81a58a]" />
            Your notes are saved on this device
          </footer>
        </main>
      </div>

      {(isCreating || editorNote) && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-heading"
            className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-paper shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200/70 px-5 py-4 sm:px-7">
              <button
                type="button"
                onClick={closeEditor}
                className="inline-flex items-center gap-2 rounded-lg py-2 pr-2 text-sm text-muted transition hover:text-ink"
              >
                <ArrowLeft size={17} />
                <span className="hidden sm:inline">All notes</span>
                <span className="sm:hidden">Back</span>
              </button>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Check size={14} className="text-[#81a58a]" />
                Stored on your device
              </div>
              {editorNote ? (
                <button
                  type="button"
                  onClick={() => void handleDelete(editorNote)}
                  aria-label="Delete note"
                  className="rounded-lg p-2 text-muted transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeEditor}
                  aria-label="Close editor"
                  className="rounded-lg p-2 text-muted transition hover:bg-stone-100 hover:text-ink"
                >
                  <X size={17} />
                </button>
              )}
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-10 sm:py-9">
                <p id="editor-heading" className="mb-5 text-xs font-medium uppercase tracking-[0.16em] text-accent">
                  {editorNote ? 'A thought to keep' : 'A new thought'}
                </p>
                <input
                  ref={titleRef}
                  key={editorNote?.id ?? 'new'}
                  name="title"
                  defaultValue={editorNote?.title ?? ''}
                  placeholder="Give your note a title"
                  aria-label="Note title"
                  maxLength={120}
                  className="mb-5 w-full border-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-stone-300 sm:text-3xl"
                />
                <textarea
                  key={`content-${editorNote?.id ?? 'new'}`}
                  name="content"
                  defaultValue={editorNote?.content ?? ''}
                  placeholder="Start writing... anything on your mind."
                  aria-label="Note content"
                  className="min-h-[240px] w-full resize-y border-0 bg-transparent text-[15px] leading-[1.9] text-ink/80 outline-none placeholder:text-stone-400 sm:min-h-[300px]"
                />
              </div>
              <div className="flex items-center justify-between border-t border-stone-200/70 px-5 py-4 sm:px-7">
                <span className="text-xs text-muted">
                  {editorNote
                    ? `Last edited ${formatDate(editorNote.updatedAt)}`
                    : 'A small thought can go a long way.'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#45433d] focus:outline-none focus:ring-4 focus:ring-ink/15"
                  >
                    Save note
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
