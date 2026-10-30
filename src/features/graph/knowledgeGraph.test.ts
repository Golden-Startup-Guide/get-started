import { describe, expect, it } from 'vitest'
import type { Note, NoteLink } from '../../types'
import { getGraphNeighbors, MAX_VISIBLE_GRAPH_NEIGHBORS } from './graphModel'

function note(id: string, title: string, deletedAt?: number): Note {
  return { id, title, content: '', createdAt: 1, updatedAt: 1, deletedAt }
}

describe('getGraphNeighbors', () => {
  it('combines both directions, sorts by title, and excludes trashed or unrelated notes', () => {
    const notes = [
      note('focus', 'Focus'),
      note('incoming', 'Alpha'),
      note('outgoing', 'Beta'),
      note('both', 'Gamma'),
      note('trash', 'Hidden', 10),
      note('unrelated', 'Unrelated'),
    ]
    const links: NoteLink[] = [
      { sourceNoteId: 'incoming', targetNoteId: 'focus' },
      { sourceNoteId: 'focus', targetNoteId: 'outgoing' },
      { sourceNoteId: 'focus', targetNoteId: 'both' },
      { sourceNoteId: 'both', targetNoteId: 'focus' },
      { sourceNoteId: 'focus', targetNoteId: 'trash' },
      { sourceNoteId: 'focus', targetNoteId: 'missing' },
      { sourceNoteId: 'focus', targetNoteId: 'focus' },
    ]

    expect(getGraphNeighbors('focus', notes, links)).toEqual([
      { note: notes[1], outgoing: false, incoming: true },
      { note: notes[2], outgoing: true, incoming: false },
      { note: notes[3], outgoing: true, incoming: true },
    ])
  })

  it('bounds the number of nodes rendered in the visual graph', () => {
    const notes = Array.from({ length: MAX_VISIBLE_GRAPH_NEIGHBORS + 3 }, (_, index) =>
      note(`note-${index}`, `Note ${index}`),
    )
    const links = notes.slice(1).map((target) => ({
      sourceNoteId: notes[0].id,
      targetNoteId: target.id,
    }))

    expect(getGraphNeighbors(notes[0].id, notes, links)).toHaveLength(MAX_VISIBLE_GRAPH_NEIGHBORS + 2)
    expect(getGraphNeighbors(notes[0].id, notes, links).slice(0, MAX_VISIBLE_GRAPH_NEIGHBORS)).toHaveLength(
      MAX_VISIBLE_GRAPH_NEIGHBORS,
    )
  })
})
