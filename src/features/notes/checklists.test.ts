import { describe, expect, it, vi } from 'vitest'
import { createTaskTextLookup, getChecklistProgress, getChecklistTaskLines, getChecklistTaskText, toggleChecklistItem } from './checklists'

describe('Markdown checklists', () => {
  it('counts completed and incomplete tasks across GFM list markers', () => {
    const markdown = '- [x] Done\n* [ ] Next\n  1. [X] Also done\nOrdinary text'
    expect(getChecklistProgress(markdown)).toEqual({ completed: 2, total: 3 })
    expect(getChecklistTaskLines(markdown)).toEqual([1, 2, 3])
  })

  it('toggles only the requested task line and preserves its formatting', () => {
    const markdown = '## Steps\n  - [ ] First\n  2) [x] Second'
    expect(toggleChecklistItem(markdown, 2)).toBe('## Steps\n  - [x] First\n  2) [x] Second')
    expect(toggleChecklistItem(markdown, 3)).toBe('## Steps\n  - [ ] First\n  2) [ ] Second')
  })

  it('preserves CRLF newlines and leaves non-task lines unchanged', () => {
    const markdown = '- [ ] One\r\nNotes\r\n- [x] Two'
    expect(toggleChecklistItem(markdown, 2)).toBe(markdown)
    expect(toggleChecklistItem(markdown, 3)).toBe('- [ ] One\r\nNotes\r\n- [ ] Two')
    expect(toggleChecklistItem(markdown, 20)).toBe(markdown)
  })

  it('ignores checkbox-like text that is not a Markdown task list item', () => {
    expect(getChecklistProgress('Use [ ] in your explanation\n- not a task')).toEqual({
      completed: 0,
      total: 0,
    })
  })


  it('ignores task syntax inside fenced code blocks', () => {
    const markdown = '```md\n- [x] Example\n```\n~~~\n- [ ] Also literal\n~~~\n- [ ] Real task'
    expect(getChecklistTaskLines(markdown)).toEqual([7])
    expect(getChecklistProgress(markdown)).toEqual({ completed: 0, total: 1 })
  })

  it('counts and toggles tasks inside blockquotes', () => {
    const markdown = '> - [ ] Quoted task\n> > * [x] Nested quote'
    expect(getChecklistProgress(markdown)).toEqual({ completed: 1, total: 2 })
    expect(toggleChecklistItem(markdown, 1)).toBe('> - [x] Quoted task\n> > * [x] Nested quote')
    expect(getChecklistTaskText(markdown, 2)).toBe('Nested quote')
  })

  it('looks up task text by line after splitting the Markdown only once', () => {
    const markdown = new String('- [ ] First\r\nPlain line\n- [x] Second  ') as string
    const split = vi.spyOn(String.prototype, 'split')
    const taskText = createTaskTextLookup(markdown)
    expect(split).not.toHaveBeenCalled()
    expect([1, 2, 3, 4].map(taskText)).toEqual(['First', '', 'Second', ''])
    expect(split).toHaveBeenCalledTimes(1)
    split.mockRestore()
  })
})
