import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, BookOpen, FileText, Layers3, LibraryBig, Search, X } from 'lucide-react'
import { isCoreId } from '../../lib/core'
import { placeMatches, snippet, titleMatches } from '../../lib/librarySearch'
import { buildLocations, isEmptyQuery, matchesQuery, type SearchQuery } from '../../lib/search'
import type { View } from '../../state/workspaceStore'
import type { Library, Note, Notebook, Shelf } from '../../types'
import { descriptionOf, useStructure } from '../library/structure'
import { SearchTips } from '../notes/SearchTips'
import { highlight } from '../notes/noteDisplay'
import { useCoreStore } from '../../state/coreStore'
import { t, tp } from '../../i18n/i18n'

const PAGE = 50

type Result =
  | { kind: 'library'; item: Library }
  | { kind: 'shelf'; item: Shelf }
  | { kind: 'notebook'; item: Notebook }
  | { kind: 'note'; item: Note }

const LEVELS = {
  library: () => t('Library'),
  shelf: () => t('Shelf'),
  notebook: () => t('Notebook'),
  note: () => t('Note'),
}

/**
 * One search across the whole library (design specification, sections 3 and 7): the handbooks'
 * libraries, shelves, notebooks, and notes, and your own notes. Each result says what it is and
 * where it sits, with the searched words marked. The search is part of the address, so Back from
 * a result returns here with it.
 */
export function SearchPage({
  query,
  searchQuery,
  personalMatches,
  searching,
  onQuery,
  onNavigate,
  onOpenNote,
}: {
  query: string
  searchQuery: SearchQuery
  /** Personal notes matching the search, already found (in a worker for large libraries). */
  personalMatches: Note[]
  /** The worker is still searching. */
  searching: boolean
  onQuery: (query: string) => void
  onNavigate: (view: View) => void
  onOpenNote: (note: Note) => void
}) {
  const structure = useStructure()
  const coreNotes = useCoreStore((state) => state.notes)
  const inputRef = useRef<HTMLInputElement>(null)
  const [shown, setShown] = useState(PAGE)
  useEffect(() => {
    void useCoreStore.getState().load()
    inputRef.current?.focus()
  }, [])

  const empty = isEmptyQuery(searchQuery)
  const results = useMemo<Result[]>(() => {
    if (empty) return []
    const places: Result[] = [
      ...structure.libraries.filter((item) => placeMatches(`${item.name} ${descriptionOf(item) ?? ''}`, searchQuery)).map((item) => ({ kind: 'library' as const, item })),
      ...structure.shelves.filter((item) => placeMatches(`${item.name} ${descriptionOf(item) ?? ''}`, searchQuery)).map((item) => ({ kind: 'shelf' as const, item })),
      ...structure.notebooks.filter((item) => placeMatches(`${item.name} ${descriptionOf(item) ?? ''}`, searchQuery)).map((item) => ({ kind: 'notebook' as const, item })),
    ]
    const locations = buildLocations(structure.notebooks, structure.shelves, structure.libraries)
    const notes: Result[] = [...coreNotes.filter((note) => matchesQuery(note, searchQuery, locations)), ...personalMatches]
      .map((item) => ({ kind: 'note' as const, item }))
    // What the words name comes before what merely mentions them: places and notes matched by
    // their name or title, then by a description or the text. Within each, handbooks come first.
    const named = (result: Result) => titleMatches(result.kind === 'note' ? result.item.title : result.item.name, searchQuery)
    return [
      ...places.filter(named),
      ...notes.filter(named),
      ...places.filter((result) => !named(result)),
      ...notes.filter((result) => !named(result)),
    ]
  }, [empty, structure, coreNotes, personalMatches, searchQuery])

  /** "Library / Shelf / Notebook" above a result. */
  const pathOf = (result: Result): string => {
    const notebook = result.kind === 'note' ? structure.notebooks.find((item) => item.id === result.item.notebookId) : result.kind === 'notebook' ? result.item : undefined
    const shelf = result.kind === 'shelf' ? result.item : structure.shelves.find((item) => item.id === notebook?.shelfId)
    const library = result.kind === 'library' ? undefined : structure.libraries.find((item) => item.id === shelf?.libraryId)
    const parts = result.kind === 'note' ? [library, shelf, notebook] : result.kind === 'notebook' ? [library, shelf] : result.kind === 'shelf' ? [library] : []
    return parts.map((part) => part?.name).filter(Boolean).join(' / ')
  }
  const open = (result: Result) => {
    if (result.kind === 'note') onOpenNote(result.item)
    else onNavigate(`${result.kind}:${result.item.id}`)
  }
  const icon = (result: Result) => {
    if (result.kind === 'library') return isCoreId(result.item.id) ? <BookOpen size={15} aria-hidden="true" /> : <LibraryBig size={15} aria-hidden="true" />
    if (result.kind === 'shelf') return <Layers3 size={15} aria-hidden="true" />
    if (result.kind === 'notebook') return <Archive size={15} aria-hidden="true" />
    return <FileText size={15} aria-hidden="true" />
  }

  return (
    <div className="level-page search-page">
      <div className="search-field">
        <Search size={18} aria-hidden="true" />
        <label htmlFor="library-search" className="sr-only">{t('Search the handbooks and your notes')}</label>
        <input
          ref={inputRef}
          id="library-search"
          type="search"
          value={query}
          onChange={(event) => {
            setShown(PAGE)
            onQuery(event.target.value)
          }}
          placeholder={t('Search the handbooks and your notes')}
        />
        {query && <button className="icon-button !h-8 !w-8" onClick={() => onQuery('')} aria-label={t('Clear search')}><X size={15} /></button>}
        <SearchTips onAdd={(example) => {
          onQuery(query.trim() ? `${query.trimEnd()} ${example}` : example)
          inputRef.current?.focus()
        }} />
      </div>

      <p className="search-status" role="status">
        {empty
          ? t('Type a word or two to search every library, shelf, notebook, and note.')
          : searching
            ? t('Searching…')
            : tp(results.length, '{count} result for “{query}”', '{count} results for “{query}”', { query: query.trim() })}
      </p>

      {!empty && !searching && results.length === 0 && (
        <div className="search-none">
          <p>{t('Nothing in the handbooks or your notes matched. Try fewer or different words, or browse the libraries.')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="secondary-button" onClick={() => {
              onQuery('')
              inputRef.current?.focus()
            }}>{t('Clear search')}</button>
            <button className="secondary-button" onClick={() => onNavigate('home')}>{t('Browse the libraries')}</button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <ol className="search-results" aria-label={t('Search results')}>
          {results.slice(0, shown).map((result) => (
            <li key={`${result.kind}:${result.item.id}`}>
              <button className="search-result" onClick={() => open(result)}>
                <span className="search-result-level">{icon(result)} {LEVELS[result.kind]()}{result.kind === 'note' && isCoreId(result.item.id) ? ` · ${t('Handbook')}` : ''}</span>
                <span className="search-result-title">{highlight(result.kind === 'note' ? result.item.title || t('Untitled note') : result.item.name, searchQuery.highlights)}</span>
                {pathOf(result) && <span className="search-result-path">{pathOf(result)}</span>}
                <span className="search-result-text">
                  {highlight(result.kind === 'note' ? snippet(result.item.content, searchQuery.highlights) : descriptionOf(result.item) ?? '', searchQuery.highlights)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {results.length > shown && (
        <button className="secondary-button self-start" onClick={() => setShown((count) => count + PAGE)}>
          {t('Show {count} more', { count: Math.min(PAGE, results.length - shown) })}
        </button>
      )}
    </div>
  )
}
