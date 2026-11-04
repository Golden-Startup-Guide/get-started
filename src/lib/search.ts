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
 *   has:attachment      has attached files; also has:task (an unticked checklist item), has:link
 *   after:2026-11-01    last edited on or after that day; before: is earlier than it. Also takes
 *                       2026-11, 2026, today, yesterday, and 7d / 2w / 3m / 1y ago
 *
 * Operators can be negated (-tag:draft) and take quoted values (notebook:"Health Handbook").
 * A word with an unknown operator or value, like 10:30, https://…, or has:pizza, is searched as
 * plain text.
 */
export type HasFilter = 'attachment' | 'task' | 'link'

/** The parts of a note that search reads. */
export type SearchFields = Pick<Note, 'id' | 'title' | 'content' | 'tags' | 'notebookId' | 'pinned' | 'favorite' | 'updatedAt'>

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
  has: HasFilter[]
  notHas: HasFilter[]
  /** Last edited on or after each of these times. */
  after: number[]
  /** Last edited before each of these times. */
  before: number[]
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
const BARE_OPERATOR = /^-?(tag|notebook|shelf|library|is|has|before|after):$/i

const HAS_VALUES: Record<string, HasFilter> = {
  attachment: 'attachment', attachments: 'attachment', file: 'attachment', files: 'attachment',
  task: 'task', tasks: 'task', todo: 'task', todos: 'task',
  link: 'link', links: 'link',
}

/**
 * The start of the day, month, or year a date value names, in local time: 2026-11-04, 2026-11,
 * 2026, today, yesterday, or a count of days, weeks, months, or years ago (7d, 2w, 3m, 1y).
 */
export function parseDateValue(value: string, now = new Date()): number | undefined {
  const text = lower(value)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (text === 'today') return today.getTime()
  if (text === 'yesterday') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime()
  const ago = /^(\d{1,4})([dwmy])$/.exec(text)
  if (ago) {
    const count = Number(ago[1])
    const unit = ago[2]
    return new Date(
      today.getFullYear() - (unit === 'y' ? count : 0),
      today.getMonth() - (unit === 'm' ? count : 0),
      today.getDate() - (unit === 'd' ? count : unit === 'w' ? count * 7 : 0),
    ).getTime()
  }
  const date = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text)
  if (!date) return undefined
  const [year, month, day] = [Number(date[1]), Number(date[2] ?? 1), Number(date[3] ?? 1)]
  const start = new Date(year, month - 1, day)
  // Reject dates the calendar does not have, such as 2026-02-30, rather than rolling them over.
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return undefined
  return start.getTime()
}

export function parseSearchQuery(raw: string, now = new Date()): SearchQuery {
  const query: SearchQuery = {
    include: [], exclude: [], tags: [], notTags: [], notebooks: [], notNotebooks: [],
    shelves: [], notShelves: [], libraries: [], notLibraries: [], is: [], notIs: [],
    has: [], notHas: [], after: [], before: [], highlights: [],
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
    } else if (operator === 'has' && Object.hasOwn(HAS_VALUES, lower(value))) {
      ;(negated ? query.notHas : query.has).push(HAS_VALUES[lower(value)])
    } else if ((operator === 'before' || operator === 'after') && parseDateValue(value, now) !== undefined) {
      // Not before a day is on or after it, and the other way round.
      const time = parseDateValue(value, now) as number
      ;((operator === 'after') !== negated ? query.after : query.before).push(time)
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

function searchableText(note: SearchFields): string {
  const cached = textCache.get(note.id)
  if (cached && cached.updatedAt === note.updatedAt) return cached.text
  const text = lower(`${note.title}\n${note.content}\n${(note.tags ?? []).join('\n')}`)
  textCache.set(note.id, { updatedAt: note.updatedAt, text })
  return text
}

/** Prepares a note's lower-cased text ahead of the first search (the search worker does this when idle). */
export function prepareForSearch(note: SearchFields): void {
  searchableText(note)
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

// A checklist item not yet ticked: "- [ ] …", also with * or + or a number.
const OPEN_TASK = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[ \]/m
const NOTE_LINK = /\[\[[^\]\n]+\]\]/
const NO_ATTACHMENTS: ReadonlySet<string> = new Set()

function noteHas(note: SearchFields, filter: HasFilter, attached: ReadonlySet<string>): boolean {
  if (filter === 'attachment') return attached.has(note.id)
  return (filter === 'task' ? OPEN_TASK : NOTE_LINK).test(note.content)
}

/**
 * `attached` holds the IDs of notes with attachments, for has:attachment (attachments are stored
 * apart from notes).
 */
export function matchesQuery(note: SearchFields, query: SearchQuery, locations: Locations, attached = NO_ATTACHMENTS): boolean {
  const location = locations.get(note.notebookId ?? '') ?? EMPTY_LOCATION
  if (query.after.some((time) => note.updatedAt < time)) return false
  if (query.before.some((time) => note.updatedAt >= time)) return false
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
  if (query.has.some((filter) => !noteHas(note, filter, attached))) return false
  if (query.notHas.some((filter) => noteHas(note, filter, attached))) return false
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
