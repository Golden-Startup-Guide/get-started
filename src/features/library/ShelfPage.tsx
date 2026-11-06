import { useEffect, useState, type FormEvent } from 'react'
import { Archive, ArrowRight, Plus } from 'lucide-react'
import { isCoreId } from '../../lib/core'
import { createNotebookOnShelf, promptRename } from '../../state/actions'
import { lastOpenedAmong, useReadingStore } from '../../state/readingStore'
import { useWorkspaceStore, type View } from '../../state/workspaceStore'
import type { Note } from '../../types'
import { descriptionOf, useStructure } from './structure'
import { t, tp } from '../../i18n/i18n'

/**
 * A shelf (design specification, section 4): its notebooks, where the reader left off on this
 * shelf, and the other shelves in its library. A personal shelf also has a Manage section.
 */
export function ShelfPage({ shelfId, onNavigate, onOpenNote }: { shelfId: string; onNavigate: (view: View) => void; onOpenNote: (note: Note) => void }) {
  const structure = useStructure()
  const records = useReadingStore((state) => state.records)
  const askToDelete = useWorkspaceStore((state) => state.askToDelete)
  const [notebookName, setNotebookName] = useState('')
  useEffect(() => {
    void useReadingStore.getState().refresh()
  }, [])
  const shelf = structure.shelves.find((item) => item.id === shelfId)
  if (!shelf) return null
  const handbook = isCoreId(shelf.id)
  const notebooks = structure.notebooksOf(shelf.id)
  const notes = structure.notesOfShelf(shelf.id)
  const countsKnown = !handbook || structure.coreLoaded
  const last = lastOpenedAmong(records, new Set(notes.map((note) => note.id)))
  const lastNote = last && notes.find((note) => note.id === last.noteId)
  const otherShelves = structure.shelvesOf(shelf.libraryId).filter((item) => item.id !== shelf.id)

  async function addNotebook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await createNotebookOnShelf(notebookName, shelfId, (created) => {
      setNotebookName('')
      onNavigate(`notebook:${created.id}`)
    })
  }

  return (
    <div className="level-page">
      <p className="level-counts">
        {tp(notebooks.length, '{count} notebook', '{count} notebooks')}
        {countsKnown && <> · {tp(notes.length, '{count} note', '{count} notes')}</>}
      </p>

      {lastNote && (
        <section className="home-continue" aria-labelledby="shelf-continue-heading">
          <h2 id="shelf-continue-heading" className="section-label">{t('Continue reading')}</h2>
          <div className="home-continue-row">
            <div className="min-w-0">
              <p className="home-continue-title">{lastNote.title || t('Untitled note')}</p>
              <p className="home-continue-place">{structure.notebooks.find((notebook) => notebook.id === lastNote.notebookId)?.name}</p>
            </div>
            <button className="primary-button" onClick={() => onOpenNote(lastNote)}>
              {t('Continue reading')}<span className="sr-only"> {lastNote.title}</span> <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="shelf-notebooks-heading">
        <h2 id="shelf-notebooks-heading" className="level-section-title">{t('Notebooks')}</h2>
        {notebooks.length ? (
          <ul className="level-cards">
            {notebooks.map((notebook) => {
              const notebookNotes = structure.notesOf(notebook.id)
              const read = lastOpenedAmong(records, new Set(notebookNotes.map((note) => note.id)))
              const readIndex = read ? notebookNotes.findIndex((note) => note.id === read.noteId) + 1 : 0
              return (
                <li key={notebook.id} className="level-card">
                  <h3 className="level-card-title"><Archive size={17} aria-hidden="true" /> {notebook.name}</h3>
                  {descriptionOf(notebook) && <p className="level-card-text">{descriptionOf(notebook)}</p>}
                  {countsKnown && <p className="level-card-count">{tp(notebookNotes.length, '{count} note', '{count} notes')}</p>}
                  {/* Progress only for handbooks, whose notes have an order, and only in words. */}
                  {isCoreId(notebook.id) && readIndex > 0 && (
                    <p className="level-card-progress">{t('Last read: note {index} of {count}', { index: readIndex, count: notebookNotes.length })}</p>
                  )}
                  <button className="secondary-button level-card-action" onClick={() => onNavigate(`notebook:${notebook.id}`)}>
                    {t('Open notebook')}<span className="sr-only"> {notebook.name}</span> <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="level-empty">{t('Notebooks hold notes on one subject. Add the first one under Manage this shelf.')}</p>
        )}
      </section>

      {otherShelves.length > 0 && (
        <section aria-labelledby="shelf-related-heading">
          <h2 id="shelf-related-heading" className="level-section-title">{t('Other shelves in this library')}</h2>
          <ul className="related-list">
            {otherShelves.map((other) => (
              <li key={other.id}>
                <button className="related-item" onClick={() => onNavigate(`shelf:${other.id}`)}>
                  <span className="home-recent-title">{other.name}</span>
                  {descriptionOf(other) && <span className="home-recent-place">{descriptionOf(other)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!handbook && (
        <section className="manage-section" aria-labelledby="shelf-manage-heading">
          <h2 id="shelf-manage-heading" className="level-section-title">{t('Manage this shelf')}</h2>
          <form className="flex max-w-xl gap-2" onSubmit={(event) => void addNotebook(event)}>
            <label className="sr-only" htmlFor="shelf-new-notebook">{t('New notebook in {name}', { name: shelf.name })}</label>
            <input id="shelf-new-notebook" className="small-input min-w-0 flex-1" value={notebookName} onChange={(event) => setNotebookName(event.target.value)} placeholder={t('New notebook in {viewLabel}', { viewLabel: shelf.name })} />
            <button className="secondary-button" type="submit"><Plus size={15} aria-hidden="true" /> {t('Add notebook')}</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => void promptRename({ kind: 'shelf', item: shelf })}>{t('Rename shelf')}</button>
            <button className="danger-button" disabled={structure.shelvesOf(shelf.libraryId).length <= 1} onClick={() => askToDelete({ kind: 'shelf', item: shelf })}>{t('Delete shelf')}</button>
          </div>
          {structure.shelvesOf(shelf.libraryId).length <= 1 && <p className="mt-2 text-xs text-[var(--muted)]">{t('The last shelf in a library cannot be deleted.')}</p>}
        </section>
      )}
    </div>
  )
}
