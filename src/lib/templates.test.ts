import { describe, expect, it } from 'vitest'
import type { Note, Notebook } from '../types'
import { dailyNoteContent, fillTemplate, findDailyNote, findTemplates, isoDate } from './templates'

const notebook = (id: string, name: string): Notebook => ({ id, name, createdAt: 1, updatedAt: 1 })
const note = (id: string, notebookId: string, title: string, content = '', extra: Partial<Note> = {}): Note =>
  ({ id, title, content, notebookId, createdAt: 1, updatedAt: 1, ...extra })

const date = new Date(2026, 10, 3, 9, 5) // 3 November 2026, 09:05 local time
const notebooks = [notebook('t', 'templates'), notebook('d', 'Daily Notes'), notebook('w', 'Work')]

describe('templates and daily notes', () => {
  it('fills placeholders, ignoring case and spaces, and keeps unknown ones', () => {
    expect(isoDate(date)).toBe('2026-11-03')
    expect(fillTemplate('{{date}} {{ TIME }} {{title}} {{unknown}}', { date, title: 'Plan' })).toBe('2026-11-03 09:05 Plan {{unknown}}')
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    expect(fillTemplate('{{weekday}}', { date })).toBe(weekday)
    expect(fillTemplate('{{longdate}}', { date })).toContain('2026')
  })

  it('finds templates in the Templates notebook (any capitalisation), sorted, without Trash', () => {
    const notes = [
      note('b', 't', 'Meeting'),
      note('a', 't', 'Daily note'),
      note('x', 't', 'Old', '', { deletedAt: 5 }),
      note('w', 'w', 'Not a template'),
    ]
    expect(findTemplates(notes, notebooks).map((item) => item.title)).toEqual(['Daily note', 'Meeting'])
    expect(findTemplates(notes, [notebook('w', 'Work')])).toEqual([])
  })

  it('finds the day’s note by its date title in the Daily notes notebook', () => {
    const notes = [note('1', 'd', '2026-11-02'), note('2', 'd', '2026-11-03'), note('3', 'w', '2026-11-03')]
    expect(findDailyNote(notes, notebooks, date)?.id).toBe('2')
    expect(findDailyNote(notes, notebooks, new Date(2026, 10, 4))).toBeUndefined()
  })

  it('starts a daily note from the "Daily note" template, or a default layout', () => {
    expect(dailyNoteContent([note('t1', 't', 'daily NOTE', 'Log for {{date}} ({{title}})')], notebooks, date)).toBe('Log for 2026-11-03 (2026-11-03)')
    const fallback = dailyNoteContent([], notebooks, date)
    expect(fallback).toMatch(/^# .*2026/)
    expect(fallback).toContain('- [ ] ')
    expect(fallback).not.toContain('{{')
  })
})
