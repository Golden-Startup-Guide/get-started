import type { Library, Note, Notebook, Shelf } from '../types'

/**
 * Note search with operators.
 *
 *   garden plan         every word must appear (title, text, tags, or its notebook, shelf, library)
 *   "seed tray"         an exact phrase
 *   -tomato             must not appear
 *   tag:health  #health has the tag (exact, ignoring case)
 *   notebook:work       its notebook's name starts with "work"; also shelf:, library:
 *   is:pinned           also is:favorite
 *
 * Operators can be negated (-tag:draft) and take quoted values (notebook:"Health Handbook").
 * A word with an unknown operator, like 10:30 or https://…, is searched as plain text.
 */
export interface SearchQuery {
  include: string[]
  exclude: string[]
  tags: string[]
  notTags: string[]
  notebooks: string[]
  notNotebooks: string[]
  shelves: string[]
  notShelves: string[]
  libraries: string[]
  notLibraries: string[]
  is: Array<'pinned' | 'favorite'>
  notIs: Array<'pinned' | 'favorite'>
  /** Plain words and phrases, as typed, for highlighting matches. */
  highlights: string[]
}

const lower = (text: string) => text.toLocaleLowerCase()
const TOKEN = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi
const LOCATION_OPERATORS = {
  notebook: ['notebooks', 'notNotebooks'],
  shelf: ['shelves', 'notShelves'],
  library: ['libraries', 'notLibraries'],
} as const
// An operator typed without a value yet, such as "tag:", is ignored until the value follows.
const BARE_OPERATOR = /^-?(tag|notebook|shelf|library|is):$/i

export function parseSearchQuery(raw: string): SearchQuery {
  const query: SearchQuery = {
    include: [], exclude: [], tags: [], notTags: [], notebooks: [], notNotebooks: [],
    shelves: [], notShelves: [], libraries: [], notLibraries: [], is: [], notIs: [], highlights: [],
  }
  for (const match of raw.matchAll(TOKEN)) {
    const negated = match[1] === '-'
    const operator = match[2]?.toLowerCase()
    const quoted = match[3] !== undefined
    let value = (quoted ? match[3] : match[4]).trim()
    if (!value && !operator) continue
    if (!operator && !quoted && BARE_OPERATOR.test(match[0])) continue

    if (operator === 'tag' || (!operator && !quoted && value.startsWith('#') && value.length > 1)) {
      if (!operator) value = value.slice(1)
      if (value) (negated ? query.notTags : query.tags).push(lower(value))
    } else if (operator && operator in LOCATION_OPERATORS) {
      const [included, excluded] = LOCATION_OPERATORS[operator as keyof typeof LOCATION_OPERATORS]
      if (value) query[negated ? excluded : included].push(lower(value))
    } else if (operator === 'is' && (lower(value) === 'pinned' || /^fav(ou?rites?)?$/i.test(value))) {
      ;(negated ? query.notIs : query.is).push(lower(value) === 'pinned' ? 'pinned' : 'favorite')
    } else {
      // Not an operator we know: search for the whole token as typed.
      const text = operator ? `${match[2]}:${quoted ? `"${value}"` : value}` : value
      if (!text || text === '-') continue
      if (negated) query.exclude.push(lower(text))
      else {
        query.include.push(lower(text))
        query.highlights.push(text)
      }
    }
  }
  return query
}

export function isEmptyQuery(query: SearchQuery): boolean {
  return Object.values(query).every((list) => list.length === 0)
}

// Lower-casing a note's whole text on every keystroke was most of the cost of searching. Each
// note's searchable text is lower-cased once, when it is first searched, and again only after
// the note is saved (its updatedAt changes).
const textCache = new Map<string, { updatedAt: number; text: string }>()

function searchableText(note: Note): string {
  const cached = textCache.get(note.id)
  if (cached && cached.updatedAt === note.updatedAt) return cached.text
  const text = lower(`${note.title}\n${note.content}\n${(note.tags ?? []).join('\n')}`)
  textCache.set(note.id, { updatedAt: note.updatedAt, text })
  return text
}

/** Drops cached text for notes that no longer exist, so deleted notes do not stay in memory. */
export function pruneSearchCache(liveIds: Iterable<string>) {
  const live = new Set(liveIds)
  for (const id of textCache.keys()) if (!live.has(id)) textCache.delete(id)
}

interface Location {
  notebook: string
  shelf: string
  library: string
  /** All three, for plain words. */
  text: string
}

/** Each notebook's lower-cased notebook, shelf, and library names, looked up once per search. */
/** Each notebook's lower-cased location, by notebook ID. */
export type Locations = Map<string, Location>

export function buildLocations(notebooks: readonly Notebook[], shelves: readonly Shelf[], libraries: readonly Library[]): Locations {
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]))
  const libraryName = new Map(libraries.map((library) => [library.id, library.name]))
  return new Map(notebooks.map((notebook) => {
    const shelf = notebook.shelfId ? shelfById.get(notebook.shelfId) : undefined
    const location = {
      notebook: lower(notebook.name),
      shelf: lower(shelf?.name ?? ''),
      library: lower((shelf && libraryName.get(shelf.libraryId)) ?? ''),
    }
    return [notebook.id, { ...location, text: `${location.notebook}\n${location.shelf}\n${location.library}` }]
  }))
}

const EMPTY_LOCATION: Location = { notebook: '', shelf: '', library: '', text: '' }

const startsAny = (name: string, prefixes: string[]) => prefixes.some((prefix) => name.startsWith(prefix))

export function matchesQuery(note: Note, query: SearchQuery, locations: Locations): boolean {
  const location = locations.get(note.notebookId ?? '') ?? EMPTY_LOCATION
  if (query.is.includes('pinned') && !note.pinned) return false
  if (query.is.includes('favorite') && !note.favorite) return false
  if (query.notIs.includes('pinned') && note.pinned) return false
  if (query.notIs.includes('favorite') && note.favorite) return false
  if (query.notebooks.length && !startsAny(location.notebook, query.notebooks)) return false
  if (query.shelves.length && !startsAny(location.shelf, query.shelves)) return false
  if (query.libraries.length && !startsAny(location.library, query.libraries)) return false
  if (query.notNotebooks.length && startsAny(location.notebook, query.notNotebooks)) return false
  if (query.notShelves.length && startsAny(location.shelf, query.notShelves)) return false
  if (query.notLibraries.length && startsAny(location.library, query.notLibraries)) return false
  if (query.tags.length || query.notTags.length) {
    const tags = (note.tags ?? []).map(lower)
    if (!query.tags.every((tag) => tags.includes(tag))) return false
    if (query.notTags.some((tag) => tags.includes(tag))) return false
  }
  if (!query.include.length && !query.exclude.length) return true
  const text = searchableText(note)
  for (const term of query.include) {
    if (!text.includes(term) && !location.text.includes(term)) return false
  }
  for (const term of query.exclude) {
    if (text.includes(term) || location.text.includes(term)) return false
  }
  return true
}
