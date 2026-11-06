import { useState, type FormEvent } from 'react'
import { ArrowRight, Layers3, Plus } from 'lucide-react'
import { isCoreId } from '../../lib/core'
import { createShelfInLibrary, promptRename } from '../../state/actions'
import { useWorkspaceStore, type View } from '../../state/workspaceStore'
import type { Note } from '../../types'
import { formatDate } from '../notes/noteDisplay'
import { descriptionOf, useStructure } from './structure'
import { t, tp } from '../../i18n/i18n'

const RECENT_COUNT = 3

/**
 * A library (design specification, section 4): what it holds, its shelves, and what was added
 * recently. A personal library also has a Manage section at the end; handbooks cannot be changed.
 */
export function LibraryPage({ libraryId, onNavigate, onOpenNote }: { libraryId: string; onNavigate: (view: View) => void; onOpenNote: (note: Note) => void }) {
  const structure = useStructure()
  const askToDelete = useWorkspaceStore((state) => state.askToDelete)
  const [shelfName, setShelfName] = useState('')
  const library = structure.libraries.find((item) => item.id === libraryId)
  if (!library) return null
  const handbook = isCoreId(library.id)
  const shelves = structure.shelvesOf(library.id)
  const notebookCount = shelves.reduce((sum, shelf) => sum + structure.notebooksOf(shelf.id).length, 0)
  const notes = structure.notesOfLibrary(library.id)
  const countsKnown = !handbook || structure.coreLoaded
  const recent = [...notes].sort((a, b) => structure.addedAt(b) - structure.addedAt(a)).slice(0, RECENT_COUNT)
  const personalLibraries = structure.libraries.filter((item) => !isCoreId(item.id))

  async function addShelf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createShelfInLibrary(libraryId, shelfName, (created) => {
      setShelfName('')
      onNavigate(`shelf:${created.id}`)
    })
  }

  return (
    <div className="level-page">
      <p className="level-counts">
        {tp(shelves.length, '{count} shelf', '{count} shelves')} · {tp(notebookCount, '{count} notebook', '{count} notebooks')}
        {countsKnown && <> · {tp(notes.length, '{count} note', '{count} notes')}</>}
      </p>

      <section aria-labelledby="library-shelves-heading">
        <h2 id="library-shelves-heading" className="level-section-title">{t('Shelves')}</h2>
        {shelves.length ? (
          <ul className="level-cards">
            {shelves.map((shelf) => {
              const notebooks = structure.notebooksOf(shelf.id)
              return (
                <li key={shelf.id} className="level-card">
                  <h3 className="level-card-title"><Layers3 size={17} aria-hidden="true" /> {shelf.name}</h3>
                  {descriptionOf(shelf) && <p className="level-card-text">{descriptionOf(shelf)}</p>}
                  {notebooks.length > 0 && <p className="level-card-list">{notebooks.map((notebook) => notebook.name).join(' · ')}</p>}
                  <p className="level-card-count">
                    {tp(notebooks.length, '{count} notebook', '{count} notebooks')}
                    {countsKnown && <> · {tp(structure.notesOfShelf(shelf.id).length, '{count} note', '{count} notes')}</>}
                  </p>
                  {/* The visible words start the button's name, so voice control can use them. */}
                  <button className="secondary-button level-card-action" onClick={() => onNavigate(`shelf:${shelf.id}`)}>
                    {t('Open shelf')}<span className="sr-only"> {shelf.name}</span> <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="level-empty">{t('Shelves group notebooks by topic. Add the first one under Manage this library.')}</p>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="library-recent-heading">
          <h2 id="library-recent-heading" className="level-section-title">{t('Recently added')}</h2>
          <ul className="home-recent">
            {recent.map((note) => (
              <li key={note.id}>
                <button className="home-recent-item" onClick={() => onOpenNote(note)}>
                  <span className="home-recent-title">{note.title || t('Untitled note')}</span>
                  <span className="home-recent-place">{structure.notebooks.find((notebook) => notebook.id === note.notebookId)?.name} · {formatDate(structure.addedAt(note))}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!handbook && (
        <section className="manage-section" aria-labelledby="library-manage-heading">
          <h2 id="library-manage-heading" className="level-section-title">{t('Manage this library')}</h2>
          <form className="flex max-w-xl gap-2" onSubmit={(event) => void addShelf(event)}>
            <label className="sr-only" htmlFor={`page-new-shelf-${library.id}`}>{t('New shelf in {name}', { name: library.name })}</label>
            <input id={`page-new-shelf-${library.id}`} className="small-input min-w-0 flex-1" value={shelfName} onChange={(event) => setShelfName(event.target.value)} placeholder={t('New shelf')} />
            <button className="secondary-button" type="submit"><Plus size={15} aria-hidden="true" /> {t('Add shelf')}</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => void promptRename({ kind: 'library', item: library })}>{t('Rename library')}</button>
            <button className="danger-button" disabled={personalLibraries.length <= 1} onClick={() => askToDelete({ kind: 'library', item: library })}>{t('Delete library')}</button>
          </div>
          {personalLibraries.length <= 1 && <p className="mt-2 text-xs text-[var(--muted)]">{t('The last library cannot be deleted.')}</p>}
        </section>
      )}
    </div>
  )
}
