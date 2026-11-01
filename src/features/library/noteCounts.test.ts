import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLibraryStore } from '../../state/libraryStore'
import type { Note } from '../../types'
import { useNoteCounts } from './noteCounts'

const note = (id: string, notebookId: string | undefined, favorite = false): Note =>
  ({ id, title: id, content: '', createdAt: 1, updatedAt: 1, notebookId, favorite })

describe('useNoteCounts', () => {
  it('counts notes per notebook, shelf, and library in one pass', () => {
    useLibraryStore.setState({
      libraries: [
        { id: 'lib-a', name: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'lib-b', name: 'B', createdAt: 1, updatedAt: 1 },
      ],
      shelves: [
        { id: 'shelf-1', libraryId: 'lib-a', name: 'One', createdAt: 1, updatedAt: 1 },
        { id: 'shelf-2', libraryId: 'lib-a', name: 'Two', createdAt: 1, updatedAt: 1 },
        { id: 'shelf-3', libraryId: 'lib-b', name: 'Three', createdAt: 1, updatedAt: 1 },
      ],
      notebooks: [
        { id: 'nb-1', name: 'N1', shelfId: 'shelf-1', createdAt: 1, updatedAt: 1 },
        { id: 'nb-2', name: 'N2', shelfId: 'shelf-1', createdAt: 1, updatedAt: 1 },
        { id: 'nb-3', name: 'N3', shelfId: 'shelf-2', createdAt: 1, updatedAt: 1 },
        { id: 'nb-loose', name: 'No shelf', createdAt: 1, updatedAt: 1 },
      ],
      notes: [
        note('a', 'nb-1', true),
        note('b', 'nb-1'),
        note('c', 'nb-2', true),
        note('d', 'nb-3'),
        note('e', 'nb-loose'),
        note('f', undefined),
      ],
    })
    const { result } = renderHook(() => useNoteCounts())
    expect(Object.fromEntries(result.current.byNotebook)).toEqual({ 'nb-1': 2, 'nb-2': 1, 'nb-3': 1, 'nb-loose': 1, '': 1 })
    expect(Object.fromEntries(result.current.byShelf)).toEqual({ 'shelf-1': 3, 'shelf-2': 1 })
    expect(Object.fromEntries(result.current.byLibrary)).toEqual({ 'lib-a': 4, 'lib-b': 0 })
    expect(result.current.favorites).toBe(2)
  })
})
