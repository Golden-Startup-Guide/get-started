import type { SavedSearch } from '../types'
import { t } from '../i18n/i18n'

export const MAX_SAVED_SEARCHES = 50
export const MAX_SAVED_SEARCH_NAME = 80
export const MAX_SAVED_SEARCH_QUERY = 500

/** Searches are the same when they read the same, ignoring surrounding and repeated spaces. */
export const sameSearch = (a: string, b: string) => a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ')

export function findSavedSearch(saved: readonly SavedSearch[] | undefined, query: string): SavedSearch | undefined {
  return saved?.find((search) => sameSearch(search.query, query))
}

export function validSavedSearch(value: unknown): value is SavedSearch {
  if (typeof value !== 'object' || value === null) return false
  const { id, name, query } = value as Record<string, unknown>
  return (
    typeof id === 'string' && id.length > 0 &&
    typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_SAVED_SEARCH_NAME &&
    typeof query === 'string' && query.trim().length > 0 && query.length <= MAX_SAVED_SEARCH_QUERY
  )
}

/**
 * Adds a search to the list, or renames it when the same search is already saved. Throws when
 * the name or search is empty or too long, or the list is full.
 */
export function withSavedSearch(saved: readonly SavedSearch[], name: string, query: string, id: string): SavedSearch[] {
  const search = { id, name: name.trim().replace(/\s+/g, ' '), query: query.trim() }
  if (!search.query) throw new Error(t("Type a search before saving it."))
  if (!search.name) throw new Error(t("Give the saved search a name."))
  if (search.name.length > MAX_SAVED_SEARCH_NAME) throw new Error(t("Saved search names can be at most {MAX_SAVED_SEARCH_NAME} characters.", { MAX_SAVED_SEARCH_NAME }))
  if (search.query.length > MAX_SAVED_SEARCH_QUERY) throw new Error(t("Saved searches can be at most {MAX_SAVED_SEARCH_QUERY} characters.", { MAX_SAVED_SEARCH_QUERY }))
  const existing = findSavedSearch(saved, search.query)
  if (existing) return saved.map((item) => (item === existing ? { ...existing, name: search.name } : item))
  if (saved.length >= MAX_SAVED_SEARCHES) throw new Error(t("You can save up to {MAX_SAVED_SEARCHES} searches. Remove one first.", { MAX_SAVED_SEARCHES }))
  return [...saved, search]
}

/** Saved searches from a backup that this library does not have yet, added after its own. */
export function mergeSavedSearches(local: readonly SavedSearch[], imported: readonly SavedSearch[]): SavedSearch[] {
  const merged = [...local]
  for (const search of imported) {
    if (merged.length >= MAX_SAVED_SEARCHES) break
    if (findSavedSearch(merged, search.query)) continue
    merged.push(merged.some((item) => item.id === search.id) ? { ...search, id: crypto.randomUUID() } : search)
  }
  return merged
}
