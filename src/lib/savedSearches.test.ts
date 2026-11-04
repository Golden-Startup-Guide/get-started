import { describe, expect, it } from 'vitest'
import { findSavedSearch, MAX_SAVED_SEARCHES, mergeSavedSearches, validSavedSearch, withSavedSearch } from './savedSearches'

const search = (id: string, query: string, name = query) => ({ id, name, query })

describe('saved searches', () => {
  it('adds a search, trimming it, and renames it instead when the same search is saved again', () => {
    const saved = withSavedSearch([], '  Open   tasks ', ' has:task ', 'a')
    expect(saved).toEqual([{ id: 'a', name: 'Open tasks', query: 'has:task' }])
    expect(withSavedSearch(saved, 'To do', 'has:task', 'b')).toEqual([{ id: 'a', name: 'To do', query: 'has:task' }])
    expect(findSavedSearch(saved, ' has:task  ')).toEqual(saved[0])
    expect(findSavedSearch(saved, 'has:tasks')).toBeUndefined()
  })

  it('refuses empty, overlong, or one too many searches', () => {
    expect(() => withSavedSearch([], 'Name', '   ', 'a')).toThrow('Type a search')
    expect(() => withSavedSearch([], ' ', 'x', 'a')).toThrow('Give the saved search a name')
    expect(() => withSavedSearch([], 'n'.repeat(81), 'x', 'a')).toThrow('at most 80')
    expect(() => withSavedSearch([], 'Name', 'q'.repeat(501), 'a')).toThrow('at most 500')
    const full = Array.from({ length: MAX_SAVED_SEARCHES }, (_, index) => search(`s${index}`, `word${index}`))
    expect(() => withSavedSearch(full, 'One more', 'another', 'x')).toThrow('up to 50')
    // Renaming one still works when the list is full.
    expect(withSavedSearch(full, 'Renamed', 'word3', 'x')[3].name).toBe('Renamed')
  })

  it('adds a backup’s searches that are new here, giving clashing IDs new ones', () => {
    const merged = mergeSavedSearches(
      [search('a', 'has:task')],
      [search('b', 'has:task  '), search('a', 'tag:health'), search('c', 'after:7d')],
    )
    expect(merged.map((item) => item.query)).toEqual(['has:task', 'tag:health', 'after:7d'])
    expect(new Set(merged.map((item) => item.id)).size).toBe(3)
  })

  it('checks saved searches read from a backup', () => {
    expect(validSavedSearch(search('a', 'has:task'))).toBe(true)
    for (const invalid of [null, 'has:task', search('', 'x'), search('a', ' '), search('a', 'x', ''), { id: 'a', name: 'n', query: 3 }]) {
      expect(validSavedSearch(invalid)).toBe(false)
    }
  })
})
