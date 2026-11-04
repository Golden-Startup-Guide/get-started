import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { buildLocations, isEmptyQuery, matchesQuery, parseDateValue, parseSearchQuery } from './search'

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

  it('filters by attachments, open tasks, and links to other notes', () => {
    const tasks = note('tasks', { content: 'Shopping\n- [x] eggs\n  - [ ] milk' })
    const done = note('done', { content: '- [x] all done\nNot a task: [ ] here' })
    const numbered = note('numbered', { content: '1. [ ] call the vet' })
    const linked = note('linked', { content: 'See [[Weekly plan]] and ![[Garden]]' })
    const all = [tasks, done, numbered, linked]
    const find = (raw: string, attached = new Set(['done'])) =>
      all.filter((item) => matchesQuery(item, parseSearchQuery(raw), locations, attached)).map((item) => item.id)
    expect(find('has:task')).toEqual(['tasks', 'numbered'])
    expect(find('has:todo -has:link')).toEqual(['tasks', 'numbered'])
    expect(find('has:links')).toEqual(['linked'])
    expect(find('has:attachment')).toEqual(['done'])
    expect(find('has:files', new Set())).toEqual([])
    expect(find('-has:file')).toEqual(['tasks', 'numbered', 'linked'])
    // Without a set of notes with attachments, none has any.
    expect(matchesQuery(done, parseSearchQuery('has:attachment'), locations)).toBe(false)
  })

  it('reads dates as the start of a day, month, or year, in local time', () => {
    const now = new Date(2026, 10, 4, 15, 30)
    expect(parseDateValue('2026-11-04')).toBe(new Date(2026, 10, 4).getTime())
    expect(parseDateValue('2026-3-9')).toBe(new Date(2026, 2, 9).getTime())
    expect(parseDateValue('2026-11')).toBe(new Date(2026, 10, 1).getTime())
    expect(parseDateValue('2026')).toBe(new Date(2026, 0, 1).getTime())
    expect(parseDateValue('Today', now)).toBe(new Date(2026, 10, 4).getTime())
    expect(parseDateValue('yesterday', now)).toBe(new Date(2026, 10, 3).getTime())
    expect(parseDateValue('7d', now)).toBe(new Date(2026, 9, 28).getTime())
    expect(parseDateValue('2w', now)).toBe(new Date(2026, 9, 21).getTime())
    expect(parseDateValue('3m', now)).toBe(new Date(2026, 7, 4).getTime())
    expect(parseDateValue('1y', now)).toBe(new Date(2025, 10, 4).getTime())
    for (const invalid of ['2026-02-30', '2026-13', '26-11-04', 'soon', '7x', '']) expect(parseDateValue(invalid)).toBeUndefined()
  })

  it('filters by when a note was last edited: after is on or after the day, before is earlier', () => {
    const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime()
    const dated = [
      note('oct', { updatedAt: new Date(2026, 9, 31, 23, 59).getTime() }),
      note('nov1', { updatedAt: at(1, 0) }),
      note('nov3', { updatedAt: at(3) }),
      note('nov4', { updatedAt: at(4, 9) }),
    ]
    const now = new Date(2026, 10, 4, 15)
    const find = (raw: string) => dated.filter((item) => matchesQuery(item, parseSearchQuery(raw, now), locations)).map((item) => item.id)
    expect(find('after:2026-11-01')).toEqual(['nov1', 'nov3', 'nov4'])
    expect(find('before:2026-11-01')).toEqual(['oct'])
    expect(find('before:2026-11')).toEqual(['oct'])
    expect(find('after:2026-11-02 before:2026-11-04')).toEqual(['nov3'])
    expect(find('after:today')).toEqual(['nov4'])
    expect(find('after:yesterday')).toEqual(['nov3', 'nov4'])
    expect(find('-after:2026-11-03')).toEqual(['oct', 'nov1'])
    expect(find('-before:2026-11-03')).toEqual(['nov3', 'nov4'])
    expect(find('after:3d')).toEqual(['nov1', 'nov3', 'nov4'])
  })

  it('searches an operator with a value it does not know as plain text, and waits for a value', () => {
    expect(parseSearchQuery('has:pizza').include).toEqual(['has:pizza'])
    expect(parseSearchQuery('before:soon').include).toEqual(['before:soon'])
    expect(isEmptyQuery(parseSearchQuery('has: before: -after:'))).toBe(true)
    expect(isEmptyQuery(parseSearchQuery('after:today'))).toBe(false)
  })
})
