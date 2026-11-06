import { useEffect } from 'react'
import { ArrowRight, Bookmark } from 'lucide-react'
import { lastOpenedAmong, useReadingStore } from '../../state/readingStore'
import type { View } from '../../state/workspaceStore'
import type { CoreNote, Note } from '../../types'
import { descriptionOf, useStructure } from './structure'
import { t, tp } from '../../i18n/i18n'

/**
 * A handbook notebook (design specification, section 4): its contents in reading order, with the
 * reader's place marked in words as well as visually, then the notebooks beside it.
 */
export function HandbookNotebookPage({ notebookId, onNavigate, onOpenNote }: { notebookId: string; onNavigate: (view: View) => void; onOpenNote: (note: Note) => void }) {
  const structure = useStructure()
  const records = useReadingStore((state) => state.records)
  useEffect(() => {
    void useReadingStore.getState().refresh()
  }, [])
  const notebook = structure.notebooks.find((item) => item.id === notebookId)
  if (!notebook) return null
  const notes = structure.notesOf(notebook.id) as CoreNote[]
  const last = lastOpenedAmong(records, new Set(notes.map((note) => note.id)))
  const lastIndex = last ? notes.findIndex((note) => note.id === last.noteId) : -1
  const shelf = structure.shelves.find((item) => item.id === notebook.shelfId)
  const beside = structure.notebooksOf(notebook.shelfId ?? '').filter((item) => item.id !== notebook.id)
  const elsewhere = shelf
    ? structure.shelvesOf(shelf.libraryId).filter((item) => item.id !== shelf.id).flatMap((item) => structure.notebooksOf(item.id))
    : []
  const related = [...beside, ...elsewhere].slice(0, 4)

  return (
    <div className="level-page">
      <p className="level-counts">{structure.coreLoaded ? tp(notes.length, '{count} note', '{count} notes') : t('Loading the handbooks…')}</p>

      {lastIndex >= 0 && (
        <section className="home-continue" aria-labelledby="notebook-continue-heading">
          <h2 id="notebook-continue-heading" className="section-label">{t('Continue reading')}</h2>
          <div className="home-continue-row">
            <div className="min-w-0">
              <p className="home-continue-title">{notes[lastIndex].title}</p>
              <p className="home-continue-place">{t('Note {index} of {count}', { index: lastIndex + 1, count: notes.length })}</p>
            </div>
            <button className="primary-button" onClick={() => onOpenNote(notes[lastIndex])}>
              {t('Continue reading')}<span className="sr-only"> {notes[lastIndex].title}</span> <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="notebook-contents-heading">
          <h2 id="notebook-contents-heading" className="level-section-title">{t('Contents')}</h2>
          <ol className="contents-list">
            {notes.map((note, index) => (
              <li key={note.id} className={index === lastIndex ? 'contents-current' : undefined}>
                <button className="contents-item" onClick={() => onOpenNote(note)}>
                  <span className="contents-number" aria-hidden="true">{index + 1}</span>
                  <span className="contents-text">
                    <span className="contents-title">{note.title}</span>
                    <span className="contents-summary">{note.summary}</span>
                    {note.draft && <span className="contents-draft">{t('Draft')}</span>}
                  </span>
                  {index === lastIndex && <span className="contents-here"><Bookmark size={13} aria-hidden="true" /> {t('Last read')}</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="notebook-related-heading">
          <h2 id="notebook-related-heading" className="level-section-title">{t('Related notebooks')}</h2>
          <ul className="related-list">
            {related.map((other) => (
              <li key={other.id}>
                <button className="related-item" onClick={() => onNavigate(`notebook:${other.id}`)}>
                  <span className="home-recent-title">{other.name}</span>
                  {descriptionOf(other) && <span className="home-recent-place">{descriptionOf(other)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
