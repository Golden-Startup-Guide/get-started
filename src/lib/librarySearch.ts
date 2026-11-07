import { plainInline } from '../features/notes/previewBlocks'
import type { SearchQuery } from './search'

const lower = (text: string) => text.toLocaleLowerCase()

/** Whether a search uses only words and phrases (no tag:, notebook:, has:, dates, and so on). */
export function isWordsOnly(query: SearchQuery): boolean {
  return query.include.length > 0
    && [query.tags, query.notTags, query.notebooks, query.notNotebooks, query.shelves, query.notShelves, query.libraries, query.notLibraries, query.is, query.notIs, query.has, query.notHas, query.after, query.before]
      .every((list) => list.length === 0)
}

/**
 * Whether a library, shelf, or notebook matches a search by its name and description: every word
 * or phrase, and none of the excluded ones. Searches that filter notes (tag:, has:, …) find notes
 * only, so places never match them.
 */
export function placeMatches(text: string, query: SearchQuery): boolean {
  if (!isWordsOnly(query)) return false
  const haystack = lower(text)
  return query.include.every((term) => haystack.includes(term)) && !query.exclude.some((term) => haystack.includes(term))
}

/** Whether a title holds every searched word, to list those notes first. */
export function titleMatches(title: string, query: SearchQuery): boolean {
  const haystack = lower(title)
  return query.include.length > 0 && query.include.every((term) => haystack.includes(term))
}

/**
 * A short passage of a note around the first searched word, as plain text, with "…" where it is
 * cut; the start of the note when no word is found (a match by tag or notebook, for instance).
 */
export function snippet(content: string, words: readonly string[], length = 160): string {
  const text = plainInline(content.slice(0, 20_000).replace(/^#{1,6}\s+|^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|^\s*>\s?(?:\[!\w+\]\s*)?/gm, ''))
  const haystack = lower(text)
  const at = words.map((word) => haystack.indexOf(lower(word))).filter((index) => index >= 0).sort((a, b) => a - b)[0]
  if (at === undefined || text.length <= length) return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text
  const start = Math.max(0, at - Math.floor(length / 3))
  const end = Math.min(text.length, start + length)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}
