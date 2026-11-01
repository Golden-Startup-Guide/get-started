import { useState, type FormEvent } from 'react'
import { ArrowLeft, Layers3, Plus } from 'lucide-react'
import { createNamedLibrary, createShelfInLibrary, promptRename } from '../../state/actions'
import { useLibraryStore } from '../../state/libraryStore'
import { useWorkspaceStore, type View } from '../../state/workspaceStore'

export function LibraryHome({ libraryId, onNavigate }: { libraryId: string; onNavigate: (view: View) => void }) {
  const notes = useLibraryStore((state) => state.notes)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const libraries = useLibraryStore((state) => state.libraries)
  const shelves = useLibraryStore((state) => state.shelves)
  const askToDelete = useWorkspaceStore((state) => state.askToDelete)
  const [shelfName, setShelfName] = useState('')
  const [libraryName, setLibraryName] = useState('')
  const library = libraries.find((item) => item.id === libraryId)
  const libraryShelves = shelves.filter((shelf) => shelf.libraryId === libraryId)

  async function addShelf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!library) return
    await createShelfInLibrary(library.id, shelfName, (created) => {
      setShelfName('')
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

  return (
    <section aria-labelledby="library-home-title">
      <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="section-label">Personal Knowledge Library</p>
        <h2 id="library-home-title" className="mt-2 text-xl font-semibold">Library home</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Organize notebooks and notes into shelves. Your notes remain available in All Notes at any time.</p>
        {library && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => void promptRename({ kind: 'library', item: library })}>Rename library</button>
            <button className="danger-button" disabled={libraries.length <= 1} onClick={() => askToDelete({ kind: 'library', item: library })}>Delete library</button>
          </div>
        )}
      </div>
      {library && (
        <div className="mb-5 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2">
          <form className="flex gap-2" onSubmit={(event) => void addShelf(event)}>
            <label className="sr-only" htmlFor={`home-new-shelf-${library.id}`}>New shelf in {library.name}</label>
            <input id={`home-new-shelf-${library.id}`} className="small-input min-w-0 flex-1" value={shelfName} onChange={(event) => setShelfName(event.target.value)} placeholder="New shelf" />
            <button className="secondary-button" type="submit"><Plus size={15} /> Add shelf</button>
          </form>
          <form className="flex gap-2" onSubmit={(event) => void addLibrary(event)}>
            <label className="sr-only" htmlFor="home-new-library">New library name</label>
            <input id="home-new-library" className="small-input min-w-0 flex-1" value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="New library" />
            <button className="secondary-button" type="submit"><Plus size={15} /> Add library</button>
          </form>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {libraryShelves.map((shelf) => {
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
                <button className="secondary-button" onClick={() => onNavigate(`shelf:${shelf.id}`)} aria-label={`Open ${shelf.name} shelf`}>Open shelf <ArrowLeft className="rotate-180" size={15} /></button>
                <button className="secondary-button" aria-label={`Rename ${shelf.name}`} onClick={() => void promptRename({ kind: 'shelf', item: shelf })}>Rename shelf</button>
                <button className="danger-button" aria-label={`Delete ${shelf.name}`} disabled={libraryShelves.length <= 1} onClick={() => askToDelete({ kind: 'shelf', item: shelf })}>Delete shelf</button>
              </div>
            </article>
          )
        })}
        {libraryShelves.length === 0 && (
          <div className="empty-state sm:col-span-2 xl:col-span-3">
            <span className="empty-icon"><Layers3 size={24} /></span>
            <h2 className="mt-4 text-lg font-semibold">No shelves yet</h2>
            <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">Add a shelf from the library navigation to start organizing this library.</p>
          </div>
        )}
      </div>
    </section>
  )
}
