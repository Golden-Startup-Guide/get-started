import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { buildLocations, isEmptyQuery, matchesQuery, parseSearchQuery } from './search'

const locations = buildLocations(
  [
    { id: 'work', name: 'Work', shelfId: 'general', createdAt: 1, updatedAt: 1 },
    { id: 'health', name: 'Health Handbook', shelfId: 'general', createdAt: 1, updatedAt: 1 },
    { id: 'garden', name: 'Garden', shelfId: 'outdoors', createdAt: 1, updatedAt: 1 },
  ],
  [
    { id: 'general', libraryId: 'personal', name: 'General', createdAt: 1, updatedAt: 1 },
    { id: 'outdoors', libraryId: 'home', name: 'Outdoors', createdAt: 1, updatedAt: 1 },
  ],
  [
    { id: 'personal', name: 'Personal Library', createdAt: 1, updatedAt: 1 },
    { id: 'home', name: 'Home', createdAt: 1, updatedAt: 1 },
  ],
)

let nextUpdate = 1
const note = (id: string, fields: Partial<Note>): Note =>
  ({ id, title: '', content: '', createdAt: 1, updatedAt: nextUpdate++, ...fields })

const notes = [
  note('plan', { title: 'Weekly plan', content: 'Review the seed tray and water', notebookId: 'work', tags: ['Planning'], pinned: true }),
  note('meds', { title: 'Medications', content: 'Ask the doctor about the dose', notebookId: 'health', tags: ['health', 'todo'] }),
  note('beds', { title: 'Raised beds', content: 'Tomato and basil. Seed list at 10:30', notebookId: 'garden', tags: ['todo'], favorite: true }),
]

const search = (raw: string) => notes.filter((item) => matchesQuery(item, parseSearchQuery(raw), locations)).map((item) => item.id)

describe('note search', () => {
  it('needs every word, in any order, ignoring case, across title, text, tags, and location', () => {
    expect(search('SEED')).toEqual(['plan', 'beds'])
    expect(search('water seed')).toEqual(['plan'])
    expect(search('planning')).toEqual(['plan'])
    expect(search('handbook dose')).toEqual(['meds'])
    expect(search('home')).toEqual(['beds'])
    expect(search('seed zebra')).toEqual([])
  })

  it('matches exact phrases and excludes words', () => {
    expect(search('"seed tray"')).toEqual(['plan'])
    expect(search('"tray seed"')).toEqual([])
    expect(search('seed -tomato')).toEqual(['plan'])
    expect(search('-"seed list"')).toEqual(['plan', 'meds'])
  })

  it('filters by tag, with #tag as a shorthand and negation', () => {
    expect(search('tag:todo')).toEqual(['meds', 'beds'])
    expect(search('#TODO -tag:health')).toEqual(['beds'])
    expect(search('tag:to')).toEqual([])
  })

  it('filters by notebook, shelf, and library name prefixes, quoted when they have spaces', () => {
    expect(search('notebook:work')).toEqual(['plan'])
    expect(search('notebook:"health hand"')).toEqual(['meds'])
    expect(search('shelf:general -notebook:health')).toEqual(['plan'])
    expect(search('library:home')).toEqual(['beds'])
    expect(search('library:pers seed')).toEqual(['plan'])
  })

  it('filters by pinned and favorite', () => {
    expect(search('is:pinned')).toEqual(['plan'])
    expect(search('is:fav')).toEqual(['beds'])
    expect(search('is:favourite')).toEqual(['beds'])
    expect(search('-is:pinned -is:favorite')).toEqual(['meds'])
  })

  it('treats unknown operators and times as plain text, and ignores an operator still being typed', () => {
    expect(search('10:30')).toEqual(['beds'])
    expect(parseSearchQuery('http://example.com').include).toEqual(['http://example.com'])
    expect(parseSearchQuery('seed tag:')).toEqual(expect.objectContaining({ include: ['seed'], tags: [] }))
    expect(isEmptyQuery(parseSearchQuery('  tag:  -  '))).toBe(true)
  })

  it('keeps the typed words and phrases for highlighting, but not operators or exclusions', () => {
    expect(parseSearchQuery('Seed "Tray Water" -basil tag:x notebook:w').highlights).toEqual(['Seed', 'Tray Water'])
  })

  it('searches a note again after it is saved', () => {
    const changing = note('x', { title: 'Old title' })
    expect(matchesQuery(changing, parseSearchQuery('new'), locations)).toBe(false)
    const saved = { ...changing, title: 'New title', updatedAt: changing.updatedAt + 1 }
    expect(matchesQuery(saved, parseSearchQuery('new'), locations)).toBe(true)
  })
})
