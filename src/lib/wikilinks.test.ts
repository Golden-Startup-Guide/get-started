import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { buildTitleIndex, deriveWikilinks, findWikilinkTargets, mergeLinks, normalizeTitle, notesLinkingTo, renameWikilinks } from './wikilinks'

const note = (id: string, title: string, content = '', updatedAt = 1): Note => ({ id, title, content, createdAt: 1, updatedAt })

describe('findWikilinkTargets', () => {
  it('finds plain and aliased links, trimmed, once each', () => {
    expect(findWikilinkTargets('See [[Garden plan]] and [[ Seed list | the seeds]]; again [[garden  PLAN]].'))
      .toEqual(['Garden plan', 'Seed list'])
  })

  it('ignores links in fenced code blocks and inline code', () => {
    const markdown = [
      'Real [[One]]',
      '```',
      '[[Not a link]]',
      '```',
      'Inline `[[Also not]]` and ``code with ` and [[Nope]]`` then [[Two]]',
      '~~~md',
      '[[Unclosed fence hides the rest]]',
    ].join('\n')
    expect(findWikilinkTargets(markdown)).toEqual(['One', 'Two'])
  })

  it('rejects empty targets, line breaks, and nested brackets', () => {
    expect(findWikilinkTargets('[[]] [[  ]] [[a\nb]] [[x[y]]]')).toEqual([])
  })
})

describe('deriveWikilinks', () => {
  it('links to the note with that title, ignoring case and spacing, and skips self-links and unknown titles', () => {
    const notes = [
      note('a', 'Garden plan', 'Links to [[seed  list]], [[Garden plan]], and [[Missing]]'),
      note('b', 'Seed list', 'Back to [[Garden Plan|the plan]]'),
    ]
    expect(deriveWikilinks(notes)).toEqual([
      { sourceNoteId: 'a', targetNoteId: 'b' },
      { sourceNoteId: 'b', targetNoteId: 'a' },
    ])
  })

  it('picks the most recently updated note when titles are shared', () => {
    const notes = [note('old', 'Ideas', '', 1), note('new', 'ideas', '', 5), note('src', 'Source', '[[Ideas]]')]
    expect(buildTitleIndex(notes).get(normalizeTitle('IDEAS'))?.id).toBe('new')
    expect(deriveWikilinks(notes)).toEqual([{ sourceNoteId: 'src', targetNoteId: 'new' }])
  })

  it('re-reads a note when it has been saved again', () => {
    const target = note('t', 'Target')
    expect(deriveWikilinks([note('s', 'Source', 'nothing', 1), target])).toEqual([])
    expect(deriveWikilinks([note('s', 'Source', '[[Target]]', 2), target])).toEqual([{ sourceNoteId: 's', targetNoteId: 't' }])
  })
})

describe('mergeLinks', () => {
  it('keeps stored links and adds text links once', () => {
    const stored = [{ sourceNoteId: 'a', targetNoteId: 'b' }]
    expect(mergeLinks(stored, [
      { sourceNoteId: 'a', targetNoteId: 'b' },
      { sourceNoteId: 'b', targetNoteId: 'a' },
      { sourceNoteId: 'b', targetNoteId: 'a' },
    ])).toEqual([
      { sourceNoteId: 'a', targetNoteId: 'b' },
      { sourceNoteId: 'b', targetNoteId: 'a' },
    ])
  })
})

describe('renaming linked notes', () => {
  it('rewrites links to the old title, keeping sections and shown text, and leaves everything else', () => {
    const before = [
      'See [[Garden plan]] and [[ garden  PLAN |the plan]].',
      'Jump to [[Garden plan#Seeds]] or [[Garden planner]].',
      '`[[Garden plan]]` stays as code, and so does:',
      '```',
      '[[Garden plan]]',
      '```',
    ].join('\n')
    expect(renameWikilinks(before, 'Garden plan', 'Spring garden')).toBe([
      'See [[Spring garden]] and [[Spring garden|the plan]].',
      'Jump to [[Spring garden#Seeds]] or [[Garden planner]].',
      '`[[Garden plan]]` stays as code, and so does:',
      '```',
      '[[Garden plan]]',
      '```',
    ].join('\n'))
    expect(renameWikilinks('No links here', 'Garden plan', 'Spring garden')).toBe('No links here')
    expect(renameWikilinks('[[Garden plan]]', 'Garden plan', '  ')).toBe('[[Garden plan]]')
  })

  it('finds the other notes that link to a title, ignoring Trash and the note itself', () => {
    const notes = [
      note('target', 'Garden plan', 'Self link [[Garden plan]]'),
      note('a', 'A', 'See [[garden plan|it]]'),
      note('b', 'B', 'See [[Garden plan#Seeds]]'),
      note('c', 'C', 'Nothing'),
      { ...note('d', 'D', '[[Garden plan]]'), deletedAt: 5 },
      note('e', 'E', '`[[Garden plan]]` in code'),
    ]
    expect(notesLinkingTo(notes, 'Garden Plan', 'target').map((item) => item.id)).toEqual(['a', 'b'])
    expect(notesLinkingTo(notes, '  ')).toEqual([])
  })
})
