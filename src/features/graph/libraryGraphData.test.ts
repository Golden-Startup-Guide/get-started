import { describe, expect, it } from 'vitest'
import type { Note } from '../../types'
import { buildLibraryGraph, LIBRARY_COLOURS, nodeSize, seedPositions, UNFILED_COLOUR } from './libraryGraphData'

const note = (id: string, notebookId?: string, fields: Partial<Note> = {}): Note =>
  ({ id, title: id.toUpperCase(), content: '', createdAt: 1, updatedAt: 1, notebookId, ...fields })

const notebooks = [
  { id: 'work', name: 'Work', shelfId: 'desk', createdAt: 1, updatedAt: 1 },
  { id: 'garden', name: 'Garden', shelfId: 'shed', createdAt: 1, updatedAt: 1 },
  { id: 'loose', name: 'Loose', createdAt: 1, updatedAt: 1 },
]
const shelves = [
  { id: 'desk', libraryId: 'personal', name: 'Desk', createdAt: 1, updatedAt: 1 },
  { id: 'shed', libraryId: 'home', name: 'Shed', createdAt: 1, updatedAt: 1 },
]
const libraries = [
  { id: 'personal', name: 'Personal', createdAt: 1, updatedAt: 1 },
  { id: 'home', name: 'Home', createdAt: 1, updatedAt: 1 },
  { id: 'empty', name: 'Empty', createdAt: 1, updatedAt: 1 },
]
const label = (item: Note) => item.title

describe('whole-library graph data', () => {
  it('has every note outside Trash, coloured by library, with each linked pair once', () => {
    const notes = [note('a', 'work'), note('b', 'garden'), note('c', 'loose'), note('d'), note('gone', 'work', { deletedAt: 5 })]
    const graph = buildLibraryGraph(notes, [
      { sourceNoteId: 'a', targetNoteId: 'b' },
      { sourceNoteId: 'b', targetNoteId: 'a' },
      { sourceNoteId: 'a', targetNoteId: 'b' },
      { sourceNoteId: 'a', targetNoteId: 'c' },
      { sourceNoteId: 'a', targetNoteId: 'a' },
      { sourceNoteId: 'a', targetNoteId: 'gone' },
      { sourceNoteId: 'a', targetNoteId: 'missing' },
    ], notebooks, shelves, libraries, label)

    expect(graph.nodes.map((node) => [node.id, node.label, node.colour, node.degree])).toEqual([
      ['a', 'A', LIBRARY_COLOURS[0], 2],
      ['b', 'B', LIBRARY_COLOURS[1], 1],
      ['c', 'C', UNFILED_COLOUR, 1],
      ['d', 'D', UNFILED_COLOUR, 0],
    ])
    expect(graph.edges).toEqual([[0, 1], [0, 2]])
    // Only libraries with notes in the graph, and one entry for notes not on a shelf.
    expect(graph.legend).toEqual([
      { name: 'Personal', colour: LIBRARY_COLOURS[0] },
      { name: 'Home', colour: LIBRARY_COLOURS[1] },
      { name: 'Not on a shelf', colour: UNFILED_COLOUR },
    ])
  })

  it('sizes dots by links, with a limit', () => {
    expect(nodeSize(0)).toBe(4)
    expect(nodeSize(4)).toBe(8)
    expect(nodeSize(10_000)).toBe(14)
  })

  it('keeps known positions and starts each notebook’s new notes together', () => {
    const notes = [note('a', 'work'), note('b', 'work'), note('c', 'garden'), note('d', 'work')]
    const { nodes } = buildLibraryGraph(notes, [], notebooks, shelves, libraries, label)
    const positions = seedPositions(nodes, new Map([['b', { x: 500, y: -500 }]]))
    const at = (index: number) => ({ x: positions[index * 2], y: positions[index * 2 + 1] })
    expect(at(1)).toEqual({ x: 500, y: -500 })
    const distance = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)
    // The two new Work notes start nearer each other than either is to the Garden note.
    expect(distance(at(0), at(3))).toBeLessThan(distance(at(0), at(2)))
    expect(distance(at(0), at(3))).toBeLessThan(distance(at(3), at(2)))
    expect([...positions].every(Number.isFinite)).toBe(true)
  })
})
