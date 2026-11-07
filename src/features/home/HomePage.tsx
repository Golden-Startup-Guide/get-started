import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, CloudOff, HardDrive, LibraryBig } from 'lucide-react'
import { isCoreId } from '../../lib/core'
import { CORE_CATALOG, useCoreStore } from '../../state/coreStore'
import { useReadingStore } from '../../state/readingStore'
import { useLibraryStore } from '../../state/libraryStore'
import type { View } from '../../state/workspaceStore'
import type { CoreNote, Note, ReadingRecord } from '../../types'
import { formatDate } from '../notes/noteDisplay'
import { t, tp } from '../../i18n/i18n'

const RECENT_COUNT = 5

/** Whether this device can show the app without a connection, and whether it is offline now. */
function useOfflineState() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [installed, setInstalled] = useState(() => Boolean(navigator.serviceWorker?.controller))
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      setInstalled(Boolean(navigator.serviceWorker?.controller))
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    navigator.serviceWorker?.addEventListener('controllerchange', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      navigator.serviceWorker?.removeEventListener('controllerchange', update)
    }
  }, [])
  return { online, installed }
}

/**
 * The library entrance (design specification, section 4): where to pick up reading, the libraries
 * to explore, and what was added recently. No scores, feeds, or charts.
 */
export function HomePage({ onNavigate, onOpenNote }: { onNavigate: (view: View) => void; onOpenNote: (note: Note) => void }) {
  const notes = useLibraryStore((state) => state.notes)
  const libraries = useLibraryStore((state) => state.libraries)
  const shelves = useLibraryStore((state) => state.shelves)
  const notebooks = useLibraryStore((state) => state.notebooks)
  const coreNotes = useCoreStore((state) => state.notes)
  const coreLoaded = useCoreStore((state) => state.loaded)
  const readingLoaded = useReadingStore((state) => state.loaded)
  const latestReading = useReadingStore((state) => state.records[0])
  // Undefined until known, then the note opened last, or null when nothing has been read.
  const lastReading: ReadingRecord | null | undefined = readingLoaded ? latestReading ?? null : undefined
  useEffect(() => {
    void useCoreStore.getState().load()
    void useReadingStore.getState().refresh()
  }, [])
  const { online, installed } = useOfflineState()

  const allNotebooks = useMemo(() => [...CORE_CATALOG.notebooks, ...notebooks], [notebooks])
  const allShelves = useMemo(() => [...CORE_CATALOG.shelves, ...shelves], [shelves])
  const allLibraries = useMemo(() => [...CORE_CATALOG.libraries, ...libraries], [libraries])
  /** "Library / Shelf" for a note. */
  const placeOf = (note: Note) => {
    const notebook = allNotebooks.find((item) => item.id === note.notebookId)
    const shelf = allShelves.find((item) => item.id === notebook?.shelfId)
    const library = allLibraries.find((item) => item.id === shelf?.libraryId)
    return [library?.name, shelf?.name, notebook?.name].filter(Boolean).join(' / ')
  }

  const lastNote = lastReading
    ? notes.find((note) => note.id === lastReading.noteId) ?? coreNotes.find((note) => note.id === lastReading.noteId)
    : undefined
  // Wait for the handbooks before deciding there is nothing to continue.
  const waitingForHandbook = Boolean(lastReading && isCoreId(lastReading.noteId) && !coreLoaded)
  const position = lastNote && isCoreId(lastNote.id)
    ? (() => {
        const siblings = coreNotes.filter((note) => note.notebookId === lastNote.notebookId)
        return { index: siblings.findIndex((note) => note.id === lastNote.id) + 1, count: siblings.length }
      })()
    : undefined

  const recent = useMemo(() => {
    const items: Array<{ note: Note; added: number }> = [
      ...coreNotes.map((note: CoreNote) => ({ note: note as Note, added: Date.parse(note.added) })),
      ...notes.map((note) => ({ note, added: note.createdAt })),
    ]
    return items.sort((a, b) => b.added - a.added).slice(0, RECENT_COUNT)
  }, [coreNotes, notes])

  return (
    <div className="home-page">
      <p className="home-intro">{t('Explore practical knowledge, find a new subject, or pick up where you left off.')}</p>

      {/* Its space is kept while the last reading loads, so nothing below it moves. */}
      <div className="home-continue-slot">
      {lastReading !== undefined && !waitingForHandbook && (
        lastNote ? (
          <section className="home-continue" aria-labelledby="home-continue-heading">
            <h2 id="home-continue-heading" className="section-label">{t('Continue reading')}</h2>
            <div className="home-continue-row">
              <div className="min-w-0">
                <p className="home-continue-title">{lastNote.title || t('Untitled note')}</p>
                <p className="home-continue-place">
                  {placeOf(lastNote)}
                  {position && position.index > 0 && <> · {t('Note {index} of {count}', { index: position.index, count: position.count })}</>}
                </p>
              </div>
              <button className="primary-button" onClick={() => onOpenNote(lastNote)}>
                {t('Continue reading')}<span className="sr-only"> {lastNote.title}</span> <ArrowRight size={15} className="rtl:rotate-180" aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : (
          <section className="home-continue" aria-labelledby="home-start-heading">
            <h2 id="home-start-heading" className="section-label">{t('Start reading')}</h2>
            {/* Offline reading is promised only once this device has actually saved the app. */}
            <p className="home-continue-place">{installed ? t('Choose a library below. The handbooks are ready to read, even offline.') : t('Choose a library below.')}</p>
          </section>
        )
      )}
      </div>

      <section aria-labelledby="home-libraries-heading">
        <h2 id="home-libraries-heading" className="home-section-title">{t('Explore libraries')}</h2>
        <ul className="home-tiles">
          {CORE_CATALOG.libraries.map((library) => {
            const shelfCount = CORE_CATALOG.shelves.filter((shelf) => shelf.libraryId === library.id).length
            return (
              <li key={library.id}>
                <button className="home-tile" onClick={() => onNavigate(`library:${library.id}`)}>
                  <span className="home-tile-name"><BookOpen size={16} aria-hidden="true" /> {library.name}</span>
                  <span className="home-tile-text">{library.description}</span>
                  <span className="home-tile-count">{tp(shelfCount, '{count} shelf', '{count} shelves')}</span>
                </button>
              </li>
            )
          })}
          {libraries.map((library) => {
            const notebookCount = notebooks.filter((notebook) => shelves.some((shelf) => shelf.id === notebook.shelfId && shelf.libraryId === library.id)).length
            return (
              <li key={library.id}>
                <button className="home-tile" onClick={() => onNavigate(`library:${library.id}`)}>
                  <span className="home-tile-name"><LibraryBig size={16} aria-hidden="true" /> {library.name}</span>
                  <span className="home-tile-text">{t('Your own library: private, on this device.')}</span>
                  <span className="home-tile-count">{tp(notebookCount, '{count} notebook', '{count} notebooks')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="home-recent-heading">
          <h2 id="home-recent-heading" className="home-section-title">{t('Recently added')}</h2>
          <ul className="home-recent">
            {recent.map(({ note, added }) => (
              <li key={note.id}>
                <button className="home-recent-item" onClick={() => onOpenNote(note)}>
                  <span className="home-recent-title">{note.title || t('Untitled note')}</span>
                  <span className="home-recent-place">{placeOf(note)} · {formatDate(added)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!online ? (
        <p className="home-offline" role="status"><CloudOff size={15} aria-hidden="true" /> {t('You are offline. Your notes and the handbooks still work.')}</p>
      ) : installed ? (
        <p className="home-offline"><HardDrive size={15} aria-hidden="true" /> {t('Available offline: your notes and the handbooks are saved on this device.')}</p>
      ) : null}
    </div>
  )
}
