import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { mentionsOf, relatedNotes } from './related'

const note = (id: string, fields: Partial<Note> = {}): Note => ({ id, title: id, content: '', createdAt: 1, updatedAt: 1, ...fields })

describe('related notes', () => {
  const shelves: Record<string, string> = { a: 'shelf-1', b: 'shelf-1', c: 'shelf-2' }
  const shelfOf = (notebookId: string | undefined) => (notebookId ? shelves[notebookId] : undefined)
  const notes = [
    note('focus', { notebookId: 'a', tags: ['Garden'] }),
    note('linked', { notebookId: 'c' }),
    note('tagged', { notebookId: 'c', tags: ['garden'] }),
    note('neighbour', { notebookId: 'a' }),
    note('shelf-mate', { notebookId: 'b' }),
    note('mentioner', { notebookId: 'a' }),
    note('stranger', { notebookId: 'c' }),
    note('trashed', { notebookId: 'a', deletedAt: 5 }),
  ]
  const links = [
    { sourceNoteId: 'focus', targetNoteId: 'linked' },
    { sourceNoteId: 'mentioner', targetNoteId: 'focus' },
  ]

  it('gives each related note its strongest reason, strongest first', () => {
    expect(relatedNotes({ note: notes[0], notes, links, shelfOf }).map(({ note: related, reason }) => [related.id, reason])).toEqual([
      ['linked', { kind: 'links-to' }],
      ['tagged', { kind: 'shared-tag', tag: 'garden' }],
      ['neighbour', { kind: 'same-notebook' }],
      ['shelf-mate', { kind: 'same-shelf' }],
    ])
  })

  it('leaves out notes that mention it, excluded ones, and notes in Trash', () => {
    const ids = relatedNotes({ note: notes[0], notes, links, shelfOf, exclude: new Set(['neighbour']) }).map(({ note: related }) => related.id)
    expect(ids).not.toContain('mentioner')
    expect(ids).not.toContain('neighbour')
    expect(ids).not.toContain('trashed')
  })

  it('lists the notes that mention it, each once', () => {
    const byId = new Map(notes.map((item) => [item.id, item]))
    expect(mentionsOf('focus', [...links, links[1]], byId).map((item) => item.id)).toEqual(['mentioner'])
  })
})
